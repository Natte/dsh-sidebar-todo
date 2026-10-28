/** Pure recurrence expansion: no IO, no host services. */

const MAX_SPAN_DAYS = 400
const FREQS = new Set(['daily', 'weekly', 'monthly'])

/** Local date key helpers kept in-module so the client never imports this. */
function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function keyOf(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function shift(key, days) {
  const at = parseKey(key)
  at.setDate(at.getDate() + days)
  return keyOf(at)
}

function diffDays(fromKey, toKey) {
  return Math.round((parseKey(toKey) - parseKey(fromKey)) / 86400000)
}

/** ISO weekday: Monday=1 … Sunday=7. */
function isoWeekday(date) {
  return date.getDay() === 0 ? 7 : date.getDay()
}

/** Validate a repeat rule; throws with a short English reason. */
export function normalizeRepeat(input) {
  if (input === undefined || input === null) return null
  if (typeof input !== 'object') throw new Error('repeat 必须是对象')
  const freq = input.freq
  if (!FREQS.has(freq)) throw new Error('repeat.freq 只能是 daily / weekly / monthly')

  const out = { freq, interval: 1, until: null }
  if (input.until) {
    if (typeof input.until !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.until)) {
      throw new Error('repeat.until 必须是 YYYY-MM-DD')
    }
    out.until = input.until
  }

  if (freq === 'weekly') {
    const days = input.weekdays
    if (!Array.isArray(days) || days.length === 0) throw new Error('weekdays 不能为空')
    for (const day of days) {
      if (!Number.isInteger(day) || day < 1 || day > 7) throw new Error('weekdays 只能是 1-7')
    }
    out.weekdays = [...new Set(days)].sort((a, b) => a - b)
  }

  if (freq === 'monthly') {
    const day = input.monthDay
    if (!Number.isInteger(day) || day < 1 || day > 31) throw new Error('monthDay 只能是 1-31')
    out.monthDay = day
  }

  return out
}

/** Whether this todo occurs on `dateKey` (start inclusive, until inclusive). */
export function isDueOn(todo, dateKey) {
  const start = todo.dueDate
  if (!start) return false
  if (dateKey < start) return false
  const repeat = todo.repeat
  if (!repeat) return dateKey === start
  if (repeat.until && dateKey > repeat.until) return false

  const date = parseKey(dateKey)
  if (repeat.freq === 'daily') return true
  if (repeat.freq === 'weekly') return (repeat.weekdays ?? []).includes(isoWeekday(date))
  if (repeat.freq === 'monthly') return date.getDate() === repeat.monthDay
  return false
}

/** 当前周期的起止日（按 freq 取天/周/月），用来判断本周期内是否已有完成记录。 */
export function periodRange(todo, dateKey) {
  const date = parseKey(dateKey)
  if (todo.repeat?.freq === 'weekly') {
    const iso = date.getDay() === 0 ? 7 : date.getDay()
    const from = shift(dateKey, 1 - iso)          // 本周一
    return { from, to: shift(from, 6) }           // 本周日
  }
  if (todo.repeat?.freq === 'monthly') {
    return {
      from: keyOf(new Date(date.getFullYear(), date.getMonth(), 1)),
      to: keyOf(new Date(date.getFullYear(), date.getMonth() + 1, 0)),
    }
  }
  return { from: dateKey, to: dateKey }
}

/** 当前周期（按 freq 取天/周/月）内的那个发生日；不在周期内或已过期返回 null。 */
export function periodOccurrence(todo, dateKey, completions = todo.completions ?? {}) {
  if (!todo.dueDate) return null
  const { from, to } = periodRange(todo, dateKey)
  // 周期起点早于任务起始日时，从起始日开始扫
  let cursor = from > todo.dueDate ? from : todo.dueDate
  while (cursor <= to) {
    if (isDueOn(todo, cursor) && completions[cursor] === undefined) return cursor
    cursor = shift(cursor, 1)
  }
  return null
}

/** First occurrence on or after `fromKey`, or null when the series ended. */
export function nextOccurrence(todo, fromKey) {
  const start = todo.dueDate
  if (!start) return null
  if (!todo.repeat) return start >= fromKey ? start : null
  const until = todo.repeat.until
  let cursor = fromKey > start ? fromKey : start
  for (let i = 0; i < MAX_SPAN_DAYS; i += 1) {
    if (until && cursor > until) return null
    if (isDueOn(todo, cursor)) return cursor
    cursor = shift(cursor, 1)
  }
  return null
}

/** All dates in [fromKey, toKey] where this todo occurs; capped at 400 days. */
export function occurrencesBetween(todo, fromKey, toKey) {
  const out = []
  const start = todo.dueDate
  if (!start || toKey < fromKey) return out
  const span = Math.min(diffDays(fromKey, toKey) + 1, MAX_SPAN_DAYS)
  let cursor = fromKey > start ? fromKey : start
  for (let i = 0; i < span; i += 1) {
    if (cursor > toKey) break
    if (isDueOn(todo, cursor)) out.push(cursor)
    cursor = shift(cursor, 1)
  }
  return out
}
