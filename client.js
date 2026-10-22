window.__ModuleLoader__.load({
  id: 'dsh-todolist',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    function TodoIcon({ size = 16 }) {
      return h(
        'svg',
        {
          width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
          stroke: 'currentColor', strokeWidth: 1.4, 'aria-hidden': true,
        },
        h('rect', { x: 2.4, y: 2.4, width: 11.2, height: 11.2, rx: 2.4 }),
        h('path', { d: 'M5.4 8.2l1.9 1.9 3.4-3.6', strokeLinecap: 'round', strokeLinejoin: 'round' }),
      )
    }

    function TodoPage() {
      return h('div', { style: { padding: 24, fontSize: 14 } }, '待办（占位）')
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: 'todo', order: 20, label: () => '待办',
        }, ({ size } = {}) => h(TodoIcon, { size: size ?? 16 })))

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main', key: 'todo',
        }, TodoPage))
      },
    }
  },
})
