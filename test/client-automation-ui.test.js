import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8')
const source = read('client.js')

// 与 client-id.test.js / client-tokens.test.js 同一手法：client.js 是浏览器内联模块（依赖
// window.__ModuleLoader__），没有 jsdom / 依赖包可加载，因此按「读源码 + 正则断言」钉 UI 契约。
// 依据：docs/specs/2026-11-16-dsh-todolist-v4-design.md §十 与 design/mock-automation-sync.html。

// —— 源码切片：dict.zh / dict.en 两段 ——
const zhStart = source.indexOf('zh: {')
const enStart = source.indexOf('en: {', zhStart)
const dictEnd = source.indexOf('const ORDER')
const zhBlock = source.slice(zhStart, enStart)
const enBlock = source.slice(enStart, dictEnd)

const DICT_KEY = /^[ \t]+([A-Za-z][A-Za-z0-9]*):/gm
const keysIn = (block) => new Set([...block.matchAll(DICT_KEY)].map((match) => match[1]))
const zhKeys = keysIn(zhBlock)
const enKeys = keysIn(enBlock)
const AUTO_KEYS = [...zhKeys].filter((key) => key.startsWith('automation'))

// §十 词典键基线：automation 相关键 zh/en 成对完整、值非空
const REQUIRED_AUTO_KEYS = [
  'automationToggle', 'automationTime', 'automationUnavailable', 'automationStatLabel',
  'automationErrorShort', 'automationConfirmTitle', 'automationConfirmBody', 'automationConfirmOk',
  'automationNoticeUnavailable', 'automationNoticeFailed', 'automationNoticeCleared',
  'automationTooltipOk', 'automationTooltipPartial', 'automationTooltipError', 'automationTooltipOrphan',
  'automationTooltipStat', 'automationTooltipUnavailable', 'automationTooltipTimeNew', 'automationTooltipTimeEdit',
]

test('automation 词典键 zh/en 成对完整且值非空（§十）', () => {
  for (const key of REQUIRED_AUTO_KEYS) {
    assert.ok(zhKeys.has(key), `dict.zh 缺少 ${key}`)
    assert.ok(enKeys.has(key), `dict.en 缺少 ${key}`)
    const zhValue = new RegExp(`${key}: '([^']*)'`).exec(zhBlock)?.[1]
    const enValue = new RegExp(`${key}: '([^']*)'`).exec(enBlock)?.[1]
    assert.ok(zhValue && zhValue.length > 0, `${key} 的 zh 文案不能为空`)
    assert.ok(enValue && enValue.length > 0, `${key} 的 en 文案不能为空`)
  }
  assert.deepEqual(
    [...AUTO_KEYS].sort(),
    [...REQUIRED_AUTO_KEYS].sort(),
    `dict.zh 的 automation* 键与基线不一致，多出/缺少：${AUTO_KEYS.filter((key) => !REQUIRED_AUTO_KEYS.includes(key)).join('、')}`,
  )
})

// §十① 少字白名单：automation 新增「常驻」文案的 zh 值必须逐字落在白名单内。
// toast（automationNotice*）与 tooltip（automationTooltip*）非常驻，明确不受白名单约束；
// 状态徽标 ok/partial/error/orphan 为 §三 枚举原词，直接渲染、不经词典。
const RESIDENT_WHITELIST = [
  '同时创建/同步自动化任务', // 开关标签
  '提醒时间', // 时间控件标签
  '暂不可用', // 降级短标签
  '自动化同步', // 单行同步状态行标签（mock 态③，用户确认的视觉稿）
  '同步失败，保存时重试', // 错误短消息
  '关闭自动化同步？', // 确认弹层标题
  '将同时删除自动化任务', // 确认弹层正文
  '删除自动化任务', // 确认弹层确认按钮（「取消/保存」复用既有 cancel/save 键）
]
const RESIDENT_KEYS = REQUIRED_AUTO_KEYS.filter((key) => !key.startsWith('automationNotice') && !key.startsWith('automationTooltip'))

test('automation 常驻文案全部落在 §十① 白名单内（少字原则）', () => {
  for (const key of RESIDENT_KEYS) {
    const value = new RegExp(`${key}: '([^']*)'`).exec(zhBlock)?.[1]
    assert.ok(
      RESIDENT_WHITELIST.includes(value),
      `${key} 的常驻文案「${value}」不在 §十① 白名单内`,
    )
  }
})

function section(name, next) {
  const start = source.indexOf(name)
  assert.ok(start !== -1, `源码里应存在 ${name}`)
  const end = source.indexOf(next, start)
  return source.slice(start, end === -1 ? source.length : end)
}

// 态①（新建/开启）：Q6 默认关 + 预填序（§四）+ 开关行位置 + 内联提醒时间控件
test('态①：开关默认关（Q6），位于结束日期区之下，开启内联提醒时间并按 §四 预填', () => {
  assert.match(
    source,
    /const \[autoOn, setAutoOn\] = useState\(\(\) => hadAutoSync\)/,
    'autoOn 初始态必须是「编辑既有 automation.enabled」，新建即为关（Q6）',
  )
  const prefill = section('function autoTimePrefill', 'autoStatTooltip')
  assert.ok(prefill.includes('automation.time'), '编辑预填第一优先取 automation.time')
  assert.ok(prefill.includes('splitTimeKey(synced)'), '既有 automation.time 需通过 HH:mm 校验才采用')
  assert.ok(prefill.includes("'09:00'"), '预填兜底 09:00')
  assert.ok(
    source.indexOf("t('fieldUntil')") !== -1 && source.indexOf("t('fieldUntil')") < source.indexOf("t('automationToggle')"),
    '开关行应位于结束日期（until）字段区之下',
  )
  assert.match(
    source,
    /h\(TimeField, \{ t, value: autoTime, onChange: changeAutoTime \}\)/,
    '开启时应内联渲染提醒时间控件',
  )
})

// 态②（降级）：capabilities.automation=false/缺失 → 开关禁用 + 「暂不可用」，原因收 tooltip
test('态②：capabilities 未开时开关禁用 + 「暂不可用」短标签，完整原因收 tooltip', () => {
  assert.match(source, /disabled: autoAvailable !== true/, 'capabilities.automation=false/缺失时开关必须禁用')
  assert.match(source, /t\('automationUnavailable'\)/, '降级需要「暂不可用」短标签')
  assert.match(source, /title: t\('automationTooltipUnavailable'\)/, '降级完整原因必须收进 tooltip')
  assert.match(
    source,
    /autoAvailable: state\.capabilities\?\.automation === true/,
    '能力位必须来自 list 响应的 result.capabilities.automation',
  )
})

// 态③（编辑回显）：四态徽标 + 单行同步状态；taskId 尾 8 位/绝对时间/lastError/orphan 详情全收 tooltip
test('态③：编辑回显四态徽标与单行同步状态，细节全部收 tooltip', () => {
  for (const name of ['badgeOk', 'badgePartial', 'badgeError', 'badgeOrphan']) {
    assert.ok(source.includes(`S.${name}`), `缺少 ${name} 徽标样式（ok=green/partial=warn/error=red/orphan=neutral-dashed）`)
  }
  assert.match(source, /t\('automationStatLabel'\)/, '编辑态应有单行同步状态行')
  assert.match(source, /noteRelTime\(t, autoSyncedAt\)/, '单行状态应展示相对上次同步时间')
  for (const key of ['automationTooltipStat', 'automationTooltipError']) {
    assert.match(source, new RegExp(`t\\('${key}'\\)`), `tooltip ${key} 应被实际使用`)
  }
  // partial/orphan/ok 的 tooltip 经 autoBadgeTooltip 以键名常量间接调用（t(key)），按段内键名断言。
  const badgeTooltipFn = section('function autoBadgeTooltip', 'const PRIORITY_COLOR')
  for (const key of ['automationTooltipOk', 'automationTooltipPartial', 'automationTooltipOrphan']) {
    assert.ok(badgeTooltipFn.includes(`'${key}'`), `徽标 tooltip ${key} 应被实际使用`)
  }
  assert.match(source, /t\('automationErrorShort'\)/, 'error 态应展示错误短消息「同步失败，保存时重试」')
  const statTooltip = section('function autoStatTooltip', 'autoBadgeTooltip')
  assert.ok(statTooltip.includes('slice(-8)'), 'taskId 尾 8 位应收进状态行 tooltip')
  assert.ok(statTooltip.includes('formatDateTime'), 'lastSyncedAt 绝对时间应收进状态行 tooltip')
})

// 关闭既有同步：确认弹层（§七 删除编排），确认后才提交 enabled:false
test('关闭既有同步必须经确认弹层「将同时删除自动化任务」', () => {
  assert.match(source, /t\('automationConfirmTitle'\)/, '应有确认弹层标题')
  assert.match(source, /t\('automationConfirmBody'\)/, '应有确认弹层正文')
  assert.match(source, /t\('automationConfirmOk'\)/, '应有确认弹层确认按钮')
  const toggleFn = section('const requestAutoToggle', 'const confirmAutoOff')
  assert.ok(toggleFn.includes('setAutoConfirm(true)'), '关闭既有同步应先弹确认')
  assert.ok(toggleFn.includes('hadAutoSync'), '确认仅针对「编辑既有同步」，新建/本无同步直接关')
  assert.match(source, /role: 'alertdialog'/, '确认层应为独立 alertdialog')
})

// 保存语义（§五）：动过开关才发 automation；开=enabled:true(+time)；关既有=enabled:false；未动=不传
test('保存语义：开=enabled:true，关既有=enabled:false，未动过开关不传 automation', () => {
  assert.match(source, /payload\.automation = \{ enabled: true \}/, '开启应提交 enabled:true')
  assert.match(source, /payload\.automation\.time = autoTime/, '开启应携带通过 HH:mm 校验的提醒时间')
  assert.match(source, /payload\.automation = \{ enabled: false \}/, '关闭既有同步应提交 enabled:false')
  assert.match(source, /if \(autoTouched && autoOn\)/, 'automation 意图必须以「动过开关/改过时间」为前提（未动不传）')
})

// 一次性提示（§十）：三条 toast 齐备；automation-unavailable 绝不能呈现为保存失败
test('一次性提示：unavailable / 同步失败 / 关联清除；unavailable 时关弹窗而非报错', () => {
  assert.match(source, /res\.error\?\.code === 'automation-unavailable'/, '应识别 automation-unavailable 降级响应')
  const degraded = section("res.error?.code === 'automation-unavailable'", 'setError(res.error?.message')
  assert.ok(degraded.includes('automationNoticeUnavailable'), '降级应给「待办已保存」语义的一次性提示')
  assert.ok(degraded.includes('onSaved()'), '降级时应关闭弹窗（待办本体已保存成功，不得让用户以为失败）')
  assert.match(source, /'schedule_not_found-cleared'/, '应处理 automationNotice=关联已被外部删除')
  assert.match(source, /t\('automationNoticeCleared'\)/, '关联清除应给一次性轻提示')
  assert.match(source, /result\?\.automation\?\.status === 'error'/, '同步失败应给非阻断提示')
  assert.match(source, /t\('automationNoticeFailed'\)/, '同步失败提示文案应存在')
})

// update 请求体形态回归（§五/§九B2/B3）：automation 必须与 id/patch 平级——宿主
// automationIntentOf 只认顶层 Object.hasOwn(input,'automation')；历史缺陷把 automation
// 塞进 patch 内层（PATCHABLE 静默丢弃）→ 编辑改提醒时间不生效、关闭开关不删宿主任务。
test('update 信封形态：构造点收敛为单一 const body，三键平级且 patch 字面量不含 automation', () => {
  const anchor = source.indexOf('const body = form.id === null')
  assert.ok(anchor !== -1, 'update 请求体必须收敛为单一 const body = … 构造点（形态断言锚点）')
  const buildLine = source.slice(anchor, source.indexOf('\n', anchor))
  assert.match(
    buildLine,
    /const body = form\.id === null \? payload : \{ id: form\.id, patch: payload, automation: payload\.automation \}/,
    'update 必须提交 { id, patch, automation } 三键平级（顶层 automation 才能到达 automationIntentOf）',
  )
  assert.match(
    source.slice(source.indexOf('mutate(', anchor)),
    /mutate\(form\.id === null \? 'create' : 'update', body\)/,
    'create/update 必须共用同一平级 body 构造点提交',
  )
  assert.doesNotMatch(
    source.slice(anchor, source.indexOf('mutate(', anchor)),
    /patch\s*:\s*\{[^}]*\bautomation\b/,
    'patch 字面量内不得夹带 automation 键（内层会被 PATCHABLE 静默丢弃）',
  )
})
