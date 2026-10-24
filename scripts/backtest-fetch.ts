/**
 * Downloads history for the day-desk backtest (run by the backtest workflow):
 * 5-minute bars with pre-market for the last 60 days (Yahoo's limit) and a
 * year of daily bars, for every stock in the scan's universe and SPY.
 *
 *   node scripts/backtest-fetch.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs'

import { parseBars, type ChartJson } from '../src/lib/day/bars.ts'
import { UNIVERSE } from '../src/lib/day/scan.ts'
import { pool } from './day-fetch.ts'

const DIR = 'backtest/data'
mkdirSync(DIR, { recursive: true })

async function get(symbol: string, query: string) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${query}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
    )
    if (response.ok) return parseBars(symbol, (await response.json()) as ChartJson)
    if (attempt >= 3) throw new Error(`${symbol}: HTTP ${response.status}`)
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)))
  }
}

const symbols = process.argv.length > 2 ? process.argv.slice(2) : [...new Set([...UNIVERSE, 'SPY'])]
const errors: string[] = []
await pool(symbols, 4, async (s) => {
  try {
    const [daily, intraday] = await Promise.all([
      get(s, 'interval=1d&range=1y'),
      get(s, 'interval=5m&range=60d&includePrePost=true'),
    ])
    writeFileSync(`${DIR}/${s}.json`, JSON.stringify({ daily, intraday }))
    console.log(`${s}: ${daily.length} daily, ${intraday.length} 5-min`)
  } catch (e) {
    errors.push((e as Error).message)
  }
})
if (errors.length) console.log('Errors:', errors.join('; '))
