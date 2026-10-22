/** The `todo_write` agent tool: same dispatch table the UI calls. */

import { TodoError } from './model.js'
import { summarize } from './bucket.js'

const ACTIONS = ['list', 'add', 'update', 'complete', 'delete']

function describe(item) {
  const due = item.dueDate ? `（截止 ${item.dueDate}${item.dueTime ? ' ' + item.dueTime : ''}）` : ''
  const flag = item.bucket === 'stale' ? '【积压】' : ''
  return `- ${item.done ? '[x]' : '[ ]'} ${item.title}${due}${flag}`
}

export function createTool(api, ready) {
  async function run(input = {}) {
    await ready
    const action = input.action
    if (!ACTIONS.includes(action)) {
      throw new TodoError('invalid-input', `不支持的 action：${String(action)}，可用 ${ACTIONS.join(' / ')}`)
    }
    if (action === 'list') return api.list({ ...input, view: input.view ?? 'open' })
    if (action === 'add') {
      const { action: _a, ...fields } = input
      const item = await api.create(fields)
      return { item, summary: summarize((await api.list({ view: 'open' })).items) }
    }
    if (action === 'update') {
      const { action: _a, id, ...patch } = input
      const item = await api.update({ id, patch })
      return { item }
    }
    if (action === 'complete') {
      const item = await api.complete({ id: input.id, done: input.done !== false })
      return { item }
    }
    const removed = await api.remove({ id: input.id })
    return { removed }
  }

  return {
    name: 'todo_write',
    description:
      '读写用户本人的日常工作待办清单（与 DSH 会话无关）。' +
      'action=list 查询；add 新建；update 修改；complete 勾选/取消；delete 删除。' +
      '只在用户明确要求记录、查询或更新待办时调用，不要用它记录当前会话的任务步骤。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ACTIONS, description: '要执行的操作' },
        id: { type: 'string', description: '待办 id（update / complete / delete 必填）' },
        title: { type: 'string', description: '标题' },
        note: { type: 'string', description: '备注' },
        priority: { type: 'string', enum: ['high', 'medium', 'low'], description: '优先级' },
        category: { type: 'string', description: '分类，如 工作 / 生活' },
        dueDate: { type: 'string', description: '截止日期 YYYY-MM-DD' },
        dueTime: { type: 'string', description: '截止时间 HH:mm' },
        view: { type: 'string', enum: ['open', 'today', 'week', 'stale', 'done'], description: 'list 的过滤视图' },
        q: { type: 'string', description: 'list 的关键词' },
        done: { type: 'boolean', description: 'complete 时传 false 表示取消完成' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object' },
      render(_args, value) {
        if (Array.isArray(value?.items)) {
          const lines = value.items.map(describe)
          const s = value.summary ?? {}
          const head = `待办：今天 ${s.today ?? 0} · 积压 ${s.stale ?? 0} · 未排期 ${s.unplanned ?? 0}`
          return [{ type: 'text', text: [head, ...lines].join('\n') }]
        }
        if (value?.item) return [{ type: 'text', text: `已保存：${value.item.title}` }]
        if (value?.removed) return [{ type: 'text', text: '已删除' }]
        return [{ type: 'text', text: JSON.stringify(value) }]
      },
    },
    execute: run,
  }
}
