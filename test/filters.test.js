import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStore } from '../lib/store.js'
import { TodoError } from '../lib/model.js'

async function make(t) {
  const dir = await mkdtemp(join(tmpdir(), 'todo-filter-'))
  const store = createStore({ file: join(dir, 'todos.json') })
  await store.load()
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }) })
  return store
}

test('category / uncategorized / priority 三轴各自生效并可组合', async (t) => {
  const store = await make(t)
  await store.create({ title: 'a', category: '工作', priority: 'high' })
  await store.create({ title: 'b', category: '工作' })
  await store.create({ title: 'c' })
  assert.equal((await store.list({ category: '工作' })).items.length, 2)
  assert.equal((await store.list({ category: '生活' })).items.length, 0)
  assert.equal((await store.list({ uncategorized: true })).items.length, 1)
  assert.equal((await store.list({ priority: 'high' })).items.length, 1)
  const both = await store.list({ category: '工作', priority: 'high' })
  assert.equal(both.items.length, 1)
  assert.equal(both.items[0].title, 'a')
})

test('与搜索词 AND；空串与缺省都等价不过滤', async (t) => {
  const store = await make(t)
  await store.create({ title: '回款表', category: '审计' })
  await store.create({ title: '回款口径', category: '工作' })
  assert.equal((await store.list({ q: '回款', category: '审计' })).items.length, 1)
  assert.equal((await store.list({ q: '回款', category: '' })).items.length, 2)
})

test('非法 priority 报 invalid-input（防止静默空结果误导）', async (t) => {
  const store = await make(t)
  await assert.rejects(() => store.list({ priority: 'urgent' }), (e) => e instanceof TodoError && e.code === 'invalid-input')
})

test('循环任务同样吃筛选（current-period 形状保持不变）', async (t) => {
  const store = await make(t)
  await store.create({ title: '日报', repeat: { freq: 'weekly', weekdays: [1, 2, 3, 4, 5] }, category: '工作' })
  await store.create({ title: '周报', category: '审计' })
  const only = await store.list({ category: '工作' })
  assert.equal(only.items.length, 1)
  assert.equal(only.items[0].title, '日报')
  assert.equal(only.items[0].isRepeating, true)
})
