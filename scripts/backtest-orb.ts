/**
 * Backtests the 5-minute opening range breakout on "stocks in play" from
 * Zarattini, Barbon & Aziz (2024), "A Profitable Day Trading Strategy for the
 * U.S. Equity Market", on the same history as the day desk's backtest
 * (backtest/data). Rules as published:
 *   - open > $5, 14-day average volume ≥ 1M shares, 14-day ATR > $0.50;
 *   - relative volume of the first 5 minutes vs the last 14 days ≥ 100%, top 20 of the day;
 *   - first 5-minute bar up → buy stop at its high; down → sell stop at its low (doji: nothing);
 *   - stop 10% of the 14-day ATR from the entry; otherwise out at the close;
 *   - risk 1% of the account per trade, leverage at most 4×.
 * Variants: as published (long and short, 4×) and as Dime! allows (long only, no leverage),
 * each at Dime!'s commission, IBKR's $0.0035/share, and none.
 *
 *   node scripts/backtest-orb.ts
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

import { byDay, regularSession, type Bar } from '../src/lib/day/bars.ts'

const DIR = 'backtest/data'
const data = new Map<string, { daily: Bar[]; intraday: Bar[] }>()
for (const f of readdirSync(DIR)) {
  const s = f.replace('.json', '')
  if (s === 'SPY' || s.includes('=F')) continue
  data.set(s, JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')))
}
const sessions = new Map([...data].map(([s, d]) => [s, byDay(regularSession(d.intraday))]))
const dates = [...new Set([...sessions.values()].flatMap((m) => [...m.keys()]))].sort()

function atr14(daily: Bar[], date: string): number | null {
  const past = daily.filter((b) => b.date < date).slice(-15)
  if (past.length < 15) return null
  let s = 0
  for (let i = 1; i < past.length; i++)
    s += Math.max(past[i].h - past[i].l, Math.abs(past[i].h - past[i - 1].c), Math.abs(past[i].l - past[i - 1].c))
  return s / 14
}

type Candidate = { ticker: string; side: 1 | -1; entry: number; stop: number; exit: number; entryTime: string }

/** Every day's trades the rules would take (before sizing). */
const plays = new Map<string, Candidate[]>()
for (const date of dates) {
  const ranked: { ticker: string; rv: number; c: Candidate | null }[] = []
  for (const [ticker, d] of data) {
    const days = sessions.get(ticker)!
    const bars = days.get(date)
    if (!bars || bars.length < 70 || bars[0].time !== '09:30') continue
    const prior = [...days.keys()].filter((x) => x < date).slice(-14)
    if (prior.length < 14) continue
    const or = bars[0]
    const avgVol = d.daily.filter((b) => b.date < date).slice(-14).reduce((s, b) => s + b.v, 0) / 14
    const atr = atr14(d.daily, date)
    if (or.o <= 5 || avgVol < 1e6 || !atr || atr <= 0.5) continue
    const orVol = prior.reduce((s, x) => s + (days.get(x)![0]?.v ?? 0), 0) / 14
    const rv = or.v / orVol
    if (rv < 1) continue
    let c: Candidate | null = null
    const side = or.c > or.o ? 1 : or.c < or.o ? -1 : 0
    if (side !== 0) {
      const trigger = side === 1 ? or.h : or.l
      for (let i = 1; i < bars.length && !c; i++) {
        const b = bars[i]
        const hit = side === 1 ? b.h >= trigger : b.l <= trigger
        if (!hit) continue
        // A gap through the trigger fills at the bar's open.
        const entry = side === 1 ? Math.max(trigger, b.o) : Math.min(trigger, b.o)
        const stop = entry - side * 0.1 * atr
        let exit = bars.at(-1)!.c
        for (let j = process.env.OPTIMISTIC ? i + 1 : i; j < bars.length; j++) {
          const x = bars[j]
          if (side === 1 ? x.l <= stop : x.h >= stop) {
            exit = side === 1 ? Math.min(stop, j > i ? x.o : stop) : Math.max(stop, j > i ? x.o : stop)
            break
          }
        }
        c = { ticker, side: side as 1 | -1, entry, stop, exit, entryTime: b.time }
      }
    }
    ranked.push({ ticker, rv, c })
  }
  ranked.sort((a, b) => b.rv - a.rv)
  plays.set(
    date,
    ranked
      .slice(0, 20)
      .map((r) => r.c)
      .filter((c) => c != null),
  )
}

type Fee = { name: string; cost: (shares: number, price: number) => number }
const FEES: Fee[] = [
  { name: 'Dime! 0.1605%', cost: (n, p) => n * p * 0.001605 },
  { name: 'IBKR $0.0035/share', cost: (n) => n * 0.0035 },
  { name: 'no commission', cost: () => 0 },
]

const pct = (x: number) => Math.round(x * 100) / 100
const results = []
for (const variant of [
  { name: 'as published: long + short, up to 4×', short: true, leverage: 4 },
  { name: 'as Dime! allows: long only, no leverage', short: false, leverage: 1 },
])
  for (const fee of FEES) {
    let cash = 10_000
    let peak = cash
    let maxDd = 0
    let trades = 0
    let wins = 0
    let sumR = 0
    let fees = 0
    for (const date of dates) {
      const day = (plays.get(date) ?? []).filter((c) => variant.short || c.side === 1)
      const start = cash
      const sized = day.map((c) => ({ c, n: (start * 0.01) / Math.abs(c.entry - c.stop) }))
      const notional = sized.reduce((s, x) => s + x.n * x.c.entry, 0)
      const scale = Math.min(1, (start * variant.leverage) / (notional || 1))
      for (const { c, n } of sized) {
        const shares = n * scale
        const cost = fee.cost(shares, c.entry) + fee.cost(shares, c.exit)
        const pnl = c.side * (c.exit - c.entry) * shares - cost
        cash += pnl
        fees += cost
        trades++
        if (pnl > 0) wins++
        sumR += pnl / (start * 0.01 * scale)
      }
      peak = Math.max(peak, cash)
      maxDd = Math.max(maxDd, (1 - cash / peak) * 100)
    }
    const r = {
      variant: variant.name,
      fee: fee.name,
      trades,
      winRatePct: trades ? pct((wins / trades) * 100) : null,
      avgR: trades ? pct(sumR / trades) : null,
      returnPct: pct((cash / 10_000 - 1) * 100),
      feesUsd: pct(fees),
      maxDrawdownPct: pct(maxDd),
    }
    console.log(
      `${r.variant} · ${r.fee}: ${r.trades} trades, win ${r.winRatePct}%, avg ${r.avgR}R, ` +
        `${r.returnPct}% (fees $${r.feesUsd}), max DD ${r.maxDrawdownPct}%`,
    )
    results.push(r)
  }
console.log(`${dates.length} sessions ${dates[0]} → ${dates.at(-1)}, ${data.size} stocks`)
writeFileSync(process.env.OPTIMISTIC ? 'backtest/results-orb-optimistic.json' : 'backtest/results-orb.json', JSON.stringify({ first: dates[0], last: dates.at(-1), results }, null, 1) + '\n')
