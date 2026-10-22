import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStore } from '../lib/store.js'
import { createApi } from '../lib/api.js'
import { createTool } from '../lib/tool.js'

async function makeTool() {
  const dir = await mkdtemp(join(tmpdir(), 'todo-tool-'))
  const store = createStore({ file: join(dir, 'todos.json') })
  const ready = store.load()
  return { tool: createTool(createApi(store), ready), store }
}

test('add 返回新记录与摘要', async () => {
  const { tool, store } = await makeTool()
  const out = await tool.execute({ action: 'add', title: '交周报', dueDate: '2026-10-22' }, {})
  assert.equal(out.item.title, '交周报')
  assert.equal(out.summary.today, 1)
  await store.close()
})

test('list 默认只给未完成', async () => {
  const { tool, store } = await makeTool()
  const a = await tool.execute({ action: 'add', title: 'a' }, {})
  await tool.execute({ action: 'complete', id: a.item.id }, {})
  const out = await tool.execute({ action: 'list' }, {})
  assert.equal(out.items.length, 0)
  const all = await tool.execute({ action: 'list', view: 'done' }, {})
  assert.equal(all.items.length, 1)
  await store.close()
})

test('未知 action 报错', async () => {
  const { tool, store } = await makeTool()
  await assert.rejects(() => tool.execute({ action: 'nope' }, {}), /不支持的 action/)
  await store.close()
})

test('工具名为 personal_todo，与官方 todo_write 区分', async () => {
  const { tool, store } = await makeTool()
  assert.equal(tool.name, 'personal_todo')
  assert.match(tool.description, /本人/)
  assert.match(tool.description, /官方 todo_write/)
  await store.close()
})

test('render 产出文本块', async () => {
  const { tool, store } = await makeTool()
  const out = await tool.execute({ action: 'add', title: 'x' }, {})
  const blocks = tool.output.render({ action: 'add' }, out)
  assert.equal(blocks[0].type, 'text')
  assert.match(blocks[0].text, /x/)
  assert.ok(blocks[0].text.includes(out.item.id), 'add 的渲染要带 id')
  await store.close()
})

test('list / complete / delete 的渲染都带 id', async () => {
  const { tool, store } = await makeTool()
  const added = await tool.execute({ action: 'add', title: 'y' }, {})
  const id = added.item.id
  const listed = await tool.execute({ action: 'list' }, {})
  assert.ok(tool.output.render({ action: 'list' }, listed)[0].text.includes(id), 'list 每行要带 id')
  const completed = await tool.execute({ action: 'complete', id }, {})
  assert.ok(tool.output.render({ action: 'complete' }, completed)[0].text.includes(id), 'complete 要带 id')
  const removed = await tool.execute({ action: 'delete', id }, {})
  assert.ok(tool.output.render({ action: 'delete' }, removed)[0].text.includes(id), 'delete 要带 id')
  await store.close()
})
