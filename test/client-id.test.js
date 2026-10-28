import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8')

// 宿主用 npm 包名给客户端 bundle 定身份（dsh-client-modules：解析出的 manifest 包名即浏览器模块身份）。
// 注册 id 与包名不一致时，那条 row 永远等不到自己的 factory，于是回退到单资源 URL 再执行一遍，
// 第二次注册直接抛 duplicate factory registration → 该条目 import 失败 → 整个窗口「应用无法启动」。
// 0.2.0 就是改了包名漏改 id 才炸的，这条测试钉死两者相等。
test('client.js 的 __ModuleLoader__ 注册 id 必须等于包名', () => {
  const { name } = JSON.parse(read('package.json'))
  const match = /__ModuleLoader__\s*\.\s*load\s*\(\s*\{\s*id\s*:\s*['"]([^'"]+)['"]/.exec(read('client.js'))

  assert.ok(match, 'client.js 应当以 window.__ModuleLoader__.load({ id, factory }) 形式注册')
  assert.equal(match[1], name, `注册 id "${match[1]}" 与包名 "${name}" 不一致，宿主会启动失败`)
})
