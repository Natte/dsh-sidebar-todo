# DSH 待办插件 v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 v1 基础上加三块能力——完整的新建/编辑弹窗、循环任务（模板 + 完成记录）、月视图待办日历。

**Architecture:** 延续 v1 的双半结构。新增 `lib/repeat.js` 纯函数负责「某条待办在某个日期是否发生」的展开；`lib/store.js` 支持 `repeat` / `completions` 并新增 `occurrences(from, to)`；客户端新增弹窗与日历两个视图，日历只消费 `occurrences` 的返回，不自己展开规则。

**Tech Stack:** 与 v1 相同——纯 ESM、无构建、Node 内置 `node:test`、React（浏览器模块表提供）。

**Spec:** [docs/specs/2026-10-22-dsh-todolist-v2-design.md](../specs/2026-10-22-dsh-todolist-v2-design.md)

**前置**: v1 已合并到 `main`（`fa2d192`），76 个测试全绿。所有任务在 `feat/todo-v2` 分支上做。

## Global Constraints

- 无构建、无运行时依赖、纯 ESM；`lib/` 里只 import `node:` 与同目录文件。
- 客户端只 `require('react')`，不得 import `lib/`（加载器限制），也不得在 UI 里调模型。
- 时间一律按**本地日历**，日期键 `YYYY-MM-DD`。
- 颜色只用 `--dsw-alias-*` / `--dsw-specific-sidebar-fill`；可见文案走 `ctx.locale`（zh + en 键集必须一致）。
- 路由一律 `document.baseURI` 相对解析；服务端接口走 `POST /todo/api/*`，白名单 `Object.hasOwn`。
- **循环任务的边界**：不参与「积压」判定；不做逐次待确认（agent 完成一次算完成）；不进「已完成」分组。
- 每个任务结束必须提交，提交信息中文，前缀 `feat:` / `fix:` / `test:` / `docs:`。
- 测试命令：`node --test`（不带目录参数——v1 已踩过 Node 24 的坑）。

---

## 文件结构

| 文件 | 变更 | 职责 |
|---|---|---|
| `lib/repeat.js` | 新增 | 纯函数：规则校验、`isDueOn`、`nextOccurrence`、`occurrencesBetween` |
| `lib/model.js` | 修改 | `normalizeCreate` / `applyPatch` 接受并校验 `repeat` |
| `lib/store.js` | 修改 | `completions`、`complete(..., date)`、`occurrences()`、列表对循环任务的 bucket 处理 |
| `lib/api.js` | 修改 | 新增 `occurrences` 分发 |
| `lib/tool.js` | 修改 | `add`/`update` 接受 `repeat`、`complete` 接受 `date`、`list` 文本标注循环 |
| `client.js` | 修改 | 弹窗、日历视图、视图切换、循环任务行渲染 |
| `test/repeat.test.js` | 新增 | 展开规则的约 22 个用例 |
| `test/store.test.js` | 修改 | 循环任务 CRUD 与 occurrences |
| `test/api.test.js` | 修改 | occurrences 分发 |
| `test/tool.test.js` | 修改 | repeat 参数与 date 参数 |
| `README.md` | 修改 | 循环任务与日历的用法 |

数据形状（新增部分）：

```js
repeat: null | { freq: 'daily'|'weekly'|'monthly', interval: 1, weekdays?: number[], monthDay?: number, until?: string|null }
completions: { [dateKey: string]: string }   // dateKey -> ISO 完成时间
```

---

## Task 1: 循环展开纯函数

**Files:**
- Create: `lib/repeat.js`
- Test: `test/repeat.test.js`

**Interfaces:**
- Consumes: 无（不依赖其它模块）
- Produces:
  - `normalizeRepeat(input): Repeat | null`（非法抛 `Error`，由 model 层转 `TodoError`）
  - `isDueOn(todo, dateKey): boolean`
  - `nextOccurrence(todo, fromKey): string | null`
  - `occurrencesBetween(todo, fromKey, toKey): string[]`

- [ ] **Step 1: 写失败测试**

`test/repeat.test.js`:

```js
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
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/repeat.test.js`
Expected: FAIL，`Cannot find module '../lib/repeat.js'`

- [ ] **Step 3: 实现 `lib/repeat.js`**

```js
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
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/repeat.test.js`
Expected: PASS，12 个测试全绿。

- [ ] **Step 5: 提交**

```bash
git add lib/repeat.js test/repeat.test.js
git commit -m "feat: 循环规则展开纯函数"
```

---

## Task 2: 存储层支持循环任务

**Files:**
- Modify: `lib/model.js`、`lib/store.js`
- Test: `test/store.test.js`（追加）

**Interfaces:**
- Consumes: `normalizeRepeat`、`nextOccurrence`、`occurrencesBetween`（Task 1）
- Produces:
  - `store.occurrences({ from, to }): Promise<{ items: Occurrence[] }>`，`Occurrence = { todoId, date, title, priority, category, done, repeat }`
  - `store.complete(id, done, by, date)` 对循环任务写/删 `completions[date]`
  - `list()` 对循环任务返回 `nextDue`（下一次日期）并据它分桶

- [ ] **Step 1: 追加失败测试**

`test/store.test.js` 末尾：

```js
test('循环任务：create 带 repeat，列表给出 nextDue', async () => {
  const { store } = await tempStore()
  const today = dateKey(new Date())
  const todo = await store.create({
    title: '交日报',
    dueDate: today,
    repeat: { freq: 'daily' },
  })
  assert.equal(todo.repeat.freq, 'daily')
  const { items } = await store.list()
  const row = items.find((t) => t.id === todo.id)
  assert.equal(row.nextDue, today)
  assert.equal(row.isRepeating, true)
  assert.equal(row.bucket, 'today')
  await store.close()
})

test('循环任务：完成某一天只记那一天，行滚到下一天', async () => {
  const { store } = await tempStore()
  const today = dateKey(new Date())
  const todo = await store.create({ title: '交日报', dueDate: today, repeat: { freq: 'daily' } })
  const done = await store.complete(todo.id, true, 'user', today)
  assert.equal(done.done, false)                       // 循环任务恒 false
  assert.ok(done.completions[today])
  const next = await store.list()
  const row = next.items.find((t) => t.id === todo.id)
  assert.equal(row.nextDue, shiftKey(today, 1))        // 滚到明天
  assert.notEqual(row.bucket, 'done')                  // 不进已完成
  await store.close()
})

test('循环任务：取消完成会删掉那天的记录', async () => {
  const { store } = await tempStore()
  const today = dateKey(new Date())
  const todo = await store.create({ title: '交日报', dueDate: today, repeat: { freq: 'daily' } })
  await store.complete(todo.id, true, 'user', today)
  const undone = await store.complete(todo.id, false, 'user', today)
  assert.equal(undone.completions[today], undefined)
  await store.close()
})

test('occurrences 按区间展开多条任务', async () => {
  const { store } = await tempStore()
  const today = dateKey(new Date())
  await store.create({ title: 'A', dueDate: today, repeat: { freq: 'daily' } })
  await store.create({ title: 'B', dueDate: today })
  const { items } = await store.occurrences({ from: today, to: shiftKey(today, 2) })
  assert.equal(items.filter((o) => o.title === 'A').length, 3)
  assert.equal(items.filter((o) => o.title === 'B').length, 1)
  await store.close()
})

test('occurrences 带出完成状态', async () => {
  const { store } = await tempStore()
  const today = dateKey(new Date())
  const todo = await store.create({ title: 'A', dueDate: today, repeat: { freq: 'daily' } })
  await store.complete(todo.id, true, 'user', today)
  const { items } = await store.occurrences({ from: today, to: today })
  assert.equal(items[0].done, true)
  await store.close()
})

test('非法 repeat 被拒绝', async () => {
  const { store } = await tempStore()
  await assert.rejects(
    () => store.create({ title: 'x', dueDate: '2026-10-22', repeat: { freq: 'hourly' } }),
    (err) => err.code === 'invalid-input',
  )
  await store.close()
})
```

`test/store.test.js` 顶部需要补 import：`import { shiftKey } from '../lib/bucket.js'`（若尚未导入）。

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/store.test.js`
Expected: FAIL，`repeat` 字段不存在 / `occurrences` 不是函数。

- [ ] **Step 3: 改 `lib/model.js`**

`normalizeCreate` 返回对象里补两个字段（在 `done: false` 附近）：

```js
    repeat: normalizeRepeat(input.repeat),
    completions: {},
```

顶部补 import：

```js
import { normalizeRepeat } from './repeat.js'
```

并且把 `normalizeRepeat` 抛的 `Error` 转成 `TodoError`：

```js
function pickRepeat(value) {
  try {
    return normalizeRepeat(value)
  } catch (err) {
    throw new TodoError('invalid-input', err.message)
  }
}
```

`normalizeCreate` 里用 `repeat: pickRepeat(input.repeat)`；`applyPatch` 的 `PATCHABLE` 加 `'repeat'`，分支写 `next.repeat = pickRepeat(patch.repeat)`。

- [ ] **Step 4: 改 `lib/store.js`**

顶部 import：

```js
import { nextOccurrence, occurrencesBetween } from './repeat.js'
```

并把 `dateKey` 补进已有的 bucket 导入（v1 的 `store.js` 只导入了 `bucketOf` / `compareTodos` / `summarize`）：

```js
import { bucketOf, compareTodos, summarize, dateKey } from './bucket.js'
```

`list()` 的映射改成按循环任务取下一次：

```js
    async list(filter = {}) {
      const now = new Date()
      const today = dateKey(now)
      let items = state.todos.map((todo) => {
        const isRepeating = todo.repeat !== null
        const nextDue = isRepeating ? nextOccurrence(todo, today) : todo.dueDate
        const shaped = isRepeating
          ? { ...todo, dueDate: nextDue, done: false }
          : todo
        return {
          ...shaped,
          isRepeating,
          nextDue,
          bucket: bucketOf({ ...shaped, done: isRepeating ? false : shaped.done }, now, staleDays),
        }
      })
      // …其余 view / q 过滤逻辑保持不变
```

`complete` 改成分叉：

```js
    async complete(id, done = true, by = 'user', date) {
      const index = state.todos.findIndex((t) => t.id === id)
      if (index === -1) throw new TodoError('not-found', '这条待办已经不在了')
      const todo = state.todos[index]
      const finished = done !== false
      const now = new Date().toISOString()
      const day = typeof date === 'string' && date !== '' ? date : dateKey(new Date())

      if (todo.repeat !== null) {
        if (typeof by !== 'string' || by === '') throw new TodoError('invalid-input', 'by 必须是 user 或 agent')
        const completions = { ...(todo.completions ?? {}) }
        if (finished) completions[day] = now
        else delete completions[day]
        const next = { ...todo, completions, updatedAt: now }
        state.todos[index] = next
        await guard(persist)
        return withBucket(next)
      }

      // …以下沿用 v1 的单次任务逻辑
```

新增 `occurrences`：

```js
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
            done: todo.repeat !== null
              ? Boolean(todo.completions?.[date])
              : Boolean(todo.done && todo.dueDate === date),
            repeat: todo.repeat,
          })
        }
      }
      items.sort((a, b) => (a.date === b.date ? a.title.localeCompare(b.title) : a.date.localeCompare(b.date)))
      return { items }
    },
```

- [ ] **Step 5: 运行确认通过**

Run: `node --test`
Expected: 全绿（v1 的 76 + 新增 6）。

- [ ] **Step 6: 提交**

```bash
git add lib/model.js lib/store.js test/store.test.js
git commit -m "feat: 存储层支持循环任务与按区间展开"
```

---

## Task 3: 接口与工具支持

**Files:**
- Modify: `lib/api.js`、`lib/tool.js`
- Test: `test/api.test.js`、`test/tool.test.js`

**Interfaces:**
- Consumes: `store.occurrences`、`store.complete(..., date)`（Task 2）
- Produces: `POST todo/api/occurrences`；工具 `personal_todo` 的 `repeat` / `date` 参数

- [ ] **Step 1: 追加失败测试**

`test/api.test.js`：

```js
test('occurrences 分发', async () => {
  const { api, store } = await makeApi()
  const today = '2026-10-22'
  await api.create({ title: 'A', dueDate: today, repeat: { freq: 'daily' } })
  const out = await api.occurrences({ from: today, to: '2026-10-24' })
  assert.equal(out.items.length, 3)
  await store.close()
})
```

`test/tool.test.js`：

```js
test('add 支持 repeat，list 标注循环', async () => {
  const { tool, store } = await makeTool()
  const added = await tool.execute(
    { action: 'add', title: '交日报', dueDate: '2026-10-22', repeat: { freq: 'weekly', weekdays: [1, 2, 3, 4, 5] } },
    {},
  )
  assert.equal(added.item.repeat.freq, 'weekly')
  const listed = await tool.execute({ action: 'list' }, {})
  const text = tool.output.render({ action: 'list' }, listed)[0].text
  assert.match(text, /循环/)
  await store.close()
})

test('complete 支持 date 参数', async () => {
  const { tool, store } = await makeTool()
  const added = await tool.execute({ action: 'add', title: 'A', dueDate: '2026-10-22', repeat: { freq: 'daily' } }, {})
  const done = await tool.execute({ action: 'complete', id: added.item.id, date: '2026-10-23' }, {})
  assert.ok(done.item.completions['2026-10-23'])
  await store.close()
})
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/api.test.js; node --test test/tool.test.js`
Expected: FAIL，`api.occurrences is not a function` / repeat 未生效。

- [ ] **Step 3: 改 `lib/api.js`**

分发表加一行：

```js
    occurrences: (input = {}) => store.occurrences(input),
```

- [ ] **Step 4: 改 `lib/tool.js`**

参数 schema 增加（`properties` 里）：

```js
        date: { type: 'string', description: 'complete 时指定哪一天（YYYY-MM-DD），默认今天；循环任务用' },
        repeat: {
          type: 'object',
          description: '循环规则：{ freq: daily|weekly|monthly, weekdays?: 1-7, monthDay?: 1-31, until?: YYYY-MM-DD }',
          properties: {
            freq: { type: 'string', enum: ['daily', 'weekly', 'monthly'] },
            weekdays: { type: 'array', items: { type: 'integer' } },
            monthDay: { type: 'integer' },
            until: { type: 'string' },
          },
          required: ['freq'],
          additionalProperties: false,
        },
```

`add` 分支把 `repeat` 一起传下去（它已在 `fields` 里，无需额外处理）；`update` 同理。

`complete` 分支传 date：

```js
      const item = await api.complete({ id: input.id, done: input.done !== false, by: 'agent', date: input.date })
```

`list` 的 render 里，循环任务标注：

```js
function describe(item) {
  const due = item.isRepeating
    ? `（循环·下次 ${item.nextDue ?? '已结束'}）`
    : item.dueDate
      ? `（截止 ${item.dueDate}${item.dueTime ? ' ' + item.dueTime : ''}）`
      : ''
  const flag = item.bucket === 'stale' ? '【积压】' : ''
  return `- ${item.done ? '[x]' : '[ ]'} ${item.title}${due}${flag}`
}
```

工具描述末尾补一句：

```
用户用口语描述重复安排（「每周一到周五」「每月最后一天」等）时，自行推断 repeat 参数，不要反问用户要哪种重复。
```

- [ ] **Step 5: 运行确认通过**

Run: `node --test`
Expected: 全绿。

- [ ] **Step 6: 提交**

```bash
git add lib/api.js lib/tool.js test/api.test.js test/tool.test.js
git commit -m "feat: occurrences 接口与工具的循环参数"
```

---

## Task 4: 新建/编辑弹窗

**Files:**
- Modify: `client.js`

**Interfaces:**
- Consumes: `fetchApi('create'|'update')`（v1 已有）、`parse` 路由（v1 已有）
- Produces: `TodoDialog` 组件；`TodoPage` 里 `+ 新建` 与详情「编辑」都打开它

- [ ] **Step 1: 加弹窗字典键**

`zh` 与 `en` 各补（键集必须一致）：

```js
dialogNew: '新建待办', dialogEdit: '编辑待办', fieldTitle: '标题', fieldNote: '备注',
fieldDate: '日期', fieldTime: '时间', fieldPriority: '优先级', fieldCategory: '分类',
fieldRepeat: '重复', repeatNone: '不循环', repeatDaily: '每天', repeatWeekly: '每周',
repeatMonthly: '每月', fieldWeekdays: '星期', fieldMonthDay: '每月几号', fieldUntil: '结束日期',
mon: '一', tue: '二', wed: '三', thu: '四', fri: '五', sat: '六', sun: '日',
prevMonth: '上个月', nextMonth: '下个月', today: '今天', calendar: '日历', list: '列表',
quickFill: '一句话填写，例如：明天下午3点 交周报 #工作',
save: '保存', close: '关闭', titleRequired: '标题不能为空', weekdaysRequired: '每周至少选一天',
```

**注意**：星期几用七个独立键（`mon`…`sun`），不要放数组——`t()` 只返回字符串。

- [ ] **Step 2: 先补两个客户端小工具**

放在 `TodoDialog` 之前（v1 的 client.js 里没有这两个）：

```js
    function dateKeyOf(date) {
      const y = date.getFullYear()
      const m = String(date.getMonth() + 1).padStart(2, '0')
      const d = String(date.getDate()).padStart(2, '0')
      return `${y}-${m}-${d}`
    }

    const PRIORITY_COLOR = {
      high: 'var(--dsw-alias-state-error-primary)',
      medium: 'var(--dsw-alias-state-warn-primary)',
      low: 'var(--dsw-alias-state-business-primary)',
    }
    const priorityColor = (priority) => PRIORITY_COLOR[priority] ?? 'transparent'
```

Task 6 的日历与优先级点都用这两个，先定义好，避免后面重复实现。

- [ ] **Step 3: 写 `TodoDialog` 组件**

放在 `TodoPage` 之前：

```js
    const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

    function TodoDialog({ t, initial, onClose, onSaved }) {
      const [form, setForm] = useState(() => ({
        id: initial?.id ?? null,
        title: initial?.title ?? '',
        note: initial?.note ?? '',
        dueDate: initial?.dueDate ?? dateKeyOf(new Date()),
        dueTime: initial?.dueTime ?? '',
        priority: initial?.priority ?? null,
        category: initial?.category ?? '',
        repeatFreq: initial?.repeat?.freq ?? '',
        weekdays: initial?.repeat?.weekdays ?? [],
        monthDay: initial?.repeat?.monthDay ?? new Date().getDate(),
        until: initial?.repeat?.until ?? '',
      }))
      const [error, setError] = useState(null)
      const [saving, setSaving] = useState(false)
      const first = useRef(null)

      useEffect(() => { if (first.current) first.current.focus() }, [])

      const set = (patch) => setForm((prev) => ({ ...prev, ...patch }))

      const submit = async () => {
        if (form.title.trim() === '') { setError(t('titleRequired')); return }
        if (form.repeatFreq === 'weekly' && form.weekdays.length === 0) { setError(t('weekdaysRequired')); return }
        setSaving(true)
        try {
          const payload = {
            title: form.title.trim(),
            note: form.note,
            dueDate: form.dueDate || null,
            dueTime: form.dueTime || null,
            priority: form.priority || null,
            category: form.category || null,
            repeat: form.repeatFreq === ''
              ? null
              : form.repeatFreq === 'weekly'
                ? { freq: 'weekly', weekdays: form.weekdays }
                : form.repeatFreq === 'monthly'
                  ? { freq: 'monthly', monthDay: form.monthDay }
                  : { freq: 'daily' },
          }
          if (form.until) payload.repeat.until = form.until
          if (form.id) await fetchApi('update', { id: form.id, patch: payload })
          else await fetchApi('create', payload)
          onSaved()
        } catch (err) {
          setError(err.message)
        } finally {
          setSaving(false)
        }
      }

      return h('div', { style: S.overlay, onClick: (e) => { if (e.target === e.currentTarget) onClose() } },
        h('div', { style: S.dialog, role: 'dialog', 'aria-modal': 'true', 'aria-label': t(form.id ? 'dialogEdit' : 'dialogNew') },
          h('div', { style: S.dialogHead }, t(form.id ? 'dialogEdit' : 'dialogNew')),
          h('div', { style: S.dialogBody },

            h('label', { style: S.field },
              h('span', { style: S.fieldLabel }, t('fieldTitle')),
              h('input', {
                ref: first, style: S.input, value: form.title,
                onChange: (e) => set({ title: e.target.value }),
                onKeyDown: (e) => { if (e.key === 'Enter' && !e.nativeEvent?.isComposing) void submit() },
              })),

            h('label', { style: S.field },
              h('span', { style: S.fieldLabel }, t('fieldNote')),
              h('textarea', {
                style: { ...S.input, height: 64, resize: 'vertical' }, value: form.note,
                onChange: (e) => set({ note: e.target.value }),
              })),

            h('div', { style: S.fieldRow },
              h('label', { style: S.field },
                h('span', { style: S.fieldLabel }, t('fieldDate')),
                h('input', {
                  type: 'date', style: S.input, value: form.dueDate,
                  onChange: (e) => set({ dueDate: e.target.value }),
                })),
              h('label', { style: S.field },
                h('span', { style: S.fieldLabel }, t('fieldTime')),
                h('input', {
                  type: 'time', style: S.input, value: form.dueTime,
                  onChange: (e) => set({ dueTime: e.target.value }),
                }))),

            h('div', { style: S.field },
              h('span', { style: S.fieldLabel }, t('fieldPriority')),
              h('div', { style: S.seg },
                [['high', 'priHigh'], ['medium', 'priMedium'], ['low', 'priLow']].map(([value, key]) =>
                  h('button', {
                    key: value, type: 'button',
                    style: { ...S.segItem, ...(form.priority === value ? S.segItemOn : null) },
                    onClick: () => set({ priority: form.priority === value ? null : value }),
                  }, t(key))))),

            h('label', { style: S.field },
              h('span', { style: S.fieldLabel }, t('fieldCategory')),
              h('input', {
                style: S.input, value: form.category, list: 'todo-categories',
                onChange: (e) => set({ category: e.target.value }),
              })),

            h('label', { style: S.field },
              h('span', { style: S.fieldLabel }, t('fieldRepeat')),
              h('select', {
                style: S.input, value: form.repeatFreq,
                onChange: (e) => set({ repeatFreq: e.target.value }),
              },
              h('option', { value: '' }, t('repeatNone')),
              h('option', { value: 'daily' }, t('repeatDaily')),
              h('option', { value: 'weekly' }, t('repeatWeekly')),
              h('option', { value: 'monthly' }, t('repeatMonthly')))),

            form.repeatFreq === 'weekly'
              ? h('div', { style: S.field },
                  h('span', { style: S.fieldLabel }, t('fieldWeekdays')),
                  h('div', { style: S.seg },
                    [['mon', 1], ['tue', 2], ['wed', 3], ['thu', 4], ['fri', 5], ['sat', 6], ['sun', 7]].map(([key, iso]) =>
                      h('button', {
                        key, type: 'button',
                        style: { ...S.segItem, ...(form.weekdays.includes(iso) ? S.segItemOn : null) },
                        onClick: () => set({
                          weekdays: form.weekdays.includes(iso)
                            ? form.weekdays.filter((d) => d !== iso)
                            : [...form.weekdays, iso],
                        }),
                      }, t(key)))))
              : null,

            form.repeatFreq === 'monthly'
              ? h('label', { style: S.field },
                  h('span', { style: S.fieldLabel }, t('fieldMonthDay')),
                  h('select', {
                    style: S.input, value: String(form.monthDay),
                    onChange: (e) => set({ monthDay: Number(e.target.value) }),
                  }, MONTH_DAYS.map((day) => h('option', { key: day, value: String(day) }, String(day)))))
              : null,

            form.repeatFreq !== ''
              ? h('label', { style: S.field },
                  h('span', { style: S.fieldLabel }, t('fieldUntil')),
                  h('input', {
                    type: 'date', style: S.input, value: form.until,
                    onChange: (e) => set({ until: e.target.value }),
                  }))
              : null,
          ),
          error ? h('div', { style: S.dialogError }, error) : null,
          h('div', { style: S.dialogFoot },
            h('button', { style: S.btnGhost, onClick: onClose, disabled: saving }, t('close')),
            h('button', { style: S.btnPrimary, onClick: submit, disabled: saving }, t('save')),
          ),
        ),
      )
    }
```

`S` 需要新增这些样式键：`overlay`（`position: fixed; inset: 0; background: var(--dsw-alias-bg-mask-1); display:flex; align-items:center; justify-content:center; z-index: 1000`）、`dialog`（`background: var(--dsw-alias-bg-overlay); border-radius: 12px; border: 0.5px solid var(--dsw-alias-border-l3); width: 520px; max-height: 80vh; overflow: auto; padding: 16px 20px`）、`dialogHead` / `dialogBody` / `dialogFoot` / `field` / `fieldRow`（`display:flex; gap:12px`）/ `fieldLabel` / `input` / `seg` / `segItem` / `segItemOn` / `dialogError` / `btnGhost` / `btnPrimary`。

`seg` / `segItem` / `segItemOn` 可以复用 v1 页头已经有的分段控件样式（如果 v1 用的是行内对象，就抽成 `S.seg*` 再复用于日历的视图切换）。

**注意**：`overlay` 用 `position: fixed` 渲染在插件自己的 React 树里，不改宿主 DOM；不挂在 `document.body` 上。

- [ ] **Step 4: 接进 `TodoPage`**

- 状态：`const [dialog, setDialog] = useState(null)`（`null` 或 `{ initial }`）。
- `+ 新建` 按钮：`onClick: () => setDialog({ initial: null })`。
- 详情列底部加「编辑」：`onClick: () => setDialog({ initial: selectedItem })`。
- 渲染：`dialog ? h(TodoDialog, { t, initial: dialog.initial, onClose: () => setDialog(null), onSaved: () => { setDialog(null); void reload() } }) : null`。
- 弹窗打开时监听 Esc 关闭：`useEffect` 里 `document.addEventListener('keydown', ...)`，卸载时移除。

- [ ] **Step 5: 语法与行为验证**

Run: `node --check client.js`
Expected: exit 0。
同时用仓库外的 DOM-less 冒烟（沿用 v1 的做法）验证：打开弹窗 → 填标题 → 保存 → 发出的 `create` 载荷字段正确；标题为空时不发请求且显示错误。

- [ ] **Step 6: 提交**

```bash
git add client.js
git commit -m "feat: 新建/编辑待办弹窗"
```

---

## Task 5: 弹窗内的「一句话填写」

**Files:**
- Modify: `client.js`

**Interfaces:**
- Consumes: `TodoDialog`（Task 4）、`fetchApi('parse')`（v1 已有）
- Produces: 弹窗顶部输入框把解析结果写进 `form`

- [ ] **Step 1: 在 `TodoDialog` 顶部加一行输入**

```js
      const [quick, setQuick] = useState('')
      useEffect(() => {
        if (quick.trim() === '') return undefined
        const timer = window.setTimeout(() => {
          fetchApi('parse', { text: quick })
            .then((parsed) => {
              setForm((prev) => ({
                ...prev,
                title: parsed.title || prev.title,
                dueDate: parsed.dueDate || prev.dueDate,
                dueTime: parsed.dueTime || prev.dueTime,
                priority: parsed.priority ?? prev.priority,
                category: parsed.category || prev.category,
              }))
            })
            .catch(() => {})
        }, 200)
        return () => window.clearTimeout(timer)
      }, [quick])
```

渲染在弹窗标题下方、字段之前，`placeholder` 用 `t('quickFill')`（新增字典键：`quickFill: '一句话填写，例如：明天下午3点 交周报 #工作'`）。

- [ ] **Step 2: 验证**

冒烟脚本：输入「明天下午3点 交周报 #工作」→ 断言 title/dueDate/dueTime/category 四个字段被写进表单；清空输入框不影响已填字段。

- [ ] **Step 3: 提交**

```bash
git add client.js
git commit -m "feat: 弹窗内一句话填写"
```

---

## Task 6: 月视图日历

**Files:**
- Modify: `client.js`

**Interfaces:**
- Consumes: `fetchApi('occurrences')`（Task 3）
- Produces: `CalendarView` 组件 + 页头 `列表 | 日历` 切换

- [ ] **Step 1: 写月网格工具函数**

`dateKeyOf` 在 Task 4 已经定义，这里只用不重复定义：

```js
    /** 6 周 × 7 天，周一起始；返回日期键数组（42 个）。 */
    function monthGrid(year, month) {
      const first = new Date(year, month, 1)
      const offset = (first.getDay() === 0 ? 7 : first.getDay()) - 1
      const start = new Date(year, month, 1 - offset)
      const cells = []
      for (let i = 0; i < 42; i += 1) {
        const at = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
        cells.push(dateKeyOf(at))
      }
      return cells
    }

    const WEEKDAY_KEYS = [
      ['mon', 1], ['tue', 2], ['wed', 3], ['thu', 4], ['fri', 5], ['sat', 6], ['sun', 7],
    ]
```

- [ ] **Step 2: 写 `CalendarView`**

```js
    function CalendarView({ t, onPickDay }) {
      const now = new Date()
      const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() })
      const [byDate, setByDate] = useState({})
      const cells = monthGrid(cursor.year, cursor.month)
      const from = cells[0]
      const to = cells[cells.length - 1]

      useEffect(() => {
        let alive = true
        fetchApi('occurrences', { from, to })
          .then((result) => {
            if (!alive) return
            const map = {}
            for (const item of result.items ?? []) {
              ;(map[item.date] ??= []).push(item)
            }
            setByDate(map)
          })
          .catch(() => { if (alive) setByDate({}) })
        return () => { alive = false }
      }, [from, to])

      const move = (delta) => {
        const next = new Date(cursor.year, cursor.month + delta, 1)
        setCursor({ year: next.getFullYear(), month: next.getMonth() })
      }

      return h('div', { style: S.calendar },
        h('div', { style: S.calendarHead },
          h('button', { style: S.iconBtn, onClick: () => move(-1), 'aria-label': t('prevMonth') }, '‹'),
          h('div', { style: S.calendarTitle }, `${cursor.year} 年 ${cursor.month + 1} 月`),
          h('button', { style: S.iconBtn, onClick: () => move(1), 'aria-label': t('nextMonth') }, '›'),
          h('button', { style: S.btnGhost, onClick: () => setCursor({ year: now.getFullYear(), month: now.getMonth() }) }, t('today')),
        ),
        h('div', { style: S.calendarWeekdays },
          WEEKDAY_KEYS.map(([key]) => h('div', { key, style: S.calendarWeekday }, t(key)))),
        h('div', { style: S.calendarGrid },
          cells.map((key) => {
            const items = byDate[key] ?? []
            const inMonth = Number(key.slice(5, 7)) === cursor.month + 1
            return h('div', {
              key, style: { ...S.calendarCell, opacity: inMonth ? 1 : 0.45 },
              onClick: () => onPickDay(key),
            },
            h('div', { style: S.calendarDay }, String(Number(key.slice(8)))),
            items.slice(0, 2).map((item) => h('div', { key: item.todoId + item.date, style: S.calendarItem },
              h('span', { style: { ...S.dot, background: priorityColor(item.priority) } }),
              item.title)),
            items.length > 2 ? h('div', { style: S.calendarMore }, `+${items.length - 2}`) : null)
          })),
      )
    }
```

需要的样式键：`calendar` / `calendarHead` / `calendarTitle` / `iconBtn` / `calendarWeekdays` / `calendarWeekday` / `calendarGrid` / `calendarDay` / `calendarItem` / `calendarMore` / `dot`（`dot` 是 5×5 圆点，`background` 由 `priorityColor()` 给）。

- [ ] **Step 3: 页头切换 + 点日期看当天**

- `TodoPage` 加两个状态：`const [view, setView] = useState('list')`、`const [day, setDay] = useState(null)`（`null` 或 `{ key, items }`）。
- 页头右侧、搜索框之前加分段控件（复用 `S.seg` / `S.segItem` / `S.segItemOn`）：`列表` / `日历` 两个按钮。
- `view === 'calendar'` 时渲染 `CalendarView`，并把 `onPickDay` 改成接收该天的条目：

```js
    <CalendarView
      t={t}
      onPickDay={(key, items) => setDay({ key, items })}
    />
```

`CalendarView` 里对应改为 `onClick: () => onPickDay(key, items)`。

- 详情列在 `day !== null` 时**优先**显示「当天清单」，否则显示原来的选中项详情：

```js
          day
            ? h('div', null,
                h('div', { style: S.detailTitle }, `${day.key} 的安排`),
                day.items.length === 0
                  ? h('div', { style: S.empty }, t('nothingThatDay'))
                  : day.items.map((item) => h('div', { key: item.todoId + item.date, style: S.dayRow },
                      h('span', {
                        role: 'checkbox',
                        'aria-checked': item.done ? 'true' : 'false',
                        tabIndex: 0,
                        style: item.done ? S.cbDone : S.cb,
                        onClick: () => void mutate('complete', { id: item.todoId, done: !item.done, date: item.date }),
                        onKeyDown: (e) => {
                          if (e.key === ' ' || e.key === 'Enter') {
                            void mutate('complete', { id: item.todoId, done: !item.done, date: item.date })
                          }
                        },
                      }),
                      h('span', { style: item.done ? S.nmDone : S.nm }, item.title))),
                h('button', {
                  style: { ...S.btnGhost, width: '100%', marginTop: 10 },
                  onClick: () => setDialog({ initial: { dueDate: day.key } }),
                }, t('newOnThatDay')))
            : selectedItem
              ? /* 原来的详情列 */ null
              : h('div', { style: S.empty }, t('pickOne')),
```

- `mutate('complete', { id, done, date })` 要把 `date` 透传下去（v1 的 `mutate` 直接 `fetchApi(method, payload)`，无需改）。
- 字典补两个键：`nothingThatDay: '这一天没有安排'`、`newOnThatDay: '在这一天新建'`（en 同步）。
- 从日历切回列表时 `setDay(null)`，避免详情列一直停在某一天。

- [ ] **Step 4: 验证**

- `node --check client.js` exit 0。
- 冒烟：给定 `occurrences` 返回 3 天各 1 条 → 网格里对应格子各渲染 1 条；某天 5 条时渲染 2 条 + `+3`。
- 月切换按钮改 `cursor` 并触发一次新请求（from/to 变化）。

- [ ] **Step 5: 提交**

```bash
git add client.js
git commit -m "feat: 待办月视图日历"
```

---

## Task 7: 收尾与验收

**Files:**
- Modify: `README.md`
- Test: 全量

- [ ] **Step 1: README 补三节**

```markdown
## 新建与编辑

「+ 新建」打开弹窗，可设标题、备注、日期、时间、优先级、分类、重复规则。
弹窗顶部还有一行「一句话填写」：输入「明天下午3点 交周报 #工作」，字段会被自动填好再微调。

## 循环任务

- 每天 / 每周（可选多天）/ 每月（指定几号），可设结束日期。
- 列表里显示**下一次**该做的时间；勾掉今天，它自己滚到明天。
- 循环任务不进「已完成」分组，也不参与「积压」判定。
- 在对话里说「每周一到周五 18 点交日报」，agent 会直接建好（`personal_todo` 的 `repeat` 参数）。

## 日历

页头切到「日历」看月视图，每格最多显示两条，多的收成 `+N`；点某天看当天安排。
```

- [ ] **Step 2: 跑全量测试**

Run: `node --test`
Expected: 全绿（v1 的 76 + v2 新增约 18）。

- [ ] **Step 3: 按 spec §七 逐条验收**

| # | 验收项 | 做法 |
|---|---|---|
| 1 | 弹窗建任务，日期/时间/优先级/分类都对 | 手动建一条 11-05 的任务，看分组 |
| 2 | 每工作日 18:00 的任务：日历周一到五都有 | 建一条，翻日历 |
| 3 | 勾掉今天，只消失今天，行滚到明天 | 勾选后看列表与日历 |
| 4 | 勾掉后不进「已完成」 | 看已完成分组计数 |
| 5 | 每月 31 号：2 月没有、3 月有 | 翻到 2027 年 2 月/3 月 |
| 6 | 老数据加载正常 | 用 v1 写的 JSON 启动 |
| 7 | 重装后 completions 还在 | 卸载重装后查看 |
| 8 | 弹窗一句话填写四个字段 | 输入后看表单 |
| 9 | 对话里让 agent 建循环任务 | 说一句「每周一到周五 18 点交日报」 |

- [ ] **Step 4: 提交并推送**

```bash
git add README.md
git commit -m "docs: v2 的弹窗、循环任务与日历说明"
git push
```

---

## 附：任务依赖

```
Task 1 (repeat 纯函数) ──> Task 2 (存储) ──> Task 3 (接口/工具) ──> Task 6 (日历)
                                    └────> Task 4 (弹窗) ──> Task 5 (一句话填写)
Task 7 依赖全部
```

- Task 1 可独立开工（纯函数，零依赖）。
- Task 2 依赖 1；Task 3 依赖 2；Task 6 依赖 3。
- Task 4/5 只改 `client.js`，可与 Task 2/3 并行；但 Task 5 依赖 4。
- **`client.js` 是热点文件**：Task 4、5、6 都在改它，必须串行，不能并行派单。

## 附：与 v1 的差异（给执行者的提醒）

- v1 的 `complete(id, done, by)` 在 v2 变成 `complete(id, done, by, date)`——**保持向后兼容**，`date` 缺省为今天。
- v1 的 `list()` 返回 `{ items, summary, notices }`，v2 的循环任务行多了 `isRepeating` / `nextDue` / `completions` 三个字段；老客户端读不到也不会崩。
- v1 的「待确认」只对**单次任务**生效；循环任务由 agent 完成时不进待确认（设计取舍，见 spec §二）。
