import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStore } from '../lib/store.js'
import { TodoError } from '../lib/model.js'

async function tempStore(staleDays = 7) {
  const dir = await mkdtemp(join(tmpdir(), 'todo-'))
  const file = join(dir, 'todos.json')
  const store = createStore({ file, staleDays })
  await store.load()
  return { store, file, dir }
}

test('新建后能读回，字段齐全', async () => {
  const { store } = await tempStore()
  const todo = await store.create({ title: '交周报', dueDate: '2026-10-22', priority: 'high' })
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

  await writeFile(file, '{ this is not json', 'utf8')
  const broken = createStore({ file })
  const info = await broken.load()
  assert.equal(info.corrupt, true)
  const { items, notices } = await broken.list()
  assert.equal(items.length, 0)
  assert.deepEqual(notices, ['corrupt'])
  const names = await readdir(dir)
  assert.ok(names.some((n) => n.startsWith('todos.corrupt-')), 'corrupt backup written')
  await broken.close()
})

test('list 支持 view 与 q 过滤', async () => {
  const { store } = await tempStore()
  await store.create({ title: '交周报', dueDate: '2026-10-22' })
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
