window.__ModuleLoader__.load({
  id: 'dsh-todolist',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useCallback } = React

    const NS = 'dsh-todolist'
    const dict = {
      zh: {
        nav: '待办', title: '待办', new: '新建', search: '搜索待办',
        today: '今天', tomorrow: '明天', week: '本周', stale: '积压',
        unplanned: '未排期', done: '已完成', empty: '还没有待办',
        staleHint: '超过 7 天未完成', loading: '加载中…', failed: '读取失败',
        retry: '重试', pickOne: '选一条看详情',
        corruptNotice: '数据文件损坏，已备份并以空清单启动',
      },
      en: {
        nav: 'To-do', title: 'To-do', new: 'New', search: 'Search',
        today: 'Today', tomorrow: 'Tomorrow', week: 'This week', stale: 'Backlog',
        unplanned: 'Unscheduled', done: 'Completed', empty: 'No todos yet',
        staleHint: 'Open for more than 7 days', loading: 'Loading…', failed: 'Failed to load',
        retry: 'Retry', pickOne: 'Select an item',
        corruptNotice: 'Data file was corrupt; it is backed up and the list started empty.',
      },
    }
    const ORDER = ['today', 'tomorrow', 'week', 'stale', 'unplanned', 'done']

    function apiUrl(method) {
      return new URL(`todo/api/${method}`, document.baseURI).href
    }

    async function fetchApi(method, payload) {
      const res = await fetch(apiUrl(method), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload ?? {}),
      })
      const body = await res.json().catch(() => ({ ok: false, error: { message: '响应不是 JSON' } }))
      if (!body.ok) throw new Error(body.error?.message ?? '请求失败')
      return body.result
    }

    const S = {
      page: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, color: 'var(--dsw-alias-label-primary)' },
      head: { display: 'flex', alignItems: 'center', gap: 10, height: 56, padding: '0 20px', flex: 'none', borderBottom: '0.5px solid var(--dsw-alias-border-l2)' },
      h1: { fontSize: 17, fontWeight: 600, margin: 0 },
      count: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' },
      grow: { flex: 1 },
      search: { width: 200, height: 32, padding: '0 10px', borderRadius: 8, border: 'none', fontSize: 12.5, background: 'var(--dsw-alias-bg-module-platform)', color: 'var(--dsw-alias-label-primary)' },
      body: { display: 'flex', flex: 1, minHeight: 0 },
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
      detail: { width: 300, flex: 'none', borderLeft: '0.5px solid var(--dsw-alias-border-l2)', padding: 16, fontSize: 12.5, color: 'var(--dsw-alias-label-secondary)' },
      empty: { padding: 40, textAlign: 'center', color: 'var(--dsw-alias-label-tertiary)', fontSize: 13 },
      error: { margin: 12, padding: '8px 12px', borderRadius: 8, fontSize: 12, color: 'var(--dsw-alias-state-error-primary)', background: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent)' },
      warn: { margin: 12, padding: '8px 12px', borderRadius: 8, fontSize: 12, color: 'var(--dsw-alias-state-warn-primary)', background: 'color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, transparent)' },
    }

    function priorityDot(priority) {
      const bg = priority === 'high' ? 'var(--dsw-alias-state-error-primary)'
        : priority === 'medium' ? 'var(--dsw-alias-state-warn-primary)'
          : priority === 'low' ? 'var(--dsw-static-blue-450)' : 'transparent'
      return h('span', { style: { width: 5, height: 5, borderRadius: '50%', background: bg, flex: 'none' } })
    }

    function dueLabel(item) {
      if (!item.dueDate) return ''
      if (item.dueTime) return `${item.dueDate.slice(5)} ${item.dueTime}`
      return item.dueDate.slice(5)
    }

    function Row({ item, selected, onSelect, t }) {
      const today = new Date()
      const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      const late = !item.done && item.dueDate && item.dueDate < todayKey
      return h('div', {
        style: { ...S.row, background: selected ? 'var(--dsw-alias-interactive-bg-hover)' : 'transparent' },
        onClick: () => onSelect(item.id),
        onMouseEnter: (e) => { if (!selected) e.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover)' },
        onMouseLeave: (e) => { if (!selected) e.currentTarget.style.background = 'transparent' },
      },
      item.done
        ? h('span', { style: S.cbDone }, h('svg', { width: 9, height: 9, viewBox: '0 0 16 16', fill: 'none', stroke: '#fff', strokeWidth: 2.4 }, h('path', { d: 'M3.4 8.4 6.2 11l6.4-6.4', strokeLinecap: 'round', strokeLinejoin: 'round' })))
        : h('span', { style: S.cb }),
      h('span', { style: item.done ? S.nmDone : S.nm }, item.title),
      item.priority ? priorityDot(item.priority) : null,
      item.category ? h('span', { style: S.tag }, item.category) : null,
      h('span', { style: late ? S.dueLate : S.due }, item.bucket === 'stale' ? `${t('stale')} ${item.dueDate ?? ''}`.trim() : dueLabel(item)),
      )
    }

    function TodoPage(props) {
      const t = props.t ?? ((key) => dict.zh[key] ?? key)
      const [state, setState] = useState({ loading: true, error: null, items: [], summary: {}, notices: [] })
      const [query, setQuery] = useState('')
      const [selected, setSelected] = useState(null)

      const reload = useCallback(async () => {
        try {
          const result = await fetchApi('list', query ? { q: query } : {})
          setState({ loading: false, error: null, items: result.items, summary: result.summary, notices: result.notices ?? [] })
        } catch (err) {
          setState((prev) => ({ ...prev, loading: false, error: err.message }))
        }
      }, [query])

      useEffect(() => { void reload() }, [reload])

      useEffect(() => {
        const timer = window.setInterval(() => { void reload() }, 2500)
        return () => window.clearInterval(timer)
      }, [reload])

      const groups = ORDER
        .map((bucket) => ({ bucket, items: state.items.filter((item) => item.bucket === bucket) }))
        .filter((group) => group.items.length > 0)
      const selectedItem = state.items.find((item) => item.id === selected) ?? null

      return h('div', { style: S.page },
        h('div', { style: S.head },
          h('h2', { style: S.h1 }, t('title')),
          h('span', { style: S.count }, `${t('today')} ${state.summary.today ?? 0} · ${t('stale')} ${state.summary.stale ?? 0}`),
          h('div', { style: S.grow }),
          h('input', {
            style: S.search, placeholder: t('search'), value: query,
            onChange: (e) => setQuery(e.target.value),
          }),
        ),
        state.notices.includes('corrupt') ? h('div', { style: S.warn }, t('corruptNotice')) : null,
        state.error ? h('div', { style: S.error }, `${t('failed')}：${state.error}　`, h('button', { onClick: () => void reload() }, t('retry'))) : null,
        h('div', { style: S.body },
          h('div', { style: S.list },
            state.loading && state.items.length === 0
              ? h('div', { style: S.empty }, t('loading'))
              : groups.length === 0
                ? h('div', { style: S.empty }, t('empty'))
                : groups.map((group) => h('div', { key: group.bucket },
                  h('div', { style: S.sec },
                    h('span', { style: S.secT }, t(group.bucket)),
                    h('span', { style: S.secN }, String(group.items.length)),
                    group.bucket === 'stale' ? h('span', { style: { ...S.tag, color: 'var(--dsw-alias-state-error-primary)' } }, t('staleHint')) : null,
                    h('span', { style: S.line }),
                  ),
                  group.items.map((item) => h(Row, {
                    key: item.id, item, t,
                    selected: item.id === selected,
                    onSelect: setSelected,
                  })),
                )),
          ),
          h('div', { style: S.detail },
            selectedItem
              ? h('div', null,
                h('div', { style: { fontSize: 15, fontWeight: 600, color: 'var(--dsw-alias-label-primary)', marginBottom: 12 } }, selectedItem.title),
                selectedItem.note ? h('div', { style: { marginBottom: 10, lineHeight: '20px' } }, selectedItem.note) : null,
                h('div', { style: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 12 } },
                  [
                    selectedItem.priority ? `优先级 ${selectedItem.priority}` : null,
                    selectedItem.dueDate ? `截止 ${selectedItem.dueDate}${selectedItem.dueTime ? ' ' + selectedItem.dueTime : ''}` : null,
                    selectedItem.category ? selectedItem.category : null,
                  ].filter(Boolean).join(' · ')),
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
