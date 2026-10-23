/** Record validation and normalization for todo entries. */

import { normalizeRepeat } from './repeat.js'

export class TodoError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'TodoError'
    this.code = code
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/
const PRIORITIES = new Set(['high', 'medium', 'low'])

export function newId() {
  const rand = Math.random().toString(36).slice(2, 6)
  return `t_${Date.now().toString(36)}_${rand}`
}

function asRecord(value) {
  if (value === undefined) return {}
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TodoError('invalid-input', '待办数据必须是对象')
  }
  return value
}

function text(value, max, field) {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw new TodoError('invalid-input', `${field} 必须是文本`)
  const out = value.trim()
  if (out.length > max) throw new TodoError('invalid-input', `${field} 过长（上限 ${max} 字）`)
  return out
}

function nullableText(value, max, field) {
  if (value === undefined || value === null || value === '') return null
  return text(value, max, field)
}

function pickPriority(value) {
  if (value === undefined || value === null || value === '') return null
  if (!PRIORITIES.has(value)) throw new TodoError('invalid-input', '优先级只能是 high / medium / low')
  return value
}

function pickDate(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !DATE_RE.test(value)) throw new TodoError('invalid-input', '截止日期格式应为 YYYY-MM-DD')
  return value
}

function pickTime(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !TIME_RE.test(value)) throw new TodoError('invalid-input', '截止时间格式应为 HH:mm')
  return value
}

function pickRepeat(value) {
  try {
    return normalizeRepeat(value)
  } catch (err) {
    throw new TodoError('invalid-input', err.message)
  }
}

export function normalizeCreate(input) {
  const source = asRecord(input)
  const title = text(source.title, 200, '标题')
  if (title === '') throw new TodoError('invalid-input', '标题不能为空')
  const now = new Date().toISOString()
  return {
    id: newId(),
    title,
    note: text(source.note, 2000, '备注'),
    priority: pickPriority(source.priority),
    category: nullableText(source.category, 24, '分类'),
    dueDate: pickDate(source.dueDate),
    dueTime: pickTime(source.dueTime),
    done: false,
    repeat: pickRepeat(source.repeat),
    completions: {},
    doneAt: null,
    doneBy: null,
    verifiedAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

const PATCHABLE = new Set(['title', 'note', 'priority', 'category', 'dueDate', 'dueTime', 'repeat'])

export function applyPatch(todo, patch) {
  const source = asRecord(patch)
  const next = { ...todo }
  for (const key of Object.keys(source)) {
    if (!PATCHABLE.has(key)) continue
    if (key === 'title') {
      const value = text(source.title, 200, '标题')
      if (value === '') throw new TodoError('invalid-input', '标题不能为空')
      next.title = value
    } else if (key === 'note') next.note = text(source.note, 2000, '备注')
    else if (key === 'priority') next.priority = pickPriority(source.priority)
    else if (key === 'category') next.category = nullableText(source.category, 24, '分类')
    else if (key === 'dueDate') next.dueDate = pickDate(source.dueDate)
    else if (key === 'dueTime') next.dueTime = pickTime(source.dueTime)
    else if (key === 'repeat') next.repeat = pickRepeat(source.repeat)
  }
  next.updatedAt = new Date().toISOString()
  return next
}
