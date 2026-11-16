/**
 * Repeat → timing 映射与 ctx.schedule 调用编排的唯一实现位置（设计 v4 §四/§七/§八）。
 *
 * 纯映射函数（buildTiming / resolveTime / resolveTimeZone / buildTitle / buildPrompt /
 * validateIntent）无 IO，node --test 直测；createAutomationGateway 是全插件唯一触达
 * 宿主 schedule 服务的模块。HTTP 路径（lib/api.js）与 personal_todo 工具（lib/tool.js）
 * 共用本模块 —— 评审红线：任何第二份映射实现（client/工具内联 cron、截断、prompt 拼接）
 * 一律打回（§八）。
 */

import { TodoError } from './model.js'

const TIME_RE = /^\d{2}:\d{2}$/
const UNMAPPABLE = '无可同步的触发时间（请设置截止时间或循环规则）'
const CLEARED = 'schedule_not_found-cleared'

/** Q2：插件与宿主同进程，取宿主进程 IANA 时区；取不到兜底 'UTC'（宿主拒绝再走 error 路径，不静默造数据）。 */
export function hostTimeZone() {
  try {
    const tz = new Intl.DateTimeFormat().resolvedOptions().timeZone
    return typeof tz === 'string' && tz !== '' ? tz : 'UTC'
  } catch {
    return 'UTC'
  }
}

function isTime(value) {
  return typeof value === 'string' && TIME_RE.test(value)
}

function isTimeZone(value) {
  return typeof value === 'string' && value.trim() !== ''
}

/** §四 time 兜底序（HTTP 与工具两条路径共用，Q4 铁律）：intent.time ?? 既有 automation.time ?? dueTime ?? '09:00'。 */
export function resolveTime(todo, intent) {
  if (isTime(intent?.time)) return intent.time
  if (isTime(todo?.automation?.time)) return todo.automation.time
  if (isTime(todo?.dueTime)) return todo.dueTime
  return '09:00'
}

/** Q2：intent.timeZone ?? 落库 automation.timeZone（防漂移可审计，后续同步沿用） ?? hostTz。 */
export function resolveTimeZone(todo, intent, hostTz) {
  if (isTimeZone(intent?.timeZone)) return intent.timeZone.trim()
  if (isTimeZone(todo?.automation?.timeZone)) return todo.automation.timeZone
  return hostTz
}

function withSeconds(time) {
  return `${time}:00` // §四：宿主输入 HH:mm:ss，发送前补秒
}

/**
 * §四 映射表唯一实现：todo + 意图 → 宿主七种 timing 之一；不可映射返回 null（调用方按 invalid-input 拒绝）。
 * - daily → daily；weekly（weekdays 非空，ISO 周一=1…周日=7，repeat.js 已去重升序）→ weekly 原样透传；
 * - monthly（monthDay 1–31）→ cron 五字段「分 时 日 月 周」，月/周为 *；
 * - 无 repeat 且 dueDate+dueTime 严格在未来 → at。
 */
export function buildTiming(todo, intent, hostTz = hostTimeZone()) {
  const repeat = todo?.repeat ?? null
  const time = withSeconds(resolveTime(todo, intent))
  const timeZone = resolveTimeZone(todo, intent, hostTz)

  if (repeat && repeat.freq === 'daily') {
    return { kind: 'daily', daily: { time, time_zone: timeZone } }
  }
  if (repeat && repeat.freq === 'weekly') {
    if (!Array.isArray(repeat.weekdays) || repeat.weekdays.length === 0) return null
    return { kind: 'weekly', weekly: { time, time_zone: timeZone, weekdays: [...repeat.weekdays] } }
  }
  if (repeat && repeat.freq === 'monthly') {
    if (!Number.isInteger(repeat.monthDay) || repeat.monthDay < 1 || repeat.monthDay > 31) return null
    // 宿主无 monthly 原生类型 → cron。monthDay=29/30/31 在小月/平年 2 月没有可匹配时点，
    // 宿主保持 active、当月静默跳过（Vixie cron 标准语义，不报错不顺延不终止）；
    // 待办侧 isDueOn 用 `date.getDate() === monthDay` 行为一致 —— 忠实映射，不补偿。
    const at = new Date(`2000-01-01T${time.slice(0, 5)}:00`) // time 已补秒，只取 HH:mm 解析
    const hour = Number.isNaN(at.getTime()) ? 0 : at.getHours()
    const minute = Number.isNaN(at.getTime()) ? 0 : at.getMinutes()
    return { kind: 'cron', cron: { expression: `${minute} ${hour} ${repeat.monthDay} * *`, time_zone: timeZone } }
  }
  if (repeat) return null

  // 无 repeat：一次性 at。§四行5：缺 dueTime 或时刻已过 → 不映射；宿主要求目标严格在未来。
  const dueDate = typeof todo?.dueDate === 'string' ? todo.dueDate : null
  if (dueDate === null || !isTime(todo?.dueTime)) return null
  const atTime = resolveTime(todo, intent)
  const when = new Date(`${dueDate}T${atTime}:00`)
  if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) return null
  return { kind: 'at', at: { date: dueDate, time: withSeconds(atTime), time_zone: timeZone } }
}

/** §四 title 截断：宿主标题至多 120 字符（去首尾空白由 model 层负责）；截断后恰 120 字符（含省略号）。 */
export function buildTitle(todo) {
  const title = String(todo?.title ?? '')
  return title.length > 120 ? `${title.slice(0, 119)}…` : title
}

/** §四 prompt 模板：自包含 todoId 供 new_once 目标会话追溯；嵌入截断前原题；不含备注全文（上限 2000 字）。 */
export function buildPrompt(todo) {
  return `提醒：${todo.title}（来自待办插件 dsh-sidebar-todo 同步的自动化任务，todoId=${todo.id}）。\n` +
    '到点提醒用户处理该待办；若用户表示已完成，简单确认即可，无需展开新工作。'
}

/** 意图校验（§五 schema）：enabled 必填布尔；time 'HH:mm'；timeZone 非空字符串；enabled=true 时必须可映射。 */
export function validateIntent(intent, todo) {
  if (intent === null || typeof intent !== 'object' || Array.isArray(intent)) {
    throw new TodoError('invalid-input', 'automation 意图必须是对象')
  }
  if (typeof intent.enabled !== 'boolean') {
    throw new TodoError('invalid-input', 'automation.enabled 必须是布尔值')
  }
  if (intent.time !== undefined && !isTime(intent.time)) {
    throw new TodoError('invalid-input', 'automation.time 格式应为 HH:mm')
  }
  if (intent.timeZone !== undefined && !isTimeZone(intent.timeZone)) {
    throw new TodoError('invalid-input', 'automation.timeZone 必须是 IANA 时区名')
  }
  if (intent.enabled === true && buildTiming(todo, intent) === null) {
    throw new TodoError('invalid-input', UNMAPPABLE)
  }
}

// ---------------------------------------------------------------- 宿主编排

function isTask(result) {
  return Boolean(result) && typeof result === 'object' && typeof result.kind === 'string'
}

function isCode(result, code) {
  return Boolean(result) && typeof result === 'object' && typeof result.code === 'string' &&
    (code === undefined || result.code === code)
}

function describeHostError(err) {
  const code = err && typeof err.code === 'string' && err.code !== '' ? err.code : 'internal_error'
  const message = err && typeof err.message === 'string' && err.message !== '' ? err.message : 'schedule 操作失败'
  return `${code}: ${message}`
}

function describeResultError(result) {
  const message = typeof result?.message === 'string' && result.message !== '' ? result.message : 'schedule 操作失败'
  return `${result.code}: ${message}`
}

/** §九 step2 的占位记录：先本地落盘，宿主成功后由 successRecord 回写。 */
function initialRecord(todo, intent, hostTz) {
  return {
    taskId: null,
    enabled: true,
    time: resolveTime(todo, intent),
    timeZone: resolveTimeZone(todo, intent, hostTz),
    target: 'new_once', // Q3：固定值仅留档；调用宿主时省略 target（宿主默认即 new_once）
    status: 'error',
    lastSyncedAt: null,
    updatedAt: null,
    lastError: 'pending',
  }
}

function successRecord(record, todo, task) {
  return {
    ...record,
    taskId: typeof task?.id === 'string' && task.id !== '' ? task.id : record.taskId,
    updatedAt: typeof task?.updatedAt === 'string' ? task.updatedAt : record.updatedAt,
    // Q1：repeat.until 被忽略、不映射为 rrule 终止，宿主任务不会到点自动停止 → partial 标注。
    status: todo?.repeat?.until ? 'partial' : 'ok',
    lastSyncedAt: new Date().toISOString(),
    lastError: null,
  }
}

/** 宿主时间落库规范化为 HH:mm:ss(.SSS)；等价比较只看 HH:mm 前缀。 */
function sameClock(stored, wanted) {
  return typeof stored === 'string' && stored.slice(0, 5) === wanted.slice(0, 5)
}

/** 重建的 timing 与宿主现存任务是否等价（§七 等价编辑跳过；字段缺失视为不等，宁多打一次 edit）。 */
function timingMatches(task, timing) {
  if (!task || task.kind !== timing.kind) return false
  if (timing.kind === 'daily') {
    return sameClock(task.time, timing.daily.time) &&
      (task.timeZone ?? task.time_zone) === timing.daily.time_zone
  }
  if (timing.kind === 'weekly') {
    return sameClock(task.time, timing.weekly.time) &&
      (task.timeZone ?? task.time_zone) === timing.weekly.time_zone &&
      Array.isArray(task.weekdays) && task.weekdays.length === timing.weekly.weekdays.length &&
      timing.weekly.weekdays.every((day, index) => task.weekdays[index] === day)
  }
  if (timing.kind === 'cron') {
    return task.expression === timing.cron.expression &&
      (task.timeZone ?? task.time_zone) === timing.cron.time_zone
  }
  if (timing.kind === 'at') {
    const at = task.at
    return Boolean(at) && at.date === timing.at.date && sameClock(at.time, timing.at.time) &&
      (at.time_zone ?? at.timeZone) === timing.at.time_zone
  }
  return false
}

/**
 * 把宿主 schedule 服务封装成待办侧网关（§八）。宿主约定（对照 dsh-tool-schedule）：
 * - view/edit 对 schedule_not_found / schedule_conflict 以 `{ code }` 对象 resolve，其余错误 throw；
 * - edit delete 成功 resolve `{ deleted: true }`，update 成功 resolve 任务记录（含 updatedAt）。
 */
export function createAutomationGateway(schedule, hostTz = hostTimeZone()) {
  async function viewOnce(id) {
    try {
      const result = await schedule.view({ id })
      if (isCode(result, 'schedule_not_found')) return { kind: 'notfound' }
      if (isTask(result)) return { kind: 'task', task: result }
      if (isCode(result)) return { kind: 'error', reason: describeResultError(result) }
      return { kind: 'error', reason: 'internal_error: schedule view 返回异常' }
    } catch (err) {
      return { kind: 'error', reason: describeHostError(err) }
    }
  }

  async function editOnce(id, request) {
    try {
      const result = await schedule.edit({ id, ...request })
      if (isCode(result, 'schedule_not_found')) return { kind: 'notfound' }
      if (isCode(result, 'schedule_conflict')) return { kind: 'conflict' }
      if (result && typeof result === 'object' && (result.deleted === true || isTask(result))) {
        return { kind: 'task', task: result }
      }
      if (isCode(result)) return { kind: 'error', reason: describeResultError(result) }
      return { kind: 'error', reason: 'internal_error: schedule edit 返回异常' }
    } catch (err) {
      return { kind: 'error', reason: describeHostError(err) }
    }
  }

  async function createOnHost(todo, intent) {
    const timing = buildTiming(todo, intent, hostTz)
    if (timing === null) throw new TodoError('invalid-input', UNMAPPABLE)
    try {
      // §九：不传 actorSessionId（插件无会话身份）、省略 target（默认 new_once）。
      const task = await schedule.create({ title: buildTitle(todo), prompt: buildPrompt(todo), timing })
      if (isTask(task)) return { kind: 'task', task }
      return { kind: 'error', reason: isCode(task) ? describeResultError(task) : 'internal_error: schedule create 返回异常' }
    } catch (err) {
      return { kind: 'error', reason: describeHostError(err) }
    }
  }

  /** §七 删除编排（关闭开关 / 删除待办共用）：conflict → 重读重试 1 次；not_found 视为已删除。 */
  async function deleteHostTask(existing) {
    const id = existing.taskId
    const requestOf = (updatedAt) => ({
      action: 'delete',
      ...(typeof updatedAt === 'string' && updatedAt !== '' ? { expectedUpdatedAt: updatedAt } : {}),
    })
    let outcome = await editOnce(id, requestOf(existing.updatedAt))
    if (outcome.kind === 'conflict') {
      const review = await viewOnce(id)
      if (review.kind === 'task') outcome = await editOnce(id, requestOf(review.task.updatedAt))
      else if (review.kind === 'notfound') return { deleted: true }
      else outcome = { kind: 'error', reason: `schedule_conflict 后重读失败：${review.reason}` }
    }
    if (outcome.kind === 'notfound' || outcome.kind === 'task') return { deleted: true }
    const reason = outcome.kind === 'conflict'
      ? 'schedule_conflict: 删除持续冲突（已重试 1 次）'
      : outcome.reason
    return { failed: reason }
  }

  return {
    hostTimeZone: hostTz,

    /** §九 create step3/4：宿主失败不抛（映射非法除外），返回 status:'error' 记录交 api 落盘，接口仍 ok:true。 */
    async syncOnCreate(todo, intent) {
      const record = initialRecord(todo, intent, hostTz)
      const outcome = await createOnHost(todo, intent ?? { enabled: true })
      if (outcome.kind === 'task') return { automation: successRecord(record, todo, outcome.task) }
      return { automation: { ...record, lastError: outcome.reason } }
    },

    /** §七 同步编排：view → edit(expectedUpdatedAt) → conflict 重读重试 1 次 → error/orphan 语义全部收敛在这里。 */
    async syncOnUpdate(todo, intent) {
      const existing = todo?.automation && typeof todo.automation === 'object' ? todo.automation : null
      const hasTask = Boolean(existing && typeof existing.taskId === 'string' && existing.taskId !== '')

      // enabled=false：关闭开关走删除编排，成功/已不存在 → 清除记录；失败 → 记录还在，下次保存重试。
      if (intent && intent.enabled === false) {
        if (!hasTask) return { automation: null }
        const outcome = await deleteHostTask(existing)
        if (outcome.deleted) return { automation: null }
        return { automation: { ...existing, enabled: true, status: 'error', lastError: outcome.failed } }
      }

      // §五：无 automation 键且本地无记录 → 不引入。
      if (!existing && !(intent && intent.enabled === true)) return { automation: null }

      if (!hasTask) {
        // 记录存在但 taskId 为空（上次 create 失败）或本次显式开启建立：重建走宿主 create。
        const record = initialRecord(todo, intent, hostTz)
        const outcome = await createOnHost(todo, intent ?? { enabled: true })
        if (outcome.kind === 'task') return { automation: successRecord(record, todo, outcome.task) }
        return { automation: { ...record, lastError: outcome.reason } }
      }

      const timing = buildTiming(todo, intent, hostTz)
      if (timing === null) throw new TodoError('invalid-input', UNMAPPABLE)
      const patch = { title: buildTitle(todo), prompt: buildPrompt(todo), timing }
      const errorRecord = (reason) => ({
        ...initialRecord(todo, intent, hostTz),
        taskId: existing.taskId,
        updatedAt: typeof existing.updatedAt === 'string' ? existing.updatedAt : null,
        lastSyncedAt: typeof existing.lastSyncedAt === 'string' ? existing.lastSyncedAt : null,
        status: 'error',
        lastError: reason,
      })

      let view = await viewOnce(existing.taskId)
      if (view.kind === 'error' && typeof existing.updatedAt === 'string' && existing.updatedAt !== '') {
        // §七 兜底：view 不可用而本地存有 updatedAt 时，用落库值做一次乐观 edit（不替代 view）。
        const optimistic = await editOnce(existing.taskId, { action: 'update', patch, expectedUpdatedAt: existing.updatedAt })
        if (optimistic.kind === 'task') return { automation: successRecord(initialRecord(todo, intent, hostTz), todo, optimistic.task) }
        if (optimistic.kind === 'notfound') return { automation: null, notice: CLEARED }
        if (optimistic.kind === 'conflict') {
          return { automation: errorRecord('schedule_conflict: 宿主任务乐观编辑冲突（view 不可用，落库 updatedAt 已过期），下次编辑保存将自动重试') }
        }
        return { automation: errorRecord(`view 失败（${view.reason}）；乐观编辑失败（${optimistic.reason}）`) }
      }
      if (view.kind === 'error') return { automation: errorRecord(view.reason) }
      if (view.kind === 'notfound') return { automation: null, notice: CLEARED }

      // 等价编辑跳过（§七推荐优化）：重建结果与宿主现状一致时跳过 edit（仍刷新留痕），避免每次保存打宿主 FIFO。
      if (view.task.title === patch.title && view.task.prompt === patch.prompt && timingMatches(view.task, timing)) {
        return { automation: successRecord(initialRecord(todo, intent, hostTz), todo, view.task) }
      }

      let outcome = await editOnce(existing.taskId, { action: 'update', patch, expectedUpdatedAt: view.task.updatedAt })
      if (outcome.kind === 'conflict') {
        // §七：重读后重试 1 次；仍冲突 → 以待办为准（不采纳宿主版本），status='error'，下次保存自动重试。
        const review = await viewOnce(existing.taskId)
        if (review.kind === 'task') {
          outcome = await editOnce(existing.taskId, { action: 'update', patch, expectedUpdatedAt: review.task.updatedAt })
        } else if (review.kind === 'notfound') {
          return { automation: null, notice: CLEARED }
        } else {
          outcome = { kind: 'error', reason: `schedule_conflict 后重读失败：${review.reason}` }
        }
      }
      if (outcome.kind === 'notfound') return { automation: null, notice: CLEARED }
      if (outcome.kind === 'task') return { automation: successRecord(initialRecord(todo, intent, hostTz), todo, outcome.task) }
      if (outcome.kind === 'conflict') {
        return { automation: errorRecord('schedule_conflict: 宿主任务持续冲突（已重试 1 次），下次编辑保存将自动重试') }
      }
      return { automation: errorRecord(outcome.reason) }
    },

    /** Q5：删除失败返回 orphan 记录供 store 落盘；成功 / 宿主已不存在返回 { deleted: true }。 */
    async syncOnDelete(todo) {
      const existing = todo?.automation && typeof todo.automation === 'object' ? todo.automation : null
      if (!existing || typeof existing.taskId !== 'string' || existing.taskId === '') return { deleted: true }
      const outcome = await deleteHostTask(existing)
      if (outcome.deleted) return { deleted: true }
      return {
        orphan: {
          todoId: todo.id,
          taskId: existing.taskId,
          status: 'orphan',
          reason: outcome.failed,
          at: new Date().toISOString(),
        },
      }
    },
  }
}
