/** The `personal_todo` agent tool: same dispatch table the UI calls. */

import { TodoError } from './model.js'
import { summarize } from './bucket.js'

const ACTIONS = ['list', 'add', 'update', 'complete', 'confirm', 'delete']
const NEEDS_ID = ['update', 'complete', 'confirm', 'delete']

function describe(item) {
  // 循环任务显示本周期待完成的这一次（dueDate），不是下一个未完成实例（nextDue）：
  // 漏做时两者不同，用 nextDue 会让用户以为要交的是下周那次。
  const due = item.isRepeating
    ? item.dueDate
      ? `（循环·本次 ${String(item.dueDate).slice(5)}）`
      : '（循环·已结束）'
    : item.dueDate
      ? `（截止 ${item.dueDate}${item.dueTime ? ' ' + item.dueTime : ''}）`
      : ''
  const flags = []
  if (item.bucket === 'overdue') flags.push('【逾期】')
  if (item.bucket === 'stale') flags.push('【积压】')
  return `- ${item.done ? '[x]' : '[ ]'} (${item.id}) ${item.title}${due}${flags.join('')}`
}

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

export function createTool(api, ready) {
  async function run(input = {}) {
    await ready
    if (input === null || typeof input !== 'object') {
      throw new TodoError('invalid-input', '参数必须是对象')
    }
    const action = input.action
    if (!ACTIONS.includes(action)) {
      throw new TodoError('invalid-input', `不支持的 action：${String(action)}，可用 ${ACTIONS.join(' / ')}`)
    }
    if (NEEDS_ID.includes(action) && (typeof input.id !== 'string' || input.id.trim() === '')) {
      throw new TodoError('invalid-input', 'id 必填')
    }
    if (action === 'list') {
      const all = await api.list({})
      const filtered = await api.list({ ...input, view: input.view ?? 'open' })
      return { items: filtered.items, summary: summarize(all.items) }
    }
    if (action === 'add') {
      const { action: _a, ...fields } = input
      const item = await api.create(fields)
      return { item, summary: summarize((await api.list({})).items) }
    }
    if (action === 'update') {
      const { action: _a, ...rest } = input
      return { item: await api.update(rest) }
    }
    if (action === 'complete') {
      const item = await api.complete({ id: input.id, done: input.done !== false, by: 'agent', date: input.date })
      return { item }
    }
    if (action === 'confirm') {
      const item = await api.confirm({ id: input.id })
      return { item }
    }
    const removed = await api.remove({ id: input.id })
    return { removed }
  }

  return {
    name: 'personal_todo',
    description:
      '管理用户本人的日常待办（跨会话、与当前任务无关）。当前会话的任务清单请用官方 todo_write。' +
      'action=list 查询（支持 view / category / priority / q 筛选）；add 新建；update 修改；complete 勾选/取消（agent 打勾会标为待确认）；' +
      'confirm 确认该条已完成；delete 删除。' +
      '只在用户明确要求记录、查询或更新待办时调用，不要用它记录当前会话的任务步骤。' +
      '用户用口语描述重复安排（如「每周一到周五」「每月 5 号」）时，自行推断 repeat 参数，不要反问用户要哪种重复。' +
      '用户的临时便签用 personal_note（随手记、无日期无状态）；需要日期、完成跟踪或提醒时才用本工具。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ACTIONS, description: '要执行的操作' },
        id: { type: 'string', description: '待办 id（update / complete / confirm / delete 必填）' },
        title: { type: 'string', description: '标题' },
        note: { type: 'string', description: '备注' },
        priority: { type: 'string', enum: ['high', 'medium', 'low'], description: '优先级' },
        category: { type: 'string', description: '分类，如 工作 / 生活' },
        dueDate: { type: 'string', description: '截止日期 YYYY-MM-DD' },
        dueTime: { type: 'string', description: '截止时间 HH:mm' },
        date: { type: 'string', description: 'complete 时指定哪一天（YYYY-MM-DD），默认今天；循环任务用' },
        repeat: {
          type: 'object',
          description: '循环规则：{ freq: daily|weekly|monthly, weekdays?: 1-7, monthDay?: 1-31, until?: YYYY-MM-DD }',
          properties: {
            freq: { type: 'string', enum: ['daily', 'weekly', 'monthly'] },
            weekdays: { type: 'array', items: { type: 'integer' } },
            monthDay: { type: 'integer' },
            until: { type: 'string' },
          },
          required: ['freq'],
          additionalProperties: false,
        },
        category: { type: 'string', description: "list：只看这个分类（精确匹配）；传空串等于不过滤" },
        priority: { type: 'string', enum: ['high', 'medium', 'low'], description: 'list：只看这个优先级' },
        view: { type: 'string', enum: ['open', 'today', 'week', 'stale', 'done'], description: 'list 的过滤视图' },
        q: { type: 'string', description: 'list 的关键词' },
        done: { type: 'boolean', description: 'complete 时传 false 表示取消完成' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object' },
      render(args, value) {
        if (Array.isArray(value?.items)) {
          const lines = value.items.map(describe)
          const s = value.summary ?? {}
          const head = `待办：今天 ${s.today ?? 0} · 逾期 ${s.overdue ?? 0} · 积压 ${s.stale ?? 0} · 未排期 ${s.unplanned ?? 0} · 最近完成 ${s.doneToday ?? 0}`
          const note = filterNote(args)
          return [{ type: 'text', text: [head, ...(note === '' ? [] : [note]), ...lines].join('\n') }]
        }
        if (value?.item) return [{ type: 'text', text: `已保存 (${value.item.id})：${value.item.title}` }]
        if (value?.removed) return [{ type: 'text', text: `已删除 (${value.removed.id})` }]
        return [{ type: 'text', text: JSON.stringify(value) }]
      },
    },
    execute: run,
  }
}

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
