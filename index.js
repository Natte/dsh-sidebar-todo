/** Host half of the todo bundle: data file, HTTP route, agent tool. */

import { createStore, resolveDataFile } from './lib/store.js'
import { createApi } from './lib/api.js'
import { createTool } from './lib/tool.js'

export const inject = ['webServer', 'connection', 'tools']

const PREFIX = '/todo/api/'
const STATUS = { 'invalid-input': 400, 'not-found': 404, 'io-error': 500 }

function writeJson(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(text)
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return {}
  }
}

export function apply(ctx, config = {}) {
  // config.dataPath: 可选，覆盖默认数据文件（默认 %DSH_PROFILE_DIR%/data/dsh-todolist/todos.json）。
  // config.staleDays: 超过多少天未完成的待办算「积压」，默认 7 天。
  const store = createStore({
    file: resolveDataFile(config.dataPath),
    staleDays: Number.isInteger(config.staleDays) ? config.staleDays : 7,
  })
  const ready = store.load()
  void ready.catch(() => {}) // 不让 load 失败变成未处理拒绝；错误仍由 await ready 的调用方拿到
  const api = createApi(store)

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/todo/api',
    handler: async (req, res) => {
      if (ctx.connection.requestRejection(req) !== undefined) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } })
        return
      }
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: '只支持 POST' } })
        return
      }
      const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
      const method = pathname.startsWith(PREFIX) ? pathname.slice(PREFIX.length) : ''
      if (method === '' || method.includes('/') || !Object.hasOwn(api, method)) {
        writeJson(res, 404, { ok: false, error: { code: 'not-found', message: '未知接口' } })
        return
      }
      try {
        await ready
        const body = await readJson(req)
        const result = await api[method](body)
        writeJson(res, 200, { ok: true, result })
      } catch (err) {
        const code = err?.code ?? 'internal'
        writeJson(res, STATUS[code] ?? 500, {
          ok: false,
          error: { code, message: err?.message ?? '待办操作失败' },
        })
      }
    },
  }), 'dsh-todolist: http')

  ctx.effect(() => ctx.tools.register(createTool(api, ready)), 'dsh-todolist: tool')

  ctx.effect(() => () => { void store.close() }, 'dsh-todolist: store')
}
