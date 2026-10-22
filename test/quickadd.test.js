import test from 'node:test'
import assert from 'node:assert/strict'
import { parseQuickAdd } from '../lib/quickadd.js'

const TODAY = { today: '2026-10-22' }
const parse = (text) => parseQuickAdd(text, TODAY)

test('没有任何语法时整句都是标题', () => {
  assert.deepEqual(parse('买牛奶'), {
    title: '买牛奶', dueDate: null, dueTime: null,
    priority: null, category: null, matched: [],
  })
})

test('相对日期', () => {
  assert.equal(parse('明天交周报').dueDate, '2026-10-23')
  assert.equal(parse('后天交周报').dueDate, '2026-10-24')
  assert.equal(parse('昨天交周报').dueDate, '2026-10-21')
})

test('中文不需要空格，句中也能解析', () => {
  const out = parse('记得明天交周报给我')
  assert.equal(out.dueDate, '2026-10-23')
  assert.equal(out.title, '记得交周报给我')
})

test('星期与下周', () => {
  assert.equal(parse('周五 周会').dueDate, '2026-10-23')
  assert.equal(parse('下周三 交材料').dueDate, '2026-10-28')
})

test('N 天后与绝对日期', () => {
  assert.equal(parse('3天后 续签域名').dueDate, '2026-10-25')
  assert.equal(parse('10月25日 面试').dueDate, '2026-10-25')
  assert.equal(parse('月底 对账').dueDate, '2026-10-31')
})

test('「每周一」不能被当成日期', () => {
  const out = parse('每周一开会')
  assert.equal(out.dueDate, null)
  assert.equal(out.title, '每周一开会')
})

test('时间：显式与中文时段', () => {
  assert.equal(parse('明天 15:00 交周报').dueTime, '15:00')
  assert.equal(parse('明天下午3点 交周报').dueTime, '15:00')
  assert.equal(parse('明天下午3点半 交周报').dueTime, '15:30')
  assert.equal(parse('明天中午 吃饭').dueTime, '12:00')
})

test('只给时间不给日期时按今天', () => {
  const out = parse('下午3点 交周报')
  assert.equal(out.dueDate, '2026-10-22')
  assert.equal(out.dueTime, '15:00')
})

test('优先级', () => {
  assert.equal(parse('交周报 p1').priority, 'high')
  assert.equal(parse('交周报 p2').priority, 'medium')
  assert.equal(parse('交周报 p3').priority, 'low')
  assert.equal(parse('交周报!').priority, 'high')
})

test('分类，且不吃进 C#编程', () => {
  assert.equal(parse('交周报 #工作').category, '工作')
  const code = parse('学 C#编程')
  assert.equal(code.category, null)
  assert.equal(code.title, '学 C#编程')
})

test('多字段组合，标题只剩正文', () => {
  const out = parse('明天下午3点 交周报 #工作 p1')
  assert.deepEqual(
    { title: out.title, dueDate: out.dueDate, dueTime: out.dueTime, priority: out.priority, category: out.category },
    { title: '交周报', dueDate: '2026-10-23', dueTime: '15:00', priority: 'high', category: '工作' },
  )
  assert.equal(out.matched.length, 4)
})

test('整行都是语法时退回原文当标题', () => {
  const out = parse('明天 p1 #工作')
  assert.equal(out.title, '明天 p1 #工作')
})

test('空输入', () => {
  assert.deepEqual(parse(''), {
    title: '', dueDate: null, dueTime: null, priority: null, category: null, matched: [],
  })
})
