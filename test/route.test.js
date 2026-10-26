import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../index.js'

/** 最小 fake ctx：立即执行 effect，收集 web/tool/store 的清理函数。 */
async function makeApp(connection = { requestRejection: () => undefined }) {
  const dir = await mkdtemp(join(tmpdir(), 'todo-route-'))
  const dataPath = join(dir, 'todos.json')
  const disposers = []
  let handler = null
  const ctx = {
    effect(fn) {
      const dispose = fn()
      disposers.push(() => (typeof dispose === 'function' ? dispose() : undefined))
    },
    webServer: {
      register(route) {
        handler = route.handler
        return () => {}
      },
    },
    connection,
    tools: { register: () => () => {} },
  }
  apply(ctx, { dataPath })
  return {
    dataPath,
    handler: () => handler,
    async close() {
      for (const dispose of disposers.reverse()) await dispose()
      await rm(dir, { recursive: true, force: true })
    },
  }
}

function makeReq({ method = 'POST', url = '/todo/api/list', body } = {}) {
  return {
    method,
    url,
    async *[Symbol.asyncIterator]() {
      if (body !== undefined && body !== null) yield Buffer.from(body)
    },
  }
}

function makeRes() {
  const out = { status: 0, body: '', headers: {} }
  return {
    out,
    writeHead(status, headers) {
      out.status = status
      out.headers = headers ?? {}
    },
    end(text) {
      out.body = text
    },
  }
}

/** 跑一次真实 handler，返回状态码与解析后的 JSON。 */
async function call(app, options) {
  const res = makeRes()
  await app.handler()(makeReq(options), res)
  return {
    status: res.out.status,
    headers: res.out.headers,
    payload: res.out.body === '' ? null : JSON.parse(res.out.body),
  }
}

test('POST /todo/api/list 返回 200 与空列表', async () => {
  const app = await makeApp()
  try {
    const res = await call(app, { body: '{}' })
    assert.equal(res.status, 200)
    assert.equal(res.payload.ok, true)
    assert.deepEqual(res.payload.result.items, [])
    assert.deepEqual(res.payload.result.notices, [])
    assert.equal(res.payload.result.staleDays, 7)
    assert.match(res.headers['content-type'], /application\/json/)
  } finally {
    await app.close()
  }
})

test('非 POST 请求返回 405', async () => {
  const app = await makeApp()
  try {
    const res = await call(app, { method: 'GET' })
    assert.equal(res.status, 405)
    assert.equal(res.payload.ok, false)
    assert.equal(res.payload.error.code, 'method')
  } finally {
    await app.close()
  }
})

test('未知接口与非法路径形态返回 404', async () => {
  const app = await makeApp()
  try {
    for (const url of ['/todo/api/nope', '/todo/api/', '/todo/api/a/b']) {
      const res = await call(app, { url, body: '{}' })
      assert.equal(res.status, 404, url)
      assert.equal(res.payload.error.code, 'not-found', url)
    }
  } finally {
    await app.close()
  }
})

test('原型链上的名字不能被当成接口方法（constructor → 404）', async () => {
  const app = await makeApp()
  try {
    for (const name of ['constructor', 'toString', 'hasOwnProperty']) {
      const res = await call(app, { url: `/todo/api/${name}`, body: '{}' })
      assert.equal(res.status, 404, name)
      assert.equal(res.payload.error.code, 'not-found', name)
    }
  } finally {
    await app.close()
  }
})

test('requestRejection 命中时返回 403，且不执行接口', async () => {
  const app = await makeApp({ requestRejection: () => 'denied' })
  try {
    const res = await call(app, { body: JSON.stringify({ title: '不该被创建' }) })
    assert.equal(res.status, 403)
    assert.equal(res.payload.ok, false)
    assert.equal(res.payload.error.code, 'forbidden')
  } finally {
    await app.close()
  }
})

test('请求体不是 JSON 时按空对象处理，不崩', async () => {
  const app = await makeApp()
  try {
    const res = await call(app, { body: 'not json' })
    assert.equal(res.status, 200)
    assert.deepEqual(res.payload.result.items, [])
  } finally {
    await app.close()
  }
})

test('create 后 list 能读到（ready 生命周期与 store 接线）', async () => {
  const app = await makeApp()
  try {
    const created = await call(app, {
      url: '/todo/api/create',
      body: JSON.stringify({ title: '从路由新建', priority: 'high' }),
    })
    assert.equal(created.status, 200)
    assert.equal(created.payload.ok, true)
    assert.ok(created.payload.result.id)

    const listed = await call(app, { body: '' })
    assert.equal(listed.status, 200)
    assert.equal(listed.payload.result.items.length, 1)
    assert.equal(listed.payload.result.items[0].id, created.payload.result.id)
    assert.equal(listed.payload.result.items[0].title, '从路由新建')
    assert.equal(listed.payload.result.items[0].bucket, 'unplanned')
  } finally {
    await app.close()
  }
})

test('写盘失败时路由返回 500 且 error.code 为 io-error', async () => {
  const app = await makeApp()
  try {
    // 把原子写的临时文件路径占成目录，writeFile 必然失败。
    await mkdir(`${app.dataPath}.tmp`)
    const res = await call(app, {
      url: '/todo/api/create',
      body: JSON.stringify({ title: '写不进去' }),
    })
    assert.equal(res.status, 500)
    assert.equal(res.payload.ok, false)
    assert.equal(res.payload.error.code, 'io-error')
  } finally {
    await app.close()
  }
})

test('业务校验失败按 invalid-input 映射成 400', async () => {
  const app = await makeApp()
  try {
    const res = await call(app, {
      url: '/todo/api/create',
      body: JSON.stringify({ title: '   ' }),
    })
    assert.equal(res.status, 400)
    assert.equal(res.payload.error.code, 'invalid-input')
  } finally {
    await app.close()
  }
})
