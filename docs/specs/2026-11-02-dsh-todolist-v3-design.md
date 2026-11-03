# DSH 待办插件 v3（0.3.0）· 设计文档

**日期**: 2026-11-02
**状态**: 范围与形态已确认（便利贴 A / 多条小便签）；任务拆分 13 则已获准，执行计划见 [docs/plans/2026-11-02-dsh-todolist-v3-plan.md](../plans/2026-11-02-dsh-todolist-v3-plan.md)
**基于**: v1 [2026-10-22-dsh-todolist-design.md](./2026-10-22-dsh-todolist-design.md)、v2 [2026-10-22-dsh-todolist-v2-design.md](./2026-10-22-dsh-todolist-v2-design.md)
**零散项登记簿**: [docs/notes/2026-11-02-v3-backlog.md](../notes/2026-11-02-v3-backlog.md)（O1 随本设计消化）

---

## 一、目标

1. **便利贴**：详情列下方常驻便签坞（多条小便签），吸收未选中时的空白区；随手记、可单独删改、可一键转待办。
2. **分类 / 优先级筛选**：页头筛选弹层，服务端过滤，工具同步支持。
3. **计数口径修正**：页头数字永远是全量，不随搜索/筛选缩水；补「未排期」计数。
4. **已结束的循环任务重新可见**：新增 `ended` 分组（折叠区），可看、可编辑、可删除。
5. **错误内联**：弹窗保存失败显示服务端原因，不再只有一条通用红条。
6. **详情列布局打磨**（登记簿 O1）：内容均衡、按钮组以一组的形式居中、空态占位居中。
7. **轮询按页面可见性暂停**；回前台立即刷新一次。
8. **文档校准**：README / handoff / testing 的测试数与现状对齐，CHANGELOG 记录 0.3.0 与行为变化。

### 非目标（本期明确不做）

| 不做 | 原因 |
|---|---|
| 循环任务单次跳过 / 单次改期 | v3.1 候选：`skips` 字段已想清，未被要求；用户一句话即可加回 |
| 周视图、拖拽改期 | 交互成本独立成版 |
| 侧栏角标 / 桌面通知 / 全局快捷键 | 宿主契约需 spike（panellist 无角标 API、客户端无通知/快捷键服务） |
| 便签置顶、标签、markdown、搜索覆盖便签 | 便签定位「随手记小事」，控件越少越好 |
| 数据迁移 / version 升级 | 全部为增改兼容字段，`version: 1` 不动 |
| 拆 client.js、Playwright E2E、冒烟脚本入库 | 收益不抵成本，先维持现状 |

---

## 二、数据模型

`todos.json` 顶层新增可选 `notes` 数组，`version` 保持 `1`：

```jsonc
{
  "version": 1,
  "todos": [ /* 不变 */ ],
  "notes": [                         // 新增；缺失视为 []
    { "id": "n_...", "text": "周五带门禁卡", "createdAt": "...", "updatedAt": "..." }
  ]
}
```

- `text` 非空、≤ 500 字（服务端校验，超出 400）。
- 便签无日期、无完成态、无分类/优先级——**不进待办分组与计数**。
- 兼容性坑（写进 CHANGELOG）：npm `0.2.x` 的 persist 只写 `{version, todos}`，同 profile 降级后改动待办会**整体丢掉 notes**；开发期用 `dataPath` 独立副本隔离。

## 三、接口变更

Host `createApi`（[lib/api.js](../../lib/api.js)）新增四方法；路由层无需修改（prefix + `Object.hasOwn` 白名单自动纳入）：

```ts
notesList() → { items: [...按 createdAt 倒序] }
noteAdd({ text }) → item
noteUpdate({ id, text }) → item
noteRemove({ id }) → { id }
```

`list` 过滤扩展（全部服务端）：

```ts
list({ view?, q?, category?, uncategorized?, priority? })
// category: 精确匹配；uncategorized: true 只看无分类；
// priority: 'high'|'medium'|'low'；三者与 q 为 AND
// summary 改为「过滤前全量」口径，新增 { ended: n }
```

循环已结束：`list()` 对 `repeat` 且 `nextOccurrence(anchored, today) === null` 的条目返回 `bucket: 'ended'`、`dueDate: null`（按规则判，不按 completions，避免「提前做完未来几次」误判）；`view` 新增 `'ended'`，默认 `'open'` 不含。`bucketOf` 不动。

工具：

- 新注册 **`personal_note`**：`action` = `add / list / delete`；`text`（add 必填，≤500）、`id`（delete 必填）。description 明确分界——*随手记、无日期无状态用本工具；要跟踪排期用 personal_todo*；不替用户清理便签。`output.render`：add → `已记下 (id)：text`；list → 逐行 `(id) text`。
- **`personal_todo`**：`list` 增加 `category` / `priority` 与 `view = 'ended'`，description 增加指向 personal_note 的一句话，`filterNote` 同步。

## 四、界面

### 4.1 右列两区结构（同批消化 O1）

```
┌─ rightCol（width 380, 纵向 flex）──┐
│ detail 区（flex:1, 内滚）           │ ← 三态：当天清单 / 选中详情 / 占位
│ 便于阅读的内容块 + 统一左基线        │
│ ────────────────────────────  │
│ dock 便签坞（默认 42%, min 180px）  │
│ 便利贴 · N [▾]                     │
│ [记一点… 回车即存]                  │
│ • 文本  时间   [→ 待办] [✕]        │
└───────────────────────────────┘
```

- `S.detail` 拆为 `rightCol`（width/border 迁移到位）+ `detail`（flex:1 内滚）+ `dock`；**日历视图的当天清单与未选中占位同样受 `detail` 区约束**，不另搞一套。
- **O1 落点**：详情按钮组改为 [[完成本次 primary·auto·稍宽][编辑 ghost·auto][删除 ghost·auto]] 整组居中；空态占位水平居中、文案改引导句「选一条看详情，或在下方记一条便利贴」；当天清单全宽「在这一天新建」保持不变。
- **可选增强（一并实现）**：未选中待办时 dock 自动升至 ~100%；dock 内有焦点（编辑中）时不自动回落，失焦后再回落；选中后回落动画 0.18s。
- （2026-11-03 走查裁定：右列改为 50/50 固定分区并吸收面板余量，撤销折叠与焦点升满——设计图示保持历史）

### 4.2 便利贴交互（形态 A）

- 顶部快速输入：placeholder「记一点… 回车即存」，Enter 提交、上限 500；空输入不提交，输入框保持焦点可连续记。
- 列表：新建在上，行 = 文本 + 相对时间（刚刚/N分钟前/N小时前/昨天/日期）；单行截断靠自动换行行高，不做折叠展开。
- hover 出现 `→ 待办` 与 `✕`；`→ 待办` 打开 TodoDialog、**标题预填便签文本**（日期为空），便签保留、不自动删除；`✕` 直接删。（实现注脚：实现为日期预填今天——T5 有意改道）
- 点击文本行内编辑（input 替换文本），Enter/失焦保存、Esc 取消；同样 500 字上限。
- dock 头部「便利贴 · N」可整区折叠成 30px 细条（仅本浏览器内存态，不持久化）；折叠后点头部展开。
- 空态文案：「一想起来就写一条」。
- 文案沿用 `dict.zh/en` 双语（新增 quickNote / notePlaceholder / noteEmpty / noteToTodo 等键）。

### 4.3 筛选弹层

页头新增「筛选」按钮（复用 `useAnchoredPopover`）：分类组（全部 / 各分类名 / 无分类）+ 优先级组（全部 / 高 / 中 / 低），两轴 AND，与搜索词 AND；激活时按钮高亮显示条件（如「工作 · 高」）并出现 `×` 清除；不持久化，刷新复位。空态三分支：还没有待办 / 没有匹配的待办 / 该筛选下没有待办。分类名的候选取 `categories()`（全量口径）。

### 4.4 计数与已结束

- 页头：`今天 N · 逾期 N · 积压 N · 未排期 N`（全量口径）；搜索/筛选不改变页头。
- 列表分组顺序：逾期 → 今天 → 明天 → 本周 → 以后 → 积压 → 未排期 → **已结束（折叠，默认收起）** → 已完成（折叠，默认展开）。已结束行无复选框，点行进详情；详情里编辑弹窗把 `until` 延后即可「复活」回正常分组；可删除。
- `summary` 只含开放计数 + `ended`；已结束不进头计数。

### 4.5 错误内联

- `fetchApi` 抛出的错误携带 `{ code, status, message }`（服务端 `error.code/message` 透传）。
- `mutate` 改为返回 `{ ok: true } | { ok: false, error }`；`void mutate(...)` 调用点不受影响，弹窗 submit 与详情删除改为读取该结果。
- 弹窗保存失败：内联红字显示服务端 `message`（`role="alert"`），**不关闭弹窗**；`title/note/category` 等输入框加 `maxLength` 把常见 400 挡在提交前。
- 全局红条保留给 `io-error`/网络错误，文案可附服务端 message。

## 五、错误处理与兼容

| 场景 | 处理 |
|---|---|
| 便签写失败 | 与 todos 同一条 `write-error` notice + 全局红条 + retry 按钮复用 |
| `notes` 字段缺失/类型不对 | 读入时回退 `[]`，不崩 |
| 降级到 npm 0.2.x 后改动待办 | notes 被旧 persist 覆盖丢失——CHANGELOG 提示，不做兼容 |
| `ended` 条目被视作 done 勾选 | 行无复选框；详情按钮禁用完成（沿用 `selectedRepeatEnded` 分支，本版终于可达） |

## 六、验收标准

1. 便签：回车即存、刷新后仍在（落盘）；点击改、✕ 删、→待办预填弹窗标题；500 字截断并有占位提示。
2. 未选中待办时便签坞升满；在便签编辑中点左列待办不回落，失焦后回落；选中后 dock 回到 42%。
3. dock 折叠成细条，计数正确；刷新复位展开。
4. 筛选「工作」→仅剩工作类；再选「高」→交集；与搜索 AND；页头计数不缩水；清除复原；工具 `list {category:'审计'}` 头部计数仍全量。
5. `until` 已过的循环系列出现在「已结束」；编辑延长后回到正常分组；`view:'ended'` 可单独查；默认 `open` 不含。
6. 标题 201 字保存：弹窗内联显示「标题过长（上限 200 字）」且不关闭；改短可存。
7. 后台标签页 1 分钟无轮询请求；回前台立即刷新一次。
8. 详情按钮组以一组居中、不再贴左拉伸；空态占位居中。
9. `node --test` 全绿，新增用例覆盖：notes CRUD 与兼容、persist 含 notes、api 四方法、route 三态、筛选/计数口径、ended 判定与过滤、personal_note 工具；README/handoff/testing 测试数一致。

## 七、风险

| 风险 | 缓解 |
|---|---|
| 旧版本覆盖丢 notes | CHANGELOG + 开发期 `dataPath` 隔离 |
| `S.detail` 拆两区影响三态与日历 | 任务内逐态人工走查 + 截图 |
| `mutate` 返回类型变化 | 只有两处 `await` 结果判定点，逐个改造 |
| `ended` 横跨 store/分组/工具 | 先写 store 层用例再动 UI；`view:'open'` 语义回归测试 |
| 筛选弹层在窄窗口溢出 | 沿用 popover 现有窗口边缘逻辑，宽度走 POP_* 常量 |

## 八、任务切片概览（13 则，详见执行计划）

| 里程碑 | 任务 | 内容 |
|---|---|---|
| M1 便签与布局 | T1 | store `notes` 数据层 |
| | T2 | api 四方法 + route 验证 |
| | T3 | 右列两区布局 + O1 打磨 |
| | T4 | 便利贴 UI（形态 A） |
| | T5 | 转待办联动 |
| | T6 | 未选中自动升高 + 防压缩 |
| | T7 | `personal_note` 工具 + 互指文案 |
| M2 筛选与计数 | T8 | 服务端筛选 + 工具参数 |
| | T9 | 计数口径 + 页头四项 |
| M3 循环可见 | T10 | `ended` 分组 + 视图 |
| M4 反馈 | T11 | 错误内联 |
| | T12 | 轮询可见性 |
| M5 收尾 | T13 | 文档/CHANGELOG/走查校准 |
