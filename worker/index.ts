/**
 * Market data proxy for the site, since browsers can't call these directly:
 * - GET /api/chart/<SYMBOL>?interval=..&range=.. (or period1/period2) forwards to
 *   Yahoo Finance's chart endpoint (no API key).
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

