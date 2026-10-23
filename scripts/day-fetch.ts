/**
 * Market data for the day desk's scripts (GitHub Actions can reach Yahoo
 * and CNN directly; the browser goes through the site's Worker instead).
 */
import { chartQuery, parseBars, parseQuote, type Bar, type ChartJson, type ChartQuery } from '../src/lib/day/bars.ts'

// Yahoo answers a bare "Mozilla/5.0" (as the Lynch script sends) but rate-limits full browser strings without its cookies.
const YAHOO_HEADERS = { 'User-Agent': 'Mozilla/5.0' }
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36',
}

async function chart(symbol: string, query: ChartQuery): Promise<ChartJson> {
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${chartQuery(symbol, query)}`, {
    headers: YAHOO_HEADERS,
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return (await response.json()) as ChartJson
}

export async function bars(symbol: string, query: ChartQuery): Promise<Bar[]> {
  return parseBars(symbol, await chart(symbol, query))
}

export async function quote(symbol: string) {
  return parseQuote(symbol, await chart(symbol, { interval: '5m', range: '1d' }))
}

/** CNN's Fear & Greed index (0–100), or null if it can't be read. */
export async function fearGreed(): Promise<{
  score: number
  rating: string
  previousClose?: number
  previousWeek?: number
} | null> {
  try {
    const response = await fetch('https://production.dataviz.cnn.io/index/fearandgreed/graphdata', {
      headers: { ...HEADERS, Referer: 'https://edition.cnn.com/', Accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = (await response.json()) as {
      fear_and_greed?: { score: number; rating: string; previous_close?: number; previous_1_week?: number }
    }
    const fg = data.fear_and_greed
    if (!fg) return null
    return {
      score: Math.round(fg.score * 10) / 10,
      rating: fg.rating,
      previousClose: fg.previous_close != null ? Math.round(fg.previous_close * 10) / 10 : undefined,
      previousWeek: fg.previous_1_week != null ? Math.round(fg.previous_1_week * 10) / 10 : undefined,
    }
  } catch (e) {
    console.warn(`Fear & Greed: ${(e as Error).message}`)
    return null
  }
}

/** Runs `fn` over items a few at a time, so Yahoo isn't hit with everything at once. */
export async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))))
  return out
}
