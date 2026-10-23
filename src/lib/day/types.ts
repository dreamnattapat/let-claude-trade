/**
 * The day desk's files (public/day/). The AI desk writes one plan file per
 * trading day before the US open; everything else is computed from market
 * data by the scripts (scan before the open, grade after the close) and, for
 * today's live status, by the website with the same engine.
 */

/** Long-only setups the engine can recognise on 5-minute bars. */
export type DaySetup =
  /** Price looks below the level, fails to keep going lower and closes back above it on heavy volume. */
  | 'reclaim'
  /** Price comes down to a level it was trading above and holds it, with a strong close on volume. */
  | 'hold'

export const SETUP_LABELS: Record<DaySetup, string> = {
  reclaim: 'หลุดแล้วกลับขึ้นมา (reclaim)',
  hold: 'ย่อลงมาแล้วยืนได้ (hold)',
}

/** One planned trade: where (Location), what must happen (Confirmation) and how (Execution). */
export type DayPlan = {
  /** `<date>-<n>` */
  id: string
  ticker: string
  setup: DaySetup
  /** The level to trade from, USD, and what it is (e.g. "VAL เมื่อวาน"). */
  level: number
  levelName: string
  /** Where to take profit, USD, and what it is (e.g. "POC เมื่อวาน"). */
  target: number
  targetName: string
  /** The four steps in plain Thai. */
  environment: string
  location: string
  confirmation: string
  execution: string
  /** Why this stock, today. */
  why: string
}

export type DayVerdict = 'trade' | 'caution' | 'no-trade'

export const VERDICT_LABELS: Record<DayVerdict, string> = {
  trade: 'เทรดได้',
  caution: 'ระวัง เทรดน้อยลง',
  'no-trade': 'ไม่เทรดวันนี้',
}

/** public/day/plans/<date>.json, written by the AI desk before the open. */
export type DayDesk = {
  /** US session date, YYYY-MM-DD (New York). */
  date: string
  /** When the desk wrote it (ISO); the official start time comes from git history. */
  createdAt: string
  /** The AI model that ran the desk. */
  model: string
  environment: {
    verdict: DayVerdict
    /** One line. */
    headline: string
    /** 2–5 short points: Fear & Greed, VIX, index futures/trend, the calendar. */
    points: string[]
  }
  /** Today's big news, with sources. */
  news: { title: string; url: string; note: string }[]
  /** What to watch out for today: scheduled releases, earnings, events (New York times). */
  cautions: { time?: string; what: string }[]
  /** At most MAX_PLANS. None is a fine answer: no pattern, no trade. */
  plans: DayPlan[]
  /** Candidates from the scan the desk passed on, and why. */
  passed: { ticker: string; why: string }[]
  /** Lessons (lessons.json ids) applied today. */
  lessons?: string[]
}

/** One stock from the pre-open scan (public/day/scan/<date>.json). */
export type ScanRow = {
  ticker: string
  /** Last price before the open (pre-market if there was any) and gap vs yesterday's close, %. */
  price: number
  gapPct: number
  prevClose: number
  /** Yesterday's session. */
  pdh: number
  pdl: number
  poc: number
  vah: number
  val: number
  /** Daily ATR(14), USD and % of price. */
  atr: number
  atrPct: number
  /** Daily trend from the 20- and 50-day EMAs. */
  trend: 'up' | 'down' | 'range'
  /** Yesterday's volume against its 20-day average. */
  relVolume: number
  /** Average daily dollar volume, USD millions. */
  dollarVolumeM: number
  /** Where the price sits against yesterday's value area. */
  location: 'above-value' | 'in-value' | 'below-value'
  /** The setup the scanner sees, the level and target it would use, and the rough reward:risk. */
  setup: DaySetup | null
  level: number | null
  levelName: string | null
  target: number | null
  targetName: string | null
  estRr: number | null
  /** good: a setup with room (est. 1:2+); wait: close but not yet; avoid: don't trade it today. */
  status: 'good' | 'wait' | 'avoid'
  reasons: string[]
}

export type DayScan = {
  date: string
  scannedAt: string
  /** Market snapshot before the open. */
  market: { symbol: string; name: string; price: number; changePct: number }[]
  fearGreed: { score: number; rating: string; previousClose?: number; previousWeek?: number } | null
  rows: ScanRow[]
  /** What couldn't be read, for debugging. */
  errors?: string[]
}

/** public/day/state.json, written by the grade script after every US close. */
export type DayState = {
  updatedAt: string
  days: {
    date: string
    verdict: DayVerdict
    /** When the plan file was last committed (git), and how many times it changed after the first commit. */
    postedAt?: string
    edits?: number
    outcomes: import('./engine.ts').PlanOutcome[]
  }[]
  account: import('./engine.ts').DayAccount
  stats: ReturnType<typeof import('./engine.ts').dayStats>
}

/** What the desk has learned from its own graded days (public/day/lessons.json). */
export type DayLesson = {
  /** D001, D002, ... */
  id: string
  status: 'candidate' | 'rule' | 'retired'
  /** A short check to apply, in Thai. */
  title: string
  detail: string
  created: string
  updated: string
  evidence: { date: string; ticker?: string; note: string; kind: 'origin' | 'confirmed' | 'contradicted' }[]
}
