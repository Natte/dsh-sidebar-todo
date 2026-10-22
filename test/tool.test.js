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

test('render 产出文本块', async () => {
  const { tool, store } = await makeTool()
  const out = await tool.execute({ action: 'add', title: 'x' }, {})
  const blocks = tool.output.render({ action: 'add' }, out)
  assert.equal(blocks[0].type, 'text')
  assert.match(blocks[0].text, /x/)
  await store.close()
})
