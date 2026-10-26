import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStore } from '../lib/store.js'
import { createApi } from '../lib/api.js'
import { dateKey, shiftKey } from '../lib/bucket.js'

async function openJourney() {
  const dir = await mkdtemp(join(tmpdir(), 'todo-journey-'))
  const file = join(dir, 'todos.json')
  const store = createStore({ file })
  await store.load()
  return { api: createApi(store), store, file, dir }
}

async function closeJourney({ store, dir }) {
  await store.close()
  await rm(dir, { recursive: true, force: true })
}

/** 本周五（ISO 周：周一为一周之始），从真实「今天」推导，不写死日期。 */
function thisWeekFriday(today = dateKey(new Date())) {
  const [y, m, d] = today.split('-').map(Number)
  const weekday = new Date(y, m - 1, d).getDay()
  return shiftKey(today, 5 - (weekday === 0 ? 7 : weekday))
}

test('旅程 1：每周五的日报 —— 完成本次消失，日历保留，撤销后回来', async () => {
  const journey = await openJourney()
  const { api } = journey
  try {
    const today = dateKey(new Date())
    const friday = thisWeekFriday(today)
    const lastFriday = shiftKey(friday, -7)

    const todo = await api.create({
      title: '交日报',
      dueDate: lastFriday,
      repeat: { freq: 'weekly', weekdays: [5] },
    })

    // 本周期（本周）的实例是本周五；本周五尚未到期（验收日为周一）时落在 week 桶。
    const first = await api.list()
    const row = first.items.find((t) => t.id === todo.id)
    assert.ok(row, '本周五还没完成，应该出现在列表')
    assert.equal(row.dueDate, friday)
    assert.equal(row.bucket, 'week')

    await api.complete({ id: todo.id, done: true, date: friday })
    const afterDone = await api.list()
    assert.equal(afterDone.items.find((t) => t.id === todo.id), undefined, '完成本周期后整行消失')

    const calendar = await api.occurrences({ from: lastFriday, to: shiftKey(friday, 7) })
    const occurrence = calendar.items.find((o) => o.todoId === todo.id && o.date === friday)
    assert.ok(occurrence, '日历仍应展开本周五的实例')
    assert.equal(occurrence.done, true)

    await api.complete({ id: todo.id, done: false, date: friday })
    const afterUndo = await api.list()
    assert.ok(afterUndo.items.find((t) => t.id === todo.id), '撤销完成后待办又回到列表')
  } finally {
    await closeJourney(journey)
  }
})

test('旅程 2：每天的日报 —— 完成今天后从列表消失，日历标已完成', async () => {
  const journey = await openJourney()
  const { api } = journey
  try {
    const today = dateKey(new Date())
    const todo = await api.create({ title: '交日报', dueDate: today, repeat: { freq: 'daily' } })

    const first = await api.list()
    const row = first.items.find((t) => t.id === todo.id)
    assert.ok(row, '今天的每日任务应该出现')
    assert.equal(row.dueDate, today)
    assert.equal(row.bucket, 'today')

    await api.complete({ id: todo.id, done: true, date: today })
    const afterDone = await api.list()
    assert.equal(afterDone.items.find((t) => t.id === todo.id), undefined, '完成今天后从列表消失')

    const calendar = await api.occurrences({ from: today, to: today })
    const occurrence = calendar.items.find((o) => o.todoId === todo.id)
    assert.ok(occurrence)
    assert.equal(occurrence.done, true)
  } finally {
    await closeJourney(journey)
  }
})

test('旅程 3：每月 31 号 —— 二月不出现，三月 31 号出现', async () => {
  const journey = await openJourney()
  const { api } = journey
  try {
    const todo = await api.create({
      title: '月末对账',
      dueDate: '2026-01-31',
      repeat: { freq: 'monthly', monthDay: 31 },
    })

    const february = await api.occurrences({ from: '2026-02-01', to: '2026-02-28' })
    assert.equal(february.items.some((o) => o.todoId === todo.id), false, '二月没有 31 号')

    const march = await api.occurrences({ from: '2026-03-01', to: '2026-03-31' })
    const hit = march.items.find((o) => o.todoId === todo.id)
    assert.ok(hit)
    assert.equal(hit.date, '2026-03-31')
  } finally {
    await closeJourney(journey)
  }
})

test('旅程 4：分类改名合并，删除分类退回无分类', async () => {
  const journey = await openJourney()
  const { api } = journey
  try {
    const shopping = await api.create({ title: '买菜', category: '生活' })
    const trash = await api.create({ title: '倒垃圾', category: '日常' })

    const renamed = await api.renameCategory({ from: '生活', to: '日常' })
    assert.equal(renamed.moved, 1)
    const merged = await api.list()
    assert.equal(merged.items.filter((t) => t.category === '日常').length, 2)
    assert.deepEqual(api.categories().items, [{ name: '日常', count: 2 }])

    const cleared = await api.clearCategory({ name: '日常' })
    assert.equal(cleared.cleared, 2)
    const emptied = await api.list()
    for (const todo of emptied.items) {
      assert.ok([shopping.id, trash.id].includes(todo.id))
      assert.equal(todo.category, null)
    }
    assert.deepEqual(api.categories().items, [])
  } finally {
    await closeJourney(journey)
  }
})

test('旅程 5：写盘失败留下 write-error，修复后 retry 落盘并清除提示', async () => {
  const journey = await openJourney()
  const { api, file } = journey
  try {
    // 占住原子写的临时文件路径，制造真实写失败。
    await mkdir(`${file}.tmp`)
    await assert.rejects(
      () => api.create({ title: '尚未落盘' }),
      (err) => err.code === 'io-error',
    )
    const broken = await api.list()
    assert.ok(broken.notices.includes('write-error'))
    assert.deepEqual(broken.items.map((t) => t.title), ['尚未落盘'])  // 内存里还在

    await rm(`${file}.tmp`, { recursive: true, force: true })
    assert.deepEqual(await api.retry({}), { ok: true })
    const healed = await api.list()
    assert.equal(healed.notices.includes('write-error'), false)

    const raw = JSON.parse(await readFile(file, 'utf8'))
    assert.deepEqual(raw.todos.map((t) => t.title), ['尚未落盘'])

    const reopened = createStore({ file })
    await reopened.load()
    const reread = await reopened.list()
    assert.deepEqual(reread.items.map((t) => t.title), ['尚未落盘'])
    await reopened.close()
  } finally {
    await closeJourney(journey)
  }
})

test('旅程 6：v1 老数据缺新字段，load 后 list / occurrences 正常', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'todo-journey-'))
  const file = join(dir, 'todos.json')
  const today = dateKey(new Date())
  await writeFile(file, JSON.stringify({
    version: 1,
    todos: [
      {
        id: 't_v1_today',
        title: '老数据：今天到期',
        note: '',
        priority: null,
        category: null,
        dueDate: today,
        dueTime: null,
        done: false,
        doneAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 't_v1_stale',
        title: '老数据：没有截止日',
        note: '',
        priority: 'low',
        category: null,
        dueDate: null,
        dueTime: null,
        done: false,
        doneAt: null,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ],
  }), 'utf8')

  const store = createStore({ file })
  try {
    const info = await store.load()
    assert.equal(info.corrupt, false)
    const list = await store.list()
    assert.equal(list.items.length, 2)
    assert.deepEqual(list.notices, [])
    assert.equal(list.items.find((t) => t.id === 't_v1_today').bucket, 'today')
    assert.equal(list.items.find((t) => t.id === 't_v1_stale').bucket, 'stale')

    const calendar = await store.occurrences({ from: today, to: today })
    assert.equal(calendar.items.length, 1)
    assert.equal(calendar.items[0].todoId, 't_v1_today')
    assert.equal(calendar.items[0].done, false)
  } finally {
    await store.close()
    await rm(dir, { recursive: true, force: true })
  }
})
