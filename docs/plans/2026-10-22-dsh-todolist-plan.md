# DSH 待办插件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 DSH 左侧栏增加「待办」入口行，点开是一张管理日常工作的待办页，数据落在宿主侧 JSON 文件，agent 通过工具读写同一份数据。

**Architecture:** 单包双半结构。Host（`index.js` + `lib/`）持有内存态与 JSON 文件，暴露 `POST /todo/api/*` 路由与 `personal_todo` 工具；Client（`client.js`）只做渲染与调用路由，通过 `sidebar.panellist` 注册入口行、`main` 注册 `key: 'todo'` 的面板页。分类（今天/明天/本周/积压/未排期/已完成）与自然语言解析都在 Host 侧实现一次（`lib/bucket.js`、`lib/quickadd.js`），UI 只消费结果。

**Tech Stack:** 纯 ESM JavaScript（无构建）、Node 内置 `node:test`、宿主 Cordis 服务（`webServer` / `connection` / `tools` / `slots` / `locale`）、React（浏览器模块表提供）。

**Spec:** [docs/specs/2026-10-22-dsh-todolist-design.md](../specs/2026-10-22-dsh-todolist-design.md)

## Global Constraints

- 包名 `dsh-todolist`，`"type": "module"`，无构建步骤，无运行时依赖。
- 面板 key 与 panellist id 都是 `todo`；`order: 20`（宿主 `plugins=0`、`dsh-market=1`、`schedules=10`，待办排在最后、紧贴工作区上方）。
- 所有可见文案走 `ctx.locale`，命名空间 `dsh-todolist`，同时提供 `zh` 与 `en`。
- 颜色与间距只用 `--dsw-alias-*` 与 `--dsw-specific-sidebar-fill`，禁止写死色值（图标文件除外）。
- 数据文件默认 `%DSH_PROFILE_DIR%/data/dsh-todolist/todos.json`；当前环境即 `C:\Users\12756\.dsh\profiles\desktop\data\dsh-todolist\todos.json`。
- 运行环境是官方桌面版（Electron 外壳 + 本机 http 提供的 Web GUI，profile 名 `desktop`）：客户端代码不得依赖固定端口或地址栏，路由一律用 `document.baseURI` 相对解析。
- 路由必须过 `ctx.connection.requestRejection(req)`，非本页来源一律 403。
- 自然语言解析只在宿主侧实现（`lib/quickadd.js`），客户端不得自行解析，也不得在 UI 里调用模型；「让 agent 帮我记」走对话 + `personal_todo` 工具。
- 借鉴自其他插件仓库的设计模式（见 [docs/notes/2026-10-22-borrowed-patterns.md](../notes/2026-10-22-borrowed-patterns.md)），在对应源码位置写一行注释标出处，不复制代码。
- 每个任务结束必须 `git commit`；提交信息用中文，前缀 `feat:` / `test:` / `chore:` / `docs:`。
- 测试命令统一 `node --test`。

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `package.json` | 包声明、`dsh.bundle.patch`、`dsh.client` |
| `cordis.patch.yml` | 插入插件行 |
| `index.js` | Host 入口：装配 store、路由、工具、配置 |
| `client.js` | Client 入口：两个槽位注册 + 页面组件 + 字典 |
| `lib/model.js` | 记录校验、默认值、id 生成、`TodoError` |
| `lib/bucket.js` | 纯函数：日期推进、`bucketOf`、`compareTodos`、`summarize` |
| `lib/store.js` | 持久化 + CRUD（原子写、串行队列、损坏备份） |
| `lib/api.js` | 方法分发表（路由与工具共用） |
| `lib/quickadd.js` | 纯函数：一行自然语言的剥离式解析 |
| `lib/tool.js` | `personal_todo` 的 ToolDefinition |
| `test/bucket.test.js` | 分组/排序 |
| `test/store.test.js` | 增删改查 + 重载 + 损坏恢复 + 待确认 |
| `test/api.test.js` | 分发、未知方法、错误码、解析路由 |
| `test/quickadd.test.js` | 自然语言解析的 12 个用例 |
| `test/tool.test.js` | 工具各 action |
| `test/theme-tokens.json` + `test/client-tokens.test.js` | 主题 token 白名单校验 |
| `locale/{zh,en}.json` | 插件显示元数据（`meta.title` / `meta.description`） |
| `icon.svg` | 插件图标 |
| `README.md` | 安装、数据位置、工具用法 |

数据形状（来自 spec §4.1，全任务共用）：

```js
{ id, title, note, priority, category, dueDate, dueTime, done, doneAt, doneBy, verifiedAt, createdAt, updatedAt }
// priority: 'high' | 'medium' | 'low' | null
// doneBy: 'user' | 'agent' | null；verifiedAt 为人工核实时间
// bucket（仅响应里出现）: 'today' | 'tomorrow' | 'week' | 'stale' | 'unplanned' | 'done'
```

---

## Task 1: 插件骨架与槽位链路

**Files:**
- Create: `package.json`, `cordis.patch.yml`, `index.js`, `client.js`, `locale/zh.json`, `locale/en.json`, `icon.svg`

**Interfaces:**
- Consumes: 无
- Produces: `sidebar.panellist` 里 id 为 `todo` 的图标注册、`main` 里 key 为 `todo` 的面板注册；后续任务替换这两个占位实现

- [ ] **Step 1: 写 `package.json`**

```json
{
  "name": "dsh-todolist",
  "version": "0.1.0",
  "private": true,
  "description": "侧栏待办清单：今天 / 本周 / 积压，agent 可读写",
  "type": "module",
  "exports": {
    ".": "./index.js",
    "./client": "./client.js",
    "./locale/*.json": "./locale/*.json",
    "./icon": "./icon.svg"
  },
  "files": ["index.js", "client.js", "lib/**/*.js", "cordis.patch.yml", "locale/*.json", "icon.svg"],
  "scripts": { "test": "node --test" },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web", "immediately": true, "inject": ["@deepseek-ai/dsh-client-ui-sidebar"] }
  }
}
```

- [ ] **Step 2: 写 `cordis.patch.yml`**

```yaml
- insert:
    - id: dsh-todolist
      name: dsh-todolist
      config:
        staleDays: 7
```

- [ ] **Step 3: 写 `index.js`（占位 Host 半）**

```js
/** Host half of the todo bundle. Data, routes and the agent tool live here. */
export const inject = ['webServer', 'connection', 'tools']

export function apply() {}
```

- [ ] **Step 4: 写 `client.js`（占位 Client 半）**

```js
window.__ModuleLoader__.load({
  id: 'dsh-todolist',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    function TodoIcon({ size = 16 }) {
      return h(
        'svg',
        {
          width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
          stroke: 'currentColor', strokeWidth: 1.4, 'aria-hidden': true,
        },
        h('rect', { x: 2.4, y: 2.4, width: 11.2, height: 11.2, rx: 2.4 }),
        h('path', { d: 'M5.4 8.2l1.9 1.9 3.4-3.6', strokeLinecap: 'round', strokeLinejoin: 'round' }),
      )
    }

    function TodoPage() {
      return h('div', { style: { padding: 24, fontSize: 14 } }, '待办（占位）')
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: 'todo', order: 20, label: () => '待办',
        }, ({ size } = {}) => h(TodoIcon, { size: size ?? 16 })))

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main', key: 'todo',
        }, TodoPage))
      },
    }
  },
})
```

- [ ] **Step 5: 写 `locale/zh.json`、`locale/en.json`、`icon.svg`**

`locale/zh.json`:

```json
{ "meta": { "title": "待办", "description": "侧栏待办清单：今天 / 本周 / 积压，agent 可读可写。" } }
```

`locale/en.json`:

```json
{ "meta": { "title": "To-do", "description": "Sidebar todo list: today, this week, backlog. Readable and writable by the agent." } }
```

`icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="14" fill="#4176e6"/>
  <path d="M18 33.5l8.6 8.6L47 20.5" fill="none" stroke="#fff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M17 52h30" stroke="#fff" stroke-opacity=".55" stroke-width="4.5" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 6: 语法检查**

Run: `node --check index.js; node --check client.js`
Expected: 无输出、退出码 0。

- [ ] **Step 7: 安装并验证槽位链路**

用 `plugin_manager` `action: install_bundle`、`target: D:\dsh-todolist`（绝对路径）安装。
然后 `cordis_inspect_query`（client / Slots / `listSubTree`，`root: "sidebar.panellist"`）确认 `occupants` 里出现 `{ id: "todo", order: 20 }`。
再用 `root: "main"` 确认 `occupants` 里有 `key: "todo"`。
最后在页面上点一次「待办」：主区应出现「待办（占位）」。
折叠验证：Windows 自定义标题栏模式下，宿主折叠侧栏会整列隐藏面板导航（`[data-windows-titlebar] .collapsed .panelList{display:none}`），「待办」随「插件」「定时任务」一起消失是**预期**；只有非标题栏模式（浏览器打开）才缩成 36×36 图标。两种都属于宿主行为，插件不做补偿。

- [ ] **Step 8: 提交**

```bash
git add package.json cordis.patch.yml index.js client.js locale icon.svg
git commit -m "feat: 插件骨架，打通侧栏入口行与主面板槽位"
```

---

## Task 2: 分组与排序（纯函数）

**Files:**
- Create: `lib/bucket.js`
- Test: `test/bucket.test.js`

**Interfaces:**
- Consumes: 无
- Produces:
  - `dateKey(date: Date): string` — 本地 `YYYY-MM-DD`
  - `shiftKey(key: string, days: number): string`
  - `bucketOf(todo, now?: Date, staleDays?: number): string`
  - `compareTodos(a, b): number`
  - `summarize(items, now?): { today, tomorrow, week, stale, unplanned, doneToday }`

- [ ] **Step 1: 写失败测试**

`test/bucket.test.js`:

```js
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

test('明天、本周分桶；下周之后不因截止日而进积压', () => {
  assert.equal(bucketOf({ ...base, dueDate: '2026-10-23' }, NOW), 'tomorrow')
  assert.equal(bucketOf({ ...base, dueDate: '2026-10-25' }, NOW), 'week')
  // 截止日在遥远未来、但才创建一天：不是积压（spec §4.3：积压只看创建时长）
  assert.equal(bucketOf({ ...base, dueDate: '2026-10-26' }, NOW), 'unplanned')
})

test('截止日在遥远未来、但创建超过阈值，仍算积压', () => {
  const old = new Date(2026, 9, 10, 9).toISOString()
  assert.equal(bucketOf({ ...base, createdAt: old, dueDate: '2026-12-01' }, NOW, 7), 'stale')
})

test('无截止：7 天内未排期，超过进积压', () => {
  assert.equal(bucketOf({ ...base }, NOW, 7), 'unplanned')
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
    today: 2, tomorrow: 0, week: 0, stale: 1, unplanned: 0, doneToday: 1,
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `node --testbucket.test.js`
Expected: FAIL，`Cannot find module '../lib/bucket.js'`

- [ ] **Step 3: 实现 `lib/bucket.js`**

```js
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

/** Bucket of one record relative to `now`: today|tomorrow|week|stale|unplanned|done. */
export function bucketOf(todo, now = new Date(), staleDays = 7) {
  if (todo.done) return 'done'
  const today = dateKey(now)
  const due = todo.dueDate
  if (typeof due === 'string' && due !== '') {
    if (due <= today) return 'today'
    if (due === shiftKey(today, 1)) return 'tomorrow'
    const weekEnd = shiftKey(today, (7 - now.getDay()) % 7)
    if (due <= weekEnd) return 'week'
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
  const out = { today: 0, tomorrow: 0, week: 0, stale: 0, unplanned: 0, doneToday: 0 }
  const today = dateKey(now)
  for (const item of items) {
    if (item.bucket === 'done') {
      if (item.doneAt && dateKey(new Date(item.doneAt)) === today) out.doneToday += 1
      continue
    }
    if (item.bucket in out) out[item.bucket] += 1
  }
  return out
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node --testbucket.test.js`
Expected: PASS，8 个测试全绿。

- [ ] **Step 5: 提交**

```bash
git add lib/bucket.js test/bucket.test.js
git commit -m "feat: 待办分组与排序纯函数"
```

---

## Task 3: 记录校验与存储层

**Files:**
- Create: `lib/model.js`, `lib/store.js`
- Test: `test/store.test.js`

**Interfaces:**
- Consumes: `bucketOf`, `compareTodos`, `summarize`（Task 2）
- Produces:
  - `TodoError`（`code` + 中文 `message`）
  - `normalizeCreate(input): Todo`、`applyPatch(todo, patch): Todo`
  - `createStore({ file, staleDays }): Store`
  - `Store.load(): Promise<void>`、`Store.list(filter?): Promise<{ items, summary }>`、`Store.create(input)`、`Store.update(id, patch)`、`Store.complete(id, done?)`、`Store.remove(id)`、`Store.close()`

- [ ] **Step 1: 写失败测试**

`test/store.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStore } from '../lib/store.js'
import { TodoError } from '../lib/model.js'

async function tempStore(staleDays = 7) {
  const dir = await mkdtemp(join(tmpdir(), 'todo-'))
  const file = join(dir, 'todos.json')
  const store = createStore({ file, staleDays })
  await store.load()
  return { store, file, dir }
}

test('新建后能读回，字段齐全', async () => {
  const { store } = await tempStore()
  const todo = await store.create({ title: '交周报', dueDate: '2026-10-22', priority: 'high' })
  assert.equal(todo.title, '交周报')
  assert.equal(todo.done, false)
  assert.equal(todo.bucket, 'today')
  assert.ok(todo.id.startsWith('t_'))

  const { items } = await store.list()
  assert.equal(items.length, 1)
  assert.equal(items[0].id, todo.id)
  await store.close()
})

test('落盘后重建 store 仍能读到', async () => {
  const { store, file } = await tempStore()
  await store.create({ title: '续签域名' })
  await store.close()

  const again = createStore({ file })
  await again.load()
  const { items } = await again.list()
  assert.equal(items.length, 1)
  assert.equal(items[0].title, '续签域名')
  await again.close()
})

test('完成写 doneAt，取消完成清空', async () => {
  const { store } = await tempStore()
  const todo = await store.create({ title: '预约体检' })
  const done = await store.complete(todo.id, true)
  assert.equal(done.done, true)
  assert.ok(done.doneAt)
  const undone = await store.complete(todo.id, false)
  assert.equal(undone.done, false)
  assert.equal(undone.doneAt, null)
  await store.close()
})

test('update 只改允许的字段', async () => {
  const { store } = await tempStore()
  const todo = await store.create({ title: '整理预算表' })
  const next = await store.update(todo.id, { title: '整理 Q4 预算表', priority: 'medium', id: 'hack', createdAt: 'x' })
  assert.equal(next.title, '整理 Q4 预算表')
  assert.equal(next.priority, 'medium')
  assert.equal(next.id, todo.id)
  assert.notEqual(next.createdAt, 'x')
  await store.close()
})

test('删除后不再返回', async () => {
  const { store } = await tempStore()
  const todo = await store.create({ title: 'x' })
  await store.remove(todo.id)
  const { items } = await store.list()
  assert.equal(items.length, 0)
  await store.close()
})

test('空标题与非法日期被拒绝', async () => {
  const { store } = await tempStore()
  await assert.rejects(() => store.create({ title: '   ' }), (err) => err instanceof TodoError && err.code === 'invalid-input')
  await assert.rejects(() => store.create({ title: 'x', dueDate: '2026/10/22' }), (err) => err.code === 'invalid-input')
  await assert.rejects(() => store.update('nope', { title: 'y' }), (err) => err.code === 'not-found')
  await store.close()
})

test('文件损坏时备份并空表启动', async () => {
  const { store, file, dir } = await tempStore()
  await store.create({ title: 'a' })
  await store.close()

  await writeFile(file, '{ this is not json', 'utf8')
  const broken = createStore({ file })
  const info = await broken.load()
  assert.equal(info.corrupt, true)
  const { items, notices } = await broken.list()
  assert.equal(items.length, 0)
  assert.deepEqual(notices, ['corrupt'])
  const names = await readdir(dir)
  assert.ok(names.some((n) => n.startsWith('todos.corrupt-')), 'corrupt backup written')
  await broken.close()
})

test('list 支持 view 与 q 过滤', async () => {
  const { store } = await tempStore()
  await store.create({ title: '交周报', dueDate: '2026-10-22' })
  await store.create({ title: '买牛奶' })
  const byText = await store.list({ q: '牛奶' })
  assert.deepEqual(byText.items.map((t) => t.title), ['买牛奶'])
  const onlyToday = await store.list({ view: 'today' })
  assert.deepEqual(onlyToday.items.map((t) => t.title), ['交周报'])
  await store.close()
})

test('并发写不会丢（串行队列）', async () => {
  const { store, file } = await tempStore()
  await Promise.all(Array.from({ length: 20 }, (_, i) => store.create({ title: `t${i}` })))
  const raw = JSON.parse(await readFile(file, 'utf8'))
  assert.equal(raw.todos.length, 20)
  await store.close()
})
```

- [ ] **Step 2: 运行确认失败**

Run: `node --teststore.test.js`
Expected: FAIL，`Cannot find module '../lib/store.js'`

- [ ] **Step 3: 实现 `lib/model.js`**

```js
/** Record validation and normalization for todo entries. */

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

export function normalizeCreate(input = {}) {
  const title = text(input.title, 200, '标题')
  if (title === '') throw new TodoError('invalid-input', '标题不能为空')
  const now = new Date().toISOString()
  return {
    id: newId(),
    title,
    note: text(input.note, 2000, '备注'),
    priority: pickPriority(input.priority),
    category: nullableText(input.category, 24, '分类'),
    dueDate: pickDate(input.dueDate),
    dueTime: pickTime(input.dueTime),
    done: false,
    doneAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

const PATCHABLE = new Set(['title', 'note', 'priority', 'category', 'dueDate', 'dueTime'])

export function applyPatch(todo, patch = {}) {
  const next = { ...todo }
  for (const key of Object.keys(patch)) {
    if (!PATCHABLE.has(key)) continue
    if (key === 'title') {
      const value = text(patch.title, 200, '标题')
      if (value === '') throw new TodoError('invalid-input', '标题不能为空')
      next.title = value
    } else if (key === 'note') next.note = text(patch.note, 2000, '备注')
    else if (key === 'priority') next.priority = pickPriority(patch.priority)
    else if (key === 'category') next.category = nullableText(patch.category, 24, '分类')
    else if (key === 'dueDate') next.dueDate = pickDate(patch.dueDate)
    else if (key === 'dueTime') next.dueTime = pickTime(patch.dueTime)
  }
  next.updatedAt = new Date().toISOString()
  return next
}
```

- [ ] **Step 4: 实现 `lib/store.js`**

```js
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
```

- [ ] **Step 5: 运行确认通过**

Run: `node --teststore.test.js`
Expected: PASS，9 个测试全绿。

- [ ] **Step 6: 提交**

```bash
git add lib/model.js lib/store.js test/store.test.js
git commit -m "feat: 待办存储层，原子写与损坏恢复"
```

---

## Task 4: HTTP 路由

**Files:**
- Create: `lib/api.js`
- Modify: `index.js`（整份替换）
- Test: `test/api.test.js`

**Interfaces:**
- Consumes: `createStore`、`resolveDataFile`（Task 3）
- Produces: `createApi(store): Record<string, (input) => Promise<unknown>>`，方法名固定为 `list` / `create` / `update` / `complete` / `remove`

- [ ] **Step 1: 写失败测试**

`test/api.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStore } from '../lib/store.js'
import { createApi } from '../lib/api.js'
import { TodoError } from '../lib/model.js'

async function makeApi() {
  const dir = await mkdtemp(join(tmpdir(), 'todo-api-'))
  const store = createStore({ file: join(dir, 'todos.json') })
  await store.load()
  return { api: createApi(store), store }
}

test('create → list → complete → remove 全链路', async () => {
  const { api, store } = await makeApi()
  const created = await api.create({ title: '交周报' })
  const listed = await api.list({})
  assert.equal(listed.items.length, 1)
  const done = await api.complete({ id: created.id, done: true })
  assert.equal(done.done, true)
  const removed = await api.remove({ id: created.id })
  assert.deepEqual(removed, { id: created.id })
  await store.close()
})

test('update 接受 { id, patch } 与扁平两种形状', async () => {
  const { api, store } = await makeApi()
  const created = await api.create({ title: 'a' })
  const one = await api.update({ id: created.id, patch: { title: 'b' } })
  assert.equal(one.title, 'b')
  const two = await api.update({ id: created.id, title: 'c' })
  assert.equal(two.title, 'c')
  await store.close()
})

test('错误带 code，未知 id 是 not-found', async () => {
  const { api, store } = await makeApi()
  await assert.rejects(() => api.remove({ id: 'ghost' }), (err) => err instanceof TodoError && err.code === 'not-found')
  await store.close()
})
```

- [ ] **Step 2: 运行确认失败**

Run: `node --testapi.test.js`
Expected: FAIL，`Cannot find module '../lib/api.js'`

- [ ] **Step 3: 实现 `lib/api.js`**

```js
/** One dispatch table shared by the HTTP route and the agent tool. */

export function createApi(store) {
  return {
    list: (input = {}) => store.list(input),
    create: (input = {}) => store.create(input),
    update: (input = {}) => {
      const patch = input.patch ?? stripKeys(input, ['id', 'patch'])
      return store.update(input.id, patch)
    },
    complete: (input = {}) => store.complete(input.id, input.done !== false),
    remove: (input = {}) => store.remove(input.id),
  }
}

function stripKeys(input, keys) {
  const out = {}
  for (const [key, value] of Object.entries(input)) {
    if (!keys.includes(key)) out[key] = value
  }
  return out
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node --testapi.test.js`
Expected: PASS，3 个测试全绿。

- [ ] **Step 5: 用真实路由替换 `index.js`**

```js
/** Host half of the todo bundle: data file, HTTP route, agent tool. */

import { createStore, resolveDataFile } from './lib/store.js'
import { createApi } from './lib/api.js'

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
  const store = createStore({
    file: resolveDataFile(config.dataPath),
    staleDays: Number.isInteger(config.staleDays) ? config.staleDays : 7,
  })
  const ready = store.load()
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

  ctx.effect(() => () => { void store.close() }, 'dsh-todolist: store')
}
```

- [ ] **Step 6: 语法检查并重装**

Run: `node --check index.js; node --check lib/api.js`
Expected: 退出码 0。
再执行 `plugin_manager` `install_bundle`（`target: D:\dsh-todolist`）。

- [ ] **Step 7: 真实请求验证**

在 `D:\dsh-todolist` 下用 Node 打一次真实请求（端口取自当前 GUI 地址的 origin）：

```bash
node -e "fetch('http://127.0.0.1:54843/todo/api/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'路由连通性测试'})}).then(r=>r.text()).then(console.log)"
```

Expected: `{"ok":true,"result":{...}}`，且 `%DSH_PROFILE_DIR%/data/dsh-todolist/todos.json` 出现该条。
若返回 `{"ok":false,"error":{"code":"forbidden"}}`，说明 `requestRejection` 判定为非本页来源——这在命令行请求下是**预期行为**，改用浏览器面板验证（Task 6 之后）。

- [ ] **Step 8: 提交**

```bash
git add lib/api.js index.js test/api.test.js
git commit -m "feat: 待办 HTTP 路由与分发"
```

---

## Task 5: agent 工具 `personal_todo`

**Files:**
- Create: `lib/tool.js`
- Modify: `index.js`（在 `apply` 内追加工具注册）
- Test: `test/tool.test.js`

**Interfaces:**
- Consumes: `createApi`（Task 4）
- Produces: `createTool(api, ready): ToolDefinition`，工具名 `personal_todo`，参数 `{ action, ... }`

- [ ] **Step 1: 写失败测试**

`test/tool.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStore } from '../lib/store.js'
import { createApi } from '../lib/api.js'
import { createTool } from '../lib/tool.js'

async function tool() {
  const dir = await mkdtemp(join(tmpdir(), 'todo-tool-'))
  const store = createStore({ file: join(dir, 'todos.json') })
  const ready = store.load()
  return { tool: createTool(createApi(store), ready), store }
}

test('add 返回新记录与摘要', async () => {
  const { tool, store } = await tool()
  const out = await tool.execute({ action: 'add', title: '交周报', dueDate: '2026-10-22' }, {})
  assert.equal(out.item.title, '交周报')
  assert.equal(out.summary.today, 1)
  await store.close()
})

test('list 默认只给未完成', async () => {
  const { tool, store } = await tool()
  const a = await tool.execute({ action: 'add', title: 'a' }, {})
  await tool.execute({ action: 'complete', id: a.item.id }, {})
  const out = await tool.execute({ action: 'list' }, {})
  assert.equal(out.items.length, 0)
  const all = await tool.execute({ action: 'list', view: 'done' }, {})
  assert.equal(all.items.length, 1)
  await store.close()
})

test('未知 action 报错', async () => {
  const { tool, store } = await tool()
  await assert.rejects(() => tool.execute({ action: 'nope' }, {}), /不支持的 action/)
  await store.close()
})

test('render 产出文本块', async () => {
  const { tool, store } = await tool()
  const out = await tool.execute({ action: 'add', title: 'x' }, {})
  const blocks = tool.output.render({ action: 'add' }, out)
  assert.equal(blocks[0].type, 'text')
  assert.match(blocks[0].text, /x/)
  await store.close()
})
```

- [ ] **Step 2: 运行确认失败**

Run: `node --testtool.test.js`
Expected: FAIL，`Cannot find module '../lib/tool.js'`

- [ ] **Step 3: 实现 `lib/tool.js`**

```js
/** The `personal_todo` agent tool: same dispatch table the UI calls. */

import { TodoError } from './model.js'
import { summarize } from './bucket.js'

const ACTIONS = ['list', 'add', 'update', 'complete', 'delete']

function describe(item) {
  const due = item.dueDate ? `（截止 ${item.dueDate}${item.dueTime ? ' ' + item.dueTime : ''}）` : ''
  const flag = item.bucket === 'stale' ? '【积压】' : ''
  return `- ${item.done ? '[x]' : '[ ]'} ${item.title}${due}${flag}`
}

export function createTool(api, ready) {
  async function run(input = {}) {
    await ready
    const action = input.action
    if (!ACTIONS.includes(action)) {
      throw new TodoError('invalid-input', `不支持的 action：${String(action)}，可用 ${ACTIONS.join(' / ')}`)
    }
    if (action === 'list') return api.list(input)
    if (action === 'add') {
      const { action: _a, ...fields } = input
      const item = await api.create(fields)
      return { item, summary: summarize((await api.list({ view: 'open' })).items) }
    }
    if (action === 'update') {
      const { action: _a, id, ...patch } = input
      const item = await api.update({ id, patch })
      return { item }
    }
    if (action === 'complete') {
      const item = await api.complete({ id: input.id, done: input.done !== false })
      return { item }
    }
    const removed = await api.remove({ id: input.id })
    return { removed }
  }

  return {
    name: 'personal_todo',
    description:
      '读写用户本人的日常工作待办清单（与 DSH 会话无关）。' +
      'action=list 查询；add 新建；update 修改；complete 勾选/取消；delete 删除。' +
      '只在用户明确要求记录、查询或更新待办时调用，不要用它记录当前会话的任务步骤。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ACTIONS, description: '要执行的操作' },
        id: { type: 'string', description: '待办 id（update / complete / delete 必填）' },
        title: { type: 'string', description: '标题' },
        note: { type: 'string', description: '备注' },
        priority: { type: 'string', enum: ['high', 'medium', 'low'], description: '优先级' },
        category: { type: 'string', description: '分类，如 工作 / 生活' },
        dueDate: { type: 'string', description: '截止日期 YYYY-MM-DD' },
        dueTime: { type: 'string', description: '截止时间 HH:mm' },
        view: { type: 'string', enum: ['open', 'today', 'week', 'stale', 'done'], description: 'list 的过滤视图' },
        q: { type: 'string', description: 'list 的关键词' },
        done: { type: 'boolean', description: 'complete 时传 false 表示取消完成' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object' },
      render(_args, value) {
        if (Array.isArray(value?.items)) {
          const lines = value.items.map(describe)
          const s = value.summary ?? {}
          const head = `待办：今天 ${s.today ?? 0} · 积压 ${s.stale ?? 0} · 未排期 ${s.unplanned ?? 0}`
          return [{ type: 'text', text: [head, ...lines].join('\n') }]
        }
        if (value?.item) return [{ type: 'text', text: `已保存：${value.item.title}` }]
        if (value?.removed) return [{ type: 'text', text: '已删除' }]
        return [{ type: 'text', text: JSON.stringify(value) }]
      },
    },
    execute: run,
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node --testtool.test.js`
Expected: PASS，4 个测试全绿。

- [ ] **Step 5: 在 `index.js` 里注册工具**

在 `apply` 末尾、`ctx.effect(() => () => { void store.close() }, ...)` 之前插入：

```js
  ctx.effect(() => ctx.tools.register(createTool(api, ready)), 'dsh-todolist: tool')
```

并在文件顶部补 import：

```js
import { createTool } from './lib/tool.js'
```

- [ ] **Step 6: 语法检查并重装**

Run: `node --check index.js`
Expected: 退出码 0。
执行 `plugin_manager` `install_bundle`（`target: D:\dsh-todolist`）。

- [ ] **Step 7: 确认真实工具已可见**

`cordis_inspect_query`（host / Tool / `listTools`），在返回里找 `personal_todo`。
Expected: 存在，`parameters.required == ["action"]`，`enum` 含 5 个 action。

- [ ] **Step 8: 提交**

```bash
git add lib/tool.js index.js test/tool.test.js
git commit -m "feat: personal_todo 工具，与 UI 共用同一套分发"
```

---

## Task 6: 待办页（只读渲染）

**Files:**
- Modify: `client.js`（整份替换）

**Interfaces:**
- Consumes: `POST todo/api/{list,create,update,complete,remove}`（Task 4）
- Produces: `TodoPage` 组件；`fetchApi(method, payload)` 辅助函数（Task 7 复用）

- [ ] **Step 1: 替换 `client.js` 为只读版本**

```js
window.__ModuleLoader__.load({
  id: 'dsh-todolist',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useCallback } = React

    const NS = 'dsh-todolist'
    const dict = {
      zh: {
        nav: '待办', title: '待办', new: '新建', search: '搜索待办',
        today: '今天', tomorrow: '明天', week: '本周', stale: '积压',
        unplanned: '未排期', done: '已完成', empty: '还没有待办',
        staleHint: '超过 7 天未完成', loading: '加载中…', failed: '读取失败',
        retry: '重试', pickOne: '选一条看详情',
        corruptNotice: '数据文件损坏，已备份并以空清单启动',
      },
      en: {
        nav: 'To-do', title: 'To-do', new: 'New', search: 'Search',
        today: 'Today', tomorrow: 'Tomorrow', week: 'This week', stale: 'Backlog',
        unplanned: 'Unscheduled', done: 'Completed', empty: 'No todos yet',
        staleHint: 'Open for more than 7 days', loading: 'Loading…', failed: 'Failed to load',
        retry: 'Retry', pickOne: 'Select an item',
        corruptNotice: 'Data file was corrupt; it is backed up and the list started empty.',
      },
    }
    const ORDER = ['today', 'tomorrow', 'week', 'stale', 'unplanned', 'done']

    function apiUrl(method) {
      return new URL(`todo/api/${method}`, document.baseURI).href
    }

    async function fetchApi(method, payload) {
      const res = await fetch(apiUrl(method), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload ?? {}),
      })
      const body = await res.json().catch(() => ({ ok: false, error: { message: '响应不是 JSON' } }))
      if (!body.ok) throw new Error(body.error?.message ?? '请求失败')
      return body.result
    }

    const S = {
      page: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, color: 'var(--dsw-alias-label-primary)' },
      head: { display: 'flex', alignItems: 'center', gap: 10, height: 56, padding: '0 20px', flex: 'none', borderBottom: '0.5px solid var(--dsw-alias-border-l2)' },
      h1: { fontSize: 17, fontWeight: 600, margin: 0 },
      count: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' },
      grow: { flex: 1 },
      search: { width: 200, height: 32, padding: '0 10px', borderRadius: 8, border: 'none', fontSize: 12.5, background: 'var(--dsw-alias-bg-module-platform)', color: 'var(--dsw-alias-label-primary)' },
      body: { display: 'flex', flex: 1, minHeight: 0 },
      list: { flex: 1, minWidth: 0, overflowY: 'auto', padding: '10px 8px 10px 12px' },
      sec: { display: 'flex', alignItems: 'center', gap: 8, height: 30, padding: '0 8px', marginTop: 6 },
      secT: { fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)' },
      secN: { fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' },
      line: { flex: 1, height: '0.5px', background: 'var(--dsw-alias-border-l2)' },
      row: { display: 'flex', alignItems: 'center', gap: 9, height: 34, padding: '0 8px', borderRadius: 6, cursor: 'pointer' },
      cb: { width: 14, height: 14, borderRadius: 4, border: '0.5px solid var(--dsw-alias-border-l4)', flex: 'none', background: 'var(--dsw-alias-bg-layer-1)' },
      cbDone: { width: 14, height: 14, borderRadius: 4, flex: 'none', background: 'var(--dsw-alias-state-business-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
      nm: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13.5 },
      nmDone: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13.5, color: 'var(--dsw-alias-label-tertiary)', textDecoration: 'line-through' },
      tag: { fontSize: 10.5, padding: '0 6px', borderRadius: 4, color: 'var(--dsw-alias-label-secondary)', background: 'var(--dsw-alias-bg-module-platform)', flex: 'none' },
      due: { fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', flex: 'none', minWidth: 52, textAlign: 'right' },
      dueLate: { fontSize: 11, color: 'var(--dsw-alias-state-error-primary)', flex: 'none', minWidth: 52, textAlign: 'right' },
      detail: { width: 300, flex: 'none', borderLeft: '0.5px solid var(--dsw-alias-border-l2)', padding: 16, fontSize: 12.5, color: 'var(--dsw-alias-label-secondary)' },
      empty: { padding: 40, textAlign: 'center', color: 'var(--dsw-alias-label-tertiary)', fontSize: 13 },
      error: { margin: 12, padding: '8px 12px', borderRadius: 8, fontSize: 12, color: 'var(--dsw-alias-state-error-primary)', background: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent)' },
      warn: { margin: 12, padding: '8px 12px', borderRadius: 8, fontSize: 12, color: 'var(--dsw-alias-state-warn-primary)', background: 'color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, transparent)' },
    }

    function priorityDot(priority) {
      const bg = priority === 'high' ? 'var(--dsw-alias-state-error-primary)'
        : priority === 'medium' ? 'var(--dsw-alias-state-warn-primary)'
          : priority === 'low' ? 'var(--dsw-static-blue-450)' : 'transparent'
      return h('span', { style: { width: 5, height: 5, borderRadius: '50%', background: bg, flex: 'none' } })
    }

    function dueLabel(item) {
      if (!item.dueDate) return ''
      if (item.dueTime) return `${item.dueDate.slice(5)} ${item.dueTime}`
      return item.dueDate.slice(5)
    }

    function Row({ item, selected, onSelect, t }) {
      const today = new Date()
      const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      const late = !item.done && item.dueDate && item.dueDate < todayKey
      return h('div', {
        style: { ...S.row, background: selected ? 'var(--dsw-alias-interactive-bg-hover)' : 'transparent' },
        onClick: () => onSelect(item.id),
        onMouseEnter: (e) => { if (!selected) e.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover)' },
        onMouseLeave: (e) => { if (!selected) e.currentTarget.style.background = 'transparent' },
      },
      item.done
        ? h('span', { style: S.cbDone }, h('svg', { width: 9, height: 9, viewBox: '0 0 16 16', fill: 'none', stroke: '#fff', strokeWidth: 2.4 }, h('path', { d: 'M3.4 8.4 6.2 11l6.4-6.4', strokeLinecap: 'round', strokeLinejoin: 'round' })))
        : h('span', { style: S.cb }),
      h('span', { style: item.done ? S.nmDone : S.nm }, item.title),
      item.priority ? priorityDot(item.priority) : null,
      item.category ? h('span', { style: S.tag }, item.category) : null,
      h('span', { style: late ? S.dueLate : S.due }, item.bucket === 'stale' ? `${t('stale')} ${item.dueDate ?? ''}`.trim() : dueLabel(item)),
      )
    }

    function TodoPage(props) {
      const t = props.t ?? ((key) => dict.zh[key] ?? key)
      const [state, setState] = useState({ loading: true, error: null, items: [], summary: {}, notices: [] })
      const [query, setQuery] = useState('')
      const [selected, setSelected] = useState(null)

      const reload = useCallback(async () => {
        try {
          const result = await fetchApi('list', query ? { q: query } : {})
          setState({ loading: false, error: null, items: result.items, summary: result.summary, notices: result.notices ?? [] })
        } catch (err) {
          setState((prev) => ({ ...prev, loading: false, error: err.message }))
        }
      }, [query])

      useEffect(() => { void reload() }, [reload])

      useEffect(() => {
        const timer = window.setInterval(() => { void reload() }, 2500)
        return () => window.clearInterval(timer)
      }, [reload])

      const groups = ORDER
        .map((bucket) => ({ bucket, items: state.items.filter((item) => item.bucket === bucket) }))
        .filter((group) => group.items.length > 0)
      const selectedItem = state.items.find((item) => item.id === selected) ?? null

      return h('div', { style: S.page },
        h('div', { style: S.head },
          h('h2', { style: S.h1 }, t('title')),
          h('span', { style: S.count }, `${t('today')} ${state.summary.today ?? 0} · ${t('stale')} ${state.summary.stale ?? 0}`),
          h('div', { style: S.grow }),
          h('input', {
            style: S.search, placeholder: t('search'), value: query,
            onChange: (e) => setQuery(e.target.value),
          }),
        ),
        state.notices.includes('corrupt') ? h('div', { style: S.warn }, t('corruptNotice')) : null,
        state.error ? h('div', { style: S.error }, `${t('failed')}：${state.error}　`, h('button', { onClick: () => void reload() }, t('retry'))) : null,
        h('div', { style: S.body },
          h('div', { style: S.list },
            state.loading && state.items.length === 0
              ? h('div', { style: S.empty }, t('loading'))
              : groups.length === 0
                ? h('div', { style: S.empty }, t('empty'))
                : groups.map((group) => h('div', { key: group.bucket },
                  h('div', { style: S.sec },
                    h('span', { style: S.secT }, t(group.bucket)),
                    h('span', { style: S.secN }, String(group.items.length)),
                    group.bucket === 'stale' ? h('span', { style: { ...S.tag, color: 'var(--dsw-alias-state-error-primary)' } }, t('staleHint')) : null,
                    h('span', { style: S.line }),
                  ),
                  group.items.map((item) => h(Row, {
                    key: item.id, item, t,
                    selected: item.id === selected,
                    onSelect: setSelected,
                  })),
                )),
          ),
          h('div', { style: S.detail },
            selectedItem
              ? h('div', null,
                h('div', { style: { fontSize: 15, fontWeight: 600, color: 'var(--dsw-alias-label-primary)', marginBottom: 12 } }, selectedItem.title),
                selectedItem.note ? h('div', { style: { marginBottom: 10, lineHeight: '20px' } }, selectedItem.note) : null,
                h('div', { style: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 12 } },
                  [
                    selectedItem.priority ? `优先级 ${selectedItem.priority}` : null,
                    selectedItem.dueDate ? `截止 ${selectedItem.dueDate}${selectedItem.dueTime ? ' ' + selectedItem.dueTime : ''}` : null,
                    selectedItem.category ? selectedItem.category : null,
                  ].filter(Boolean).join(' · ')),
              )
              : h('div', { style: { color: 'var(--dsw-alias-label-tertiary)' } }, t('pickOne')),
          ),
        ),
      )
    }

    function TodoIcon({ size = 16 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.4, 'aria-hidden': true,
      },
      h('rect', { x: 2.4, y: 2.4, width: 11.2, height: 11.2, rx: 2.4 }),
      h('path', { d: 'M5.4 8.2l1.9 1.9 3.4-3.6', strokeLinecap: 'round', strokeLinejoin: 'round' }))
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const locale = ctx.get('locale')
        let t = (key) => dict.zh[key] ?? key
        if (locale) {
          ctx.effect(() => locale.register(NS, dict), 'dsh-todolist: dictionaries')
          t = locale.bind(NS)
        }

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: 'todo', order: 20,
          label: () => t('nav'), locale: NS, inject: () => ({ t }),
        }, ({ size } = {}) => h(TodoIcon, { size: size ?? 16 })))

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main', key: 'todo', locale: NS, inject: () => ({ t }),
        }, TodoPage))
      },
    }
  },
})
```

- [ ] **Step 2: 语法检查**

Run: `node --check client.js`
Expected: 退出码 0。

- [ ] **Step 3: 重装并肉眼验证**

执行 `plugin_manager` `install_bundle`（`target: D:\dsh-todolist`），然后：
1. 侧栏「新会话」下方出现「待办」行，位于「定时任务」之下、「工作区」之上。
2. 点开是待办页，空库时显示「还没有待办」。
3. 用 Task 4 Step 7 的 `node -e` 直接往数据文件写一条（或手工编辑 JSON），等 2.5 秒页面自动出现该条，分组为「今天/未排期」正确。
4. 侧栏折叠时该入口变成图标，不溢出。

- [ ] **Step 4: 提交**

```bash
git add client.js
git commit -m "feat: 待办页只读渲染，分组列表与详情"
```

---

## Task 7: 待办页交互

**Files:**
- Modify: `client.js`

**Interfaces:**
- Consumes: `fetchApi`、`S`、`Row`、`TodoPage`（Task 6）
- Produces: 完整的增删改查交互；`TodoPage` 对外契约不变

- [ ] **Step 1: 在 `client.js` 顶部字典补文案**

两个语言各补这些键：

```js
// zh
addPlaceholder: '写点什么，回车保存', save: '保存', cancel: '取消',
complete: '完成', reopen: '撤销完成', remove: '删除', confirmRemove: '确认删除',
note: '备注', priority: '优先级', dueDate: '截止日期', dueTime: '时间', category: '分类',
emptyHint: '新建第一条',
// en
addPlaceholder: 'What needs doing? Enter to save', save: 'Save', cancel: 'Cancel',
complete: 'Complete', reopen: 'Reopen', remove: 'Delete', confirmRemove: 'Confirm delete',
note: 'Note', priority: 'Priority', dueDate: 'Due date', dueTime: 'Time', category: 'Category',
emptyHint: 'Create the first one',
```

- [ ] **Step 2: 重写 `Row`，复选框可点击**

把 Task 6 的整个 `Row` 函数替换成下面这版（鼠标悬停高亮改用 `onMouseEnter`/`onMouseLeave` 的本地状态，避免直接写 `style` 造成的残留）：

```js
    function Row({ item, selected, onSelect, onToggle, t }) {
      const [hover, setHover] = useState(false)
      const today = new Date()
      const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      const late = !item.done && item.dueDate && item.dueDate < todayKey
      return h('div', {
        style: { ...S.row, background: selected || hover ? 'var(--dsw-alias-interactive-bg-hover)' : 'transparent' },
        onClick: () => onSelect(item.id),
        onMouseEnter: () => setHover(true),
        onMouseLeave: () => setHover(false),
      },
      h('span', {
        role: 'checkbox',
        'aria-checked': item.done ? 'true' : 'false',
        tabIndex: 0,
        style: item.done ? S.cbDone : S.cb,
        onClick: (e) => { e.stopPropagation(); onToggle(item) },
        onKeyDown: (e) => { if (e.key === ' ' || e.key === 'Enter') { e.stopPropagation(); onToggle(item) } },
      }, item.done
        ? h('svg', { width: 9, height: 9, viewBox: '0 0 16 16', fill: 'none', stroke: '#fff', strokeWidth: 2.4 },
            h('path', { d: 'M3.4 8.4 6.2 11l6.4-6.4', strokeLinecap: 'round', strokeLinejoin: 'round' }))
        : null),
      h('span', { style: item.done ? S.nmDone : S.nm }, item.title),
      item.priority ? priorityDot(item.priority) : null,
      item.category ? h('span', { style: S.tag }, item.category) : null,
      h('span', { style: late ? S.dueLate : S.due }, item.bucket === 'stale' ? `${t('stale')} ${item.dueDate ?? ''}`.trim() : dueLabel(item)),
      )
    }
```

- [ ] **Step 3: 在 `TodoPage` 里接上写操作**

在 `reload` 之后加：

```js
      const mutate = useCallback(async (method, payload) => {
        try {
          await fetchApi(method, payload)
          await reload()
        } catch (err) {
          setState((prev) => ({ ...prev, error: err.message }))
        }
      }, [reload])

      const [draft, setDraft] = useState(null) // null | '' | string
      const [confirming, setConfirming] = useState(false)

      const submitDraft = useCallback(async () => {
        if (draft === null) return
        const title = draft.trim()
        if (title === '') { setDraft(null); return }
        await mutate('create', { title })
        setDraft(null)
      }, [draft, mutate])
```

- [ ] **Step 4: 页头加「+ 新建」并把草稿行插到列表最上面**

页头 `input` 之前插入按钮：

```js
          h('button', {
            style: { height: 32, padding: '0 12px', borderRadius: 8, border: '0.5px solid var(--dsw-alias-border-l3)', background: 'var(--dsw-alias-button-elevated-fill)', color: 'var(--dsw-alias-label-primary)', fontSize: 13, cursor: 'pointer' },
            onClick: () => { setDraft(''); setSelected(null) },
          }, `+ ${t('new')}`),
```

列表最前面插入草稿行（`groups.length === 0` 分支之前）：

```js
            draft !== null ? h('div', { style: S.sec },
              h('input', {
                autoFocus: true, value: draft, placeholder: t('addPlaceholder'),
                style: { ...S.search, width: '100%' },
                onChange: (e) => setDraft(e.target.value),
                onKeyDown: (e) => {
                  if (e.key === 'Enter') void submitDraft()
                  if (e.key === 'Escape') setDraft(null)
                },
              }),
            ) : null,
```

- [ ] **Step 5: 详情列加完成 / 删除**

替换 `S.detail` 里 `selectedItem` 分支，在信息行后追加：

```js
                h('div', { style: { display: 'flex', gap: 8, marginTop: 14 } },
                  h('button', {
                    style: { flex: 1, height: 32, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--dsw-alias-state-business-primary)', color: '#fff', fontSize: 12.5 },
                    onClick: () => void mutate('complete', { id: selectedItem.id, done: !selectedItem.done }),
                  }, selectedItem.done ? t('reopen') : t('complete')),
                  h('button', {
                    style: { flex: 1, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: 12.5, border: '0.5px solid var(--dsw-alias-border-l3)', background: 'transparent', color: confirming ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-label-secondary)' },
                    onClick: async () => {
                      if (!confirming) { setConfirming(true); window.setTimeout(() => setConfirming(false), 3000); return }
                      setConfirming(false)
                      setSelected(null)
                      await mutate('remove', { id: selectedItem.id })
                    },
                  }, confirming ? t('confirmRemove') : t('remove')),
                ),
```

`onToggle` 传给每个 `Row`：

```js
                  onToggle: (item) => { void mutate('complete', { id: item.id, done: !item.done }) },
```

- [ ] **Step 6: 语法检查并重装**

Run: `node --check client.js`
Expected: 退出码 0。
执行 `plugin_manager` `install_bundle`，然后刷新页面（客户端代码变更需要重建/刷新）。

- [ ] **Step 7: 交互验收**

1. 点「+ 新建」→ 输入标题 → 回车：新条目出现在「未排期」或对应分组。
2. 点复选框：条目移动到「已完成」，2.5 秒内不变回。
3. 点条目看详情 → 点「完成」→ 详情按钮变成「撤销完成」。
4. 点「删除」→ 变成「确认删除」→ 再点删除，条目消失。
5. 切换会话、切到「插件」页再切回「待办」：状态正常，无报错。

- [ ] **Step 8: 提交**

```bash
git add client.js
git commit -m "feat: 待办页增删改查交互"
```

---

## Task 8: 自然语言解析器（纯函数）

**Files:**
- Create: `lib/quickadd.js`
- Test: `test/quickadd.test.js`

**Interfaces:**
- Consumes: 无
- Produces: `parseQuickAdd(text, options?): { title, dueDate, dueTime, priority, category, matched }`，`options.today` 为本地 `YYYY-MM-DD`

- [ ] **Step 1: 写失败测试**

`test/quickadd.test.js`（`today` 固定为 2026-10-22，周四）：

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseQuickAdd } from '../lib/quickadd.js'

const TODAY = { today: '2026-10-22' }
const parse = (text) => parseQuickAdd(text, TODAY)

test('没有任何语法时整句都是标题', () => {
  assert.deepEqual(parse('买牛奶'), {
    title: '买牛奶', dueDate: null, dueTime: null,
    priority: null, category: null, matched: [],
  })
})

test('相对日期', () => {
  assert.equal(parse('明天交周报').dueDate, '2026-10-23')
  assert.equal(parse('后天交周报').dueDate, '2026-10-24')
  assert.equal(parse('昨天交周报').dueDate, '2026-10-21')
})

test('中文不需要空格，句中也能解析', () => {
  const out = parse('记得明天交周报给我')
  assert.equal(out.dueDate, '2026-10-23')
  assert.equal(out.title, '记得交周报给我')
})

test('星期与下周', () => {
  assert.equal(parse('周五 周会').dueDate, '2026-10-23')
  assert.equal(parse('下周三 交材料').dueDate, '2026-10-28')
})

test('N 天后与绝对日期', () => {
  assert.equal(parse('3天后 续签域名').dueDate, '2026-10-25')
  assert.equal(parse('10月25日 面试').dueDate, '2026-10-25')
  assert.equal(parse('月底 对账').dueDate, '2026-10-31')
})

test('「每周一」不能被当成日期', () => {
  const out = parse('每周一开会')
  assert.equal(out.dueDate, null)
  assert.equal(out.title, '每周一开会')
})

test('时间：显式与中文时段', () => {
  assert.equal(parse('明天 15:00 交周报').dueTime, '15:00')
  assert.equal(parse('明天下午3点 交周报').dueTime, '15:00')
  assert.equal(parse('明天下午3点半 交周报').dueTime, '15:30')
  assert.equal(parse('明天中午 吃饭').dueTime, '12:00')
})

test('只给时间不给日期时按今天', () => {
  const out = parse('下午3点 交周报')
  assert.equal(out.dueDate, '2026-10-22')
  assert.equal(out.dueTime, '15:00')
})

test('优先级', () => {
  assert.equal(parse('交周报 p1').priority, 'high')
  assert.equal(parse('交周报 p2').priority, 'medium')
  assert.equal(parse('交周报 p3').priority, 'low')
  assert.equal(parse('交周报!').priority, 'high')
})

test('分类，且不吃进 C#编程', () => {
  assert.equal(parse('交周报 #工作').category, '工作')
  const code = parse('学 C#编程')
  assert.equal(code.category, null)
  assert.equal(code.title, '学 C#编程')
})

test('多字段组合，标题只剩正文', () => {
  const out = parse('明天下午3点 交周报 #工作 p1')
  assert.deepEqual(
    { title: out.title, dueDate: out.dueDate, dueTime: out.dueTime, priority: out.priority, category: out.category },
    { title: '交周报', dueDate: '2026-10-23', dueTime: '15:00', priority: 'high', category: '工作' },
  )
  assert.equal(out.matched.length, 4)
})

test('整行都是语法时退回原文当标题', () => {
  const out = parse('明天 p1 #工作')
  assert.equal(out.title, '明天 p1 #工作')
})

test('空输入', () => {
  assert.deepEqual(parse(''), {
    title: '', dueDate: null, dueTime: null, priority: null, category: null, matched: [],
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `node --testquickadd.test.js`
Expected: FAIL，`Cannot find module '../lib/quickadd.js'`

- [ ] **Step 3: 实现 `lib/quickadd.js`**

```js
/**
 * One-line natural-language quick add.
 *
 * 剥离式解析：每识别一个片段就从原文里摘掉，剩下的就是标题；识别不了的
 * 一律留在标题里，绝不吞字符。
 * 顺序即语法：分类 → 优先级 → 日期 → 时间。
 * 模式借鉴 dsh-todos 的 quickadd.js（MIT），代码按本插件字段重写。
 */

const CN_WEEKDAY = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 0 }
const RELATIVE = { 今天: 0, 今日: 0, 明天: 1, 明日: 1, 后天: 2, 大后天: 3, 昨天: -1, 前天: -2 }

/** `#`、`pN`、`!` 必须出现在行首/空白/中文之后，避免 C#编程、p1abc 被误伤。 */
const SIGIL = '(?<=^|[\\s\\u3000-\\u303f\\u4e00-\\u9fff])'

function localKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function shift(key, days) {
  const at = parseKey(key)
  at.setDate(at.getDate() + days)
  return localKey(at)
}

function nextWeekday(todayKey, weekday) {
  const current = parseKey(todayKey).getDay()
  let delta = (weekday - current + 7) % 7
  if (delta === 0) delta = 7
  return shift(todayKey, delta)
}

export function parseQuickAdd(input, options = {}) {
  const today = options.today ?? localKey(new Date())
  let text = ` ${String(input ?? '')} `
  const matched = []

  const take = (re) => {
    const m = re.exec(text)
    if (m === null) return null
    text = `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`
    matched.push(m[0].trim())
    return m
  }

  let dueDate = null
  let dueTime = null
  let priority = null
  let category = null

  // ---- 1. 分类
  const tag = take(new RegExp(`${SIGIL}#([^\\s#]+)`))
  if (tag !== null) category = tag[1]

  // ---- 2. 优先级
  const p = take(new RegExp(`${SIGIL}[pP]([123])(?=\\s|$)`))
  if (p !== null) priority = { 1: 'high', 2: 'medium', 3: 'low' }[p[1]]
  else if (take(new RegExp(`${SIGIL}[!！](?=\\s|$)`)) !== null) priority = 'high'

  // ---- 3. 日期
  const relative = take(new RegExp(`(${Object.keys(RELATIVE).join('|')})`))
  if (relative !== null) {
    dueDate = shift(today, RELATIVE[relative[1]])
  } else {
    const inDays = take(/(\d{1,3})\s*天后/)
    const nextMonthDay = take(/下(?:个)?月(\d{1,2})[号日]/)
    const absolute = take(/(?<!\d)(\d{1,2})\s*[月/]\s*(\d{1,2})\s*[日号]?/)
    const monthEnd = take(/(?:本|下)?月底/)
    const nextWeek = take(/下(?:个)?(?:周|星期|礼拜)([一二三四五六日天])?/)
    const thisWeek = take(/(?:本|这)(?:周|星期|礼拜)([一二三四五六日天])?/)
    const weekday = take(/(?<!每)(?:周|星期|礼拜)([一二三四五六日天])/)

    if (inDays !== null) dueDate = shift(today, Number(inDays[1]))
    else if (nextMonthDay !== null) {
      const base = parseKey(today)
      const year = base.getFullYear() + (base.getMonth() + 1 > 11 ? 1 : 0)
      const month = (base.getMonth() + 1) % 12
      const last = new Date(year, month + 1, 0).getDate()
      dueDate = localKey(new Date(year, month, Math.min(Number(nextMonthDay[1]), last)))
    } else if (absolute !== null) {
      const month = Number(absolute[1])
      const day = Number(absolute[2])
      if (month >= 1 && month <= 12) {
        const year = parseKey(today).getFullYear()
        const last = new Date(year, month, 0).getDate()
        let candidate = localKey(new Date(year, month - 1, Math.min(day, last)))
        if (candidate < shift(today, -180)) candidate = localKey(new Date(year + 1, month - 1, Math.min(day, last)))
        dueDate = candidate
      }
    } else if (monthEnd !== null) {
      const base = parseKey(today)
      const month = base.getMonth() + (monthEnd[0].startsWith('下') ? 1 : 0)
      dueDate = localKey(new Date(base.getFullYear(), month + 1, 0))
    } else if (nextWeek !== null) {
      const weekdayIndex = nextWeek[1] === undefined ? 1 : CN_WEEKDAY[nextWeek[1]]
      dueDate = shift(nextWeekday(today, 1), (weekdayIndex - 1 + 7) % 7)
    } else if (thisWeek !== null) {
      const weekdayIndex = thisWeek[1] === undefined ? 1 : CN_WEEKDAY[thisWeek[1]]
      dueDate = shift(today, weekdayIndex - parseKey(today).getDay())
    } else if (weekday !== null) {
      dueDate = nextWeekday(today, CN_WEEKDAY[weekday[1]])
    }
  }

  // ---- 4. 时间
  const colon = take(/(?<!\d)([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d)(?!\d)/)
  if (colon !== null) {
    dueTime = `${String(Number(colon[1])).padStart(2, '0')}:${colon[2]}`
  } else if (take(/(?:正午|中午)/) !== null) {
    dueTime = '12:00'
  } else if (take(/(?:午夜|半夜)/) !== null) {
    dueTime = '00:00'
  } else {
    const cn = take(/(上午|早上|早晨|凌晨|中午|下午|傍晚|晚上|夜里)?\s*(\d{1,2})\s*[点時时](半|\d{1,2}\s*分?)?/)
    if (cn !== null) {
      const period = cn[1] ?? ''
      let hour = Number(cn[2])
      let minute = 0
      if (cn[3] === '半') minute = 30
      else if (cn[3] !== undefined) minute = Number(cn[3].replace(/\D/g, '')) || 0
      if (['下午', '傍晚', '晚上', '夜里'].includes(period) && hour < 12) hour += 12
      if (['上午', '早上', '早晨', '凌晨'].includes(period) && hour === 12) hour = 0
      if (hour <= 23 && minute <= 59) dueTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    }
  }
  if (dueTime !== null && dueDate === null) dueDate = today

  const cleaned = text.replace(/\s+/g, ' ').trim()
  const raw = String(input ?? '').trim()

  return {
    title: cleaned === '' ? raw : cleaned,
    dueDate,
    dueTime,
    priority,
    category,
    matched,
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node --testquickadd.test.js`
Expected: PASS，12 个测试全绿。
若「每周一开会」用例失败，检查 `weekday` 正则里的 `(?<!每)` 是否被写在最前面。

- [ ] **Step 5: 提交**

```bash
git add lib/quickadd.js test/quickadd.test.js
git commit -m "feat: 自然语言快速添加解析器"
```

---

## Task 9: 解析路由与快速添加入口

**Files:**
- Modify: `lib/api.js`、`index.js`（无需改动，分发是通用的）、`client.js`
- Test: `test/api.test.js`（追加用例）

**Interfaces:**
- Consumes: `parseQuickAdd`（Task 8）
- Produces: `POST todo/api/parse { text }` → 解析结果；客户端 `QuickAdd` 组件

- [ ] **Step 1: 在 `lib/api.js` 里加 `parse`**

顶部补 import：

```js
import { parseQuickAdd } from './quickadd.js'
```

分发表里加一行：

```js
    parse: (input = {}) => parseQuickAdd(input.text, input.today ? { today: input.today } : undefined),
```

- [ ] **Step 2: 追加测试**

`test/api.test.js` 末尾：

```js
test('parse 只解析不落库', async () => {
  const { api, store } = await makeApi()
  const out = await api.parse({ text: '明天下午3点 交周报 #工作 p1', today: '2026-10-22' })
  assert.equal(out.title, '交周报')
  assert.equal(out.dueDate, '2026-10-23')
  assert.equal(out.dueTime, '15:00')
  assert.equal(out.category, '工作')
  assert.equal(out.priority, 'high')
  const listed = await api.list({})
  assert.equal(listed.items.length, 0)
  await store.close()
})
```

- [ ] **Step 3: 运行确认通过**

Run: `node --testapi.test.js`
Expected: PASS，4 个测试。

- [ ] **Step 4: 客户端加 `QuickAdd` 输入框**

在 `client.js` 的 `TodoPage` 之前加组件：

```js
    function QuickAdd({ t, onCreated }) {
      const [text, setText] = useState('')
      const [parsed, setParsed] = useState(null)
      const [busy, setBusy] = useState(false)

      useEffect(() => {
        if (text.trim() === '') { setParsed(null); return }
        const timer = window.setTimeout(() => {
          fetchApi('parse', { text })
            .then((result) => setParsed(result))
            .catch(() => setParsed(null))
        }, 200)
        return () => window.clearTimeout(timer)
      }, [text])

      const submit = async () => {
        if (busy || text.trim() === '') return
        setBusy(true)
        try {
          await onCreated(parsed ?? { title: text.trim() })
          setText('')
          setParsed(null)
        } finally {
          setBusy(false)
        }
      }

      const chips = parsed === null ? [] : [
        parsed.dueDate ? (parsed.dueTime ? `${parsed.dueDate.slice(5)} ${parsed.dueTime}` : parsed.dueDate.slice(5)) : null,
        parsed.category ? `#${parsed.category}` : null,
        parsed.priority ? { high: t('priHigh'), medium: t('priMedium'), low: t('priLow') }[parsed.priority] : null,
      ].filter(Boolean)

      return h('div', { style: { padding: '6px 8px 10px' } },
        h('input', {
          autoFocus: true, value: text, placeholder: t('addPlaceholder'), style: { ...S.search, width: '100%' },
          onChange: (e) => setText(e.target.value),
          onKeyDown: (e) => {
            if (e.key === 'Enter') void submit()
            if (e.key === 'Escape') { setText(''); setParsed(null) }
          },
        }),
        chips.length > 0 ? h('div', { style: { display: 'flex', gap: 6, marginTop: 6 } },
          chips.map((chip) => h('span', { key: chip, style: S.tag }, chip))) : null,
        parsed !== null && parsed.matched.length === 0 && text.trim() !== ''
          ? h('div', { style: { marginTop: 6, fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' } }, t('agentHint'))
          : null,
      )
    }
```

字典补三个键（zh / en 各一份）：

```js
priHigh: '高', priMedium: '中', priLow: '低',
agentHint: '没看懂时间？可以在对话里说一句，让 agent 帮你定',
```

- [ ] **Step 5: 用 `QuickAdd` 替换 Task 7 的草稿行**

Task 7 里 `draft !== null ? ... : null` 那一段整块删掉，改成：

```js
            draft !== null ? h(QuickAdd, {
              t,
              onCreated: async (fields) => {
                await mutate('create', fields)
                setDraft(null)
              },
            }) : null,
```

- [ ] **Step 6: 语法检查、重装、验收**

Run: `node --check client.js`
Expected: 退出码 0。
执行 `plugin_manager` `install_bundle`，刷新页面，验证：
1. 输入「明天下午3点 交周报 #工作 p1」，停顿后出现 3 个 chip（`明天 15:00` / `#工作` / `高`）。
2. 回车：新条目落在「明天」，优先级红点、分类胶囊、时间都对，标题是「交周报」。
3. 输入「买牛奶」：无 chip，回车正常新建。
4. 输入「学 C#编程」：不应出现 `#编程` 分类 chip。

- [ ] **Step 7: 提交**

```bash
git add lib/api.js client.js test/api.test.js
git commit -m "feat: 快速添加解析路由与输入框"
```

---

## Task 10: agent 完成后的待确认

**Files:**
- Modify: `lib/model.js`、`lib/store.js`、`lib/api.js`、`lib/tool.js`、`client.js`
- Test: `test/store.test.js`、`test/tool.test.js`（追加用例）

**Interfaces:**
- Consumes: `Store.complete`、`createApi`、`createTool`（Task 3/4/5）
- Produces: `Store.confirm(id)`；`complete(id, done, by)`；记录新增 `doneBy` / `verifiedAt` 字段

- [ ] **Step 1: 追加失败测试**

`test/store.test.js` 末尾：

```js
test('用户完成立即视为已核实，agent 完成需要确认', async () => {
  const { store } = await tempStore()
  const mine = await store.create({ title: 'a' })
  const userDone = await store.complete(mine.id, true, 'user')
  assert.equal(userDone.doneBy, 'user')
  assert.ok(userDone.verifiedAt)

  const theirs = await store.create({ title: 'b' })
  const agentDone = await store.complete(theirs.id, true, 'agent')
  assert.equal(agentDone.doneBy, 'agent')
  assert.equal(agentDone.verifiedAt, null)

  const confirmed = await store.confirm(theirs.id)
  assert.ok(confirmed.verifiedAt)
  await store.close()
})

test('取消完成会清掉 doneBy 与 verifiedAt', async () => {
  const { store } = await tempStore()
  const todo = await store.create({ title: 'a' })
  await store.complete(todo.id, true, 'agent')
  const reopened = await store.complete(todo.id, false)
  assert.equal(reopened.doneBy, null)
  assert.equal(reopened.verifiedAt, null)
  await store.close()
})
```

`test/tool.test.js` 末尾：

```js
test('工具完成的记录带 doneBy=agent', async () => {
  const { tool, store } = await tool()
  const added = await tool.execute({ action: 'add', title: 'x' }, {})
  const done = await tool.execute({ action: 'complete', id: added.item.id }, {})
  assert.equal(done.item.doneBy, 'agent')
  assert.equal(done.item.verifiedAt, null)
  await store.close()
})
```

- [ ] **Step 2: 运行确认失败**

Run: `node --teststore.test.js; node --testtool.test.js`
Expected: FAIL，`doneBy` 为 `undefined`。

- [ ] **Step 3: 改 `lib/store.js`**

`create` 生成的记录补两个字段（改 `lib/model.js` 的 `normalizeCreate` 返回值）：

```js
    done: false,
    doneAt: null,
    doneBy: null,
    verifiedAt: null,
```

`complete` 改为：

```js
    async complete(id, done = true, by = 'user') {
      const index = state.todos.findIndex((t) => t.id === id)
      if (index === -1) throw new TodoError('not-found', '这条待办已经不在了')
      const finished = done !== false
      const now = new Date().toISOString()
      const next = {
        ...state.todos[index],
        done: finished,
        doneAt: finished ? now : null,
        doneBy: finished ? (by === 'agent' ? 'agent' : 'user') : null,
        verifiedAt: finished && by !== 'agent' ? now : null,
        updatedAt: now,
      }
      state.todos[index] = next
      await guard(persist)
      return withBucket(next)
    },

    async confirm(id) {
      const index = state.todos.findIndex((t) => t.id === id)
      if (index === -1) throw new TodoError('not-found', '这条待办已经不在了')
      const next = { ...state.todos[index], verifiedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      state.todos[index] = next
      await guard(persist)
      return withBucket(next)
    },
```

- [ ] **Step 4: 改 `lib/api.js` 与 `lib/tool.js`**

`api.js`：`complete` 透传 `by`，新增 `confirm`：

```js
    complete: (input = {}) => store.complete(input.id, input.done !== false, input.by),
    confirm: (input = {}) => store.confirm(input.id),
```

`tool.js`：`complete` 显式传 `by: 'agent'`，`ACTIONS` 加 `'confirm'`，分发加一行：

```js
    if (action === 'complete') {
      const item = await api.complete({ id: input.id, done: input.done !== false, by: 'agent' })
      return { item }
    }
    if (action === 'confirm') {
      const item = await api.confirm({ id: input.id })
      return { item }
    }
```

工具参数的 `action` 枚举同步加 `'confirm'`。

- [ ] **Step 5: 运行确认通过**

Run: `node --test`
Expected: 全绿（bucket 8 + store 11 + api 4 + tool 5 + quickadd 12）。

- [ ] **Step 6: 客户端显示「待确认」**

`Row` 在分类胶囊之后加一个标记：

```js
      item.done && item.doneBy === 'agent' && !item.verifiedAt
        ? h('span', { style: { ...S.tag, color: 'var(--dsw-alias-state-warn-primary)' } }, t('needsReview'))
        : null,
```

详情列底部加确认按钮（仅在该状态显示）：

```js
                selectedItem.done && selectedItem.doneBy === 'agent' && !selectedItem.verifiedAt
                  ? h('button', {
                      style: { width: '100%', height: 32, marginTop: 8, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--dsw-alias-state-business-primary)', color: '#fff', fontSize: 12.5 },
                      onClick: () => void mutate('confirm', { id: selectedItem.id }),
                    }, t('confirmDone'))
                  : null,
```

字典补：`needsReview: '待确认'` / `confirmDone: '确认已完成'`。

- [ ] **Step 7: 重装并验收**

`plugin_manager` `install_bundle`，刷新页面。让 agent 调用 `personal_todo` 完成一条，面板上该条应出现「待确认」；点详情里的「确认已完成」后标记消失、`verifiedAt` 落盘。

- [ ] **Step 8: 提交**

```bash
git add lib/model.js lib/store.js lib/api.js lib/tool.js client.js test
git commit -m "feat: agent 完成后的待确认与人工核实"
```

## Task 11: 收尾与完整验收

**Files:**
- Create: `README.md`
- Modify: `index.js`（仅加注释说明 `staleDays` / `dataPath`）

**Interfaces:**
- Consumes: 全部前置任务
- Produces: 可发布状态

- [ ] **Step 1: 写 `README.md`**

```markdown
# dsh-todolist

DeepSeek Harness 的侧栏待办插件：管理日常工作的清单，数据和 agent 共用一份。

## 安装

在本机的 DSH 里执行插件安装（包目录为仓库根目录），装完侧栏「新会话」下方会出现「待办」。

## 数据在哪

默认 `%DSH_PROFILE_DIR%/data/dsh-todolist/todos.json`，普通 JSON，可以直接打开、编辑、备份。

```json
{ "version": 1, "todos": [ { "id": "t_...", "title": "交周报", "dueDate": "2026-10-22", "done": false } ] }
```

文件损坏时会备份为 `todos.corrupt-<时间戳>.json` 并以空清单启动。

## 配置

在 `cordis.patch.yml` 的插件行里改：

```yaml
- id: dsh-todolist
  config:
    staleDays: 7   # 超过多少天未完成算「积压」
    dataPath: ''   # 可选，覆盖默认数据文件路径
```

## agent 工具

`personal_todo`，`action` 可选 `list` / `add` / `update` / `complete` / `confirm` / `delete`。

## 快速添加

面板输入框支持一行自然语言，例如：

```
明天下午3点 交周报 #工作 p1
```

支持日期（今天/明天/后天/周X/下周X/N天后/M月D日/月底）、时间（15:00、下午3点、中午）、
优先级（p1/p2/p3、!）、分类（#名称）。识别到的片段会显示成 chips，回车保存。

规则解析失败时不用在面板里找 AI——直接在对话里说一句，agent 会调用 `personal_todo`。

## 开发

```bash
node --test
```
```

- [ ] **Step 2: 跑全部测试**

Run: `node --test`
Expected: 40 个测试全绿（bucket 8 + store 11 + api 4 + tool 5 + quickadd 12）。

- [ ] **Step 3: 按 spec §8 逐条验收**

| # | 验收项 | 做法 |
|---|---|---|
| 1 | 重启后入口与数据都在 | 重启 DSH，看侧栏与列表 |
| 2 | 折叠态行为与其他导航行一致 | 折叠侧栏：「待办」要与「插件」「定时任务」同进同退，不能单独错位或残留 |
| 3 | UI 建 → 工具能看到 | 页面新建一条，然后让我调用 `personal_todo list` |
| 4 | 工具建 → 面板 2.5s 内出现 | 让我调用 `personal_todo add`，盯页面 |
| 5 | 完成写 `doneAt` | 勾选后看 JSON 文件 |
| 6 | 积压判定 | 手工把某条 `createdAt` 改成 10 天前，刷新看是否进「积压」 |
| 7 | 快速添加解析 | 输入「明天下午3点 交周报 #工作 p1」，四个字段与 chips 都对 |
| 8 | 快速添加防误伤 | 「每周一开会」不进日期分组；「学 C#编程」不产生分类 |
| 9 | agent 完成需确认 | 让 agent 完成一条 → 出现「待确认」→ 点确认后消失 |
| 10 | 删库不崩 | 删掉 `todos.json` 重启，空清单 + 不报错 |
| 11 | 卸载恢复原样 | `plugin_manager remove_bundle` 后确认侧栏无「待办」、`main` 无 `todo` |

- [ ] **Step 3b: 加主题 token 白名单测试**

宿主声明的 token 有 400+ 个，shell 样式表里真实定义的只有 95 个；引用不存在的 token 不报错、静默失效。把真实名单存成 `test/theme-tokens.json`（从宿主 CSS 的 `body{--dsw-…}` 与 `body[data-ds-dark-theme]{…}` 两段里抽 `--dsw-[a-z0-9-]+`），再写 `test/client-tokens.test.js`：扫描 `client.js` 里所有 `var(--dsw-…)` 引用，凡是名单里没有的就报错。

- [ ] **Step 4: 提交并推送**

```bash
git add README.md index.js test/
git commit -m "docs: README 与配置说明；test: 主题 token 白名单"
git push
```

---

## 附：任务依赖与并行度

```
Task 1 (骨架/槽位) ──> Task 6 (只读页) ──> Task 7 (交互) ──> Task 9 (快速添加 UI)
Task 2 (分组) ─> Task 3 (存储) ─> Task 4 (路由) ─> Task 5 (工具) ─> Task 10 (待确认)
Task 8 (解析器) ──> Task 9
Task 11 依赖全部
```

- Task 1、Task 2、Task 8 三者互不依赖，可以并行（不同文件）。
- Task 6 需要 Task 4 的路由已装好，否则页面一直显示「读取失败」。
- Task 9 同时依赖 Task 7（`Row` / `mutate` 就位）与 Task 8（解析器）。
- Task 10 改的是 Task 3/4/5 的既有函数签名，必须等它们稳定后再动。

---

## 实施期修订记录

执行过程中发现的、与本计划原文冲突或计划本身写错的地方。每一项都在对应任务的修复轮里落地，并已回写到上文。

| # | 位置 | 计划原文 | 实际做法 | 原因 |
|---|---|---|---|---|
| 1 | Task 2 测试 | dueDate: '2026-10-26' 期望 stale | 期望 unplanned，另加「创建 10 天 + 远未来截止 → stale」 | 原文与 spec §4.3 冲突：积压只看创建时长。实现者为让用例通过加了一行 eturn 'stale'，把错误固化 |
| 2 | Task 4 测试 | sync function api() + const { api } = await api() | 改名 makeApi | 函数名与解构变量同名，TDZ 崩溃 |
| 3 | Task 5 工具名 | 	odo_write | **personal_todo** | 官方标准 preset 自带 	odo_write（会话任务清单），scoped 工具遮蔽 global 工具，导致我们的版本对 agent 完全不可见 |
| 4 | Task 5 工具返回 | render 只给标题 | 每条带 id | 不返回 id，模型无法继续 update / complete / delete |
| 5 | Task 5 列表默认 | pi.list(input) 返回全量 | iew 缺省 'open' | 与「list 默认只给未完成」的测试契约矛盾 |
| 6 | 全局 | 
ode --test test/ | 
ode --test | 本机 Node 24 下带目录参数会解析失败 |
| 7 | Task 3 写盘 | queue = queue.then(...) | 队尾用 write.catch(() => {}) 兜住，调用方仍收到本次错误 | 一次瞬时 I/O 失败会让队列永久 rejected，本会话后续写入全部静默丢失 |
| 8 | Task 3 损坏恢复 | 备份失败被 catch {} 吞掉后仍覆盖原件 | 备份失败则中止并抛 io-error，不覆盖原文件 | 否则唯一的损坏原稿会被空文档销毁 |
| 9 | Task 8 解析器 | 月份 (\d{1,2}) 先摘后校验 | 月份收进 (0?[1-9]|1[0-2]) | 31/10 这类输入会被摘掉又不落日期，违反「绝不吞字符」 |
| 10 | Task 8 解析器 | 月底 / 下周 短正则抢先 | 加 下个月底 优先与 (?!末) 守卫 | 下个月底 被啃成「下个」、下周末 被啃成「末」 |
| 11 | Task 8 解析器 | 中午关键字分支早于数字钟点 | 数字钟点优先，中午/半夜按时段换算 | 中午1点 被解析成 12:00；半夜12点 应为 00:00 |
