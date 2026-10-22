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
        today: '今天', tomorrow: '明天', week: '本周', stale: '积压',
        unplanned: '未排期', done: '已完成', empty: '还没有待办',
        staleHint: '超过 7 天未完成', loading: '加载中…', failed: '读取失败',
        retry: '重试', pickOne: '选一条看详情',
        corruptNotice: '数据文件损坏，已备份并以空清单启动',
        addPlaceholder: '写点什么，回车保存', agentHint: '没看懂时间？可以在对话里说一句，让 agent 帮你定', save: '保存', cancel: '取消',
        complete: '完成', reopen: '撤销完成', remove: '删除', confirmRemove: '确认删除',
        needsReview: '待确认', confirmDone: '确认已完成',
        note: '备注', priority: '优先级', dueDate: '截止日期', dueTime: '时间', category: '分类',
        emptyHint: '新建第一条',
        yesterday: '昨天', earlier: '更早', created: '创建于',
        dayAfter: '后天', weekdaySun: '周日', weekdayMon: '周一', weekdayTue: '周二', weekdayWed: '周三',
        weekdayThu: '周四', weekdayFri: '周五', weekdaySat: '周六',
        noMatch: '没有匹配的待办', staleFor: '挂了 {n} 天',
        priorityHigh: '高', priorityMedium: '中', priorityLow: '低',
        badResponse: '响应格式不正确', requestFailed: '请求失败', dismiss: '关闭',
      },
      en: {
        nav: 'To-do', title: 'To-do', new: 'New', search: 'Search',
        today: 'Today', tomorrow: 'Tomorrow', week: 'This week', stale: 'Backlog',
        unplanned: 'Unscheduled', done: 'Completed', empty: 'No todos yet',
        staleHint: 'Open for more than 7 days', loading: 'Loading…', failed: 'Failed to load',
        retry: 'Retry', pickOne: 'Select an item',
        corruptNotice: 'Data file was corrupt; it is backed up and the list started empty.',
        addPlaceholder: 'What needs doing? Enter to save', agentHint: 'No date understood? Ask the agent in chat to set one.', save: 'Save', cancel: 'Cancel',
        complete: 'Complete', reopen: 'Reopen', remove: 'Delete', confirmRemove: 'Confirm delete',
        needsReview: 'Needs review', confirmDone: 'Confirm done',
        note: 'Note', priority: 'Priority', dueDate: 'Due date', dueTime: 'Time', category: 'Category',
        emptyHint: 'Create the first one',
        yesterday: 'Yesterday', earlier: 'Earlier', created: 'Created',
        dayAfter: 'Day after tomorrow', weekdaySun: 'Sun', weekdayMon: 'Mon', weekdayTue: 'Tue', weekdayWed: 'Wed',
        weekdayThu: 'Thu', weekdayFri: 'Fri', weekdaySat: 'Sat',
        noMatch: 'No matching todos', staleFor: 'Open {n} days',
        priorityHigh: 'High', priorityMedium: 'Medium', priorityLow: 'Low',
        badResponse: 'Unexpected response', requestFailed: 'Request failed', dismiss: 'Dismiss',
      },
    }
    const ORDER = ['today', 'tomorrow', 'week', 'stale', 'unplanned', 'done']

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
      search: { width: 200, height: 32, padding: '0 10px', borderRadius: 8, border: 'none', fontSize: 12.5, background: 'var(--dsw-alias-bg-module-platform)', color: 'var(--dsw-alias-label-primary)' },
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
      addBtn: { height: 32, padding: '0 12px', borderRadius: 8, border: '0.5px solid var(--dsw-alias-border-l3)', background: 'var(--dsw-alias-button-elevated-fill)', color: 'var(--dsw-alias-label-primary)', fontSize: 13, cursor: 'pointer' },
      noticeClose: { flex: 'none', width: 20, height: 20, padding: 0, lineHeight: '18px', textAlign: 'center', border: 'none', borderRadius: 4, background: 'transparent', color: 'inherit', fontSize: 14, cursor: 'pointer' },
      secBtn: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 30, padding: '0 8px', marginTop: 6, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' },
      subsec: { display: 'flex', alignItems: 'center', gap: 8, height: 26, padding: '0 8px 0 16px', marginTop: 2 },
    }

    // 标题是真正的 <button>（键盘可达），但外观仍是普通文本。
    const TITLE_BTN = { padding: 0, border: 'none', background: 'transparent', color: 'inherit', fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer', borderRadius: 4 }

    const FOCUS_RING = 'inset 0 0 0 1.5px var(--dsw-alias-state-business-primary)'

    /** 只在键盘（:focus-visible）时画焦点框；鼠标点选不留常驻蓝框。 */
    function focusVisible(event) {
      return event?.target?.matches?.(':focus-visible') === true
    }

    /** 详情列的「标签 + 值」竖排行，标签列固定 56px。 */
    function detailRow(label, value) {
      return h('div', { style: { display: 'flex', gap: 8, lineHeight: '20px' } },
        h('span', { style: { width: 56, flex: 'none', color: 'var(--dsw-alias-label-tertiary)' } }, label),
        h('span', null, value))
    }

    function priorityDot(priority) {
      const bg = priority === 'high' ? 'var(--dsw-alias-state-error-primary)'
        : priority === 'medium' ? 'var(--dsw-alias-state-warn-primary)'
          : priority === 'low' ? 'var(--dsw-alias-state-business-primary)' : 'transparent'
      return h('span', { style: { width: 5, height: 5, borderRadius: '50%', background: bg, flex: 'none' } })
    }

    function dueLabel(item) {
      if (!item.dueDate) return ''
      if (item.dueTime) return `${item.dueDate.slice(5)} ${item.dueTime}`
      return item.dueDate.slice(5)
    }

    function dateKeyOf(date) {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    }

    const WEEKDAY_KEYS = ['weekdaySun', 'weekdayMon', 'weekdayTue', 'weekdayWed', 'weekdayThu', 'weekdayFri', 'weekdaySat']

    /** `YYYY-MM-DD` → 本地午夜 Date；非法返回 null（不把时区交给 `new Date(string)`）。 */
    function parseDateKey(key) {
      if (typeof key !== 'string') return null
      const [y, m, d] = key.split('-').map(Number)
      if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null
      const at = new Date(y, m - 1, d)
      if (at.getFullYear() !== y || at.getMonth() !== m - 1 || at.getDate() !== d) return null
      return at
    }

    /**
     * 截止日 chip 文案：今天 / 明天 / 后天 → 本周内周X → `MM-DD`；有 `dueTime`
     * 就追加 ` HH:mm`。默认中文，传 locale 的 `t` 可本地化。
     */
    function formatDueChip(dueDate, dueTime, todayKey, t = defaultT) {
      if (typeof dueDate !== 'string' || dueDate === '') return ''
      const suffix = dueTime ? ` ${dueTime}` : ''
      const due = parseDateKey(dueDate)
      const today = parseDateKey(todayKey)
      if (due === null || today === null) return `${dueDate}${suffix}`
      const days = Math.round((due.getTime() - today.getTime()) / 86400000)
      if (days === 0) return `${t('today')}${suffix}`
      if (days === 1) return `${t('tomorrow')}${suffix}`
      if (days === 2) return `${t('dayAfter')}${suffix}`
      const monday = new Date(today)
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
      const sunday = new Date(monday)
      sunday.setDate(sunday.getDate() + 6)
      if (due.getTime() >= monday.getTime() && due.getTime() <= sunday.getTime()) {
        return `${t(WEEKDAY_KEYS[due.getDay()])}${suffix}`
      }
      return `${dueDate.slice(5)}${suffix}`
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

    function priorityLabel(priority, t) {
      if (priority === 'high') return t('priorityHigh')
      if (priority === 'medium') return t('priorityMedium')
      if (priority === 'low') return t('priorityLow')
      return priority ?? ''
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
      const [hover, setHover] = useState(false)
      const [titleFocus, setTitleFocus] = useState(false)
      const [checkboxFocus, setCheckboxFocus] = useState(false)
      const today = new Date()
      const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      const late = !item.done && item.dueDate && item.dueDate < todayKey
      // 行本身保持普通 div：按钮的子元素在 ARIA 里是 presentational，行若 role="button"，
      // 里面的 role="checkbox" 读屏就看不到了。鼠标仍点整行选中；键盘走标题与复选框两个独立控件。
      return h('div', {
        style: { ...S.row, background: selected || hover ? 'var(--dsw-alias-interactive-bg-hover)' : 'transparent' },
        onClick: () => onSelect(item.id),
        onMouseEnter: () => setHover(true),
        onMouseLeave: () => setHover(false),
      },
      h('span', {
        role: 'checkbox',
        'aria-checked': item.done ? 'true' : 'false',
        'aria-label': item.title,
        tabIndex: 0,
        style: {
          ...(item.done ? S.cbDone : S.cb),
          outline: 'none',
          boxShadow: checkboxFocus ? FOCUS_RING : 'none',
        },
        onClick: (e) => { e.stopPropagation(); onToggle(item) },
        onFocus: (e) => setCheckboxFocus(focusVisible(e)),
        onBlur: () => setCheckboxFocus(false),
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
        'aria-current': selected ? 'true' : 'false',
        style: {
          ...TITLE_BTN,
          ...(item.done ? S.nmDone : S.nm),
          outline: 'none',
          boxShadow: titleFocus ? FOCUS_RING : 'none',
        },
        onClick: (e) => { e.stopPropagation(); onSelect(item.id) },
        onFocus: (e) => setTitleFocus(focusVisible(e)),
        onBlur: () => setTitleFocus(false),
      }, item.title),
      item.priority ? priorityDot(item.priority) : null,
      item.category ? h('span', { style: S.tag }, item.category) : null,
      item.done && item.doneBy === 'agent' && !item.verifiedAt
        ? h('span', { style: { ...S.tag, color: 'var(--dsw-alias-state-warn-primary)' } }, t('needsReview'))
        : null,
      h('span', { style: late ? S.dueLate : S.due }, item.bucket === 'stale' ? staleLabel(item, t, today) : dueLabel(item)),
      )
    }

    /**
     * 快速添加：输入停顿 200ms 后解析，chips 预览识别结果，回车落库。
     *
     * 两个资源坑都兜住：防抖 timer 在 effect cleanup 里清掉；解析响应回来时
     * 组件可能已经没了（父组件 create 成功后关掉草稿行），所以先用 alive/seq
     * 判断，已卸载组件和过期响应都不 setState。
     *
     * 回车时若防抖结果还没到，会绕过防抖立刻解析一次（手快的人不该丢日期）；
     * 这次即时请求同样占用 seq，旧的防抖响应不会反过来覆盖它。
     */
    function QuickAdd({ t, onCreated }) {
      const [text, setText] = useState('')
      const [parsed, setParsed] = useState(null)
      const [busy, setBusy] = useState(false)

      const alive = useRef(true)
      const seq = useRef(0)

      useEffect(() => {
        alive.current = true
        return () => { alive.current = false }
      }, [])

      useEffect(() => {
        const current = ++seq.current
        // 文本一变，上一次的解析结果立即作废：否则赶在防抖前回车会提交旧标题/旧日期。
        setParsed(null)
        if (text.trim() === '') return
        const timer = window.setTimeout(() => {
          fetchApi('parse', { text }, t)
            .then((result) => {
              if (!alive.current || current !== seq.current) return
              setParsed(result)
            })
            .catch(() => {
              if (!alive.current || current !== seq.current) return
              setParsed(null)
            })
        }, 200)
        return () => window.clearTimeout(timer)
      }, [text, t])

      /** 绕过 200ms 防抖立刻解析；同样走 seq，避免和防抖响应互相覆盖。 */
      const parseNow = async (value) => {
        const current = ++seq.current
        try {
          const result = await fetchApi('parse', { text: value }, t)
          if (!alive.current || current !== seq.current) return null
          setParsed(result)
          return result
        } catch {
          return null
        }
      }

      const submit = async () => {
        if (busy || text.trim() === '') return
        const value = text.trim()
        setBusy(true)
        try {
          // 防抖还没跑完就回车：立即补一次解析，失败才退回 { title }。
          const result = parsed ?? (await parseNow(value))
          // 只挑后端认识的字段：matched 只是本地预览用的，不进创建契约。
          const fields = result === null
            ? { title: value }
            : {
              title: result.title ?? value,
              dueDate: result.dueDate,
              dueTime: result.dueTime,
              priority: result.priority,
              category: result.category,
            }
          const ok = await onCreated(fields)
          // 写失败时保留输入：onCreated 返回 false 就不清空、不收起。
          if (alive.current && ok === true) { setText(''); setParsed(null) }
        } finally {
          if (alive.current) setBusy(false)
        }
      }

      const todayKey = dateKeyOf(new Date())
      const chips = parsed === null ? [] : [
        parsed.dueDate ? formatDueChip(parsed.dueDate, parsed.dueTime, todayKey, t) : null,
        parsed.category ? `#${parsed.category}` : null,
        parsed.priority ? priorityLabel(parsed.priority, t) : null,
      ].filter(Boolean)

      // 纯提示，不跳转、不调模型：只有「有文本但一个片段都没认出来」才出现。
      const showAgentHint = parsed !== null && Array.isArray(parsed.matched) && parsed.matched.length === 0 && text.trim() !== ''

      return h('div', { style: { padding: '6px 8px 10px' } },
        h('input', {
          autoFocus: true, value: text, placeholder: t('addPlaceholder'), 'aria-label': t('addPlaceholder'),
          style: { ...S.search, width: '100%' },
          onChange: (e) => setText(e.target.value),
          onKeyDown: (e) => {
            // 中文输入法选词的回车不是提交：isComposing 期间一律交给 IME。
            if (e.nativeEvent?.isComposing === true) return
            if (e.key === 'Enter') void submit()
            if (e.key === 'Escape') { setText(''); setParsed(null) }
          },
        }),
        chips.length > 0 ? h('div', { style: { display: 'flex', gap: 6, marginTop: 6 } },
          chips.map((chip, index) => h('span', { key: `${index}:${chip}`, style: S.tag }, chip))) : null,
        showAgentHint
          ? h('div', { style: { marginTop: 6, fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' } }, t('agentHint'))
          : null,
      )
    }

    let corruptDismissed = false

    function TodoPage(props) {
      const t = props.t ?? ((key) => dict.zh[key] ?? key)
      const [state, setState] = useState({ loading: true, error: null, items: [], summary: {}, notices: [] })
      const [query, setQuery] = useState('')
      const [selected, setSelected] = useState(null)
      const [draft, setDraft] = useState(null) // null | '' | string
      const [confirming, setConfirming] = useState(false)
      const [doneOpen, setDoneOpen] = useState(false)
      const [noticeHidden, setNoticeHidden] = useState(corruptDismissed)
      const [compactDetail, setCompactDetail] = useState(() => window.innerWidth < 1000)

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
          })
        } catch (err) {
          if (seq !== seqRef.current) return
          console.error('[dsh-todolist] list failed', err)
          setState((prev) => ({ ...prev, loading: false, error: true }))
        }
      }, [query])

      /** 写操作：返回是否成功，调用方（如 QuickAdd）据此决定要不要清空用户输入。 */
      const mutate = useCallback(async (method, payload) => {
        try {
          await fetchApi(method, payload, tRef.current)
          await reload()
          return true
        } catch (err) {
          console.error(`[dsh-todolist] ${method} failed`, err)
          setState((prev) => ({ ...prev, error: true }))
          return false
        }
      }, [reload])

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

      return h('div', { style: S.page },
        h('div', { style: S.head },
          h('h2', { style: S.h1 }, t('title')),
          h('span', { style: S.count }, `${t('today')} ${state.summary.today ?? 0} · ${t('stale')} ${state.summary.stale ?? 0}`),
          h('div', { style: S.grow }),
          h('button', {
            style: S.addBtn,
            onClick: () => { setDraft(''); setSelected(null) },
          }, `+ ${t('new')}`),
          h('input', {
            style: S.search, placeholder: t('search'), value: query,
            onChange: (e) => setQuery(e.target.value),
          }),
        ),
        state.notices.includes('corrupt') && !noticeHidden
          ? h('div', { style: S.warn },
            h('span', { style: { flex: 1 } }, t('corruptNotice')),
            h('button', {
              style: S.noticeClose, 'aria-label': t('dismiss'),
              onClick: () => { corruptDismissed = true; setNoticeHidden(true) },
            }, '×'))
          : null,
        state.error
          ? h('div', { style: S.error }, `${t('failed')}　`, h('button', { onClick: () => void reload() }, t('retry')))
          : null,
        h('div', { style: S.body },
          h('div', { style: S.list },
            draft !== null ? h(QuickAdd, {
              t,
              onCreated: async (fields) => {
                const ok = await mutate('create', fields)
                if (ok) setDraft(null)
                return ok
              },
            }) : null,
            state.loading && items.length === 0
              ? h('div', { style: S.empty }, t('loading'))
              : items.length === 0
                ? (query !== ''
                  ? h('div', { style: S.empty }, t('noMatch'))
                  : h('div', { style: S.empty },
                    h('div', null, t('empty')),
                    h('div', { style: { marginTop: 12 } },
                      h('button', {
                        style: S.addBtn,
                        onClick: () => { setDraft(''); setSelected(null) },
                      }, t('emptyHint')))))
                : h('div', null,
                  openGroups.map((group) => h('div', { key: group.bucket },
                    h('div', { style: S.sec },
                      h('span', { style: S.secT }, t(group.bucket)),
                      h('span', { style: S.secN }, String(group.items.length)),
                      group.bucket === 'stale' ? h('span', { style: { ...S.tag, color: 'var(--dsw-alias-state-error-primary)' } }, t('staleHint')) : null,
                      h('span', { style: S.line }),
                    ),
                    group.items.map((item) => renderRow(item)),
                  )),
                  doneItems.length === 0 ? null : h('div', { key: 'done' },
                    h('button', {
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
                h('div', { style: { fontSize: 15, fontWeight: 600, color: 'var(--dsw-alias-label-primary)', marginBottom: 12 } }, selectedItem.title),
                selectedItem.note ? h('div', { style: { marginBottom: 10, lineHeight: '20px', whiteSpace: 'pre-wrap' } }, selectedItem.note) : null,
                h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 } },
                  selectedItem.priority ? detailRow(t('priority'), priorityLabel(selectedItem.priority, t)) : null,
                  selectedItem.dueDate ? detailRow(t('dueDate'), `${selectedItem.dueDate}${selectedItem.dueTime ? ' ' + selectedItem.dueTime : ''}`) : null,
                  selectedItem.category ? detailRow(t('category'), selectedItem.category) : null,
                  selectedItem.createdAt ? detailRow(t('created'), formatDateTime(selectedItem.createdAt)) : null),
                h('div', { style: { display: 'flex', gap: 8, marginTop: 14 } },
                  h('button', {
                    style: { flex: 1, height: 32, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--dsw-alias-state-business-primary)', color: '#fff', fontSize: 12.5 },
                    onClick: () => void mutate('complete', { id: selectedItem.id, done: !selectedItem.done }),
                  }, selectedItem.done ? t('reopen') : t('complete')),
                  h('button', {
                    style: { flex: 1, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: 12.5, border: '0.5px solid var(--dsw-alias-border-l3)', background: 'transparent', color: confirming ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-label-secondary)' },
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
                      style: { width: '100%', height: 32, marginTop: 8, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--dsw-alias-state-business-primary)', color: 'var(--dsw-alias-label-primary-inverted)', fontSize: 12.5 },
                      onClick: () => void mutate('confirm', { id: selectedItem.id }),
                    }, t('confirmDone'))
                  : null,
              )
              : h('div', { style: { color: 'var(--dsw-alias-label-tertiary)' } }, t('pickOne')),
          ),
        ),
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
