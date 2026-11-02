import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStore } from '../lib/store.js'
import { createApi } from '../lib/api.js'
import { createNoteTool, createTool } from '../lib/tool.js'
import { TodoError } from '../lib/model.js'

async function make(t) {
  const dir = await mkdtemp(join(tmpdir(), 'todo-notetool-'))
  const store = createStore({ file: join(dir, 'todos.json') })
  const ready = store.load()
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }) })
  const api = createApi(store)
  return { note: createNoteTool(api, ready), todo: createTool(api, ready) }
}

test('add → list → delete 的完整闭环', async (t) => {
  const { note } = await make(t)
  const added = await note.execute({ action: 'add', text: '帮李总查回款' }, {})
  assert.ok(added.item.id.startsWith('n_'))
  const listed = await note.execute({ action: 'list' }, {})
  assert.equal(listed.items.length, 1)
  assert.match(note.output.render({ action: 'list' }, listed)[0].text, /n_/)
  const removed = await note.execute({ action: 'delete', id: added.item.id }, {})
  assert.deepEqual(removed.removed, { id: added.item.id })
  await assert.rejects(() => note.execute({ action: 'delete', id: 'n_ghost' }, {}),
    (e) => e instanceof TodoError && e.code === 'not-found')
})

test('空文本 / 超长 500 / 未知 action 都报 invalid-input', async (t) => {
  const { note } = await make(t)
  await assert.rejects(() => note.execute({ action: 'add', text: '  ' }, {}), (e) => e.code === 'invalid-input')
  await assert.rejects(() => note.execute({ action: 'add', text: '字'.repeat(501) }, {}), (e) => e.code === 'invalid-input')
  await assert.rejects(() => note.execute({ action: 'nope' }, {}), /不支持的 action/)
})

test('delete 缺 id 报 invalid-input', async (t) => {
  const { note } = await make(t)
  await assert.rejects(() => note.execute({ action: 'delete' }, {}), (e) => e.code === 'invalid-input')
})

test('命名与描述分界：提 personal_todo；personal_todo 反向提到本工具', async (t) => {
  const { note, todo } = await make(t)
  assert.equal(note.name, 'personal_note')
  assert.match(note.description, /personal_todo/)
  assert.match(note.description, /随手记|无日期/)
  assert.match(todo.description, /personal_note/)
})

test('execute(null) 抛 invalid-input', async (t) => {
  const { note } = await make(t)
  await assert.rejects(() => note.execute(null, {}), (e) => e.code === 'invalid-input')
})
