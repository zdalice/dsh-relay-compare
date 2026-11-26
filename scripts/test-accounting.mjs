/**
 * 账目验证:真的把宿主半边跑起来,灌入假的 llm/stream 用量,
 * 再从 /dsh-relay-compare/state 把快照读回来,核对三套口径的算术。
 *
 * 全程只写一个隔离的临时 DSH_HOME,不碰真实账本,不联网。
 *
 * 重点核对「调用当时档位」口径(0.1.8 新增):
 *   officialAt = Σ(每次调用真实档位的官方价)
 *   saveAt     = officialAt - relayAt
 *   且必然夹在两个假设场景之间:saveOff <= saveAt <= savePeak
 *
 * 用法:node scripts/test-accounting.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const pluginDir = path.resolve(import.meta.dirname, '..')

// ---- 隔离的 DSH_HOME,绝不碰真实账本 -------------------------------------
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'drc-test-'))
process.env.DSH_HOME = home
const stateDir = path.join(home, 'storages', 'relay-compare')
fs.mkdirSync(stateDir, { recursive: true })

// 真实抓下来的 cxts 政策价(deepseek-flash),和内置官方价目对得上账
const PLATFORM = { 'deepseek-flash': { input: 0.954, cached: 0.0212, output: 3.816, discount: '4.8' } }
fs.writeFileSync(path.join(stateDir, 'state.json'), JSON.stringify({
  settings: {
    baseUrl: 'https://www.cxts.top',
    relayProviders: ['cxts'],
    priceSource: 'platform',
    refreshMinutes: 30,
    holidays: [],
    modelMap: {},
    manualPrices: {},
  },
  prices: { fetchedAt: Date.now(), error: null, list: {}, platform: PLATFORM, official: {} },
  days: {}, sessions: {}, migrations: ['per-call-diff-v1', 'call-time-tier-v1'],
}))

// ---- 假的 ctx:只实现插件真正用到的那几个接口 ----------------------------
const handlers = { stream: null, routes: new Map() }
const ctx = {
  on: (event, handler) => {
    if (event === 'llm/stream') handlers.stream = handler
  },
  effect: (fn) => fn(),
  webServer: {
    register: ({ path: routePath, handler }) => { handlers.routes.set(routePath, handler) },
  },
}

const mod = await import(pathToFileURL(path.join(pluginDir, 'index.js')).href)
mod.apply(ctx)

if (!handlers.stream) throw new Error('没拿到 llm/stream 处理器')
if (!handlers.routes.has('/dsh-relay-compare/state')) throw new Error('没注册 /state 路由')

/** 灌一次调用:next() 产出 usage 块,wrapper 在 finally 里记账。 */
async function call({ atMs, input, cacheRead, output }) {
  const realNow = Date.now
  Date.now = () => atMs
  try {
    const next = () => (async function* downstream() {
      yield { type: 'text', text: '…' }
      yield { type: 'usage', usage: { inputTokens: input, cacheReadTokens: cacheRead, cacheWriteTokens: 0, outputTokens: output, reasoningTokens: 0 } }
    })()
    const stream = handlers.stream({ model: 'deepseek-flash', provider: 'cxts', sessionId: 's1' }, next)
    for await (const _ of stream) { /* 消费掉,触发 finally */ }
  } finally {
    Date.now = realNow
  }
}

/** 走真实 HTTP 处理器读快照(自己造最小 req/res)。 */
function snapshot() {
  let payload = null
  handlers.routes.get('/dsh-relay-compare/state')(
    { url: '/dsh-relay-compare/state?sessionId=s1' },
    { writeHead: () => {}, end: (body) => { payload = JSON.parse(body) } },
  )
  return payload
}

// 北京时间:周四 10:00(高峰) / 周四 22:00(空闲)
const PEAK_AT = Date.parse('2026-11-26T10:00:00+08:00')
const OFF_AT = Date.parse('2026-11-26T22:00:00+08:00')

// 一次高峰调用 + 一次空闲调用,用量刻意不同,避免巧合相等掩盖错误
await call({ atMs: PEAK_AT, input: 1_000_000, cacheRead: 10_000_000, output: 100_000 })
await call({ atMs: OFF_AT, input: 2_000_000, cacheRead: 20_000_000, output: 200_000 })

const snap = snapshot()
const s = snap.session.total
const r = (n) => Math.round(n * 1e6) / 1e6
const fmt = (n) => r(Number(n)).toFixed(6)

const failures = []
const check = (label, actual, expected, tol = 1e-6) => {
  const ok = Math.abs(actual - expected) <= tol
  if (!ok) failures.push(`${label}: 实际 ${fmt(actual)} ≠ 期望 ${fmt(expected)}`)
  console.log(`  ${ok ? '✅' : '❌'} ${label.padEnd(38)} ${fmt(actual)}  (期望 ${fmt(expected)})`)
}

// ---- 手算期望值 -----------------------------------------------------------
const OFFICIAL = { peak: { cached: 0.04, miss: 2, out: 8 }, off: { cached: 0.02, miss: 1, out: 4 } }
const officialCost = (tier, u) =>
  u.cacheRead / 1e6 * OFFICIAL[tier].cached + u.input / 1e6 * OFFICIAL[tier].miss + u.output / 1e6 * OFFICIAL[tier].out
const relayCost = (u) =>
  u.cacheRead / 1e6 * PLATFORM['deepseek-flash'].cached + u.input / 1e6 * PLATFORM['deepseek-flash'].input + u.output / 1e6 * PLATFORM['deepseek-flash'].output

const uPeak = { input: 1_000_000, cacheRead: 10_000_000, output: 100_000 }
const uOff = { input: 2_000_000, cacheRead: 20_000_000, output: 200_000 }

const want = {
  officialPeak: officialCost('peak', uPeak) + officialCost('peak', uOff),
  officialOff: officialCost('off', uPeak) + officialCost('off', uOff),
  relay: relayCost(uPeak) + relayCost(uOff),
  officialAt: officialCost('peak', uPeak) + officialCost('off', uOff),
}

console.log(`\n会话快照: ${s.calls} 次调用 / atCalls ${s.atCalls}\n`)
console.log('两个假设场景(全落高峰 / 全落空闲):')
check('officialPeak', s.officialPeak, want.officialPeak)
check('officialOff', s.officialOff, want.officialOff)
check('relay', s.relay, want.relay)
console.log('\n调用当时档位(0.1.8 新口径):')
check('officialAt', s.officialAt, want.officialAt)
check('relayAt', s.relayAt, want.relay)
check('saveAt', s.saveAt, want.officialAt - want.relay)
check('atCalls', s.atCalls, 2)
console.log('\n交叉验证:')
check('savePeak = officialPeak - relay', s.savePeak, want.officialPeak - want.relay)
check('saveOff  = officialOff - relay', s.saveOff, want.officialOff - want.relay)
check('saveAt   = officialAt - relayAt(内部自洽)', s.saveAt, s.officialAt - s.relayAt)

const bracketOk = s.saveOff <= s.saveAt + 1e-9 && s.saveAt <= s.savePeak + 1e-9
if (!bracketOk) failures.push(`saveAt 没夹在两场景之间: ${fmt(s.saveOff)} <= ${fmt(s.saveAt)} <= ${fmt(s.savePeak)} 不成立`)
console.log(`  ${bracketOk ? '✅' : '❌'} saveOff <= saveAt <= savePeak          ${fmt(s.saveOff)} <= ${fmt(s.saveAt)} <= ${fmt(s.savePeak)}`)

const peakShare = want.officialAt / want.officialPeak
console.log(`\n参考:官方价的高峰占比 = ${(peakShare * 100).toFixed(1)}%  →  实际省 ${fmt(s.saveAt)} 是「全落高峰」${fmt(s.savePeak)} 的 ${(s.saveAt / s.savePeak * 100).toFixed(1)}%`)

// ---- 老账本迁移:不该凭空造出 officialAt/saveAt --------------------------
// 旧条目没有档位记录,迁移必须只补 0;若哪天有人改成「估算」,这里会失败。
const legacyDir = path.join(home, 'storages', 'relay-compare', 'state.json')
const legacy = JSON.parse(fs.readFileSync(legacyDir, 'utf8'))
const legacyEntry = { input: 1e6, cacheRead: 1e7, cacheWrite: 0, output: 1e5, reasoning: 0, calls: 5, officialPeak: 9.6, officialOff: 4.8, relay: 4.64 }
legacy.days = { '2026-11-20': { date: '2026-11-20', total: { ...legacyEntry }, byKey: {} } }
legacy.sessions = {}
legacy.migrations = []
fs.writeFileSync(legacyDir, JSON.stringify(legacy))

// 重新 apply 一遍,让它走迁移
const freshHome = fs.mkdtempSync(path.join(os.tmpdir(), 'drc-legacy-'))
process.env.DSH_HOME = freshHome
fs.mkdirSync(path.join(freshHome, 'storages', 'relay-compare'), { recursive: true })
fs.writeFileSync(path.join(freshHome, 'storages', 'relay-compare', 'state.json'), JSON.stringify(legacy))
handlers.routes.clear()
mod.apply(ctx)
const legacySnap = snapshot()
const lt = legacySnap.total
console.log('\n老账本迁移(必须只补 0,不估算):')
for (const [k, label] of [['officialAt', 'officialAt'], ['relayAt', 'relayAt'], ['saveAt', 'saveAt'], ['atCalls', 'atCalls']]) {
  const ok = lt[k] === 0
  if (!ok) failures.push(`迁移给老条目编了 ${label}=${lt[k]},应为 0`)
  console.log(`  ${ok ? '✅' : '❌'} ${label} = ${lt[k]}(老条目没有档位记录,只能为 0)`)
}
const keptCalls = lt.calls === 5
if (!keptCalls) failures.push(`迁移弄丢了老账本的调用数: ${lt.calls} ≠ 5`)
console.log(`  ${keptCalls ? '✅' : '❌'} 老账本的 calls 保留 = ${lt.calls}`)

fs.rmSync(home, { recursive: true, force: true })
fs.rmSync(freshHome, { recursive: true, force: true })
console.log(failures.length ? `\n❌ ${failures.length} 项不符:\n  - ${failures.join('\n  - ')}` : '\n✅ 全部通过')
process.exit(failures.length ? 1 : 0)
