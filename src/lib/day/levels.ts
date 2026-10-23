/**
 * The levels the day desk trades from, worked out from free bar data:
 *
 * - Volume profile of a session: each 5-minute bar's volume spread evenly
 *   over its high–low range. POC is the price with the most volume; the value
 *   area is the band around it holding 70% of the volume (VAH on top, VAL
 *   below), built the usual way, adding whichever side's next price has more.
 *   It's an approximation: real profiles count every trade at its price.
 * - VWAP of a session, from each bar's typical price.
 * - Daily ATR and EMAs for the trend.
 */
import type { Bar } from './bars.ts'

export type Profile = { poc: number; vah: number; val: number; step: number }

/** A price step that gives about 80–200 rows for the session's range. */
function stepFor(price: number, range: number): number {
  const raw = Math.max(range / 120, price * 0.0002)
  const pow = 10 ** Math.floor(Math.log10(raw))
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * pow) return m * pow
  return 10 * pow
}

export function volumeProfile(bars: Bar[], share = 0.7): Profile | null {
  if (!bars.length) return null
  const lo = Math.min(...bars.map((b) => b.l))
  const hi = Math.max(...bars.map((b) => b.h))
  const step = stepFor(bars.at(-1)!.c, hi - lo)
  const base = Math.floor(lo / step)
  const rows = new Array<number>(Math.floor(hi / step) - base + 1).fill(0)
  for (const b of bars) {
    const from = Math.floor(b.l / step) - base
    const to = Math.floor(b.h / step) - base
    const each = b.v / (to - from + 1)
    for (let i = from; i <= to; i++) rows[i] += each
  }
  const total = rows.reduce((a, b) => a + b, 0)
  if (total <= 0) return null
  let poc = 0
  for (let i = 1; i < rows.length; i++) if (rows[i] > rows[poc]) poc = i
  let [top, bottom] = [poc, poc]
  let inside = rows[poc]
  while (inside < total * share && (top < rows.length - 1 || bottom > 0)) {
    const up = top < rows.length - 1 ? rows[top + 1] : -1
    const down = bottom > 0 ? rows[bottom - 1] : -1
    if (up >= down) inside += rows[++top]
    else inside += rows[--bottom]
  }
  const price = (i: number) => (base + i + 0.5) * step
  return { poc: price(poc), vah: (base + top + 1) * step, val: (base + bottom) * step, step }
}

/** VWAP after each bar of a session. */
export function vwapSeries(bars: Bar[]): number[] {
  let pv = 0
  let vol = 0
  return bars.map((b) => {
    const typical = (b.h + b.l + b.c) / 3
    pv += typical * b.v
    vol += b.v
    return vol > 0 ? pv / vol : typical
  })
}

/** Average true range over the last `n` daily bars. */
export function atr(daily: Bar[], n = 14): number | null {
  if (daily.length < n + 1) return null
  const trs = daily.slice(-n).map((b, i, arr) => {
    const prev = i === 0 ? daily[daily.length - n - 1].c : arr[i - 1].c
    return Math.max(b.h - b.l, Math.abs(b.h - prev), Math.abs(b.l - prev))
  })
  return trs.reduce((a, b) => a + b, 0) / n
}

/** Exponential moving average of closes; null without enough bars. */
export function ema(closes: number[], n: number): number | null {
  if (closes.length < n) return null
  const k = 2 / (n + 1)
  let value = closes.slice(0, n).reduce((a, b) => a + b, 0) / n
  for (const c of closes.slice(n)) value = c * k + value * (1 - k)
  return value
}
