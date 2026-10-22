import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStore } from '../lib/store.js'
import { createApi } from '../lib/api.js'
import { createTool } from '../lib/tool.js'
import { TodoError } from '../lib/model.js'

async function makeTool(t) {
  const dir = await mkdtemp(join(tmpdir(), 'todo-tool-'))
  const store = createStore({ file: join(dir, 'todos.json') })
  const ready = store.load()
  t.after(async () => {
    await store.close()
    await rm(dir, { recursive: true, force: true })
  })
  return { tool: createTool(createApi(store), ready), store }
}

test('add 返回新记录与摘要', async (t) => {
  const { tool } = await makeTool(t)
  const out = await tool.execute({ action: 'add', title: '交周报', dueDate: '2026-10-22' }, {})
  assert.equal(out.item.title, '交周报')
  assert.equal(out.summary.today, 1)
})

test('list 默认只给未完成', async (t) => {
  const { tool } = await makeTool(t)
  const a = await tool.execute({ action: 'add', title: 'a' }, {})
  await tool.execute({ action: 'complete', id: a.item.id }, {})
  const out = await tool.execute({ action: 'list' }, {})
  assert.equal(out.items.length, 0)
  const all = await tool.execute({ action: 'list', view: 'done' }, {})
  assert.equal(all.items.length, 1)
})

test('未知 action 报错', async (t) => {
  const { tool } = await makeTool(t)
  await assert.rejects(() => tool.execute({ action: 'nope' }, {}), /不支持的 action/)
})

test('工具名为 personal_todo，与官方 todo_write 区分', async (t) => {
  const { tool } = await makeTool(t)
  assert.equal(tool.name, 'personal_todo')
  assert.match(tool.description, /本人/)
  assert.match(tool.description, /官方 todo_write/)
})

test('render 产出文本块', async (t) => {
  const { tool } = await makeTool(t)
  const out = await tool.execute({ action: 'add', title: 'x' }, {})
  const blocks = tool.output.render({ action: 'add' }, out)
  assert.equal(blocks[0].type, 'text')
  assert.match(blocks[0].text, /x/)
  assert.ok(blocks[0].text.includes(out.item.id), 'add 的渲染要带 id')
})

test('list / complete / delete 的渲染都带 id', async (t) => {
  const { tool } = await makeTool(t)
  const added = await tool.execute({ action: 'add', title: 'y' }, {})
  const id = added.item.id
  const listed = await tool.execute({ action: 'list' }, {})
  assert.ok(tool.output.render({ action: 'list' }, listed)[0].text.includes(id), 'list 每行要带 id')
  const completed = await tool.execute({ action: 'complete', id }, {})
  assert.ok(tool.output.render({ action: 'complete' }, completed)[0].text.includes(id), 'complete 要带 id')
  const removed = await tool.execute({ action: 'delete', id }, {})
  assert.ok(tool.output.render({ action: 'delete' }, removed)[0].text.includes(id), 'delete 要带 id')
})

test('update 扁平形状真的改掉 title', async (t) => {
  const { tool } = await makeTool(t)
  const added = await tool.execute({ action: 'add', title: '旧标题' }, {})
  const out = await tool.execute({ action: 'update', id: added.item.id, title: '新标题' }, {})
  assert.equal(out.item.title, '新标题')
  assert.match(tool.output.render({ action: 'update' }, out)[0].text, /新标题/)
})

test('update 嵌套 patch 形状真的改掉 title', async (t) => {
  const { tool, store } = await makeTool(t)
  const added = await tool.execute({ action: 'add', title: '旧标题' }, {})
  const out = await tool.execute({ action: 'update', id: added.item.id, patch: { title: '新标题' } }, {})
  assert.equal(out.item.title, '新标题')
  const listed = await store.list({})
  assert.equal(listed.items.find((item) => item.id === added.item.id).title, '新标题')
})

test('list 的 summary 是全量统计并含最近完成', async (t) => {
  const { tool } = await makeTool(t)
  const a = await tool.execute({ action: 'add', title: 'a' }, {})
  await tool.execute({ action: 'complete', id: a.item.id }, {})
  await tool.execute({ action: 'add', title: 'b' }, {})
  const out = await tool.execute({ action: 'list', view: 'done' }, {})
  assert.equal(out.items.length, 1, '视图只给已完成')
  assert.equal(out.summary.doneToday, 1, '摘要按全量算，含今天完成的 a')
  assert.equal(out.summary.unplanned, 1, '摘要里还有未完成的 b')
  const text = tool.output.render({ action: 'list', view: 'done' }, out)[0].text
  assert.match(text, /最近完成 1/)
  assert.match(text, /view=done/)
  assert.match(text, /计数为全量/)
})

test('complete done:false 取消完成', async (t) => {
  const { tool } = await makeTool(t)
  const added = await tool.execute({ action: 'add', title: 'c' }, {})
  await tool.execute({ action: 'complete', id: added.item.id }, {})
  const undone = await tool.execute({ action: 'complete', id: added.item.id, done: false }, {})
  assert.equal(undone.item.done, false)
  assert.equal(undone.item.doneAt, null)
  assert.ok(tool.output.render({ action: 'complete' }, undone)[0].text.includes(added.item.id))
})

test('工具完成的记录带 doneBy=agent', async (t) => {
  const { tool, store } = await makeTool(t)
  const added = await tool.execute({ action: 'add', title: 'x' }, {})
  const done = await tool.execute({ action: 'complete', id: added.item.id }, {})
  assert.equal(done.item.doneBy, 'agent')
  assert.equal(done.item.verifiedAt, null)
  await store.close()
})

test('confirm 可确认 agent 完成并写入 verifiedAt', async (t) => {
  const { tool } = await makeTool(t)
  const added = await tool.execute({ action: 'add', title: '待确认' }, {})
  await tool.execute({ action: 'complete', id: added.item.id }, {})
  const confirmed = await tool.execute({ action: 'confirm', id: added.item.id }, {})
  assert.ok(confirmed.item.verifiedAt)
  assert.equal(confirmed.item.doneBy, 'agent')
  assert.equal(confirmed.item.done, true)
})

test('update / complete / confirm / delete 缺 id 报 invalid-input', async (t) => {
  const { tool } = await makeTool(t)
  for (const action of ['update', 'complete', 'confirm', 'delete']) {
    await assert.rejects(
      () => tool.execute({ action, title: 'z' }, {}),
      (err) => err instanceof TodoError && err.code === 'invalid-input',
      `${action} 缺 id 应是 invalid-input`,
    )
  }
})

test('execute(null) 抛 invalid-input 而不是裸 TypeError', async (t) => {
  const { tool } = await makeTool(t)
  await assert.rejects(
    () => tool.execute(null, {}),
    (err) => err instanceof TodoError && err.code === 'invalid-input',
  )
})
