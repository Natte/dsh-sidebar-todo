/** File-backed todo store: one JSON document, serialized atomic writes. */

import { readFile, writeFile, rename, mkdir, copyFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { bucketOf, compareTodos, summarize } from './bucket.js'
import { TodoError, normalizeCreate, applyPatch } from './model.js'

const EMPTY = { version: 1, todos: [] }
const CORRUPT_UNBACKUPED = '数据文件损坏且无法备份，已停止写入以保护原文件'

async function readDoc(file) {
  let raw
  try {
    raw = await readFile(file, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return { doc: structuredClone(EMPTY), corrupt: false }
    throw new TodoError('io-error', `无法读取待办数据：${err.message}`)
  }
  try {
    const doc = JSON.parse(raw)
    if (!doc || !Array.isArray(doc.todos)) throw new Error('shape')
    return { doc, corrupt: false }
  } catch {
    return { doc: structuredClone(EMPTY), corrupt: true }
  }
}

export function createStore({ file, staleDays = 7 }) {
  const state = { todos: [], corrupt: false, sealed: false }
  let queue = Promise.resolve()
  let closed = false
  // 最近一次落盘失败的消息；成功写入后清空。UI 靠 list().notices 里的
  // 'write-error' 常驻提示，直到这里真的写成功（而不是读一次成功就消失）。
  let writeError = null

  const withBucket = (todo) => ({ ...todo, bucket: bucketOf(todo, new Date(), staleDays) })

  async function persist() {
    if (state.sealed) {
      writeError = CORRUPT_UNBACKUPED
      throw new TodoError('io-error', CORRUPT_UNBACKUPED)
    }
    const snapshot = JSON.stringify({ version: 1, todos: state.todos }, null, 2)
    const write = queue.then(async () => {
      await mkdir(dirname(file), { recursive: true })
      const tmp = `${file}.tmp`
      await writeFile(tmp, snapshot, 'utf8')
      await rename(tmp, file)
    })
    queue = write.catch(() => {})
    try {
      await write
      writeError = null
    } catch (err) {
      writeError = err.message
      throw err
    }
  }

  async function guard(fn) {
    try {
      return await fn()
    } catch (err) {
      if (err instanceof TodoError) throw err
      throw new TodoError('io-error', `待办数据写入失败：${err.message}`)
    }
  }

  return {
    async load() {
      const { doc, corrupt } = await readDoc(file)
      state.todos = doc.todos
      state.corrupt = corrupt
      state.sealed = false
      writeError = null
      if (!corrupt) return { corrupt }
      const backup = `${file.replace(/\.json$/, '')}.corrupt-${Date.now()}.json`
      try {
        await copyFile(file, backup)
      } catch {
        state.sealed = true
        throw new TodoError('io-error', CORRUPT_UNBACKUPED)
      }
      await guard(persist)
      return { corrupt }
    },

    async list(filter = {}) {
      if (filter === null || typeof filter !== 'object' || Array.isArray(filter)) {
        throw new TodoError('invalid-input', '过滤条件必须是对象')
      }
      const now = new Date()
      let items = state.todos.map((todo) => ({ ...todo, bucket: bucketOf(todo, now, staleDays) }))
      const view = filter.view
      if (view === 'today') items = items.filter((t) => t.bucket === 'today')
      else if (view === 'week') items = items.filter((t) => t.bucket === 'today' || t.bucket === 'tomorrow' || t.bucket === 'week')
      else if (view === 'stale') items = items.filter((t) => t.bucket === 'stale')
      else if (view === 'done') items = items.filter((t) => t.bucket === 'done')
      else if (view === 'open') items = items.filter((t) => t.bucket !== 'done')

      const q = typeof filter.q === 'string' ? filter.q.trim().toLowerCase() : ''
      if (q !== '') {
        items = items.filter((t) =>
          t.title.toLowerCase().includes(q) ||
          (t.note ?? '').toLowerCase().includes(q) ||
          (t.category ?? '').toLowerCase().includes(q))
      }
      items.sort(compareTodos)
      const notices = []
      if (state.corrupt) notices.push('corrupt')
      if (writeError !== null) notices.push('write-error')
      return {
        items,
        summary: summarize(items, now),
        notices,
        staleDays,
      }
    },

    async create(input) {
      const todo = normalizeCreate(input)
      state.todos.push(todo)
      await guard(persist)
      return withBucket(todo)
    },

    async update(id, patch) {
      const index = state.todos.findIndex((t) => t.id === id)
      if (index === -1) throw new TodoError('not-found', '这条待办已经不在了')
      const next = applyPatch(state.todos[index], patch)
      state.todos[index] = next
      await guard(persist)
      return withBucket(next)
    },

    async complete(id, done = true, by = 'user') {
      if (typeof done !== 'boolean') throw new TodoError('invalid-input', 'done 必须是布尔值')
      const index = state.todos.findIndex((t) => t.id === id)
      if (index === -1) throw new TodoError('not-found', '这条待办已经不在了')
      const current = state.todos[index]
      if (current.done === done) return withBucket(current)
      const finished = done !== false
      const byAgent = by === 'agent'
      const now = new Date().toISOString()
      const next = {
        ...current,
        done: finished,
        doneAt: finished ? now : null,
        doneBy: finished ? (byAgent ? 'agent' : 'user') : null,
        verifiedAt: finished && !byAgent ? now : null,
        updatedAt: now,
      }
      state.todos[index] = next
      await guard(persist)
      return withBucket(next)
    },

    async confirm(id) {
      const index = state.todos.findIndex((t) => t.id === id)
      if (index === -1) throw new TodoError('not-found', '这条待办已经不在了')
      const current = state.todos[index]
      if (current.done !== true || current.doneBy !== 'agent') {
        throw new TodoError('invalid-input', '这条待办不需要确认')
      }
      const now = new Date().toISOString()
      const next = { ...current, verifiedAt: now, updatedAt: now }
      state.todos[index] = next
      await guard(persist)
      return withBucket(next)
    },

    async remove(id) {
      const index = state.todos.findIndex((t) => t.id === id)
      if (index === -1) throw new TodoError('not-found', '这条待办已经不在了')
      state.todos.splice(index, 1)
      await guard(persist)
      return { id }
    },

    /** 写失败后把内存里的当前全量再落一次盘；成功即清掉 write-error。 */
    async retryPersist() {
      try {
        await persist()
        return { ok: true }
      } catch (err) {
        if (err instanceof TodoError) throw err
        throw new TodoError('io-error', `待办数据写入失败：${err.message}`)
      }
    },

    async close() {
      if (closed) return
      closed = true
      await queue
    },
  }
}

/** Default data file, resolved from the running profile. */
export function resolveDataFile(override) {
  if (typeof override === 'string' && override.trim() !== '') return override
  const base = process.env.DSH_PROFILE_DIR || process.cwd()
  return join(base, 'data', 'dsh-todolist', 'todos.json')
}
