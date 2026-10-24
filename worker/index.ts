/**
 * Market data proxy for the site, since browsers can't call these directly:
 * - GET /api/chart/<SYMBOL>?interval=..&range=.. (or period1/period2) forwards to
 *   Yahoo Finance's chart endpoint (no API key).
 * * - GET /api/logo/<TICKER> forwards to a public company-logo image (financialmodelingprep.com, else parqet.com),
 *   cached for a week, so the page can show logos while its CSP allows images from itself only.
 * Everything else is the static site in dist/.
 *
 * Only a ticker symbol and a date range ever reach this Worker. It passes
 * through just those parameters and logs nothing. Vite's dev server does the
 * same forwarding locally (vite.config.ts).
 */

const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart/'
const SYMBOL_RE = /^[A-Z0-9.=^-]{1,15}$/
const ALLOWED_PARAMS = ['period1', 'period2', 'interval', 'events', 'range', 'includePrePost']
// Prices move during US market hours; 15 minutes is fresh enough for a dashboard.
const CACHE_SECONDS = 900

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const logo = url.pathname.match(/^\/api\/logo\/([A-Z0-9.-]{1,10})$/)
    if (request.method === 'GET' && logo) return companyLogo(logo[1])
    const symbol = decodeURIComponent(url.pathname.replace(/^\/api\/chart\//, ''))
    if (request.method !== 'GET' || !url.pathname.startsWith('/api/chart/') || !SYMBOL_RE.test(symbol)) {
      return new Response('Not found', { status: 404 })
    }

    // Intraday bars move every minute: cache them for a minute only (daily data: 15 minutes).
    const ttl = url.searchParams.get('interval')?.endsWith('m') ? 60 : CACHE_SECONDS
    const upstream = new URL(YAHOO_CHART + encodeURIComponent(symbol))
    for (const name of ALLOWED_PARAMS) {
      const value = url.searchParams.get(name)
      if (value !== null) upstream.searchParams.set(name, value)
    }

    const response = await fetch(upstream, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      // Cloudflare's edge cache: repeat lookups don't hit Yahoo again.
      cf: { cacheTtl: ttl, cacheEverything: true },
    } as RequestInit)
    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${ttl}`,
      },
    })
  },
}

/** A company's logo by ticker from the first source that has it, or 404 (the page then shows a letter badge). */
async function companyLogo(ticker: string): Promise<Response> {
  const week = 7 * 24 * 3600
  for (const source of [
    `https://financialmodelingprep.com/image-stock/${ticker}.png`,
    `https://assets.parqet.com/logos/symbol/${ticker}?format=png`,
  ]) {
    const response = await fetch(source, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cf: { cacheTtl: week, cacheEverything: true },
    } as RequestInit)
    const type = response.headers.get('Content-Type') ?? ''
    if (response.ok && type.startsWith('image/'))
      return new Response(response.body, {
        headers: { 'Content-Type': type, 'Cache-Control': `public, max-age=${week}` },
      })
  }
  return new Response('No logo', { status: 404 })
}
