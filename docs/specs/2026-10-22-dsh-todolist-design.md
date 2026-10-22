# DSH 待办插件 · 设计文档

**日期**: 2026-10-22
**状态**: 待评审
**定位**: 侧栏入口行 + 主面板页（方案 A），宿主侧持久化，agent 可读可写

---

## 一、目标与非目标

### 目标

1. 在 DSH 左侧栏「新会话」按钮下方、工作区列表上方，增加一行**「待办」**导航入口。
2. 点开后在主面板区显示完整的待办管理工作台：分组列表 + 详情面板。
3. 管理**日常工作**（工作 + 生活），不绑定任何 DSH 会话。
4. 数据落在宿主侧文件，重启后仍在，用户可以直接打开看到。
5. agent 可通过工具读写同一份数据，与 UI 走同一条业务路径。

### 非目标（v1 明确不做）

| 不做 | 原因 |
|---|---|
| 侧栏角标数字 | 已选方案 A，先验证主面板；角标是纯增量，后续加不影响地基 |
| 全局快捷键快速添加浮层 | 同上，第二阶段 |
| 拖拽排序 | 列表按截止日/优先级自动排，手动排序是另一套交互成本 |
| 多标签 | 只保留一个可选「分类」字段（工作/生活/…），多标签筛选在侧栏场景用不上 |
| 提醒/通知/重复任务/子任务 | Trace 竞品分析里排在中低优先级，且依赖通知通道 |
| 导入导出 | 数据本来就是可读 JSON 文件，先不造备份功能 |
| 跨设备同步 | 与「完全离线、数据在本地」的定位冲突 |

---

## 二、落点与槽位（已核实）

宿主 `ui-sidebar` 的列布局是固定的，从上到下：

```
logoRow(60px) → newSession(38px) → panelList(sidebar.panellist) → regionArea(sidebar.workspaces) → footArea
```

可行的席位只有 `sidebar.panellist`（list，`replaceRisk: none`）。它当前有 3 个注册项：

| id | 顺序 | 来源 |
|---|---|---|
| `plugins` | 0 | 宿主 |
| `dsh-market` | 1 | 第三方 |
| `schedules` | 10 | 宿主 |

本插件注册 **id = `todo`、order = 20**，排在最后、紧贴「工作区」标题上方——即用户要求的「新会话下方、工作区上方」区段里离工作区最近的位置。

宿主的 `PanelRow` 组件会自己渲染 `<button>`、16px 图标容器、label、hover/active 态，并在点击时调用 `selectPanel(id)`；因此：

- `sidebar.panellist` 注册的是**图标组件**，接收 `{ size, active }`。
- 同一个 id 必须在 `main`（keyed slot，key 空间开放，当前已占用 `plugins` / `conversation` / `schedules` / `dsh-market`）注册对应面板页，否则点击会保持原选中项。
- 侧栏折叠成图标轨时由宿主自动处理（`panelList` 变 36×36 图标列），插件不需要写响应式。

### 已排除的方案

| 方案 | 排除原因 |
|---|---|
| `shell.overlay` 浮层卡片 | 浮层不参与布局，会盖住工作区标题与首条会话；侧栏折叠时不会自适应；需自己算标题栏高度与栏宽 |
| 接管 `sidebar.workspaces` | 该槽位即整个工作区浏览器，注册进去等于顶掉会话树（文档标注 shadows-shipped-ui） |
| 复用 `dsh-better-sidebar` 的 `registerTab` | 那是右侧工作台页签，不是左侧栏 |

---

## 三、架构

```
┌─────────────────── Client (浏览器) ───────────────────┐
│  client.js                                            │
│   ├─ sidebar.panellist : 待办图标 (16px)               │
│   └─ main["todo"]      : TodoPanel（列表 + 详情）      │
│            │ fetch POST /todo/api/<method>            │
└────────────┼──────────────────────────────────────────┘
             │ 同源 JSON（ctx.connection.requestRejection 校验）
┌────────────┼────────────── Host (进程内) ──────────────┐
│  index.js                                             │
│   ├─ ctx.webServer.register({ kind:'prefix',          │
│   │     path:'/todo/api', handler })                  │
│   ├─ TodoStore（内存态 + 串行原子写 JSON + 分组标注）   │
│   ├─ ctx.tools.register(todo_write)                   │
│   └─ Config: { staleDays, ... }                       │
└───────────────────────────────────────────────────────┘
                    │
        %DSH_PROFILE_DIR%/data/dsh-todolist/todos.json
```

**为什么不用 `storageDomain`**：它是 KV 后端，数据落在不透明的介质里，用户没法直接打开看、改、备份。待办是「用户自己的工作数据」，一个可读 JSON 文件更符合直觉，也免去 domain 声明与后端路由的额外配置。代价是并发写要自己做原子替换（见 §5.3），可以接受。

**为什么用自定义 HTTP 路由**：宿主没有给普通 JS 插件暴露“客户端直接调 Host 服务”的通用通道；`@Remote` 装饰器属于编译期生成 schema 的路径，对无构建步骤的插件不可用。自定义路由是 `dsh-better-sidebar` 已在用的成熟做法。

---

## 四、数据模型

### 4.1 记录

```jsonc
{
  "id": "t_1730000000000_ab3f",   // 客户端可读、稳定
  "title": "交周报给李总",
  "note": "",                      // 备注，纯文本，多行
  "priority": "high",              // "high" | "medium" | "low" | null
  "category": "工作",              // 单个可选分类，null 表示未分类
  "dueDate": "2026-10-22",         // YYYY-MM-DD 本地日期，null 表示无截止
  "dueTime": "18:00",              // HH:mm，可选
  "done": false,
  "doneAt": null,                  // ISO 8601
  "createdAt": "2026-10-19T09:12:00.000Z",
  "updatedAt": "2026-10-22T07:30:00.000Z"
}
```

沿用 Trace 的字段语义（`priority` 四级收成三级、`due_date` 同格式），去掉 `sort_order` 与 `tags` 数组。

### 4.2 文件

```jsonc
{
  "version": 1,
  "todos": [ /* ... */ ]
}
```

- 位置：`%DSH_PROFILE_DIR%/data/dsh-todolist/todos.json`
- 解析顺序：`DSH_PROFILE_DIR` → `ctx.baseDir` 下的 `data/` → 进程 cwd 下的 `.dsh-todolist/`（末位兜底，启动时打日志）
- 文件损坏：备份为 `todos.corrupt-<时间戳>.json`，以空列表启动，错误通过路由返回给 UI 顶部提示

### 4.3 分组规则（宿主侧计算，随响应返回，不落盘）

分组在宿主的 `TodoStore.bucketOf(todo)` 里算一次，`list` 的每条记录带上 `bucket` 字段；客户端只按 `bucket` 渲染，工具摘要也用同一份结果——避免 UI 与工具各写一套分类逻辑而产生漂移。

| bucket | 规则 |
|---|---|
| `today` | `!done && dueDate <= 今天` |
| `tomorrow` | `!done && dueDate === 明天` |
| `week` | `!done && dueDate <= 本周末` |
| `stale` | `!done` 且 `now - createdAt > staleDays`，且不属于 today/tomorrow/week |
| `unplanned` | 其余 `!done`（无截止且还没到积压阈值） |
| `done` | `done`，另外带 `doneBucket`：今天 / 昨天 / 本周 / 更早 |

渲染顺序：today → tomorrow → week → stale → unplanned → done（折叠）。

排序：有截止的按 `dueDate + dueTime` 升序，无截止的按 `priority`（high→low）再按 `createdAt` 降序。`dueDate < 今天` 的未完成项标红。

---

## 五、宿主侧

### 5.1 服务方法（UI 与工具共用）

```ts
todo.list(filter?)   // filter: { view?: 'all'|'today'|'week'|'stale'|'done', q?: string }
                     // → { items: Todo[]（含 bucket）, summary: { today, tomorrow, week, stale, unplanned, doneToday } }
todo.create(input)   // { title, note?, priority?, category?, dueDate?, dueTime? }
todo.update(id, patch)
todo.complete(id, done?)   // 幂等；done=false 可撤销
todo.remove(id)
```

每个方法返回 `{ ...结果 }`，失败抛带 `code` 与中文 `message` 的错误（`not-found` / `invalid-input` / `conflict` / `io-error`）。

### 5.2 HTTP 路由

- `POST /todo/api/<method>`，请求体为 JSON 参数，响应 `{ ok: true, result }` 或 `{ ok: false, error: { code, message } }`
- 仅接受 POST；方法名走白名单表（`Object.hasOwn`），拒绝 `__proto__` / `constructor` 之类
- 每个请求先过 `ctx.connection.requestRejection(req)`，非本页来源一律 403（与 `dsh-better-sidebar` 的 `fence` 同款）
- 响应头 `Cache-Control: no-store`

### 5.3 持久化

- 内存态是唯一权威，写操作立即改内存并 `await` 落盘（写入串行队列，避免并发写丢更新）
- 原子写：写 `todos.json.tmp` → `fs.rename` 覆盖；Windows 上 rename 覆盖同名文件需先删除或使用 `fs.rename` 的覆盖语义（实测通过则保留，否则退化为 write-then-swap）
- 不做防抖延迟写：待办写入频率低（人手点击），立即落盘换来「崩了也不丢」

### 5.4 工具 `todo_write`

一个工具 + `action` 参数（遵循“同一操作两个调用者，不写两套逻辑”）：

| action | 参数 | 返回 |
|---|---|---|
| `list` | `view?`, `q?` | 带 `bucket` 的列表 + 计数摘要 |
| `add` | `title`, `dueDate?`, `dueTime?`, `priority?`, `category?`, `note?` | 新记录 |
| `update` | `id`, 任意可改字段 | 更新后的记录 |
| `complete` | `id`, `done?` | 更新后的记录 |
| `delete` | `id` | `{ id }` |

工具描述里写明：这是**用户本人的日常待办**，不是当前会话的任务清单；只在用户明确要求时写入。`list` 的返回同时给模型一份可直接读的摘要（今天 N 件、积压 N 件、最近完成），避免模型为了回答“我这周还有什么没做”反复调用。

### 5.5 配置（写进插件 Config，用户可在 `cordis.patch.yml` 改）

```ts
{
  staleDays: 7,        // 积压判定阈值
  dataPath?: string    // 可选：覆盖默认数据文件路径（默认见 §4.2）
}
```

---

## 六、界面规格

### 6.1 侧栏入口

- 位置：`sidebar.panellist`，`id: 'todo'`，`order: 20`，label 走 locale（zh `待办` / en `To-do`）
- 图标：16px 线性复选框（1.4 stroke、`currentColor`），与宿主其余面板图标同视觉重量
- 折叠态由宿主接管：非标题栏模式缩成 36×36 图标列；Windows 自定义标题栏模式下宿主整列隐藏 `panelList`（`[data-windows-titlebar] .collapsed .panelList{display:none}`），「待办」会随「插件」「定时任务」一起消失——这是宿主既有行为，插件不做补偿，也不该让这一行成为例外。

### 6.2 主面板

尺寸与配色全部取宿主 token（`--dsw-alias-*`），实测值：

| 元素 | 规格 |
|---|---|
| 页头 | 高 56px，标题 17px/600，右侧搜索框 + 「+ 新建」 |
| 列表行 | 高 34px，padding 0 8px，圆角 6px，hover `--dsw-alias-interactive-bg-hover` |
| 分组标题 | 12px/600 `--dsw-alias-label-secondary` + 计数 + 半像素分隔线 |
| 详情列 | 宽 300px，左侧 `--dsw-alias-border-l2` 半像素分隔 |
| 复选框 | 14px，圆角 4px，选中填 `--dsw-alias-state-business-primary` |

行内元素从左到右：复选框 → 标题（超长省略）→ 优先级点（red/amber/blue）→ 分类胶囊 → 截止时间（过期红）→ hover 才出现的「⋯」。

空态：列表区居中一句「还没有待办」+ 次要按钮「新建第一条」。

**相对视觉稿的两处收缩**（如需保留请说）：

1. 去掉页头的「全部 / 今天 / 本周」分段器——分组本身已经把列表切开了，这个控件只是重复过滤，多一份状态要维护。
2. 搜索框保留但只在前端过滤（数据量小，不占 host 一次往返）。

**相对视觉稿的一处补充**：多一个「未排期」分组，承接“没有截止日期、也还没到积压阈值”的记录，否则这类任务会无处显示。

### 6.3 交互

| 操作 | 行为 |
|---|---|
| 新建 | 页头「+ 新建」或空态按钮；在「今天」组首行插入编辑中的空行，Enter 保存，Esc 取消 |
| 完成 | 点复选框，行立即淡出到「已完成」；`done=false` 可撤销 |
| 编辑标题 | 双击行走行内输入，Enter 提交 / Esc 还原 |
| 详情 | 单击行，右侧显示标题、优先级、截止、分类、创建时间、备注（可编辑） |
| 删除 | 详情底部「删除」→ 变成「确认删除」，再点执行；3 秒后自动还原文案 |
| 刷新 | 面板挂载时拉一次；每次本地写后刷新；面板可见时每 2.5s 轮询一次（不可见即停），以接收 agent 侧写入 |

### 6.4 本地化

所有可见文本走 `ctx.locale`，注册 `dsh-todolist` 命名空间，先提供 zh 与 en 两份字典。

---

## 七、错误处理

| 场景 | 表现 |
|---|---|
| 数据文件损坏 | 备份 + 空列表启动；UI 顶部一条可关闭的黄色提示条 |
| 写盘失败（权限/磁盘） | 路由返回 `io-error`，UI 顶部红色提示条，内存态保留（不静默丢数据） |
| 记录不存在（agent 删了用户正在看的） | 详情列退回空态，列表刷新，不弹窗 |
| 路由被跨域/外部调用 | 403，UI 只显示「读取失败」，不暴露内部错误细节 |

---

## 八、验收标准

1. 重启 DSH 后，「待办」入口仍在，数据仍在。
2. 侧栏折叠成图标轨时，待办图标与其他面板图标同尺寸、同间距，不溢出。
3. UI 新建 → 工具 `list` 能读到；工具 `add` → 面板 2.5s 内出现（无需手动刷新）。
4. 勾选完成后，`completed_at` 有值且出现在「已完成 · 今天」。
5. 手工把 `createdAt` 改成 10 天前，该条出现在「积压」并标「挂了 10 天」。
6. 删除数据文件后启动，插件不崩，以空列表工作。
7. 卸载插件后，`main`/`panellist` 里的注册项随之消失，侧栏恢复原样。

---

## 九、风险

| 风险 | 说明 | 缓解 |
|---|---|---|
| 宿主槽位行为与文档不符 | `panellist` 点击后 `main` 不切换 | 先在最小插件里验证这条链路，再写业务 |
| 面板切换丢失会话上下文 | 切到待办再切回「对话」 | 宿主自行管理，验证时确认草稿不丢 |
| 自定义路由的鉴权 | 远程访问开启时可能被外部调用 | 必须走 `requestRejection`，并写一条越权测试 |
| 折叠态渲染差异 | Windows 自定义标题栏下侧栏行为不同 | 安装后在窗口最大化/恢复两种状态各验一次 |

---

## 十、交付物

| 文件 | 作用 |
|---|---|
| `package.json` | 包声明 + `dsh.client` 段 |
| `cordis.patch.yml` | 挂载行 |
| `index.js` | Host：store、路由、工具、Config |
| `client.js` | Client：panellist 图标、main 面板、locale 注册 |
| `locale/zh.json`、`locale/en.json` | 文案 |
| `icon.svg` | 插件图标 |
| `README.md` | 安装、数据文件位置、工具说明 |
| `design/*.html` / `*.png` | 已确认的视觉稿 |

---

## 十一、发布与安装

1. 插件包就是本仓库根目录（`D:\dsh-todolist`），无需构建步骤：Host 侧 `index.js` 用 ESM，Client 侧 `client.js` 用宿主提供的 `window.__ModuleLoader__.load({ id, factory })` 格式。
2. 用 `plugin_manager install_bundle`（target 为包目录绝对路径）装入当前 profile；它会写 profile 的依赖与 patch，随后热生效。
3. 升级/调试：改完包内文件后重新 `install_bundle` 覆盖；若只改 Client 侧且 `pnpm run dev:web` 未运行，需要刷新页面。
4. 卸载：`plugin_manager remove_bundle`，数据文件保留（下次装回来还在）。

---

## 附：与 Trace 的对应关系

| Trace 设计 | 本插件 | 说明 |
|---|---|---|
| `tasks` 表（SQLite） | `todos` 数组（JSON） | 单用户、数百条量级，SQLite 是过度设计 |
| `priority` 0–3 | `high/medium/low` | 少一级，侧栏小尺寸下 4 色区分度不足 |
| `due_date` ISO 8601 | `dueDate` + `dueTime` | 日常工作常需要具体时刻（如 18:00 交周报） |
| `tags` JSON 数组 | `category` 单值 | 一人一事一个分类足够，多标签是筛选器需求 |
| `sort_order` 浮点插值 | 无 | 不做拖拽；排序按截止/优先级推导 |
| 滞留判定 7 天 | 「积压」分组，阈值可配 | 保留，并给出「挂了 N 天」的显式文案 |
| 已完成按 今天/昨天/本周/更早 | 同 | 保留 |
| 置顶/透明度/托盘/全局快捷键 | 无 | 桌面窗口特性，宿主是浏览器 |
| 全局快速添加 | 第二阶段 | 见非目标 |
