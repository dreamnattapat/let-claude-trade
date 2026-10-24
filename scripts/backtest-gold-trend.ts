/**
 * Gold on daily bars over ten years: time-series momentum (Moskowitz, Ooi &
 * Pedersen 2012) against simply holding. Long when the last 12 months (252
 * sessions) are up, else flat (or short); checked every 21 sessions; 0.05% a side.
 *
 *   node scripts/backtest-gold-trend.ts
 */
import { readFileSync } from 'node:fs'

import type { Bar } from '../src/lib/day/bars.ts'

const daily: Bar[] = JSON.parse(readFileSync('backtest/gold/GC-1d.json', 'utf8'))
const cost = 0.0005
for (const mode of ['flat', 'short'] as const) {
  for (const look of [252, 126]) {
    let value = 1
    let pos = 0
    let switches = 0
    let peak = 1
    let dd = 0
    for (let i = look; i < daily.length; i++) {
      if ((i - look) % 21 === 0) {
        const up = daily[i - 1].c > daily[i - 1 - look + 1].c
        const next = up ? 1 : mode === 'short' ? -1 : 0
        if (next !== pos) {
          value *= 1 - cost * Math.abs(next - pos)
          switches++
          pos = next
        }
      }
      value *= 1 + pos * (daily[i].c / daily[i - 1].c - 1)
      peak = Math.max(peak, value)
      dd = Math.max(dd, 1 - value / peak)
    }
    const hold = daily.at(-1)!.c / daily[look].c
    let hpeak = 0
    let hdd = 0
    for (let i = look; i < daily.length; i++) {
      hpeak = Math.max(hpeak, daily[i].c)
      hdd = Math.max(hdd, 1 - daily[i].c / hpeak)
    }
    console.log(
      `${look}-day trend, ${mode} when down, ${daily[look].date} → ${daily.at(-1)!.date}: ×${value.toFixed(2)} ` +
        `(max drawdown ${(dd * 100).toFixed(0)}%, ${switches} switches) · holding ×${hold.toFixed(2)} (max drawdown ${(hdd * 100).toFixed(0)}%)`,
    )
  }
}
