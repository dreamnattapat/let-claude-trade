/**
 * Grades the day desk after the US close: plays every plan through the real
 * 5-minute bars of its session (src/lib/day/engine.ts), runs the paper
 * account and writes public/day/state.json. A plan only counts from the time
 * its file was committed (git history), so a plan written after the open can't
 * use the bars that came before it.
 *
 *   node scripts/day-grade.ts
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

import { byDay, newYork, regularSession, type Bar } from '../src/lib/day/bars.ts'
import { dayStats, playPlan, runAccount, type PlanOutcome } from '../src/lib/day/engine.ts'
import type { DayDesk, DayState } from '../src/lib/day/types.ts'
import { bars, pool } from './day-fetch.ts'

const STATE = 'public/day/state.json'
const now = newYork(new Date())
const index = existsSync('public/day/plans/index.json')
  ? (JSON.parse(readFileSync('public/day/plans/index.json', 'utf8')) as { plans: string[] })
  : { plans: [] }
const previous = existsSync(STATE) ? (JSON.parse(readFileSync(STATE, 'utf8')) as DayState) : null
const desks = index.plans.map((d) => JSON.parse(readFileSync(`public/day/plans/${d}.json`, 'utf8')) as DayDesk)

/** Last commit time of a plan file, and how many commits changed it after the first. */
function postmark(date: string): { postedAt?: string; edits?: number } {
  try {
    const times = execFileSync('git', ['log', '--format=%aI', '--', `public/day/plans/${date}.json`], {
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter(Boolean)
    return times.length ? { postedAt: new Date(times[0]).toISOString(), edits: times.length - 1 } : {}
  } catch {
    return {}
  }
}

// 5-minute bars reach back about 60 days; older days keep the grade they already had.
const fresh = desks.filter((d) => {
  const age = (Date.parse(`${now.date}T00:00:00Z`) - Date.parse(`${d.date}T00:00:00Z`)) / 86400000
  return age <= 25 || !previous?.days.some((p) => p.date === d.date)
})
const tickers = [...new Set(fresh.flatMap((d) => d.plans.map((p) => p.ticker)))]
const series = new Map<string, Map<string, Bar[]>>(
  await pool(tickers, 5, async (t): Promise<[string, Map<string, Bar[]>]> => {
    try {
      return [t, byDay(regularSession(await bars(t, { interval: '5m', range: '1mo' })))]
    } catch (e) {
      console.warn(`${t}: ${(e as Error).message}`)
      return [t, new Map()]
    }
  }),
)

const days: DayState['days'] = desks.map((desk) => {
  const pm = postmark(desk.date)
  if (!fresh.includes(desk)) return previous!.days.find((p) => p.date === desk.date)!
  const posted = pm.postedAt ? newYork(new Date(pm.postedAt)) : null
  // Written on an earlier day: counts from the open. On the day: from that minute. After the day: never.
  const notBefore = !posted || posted.date < desk.date ? 0 : posted.date === desk.date ? posted.minutes : Infinity
  const final = desk.date < now.date || (desk.date === now.date && now.minutes >= 16 * 60 + 10)
  const outcomes: PlanOutcome[] = desk.plans.map((plan) => {
    const session = series.get(plan.ticker)?.get(desk.date) ?? []
    if (notBefore === Infinity) return { planId: plan.id, status: 'no-touch', note: 'แผนถูกบันทึกหลังวันเทรด ไม่นับ' }
    if (!session.length)
      return { planId: plan.id, status: final ? 'no-touch' : 'waiting', note: 'ยังไม่มีข้อมูลราคาของวันนี้' }
    return playPlan(plan, session, { notBefore, final })
  })
  return { date: desk.date, verdict: desk.environment.verdict, ...pm, outcomes }
})

const account = runAccount(
  days
    .filter((d) => d.outcomes.every((o) => o.status !== 'open' && o.status !== 'waiting'))
    .map((d) => ({ date: d.date, plans: desks.find((x) => x.date === d.date)!.plans, outcomes: d.outcomes })),
)
const state: DayState = { updatedAt: new Date().toISOString(), days, account, stats: dayStats(account.trades) }
writeFileSync(STATE, JSON.stringify(state, null, 1) + '\n')
console.log(
  `Day desk: ${state.stats.trades} trades, ${state.stats.totalR.toFixed(2)}R, account $${account.cashUsd.toFixed(2)}`,
)
