/** What the market strip shows: gold and what moves it (the dollar, real rates, fear), and the wider market. */
export const MARKET = [
  { symbol: 'GC=F', name: 'ทองคำ' },
  { symbol: 'SI=F', name: 'โลหะเงิน' },
  { symbol: 'DX-Y.NYB', name: 'ดอลลาร์ DXY' },
  { symbol: '^TNX', name: 'บอนด์ 10 ปี' },
  { symbol: '^VIX', name: 'VIX (ความกลัว)' },
  { symbol: '^GSPC', name: 'S&P 500' },
  { symbol: 'CL=F', name: 'น้ำมัน WTI' },
  { symbol: 'BTC-USD', name: 'Bitcoin' },
] as const

/** CNN's bands for the Fear & Greed score, in Thai. */
export function fearGreedLabel(score: number): string {
  if (score < 25) return 'Extreme Fear'
  if (score < 45) return 'Fear'
  if (score <= 55) return 'Neutral'
  if (score <= 75) return 'Greed'
  return 'Extreme Greed'
}
