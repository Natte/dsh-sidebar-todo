import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStore } from '../lib/store.js'
import { createApi } from '../lib/api.js'
import { apply } from '../index.js'
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

test('数据文件损坏且无法备份时，插件激活不产生未处理拒绝，路由与工具都返回 io-error', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'todo-api-'))
  const file = join(dir, 'todos.json')
  await writeFile(file, '{ this is not json', 'utf8')

  const realNow = Date.now
  const fixed = realNow()
  Date.now = () => fixed
  const effects = []
  let handler = null
  let tool = null
  const unhandled = []
  const onUnhandled = (reason) => { unhandled.push(reason) }
  process.on('unhandledRejection', onUnhandled)
  try {
    // 备份路径是 todos.corrupt-<Date.now()>.json；先占成目录，copyFile 必然失败。
    await mkdir(join(dir, `todos.corrupt-${fixed}.json`))
    apply({
      effect(fn) { effects.push(fn()) },
      webServer: { register(route) { handler = route.handler; return () => {} } },
      connection: { requestRejection: () => undefined },
      tools: { register(created) { tool = created; return () => {} } },
    }, { dataPath: file })

    // load 的拒绝就发生在这 100ms 内；修复前它没人观察，会变成 unhandledRejection。
    await new Promise((resolve) => setTimeout(resolve, 100))
    assert.deepEqual(unhandled, [], 'ready 的拒绝必须被观察，不能变成未处理拒绝')

    await assert.rejects(
      () => tool.execute({ action: 'list' }, {}),
      (err) => err instanceof TodoError && err.code === 'io-error',
      '工具应把 load 失败按 io-error 抛给调用方',
    )

    const res = {
      status: 0,
      payload: '',
      writeHead(status) { this.status = status },
      end(chunk) { this.payload = String(chunk ?? '') },
    }
    await handler({ method: 'POST', url: '/todo/api/list', async *[Symbol.asyncIterator]() {} }, res)
    assert.equal(res.status, 500)
    assert.equal(JSON.parse(res.payload).error.code, 'io-error')
  } finally {
    Date.now = realNow
    process.off('unhandledRejection', onUnhandled)
    for (const cleanup of effects) {
      if (typeof cleanup === 'function') await cleanup()
    }
    await rm(dir, { recursive: true, force: true })
  }
})

test('retry 走 api 分发，list 带回 staleDays', async () => {
  const { api, store } = await makeApi()
  await api.create({ title: 'a' })
  assert.deepEqual(await api.retry({}), { ok: true })
  const listed = await api.list({})
  assert.equal(listed.staleDays, 7)
  await store.close()
})

test('分类三个方法可分发', async () => {
  const { api, store } = await makeApi()
  await api.create({ title: 'a', category: '工作' })
  assert.deepEqual(api.categories().items, [{ name: '工作', count: 1 }])
  await api.renameCategory({ from: '工作', to: '事业' })
  assert.deepEqual(api.categories().items, [{ name: '事业', count: 1 }])
  await api.clearCategory({ name: '事业' })
  assert.deepEqual(api.categories().items, [])
  await store.close()
})
