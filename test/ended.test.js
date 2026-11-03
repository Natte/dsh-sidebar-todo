import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bucketOf, dateKey, shiftKey, summarize } from '../lib/bucket.js'
import { applyPatch } from '../lib/model.js'
import { createStore } from '../lib/store.js'

const TODAY = dateKey(new Date())

async function make(t) {
  const dir = await mkdtemp(join(tmpdir(), 'todo-ended-'))
  const store = createStore({ file: join(dir, 'todos.json') })
  await store.load()
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }) })
  return store
}

test('until 已过的周循环进入回收区 bucket=ended（dueDate=null）', async (t) => {
  const store = await make(t)
  const yesterday = shiftKey(TODAY, -1)
  await store.create({ title: '旧周例会', dueDate: '2026-10-01', repeat: { freq: 'weekly', weekdays: [1], until: yesterday } })
  const out = await store.list({})
  const ended = out.items.find((item) => item.title === '旧周例会')
  assert.equal(ended.bucket, 'ended')
  assert.equal(ended.dueDate, null)
  assert.equal(ended.seriesEnded, true)
  assert.equal(out.summary.ended, 1)
})

test('view=open 不含 ended；view=ended 单独可查', async (t) => {
  const store = await make(t)
  await store.create({ title: '正常的', repeat: { freq: 'daily' } })
  await store.create({ title: '旧周例会', dueDate: '2026-10-01', repeat: { freq: 'weekly', weekdays: [1], until: '2026-10-31' } })
  const open = await store.list({ view: 'open' })
  assert.deepEqual(open.items.map((i) => i.title), ['正常的'])
  const ended = await store.list({ view: 'ended' })
  assert.deepEqual(ended.items.map((i) => i.title), ['旧周例会'])
})

test('把 until 往后延即可「复活」回正常分组', async (t) => {
  const store = await make(t)
  const created = await store.create({ title: '旧月度复盘', dueDate: '2026-10-01', repeat: { freq: 'monthly', monthDay: 1, until: '2026-10-31' } })
  const ended = await store.list({ view: 'ended' })
  assert.equal(ended.items.length, 1)
  const long = applyPatch(ended.items[0], { repeat: { freq: 'monthly', monthDay: 1, until: '2027-12-31' } })
  await store.update(created.id, { repeat: long.repeat })
  const open = await store.list({ view: 'open' })
  assert.ok(open.items.some((i) => i.title === '旧月度复盘'))
})

test('本周期已办过但规则未结束的：维持隐藏，不误判 ended', async (t) => {
  const store = await make(t)
  const todo = await store.create({ title: '每周例会', dueDate: '2026-10-01', repeat: { freq: 'weekly', weekdays: [3] } })
  // 把本周内当前周期的那次完成掉 → 整行收起（原 v2 语义）
  const periodDue = (await store.list({})).items.find((i) => i.title === '每周例会').dueDate
  await store.complete(todo.id, true, 'user', periodDue)
  const out = await store.list({})
  assert.equal(out.items.some((i) => i.title === '每周例会'), false)
  assert.equal(out.summary.ended, 0)
})

test('summarize 认识 ended 计数', () => {
  const items = [
    { bucket: 'today' }, { bucket: 'ended' }, { bucket: 'ended' },
  ]
  const out = summarize(items, new Date())
  assert.equal(out.today, 1)
  assert.equal(out.ended, 2)
})

test('bucketOf 不认识 ended（它只由 store.list 派发）——防呆检查', () => {
  // bucketOf 只认 open 状态的常规桶；ended 不是 bucketOf 的输出。
  const todo = { done: false, dueDate: shiftKey(TODAY, 30) }
  assert.equal(bucketOf(todo, new Date(), 7), 'later')
})
