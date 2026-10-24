/**
 * Makes a short-side copy of a symbol for the backtest: every price reflected
 * around the series' average (p → 2K − p, highs and lows swapped), so a long
 * trade on the copy makes and loses what a short on the original would, in
 * dollars per unit. Written as backtest/data/<symbol>-short.json.
 *
 *   node scripts/backtest-mirror.ts GC=F
 */
import { readFileSync, writeFileSync } from 'node:fs'

import type { Bar } from '../src/lib/day/bars.ts'

for (const symbol of process.argv.slice(2)) {
  const d: { daily: Bar[]; intraday: Bar[] } = JSON.parse(readFileSync(`backtest/data/${symbol}.json`, 'utf8'))
  const k = d.daily.reduce((s, b) => s + b.c, 0) / d.daily.length
  const flip = (b: Bar): Bar => ({ ...b, o: 2 * k - b.o, h: 2 * k - b.l, l: 2 * k - b.h, c: 2 * k - b.c })
  writeFileSync(
    `backtest/data/${symbol}-short.json`,
    JSON.stringify({ daily: d.daily.map(flip), intraday: d.intraday.map(flip) }),
  )
}
