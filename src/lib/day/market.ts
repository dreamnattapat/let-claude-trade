/** What the market strip shows: the big indexes and a few things that move with them. */
export const MARKET = [
  { symbol: '^GSPC', name: 'S&P 500' },
  { symbol: '^IXIC', name: 'Nasdaq' },
  { symbol: '^DJI', name: 'Dow Jones' },
  { symbol: 'ES=F', name: 'S&P ล่วงหน้า (futures)' },
  { symbol: '^VIX', name: 'VIX (ความกลัว)' },
  { symbol: 'CL=F', name: 'น้ำมัน WTI' },
  { symbol: 'GC=F', name: 'ทองคำ' },
  { symbol: 'BTC-USD', name: 'Bitcoin' },
] as const

/** CNN's bands for the Fear & Greed score, in Thai. */
export function fearGreedLabel(score: number): string {
  if (score < 25) return 'กลัวสุดขีด'
  if (score < 45) return 'กลัว'
  if (score <= 55) return 'เป็นกลาง'
  if (score <= 75) return 'โลภ'
  return 'โลภสุดขีด'
}
