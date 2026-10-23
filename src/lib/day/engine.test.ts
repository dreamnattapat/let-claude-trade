import { describe, expect, it } from 'vitest'

import type { Bar } from './bars'
import { playPlan, runAccount, RULES } from './engine'
import { volumeProfile, vwapSeries } from './levels'
import type { DayPlan } from './types'

/** 5-minute bars from 9:30, each [open, high, low, close, volume]. */
function session(rows: [number, number, number, number, number][], date = '2026-10-26'): Bar[] {
  return rows.map(([o, h, l, c, v], i) => {
    const m = 9 * 60 + 30 + i * 5
    const time = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
    return { t: i, date, time, o, h, l, c, v }
  })
}
const flat = (n: number, p = 100, v = 1000): [number, number, number, number, number][] =>
  Array.from({ length: n }, () => [p, p + 0.1, p - 0.1, p, v])

const plan = (p: Partial<DayPlan>): DayPlan => ({
  id: '2026-10-26-1',
  ticker: 'TEST',
  setup: 'reclaim',
  level: 100,
  levelName: 'VAL',
  target: 103,
  targetName: 'POC',
  environment: '',
  location: '',
  confirmation: '',
  execution: '',
  why: '',
  ...p,
})

describe('playPlan', () => {
  it('buys a reclaim: a look below the level, then a strong close back above on volume', () => {
    const bars = session([
      ...flat(4, 100.5), // 9:30–9:45 above
      [100.4, 100.4, 99.6, 99.7, 1500], // 9:50 looks below
      [99.7, 100.6, 99.5, 100.5, 4000], // 9:55 closes back above, green, heavy volume: confirmation
      [100.5, 101, 100.4, 100.9, 2000], // 10:00 entry at the open 100.5
      [100.9, 103.2, 100.8, 103, 2000], // 10:05 hits the target
      ...flat(10, 103),
    ])
    const out = playPlan(plan({}), bars)
    expect(out.status).toBe('win')
    expect(out.confirmedAt).toBe('09:55')
    expect(out.entry).toEqual({ time: '10:00', price: 100.5 })
    // Stop under the lowest low at the level (99.5) less 0.1% of the level.
    expect(out.stop).toBeCloseTo(99.4)
    expect(out.r).toBeCloseTo((103 - 100.5) / (100.5 - 99.4))
  })

  it('stays out without a confirmation bar, however close it came', () => {
    const bars = session([
      ...flat(4, 100.5),
      [100.4, 100.4, 99.6, 99.7, 1000],
      [99.7, 100.6, 99.5, 100.5, 900],
      ...flat(20, 100.4),
    ])
    expect(playPlan(plan({}), bars).status).toBe('no-confirm')
    expect(playPlan(plan({ level: 90 }), bars).status).toBe('no-touch')
  })

  it("won't take a trade under 1:2 at the real entry price", () => {
    const bars = session([
      ...flat(4, 100.5),
      [100.4, 100.4, 99.6, 99.7, 1500],
      [99.7, 100.6, 99.5, 100.5, 4000],
      ...flat(20, 100.6),
    ])
    const out = playPlan(plan({ target: 101.5 }), bars)
    expect(out.status).toBe('skipped-rr')
  })

  it('counts a bar that touches both stop and target as the stop', () => {
    const bars = session([
      ...flat(4, 100.5),
      [100.4, 100.4, 99.6, 99.7, 1500],
      [99.7, 100.6, 99.5, 100.5, 4000],
      [100.5, 103.5, 99, 101, 2000],
      ...flat(10, 101),
    ])
    const out = playPlan(plan({}), bars)
    expect(out.status).toBe('loss')
    expect(out.r).toBeCloseTo(-1)
  })

  it('buys a hold: back to a level it traded above, and a strong close there', () => {
    const bars = session([
      [101, 101.5, 100.9, 101.4, 1000],
      ...flat(3, 101.2),
      [101.2, 101.2, 100.05, 100.2, 1200], // 9:50 touches 100
      [100.2, 100.9, 100.1, 100.8, 3000], // 9:55 strong green on volume
      [100.8, 101, 100.7, 100.9, 1000], // 10:00 entry 100.8
      ...flat(71, 101), // to the 15:55 bar
    ])
    const out = playPlan(plan({ setup: 'hold', target: 104 }), bars)
    expect(out.status).toBe('time-exit')
    expect(out.entry?.price).toBe(100.8)
    expect(out.exit?.time).toBe('15:55')
  })

  it('ignores bars from before the plan existed, and is still waiting mid-session', () => {
    const bars = session([
      ...flat(4, 100.5),
      [100.4, 100.4, 99.6, 99.7, 1500],
      [99.7, 100.6, 99.5, 100.5, 4000],
      ...flat(3, 100.6),
    ])
    // Written at 10:00: the 9:55 confirmation came before it.
    expect(playPlan(plan({}), bars, { notBefore: 10 * 60 }).status).toBe('no-confirm')
    expect(playPlan(plan({}), bars.slice(0, 5), { final: false }).status).toBe('waiting')
  })
})

describe('runAccount', () => {
  it('risks 1% a trade, pays commission both ways and caps one trade at half the account', () => {
    const outcome = {
      planId: 'p',
      status: 'win' as const,
      note: '',
      entry: { time: '10:00', price: 100 },
      stop: 99,
      exit: { time: '11:00', price: 102 },
      r: 2,
    }
    const acct = runAccount([{ date: '2026-10-26', plans: [plan({ id: 'p' })], outcomes: [outcome] }])
    // $100 risk / $1 = 100 shares, but half of $10,000 buys only 50.
    expect(acct.trades[0].units).toBeCloseTo(50)
    expect(acct.trades[0].pnlUsd).toBeCloseTo(50 * 2 - 50 * 202 * (RULES.commissionPct / 100))
  })
})

describe('levels', () => {
  it('finds the point of control and a value area around it', () => {
    const bars = session([...flat(10, 100, 5000), ...flat(3, 102, 300), ...flat(3, 98, 300)])
    const p = volumeProfile(bars)!
    expect(p.poc).toBeCloseTo(100, 0)
    expect(p.val).toBeLessThanOrEqual(100)
    expect(p.vah).toBeGreaterThanOrEqual(100)
    expect(vwapSeries(bars).at(-1)).toBeCloseTo(100, 0)
  })
})
