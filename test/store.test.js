import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStore } from '../lib/store.js'
import { TodoError } from '../lib/model.js'
import { dateKey, shiftKey } from '../lib/bucket.js'

async function tempStore(staleDays = 7) {
  const dir = await mkdtemp(join(tmpdir(), 'todo-'))
  const file = join(dir, 'todos.json')
  const store = createStore({ file, staleDays })
  await store.load()
  return { store, file, dir }
}

/** 在固定的「今天」下跑一段断言，用来覆盖按天/周/月判断的周期边界。 */
async function withToday(dateStr, fn) {
  const RealDate = globalThis.Date
  const [y, m, d] = dateStr.split('-').map(Number)
  const fixed = new RealDate(y, m - 1, d, 12)
  class FakeDate extends RealDate {
    constructor(...args) {
      super(...(args.length === 0 ? [fixed.getTime()] : args))
    }

    static now() {
      return fixed.getTime()
    }
  }
  globalThis.Date = FakeDate
  try {
    return await fn()
  } finally {
    globalThis.Date = RealDate
  }
}

test('新建后能读回，字段齐全', async () => {
  const { store } = await tempStore()
  const todo = await store.create({ title: '交周报', dueDate: dateKey(new Date()), priority: 'high' })
  assert.equal(todo.title, '交周报')
  assert.equal(todo.done, false)
  assert.equal(todo.bucket, 'today')
  assert.ok(todo.id.startsWith('t_'))

  const { items } = await store.list()
  assert.equal(items.length, 1)
  assert.equal(items[0].id, todo.id)
  await store.close()
})

test('落盘后重建 store 仍能读到', async () => {
  const { store, file } = await tempStore()
  await store.create({ title: '续签域名' })
  await store.close()

  const again = createStore({ file })
  await again.load()
  const { items } = await again.list()
  assert.equal(items.length, 1)
  assert.equal(items[0].title, '续签域名')
  await again.close()
})

test('完成写 doneAt，取消完成清空', async () => {
  const { store } = await tempStore()
  const todo = await store.create({ title: '预约体检' })
  const done = await store.complete(todo.id, true)
  assert.equal(done.done, true)
  assert.ok(done.doneAt)
  const undone = await store.complete(todo.id, false)
  assert.equal(undone.done, false)
  assert.equal(undone.doneAt, null)
  await store.close()
})

test('update 只改允许的字段', async () => {
  const { store } = await tempStore()
  const todo = await store.create({ title: '整理预算表' })
  const next = await store.update(todo.id, { title: '整理 Q4 预算表', priority: 'medium', id: 'hack', createdAt: 'x' })
  assert.equal(next.title, '整理 Q4 预算表')
  assert.equal(next.priority, 'medium')
  assert.equal(next.id, todo.id)
  assert.notEqual(next.createdAt, 'x')
  await store.close()
})

test('删除后不再返回', async () => {
  const { store } = await tempStore()
  const todo = await store.create({ title: 'x' })
  await store.remove(todo.id)
  const { items } = await store.list()
  assert.equal(items.length, 0)
  await store.close()
})

test('空标题与非法日期被拒绝', async () => {
  const { store } = await tempStore()
  await assert.rejects(() => store.create({ title: '   ' }), (err) => err instanceof TodoError && err.code === 'invalid-input')
  await assert.rejects(() => store.create({ title: 'x', dueDate: '2026/10/22' }), (err) => err.code === 'invalid-input')
  await assert.rejects(() => store.update('nope', { title: 'y' }), (err) => err.code === 'not-found')
  await store.close()
})

test('文件损坏时备份并空表启动', async () => {
  const { store, file, dir } = await tempStore()
  await store.create({ title: 'a' })
  await store.close()

  const original = '{ this is not json'
  await writeFile(file, original, 'utf8')
  const broken = createStore({ file })
  const info = await broken.load()
  assert.equal(info.corrupt, true)
  const { items, notices } = await broken.list()
  assert.equal(items.length, 0)
  assert.deepEqual(notices, ['corrupt'])
  const names = await readdir(dir)
  const backup = names.find((n) => n.startsWith('todos.corrupt-'))
  assert.ok(backup, 'corrupt backup written')
  assert.equal(await readFile(join(dir, backup), 'utf8'), original)
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), { version: 1, todos: [] })
  await broken.close()
})

test('list 支持 view 与 q 过滤', async () => {
  const { store } = await tempStore()
  await store.create({ title: '交周报', dueDate: dateKey(new Date()) })
  await store.create({ title: '买牛奶' })
  const byText = await store.list({ q: '牛奶' })
  assert.deepEqual(byText.items.map((t) => t.title), ['买牛奶'])
  const onlyToday = await store.list({ view: 'today' })
  assert.deepEqual(onlyToday.items.map((t) => t.title), ['交周报'])
  await store.close()
})

test('并发写不会丢（串行队列）', async () => {
  const { store, file } = await tempStore()
  await Promise.all(Array.from({ length: 20 }, (_, i) => store.create({ title: `t${i}` })))
  const raw = JSON.parse(await readFile(file, 'utf8'))
  assert.equal(raw.todos.length, 20)
  await store.close()
})

test('一次写盘失败后队列仍可继续', async () => {
  const { store, file } = await tempStore()
  const tmp = `${file}.tmp`
  await mkdir(tmp)
  await assert.rejects(
    () => store.create({ title: '失败的一次' }),
    (err) => err instanceof TodoError && err.code === 'io-error',
  )
  await rm(tmp, { recursive: true, force: true })
  const next = await store.create({ title: '恢复后的一次' })
  assert.equal(next.title, '恢复后的一次')
  const raw = JSON.parse(await readFile(file, 'utf8'))
  assert.deepEqual(raw.todos.map((t) => t.title), ['失败的一次', '恢复后的一次'])
  await store.close()
})

test('损坏且备份失败时抛错并保留原件', async () => {
  const { store, file, dir } = await tempStore()
  await store.create({ title: 'a' })
  await store.close()

  const original = '{ this is not json'
  await writeFile(file, original, 'utf8')

  const realNow = Date.now
  const fixed = realNow()
  Date.now = () => fixed
  const broken = createStore({ file })
  try {
    await mkdir(join(dir, `todos.corrupt-${fixed}.json`))
    await assert.rejects(
      () => broken.load(),
      (err) => err instanceof TodoError && err.code === 'io-error',
    )
    assert.equal(await readFile(file, 'utf8'), original)
    await assert.rejects(
      () => broken.create({ title: 'x' }),
      (err) => err instanceof TodoError && err.code === 'io-error',
    )
    assert.equal(await readFile(file, 'utf8'), original)
  } finally {
    Date.now = realNow
    await broken.close()
  }
})

test('非法入参统一抛 TodoError', async () => {
  const { store } = await tempStore()
  await assert.rejects(() => store.create(null), (err) => err instanceof TodoError && err.code === 'invalid-input')
  const todo = await store.create({ title: 'z' })
  await assert.rejects(() => store.update(todo.id, null), (err) => err instanceof TodoError && err.code === 'invalid-input')
  await assert.rejects(() => store.list(null), (err) => err instanceof TodoError && err.code === 'invalid-input')
  await store.close()
})

test('用户完成立即视为已核实，agent 完成需要确认', async () => {
  const { store } = await tempStore()
  const mine = await store.create({ title: 'a' })
  const userDone = await store.complete(mine.id, true, 'user')
  assert.equal(userDone.doneBy, 'user')
  assert.ok(userDone.verifiedAt)

  const theirs = await store.create({ title: 'b' })
  const agentDone = await store.complete(theirs.id, true, 'agent')
  assert.equal(agentDone.doneBy, 'agent')
  assert.equal(agentDone.verifiedAt, null)

  const confirmed = await store.confirm(theirs.id)
  assert.ok(confirmed.verifiedAt)
  await store.close()
})

test('取消完成会清掉 doneBy 与 verifiedAt', async () => {
  const { store } = await tempStore()
  const todo = await store.create({ title: 'a' })
  await store.complete(todo.id, true, 'agent')
  const reopened = await store.complete(todo.id, false)
  assert.equal(reopened.doneBy, null)
  assert.equal(reopened.verifiedAt, null)
  await store.close()
})

test('重复完成保持 doneAt，done 只接受布尔', async () => {
  const { store } = await tempStore()
  const todo = await store.create({ title: '幂等' })
  const first = await store.complete(todo.id, true)
  await new Promise((resolve) => setTimeout(resolve, 5))
  const again = await store.complete(todo.id, true)
  assert.equal(again.done, true)
  assert.equal(again.doneAt, first.doneAt)
  await assert.rejects(() => store.complete(todo.id, 0), (err) => err instanceof TodoError && err.code === 'invalid-input')
  await assert.rejects(() => store.complete(todo.id, null), (err) => err instanceof TodoError && err.code === 'invalid-input')
  const undone = await store.complete(todo.id, false)
  assert.equal(undone.done, false)
  assert.equal(undone.doneAt, null)
  const redone = await store.complete(todo.id, true)
  assert.ok(redone.doneAt)
  assert.notEqual(redone.doneAt, first.doneAt)
  await store.close()
})

test('写失败后 list 带 write-error，retryPersist 成功才清除', async () => {
  const { store, file } = await tempStore()
  const tmp = `${file}.tmp`
  await mkdir(tmp)
  await assert.rejects(
    () => store.create({ title: '尚未落盘' }),
    (err) => err instanceof TodoError && err.code === 'io-error',
  )
  assert.deepEqual((await store.list()).notices, ['write-error'])
  await assert.rejects(
    () => store.retryPersist(),
    (err) => err instanceof TodoError && err.code === 'io-error',
  )
  assert.deepEqual((await store.list()).notices, ['write-error'])

  await rm(tmp, { recursive: true, force: true })
  assert.deepEqual(await store.retryPersist(), { ok: true })
  assert.deepEqual((await store.list()).notices, [])
  const raw = JSON.parse(await readFile(file, 'utf8'))
  assert.deepEqual(raw.todos.map((todo) => todo.title), ['尚未落盘'])
  await store.close()
})

test('损坏与写失败同时出现时 notices 同时含两个值', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'todo-'))
  const file = join(dir, 'todos.json')
  await writeFile(file, '{ this is not json', 'utf8')
  const store = createStore({ file })
  await store.load()

  const tmp = `${file}.tmp`
  await mkdir(tmp)
  await assert.rejects(
    () => store.create({ title: 'x' }),
    (err) => err instanceof TodoError && err.code === 'io-error',
  )
  assert.deepEqual((await store.list()).notices, ['corrupt', 'write-error'])
  await rm(tmp, { recursive: true, force: true })
  await store.close()
})

test('list 返回 staleDays，供前端拼积压文案', async () => {
  const { store } = await tempStore(5)
  assert.equal((await store.list()).staleDays, 5)
  await store.close()
})

test('confirm 只允许确认 agent 完成的记录', async () => {
  const { store } = await tempStore()
  const todo = await store.create({ title: 'a' })
  await assert.rejects(
    () => store.confirm(todo.id),
    (err) => err instanceof TodoError && err.code === 'invalid-input' && /不需要确认/.test(err.message),
  )
  await store.complete(todo.id, true, 'user')
  await assert.rejects(
    () => store.confirm(todo.id),
    (err) => err instanceof TodoError && err.code === 'invalid-input',
  )
  const agent = await store.create({ title: 'b' })
  await store.complete(agent.id, true, 'agent')
  assert.ok((await store.confirm(agent.id)).verifiedAt)
  await assert.rejects(
    () => store.confirm('ghost'),
    (err) => err instanceof TodoError && err.code === 'not-found',
  )
  await store.close()
})

test('categories 按使用量排序', async () => {
  const { store } = await tempStore()
  await store.create({ title: 'a', category: '工作' })
  await store.create({ title: 'b', category: '工作' })
  await store.create({ title: 'c', category: '生活' })
  const { items } = store.categories()
  assert.deepEqual(items, [{ name: '工作', count: 2 }, { name: '生活', count: 1 }])
  await store.close()
})

test('renameCategory 改名并合并到已有分类', async () => {
  const { store } = await tempStore()
  await store.create({ title: 'a', category: '生活' })
  const b = await store.create({ title: 'b', category: '日常' })
  const out = await store.renameCategory('生活', '日常')
  assert.equal(out.moved, 1)
  const { items } = await store.list()
  assert.equal(items.find((t) => t.id === b.id).category, '日常')
  assert.equal(items.filter((t) => t.category === '日常').length, 2)
  await store.close()
})

test('renameCategory 空名与非法输入被拒', async () => {
  const { store } = await tempStore()
  await assert.rejects(() => store.renameCategory('生活', '  '), (e) => e.code === 'invalid-input')
  await assert.rejects(() => store.renameCategory('', 'x'), (e) => e.code === 'invalid-input')
  await store.close()
})

test('clearCategory 把待办退回无分类', async () => {
  const { store } = await tempStore()
  const a = await store.create({ title: 'a', category: '生活' })
  const out = await store.clearCategory('生活')
  assert.equal(out.cleared, 1)
  const { items } = await store.list()
  assert.equal(items.find((t) => t.id === a.id).category, null)
  await store.close()
})

test('改名后落盘，重建 store 仍生效', async () => {
  const { store, file } = await tempStore()
  await store.create({ title: 'a', category: '生活' })
  await store.renameCategory('生活', '日常')
  await store.close()
  const again = createStore({ file })
  await again.load()
  const { items } = await again.list()
  assert.equal(items[0].category, '日常')
  await again.close()
})

test('循环任务：create 带 repeat，列表给出 nextDue', async () => {
  const { store } = await tempStore()
  const today = dateKey(new Date())
  const todo = await store.create({
    title: '交日报',
    dueDate: today,
    repeat: { freq: 'daily' },
  })
  assert.equal(todo.repeat.freq, 'daily')
  const { items } = await store.list()
  const row = items.find((t) => t.id === todo.id)
  assert.equal(row.nextDue, today)
  assert.equal(row.isRepeating, true)
  assert.equal(row.bucket, 'today')
  await store.close()
})

test('循环任务：完成今天后从列表消失，日历仍保留当天实例', async () => {
  const { store } = await tempStore()
  const today = dateKey(new Date())
  const todo = await store.create({ title: '交日报', dueDate: today, repeat: { freq: 'daily' } })
  const done = await store.complete(todo.id, true, 'user', today)
  assert.equal(done.done, false)                       // 循环任务恒 false
  assert.ok(done.completions[today])
  const listed = await store.list()
  assert.equal(listed.items.find((t) => t.id === todo.id), undefined)  // 本周期已完成，整行消失
  const calendar = await store.occurrences({ from: today, to: today })
  assert.equal(calendar.items.length, 1)                // 日历不受列表过滤影响
  assert.equal(calendar.items[0].done, true)
  await store.close()
})

test('循环任务：每周五、今天周一且本周五未完成 → 出现在列表（bucket week）', async () => {
  const { store } = await tempStore()
  const todo = await store.create({
    title: '周五检查代码',
    dueDate: '2026-10-23',
    repeat: { freq: 'weekly', weekdays: [5] },
  })
  await withToday('2026-10-26', async () => {           // 周一
    const { items } = await store.list()
    const row = items.find((t) => t.id === todo.id)
    assert.ok(row, '本周五还没完成，应该出现')
    assert.equal(row.dueDate, '2026-10-30')             // 本周五
    assert.equal(row.bucket, 'week')
  })
  await store.close()
})

test('循环任务：完成本周那次后 → 列表不出现', async () => {
  const { store } = await tempStore()
  const todo = await store.create({
    title: '周五检查代码',
    dueDate: '2026-10-23',
    repeat: { freq: 'weekly', weekdays: [5] },
  })
  await withToday('2026-10-26', async () => {
    await store.complete(todo.id, true, 'user', '2026-10-30')
    const { items } = await store.list()
    assert.equal(items.find((t) => t.id === todo.id), undefined)
  })
  await store.close()
})

test('循环任务：每月 25 号未完成、今天 3 号 → 出现且 bucket=later', async () => {
  const { store } = await tempStore()
  const todo = await store.create({
    title: '月度对账',
    dueDate: '2026-10-01',
    repeat: { freq: 'monthly', monthDay: 25 },
  })
  await withToday('2026-10-03', async () => {
    const { items } = await store.list()
    const row = items.find((t) => t.id === todo.id)
    assert.ok(row, '本月 25 号还没到但属于本周期，应该出现')
    assert.equal(row.dueDate, '2026-10-25')
    assert.equal(row.bucket, 'later')
  })
  await store.close()
})

test('循环任务：取消完成会删掉那天的记录', async () => {
  const { store } = await tempStore()
  const today = dateKey(new Date())
  const todo = await store.create({ title: '交日报', dueDate: today, repeat: { freq: 'daily' } })
  await store.complete(todo.id, true, 'user', today)
  const undone = await store.complete(todo.id, false, 'user', today)
  assert.equal(undone.completions[today], undefined)
  await store.close()
})

test('occurrences 按区间展开多条任务', async () => {
  const { store } = await tempStore()
  const today = dateKey(new Date())
  await store.create({ title: 'A', dueDate: today, repeat: { freq: 'daily' } })
  await store.create({ title: 'B', dueDate: today })
  const { items } = await store.occurrences({ from: today, to: shiftKey(today, 2) })
  assert.equal(items.filter((o) => o.title === 'A').length, 3)
  assert.equal(items.filter((o) => o.title === 'B').length, 1)
  await store.close()
})

test('occurrences 带出完成状态', async () => {
  const { store } = await tempStore()
  const today = dateKey(new Date())
  const todo = await store.create({ title: 'A', dueDate: today, repeat: { freq: 'daily' } })
  await store.complete(todo.id, true, 'user', today)
  const { items } = await store.occurrences({ from: today, to: today })
  assert.equal(items[0].done, true)
  await store.close()
})

test('非法 repeat 被拒绝', async () => {
  const { store } = await tempStore()
  await assert.rejects(
    () => store.create({ title: 'x', dueDate: '2026-10-22', repeat: { freq: 'hourly' } }),
    (err) => err.code === 'invalid-input',
  )
  await store.close()
})
