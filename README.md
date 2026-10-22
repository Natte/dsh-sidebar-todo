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
