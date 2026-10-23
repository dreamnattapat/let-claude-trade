/**
 * Intraday and daily bars (open, high, low, close, volume) from Yahoo
 * Finance's chart endpoint, the same one the rest of the site uses
 * (through /api/chart in the browser, directly in the GitHub Actions).
 * Times are New York's, since the US session is what the day desk trades.
 */

export type Bar = {
  /** Unix seconds at the bar's start. */
  t: number
  /** New York date (YYYY-MM-DD) and time (HH:MM) of the bar's start. */
  date: string
  time: string
  o: number
  h: number
  l: number
  c: number
  v: number
}

export type ChartJson = {
  chart?: {
    error?: { description?: string } | null
    result?: {
      meta: {
        regularMarketPrice?: number
        regularMarketTime?: number
        chartPreviousClose?: number
        previousClose?: number
      }
      timestamp?: number[]
      indicators: {
        quote: {
          open?: (number | null)[]
          high?: (number | null)[]
          low?: (number | null)[]
          close?: (number | null)[]
          volume?: (number | null)[]
        }[]
      }
    }[]
  }
}

const NY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** A moment in New York: date YYYY-MM-DD, time HH:MM, minutes since midnight. */
export function newYork(at: Date | number): { date: string; time: string; minutes: number } {
  const parts = Object.fromEntries(
    NY.formatToParts(typeof at === 'number' ? new Date(at) : at).map((p) => [p.type, p.value]),
  )
  const time = `${parts.hour}:${parts.minute}`
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  }
}

export const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))

/** Every complete bar in the response, oldest first. */
export function parseBars(symbol: string, data: ChartJson): Bar[] {
  const result = data.chart?.result?.[0]
  if (!result) throw new Error(`No data for ${symbol}: ${data.chart?.error?.description ?? 'unknown error'}`)
  const q = result.indicators.quote[0] ?? {}
  const bars: Bar[] = []
  ;(result.timestamp ?? []).forEach((t, i) => {
    const [o, h, l, c, v] = [q.open?.[i], q.high?.[i], q.low?.[i], q.close?.[i], q.volume?.[i]]
    if (o == null || h == null || l == null || c == null) return
    const ny = newYork(t * 1000)
    bars.push({ t, date: ny.date, time: ny.time, o, h, l, c, v: v ?? 0 })
  })
  return bars
}

/** The latest price and the close before today, for the market strip. */
export function parseQuote(symbol: string, data: ChartJson): { price: number; prevClose: number; at: number | null } {
  const result = data.chart?.result?.[0]
  if (!result) throw new Error(`No data for ${symbol}`)
  const { regularMarketPrice, chartPreviousClose, previousClose, regularMarketTime } = result.meta
  const closes = (result.indicators.quote[0]?.close ?? []).filter((c): c is number => c != null)
  const price = regularMarketPrice ?? closes.at(-1)
  const prev = previousClose ?? chartPreviousClose
  if (price == null || prev == null) throw new Error(`No quote for ${symbol}`)
  return { price, prevClose: prev, at: regularMarketTime ? regularMarketTime * 1000 : null }
}

/** Regular-session bars (9:30–16:00 New York) only. */
export function regularSession(bars: Bar[]): Bar[] {
  return bars.filter((b) => {
    const m = minutesOf(b.time)
    return m >= 9 * 60 + 30 && m < 16 * 60
  })
}

/** Bars grouped by New York date, oldest first. */
export function byDay(bars: Bar[]): Map<string, Bar[]> {
  const days = new Map<string, Bar[]>()
  for (const b of bars) {
    const day = days.get(b.date)
    if (day) day.push(b)
    else days.set(b.date, [b])
  }
  return days
}

export type ChartQuery = { interval: '5m' | '1d'; range: '1d' | '5d' | '1mo' | '3mo' | '6mo'; prePost?: boolean }

/** The Yahoo chart URL path and query for a symbol, without the host (the browser prefixes /api/chart/). */
export function chartQuery(symbol: string, { interval, range, prePost = false }: ChartQuery): string {
  const q = new URLSearchParams({ interval, range, includePrePost: String(prePost) })
  return `${encodeURIComponent(symbol)}?${q}`
}
