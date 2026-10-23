import { describe, expect, it } from 'vitest'

import type { Bar } from './bars'
import { scanStock } from './scan'

const day = (date: string, c: number, v = 1e7): Bar => ({
  t: 0,
  date,
  time: '09:30',
  o: c,
  h: c * 1.01,
  l: c * 0.99,
  c,
  v,
})
const dates = Array.from({ length: 80 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 6, 1 + i))
  return d.toISOString().slice(0, 10)
})

function intraday(date: string, around: number): Bar[] {
  // A session centred on `around`, most volume near it.
  return Array.from({ length: 78 }, (_, i) => {
    const m = 9 * 60 + 30 + i * 5
    const time = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
    const p = around + Math.sin(i / 6) * 1.5
    return { t: i, date, time, o: p, h: p + 0.3, l: p - 0.3, c: p, v: 100_000 }
  })
}

describe('scanStock', () => {
  it('reads yesterday’s value area and proposes a setup from where the price is', () => {
    const daily = dates.map((d, i) => day(d, 80 + i * 0.25)) // a steady uptrend to ~100
    const yesterday = dates.at(-2)!
    const today = dates.at(-1)!
    const pre: Bar[] = [{ t: 0, date: today, time: '08:00', o: 103.5, h: 103.6, l: 103.4, c: 103.5, v: 5000 }]
    const row = scanStock('TEST', daily, [...intraday(yesterday, 100), ...pre], today)!
    expect(row.trend).toBe('up')
    expect(row.location).toBe('above-value')
    expect(row.setup).toBe('hold')
    expect(row.val).toBeLessThan(row.poc)
    expect(row.vah).toBeGreaterThan(row.poc)
    expect(row.level).toBeLessThan(row.price)
    expect(row.gapPct).toBeGreaterThan(2)
    expect(['good', 'wait', 'avoid']).toContain(row.status)
  })
})
