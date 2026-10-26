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
        today: '今天', overdue: '逾期', tomorrow: '明天', week: '本周', month: '本月', later: '以后', stale: '积压',
        unplanned: '未排期', done: '已完成', doneEmpty: '该范围内没有完成记录', empty: '还没有待办',
        staleHint: '超过 {n} 天未完成', loading: '加载中…', failed: '读取失败',
        actionFailed: '操作失败，请重试',
        retry: '重试', pickOne: '选一条看详情',
        listView: '列表', calendarView: '日历', prevMonth: '上个月', nextMonth: '下个月',
        nothingThatDay: '这一天没有安排', plansOnDay: (date) => `${date} 的安排`, newOnThatDay: '在这一天新建',
        corruptNotice: '数据文件损坏，已备份并以空清单启动',
        writeNotice: '有改动尚未写入磁盘', retryWrite: '重试写入',
        save: '保存', cancel: '取消',
        complete: '完成', reopen: '撤销完成', remove: '删除', confirmRemove: '确认删除', edit: '编辑',
        needsReview: '待确认', confirmDone: '确认已完成',
        note: '备注', priority: '优先级', dueDate: '截止日期', dueTime: '时间',
        pickDate: '选择日期', pickTime: '选择时间', clearValue: '清除',
        hourShort: '时', minuteShort: '分',
        tomorrowQuick: '明天', nextMonday: '下周一',
        category: '分类', noCategory: '无分类', categoryManage: '管理分类', categoryEmpty: '暂无分类',
        categoryCount: (count) => `${count} 条`,
        categoryHint: '分类不是预先设定的：它来自待办里填写的分类名，某条待办写了新名字，这里就会多一个。删掉一个分类，会让它的待办回到「无分类」。',
        rename: '重命名', deleteOne: '删除', confirmDelete: '确认删除',
        saveRename: '保存', cancelRename: '取消',
        dialogNew: '新建待办', dialogEdit: '编辑待办',
        fieldTitle: '标题', fieldNote: '备注', fieldDate: '日期', fieldTime: '时间',
        fieldPriority: '优先级', fieldCategory: '分类',
        fieldRepeat: '重复', repeatNone: '不循环', repeatDaily: '每天', repeatWeekly: '每周', repeatMonthly: '每月',
        fieldWeekdays: '星期', fieldMonthDay: '每月几号', fieldUntil: '结束日期',
        weekdaysRequired: '每周至少选一天',
        mon: '一', tue: '二', wed: '三', thu: '四', fri: '五', sat: '六', sun: '日',
        repeatBadge: '循环',
        completeOccurrence: '完成本次', lastCompleted: '上次完成', neverCompleted: '尚未完成过',
        completedTimes: '已完成 {n} 次', seriesEnded: '循环已结束',
        completedOn: '完成于', recurringDoneSection: '循环任务完成',
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
        today: 'Today', overdue: 'Overdue', tomorrow: 'Tomorrow', week: 'This week', month: 'This month', later: 'Later', stale: 'Backlog',
        unplanned: 'Unscheduled', done: 'Completed', doneEmpty: 'No completions in this range', empty: 'No todos yet',
        staleHint: 'Open for more than {n} days', loading: 'Loading…', failed: 'Failed to load',
        actionFailed: 'Action failed, please retry',
        retry: 'Retry', pickOne: 'Select an item',
        listView: 'List', calendarView: 'Calendar', prevMonth: 'Previous month', nextMonth: 'Next month',
        nothingThatDay: 'Nothing planned for this day', plansOnDay: (date) => `Plans on ${date}`, newOnThatDay: 'New on this day',
        corruptNotice: 'Data file was corrupt; it is backed up and the list started empty.',
        writeNotice: 'Some changes are not on disk yet', retryWrite: 'Retry write',
        save: 'Save', cancel: 'Cancel',
        complete: 'Complete', reopen: 'Reopen', remove: 'Delete', confirmRemove: 'Confirm delete', edit: 'Edit',
        needsReview: 'Needs review', confirmDone: 'Confirm done',
        note: 'Note', priority: 'Priority', dueDate: 'Due date', dueTime: 'Time',
        pickDate: 'Pick a date', pickTime: 'Pick a time', clearValue: 'Clear',
        hourShort: 'Hr', minuteShort: 'Min',
        tomorrowQuick: 'Tomorrow', nextMonday: 'Next Monday',
        category: 'Category', noCategory: 'No category', categoryManage: 'Manage categories', categoryEmpty: 'No categories',
        categoryCount: (count) => `${count} ${count === 1 ? 'item' : 'items'}`,
        categoryHint: 'Categories are not predefined: they come from the category names entered on todos, so a new name adds one here. Deleting a category moves its todos back to "No category".',
        rename: 'Rename', deleteOne: 'Delete', confirmDelete: 'Confirm delete',
        saveRename: 'Save', cancelRename: 'Cancel',
        dialogNew: 'New todo', dialogEdit: 'Edit todo',
        fieldTitle: 'Title', fieldNote: 'Note', fieldDate: 'Date', fieldTime: 'Time',
        fieldPriority: 'Priority', fieldCategory: 'Category',
        fieldRepeat: 'Repeat', repeatNone: 'Never', repeatDaily: 'Daily', repeatWeekly: 'Weekly', repeatMonthly: 'Monthly',
        fieldWeekdays: 'Weekdays', fieldMonthDay: 'Day of month', fieldUntil: 'Until',
        weekdaysRequired: 'Pick at least one weekday',
        mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
        repeatBadge: 'Repeats',
        completeOccurrence: 'Complete this one', lastCompleted: 'Last completed', neverCompleted: 'Never completed',
        completedTimes: 'Completed {n} times', seriesEnded: 'Series ended',
        completedOn: 'Completed on', recurringDoneSection: 'Recurring completions',
        quickFill: 'Quick fill, e.g. "tomorrow 3pm report #work"',
        quickHint: 'You can fill in just the title and ask me in chat to set the date later.', titleRequired: 'Title is required',
        emptyHint: 'Create the first one',
        yesterday: 'Yesterday', earlier: 'Earlier', created: 'Created',
        noMatch: 'No matching todos', staleFor: 'Open {n} days',
        priorityHigh: 'High', priorityMedium: 'Medium', priorityLow: 'Low',
        badResponse: 'Unexpected response', requestFailed: 'Request failed', dismiss: 'Dismiss',
      },
    }
    const ORDER = ['overdue', 'today', 'tomorrow', 'week', 'later', 'stale', 'unplanned', 'done']

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
      // 14×14 的方块太小，点在边缘会落到整行上（表现为“勾了没反应”）。
      // 外层热区用 6px padding 扩到约 26×26，再用 -6px margin 把布局占位收回 14px；
      // 不设 background，视觉仍是原来的小方块。
      cbHit: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 6, margin: -6, flex: 'none', cursor: 'pointer' },
      nm: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13.5 },
      nmDone: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13.5, color: 'var(--dsw-alias-label-tertiary)', textDecoration: 'line-through' },
      tag: { fontSize: 10.5, padding: '0 6px', borderRadius: 4, color: 'var(--dsw-alias-label-secondary)', background: 'var(--dsw-alias-bg-module-platform)', flex: 'none' },
      repeatBadge: { fontSize: 12, lineHeight: '18px', padding: '0 6px', borderRadius: 4, color: 'var(--dsw-alias-label-secondary)', background: 'var(--dsw-alias-bg-module-platform)', flex: 'none' },
      due: { fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', flex: 'none', minWidth: 52, textAlign: 'right' },
      dueLate: { fontSize: 11, color: 'var(--dsw-alias-state-error-primary)', flex: 'none', minWidth: 52, textAlign: 'right' },
      detail: { width: 380, flex: 'none', borderLeft: '0.5px solid var(--dsw-alias-border-l2)', padding: 16, fontSize: 12.5, color: 'var(--dsw-alias-label-secondary)' },
      empty: { padding: 40, textAlign: 'center', color: 'var(--dsw-alias-label-tertiary)', fontSize: 13 },
      error: { margin: 12, padding: '8px 12px', borderRadius: 8, fontSize: 12, color: 'var(--dsw-alias-state-error-primary)', background: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent)' },
      warn: { margin: 12, padding: '8px 12px', borderRadius: 8, fontSize: 12, color: 'var(--dsw-alias-state-warn-primary)', background: 'color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, transparent)', display: 'flex', alignItems: 'center', gap: 8 },
      addBtn: { height: 32, padding: '0 12px', borderRadius: 8, border: '0.5px solid var(--dsw-alias-border-l3)', color: 'var(--dsw-alias-label-primary)', fontSize: 13, cursor: 'pointer' },
      overlay: { position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--dsw-alias-bg-mask-1)' },
      dialog: { width: 560, maxWidth: 'calc(100vw - 32px)', maxHeight: '82vh', overflowY: 'auto', boxSizing: 'border-box', padding: '22px 24px 18px', background: 'var(--dsw-specific-input-major)', borderRadius: 'var(--dsw-radius-xl)', boxShadow: 'var(--dsw-elevation-panel)', color: 'var(--dsw-alias-label-primary)' },
      dialogHead: { fontSize: 15, fontWeight: 600, marginBottom: 12 },
      hint: { marginTop: 6, fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' },
      field: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, marginBottom: 10 },
      fieldRow: { display: 'flex', gap: 12 },
      fieldLabel: { fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)' },
      input: { width: '100%', height: 32, boxSizing: 'border-box', padding: '0 10px', borderRadius: 8, background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', fontSize: 12.5, fontFamily: 'inherit' },
      textarea: { width: '100%', height: 64, boxSizing: 'border-box', padding: '7px 10px', borderRadius: 8, background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', fontSize: 12.5, fontFamily: 'inherit', lineHeight: '18px', resize: 'vertical' },
      seg: { display: 'flex', gap: 6 },
      segItem: { flex: 1, height: 30, borderRadius: 6, border: '0.5px solid var(--dsw-alias-border-l3)', color: 'var(--dsw-alias-label-secondary)', fontSize: 12.5, cursor: 'pointer' },
      segItemOn: { border: '0.5px solid transparent', background: 'var(--dsw-alias-state-business-primary)', color: 'var(--dsw-alias-label-primary-inverted)' },
      dialogError: { marginTop: 4, padding: '6px 10px', borderRadius: 6, fontSize: 12, color: 'var(--dsw-alias-state-error-primary)', background: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent)' },
      dialogFoot: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
      btnGhost: { height: 32, padding: '0 14px', borderRadius: 8, border: '0.5px solid var(--dsw-alias-border-l3)', color: 'var(--dsw-alias-label-secondary)', fontSize: 12.5, cursor: 'pointer' },
      btnPrimary: { height: 32, padding: '0 14px', borderRadius: 8, border: 'none', background: 'var(--dsw-alias-state-business-primary)', color: 'var(--dsw-alias-label-primary-inverted)', fontSize: 12.5, cursor: 'pointer' },
      noticeClose: { flex: 'none', width: 20, height: 20, padding: 0, lineHeight: '18px', textAlign: 'center', border: 'none', borderRadius: 4, color: 'inherit', fontSize: 14, cursor: 'pointer' },
      // 「已完成」标题行：标题 + 计数是折叠开关，右侧是范围分段控件，末尾箭头同样可折叠。
      doneHead: { display: 'flex', alignItems: 'center', gap: 8, height: 30, padding: '0 8px', marginTop: 6 },
      doneToggle: { display: 'flex', alignItems: 'center', gap: 8, flex: 'none', minWidth: 0, padding: 0, border: 'none', color: 'inherit', cursor: 'pointer', textAlign: 'left' },
      doneRange: { display: 'flex', alignItems: 'center', gap: 4, flex: 'none' },
      doneRangeItem: { height: 22, padding: '0 7px', borderRadius: 5, border: '0.5px solid var(--dsw-alias-border-l3)', color: 'var(--dsw-alias-label-secondary)', fontSize: 11.5, lineHeight: '20px', cursor: 'pointer' },
      doneRangeItemOn: { border: '0.5px solid transparent', background: 'var(--dsw-alias-state-business-primary)', color: 'var(--dsw-alias-label-primary-inverted)' },
      doneArrow: { flex: 'none', padding: '0 2px', border: 'none', color: 'var(--dsw-alias-label-tertiary)', fontSize: 10, lineHeight: '18px', cursor: 'pointer' },
      doneEmpty: { padding: '2px 8px 4px 16px', fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' },
      subsec: { display: 'flex', alignItems: 'center', gap: 8, height: 26, padding: '0 8px 0 16px', marginTop: 2 },
      // 分类组合框：外框仍是普通 input，下拉是同一 React 树里的兄弟节点；
      // 定位交给 useAnchoredPopover（position: fixed，视口坐标），外观交给 .td-pop。
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
      catHint: { marginTop: 0, marginBottom: 10, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' },
      // 日期 / 时间选择器：触发区是按钮；弹层外观在 .td-pop，固定宽度与纵向间距在 .td-picker，
      // 定位统一交给 useAnchoredPopover，这里只写触发区、弹层内部的网格与列表。
      pickerTrigger: { width: '100%', height: 32, boxSizing: 'border-box', padding: '0 10px', borderRadius: 8, background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', fontSize: 13, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, textAlign: 'left', cursor: 'pointer' },
      pickerPlaceholder: { color: 'var(--dsw-alias-label-tertiary)' },
      pickerIcon: { flex: 'none', fontSize: 10, lineHeight: 1, color: 'var(--dsw-alias-label-tertiary)' },
      pickerHead: { display: 'flex', alignItems: 'center', gap: 2, height: 28 },
      pickerTitle: { flex: 1, minWidth: 0, textAlign: 'center', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', color: 'var(--dsw-alias-label-primary)' },
      pickerIconBtn: { flex: 'none', width: 26, height: 26, padding: 0, border: 'none', borderRadius: 6, color: 'var(--dsw-alias-label-secondary)', fontSize: 15, lineHeight: '26px', textAlign: 'center', cursor: 'pointer' },
      pickerQuick: { display: 'flex', gap: 6 },
      pickerQuickBtn: { flex: 1, minWidth: 0, height: 26, padding: 0, border: '0.5px solid var(--dsw-alias-border-l2)', borderRadius: 6, color: 'var(--dsw-alias-label-secondary)', fontSize: 12, textAlign: 'center', cursor: 'pointer' },
      pickerWeekdays: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 },
      pickerWeekday: { textAlign: 'center', fontSize: 12, lineHeight: '16px', color: 'var(--dsw-alias-label-tertiary)' },
      pickerGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 },
      pickerDay: { height: 30, padding: 0, border: 'none', borderRadius: 6, color: 'var(--dsw-alias-label-primary)', fontSize: 13, textAlign: 'center', cursor: 'pointer' },
      pickerDayToday: { boxShadow: 'inset 0 0 0 1px var(--dsw-alias-state-business-primary)' },
      pickerDayOn: { background: 'var(--dsw-alias-state-business-primary)', color: 'var(--dsw-alias-label-primary-inverted)' },
      pickerDayOff: { opacity: 0.4 },
      pickerClear: { width: '100%', height: 28, padding: 0, border: 'none', borderRadius: 6, color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, cursor: 'pointer' },
      timeCols: { display: 'flex', gap: 8 },
      timeCol: { width: 80, flex: '1 1 80px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 },
      timeHead: { textAlign: 'center', fontSize: 11, lineHeight: '14px', color: 'var(--dsw-alias-label-tertiary)' },
      timeList: { minWidth: 0, maxHeight: 150, overflowY: 'auto' },
      timeItem: { width: '100%', height: 28, padding: 0, border: 'none', borderRadius: 6, color: 'var(--dsw-alias-label-primary)', fontSize: 13, textAlign: 'center', cursor: 'pointer' },
      timeItemOn: { background: 'var(--dsw-alias-state-business-primary)', color: 'var(--dsw-alias-label-primary-inverted)' },
      // 月视图日历：头部翻月 + 42 格；格子内最多两条，超出折叠成 +N。
      viewSeg: { display: 'flex', gap: 6, flex: 'none', width: 128 },
      calendar: { flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 16px 16px' },
      calendarHead: { display: 'flex', alignItems: 'center', gap: 6, height: 32, flex: 'none' },
      calendarTitle: { flex: 1, minWidth: 0, textAlign: 'center', fontSize: 14, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' },
      iconBtn: { flex: 'none', width: 28, height: 28, padding: 0, border: 'none', borderRadius: 6, color: 'var(--dsw-alias-label-secondary)', fontSize: 16, lineHeight: '28px', textAlign: 'center', cursor: 'pointer' },
      calendarWeekdays: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, flex: 'none' },
      calendarWeekday: { textAlign: 'center', fontSize: 11, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' },
      calendarGrid: { flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridTemplateRows: 'repeat(6, minmax(0, 1fr))', gap: 4 },
      calendarCell: { display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 2, minWidth: 0, minHeight: 0, padding: 4, borderRadius: 8, border: '0.5px solid var(--dsw-alias-border-l2)', overflow: 'hidden', boxSizing: 'border-box', textAlign: 'left', color: 'var(--dsw-alias-label-primary)', cursor: 'pointer' },
      calendarDay: { flex: 'none', fontSize: 11, lineHeight: '14px', color: 'var(--dsw-alias-label-secondary)' },
      // 今天只强调日期数字；选中才是整格底色 + 内描边，两者可叠加。
      calendarDayToday: { color: 'var(--dsw-alias-state-business-primary)', fontWeight: 600 },
      calendarCellSelected: {
        background: 'var(--dsw-alias-interactive-bg-hover)',
        boxShadow: 'inset 0 0 0 1.5px var(--dsw-alias-state-business-primary)',
      },
      calendarItem: { display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, fontSize: 10.5, lineHeight: '14px', color: 'var(--dsw-alias-label-secondary)' },
      calendarMore: { flex: 'none', paddingLeft: 9, fontSize: 10, lineHeight: '12px', color: 'var(--dsw-alias-label-tertiary)' },
      dot: { flex: 'none', width: 5, height: 5, borderRadius: 999, background: 'var(--dsw-alias-label-tertiary)' },
      // 点某天后，详情列改成当天清单；行只展示，不承担列表的选中态。
      dayRow: { display: 'flex', alignItems: 'center', gap: 8, minHeight: 30, padding: '0 4px', borderRadius: 6 },
      detailTitle: { fontSize: 15, fontWeight: 600, color: 'var(--dsw-alias-label-primary)', marginBottom: 12 },
    }

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

/* 日历格：选中态由内联底色 + 内描边表达，悬停只给未选中的格子一层底色。 */
.td-cal-cell { transition: background-color .12s ease; }
.td-cal-cell:hover { background: var(--dsw-alias-interactive-bg-hover); }

/* 行标题与复选框不再带 .td-btn：行内只留 .td-row:hover 一层底色。 */
.td-title {
  background: transparent; border: 0; padding: 0; margin: 0;
  font: inherit; color: inherit; text-align: left; cursor: pointer;
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.td-title:hover { background: transparent; }
.td-title:focus { outline: none; }
.td-title:focus-visible { outline: none; box-shadow: inset 0 -1.5px 0 var(--dsw-alias-state-business-primary); }

.td-check { cursor: pointer; }
.td-check:focus { outline: none; }
.td-check:focus-visible { outline: none; box-shadow: 0 0 0 1.5px var(--dsw-alias-state-business-primary); }

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

/* 日期 / 时间弹层：固定宽度，纵向间距统一交给 gap。 */
.td-picker { padding: 10px; display: flex; flex-direction: column; gap: 8px; }
.td-picker-date { width: 272px; }
.td-picker-time { width: 196px; }

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

    /**
     * 复选框的透明点击热区：点击挂在热区上并在热区截断冒泡，
     * 避免点偏一点就变成「选中整行」。视觉方块与键盘焦点仍在内层 role="checkbox"。
     */
    function checkHit(onClick, inner) {
      return h('span', {
        style: S.cbHit,
        onClick: (event) => {
          event.stopPropagation()
          return onClick(event)
        },
      }, inner)
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

    /** ISO 星期：周一 = 1 … 周日 = 7；与 `monthGrid` 的周一起始保持一致。 */
    function isoWeekday(date) {
      return ((date.getDay() + 6) % 7) + 1
    }

    /** 把 `YYYY-MM-DD` 在本地日历上平移 `days` 天；非法键原样返回。 */
    function shiftKeyLocal(key, days) {
      const date = parseDateKey(key)
      if (date === null) return key
      return dateKeyOf(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days))
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

    /** 月标题：日历与日期选择器共用，避免两处格式漂移。 */
    function monthTitle(year, month) {
      return `${year} 年 ${month + 1} 月`
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
    const MONTH_DAYS = Array.from({ length: 31 }, (_, index) => index + 1)
    // ISO 1–7：周一…周日；文本走词典，别用数组，t() 只返回字符串。
    const WEEKDAY_OPTIONS = [['mon', 1], ['tue', 2], ['wed', 3], ['thu', 4], ['fri', 5], ['sat', 6], ['sun', 7]]

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

    /** `doneAt` → 本地日期键；旧数据没有 `doneAt`（或值非法）返回 null。 */
    function doneKeyOf(item) {
      if (!item.doneAt) return null
      const at = new Date(item.doneAt)
      if (Number.isNaN(at.getTime())) return null
      return dateKeyOf(at)
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

    // 三个弹层（日期 / 时间 / 分类）共用同一套锚定参数：
    // 期望高度决定向下还是向上展开，宽度用于左右夹取；分类下拉跟随触发区宽度。
    const DATE_POP = { width: 272, height: 360 }
    const TIME_POP = { width: 196, height: 260 }
    const CATEGORY_POP = { width: null, height: 240 }
    const POP_GAP = 6
    const POP_EDGE = 8
    const POP_FALLBACK_WIDTH = 240

    /**
     * 弹层锚定：坐标是视口坐标（position: fixed），所以弹层不再被 .td-dialog 的滚动容器裁切。
     * 打开时按触发区的 getBoundingClientRect() 量一次；打开期间监听 window 的 resize 与
     * scroll（capture: true 才能收到弹窗容器内部的滚动），触发区移动时重算。关闭时解绑监听
     * 并清空定位状态。width 传 null 表示跟随触发区宽度；onDismiss 处理点击外部关闭。
     */
    function useAnchoredPopover(open, width, height, onDismiss) {
      const anchorRef = useRef(null)
      const [placement, setPlacement] = useState(null)

      useEffect(() => {
        if (!open) {
          setPlacement(null)
          return undefined
        }
        const place = () => {
          const node = anchorRef.current
          const rect = node !== null && typeof node.getBoundingClientRect === 'function'
            ? node.getBoundingClientRect()
            : null
          if (rect === null) return
          const viewportWidth = Number.isFinite(window.innerWidth) ? window.innerWidth : 0
          const viewportHeight = Number.isFinite(window.innerHeight) ? window.innerHeight : 0
          if (viewportWidth <= 0 || viewportHeight <= 0) return

          const popWidth = typeof width === 'number'
            ? width
            : (rect.width > 0 ? rect.width : POP_FALLBACK_WIDTH)
          const below = viewportHeight - rect.bottom - POP_GAP - POP_EDGE
          // 下方放不下期望高度就翻到上方；两种情况都只给「实际可用空间」作为 maxHeight，
          // 内容超出时由弹层自己滚动。
          const up = below < height
          let top = rect.bottom + POP_GAP
          let maxHeight = Math.min(height, Math.max(0, below))
          if (up) {
            // 先按期望高度把弹层放到触发区上方，再夹到视口上边距；
            // maxHeight 取「期望高度」和「实际可用空间」的较小值。
            top = Math.max(POP_EDGE, rect.top - height - POP_GAP)
            maxHeight = Math.min(
              height,
              Math.max(0, rect.top - top - POP_GAP),
              Math.max(0, viewportHeight - top - POP_EDGE),
            )
          }
          const left = Math.max(POP_EDGE, Math.min(rect.left, viewportWidth - popWidth - POP_EDGE))

          setPlacement((prev) => (prev !== null
            && prev.left === left && prev.top === top && prev.maxHeight === maxHeight
            && prev.up === up && prev.width === popWidth
            ? prev
            : { left, top, maxHeight, up, width: popWidth }))
        }
        place()
        window.addEventListener('resize', place)
        window.addEventListener('scroll', place, true)
        return () => {
          window.removeEventListener('resize', place)
          window.removeEventListener('scroll', place, true)
        }
      }, [open, width, height])

      // 点外部关闭：文档上监听，触发区（含弹层，因为弹层就在同一个 ref 容器里）内不关。
      useEffect(() => {
        if (!open || typeof onDismiss !== 'function') return undefined
        const onPointerDown = (event) => {
          const node = anchorRef.current
          if (node !== null && typeof node.contains === 'function' && node.contains(event.target)) return
          onDismiss()
        }
        document.addEventListener('pointerdown', onPointerDown)
        return () => document.removeEventListener('pointerdown', onPointerDown)
      }, [open, onDismiss])

      const up = placement !== null && placement.up
      const popStyle = placement === null
        ? {
            position: 'fixed', zIndex: 20, boxSizing: 'border-box', visibility: 'hidden',
            ...(typeof width === 'number' ? { width } : null),
          }
        : {
            position: 'fixed', zIndex: 20, boxSizing: 'border-box',
            left: placement.left, top: placement.top, width: placement.width,
            maxHeight: placement.maxHeight, overflowY: 'auto',
          }

      return { anchorRef, popStyle, up }
    }

    /**
     * 分类组合框：可自由输入新分类，聚焦即展开已有分类（名称 + 条数）。
     * 过滤词用独立状态：打开下拉时清空，避免编辑已有分类时被输入框的当前值收窄成一项；
     * 只有下拉打开后继续输入才用新输入过滤，选中或清空后再次复位。
     * 弹层与输入框在同一个 ref 容器里，点击外部的判断因此能覆盖弹层自身。
     */
    function CategoryCombo({ t, value, categories, onChange, onManage }) {
      const [open, setOpen] = useState(false)
      const [query, setQuery] = useState('')
      const close = useCallback(() => setOpen(false), [])
      const popover = useAnchoredPopover(open, CATEGORY_POP.width, CATEGORY_POP.height, close)

      const openAll = () => {
        setQuery('')
        setOpen(true)
      }

      const text = asText(value)
      const needle = query.trim().toLowerCase()
      const visible = needle === ''
        ? categories
        : categories.filter((row) => row.name.toLowerCase().includes(needle))
      const countLabel = t('categoryCount')

      return h('div', {
        ref: popover.anchorRef,
        style: { position: 'relative' },
        // 焦点在输入框或下拉按钮里时，Esc 先收起下拉，再让弹窗的 document 监听看不到这次按键。
        onKeyDown: (event) => {
          if (!open || event.key !== 'Escape') return
          event.stopPropagation?.()
          close()
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
        onFocus: openAll,
        onClick: () => { if (!open) openAll() },
        onChange: (event) => {
          onChange(event.target.value)
          setQuery(event.target.value)
          setOpen(true)
        },
      }),
      text !== ''
        ? h('button', {
            type: 'button',
            className: 'td-btn',
            style: S.comboClear,
            'aria-label': t('noCategory'),
            title: t('noCategory'),
            onClick: () => { onChange(''); openAll() },
          }, '×')
        : null,
      open
        ? h('div', { className: popover.up ? 'td-pop td-pop-up' : 'td-pop', style: popover.popStyle },
            visible.length === 0
              ? h('div', { style: S.popEmpty }, t('categoryEmpty'))
              : h('div', { style: S.popList }, visible.map((row) => h('button', {
                  key: row.name,
                  type: 'button',
                  className: 'td-btn',
                  style: S.popItem,
                  onClick: () => { onChange(row.name); setQuery(''); close() },
                },
                h('span', { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, row.name),
                h('span', { style: S.popCount }, typeof countLabel === 'function' ? countLabel(row.count) : `${row.count} ${countLabel}`)))),
            h('div', { style: S.popSep, 'aria-hidden': 'true' }),
            h('button', {
              type: 'button',
              className: 'td-btn',
              style: S.popManage,
              onClick: () => { close(); onManage?.() },
            }, t('categoryManage')))
        : null)
    }

    /**
     * 日期 / 时间选择器共用的开合状态；定位与点外部关闭都在 useAnchoredPopover。
     * Esc 交给各字段外框的 onKeyDown，避免连带关掉弹窗。
     */
    function usePickerPopover() {
      const [open, setOpen] = useState(false)
      const openPopover = useCallback(() => setOpen(true), [])
      const closePopover = useCallback(() => setOpen(false), [])
      return { open, openPopover, closePopover }
    }

    /** 自绘日期选择器：触发区 + 快捷行 + 6×7 月历；点日期、快捷按钮或清除都会关闭。 */
    function DateField({ t, value, onChange }) {
      const picker = usePickerPopover()
      const popover = useAnchoredPopover(picker.open, DATE_POP.width, DATE_POP.height, picker.closePopover)
      const [cursor, setCursor] = useState(() => {
        const at = parseDateKey(value) ?? new Date()
        return { year: at.getFullYear(), month: at.getMonth() }
      })

      const text = asText(value)
      const todayKey = dateKeyOf(new Date())
      const monthKey = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`
      const cells = monthGrid(cursor.year, cursor.month)
      const weekdays = weekdayLabels(t)

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
        ref: popover.anchorRef,
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
      h('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, text === '' ? t('pickDate') : text),
      h('span', { style: S.pickerIcon, 'aria-hidden': 'true' }, '▾')),

      picker.open
        ? h('div', {
            className: popover.up ? 'td-pop td-picker td-picker-date td-pop-up' : 'td-pop td-picker td-picker-date',
            style: popover.popStyle,
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
            }, '›')),
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
          h('button', {
            type: 'button', className: 'td-btn', style: S.pickerClear,
            onClick: () => closeWith(''),
          }, t('clearValue')))
        : null)
    }

    /** 自绘时间选择器：左右两列可滚动列表，点小时即时高亮但不提交，点分钟才设值并关闭。 */
    function TimeField({ t, value, onChange }) {
      const picker = usePickerPopover()
      const popover = useAnchoredPopover(picker.open, TIME_POP.width, TIME_POP.height, picker.closePopover)
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
        ref: popover.anchorRef,
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
      h('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, text === '' ? t('pickTime') : text),
      h('span', { style: S.pickerIcon, 'aria-hidden': 'true' }, '▾')),

      picker.open
        ? h('div', {
            className: popover.up ? 'td-pop td-picker td-picker-time td-pop-up' : 'td-pop td-picker td-picker-time',
            style: popover.popStyle,
            role: 'dialog',
            'aria-label': t('pickTime'),
          },
          h('div', { style: S.timeCols },
            h('div', { style: S.timeCol },
              h('div', { style: S.timeHead, 'aria-hidden': 'true' }, t('hourShort')),
              h('div', { style: S.timeList }, HOUR_OPTIONS.map((hour) => h('button', {
                key: `h-${hour}`,
                type: 'button',
                className: 'td-btn',
                ref: hour === draftHour ? hourItemRef : null,
                style: hour === draftHour ? { ...S.timeItem, ...S.timeItemOn } : S.timeItem,
                'aria-pressed': hour === draftHour ? 'true' : 'false',
                onClick: () => setDraftHour(hour),
              }, hour)))),
            h('div', { style: S.timeCol },
              h('div', { style: S.timeHead, 'aria-hidden': 'true' }, t('minuteShort')),
              h('div', { style: S.timeList }, MINUTE_OPTIONS.map((minute) => h('button', {
                key: `m-${minute}`,
                type: 'button',
                className: 'td-btn',
                ref: parsed !== null && minute === parsed.minute ? minuteItemRef : null,
                style: parsed !== null && minute === parsed.minute ? { ...S.timeItem, ...S.timeItemOn } : S.timeItem,
                'aria-pressed': parsed !== null && minute === parsed.minute ? 'true' : 'false',
                onClick: () => pickMinute(minute),
              }, minute))))),
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
      // 循环任务以本周期实例为准：dueDate 为空说明系列已结束，复选框置灰且不响应。
      const seriesEnded = Boolean(item.isRepeating) && !dueDate
      // 逾期桶与「截止日早于今天」是同一判定；循环行的 dueDate 就是本次，同样参与比较。
      const late = !item.done && (item.bucket === 'overdue' || (dueDate !== '' && dueDate < todayKey))
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
      checkHit(
        () => { if (!seriesEnded) onToggle(item) },
        h('span', {
          role: 'checkbox',
          'aria-checked': item.done ? 'true' : 'false',
          'aria-disabled': seriesEnded ? 'true' : undefined,
          'aria-label': title,
          tabIndex: 0,
          className: 'td-check',
          style: seriesEnded ? { ...(item.done ? S.cbDone : S.cb), opacity: 0.45 } : (item.done ? S.cbDone : S.cb),
          onKeyDown: (e) => {
            if (e.nativeEvent?.isComposing === true) return
            if (seriesEnded) return
            if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onToggle(item) }
          },
        }, item.done
          ? h('svg', { width: 9, height: 9, viewBox: '0 0 16 16', fill: 'none', stroke: 'var(--dsw-alias-label-primary-inverted)', strokeWidth: 2.4 },
              h('path', { d: 'M3.4 8.4 6.2 11l6.4-6.4', strokeLinecap: 'round', strokeLinejoin: 'round' }))
          : null),
      ),
      h('button', {
        type: 'button',
        className: 'td-title',
        'aria-current': selected ? 'true' : 'false',
        style: item.done ? S.nmDone : S.nm,
        onClick: (e) => { e.stopPropagation(); onSelect(item.id) },
      }, title),
      item.isRepeating ? h('span', { style: S.repeatBadge }, t('repeatBadge')) : null,
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
      // `initial` 有两种语义：带 id 是编辑；只带 dueDate 是从某一天「新建」时的预填。
      const editing = initial !== null && initial !== undefined && initial.id !== null && initial.id !== undefined
      const [form, setForm] = useState(() => ({
        id: editing ? initial.id : null,
        title: editing ? asText(initial.title) : '',
        note: editing ? asText(initial.note) : '',
        dueDate: editing ? asText(initial.dueDate) : (asText(initial?.dueDate) || dateKeyOf(new Date())),
        dueTime: editing ? asText(initial.dueTime) : '',
        priority: editing && ['high', 'medium', 'low'].includes(initial.priority) ? initial.priority : null,
        category: editing ? asText(initial.category) : '',
        repeatFreq: initial?.repeat?.freq ?? '',
        weekdays: initial?.repeat?.weekdays ?? [],
        monthDay: initial?.repeat?.monthDay ?? new Date().getDate(),
        until: initial?.repeat?.until ?? '',
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
        if (form.repeatFreq === 'weekly' && form.weekdays.length === 0) {
          setError(t('weekdaysRequired'))
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
          repeat: form.repeatFreq === ''
            ? null
            : form.repeatFreq === 'weekly'
              ? { freq: 'weekly', weekdays: form.weekdays }
              : form.repeatFreq === 'monthly'
                ? { freq: 'monthly', monthDay: form.monthDay }
                : { freq: 'daily' },
        }
        if (form.until !== '' && payload.repeat !== null) payload.repeat.until = form.until
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

        h('label', { style: S.field },
          h('span', { style: S.fieldLabel }, t('fieldRepeat')),
          h('select', {
            className: 'td-input',
            style: S.input,
            value: form.repeatFreq,
            onChange: (e) => setForm((prev) => ({ ...prev, repeatFreq: e.target.value })),
          },
          [['', 'repeatNone'], ['daily', 'repeatDaily'], ['weekly', 'repeatWeekly'], ['monthly', 'repeatMonthly']].map(([value, key]) =>
            h('option', { key: value === '' ? 'none' : value, value }, t(key))))),

        form.repeatFreq === 'weekly'
          ? h('div', { style: S.field },
              h('span', { style: S.fieldLabel }, t('fieldWeekdays')),
              h('div', { style: S.seg }, WEEKDAY_OPTIONS.map(([key, iso]) =>
                h('button', {
                  key: iso, type: 'button', className: 'td-btn',
                  'aria-pressed': form.weekdays.includes(iso) ? 'true' : 'false',
                  style: { ...S.segItem, ...(form.weekdays.includes(iso) ? S.segItemOn : null) },
                  onClick: () => setForm((prev) => ({
                    ...prev,
                    weekdays: prev.weekdays.includes(iso)
                      ? prev.weekdays.filter((day) => day !== iso)
                      : [...prev.weekdays, iso],
                  })),
                }, t(key)))))
          : null,

        form.repeatFreq === 'monthly'
          ? h('label', { style: S.field },
              h('span', { style: S.fieldLabel }, t('fieldMonthDay')),
              h('select', {
                className: 'td-input',
                style: S.input,
                value: String(form.monthDay),
                onChange: (e) => setForm((prev) => ({ ...prev, monthDay: Number(e.target.value) })),
              }, MONTH_DAYS.map((day) => h('option', { key: day, value: String(day) }, String(day)))))
          : null,

        form.repeatFreq !== ''
          ? h('div', { style: S.field },
              h('span', { style: S.fieldLabel }, t('fieldUntil')),
              h(DateField, {
                t,
                value: form.until,
                onChange: (next) => setForm((prev) => ({ ...prev, until: next })),
              }))
          : null,

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
        h('div', { style: S.catHint }, t('categoryHint')),
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

    /**
     * 月视图日历：6×7 月网格直接复用 DateField 的 monthGrid / weekdayLabels，
     * 数据按整格区间（首格到末格）拉 occurrences，切月或任何写操作（version）后重新拉。
     */
    function CalendarView({ t, selectedDay, onPickDay, version }) {
      const [cursor, setCursor] = useState(() => {
        const at = new Date()
        return { year: at.getFullYear(), month: at.getMonth() }
      })
      const [byDate, setByDate] = useState({})

      const cells = monthGrid(cursor.year, cursor.month)
      const from = cells[0]
      const to = cells[cells.length - 1]
      const monthKey = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`
      const todayKey = dateKeyOf(new Date())
      const weekdays = weekdayLabels(t)

      useEffect(() => {
        let alive = true
        fetchApi('occurrences', { from, to })
          .then((result) => {
            if (!alive) return
            const map = {}
            for (const item of Array.isArray(result.items) ? result.items : []) {
              ;(map[item.date] ??= []).push(item)
            }
            setByDate(map)
          })
          .catch((err) => {
            if (!alive) return
            console.error('[dsh-todolist] occurrences failed', err)
            setByDate({})
          })
        return () => { alive = false }
      }, [from, to, version])

      const move = (delta) => {
        const at = new Date(cursor.year, cursor.month + delta, 1)
        setCursor({ year: at.getFullYear(), month: at.getMonth() })
      }

      const goToday = () => {
        const at = new Date()
        setCursor({ year: at.getFullYear(), month: at.getMonth() })
      }

      return h('div', { style: S.calendar },
        h('div', { style: S.calendarHead },
          h('button', {
            type: 'button', className: 'td-btn', style: S.iconBtn,
            'aria-label': t('prevMonth'), onClick: () => move(-1),
          }, '‹'),
          h('div', { style: S.calendarTitle }, monthTitle(cursor.year, cursor.month)),
          h('button', {
            type: 'button', className: 'td-btn', style: S.iconBtn,
            'aria-label': t('nextMonth'), onClick: () => move(1),
          }, '›'),
          h('button', {
            type: 'button', className: 'td-btn',
            style: { ...S.btnGhost, height: 28, padding: '0 10px' },
            onClick: goToday,
          }, t('today'))),
        h('div', { style: S.calendarWeekdays, 'aria-hidden': 'true' },
          weekdays.map((label, index) => h('div', { key: String(index), style: S.calendarWeekday }, label))),
        h('div', { style: S.calendarGrid },
          cells.map((key) => {
            const items = byDate[key] ?? []
            const inMonth = key.slice(0, 7) === monthKey
            const selected = key === selectedDay
            return h('div', {
              key,
              role: 'button',
              tabIndex: 0,
              className: 'td-btn td-cal-cell',
              'aria-label': key,
              'data-date': key,
              style: {
                ...S.calendarCell,
                ...(selected ? S.calendarCellSelected : null),
                ...(inMonth ? null : S.pickerDayOff),
              },
              onClick: () => onPickDay(key),
              onKeyDown: (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault?.()
                onPickDay(key)
              },
            },
            h('div', { style: key === todayKey ? { ...S.calendarDay, ...S.calendarDayToday } : S.calendarDay }, String(Number(key.slice(8, 10)))),
            items.slice(0, 2).map((item) => h('div', {
              key: `${item.todoId}-${item.date}`,
              style: S.calendarItem,
            },
            h('span', { style: { ...S.dot, background: priorityColor(item.priority) }, 'aria-hidden': 'true' }),
            h('span', { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, asText(item.title)))),
            items.length > 2 ? h('div', { style: S.calendarMore }, `+${items.length - 2}`) : null)
          })),
      )
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
      // 「已完成」的范围：today | week | month；默认看整周，而不是只看今天。
      const [doneRange, setDoneRange] = useState('week')
      const [noticeHidden, setNoticeHidden] = useState(corruptDismissed)
      const [compactDetail, setCompactDetail] = useState(() => window.innerWidth < 1000)
      const [retrying, setRetrying] = useState(false)
      const [view, setView] = useState('list')
      // 写操作（勾选/完成等）失败的可见提示。它和读取失败的 state.error 分开：
      // 自己保留 5 秒，2.5 秒轮询成功也不会把它清掉。
      const [actionError, setActionError] = useState(false)
      // 循环任务已完成实例：窗口覆盖本月并向后多留 62 天，只喂「已完成」分组，
      // 不参与 summary，也不混进主列表。
      const [recurringDone, setRecurringDone] = useState([])
      // 写操作计数器：日历与当天清单都靠它重拉 occurrences，避免写后还看旧数据。
      const [dataVersion, setDataVersion] = useState(0)
      // 日历选中的那一天；清单数据由 [dayKey, dataVersion] 单独拉，不再存点击时的快照。
      const [dayKey, setDayKey] = useState(null)
      const [dayItems, setDayItems] = useState([])

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

      // 写失败提示的 5s 计时器：重新失败时从头计时，卸载时清掉。
      const actionErrorTimer = useRef(null)
      const clearActionErrorTimer = useCallback(() => {
        if (actionErrorTimer.current !== null) {
          window.clearTimeout(actionErrorTimer.current)
          actionErrorTimer.current = null
        }
      }, [])
      const dismissActionError = useCallback(() => {
        clearActionErrorTimer()
        setActionError(false)
      }, [clearActionErrorTimer])
      const showActionError = useCallback(() => {
        clearActionErrorTimer()
        setActionError(true)
        actionErrorTimer.current = window.setTimeout(() => {
          actionErrorTimer.current = null
          setActionError(false)
        }, 5000)
      }, [clearActionErrorTimer])

      const reload = useCallback(async () => {
        const seq = ++seqRef.current
        try {
          // 循环任务的完成实例单独拉；它失败不该把已经拿到的 list 一起判死。
          // 窗口覆盖「本月」并向后多留 62 天：循环任务可以提前完成本周期的那一次，
          // 周循环最多提前到本周日，月循环最多提前一个月，今天之后的实例也要能查到。
          const now = new Date()
          const todayKey = dateKeyOf(now)
          const weekStart = shiftKeyLocal(todayKey, 1 - isoWeekday(now))
          const monthStart = `${todayKey.slice(0, 7)}-01`
          const from = weekStart < monthStart ? weekStart : monthStart
          const to = shiftKeyLocal(todayKey, 62)
          const occTask = fetchApi('occurrences', { from, to }, tRef.current).catch((err) => {
            console.error('[dsh-todolist] occurrences (done) failed', err)
            return { items: [] }
          })
          const [result, occ] = await Promise.all([
            fetchApi('list', query ? { q: query } : {}, tRef.current),
            occTask,
          ])
          if (seq !== seqRef.current) return
          setState({
            loading: false,
            error: null,
            items: Array.isArray(result.items) ? result.items : [],
            summary: result.summary && typeof result.summary === 'object' ? result.summary : {},
            notices: Array.isArray(result.notices) ? result.notices : [],
            staleDays: Number.isInteger(result.staleDays) ? result.staleDays : 7,
          })
          // 只取循环任务已完成的那次，按完成日期倒序进「已完成」分组。
          setRecurringDone((Array.isArray(occ?.items) ? occ.items : [])
            .filter((occurrence) => occurrence.repeat && occurrence.done)
            .sort((a, b) => b.date.localeCompare(a.date)))
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
          // 写成功后让日历和当天清单重拉 occurrences（它们都依赖 dataVersion）。
          dismissActionError()
          setDataVersion((v) => v + 1)
          await reload()
          return true
        } catch (err) {
          console.error(`[dsh-todolist] ${method} failed`, err)
          // 勾选/完成等写失败必须有可见反馈：独立的红条保留 5 秒，避免被
          // 随后成功的 2.5s 轮询立刻清掉；同时重新拉一次 list，让宿主把
          // notices 里的 write-error 带回来。
          showActionError()
          await reload()
          return false
        }
      }, [reload, dismissActionError, showActionError])

      /** 当天清单：只认 dayKey 与 dataVersion，打开 / 切回 / 写后都重新拉，不存快照。 */
      useEffect(() => {
        if (dayKey === null) {
          setDayItems([])
          return undefined
        }
        let alive = true
        fetchApi('occurrences', { from: dayKey, to: dayKey }, tRef.current)
          .then((result) => {
            if (!alive) return
            setDayItems(Array.isArray(result.items) ? result.items : [])
          })
          .catch((err) => {
            if (!alive) return
            console.error('[dsh-todolist] occurrences failed', err)
            setDayItems([])
          })
        return () => { alive = false }
      }, [dayKey, dataVersion])

      /** 当天清单里勾选：complete 带 date；成功后 dataVersion 自增，清单自己重拉。 */
      const toggleDayItem = useCallback((item) => (
        mutate('complete', { id: item.todoId, done: !item.done, date: item.date })
      ), [mutate])

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

      // 卸载时清掉计时器，避免组件没了还 setConfirming / setActionError。
      useEffect(() => () => clearConfirmTimer(), [clearConfirmTimer])
      useEffect(() => () => clearActionErrorTimer(), [clearActionErrorTimer])

      // 窄窗口（< 1000px）把详情列从 380 收到 320，避免挤压列表；监听随卸载解绑。
      useEffect(() => {
        const onResize = () => setCompactDetail(window.innerWidth < 1000)
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
      }, [])

      const items = state.items
      const now = new Date()
      const todayKey = dateKeyOf(now)
      const weekStart = shiftKeyLocal(todayKey, 1 - isoWeekday(now))   // 本周一
      const weekEnd = shiftKeyLocal(weekStart, 6)                        // 本周日
      const monthStart = `${todayKey.slice(0, 7)}-01`
      const monthEnd = dateKeyOf(new Date(now.getFullYear(), now.getMonth() + 1, 0))  // 本月最后一天
      const rangeStart = doneRange === 'today' ? todayKey : doneRange === 'week' ? weekStart : monthStart
      // 上界按范围各自取：今天 / 本周日 / 本月最后一天。预完成的未来实例因此只出现在
      // 「本周」「本月」里；「今天」仍只认今天，不会把 10-30 提前算进今天。
      const rangeEnd = doneRange === 'today' ? todayKey : doneRange === 'week' ? weekEnd : monthEnd
      const pendingCount = items.filter((item) => item.done && item.doneBy === 'agent' && !item.verifiedAt).length

      // 首次出现未核实项（0 → N）时把「已完成」展开，否则标记藏在折叠区里没人看得见。
      // 用户手动操作过（doneTouched）就不再自动展开，徽标仍然照常更新。
      useEffect(() => {
        if (pendingCount > 0 && prevPending.current === 0 && !doneTouched.current) setDoneOpen(true)
        prevPending.current = pendingCount
      }, [pendingCount])

      // 两路完成数据都先按当前范围裁剪；组内的 今天/昨天/本周/更早 分节逻辑不变。
      // 旧数据没有 doneAt：只在最宽的「本月」里保留，仍归入「更早」。
      const inDoneRange = (key) => key !== null && key >= rangeStart && key <= rangeEnd
      const allDoneItems = items.filter((item) => item.bucket === 'done')
      const doneItems = allDoneItems.filter((item) => {
        const key = doneKeyOf(item)
        return key === null ? doneRange === 'month' : inDoneRange(key)
      })
      const recurringDoneInRange = recurringDone.filter((occurrence) => {
        const key = asText(occurrence.date)
        return parseDateKey(key) !== null && inDoneRange(key)
      })
      const doneTotal = doneItems.length + recurringDoneInRange.length
      const hasDoneData = allDoneItems.length + recurringDone.length > 0
      const openGroups = ORDER
        .filter((bucket) => bucket !== 'done')
        .map((bucket) => ({ bucket, items: items.filter((item) => item.bucket === bucket) }))
        .filter((group) => group.items.length > 0)
      const doneSections = ['today', 'yesterday', 'week', 'earlier']
        .map((bucket) => ({ bucket, items: doneItems.filter((item) => doneGroupOf(item) === bucket) }))
        .filter((section) => section.items.length > 0)
      const selectedItem = items.find((item) => item.id === selected) ?? null
      const toggleItem = (item) => {
        const payload = { id: item.id, done: !item.done }
        if (item.isRepeating) {
          if (!item.dueDate) return          // 本周期没有待完成实例（系列已结束），不可勾
          // 勾的是本周期这一次（dueDate），不是下一个未完成实例（nextDue）：
          // 漏做时 nextDue 已滚到下周，用它会把下周那次误标成完成。
          payload.date = item.dueDate
        }
        void mutate('complete', payload)
      }
      const renderRow = (item) => h(Row, {
        key: item.id, item, t,
        selected: item.id === selected,
        onSelect: setSelected,
        onToggle: toggleItem,
      })
      // 循环任务的完成记录只出现在「已完成」里：勾掉复选框等于撤销那一次的完成，
      // 该行随 reload 消失，任务重新出现在列表的对应周期里。
      const renderRecurringDone = (occurrence) => {
        const title = asText(occurrence.title)
        const date = asText(occurrence.date)
        const undo = () => {
          void mutate('complete', { id: occurrence.todoId, done: false, date: occurrence.date })
        }
        return h('div', { key: `${occurrence.todoId}-${occurrence.date}`, style: S.catRow },
          checkHit(undo, h('span', {
            role: 'checkbox',
            'aria-checked': 'true',
            'aria-label': title,
            tabIndex: 0,
            className: 'td-check',
            style: S.cbDone,
            onKeyDown: (event) => {
              if (event.nativeEvent?.isComposing === true) return
              if (event.key !== ' ' && event.key !== 'Enter') return
              event.preventDefault()
              event.stopPropagation()
              undo()
            },
          }, h('svg', { width: 9, height: 9, viewBox: '0 0 16 16', fill: 'none', stroke: 'var(--dsw-alias-label-primary-inverted)', strokeWidth: 2.4 },
            h('path', { d: 'M3.4 8.4 6.2 11l6.4-6.4', strokeLinecap: 'round', strokeLinejoin: 'round' })))),
          h('span', { style: S.nmDone, title }, title),
          h('span', { style: S.repeatBadge }, t('repeatBadge')),
          h('span', { style: S.due, title: `${t('completedOn')} ${date}` }, date.slice(5)),
        )
      }

      const selectedTitle = selectedItem ? asText(selectedItem.title) : ''
      const selectedNote = selectedItem ? asText(selectedItem.note) : ''
      const selectedDueDate = selectedItem ? asText(selectedItem.dueDate) : ''
      const selectedDueTime = selectedItem ? asText(selectedItem.dueTime) : ''
      const selectedCategory = selectedItem ? asText(selectedItem.category) : ''
      // 手改 JSON 可能让 completions 变成任意类型；详情只按对象兜底，坏值当「还没完成过」。
      const selectedCompletions = selectedItem !== null && selectedItem.isRepeating
        && selectedItem.completions !== null
        && typeof selectedItem.completions === 'object'
        && !Array.isArray(selectedItem.completions)
        ? selectedItem.completions
        : {}
      const selectedCompletionKeys = Object.keys(selectedCompletions).sort()
      const selectedLastCompleted = selectedCompletionKeys.length === 0
        ? ''
        : selectedCompletionKeys[selectedCompletionKeys.length - 1]
      const selectedRepeatEnded = Boolean(selectedItem?.isRepeating && !selectedItem?.dueDate)
      const selectedCompletionCount = selectedCompletionKeys.length
      const selectedCountLabel = `${t('completedTimes').replace('{n}', String(selectedCompletionCount))}${selectedRepeatEnded ? ` · ${t('seriesEnded')}` : ''}`

      return h('div', { style: S.page },
        h('div', { style: S.head },
          h('h2', { style: S.h1 }, t('title')),
          h('span', { style: S.count }, `${t('today')} ${state.summary.today ?? 0} · ${t('overdue')} ${state.summary.overdue ?? 0} · ${t('stale')} ${state.summary.stale ?? 0}`),
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
          h('div', { style: S.viewSeg }, [
            ['list', 'listView'],
            ['calendar', 'calendarView'],
          ].map(([value, key]) => h('button', {
            key: value,
            type: 'button',
            className: 'td-btn',
            'aria-pressed': view === value ? 'true' : 'false',
            style: { ...S.segItem, ...(view === value ? S.segItemOn : null) },
            onClick: () => {
              setView(value)
              // 切回列表时清掉按天选择，详情列恢复成选中项详情。
              if (value === 'list') setDayKey(null)
            },
          }, t(key)))),
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
        actionError
          ? h('div', { role: 'alert', style: S.error }, t('actionFailed'))
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
          view === 'calendar'
            ? h(CalendarView, { t, selectedDay: dayKey, onPickDay: (key) => setDayKey(key), version: dataVersion })
            : h('div', { style: S.list },
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
                    hasDoneData ? h('div', { key: 'done' },
                      h('div', { style: S.doneHead },
                        h('button', {
                          className: 'td-btn',
                          style: S.doneToggle,
                          'aria-expanded': doneOpen ? 'true' : 'false',
                          onClick: () => {
                            doneTouched.current = true
                            setDoneOpen((open) => !open)
                          },
                        },
                        h('span', { style: S.secT }, t('done')),
                        h('span', { style: S.secN }, String(doneTotal)),
                        pendingCount > 0
                          ? h('span', { style: { ...S.tag, color: 'var(--dsw-alias-state-warn-primary)' } }, `${pendingCount} ${t('needsReview')}`)
                          : null),
                        // 范围控件放在计数之后、箭头之前：点它只切范围，不触发折叠。
                        h('div', { style: S.doneRange, role: 'group', 'aria-label': t('done') },
                          ['today', 'week', 'month'].map((value) => h('button', {
                            key: value,
                            type: 'button',
                            className: 'td-btn',
                            'aria-pressed': doneRange === value ? 'true' : 'false',
                            style: { ...S.doneRangeItem, ...(doneRange === value ? S.doneRangeItemOn : null) },
                            onClick: () => setDoneRange(value),
                          }, t(value)))),
                        h('span', { style: S.line }),
                        h('button', {
                          type: 'button',
                          className: 'td-btn',
                          style: S.doneArrow,
                          'aria-expanded': doneOpen ? 'true' : 'false',
                          'aria-label': t('done'),
                          onClick: () => {
                            doneTouched.current = true
                            setDoneOpen((open) => !open)
                          },
                        }, doneOpen ? '▾' : '▸'),
                      ),
                      doneOpen
                        ? (doneTotal === 0
                          ? h('div', { style: S.doneEmpty }, t('doneEmpty'))
                          : doneSections.map((section) => h('div', { key: section.bucket },
                            h('div', { style: S.subsec },
                              h('span', { style: S.secT }, t(section.bucket)),
                              h('span', { style: S.secN }, String(section.items.length)),
                              h('span', { style: S.line }),
                            ),
                            section.items.map((item) => renderRow(item)),
                          )).concat(recurringDoneInRange.length === 0 ? [] : [
                            h('div', { key: 'recurring-done' },
                              h('div', { style: S.subsec },
                                h('span', { style: S.secT }, t('recurringDoneSection')),
                                h('span', { style: S.secN }, String(recurringDoneInRange.length)),
                                h('span', { style: S.line }),
                              ),
                              recurringDoneInRange.map((occurrence) => renderRecurringDone(occurrence)),
                            ),
                          ]))
                        : null,
                    ) : null,
                  ),
            ),
          h('div', { style: compactDetail ? { ...S.detail, width: 320 } : S.detail },
            dayKey !== null
              ? h('div', null,
                h('div', { style: S.detailTitle }, t('plansOnDay')(dayKey === todayKey ? t('today') : dayKey.slice(5))),
                dayItems.length === 0
                  ? h('div', { style: S.empty }, t('nothingThatDay'))
                  : dayItems.map((item) => h('div', {
                      key: `${item.todoId}-${item.date}`,
                      style: S.dayRow,
                    },
                    checkHit(
                      () => { void toggleDayItem(item) },
                      h('span', {
                        role: 'checkbox',
                        'aria-checked': item.done ? 'true' : 'false',
                        'aria-label': asText(item.title),
                        tabIndex: 0,
                        className: 'td-check',
                        style: item.done ? S.cbDone : S.cb,
                        onKeyDown: (event) => {
                          if (event.nativeEvent?.isComposing === true) return
                          if (event.key !== ' ' && event.key !== 'Enter') return
                          event.preventDefault()
                          event.stopPropagation()
                          void toggleDayItem(item)
                        },
                      }, item.done
                        ? h('svg', { width: 9, height: 9, viewBox: '0 0 16 16', fill: 'none', stroke: 'var(--dsw-alias-label-primary-inverted)', strokeWidth: 2.4 },
                            h('path', { d: 'M3.4 8.4 6.2 11l6.4-6.4', strokeLinecap: 'round', strokeLinejoin: 'round' }))
                        : null),
                    ),
                    h('span', { style: item.done ? S.nmDone : S.nm }, asText(item.title)),
                    h('span', { style: { ...S.dot, background: priorityColor(item.priority), marginLeft: 4 }, 'aria-hidden': 'true' }))),
                h('button', {
                  type: 'button',
                  className: 'td-btn',
                  style: { ...S.btnGhost, width: '100%', marginTop: 10 },
                  onClick: () => setDialog({ initial: { dueDate: dayKey } }),
                }, t('newOnThatDay')))
              : selectedItem
                ? h('div', null,
                  h('div', { style: S.detailTitle }, selectedTitle),
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
                    selectedItem.createdAt ? detailRow(t('created'), formatDateTime(selectedItem.createdAt)) : null,
                    selectedItem.isRepeating
                      ? detailRow(t('lastCompleted'), selectedLastCompleted === '' ? t('neverCompleted') : selectedLastCompleted.slice(5))
                      : null,
                    selectedItem.isRepeating
                      ? detailRow(t('repeatBadge'), selectedCountLabel)
                      : null),
                  h('div', { style: { display: 'flex', gap: 8, marginTop: 14 } },
                    h('button', {
                      className: 'td-btn',
                      style: { flex: 1, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: 12.5, border: '0.5px solid var(--dsw-alias-border-l3)', color: 'var(--dsw-alias-label-secondary)' },
                      onClick: () => setDialog({ initial: selectedItem }),
                    }, t('edit')),
                    h('button', {
                      className: 'td-primary',
                      disabled: selectedRepeatEnded,
                      style: {
                        flex: 1, height: 32, borderRadius: 8, border: 'none',
                        cursor: selectedRepeatEnded ? 'not-allowed' : 'pointer',
                        opacity: selectedRepeatEnded ? 0.45 : 1,
                        background: 'var(--dsw-alias-state-business-primary)', color: 'var(--dsw-alias-label-primary-inverted)', fontSize: 12.5,
                      },
                      onClick: () => {
                        const payload = { id: selectedItem.id, done: !selectedItem.done }
                        if (selectedItem.isRepeating && selectedItem.dueDate) payload.date = selectedItem.dueDate
                        void mutate('complete', payload)
                      },
                    }, selectedItem.done ? t('reopen') : (selectedItem.isRepeating ? t('completeOccurrence') : t('complete'))),
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
