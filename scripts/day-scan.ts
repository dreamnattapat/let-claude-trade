/**
 * The day desk's pre-open scan, run by the GitHub Action before the US open:
 * the market strip, CNN's Fear & Greed, and every stock in the universe
 * checked against yesterday's value area (src/lib/day/scan.ts). Writes
 * public/day/scan/<date>.json for the AI desk and the website.
 *
 *   node scripts/day-scan.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

import { newYork } from '../src/lib/day/bars.ts'
import { MARKET } from '../src/lib/day/market.ts'
import { scanBothSides, UNIVERSE } from '../src/lib/day/scan.ts'
import type { DayScan } from '../src/lib/day/types.ts'
import { bars, fearGreed, pool, quote } from './day-fetch.ts'

const today = newYork(new Date()).date
const weekday = new Date(`${today}T12:00:00Z`).getUTCDay()
if (weekday === 0 || weekday === 6) {
  console.log(`${today} is a weekend: no scan`)
  process.exit(0)
}

const errors: string[] = []
const market = (
  await pool([...MARKET], 4, async (m) => {
    try {
      const q = await quote(m.symbol)
      return {
        symbol: m.symbol,
        name: m.name,
        price: Math.round(q.price * 100) / 100,
        changePct: Math.round((q.price / q.prevClose - 1) * 10000) / 100,
      }
    } catch (e) {
      errors.push(`${m.symbol}: ${(e as Error).message}`)
      return null
    }
  })
).filter((m) => m != null)

const rows = (
  await pool([...UNIVERSE], 5, async (ticker) => {
    try {
      const [daily, intraday] = await Promise.all([
        bars(ticker, { interval: '1d', range: '6mo' }),
        bars(ticker, { interval: '5m', range: '5d', prePost: true }),
      ])
      const row = scanBothSides(ticker, daily, intraday, today)
      if (!row.length) errors.push(`${ticker}: not enough data (${daily.length} daily, ${intraday.length} 5-min bars)`)
      return row
    } catch (e) {
      errors.push(`${ticker}: ${(e as Error).message}`)
      return null
    }
  })
).flatMap((r) => r ?? [])
const order = { good: 0, wait: 1, avoid: 2 }
rows.sort((a, b) => order[a.status] - order[b.status] || (b.estRr ?? 0) - (a.estRr ?? 0))

const scan: DayScan = { date: today, scannedAt: new Date().toISOString(), market, fearGreed: await fearGreed(), rows, ...(errors.length ? { errors } : {}) }
for (const e of errors) console.warn(e)
writeFileSync(`public/day/scan/${today}.json`, JSON.stringify(scan, null, 1) + '\n')
const indexPath = 'public/day/scan/index.json'
const index = existsSync(indexPath)
  ? (JSON.parse(readFileSync(indexPath, 'utf8')) as { scans: string[] })
  : { scans: [] }
if (!index.scans.includes(today)) index.scans.push(today)
index.scans.sort()
writeFileSync(indexPath, JSON.stringify(index, null, 1) + '\n')
console.log(
  `Scan ${today}: ${rows.filter((r) => r.status === 'good').length} good, ${rows.filter((r) => r.status === 'wait').length} wait, ${rows.filter((r) => r.status === 'avoid').length} avoid of ${rows.length}`,
)
