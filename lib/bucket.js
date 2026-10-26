/** Pure bucketing and ordering for todo records. No IO, no host services. */

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 }

/** Local calendar key `YYYY-MM-DD`. */
export function dateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Shift a `YYYY-MM-DD` key by whole days. */
export function shiftKey(key, days) {
  const [y, m, d] = key.split('-').map(Number)
  const at = new Date(y, m - 1, d)
  at.setDate(at.getDate() + days)
  return dateKey(at)
}

function daysSince(iso, now) {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return 0
  return Math.floor((now.getTime() - then) / 86400000)
}

/** Bucket of one record relative to `now`: overdue|today|tomorrow|week|later|stale|unplanned|done. */
export function bucketOf(todo, now = new Date(), staleDays = 7) {
  if (todo.done) return 'done'
  const today = dateKey(now)
  const due = todo.dueDate
  if (typeof due === 'string' && due !== '') {
    if (due < today) return 'overdue'
    if (due === today) return 'today'
    if (due === shiftKey(today, 1)) return 'tomorrow'
    const weekEnd = shiftKey(today, (7 - now.getDay()) % 7)
    if (due <= weekEnd) return 'week'
    // 定了未来日期的任务有明确归属，不算「搁置太久」的积压。
    return 'later'
  }
  if (daysSince(todo.createdAt, now) > staleDays) return 'stale'
  return 'unplanned'
}

/** Due date+time first, then priority, then newest created. */
export function compareTodos(a, b) {
  const ak = a.dueDate ? `${a.dueDate} ${a.dueTime ?? '99:99'}` : null
  const bk = b.dueDate ? `${b.dueDate} ${b.dueTime ?? '99:99'}` : null
  if (ak !== null && bk !== null) {
    const byDue = ak.localeCompare(bk)
    if (byDue !== 0) return byDue
  } else if (ak !== null) return -1
  else if (bk !== null) return 1

  const ap = PRIORITY_RANK[a.priority] ?? 3
  const bp = PRIORITY_RANK[b.priority] ?? 3
  if (ap !== bp) return ap - bp

  return String(b.createdAt).localeCompare(String(a.createdAt))
}

/** Counts per bucket, plus how many finished today. */
export function summarize(items, now = new Date()) {
  const out = { overdue: 0, today: 0, tomorrow: 0, week: 0, later: 0, stale: 0, unplanned: 0, doneToday: 0 }
  const today = dateKey(now)
  for (const item of items) {
    if (item.bucket === 'done') {
      if (item.doneAt && dateKey(new Date(item.doneAt)) === today) out.doneToday += 1
      continue
    }
    if (Object.hasOwn(out, item.bucket)) out[item.bucket] += 1
  }
  return out
}
