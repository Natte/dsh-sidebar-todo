# dsh-sidebar-todo v3（0.3.0）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付 v3 设计稿（[docs/specs/2026-11-02-dsh-todolist-v3-design.md](../specs/2026-11-02-dsh-todolist-v3-design.md)）的全部范围：常驻便利贴（多条小便签）+ 详情列两区布局磨光（含 O1）+ 分类/优先级筛选 + 计数口径修正 + `ended` 循环分组 + 错误内联 + 轮询可见性 + 文档校准。

**Architecture:** Host 侧 `lib/store.js`（内存态 + 串行原子写 JSON）经 `lib/api.js` 分发表同时服务 HTTP 路由与两个 agent 工具；Client 侧 `client.js` 单文件 React（无构建）。便签复用同一 store/同一队列/同一 `/todo/api` 前缀——路由层零改动。

**Tech Stack:** Node ESM + `node:test`（无第三方依赖）；React 16 createElement 内联样式（宿主提供）。

---

## 全局约束（每个任务默认遵守）

1. **零依赖**：不新增 `dependencies`；不 import 任何 `@deepseek-ai/*`。
2. **标识不动**：包名 / client 注册 id / locale 命名空间全部保持 `dsh-sidebar-todo`；数据目录保持 `data/dsh-todolist`。
3. **工具命名**：`personal_todo` 不改名；新工具名 `personal_note`。
4. **样式**：只准使用 `test/theme-tokens.json` 白名单内的 `--dsw-*` 变量（`test/client-tokens.test.js` 会拦截）。
5. **接口形态**：仅 `POST /todo/api/<method>`，响应 `{ ok, result } | { ok:false, error:{ code, message } }`。
6. **git 纪律**（handoff 踩坑 4）：一律 `git add <显式路径>`，**禁止 `git add -A`**；共享文件 `client.js` 的任务串行执行。
7. **收门命令**：涉 host 的任务跑 `node --test`；涉 client 的任务加 `node --check client.js`。两者都绿才能 commit。
8. **串行点**：T3→T4（同一渲染树）、T9→T10（同一 `store.list`）必须先后执行，不得并行。
9. **不发版**：本计划不执行 `npm publish`，不 bump 发布前未验的兼容表结论（T13 只做准备项）。

## 开工准备（一次性，人工/agent 皆可）

```bash
cd D:\dsh-sidebar-todo
git checkout main && git pull
git checkout -b feat/todo-v3     # v1/v2 均走独立分支；不要直接在 main 上铺
node --test                      # 基线：142/142 绿，记下这个数
```

数据隔离（方式 B，见 [docs/dev-workflow.md](../dev-workflow.md)）：把 profile 的插件行切到本地目录并加 `config.dataPath: D:/dsh-sidebar-todo/.dev/todos.json`；首次把真实数据复制过去一份（副本随便折腾，真实数据全程不碰）。

```powershell
Copy-Item "$env:DSH_PROFILE_DIR\data\dsh-todolist\todos.json" "D:\dsh-sidebar-todo\.dev\todos.json" -Force
```

---

### Task 1: store 便签数据层

**Files:**
- Modify: `lib/store.js`
- Create: `test/notes-store.test.js`

**Interfaces:**
- Consumes: 现有 `createStore`、`queue`/`persist`/`guard`、`EMPTY`、`readDoc`。
- Produces: `store.notesList() → { items: [{ id, text, createdAt, updatedAt }] }`（按 `createdAt` 倒序）；`store.noteAdd({ text })` / `store.noteUpdate({ id, text })` → item（`TodoError('invalid-input')`：空 500 字；`'not-found'`）；`store.noteRemove({ id }) → { id }`。落盘 doc 形状 `{ version:1, todos, notes }`。T2/T4/T7/T11 直接依赖这些名字。

- [ ] **Step 1: 写测试（新建 `test/notes-store.test.js`，独立 harness，不动旧文件）**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStore } from '../lib/store.js'
import { TodoError } from '../lib/model.js'

async function make(fileBody = null, expectBrokenLoad = false) {
  const dir = await mkdtemp(join(tmpdir(), 'todo-notes-'))
  const file = join(dir, 'todos.json')
  if (fileBody !== null) await writeFile(file, fileBody, 'utf8')
  const store = createStore({ file })
  const load = store.load()
  if (expectBrokenLoad) await assert.rejects(() => load, () => true) // 损坏 JSON：load 必然拒绝
  else await load
  return { store, file, dir, async clean() { await store.close(); await rm(dir, { recursive: true, force: true }) } }
}

test('老数据没有 notes 字段：load 后便签为空数组，todos 照常可用', async () => {
  const a = await make()
  try {
    assert.deepEqual((await a.store.notesList()).items, [])
    const todo = await a.store.create({ title: '待办' })
    assert.equal((await a.store.list({})).items.length, 1)
    assert.ok(todo.id.startsWith('t_'))
  } finally { await a.clean() }
})

test('notes 非数组（手改坏了）回退空数组，不崩', async () => {
  const note = { id: 'n_1', text: 'x', createdAt: '2026-11-01T00:00:00.000Z' }
  const buggy = await make(JSON.stringify({ version: 1, todos: [], notes: { bad: true } }))
  try {
    assert.deepEqual((await buggy.store.notesList()).items, [])
    // 修好后写回正常值能被读取
    const added = await buggy.store.noteAdd({ text: '正常新增' })
    assert.equal(added.text, '正常新增')
  } finally { await buggy.clean() }
})

test('noteAdd：trim、ISO 时间戳、n_ 前缀 id；空文本与超长报 invalid-input', async () => {
  const a = await make()
  try {
    const item = await a.store.noteAdd({ text: '  周五带门禁卡  ' })
    assert.equal(item.text, '周五带门禁卡')
    assert.ok(item.id.startsWith('n_'))
    assert.ok(!Number.isNaN(Date.parse(item.createdAt)))
    assert.equal(item.updatedAt, item.createdAt)
    await assert.rejects(() => a.store.noteAdd({ text: '   ' }),
      (e) => e instanceof TodoError && e.code === 'invalid-input' && /不能为空/.test(e.message))
    await assert.rejects(() => a.store.noteAdd({ text: '字'.repeat(501) }),
      (e) => e.code === 'invalid-input' && /500/.test(e.message))
  } finally { await a.clean() }
})

test('notesList 按 createdAt 倒序，且不影响 todos', async () => {
  const a = await make()
  try {
    await a.store.noteAdd({ text: '第一条' })
    await new Promise((r) => setTimeout(r, 5))
    await a.store.noteAdd({ text: '第二条' })
    const items = (await a.store.notesList()).items
    assert.deepEqual(items.map((n) => n.text), ['第二条', '第一条'])
    await a.store.create({ title: '别混进来' })
    const listed = await a.store.list({})
    assert.equal(listed.items.length, 1)
    assert.equal(listed.items[0].title, '别混进来')
  } finally { await a.clean() }
})

test('noteUpdate 改文本与 updatedAt；未知 id 报 not-found', async () => {
  const a = await make()
  try {
    const item = await a.store.noteAdd({ text: '旧' })
    await new Promise((r) => setTimeout(r, 5))
    const next = await a.store.noteUpdate({ id: item.id, text: '新' })
    assert.equal(next.text, '新')
    assert.ok(next.updatedAt > item.updatedAt)
    await assert.rejects(() => a.store.noteUpdate({ id: 'ghost', text: 'x' }), (e) => e.code === 'not-found')
  } finally { await a.clean() }
})

test('noteRemove 删除并落盘；未知 id 报 not-found', async () => {
  const a = await make()
  try {
    const item = await a.store.noteAdd({ text: '删我' })
    assert.deepEqual(await a.store.noteRemove({ id: item.id }), { id: item.id })
    assert.deepEqual((await a.store.notesList()).items, [])
    await assert.rejects(() => a.store.noteRemove({ id: 'ghost' }), (e) => e.code === 'not-found')
  } finally { await a.clean() }
})

test('persist 落盘包含 notes；第二个 store 打开同一文件能读到', async () => {
  const a = await make()
  try {
    const item = await a.store.noteAdd({ text: '跨实例' })
    await a.store.close()
    const raw = await readFile(a.file, 'utf8')
    const doc = JSON.parse(raw)
    assert.equal(doc.version, 1)
    assert.deepEqual(doc.notes.map((n) => n.id), [item.id])

    const dir = await mkdtemp(join(tmpdir(), 'todo-notes2-'))
    const second = createStore({ file: a.file })
    try {
      await second.load()
      const items = (await second.notesList()).items
      assert.equal(items.length, 1)
      assert.equal(items[0].text, '跨实例')
    } finally { await second.close(); await rm(dir, { recursive: true, force: true }) }
  } finally { await a.clean() }
})

test('损坏文件照旧走备份路径（notes 无从谈起，不新增崩溃面）', async () => {
  const broken = await make('{ this is not json', true)
  try {
    // corrupt 分支：readDoc 失败 → 空清单 + corrupt notice；这里主要保证 CRUD 仍可用
    const item = await broken.store.noteAdd({ text: '废墟上重建' })
    assert.equal(item.text, '废墟上重建')
  } finally { await broken.clean() }
})
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `node --test test/notes-store.test.js`
Expected: FAIL —— `store.notesList is not a function`（或 unreachable prop 错误）。

- [ ] **Step 3: 改 `lib/store.js`（5 处）**

3a. `EMPTY` 常量加 notes：

```js
const EMPTY = { version: 1, todos: [], notes: [] }
```

3b. 头部注释后新增（`isDayKey` 附近，与其它 helper 并列）：

```js
const NOTE_MAX = 500

function newNoteId() {
  const rand = Math.random().toString(36).slice(2, 6)
  return `n_${Date.now().toString(36)}_${rand}`
}

function noteText(input) {
  const raw = input && typeof input.text === 'string' ? input.text.trim() : ''
  if (raw === '') throw new TodoError('invalid-input', '便签内容不能为空')
  if (raw.length > NOTE_MAX) throw new TodoError('invalid-input', '便签最长 500 字')
  return raw
}

/** 手改 JSON 可能让 notes 变成任意形状；只收能救的行，救不了的整条丢弃。 */
function sanitizeNotes(value) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const text = typeof raw.text === 'string' ? raw.text.trim().slice(0, NOTE_MAX) : ''
    if (text === '') continue
    const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString()
    out.push({
      id: typeof raw.id === 'string' && raw.id !== '' ? raw.id : newNoteId(),
      text,
      createdAt,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : createdAt,
    })
  }
  return out
}
```

3c. `createStore` 内 state 加 notes：`const state = { todos: [], notes: [], corrupt: false, sealed: false }`；`load()` 里 `state.todos = doc.todos` 之后加：

```js
      state.notes = sanitizeNotes(doc.notes)
```

3d. `persist()` 快照一行改为：

```js
    const snapshot = JSON.stringify({ version: 1, todos: state.todos, notes: state.notes }, null, 2)
```

3e. 在 `retryPersist` 之前插入四个方法：

```js
    /** 便签列表：createdAt 倒序；与 todos 完全两个数据面，不进分组/计数。 */
    notesList() {
      const items = [...state.notes].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      return { items }
    },

    async noteAdd(input = {}) {
      if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        throw new TodoError('invalid-input', '参数必须是对象')
      }
      const now = new Date().toISOString()
      const item = { id: newNoteId(), text: noteText(input), createdAt: now, updatedAt: now }
      state.notes.push(item)
      await guard(persist)
      return { ...item }
    },

    async noteUpdate(input = {}) {
      if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        throw new TodoError('invalid-input', '参数必须是对象')
      }
      if (typeof input.id !== 'string' || input.id === '') throw new TodoError('invalid-input', 'id 必填')
      const text = noteText(input)
      const index = state.notes.findIndex((n) => n.id === input.id)
      if (index === -1) throw new TodoError('not-found', '这条便签已经不在了')
      const next = { ...state.notes[index], text, updatedAt: new Date().toISOString() }
      state.notes[index] = next
      await guard(persist)
      return { ...next }
    },

    async noteRemove(input = {}) {
      if (typeof input?.id !== 'string' || input.id === '') throw new TodoError('invalid-input', 'id 必填')
      const index = state.notes.findIndex((n) => n.id === input.id)
      if (index === -1) throw new TodoError('not-found', '这条便签已经不在了')
      state.notes.splice(index, 1)
      await guard(persist)
      return { id: input.id }
    },
```

- [ ] **Step 4: 全量回归**

Run: `node --test`
Expected: 全绿（新文件 8 例 + 既有 142 例 = 150 例）。

- [ ] **Step 5: Commit**

```bash
git add lib/store.js test/notes-store.test.js
git commit -m "feat(v3): store 支持便签 notes 数据面（增删改查+兼容+落盘）"
```

---

### Task 2: api 四方法 + 路由验证

**Files:**
- Modify: `lib/api.js`
- Modify: `test/api.test.js`（末尾追加）
- Modify: `test/route.test.js`（末尾追加）

**Interfaces:**
- Consumes: T1 的 store 四方法。
- Produces: `api.notesList/noteAdd/noteUpdate/noteRemove`（HTTP 白名单自动纳入，`index.js` 零改动）。T4 的 `fetchApi('notesList')`、T7 的 note 工具都走这里。

- [ ] **Step 1: `lib/api.js` 的 dispatch 表追加四行（`occurrences:` 之后）**

```js
    notesList: (input = {}) => store.notesList(),
    noteAdd: (input = {}) => store.noteAdd(input),
    noteUpdate: (input = {}) => store.noteUpdate(input),
    noteRemove: (input = {}) => store.noteRemove(input),
```

- [ ] **Step 2: 先写测试（`test/api.test.js` 末尾追加）**

```js
test('便签四方法：add → list → update → remove', async () => {
  const { api, store } = await makeApi()
  const added = await api.noteAdd({ text: '周一问财务' })
  assert.ok(added.id.startsWith('n_'))
  assert.deepEqual((await api.notesList({})).items.map((n) => n.text), ['周一问财务'])
  const updated = await api.noteUpdate({ id: added.id, text: '周二问财务' })
  assert.equal(updated.text, '周二问财务')
  assert.deepEqual(await api.noteRemove({ id: added.id }), { id: added.id })
  assert.deepEqual((await api.notesList({})).items, [])
  await store.close()
})
```

Run: `node --test test/api.test.js` → PASS（分发已就绪）。

- [ ] **Step 3: `test/route.test.js` 末尾追加三个路由用例（复用文件内现有 `makeApp`/`call` harness）**

```js
test('POST /todo/api/notesList 返回 200 与空便签列表', async () => {
  const app = await makeApp()
  try {
    const res = await call(app, { url: '/todo/api/notesList', body: '{}' })
    assert.equal(res.status, 200)
    assert.equal(res.payload.ok, true)
    assert.deepEqual(res.payload.result.items, [])
  } finally { await app.close() }
})

test('noteAdd → notesList 走完整路由；写盘失败映射 500（.tmp 被占成目录）', async () => {
  const app = await makeApp()
  try {
    const added = await call(app, {
      url: '/todo/api/noteAdd',
      body: JSON.stringify({ text: '路由里记一笔' }),
    })
    assert.equal(added.status, 200)
    assert.equal(added.payload.result.text, '路由里记一笔')

    const listed = await call(app, { url: '/todo/api/notesList', body: '{}' })
    assert.equal(listed.payload.result.items.length, 1)

    await mkdir(`${app.dataPath}.tmp`)
    const bad = await call(app, { url: '/todo/api/noteUpdate', body: JSON.stringify({ id: added.payload.result.id, text: 'x' }) })
    assert.equal(bad.status, 500)
    assert.equal(bad.payload.error.code, 'io-error')
  } finally { await app.close() }
})

test('便签校验错误映射 400；未知便签 id 映射 404', async () => {
  const app = await makeApp()
  try {
    const empty = await call(app, { url: '/todo/api/noteAdd', body: JSON.stringify({ text: '  ' }) })
    assert.equal(empty.status, 400)
    assert.equal(empty.payload.error.code, 'invalid-input')

    const ghost = await call(app, { url: '/todo/api/noteRemove', body: JSON.stringify({ id: 'n_ghost' }) })
    assert.equal(ghost.status, 404)
    assert.equal(ghost.payload.error.code, 'not-found')
  } finally { await app.close() }
})
```

- [ ] **Step 4: 全量回归 + 收门**

Run: `node --test`
Expected: 全绿（153 例）。

- [ ] **Step 5: Commit**

```bash
git add lib/api.js test/api.test.js test/route.test.js
git commit -m "feat(v3): 便签方法进 api 分发表，路由层无需改动并补 3 例验证"
```

---

### Task 3: 右列两区布局 + O1 详情磨光（与 T4 串行）

**Files:**
- Modify: `client.js`（S 样式、PLUGIN_CSS、TodoPage 右列 JSX、dict 两处文案）

**Interfaces:**
- Consumes: 无（纯客户端）。
- Produces: `S.rightCol / S.detail(新语义) / S.dock / S.dockHead / S.dockBody / S.detailEmpty` 样式；类名 `td-dock`、`td-note-row`、`td-note-act`；`dict.pickOne` 改为引导文案。T4/T6 在此壳内填肉。

- [ ] **Step 1: 替换 `S.detail`（client.js:141）为一组样式（新增 dock 系列键放在 `detailEmpty` 附近一并加）**

```js
      rightCol: { width: 380, flex: 'none', display: 'flex', flexDirection: 'column', minHeight: 0, borderLeft: '0.5px solid var(--dsw-alias-border-l2)' },
      detail: { flex: 1, minWidth: 0, overflowY: 'auto', padding: 16, fontSize: 12.5, color: 'var(--dsw-alias-label-secondary)' },
      detailEmpty: { height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--dsw-alias-label-tertiary)', textAlign: 'center', padding: '0 20px' },
      dock: { flex: 'none', height: '42%', minHeight: 180, display: 'flex', flexDirection: 'column', borderTop: '0.5px solid var(--dsw-alias-border-l2)', transition: 'height 0.18s ease' },
      dockHead: { flex: 'none', display: 'flex', alignItems: 'center', gap: 8, height: 30, padding: '0 14px', cursor: 'pointer', color: 'var(--dsw-alias-label-secondary)' },
      dockTitle: { fontSize: 12, fontWeight: 600 },
      dockCount: { fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' },
      dockArrow: { marginLeft: 'auto', fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' },
      dockBody: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0 12px 10px' },
```

（T4 会追加 quick/note 系列键，保持函数体内样式注册习惯。）

- [ ] **Step 2: PLUGIN_CSS 末尾（`}` 收口前）追加便签坞的 hover 规则**

```css
.td-dock-head:hover { background: var(--dsw-alias-interactive-bg-hover); }
.td-note-row { }
.td-note-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.td-note-row .td-note-act { opacity: 0; transition: opacity .12s ease; }
.td-note-row:hover .td-note-act { opacity: 1; }
.td-note-act:hover { color: var(--dsw-alias-state-error-primary); }
```

（`.td-note-row {}` 空壳留作锚点，T4 往上挂；token 都在白名单。）

- [ ] **Step 3: TodoPage 右列 JSX 改造（原 client.js:2030 `h('div', { style: compactDetail ? { ...S.detail, width: 320 } : S.detail }, ...)`）**

把原来的详情列整段包进 rightCol，detail 变为内滚子层，dock 先挂壳（T4 填正文）：

```js
          h('div', { style: compactDetail ? { ...S.rightCol, width: 320 } : S.rightCol },
            h('div', { style: S.detail },
              /* ↓ 原 2030-2141 的三态内容（dayKey / selectedItem / pickOne 占位）原样搬进来，一行逻辑不改 */,
            ),
            h('div', { className: 'td-dock', style: S.dock },
              h('div', { className: 'td-dock-head', style: S.dockHead, role: 'button', 'aria-expanded': 'true', tabIndex: 0 },
                h('span', { style: S.dockTitle }, t('quickNote')),
                h('span', { style: S.dockCount }, ''),
                h('span', { style: S.dockArrow }, '▾'),
              ),
              h('div', { style: S.dockBody }, null),   // T4 填充
            ),
          ),
```

注意：closing 括号层级 +1，先把原末尾的 `),`（client.js:2142 一带）与 dialog/overlay 的兄弟顺序核对再收；跑 `node --check` 是唯一的自动化护栏。

- [ ] **Step 4: O1 三个视觉改动**

4a. 详情按钮组（原 client.js:2092 起）只改容器与三个按钮的 style，onClick/子元素原样：

```js
                  h('div', { style: { display: 'flex', gap: 8, marginTop: 14, justifyContent: 'center' } },
                    h('button', {
                      className: 'td-btn',
                      style: { ...S.btnGhost, minWidth: 76 },
                      onClick: () => setDialog({ initial: selectedItem }),
                    }, t('edit')),
                    h('button', {
                      className: 'td-primary',
                      disabled: selectedRepeatEnded,
                      style: { ...S.btnPrimary, minWidth: 104, opacity: selectedRepeatEnded ? 0.45 : 1, cursor: selectedRepeatEnded ? 'not-allowed' : 'pointer' },
                      onClick: () => {
                        /* 原 onClick 体原样保留 */
                      },
                    }, selectedItem.done ? t('reopen') : (selectedItem.isRepeating ? t('completeOccurrence') : t('complete'))),
                    h('button', {
                      className: 'td-btn',
                      style: { ...S.btnGhost, minWidth: 76, color: confirming ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-label-secondary)' },
                      onClick: async () => {
                        /* 原 onClick 体原样保留 */
                      },
                    }, confirming ? t('confirmRemove') : t('remove')),
                  ),
```

（原来是 `flex: 1` 三等分 —— 全部去掉 flex，靠 minWidth + justify-content: center 收成「一组」。）

4b. 空态占位（原 client.js:2141）改为：

```js
                : h('div', { style: S.detailEmpty }, h('div', null, t('pickOne'))),
```

4c. dict 两处改 `pickOne` 文案（zh/en 同步）：

```js
        pickOne: '选一条看详情，或在下方记一条便利贴',
        pickOne: 'Select an item for details, or jot a sticky note below',
```

4d. dict 新增 `quickNote`：zh `便利贴`、en `Sticky notes`（zh 行加在 `pickOne` 同行附近即可）。

- [ ] **Step 5: 收门**

Run: `node --check client.js` && `node --test`
Expected: 语法 OK；测试全绿（client-tokens 是否新增 token 命中保持通过）。

- [ ] **Step 6: 手工快验（stage 本地插件后）**：侧栏点开待办 → 右列出现「详情/空白上区 + 便利贴坞下区（42%）」；选中一条周循环任务 → 按钮组居中不再贴左拉伸；空态文案为引导句。截图存 `.superpowers/sdd/2026-11-02-dsh-todolist-v3-plan/layout-T3.png`（目录自建）。

- [ ] **Step 7: Commit**

```bash
git add client.js .superpowers/sdd/2026-11-02-dsh-todolist-v3-plan/layout-T3.png
git commit -m "feat(v3): 右列拆详情+便签坞两区；O1 按钮组居中、空态占位居中"
```

---

### Task 4: 便利贴 UI（形态 A，与 T3 串行）

**Files:**
- Modify: `client.js`（TodoPage state/reload/dock 正文/dict）

**Interfaces:**
- Consumes: T2 的 `api.notesList/noteAdd/noteUpdate/noteRemove`；T3 的 dock 壳与 `S.*`。
- Produces: TodoPage 内 `notes` state、`noteRelTime(t, iso)` helper、五把手函数 `addQuickNote/updateNote/removeNote/convertToTodo(→T5)/toggleDock`；类名 `td-note-row/td-note-act`。

- [ ] **Step 1: TodoPage 顶部 state 与 helper（放在 `view, setView` 附近）**

```js
      const [notes, setNotes] = useState([])
      const [dockOpen, setDockOpen] = useState(true)
      const [editingNote, setEditingNote] = useState(null)
      const [quickNote, setQuickNote] = useState('')
      const noteInputRef = useRef(null)
```

`dict` 通用 helper（放 `formatDateTime` 附近）：

```js
    function noteRelTime(t, iso) {
      const ts = Date.parse(iso)
      if (Number.isNaN(ts)) return ''
      const diff = Date.now() - ts
      if (diff < 60000) return t('justNow')
      if (diff < 3600000) return t('minutesAgo').replace('{n}', String(Math.floor(diff / 60000)))
      if (diff < 86400000) return t('hoursAgo').replace('{n}', String(Math.floor(diff / 3600000)))
      return dateKeyOf(new Date(ts))
    }
```

- [ ] **Step 2: reload() 把 notes 拉进来（现有 `occTask` 旁加一路，`Promise.all` 改三元）**

```js
          const noteTask = fetchApi('notesList', {}, tRef.current).catch((err) => {
            console.error('[dsh-sidebar-todo] notesList failed', err)
            return { items: [] }
          })
          const [result, occ, noteRes] = await Promise.all([fetchApi('list', query ? { q: query } : {}, tRef.current), occTask, noteTask])
```

`setRecurringDone(...)` 之后加：

```js
          setNotes(Array.isArray(noteRes?.items) ? noteRes.items : [])
```

（同样受 `seq !== seqRef.current` 早退保护。）

- [ ] **Step 3: 五把操作（放 `retryWrite` 之后）**

```js
      const addQuickNote = useCallback(async (event) => {
        event.preventDefault()
        const text = quickNote.trim()
        if (text === '' || text.length > 500) return
        const res = await mutate('noteAdd', { text })
        if (res !== true) return
        setQuickNote('')
        if (noteInputRef.current) noteInputRef.current.focus()
      }, [mutate, quickNote])

      const updateNote = useCallback(async (note, text) => {
        const clean = text.trim()
        setEditingNote(null)
        if (clean === '' || clean === note.text) return
        await mutate('noteUpdate', { id: note.id, text: clean })
      }, [mutate])

      const removeNote = useCallback(async (note) => {
        await mutate('noteRemove', { id: note.id })
      }, [mutate])

      const toggleDock = useCallback(() => setDockOpen((open) => !open), [])
```

（`mutate` 现返回 boolean；T11 改对象后，这三处判真同步见 T11 Step 4 清单。）

- [ ] **Step 4: dock 正文渲染（替换 T3 的 `h('div', { style: S.dockBody }, null)`）**

```js
              h('div', { style: S.dockBody },
                dockOpen
                  ? [
                    h('form', { key: 'quick', style: { flex: 'none', display: 'flex', marginBottom: 8 }, onSubmit: addQuickNote },
                      h('input', {
                        className: 'td-input',
                        style: { flex: 1, height: 30, border: '0.5px solid var(--dsw-alias-border-l3)', borderRadius: 8, padding: '0 10px', fontSize: 12.5, color: 'var(--dsw-alias-label-primary)', background: 'transparent', outline: 'none' },
                        ref: noteInputRef,
                        placeholder: t('noteAddPlaceholder'),
                        maxLength: 500,
                        value: quickNote,
                        onChange: (e) => setQuickNote(e.target.value),
                        'aria-label': t('quickNote'),
                      })),
                    h('div', { key: 'list', style: { flex: 1, minHeight: 0, overflowY: 'auto' } },
                      notes.length === 0
                        ? h('div', { style: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, textAlign: 'center', padding: '24px 0' } }, t('noteEmpty'))
                        : notes.map((note) => editingNote === note.id
                          ? h('div', { key: note.id, className: 'td-note-row', style: { display: 'flex', gap: 6, padding: '5px 8px', borderRadius: 6 } },
                            h('input', {
                              className: 'td-input',
                              style: { flex: 1, minWidth: 0, border: '0.5px solid var(--dsw-alias-state-business-primary)', borderRadius: 6, padding: '3px 8px', fontSize: 12.5, color: 'var(--dsw-alias-label-primary)', outline: 'none', background: 'transparent' },
                              defaultValue: note.text,
                              maxLength: 500,
                              autoFocus: true,
                              onKeyDown: (event) => {
                                if (event.key === 'Enter') { event.preventDefault(); void updateNote(note, event.currentTarget.value) }
                                if (event.key === 'Escape') { event.preventDefault(); setEditingNote(null) }
                              },
                              onBlur: (event) => void updateNote(note, event.currentTarget.value),
                            }))
                          : h('div', {
                            key: note.id,
                            className: 'td-note-row',
                            style: { display: 'flex', alignItems: 'flex-start', gap: 6, padding: '5px 8px', borderRadius: 6 },
                          },
                          h('span', {
                            style: { flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: '19px', wordBreak: 'break-all', color: 'var(--dsw-alias-label-primary)', cursor: 'text' },
                            title: t('noteEditTitle'),
                            onClick: () => setEditingNote(note.id),
                          }, asText(note.text)),
                          h('span', { style: { flex: 'none', fontSize: 10.5, color: 'var(--dsw-alias-label-tertiary)', paddingTop: 3 } }, noteRelTime(t, note.createdAt)),
                          h('button', {
                            className: 'td-note-act td-btn',
                            style: { flex: 'none', fontSize: 11, border: 'none', background: 'transparent', color: 'var(--dsw-alias-label-tertiary)', cursor: 'pointer', padding: '1px 5px', borderRadius: 4 },
                            title: t('toTodo'),
                            'aria-label': t('toTodo'),
                            onClick: () => setDialog({ initial: { title: note.text } }),
                          }, '→ ' + t('todo')),
                          h('button', {
                            className: 'td-note-act td-btn',
                            style: { flex: 'none', fontSize: 11, border: 'none', background: 'transparent', color: 'var(--dsw-alias-label-tertiary)', cursor: 'pointer', padding: '1px 5px', borderRadius: 4 },
                            title: t('noteDeleteTitle'),
                            'aria-label': t('noteDeleteTitle'),
                            onClick: () => void removeNote(note),
                          }, '✕'),
                        ))),
                  ]
                  : null,
              ),
```

dock 头部（T3 的壳）补计数与折叠回调：head 上加 `onClick: toggleDock`、`'aria-expanded': dockOpen ? 'true' : 'false'`；计数 span 改成 `notes.length > 0 ? \` · ${notes.length}\` : ''`，箭头文字 `dockOpen ? '▾' : '▸'`。

- [ ] **Step 5: dict 双语补键（zh 值 / en 值）**

```js
        quickNote: '便利贴', noteAddPlaceholder: '记一点… 回车即存', noteEmpty: '一想起来就写一条',
        noteEditTitle: '点击编辑', noteDeleteTitle: '删除这条便签', toTodo: '转为待办',
        justNow: '刚刚', minutesAgo: '{n} 分钟前', hoursAgo: '{n} 小时前',
```

```js
        quickNote: 'Sticky notes', noteAddPlaceholder: 'Jot… Enter to save', noteEmpty: 'Write a thought when it comes',
        noteEditTitle: 'Click to edit', noteDeleteTitle: 'Delete this note', toTodo: 'Turn into todo',
        justNow: 'Just now', minutesAgo: '{n}m ago', hoursAgo: '{n}h ago',
```

- [ ] **Step 6: 收门**

Run: `node --check client.js` && `node --test`
Expected: 全绿。

- [ ] **Step 7: 手工快验（对照原型 `design/2026-11-02-sticky-notes-proto.html` A 形态）**：回车新增置顶、点文字进入行内编辑（Enter 存/Esc 撤）、✕ 删除、500 字输入框截断、空态文案、hover 出 `→ 待办`/`✕`、刷新后仍在（落盘）。

- [ ] **Step 8: Commit**

```bash
git add client.js
git commit -m "feat(v3): 便签坞形态 A——快速输入+多条小便签+行内编辑+删除"
```

---

### Task 5: 转待办联动

**Files:**
- Modify: `client.js`（TodoDialog 表单初始化 1 行 + T4 的 `→ 待办` onClick）

**Interfaces:**
- Consumes: T4 的 `setDialog({ initial: { title: note.text } })`。
- Produces: 无新接口（1 行语义扩展：`initial.title` 在新建态生效为预填）。

- [ ] **Step 1: TodoDialog 表单初始 title 行（client.js:995）**

旧：

```js
        title: editing ? asText(initial.title) : '',
```

新：

```js
        title: editing ? asText(initial.title) : (asText(initial?.title) ?? ''),
```

（`dueDate` 行已有 `initial?.dueDate || 今天` 的既有兜底，不用动；`→ 待办` 打开时因 initial 无 `dueDate`，日期默认今天，用户可自行清除——不动日期默认逻辑。）

- [ ] **Step 2: 语义核对**：便签**保留**，不自动删除（设计 §4.2）；保存后由用户自行决定是否删便签。

- [ ] **Step 3: 收门 + 验证**

Run: `node --check client.js` && `node --test`
Expected: 全绿。手工：hover 便签 → `→ 待办` → 弹窗标题已预填整句、日期=今天可改；保存成功后便签仍在。

- [ ] **Step 4: Commit**

```bash
git add client.js
git commit -m "feat(v3): 便签一键转待办（标题预填进新建弹窗）"
```

---

### Task 6: 空白利用增强（未选中升满 + 编辑防压缩）

**Files:**
- Modify: `client.js`（TodoPage：dock 焦点防压缩 + 折叠态记忆为内存态，不持久化）

**Interfaces:**
- Consumes: T3/T4 的 dock 结构、`dockOpen/setDockOpen`。
- Produces: `dockFocusRef`、dock 高度计算 `idleDetail`。

- [ ] **Step 1: state 追加与高度计算（T4 state 附近）**

```js
      const dockRef = useRef(null)
      const dockFocusRef = useRef(false)
```

```js
      const dayDetailActive = dayKey !== null
      const idleDetail = selectedItem === null && !dayDetailActive
      const dockGrow = idleDetail || (dockFocusRef.current && dockOpen)
      const dockHeight = dockOpen ? (dockGrow ? '100%' : '42%') : 'auto'
      const dockMinHeight = dockGrow ? 320 : 180
```

dock 外层 style 改为 `{ ...S.dock, height: dockHeight, minHeight: dockMinHeight }`，并加：

```js
              ref: dockRef,
              onFocusCapture: () => {
                dockFocusRef.current = true
                forceDockTick()
              },
              onBlurCapture: (event) => {
                if (!dockRef.current?.contains(event.relatedTarget)) {
                  dockFocusRef.current = false
                  forceDockTick()
                }
              },
```

（focus/ref 属于 ref 可变值，React 不会自动重渲；需要一个最小 tick 触发函数，放在 TodoPage 顶部：）

```js
      const [, dockTick] = useState(0)
      const forceDockTick = useCallback(() => dockTick((v) => v + 1), [])
```

- [ ] **Step 2: 折叠挂头**：dock head（T3 壳补过的 onClick）确认 `onClick: toggleDock` 与 `'aria-expanded'` 已接；折叠时 body 渲染 null（T4 已处理），头行保持 30px。

- [ ] **Step 3: 行为核对**（防压缩验收）：在便签输入框获得焦点时点左列任意待办 → dock **不**回落；点击 dock 外任意非输入区 → 0.18s 回落 42%。

- [ ] **Step 4: 收门**

Run: `node --check client.js` && `node --test`
Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
git add client.js
git commit -m "feat(v3): 未选中待办时便签坞自动升满；编辑中不压缩、失焦回落"
```

---

### Task 7: `personal_note` 工具 + 互指文案

**Files:**
- Modify: `lib/tool.js`
- Modify: `index.js`
- Create: `test/note-tool.test.js`

**Interfaces:**
- Consumes: T2 的 `api.noteAdd/notesList/noteRemove`。
- Produces: 新工具 `personal_note`（`ToolDefinition`）。参数：`action` ∈ add/list/delete；`text` ≤500（add 必填）；`id`（delete 必填）。

- [ ] **Step 1: 写测试（`test/note-tool.test.js`，独立 harness，照 tool.test.js 的 mkdtemp 模式）**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStore } from '../lib/store.js'
import { createApi } from '../lib/api.js'
import { createNoteTool, createTool } from '../lib/tool.js'
import { TodoError } from '../lib/model.js'

async function make(t) {
  const dir = await mkdtemp(join(tmpdir(), 'todo-notetool-'))
  const store = createStore({ file: join(dir, 'todos.json') })
  const ready = store.load()
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }) })
  const api = createApi(store)
  return { note: createNoteTool(api, ready), todo: createTool(api, ready) }
}

test('add → list → delete 的完整闭环', async (t) => {
  const { note } = await make(t)
  const added = await note.execute({ action: 'add', text: '帮李总查回款' }, {})
  assert.ok(added.item.id.startsWith('n_'))
  const listed = await note.execute({ action: 'list' }, {})
  assert.equal(listed.items.length, 1)
  assert.match(note.output.render({ action: 'list' }, listed)[0].text, /n_/)
  const removed = await note.execute({ action: 'delete', id: added.item.id }, {})
  assert.deepEqual(removed.removed, { id: added.item.id })
  await assert.rejects(() => note.execute({ action: 'delete', id: 'n_ghost' }, {}),
    (e) => e instanceof TodoError && e.code === 'not-found')
})

test('空文本 / 超长 500 / 未知 action 都报 invalid-input', async (t) => {
  const { note } = await make(t)
  await assert.rejects(() => note.execute({ action: 'add', text: '  ' }, {}), (e) => e.code === 'invalid-input')
  await assert.rejects(() => note.execute({ action: 'add', text: '字'.repeat(501) }, {}), (e) => e.code === 'invalid-input')
  await assert.rejects(() => note.execute({ action: 'nope' }, {}), /不支持的 action/)
})

test('delete 缺 id 报 invalid-input', async (t) => {
  const { note } = await make(t)
  await assert.rejects(() => note.execute({ action: 'delete' }, {}), (e) => e.code === 'invalid-input')
})

test('命名与描述分界：提 personal_todo；personal_todo 反向提到本工具', async (t) => {
  const { note, todo } = await make(t)
  assert.equal(note.name, 'personal_note')
  assert.match(note.description, /personal_todo/)
  assert.match(note.description, /随手记|无日期/)
  assert.match(todo.description, /personal_note/)
})

test('execute(null) 抛 invalid-input', async (t) => {
  const { note } = await make(t)
  await assert.rejects(() => note.execute(null, {}), (e) => e.code === 'invalid-input')
})
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `node --test test/note-tool.test.js`
Expected: FAIL —— `createNoteTool` 未导出。

- [ ] **Step 3: `lib/tool.js` 末尾新增 `createNoteTool`**

```js
const NOTE_ACTIONS = ['add', 'list', 'delete']

export function createNoteTool(api, ready) {
  async function run(input = {}) {
    await ready
    if (input === null || typeof input !== 'object') {
      throw new TodoError('invalid-input', '参数必须是对象')
    }
    const action = input.action
    if (!NOTE_ACTIONS.includes(action)) {
      throw new TodoError('invalid-input', `不支持的 action：${String(action)}，可用 ${NOTE_ACTIONS.join(' / ')}`)
    }
    if (action === 'add') {
      const text = typeof input.text === 'string' ? input.text : ''
      return { item: await api.noteAdd({ text }) }
    }
    if (action === 'list') return api.notesList()
    if (typeof input.id !== 'string' || input.id.trim() === '') {
      throw new TodoError('invalid-input', 'id 必填')
    }
    return { removed: await api.noteRemove({ id: input.id }) }
  }

  return {
    name: 'personal_note',
    description:
      '管理用户本人的临时便签（随手记的小事：没有日期、没有完成状态、不参与任何分组统计）。' +
      'action=add 新增（text 必填，≤500 字）；action=list 全量列表；action=delete 删除（id 必填）。' +
      '仅在用户明确要求记录时调用；用户说「记一下/便签上记一笔」且没要求时间、提醒或跟踪排期时，用本工具而不是 personal_todo；' +
      '需要日期、完成勾选或提醒的事，请用 personal_todo。不要替用户清理或改写便签，除非用户明确要求。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: NOTE_ACTIONS, description: '要执行的操作' },
        text: { type: 'string', description: 'add：便签内容，≤500 字' },
        id: { type: 'string', description: 'delete：便签 id' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object' },
      render(args, value) {
        if (Array.isArray(value?.items)) {
          return [{ type: 'text', text: value.items.length === 0 ? '便签：暂无' : value.items.map((item) => `- (${item.id}) ${item.text}`).join('\n') }]
        }
        if (value?.item) return [{ type: 'text', text: `已记下 (${value.item.id})：${value.item.text}` }]
        if (value?.removed) return [{ type: 'text', text: `已删除便签 (${value.removed.id})` }]
        return [{ type: 'text', text: JSON.stringify(value) }]
      },
    },
    execute: run,
  }
}
```

- [ ] **Step 4: `index.js` 注册（import 行与 tool 同款 effect 一行）**

```js
import { createTool, createNoteTool } from './lib/tool.js'
```

```js
  ctx.effect(() => ctx.tools.register(createNoteTool(api, ready)), 'dsh-sidebar-todo: note-tool')
```

- [ ] **Step 5: `personal_todo` 描述加一句互指（description 末尾）**

```js
      '用户的临时便签用 personal_note（随手记、无日期无状态）；需要日期、完成跟踪或提醒时才用本工具。',
```

- [ ] **Step 6: 全量回归 + 收门**

Run: `node --test`
Expected: 全绿（≈157）。

- [ ] **Step 7: Commit**

```bash
git add lib/tool.js index.js test/note-tool.test.js
git commit -m "feat(v3): personal_note 工具（add/list/delete）+ 双工具互指分界"
```

---

### Task 8: 服务端筛选 + 工具参数

**Files:**
- Modify: `lib/store.js`（list 过滤）、`lib/tool.js`（参数/description/filterNote）
- Create: `test/filters.test.js`

**Interfaces:**
- Consumes: `store.list({ view?, q? })` 现状。
- Produces: `list({ category?, uncategorized?, priority?, q?, view? })`——`category` 精确匹配、空串忽略；`uncategorized === true` 只看 `category == null`；`priority` ∈ high/medium/low 且缺省忽略；非法 priority 报 `invalid-input`；与 `q`、`view` 全 AND。工具 `list` 同名参数；`filterNote` 文案更新。T10 沿用。

- [ ] **Step 1: 写测试（`test/filters.test.js`，独立 tmpdir harness 同 notes-store 模式）**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStore } from '../lib/store.js'
import { TodoError } from '../lib/model.js'

async function make(t) {
  const dir = await mkdtemp(join(tmpdir(), 'todo-filter-'))
  const store = createStore({ file: join(dir, 'todos.json') })
  await store.load()
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }) })
  return store
}

test('category / uncategorized / priority 三轴各自生效并可组合', async (t) => {
  const store = await make(t)
  await store.create({ title: 'a', category: '工作', priority: 'high' })
  await store.create({ title: 'b', category: '工作' })
  await store.create({ title: 'c' })
  assert.equal((await store.list({ category: '工作' })).items.length, 2)
  assert.equal((await store.list({ category: '生活' })).items.length, 0)
  assert.equal((await store.list({ uncategorized: true })).items.length, 1)
  assert.equal((await store.list({ priority: 'high' })).items.length, 1)
  const both = await store.list({ category: '工作', priority: 'high' })
  assert.equal(both.items.length, 1)
  assert.equal(both.items[0].title, 'a')
})

test('与搜索词 AND；空串与缺省都等价不过滤', async (t) => {
  const store = await make(t)
  await store.create({ title: '回款表', category: '审计' })
  await store.create({ title: '回款口径', category: '工作' })
  assert.equal((await store.list({ q: '回款', category: '审计' })).items.length, 1)
  assert.equal((await store.list({ q: '回款', category: '' })).items.length, 2)
})

test('非法 priority 报 invalid-input（防止静默空结果误导）', async (t) => {
  const store = await make(t)
  await assert.rejects(() => store.list({ priority: 'urgent' }), (e) => e instanceof TodoError && e.code === 'invalid-input')
})

test('循环任务同样吃筛选（current-period 形状保持不变）', async (t) => {
  const store = await make(t)
  await store.create({ title: '日报', repeat: { freq: 'weekly', weekdays: [1, 2, 3, 4, 5] }, category: '工作' })
  await store.create({ title: '周报', category: '审计' })
  const only = await store.list({ category: '工作' })
  assert.equal(only.items.length, 1)
  assert.equal(only.items[0].title, '日报')
  assert.equal(only.items[0].isRepeating, true)
})
```

- [ ] **Step 2: 跑失败**：`node --test test/filters.test.js` → category 过滤不生效（4 例 FAIL）。

- [ ] **Step 3: `store.list()` 在现有 `view`/`q` 段之后插入（items 排序前）**

```js
      // 分类与优先级筛选在 view/q 之后叠加；空串与缺省一律视为不过滤。
      const priorityWanted = filter.priority
      if (priorityWanted !== undefined && priorityWanted !== null && priorityWanted !== '' && priorityWanted !== false) {
        if (priorityWanted !== 'high' && priorityWanted !== 'medium' && priorityWanted !== 'low') {
          throw new TodoError('invalid-input', 'priority 只能是 high / medium / low')
        }
        items = items.filter((todo) => todo.priority === priorityWanted)
      }
      if (filter.category !== undefined && filter.category !== null && filter.category !== '' && filter.category !== false) {
        if (typeof filter.category !== 'string') throw new TodoError('invalid-input', 'category 必须是文本')
        items = items.filter((todo) => todo.category === filter.category)
      }
      if (filter.uncategorized === true) {
        items = items.filter((todo) => todo.category === null)
      }
```

（`TodoError` 已在 store.js import。注意 Keep filterfalse 的宽松语义：HTTP 客户端可能送 `{category:false}`? 客户端不会；严格点也行——保守忽略，避免误伤。）

- [ ] **Step 4: `lib/tool.js` 参数与 filterNote**

`parameters.properties` 内（view 行旁）追加：

```js
        category: { type: 'string', description: "list：只看这个分类（精确匹配）；传空串等于不过滤" },
        priority: { type: 'string', enum: ['high', 'medium', 'low'], description: 'list：只看这个优先级' },
```

`filterNote` 更新为：

```js
function filterNote(args) {
  const parts = []
  if (typeof args?.view === 'string' && args.view !== '') parts.push(`view=${args.view}`)
  if (typeof args?.category === 'string' && args.category !== '') parts.push(`分类「${args.category}」`)
  if (args?.uncategorized === true) parts.push('无分类')
  if (typeof args?.priority === 'string' && args.priority !== '') parts.push(`优先级 ${args.priority}`)
  const q = typeof args?.q === 'string' ? args.q.trim() : ''
  if (q !== '') parts.push(`关键词「${q}」`)
  if (parts.length === 0) return ''
  return `（以下为 ${parts.join(' / ')} 的筛选结果，计数为全量）`
}
```

description 里 list 一句改为：

```js
      'action=list 查询（支持 view / category / priority / q 筛选）；add 新建；update 修改；complete 勾选/取消…'
```

- [ ] **Step 5: 全量回归 + 收门 + Commit**

Run: `node --test` → 全绿。

```bash
git add lib/store.js lib/tool.js test/filters.test.js
git commit -m "feat(v3): list 支持分类/优先级筛选，工具同步参数与筛选说明"
```

---

### Task 9: 计数口径修正 + 页头四项（T10 的前置）

**Files:**
- Modify: `lib/store.js`（summary 在过滤前计算）、`client.js`（页头 span）
- Create: `test/summary-caliber.test.js`

**Interfaces:**
- Consumes: `summarize(items, now)`（bucket.js，不改）。
- Produces: `list({q…}).summary` 恒为**过滤前全量**；页头四项 `今天·逾期·积压·未排期`。工具 render 头部文案不动（已含未排期，见 test/tool.test.js:37 断言）。

- [ ] **Step 1: 写测试（`test/summary-caliber.test.js`）**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dateKey, shiftKey } from '../lib/bucket.js'
import { createStore } from '../lib/store.js'

async function make(t) {
  const dir = await mkdtemp(join(tmpdir(), 'todo-summary-'))
  const store = createStore({ file: join(dir, 'todos.json') })
  await store.load()
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }) })
  return store
}

test('搜索/筛选不缩小 summary（全量口径）', async (t) => {
  const store = await make(t)
  const today = dateKey(new Date())
  await store.create({ title: '回款，今天的' , dueDate: today })
  await store.create({ title: '别的事', category: '工作' })
  const searched = await store.list({ q: '回款' })
  assert.equal(searched.items.length, 1)
  assert.equal(searched.summary.today, 1)
  assert.equal(searched.summary.unplanned, 1, '被搜索掐掉的「别的事」仍要计入未排期')
  const filtered = await store.list({ category: '工作' })
  assert.equal(filtered.items.length, 1)
  assert.equal(filtered.summary.today, 1)
})

test('全量口径含 doneToday（既有语义迁移）', async (t) => {
  const store = await make(t)
  const created = await store.create({ title: 'a' })
  await store.complete(created.id, true, 'user')
  await store.create({ title: 'b' })
  const out = await store.list({ q: 'b' })
  assert.equal(out.summary.doneToday, 1)
  assert.equal(out.summary.unplanned, 1)
})
```

- [ ] **Step 2: 跑失败**：`node --test test/summary-caliber.test.js` → `summary.unplanned` 断言 FAIL（现状 0）。

- [ ] **Step 3: `store.list()` 最小 diff：summary 抬到过滤前**

在构建出 `items`（`state.todos.map(...).filter(Boolean)` 完成、T8 筛选尚未开始）之后，多存一份全量：

```js
      const allShaped = items.slice()   // 过滤前全量，只喂 summary
```

函数 `return` 处把 `summary: summarize(items, now)` 改为：

```js
        summary: summarize(allShaped, now),
```

（`items` 的 view/q/category/priority 过滤、排序、notices 全部保持原逻辑不动。这样筛选只影响 items，summary 永远全量。）

- [ ] **Step 4: client 页头（client.js:1876）四项计数**

```js
          h('span', { style: S.count }, `${t('today')} ${state.summary.today ?? 0} · ${t('overdue')} ${state.summary.overdue ?? 0} · ${t('stale')} ${state.summary.stale ?? 0} · ${t('unplanned')} ${state.summary.unplanned ?? 0}`),
```

（工具头部文案含「最近完成」，是给模型的；页面头部四项即可，不放最近完成。）

- [ ] **Step 5: 全量回归 + 收门**

Run: `node --test`
Expected: 全绿——既有断言的 summary 语义升级后依旧成立；新增口径覆盖全部来自 test/summary-caliber.test.js。

- [ ] **Step 6: Commit**

```bash
git add lib/store.js client.js test/summary-caliber.test.js
git commit -m "fix(v3): 页头计数改为过滤前全量口径，页头补未排期计数"
```

---

### Task 10: `ended` 循环分组（与 T9 串行，都在 store.list）

**Files:**
- Modify: `lib/store.js`、`lib/bucket.js`（summarize）、`client.js`、`lib/tool.js`
- Create: `test/ended.test.js`

**Interfaces:**
- Consumes: `nextOccurrence/periodOccurrence/periodRange/completedInPeriod`；T9 的 `shaped/summary` 结构。
- Produces: `bucket: 'ended'`（`dueDate: null`、`seriesEnded: true`、无复选框语义）；`summary.ended`；`view: 'ended'`；工具头部 describe 分支「循环·已结束」可达。

- [ ] **Step 1: 写测试（`test/ended.test.js`）**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bucketOf, dateKey, shiftKey, summarize } from '../lib/bucket.js'
import { applyPatch } from '../lib/model.js'
import { createStore } from '../lib/store.js'

const TODAY = dateKey(new Date())

async function make(t) {
  const dir = await mkdtemp(join(tmpdir(), 'todo-ended-'))
  const store = createStore({ file: join(dir, 'todos.json') })
  await store.load()
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }) })
  return store
}

test('until 已过的周循环进入回收区 bucket=ended（dueDate=null）', async (t) => {
  const store = await make(t)
  const yesterday = shiftKey(TODAY, -1)
  await store.create({ title: '旧周例会', dueDate: '2026-10-01', repeat: { freq: 'weekly', weekdays: [1], until: yesterday } })
  const out = await store.list({})
  const ended = out.items.find((item) => item.title === '旧周例会')
  assert.equal(ended.bucket, 'ended')
  assert.equal(ended.dueDate, null)
  assert.equal(ended.seriesEnded, true)
  assert.equal(out.summary.ended, 1)
})

test('view=open 不含 ended；view=ended 单独可查', async (t) => {
  const store = await make(t)
  await store.create({ title: '正常的', repeat: { freq: 'daily' } })
  await store.create({ title: '旧周例会', dueDate: '2026-10-01', repeat: { freq: 'weekly', weekdays: [1], until: '2026-10-31' } })
  const open = await store.list({ view: 'open' })
  assert.deepEqual(open.items.map((i) => i.title), ['正常的'])
  const ended = await store.list({ view: 'ended' })
  assert.deepEqual(ended.items.map((i) => i.title), ['旧周例会'])
})

test('把 until 往后延即可「复活」回正常分组', async (t) => {
  const store = await make(t)
  const created = await store.create({ title: '旧月度复盘', dueDate: '2026-10-01', repeat: { freq: 'monthly', monthDay: 1, until: '2026-10-31' } })
  const ended = await store.list({ view: 'ended' })
  assert.equal(ended.items.length, 1)
  const long = applyPatch(ended.items[0], { repeat: { freq: 'monthly', monthDay: 1, until: '2027-12-31' } })
  await store.update(created.id, { repeat: long.repeat })
  const open = await store.list({ view: 'open' })
  assert.ok(open.items.some((i) => i.title === '旧月度复盘'))
})

test('本周期已办过但规则未结束的：维持隐藏，不误判 ended', async (t) => {
  const store = await make(t)
  const todo = await store.create({ title: '每周例会', dueDate: '2026-10-01', repeat: { freq: 'weekly', weekdays: [3] } })
  // 把本周内当前周期的那次完成掉 → 整行收起（原 v2 语义）
  const periodDue = store.list({}).items.find((i) => i.title === '每周例会').dueDate
  await store.complete(todo.id, true, 'user', periodDue)
  const out = await store.list({})
  assert.equal(out.items.some((i) => i.title === '每周例会'), false)
  assert.equal(out.summary.ended, 0)
})

test('summarize 认识 ended 计数', () => {
  const items = [
    { bucket: 'today' }, { bucket: 'ended' }, { bucket: 'ended' },
  ]
  const out = summarize(items, new Date())
  assert.equal(out.today, 1)
  assert.equal(out.ended, 2)
})

test('bucketOf 不认识 ended（它只由 store.list 派发）——防呆检查', () => {
  // bucketOf 只认 open 状态的常规桶；ended 不是 bucketOf 的输出。
  const todo = { done: false, dueDate: shiftKey(TODAY, 30) }
  assert.equal(bucketOf(todo, new Date(), 7), 'later')
})
```

- [ ] **Step 2: 跑失败**：`node --test test/ended.test.js` → `bucket === 'ended'` FAIL（现状整条消失）/ `summary.ended` undefined。

- [ ] **Step 3: `store.list()` 循环分支替换（T9 之后这段代码长这样，把现有 `if (!isRepeating) ...` 整块替换）**

```js
      let items = state.todos.map((todo) => {
        const isRepeating = Boolean(todo.repeat)
        if (!isRepeating) {
          return { ...todo, isRepeating, nextDue: todo.dueDate, bucket: bucketOf(todo, new Date(), staleDays) }
        }
        const anchored = todo.dueDate ? todo : { ...todo, dueDate: seriesStartOf(todo) }
        if (!anchored.dueDate) return null
        const outstanding = periodOccurrence(anchored, today, todo.completions ?? {})
        const nextByRule = nextOccurrence(anchored, today)
        if (outstanding !== null) {
          const shaped = { ...todo, dueDate: outstanding, done: false }
          return {
            ...shaped,
            isRepeating,
            nextDue: nextOpenOccurrence(anchored, today),
            completions: todo.completions ?? {},
            bucket: bucketOf(shaped, now, staleDays),
          }
        }
        if (nextByRule === null) {
          // 规则已走到尽头（until 已过）：整条进入「已结束」，可见可编辑可删——不再凭空消失。
          return {
            ...todo,
            dueDate: null,
            done: false,
            isRepeating,
            seriesEnded: true,
            nextDue: null,
            completions: todo.completions ?? {},
            bucket: 'ended',
          }
        }
        if (completedInPeriod(anchored, today)) return null
        const open = nextOpenOccurrence(anchored, today)
        if (open === null) return null
        const shaped = { ...todo, dueDate: open, done: false }
        return {
          ...shaped,
          isRepeating,
          nextDue: open,
          completions: todo.completions ?? {},
          bucket: bucketOf(shaped, now, staleDays),
        }
      }).filter(Boolean)
```

view 逻辑追加：

```js
      if (view === 'today') ...      // 原分支不动；ended 桶不命中这些 view，天然分开
      else if (view === 'open') items = items.filter((t) => t.bucket !== 'done' && t.bucket !== 'ended')
      else if (view === 'ended') items = items.filter((t) => t.bucket === 'ended')
```

（原 `open` 行只有 `!== 'done'`，补一半；`ended` 分支整体新增。）

- [ ] **Step 4: `lib/bucket.js` summarize 认识 ended**

```js
export function summarize(items, now = new Date()) {
  const out = { overdue: 0, today: 0, tomorrow: 0, week: 0, later: 0, stale: 0, unplanned: 0, doneToday: 0, ended: 0 }
  const today = dateKey(now)
  for (const item of items) {
    if (item.bucket === 'ended') {
      out.ended += 1
      continue
    }
    if (item.bucket === 'done') {
      if (item.doneAt && dateKey(new Date(item.doneAt)) === today) out.doneToday += 1
      continue
    }
    if (Object.hasOwn(out, item.bucket)) out[item.bucket] += 1
  }
  return out
}
```

（若 `test/bucket.test.js` 有 summarize 全键断言，跑完后把 `ended: 0` 并进期望键集即可。）

- [ ] **Step 5: `client.js` 渲染**

5a. `ORDER` 末尾加 `'ended'`：

```js
    const ORDER = ['overdue', 'today', 'tomorrow', 'week', 'later', 'stale', 'unplanned', 'ended', 'done']
```

5b. `openGroups` 过滤排除 done 与 ended（client.js:1790-1793）：

```js
        .filter((bucket) => bucket !== 'done' && bucket !== 'ended')
```

5c. 已结束折叠区 state：

```js
      const [endedOpen, setEndedOpen] = useState(false)
```

5d. 渲染：放在 openGroups 之后、已完成（`hasDoneData ? ...`）之前。生成 ended 分组：

```js
      const endedItems = items.filter((item) => item.bucket === 'ended')
      // S 追加：endedRow: { display: 'flex', alignItems: 'center', gap: 8, height: 34, padding: '0 8px', borderRadius: 6, cursor: 'pointer' }
      const renderEndedRow = (item) => {
        const keys = Object.keys(item.completions ?? {}).sort()
        const lastCompletion = keys.length > 0 ? keys[keys.length - 1] : ''
        return h('div', {
          key: item.id,
          className: 'td-note-row',
          style: S.endedRow,
          onClick: () => setSelected(item.id),
        },
          h('span', { 'aria-hidden': 'true', style: { width: 3, height: 16, borderRadius: 2, flex: 'none', background: item.priority ? priorityColor(item.priority) : 'transparent' } }),
          h('span', { style: S.nm }, asText(item.title)),
          h('span', { style: S.tag }, t('endedBadge')),
          h('span', { style: S.due }, lastCompletion ? `上次完成 ${lastCompletion.slice(5)}` : ''),
        )
      }
```

（`S.endedRow` 按注释行加进 S；dict 补 `endedGroup`（zh `已结束` / en `Ended`）与 `endedBadge`（zh `已结束` / en `Ended`）。优先级色条与 `renderRecurringDone`（client.js:1822-1830）同构，无优先级用透明占位。点击行只选中；详情里的编辑/删除/(disabled 的)完成沿用既有三态树，`selectedRepeatEnded` 分支本版终于可达。）

区块 JSX（在完成后段落的 openGroups map 后插入）：

```js
                    endedItems.length > 0
                      ? h('div', { key: 'ended' },
                        h('div', { style: S.sec },
                          h('button', {
                            type: 'button', className: 'td-btn', style: S.doneToggle,
                            'aria-expanded': endedOpen ? 'true' : 'false',
                            onClick: () => setEndedOpen((open) => !open),
                          },
                            h('span', { style: S.secT }, t('endedGroup')),
                            h('span', { style: S.secN }, String(endedItems.length)),
                          ),
                          h('span', { style: S.line }),
                          h('span', { style: { ...S.tag, color: 'var(--dsw-alias-label-tertiary)' } }, endedOpen ? '▾' : '▸'),
                        ),
                        endedOpen
                          ? h('div', null, endedItems.map((item) => renderEndedRow(item)))
                          : null,
                      )
                      : null,
```

（head 部分若与既有 done 头并不同型，直接拿 doneHead 的 JSX 改造，视觉风格保持一致——计划不重复抄，执行者以抄现有 done 头为准。）

5e. 详情列确认（不加代码，验收检查）：点击已结束行选中 → 详情按钮区 primary 是「撤销完成/完成本次」的 disabled 态（`selectedRepeatEnded` 分支本版终于可达）；编辑弹窗打开后修改「结束日期」保存，行即回正常分组——已在 store 测试覆盖，属 UI 走查点。

- [ ] **Step 6: `lib/tool.js` 收尾**

view 枚举加 `'ended'`：

```js
        view: { type: 'string', enum: ['open', 'today', 'week', 'stale', 'done', 'ended'], description: "list 的过滤视图；ended=已结束的循环系列" },
```

describe 循环分支已经是 `（循环·已结束）`，本版因 dueDate=null 新形状真正可达；render 計數头部外加一行（可选）：

```js
        const endedNote = s.ended ? ` · 已结束 ${s.ended}` : ''
        const head = `待办：今天 ${s.today ?? 0} · 逾期 ${s.overdue ?? 0} · 积压 ${s.stale ?? 0} · 未排期 ${s.unplanned ?? 0}${endedNote} · 最近完成 ${s.doneToday ?? 0}`
```

（头部兼容性：`endedNote` 仅在 `s.ended > 0` 时才出现，因此 test/tool.test.js:37 的既有头部断言在无 ended 数据时完全不变，不必改。）

- [ ] **Step 7: 全量回归 + 收门**

Run: `node --test`
Expected: 全绿。journey D1-D6 的断言不涉及 ended；若失败，优先核对是否把 ended 行算进了 open 视图（不应），再修实现，不放宽断言。

- [ ] **Step 8: Commit**

```bash
git add lib/store.js lib/bucket.js lib/tool.js client.js test/ended.test.js
git commit -m "feat(v3): 已结束的循环任务单独成组——可见、可编辑、可删除，summary 计数"
```

---

### Task 11: 错误内联

**Files:**
- Modify: `client.js`（fetchApi / mutate / 弹窗 / 布局四按钮 / 便签 handlers / actionError 展示）

**Interfaces:**
- Consumes: `fetchApi`/`mutate`/`TodoDialog` 现状。
- Produces: `fetchApi` 错误携带 `code/status/message`；`mutate` 改返回 `{ ok: true } | { ok: false, error }`（ sloped：调用点两处判定 + 便签三处，本任务一并改完）。

- [ ] **Step 1: `fetchApi`（client.js:103-113）改抛带 code 的错误**

```js
    async function fetchApi(method, payload, t = defaultT) {
      const res = await fetch(apiUrl(method), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload ?? {}),
      })
      const body = await res.json().catch(() => null)
      if (!body) {
        const err = new Error(t('badResponse')); err.code = 'bad-response'; err.status = res.status; throw err
      }
      if (!body.ok) {
        const err = new Error(body.error?.message ?? t('requestFailed'))
        err.code = body.error?.code; err.status = res.status; throw err
      }
      return body.result
    }
```

- [ ] **Step 2: `mutate` 改返回对象（client.js:1674-1691）**

```js
      const mutate = useCallback(async (method, payload) => {
        try {
          await fetchApi(method, payload, tRef.current)
          dismissActionError()
          setDataVersion((v) => v + 1)
          await reload()
          return { ok: true }
        } catch (err) {
          console.error(`[dsh-sidebar-todo] ${method} failed`, err)
          showActionError(err?.message ?? '')
          await reload()
          return { ok: false, error: err }
        }
      }, [reload, dismissActionError, showActionError])
```

- [ ] **Step 3: actionError 从 boolean 升为带 message 的展示**

```js
      const [actionError, setActionError] = useState(null)
```

`showActionError(message)` 存(message 并保留 5s timer)；HUD：

```js
        actionError
          ? h('div', { role: 'alert', style: S.error }, `操作失败：${actionError}`)
          : null,
```

（原文案 t('actionFailed') 保留成前缀；服务端 message 是中文服务端话，en 界面暂用中文兜底——限本版本，退路在 design §4.5。）

- [ ] **Step 4: 调用点改造（写死（两处判定 + 三处便签/signature 变化调用））**

4a. TodoDialog submit（client.js:1099-1113）：

```js
          const res = form.id === null
            ? await mutate('create', payload)
            : await mutate('update', { id: form.id, patch: payload })
          if (!res.ok) {
            setError(res.error?.message ?? t('requestFailed'))
            return
          }
          onSaved()
```

4b. 详情删除（client.js:2128-2129）：

```js
                        const res = await mutate('remove', { id: selectedItem.id })
                        if (res.ok) setSelected(null)
```

（`setSelected(null)` 从 await 之前挪到成功后；失败则保留选中等用户再试。）

4c. 便签三处（T4 写法为 boolean）：`const res = await mutate('noteAdd', …); if (!res.ok) return`；`removeNote` 保持 void（只吃错误提示）；`updateNote` 同。

4d. `toggleDayItem` 与 `toggleItem`、详情 complete 按钮、撤销完成——都是 `void mutate(...)` 语义（返回值无人消费），**保持不改**。

- [ ] **Step 5: 弹窗 maxLength 前置**

- title 输入：加 `maxLength: 200`
- category 输入（todo 弹窗）：加 `maxLength: 24`
- note textarea：加 `maxLength: 2000`
- 便签 quick 输入/行内编辑：`maxLength: 500`（T4 已加）

（服务端仍是唯一权威；maxLength 只是把常见 400 挡在提交前。）

- [ ] **Step 6: 收门**

Run: `node --check client.js` && `node --test`
Expected: 全绿。手工验证：标题 201 字直接保存 → 弹窗**内联**显示「标题过长（上限 200 字）」且不关闭；断网/写失败（把 `.tmp` 占用复现）→ 顶部红条出现并 5s 后消失。

- [ ] **Step 7: Commit**

```bash
git add client.js
git commit -m "feat(v3): 弹窗错误内联展示 + mutate 错误回传 + 常见 400 前置拦截"
```

---

### Task 12: 轮询按页面可见性暂停

**Files:**
- Modify: `client.js`（TodoPage 的 2.5s interval effect，client.js:1734-1737）

**Interfaces:**
- Consumes: `reload` 依赖不变。
- Produces: 后台标签不再发起请求；回到前台立刻拉一次。

- [ ] **Step 1: 替换原 interval effect**

```js
      useEffect(() => {
        const tick = () => {
          if (document.visibilityState === 'visible') void reload()
        }
        const timer = window.setInterval(tick, 2500)
        document.addEventListener('visibilitychange', tick)
        return () => {
          window.clearInterval(timer)
          document.removeEventListener('visibilitychange', tick)
        }
      }, [reload])
```

- [ ] **Step 2: 收门**

Run: `node --check client.js` && `node --test`
Expected: 全绿。手工：后台标签 1 分钟无 `/todo/api/list` 请求；切回立发一次。

- [ ] **Step 3: Commit**

```bash
git add client.js
git commit -m "perf(v3): 页面不可见时停轮询，回前台立即刷新"
```

---

### Task 13: 文档与校准收尾

**Files:**
- Modify: `package.json`（version 0.3.0）、`README.md`、`CHANGELOG.md`、`docs/notes/testing.md`、`docs/notes/2026-10-22-handoff.md`
- （回写 `docs/notes/2026-11-02-v3-backlog.md` 的 O1 状态）

**Interfaces:** 无代码接口；产出为发布前人工清单。

- [ ] **Step 1: 版本与 CHANGELOG**

`package.json`：`"version": "0.3.0"`。`CHANGELOG.md` 顶部插入（措辞直接采用）：

```markdown
## 0.3.0 — 2026-11-02

- **便利贴**：详情列下方常驻便签坞（多条小便签）：回车即存、行内编辑、单独删除、一键转待办（标题预填）；未选中待办时自动升满利用空白区。数据落在 `todos.json` 顶层 `notes` 数组，无迁移。
- **未选中待办时便签自动升满**：在便签里编辑时点击左列待办不回落，失焦后回落。
- **筛选**：页头「筛选」弹层——分类 / 优先级 / 无分类，与搜索词 AND；`personal_todo list` 同步 `category / priority / uncategorized` 参数。
- **计数口径修正**：页头计数恒为过滤前全量，不随搜索/筛选缩小；补「未排期」显示。
- **已结束的循环任务**：不再凭空消失——单独成组（默认折叠），可查看规则与上次完成、编辑延长结束日期后即时复活、也可删除；`personal_todo list` 新增 `view: 'ended'`。
- **错误内联**：弹窗保存失败时显示服务端原因（如「标题过长（上限 200 字）」），不再只有一条通用红条；标题/分类/备注加最大长度前置拦截。
- **性能**：面板不在前台时暂停 2.5 秒轮询，回到前台立即刷新一次。
- **布局磨光（O1）**：详情内容/按钮组/空态占位居中与均衡（登记簿 docs/notes/2026-11-02-v3-backlog.md）。
- ⚠️ **降级注意**：从 0.3.x 回退到 0.2.x 后再改动待办，`notes` 数组会被旧版本覆盖丢失（旧 persist 不知道该字段）。备份：复制 `todos.json` 即可。
```

- [ ] **Step 2: README**

- 「当前版本」行改 **0.3.0**（v1+v2+v3：编辑弹窗、循环任务、月视图日历、分类、**便签、筛选、已结束回收区**）。
- 「数据在哪」的 JSON 示例更新为 `{ "version": 1, "todos": [...], "notes": [ { "id": "n_...", "text": "周五带门禁卡" } ] }`。
- 「agent 工具」段落追加 `personal_note` 小节（add/list/delete、与 personal_todo 的分界、不替用户清便签）。
- 「开发」段测试数改「以 `node --test` 输出为准（v3 后 ≈180）」并移除"107"旧数。
- 兼容性表追加行 `0.2.1-rc.5 | 0.3.0 | 待走查 | 2026-11-02`（走查后人工改结论）。

- [ ] **Step 3: testing.md 校准**

- 顶部总量改「自动化 X 个用例全绿（v3 后）」，X 以本任务跑出的 `node --test` 实测为准（不要硬编码）。
- §三 適配 v3 旅程：新增 `D7 已结束循环的可见与复活`、`D8 便签生命周期与筛选/计数口径` 段落（从 `test/ended.test.js` `test/filters.test.js` 提炼要点）。
- §四 手工清单追加：

```markdown
- [ ] **E36** 便利贴：回车即存/行内编辑/✕ 删除/→ 待办预填/500 字截断，刷新后仍在
- [ ] **E37** 未选中待办便签坞升满；编辑中不回落，失焦回落
- [ ] **E38** dock 折叠成细条且计数正确；刷新复位
- [ ] **E39** 筛选弹层：分类/优先级/无分类 AND 搜索；页头计数不缩水；清除复原
- [ ] **E40** 已结束循环出现在折叠区；延长 until 复活；删除后消失
- [ ] **E41** 标题 201 字保存 → 弹窗内联显示原因且不关闭
- [ ] **E42** 后台标签无轮询请求；回前台立即刷新
```

- [ ] **Step 4: handoff 追加 v3 摘要段**（3-6 行，含本分支指向与"已实现/遗留"）。

- [ ] **Step 5: 收门与提交**

Run: `node --test`（确认 docs 未破坏任何东西且计数最新）

```bash
git add package.json README.md CHANGELOG.md docs/notes/testing.md docs/notes/2026-10-22-handoff.md docs/notes/2026-11-02-v3-backlog.md
git commit -m "docs(v3): 0.3.0 版本文案、README/CHANGELOG/测试与手册、O1 消化回写"
```

- [ ] **Step 6: 上线前核对（人工，非 agent 步骤）**

1. `set_plugin` 关→开重载插件（index.js/tool 变过，必须重载），刷新页面；
2. 手工走 E36-E42 一遍，结论写回 README 兼容表；
3. 满意后合 `feat/todo-v3` → `main`（finishing-a-development-branch 流程），随后 **是否 npm publish 0.3.0** 由用户单独拍板，agent 不擅自发布。

---

## 自查记录（写计划时已对照）

- 设计 §一 目标 1-8 ↔ T4/T6、T3/O1、T8、T9、T10、T11、T12、T13；§三 接口 ↔ T1/T2/T7/T8/T10；§四 UI ↔ T3-T6；§5.5 已结束 view/工具 ↔ T10；§六 验收 1-9 ↔ T4-T6/E36-38、T8/T9+E39、T10+E40、T11+E41、T12+E42、T13+全量回归。
- 类型一致性：`notesList/noteAdd/noteUpdate/noteRemove`（store=api=既定名）；`personal_note` 参数 `text/id/action`；`bucket:'ended'`、`seriesEnded:true`、`summary.ended`；`S.dock*`、`td-note-row/act`；dict 键 `quickNote/noteAddPlaceholder/noteEmpty/noteEditTitle/noteDeleteTitle/toTodo/justNow/minutesAgo/hoursAgo/endedGroup/endedBadge/pickOne` 以 T4/T10 为准（T10 的 `endedGroup/endedBadge` zh: `已结束`、en: `Ended`）。
- 已知开放点（实现时以测代查）：test/bucket.test.js 若有 summarize 全键断言，把 `ended: 0` 并进期望键集（T10 Step 4 已给代码）。
