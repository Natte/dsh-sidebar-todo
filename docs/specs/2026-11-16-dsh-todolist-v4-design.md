# DSH 待办插件 v4（0.4.0）· 设计文档：待办 ↔ 自动化任务同步

**日期**: 2026-11-16
**状态**: 需求与架构已定稿（Option A：客户端只经 `/todo/api` 提交意图，宿主侧调用 `ctx.schedule`）；Q1–Q6 决策已获用户批准（见「二、决策记录」，原样转录）
**基于**: v1 [2026-10-22-dsh-todolist-design.md](./2026-10-22-dsh-todolist-design.md)、v2 [2026-10-22-dsh-todolist-v2-design.md](./2026-10-22-dsh-todolist-v2-design.md)、v3 [2026-11-02-dsh-todolist-v3-design.md](./2026-11-02-dsh-todolist-v3-design.md)
**宿主基线**: DSH 0.2.2-rc.3（`ctx.schedule` 已在 desktop 组合挂载；子系统文档 `.superpowers/asar-extract/@deepseek-ai__dsh__docs__subsystems__schedule.zh.md`，包说明 `.superpowers/asar-extract/@deepseek-ai__dsh-schedule__README.zh.md`，类型 `.superpowers/asar-extract/@deepseek-ai__dsh-schedule__src__types.ts`）
**engines**: 维持 `dsh >=0.2.1-rc.2 <0.3.0-0` 不变——对 Schedule 的依赖全部为运行时软探测（`ctx.inject(['schedule'], cb)`），不新增包依赖，不抬门槛
**验收索引**: 需求必备七节 ↔ 本文档 §三–§九（automation schema=§三、映射表=§四、API 变更=§五、降级=§六、冲突策略=§七、唯一实现位置=§八、写入顺序与验收=§九）

---

## 一、目标

用户例子：「每周五提醒提交每周工时」+ 开关 → 自动生成每周五定时触发的宿主自动化任务提醒。

1. 新增/编辑对话框增加「同时创建/同步自动化任务」开关；开启后把该待办同步为 DSH 宿主官方自动化任务（Schedule 子系统）。
2. 编辑待办时同步修改自动化任务触发条件（时刻/星期/几号/标题/指令）。
3. 关闭开关或删除待办时，同步删除宿主自动化任务。
4. 宿主不支持时（CLI profile / 未挂载 Schedule 的老宿主）整体降级：待办功能完全不受影响，开关禁用并提示。
5. `personal_todo` 工具最小支持（Q4）：add/update 可携带 automation 意图，与 HTTP 路径共用同一映射模块。

### 非目标（本期明确不做）

| 不做 | 原因 |
|---|---|
| complete/confirm 联动（勾掉待办自动删宿主任务） | 循环任务勾的是「本周期实例」，与系列级宿主任务语义有歧义；v4.1 候选 |
| target / time_zone 等 UI 高级选项 | Q2/Q3 已冻结为固定策略 |
| repeat.until 映射为 rrule 终止 | Q1 冻结为忽略 |
| 后台定时器自动重试 error 态同步 | 提醒场景低频写，「下次编辑保存时重试」足够；后台任务会引入新失败面 |

---

## 二、决策记录（已冻结，原样转录）

| # | 决策 |
|---|---|
| Q1 | repeat.until：忽略 until，不映射为 rrule；todo 侧标注 partial（timing 不会停止，文档说明该差异） |
| Q2 | time_zone：同步时取宿主进程当前 IANA 时区并落库持久化到 automation.timeZone（防漂移可审计），后续同步沿用已存值 |
| Q3 | target：不在 UI 暴露高级选项，固定 new_once |
| Q4 | personal_todo 工具：纳入最小支持——add/update 增加 automation 参数（enabled/time/timeZone 可选字段），映射逻辑与 HTTP 路径共用同一模块 |
| Q5 | 删除待办时自动化任务删除失败：待办照删，automation.status 置 orphan 留痕，不阻断 |
| Q6 | 新建对话框开关：默认关闭 |

Q2 补充：宿主 daily/weekly/cron 均按显式 `time_zone` 的本地墙钟触发（子系统文档「每日与每周输入」「Cron 输入」节），落库 IANA 名可跟随夏令时且可审计。取值来源：插件与宿主同进程，`new Intl.DateTimeFormat().resolvedOptions().timeZone`；取不到时兜底 `'UTC'`（宿主若拒绝再走 error 路径，不静默造数据）。

---

## 三、数据模型：todo.automation 字段 schema（必备节 1）

`todos.json` 顶层 `version` 保持 `1`，纯加法变更：

```jsonc
{
  "version": 1,
  "todos": [ /* 既有字段不变；单条待办可新增 automation 对象 */ ],
  "notes": [ /* v3，不变 */ ],
  "automationOrphans": [   // 新增顶层可选数组；缺失视为 []
    { "todoId": "t_...", "taskId": "...", "status": "orphan",
      "reason": "internal_error: …", "at": "2026-11-16T08:00:00.000Z" }
  ]
}
```

todo 记录新增 `automation`：

```jsonc
{
  "taskId": "sch_...",            // 宿主任务 id（create 返回值）；尚未同步成功为 null
  "enabled": true,                // 与 UI 开关同义；false 只在「关闭中」的请求语义出现，服务端消费后清除记录
  "time": "09:00",                // 'HH:mm'，自动化触发时刻（墙钟语义由 timeZone 承载）
  "timeZone": "Asia/Shanghai",    // IANA；Q2 首次同步落库，此后沿用
  "target": "new_once",           // Q3 固定值，仅留档（宿主调用时省略 target，默认即 new_once）
  "status": "ok",                 // ok | partial | error | orphan
  "lastSyncedAt": null,           // 最近一次成功同步的 ISO 时间；从未成功为 null
  "updatedAt": null,              // 宿主任务最近 updatedAt（诊断留痕；§七 的乐观兜底）
  "lastError": null               // 可选；最近一次同步失败原因（含宿主错误码与 message），成功后清空
}
```

### status 枚举语义

| 值 | 语义 |
|---|---|
| `ok` | 映射完整且最近一次 create/edit 成功；宿主任务存在并与待办当前值一致 |
| `partial` | 同步成功但有已知语义损失：repeat.until 被忽略（Q1），宿主任务**不会到点自动停止**。列表/详情展示 partial 徽标，tip 说明该差异 |
| `error` | 最近一次同步失败（宿主输入错误、版本冲突重试后仍冲突等）。本地以待办侧值为准，宿主侧保持旧值或不存在；下次带 enabled 意图的 create/update 保存时自动重试 |
| `orphan` | 待办已删除但宿主任务删除失败（Q5）。todo 本体已不存在，记录以 `{todoId, taskId, reason, at}` 追加进顶层 `automationOrphans[]` 留痕；不自动重试，引导用户在自动化任务页手动删除 |

### 校验与向后兼容

- `automation` **不进 PATCHABLE**（[lib/model.js](../../lib/model.js)）：客户端与 agent 不可直写 `taskId/status/lastSyncedAt` 等同步结果字段，防伪造关联。意图只能通过 create/update 请求的 `automation` 意图对象表达（§五），记录由 lib/automation.js 组装。
- 老数据无 `automation` → 读入视为 null；顶层 `automationOrphans` 缺失 → 视为 `[]`；list/详情/工具照常。
- 兼容性坑（写进 CHANGELOG，同 v3 notes 的坑）：npm `0.2.x` 的 persist 整体覆写 `{version, todos}`，同 profile 降级后改动待办会丢 notes/automation/automationOrphans；开发期用 `dataPath` 独立副本隔离。

---

## 四、repeat → timing 唯一映射（必备节 2）

映射由 lib/automation.js 的 `buildTiming(todo, intent)` 独家实现（§八）。输入「待办记录 + 意图」，输出宿主七种 timing 之一或 null（拒绝）。

| 待办形态 | timing | 说明 |
|---|---|---|
| 无 repeat 且 dueDate+dueTime 晚于现在 | `{ kind:'at', at:{ date: dueDate, time: 'HH:mm:00', time_zone } }` | 一次性提醒。**本期支持**（宿主 at 天然对应，输入要求 `HH:mm:ss`、目标严格在未来——子系统文档「绝对时间输入」节） |
| `repeat.freq='daily'` | `{ kind:'daily', daily:{ time:'HH:mm:00', time_zone } }` | 每天 HH:mm 触发 |
| `repeat.freq='weekly'`（weekdays 非空） | `{ kind:'weekly', weekly:{ time:'HH:mm:00', time_zone, weekdays } }` | `weekdays` 即 `repeat.weekdays`（ISO 周一=1…周日=7），与宿主 weekly 定义完全同语义（子系统文档「每周输入」节），原样透传（[lib/repeat.js](../../lib/repeat.js) 已去重升序） |
| `repeat.freq='monthly'`（monthDay 1–31） | `{ kind:'cron', cron:{ expression: '"m H D * *"', time_zone } }` | 宿主无 monthly 原生类型 → cron 五字段「分 时 日 月 周」；m/H 取意图 time，D 取 monthDay，月/周为 `*` |
| 无 repeat 且缺 dueTime、或时刻已过 | 不映射 | 意图非法：服务端 `invalid-input`「无可同步的触发时间（请设置截止时间或循环规则）」，不落库 |

### monthDay 边界（宿主行为引用与说明）

- cron 按公历匹配「月内日期」：monthDay=29/30/31 在小月/平年 2 月**没有可匹配时点**，任务保持 active、当月静默跳过——不报错、不顺延到月末、不终止。这是 Vixie cron 的标准语义（子系统文档「Cron 输入」节：五字段原子形式；搜索受 400 年公历周期约束；「启用时拒绝没有可表示未来时点的规则」——monthDay≤31 在 400 年窗口内必有未来匹配，不会被拒）。
- 与待办侧行为一致：[lib/repeat.js](../../lib/repeat.js) 的 monthly 判定为 `date.getDate() === monthDay`，小月同样无实例。因此该映射是**忠实映射**，无需补偿逻辑；monthDay=29 的「约每 4 年 2 月触发」两侧一致。
- 已知差异（记录、不补偿）：repeat 起始日（dueDate）不参与映射——宿主任务从创建后的下一个匹配时刻开始触发；若用户把循环起始日设在未来，宿主提醒会先于待办首日出现。新建时 repeat 待办的 dueDate 已兜底为当天（[lib/model.js](../../lib/model.js) `normalizeCreate`），常规场景不受影响。

### time 来源规则

- 唯一来源是意图 `automation.time`（`HH:mm`）。UI 开关开启时预填：**新建 = todo.dueTime，为空则 `'09:00'`**；编辑 = 既有 `automation.time` ?? dueTime ?? `'09:00'`。`personal_todo` 不传 time 时由 lib/automation.js 的 `resolveTime(todo, intent)` 按**同一兜底序**处理——HTTP 与工具两条路径共用该函数（Q4 铁律）。
- 发送到宿主时补秒：`'HH:mm' + ':00'`（宿主输入接受 `HH:mm:ss`，存储规范化为 `HH:mm:ss.SSS`）。

### title 截断规则

宿主标题必填、去首尾空白、至多 120 字符（包 README「配置与管理 API」节）。规则：

```
title = todo.title.length > 120 ? todo.title.slice(0, 119) + '…' : todo.title
```

截断后恰 120 字符（含省略号）；每次同步都重新截断（待办标题上限 200，见 [lib/model.js](../../lib/model.js)）。

### prompt 模板（自包含指令）

投递时宿主在 prompt 前附加固定说明（`[SCHEDULE REMINDER] This is a scheduled message from the user`）后作为用户消息进入目标会话；`new_once` 目标会话没有任何本插件上下文，故模板必须自带 todoId 供追溯：

```
提醒：<todo.title>（来自待办插件 dsh-sidebar-todo 同步的自动化任务，todoId=<todo.id>）。
到点提醒用户处理该待办；若用户表示已完成，简单确认即可，无需展开新工作。
```

模板不含备注全文（note 上限 2000 字，避免超长 prompt），固定中文话术 + 原样嵌入截断前标题。

---

## 五、/todo/api 变更清单（必备节 3）

路由层零改动（prefix + `Object.hasOwn` 白名单自动沿用既有方法，见 [index.js](../../index.js)），全部为请求/响应加法：

| 方法 | 请求新增 | 响应新增 |
|---|---|---|
| `create` | `automation?` 意图对象 | `result.automation`（落库记录，含 status/taskId/lastError） |
| `update` | `automation?` 意图对象（**与 patch 平级，不进 patch**） | 同上；另可带 `result.automationNotice`（如 `schedule_not_found-cleared`） |
| `remove` | 无 | 无（宿主删除失败静默落 orphan，§九） |
| `list` | 无 | `result.capabilities: { automation: boolean }` |

意图对象 schema（create/update 同形）：

```jsonc
{
  "enabled": true,             // 必填；false = 关闭同步（删除宿主任务并清除本地记录）
  "time": "09:00",             // 可选 'HH:mm'；缺省按 §四 兜底序（dueTime → '09:00'）
  "timeZone": "Asia/Shanghai"  // 可选 IANA；一般不传（Q2 服务端取宿主时区并落库），留作测试/显式覆盖
}
```

update 的 automation 语义：

- 无 `automation` 键 → 待办已有同步记录则照常重同步（标题/时间等变化需反映到宿主任务）；无记录则不引入。
- `enabled=true` → 建立/更新同步（重建 timing，必要时 edit 宿主任务）。
- `enabled=false` → 触发删除编排（§七），成功后清除本地 `automation` 字段。

**实现注意（坑）**：[lib/api.js](../../lib/api.js) 的 update 处理器 `input.patch ?? stripKeys(input, ['id','patch'])` 会把未知键吞进 patch、再被 PATCHABLE 静默丢弃——必须在此处显式取出 `input.automation` 后再构造 patch；[lib/tool.js](../../lib/tool.js) 的 add/update 直通 `api.create/api.update`，automation 参数声明进工具 schema 后自然透传，但同样依赖这一步先行落地。

**能力探测**：`capabilities.automation` 由 index.js 路由层在 list 响应上追加（判据：schedule gateway 是否已注入，§八），store 保持纯数据不感知宿主。客户端据此禁用开关。

**错误码**：STATUS 表（index.js）新增 `'automation-unavailable': 400`，语义见 §六。既有 `invalid-input/not-found/io-error` 不变。

---

## 六、降级行为：宿主无 ctx.schedule（必备节 4）

`ctx.schedule` 缺失（CLI profile、未挂载 Schedule 的老宿主）时：

- schedule gateway 不注入（`ctx.inject(['schedule'], cb)` 不回调，范本见 `.superpowers/asar-extract/@deepseek-ai__dsh-tool-schedule__src__index.ts` 的 `apply()`），`capabilities.automation=false`。
- create/update 带 automation 意图 → **待办本体照常保存（不落 automation 字段）**，接口返回 `{ ok:false, error:{ code:'automation-unavailable', message:'当前 DSH 不支持自动化任务（缺少 schedule 服务），待办已保存但未同步' } }`（HTTP 400）。
- 客户端：fetchApi 抛错携带该 code；TodoDialog 识别后关闭弹窗（待办已在，reload 后可见）并展示一次性提示；开关在 `capabilities.automation=false` 时直接禁用 + 行内提示文案（zh/en 双语）。
- `remove` 常规执行（无宿主任务可删）。
- 插件其余功能（列表/完成/循环/便签/筛选/两个工具）零影响；engines 不抬门槛。

---

## 七、版本冲突与一致性编排（必备节 5）

edit 前先 view，全部编排收敛在 lib/automation.js 内：

```
syncOnUpdate(todo, intent):
  view({ id: automation.taskId })
  ├─ schedule_not_found → 宿主任务已不存在：清除本地关联字段（automation=null），
  │    响应带 notice='schedule_not_found-cleared'，提示「自动化任务已不存在，已解除关联」（经 tooltip 承载，不常驻界面）
  ├─ 其他错误 → status='error' + lastError 落盘，重试留给下次保存
  └─ 成功 → 取其 updatedAt
       edit({ id, action:'update', patch:{ title?, prompt?, timing? }, expectedUpdatedAt })
       ├─ 成功 → 回写 taskId/updatedAt/status('ok'|'partial')/lastSyncedAt，lastError=null
       ├─ schedule_conflict → 重读（再 view）后重试 edit 1 次
       │    ├─ 成功 → 同成功分支
       │    └─ 仍 schedule_conflict → 停止重试：**以待办为准**（不采纳宿主版本），
       │         status='error'、lastError='schedule_conflict: …'，conflict 信息随
       │         result.automation 回传（经 tooltip 承载，不常驻界面：「自动化任务修改冲突，下次编辑保存将自动重试」）
       └─ 其他宿主错误（invalid_rule/not_future/invalid_time_zone/…）→ status='error' + lastError，回传（经 tooltip 承载，不常驻界面）
```

- `expectedUpdatedAt` 兜底：常规路径按上表先 view；view 不可用而本地存有 `automation.updatedAt` 时，可用落库值做一次乐观 edit（落库值仅作留痕与兜底，不替代 view）。
- 等价编辑跳过（推荐优化）：重建的 title/prompt/timing 与留痕一致时跳过宿主 edit（仍刷新 lastSyncedAt），避免每次保存都打宿主 FIFO。
- **删除编排**（关闭开关 / 删除待办共用）：

```
edit({ id, action:'delete', expectedUpdatedAt })
  ├─ 成功 → 结束（清除本地记录）
  ├─ schedule_not_found → 视为已删除，成功语义（清除记录，不置 orphan）
  ├─ schedule_conflict → 重读重试 1 次
  └─ 仍失败（internal_error 等）→
       关闭开关路径：status='error' + lastError，下次保存重试（记录还在，todo 未删）
       删除待办路径：待办照删，orphan 留痕（Q5，见 §九）
```

---

## 八、映射唯一实现位置：lib/automation.js（必备节 6）

**lib/automation.js 是 repeat→timing 映射与 ctx.schedule 调用封装的唯一实现位置。**

```ts
// —— 纯映射与校验（无 IO，node --test 直测）——
buildTiming(todo, intent) → timing | null        // §四 映射表唯一实现
resolveTime(todo, intent) → 'HH:mm'              // intent.time ?? todo.dueTime ?? '09:00'
resolveTimeZone(todo, intent, hostTz) → IANA     // Q2：intent.timeZone ?? automation.timeZone ?? hostTz
buildTitle(todo) → string                        // 120 截断（§四）
buildPrompt(todo) → string                       // prompt 模板（§四）
validateIntent(intent, todo) → void | throw TodoError('invalid-input')

// —— 宿主编排（唯一触达 ctx.schedule 的模块）——
createAutomationGateway(schedule) → {
  syncOnCreate(todo, intent) → { automation }
  syncOnUpdate(todo, intent?) → { automation, notice? }
  syncOnDelete(todo) → { orphan? }               // Q5：失败时返回 orphan 记录供 store 落盘
}
```

- [index.js](../../index.js)：静态 `inject` 保持 `['webServer', 'connection', 'tools']` **不变**——不得把 `'schedule'` 加进静态 inject，否则 CLI profile 下整个插件失活。另起 `ctx.inject(['schedule'], (c) => { gateway = createAutomationGateway(c.schedule) })` 软注入，gateway 以模块内可变引用挂到 store/api（范本：`.superpowers/asar-extract/@deepseek-ai__dsh-tool-schedule__src__index.ts`）。
- [client.js](../../client.js) 与 [lib/tool.js](../../lib/tool.js)（personal_todo）**只传意图字段（enabled/time/timeZone）**，禁止出现任何 timing/cron/rrule 构造、title 截断、prompt 拼接代码。历史上 client 与工具双实现各自演化导致行为漂移，本条为评审红线：出现第二份映射实现即打回。

---

## 九、同步写入顺序与验收（必备节 7）

### 写入顺序（避免孤儿任务）

**create（带意图）**：
1. `validateIntent` 校验（非法 → invalid-input，不落库）；
2. store.create 落待办本体，automation 记录初始化为 `{ taskId:null, status:'error', lastError:'pending' }` 并落盘（**先本地**）；
3. gateway.syncOnCreate → 宿主 `create({ title, prompt, timing })`（target 省略 = 默认 new_once；不传 actorSessionId，插件无会话身份）；
4. 成功 → 回写 `{ taskId, updatedAt, status:'ok'|'partial', lastSyncedAt, lastError:null }` 再落盘；失败 → 保留 `status:'error'` + lastError 落盘，接口仍 `ok:true`（result.automation 回传失败详情），UI 非阻断提示。
   例外：gateway 不存在 → 不落 automation 字段，抛 `automation-unavailable`（§六）。

顺序理由：先本地后宿主，最坏结果只是「待办带 error 态」，不会出现宿主任务已建而本地无记录（镜像孤儿）；宿主 create 失败即无任务、edit 失败宿主保持旧值，均不产生无主宿主任务。

**remove（带记录）**：
1. store.remove **先落盘删待办**；
2. gateway.syncOnDelete → 宿主 `edit delete`；
3. 成功或 schedule_not_found → 结束；其他失败 → 顶层 `automationOrphans` 追加 `{todoId, taskId, reason, at}` 落盘（Q5），**不阻断、不回滚删除**（remove 仍返回成功）。

### 验收两步（磁盘级与 live 级分开定义）

**A. 磁盘级（node --test + 冒烟，CI 可跑）**

- `node --test` 全绿，新增用例：
  - automation schema/兼容：老数据无 automation、automationOrphans 缺失回退；automation 不可经 patch 直写（PATCHABLE 红线）；
  - 映射表全分支：daily/weekly 透传 weekdays、monthly→cron 表达式逐字段断言、at（未来时刻）、until 忽略→partial、monthDay=29/30/31 的表达式、time 兜底序、`HH:mm` 补秒、title 121 字截断为 120、prompt 含 todoId；
  - 意图校验：无 repeat 且无未来时刻 → invalid-input 不落库；
  - 降级：无 gateway → automation-unavailable 且待办已落库、无 automation 字段；list 带 `capabilities.automation:false`；
  - 冲突编排（fake schedule 注入）：conflict→view→重试成功；连续 conflict→`status:'error'` + conflict 信息回传；view not_found→清除关联并回传 notice；
  - 删除：宿主 not_found 视为成功；删除失败 → automationOrphans 留痕且 remove 不失败；
  - personal_todo automation 参数透传与渲染。
- store/api 测试经构造参数注入 fake gateway，不触真实宿主。
- 冒烟：`dataPath` 独立副本手工过一遍新建/编辑/删除（桌面 profile），确认 todos.json 中 automation 与 automationOrphans 的落盘形态。

**B. live 级（用户重启 DSH 后人工验证）**

1. 新建待办「提交每周工时」+ 开关（time 预填 dueTime，改为 17:30）→ 自动化任务页出现每周五 17:30 任务，标题截断正确、prompt 含 todoId；
2. 编辑该待办改 time → 宿主任务触发条件同步变化（自动化任务页核对）；
3. 关闭开关保存 → 宿主任务消失；
4. 直接删除待办（开关曾开）→ 宿主任务消失；
5. 带 until 的每周待办 → 行上 partial 徽标，tip 说明「到点提醒不会自动停止」；
6. 宿主侧手动删除任务后再编辑保存待办 → 提示「自动化任务已不存在，已解除关联」；
7. CLI profile（无 schedule）→ 开关禁用 + `capabilities.automation=false`；经工具强制带意图 → automation-unavailable 且待办已保存。

---

## 十、界面与文案（client.js）

**少字原则（返工总纲）**：界面自己会说话——控件标签即用法说明；细节一律收进 HTML `title` tooltip；界面上不出现任何常驻说明性段落/小字。常驻文案以下述 ① 白名单为全集，评审时对照 mock [design/mock-automation-sync.html](../../design/mock-automation-sync.html)。

TodoDialog（[client.js](../../client.js) ~1042 行起）结构不变项：循环/结束日期字段区下方独立开关行，开启时展开 time 输入（`HH:mm`）；开关初始态：编辑 = `initial.automation?.enabled === true`，新建 = **关（Q6）**；`capabilities.automation=false` → 开关禁用（呈现见②③）；列表/详情 `automation.status` 徽标复用 repeatBadge 样式槽位思路。

### ① 常驻文案白名单（全集；zh/en 定稿，均 ≤ 一行）

| 类别 | zh | en |
|---|---|---|
| 开关标签 | 同时创建/同步自动化任务 | Also create & sync an automation task |
| 时间控件标签 | 提醒时间 | Time |
| 降级短标签 | 暂不可用 | Unavailable |
| 状态徽标 | ok / partial / error / orphan（§三枚举原词，不另译） | 同 zh |
| 同步状态行 | `<HH:mm>` + `<n> 小时前`（相对上次同步） | `<HH:mm>` + `<n>h ago` |
| 错误短消息 | 同步失败，保存时重试 | Sync failed; retry on save |
| 确认弹层标题 | 关闭自动化同步？ | Turn off automation sync? |
| 确认弹层正文（一句话） | 将同时删除自动化任务 | This will also delete the automation task |
| 确认弹层按钮 | 取消 / 删除自动化任务 | Cancel / Delete automation task |
| 通用按钮 | 取消 / 保存 | Cancel / Save |

### ② tooltip 承载清单（HTML `title`，悬浮可见、不常驻界面）

| 载体 | tooltip 内容 |
|---|---|
| 提醒时间控件 | 预填规则：新建 = dueTime，为空则 09:00；编辑 = automation.time ?? dueTime ?? 09:00（§四） |
| 时区 | 固定策略（Q2：宿主进程 IANA 时区落库、后续沿用）；创建期不在界面呈现 |
| 执行位置 | 固定策略（Q3：new_once）；创建期不在界面呈现 |
| 同步状态行 | taskId 尾 8 位 + lastSyncedAt 绝对时间 |
| 状态徽标 partial | partial 语义：until 不映射（Q1），宿主任务到点不会自动停止 |
| 状态徽标 error | lastError 全文（宿主错误码 + message） |
| 状态徽标 orphan | orphan 详情 `{todoId, taskId, reason, at}`；引导「定时任务」页手动删除（Q5） |
| 降级短标签「暂不可用」 | 完整原因：当前 DSH 不支持自动化任务（`capabilities.automation=false`，§六） |

### ③ 明确删除项（原稿常驻文案，本次返工移除）

- 创建期时区展示行、执行位置展示行（Q2/Q3 固定策略，不呈现）；
- 创建期 until→partial 内联警告段落（partial 语义仅在同步后编辑回显的徽标 tooltip 出现）；
- 宿主创建预览行（「保存后将在『定时任务』创建…」）；
- 降级长文案「当前 DSH 不支持自动化任务」整句常驻（压缩为短标签「暂不可用」+ tooltip）及降级 toast 示例；
- 同步状态行内 taskId 尾 8 位、lastError 全文、orphan 详情的常驻展示（全部收 tooltip）。

### 一次性提示（toast，非常驻，不属白名单约束）

- 抛错 code=`automation-unavailable` → 关闭弹窗 + 顶部一次性提示「待办已保存，但当前 DSH 不支持自动化任务」/ "Todo saved, but automation tasks are not supported in this DSH"；
- `result.automation.status='error'` → 关闭弹窗 + 非阻断提示「待办已保存，自动化任务同步失败：<lastError>；下次编辑保存将自动重试」/ "Todo saved, but automation sync failed: <lastError>; it will retry on the next edit & save"；
- `automationNotice='schedule_not_found-cleared'` → 提示「自动化任务已不存在，已解除关联」/ "The automation task no longer exists; the link was removed"。

内联 `dict.zh/en` 双语新增键（两份词典都要加）：automationToggle / automationTime / automationUnavailable / automationStatusLine / automationErrorShort / automationConfirmTitle / automationConfirmBody / automationConfirmOk / automationBadge* / automationTooltip* 等。

---

## 十一、工具：personal_todo（Q4）

- add/update 参数新增 `automation`：`{ enabled: boolean, time?: 'HH:mm', timeZone?: IANA }`（[lib/tool.js](../../lib/tool.js) parameters 现为 `additionalProperties:false`，必须显式声明）；description 增补一句：开启后按 repeat/dueTime 生成宿主自动化提醒任务。
- 映射与 HTTP 路径共用 lib/automation.js（Q4 铁律）；工具自身零映射代码。
- `output.render`：add/update 返回的 item 含 automation 时追加一行 `自动化任务：<status>`（有 lastError 时附 `（<lastError>）`），让调用方 agent 能看到同步结果。

---

## 十二、风险

| 风险 | 缓解 |
|---|---|
| api.js update 的 stripKeys 把 automation 吞进 patch 后被 PATCHABLE 静默丢弃 | §五 显式实现注意点 + 专项用例（automation 意图必须到达 store 层） |
| store.create/update 由同步变异步 | 现有调用点（route、tool、client mutate）均已 `await`，仍逐一回归 |
| 老宿主 npm persist 覆写丢 automation/automationOrphans | CHANGELOG 提示 + 开发期 dataPath 隔离（同 v3 notes 先例） |
| at 映射遇过去时刻 → 宿主 not_future | 走 error 态 + lastError 回传，UI 引导改时间；不阻断待办保存 |
| 每次保存都 edit 宿主（低频但冗余） | §七 等价编辑跳过 |
| view+edit 两跳与宿主 FIFO 并发 | expectedUpdatedAt + 单次重试即宿主编排单位；仍冲突则 error 待重试，不自旋 |
| gateway 晚于首次保存注入（Schedule 服务冷启动竞态） | 该次保存按降级语义处理（§六）；下一次 list 能力位翻转后 UI 恢复可用 |
