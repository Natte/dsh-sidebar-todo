// dsh-sidebar-todo v0.4.0 T3：宿主侧「待办↔自动化任务同步」测试（设计 §四/§五/§六/§七/§九）。
// gateway 一律 fake 注入，不触真实宿主（参照 store/api 测试的临时文件手法）。

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStore } from '../lib/store.js'
import { createApi } from '../lib/api.js'
import { createTool } from '../lib/tool.js'
import { dateKey, shiftKey } from '../lib/bucket.js'
import { TodoError } from '../lib/model.js'
import { apply } from '../index.js'
import {
  buildTiming, resolveTime, resolveTimeZone, buildTitle, buildPrompt, validateIntent,
  createAutomationGateway, hostTimeZone,
} from '../lib/automation.js'

async function tempStore(t) {
  const dir = await mkdtemp(join(tmpdir(), 'todo-auto-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const file = join(dir, 'todos.json')
  const store = createStore({ file })
  await store.load()
  return { store, file }
}

/** 宿主 schedule 服务内存 fake：记录调用、按脚本回放 create/view/edit 结果。 */
function fakeSchedule(options = {}) {
  const calls = []
  const state = {
    deleted: false,
    task: {
      id: 'sch_seed', title: 'seed', prompt: 'seed', kind: 'daily',
      time: '09:00:00.000', timeZone: 'UTC', updatedAt: '2026-11-16T00:00:00.000Z',
      ...(options.task ?? {}),
    },
  }
  const createResults = options.createResults ?? [] // 'ok' 或宿主错误码字符串（throw）
  const viewResults = options.viewResults ?? []    // 'ok' | 'notfound'
  const editResults = options.editResults ?? []    // 'ok' | 'conflict' | 'notfound' | 'error'
  const next = (queue, fallback) => (queue.length > 0 ? queue.shift() : fallback)

  function flatten(timing) {
    if (timing.kind === 'daily') return { kind: 'daily', time: timing.daily.time, timeZone: timing.daily.time_zone }
    if (timing.kind === 'weekly') return { kind: 'weekly', time: timing.weekly.time, timeZone: timing.weekly.time_zone, weekdays: timing.weekly.weekdays }
    if (timing.kind === 'cron') return { kind: 'cron', expression: timing.cron.expression, timeZone: timing.cron.time_zone }
    return { kind: 'at', at: timing.at }
  }

  return {
    calls,
    state,
    async create(input) {
      calls.push(['create', input])
      const scripted = next(createResults, 'ok')
      if (scripted !== 'ok') throw Object.assign(new Error('host rejected'), { code: scripted })
      const n = calls.filter(([m]) => m === 'create').length
      state.task = { ...state.task, id: `sch_${n}`, ...flatten(input.timing), title: input.title, prompt: input.prompt, updatedAt: new Date().toISOString() }
      return state.task
    },
    async view({ id }) {
      calls.push(['view', id])
      if (state.deleted || next(viewResults, 'ok') === 'notfound') return { id, code: 'schedule_not_found' }
      return state.task
    },
    async edit(req) {
      calls.push(['edit', req])
      const scripted = next(editResults, 'ok')
      if (scripted === 'conflict') return { id: req.id, code: 'schedule_conflict' }
      if (scripted === 'notfound') return { id: req.id, code: 'schedule_not_found' }
      if (scripted === 'error') throw Object.assign(new Error('boom'), { code: 'internal_error' })
      if (req.action === 'delete') { state.deleted = true; return { id: req.id, deleted: true } }
      state.task = { ...state.task, ...flatten(req.patch.timing), title: req.patch.title, prompt: req.patch.prompt, updatedAt: new Date().toISOString() }
      return state.task
    },
  }
}

// ---------------------------------------------------------------- §四 纯映射

test('buildTiming：daily/weekly/monthly/at 四形态、补秒与时区透传', () => {
  const tz = hostTimeZone()
  assert.deepEqual(
    buildTiming({ repeat: { freq: 'daily' }, dueTime: '08:30' }, { enabled: true }),
    { kind: 'daily', daily: { time: '08:30:00', time_zone: tz } },
  )
  assert.deepEqual(
    buildTiming({ repeat: { freq: 'weekly', weekdays: [1, 3, 5] }, dueTime: '17:30' }, { enabled: true }),
    { kind: 'weekly', weekly: { time: '17:30:00', time_zone: tz, weekdays: [1, 3, 5] } },
  )
  assert.deepEqual(
    buildTiming({ repeat: { freq: 'monthly', monthDay: 25 } }, { enabled: true, time: '09:05' }),
    { kind: 'cron', cron: { expression: '5 9 25 * *', time_zone: tz } },
  )
})

test('buildTiming：monthDay=29/30/31 边界（cron 日字段原样；小月由宿主/待办两侧一致静默跳过）', () => {
  for (const day of [29, 30, 31]) {
    const timing = buildTiming({ repeat: { freq: 'monthly', monthDay: day } }, { enabled: true, time: '07:00' })
    assert.equal(timing.kind, 'cron')
    assert.equal(timing.cron.expression, `0 7 ${day} * *`)
    assert.equal(timing.cron.time_zone, hostTimeZone())
  }
})

test('buildTiming：at 只在未来成立；缺 dueTime 或时刻已过 → null（§四行5）', () => {
  const tomorrow = shiftKey(dateKey(new Date()), 1)
  const intent = { enabled: true }
  const ok = buildTiming({ dueDate: tomorrow, dueTime: '23:59' }, intent)
  assert.equal(ok.kind, 'at')
  assert.equal(ok.at.date, tomorrow)
  assert.equal(ok.at.time, '23:59:00')

  assert.equal(buildTiming({ dueDate: shiftKey(dateKey(new Date()), -1), dueTime: '08:00' }, intent), null)
  assert.equal(buildTiming({ dueDate: tomorrow }, intent), null)
})

test('resolveTime/resolveTimeZone：intent.time ?? automation.time ?? dueTime ?? 09:00（Q4 共用兜底序）', () => {
  assert.equal(resolveTime({ dueTime: '08:00' }, undefined), '08:00')
  assert.equal(resolveTime({ dueTime: '08:00' }, { enabled: true, time: '12:34' }), '12:34')
  assert.equal(resolveTime({ dueTime: '08:00', automation: { time: '10:00' } }, undefined), '10:00')
  assert.equal(resolveTime({ automation: { time: '10:00' } }, undefined), '10:00')
  assert.equal(resolveTime({}, undefined), '09:00')
  assert.equal(resolveTimeZone({ automation: { timeZone: 'Asia/Shanghai' } }, undefined, 'UTC'), 'Asia/Shanghai')
  assert.equal(resolveTimeZone({}, { enabled: true, timeZone: 'Asia/Tokyo' }, 'UTC'), 'Asia/Tokyo')
  assert.equal(resolveTimeZone({}, undefined, 'UTC'), 'UTC')
})

test('buildTitle：121 字截为 120（含省略号）；buildPrompt 自包含 todoId', () => {
  const title = buildTitle({ title: '甲'.repeat(121) })
  assert.equal(title.length, 120)
  assert.ok(title.endsWith('…'))
  assert.ok(title.startsWith('甲'.repeat(119)))
  assert.equal(buildTitle({ title: '甲'.repeat(120) }), '甲'.repeat(120))

  const prompt = buildPrompt({ id: 't_abc', title: '提交每周工时' })
  assert.ok(prompt.includes('todoId=t_abc'))
  assert.ok(prompt.includes('提交每周工时'))
})

test('validateIntent：enabled 必填布尔、time/timeZone 形状、无可同步触发时间 → invalid-input', () => {
  const todo = { title: 'x', repeat: { freq: 'daily' } }
  assert.throws(() => validateIntent({}, todo), (e) => e.code === 'invalid-input')
  assert.throws(() => validateIntent({ enabled: 'yes' }, todo), (e) => e.code === 'invalid-input')
  assert.throws(() => validateIntent({ enabled: true, time: '9:00' }, todo), (e) => e.code === 'invalid-input')
  assert.throws(() => validateIntent({ enabled: true, timeZone: '' }, todo), (e) => e.code === 'invalid-input')
  assert.throws(
    () => validateIntent({ enabled: true }, { title: 'x' }),
    (e) => e.code === 'invalid-input' && /无可同步的触发时间/.test(e.message),
  )
  assert.doesNotThrow(() => validateIntent({ enabled: true, time: '08:00' }, todo))
})

// ---------------------------------------------------------------- 网关单测（Q1/Q3/§九）

test('syncOnCreate：成功回写 taskId/status/lastSyncedAt；until 忽略但标 partial（Q1）', async () => {
  const fake = fakeSchedule()
  const gw = createAutomationGateway(fake, 'UTC')
  const plain = await gw.syncOnCreate(
    { id: 't1', title: '交周报', repeat: { freq: 'weekly', weekdays: [5] } },
    { enabled: true, time: '17:30' },
  )
  assert.equal(plain.automation.status, 'ok')
  assert.equal(plain.automation.taskId, 'sch_1')
  assert.equal(plain.automation.time, '17:30')
  assert.equal(plain.automation.timeZone, 'UTC')
  assert.equal(plain.automation.target, 'new_once') // Q3 仅留档
  assert.ok(plain.automation.lastSyncedAt)
  assert.equal(fake.calls[0][0], 'create')
  assert.deepEqual(fake.calls[0][1].timing.weekly.weekdays, [5])
  assert.equal(fake.calls[0][1].target, undefined, '调用宿主时省略 target（默认 new_once）')
  assert.ok(fake.calls[0][1].prompt.includes('todoId=t1'))

  const until = await gw.syncOnCreate(
    { id: 't2', title: 'x', repeat: { freq: 'weekly', weekdays: [5], until: '2027-01-01' } },
    { enabled: true },
  )
  assert.equal(until.automation.status, 'partial', 'Q1：until 不映射，宿主不会自动停止 → partial')
})

test('syncOnCreate：宿主拒绝（not_future）→ status error + lastError，不抛', async () => {
  const fake = fakeSchedule({ createResults: ['not_future'] })
  const gw = createAutomationGateway(fake, 'UTC')
  const out = await gw.syncOnCreate(
    { id: 't1', title: 'x', dueDate: '2030-01-01', dueTime: '09:00' },
    { enabled: true },
  )
  assert.equal(out.automation.status, 'error')
  assert.equal(out.automation.taskId, null)
  assert.match(out.automation.lastError, /not_future/)
})

// ---------------------------------------------------------------- §五/§九 api 层

test('stripKeys 陷阱：平级 automation 意图必须到达同步层；patch 直写伪造关联必须无效（§三）', async (t) => {
  const fake = fakeSchedule()
  const { store } = await tempStore(t)
  const api = createApi(store, () => createAutomationGateway(fake, 'UTC'))
  const todo = await api.create({ title: '工时', repeat: { freq: 'daily' } })

  // 平级意图：若无显式取出，automation 会被 stripKeys 吞进 patch 后被 PATCHABLE 静默丢弃。
  const updated = await api.update({ id: todo.id, title: '提交每周工时', automation: { enabled: true, time: '17:30' } })
  assert.equal(updated.automation.taskId, 'sch_1', 'automation 意图显式取出后必须生效')
  assert.ok(fake.calls.some(([m]) => m === 'create'), '宿主 create 被调用')

  // 对照组：patch 直写伪造关联无效（automation 不进 PATCHABLE）。
  const forged = await api.update({ id: todo.id, patch: { automation: { taskId: 'sch_fake', status: 'ok' } } })
  assert.notEqual(forged.automation.taskId, 'sch_fake')
  assert.equal(forged.automation.taskId, 'sch_1')
})

test('api.create 带 intent：先本地占位再宿主 create，成功回写并落盘（§九写入顺序）', async (t) => {
  const fake = fakeSchedule()
  const { store, file } = await tempStore(t)
  const api = createApi(store, () => createAutomationGateway(fake, 'Asia/Shanghai'))
  const created = await api.create({
    title: '提交每周工时',
    repeat: { freq: 'weekly', weekdays: [5] },
    automation: { enabled: true, time: '17:30' },
  })
  assert.equal(created.automation.status, 'ok')
  assert.equal(created.automation.timeZone, 'Asia/Shanghai', 'Q2：显式覆盖落库')

  const raw = JSON.parse(await readFile(file, 'utf8'))
  const row = raw.todos.find((x) => x.title === '提交每周工时')
  assert.equal(row.automation.taskId, 'sch_1')
  assert.equal(row.automation.status, 'ok')
  assert.equal(row.automation.lastError, null)

  const [, payload] = fake.calls.find(([m]) => m === 'create')
  assert.equal(payload.title, '提交每周工时')
  assert.match(payload.prompt, /todoId=/)
  assert.deepEqual(payload.timing.weekly.weekdays, [5])
  assert.equal(payload.target, undefined, 'Q3：省略 target')
})

test('api.create：宿主失败 → 待办照常保存返回（ok:true），automation.status=error 落盘（§九 step4）', async (t) => {
  const fake = fakeSchedule({ createResults: ['not_future'] })
  const { store } = await tempStore(t)
  const api = createApi(store, () => createAutomationGateway(fake, 'UTC'))
  const created = await api.create({ title: 'x', dueDate: '2030-01-01', dueTime: '09:00', automation: { enabled: true } })
  assert.equal(created.automation.status, 'error')
  assert.match(created.automation.lastError, /not_future/)
  assert.equal((await store.list()).items.length, 1)
})

test('意图非法：无 repeat 且无未来时刻 → invalid-input 不落库（§四行5）', async (t) => {
  const fake = fakeSchedule()
  const { store } = await tempStore(t)
  const api = createApi(store, () => createAutomationGateway(fake, 'UTC'))
  await assert.rejects(
    () => api.create({ title: 'x', automation: { enabled: true } }),
    (err) => err instanceof TodoError && err.code === 'invalid-input',
  )
  assert.equal((await store.list()).items.length, 0, '不落库')
  assert.deepEqual(fake.calls, [])
})

test('create enabled=false：开关关闭的新建 = 普通待办，无宿主调用', async (t) => {
  const fake = fakeSchedule()
  const { store } = await tempStore(t)
  const api = createApi(store, () => createAutomationGateway(fake, 'UTC'))
  const todo = await api.create({ title: 'x', repeat: { freq: 'daily' }, automation: { enabled: false } })
  assert.equal(todo.automation, undefined)
  assert.deepEqual(fake.calls, [])
})

// ---------------------------------------------------------------- §六 降级

test('降级：无 gateway → automation-unavailable 且待办本体照常保存（无 automation 字段）', async (t) => {
  const { store } = await tempStore(t)
  const api = createApi(store, () => null)
  await assert.rejects(
    () => api.create({ title: '每周工时', repeat: { freq: 'weekly', weekdays: [5] }, automation: { enabled: true, time: '17:30' } }),
    (err) => err instanceof TodoError && err.code === 'automation-unavailable',
  )
  const { items } = await store.list()
  assert.equal(items.length, 1, '待办已保存')
  assert.equal(items[0].automation, undefined, '不落 automation 字段')

  const created = await api.create({ title: '旧名' })
  await assert.rejects(
    () => api.update({ id: created.id, title: '新名', automation: { enabled: true } }),
    (err) => err.code === 'automation-unavailable',
  )
  const after = (await store.list()).items.find((x) => x.id === created.id)
  assert.equal(after.title, '新名', 'patch 照常生效')
  assert.equal(after.automation, undefined)
})

// ---------------------------------------------------------------- §七 冲突与删除编排

test('§七冲突编排：conflict→view→重试成功；连续 conflict→error 以待办为准', async (t) => {
  {
    const fake = fakeSchedule({ editResults: ['conflict', 'ok'] })
    const { store } = await tempStore(t)
    const api = createApi(store, () => createAutomationGateway(fake, 'UTC'))
    const todo = await api.create({ title: 'x', repeat: { freq: 'daily' }, automation: { enabled: true, time: '09:00' } })
    const marker = fake.calls.length
    const updated = await api.update({ id: todo.id, title: 'y', automation: { enabled: true, time: '09:00' } })
    assert.equal(updated.automation.status, 'ok')
    assert.deepEqual(
      fake.calls.slice(marker).map(([m]) => m),
      ['view', 'edit', 'view', 'edit'],
      'view→edit→重读→重试各一次',
    )
  }
  {
    const fake = fakeSchedule({ editResults: ['conflict', 'conflict'] })
    const { store } = await tempStore(t)
    const api = createApi(store, () => createAutomationGateway(fake, 'UTC'))
    const todo = await api.create({ title: 'x', repeat: { freq: 'daily' }, automation: { enabled: true, time: '09:00' } })
    const updated = await api.update({ id: todo.id, title: 'y', automation: { enabled: true } })
    assert.equal(updated.automation.status, 'error')
    assert.match(updated.automation.lastError, /schedule_conflict/)
    assert.equal(updated.automation.taskId, 'sch_1', '不采纳宿主版本，taskId 保留')
    assert.match(JSON.stringify(fake.calls.at(-1)), /"y"/, '重试确实发出过，重试 1 次后停止')
  }
})

test('§七：view not_found → 清除本地关联并回传 automationNotice', async (t) => {
  const fake = fakeSchedule({ viewResults: ['notfound'] })
  const { store } = await tempStore(t)
  const api = createApi(store, () => createAutomationGateway(fake, 'UTC'))
  const todo = await api.create({ title: 'x', repeat: { freq: 'daily' }, automation: { enabled: true, time: '09:00' } })
  assert.ok(todo.automation.taskId)
  const updated = await api.update({ id: todo.id, title: 'y' }) // 无 intent，走重同步
  assert.equal(updated.automation, undefined, '本地关联已清除')
  assert.equal(updated.automationNotice, 'schedule_not_found-cleared')
})

test('§七等价编辑跳过：重建结果与宿主一致时不打 edit，仅刷新留痕', async (t) => {
  const fake = fakeSchedule()
  const { store } = await tempStore(t)
  const api = createApi(store, () => createAutomationGateway(fake, 'UTC'))
  const todo = await api.create({ title: 'x', repeat: { freq: 'daily' }, automation: { enabled: true, time: '09:00' } })
  const before = fake.calls.length
  const again = await api.update({ id: todo.id, repeat: { freq: 'daily' } }) // 无 intent，内容等价
  assert.equal(again.automation.status, 'ok')
  assert.ok(again.automation.lastSyncedAt >= todo.automation.lastSyncedAt)
  assert.equal(fake.calls.slice(before).filter(([m]) => m === 'edit').length, 0, '等价保存跳过宿主 edit')
  assert.ok(fake.calls.slice(before).some(([m]) => m === 'view'), '仍需 view 判等')
})

test('update enabled=false：成功删除宿主任务并清除本地记录；失败则保留记录待重试', async (t) => {
  {
    const fake = fakeSchedule()
    const { store } = await tempStore(t)
    const api = createApi(store, () => createAutomationGateway(fake, 'UTC'))
    const todo = await api.create({ title: 'x', repeat: { freq: 'daily' }, automation: { enabled: true, time: '09:00' } })
    const off = await api.update({ id: todo.id, automation: { enabled: false } })
    assert.equal(off.automation, undefined, '成功后清除本地记录')
    assert.deepEqual(fake.calls.filter(([m]) => m === 'edit').map(([, req]) => req.action), ['delete'])
  }
  {
    const fake = fakeSchedule({ editResults: ['error'] })
    const { store } = await tempStore(t)
    const api = createApi(store, () => createAutomationGateway(fake, 'UTC'))
    const todo = await api.create({ title: 'x', repeat: { freq: 'daily' }, automation: { enabled: true, time: '09:00' } })
    const off = await api.update({ id: todo.id, automation: { enabled: false } })
    assert.equal(off.automation.status, 'error', '失败：记录还在，下次保存重试')
    assert.ok(off.automation.taskId)
  }
})

// 关闭分支的唯一组装点在 lib/automation.js syncOnUpdate（§八）：api 层只透传 intent，
// 网关级行为在此钉死——conflict 重读重试 1 次、not_found 视为已删除、失败重建 error 记录。
test('syncOnUpdate 关闭分支：conflict 重试仍败→重建 error 记录保留 taskId；not_found→清除记录', async () => {
  const existing = {
    taskId: 'sch_1', enabled: true, time: '09:00', timeZone: 'UTC', target: 'new_once',
    status: 'ok', lastSyncedAt: '2026-11-16T08:00:00.000Z', updatedAt: '2026-11-16T08:00:00.000Z', lastError: null,
  }
  {
    const fake = fakeSchedule({ editResults: ['conflict', 'conflict'] })
    const gw = createAutomationGateway(fake, 'UTC')
    const out = await gw.syncOnUpdate(
      { id: 't1', title: 'x', repeat: { freq: 'daily' }, automation: existing },
      { enabled: false },
    )
    assert.equal(out.automation.status, 'error', '关闭失败 → error 记录（组装只在 automation.js）')
    assert.equal(out.automation.enabled, true, '失败记录回填 enabled:true，下次保存自动重试')
    assert.equal(out.automation.taskId, 'sch_1', 'taskId 保留')
    assert.equal(out.automation.time, '09:00', '既有记录字段原样重建')
    assert.match(out.automation.lastError, /schedule_conflict/)
    assert.deepEqual(
      fake.calls.filter(([m]) => m === 'edit').map(([, req]) => req.action),
      ['delete', 'delete'],
      'conflict 后重读并重试 1 次 delete',
    )
    assert.equal(fake.calls.filter(([m]) => m === 'view').length, 1, 'conflict 后确实重读宿主')
  }
  {
    const fake = fakeSchedule({ editResults: ['notfound'] })
    const gw = createAutomationGateway(fake, 'UTC')
    const out = await gw.syncOnUpdate(
      { id: 't1', automation: { taskId: 'sch_1', enabled: true, updatedAt: '2026-11-16T08:00:00.000Z' } },
      { enabled: false },
    )
    assert.equal(out.automation, null, '宿主 not_found = 已删除 → 清除本地记录')
  }
})

// ---------------------------------------------------------------- Q5 orphan 与 §三 持久化

test('删除编排：宿主 not_found 视为成功；失败 → automationOrphans 留痕且 remove 不失败（Q5）', async (t) => {
  {
    const fake = fakeSchedule({ editResults: ['notfound'] })
    const { store } = await tempStore(t)
    const api = createApi(store, () => createAutomationGateway(fake, 'UTC'))
    const todo = await api.create({ title: 'x', repeat: { freq: 'daily' }, automation: { enabled: true, time: '09:00' } })
    assert.deepEqual(await api.remove({ id: todo.id }), { id: todo.id })
    assert.deepEqual(store.automationOrphans(), [], 'not_found 视为已删除，不置 orphan')
  }
  {
    const fake = fakeSchedule({ editResults: ['error'] })
    const { store, file } = await tempStore(t)
    const api = createApi(store, () => createAutomationGateway(fake, 'UTC'))
    const todo = await api.create({ title: 'x', repeat: { freq: 'daily' }, automation: { enabled: true, time: '09:00' } })
    const taskId = todo.automation.taskId
    assert.deepEqual(await api.remove({ id: todo.id }), { id: todo.id }, '待办照删，remove 仍返回成功')
    const orphans = store.automationOrphans()
    assert.equal(orphans.length, 1)
    assert.equal(orphans[0].todoId, todo.id)
    assert.equal(orphans[0].taskId, taskId)
    assert.match(orphans[0].reason, /internal_error/)
    const raw = JSON.parse(await readFile(file, 'utf8'))
    assert.equal(raw.automationOrphans.length, 1, '顶层留痕落盘')
  }
})

test('§三兼容：老数据无 automation/automationOrphans 读入照常；orphan 随文件回读', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'todo-legacy-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const file = join(dir, 'todos.json')
  await writeFile(file, JSON.stringify({
    version: 1,
    todos: [{
      id: 't_old', title: '老待办', note: '', priority: null, category: null, dueDate: null, dueTime: null,
      done: false, repeat: null, completions: {}, doneAt: null, doneBy: null, verifiedAt: null,
      createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
    }],
    notes: [],
  }, null, 2), 'utf8')
  const store = createStore({ file })
  await store.load()
  const { items } = await store.list()
  assert.equal(items.length, 1)
  assert.equal(items[0].automation, undefined)
  assert.deepEqual(store.automationOrphans(), [])

  await store.pushAutomationOrphan({ todoId: 't_old', taskId: 'sch_9', status: 'orphan', reason: 'internal_error: x', at: '2026-11-16T08:00:00.000Z' })
  await store.close()
  const again = createStore({ file })
  await again.load()
  assert.deepEqual(again.automationOrphans(), [
    { todoId: 't_old', taskId: 'sch_9', status: 'orphan', reason: 'internal_error: x', at: '2026-11-16T08:00:00.000Z' },
  ])
  await again.close()
})

// ---------------------------------------------------------------- 路由能力探测（§五）

function makeCtx({ schedule = null } = {}) {
  const handlers = {}
  return {
    handlers,
    effect(fn) { fn() },
    inject(deps, cb) { if (schedule && deps.includes('schedule')) cb({ schedule }) },
    webServer: { register(h) { handlers[h.path] = h.handler } },
    tools: { register() {} },
    connection: { requestRejection: () => undefined },
  }
}

function fakeReq(url, body) {
  const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  return { url, method: 'POST', [Symbol.asyncIterator]: async function* () { yield* payload } }
}

function fakeRes() {
  const res = { statusCode: 0, body: '' }
  res.writeHead = (status) => { res.statusCode = status }
  res.end = (text) => { res.body = text }
  return res
}

async function callRoute(ctx, url, body) {
  const res = fakeRes()
  await ctx.handlers['/todo/api'](fakeReq(url, body), res)
  return { status: res.statusCode, body: JSON.parse(res.body) }
}

test('list 注入 capabilities.automation；automation-unavailable 映射 HTTP 400 且待办已保存（§五/§六）', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'todo-route-'))
  t.after(() => rm(dir, { recursive: true, force: true }))

  const without = makeCtx({})
  apply(without, { dataPath: join(dir, 'a.json') })
  let res = await callRoute(without, '/todo/api/list', {})
  assert.equal(res.status, 200)
  assert.deepEqual(res.body.result.capabilities, { automation: false })

  const withSchedule = makeCtx({ schedule: fakeSchedule() })
  apply(withSchedule, { dataPath: join(dir, 'b.json') })
  res = await callRoute(withSchedule, '/todo/api/list', {})
  assert.deepEqual(res.body.result.capabilities, { automation: true })

  // §九B7：经接口强制带意图 → automation-unavailable 且待办已保存。
  res = await callRoute(without, '/todo/api/create', { title: 'x', repeat: { freq: 'daily' }, automation: { enabled: true } })
  assert.equal(res.status, 400)
  assert.equal(res.body.error.code, 'automation-unavailable')
  const list2 = await callRoute(without, '/todo/api/list', {})
  assert.equal(list2.body.result.items.length, 1, '待办本体照常保存')
})

// ---------------------------------------------------------------- Q4 personal_todo

test('personal_todo：add/update 透传 automation，参数进 schema，渲染含状态行（§十一）', async (t) => {
  const fake = fakeSchedule()
  const { store } = await tempStore(t)
  const api = createApi(store, () => createAutomationGateway(fake, 'UTC'))
  const tool = createTool(api, Promise.resolve())
  assert.ok(tool.parameters.properties.automation, 'automation 参数必须显式声明进工具 schema')
  assert.deepEqual(tool.parameters.properties.automation.required, ['enabled'])

  const added = await tool.execute(
    { action: 'add', title: '提交每周工时', repeat: { freq: 'weekly', weekdays: [5] }, automation: { enabled: true, time: '17:30' } },
    {},
  )
  assert.equal(added.item.automation.taskId, 'sch_1')
  assert.match(tool.output.render({ action: 'add' }, added)[0].text, /自动化任务：ok/)
  assert.ok(fake.calls[0][1].prompt.includes('todoId='), '工具路径复用同一映射模块（Q4 铁律）')

  const off = await tool.execute({ action: 'update', id: added.item.id, automation: { enabled: false } }, {})
  assert.equal(off.item.automation, undefined)
  assert.ok(!tool.output.render({ action: 'update' }, off)[0].text.includes('自动化任务'))
})

test('personal_todo：无宿主时 add 带 automation 报 automation-unavailable（§九B7）', async (t) => {
  const { store } = await tempStore(t)
  const api = createApi(store, () => null)
  const tool = createTool(api, Promise.resolve())
  await assert.rejects(
    () => tool.execute({ action: 'add', title: 'x', repeat: { freq: 'daily' }, automation: { enabled: true } }, {}),
    (err) => err instanceof TodoError && err.code === 'automation-unavailable',
  )
})
