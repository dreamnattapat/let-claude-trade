/**
 * The pre-open scan: for each stock in the universe, yesterday's value area,
 * where the price sits against it before the open, the trend, and the setup
 * the rules would trade from it, with a rough reward:risk. It only sorts the
 * list into good / wait / avoid; the desk still decides, and the engine still
 * needs a real confirmation during the day before anything is bought.
 */
import { byDay, regularSession, type Bar } from './bars.ts'
import { atr, ema, volumeProfile } from './levels.ts'
import type { ScanRow } from './types.ts'

/** Liquid US stocks and ETFs a Dime! customer can buy. */
export const UNIVERSE = [
  'SPY',
  'QQQ',
  'IWM',
  'AAPL',
  'MSFT',
  'NVDA',
  'AMZN',
  'META',
  'GOOGL',
  'TSLA',
  'AMD',
  'AVGO',
  'NFLX',
  'PLTR',
  'COIN',
  'MU',
  'INTC',
  'ORCL',
  'CRM',
  'ADBE',
  'UBER',
  'SHOP',
  'SNOW',
  'CRWD',
  'PANW',
  'ARM',
  'SMCI',
  'MSTR',
  'HOOD',
  'SOFI',
  'RKLB',
  'TSM',
  'BA',
  'JPM',
  'XOM',
  'LLY',
  'UNH',
  'COST',
  'WMT',
  'DIS',
]

export const SCAN_RULES = {
  minDollarVolumeM: 300,
  atrPct: { min: 1, max: 10 },
  maxGapPct: 6,
  goodRr: 2,
  minRr: 1.5,
} as const

const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d

/**
 * `daily`: daily bars (a few months; today's partial bar, if any, is ignored).
 * `intraday`: 5-minute bars of the last few days, pre-market included.
 * `today`: the New York date of the session about to open.
 */
export function scanStock(ticker: string, daily: Bar[], intraday: Bar[], today: string): ScanRow | null {
  const past = daily.filter((b) => b.date < today)
  const sessions = byDay(regularSession(intraday.filter((b) => b.date < today)))
  const yDate = [...sessions.keys()].at(-1)
  if (!yDate || past.length < 51) return null
  const y = sessions.get(yDate)!
  const profile = volumeProfile(y)
  const dailyAtr = atr(past)
  if (!profile || !dailyAtr) return null

  const prevClose = y.at(-1)!.c
  const pre = intraday.filter((b) => b.date === today)
  const price = pre.at(-1)?.c ?? prevClose
  const gapPct = (price / prevClose - 1) * 100
  const closes = past.map((b) => b.c)
  const [e20, e50] = [ema(closes, 20)!, ema(closes, 50)!]
  const last = closes.at(-1)!
  const trend = last > e20 && e20 > e50 ? 'up' : last < e20 && e20 < e50 ? 'down' : 'range'
  const vols = past.slice(-21, -1).map((b) => b.v)
  const relVolume = past.at(-1)!.v / (vols.reduce((a, b) => a + b, 0) / vols.length)
  const dollarVolumeM = past.slice(-20).reduce((s, b) => s + b.c * b.v, 0) / 20 / 1e6
  const pdh = Math.max(...y.map((b) => b.h))
  const pdl = Math.min(...y.map((b) => b.l))
  const { poc, vah, val } = profile
  const location = price > vah ? 'above-value' : price < val ? 'below-value' : 'in-value'

  // The setup the rules would trade, from where the price is.
  let setup: ScanRow['setup'] = null
  let level = 0
  let levelName = ''
  let target = 0
  let targetName = ''
  if (location === 'above-value') {
    const supports = [
      { p: vah, n: 'VAH เมื่อวาน' },
      { p: pdh, n: 'High เมื่อวาน' },
    ].filter((s) => s.p < price)
    const s = supports.sort((a, b) => b.p - a.p)[0]
    setup = 'hold'
    level = s.p
    levelName = s.n
    target = level + Math.max(vah - val, 0.6 * dailyAtr)
    targetName = 'แนวรับ + ความกว้าง value area'
  } else if (location === 'in-value' && price >= poc) {
    setup = 'hold'
    ;[level, levelName, target, targetName] = [poc, 'POC เมื่อวาน', vah, 'VAH เมื่อวาน']
  } else {
    setup = 'reclaim'
    ;[level, levelName, target, targetName] = [val, 'VAL เมื่อวาน', poc, 'POC เมื่อวาน']
  }
  const estRisk = Math.max(level * 0.003, dailyAtr * 0.1)
  const estRr = (target - level) / estRisk

  const reasons: string[] = []
  const avoid: string[] = []
  if (dollarVolumeM < SCAN_RULES.minDollarVolumeM) avoid.push(`สภาพคล่องน้อย ($${dollarVolumeM.toFixed(0)}M ต่อวัน)`)
  const atrPct = (dailyAtr / price) * 100
  if (atrPct < SCAN_RULES.atrPct.min) avoid.push(`แกว่งน้อยเกินไป (ATR ${atrPct.toFixed(1)}%)`)
  if (atrPct > SCAN_RULES.atrPct.max) avoid.push(`แกว่งแรงเกินไป (ATR ${atrPct.toFixed(1)}%)`)
  if (Math.abs(gapPct) > SCAN_RULES.maxGapPct) avoid.push(`gap ${gapPct.toFixed(1)}% แรงเกิน น่าจะมีข่าว เดายาก`)
  if (trend === 'down' && setup === 'hold') avoid.push('เทรนด์รายวันขาลง ไม่ซื้อตอนย่อ')
  if (trend === 'down' && setup === 'reclaim' && location === 'below-value')
    avoid.push('เทรนด์ขาลงและเปิดต่ำกว่า value area: แรงขายคุม')
  if (estRr < SCAN_RULES.minRr) avoid.push(`ระยะถึงเป้าสั้น คุ้มเสี่ยงราว 1:${estRr.toFixed(1)}`)

  reasons.push(
    location === 'above-value'
      ? `ก่อนเปิดอยู่เหนือ value area เมื่อวาน (gap ${gapPct >= 0 ? '+' : ''}${gapPct.toFixed(1)}%) รอย่อมาทดสอบ ${levelName}`
      : location === 'below-value'
        ? `ก่อนเปิดอยู่ใต้ value area เมื่อวาน รอดูว่าหลุดแล้วกลับขึ้นเหนือ ${levelName} ได้ไหม`
        : `ก่อนเปิดอยู่ใน value area เมื่อวาน ${setup === 'hold' ? 'เหนือ POC รอย่อทดสอบ POC' : 'ใต้ POC รอทดสอบ VAL'}`,
  )
  reasons.push(
    `เทรนด์รายวัน ${trend === 'up' ? 'ขาขึ้น' : trend === 'down' ? 'ขาลง' : 'ไซด์เวย์'} · ATR ${atrPct.toFixed(1)}%`,
  )
  const status: ScanRow['status'] = avoid.length
    ? 'avoid'
    : estRr >= SCAN_RULES.goodRr && (trend === 'up' || (trend === 'range' && setup === 'reclaim'))
      ? 'good'
      : 'wait'
  if (status === 'wait')
    reasons.push(trend === 'range' ? 'เทรนด์ยังไม่ชัด' : `คุ้มเสี่ยงราว 1:${estRr.toFixed(1)} ยังไม่ถึง 1:2`)

  return {
    ticker,
    price: round(price),
    gapPct: round(gapPct),
    prevClose: round(prevClose),
    pdh: round(pdh),
    pdl: round(pdl),
    poc: round(poc),
    vah: round(vah),
    val: round(val),
    atr: round(dailyAtr),
    atrPct: round(atrPct),
    trend,
    relVolume: round(relVolume),
    dollarVolumeM: round(dollarVolumeM, 0),
    location,
    setup,
    level: round(level),
    levelName,
    target: round(target),
    targetName,
    estRr: round(estRr, 1),
    status,
    reasons: [...avoid, ...reasons],
  }
}
