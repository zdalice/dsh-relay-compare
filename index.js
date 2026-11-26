/**
 * dsh-relay-compare — Host 半边
 *
 * 目标:把「每一次模型调用」的 token 用量,同时按
 *   1) DeepSeek 官方峰谷价(高峰/空闲两档)
 *   2) 第三方中转站(当前内置创想通算 cxts)公开销售价
 * 算出来,实时给出「用中转站省了多少钱」。
 *
 * 只读宿主:包裹 `llm/stream` 瀑布捕获 usage 块;不自建会话日志、不写会话事件。
 * 中转站价格来自其公开接口:/api/prices 与 /api/platform_price/public。
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const name = 'relay-compare'
export const inject = ['llm', 'webServer']

const ROUTE = '/dsh-relay-compare'
const BUILD = '0.1.8'
const STORAGE_DIR = 'storages/relay-compare'
const MAX_SESSIONS = 300
const REFRESH_FALLBACK_MINUTES = 30

/** 包装路由嵌套标记:同一次请求只在最外层记一次。 */
const streamDepth = new AsyncLocalStorage()

/** 官方 DeepSeek 价目(CNY / 1M tokens)。高峰 = 工作日 09:00-12:00 与 14:00-18:00(北京时间)。 */
const OFFICIAL_DEEPSEEK = {
  'deepseek-flash': {
    peak: { cached: 0.04, miss: 2, out: 8 },
    off: { cached: 0.02, miss: 1, out: 4 },
  },
  'deepseek-v4-flash': {
    peak: { cached: 0.1, miss: 3, out: 9 },
    off: { cached: 0.05, miss: 1.5, out: 4.5 },
  },
  'deepseek-v4-flash-0731': {
    peak: { cached: 0.1, miss: 3, out: 9 },
    off: { cached: 0.05, miss: 1.5, out: 4.5 },
  },
  'deepseek-v4-pro': {
    peak: { cached: 0.3, miss: 9, out: 27 },
    off: { cached: 0.15, miss: 4.5, out: 13.5 },
  },
  'deepseek-v4-pro-0813': {
    peak: { cached: 0.3, miss: 9, out: 27 },
    off: { cached: 0.15, miss: 4.5, out: 13.5 },
  },
  'deepseek-chat': {
    peak: { cached: 0.04, miss: 2, out: 8 },
    off: { cached: 0.02, miss: 1, out: 4 },
  },
  'deepseek-reasoner': {
    peak: { cached: 0.04, miss: 2, out: 8 },
    off: { cached: 0.02, miss: 1, out: 4 },
  },
}

const DEFAULT_SETTINGS = {
  baseUrl: 'https://www.cxts.top',
  relayProviders: ['cxts'],
  priceSource: 'platform',
  refreshMinutes: REFRESH_FALLBACK_MINUTES,
  holidays: [],
  modelMap: {},
  manualPrices: {},
}

const home = () => process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const stateFile = () => path.join(home(), STORAGE_DIR, 'state.json')

function emptyBuckets() {
  return { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0, calls: 0 }
}

function emptyCosts() {
  return {
    officialPeak: 0,
    officialOff: 0,
    relay: 0,
    actual: 0,
    // 只有官方与中转站两侧都有价时,差额才有定义;否则计入 unpricedCalls。
    savePeak: 0,
    saveOff: 0,
    pricedCalls: 0,
    unpricedCalls: 0,
    /**
     * 「调用当时档位」口径:同样这堆 token,官方按每次调用真实落在的那一档计价。
     * 上面 officialPeak/officialOff 是两个假设场景(全部落高峰 / 全部落空闲),
     * 这一组才是「如果当时走官方,实际会花多少」,差额 saveAt 也就是真实省下的钱。
     * 旧状态文件的峰谷分布无法还原,所以这组字段不迁移、只统计升级之后的调用,
     * 由 atCalls 记录覆盖了多少次,界面据此说明口径。
     */
    officialAt: 0,
    relayAt: 0,
    saveAt: 0,
    atCalls: 0,
  }
}

function addBuckets(target, source) {
  target.input = (target.input ?? 0) + (source.input ?? 0)
  target.cacheRead = (target.cacheRead ?? 0) + (source.cacheRead ?? 0)
  target.cacheWrite = (target.cacheWrite ?? 0) + (source.cacheWrite ?? 0)
  target.output = (target.output ?? 0) + (source.output ?? 0)
  target.reasoning = (target.reasoning ?? 0) + (source.reasoning ?? 0)
  target.calls = (target.calls ?? 0) + (source.calls ?? 0)
}

function addCosts(target, source) {
  // 兼容旧版状态文件里没有这些字段的条目:一律按 0 起算,避免累加成 NaN。
  target.officialPeak = (target.officialPeak ?? 0) + (source.officialPeak ?? 0)
  target.officialOff = (target.officialOff ?? 0) + (source.officialOff ?? 0)
  target.relay = (target.relay ?? 0) + (source.relay ?? 0)
  target.actual = (target.actual ?? 0) + (source.actual ?? 0)
  target.savePeak = (target.savePeak ?? 0) + (source.savePeak ?? 0)
  target.saveOff = (target.saveOff ?? 0) + (source.saveOff ?? 0)
  target.pricedCalls = (target.pricedCalls ?? 0) + (source.pricedCalls ?? 0)
  target.unpricedCalls = (target.unpricedCalls ?? 0) + (source.unpricedCalls ?? 0)
  target.officialAt = (target.officialAt ?? 0) + (source.officialAt ?? 0)
  target.relayAt = (target.relayAt ?? 0) + (source.relayAt ?? 0)
  target.saveAt = (target.saveAt ?? 0) + (source.saveAt ?? 0)
  target.atCalls = (target.atCalls ?? 0) + (source.atCalls ?? 0)
}

function mergeEntry(target, source) {
  addBuckets(target, source)
  addCosts(target, source)
}

function newEntry() {
  return { ...emptyBuckets(), ...emptyCosts() }
}

/** 北京时间(UTC+8)下的峰谷判定:周末与法定节假日全天空闲。 */
function isPeak(atMs, holidays) {
  const shifted = new Date(atMs + 8 * 3600 * 1000)
  const day = shifted.getUTCDay()
  if (day === 0 || day === 6) return false
  const ymd = shifted.toISOString().slice(0, 10)
  if (Array.isArray(holidays) && holidays.includes(ymd)) return false
  const hour = shifted.getUTCHours() + shifted.getUTCMinutes() / 60
  return (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18)
}

const localDate = (atMs) => new Date(atMs + 8 * 3600 * 1000).toISOString().slice(0, 10)

const per1M = (tokens, rate) => ((tokens || 0) / 1e6) * (rate || 0)

function costOf(buckets, price) {
  if (!price) return null
  // 官方价目用 miss/out,中转站公开价目用 input/output:统一在这里归一。
  const miss = price.miss ?? price.input ?? 0
  const out = price.out ?? price.output ?? 0
  const cached = price.cached ?? 0
  const cachedWrite = price.cachedWrite ?? cached
  return (
    per1M(buckets.cacheRead, cached) +
    per1M(buckets.cacheWrite, cachedWrite) +
    per1M(buckets.input, miss) +
    per1M(buckets.output + buckets.reasoning, out)
  )
}

function normalizeList(json) {
  const out = {}
  for (const row of json?.data ?? []) {
    if (!row || row.type !== 'tokens') continue
    const input = Number(row.input ?? 0)
    const ratio = Number(row.extra_ratios?.cached_tokens ?? 0)
    out[row.model] = {
      input,
      cached: Number((input * ratio).toFixed(6)),
      cachedRatio: ratio,
      output: Number(row.output ?? 0),
      discount: null,
    }
  }
  return out
}

function normalizePlatform(json) {
  const list = {}
  const official = {}
  for (const row of json?.data?.models ?? []) {
    if (!row || !row.model_id) continue
    const officialRow = row.official
    if (officialRow) {
      official[row.model_id] = {
        input: Number(officialRow.input ?? 0),
        cached: Number(officialRow.cached_input ?? 0),
        output: Number(officialRow.output ?? 0),
      }
    }
    if (row.configured && row.platform) {
      list[row.model_id] = {
        input: Number(row.platform.input ?? 0),
        cached: Number(row.platform.cached_input ?? 0),
        output: Number(row.platform.output ?? 0),
        discount: row.discount ?? null,
      }
    }
  }
  return { platform: list, official }
}

/**
 * 旧版状态文件只有 officialPeak/officialOff/relay,没有逐次差额字段。
 * 这里做一次性迁移:relay 有值说明当时两侧都有价(旧版按官方价减中转站价计费),
 * 差额可还原;relay 为 0 的条目视为「没有对照价」,不计入差额。
 * 迁移只跑一次,之后由 per-call 记账维护。
 */
function migrateEntry(entry) {
  if (!entry || typeof entry !== 'object') return
  const relay = entry.relay ?? 0
  const peak = entry.officialPeak ?? 0
  const off = entry.officialOff ?? peak
  if (relay > 0 && peak > 0) {
    entry.savePeak = peak - relay
    entry.saveOff = off - relay
    entry.pricedCalls = entry.calls ?? 0
    entry.unpricedCalls = 0
  } else {
    entry.savePeak = 0
    entry.saveOff = 0
    entry.pricedCalls = 0
    entry.unpricedCalls = entry.calls ?? 0
  }
}

/** 补齐历史字段;幂等,并对任何仍缺字段的条目兜底为 0,避免累加成 NaN。 */
function migrateState(state) {
  const migrations = Array.isArray(state.migrations) ? state.migrations : []
  const firstRun = !migrations.includes('per-call-diff-v1')
  for (const day of Object.values(state.days)) {
    if (firstRun) migrateEntry(day.total)
    for (const entry of Object.values(day.byKey ?? {})) if (firstRun) migrateEntry(entry)
  }
  for (const session of Object.values(state.sessions)) {
    if (firstRun) migrateEntry(session.total)
    for (const entry of Object.values(session.byKey ?? {})) if (firstRun) migrateEntry(entry)
  }
  if (firstRun) migrations.push('per-call-diff-v1')

  /**
   * call-time-tier-v1:officialAt/relayAt/saveAt/atCalls 是按「调用当时档位」逐次累加的。
   * 旧条目的峰谷分布已经丢了,还原不出来,所以这里只补 0 —— 不估算、不假设,
   * 让 atCalls 如实说明覆盖了多少次调用,而不是编一个看起来合理的数。
   */
  if (!migrations.includes('call-time-tier-v1')) {
    for (const bucket of [state.days, state.sessions]) {
      for (const group of Object.values(bucket)) {
        for (const entry of [group.total, ...Object.values(group.byKey ?? {})]) {
          if (!entry || typeof entry !== 'object') continue
          entry.officialAt ??= 0
          entry.relayAt ??= 0
          entry.saveAt ??= 0
          entry.atCalls ??= 0
        }
      }
    }
    migrations.push('call-time-tier-v1')
  }

  state.migrations = migrations
  return state
}

function loadState() {
  const file = stateFile()
  let raw = null
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    raw = null
  }
  const state = {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    prices: { fetchedAt: 0, error: null, list: {}, platform: {}, official: {} },
    days: {},
    sessions: {},
  }
  if (raw && typeof raw === 'object') {
    state.settings = { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) }
    state.prices = { ...state.prices, ...(raw.prices ?? {}) }
    state.days = raw.days && typeof raw.days === 'object' ? raw.days : {}
    state.sessions = raw.sessions && typeof raw.sessions === 'object' ? raw.sessions : {}
  }
  return migrateState(state)
}

function saveState(file, state) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(state))
    fs.renameSync(tmp, file)
  } catch (error) {
    console.warn(`[${name}] 状态写入失败: ${String(error?.message ?? error)}`)
  }
}

export function apply(ctx) {
  const file = stateFile()
  const state = loadState()
  let dirty = false
  let timer = null
  let cancelled = false

  const markDirty = () => {
    if (dirty) return
    dirty = true
    timer = setTimeout(() => {
      timer = null
      dirty = false
      saveState(file, state)
    }, 1500)
    timer.unref?.()
  }

  // ---------- 价格 ----------
  const providerPriceFor = (model) => {
    const settings = state.settings
    const mapped = settings.modelMap?.[model] ?? model
    const manual = settings.manualPrices?.[mapped] ?? settings.manualPrices?.[model]
    if (manual && (manual.input != null || manual.output != null)) {
      return {
        relay: { input: Number(manual.input ?? 0), cached: Number(manual.cached ?? 0), output: Number(manual.output ?? 0), discount: null },
        relayModel: mapped,
        source: 'manual',
      }
    }
    const platform = state.prices.platform?.[mapped]
    const list = state.prices.list?.[mapped]
    if (settings.priceSource === 'list' && list) {
      return { relay: list, relayModel: mapped, source: 'list' }
    }
    if (platform) return { relay: platform, relayModel: mapped, source: 'platform' }
    if (list) return { relay: list, relayModel: mapped, source: 'list' }
    return { relay: null, relayModel: mapped, source: 'none' }
  }

  const officialPriceFor = (model, tier) => {
    const settings = state.settings
    const mapped = settings.modelMap?.[model] ?? model
    const deepseek = OFFICIAL_DEEPSEEK[mapped] ?? OFFICIAL_DEEPSEEK[model]
    if (deepseek) {
      const row = tier === 'peak' ? deepseek.peak : deepseek.off
      return { cached: row.cached, cachedWrite: row.cached, miss: row.miss, out: row.out }
    }
    const ref = state.prices.official?.[mapped] ?? state.prices.official?.[model]
    if (!ref) return null
    // 中转站公开的「官方价」参照只有单一档位(通常是官方原价),峰谷同价。
    return { cached: ref.cached, cachedWrite: ref.cached, miss: ref.input, out: ref.output }
  }

  const priceReport = (model) => {
    const { relay, relayModel, source } = providerPriceFor(model)
    const peak = officialPriceFor(model, 'peak')
    const off = officialPriceFor(model, 'off')
    return {
      model,
      relayModel,
      source,
      relay,
      // 中转站两个公开口径都给出,便于核对实际账单:模型表价与平台政策价。
      list: state.prices.list?.[relayModel] ?? null,
      platform: state.prices.platform?.[relayModel] ?? null,
      officialPeak: peak,
      officialOff: off,
      tiered: peak && off && (peak.miss !== off.miss || peak.out !== off.out),
    }
  }

  const isRelayProvider = (provider) => {
    const list = state.settings.relayProviders ?? []
    const value = String(provider ?? '').toLowerCase()
    return list.some((item) => {
      const wanted = String(item ?? '').trim().toLowerCase()
      return wanted.length > 0 && (value === wanted || value.endsWith(`-${wanted}`) || value.includes(wanted))
    })
  }

  const record = (usage, options, atMs) => {
    const model = String(options?.model ?? 'unknown')
    const provider = String(options?.provider ?? 'unknown')
    const buckets = {
      input: Number(usage?.inputTokens ?? 0),
      cacheRead: Number(usage?.cacheReadTokens ?? 0),
      cacheWrite: Number(usage?.cacheWriteTokens ?? 0),
      output: Number(usage?.outputTokens ?? 0),
      reasoning: Number(usage?.reasoningTokens ?? 0),
      calls: 1,
    }
    const peak = isPeak(atMs, state.settings.holidays)
    const prices = priceReport(model)
    const peakCost = costOf(buckets, prices.officialPeak)
    const offCost = costOf(buckets, prices.officialOff)
    const relayCost = costOf(buckets, prices.relay)
    // 差额只在两侧都有价时累加:否则「省了多少」无从谈起,不能拿 0 当中转站价。
    const comparable = peakCost != null && offCost != null && relayCost != null
    // 官方按「这次调用真实落在的档位」计。非 DeepSeek 模型官方只有单一档位,peak 与 off 同值,不影响结果。
    const atOfficial = (peak ? peakCost : offCost) ?? (peak ? offCost : peakCost)
    const atComparable = atOfficial != null && relayCost != null
    const costs = {
      officialPeak: peakCost ?? offCost ?? 0,
      officialOff: offCost ?? peakCost ?? 0,
      relay: relayCost ?? 0,
      actual: relayCost != null && isRelayProvider(provider) ? relayCost : (peak ? peakCost ?? 0 : offCost ?? 0),
      savePeak: comparable ? peakCost - relayCost : 0,
      saveOff: comparable ? offCost - relayCost : 0,
      pricedCalls: comparable ? 1 : 0,
      unpricedCalls: comparable ? 0 : 1,
      officialAt: atOfficial ?? 0,
      relayAt: atComparable ? relayCost : 0,
      saveAt: atComparable ? atOfficial - relayCost : 0,
      atCalls: atComparable ? 1 : 0,
    }
    const key = `${provider}:${model}`
    const date = localDate(atMs)
    const day = (state.days[date] ??= { date, total: newEntry(), byKey: {} })
    mergeEntry(day.total, { ...buckets, ...costs })
    mergeEntry((day.byKey[key] ??= newEntry()), { ...buckets, ...costs })
    const sessionId = String(options?.sessionId ?? 'unknown')
    const session = (state.sessions[sessionId] ??= { id: sessionId, at: atMs, total: newEntry(), byKey: {} })
    session.at = atMs
    mergeEntry(session.total, { ...buckets, ...costs })
    mergeEntry((session.byKey[key] ??= newEntry()), { ...buckets, ...costs })
    pruneSessions(state)
    markDirty()
  }

  // ---------- llm/stream 包裹 ----------
  ctx.on('llm/stream', (options, next) => {
    const downstream = next()
    if (streamDepth.getStore() !== undefined) return downstream
    const startedAt = Date.now()
    return (async function* relayCompareStream() {
      let usage = null
      const iterator = downstream[Symbol.asyncIterator]()
      try {
        for (;;) {
          const result = await streamDepth.run(1, () => iterator.next())
          if (result.done) break
          const chunk = result.value
          if (chunk && chunk.type === 'usage' && chunk.usage) usage = chunk.usage
          yield chunk
        }
      } finally {
        if (usage) {
          try {
            record(usage, options, startedAt)
          } catch (error) {
            console.warn(`[${name}] 计费失败: ${String(error?.message ?? error)}`)
          }
        }
      }
    })()
  })

  // ---------- 价格刷新 ----------
  const fetchJson = async (url) => {
    const response = await fetch(url, { headers: { 'user-agent': `${name}/0.1 (DeepSeek Harness plugin)` } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  }

  const refreshPrices = async () => {
    const base = String(state.settings.baseUrl ?? '').replace(/\/+$/, '')
    if (!base) throw new Error('未配置中转站地址')
    const [listJson, platformJson] = await Promise.all([
      fetchJson(`${base}/api/prices`),
      fetchJson(`${base}/api/platform_price/public`).catch(() => null),
    ])
    const list = normalizeList(listJson)
    const platform = platformJson ? normalizePlatform(platformJson) : { platform: {}, official: {} }
    state.prices = {
      fetchedAt: Date.now(),
      error: null,
      list,
      platform: platform.platform,
      official: platform.official,
    }
    markDirty()
    return { models: Object.keys(list).length, platformModels: Object.keys(platform.platform).length }
  }

  const refreshQuietly = () => {
    refreshPrices().catch((error) => {
      state.prices = { ...state.prices, error: String(error?.message ?? error) }
      console.warn(`[${name}] 价格刷新失败: ${String(error?.message ?? error)}`)
      markDirty()
    })
  }
  refreshQuietly()

  const refreshTimer = setInterval(() => {
    if (cancelled) return
    const minutes = Number(state.settings.refreshMinutes ?? REFRESH_FALLBACK_MINUTES)
    const every = Number.isFinite(minutes) && minutes > 0 ? minutes : REFRESH_FALLBACK_MINUTES
    if (Date.now() - (state.prices.fetchedAt ?? 0) >= every * 60 * 1000) refreshQuietly()
  }, 60 * 1000)
  refreshTimer.unref?.()
  ctx.effect(() => () => {
    cancelled = true
    clearInterval(refreshTimer)
    if (timer) clearTimeout(timer)
    saveState(file, state)
  }, `${name}: persist state`)

  // ---------- HTTP 接口(面板读取) ----------
  const writeJson = (res, status, body) => {
    const payload = JSON.stringify(body)
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'referrer-policy': 'no-referrer',
      'cache-control': 'no-store',
    })
    res.end(payload)
  }

  const readBody = async (req, limit = 262144) => {
    const chunks = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > limit) return undefined
      chunks.push(chunk)
    }
    try {
      const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      return parsed && typeof parsed === 'object' ? parsed : undefined
    } catch {
      return undefined
    }
  }

  const nextSwitchAt = (atMs) => {
    const current = isPeak(atMs, state.settings.holidays)
    for (let i = 1; i <= 24 * 60; i += 1) {
      const at = atMs + i * 60000
      if (isPeak(at, state.settings.holidays) !== current) return at
    }
    return null
  }

  const snapshot = (sessionId) => {
    const date = localDate(Date.now())
    const today = state.days[date] ?? null
    const total = newEntry()
    for (const day of Object.values(state.days)) mergeEntry(total, day.total)
    const session = sessionId ? state.sessions[String(sessionId)] ?? null : null
    const days = Object.keys(state.days).sort()
    return {
      ok: true,
      build: BUILD,
      now: Date.now(),
      isPeak: isPeak(Date.now(), state.settings.holidays),
      nextSwitchAt: nextSwitchAt(Date.now()),
      since: days[0] ?? null,
      settings: state.settings,
      prices: {
        fetchedAt: state.prices.fetchedAt ?? 0,
        error: state.prices.error ?? null,
        listCount: Object.keys(state.prices.list ?? {}).length,
        platformCount: Object.keys(state.prices.platform ?? {}).length,
      },
      session: session ? { id: session.id, at: session.at, total: session.total, byKey: session.byKey } : null,
      today: today ? { date: today.date, total: today.total, byKey: today.byKey } : null,
      total,
      modelPrices: collectModelPrices(),
    }
  }

  const collectModelPrices = () => {
    const models = new Set()
    for (const day of Object.values(state.days)) for (const key of Object.keys(day.byKey ?? {})) models.add(key.slice(key.indexOf(':') + 1))
    for (const session of Object.values(state.sessions)) for (const key of Object.keys(session.byKey ?? {})) models.add(key.slice(key.indexOf(':') + 1))
    return [...models].sort().map((model) => priceReport(model))
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${ROUTE}/state`,
    handler: (req, res) => {
      try {
        const url = new URL(req.url ?? '', 'http://localhost')
        writeJson(res, 200, snapshot(url.searchParams.get('sessionId')))
      } catch (error) {
        writeJson(res, 500, { ok: false, message: String(error?.message ?? error) })
      }
    },
  }), `${name}: state route`)

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${ROUTE}/refresh`,
    handler: async (req, res) => {
      try {
        const url = new URL(req.url ?? '', 'http://localhost')
        const result = await refreshPrices()
        writeJson(res, 200, { ok: true, ...result, state: snapshot(url.searchParams.get('sessionId')) })
      } catch (error) {
        writeJson(res, 200, { ok: false, message: String(error?.message ?? error) })
      }
    },
  }), `${name}: refresh route`)

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${ROUTE}/settings`,
    handler: async (req, res) => {
      const body = await readBody(req)
      if (!body) {
        writeJson(res, 400, { ok: false, message: '请求体不是有效 JSON' })
        return
      }
      const next = { ...state.settings }
      if (typeof body.baseUrl === 'string' && body.baseUrl.trim()) next.baseUrl = body.baseUrl.trim()
      if (Array.isArray(body.relayProviders)) next.relayProviders = body.relayProviders.map(String)
      if (body.priceSource === 'platform' || body.priceSource === 'list') next.priceSource = body.priceSource
      if (Number.isFinite(body.refreshMinutes) && body.refreshMinutes > 0) next.refreshMinutes = Number(body.refreshMinutes)
      if (Array.isArray(body.holidays)) next.holidays = body.holidays.map(String)
      if (body.modelMap && typeof body.modelMap === 'object') next.modelMap = body.modelMap
      if (body.manualPrices && typeof body.manualPrices === 'object') next.manualPrices = body.manualPrices
      state.settings = next
      markDirty()
      writeJson(res, 200, { ok: true, settings: next })
    },
  }), `${name}: settings route`)

  console.log(`[${name}] 已加载;状态文件 ${file};中转站 ${state.settings.baseUrl}`)
}

/** 会话统计只保留最近的一批,避免状态文件无限增长。 */
function pruneSessions(state) {
  const ids = Object.keys(state.sessions)
  if (ids.length <= MAX_SESSIONS) return
  ids
    .sort((a, b) => (state.sessions[a]?.at ?? 0) - (state.sessions[b]?.at ?? 0))
    .slice(0, ids.length - MAX_SESSIONS)
    .forEach((id) => delete state.sessions[id])
}
