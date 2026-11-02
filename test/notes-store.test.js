// Task 1 (v3 store notes 数据层) 独立测试 harness，不动旧测试文件。
// 与 task-1-brief 的差异仅一处，已在 task-1-report.md 记录理由：
// 检测 8 未传 expectBrokenLoad=true —— 损坏 JSON 在可备份场景下 load() 按现有行为
// resolve { corrupt: true }（见 store.test.js「文件损坏时备份并空表启动」），
// 断言 rejects 与 配置落盘备份路径矛盾，会让该用例永远红。

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStore } from '../lib/store.js'
import { TodoError } from '../lib/model.js'

async function make(fileBody = null, expectBrokenLoad = false) {
  const dir = await mkdtemp(join(tmpdir(), 'todo-notes-'))
  const file = join(dir, 'todos.json')
  if (fileBody !== null) await writeFile(file, fileBody, 'utf8')
  const store = createStore({ file })
  const load = store.load()
  if (expectBrokenLoad) await assert.rejects(() => load, () => true) // 损坏 JSON：load 必然拒绝
  else await load
  return { store, file, dir, async clean() { await store.close(); await rm(dir, { recursive: true, force: true }) } }
}

test('老数据没有 notes 字段：load 后便签为空数组，todos 照常可用', async () => {
  const a = await make()
  try {
    assert.deepEqual((await a.store.notesList()).items, [])
    const todo = await a.store.create({ title: '待办' })
    assert.equal((await a.store.list({})).items.length, 1)
    assert.ok(todo.id.startsWith('t_'))
  } finally { await a.clean() }
})

test('notes 非数组（手改坏了）回退空数组，不崩', async () => {
  const note = { id: 'n_1', text: 'x', createdAt: '2026-11-01T00:00:00.000Z' }
  const buggy = await make(JSON.stringify({ version: 1, todos: [], notes: { bad: true } }))
  try {
    assert.deepEqual((await buggy.store.notesList()).items, [])
    // 修好后写回正常值能被读取
    const added = await buggy.store.noteAdd({ text: '正常新增' })
    assert.equal(added.text, '正常新增')
  } finally { await buggy.clean() }
})

test('noteAdd：trim、ISO 时间戳、n_ 前缀 id；空文本与超长报 invalid-input', async () => {
  const a = await make()
  try {
    const item = await a.store.noteAdd({ text: '  周五带门禁卡  ' })
    assert.equal(item.text, '周五带门禁卡')
    assert.ok(item.id.startsWith('n_'))
    assert.ok(!Number.isNaN(Date.parse(item.createdAt)))
    assert.equal(item.updatedAt, item.createdAt)
    await assert.rejects(() => a.store.noteAdd({ text: '   ' }),
      (e) => e instanceof TodoError && e.code === 'invalid-input' && /不能为空/.test(e.message))
    await assert.rejects(() => a.store.noteAdd({ text: '字'.repeat(501) }),
      (e) => e.code === 'invalid-input' && /500/.test(e.message))
  } finally { await a.clean() }
})

test('notesList 按 createdAt 倒序，且不影响 todos', async () => {
  const a = await make()
  try {
    await a.store.noteAdd({ text: '第一条' })
    await new Promise((r) => setTimeout(r, 5))
    await a.store.noteAdd({ text: '第二条' })
    const items = (await a.store.notesList()).items
    assert.deepEqual(items.map((n) => n.text), ['第二条', '第一条'])
    await a.store.create({ title: '别混进来' })
    const listed = await a.store.list({})
    assert.equal(listed.items.length, 1)
    assert.equal(listed.items[0].title, '别混进来')
  } finally { await a.clean() }
})

test('noteUpdate 改文本与 updatedAt；未知 id 报 not-found', async () => {
  const a = await make()
  try {
    const item = await a.store.noteAdd({ text: '旧' })
    await new Promise((r) => setTimeout(r, 5))
    const next = await a.store.noteUpdate({ id: item.id, text: '新' })
    assert.equal(next.text, '新')
    assert.ok(next.updatedAt > item.updatedAt)
    await assert.rejects(() => a.store.noteUpdate({ id: 'ghost', text: 'x' }), (e) => e.code === 'not-found')
  } finally { await a.clean() }
})

test('noteRemove 删除并落盘；未知 id 报 not-found', async () => {
  const a = await make()
  try {
    const item = await a.store.noteAdd({ text: '删我' })
    assert.deepEqual(await a.store.noteRemove({ id: item.id }), { id: item.id })
    assert.deepEqual((await a.store.notesList()).items, [])
    await assert.rejects(() => a.store.noteRemove({ id: 'ghost' }), (e) => e.code === 'not-found')
  } finally { await a.clean() }
})

test('persist 落盘包含 notes；第二个 store 打开同一文件能读到', async () => {
  const a = await make()
  try {
    const item = await a.store.noteAdd({ text: '跨实例' })
    await a.store.close()
    const raw = await readFile(a.file, 'utf8')
    const doc = JSON.parse(raw)
    assert.equal(doc.version, 1)
    assert.deepEqual(doc.notes.map((n) => n.id), [item.id])

    const dir = await mkdtemp(join(tmpdir(), 'todo-notes2-'))
    const second = createStore({ file: a.file })
    try {
      await second.load()
      const items = (await second.notesList()).items
      assert.equal(items.length, 1)
      assert.equal(items[0].text, '跨实例')
    } finally { await second.close(); await rm(dir, { recursive: true, force: true }) }
  } finally { await a.clean() }
})

test('损坏文件照旧走备份路径（notes 无从谈起，不新增崩溃面）', async () => {
  const broken = await make('{ this is not json')
  try {
    // corrupt 分支：readDoc 失败 → 空清单 + corrupt notice；load 按备份路径 resolve；这里主要保证 CRUD 仍可用
    const item = await broken.store.noteAdd({ text: '废墟上重建' })
    assert.equal(item.text, '废墟上重建')
  } finally { await broken.clean() }
})

test('notesList 返回项是拷贝：就地篡改不污染 store 内存与落盘', async () => {
  const a = await make()
  try {
    await a.store.noteAdd({ text: '不该被污染' })
    const first = (await a.store.notesList()).items[0]
    first.text = '内存篡改'
    first.updatedAt = '1999-01-01T00:00:00.000Z'
    const again = (await a.store.notesList()).items
    assert.equal(again.length, 1)
    assert.equal(again[0].text, '不该被污染')
    assert.ok(again[0].updatedAt !== '1999-01-01T00:00:00.000Z')
    // 篡改后再触发一次写操作重落盘：盘上的 notes 也不能出现篡改值
    await a.store.noteAdd({ text: '触发落盘' })
    await a.store.close()
    const doc = JSON.parse(await readFile(a.file, 'utf8'))
    assert.deepEqual(doc.notes.map((n) => n.text), ['不该被污染', '触发落盘'])
    assert.ok(doc.notes.every((n) => n.updatedAt !== '1999-01-01T00:00:00.000Z'))
  } finally { await a.clean() }
})
