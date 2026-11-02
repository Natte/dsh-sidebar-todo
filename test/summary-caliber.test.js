import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dateKey, shiftKey } from '../lib/bucket.js'
import { createStore } from '../lib/store.js'

async function make(t) {
  const dir = await mkdtemp(join(tmpdir(), 'todo-summary-'))
  const store = createStore({ file: join(dir, 'todos.json') })
  await store.load()
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }) })
  return store
}

test('搜索/筛选不缩小 summary（全量口径）', async (t) => {
  const store = await make(t)
  const today = dateKey(new Date())
  await store.create({ title: '回款，今天的' , dueDate: today })
  await store.create({ title: '别的事', category: '工作' })
  const searched = await store.list({ q: '回款' })
  assert.equal(searched.items.length, 1)
  assert.equal(searched.summary.today, 1)
  assert.equal(searched.summary.unplanned, 1, '被搜索掐掉的「别的事」仍要计入未排期')
  const filtered = await store.list({ category: '工作' })
  assert.equal(filtered.items.length, 1)
  assert.equal(filtered.summary.today, 1)
})

test('全量口径含 doneToday（既有语义迁移）', async (t) => {
  const store = await make(t)
  const created = await store.create({ title: 'a' })
  await store.complete(created.id, true, 'user')
  await store.create({ title: 'b' })
  const out = await store.list({ q: 'b' })
  assert.equal(out.summary.doneToday, 1)
  assert.equal(out.summary.unplanned, 1)
})
