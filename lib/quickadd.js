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
  // 候选按语法优先级排列；先探测、命中即停：只有被采用的那个片段会被 take() 摘走，
  // 其余日期短语原样留在标题里。顺序不能随便调——nextWeek 必须先于 weekday，
  // 否则「下周五」会被 weekday 抢先匹配成「周五」。
  const dateCandidates = [
    {
      re: new RegExp(`(${Object.keys(RELATIVE).join('|')})`),
      date: (m) => shift(today, RELATIVE[m[1]]),
    },
    {
      re: /(\d{1,3})\s*天后/,
      date: (m) => shift(today, Number(m[1])),
    },
    {
      re: /下(?:个)?月(\d{1,2})[号日]/,
      date: (m) => {
        const base = parseKey(today)
        const year = base.getFullYear() + (base.getMonth() + 1 > 11 ? 1 : 0)
        const month = (base.getMonth() + 1) % 12
        const last = new Date(year, month + 1, 0).getDate()
        return localKey(new Date(year, month, Math.min(Number(m[1]), last)))
      },
    },
    {
      re: /(?<!\d)(0?[1-9]|1[0-2])\s*[月/]\s*(\d{1,2})\s*[日号]?/,
      date: (m) => {
        const month = Number(m[1])
        const day = Number(m[2])
        const year = parseKey(today).getFullYear()
        const last = new Date(year, month, 0).getDate()
        let candidate = localKey(new Date(year, month - 1, Math.min(day, last)))
        if (candidate < shift(today, -180)) candidate = localKey(new Date(year + 1, month - 1, Math.min(day, last)))
        return candidate
      },
    },
    {
      re: /(?:本|这(?:个)?|下个?)?月底/,
      date: (m) => {
        const base = parseKey(today)
        const month = base.getMonth() + (m[0].startsWith('下') ? 1 : 0)
        return localKey(new Date(base.getFullYear(), month + 1, 0))
      },
    },
    {
      re: /下(?:个)?(?:周|星期|礼拜)(?!末)([一二三四五六日天])?/,
      date: (m) => {
        const weekdayIndex = m[1] === undefined ? 1 : CN_WEEKDAY[m[1]]
        return shift(nextWeekday(today, 1), (weekdayIndex - 1 + 7) % 7)
      },
    },
    {
      re: /(?:本|这)(?:周|星期|礼拜)(?!末)([一二三四五六日天])?/,
      date: (m) => {
        const weekdayIndex = m[1] === undefined ? 1 : CN_WEEKDAY[m[1]]
        return shift(today, weekdayIndex - parseKey(today).getDay())
      },
    },
    {
      re: /(?<!每)(?:周|星期|礼拜)([一二三四五六日天])/,
      date: (m) => nextWeekday(today, CN_WEEKDAY[m[1]]),
    },
  ]

  for (const candidate of dateCandidates) {
    if (!candidate.re.test(text)) continue
    dueDate = candidate.date(take(candidate.re))
    break
  }

  // ---- 4. 时间
  const colon = take(/(?<!\d)([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d)(?!\d)/)
  if (colon !== null) {
    dueTime = `${String(Number(colon[1])).padStart(2, '0')}:${colon[2]}`
  } else {
    // 数字钟点必须先于裸「中午」：中午1点 → 13:00，中午12点 → 12:00。
    const cn = take(/(上午|早上|早晨|凌晨|中午|下午|傍晚|晚上|夜里|午夜|半夜)?\s*(\d{1,2})\s*[点時时](半|\d{1,2}\s*分?)?/)
    if (cn !== null) {
      const period = cn[1] ?? ''
      let hour = Number(cn[2])
      let minute = 0
      if (cn[3] === '半') minute = 30
      else if (cn[3] !== undefined) minute = Number(cn[3].replace(/\D/g, '')) || 0
      // 「中午」只有 1–5 点表示午后（中午1点=13:00）；10/11 点指临近正午，不加 12。
      if (period === '中午') {
        if (hour <= 5) hour += 12
      } else if (['下午', '傍晚', '晚上', '夜里'].includes(period) && hour < 12) {
        hour += 12
      }
      if (['上午', '早上', '早晨', '凌晨', '午夜', '半夜', '晚上', '夜里'].includes(period) && hour === 12) hour = 0
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
