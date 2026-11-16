/** One dispatch table shared by the HTTP route and the agent tool. */

import { parseQuickAdd } from './quickadd.js'
import { TodoError, applyPatch } from './model.js'
import { hostTimeZone, resolveTime, resolveTimeZone, validateIntent } from './automation.js'

const AUTOMATION_UNAVAILABLE = '当前 DSH 不支持自动化任务（缺少 schedule 服务），待办已保存但未同步'

export function createApi(store, resolveGateway = () => null) {
  const gateway = () => {
    const resolved = resolveGateway()
    return resolved && typeof resolved === 'object' ? resolved : null
  }

  /**
   * §五 实现注意（坑）：update 处理器 `input.patch ?? stripKeys(input, [...])` 会把未知键吞进
   * patch、再被 PATCHABLE 静默丢弃——automation 意图必须在此处先显式取出（与 patch 平级，
   * 不进 patch），再构造 patch。test/automation.test.js 有专项用例钉住该行为。
   */
  function automationIntentOf(input) {
    return input && typeof input === 'object' && Object.hasOwn(input, 'automation')
      ? input.automation
      : undefined
  }

  /** §九 create step2 的本地占位记录：待办先落盘，随后这条 error 占位记录落盘，宿主成功后回写。 */
  function pendingRecord(todo, intent) {
    return {
      taskId: null,
      enabled: true,
      time: resolveTime(todo, intent),
      timeZone: resolveTimeZone(todo, intent, hostTimeZone()),
      target: 'new_once', // Q3：固定值仅留档，调用宿主时省略 target（默认即 new_once）
      status: 'error',
      lastSyncedAt: null,
      updatedAt: null,
      lastError: 'pending',
    }
  }

  async function runSync(todo, intent) {
    const out = await gateway().syncOnUpdate(todo, intent)
    const row = out.automation === null
      ? await store.setAutomation(todo.id, null)
      : await store.setAutomation(todo.id, out.automation)
    return out.notice === undefined ? row : { ...row, automationNotice: out.notice }
  }

  return {
    list: (input = {}) => store.list(input),

    async create(input = {}) {
      const intent = automationIntentOf(input)
      if (intent === undefined) return store.create(input)
      const gw = gateway()
      if (!gw) {
        // §六：整体降级——待办本体照常保存（不落 automation 字段），接口返回 400。
        await store.create(input)
        throw new TodoError('automation-unavailable', AUTOMATION_UNAVAILABLE)
      }
      validateIntent(intent, input) // §九 step1：非法 → invalid-input，不落库
      if (intent.enabled === false) return store.create(input) // 开关关闭的新建 = 普通待办
      const created = await store.create(input) // §九 step2：先本地
      await store.setAutomation(created.id, pendingRecord(created, intent)) // step2：占位记录落盘
      const synced = await gw.syncOnCreate(created, intent) // step3：宿主 create
      return store.setAutomation(created.id, synced.automation) // step4：回写后再落盘
    },

    async update(input = {}) {
      const intent = automationIntentOf(input)
      const patch = input.patch ?? stripKeys(input, ['id', 'patch', 'automation'])
      const gw = gateway()
      if (intent === undefined && !gw) return store.update(input.id, patch)
      const current = await store.get(input.id)
      if (current === null) throw new TodoError('not-found', '这条待办已经不在了')
      const prospective = applyPatch(current, patch)
      if (!gw) {
        // §六：带 automation 意图而无宿主 → 待办本体照常保存，接口返回 400。
        await store.update(input.id, patch)
        throw new TodoError('automation-unavailable', AUTOMATION_UNAVAILABLE)
      }
      if (intent === undefined) {
        // §五：无 automation 键 → 待办已有同步记录则照常重同步（标题/时间变化反映到宿主任务）；无记录则不引入。
        const updated = await store.update(input.id, patch)
        return current.automation ? runSync(updated, undefined) : updated
      }
      validateIntent(intent, prospective) // 非法 → invalid-input，不落库
      const updated = await store.update(input.id, patch)
      // §七 关闭开关（enabled=false）与开启同步共用 syncOnUpdate 统一出口：
      // 失败/清理记录的组装只发生在 lib/automation.js（§八），api 层只调用不组装。
      return runSync(updated, intent)
    },

    complete: (input = {}) => store.complete(input.id, input.done !== false, input.by, input.date),
    confirm: (input = {}) => store.confirm(input.id),
    remove: async (input = {}) => {
      const current = await store.get(input.id)
      const removed = await store.remove(input.id) // §九：先落盘删待办
      const gw = gateway()
      if (gw && current?.automation && typeof current.automation.taskId === 'string' && current.automation.taskId !== '') {
        // Q5：宿主删除失败 → 顶层 automationOrphans 留痕，不阻断、不回滚（remove 仍返回成功）。
        const outcome = await gw.syncOnDelete(current)
        if (outcome.orphan) await store.pushAutomationOrphan(outcome.orphan)
      }
      return removed
    },

    categories: () => store.categories(),
    renameCategory: (input = {}) => store.renameCategory(input.from, input.to),
    clearCategory: (input = {}) => store.clearCategory(input.name),
    occurrences: (input = {}) => store.occurrences(input),
    notesList: () => store.notesList(),
    noteAdd: (input = {}) => store.noteAdd(input),
    noteUpdate: (input = {}) => store.noteUpdate(input),
    noteRemove: (input = {}) => store.noteRemove(input),
    retry: () => store.retryPersist(),
    parse: (input = {}) => parseQuickAdd(input.text, input.today ? { today: input.today } : undefined),
  }
}

function stripKeys(input, keys) {
  const out = {}
  for (const [key, value] of Object.entries(input)) {
    if (!keys.includes(key)) out[key] = value
  }
  return out
}
