# 上架到插件市场：还差哪三步

> 这份文档只讲「从当前状态到出现在插件市场」的操作。代码与文档已全部就绪（`main` 最新提交见 `git log`）。

## 0. 链路（先看懂这个，剩下的都是机械操作）

```
你的仓库（必须公开）───┐
                        ├─→ awesome-dsh-plugin 仓库（提 PR 加一条）
你的包（npm publish）───┘              │  CI 每天跑
                                       ↓
                        awesome-dsh-plugin.com/plugins.json
                        （同时以 npm 包 dsh-plugin-catalog 分发镜像）
                                       ↓
                   宿主「插件市场」/「发现 → 索引源」/ plugin_market 工具
```

要点：

- **不要**往 `dsh-market` 仓库提插件条目——那是市场应用本身。
- 收录后不是立刻可见，CI 每天刷新，通常一天内。
- 只公开仓库、不发 npm 也能收录，但条目没有版本号，更新只能按 commit 追。

## 1. 公开仓库（约 1 分钟）

1. 打开 https://github.com/Natte/dsh-todolist/settings
2. 拉到底部 **Danger zone** → **Change visibility** → **Change to public**，按提示输入仓库名确认
3. 同一页往上，**Topics** 加：`dsh-plugin`、`deepseek-harness`、`todo`

验证：

```bash
curl -s https://api.github.com/repos/Natte/dsh-todolist | findstr /C:"private"
# 应输出 "private": false
```

## 2. 发布到 npm（约 2 分钟）

包名 `dsh-todolist` 在 npm 上**未被占用**（`dsh-todo` 已被别人占了，别用）。

```bash
cd D:\dsh-todolist
npm login          # 浏览器授权，只需一次
npm publish --access public
npm view dsh-todolist version    # 应输出 0.2.0
```

已用 `npm publish --dry-run` 验证过：16 个文件、46.8 kB、`public` 访问级，没有多余文件被带进去。

> 72 小时内可以 `npm unpublish dsh-todolist@0.2.0` 撤掉；超过就只能发新版本或弃用（deprecate）。

## 3. 提 PR 到 awesome-dsh-plugin（约 5 分钟）

1. Fork https://github.com/awesome-dsh-plugin/awesome-dsh-plugin
2. 按该仓库 README / CONTRIBUTING 的现有条目格式加一条（字段参考本仓库 `docs/market-entry.json`）
3. 提 PR

**PR 标题**

```
Add dsh-todolist — sidebar todo list with recurring tasks and calendar
```

**PR 正文**

```markdown
## What

`dsh-todolist` — a sidebar todo list for DeepSeek Harness that shares one JSON file between the UI and the agent.

- Grouped list: overdue / today / tomorrow / this week / later / backlog / unplanned / done
- Recurring tasks: daily, chosen weekdays, monthly day, optional end date.
  A recurring task appears only while its current period is still open; completing it hides the row until the next period.
- Month-view calendar with a per-day checklist (check items, create on that day)
- Categories: free-text combobox + a manage dialog that renames/removes across existing tasks
- One-line natural-language quick add (今天/明天/周X/下午3点/p1/#分类)
- Agent tool `personal_todo`: list / add / update / complete / confirm / delete

## Install

```bash
dsh plugin --profile web add dsh-todolist
```

## Verification

- 134 tests: `node --test` (bucket, parser, recurrence expansion, store, API dispatch, tool, HTTP routes, user journeys)
- Verified against DeepSeek Harness `0.2.1-rc.3`
- No dependencies on `@deepseek-ai/*` packages; only public slots, webServer, connection, tools and locale services
- MIT licensed; data stays local at `%DSH_PROFILE_DIR%/data/dsh-todolist/todos.json`
```

## 4. 收录之后

- 在宿主的 **插件 → 发现** 里搜 `dsh-todolist`，或在市场里搜。
- 若想立刻试，不必等 CI：

```bash
dsh plugin --profile web add github:Natte/dsh-todolist
# 或已发布后
dsh plugin --profile web add dsh-todolist
```

- 之后每次发版：改 `package.json` 的 `version` + 补 `CHANGELOG.md` → `npm publish` → 市场第二天自动显示新版本与更新说明。

## 5. 本仓库已就绪的清单

| 项 | 状态 |
|---|---|
| `package.json` 发布元数据（license / repository / keywords / publishConfig，已移除 `private`） | ✅ |
| `LICENSE`（MIT） | ✅ |
| `CHANGELOG.md`（市场详情页的「更新内容」来源） | ✅ |
| `npm pack` / `npm publish --dry-run` 校验 | ✅ 16 files / 46.8 kB |
| 包名可用性 | ✅ `dsh-todolist` 未被占用 |
| 市场条目模板 | ✅ `docs/market-entry.json` |
| README 兼容性矩阵 | ✅ 宿主 `0.2.1-rc.3` 已验证 |
