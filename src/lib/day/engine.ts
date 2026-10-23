/**
 * The day desk's trading engine. The AI desk only picks a stock, a setup, a
 * level and a target before the open; whether a trade happens is decided here,
 * bar by bar on real 5-minute data, by fixed rules the desk can't bend:
 *
 * - Location: price has to come to the level.
 * - Confirmation: a 5-minute bar at the level has to close back above it,
 *   green, in the top half of its range, on volume well above the bars
 *   before it (buyers absorbing the selling there). No confirmation, no trade.
 * - Execution: buy at the next bar's open; stop just under the low made at
 *   the level; take profit at the target; only if that is at least 1:2.
 *   Out by the last bar of the day at the latest (a day trade holds nothing
 *   overnight). A bar that touches both stop and target counts as the stop.
 *
 * The account risks 1% of its value per trade, stops for the day after
 * losing 2%, pays Dime!'s commission both ways and buys fractional shares.
 */
import { minutesOf, type Bar } from './bars.ts'
import type { DayPlan } from './types.ts'

export const RULES = {
  /** No entries in the first 15 minutes, nor after 15:00 New York. */
  entryFrom: 9 * 60 + 45,
  entryUntil: 15 * 60,
  /** The last 5-minute bar of the session: everything is sold at its close. */
  lastBar: 15 * 60 + 55,
  /** A touch: within 0.15% of the level. A look below: 0.1% under it. */
  touch: 0.0015,
  below: 0.001,
  /** "Trading above it" for a hold: a close 0.2% above. Broken: a close 0.2% below. */
  above: 0.002,
  broken: 0.002,
  /** Confirmation volume against the average of up to the 12 bars before. */
  volume: { reclaim: 1.5, hold: 1.3 },
  /** The stop sits this far under the low at the level (% of the level). */
  stopBuffer: 0.001,
  minRr: 2,
  riskPct: 1,
  /** One trade may use at most this share of the account. */
  maxPositionPct: 50,
  dailyLossPct: 2,
  maxPlans: 3,
  commissionPct: 0.1605,
  startingCashUsd: 10_000,
} as const

export type PlanStatus =
  /** The session isn't over: still looking, or in a trade. */
  | 'waiting'
  | 'open'
  /** Never came to the level / came but no confirmation / confirmed but not worth it / gapped through the stop. */
  | 'no-touch'
  | 'no-confirm'
  | 'skipped-rr'
  | 'gap-stop'
  /** Traded: hit the target, the stop, or sold at the close. */
  | 'win'
  | 'loss'
  | 'time-exit'

export const STATUS_LABELS: Record<PlanStatus, string> = {
  waiting: 'รอ',
  open: 'ถืออยู่',
  'no-touch': 'ราคาไม่มาถึงจุด',
  'no-confirm': 'ไม่มีสัญญาณยืนยัน ไม่เข้า',
  'skipped-rr': 'มีสัญญาณแต่ไม่คุ้ม 1:2 ไม่เข้า',
  'gap-stop': 'เปิดต่ำกว่า stop ไม่เข้า',
  win: 'ชนเป้า',
  loss: 'ชน stop',
  'time-exit': 'ขายตอนตลาดปิด',
}

export type PlanOutcome = {
  planId: string
  status: PlanStatus
  /** What happened, in a short Thai sentence. */
  note: string
  touchedAt?: string
  confirmedAt?: string
  entry?: { time: string; price: number }
  stop?: number
  exit?: { time: string; price: number }
  /** Reward:risk at entry after commission both ways (what the 1:2 rule checks), and before it. */
  rr?: number
  grossRr?: number
  /** The result in R after commission: (exit − entry − commission) ÷ (entry − stop). */
  r?: number
  /** Best and worst the trade got, in R. */
  mfeR?: number
  maeR?: number
  /** Where the stock closed against the level, %: what staying out (or getting in) was worth. */
  closeVsLevelPct?: number
}

const end = (b: Bar) => minutesOf(b.time) + 5

/** Reward:risk after commission on the way in and out: (target − entry − fees if it wins) ÷ (entry − stop + fees if it loses). */
export function netRr(
  entry: number,
  stop: number,
  target: number,
  commissionPct: number = RULES.commissionPct,
): number {
  const f = commissionPct / 100
  return (target - entry - (entry + target) * f) / (entry - stop + (entry + stop) * f)
}

/** A result in R after commission both ways, R being the distance to the stop. */
function netR(entry: number, exit: number, risk: number, fee: number): number {
  return (exit - entry - (entry + exit) * fee) / risk
}

/**
 * Plays one plan through one session's regular-hours 5-minute bars.
 * `notBefore`: New York minutes before which the plan didn't exist yet
 * (from its commit time); bars that end earlier can't confirm or enter.
 * `final`: the session is over (otherwise unfinished plans stay waiting/open).
 */
export function playPlan(plan: DayPlan, bars: Bar[], { notBefore = 0, final = true } = {}): PlanOutcome {
  const L = plan.level
  const base = { planId: plan.id }
  const closeVsLevelPct = bars.length ? (bars.at(-1)!.c / L - 1) * 100 : undefined
  let swept = false
  let wasAbove = false
  let touchedAt: string | undefined
  let lowAtLevel = Infinity
  let confirm: { i: number; bar: Bar } | null = null

  for (let i = 0; i < bars.length && !confirm; i++) {
    const b = bars[i]
    // Bars from before the plan existed can show the trend, but not the touch it's waiting for.
    const live = end(b) >= notBefore + 5
    if (plan.setup === 'reclaim') {
      if (live && b.l < L * (1 - RULES.below)) {
        if (!swept) touchedAt = b.time
        swept = true
      }
      if (swept) lowAtLevel = Math.min(lowAtLevel, b.l)
    } else {
      if (!touchedAt && b.c > L * (1 + RULES.above)) wasAbove = true
      if (live && wasAbove && !touchedAt && b.l <= L * (1 + RULES.touch)) touchedAt = b.time
      if (touchedAt) {
        lowAtLevel = Math.min(lowAtLevel, b.l)
        if (b.c < L * (1 - RULES.broken)) {
          return {
            ...base,
            status: 'no-confirm',
            touchedAt,
            note: `แตะแนว ${touchedAt} แล้วปิดหลุดแนว จึงไม่เข้า`,
            closeVsLevelPct,
          }
        }
      }
    }
    const ready = plan.setup === 'reclaim' ? swept : !!touchedAt
    if (!ready || end(b) < notBefore + 5 || end(b) < RULES.entryFrom || end(b) > RULES.entryUntil) continue
    const prior = bars.slice(Math.max(0, i - 12), i)
    const avg = prior.length >= 3 ? prior.reduce((s, x) => s + x.v, 0) / prior.length : Infinity
    const range = b.h - b.l
    // The confirmation bar has to trade at the level itself, not just be a strong bar somewhere above it.
    const atLevel = b.l <= L * (1 + RULES.touch)
    const strong = atLevel && b.c > L && b.c > b.o && range > 0 && (b.c - b.l) / range >= 0.5
    if (strong && b.v >= RULES.volume[plan.setup] * avg) confirm = { i, bar: b }
  }

  if (!confirm) {
    if (!final)
      return {
        ...base,
        status: 'waiting',
        touchedAt,
        note: touchedAt ? 'มาถึงจุดแล้ว รอสัญญาณยืนยัน' : 'รอราคามาถึงจุด',
      }
    return touchedAt
      ? {
          ...base,
          status: 'no-confirm',
          touchedAt,
          note: `มาถึงจุดตอน ${touchedAt} แต่ไม่มีแท่งยืนยัน จึงไม่เข้า`,
          closeVsLevelPct,
        }
      : { ...base, status: 'no-touch', note: 'ราคาไม่มาถึงจุดที่วางไว้ทั้งวัน', closeVsLevelPct }
  }

  const next = bars[confirm.i + 1]
  const confirmedAt = confirm.bar.time
  if (!next) {
    return final
      ? {
          ...base,
          status: 'no-confirm',
          touchedAt,
          confirmedAt,
          note: 'สัญญาณมาตอนท้ายตลาด ไม่มีแท่งให้เข้า',
          closeVsLevelPct,
        }
      : {
          ...base,
          status: 'waiting',
          touchedAt,
          confirmedAt,
          note: `มีสัญญาณยืนยันตอน ${confirmedAt} จะเข้าที่ราคาเปิดแท่งถัดไป`,
        }
  }
  if (minutesOf(next.time) < RULES.entryFrom || minutesOf(next.time) > RULES.entryUntil) {
    return { ...base, status: 'no-confirm', touchedAt, confirmedAt, note: 'สัญญาณมานอกเวลาที่เข้าได้', closeVsLevelPct }
  }
  const entry = next.o
  const stop = Math.min(lowAtLevel, confirm.bar.l) - L * RULES.stopBuffer
  if (entry <= stop)
    return {
      ...base,
      status: 'gap-stop',
      touchedAt,
      confirmedAt,
      stop,
      note: 'ราคาเปิดต่ำกว่า stop ไม่เข้า',
      closeVsLevelPct,
    }
  const risk = entry - stop
  // Reward:risk after Dime!'s commission both ways: it shrinks the win and adds to the loss.
  const fee = RULES.commissionPct / 100
  const grossRr = (plan.target - entry) / risk
  const rr = netRr(entry, stop, plan.target)
  if (!(rr >= RULES.minRr - 1e-9))
    return {
      ...base,
      status: 'skipped-rr',
      touchedAt,
      confirmedAt,
      stop,
      rr,
      grossRr,
      note: `มีสัญญาณตอน ${confirmedAt} แต่ถ้าเข้าที่ ${entry.toFixed(2)} คุ้มเสี่ยงหลังหักค่าคอมแค่ 1:${Math.max(rr, 0).toFixed(1)} (ก่อนหัก 1:${Math.max(grossRr, 0).toFixed(1)}) จึงไม่เข้า`,
      closeVsLevelPct,
    }

  let mfe = 0
  let mae = 0
  for (let j = confirm.i + 1; j < bars.length; j++) {
    const b = bars[j]
    mfe = Math.max(mfe, (b.h - entry) / risk)
    mae = Math.min(mae, (b.l - entry) / risk)
    const trade = { touchedAt, confirmedAt, entry: { time: next.time, price: entry }, stop, rr, grossRr }
    if (b.l <= stop) {
      const price = Math.min(b.o, stop) // a gap below the stop fills at the open
      return {
        ...base,
        status: 'loss',
        ...trade,
        exit: { time: b.time, price },
        r: netR(entry, price, risk, fee),
        mfeR: mfe,
        maeR: mae,
        note: `เข้า ${next.time} ชน stop ${b.time}`,
        closeVsLevelPct,
      }
    }
    if (b.h >= plan.target) {
      const price = Math.max(b.o, plan.target)
      return {
        ...base,
        status: 'win',
        ...trade,
        exit: { time: b.time, price },
        r: netR(entry, price, risk, fee),
        mfeR: mfe,
        maeR: mae,
        note: `เข้า ${next.time} ชนเป้า ${b.time}`,
        closeVsLevelPct,
      }
    }
    if (minutesOf(b.time) >= RULES.lastBar) {
      return {
        ...base,
        status: 'time-exit',
        ...trade,
        exit: { time: b.time, price: b.c },
        r: netR(entry, b.c, risk, fee),
        mfeR: mfe,
        maeR: mae,
        note: `เข้า ${next.time} ไม่ชนทั้งเป้าและ stop ขายตอนตลาดปิด`,
        closeVsLevelPct,
      }
    }
  }
  const last = bars.at(-1)!
  return {
    ...base,
    status: final ? 'time-exit' : 'open',
    touchedAt,
    confirmedAt,
    entry: { time: next.time, price: entry },
    stop,
    rr,
    ...(final ? { exit: { time: last.time, price: last.c }, r: netR(entry, last.c, risk, fee) } : {}),
    mfeR: mfe,
    maeR: mae,
    note: final
      ? `เข้า ${next.time} ขายตอนตลาดปิด`
      : `เข้าแล้ว ${next.time} ที่ ${entry.toFixed(2)} ตอนนี้ ${last.c.toFixed(2)}`,
    closeVsLevelPct,
  }
}

export type DayTrade = {
  date: string
  planId: string
  ticker: string
  entryTime: string
  entry: number
  exitTime: string
  exit: number
  units: number
  stop: number
  r: number
  /** After commission; and the commission paid, both ways. */
  pnlUsd: number
  commissionUsd?: number
  /** Taken or not: skipped when the day's loss limit was already hit. */
  taken: boolean
  note?: string
}

export type DayAccount = {
  cashUsd: number
  trades: DayTrade[]
  /** Account value at the end of each graded day. */
  points: { date: string; valueUsd: number }[]
}

/**
 * The paper account across days: trades in the order they were entered,
 * each sized to risk 1% of the account at the start of its day, at most half
 * the account in one trade, no new trades once the day has lost 2%.
 */
export function runAccount(days: { date: string; plans: DayPlan[]; outcomes: PlanOutcome[] }[]): DayAccount {
  const fee = RULES.commissionPct / 100
  let cash = RULES.startingCashUsd
  const trades: DayTrade[] = []
  const points: DayAccount['points'] = []
  for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    const start = cash
    const filled = day.outcomes
      .filter((o) => o.entry && o.exit && o.stop != null)
      .sort((a, b) => a.entry!.time.localeCompare(b.entry!.time))
    const closed: DayTrade[] = []
    for (const o of filled) {
      const plan = day.plans.find((p) => p.id === o.planId)!
      const lostSoFar = closed.filter((t) => t.exitTime <= o.entry!.time).reduce((s, t) => s + t.pnlUsd, 0)
      const base = {
        date: day.date,
        planId: o.planId,
        ticker: plan.ticker,
        entryTime: o.entry!.time,
        entry: o.entry!.price,
        exitTime: o.exit!.time,
        exit: o.exit!.price,
        stop: o.stop!,
        r: o.r!,
      }
      if (-lostSoFar >= (start * RULES.dailyLossPct) / 100) {
        trades.push({
          ...base,
          units: 0,
          pnlUsd: 0,
          commissionUsd: 0,
          taken: false,
          note: 'วันนี้ขาดทุนถึง 2% แล้ว หยุดเทรด',
        })
        continue
      }
      const units = Math.min(
        (start * RULES.riskPct) / 100 / (o.entry!.price - o.stop!),
        (start * RULES.maxPositionPct) / 100 / o.entry!.price,
      )
      const commissionUsd = units * (o.entry!.price + o.exit!.price) * fee
      const pnlUsd = units * (o.exit!.price - o.entry!.price) - commissionUsd
      const trade = { ...base, units, pnlUsd, commissionUsd, taken: true }
      closed.push(trade)
      trades.push(trade)
      cash += pnlUsd
    }
    points.push({ date: day.date, valueUsd: cash })
  }
  return { cashUsd: cash, trades, points }
}

/** Win rate, average R and the rest, over taken trades. */
export function dayStats(trades: DayTrade[]) {
  const taken = trades.filter((t) => t.taken)
  const wins = taken.filter((t) => t.pnlUsd > 0)
  const sumR = taken.reduce((s, t) => s + t.r, 0)
  return {
    trades: taken.length,
    wins: wins.length,
    winRatePct: taken.length ? (wins.length / taken.length) * 100 : null,
    avgR: taken.length ? sumR / taken.length : null,
    totalR: sumR,
    pnlUsd: taken.reduce((s, t) => s + t.pnlUsd, 0),
    commissionUsd: taken.reduce((s, t) => s + (t.commissionUsd ?? 0), 0),
  }
}
