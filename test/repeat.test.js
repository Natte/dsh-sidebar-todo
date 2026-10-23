import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeRepeat, isDueOn, nextOccurrence, occurrencesBetween } from '../lib/repeat.js'

const daily = { dueDate: '2026-10-22', repeat: { freq: 'daily', interval: 1 } }
const weekdays = { dueDate: '2026-10-19', repeat: { freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] } }
const weekly = { dueDate: '2026-10-23', repeat: { freq: 'weekly', interval: 1, weekdays: [5] } }
const monthly = { dueDate: '2026-01-31', repeat: { freq: 'monthly', interval: 1, monthDay: 31 } }

test('normalizeRepeat 校验', () => {
  assert.deepEqual(normalizeRepeat({ freq: 'daily' }), { freq: 'daily', interval: 1, until: null })
  assert.deepEqual(
    normalizeRepeat({ freq: 'weekly', weekdays: [1, 5] }),
    { freq: 'weekly', interval: 1, weekdays: [1, 5], until: null },
  )
  assert.throws(() => normalizeRepeat({ freq: 'weekly', weekdays: [] }), /weekdays/)
  assert.throws(() => normalizeRepeat({ freq: 'monthly', monthDay: 32 }), /monthDay/)
  assert.throws(() => normalizeRepeat({ freq: 'hourly' }), /freq/)
  assert.equal(normalizeRepeat(null), null)
})

test('daily 从起始日开始，起始日之前不发生', () => {
  assert.equal(isDueOn(daily, '2026-10-21'), false)
  assert.equal(isDueOn(daily, '2026-10-22'), true)
  assert.equal(isDueOn(daily, '2026-10-25'), true)
})

test('每周一到五：周末不发生', () => {
  assert.equal(isDueOn(weekdays, '2026-10-19'), true)   // 周一
  assert.equal(isDueOn(weekdays, '2026-10-23'), true)   // 周五
  assert.equal(isDueOn(weekdays, '2026-10-24'), false)  // 周六
  assert.equal(isDueOn(weekdays, '2026-10-25'), false)  // 周日
})

test('每月 31 号：2 月跳过、3 月出现', () => {
  assert.equal(isDueOn(monthly, '2026-01-31'), true)
  assert.equal(isDueOn(monthly, '2026-02-28'), false)
  assert.equal(isDueOn(monthly, '2026-03-31'), true)
  assert.equal(isDueOn(monthly, '2026-04-30'), false)
})

test('until 之后不再发生', () => {
  const limited = { ...daily, repeat: { ...daily.repeat, until: '2026-10-24' } }
  assert.equal(isDueOn(limited, '2026-10-24'), true)
  assert.equal(isDueOn(limited, '2026-10-25'), false)
})

test('nextOccurrence 包含当天', () => {
  assert.equal(nextOccurrence(daily, '2026-10-22'), '2026-10-22')
  assert.equal(nextOccurrence(daily, '2026-10-25'), '2026-10-25')
  assert.equal(nextOccurrence(weekly, '2026-10-24'), '2026-10-30')  // 下一个周五
})

test('nextOccurrence 在 until 之后返回 null', () => {
  const limited = { ...daily, repeat: { ...daily.repeat, until: '2026-10-24' } }
  assert.equal(nextOccurrence(limited, '2026-10-25'), null)
})

test('occurrencesBetween 闭区间', () => {
  assert.deepEqual(occurrencesBetween(daily, '2026-10-22', '2026-10-25'), [
    '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25',
  ])
  assert.deepEqual(occurrencesBetween(weekdays, '2026-10-19', '2026-10-25'), [
    '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23',
  ])
})

test('occurrencesBetween 跨月跨年', () => {
  assert.deepEqual(occurrencesBetween(daily, '2026-12-30', '2027-01-02'), [
    '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02',
  ])
})

test('occurrencesBetween 超长区间被截断到 400 天', () => {
  const out = occurrencesBetween(daily, '2026-01-01', '2028-12-31')
  assert.equal(out.length, 400)
})

test('非循环任务按单日处理', () => {
  const single = { dueDate: '2026-10-22', repeat: null }
  assert.equal(isDueOn(single, '2026-10-22'), true)
  assert.equal(isDueOn(single, '2026-10-23'), false)
  assert.deepEqual(occurrencesBetween(single, '2026-10-01', '2026-10-31'), ['2026-10-22'])
})

test('没有 dueDate 的非循环任务不产生实例', () => {
  const noDate = { dueDate: null, repeat: null }
  assert.deepEqual(occurrencesBetween(noDate, '2026-10-01', '2026-10-31'), [])
  assert.equal(nextOccurrence(noDate, '2026-10-22'), null)
})
