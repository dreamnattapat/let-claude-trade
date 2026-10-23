import { useEffect, useState } from 'react'

import { fetchDreamJson } from '@/hooks/useDream'
import {
  byDay,
  chartQuery,
  newYork,
  parseBars,
  parseQuote,
  regularSession,
  type Bar,
  type ChartJson,
} from '@/lib/day/bars'
import { playPlan, type PlanOutcome } from '@/lib/day/engine'
import { MARKET } from '@/lib/day/market'
import type { DayDesk, DayScan, DayState } from '@/lib/day/types'

export type Quote = { symbol: string; name: string; price: number; changePct: number }
export type FearGreed = { score: number; rating: string; previousClose?: number; previousWeek?: number }

async function chart(symbol: string, query: Parameters<typeof chartQuery>[1]): Promise<ChartJson> {
  const response = await fetch(`/api/chart/${chartQuery(symbol, query)}`)
  if (!response.ok) throw new Error(`${symbol}: HTTP ${response.status}`)
  return (await response.json()) as ChartJson
}

/** The market strip, live (through the site's Worker), refreshed every minute while the page is open. */
export function useMarket(): { quotes: Quote[]; fearGreed: FearGreed | null; loading: boolean } {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [fearGreed, setFearGreed] = useState<FearGreed | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let live = true
    const load = async () => {
      const got = await Promise.all(
        MARKET.map(async (m) => {
          try {
            const q = parseQuote(m.symbol, await chart(m.symbol, { interval: '5m', range: '1d' }))
            return { symbol: m.symbol, name: m.name, price: q.price, changePct: (q.price / q.prevClose - 1) * 100 }
          } catch {
            return null
          }
        }),
      )
      const fg = await fetch('/api/fng')
        .then((r) => (r.ok ? (r.json() as Promise<FearGreed>) : null))
        .catch(() => null)
      if (!live) return
      setQuotes(got.filter((q) => q != null))
      if (fg) setFearGreed(fg)
      setLoading(false)
    }
    void load()
    const timer = setInterval(load, 60_000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [])
  return { quotes, fearGreed, loading }
}

export type DayData = {
  /** The latest plan file and scan (today's, before or during the session). */
  desk: DayDesk | null
  scan: DayScan | null
  state: DayState | null
  /** Today's plans played live through today's bars, when the desk is for today. */
  live: Map<string, PlanOutcome>
  /** Today's 5-minute bars per planned ticker, for the charts. */
  bars: Map<string, Bar[]>
}

/** The desk's files, and today's plans followed live through the 5-minute bars. */
export function useDay(): { data: DayData | null; error: string | null } {
  const [data, setData] = useState<DayData | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    const optional = <T>(path: string) => fetchDreamJson<T>(path).catch(() => null)
    const load = async () => {
      const [plans, scans, state] = await Promise.all([
        optional<{ plans: string[] }>('/day/plans/index.json'),
        optional<{ scans: string[] }>('/day/scan/index.json'),
        optional<DayState>('/day/state.json'),
      ])
      const deskDate = plans?.plans.at(-1)
      const scanDate = scans?.scans.at(-1)
      const [desk, scan] = await Promise.all([
        deskDate ? optional<DayDesk>(`/day/plans/${deskDate}.json`) : null,
        scanDate ? optional<DayScan>(`/day/scan/${scanDate}.json`) : null,
      ])
      const now = newYork(new Date())
      const liveOutcomes = new Map<string, PlanOutcome>()
      const bars = new Map<string, Bar[]>()
      if (desk) {
        await Promise.all(
          [...new Set(desk.plans.map((p) => p.ticker))].map(async (t) => {
            try {
              const days = byDay(regularSession(parseBars(t, await chart(t, { interval: '5m', range: '5d' }))))
              bars.set(t, days.get(desk.date) ?? [])
            } catch {
              bars.set(t, [])
            }
          }),
        )
        // Until the grade script has run, today's status comes from the same engine, here.
        if (desk.date === now.date) {
          const created = newYork(new Date(desk.createdAt))
          const notBefore = created.date === desk.date ? created.minutes : 0
          const final = now.minutes >= 16 * 60 + 10
          for (const p of desk.plans)
            liveOutcomes.set(p.id, playPlan(p, bars.get(p.ticker) ?? [], { notBefore, final }))
        }
      }
      if (live) setData({ desk, scan, state, live: liveOutcomes, bars })
    }
    load().catch((e: Error) => live && setError(e.message))
    const timer = setInterval(() => void load().catch(() => {}), 60_000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [])
  return { data, error }
}
