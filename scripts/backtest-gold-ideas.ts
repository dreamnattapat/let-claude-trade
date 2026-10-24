/**
 * The search for a new gold day-trade rule: a handful of rules fixed in advance
 * from published work, each tested on two years of hourly COMEX gold
 * (backtest/gold, scripts/backtest-fetch-gold.ts), first year and second year
 * apart, so a rule that only fits one stretch shows it. No rule is tuned to the
 * data. Returns are % of 1× notional per day, after costs on every entry and exit.
 *
 * A session runs from 18:00 New York (the Globex open) to 17:00 the next day,
 * and is named by the day it ends.
 *
 *   node scripts/backtest-gold-ideas.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'

import type { Bar } from '../src/lib/day/bars.ts'

const hourly: Bar[] = JSON.parse(readFileSync('backtest/gold/GC-1h.json', 'utf8'))
const nextDay = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
const sessions = new Map<string, Bar[]>()
for (const b of hourly) {
  if (b.time.slice(3) !== '00') continue // a few half-hour stray bars
  const day = b.time >= '18:00' ? nextDay(b.date) : b.date
  if (!sessions.has(day)) sessions.set(day, [])
  sessions.get(day)!.push(b)
}
const days = [...sessions.keys()].filter((d) => {
  const s = sessions.get(d)!
  return s.length >= 20 && s[0].time === '18:00' && s.some((b) => b.time === '16:00')
})
const at = (s: Bar[], time: string) => s.find((b) => b.time === time)

/** One day's trade: direction (1 long, −1 short), entry and exit prices; null = no trade. */
type Trade = { dir: 1 | -1; entry: number; exit: number } | null
type Rule = { name: string; why: string; play: (s: Bar[], prev: Bar[] | undefined) => Trade }

/** Stops a trade out if a bar from `from` on crosses the stop; otherwise out at the close of `until`. */
function ride(s: Bar[], from: number, dir: 1 | -1, entry: number, stop: number | null, until: string): Trade {
  for (let i = from; i < s.length; i++) {
    const b = s[i]
    if (stop != null && (dir === 1 ? b.l <= stop : b.h >= stop))
      return { dir, entry, exit: dir === 1 ? Math.min(b.o, stop) : Math.max(b.o, stop) }
    if (b.time === until) return { dir, entry, exit: b.c }
  }
  return null
}

const RULES: Rule[] = [
  {
    name: 'ถือทั้งวัน (เส้นฐาน)',
    why: 'ซื้อตอนเปิด 18:00 ขายตอน 16:00 นิวยอร์กทุกวัน: เท่ากับถือทองไว้เฉยๆ ใช้เทียบ',
    play: (s) => ({ dir: 1, entry: s[0].o, exit: at(s, '16:00')!.c }),
  },
  {
    name: 'ถือช่วงเอเชีย-ลอนดอน',
    why: 'ซื้อ 18:00 ขาย 08:00 นิวยอร์ก (05:00–19:00 ไทย) งานวิจัย "night effect" พบว่าทองให้ผลตอบแทนช่วงนอกเวลาสหรัฐฯ',
    play: (s) => ({ dir: 1, entry: s[0].o, exit: at(s, '08:00')?.o ?? at(s, '07:00')!.c }),
  },
  {
    name: 'ถือช่วงนิวยอร์ก',
    why: 'ซื้อ 08:00 ขาย 16:00 นิวยอร์ก: อีกครึ่งของวัน ใช้เทียบกับช่วงเอเชีย-ลอนดอน',
    play: (s) => {
      const open = at(s, '08:00')
      return open ? { dir: 1, entry: open.o, exit: at(s, '16:00')!.c } : null
    },
  },
  {
    name: 'โมเมนตัมช่วงเช้า → ชั่วโมงท้าย',
    why: 'Gao และคณะ (2018): ทิศทางตั้งแต่เปิดถึง 10:00 ทำนายชั่วโมงท้าย เทรดตามทิศนั้น 15:00–17:00',
    play: (s) => {
      const ten = at(s, '09:00')
      const last = at(s, '15:00')
      if (!ten || !last || ten.c === s[0].o) return null
      return { dir: ten.c > s[0].o ? 1 : -1, entry: last.o, exit: at(s, '16:00')!.c }
    },
  },
  {
    name: 'โมเมนตัมช่วงเช้า → ถือถึงเย็น',
    why: 'ทิศทางตั้งแต่เปิดถึง 10:00 แล้วเทรดตามทิศนั้นจน 17:00 (time-series momentum ภายในวัน)',
    play: (s) => {
      const ten = at(s, '09:00')
      const i = s.findIndex((b) => b.time === '10:00')
      if (!ten || i < 0 || ten.c === s[0].o) return null
      return { dir: ten.c > s[0].o ? 1 : -1, entry: s[i].o, exit: at(s, '16:00')!.c }
    },
  },
  {
    name: 'ทะลุกรอบเมื่อวาน (สองทาง)',
    why: 'ช่วง 08:00–15:00 แท่งชั่วโมงปิดเหนือ high เมื่อวาน = ซื้อ, ใต้ low = ขาย stop กลางกรอบเมื่อวาน ออก 17:00 (breakout คลาสสิก)',
    play: (s, prev) => {
      if (!prev) return null
      const hi = Math.max(...prev.map((b) => b.h))
      const lo = Math.min(...prev.map((b) => b.l))
      const mid = (hi + lo) / 2
      for (let i = 0; i < s.length - 1; i++) {
        const b = s[i]
        if (b.time < '08:00' || b.time > '15:00' || b.time >= '18:00') continue
        const dir = b.c > hi ? 1 : b.c < lo ? -1 : 0
        if (dir) return ride(s, i + 1, dir, s[i + 1].o, mid, '16:00')
      }
      return null
    },
  },
  {
    name: 'กลับตัวที่ขอบกรอบเมื่อวาน (สองทาง)',
    why: 'ตรงข้ามกับข้อบน: แตะ high เมื่อวานแล้วปิดกลับใต้ = ขาย, แตะ low แล้วปิดกลับเหนือ = ซื้อ stop เลยจุดสุด 0.3% ออก 17:00',
    play: (s, prev) => {
      if (!prev) return null
      const hi = Math.max(...prev.map((b) => b.h))
      const lo = Math.min(...prev.map((b) => b.l))
      for (let i = 0; i < s.length - 1; i++) {
        const b = s[i]
        if (b.time < '08:00' || b.time > '15:00' || b.time >= '18:00') continue
        if (b.h > hi && b.c < hi) return ride(s, i + 1, -1, s[i + 1].o, b.h * 1.003, '16:00')
        if (b.l < lo && b.c > lo) return ride(s, i + 1, 1, s[i + 1].o, b.l * 0.997, '16:00')
      }
      return null
    },
  },
]

const COSTS = [0.05, 0.02] // % per side
const split = days[Math.floor(days.length / 2)]
const pct = (x: number) => Math.round(x * 1000) / 1000

function stats(rets: number[], activeDays: number) {
  const n = rets.length
  if (!n) return { trades: 0 }
  const mean = rets.reduce((a, b) => a + b, 0) / n
  // Daily: flat days count as 0, so a rule that rarely trades isn't flattered.
  const all = [...rets, ...Array(Math.max(activeDays - n, 0)).fill(0)]
  const m = all.reduce((a, b) => a + b, 0) / all.length
  const sd = Math.sqrt(all.reduce((a, b) => a + (b - m) ** 2, 0) / all.length)
  const total = (rets.reduce((acc, r) => acc * (1 + r / 100), 1) - 1) * 100
  return {
    trades: n,
    winPct: pct((rets.filter((r) => r > 0).length / n) * 100),
    avgPct: pct(mean),
    totalPct: pct(total),
    sharpe: sd ? pct((m / sd) * Math.sqrt(252)) : null,
  }
}

const out = []
console.log(`${days.length} sessions ${days[0]} → ${days.at(-1)} · halves split at ${split}`)
for (const rule of RULES) {
  const trades = days.map((d, i) => ({ d, t: rule.play(sessions.get(d)!, i ? sessions.get(days[i - 1]) : undefined) }))
  for (const cost of COSTS) {
    const ret = (half: (d: string) => boolean) =>
      trades
        .filter((x) => x.t && half(x.d))
        .map(({ t }) => t!.dir * (t!.exit / t!.entry - 1) * 100 - 2 * cost)
    const first = stats(ret((d) => d < split), days.filter((d) => d < split).length)
    const second = stats(ret((d) => d >= split), days.filter((d) => d >= split).length)
    const all = stats(ret(() => true), days.length)
    out.push({ rule: rule.name, why: rule.why, costPct: cost, all, first, second })
    console.log(
      `${rule.name} @${cost}%: ${all.trades} trades, win ${all.winPct}%, avg ${all.avgPct}%, total ${all.totalPct}%, ` +
        `Sharpe ${all.sharpe} · 1st half ${first.totalPct}% (S ${first.sharpe}) · 2nd half ${second.totalPct}% (S ${second.sharpe})`,
    )
  }
}
writeFileSync(
  'backtest/results-gold-ideas.json',
  JSON.stringify({ first: days[0], last: days.at(-1), split, sessions: days.length, results: out }, null, 1) + '\n',
)
