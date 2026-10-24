/**
 * Backtests the day desk's mechanical rules on the history in backtest/data
 * (scripts/backtest-fetch.ts): every day, the scan as it would have run
 * before the open, plans from it, and the engine playing them through the
 * session, exactly as the live grader does. The AI's own judgment (news,
 * the trade / caution / no-trade verdict, picking among candidates) can't
 * be replayed, so the desk is stood in for by simple picking rules.
 *
 *   node scripts/backtest-run.ts
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

import { byDay, regularSession, type Bar } from '../src/lib/day/bars.ts'
import { dayStats, playPlan, RULES, runAccount, type PlanOutcome } from '../src/lib/day/engine.ts'
import { scanStock } from '../src/lib/day/scan.ts'
import type { DayPlan, ScanRow } from '../src/lib/day/types.ts'

const DIR = 'backtest/data'
const data = new Map<string, { daily: Bar[]; intraday: Bar[] }>()
for (const f of readdirSync(DIR)) data.set(f.replace('.json', ''), JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')))
const spy = data.get('SPY')!
const sessions = new Map([...data].map(([s, d]) => [s, byDay(regularSession(d.intraday))]))
const dates = [...sessions.get('SPY')!.keys()].filter((d) => sessions.get('SPY')!.get(d)!.length >= 70)
const only = process.argv.slice(2)
const FUTURES = ['GC=F', 'MGC=F']
const tickers = only.length ? only : [...data.keys()].filter((t) => t !== 'SPY' && !FUTURES.includes(t))

// The scan as it would have run before each open: history up to yesterday and today's pre-market only.
const scans = new Map<string, ScanRow[]>()
for (const date of dates.slice(1)) {
  const rows: ScanRow[] = []
  for (const t of tickers) {
    const d = data.get(t)!
    const intraday = d.intraday.filter((b) => b.date < date || (b.date === date && b.time < '09:30'))
    const row = scanStock(t, d.daily, intraday, date)
    if (row) rows.push(row)
  }
  scans.set(date, rows)
}

type Pick = (rows: ScanRow[]) => ScanRow[]
const byRr = (a: ScanRow, b: ScanRow) => (b.estRr ?? 0) - (a.estRr ?? 0)
const PICKS: Record<string, Pick> = {
  'desk: best 3 good': (rows) => rows.filter((r) => r.status === 'good').sort(byRr).slice(0, 3),
  'every good': (rows) => rows.filter((r) => r.status === 'good'),
  'every good + wait': (rows) => rows.filter((r) => r.status !== 'avoid'),
  'every day, any status': (rows) => rows,
}

const pct = (x: number) => Math.round(x * 100) / 100

function run(name: string, pick: Pick, commissionPct: number) {
  ;(RULES as { commissionPct: number }).commissionPct = commissionPct
  const days: { date: string; plans: DayPlan[]; outcomes: PlanOutcome[] }[] = []
  const status: Record<string, number> = {}
  const bySetup: Record<string, number[]> = { reclaim: [], hold: [] }
  const control: number[] = [] // same stock, same day: buy at 09:45, sell at the close, %
  const traded: number[] = [] // the trades, %
  for (const [date, rows] of scans) {
    const plans: DayPlan[] = pick(rows).map((r, i) => ({
      id: `${date}-${i + 1}`,
      ticker: r.ticker,
      setup: r.setup!,
      level: r.level,
      levelName: r.levelName,
      target: r.target,
      targetName: r.targetName,
      environment: '',
      location: '',
      confirmation: '',
      execution: '',
      why: '',
    }))
    const outcomes = plans.map((p) => {
      const bars = sessions.get(p.ticker)!.get(date) ?? []
      const o = playPlan(p, bars, { notBefore: 0, final: true })
      status[o.status] = (status[o.status] ?? 0) + 1
      const at945 = bars.find((b) => b.time === '09:45')
      if (at945) control.push((bars.at(-1)!.c / at945.o - 1) * 100 - 2 * commissionPct)
      if (o.entry && o.exit) {
        bySetup[p.setup].push(o.r!)
        traded.push((o.exit.price / o.entry.price - 1) * 100 - 2 * commissionPct)
      }
      return o
    })
    days.push({ date, plans, outcomes })
  }
  const account = runAccount(days)
  const stats = dayStats(account.trades)
  let peak = RULES.startingCashUsd
  let maxDd = 0
  for (const p of account.points) {
    peak = Math.max(peak, p.valueUsd)
    maxDd = Math.max(maxDd, (1 - p.valueUsd / peak) * 100)
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  const r = {
    name,
    commissionPct,
    plans: days.reduce((s, d) => s + d.plans.length, 0),
    status,
    trades: stats.trades,
    winRatePct: stats.winRatePct && pct(stats.winRatePct),
    avgR: stats.avgR && pct(stats.avgR),
    totalR: pct(stats.totalR),
    endUsd: pct(account.cashUsd),
    returnPct: pct((account.cashUsd / RULES.startingCashUsd - 1) * 100),
    commissionUsd: pct(stats.commissionUsd),
    maxDrawdownPct: pct(maxDd),
    avgRBySetup: Object.fromEntries(Object.entries(bySetup).map(([k, v]) => [k, { n: v.length, avgR: avg(v) && pct(avg(v)!) }])),
    avgTradePct: avg(traded) && pct(avg(traded)!),
    avgControlPct: avg(control) && pct(avg(control)!),
    tradesList: account.trades.map((t) => `${t.date} ${t.ticker} ${t.r.toFixed(2)}R $${t.pnlUsd.toFixed(0)}`),
  }
  console.log(
    `${name} @${commissionPct}%: ${r.plans} plans → ${r.trades} trades, win ${r.winRatePct}%, avg ${r.avgR}R, ` +
      `total ${r.totalR}R, ${r.returnPct}% (fees $${r.commissionUsd}), max DD ${r.maxDrawdownPct}% · ` +
      `trade avg ${r.avgTradePct}% vs buy-09:45 ${r.avgControlPct}%`,
  )
  return r
}

const first = dates[1]
const last = dates.at(-1)!
const spyDaily = spy.daily.filter((b) => b.date >= first && b.date <= last)
const spyPct = (spyDaily.at(-1)!.c / spyDaily[0].o - 1) * 100
console.log(`${scans.size} sessions ${first} → ${last}, ${tickers.length} stocks · SPY ${spyPct.toFixed(2)}%`)
const goodPerDay = [...scans.values()].map((rows) => rows.filter((r) => r.status === 'good').length)
console.log(`good per day: avg ${(goodPerDay.reduce((a, b) => a + b, 0) / goodPerDay.length).toFixed(1)}`)

const results = []
for (const [name, pick] of Object.entries(PICKS))
  for (const fee of only.length ? [0.05, 0] : [0.1605, 0.02, 0]) results.push(run(name, pick, fee))
writeFileSync(
  only.length ? `backtest/results-${only.join('-')}.json` : 'backtest/results.json',
  JSON.stringify({ first, last, sessions: scans.size, spyPct: pct(spyPct), results }, null, 1) + '\n',
)
