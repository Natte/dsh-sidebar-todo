# 开发与线上版本并存的工作流

> 当前状态：主 profile（`desktop`）跑的是 **npm 上的 `dsh-sidebar-todo@0.2.1`**，不再是 `link:` 的本地目录。
> 数据仍在 `%DSH_PROFILE_DIR%/data/dsh-todolist/todos.json`，**与安装方式无关**。

## 为什么换安装方式不会丢待办

插件只是「读一个 JSON 文件」的程序，数据文件在 profile 的 `data/` 下，不在包目录里：

```
C:\Users\<你>\.dsh\profiles\desktop\
├── data\dsh-todolist\todos.json     ← 真实数据，安装方式变了它不动
└── node_modules\dsh-sidebar-todo\   ← 代码，link 或 npm 包都可以
```

所以 `link:` → npm 包只是换了「代码从哪来」，数据、插件 id、分类、循环规则全都不受影响。

## 日常开发时怎么测改动

改了代码要看到效果，必须让 profile 加载**本地目录**而不是 npm 包。三种方式，按侵入程度排：

### 方式 A：临时切回本地链接（最直接）

```bash
# 切到本地开发版
dsh plugin --profile desktop remove dsh-sidebar-todo
dsh plugin --profile desktop add D:\dsh-sidebar-todo
# …改代码、刷新页面验证…

# 验完切回线上版
dsh plugin --profile desktop remove dsh-sidebar-todo
dsh plugin --profile desktop add dsh-sidebar-todo@0.2.1
```

- 优点：一条命令来回切。
- 注意：**开发版读写的就是真实数据**。切之前先备份：
  ```powershell
  Copy-Item "$env:DSH_PROFILE_DIR\data\dsh-todolist\todos.json" "$env:DSH_PROFILE_DIR\data\dsh-todolist\todos.backup.json"
  ```
- 若切换时报 `EPERM ... rename`，说明 `node_modules` 里还留着旧的目录联接，先删链接（只删链接，不动仓库）：
  ```powershell
  cmd /c rmdir "$env:DSH_PROFILE_DIR\node_modules\dsh-sidebar-todo"
  ```

### 方式 B：开发版用独立数据文件（最稳）

切到本地链接后，在 profile 的插件行里加 `dataPath`，让开发版读写副本，真实数据完全隔离：

```yaml
- id: dsh-sidebar-todo
  name: dsh-sidebar-todo
  config:
    staleDays: 7
    dataPath: D:/dsh-sidebar-todo/.dev/todos.json   # 开发用副本
```

第一次切过去时把真实数据复制一份到该路径即可。开发期间的完成/删除都只影响副本。

### 方式 C：独立 profile（最干净，但要另起一个实例）

`dsh --profile dev` 会读 `~/.dsh/profiles/dev/`，可在那里用 `link:` 装开发版，主 profile 永远跑稳定版。代价是要多开一个 DSH 实例，桌面版默认只用一个 profile。

## 发版流程

```bash
# 1. 改代码 + 跑测试
node --test

# 2. 升版本（0.2.1 → 0.2.2）并补 CHANGELOG
# 3. 提交推送
git add -A && git commit -m "feat: ..." && git push

# 4. 发布
npm publish --access public

# 5. 主 profile 升级到新版本
dsh plugin --profile desktop add dsh-sidebar-todo@0.2.2
```

市场条目不用动——它靠 `repository` 字段关联，npm 一发版，市场次日自动显示新版本与 CHANGELOG。

## 改包名时的硬性检查

`0.2.0` 发出去后启动崩溃，原因是 **client bundle 的注册 id 与包名不一致**。教训：

- `package.json` 的 `name`、`cordis.patch.yml` 里的 `name`、`client.js` 里的注册 id / locale 命名空间，**改一个就要改全部**。
- 已有回归测试 `test/client-id.test.js` 守着这条，别删。
- 数据目录 `data/dsh-todolist/` 属于「对外标识」之外的东西，**永远不要跟着包名改**，否则老用户的待办会「消失」（去新目录找不到了）。

## 排障备忘

| 症状 | 原因 | 处理 |
|---|---|---|
| 安装报 `EPERM ... rename` | `node_modules` 里残留旧 junction | `cmd /c rmdir` 删链接后重装 |
| 侧栏有「待办」但白屏/报错 | client bundle id 或注入依赖不对 | 跑 `node --test`，看 `client-id.test.js` |
| 改了代码没生效 | profile 装的是 npm 包，不读仓库 | 按方式 A 切回 `link:`，或升级版本后重装 |
| 数据「消失」 | `dataPath` 或数据目录被改 | 回到 `%DSH_PROFILE_DIR%/data/dsh-todolist/todos.json` |
