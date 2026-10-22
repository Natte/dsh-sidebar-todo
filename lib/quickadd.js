/**
 * One-line natural-language quick add.
 *
 * 剥离式解析：每识别一个片段就从原文里摘掉，剩下的就是标题；识别不了的
 * 一律留在标题里，绝不吞字符。
 * 顺序即语法：分类 → 优先级 → 日期 → 时间。
 * 模式借鉴 dsh-todos 的 quickadd.js（MIT），代码按本插件字段重写。
 */

const CN_WEEKDAY = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 0 }
const RELATIVE = { 今天: 0, 今日: 0, 明天: 1, 明日: 1, 后天: 2, 大后天: 3, 昨天: -1, 前天: -2 }

/** `#`、`pN`、`!` 必须出现在行首/空白/中文之后，避免 C#编程、p1abc 被误伤。 */
const SIGIL = '(?<=^|[\\s\\u3000-\\u303f\\u4e00-\\u9fff])'

function localKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function shift(key, days) {
  const at = parseKey(key)
  at.setDate(at.getDate() + days)
  return localKey(at)
}

function nextWeekday(todayKey, weekday) {
  const current = parseKey(todayKey).getDay()
  let delta = (weekday - current + 7) % 7
  if (delta === 0) delta = 7
  return shift(todayKey, delta)
}

export function parseQuickAdd(input, options = {}) {
  const today = options.today ?? localKey(new Date())
  let text = ` ${String(input ?? '')} `
  const matched = []

  const take = (re) => {
    const m = re.exec(text)
    if (m === null) return null
    const before = text.slice(0, m.index)
    const after = text.slice(m.index + m[0].length)
    // 中文句中摘掉「明天」不能留空格（记得明天交 → 记得交），英文之间才补空格。
    const joiner = /[\u4e00-\u9fff]/.test(before.slice(-1)) && /[\u4e00-\u9fff]/.test(after.slice(0, 1)) ? '' : ' '
    text = `${before}${joiner}${after}`
    matched.push(m[0].trim())
    return m
  }

  let dueDate = null
  let dueTime = null
  let priority = null
  let category = null

  // ---- 1. 分类
  const tag = take(new RegExp(`${SIGIL}#([^\\s#,.;:!?()，。、；：！？（）]+)`))
  if (tag !== null) category = tag[1]

  // ---- 2. 优先级
  const p = take(new RegExp(`${SIGIL}[pP]([123])(?=\\s|$)`))
  if (p !== null) priority = { 1: 'high', 2: 'medium', 3: 'low' }[p[1]]
  else if (take(new RegExp(`${SIGIL}[!！](?=\\s|$)`)) !== null) priority = 'high'

  // ---- 3. 日期
  const relative = take(new RegExp(`(${Object.keys(RELATIVE).join('|')})`))
  if (relative !== null) {
    dueDate = shift(today, RELATIVE[relative[1]])
  } else {
    const inDays = take(/(\d{1,3})\s*天后/)
    const nextMonthDay = take(/下(?:个)?月(\d{1,2})[号日]/)
    const absolute = take(/(?<!\d)(0?[1-9]|1[0-2])\s*[月/]\s*(\d{1,2})\s*[日号]?/)
    const monthEnd = take(/(?:本|这(?:个)?|下个?)?月底/)
    const nextWeek = take(/下(?:个)?(?:周|星期|礼拜)(?!末)([一二三四五六日天])?/)
    const thisWeek = take(/(?:本|这)(?:周|星期|礼拜)(?!末)([一二三四五六日天])?/)
    const weekday = take(/(?<!每)(?:周|星期|礼拜)([一二三四五六日天])/)

    if (inDays !== null) dueDate = shift(today, Number(inDays[1]))
    else if (nextMonthDay !== null) {
      const base = parseKey(today)
      const year = base.getFullYear() + (base.getMonth() + 1 > 11 ? 1 : 0)
      const month = (base.getMonth() + 1) % 12
      const last = new Date(year, month + 1, 0).getDate()
      dueDate = localKey(new Date(year, month, Math.min(Number(nextMonthDay[1]), last)))
    } else if (absolute !== null) {
      const month = Number(absolute[1])
      const day = Number(absolute[2])
      if (month >= 1 && month <= 12) {
        const year = parseKey(today).getFullYear()
        const last = new Date(year, month, 0).getDate()
        let candidate = localKey(new Date(year, month - 1, Math.min(day, last)))
        if (candidate < shift(today, -180)) candidate = localKey(new Date(year + 1, month - 1, Math.min(day, last)))
        dueDate = candidate
      }
    } else if (monthEnd !== null) {
      const base = parseKey(today)
      const month = base.getMonth() + (monthEnd[0].startsWith('下') ? 1 : 0)
      dueDate = localKey(new Date(base.getFullYear(), month + 1, 0))
    } else if (nextWeek !== null) {
      const weekdayIndex = nextWeek[1] === undefined ? 1 : CN_WEEKDAY[nextWeek[1]]
      dueDate = shift(nextWeekday(today, 1), (weekdayIndex - 1 + 7) % 7)
    } else if (thisWeek !== null) {
      const weekdayIndex = thisWeek[1] === undefined ? 1 : CN_WEEKDAY[thisWeek[1]]
      dueDate = shift(today, weekdayIndex - parseKey(today).getDay())
    } else if (weekday !== null) {
      dueDate = nextWeekday(today, CN_WEEKDAY[weekday[1]])
    }
  }

  // ---- 4. 时间
  const colon = take(/(?<!\d)([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d)(?!\d)/)
  if (colon !== null) {
    dueTime = `${String(Number(colon[1])).padStart(2, '0')}:${colon[2]}`
  } else {
    // 数字钟点必须先于裸「中午」：中午1点 → 13:00，中午12点 → 12:00。
    const cn = take(/(上午|早上|早晨|凌晨|中午|下午|傍晚|晚上|夜里)?\s*(\d{1,2})\s*[点時时](半|\d{1,2}\s*分?)?/)
    if (cn !== null) {
      const period = cn[1] ?? ''
      let hour = Number(cn[2])
      let minute = 0
      if (cn[3] === '半') minute = 30
      else if (cn[3] !== undefined) minute = Number(cn[3].replace(/\D/g, '')) || 0
      if (['中午', '下午', '傍晚', '晚上', '夜里'].includes(period) && hour < 12) hour += 12
      if (['上午', '早上', '早晨', '凌晨'].includes(period) && hour === 12) hour = 0
      if (hour <= 23 && minute <= 59) dueTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    } else if (take(/(?:正午|中午)/) !== null) {
      dueTime = '12:00'
    } else if (take(/(?:午夜|半夜)/) !== null) {
      dueTime = '00:00'
    }
  }
  if (dueTime !== null && dueDate === null) dueDate = today

  const cleaned = text.replace(/\s+/g, ' ').trim()
  const raw = String(input ?? '').trim()

  return {
    title: cleaned === '' ? raw : cleaned,
    dueDate,
    dueTime,
    priority,
    category,
    matched,
  }
}
