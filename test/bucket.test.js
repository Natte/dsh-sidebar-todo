import test from 'node:test'
import assert from 'node:assert/strict'
import { dateKey, shiftKey, bucketOf, compareTodos, summarize } from '../lib/bucket.js'

const NOW = new Date(2026, 9, 22, 10, 0, 0) // 2026-10-22 周四

const base = {
  id: 't1', title: 'x', note: '', priority: null, category: null,
  dueDate: null, dueTime: null, done: false, doneAt: null,
  createdAt: new Date(2026, 9, 21, 9).toISOString(),
  updatedAt: new Date(2026, 9, 21, 9).toISOString(),
}

test('dateKey 用本地日期', () => {
  assert.equal(dateKey(NOW), '2026-10-22')
})

test('shiftKey 跨月', () => {
  assert.equal(shiftKey('2026-10-31', 1), '2026-11-01')
  assert.equal(shiftKey('2026-11-01', -1), '2026-10-31')
})

test('截止今天与过期的都进 today', () => {
  assert.equal(bucketOf({ ...base, dueDate: '2026-10-22' }, NOW), 'today')
  assert.equal(bucketOf({ ...base, dueDate: '2026-10-20' }, NOW), 'today')
})

test('明天、本周分桶；本周之后的日期归 later', () => {
  assert.equal(bucketOf({ ...base, dueDate: '2026-10-23' }, NOW), 'tomorrow')
  assert.equal(bucketOf({ ...base, dueDate: '2026-10-25' }, NOW), 'week')
  // 有日期就不再按创建时长判断：周一（10-26）已出本周，归 later。
  assert.equal(bucketOf({ ...base, dueDate: '2026-10-26' }, NOW), 'later')
})

test('本周之后的有日期任务进 later，不进 unplanned', () => {
  const out = bucketOf({ ...base, dueDate: '2026-10-28' }, NOW) // NOW = 2026-10-22 周四
  assert.equal(out, 'later')
})

// v1 里这条断言 stale（「远期截止 + 创建 10 天」），现在语义变了：有日期就不算积压。
test('有未来日期但创建已久，仍然不是积压', () => {
  const old = new Date(2026, 9, 10, 9).toISOString()
  assert.equal(bucketOf({ ...base, createdAt: old, dueDate: '2026-12-01' }, NOW, 7), 'later')
})

test('无截止：7 天内未排期，超过进积压', () => {
  assert.equal(bucketOf({ ...base }, NOW, 7), 'unplanned')
  const old = new Date(2026, 9, 10, 9).toISOString()
  assert.equal(bucketOf({ ...base, createdAt: old }, NOW, 7), 'stale')
})

test('无日期且创建已久才是积压', () => {
  const old = new Date(2026, 9, 10, 9).toISOString()
  assert.equal(bucketOf({ ...base, createdAt: old }, NOW, 7), 'stale')
})

test('已完成不参与未完成分桶', () => {
  assert.equal(bucketOf({ ...base, done: true, dueDate: '2026-10-22' }, NOW), 'done')
})

test('排序：先按截止时间，再按优先级，再按创建时间倒序', () => {
  const a = { ...base, id: 'a', dueDate: '2026-10-23' }
  const b = { ...base, id: 'b', dueDate: '2026-10-22', dueTime: '18:00' }
  const c = { ...base, id: 'c', dueDate: '2026-10-22', dueTime: '09:00' }
  assert.deepEqual([a, b, c].sort(compareTodos).map((t) => t.id), ['c', 'b', 'a'])

  const high = { ...base, id: 'h', priority: 'high' }
  const low = { ...base, id: 'l', priority: 'low' }
  assert.deepEqual([low, high].sort(compareTodos).map((t) => t.id), ['h', 'l'])
})

test('摘要按 bucket 计数', () => {
  const items = [
    { bucket: 'today' }, { bucket: 'today' }, { bucket: 'stale' },
    { bucket: 'done', doneAt: new Date(2026, 9, 22, 8).toISOString() },
  ]
  // now 必须显式传入，否则 doneToday 依赖跑测试当天是不是 2026-10-22
  assert.deepEqual(summarize(items, NOW), {
    today: 2, tomorrow: 0, week: 0, later: 0, stale: 1, unplanned: 0, doneToday: 1,
  })
})
