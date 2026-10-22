/** File-backed todo store: one JSON document, serialized atomic writes. */

import { readFile, writeFile, rename, mkdir, copyFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { bucketOf, compareTodos, summarize } from './bucket.js'
import { TodoError, normalizeCreate, applyPatch } from './model.js'

const EMPTY = { version: 1, todos: [] }

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
  const state = { todos: [], corrupt: false }
  let queue = Promise.resolve()
  let closed = false

  const withBucket = (todo) => ({ ...todo, bucket: bucketOf(todo, new Date(), staleDays) })

  async function persist() {
    const snapshot = JSON.stringify({ version: 1, todos: state.todos }, null, 2)
    queue = queue.then(async () => {
      await mkdir(dirname(file), { recursive: true })
      const tmp = `${file}.tmp`
      await writeFile(tmp, snapshot, 'utf8')
      await rename(tmp, file)
    })
    return queue
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
      if (corrupt) {
        const backup = `${file.replace(/\.json$/, '')}.corrupt-${Date.now()}.json`
        try {
          await copyFile(file, backup)
        } catch {}
        await persist()
      }
      return { corrupt }
    },

    async list(filter = {}) {
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
      return {
        items,
        summary: summarize(items, now),
        notices: state.corrupt ? ['corrupt'] : [],
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

    async complete(id, done = true) {
      const index = state.todos.findIndex((t) => t.id === id)
      if (index === -1) throw new TodoError('not-found', '这条待办已经不在了')
      const finished = done !== false
      const next = {
        ...state.todos[index],
        done: finished,
        doneAt: finished ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
      }
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
