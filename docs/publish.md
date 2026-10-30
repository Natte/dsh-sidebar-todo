# 上架到插件市场：现状与规则

> 更新于 2026-10-28。当前状态：**仓库已公开、PR 已提交（#9770），等 CI 与维护者合并；npm 最新版 `0.2.2`（修复无起始日的循环待办不可见），`0.2.0` 已 deprecated（启动崩溃）。**

## 0. 链路

```
你的仓库（公开 + dsh-plugin topic）───┐
                                      ├─→ awesome-dsh-plugin（data/plugins/*.yml）
npm 包（可选，只影响下载量与安装体验）─┘         │ CI 每天跑
                                                ↓
                              awesome-dsh-plugin.com/plugins.json
                              （同时以 npm 包 dsh-plugin-catalog 分发镜像）
                                                ↓
                    宿主「插件市场」/「发现 → 索引源」/ plugin_market 工具
```

要点：

- **不要**往 `dsh-market` 仓库提条目——那是市场应用本身。
- 条目是**一个独立 YAML 文件**，不是往 README 加一行（README 由脚本生成）。
- **条目里不能写 `npm:` 字段**：npm 映射从 registry 自动采集，手写会被校验拒绝。
- npm 是**可选的**，不发布也照常收录，只是没有下载量数字。

## 1. 已完成

| 项 | 状态 |
|---|---|
| 仓库公开 | ✅ `private: false`，未认证访问返回 200 |
| Topics | ✅ `dsh-plugin`、`deepseek-harness`、`todo`、`cordis` |
| 收录 | ✅ **已合并**：PR [#9770](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/9770)（2026-10-27 by `fkysly`），条目为 `data/plugins/Natte__dsh-todolist.yml` |
| 改名同步 | ✅ **已合并**：PR [#10313](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/10313)（2026-10-29），条目为 `data/plugins/Natte__dsh-sidebar-todo.yml`，旧条目已移除 |
| `dsh.bundle` 门槛 | ✅ `package.json` 声明 `dsh.bundle.patch` |
| 仓库年龄门槛 | ✅ 2026-10-22 创建（≥1 天） |
| npm | ✅ `dsh-sidebar-todo` 已发布到 `0.2.3` |
| 命名统一 | ✅ 仓库、目录、npm 包、cordis 行 id、客户端命名空间全部为 `dsh-sidebar-todo` |

## 2. 条目内容（本仓库 `docs/market-entry.yml` 同源）

```yaml
url: https://github.com/Natte/dsh-sidebar-todo
name: Natte/dsh-sidebar-todo
category: workflow
description:
  en: Sidebar todo list for DeepSeek Harness — grouped buckets, recurring tasks with weekday or month-day rules, a month-view calendar, and an agent tool that reads and writes the same JSON file.
  zh: 侧栏待办清单——逾期/今天/本周分组、循环任务（每周多选周几、每月指定几号）、月视图日历，agent 通过工具读写同一份 JSON。
```

规则细节（来自该仓库 `contributing.md`）：

- 文件名必须是 `<owner>__<repo>.yml`。
- 只有 `description.en` 必填；`zh` 可留空由维护者补。
- 描述里出现 `: `（冒号加空格）必须加引号，否则 YAML 解析失败。
- `category` 取值见其 README；我们的功能（清单 + 循环 + 日历）归 `workflow`。
- 一个 PR 最多 3 条。

## 3. 状态：只等合并

- **PR CI 已全绿**：`Submission gate` 与 `check` 均 success，`mergeable_state = clean`。
- **npm 已发布**：最新版 `dsh-sidebar-todo@0.2.2`；`0.2.0` 因客户端注册 id 与包名不一致导致启动崩溃，已 `npm deprecate`，市场会自动关联下载量，条目无需任何改动。
- **剩下只有维护者评审合并**，通常一天内；合并后站点自动重建，市场与「发现」在下一轮每日构建后出现。

## 4. npm（已完成：0.2.2）

```bash
cd D:\dsh-sidebar-todo
npm login
npm publish --access public
npm view dsh-sidebar-todo version   # 应输出 0.2.2
```

发完记得把坏掉的版本标掉：`npm deprecate 'dsh-sidebar-todo@0.2.0' '原因'`。

- 包名是 dsh-sidebar-todo。原来的 dsh-todolist 被 npm 以「与 dsh-todo-list 过于相似」拒绝（防仿冒），dsh-todo 也已被人占用。
- `npm publish --dry-run` 已验证：16 个文件、46.8 kB、public。
- 发布后 market 会自动关联（因为 `package.json` 的 `repository` 指回本仓库），**不需要**改条目。
- 72 小时内可 `npm unpublish` 撤回。

## 5. 后续发版

改 `package.json` 的 `version` → 补 `CHANGELOG.md` → `npm publish`。条目不用改，市场次日自动显示新版本与更新说明。

若只走源码安装（不发 npm），更新按 commit 追，市场会在下次构建时更新 star 数与描述。

## 6. 可选增强

- **图标**：目前没有 PNG 图标，市场会回退到 GitHub 头像。想要专属图标就放一张方形 PNG（约 180×180）到 `assets/`，再在条目里加 `icon:`（必须是 GitHub 托管的位图，SVG 会被拒）。
- **截图**：在仓库根放 `screenshots.json` 列 1–8 个相对路径（如 `assets/screenshot-1.png`），市场详情页按 App Store 样式展示；不写则从 README 自动抽取。
