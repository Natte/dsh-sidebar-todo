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

test('越界月份不吞字', () => {
  const out = parse('31/10 交房租')
  assert.equal(out.dueDate, null)
  assert.equal(out.title, '31/10 交房租')
})

test('合法的 M/D 仍解析', () => {
  const out = parse('10/25 交材料')
  assert.equal(out.dueDate, '2026-10-25')
  assert.equal(out.title, '交材料')
})

test('下个月底整体匹配，不被「月底」抢先', () => {
  const out = parse('下个月底 交材料')
  assert.equal(out.dueDate, '2026-11-30')
  assert.equal(out.title, '交材料')
})

test('「下周末」不啃掉半个词', () => {
  const out = parse('下周末 打球')
  assert.equal(out.dueDate, null)
  assert.equal(out.title, '下周末 打球')
})

test('「每周一」不能被当成日期', () => {
  const out = parse('每周一开会')
  assert.equal(out.dueDate, null)
  assert.equal(out.title, '每周一开会')
})

test('时间：显式与中文时段', () => {
  const explicit = parse('明天 15:00 交周报')
  assert.equal(explicit.dueTime, '15:00')
  assert.equal(explicit.title, '交周报')
  assert.equal(parse('明天下午3点 交周报').dueTime, '15:00')
  assert.equal(parse('明天下午3点半 交周报').dueTime, '15:30')
  const noon = parse('明天中午 吃饭')
  assert.equal(noon.dueTime, '12:00')
  assert.equal(noon.title, '吃饭')
})

test('中午1点按下午换算为 13:00', () => {
  const out = parse('中午1点 吃饭')
  assert.equal(out.dueTime, '13:00')
  assert.equal(out.title, '吃饭')
})

test('中午12点仍是 12:00', () => {
  const out = parse('中午12点 吃饭')
  assert.equal(out.dueTime, '12:00')
  assert.equal(out.title, '吃饭')
})

test('半夜12点按 00:00 且整段匹配', () => {
  const out = parse('半夜12点 交周报')
  assert.equal(out.dueTime, '00:00')
  assert.ok(out.matched.includes('半夜12点'))
})

test('午夜1点按 01:00', () => {
  assert.equal(parse('午夜1点 交周报').dueTime, '01:00')
})

test('中午10点按 10:00，不再 +12', () => {
  assert.equal(parse('中午10点 开会').dueTime, '10:00')
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
  const work = parse('交周报 #工作')
  assert.equal(work.category, '工作')
  assert.equal(work.title, '交周报')
  const code = parse('学 C#编程')
  assert.equal(code.category, null)
  assert.equal(code.title, '学 C#编程')
})

test('分类不吃尾随 ASCII 标点', () => {
  assert.equal(parse('交周报 #工作, 明天').category, '工作')
  assert.equal(parse('交周报 #工作，明天').category, '工作')
})

test('多字段组合，标题只剩正文', () => {
  const out = parse('明天下午3点 交周报 #工作 p1')
  assert.deepEqual(
    { title: out.title, dueDate: out.dueDate, dueTime: out.dueTime, priority: out.priority, category: out.category },
    { title: '交周报', dueDate: '2026-10-23', dueTime: '15:00', priority: 'high', category: '工作' },
  )
  assert.deepEqual(out.matched, ['#工作', 'p1', '明天', '下午3点'])
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
