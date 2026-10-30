# dsh-sidebar-todo

DeepSeek Harness 的侧栏待办插件：管理日常工作的清单，数据和 agent 共用一份。

> 仓库、npm 包与插件标识统一为 `dsh-sidebar-todo`；DSH 侧栏显示的名字是「待办」。
> 已发布：https://www.npmjs.com/package/dsh-sidebar-todo

当前版本 **0.2.2**（v1 + v2 功能：编辑弹窗、循环任务、月视图日历、分类管理）。

## 兼容性

| 宿主版本 | 插件版本 | 结论 | 日期 |
|---|---|---|---|
| `0.2.1-rc.5` | `0.2.3` | ✅ **已验证可用**（完整走查，见下） | 2026-10-30 |
| `0.2.1-rc.3` | `0.2.1` | ✅ 已验证可用（修复 0.2.0 的启动崩溃） | 2026-10-28 |
| `0.2.1-rc.3` | `0.2.0` | ❌ 启动崩溃，请勿使用 | 2026-10-27 |
| `0.2.1-rc.2` | `0.1.0` | ✅ 已验证可用 | 2026-10-22 |

### 0.2.1-rc.5 走查记录（0.2.3）

| 检查项 | 方法 | 结果 |
|---|---|---|
| 安装与加载 | `plugin_manager list_plugins` | `include:dsh-sidebar-todo` → active |
| 侧栏入口 | 槽位查询 `sidebar.panellist` + 界面截图 | `todo` / order 20 / active，图标与文字正常 |
| 面板渲染 | 截图 | 分组（今天/本周/以后）、页头计数、已完成 8 条、循环徽标、优先级色条、列表/日历切换全部正常 |
| HTTP 路由 | 面板数据经 `/todo/api/*` 读取 | 列表与计数正常显示，说明 `webServer` + `connection` 围栏可用 |
| agent 工具 | 实际调用六个动作 | `add` / `update` / `complete` / `confirm` / `delete` / `list(view=done)` 全部成功 |
| 数据完整性 | 读 `todos.json` | 13 条待办无丢失，走查用的临时条目已清理 |
| 单元与旅程测试 | `node --test` | **142/142 通过** |

插件**不 import 任何 `@deepseek-ai/*` 包**（无 `dependencies`、无 `peerDependencies`），只依赖宿主在运行时提供的契约：

| 契约 | 用在哪 | 变了会怎样 |
|---|---|---|
| `window.__ModuleLoader__.load({ id, factory })` | `client.js` | 侧栏没有「待办」；**`id` 必须等于 `package.json` 的 `name`**，否则整窗无法启动（0.2.0 的事故） |
| `ctx.slots.inject / register` + 槽位 `sidebar.panellist` / `main` | 入口行与面板 | 入口消失，或点了不切换 |
| `ctx.webServer.register` + `ctx.connection.requestRejection` | `index.js` 路由 | 面板一直显示「读取失败」 |
| `ctx.tools.register` 的 `ToolDefinition` | `lib/tool.js` | agent 看不到 `personal_todo` |
| `ctx.locale.register / bind` | 文案 | 退化成只有中文（有兜底） |
| `--dsw-alias-*` 等主题 token | 样式 | 视觉降级，不会崩 |
| 数据文件 `todos.json` | `lib/store.js` | 与宿主无关，升级不受影响 |

**升级宿主后的自查顺序**：重载插件（`set_plugin` 关再开）→ 侧栏点开「待办」→ 让 agent 调一次 `personal_todo list` → `node --test`。

注意 `node --test` 覆盖 `lib/` 和 `client.js` 的一条静态约定（注册 id == 包名），宿主接口本身断了它照样全绿，所以前两步不能省。

## 安装

**从 npm（推荐）**

```bash
dsh plugin --profile web add dsh-sidebar-todo
```

装完在侧栏「自动化任务」下方出现「待办」。也可以在宿主的 **插件 → 发现** 里搜 `dsh-sidebar-todo`（或「待办」），在市场里一键安装。

**从 GitHub 源码**

```bash
dsh plugin --profile web add github:Natte/dsh-sidebar-todo
```

适合想跟最新提交、或 npm 还没发到新版本时用；更新按 commit 追，没有版本号。

**本机开发**

把这个仓库目录直接装进 profile（链接方式，改代码即时生效）：

```text
plugin_manager install_bundle  target: D:\dsh-sidebar-todo
```

装了之后改 `index.js` 需要把插件行关再开才会重新加载模块；只改 `client.js` 会被 HMR 自动拾取。

## 数据在哪

默认 `%DSH_PROFILE_DIR%/data/dsh-todolist/todos.json`，普通 JSON，可以直接打开、编辑、备份。

```json
{ "version": 1, "todos": [ { "id": "t_...", "title": "交周报", "dueDate": "2026-10-22", "done": false } ] }
```

文件损坏时会备份为 `todos.corrupt-<时间戳>.json` 并以空清单启动。

## 配置

在 `cordis.patch.yml` 的插件行里改：

```yaml
- id: dsh-sidebar-todo
  config:
    staleDays: 7   # 超过多少天还没定日期算「积压」
    dataPath: ''   # 可选，覆盖默认数据文件路径
```

## 新建与编辑

- 「+ 新建」打开弹窗：标题、备注、日期、时间、优先级、分类、重复规则。
- 详情列底部「编辑」打开同一个弹窗，预填当前内容——**「未排期」的任务就是在这里排期的**。
- 弹窗顶部有一行「一句话填写」：输入「明天下午3点 交周报 #工作」，下面字段自动填好，再手动微调。
- 日期与时间是自绘选择器：月历（今天/明天/下周一快捷）与时/分两列，不受系统控件样式影响。

## 循环任务

- 重复方式：每天 / 每周（可多选周几）/ 每月（指定几号），可设结束日期。
- 列表里只出现**本周期待完成的那一次**：每天的当天出现、每周的整周可见、每月的整月可见；勾掉后该行消失，等到下一个周期再出现。
- 刚建的循环任务如果**还没到第一个发生日**（比如周三建「每周一」），会先显示下一次发生日，不会建完就看不见。
- 循环任务没写起始日时按创建日算，agent 只给 `repeat` 也能正常出现在列表与日历里。
- 勾选完成的是**这一次**（行上显示的日期），系列本身不受影响。
- 循环任务**不进「已完成」**，也**不参与「积压」**判定。
- 「每月 31 号」在只有 30 天的月份会跳过，不自动落到月末。
- 在对话里说「每周一到周五 18 点交日报」，agent 会直接建好（`personal_todo` 的 `repeat` 参数）。

## 日历

页头切到「日历」看月视图：每格最多显示两条，多的收成 `+N`；点某天在右侧看当天安排，可以直接勾选，也可以「在这一天新建」。

## 分类

分类**不是预设的**，它来自待办里填写的分类名——某条待办写了新名字，这里就多一个。

- 弹窗里的分类是可输入的下拉，显示每个分类下有多少条。
- 页头「分类」打开管理弹窗：可以改名（已有待办批量跟随）、删除（退回「无分类」）。

## agent 工具

`personal_todo`，`action` 可选 `list` / `add` / `update` / `complete` / `confirm` / `delete`。

- `add` / `update` 接受 `repeat: { freq, weekdays?, monthDay?, until? }`；
- `complete` 接受 `date`（默认今天），循环任务用它指定完成哪一次；
- `list` 对循环任务标注「循环·本次 MM-DD」——即本周期待完成的那一次；`occurrences` 返回区间内全部实例。

工具会从口语里自行推断重复规则，不需要用户回答「你要哪种重复」。

## 一句话解析支持什么

日期（今天/明天/后天/周X/下周X/N天后/M月D日/月底）、时间（15:00、下午3点、中午、半夜）、
优先级（p1/p2/p3、!）、分类（#名称）。

规则：**一行只生成一条待办**，句子里第一个被识别的日期生效，其余原样留在标题里。

## 开发

```bash
node --test          # 107 个测试
node --check client.js
```
