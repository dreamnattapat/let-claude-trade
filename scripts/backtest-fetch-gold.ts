/**
 * Longer gold history for the strategy search: hourly bars for the last two
 * years (Yahoo's limit for 1h) and ten years of daily bars, COMEX gold futures.
 *
 *   node scripts/backtest-fetch-gold.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs'

import { parseBars, type ChartJson } from '../src/lib/day/bars.ts'

mkdirSync('backtest/gold', { recursive: true })
for (const [file, query] of [
  ['GC-1h', 'interval=1h&range=730d'],
  ['GC-1d', 'interval=1d&range=10y'],
]) {
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?${query}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`)
  const bars = parseBars('GC=F', (await response.json()) as ChartJson)
  writeFileSync(`backtest/gold/${file}.json`, JSON.stringify(bars))
  console.log(`${file}: ${bars.length} bars, ${bars[0]?.date} → ${bars.at(-1)?.date}`)
}
