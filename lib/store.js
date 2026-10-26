/** File-backed todo store: one JSON document, serialized atomic writes. */

import { readFile, writeFile, rename, mkdir, copyFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { bucketOf, compareTodos, summarize, dateKey, shiftKey } from './bucket.js'
import { nextOccurrence, occurrencesBetween, periodOccurrence, isDueOn } from './repeat.js'
import { TodoError, normalizeCreate, applyPatch } from './model.js'

const EMPTY = { version: 1, todos: [] }
const CORRUPT_UNBACKUPED = '数据文件损坏且无法备份，已停止写入以保护原文件'
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

/** 合法的 YYYY-MM-DD 日历日；用 shiftKey 回写可顺手拒绝 2026-13-01、2026-02-30 这类格式对但不存在的日期。 */
function isDayKey(value) {
  return typeof value === 'string' && DATE_KEY_RE.test(value) && shiftKey(value, 0) === value
}

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

  /** 下一次未完成的循环实例；全部完成后返回 null。 */
  function nextOpenOccurrence(todo, fromKey) {
    let due = nextOccurrence(todo, fromKey)
    while (due !== null && todo.completions?.[due]) {
      due = nextOccurrence(todo, shiftKey(due, 1))
    }
    return due
  }

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
      const today = dateKey(now)
      // 循环任务只在当前周期（天/周/月）内还有发生实例时进入列表；完成本次后
      // 整行消失，直到下一个周期再出现。日历 occurrences() 不经过这里，仍然展开全部实例。
      let items = state.todos.map((todo) => {
        const isRepeating = Boolean(todo.repeat)
        if (!isRepeating) {
          return { ...todo, isRepeating, nextDue: todo.dueDate, bucket: bucketOf(todo, now, staleDays) }
        }
        const outstanding = periodOccurrence(todo, today, todo.completions ?? {})
        if (outstanding === null) return null
        const shaped = { ...todo, dueDate: outstanding, done: false }
        return {
          ...shaped,
          isRepeating,
          nextDue: nextOpenOccurrence(todo, today),
          completions: todo.completions ?? {},
          bucket: bucketOf(shaped, now, staleDays),
        }
      }).filter(Boolean)
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

    /** 展开 [from, to] 内的所有实例；单次任务只有 dueDate 当天。 */
    async occurrences({ from, to } = {}) {
      if (typeof from !== 'string' || typeof to !== 'string') {
        throw new TodoError('invalid-input', 'from 与 to 必填')
      }
      const items = []
      for (const todo of state.todos) {
        for (const date of occurrencesBetween(todo, from, to)) {
          items.push({
            todoId: todo.id,
            date,
            title: todo.title,
            priority: todo.priority,
            category: todo.category,
            done: todo.repeat
              ? Boolean(todo.completions?.[date])
              : Boolean(todo.done && todo.dueDate === date),
            repeat: todo.repeat,
          })
        }
      }
      items.sort((a, b) => (a.date === b.date ? a.title.localeCompare(b.title) : a.date.localeCompare(b.date)))
      return { items }
    },

    /** 所有用到的分类，按使用量降序、同量按名称排序。 */
    categories() {
      const counts = new Map()
      for (const todo of state.todos) {
        if (typeof todo.category !== 'string' || todo.category === '') continue
        counts.set(todo.category, (counts.get(todo.category) ?? 0) + 1)
      }
      const items = [...counts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name))
      return { items }
    },

    /** 把一个分类改名；目标分类已存在时合并。返回受影响条数。 */
    async renameCategory(from, to) {
      const target = typeof to === 'string' ? to.trim() : ''
      if (target === '') throw new TodoError('invalid-input', '分类名不能为空')
      if (target.length > 24) throw new TodoError('invalid-input', '分类名过长（上限 24 字）')
      if (typeof from !== 'string' || from === '') throw new TodoError('invalid-input', '原分类名必填')
      let moved = 0
      const now = new Date().toISOString()
      state.todos = state.todos.map((todo) => {
        if (todo.category !== from) return todo
        moved += 1
        return { ...todo, category: target, updatedAt: now }
      })
      if (moved > 0) await guard(persist)
      return { moved, name: target }
    },

    /** 删掉一个分类：已有待办回到无分类。返回受影响条数。 */
    async clearCategory(name) {
      if (typeof name !== 'string' || name === '') throw new TodoError('invalid-input', '分类名必填')
      let cleared = 0
      const now = new Date().toISOString()
      state.todos = state.todos.map((todo) => {
        if (todo.category !== name) return todo
        cleared += 1
        return { ...todo, category: null, updatedAt: now }
      })
      if (cleared > 0) await guard(persist)
      return { cleared }
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

    async complete(id, done = true, by = 'user', date) {
      if (typeof done !== 'boolean') throw new TodoError('invalid-input', 'done 必须是布尔值')
      const index = state.todos.findIndex((t) => t.id === id)
      if (index === -1) throw new TodoError('not-found', '这条待办已经不在了')
      const current = state.todos[index]
      const finished = done !== false
      const now = new Date().toISOString()

      if (current.repeat) {
        if (typeof by !== 'string' || by === '') throw new TodoError('invalid-input', 'by 必须是 user 或 agent')
        const explicit = date !== undefined && date !== null && date !== ''
        const day = explicit ? date : dateKey(new Date())
        if (!isDayKey(day)) throw new TodoError('invalid-input', '日期格式应为 YYYY-MM-DD')
        if (!isDueOn(current, day)) throw new TodoError('invalid-input', `${day} 不是这条循环任务的发生日`)
        const completions = { ...(current.completions ?? {}) }
        if (finished) completions[day] = now
        else delete completions[day]
        const next = { ...current, completions, updatedAt: now }
        state.todos[index] = next
        await guard(persist)
        return withBucket(next)
      }

      if (current.done === done) return withBucket(current)
      const byAgent = by === 'agent'
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
