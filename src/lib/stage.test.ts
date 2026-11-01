import { describe, expect, it } from 'vitest'

import { stageOf, weeklyCloses } from './stage'

/** Daily closes, weekdays only, from a function of the week number. */
function series(weeks: number, priceAt: (week: number) => number): [string, number][] {
  const out: [string, number][] = []
  const start = Date.UTC(2025, 0, 6) // a Monday
  for (let w = 0; w < weeks; w++)
    for (let d = 0; d < 5; d++)
      out.push([new Date(start + (w * 7 + d) * 86400000).toISOString().slice(0, 10), priceAt(w + d / 5)])
  return out
}

describe('stageOf', () => {
  it('keeps the last close of each week', () => {
    const weeks = weeklyCloses(series(2, (w) => w))
    expect(weeks).toEqual([
      ['2025-01-10', 0.8],
      ['2025-01-17', 1.8],
    ])
  })

  it('reads a steady climb as stage 2 and a steady slide as stage 4', () => {
    expect(stageOf(series(60, (w) => 50 + w))?.stage).toBe(2)
    expect(stageOf(series(60, (w) => 150 - w))?.stage).toBe(4)
  })

  it('tells a top (flat after a rise) from a base (flat after a fall)', () => {
    // 40 weeks up, then 32 flat at the high: the 30-week average flattens out above where it was.
    const top = stageOf(series(72, (w) => (w < 40 ? 50 + w : 90 + Math.sin(w * 3))))
    const base = stageOf(series(72, (w) => (w < 40 ? 130 - w : 90 + Math.sin(w * 3))))
    expect(top?.stage).toBe(3)
    expect(base?.stage).toBe(1)
  })

  it('needs about 34 weeks of history', () => {
    expect(stageOf(series(20, (w) => w))).toBeNull()
  })

  it('measures strength against the market', () => {
    const stock = series(60, (w) => 50 + w)
    const spy = series(60, () => 100)
    expect(stageOf(stock, spy)!.relStrengthPct).toBeGreaterThan(0)
    expect(stageOf(spy, stock)!.relStrengthPct).toBeLessThan(0)
  })
})
