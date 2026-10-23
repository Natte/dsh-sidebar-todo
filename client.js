window.__ModuleLoader__.load({
  id: 'dsh-todolist',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useCallback, useRef } = React

    const NS = 'dsh-todolist'
    const dict = {
      zh: {
        nav: '待办', title: '待办', new: '新建', search: '搜索待办',
        today: '今天', tomorrow: '明天', week: '本周', later: '以后', stale: '积压',
        unplanned: '未排期', done: '已完成', empty: '还没有待办',
        staleHint: '超过 {n} 天未完成', loading: '加载中…', failed: '读取失败',
        retry: '重试', pickOne: '选一条看详情',
        corruptNotice: '数据文件损坏，已备份并以空清单启动',
        writeNotice: '有改动尚未写入磁盘', retryWrite: '重试写入',
        save: '保存', cancel: '取消',
        complete: '完成', reopen: '撤销完成', remove: '删除', confirmRemove: '确认删除', edit: '编辑',
        needsReview: '待确认', confirmDone: '确认已完成',
        note: '备注', priority: '优先级', dueDate: '截止日期', dueTime: '时间', category: '分类',
        dialogNew: '新建待办', dialogEdit: '编辑待办',
        fieldTitle: '标题', fieldNote: '备注', fieldDate: '日期', fieldTime: '时间',
        fieldPriority: '优先级', fieldCategory: '分类',
        quickFill: '一句话填写，例如：明天下午3点 交周报 #工作',
        quickHint: '也可以只填标题，之后在对话里让我改日期。', titleRequired: '标题不能为空',
        emptyHint: '新建第一条',
        yesterday: '昨天', earlier: '更早', created: '创建于',
        noMatch: '没有匹配的待办', staleFor: '挂了 {n} 天',
        priorityHigh: '高', priorityMedium: '中', priorityLow: '低',
        badResponse: '响应格式不正确', requestFailed: '请求失败', dismiss: '关闭',
      },
      en: {
        nav: 'To-do', title: 'To-do', new: 'New', search: 'Search',
        today: 'Today', tomorrow: 'Tomorrow', week: 'This week', later: 'Later', stale: 'Backlog',
        unplanned: 'Unscheduled', done: 'Completed', empty: 'No todos yet',
        staleHint: 'Open for more than {n} days', loading: 'Loading…', failed: 'Failed to load',
        retry: 'Retry', pickOne: 'Select an item',
        corruptNotice: 'Data file was corrupt; it is backed up and the list started empty.',
        writeNotice: 'Some changes are not on disk yet', retryWrite: 'Retry write',
        save: 'Save', cancel: 'Cancel',
        complete: 'Complete', reopen: 'Reopen', remove: 'Delete', confirmRemove: 'Confirm delete', edit: 'Edit',
        needsReview: 'Needs review', confirmDone: 'Confirm done',
        note: 'Note', priority: 'Priority', dueDate: 'Due date', dueTime: 'Time', category: 'Category',
        dialogNew: 'New todo', dialogEdit: 'Edit todo',
        fieldTitle: 'Title', fieldNote: 'Note', fieldDate: 'Date', fieldTime: 'Time',
        fieldPriority: 'Priority', fieldCategory: 'Category',
        quickFill: 'Quick fill, e.g. "tomorrow 3pm report #work"',
        quickHint: 'You can fill in just the title and ask me in chat to set the date later.', titleRequired: 'Title is required',
        emptyHint: 'Create the first one',
        yesterday: 'Yesterday', earlier: 'Earlier', created: 'Created',
        noMatch: 'No matching todos', staleFor: 'Open {n} days',
        priorityHigh: 'High', priorityMedium: 'Medium', priorityLow: 'Low',
        badResponse: 'Unexpected response', requestFailed: 'Request failed', dismiss: 'Dismiss',
      },
    }
    const ORDER = ['today', 'tomorrow', 'week', 'later', 'stale', 'unplanned', 'done']

    function apiUrl(method) {
      return new URL(`todo/api/${method}`, document.baseURI).href
    }

    const defaultT = (key) => dict.zh[key] ?? key

    async function fetchApi(method, payload, t = defaultT) {
      const res = await fetch(apiUrl(method), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload ?? {}),
      })
      const body = await res.json().catch(() => null)
      if (!body) throw new Error(t('badResponse'))
      if (!body.ok) throw new Error(body.error?.message ?? t('requestFailed'))
      return body.result
    }

    const S = {
      page: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, color: 'var(--dsw-alias-label-primary)' },
      head: { display: 'flex', alignItems: 'center', gap: 10, height: 56, padding: '0 20px', flex: 'none', borderBottom: '0.5px solid var(--dsw-alias-border-l2)' },
      h1: { fontSize: 17, fontWeight: 600, margin: 0 },
      count: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' },
      grow: { flex: 1 },
      search: { width: 200, height: 32, padding: '0 10px', borderRadius: 8, fontSize: 12.5, background: 'var(--dsw-alias-bg-module-platform)', color: 'var(--dsw-alias-label-primary)' },
      body: { display: 'flex', flex: 1, minHeight: 0, width: '100%', maxWidth: 1240, margin: '0 auto' },
      list: { flex: 1, minWidth: 0, overflowY: 'auto', padding: '10px 8px 10px 12px' },
      sec: { display: 'flex', alignItems: 'center', gap: 8, height: 30, padding: '0 8px', marginTop: 6 },
      secT: { fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)' },
      secN: { fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' },
      line: { flex: 1, height: '0.5px', background: 'var(--dsw-alias-border-l2)' },
      row: { display: 'flex', alignItems: 'center', gap: 9, height: 34, padding: '0 8px', borderRadius: 6, cursor: 'pointer' },
      cb: { width: 14, height: 14, borderRadius: 4, border: '0.5px solid var(--dsw-alias-border-l4)', flex: 'none', background: 'var(--dsw-alias-bg-layer-1)' },
      cbDone: { width: 14, height: 14, borderRadius: 4, flex: 'none', background: 'var(--dsw-alias-state-business-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
      nm: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13.5 },
      nmDone: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13.5, color: 'var(--dsw-alias-label-tertiary)', textDecoration: 'line-through' },
      tag: { fontSize: 10.5, padding: '0 6px', borderRadius: 4, color: 'var(--dsw-alias-label-secondary)', background: 'var(--dsw-alias-bg-module-platform)', flex: 'none' },
      due: { fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', flex: 'none', minWidth: 52, textAlign: 'right' },
      dueLate: { fontSize: 11, color: 'var(--dsw-alias-state-error-primary)', flex: 'none', minWidth: 52, textAlign: 'right' },
      detail: { width: 380, flex: 'none', borderLeft: '0.5px solid var(--dsw-alias-border-l2)', padding: 16, fontSize: 12.5, color: 'var(--dsw-alias-label-secondary)' },
      empty: { padding: 40, textAlign: 'center', color: 'var(--dsw-alias-label-tertiary)', fontSize: 13 },
      error: { margin: 12, padding: '8px 12px', borderRadius: 8, fontSize: 12, color: 'var(--dsw-alias-state-error-primary)', background: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent)' },
      warn: { margin: 12, padding: '8px 12px', borderRadius: 8, fontSize: 12, color: 'var(--dsw-alias-state-warn-primary)', background: 'color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, transparent)', display: 'flex', alignItems: 'center', gap: 8 },
      addBtn: { height: 32, padding: '0 12px', borderRadius: 8, border: '0.5px solid var(--dsw-alias-border-l3)', color: 'var(--dsw-alias-label-primary)', fontSize: 13, cursor: 'pointer' },
      overlay: { position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--dsw-alias-bg-mask-1)' },
      dialog: { width: 520, maxWidth: 'calc(100vw - 32px)', maxHeight: '82vh', overflowY: 'auto', boxSizing: 'border-box', padding: '20px 20px 16px', background: 'var(--dsw-specific-input-major)', borderRadius: 'var(--dsw-radius-xl)', boxShadow: 'var(--dsw-elevation-panel)', color: 'var(--dsw-alias-label-primary)' },
      dialogHead: { fontSize: 15, fontWeight: 600, marginBottom: 12 },
      hint: { marginTop: 6, fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' },
      field: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, marginBottom: 10 },
      fieldRow: { display: 'flex', gap: 12 },
      fieldLabel: { fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)' },
      input: { width: '100%', height: 32, boxSizing: 'border-box', padding: '0 10px', borderRadius: 8, background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', fontSize: 12.5, fontFamily: 'inherit' },
      textarea: { width: '100%', height: 64, boxSizing: 'border-box', padding: '7px 10px', borderRadius: 8, background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', fontSize: 12.5, fontFamily: 'inherit', lineHeight: '18px', resize: 'vertical' },
      seg: { display: 'flex', gap: 6 },
      segItem: { flex: 1, height: 30, borderRadius: 6, border: '0.5px solid var(--dsw-alias-border-l3)', color: 'var(--dsw-alias-label-secondary)', fontSize: 12.5, cursor: 'pointer' },
      segItemOn: { border: '0.5px solid transparent', background: 'var(--dsw-alias-state-business-primary)', color: '#fff' },
      dialogError: { marginTop: 4, padding: '6px 10px', borderRadius: 6, fontSize: 12, color: 'var(--dsw-alias-state-error-primary)', background: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent)' },
      dialogFoot: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
      btnGhost: { height: 32, padding: '0 14px', borderRadius: 8, border: '0.5px solid var(--dsw-alias-border-l3)', color: 'var(--dsw-alias-label-secondary)', fontSize: 12.5, cursor: 'pointer' },
      btnPrimary: { height: 32, padding: '0 14px', borderRadius: 8, border: 'none', background: 'var(--dsw-alias-state-business-primary)', color: '#fff', fontSize: 12.5, cursor: 'pointer' },
      noticeClose: { flex: 'none', width: 20, height: 20, padding: 0, lineHeight: '18px', textAlign: 'center', border: 'none', borderRadius: 4, color: 'inherit', fontSize: 14, cursor: 'pointer' },
      secBtn: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 30, padding: '0 8px', marginTop: 6, border: 'none', cursor: 'pointer', textAlign: 'left' },
      subsec: { display: 'flex', alignItems: 'center', gap: 8, height: 26, padding: '0 8px 0 16px', marginTop: 2 },
    }

    // 标题是真正的 <button>（键盘可达），但外观仍是普通文本。
    const TITLE_BTN = { padding: 0, border: 'none', color: 'inherit', fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer', borderRadius: 4 }

    // 内联 style 表达不了 :hover / :active / :focus-visible，所以全局插一份样式表。
    // .td-btn 的透明底放在这里而不是内联：内联 background 的优先级高于类选择器，
    // 幽灵按钮若保留内联 transparent，.td-btn:hover 的底色就永远不生效。
    // 同理 .td-input 的基础描边也放这里，:hover / :focus 的 border-color 才能覆盖。
    const PLUGIN_CSS = `
.td-overlay { animation: td-fade .14s ease-out; }
.td-dialog { animation: td-rise .16s cubic-bezier(.2,.8,.2,1); }
@keyframes td-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes td-rise { from { opacity: 0; transform: translateY(6px) scale(.992) } to { opacity: 1; transform: none } }

.td-btn { background: transparent; transition: background-color .12s ease, border-color .12s ease, color .12s ease, transform .08s ease; }
.td-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.td-btn:active:not(:disabled) { transform: scale(.985); }
.td-btn:focus { outline: none; }
.td-btn:focus-visible { outline: none; box-shadow: inset 0 0 0 1.5px var(--dsw-alias-state-business-primary); }
.td-btn:disabled { opacity: .5; cursor: default; }

.td-elevated { background: var(--dsw-alias-button-elevated-fill); }

.td-primary { transition: filter .12s ease, transform .08s ease, opacity .12s ease; }
.td-primary:hover:not(:disabled) { filter: brightness(1.06); }
.td-primary:active:not(:disabled) { transform: scale(.985); filter: brightness(.96); }
.td-primary:focus { outline: none; }
.td-primary:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--dsw-alias-bg-base), 0 0 0 3.5px var(--dsw-alias-state-business-primary); }

.td-input { border: 0.5px solid var(--dsw-alias-border-l3); transition: border-color .12s ease, background-color .12s ease; }
.td-input:hover { border-color: var(--dsw-alias-border-l4); }
.td-input:focus { outline: none; border-color: var(--dsw-alias-state-business-primary); }
.td-input:focus-visible { outline: none; }

.td-row { transition: background-color .12s ease; }
.td-row:hover { background: var(--dsw-alias-interactive-bg-hover); }

@media (prefers-reduced-motion: reduce) {
  .td-overlay, .td-dialog, .td-btn, .td-primary, .td-input, .td-row { animation: none; transition: none; }
  .td-btn:active:not(:disabled), .td-primary:active:not(:disabled) { transform: none; }
}
`

    /** 样式表全页只插一份；返回的清理函数交给 ctx.effect，插件卸载时移除。 */
    function ensureStyles() {
      const existing = document.querySelector('style[data-plugin-css="dsh-todolist"]')
      if (existing !== null) return () => {}
      const el = document.createElement('style')
      el.dataset.pluginCss = 'dsh-todolist'
      el.textContent = PLUGIN_CSS
      document.head.appendChild(el)
      return () => { el.remove() }
    }

    /** 详情列的「标签 + 值」竖排行，标签列固定 56px。 */
    function detailRow(label, value) {
      return h('div', { style: { display: 'flex', gap: 8, lineHeight: '20px' } },
        h('span', { style: { width: 56, flex: 'none', color: 'var(--dsw-alias-label-tertiary)' } }, label),
        h('span', null, value))
    }

    /** 手改 JSON 可能让字符串字段变成任意类型；渲染按空串兜底，别让整页被错误边界摘掉。 */
    function asText(value) {
      return typeof value === 'string' ? value : ''
    }

    function dueLabel(item) {
      const dueDate = asText(item.dueDate)
      if (dueDate === '') return ''
      const dueTime = asText(item.dueTime)
      return dueTime === '' ? dueDate.slice(5) : `${dueDate.slice(5)} ${dueTime}`
    }

    function dateKeyOf(date) {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    }

    function startOfDay(date) {
      return new Date(date.getFullYear(), date.getMonth(), date.getDate())
    }

    /** `createdAt` 按本地时区格式化成 `YYYY-MM-DD HH:mm`。 */
    function formatDateTime(iso) {
      const at = new Date(iso)
      if (Number.isNaN(at.getTime())) return ''
      return `${dateKeyOf(at)} ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
    }

    const PRIORITY_COLOR = {
      high: 'var(--dsw-alias-state-error-primary)',
      medium: 'var(--dsw-alias-state-warn-primary)',
      low: 'var(--dsw-alias-state-business-primary)',
    }
    const PRIORITY_LABEL_KEY = {
      high: 'priorityHigh',
      medium: 'priorityMedium',
      low: 'priorityLow',
    }

    function priorityColor(priority) {
      return PRIORITY_COLOR[priority] ?? 'var(--dsw-alias-label-tertiary)'
    }

    function priorityLabel(priority, t) {
      const key = PRIORITY_LABEL_KEY[priority]
      if (key !== undefined) return t(key)
      return typeof priority === 'string' ? priority : ''
    }

    /** 「挂了 N 天」：按 `createdAt` 算整天数，算不出来时退回分组名。 */
    function staleLabel(item, t, now = new Date()) {
      const created = Date.parse(item.createdAt)
      if (Number.isNaN(created)) return t('stale')
      const days = Math.max(0, Math.floor((now.getTime() - created) / 86400000))
      return days > 0 ? t('staleFor').replace('{n}', String(days)) : t('stale')
    }

    /** 客户端按 `doneAt` 分「今天 / 昨天 / 本周 / 更早」，不改服务端契约。 */
    function doneGroupOf(item, now = new Date()) {
      if (!item.doneAt) return 'earlier'
      const at = new Date(item.doneAt)
      if (Number.isNaN(at.getTime())) return 'earlier'
      const day = startOfDay(at).getTime()
      const today = startOfDay(now)
      if (day === today.getTime()) return 'today'
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      if (day === yesterday.getTime()) return 'yesterday'
      const monday = new Date(today)
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
      if (day >= monday.getTime()) return 'week'
      return 'earlier'
    }

    function Row({ item, selected, onSelect, onToggle, t }) {
      const today = new Date()
      const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      const title = asText(item.title)
      const dueDate = asText(item.dueDate)
      const category = asText(item.category)
      const late = !item.done && dueDate !== '' && dueDate < todayKey
      // 行本身保持普通 div：按钮的子元素在 ARIA 里是 presentational，行若 role="button"，
      // 里面的 role="checkbox" 读屏就看不到了。鼠标仍点整行选中；键盘走标题与复选框两个独立控件。
      // 未选中时不写内联 background，悬停底色交给 .td-row:hover。
      return h('div', {
        className: 'td-row',
        style: selected ? { ...S.row, background: 'var(--dsw-alias-interactive-bg-hover)' } : S.row,
        onClick: () => onSelect(item.id),
      },
      item.priority
        ? h('span', {
            style: { width: 3, height: 18, borderRadius: 2, flex: 'none', background: priorityColor(item.priority) },
            'aria-hidden': 'true',
          })
        : null,
      h('span', {
        role: 'checkbox',
        'aria-checked': item.done ? 'true' : 'false',
        'aria-label': title,
        tabIndex: 0,
        className: 'td-btn',
        style: item.done ? S.cbDone : S.cb,
        onClick: (e) => { e.stopPropagation(); onToggle(item) },
        onKeyDown: (e) => {
          if (e.nativeEvent?.isComposing === true) return
          if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onToggle(item) }
        },
      }, item.done
        ? h('svg', { width: 9, height: 9, viewBox: '0 0 16 16', fill: 'none', stroke: '#fff', strokeWidth: 2.4 },
            h('path', { d: 'M3.4 8.4 6.2 11l6.4-6.4', strokeLinecap: 'round', strokeLinejoin: 'round' }))
        : null),
      h('button', {
        type: 'button',
        className: 'td-btn',
        'aria-current': selected ? 'true' : 'false',
        style: {
          ...TITLE_BTN,
          ...(item.done ? S.nmDone : S.nm),
        },
        onClick: (e) => { e.stopPropagation(); onSelect(item.id) },
      }, title),
      category !== '' ? h('span', { style: S.tag }, category) : null,
      item.done && item.doneBy === 'agent' && !item.verifiedAt
        ? h('span', { style: { ...S.tag, color: 'var(--dsw-alias-state-warn-primary)' } }, t('needsReview'))
        : null,
      h('span', { style: late ? S.dueLate : S.due }, item.bucket === 'stale' ? staleLabel(item, t, today) : dueLabel(item)),
      )
    }

    /**
     * 新建 / 编辑弹窗：顶部一句话填写（200ms 防抖复用 parse），下面是全部字段。
     * 空字符串一律转成 null 再提交，否则宿主会把 '' 当成「有值」。
     * 保存失败时只在弹窗内报错，不关闭、不清空用户已经填的内容。
     */
    function TodoDialog({ t, initial, categories, mutate, onClose, onSaved }) {
      const editing = initial !== null && initial !== undefined
      const [form, setForm] = useState(() => ({
        id: editing ? initial.id : null,
        title: editing ? asText(initial.title) : '',
        note: editing ? asText(initial.note) : '',
        dueDate: editing ? asText(initial.dueDate) : dateKeyOf(new Date()),
        dueTime: editing ? asText(initial.dueTime) : '',
        priority: editing && ['high', 'medium', 'low'].includes(initial.priority) ? initial.priority : null,
        category: editing ? asText(initial.category) : '',
      }))
      const [quick, setQuick] = useState('')
      const [error, setError] = useState(null)
      const [saving, setSaving] = useState(false)

      const alive = useRef(true)
      const seq = useRef(0)
      const closeRef = useRef(onClose)

      useEffect(() => {
        alive.current = true
        return () => { alive.current = false }
      }, [])

      useEffect(() => { closeRef.current = onClose }, [onClose])

      // 弹窗打开期间才监听 Esc；卸载时解绑，避免宿主里留下悬空监听。
      useEffect(() => {
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return
          event.stopPropagation?.()
          closeRef.current()
        }
        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
      }, [])

      // 输入停顿 200ms 后解析；seq 保证只有最后一次输入的结果能写表单。
      useEffect(() => {
        const current = ++seq.current
        if (quick.trim() === '') return undefined
        const timer = window.setTimeout(() => {
          fetchApi('parse', { text: quick })
            .then((parsed) => {
              if (!alive.current || current !== seq.current) return
              setForm((prev) => ({
                ...prev,
                title: parsed.title || prev.title,
                dueDate: parsed.dueDate || prev.dueDate,
                dueTime: parsed.dueTime || prev.dueTime,
                priority: parsed.priority ?? prev.priority,
                category: parsed.category || prev.category,
              }))
            })
            .catch(() => {})
        }, 200)
        return () => window.clearTimeout(timer)
      }, [quick])

      const submit = async () => {
        if (saving) return
        const title = form.title.trim()
        if (title === '') {
          setError(t('titleRequired'))
          return
        }
        const category = form.category.trim()
        const payload = {
          title,
          note: form.note,
          dueDate: form.dueDate || null,
          dueTime: form.dueTime || null,
          priority: form.priority || null,
          category: category === '' ? null : category,
        }
        setError(null)
        setSaving(true)
        try {
          const ok = form.id === null
            ? await mutate('create', payload)
            : await mutate('update', { id: form.id, patch: payload })
          if (!ok) {
            setError(t('requestFailed'))
            return
          }
          onSaved()
        } catch (err) {
          setError(err instanceof Error && err.message ? err.message : t('requestFailed'))
        } finally {
          if (alive.current) setSaving(false)
        }
      }

      const modeLabel = t(editing ? 'dialogEdit' : 'dialogNew')

      return h('div', {
        className: 'td-overlay',
        style: S.overlay,
        onClick: (event) => { if (event.target === event.currentTarget) onClose() },
      },
      h('div', { className: 'td-dialog', style: S.dialog, role: 'dialog', 'aria-modal': 'true', 'aria-label': modeLabel },
        h('div', { style: S.dialogHead }, modeLabel),
        h('div', { style: { marginBottom: 12 } },
          h('input', {
            className: 'td-input',
            style: { ...S.search, width: '100%', boxSizing: 'border-box' },
            value: quick, placeholder: t('quickFill'), 'aria-label': t('quickFill'),
            onChange: (e) => setQuick(e.target.value),
          }),
          h('div', { style: S.hint }, t('quickHint'))),

        h('label', { style: S.field },
          h('span', { style: S.fieldLabel }, t('fieldTitle')),
          h('input', {
            className: 'td-input',
            autoFocus: true, style: S.input, value: form.title,
            onChange: (e) => setForm((prev) => ({ ...prev, title: e.target.value })),
            onKeyDown: (e) => {
              if (e.nativeEvent?.isComposing === true) return
              if (e.key === 'Enter') void submit()
            },
          })),

        h('label', { style: S.field },
          h('span', { style: S.fieldLabel }, t('fieldNote')),
          h('textarea', {
            className: 'td-input',
            rows: 3, style: S.textarea, value: form.note,
            onChange: (e) => setForm((prev) => ({ ...prev, note: e.target.value })),
          })),

        h('div', { style: S.fieldRow },
          h('label', { style: S.field },
            h('span', { style: S.fieldLabel }, t('fieldDate')),
            h('input', {
              className: 'td-input',
              type: 'date', style: S.input, value: form.dueDate,
              onChange: (e) => setForm((prev) => ({ ...prev, dueDate: e.target.value })),
            })),
          h('label', { style: S.field },
            h('span', { style: S.fieldLabel }, t('fieldTime')),
            h('input', {
              className: 'td-input',
              type: 'time', style: S.input, value: form.dueTime,
              onChange: (e) => setForm((prev) => ({ ...prev, dueTime: e.target.value })),
            }))),

        h('div', { style: S.field },
          h('span', { style: S.fieldLabel }, t('fieldPriority')),
          h('div', { style: S.seg },
            [['high', 'priorityHigh'], ['medium', 'priorityMedium'], ['low', 'priorityLow']].map(([value, key]) =>
              h('button', {
                key: value, type: 'button',
                className: 'td-btn',
                'aria-pressed': form.priority === value ? 'true' : 'false',
                style: { ...S.segItem, ...(form.priority === value ? S.segItemOn : null) },
                onClick: () => setForm((prev) => ({
                  ...prev,
                  priority: prev.priority === value ? null : value,
                })),
              }, t(key))))),

        h('label', { style: S.field },
          h('span', { style: S.fieldLabel }, t('fieldCategory')),
          h('input', {
            className: 'td-input',
            style: S.input, value: form.category, list: 'todo-categories',
            onChange: (e) => setForm((prev) => ({ ...prev, category: e.target.value })),
          }),
          h('datalist', { id: 'todo-categories' },
            categories.map((category) => h('option', { key: category, value: category })))),

        error !== null ? h('div', { style: S.dialogError }, error) : null,
        h('div', { style: S.dialogFoot },
          h('button', { type: 'button', className: 'td-btn', style: S.btnGhost, onClick: onClose, disabled: saving }, t('cancel')),
          h('button', { type: 'button', className: 'td-primary', style: S.btnPrimary, onClick: () => void submit(), disabled: saving }, t('save'))),
      ))
    }

    let corruptDismissed = false

    function TodoPage(props) {
      const t = props.t ?? ((key) => dict.zh[key] ?? key)
      const [state, setState] = useState({ loading: true, error: null, items: [], summary: {}, notices: [], staleDays: 7 })
      const [query, setQuery] = useState('')
      const [selected, setSelected] = useState(null)
      const [dialog, setDialog] = useState(null)
      const [confirming, setConfirming] = useState(false)
      const [doneOpen, setDoneOpen] = useState(false)
      const [noticeHidden, setNoticeHidden] = useState(corruptDismissed)
      const [compactDetail, setCompactDetail] = useState(() => window.innerWidth < 1000)
      const [retrying, setRetrying] = useState(false)

      // t 走 ref：语言切换时调用方可能换掉 props.t，但不该让 reload 重新排队。
      const tRef = useRef(t)
      useEffect(() => { tRef.current = t }, [t])

      // 请求序号：只有最后一次 list 的结果能落到 state，旧响应直接丢弃。
      const seqRef = useRef(0)

      // 「已完成」折叠控制：未核实项首次出现时自动展开一次；用户手动开/收过之后
      // 就不再抢控制权。prevPending 只认 0 → N 的跃迁，2.5s 轮询不会反复弹开。
      const doneTouched = useRef(false)
      const prevPending = useRef(0)

      // 删除二次确认的 3s 自动撤回：timer id 必须存下来，换选/卸载时才能取消，
      // 否则上一条的旧 timer 会在新条的确认窗口里把它提前撤回。
      const confirmTimer = useRef(null)
      const clearConfirmTimer = useCallback(() => {
        if (confirmTimer.current !== null) {
          window.clearTimeout(confirmTimer.current)
          confirmTimer.current = null
        }
      }, [])

      const reload = useCallback(async () => {
        const seq = ++seqRef.current
        try {
          const result = await fetchApi('list', query ? { q: query } : {}, tRef.current)
          if (seq !== seqRef.current) return
          setState({
            loading: false,
            error: null,
            items: Array.isArray(result.items) ? result.items : [],
            summary: result.summary && typeof result.summary === 'object' ? result.summary : {},
            notices: Array.isArray(result.notices) ? result.notices : [],
            staleDays: Number.isInteger(result.staleDays) ? result.staleDays : 7,
          })
        } catch (err) {
          if (seq !== seqRef.current) return
          console.error('[dsh-todolist] list failed', err)
          setState((prev) => ({ ...prev, loading: false, error: true }))
        }
      }, [query])

      /** 写操作：返回是否成功，调用方（如 TodoDialog）据此决定要不要关闭。 */
      const mutate = useCallback(async (method, payload) => {
        try {
          await fetchApi(method, payload, tRef.current)
          await reload()
          return true
        } catch (err) {
          console.error(`[dsh-todolist] ${method} failed`, err)
          // 写失败不再占用「读取失败」的红条：重新拉一次 list，让宿主把
          // notices 里的 write-error 带回来；轮询成功也清不掉它。
          await reload()
          return false
        }
      }, [reload])

      /** 把内存里的改动重试落盘；成功后 reload，宿主清掉 writeError，提示条随之消失。 */
      const retryWrite = useCallback(async () => {
        if (retrying) return
        setRetrying(true)
        try {
          await fetchApi('retry', {}, tRef.current)
          await reload()
        } catch (err) {
          console.error('[dsh-todolist] retry write failed', err)
        } finally {
          setRetrying(false)
        }
      }, [reload, retrying])

      useEffect(() => { void reload() }, [reload])

      useEffect(() => {
        const timer = window.setInterval(() => { void reload() }, 2500)
        return () => window.clearInterval(timer)
      }, [reload])

      // 换选另一条时：先取消上一条的自动撤回计时，再复位「确认删除」。
      useEffect(() => {
        clearConfirmTimer()
        setConfirming(false)
      }, [selected, clearConfirmTimer])

      // 卸载时清掉计时器，避免组件没了还 setConfirming。
      useEffect(() => () => clearConfirmTimer(), [clearConfirmTimer])

      // 窄窗口（< 1000px）把详情列从 380 收到 320，避免挤压列表；监听随卸载解绑。
      useEffect(() => {
        const onResize = () => setCompactDetail(window.innerWidth < 1000)
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
      }, [])

      const items = state.items
      const pendingCount = items.filter((item) => item.done && item.doneBy === 'agent' && !item.verifiedAt).length
      const categories = [...new Set(state.items.map((i) => i.category).filter(Boolean))]

      // 首次出现未核实项（0 → N）时把「已完成」展开，否则标记藏在折叠区里没人看得见。
      // 用户手动操作过（doneTouched）就不再自动展开，徽标仍然照常更新。
      useEffect(() => {
        if (pendingCount > 0 && prevPending.current === 0 && !doneTouched.current) setDoneOpen(true)
        prevPending.current = pendingCount
      }, [pendingCount])

      const doneItems = items.filter((item) => item.bucket === 'done')
      const openGroups = ORDER
        .filter((bucket) => bucket !== 'done')
        .map((bucket) => ({ bucket, items: items.filter((item) => item.bucket === bucket) }))
        .filter((group) => group.items.length > 0)
      const doneSections = ['today', 'yesterday', 'week', 'earlier']
        .map((bucket) => ({ bucket, items: doneItems.filter((item) => doneGroupOf(item) === bucket) }))
        .filter((section) => section.items.length > 0)
      const selectedItem = items.find((item) => item.id === selected) ?? null
      const toggleItem = (item) => { void mutate('complete', { id: item.id, done: !item.done }) }
      const renderRow = (item) => h(Row, {
        key: item.id, item, t,
        selected: item.id === selected,
        onSelect: setSelected,
        onToggle: toggleItem,
      })

      const selectedTitle = selectedItem ? asText(selectedItem.title) : ''
      const selectedNote = selectedItem ? asText(selectedItem.note) : ''
      const selectedDueDate = selectedItem ? asText(selectedItem.dueDate) : ''
      const selectedDueTime = selectedItem ? asText(selectedItem.dueTime) : ''
      const selectedCategory = selectedItem ? asText(selectedItem.category) : ''

      return h('div', { style: S.page },
        h('div', { style: S.head },
          h('h2', { style: S.h1 }, t('title')),
          h('span', { style: S.count }, `${t('today')} ${state.summary.today ?? 0} · ${t('stale')} ${state.summary.stale ?? 0}`),
          h('div', { style: S.grow }),
          h('button', {
            className: 'td-btn td-elevated',
            style: S.addBtn,
            onClick: () => setDialog({ initial: null }),
          }, `+ ${t('new')}`),
          h('input', {
            className: 'td-input',
            style: S.search, placeholder: t('search'), value: query,
            onChange: (e) => setQuery(e.target.value),
          }),
        ),
        state.notices.includes('corrupt') && !noticeHidden
          ? h('div', { style: S.warn },
            h('span', { style: { flex: 1 } }, t('corruptNotice')),
            h('button', {
              className: 'td-btn',
              style: S.noticeClose, 'aria-label': t('dismiss'),
              onClick: () => { corruptDismissed = true; setNoticeHidden(true) },
            }, '×'))
          : null,
        state.notices.includes('write-error')
          ? h('div', { style: S.warn },
            h('span', { style: { flex: 1 } }, t('writeNotice')),
            h('button', {
              type: 'button',
              className: 'td-btn td-elevated',
              disabled: retrying,
              style: { ...S.addBtn, height: 26, padding: '0 8px', flex: 'none', cursor: retrying ? 'default' : 'pointer' },
              onClick: () => void retryWrite(),
            }, t('retryWrite')))
          : null,
        state.error
          ? h('div', { style: S.error }, `${t('failed')}　`, h('button', {
            type: 'button',
            className: 'td-btn',
            style: { padding: '1px 8px', border: 'none', borderRadius: 4, color: 'inherit', fontSize: 12, cursor: 'pointer' },
            onClick: () => void reload(),
          }, t('retry')))
          : null,
        h('div', { style: S.body },
          h('div', { style: S.list },
            state.loading && items.length === 0
              ? h('div', { style: S.empty }, t('loading'))
              : items.length === 0
                ? (query !== ''
                  ? h('div', { style: S.empty }, t('noMatch'))
                  : h('div', { style: S.empty },
                    h('div', null, t('empty')),
                    h('div', { style: { marginTop: 12 } },
                      h('button', {
                        className: 'td-btn td-elevated',
                        style: S.addBtn,
                        onClick: () => setDialog({ initial: null }),
                      }, t('emptyHint')))))
                : h('div', null,
                  openGroups.map((group) => h('div', { key: group.bucket },
                    h('div', { style: S.sec },
                      h('span', { style: S.secT }, t(group.bucket)),
                      h('span', { style: S.secN }, String(group.items.length)),
                      group.bucket === 'stale' ? h('span', { style: { ...S.tag, color: 'var(--dsw-alias-state-error-primary)' } }, t('staleHint').replace('{n}', String(state.staleDays))) : null,
                      h('span', { style: S.line }),
                    ),
                    group.items.map((item) => renderRow(item)),
                  )),
                  doneItems.length === 0 ? null : h('div', { key: 'done' },
                    h('button', {
                      className: 'td-btn',
                      style: S.secBtn,
                      'aria-expanded': doneOpen ? 'true' : 'false',
                      onClick: () => {
                        doneTouched.current = true
                        setDoneOpen((open) => !open)
                      },
                    },
                    h('span', { style: S.secT }, t('done')),
                    h('span', { style: S.secN }, String(doneItems.length)),
                    pendingCount > 0
                      ? h('span', { style: { ...S.tag, color: 'var(--dsw-alias-state-warn-primary)' } }, `${pendingCount} ${t('needsReview')}`)
                      : null,
                    h('span', { style: S.line }),
                    h('span', { style: { ...S.secN, fontSize: 10 } }, doneOpen ? '▾' : '▸'),
                    ),
                    doneOpen ? doneSections.map((section) => h('div', { key: section.bucket },
                      h('div', { style: S.subsec },
                        h('span', { style: S.secT }, t(section.bucket)),
                        h('span', { style: S.secN }, String(section.items.length)),
                        h('span', { style: S.line }),
                      ),
                      section.items.map((item) => renderRow(item)),
                    )) : null,
                  ),
                ),
          ),
          h('div', { style: compactDetail ? { ...S.detail, width: 320 } : S.detail },
            selectedItem
              ? h('div', null,
                h('div', { style: { fontSize: 15, fontWeight: 600, color: 'var(--dsw-alias-label-primary)', marginBottom: 12 } }, selectedTitle),
                selectedNote !== '' ? h('div', { style: { marginBottom: 10, lineHeight: '20px', whiteSpace: 'pre-wrap' } }, selectedNote) : null,
                h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 } },
                  selectedItem.priority
                    ? detailRow(t('priority'), h('span', {
                        style: {
                          padding: '1px 8px', borderRadius: 999,
                          color: priorityColor(selectedItem.priority),
                          background: `color-mix(in srgb, ${priorityColor(selectedItem.priority)} 12%, transparent)`,
                        },
                      }, priorityLabel(selectedItem.priority, t)))
                    : null,
                  selectedDueDate !== '' ? detailRow(t('dueDate'), `${selectedDueDate}${selectedDueTime !== '' ? ' ' + selectedDueTime : ''}`) : null,
                  selectedCategory !== '' ? detailRow(t('category'), selectedCategory) : null,
                  selectedItem.createdAt ? detailRow(t('created'), formatDateTime(selectedItem.createdAt)) : null),
                h('div', { style: { display: 'flex', gap: 8, marginTop: 14 } },
                  h('button', {
                    className: 'td-btn',
                    style: { flex: 1, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: 12.5, border: '0.5px solid var(--dsw-alias-border-l3)', color: 'var(--dsw-alias-label-secondary)' },
                    onClick: () => setDialog({ initial: selectedItem }),
                  }, t('edit')),
                  h('button', {
                    className: 'td-primary',
                    style: { flex: 1, height: 32, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--dsw-alias-state-business-primary)', color: '#fff', fontSize: 12.5 },
                    onClick: () => void mutate('complete', { id: selectedItem.id, done: !selectedItem.done }),
                  }, selectedItem.done ? t('reopen') : t('complete')),
                  h('button', {
                    className: 'td-btn',
                    style: { flex: 1, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: 12.5, border: '0.5px solid var(--dsw-alias-border-l3)', color: confirming ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-label-secondary)' },
                    onClick: async () => {
                      // 进入或结束确认态之前都先清掉旧 timer，保证只剩当前这一轮。
                      clearConfirmTimer()
                      if (!confirming) {
                        setConfirming(true)
                        confirmTimer.current = window.setTimeout(() => {
                          confirmTimer.current = null
                          setConfirming(false)
                        }, 3000)
                        return
                      }
                      setConfirming(false)
                      setSelected(null)
                      await mutate('remove', { id: selectedItem.id })
                    },
                  }, confirming ? t('confirmRemove') : t('remove')),
                ),
                selectedItem.done && selectedItem.doneBy === 'agent' && !selectedItem.verifiedAt
                  ? h('button', {
                      className: 'td-primary',
                      style: { width: '100%', height: 32, marginTop: 8, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--dsw-alias-state-business-primary)', color: 'var(--dsw-alias-label-primary-inverted)', fontSize: 12.5 },
                      onClick: () => void mutate('confirm', { id: selectedItem.id }),
                    }, t('confirmDone'))
                  : null,
              )
              : h('div', { style: { color: 'var(--dsw-alias-label-tertiary)' } }, t('pickOne')),
          ),
        ),
        dialog !== null
          ? h(TodoDialog, {
              t,
              initial: dialog.initial,
              categories,
              mutate,
              onClose: () => setDialog(null),
              onSaved: () => setDialog(null),
            })
          : null,
      )
    }

    function TodoIcon({ size = 16 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.4, 'aria-hidden': true,
      },
      h('rect', { x: 2.4, y: 2.4, width: 11.2, height: 11.2, rx: 2.4 }),
      h('path', { d: 'M5.4 8.2l1.9 1.9 3.4-3.6', strokeLinecap: 'round', strokeLinejoin: 'round' }))
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.effect(() => ensureStyles(), 'dsh-todolist: styles')

        const locale = ctx.get('locale')
        let t = (key) => dict.zh[key] ?? key
        if (locale) {
          ctx.effect(() => locale.register(NS, dict), 'dsh-todolist: dictionaries')
          t = locale.bind(NS)
        }

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: 'todo', order: 20,
          label: () => t('nav'), locale: NS, inject: () => ({ t }),
        }, ({ size } = {}) => h(TodoIcon, { size: size ?? 16 })))

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main', key: 'todo', locale: NS, inject: () => ({ t }),
        }, TodoPage))
      },
    }
  },
})
