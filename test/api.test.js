import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStore } from '../lib/store.js'
import { createApi } from '../lib/api.js'
import { TodoError } from '../lib/model.js'

async function makeApi() {
  const dir = await mkdtemp(join(tmpdir(), 'todo-api-'))
  const store = createStore({ file: join(dir, 'todos.json') })
  await store.load()
  return { api: createApi(store), store }
}

test('create → list → complete → remove 全链路', async () => {
  const { api, store } = await makeApi()
  const created = await api.create({ title: '交周报' })
  const listed = await api.list({})
  assert.equal(listed.items.length, 1)
  const done = await api.complete({ id: created.id, done: true })
  assert.equal(done.done, true)
  const removed = await api.remove({ id: created.id })
  assert.deepEqual(removed, { id: created.id })
  await store.close()
})

test('update 接受 { id, patch } 与扁平两种形状', async () => {
  const { api, store } = await makeApi()
  const created = await api.create({ title: 'a' })
  const one = await api.update({ id: created.id, patch: { title: 'b' } })
  assert.equal(one.title, 'b')
  const two = await api.update({ id: created.id, title: 'c' })
  assert.equal(two.title, 'c')
  await store.close()
})

test('错误带 code，未知 id 是 not-found', async () => {
  const { api, store } = await makeApi()
  await assert.rejects(() => api.remove({ id: 'ghost' }), (err) => err instanceof TodoError && err.code === 'not-found')
  await store.close()
})

test('parse 只解析不落库', async () => {
  const { api, store } = await makeApi()
  const out = await api.parse({ text: '明天下午3点 交周报 #工作 p1', today: '2026-10-22' })
  assert.equal(out.title, '交周报')
  assert.equal(out.dueDate, '2026-10-23')
  assert.equal(out.dueTime, '15:00')
  assert.equal(out.category, '工作')
  assert.equal(out.priority, 'high')
  const listed = await api.list({})
  assert.equal(listed.items.length, 0)
  await store.close()
})
