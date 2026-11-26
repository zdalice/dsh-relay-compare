/**
 * dsh-relay-compare — Client 半边
 *
 * 常驻:输入框下方一条对比 chip(官方 / 中转站 / 省多少)。
 * 展开:详情面板通过 portal 挂到 document.body —— dock 是输入框那一行的布局,
 * 直接把多行面板塞进去会被裁掉,槽位目录也明确要求固定浮层 portal 到 body。
 */
window.__ModuleLoader__.load({
  id: 'dsh-relay-compare',
  factory(require) {
    const React = require('react')
    const ReactDOM = require('react-dom')
    const h = React.createElement

    const DICT = {
      zh: {
        chip: '渠道费用对比',
        official: '官方',
        relay: '中转站',
        session: '本会话',
        today: '今日',
        total: '累计(本机记录)',
        empty: '暂无用量',
        saving: '省',
        overspend: '多付',
        even: '持平',
        colOfficialPeak: '官方·高峰',
        colRelay: '中转站',
        colPeakPart: '官方·高峰时段',
        colOffPart: '官方·空闲时段',
        colSum: '官方·合计',
        colDiff: '差额(实际)',
        tipPeakPart: '落在官方高峰时段的那部分调用，官方要收多少',
        tipOffPart: '落在官方空闲时段的那部分调用，官方要收多少',
        tipSum: '高峰时段 + 空闲时段 = 按你实际的用量与实际时段，官方要收的总数',
        tipRelayAt: '同一批调用在中转站的实际花费',
        tipDiffAt: '官方·合计 − 中转站。正数是省、负数是多付，一个减法就对得上，没有假设',
        atNoteFull: '本表按每次调用当时所在的官方档位计算，覆盖全部 {c} 次调用。',
        atNotePartial: '本表按每次调用当时所在的官方档位计算，覆盖升级后的 {c} 次调用。',
        legacyRef: '另有 {n} 次在本次升级前记账，当时落在哪一档没有记录、也还原不出来，未计入。全量参照：全部按高峰 {p} · 全部按空闲 {o} · 中转站实际 {r}。',
        callsUnit: '次调用',
        tokensIn: '输入',
        tokensCache: '缓存读',
        tokensOut: '输出',
        detail: '单价明细(人民币 / 百万 tokens)',
        model: '模型',
        listPrice: '中转站表价',
        platformPrice: '中转站政策价',
        priceSource: '计价口径',
        refreshed: '价格同步',
        never: '尚未同步',
        stale: '价格已过期',
        refreshing: '刷新中…',
        refresh: '刷新价格',
        refreshedOk: '已刷新',
        settings: '设置',
        baseUrl: '中转站地址',
        relayProviders: '渠道 ID(逗号分隔)',
        priceSourceLabel: '价格来源',
        sourcePlatform: '政策价',
        sourceList: '表价',
        refreshMinutes: '自动同步间隔(分钟)',
        holidays: '节假日 YYYY-MM-DD(逗号分隔)',
        invalidHolidays: '已忽略无效日期',
        save: '保存',
        saved: '已保存',
        discard: '撤销修改',
        close: '收起明细',
        open: '展开明细',
        error: '读取失败',
        crash: '插件渲染出错,已收起明细',
        unpriced: '无对照价,未计入差额',
        peakNow: '官方高峰价生效中',
        offPeakNow: '官方空闲价生效中',
        nextSwitch: '后切换',
        minutesShort: '分钟',
        closeHint: '点击空白处或按 Esc 收起',
      },
      en: {
        chip: 'Relay cost compare',
        official: 'Official',
        relay: 'Relay',
        session: 'This session',
        today: 'Today',
        total: 'Total (local records)',
        empty: 'No usage yet',
        saving: 'Saves',
        overspend: 'Costs extra',
        even: 'Even',
        colOfficialPeak: 'Official peak',
        colRelay: 'Relay',
        colPeakPart: 'Official peak hrs',
        colOffPart: 'Official off-peak hrs',
        colSum: 'Official total',
        colDiff: 'Diff (actual)',
        tipPeakPart: 'What official would have charged for the calls that actually landed in peak hours',
        tipOffPart: 'What official would have charged for the calls that actually landed in off-peak hours',
        tipSum: 'Peak part + off-peak part = what official would have charged for your usage at your actual times',
        tipRelayAt: 'What the relay actually charged for the same calls',
        tipDiffAt: 'Official total minus relay. Positive saves, negative costs extra — one subtraction, no assumptions',
        atNoteFull: 'Rows use the official tier each call actually fell in; all {c} calls covered.',
        atNotePartial: 'Rows use the official tier each call actually fell in; the {c} calls since the upgrade are covered.',
        legacyRef: '{n} earlier calls predate the upgrade and their tier was never recorded (unrecoverable), so they are excluded. All-call reference: all peak {p} · all off-peak {o} · relay actual {r}.',
        callsUnit: 'calls',
        tokensIn: 'in',
        tokensCache: 'cache read',
        tokensOut: 'out',
        detail: 'Unit prices (CNY per 1M tokens)',
        model: 'Model',
        listPrice: 'Relay list price',
        platformPrice: 'Relay policy price',
        priceSource: 'Priced by',
        refreshed: 'Prices synced',
        never: 'not synced yet',
        stale: 'stale prices',
        refreshing: 'Refreshing…',
        refresh: 'Refresh prices',
        refreshedOk: 'Refreshed',
        settings: 'Settings',
        baseUrl: 'Relay base URL',
        relayProviders: 'Provider ids (comma separated)',
        priceSourceLabel: 'Price source',
        sourcePlatform: 'Policy price',
        sourceList: 'List price',
        refreshMinutes: 'Auto-sync interval (minutes)',
        holidays: 'Holidays YYYY-MM-DD (comma separated)',
        invalidHolidays: 'ignored invalid dates',
        save: 'Save',
        saved: 'Saved',
        discard: 'Discard changes',
        close: 'Hide detail',
        open: 'Show detail',
        error: 'Request failed',
        crash: 'Render error; detail panel hidden',
        unpriced: 'no reference price, excluded from the diff',
        peakNow: 'Official peak pricing in effect',
        offPeakNow: 'Official off-peak pricing in effect',
        nextSwitch: 'switches in',
        minutesShort: 'min',
        closeHint: 'Click outside or press Esc to close',
      },
    }

    const TOKEN = {
      bgBase: 'var(--dsw-alias-bg-base,#ffffff)',
      bgLayer2: 'var(--dsw-alias-bg-layer-2,#f5f6f7)',
      label: 'var(--dsw-alias-label-primary,#1f2329)',
      label2: 'var(--dsw-alias-label-secondary,#646a73)',
      label3: 'var(--dsw-alias-label-tertiary,#8f959e)',
      border: 'var(--dsw-alias-border-l1,#dee0e3)',
      success: 'var(--dsw-alias-state-success-primary,#45b96f)',
      error: 'var(--dsw-alias-state-error-primary,#f54a45)',
      warn: 'var(--dsw-alias-state-warn-primary,#ff8800)',
      radiusSm: 'var(--dsw-radius-sm,8px)',
      radiusLg: 'var(--dsw-radius-lg,12px)',
    }

    const CSS = `
      .drc-chip{background:var(--dsw-alias-bg-base,#fff)}
      .drc-chip:hover,.drc-btn:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2,#f5f6f7))}
      .drc-chip:focus-visible,.drc-btn:focus-visible,.drc-input:focus-visible,.drc-summary:focus-visible{
        outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:1px}
      .drc-summary{cursor:pointer}
      .drc-scroll{overflow-x:auto;max-width:100%}
      .drc-scroll table{min-width:440px}
    `

    /**
     * 金额统一显示到 4 位小数、去掉末尾多余的 0。
     * 不能按「值大就用 2 位、值小就用 4 位」挑精度:那样同一行里高峰价会被舍成 10.85、
     * 差额却保留 0.0318,用户拿显示的数相减就会差几分钱,看着像账算错了。
     * 统一精度后,表内任意两格相减都能对上(最多差 0.0001 的末位舍入)。
     */
    const money = (value) => {
      const n = Number(value ?? 0)
      if (!Number.isFinite(n)) return '¥0'
      return `¥${n.toFixed(4).replace(/\.?0+$/, '') || '0'}`
    }

    const compact = (value) => {
      const n = Number(value ?? 0)
      if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
      if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
      if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
      return String(Math.round(n))
    }

    const tokensOf = (entry) =>
      (entry?.input ?? 0) + (entry?.cacheRead ?? 0) + (entry?.cacheWrite ?? 0) + (entry?.output ?? 0) + (entry?.reasoning ?? 0)

    const hasUsage = (entry) => tokensOf(entry) > 0 || (entry?.calls ?? 0) > 0

    /** 「官方价 - 中转站价」:正数是省,负数是多付。 */
    const diffText = (value, t) => {
      const n = Number(value ?? 0)
      if (!Number.isFinite(n) || n === 0) return { text: money(0), style: { color: TOKEN.label2 }, word: '' }
      return {
        text: money(Math.abs(n)),
        style: { color: n > 0 ? TOKEN.success : TOKEN.error, fontWeight: 600 },
        word: n > 0 ? t.saving : t.overspend,
      }
    }

    const pctText = (official, diff) => {
      const o = Number(official ?? 0)
      if (!(o > 0)) return ''
      const value = (Number(diff ?? 0) / o) * 100
      const abs = Math.abs(value)
      if (abs >= 10) return `${value.toFixed(0)}%`
      if (abs >= 0.05) return `${value.toFixed(1)}%`
      return '≈0%'
    }

    const parseDates = (text) => {
      const items = String(text ?? '').split(',').map((s) => s.trim()).filter(Boolean)
      return {
        valid: items.filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)),
        invalid: items.filter((s) => !/^\d{4}-\d{2}-\d{2}$/.test(s)),
      }
    }

    const readLocale = (ctx) => {
      try {
        const snap = ctx.locale.getLocale?.() ?? ctx.locale.getSnapshot?.()
        const value = typeof snap === 'string' ? snap : (snap?.id ?? snap?.locale ?? snap?.language ?? 'zh')
        return String(value).toLowerCase().startsWith('en') ? 'en' : 'zh'
      } catch {
        return 'zh'
      }
    }

    function useLocale(ctx) {
      const [locale, setLocale] = React.useState(() => readLocale(ctx))
      React.useEffect(() => ctx.locale.subscribe(() => setLocale(readLocale(ctx))), [ctx])
      return locale
    }

    function useSnapshot(sessionId) {
      const [data, setData] = React.useState(null)
      const [error, setError] = React.useState(null)
      const load = React.useCallback(async () => {
        try {
          const url = `/dsh-relay-compare/state${sessionId ? `?sessionId=${encodeURIComponent(String(sessionId))}` : ''}`
          const response = await fetch(url, { headers: { accept: 'application/json' } })
          const body = await response.json()
          if (body?.ok) {
            setData(body)
            setError(null)
          } else setError(body?.message ?? 'bad response')
        } catch (err) {
          setError(String(err?.message ?? err))
        }
      }, [sessionId])
      React.useEffect(() => {
        let active = true
        const tick = () => {
          if (!active || document.hidden) return
          load()
        }
        tick()
        const id = setInterval(tick, 10000)
        return () => { active = false; clearInterval(id) }
      }, [load])
      return { data, error, reload: load }
    }

    const styles = {
      chip: {
        display: 'inline-flex', alignItems: 'center', gap: '8px', alignSelf: 'flex-start', flexWrap: 'wrap',
        padding: '2px 8px', borderRadius: '999px', border: `1px solid ${TOKEN.border}`,
        color: TOKEN.label2, fontSize: '12px', lineHeight: '18px', cursor: 'pointer',
      },
      card: {
        border: `1px solid ${TOKEN.border}`, borderRadius: TOKEN.radiusLg,
        background: TOKEN.bgBase, padding: '12px 14px', fontSize: '12px',
        color: TOKEN.label, display: 'flex', flexDirection: 'column', gap: '8px',
      },
      backdrop: {
        position: 'fixed', inset: 0, zIndex: 2147483000,
        background: 'rgba(15,18,24,0.18)', display: 'flex', alignItems: 'flex-end',
        justifyContent: 'center', paddingBottom: '104px',
      },
      table: { width: '100%', borderCollapse: 'collapse' },
      th: { textAlign: 'right', fontWeight: 500, color: TOKEN.label2, padding: '2px 6px', whiteSpace: 'nowrap' },
      thFirst: { textAlign: 'left', fontWeight: 500, color: TOKEN.label2, padding: '2px 6px' },
      td: { textAlign: 'right', padding: '2px 6px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
      tdFirst: { textAlign: 'left', padding: '2px 6px', whiteSpace: 'nowrap' },
      muted: { color: TOKEN.label2 },
      faint: { color: TOKEN.label3 },
      row: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' },
      input: {
        flex: '1 1 160px', minWidth: '120px', padding: '3px 6px', borderRadius: TOKEN.radiusSm,
        border: `1px solid ${TOKEN.border}`, background: TOKEN.bgBase, color: TOKEN.label, fontSize: '12px',
      },
      button: {
        padding: '3px 10px', borderRadius: TOKEN.radiusSm, border: `1px solid ${TOKEN.border}`,
        background: TOKEN.bgLayer2, color: TOKEN.label, fontSize: '12px', cursor: 'pointer',
      },
      hr: { border: 'none', borderTop: `1px solid ${TOKEN.border}`, margin: '2px 0' },
    }

    /**
     * 主表:全部按「每次调用当时真正落在的官方档位」算。
     * 官方·高峰时段 + 官方·空闲时段 = 官方·合计,合计 − 中转站 = 差额 ——
     * 横着加、竖着减都对得上,不用跟用户解释"假设"。
     * 只有升级之后记过档位的调用有值;没有的行显示 —,由表下说明覆盖了多少次。
     */
    function EntryRow({ label, entry, t }) {
      const hits = entry?.atCalls ?? 0
      if (!(hits > 0)) {
        return h('tr', null,
          h('td', { style: styles.tdFirst }, label),
          ...[0, 1, 2, 3, 4].map((i) =>
            h('td', { key: `e${i}`, style: styles.td }, h('span', { style: styles.faint }, '—'))),
        )
      }
      const peakPart = entry?.atPeakOfficial ?? 0
      const offPart = entry?.atOffOfficial ?? 0
      const officialSum = peakPart + offPart
      const relay = (entry?.atPeakRelay ?? 0) + (entry?.atOffRelay ?? 0)
      const saved = officialSum - relay
      const d = diffText(saved, t)
      const pct = pctText(officialSum, saved)
      return h('tr', null,
        h('td', { style: styles.tdFirst }, label),
        h('td', { style: styles.td }, money(peakPart)),
        h('td', { style: styles.td }, money(offPart)),
        h('td', { style: styles.td }, money(officialSum)),
        h('td', { style: styles.td }, money(relay)),
        saved === 0
          ? h('td', { style: styles.td }, h('span', { style: styles.faint }, `${t.even} (0%)`))
          : h('td', { style: styles.td },
              h('span', { style: d.style }, `${d.word} ${d.text}`),
              pct ? h('span', { style: { ...styles.faint, marginLeft: '4px' } }, `(${pct})`) : null,
            ),
      )
    }

    /**
     * 表下说明。主表只统计"记过档位"的调用:本次升级之前的条目没有记录当时落在哪一档,
     * 而且还原不出来(对 DeepSeek 来说空闲价恒为高峰价一半,两个总额是 2:1 的死关系,
     * 解不出混合比例)。所以如实写明漏了多少次,并把那部分的历史口径作为参照列出。
     * 不做估算、不假设平均分布 —— 数字小一点没关系,编出来的数字不行。
     */
    function AtNote({ covered, uncovered, totalEntry, t }) {
      if (!(covered > 0)) return null
      const line = (uncovered > 0 ? t.atNotePartial : t.atNoteFull).replace('{c}', String(covered))
      return h('div', { style: { ...styles.faint, lineHeight: 1.7 } },
        h('div', null, line),
        uncovered > 0
          ? h('div', null, t.legacyRef
              .replace('{n}', String(uncovered))
              .replace('{p}', money(totalEntry?.officialPeak ?? 0))
              .replace('{o}', money(totalEntry?.officialOff ?? 0))
              .replace('{r}', money(totalEntry?.relay ?? 0)))
          : null,
      )
    }

    /** 渲染出错时保留 chip,不让插槽条目整条消失。 */
    class Boundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { failed: false }
      }

      static getDerivedStateFromError() {
        return { failed: true }
      }

      componentDidCatch(error) {
        console.warn('[dsh-relay-compare] client render failed:', String(error?.message ?? error))
      }

      render() {
        if (this.state.failed) {
          const t = DICT[this.props.locale] ?? DICT.zh
          return h('span', { style: { ...styles.chip, cursor: 'default', color: TOKEN.warn } }, `${t.chip}: ${t.crash}`)
        }
        return this.props.children
      }
    }

    function Widget(props) {
      const ctx = props.ctx
      const locale = useLocale(ctx)
      const t = DICT[locale]
      const sessionId = props.sessionId
      const [open, setOpen] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const [draft, setDraft] = React.useState(null)
      const [note, setNote] = React.useState(null)
      const { data, error, reload } = useSnapshot(sessionId)

      React.useEffect(() => {
        if (!note) return
        const id = setTimeout(() => setNote(null), 4000)
        return () => clearTimeout(id)
      }, [note])

      React.useEffect(() => {
        if (!open) return
        const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [open])

      const entry = data?.session?.total ?? null
      const todayEntry = data?.today?.total ?? null
      const totalEntry = data?.total ?? null
      const anyUsage = hasUsage(entry) || hasUsage(todayEntry) || hasUsage(totalEntry)

      const settings = draft ?? data?.settings ?? {}
      const refreshMinutes = Number(settings.refreshMinutes ?? 30)
      const fetchedAt = Number(data?.prices?.fetchedAt ?? 0)
      const stale = !fetchedAt || (Date.now() - fetchedAt > 2 * refreshMinutes * 60000)
      const unpriced = todayEntry?.unpricedCalls ?? entry?.unpricedCalls ?? 0

      // 常驻结论与主表同口径:官方按每次调用当时真实落在的档位算。
      // 一次档位都没记过(全新账本、还没调用过)时,退回「官方当前档位」的比法。
      const usePeak = data?.isPeak !== false
      const atHits = entry?.atCalls ?? todayEntry?.atCalls ?? 0
      const officialNow = atHits > 0
        ? (entry?.officialAt ?? todayEntry?.officialAt ?? 0)
        : ((usePeak ? entry?.officialPeak : entry?.officialOff)
          ?? (usePeak ? todayEntry?.officialPeak : todayEntry?.officialOff) ?? 0)
      const relayNow = atHits > 0
        ? (entry?.relayAt ?? todayEntry?.relayAt ?? 0)
        : (entry?.relay ?? todayEntry?.relay ?? 0)
      const diffNow = atHits > 0
        ? (entry?.saveAt ?? todayEntry?.saveAt ?? 0)
        : (usePeak ? (entry?.savePeak ?? todayEntry?.savePeak ?? 0) : (entry?.saveOff ?? todayEntry?.saveOff ?? 0))
      const pricedNow = atHits > 0 ? atHits : (entry?.pricedCalls ?? todayEntry?.pricedCalls ?? 0)
      // 覆盖不全时把样本量标出来,免得把「升级后这几十次」当成全部用量。
      const scopedCalls = entry?.calls ?? todayEntry?.calls ?? 0
      const partial = atHits > 0 && scopedCalls > atHits
      const diff = diffText(diffNow, t)
      const pct = pctText(officialNow, diffNow)
      const nextSwitch = data?.nextSwitchAt ? Math.max(0, Math.round((data.nextSwitchAt - Date.now()) / 60000)) : null

      const refresh = async () => {
        setBusy(true)
        try {
          const suffix = sessionId ? `?sessionId=${encodeURIComponent(String(sessionId))}` : ''
          const response = await fetch(`/dsh-relay-compare/refresh${suffix}`, { method: 'POST' })
          const body = await response.json()
          await reload()
          setNote(body?.ok
            ? `${t.refreshedOk}: ${t.listPrice} ${body.models ?? 0} · ${t.platformPrice} ${body.platformModels ?? 0}`
            : `${t.error}: ${String(body?.message ?? '')}`)
        } catch (err) {
          setNote(`${t.error}: ${String(err?.message ?? err)}`)
        } finally {
          setBusy(false)
        }
      }

      const save = async () => {
        setBusy(true)
        try {
          const providers = String(settings.relayProvidersText ?? (settings.relayProviders ?? []).join(','))
            .split(',').map((s) => s.trim()).filter(Boolean)
          const holidays = parseDates(settings.holidaysText ?? (settings.holidays ?? []).join(','))
          const response = await fetch('/dsh-relay-compare/settings', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              baseUrl: settings.baseUrl,
              relayProviders: providers,
              priceSource: settings.priceSource,
              refreshMinutes: Number(settings.refreshMinutes ?? 30),
              holidays: holidays.valid,
            }),
          })
          const json = await response.json()
          setNote(json?.ok
            ? `${t.saved}${holidays.invalid.length ? ` · ${t.invalidHolidays} ${holidays.invalid.length}` : ''}`
            : `${t.error}: ${String(json?.message ?? '')}`)
          setDraft(null)
          await reload()
        } catch (err) {
          setNote(`${t.error}: ${String(err?.message ?? err)}`)
        } finally {
          setBusy(false)
        }
      }

      const field = (label, key, value, extra = {}) => h('div', { style: styles.row },
        h('span', { style: { ...styles.muted, flex: '0 0 150px' } }, label),
        h('input', {
          className: 'drc-input',
          style: styles.input,
          value: value ?? '',
          onChange: (event) => setDraft({ ...settings, [key]: event.target.value }),
          ...extra,
        }))

      const chip = h('button', {
        className: 'drc-chip',
        'aria-expanded': open,
        'aria-label': t.chip,
        title: `${t.chip} · ${usePeak ? t.peakNow : t.offPeakNow}`,
        style: styles.chip,
        onClick: () => setOpen((value) => !value),
      },
        h('span', null, t.chip),
        anyUsage
          ? h('span', { style: styles.muted },
              `${t.official} ${money(officialNow)} · ${t.relay} ${money(relayNow)} · `,
              diff.word
                ? h('span', { style: diff.style }, `${diff.word} ${diff.text}${pct ? ` (${pct})` : ''}`)
                : h('span', { style: styles.faint }, pricedNow > 0 ? `${t.even} (0%)` : t.unpriced),
              partial
                ? h('span', {
                    style: { ...styles.faint, marginLeft: '4px' },
                    title: t.atNotePartial.replace('{c}', String(atHits)),
                  }, `${atHits}/${scopedCalls}`)
                : null)
          : h('span', { style: styles.muted }, t.empty),
        h('span', { style: styles.faint }, open ? '▾' : '▸'),
        (error || stale || unpriced > 0)
          ? h('span', {
              style: { color: TOKEN.warn },
              title: error ? `${t.error}: ${error}` : (unpriced > 0 ? t.unpriced : t.stale),
            }, '⚠')
          : null,
      )

      if (!open) return h(React.Fragment, null, h('style', null, CSS), chip)

      const models = data?.modelPrices ?? []
      const unpricedModels = models.filter((row) => row.source === 'none')
      const discountUnit = locale === 'en' ? 'off' : '折'

      const costRows = [
        { label: t.session, entry },
        { label: t.today, entry: todayEntry },
        { label: `${t.total}${data?.since ? ` · ${data.since}~` : ''}`, entry: totalEntry },
      ]
      // 提示只按最宽的「累计」口径算,避免把今天/本会话重复计进去。
      const uncovered = Math.max(0, (totalEntry?.calls ?? 0) - (totalEntry?.atCalls ?? 0))
      const covered = totalEntry?.atCalls ?? 0

      const panel = h('div', { style: styles.backdrop, onClick: () => setOpen(false) },
        h('div', {
          role: 'dialog',
          'aria-label': t.chip,
          style: {
            ...styles.card,
            width: 'min(760px, calc(100vw - 32px))',
            maxHeight: 'min(70vh, 520px)',
            overflowY: 'auto',
            boxShadow: '0 8px 32px rgba(15,18,24,0.24)',
          },
          onClick: (event) => event.stopPropagation(),
        },
          error ? h('div', { style: { color: TOKEN.error } }, `${t.error}: ${error}`) : null,
          h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' } },
            h('span', null, t.chip),
            h('span', { style: styles.faint },
              `${usePeak ? t.peakNow : t.offPeakNow}${nextSwitch != null ? ` · ${nextSwitch} ${t.minutesShort}${t.nextSwitch}` : ''}`),
            h('button', { className: 'drc-btn', style: styles.button, onClick: () => setOpen(false) }, t.close),
          ),
          h('div', { className: 'drc-scroll' },
            h('table', { style: styles.table },
              h('thead', null, h('tr', null,
                h('th', { style: styles.thFirst }, ''),
                h('th', { style: styles.th, title: t.tipPeakPart }, t.colPeakPart),
                h('th', { style: styles.th, title: t.tipOffPart }, t.colOffPart),
                h('th', { style: styles.th, title: t.tipSum }, t.colSum),
                h('th', { style: styles.th, title: t.tipRelayAt }, t.colRelay),
                h('th', { style: styles.th, title: t.tipDiffAt }, t.colDiff),
              )),
              h('tbody', null,
                ...costRows.map(({ label, entry: row }) => h(EntryRow, { key: label, label, entry: row, t })),
              ),
            ),
          ),
          h(AtNote, { covered, uncovered, totalEntry, t }),
          entry
            ? h('div', { style: styles.faint },
                `${entry.calls ?? 0} ${t.callsUnit} · ${t.tokensIn} ${compact(entry.input)} · ${t.tokensCache} ${compact(entry.cacheRead)} · ${t.tokensOut} ${compact((entry.output ?? 0) + (entry.reasoning ?? 0))}`)
            : null,
          (unpriced > 0 || unpricedModels.length > 0)
            ? h('div', { style: { color: TOKEN.warn } },
                `⚠ ${unpricedModels.length ? unpricedModels.map((m) => m.model).join('、') : ''} ${t.unpriced}`)
            : null,
          h('hr', { style: styles.hr }),
          h('div', { style: styles.faint },
            `${t.priceSource}: ${settings.priceSource === 'list' ? t.sourceList : t.sourcePlatform} · ${t.refreshed}: ${fetchedAt ? new Date(fetchedAt).toLocaleTimeString() : t.never}`,
            stale ? ` · ${t.stale}` : '',
            data?.prices?.error ? ` · ${String(data.prices.error)}` : ''),
          h('div', { style: styles.row },
            h('button', { className: 'drc-btn', style: styles.button, onClick: refresh, disabled: busy }, busy ? t.refreshing : t.refresh),
            h('span', { role: 'status', style: styles.muted }, note ?? ''),
            h('span', { style: styles.faint }, t.closeHint),
          ),
          models.length
            ? h('details', null,
                h('summary', { className: 'drc-summary', style: styles.muted }, t.detail),
                h('div', { className: 'drc-scroll' },
                  h('table', { style: styles.table },
                    h('thead', null, h('tr', null,
                      h('th', { style: styles.thFirst }, t.model),
                      h('th', { style: styles.th }, t.colOfficialPeak),
                      h('th', { style: styles.th }, t.listPrice),
                      h('th', { style: styles.th }, t.platformPrice),
                    )),
                    h('tbody', null, models.map((row) => {
                      const listPrice = row.list ?? (row.source === 'list' ? row.relay : null)
                      const platformPrice = row.platform ?? (row.source === 'platform' ? row.relay : null)
                      return h('tr', { key: row.model },
                        h('td', { style: styles.tdFirst }, row.model),
                        h('td', { style: styles.td }, `${row.officialPeak?.miss ?? '—'} / ${row.officialPeak?.out ?? '—'}`),
                        h('td', { style: styles.td }, `${listPrice?.input ?? '—'} / ${listPrice?.output ?? '—'}`),
                        h('td', { style: styles.td },
                          `${platformPrice?.input ?? '—'} / ${platformPrice?.output ?? '—'}${platformPrice?.discount ? ` (${platformPrice.discount}${discountUnit})` : ''}`),
                      )
                    })),
                  ),
                ),
              )
            : null,
          h('details', null,
            h('summary', { className: 'drc-summary', style: styles.muted }, t.settings),
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' } },
              field(t.baseUrl, 'baseUrl', settings.baseUrl),
              field(t.relayProviders, 'relayProvidersText', (settings.relayProviders ?? []).join(',')),
              h('div', { style: styles.row },
                h('span', { style: { ...styles.muted, flex: '0 0 150px' } }, t.priceSourceLabel),
                h('select', {
                  className: 'drc-input',
                  style: styles.input,
                  value: settings.priceSource,
                  onChange: (event) => setDraft({ ...settings, priceSource: event.target.value }),
                },
                  h('option', { value: 'platform' }, t.sourcePlatform),
                  h('option', { value: 'list' }, t.sourceList),
                ),
              ),
              field(t.refreshMinutes, 'refreshMinutes', String(settings.refreshMinutes ?? 30)),
              field(t.holidays, 'holidaysText', (settings.holidays ?? []).join(','),
                parseDates(settings.holidaysText ?? '').invalid.length
                  ? { 'aria-invalid': true, style: { ...styles.input, borderColor: TOKEN.error } }
                  : {}),
              h('div', { style: styles.row },
                h('button', { className: 'drc-btn', style: styles.button, onClick: save, disabled: busy }, t.save),
                draft ? h('button', { className: 'drc-btn', style: styles.button, onClick: () => setDraft(null), disabled: busy }, t.discard) : null,
                h('span', { role: 'status', style: styles.muted }, note ?? ''),
              ),
            ),
          ),
        ),
      )

      return h(React.Fragment, null, h('style', null, CSS), chip, ReactDOM.createPortal(panel, document.body))
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('relay-compare', 'zh', DICT.zh), 'relay-compare: zh dict')
        ctx.effect(() => ctx.locale.register('relay-compare', 'en', DICT.en), 'relay-compare: en dict')
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'relay-compare',
          order: 6,
        }, (props) => h(Boundary, { locale: readLocale(ctx) }, h(Widget, { ...props, ctx }))))
      },
    }
  },
})
