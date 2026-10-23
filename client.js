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
        note: '备注', priority: '优先级', dueDate: '截止日期', dueTime: '时间',
        pickDate: '选择日期', pickTime: '选择时间', clearValue: '清除',
        tomorrowQuick: '明天', nextMonday: '下周一',
        category: '分类', noCategory: '无分类', categoryManage: '管理分类', categoryEmpty: '暂无分类',
        categoryCount: (count) => `${count} 条`,
        rename: '重命名', deleteOne: '删除', confirmDelete: '确认删除',
        saveRename: '保存', cancelRename: '取消',
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
        note: 'Note', priority: 'Priority', dueDate: 'Due date', dueTime: 'Time',
        pickDate: 'Pick a date', pickTime: 'Pick a time', clearValue: 'Clear',
        tomorrowQuick: 'Tomorrow', nextMonday: 'Next Monday',
        category: 'Category', noCategory: 'No category', categoryManage: 'Manage categories', categoryEmpty: 'No categories',
        categoryCount: (count) => `${count} ${count === 1 ? 'item' : 'items'}`,
        rename: 'Rename', deleteOne: 'Delete', confirmDelete: 'Confirm delete',
        saveRename: 'Save', cancelRename: 'Cancel',
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
      // 分类组合框：外框仍是普通 input，下拉是绝对定位的兄弟节点，位置与宽度跟随输入框。
      // 分类字段在弹窗底部，向下展开会被 .td-dialog 的滚动容器裁掉，所以向上弹出。
      // 外观交给 .td-pop，这里只负责定位。
      pop: { position: 'absolute', bottom: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 10, boxSizing: 'border-box' },
      popEmpty: { padding: '8px', fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' },
      popList: { maxHeight: 208, overflowY: 'auto' },
      popItem: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 30, padding: '0 8px', border: 'none', borderRadius: 6, color: 'var(--dsw-alias-label-primary)', fontSize: 12.5, cursor: 'pointer', textAlign: 'left' },
      popCount: { marginLeft: 'auto', flex: 'none', fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' },
      popSep: { height: '0.5px', margin: 4, background: 'var(--dsw-alias-border-l2)' },
      popManage: { display: 'flex', alignItems: 'center', width: '100%', height: 30, padding: '0 8px', border: 'none', borderRadius: 6, color: 'var(--dsw-alias-state-business-primary)', fontSize: 12.5, cursor: 'pointer', textAlign: 'left' },
      comboClear: { position: 'absolute', top: 0, right: 0, width: 30, height: 32, padding: 0, border: 'none', borderRadius: 8, color: 'var(--dsw-alias-label-tertiary)', fontSize: 14, lineHeight: '32px', textAlign: 'center', cursor: 'pointer' },
      // 分类管理弹窗的行：名称吃满剩余宽度，计数与操作靠右。
      catRow: { display: 'flex', alignItems: 'center', gap: 8, minHeight: 34, padding: '0 8px', borderRadius: 6 },
      catName: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 },
      catCount: { flex: 'none', minWidth: 46, textAlign: 'right', fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' },
      catAction: { flex: 'none', height: 26, padding: '0 9px', borderRadius: 6, border: '0.5px solid var(--dsw-alias-border-l3)', color: 'var(--dsw-alias-label-secondary)', fontSize: 11.5, cursor: 'pointer' },
      catSave: { flex: 'none', height: 26, padding: '0 9px', borderRadius: 6, border: 'none', background: 'var(--dsw-alias-state-business-primary)', color: 'var(--dsw-alias-label-primary-inverted)', fontSize: 11.5, cursor: 'pointer' },
      catEmpty: { padding: '18px 8px', textAlign: 'center', fontSize: 12.5, color: 'var(--dsw-alias-label-tertiary)' },
      // 日期 / 时间选择器：触发区是按钮，弹层外观交给 .td-pop，这里只写定位与内部网格。
      pickerTrigger: { width: '100%', height: 32, boxSizing: 'border-box', padding: '0 10px', borderRadius: 8, background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', fontSize: 12.5, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, textAlign: 'left', cursor: 'pointer' },
      pickerPlaceholder: { color: 'var(--dsw-alias-label-tertiary)' },
      pickerIcon: { flex: 'none', fontSize: 10, lineHeight: 1, color: 'var(--dsw-alias-label-tertiary)' },
      pickerPop: { position: 'absolute', left: 0, right: 0, zIndex: 20, boxSizing: 'border-box' },
      pickerPopDown: { top: 'calc(100% + 4px)' },
      pickerPopUp: { bottom: 'calc(100% + 4px)' },
      pickerHead: { display: 'flex', alignItems: 'center', gap: 2, marginBottom: 6 },
      pickerTitle: { flex: 1, minWidth: 0, textAlign: 'center', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', color: 'var(--dsw-alias-label-primary)' },
      pickerIconBtn: { flex: 'none', width: 24, height: 24, padding: 0, border: 'none', borderRadius: 6, color: 'var(--dsw-alias-label-secondary)', fontSize: 15, lineHeight: '24px', textAlign: 'center', cursor: 'pointer' },
      pickerHeadBtn: { flex: 'none', height: 24, padding: '0 8px', border: 'none', borderRadius: 6, color: 'var(--dsw-alias-state-business-primary)', fontSize: 11.5, cursor: 'pointer' },
      pickerQuick: { display: 'flex', gap: 4, marginBottom: 6 },
      pickerQuickBtn: { flex: 1, minWidth: 0, height: 24, padding: 0, border: '0.5px solid var(--dsw-alias-border-l2)', borderRadius: 6, color: 'var(--dsw-alias-label-secondary)', fontSize: 11.5, cursor: 'pointer' },
      pickerWeekdays: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 },
      pickerWeekday: { textAlign: 'center', fontSize: 10.5, lineHeight: '16px', color: 'var(--dsw-alias-label-tertiary)' },
      pickerGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 },
      pickerDay: { height: 24, padding: 0, border: 'none', borderRadius: 6, color: 'var(--dsw-alias-label-primary)', fontSize: 11.5, cursor: 'pointer' },
      pickerDayToday: { boxShadow: 'inset 0 0 0 1px var(--dsw-alias-state-business-primary)' },
      pickerDayOn: { background: 'var(--dsw-alias-state-business-primary)', color: 'var(--dsw-alias-label-primary-inverted)' },
      pickerDayOff: { opacity: 0.45 },
      pickerFoot: { marginTop: 4 },
      pickerClear: { width: '100%', height: 26, padding: 0, border: 'none', borderRadius: 6, color: 'var(--dsw-alias-label-tertiary)', fontSize: 11.5, cursor: 'pointer' },
      timeCols: { display: 'flex', gap: 4 },
      timeList: { flex: 1, minWidth: 0, maxHeight: 180, overflowY: 'auto' },
      timeItem: { width: '100%', height: 28, padding: 0, border: 'none', borderRadius: 6, color: 'var(--dsw-alias-label-primary)', fontSize: 12.5, cursor: 'pointer' },
      timeItemOn: { background: 'var(--dsw-alias-interactive-bg-hover)' },
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

/* 自绘弹层：分类下拉、日期与时间选择器共用同一层外观与入场动画。 */
.td-pop {
  background: var(--dsw-specific-input-major);
  border-radius: var(--dsw-radius-md);
  box-shadow: var(--dsw-elevation-panel);
  padding: 6px;
  transform-origin: top center;
  animation: td-pop-in .13s cubic-bezier(.2,.8,.2,1);
}
.td-pop-up { transform-origin: bottom center; animation-name: td-pop-up-in; }
@keyframes td-pop-in { from { opacity: 0; transform: translateY(-4px) scale(.98) } to { opacity: 1; transform: none } }
@keyframes td-pop-up-in { from { opacity: 0; transform: translateY(4px) scale(.98) } to { opacity: 1; transform: none } }

@media (prefers-reduced-motion: reduce) {
  .td-overlay, .td-dialog, .td-btn, .td-primary, .td-input, .td-row, .td-pop { animation: none; transition: none; }
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

    /** `YYYY-MM-DD` 解析成本地日期；格式或日历值非法时返回 null。 */
    function parseDateKey(key) {
      const text = asText(key)
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
      if (match === null) return null
      const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
      return dateKeyOf(date) === text ? date : null
    }

    /** 6 周 × 7 天，周一起始；返回 42 个 `YYYY-MM-DD`，前后补邻月日期。 */
    function monthGrid(year, month) {
      const first = new Date(year, month, 1)
      const offset = (first.getDay() + 6) % 7
      const start = new Date(year, month, 1 - offset)
      const cells = []
      for (let index = 0; index < 42; index += 1) {
        cells.push(dateKeyOf(new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)))
      }
      return cells
    }

    /** `HH:mm` 拆成小时与分钟字符串；非法时间返回 null。 */
    function splitTimeKey(value) {
      const text = asText(value)
      const match = /^(\d{2}):(\d{2})$/.exec(text)
      if (match === null) return null
      if (Number(match[1]) > 23 || Number(match[2]) > 59) return null
      return { hour: match[1], minute: match[2] }
    }

    // 周标题不占词典键：按界面语言（今天 / Today）在两种窄标签里选一组。
    const WEEKDAY_LABELS = {
      zh: ['一', '二', '三', '四', '五', '六', '日'],
      en: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
    }
    const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'))
    const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0'))

    function weekdayLabels(t) {
      return t('today') === dict.zh.today ? WEEKDAY_LABELS.zh : WEEKDAY_LABELS.en
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

    /** 服务端 categories 返回 `{ items: [{ name, count }] }`；脏数据按空名跳过。 */
    function normalizeCategories(result) {
      const items = result !== null && typeof result === 'object' && Array.isArray(result.items) ? result.items : []
      const rows = []
      for (const item of items) {
        if (item === null || typeof item !== 'object') continue
        const name = asText(item.name)
        if (name === '') continue
        rows.push({ name, count: Number.isInteger(item.count) ? item.count : 0 })
      }
      return rows
    }

    /**
     * 分类组合框：可自由输入新分类，聚焦即展开已有分类（名称 + 条数）。
     * 下拉的定位容器就是 ref 所在的外框，document 上的 pointerdown 据此判断点内还是点外。
     */
    function CategoryCombo({ t, value, categories, onChange, onManage }) {
      const [open, setOpen] = useState(false)
      const wrapRef = useRef(null)

      useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (event) => {
          const wrap = wrapRef.current
          if (wrap !== null && typeof wrap.contains === 'function' && wrap.contains(event.target)) return
          setOpen(false)
        }
        document.addEventListener('pointerdown', onPointerDown)
        return () => document.removeEventListener('pointerdown', onPointerDown)
      }, [open])

      const text = asText(value)
      const needle = text.trim().toLowerCase()
      const visible = needle === ''
        ? categories
        : categories.filter((row) => row.name.toLowerCase().includes(needle))
      const countLabel = t('categoryCount')

      return h('div', {
        ref: wrapRef,
        style: { position: 'relative' },
        // 焦点在输入框或下拉按钮里时，Esc 先收起下拉，再让弹窗的 document 监听看不到这次按键。
        onKeyDown: (event) => {
          if (!open || event.key !== 'Escape') return
          event.stopPropagation?.()
          setOpen(false)
        },
      },
      h('input', {
        className: 'td-input',
        style: text === '' ? S.input : { ...S.input, paddingRight: 32 },
        value: text,
        placeholder: t('noCategory'),
        role: 'combobox',
        'aria-expanded': open ? 'true' : 'false',
        'aria-autocomplete': 'list',
        'aria-label': t('fieldCategory'),
        onFocus: () => setOpen(true),
        onChange: (event) => { onChange(event.target.value); setOpen(true) },
      }),
      text !== ''
        ? h('button', {
            type: 'button',
            className: 'td-btn',
            style: S.comboClear,
            'aria-label': t('noCategory'),
            title: t('noCategory'),
            onClick: () => { onChange(''); setOpen(true) },
          }, '×')
        : null,
      open
        ? h('div', { className: 'td-pop td-pop-up', style: S.pop },
            visible.length === 0
              ? h('div', { style: S.popEmpty }, t('categoryEmpty'))
              : h('div', { style: S.popList }, visible.map((row) => h('button', {
                  key: row.name,
                  type: 'button',
                  className: 'td-btn',
                  style: S.popItem,
                  onClick: () => { onChange(row.name); setOpen(false) },
                },
                h('span', { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, row.name),
                h('span', { style: S.popCount }, typeof countLabel === 'function' ? countLabel(row.count) : `${row.count} ${countLabel}`)))),
            h('div', { style: S.popSep, 'aria-hidden': 'true' }),
            h('button', {
              type: 'button',
              className: 'td-btn',
              style: S.popManage,
              onClick: () => { setOpen(false); onManage?.() },
            }, t('categoryManage')))
        : null)
    }

    /**
     * 日期 / 时间选择器共用的弹层行为：打开时按触发区在视口上下半区决定方向，
     * 打开期间点外部关闭；Esc 交给各字段外框的 onKeyDown，避免连带关掉弹窗。
     */
    function usePickerPopover() {
      const [open, setOpen] = useState(false)
      const [up, setUp] = useState(false)
      const wrapRef = useRef(null)

      const openPopover = useCallback(() => {
        const wrap = wrapRef.current
        const rect = wrap !== null && typeof wrap.getBoundingClientRect === 'function'
          ? wrap.getBoundingClientRect()
          : null
        const viewport = typeof window.innerHeight === 'number' ? window.innerHeight : 0
        setUp(rect !== null && viewport > 0 && rect.top + rect.height / 2 > viewport / 2)
        setOpen(true)
      }, [])

      const closePopover = useCallback(() => setOpen(false), [])

      useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (event) => {
          const wrap = wrapRef.current
          if (wrap !== null && typeof wrap.contains === 'function' && wrap.contains(event.target)) return
          setOpen(false)
        }
        document.addEventListener('pointerdown', onPointerDown)
        return () => document.removeEventListener('pointerdown', onPointerDown)
      }, [open])

      return { open, up, wrapRef, openPopover, closePopover }
    }

    /** 自绘日期选择器：触发区 + 快捷行 + 6×7 月历；点日期、快捷按钮或清除都会关闭。 */
    function DateField({ t, value, onChange }) {
      const picker = usePickerPopover()
      const [cursor, setCursor] = useState(() => {
        const at = parseDateKey(value) ?? new Date()
        return { year: at.getFullYear(), month: at.getMonth() }
      })

      const text = asText(value)
      const todayKey = dateKeyOf(new Date())
      const monthKey = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`
      const cells = monthGrid(cursor.year, cursor.month)
      const weekdays = weekdayLabels(t)

      const monthTitle = (year, month) => `${year} 年 ${month + 1} 月`

      const closeWith = (next) => {
        onChange(next)
        picker.closePopover()
      }

      const open = () => {
        if (picker.open) { picker.closePopover(); return }
        const at = parseDateKey(text) ?? new Date()
        setCursor({ year: at.getFullYear(), month: at.getMonth() })
        picker.openPopover()
      }

      const moveMonth = (delta) => {
        const at = new Date(cursor.year, cursor.month + delta, 1)
        setCursor({ year: at.getFullYear(), month: at.getMonth() })
      }

      const monthAt = (delta) => {
        const at = new Date(cursor.year, cursor.month + delta, 1)
        return monthTitle(at.getFullYear(), at.getMonth())
      }

      const pickDay = (delta) => {
        const at = new Date()
        closeWith(dateKeyOf(new Date(at.getFullYear(), at.getMonth(), at.getDate() + delta)))
      }

      const pickNextMonday = () => {
        const at = new Date()
        const delta = ((1 - at.getDay() + 7) % 7) || 7
        closeWith(dateKeyOf(new Date(at.getFullYear(), at.getMonth(), at.getDate() + delta)))
      }

      return h('div', {
        ref: picker.wrapRef,
        style: { position: 'relative' },
        onKeyDown: (event) => {
          if (!picker.open || event.key !== 'Escape') return
          event.stopPropagation?.()
          picker.closePopover()
        },
      },
      h('button', {
        type: 'button',
        className: 'td-btn td-input',
        style: text === '' ? { ...S.pickerTrigger, ...S.pickerPlaceholder } : S.pickerTrigger,
        'aria-haspopup': 'dialog',
        'aria-expanded': picker.open ? 'true' : 'false',
        'aria-label': t('pickDate'),
        onClick: open,
      },
      h('span', { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, text === '' ? t('pickDate') : text),
      h('span', { style: S.pickerIcon, 'aria-hidden': 'true' }, '▾')),

      picker.open
        ? h('div', {
            className: picker.up ? 'td-pop td-pop-up' : 'td-pop',
            style: { ...S.pickerPop, ...(picker.up ? S.pickerPopUp : S.pickerPopDown) },
            role: 'dialog',
            'aria-label': t('pickDate'),
          },
          h('div', { style: S.pickerHead },
            h('button', {
              type: 'button', className: 'td-btn', style: S.pickerIconBtn,
              'aria-label': monthAt(-1), onClick: () => moveMonth(-1),
            }, '‹'),
            h('span', { style: S.pickerTitle }, monthTitle(cursor.year, cursor.month)),
            h('button', {
              type: 'button', className: 'td-btn', style: S.pickerIconBtn,
              'aria-label': monthAt(1), onClick: () => moveMonth(1),
            }, '›'),
            h('button', {
              type: 'button', className: 'td-btn', style: S.pickerHeadBtn,
              onClick: () => {
                const at = new Date()
                setCursor({ year: at.getFullYear(), month: at.getMonth() })
              },
            }, t('today'))),
          h('div', { style: S.pickerQuick },
            h('button', {
              type: 'button', className: 'td-btn', style: S.pickerQuickBtn,
              onClick: () => pickDay(0),
            }, t('today')),
            h('button', {
              type: 'button', className: 'td-btn', style: S.pickerQuickBtn,
              onClick: () => pickDay(1),
            }, t('tomorrowQuick')),
            h('button', {
              type: 'button', className: 'td-btn', style: S.pickerQuickBtn,
              onClick: pickNextMonday,
            }, t('nextMonday'))),
          h('div', { style: S.pickerWeekdays, 'aria-hidden': 'true' },
            weekdays.map((label, index) => h('div', { key: `${index}`, style: S.pickerWeekday }, label))),
          h('div', { style: S.pickerGrid },
            cells.map((key) => {
              const inMonth = key.slice(0, 7) === monthKey
              const selected = key === text
              return h('button', {
                key,
                type: 'button',
                className: 'td-btn',
                style: {
                  ...S.pickerDay,
                  ...(key === todayKey ? S.pickerDayToday : null),
                  ...(selected ? S.pickerDayOn : null),
                  ...(inMonth ? null : S.pickerDayOff),
                },
                'aria-label': key,
                'aria-pressed': selected ? 'true' : 'false',
                onClick: () => closeWith(key),
              }, String(Number(key.slice(8, 10))))
            })),
          h('div', { style: S.pickerFoot },
            h('button', {
              type: 'button', className: 'td-btn', style: S.pickerClear,
              onClick: () => closeWith(''),
            }, t('clearValue'))))
        : null)
    }

    /** 自绘时间选择器：左右两列可滚动列表，点小时即时高亮但不提交，点分钟才设值并关闭。 */
    function TimeField({ t, value, onChange }) {
      const picker = usePickerPopover()
      const [draftHour, setDraftHour] = useState(null)
      const hourItemRef = useRef(null)
      const minuteItemRef = useRef(null)
      const alive = useRef(true)

      const text = asText(value)
      const parsed = splitTimeKey(text)

      useEffect(() => {
        alive.current = true
        return () => { alive.current = false }
      }, [])

      // 打开后把已选项滚到列表中间；effect 同步执行，卸载后 alive 为 false 不再碰 DOM。
      useEffect(() => {
        if (!picker.open || !alive.current) return
        const hourNode = hourItemRef.current
        if (hourNode !== null && typeof hourNode.scrollIntoView === 'function') hourNode.scrollIntoView({ block: 'center' })
        const minuteNode = minuteItemRef.current
        if (minuteNode !== null && typeof minuteNode.scrollIntoView === 'function') minuteNode.scrollIntoView({ block: 'center' })
      }, [picker.open])

      const open = () => {
        if (picker.open) { picker.closePopover(); return }
        const parts = splitTimeKey(text)
        setDraftHour(parts === null ? null : parts.hour)
        picker.openPopover()
      }

      const closeWith = (next) => {
        onChange(next)
        picker.closePopover()
      }

      const pickMinute = (minute) => {
        const hour = draftHour ?? String(new Date().getHours()).padStart(2, '0')
        closeWith(`${hour}:${minute}`)
      }

      return h('div', {
        ref: picker.wrapRef,
        style: { position: 'relative' },
        onKeyDown: (event) => {
          if (!picker.open || event.key !== 'Escape') return
          event.stopPropagation?.()
          picker.closePopover()
        },
      },
      h('button', {
        type: 'button',
        className: 'td-btn td-input',
        style: text === '' ? { ...S.pickerTrigger, ...S.pickerPlaceholder } : S.pickerTrigger,
        'aria-haspopup': 'dialog',
        'aria-expanded': picker.open ? 'true' : 'false',
        'aria-label': t('pickTime'),
        onClick: open,
      },
      h('span', { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, text === '' ? t('pickTime') : text),
      h('span', { style: S.pickerIcon, 'aria-hidden': 'true' }, '▾')),

      picker.open
        ? h('div', {
            className: picker.up ? 'td-pop td-pop-up' : 'td-pop',
            style: { ...S.pickerPop, ...(picker.up ? S.pickerPopUp : S.pickerPopDown) },
            role: 'dialog',
            'aria-label': t('pickTime'),
          },
          h('div', { style: S.timeCols },
            h('div', { style: S.timeList }, HOUR_OPTIONS.map((hour) => h('button', {
              key: `h-${hour}`,
              type: 'button',
              className: 'td-btn',
              ref: hour === draftHour ? hourItemRef : null,
              style: hour === draftHour ? { ...S.timeItem, ...S.timeItemOn } : S.timeItem,
              'aria-pressed': hour === draftHour ? 'true' : 'false',
              onClick: () => setDraftHour(hour),
            }, hour))),
            h('div', { style: S.timeList }, MINUTE_OPTIONS.map((minute) => h('button', {
              key: `m-${minute}`,
              type: 'button',
              className: 'td-btn',
              ref: parsed !== null && minute === parsed.minute ? minuteItemRef : null,
              style: parsed !== null && minute === parsed.minute ? { ...S.timeItem, ...S.timeItemOn } : S.timeItem,
              'aria-pressed': parsed !== null && minute === parsed.minute ? 'true' : 'false',
              onClick: () => pickMinute(minute),
            }, minute)))),
          h('div', { style: S.popSep, 'aria-hidden': 'true' }),
          h('button', {
            type: 'button', className: 'td-btn', style: S.pickerClear,
            onClick: () => closeWith(''),
          }, t('clearValue')))
        : null)
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
      h('span', {
        'aria-hidden': 'true',
        style: {
          width: 3, height: 18, borderRadius: 2, flex: 'none',
          background: item.priority ? priorityColor(item.priority) : 'transparent',
        },
      }),
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
    function TodoDialog({ t, initial, mutate, onClose, onSaved, onManageCategories, escSuspended }) {
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
      // 分类候选只在弹窗打开时拉一次；保存后页面自己会刷新，下一次开窗再拉。
      const [categoryRows, setCategoryRows] = useState([])

      const alive = useRef(true)
      const seq = useRef(0)
      const closeRef = useRef(onClose)

      useEffect(() => {
        alive.current = true
        return () => { alive.current = false }
      }, [])

      useEffect(() => { closeRef.current = onClose }, [onClose])

      // 分类条数与名称由服务端统计；失败不阻塞表单，下拉退化成「暂无分类」。
      useEffect(() => {
        let cancelled = false
        fetchApi('categories', {}, t)
          .then((result) => {
            if (cancelled || !alive.current) return
            setCategoryRows(normalizeCategories(result))
          })
          .catch((err) => console.error('[dsh-todolist] categories failed', err))
        return () => { cancelled = true }
      }, [])

      // 弹窗打开期间才监听 Esc；分类管理弹窗叠在上面时由它自己接管，避免 Esc 一次关两层。
      useEffect(() => {
        if (escSuspended) return undefined
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return
          event.stopPropagation?.()
          closeRef.current()
        }
        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
      }, [escSuspended])

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
          h('div', { style: S.field },
            h('span', { style: S.fieldLabel }, t('fieldDate')),
            h(DateField, {
              t,
              value: form.dueDate,
              onChange: (next) => setForm((prev) => ({ ...prev, dueDate: next })),
            })),
          h('div', { style: S.field },
            h('span', { style: S.fieldLabel }, t('fieldTime')),
            h(TimeField, {
              t,
              value: form.dueTime,
              onChange: (next) => setForm((prev) => ({ ...prev, dueTime: next })),
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

        h('div', { style: S.field },
          h('span', { style: S.fieldLabel }, t('fieldCategory')),
          h(CategoryCombo, {
            t,
            value: form.category,
            categories: categoryRows,
            onChange: (next) => setForm((prev) => ({ ...prev, category: next })),
            onManage: onManageCategories,
          })),

        error !== null ? h('div', { style: S.dialogError }, error) : null,
        h('div', { style: S.dialogFoot },
          h('button', { type: 'button', className: 'td-btn', style: S.btnGhost, onClick: onClose, disabled: saving }, t('cancel')),
          h('button', { type: 'button', className: 'td-primary', style: S.btnPrimary, onClick: () => void submit(), disabled: saving }, t('save'))),
      ))
    }

    /**
     * 分类管理弹窗：行内改名、两段式删除；写成功后先刷新页面列表，再重拉分类计数。
     * 入口有两处：页头「分类」按钮，以及新建 / 编辑弹窗分类下拉底部的「管理分类」。
     */
    function CategoryDialog({ t, onClose, onChanged }) {
      const [rows, setRows] = useState(null)
      const [loadFailed, setLoadFailed] = useState(false)
      const [editing, setEditing] = useState(null)
      const [confirming, setConfirming] = useState(null)
      const [saving, setSaving] = useState(false)
      const [error, setError] = useState(null)

      const alive = useRef(true)
      const closeRef = useRef(onClose)
      const tRef = useRef(t)
      const confirmTimer = useRef(null)

      useEffect(() => { tRef.current = t }, [t])

      const clearConfirmTimer = useCallback(() => {
        if (confirmTimer.current !== null) {
          window.clearTimeout(confirmTimer.current)
          confirmTimer.current = null
        }
      }, [])

      useEffect(() => {
        alive.current = true
        return () => {
          alive.current = false
          clearConfirmTimer()
        }
      }, [clearConfirmTimer])

      useEffect(() => { closeRef.current = onClose }, [onClose])

      const load = useCallback(async () => {
        try {
          const result = await fetchApi('categories', {}, tRef.current)
          if (!alive.current) return
          setRows(normalizeCategories(result))
          setLoadFailed(false)
        } catch (err) {
          if (!alive.current) return
          console.error('[dsh-todolist] categories failed', err)
          setRows([])
          setLoadFailed(true)
        }
      }, [])

      useEffect(() => { void load() }, [load])

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

      /** 先刷新页面（行上的分类标签），再重拉弹窗自己的名称与计数。 */
      const refreshAfterWrite = useCallback(async () => {
        await onChanged?.()
        await load()
      }, [load, onChanged])

      const startRename = (name) => {
        clearConfirmTimer()
        setConfirming(null)
        setError(null)
        setEditing({ from: name, value: name })
      }

      const submitRename = async () => {
        if (editing === null || saving) return
        const to = editing.value.trim()
        if (to === '') return
        if (to === editing.from) { setEditing(null); return }
        setSaving(true)
        setError(null)
        try {
          await fetchApi('renameCategory', { from: editing.from, to }, tRef.current)
          if (!alive.current) return
          setEditing(null)
          await refreshAfterWrite()
        } catch (err) {
          if (!alive.current) return
          setError(err instanceof Error && err.message ? err.message : tRef.current('requestFailed'))
        } finally {
          if (alive.current) setSaving(false)
        }
      }

      const requestDelete = async (name) => {
        if (saving) return
        setError(null)
        if (confirming !== name) {
          clearConfirmTimer()
          setEditing(null)
          setConfirming(name)
          confirmTimer.current = window.setTimeout(() => {
            confirmTimer.current = null
            setConfirming(null)
          }, 3000)
          return
        }
        clearConfirmTimer()
        setConfirming(null)
        setSaving(true)
        try {
          await fetchApi('clearCategory', { name }, tRef.current)
          if (!alive.current) return
          setEditing(null)
          await refreshAfterWrite()
        } catch (err) {
          if (!alive.current) return
          setError(err instanceof Error && err.message ? err.message : tRef.current('requestFailed'))
        } finally {
          if (alive.current) setSaving(false)
        }
      }

      const countLabel = t('categoryCount')

      return h('div', {
        className: 'td-overlay',
        style: S.overlay,
        onClick: (event) => { if (event.target === event.currentTarget) onClose() },
      },
      h('div', { className: 'td-dialog', style: S.dialog, role: 'dialog', 'aria-modal': 'true', 'aria-label': t('category') },
        h('div', { style: S.dialogHead }, t('category')),
        loadFailed ? h('div', { style: S.dialogError }, t('failed')) : null,
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 320, overflowY: 'auto', marginTop: 4 } },
          rows === null
            ? h('div', { style: S.catEmpty }, t('loading'))
            : rows.length === 0
              ? h('div', { style: S.catEmpty }, t('categoryEmpty'))
              : rows.map((row) => {
                  const renaming = editing !== null && editing.from === row.name
                  const confirmingThis = confirming === row.name
                  return h('div', { key: row.name, className: 'td-row', style: S.catRow },
                    renaming
                      ? h('input', {
                          className: 'td-input',
                          autoFocus: true,
                          style: { ...S.input, height: 28, flex: 1, minWidth: 0 },
                          value: editing.value,
                          'aria-label': t('rename'),
                          onChange: (event) => setEditing((prev) => (prev === null ? prev : { ...prev, value: event.target.value })),
                          onKeyDown: (event) => {
                            if (event.nativeEvent?.isComposing === true) return
                            if (event.key === 'Enter') { event.preventDefault?.(); void submitRename() }
                            if (event.key === 'Escape') { event.preventDefault?.(); event.stopPropagation?.(); setEditing(null) }
                          },
                        })
                      : h('span', { style: S.catName }, row.name),
                    h('span', { style: S.catCount }, typeof countLabel === 'function' ? countLabel(row.count) : `${row.count} ${countLabel}`),
                    renaming
                      ? [
                          h('button', {
                            key: 'save',
                            type: 'button',
                            className: 'td-btn td-primary',
                            style: S.catSave,
                            disabled: saving || editing.value.trim() === '',
                            onClick: () => void submitRename(),
                          }, t('saveRename')),
                          h('button', {
                            key: 'cancel',
                            type: 'button',
                            className: 'td-btn',
                            style: S.catAction,
                            disabled: saving,
                            onClick: () => setEditing(null),
                          }, t('cancelRename')),
                        ]
                      : [
                          h('button', {
                            key: 'rename',
                            type: 'button',
                            className: 'td-btn',
                            style: S.catAction,
                            disabled: saving,
                            onClick: () => startRename(row.name),
                          }, t('rename')),
                          h('button', {
                            key: 'delete',
                            type: 'button',
                            className: 'td-btn',
                            style: confirmingThis
                              ? { ...S.catAction, color: 'var(--dsw-alias-state-error-primary)', borderColor: 'var(--dsw-alias-state-error-primary)' }
                              : S.catAction,
                            disabled: saving,
                            onClick: () => void requestDelete(row.name),
                          }, confirmingThis ? t('confirmDelete') : t('deleteOne')),
                        ],
                  )
                }),
        ),
        error !== null ? h('div', { style: S.dialogError }, error) : null,
        h('div', { style: S.dialogFoot },
          h('button', { type: 'button', className: 'td-btn', style: S.btnGhost, onClick: onClose }, t('dismiss'))),
      ))
    }

    let corruptDismissed = false

    function TodoPage(props) {
      const t = props.t ?? ((key) => dict.zh[key] ?? key)
      const [state, setState] = useState({ loading: true, error: null, items: [], summary: {}, notices: [], staleDays: 7 })
      const [query, setQuery] = useState('')
      const [selected, setSelected] = useState(null)
      const [dialog, setDialog] = useState(null)
      const [categoryOpen, setCategoryOpen] = useState(false)
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
          h('button', {
            className: 'td-btn',
            style: S.addBtn,
            onClick: () => setCategoryOpen(true),
          }, t('category')),
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
              mutate,
              onClose: () => setDialog(null),
              onSaved: () => setDialog(null),
              onManageCategories: () => setCategoryOpen(true),
              escSuspended: categoryOpen,
            })
          : null,
        categoryOpen
          ? h(CategoryDialog, {
              t,
              onClose: () => setCategoryOpen(false),
              onChanged: reload,
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
