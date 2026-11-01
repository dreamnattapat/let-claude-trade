/**
 * Stan Weinstein's stage analysis (Secrets for Profiting in Bull and Bear Markets), worked out from daily closes:
 *
 *   Stage 1, basing:    the 30-week average has flattened after a decline; the price chops around it.
 *   Stage 2, advancing: the price is above a rising 30-week average. The only stage Weinstein buys.
 *   Stage 3, topping:   the average flattens after an advance; the price chops around it.
 *   Stage 4, declining: the price is below a falling 30-week average. Weinstein never buys or holds here.
 *
 * The team uses it as Tempo's chart check next to Lynch's homework (dream/PLAYBOOK.md): the company decides
 * whether we want it, the stage decides whether now is the time, and never the other way round.
 */

export type Stage = 1 | 2 | 3 | 4

export type StageReading = {
  stage: Stage
  /** The last weekly close and the 30-week average of weekly closes. */
  closeUsd: number
  ma30wUsd: number
  /** How far the close is above (+) or below (−) the average, %. */
  vsMaPct: number
  /** How much the average moved over the last 4 weeks, %: above +1 rising, below −1 falling, else flat. */
  maSlopePct: number
  /**
   * Mansfield relative strength against the S&P 500: the price ÷ SPY ratio against its own 52-week average, %.
   * Above 0, the stock is beating the market. Null without a year of both.
   */
  relStrengthPct: number | null
  /** The week the reading is for (its last trading day). */
  weekOf: string
}

/** Rising or falling only beyond this much over 4 weeks, %. */
export const SLOPE_FLAT_PCT = 1
const MA_WEEKS = 30
const SLOPE_WEEKS = 4
/** For a flat average: was it higher (topping, stage 3) or lower (basing, stage 1) this many weeks before? */
const LOOKBACK_WEEKS = 20

/** The last close of each week (weeks end on the last trading day before a Monday). */
export function weeklyCloses(daily: [string, number][]): [string, number][] {
  const weeks: [string, number][] = []
  let key = ''
  for (const [date, close] of daily) {
    const d = new Date(`${date}T00:00:00Z`)
    // The Monday that starts this date's week.
    const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10)
    if (monday === key) weeks[weeks.length - 1] = [date, close]
    else {
      weeks.push([date, close])
      key = monday
    }
  }
  return weeks
}

const average = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

/** The stage from daily closes (at least about 35 weeks of them), and SPY's for relative strength. */
export function stageOf(daily: [string, number][], spyDaily?: [string, number][]): StageReading | null {
  const weeks = weeklyCloses(daily)
  if (weeks.length < MA_WEEKS + SLOPE_WEEKS) return null
  const closes = weeks.map(([, c]) => c)
  const maAt = (end: number) => average(closes.slice(end - MA_WEEKS, end))
  const n = closes.length
  const ma = maAt(n)
  const maSlopePct = (ma / maAt(n - SLOPE_WEEKS) - 1) * 100
  const close = closes[n - 1]
  const above = close > ma
  const rising = maSlopePct > SLOPE_FLAT_PCT
  const falling = maSlopePct < -SLOPE_FLAT_PCT

  let stage: Stage
  if (rising)
    stage = above ? 2 : 3 // a rising average the price has dropped below: the advance is tiring
  else if (falling)
    stage = above ? 1 : 4 // a falling average the price has climbed over: a base may be forming
  else {
    // Flat: a top if the average was lower before (it rose into this), a base if it was higher (it fell into this).
    const back = n - LOOKBACK_WEEKS >= MA_WEEKS ? maAt(n - LOOKBACK_WEEKS) : null
    stage = back != null && back < ma ? 3 : 1
  }

  let relStrengthPct: number | null = null
  if (spyDaily) {
    const spyWeeks = new Map(weeklyCloses(spyDaily))
    const ratios = weeks.flatMap(([date, c]) => (spyWeeks.has(date) ? [c / spyWeeks.get(date)!] : []))
    if (ratios.length >= 52 && spyWeeks.has(weeks[n - 1][0]))
      relStrengthPct = (ratios[ratios.length - 1] / average(ratios.slice(-52)) - 1) * 100
  }

  return {
    stage,
    closeUsd: close,
    ma30wUsd: ma,
    vsMaPct: (close / ma - 1) * 100,
    maSlopePct,
    relStrengthPct,
    weekOf: weeks[n - 1][0],
  }
}

export const STAGE_LABELS: Record<Stage, string> = {
  1: 'ฐาน',
  2: 'ขาขึ้น',
  3: 'ทำยอด',
  4: 'ขาลง',
}
