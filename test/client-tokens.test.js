import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8')

// 只匹配 var(--dsw-…)，不匹配普通字符串或注释里出现的 token 名。
const TOKEN_REF = /var\(\s*(--dsw-[a-z0-9-]+)/g
// 十六进制颜色；边界排除 #dsw…、#${…}、Markdown 锚点之类的误判。
const HEX_COLOR = /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![\w-])/g
// 纯白描边/反色文字允许硬编码，其余颜色必须走主题变量。
const ALLOWED_HEX = new Set(['#fff', '#ffffff'])

function matches(regex, text) {
  return Array.from(text.matchAll(regex), (match) => ({
    value: match[1] ?? match[0],
    line: text.slice(0, match.index).split('\n').length,
  }))
}

test('client.js 引用的主题 token 都在宿主白名单里', () => {
  const { tokens } = JSON.parse(read('test/theme-tokens.json'))
  assert.ok(Array.isArray(tokens) && tokens.length > 0, 'test/theme-tokens.json 的 tokens 不能为空')

  const source = read('client.js')
  const refs = matches(TOKEN_REF, source)
  assert.ok(refs.length > 0, 'client.js 里应当有 var(--dsw-…) 引用')

  const known = new Set(tokens)
  const missing = [...new Set(refs.filter((ref) => !known.has(ref.value)).map((ref) => ref.value))]
  assert.deepEqual(
    missing,
    [],
    `client.js 引用了宿主未定义的 token（声明会静默失效）：${missing.join('、')}`,
  )
})

test('client.js 没有硬编码的十六进制颜色（纯白除外）', () => {
  const source = read('client.js')
  const colors = matches(HEX_COLOR, source)
    .filter((color) => !ALLOWED_HEX.has(color.value.toLowerCase()))
    .map((color) => `第 ${color.line} 行 ${color.value}`)
  assert.deepEqual(
    colors,
    [],
    `client.js 出现硬编码颜色，请改用主题变量：\n${colors.join('\n')}`,
  )
})
