/**
 * Checks the day desk's files before they're committed (and in the Actions):
 * the plan files, the index and the lessons. Prints every problem and exits 1
 * if there is one.
 *
 *   node scripts/day-check.ts
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

import { RULES } from '../src/lib/day/engine.ts'
import type { DayDesk, DayLesson, DayScan } from '../src/lib/day/types.ts'

const problems: string[] = []
const fail = (m: string) => problems.push(m)
const read = <T>(path: string): T | null => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch (e) {
    fail(`${path}: ${(e as Error).message}`)
    return null
  }
}
const ISO = /^\d{4}-\d{2}-\d{2}$/
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0
const text = (v: unknown) => typeof v === 'string' && v.trim().length > 0

const index = read<{ plans: string[] }>('public/day/plans/index.json')
if (index) {
  const sorted = [...index.plans].sort()
  if (sorted.join() !== index.plans.join() || new Set(sorted).size !== sorted.length)
    fail('plans/index.json must list each date once, oldest first')
  for (const date of index.plans) {
    const path = `public/day/plans/${date}.json`
    const where = `plans ${date}`
    if (!ISO.test(date) || !existsSync(path)) {
      fail(`${where}: missing file or bad date`)
      continue
    }
    const desk = read<DayDesk>(path)
    if (!desk) continue
    if (desk.date !== date) fail(`${where}: date field doesn't match the file name`)
    if (!text(desk.model)) fail(`${where}: needs "model"`)
    if (!text(desk.createdAt) || Number.isNaN(Date.parse(desk.createdAt)))
      fail(`${where}: createdAt must be an ISO time`)
    const env = desk.environment
    if (!env || !['trade', 'caution', 'no-trade'].includes(env.verdict)) fail(`${where}: environment.verdict`)
    if (!text(env?.headline) || !env?.points?.length) fail(`${where}: environment needs a headline and points`)
    for (const n of desk.news ?? [])
      if (!/^https?:\/\//.test(n.url) || !text(n.title)) fail(`${where}: news "${n.title}" needs a title and a link`)
    if (!Array.isArray(desk.cautions) || !Array.isArray(desk.passed))
      fail(`${where}: needs cautions and passed (may be empty)`)
    const plans = desk.plans ?? []
    if (plans.length > RULES.maxPlans) fail(`${where}: ${plans.length} plans, the limit is ${RULES.maxPlans}`)
    if (env?.verdict === 'no-trade' && plans.length) fail(`${where}: a no-trade day can't have plans`)
    const scan = existsSync(`public/day/scan/${date}.json`) ? read<DayScan>(`public/day/scan/${date}.json`) : null
    const ids = new Set<string>()
    for (const p of plans) {
      const at = `${where}: ${p.ticker ?? '?'}`
      if (!new RegExp(`^${date}-\\d+$`).test(p.id) || ids.has(p.id)) fail(`${at}: id must be ${date}-<n> and unique`)
      ids.add(p.id)
      if (p.setup !== 'reclaim' && p.setup !== 'hold') fail(`${at}: setup must be reclaim or hold`)
      if (!num(p.level) || !num(p.target)) fail(`${at}: needs level and target`)
      else if (p.side === 'short' ? p.target >= p.level * 0.998 : p.target <= p.level * 1.002)
        fail(`${at}: the target must be ${p.side === 'short' ? 'below' : 'above'} the level`)
      if (p.side != null && p.side !== 'long' && p.side !== 'short') fail(`${at}: side must be long or short`)
      if (date >= '2026-10-26' && p.side == null) fail(`${at}: needs "side" (long or short)`)
      for (const k of [
        'levelName',
        'targetName',
        'environment',
        'location',
        'confirmation',
        'execution',
        'why',
      ] as const)
        if (!text(p[k])) fail(`${at}: needs "${k}"`)
      if (scan) {
        const row = scan.rows.find((r) => r.ticker === p.ticker && (r.side ?? 'long') === (p.side ?? 'long'))
        if (!row) fail(`${at}: not in today's scan on the ${p.side ?? 'long'} side`)
        else {
          if (row.status === 'avoid') fail(`${at}: the scan says avoid (${row.reasons[0]})`)
          if (num(p.level) && Math.abs(p.level / row.price - 1) > 0.1)
            fail(`${at}: level ${p.level} is more than 10% from the price ${row.price}`)
        }
      }
    }
    // Once published, a plan file is final.
    try {
      const published = execFileSync('git', ['show', `origin/main:${path}`], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      if (JSON.stringify(JSON.parse(published)) !== JSON.stringify(desk))
        fail(`${where}: was changed after it was published`)
    } catch {
      // not published yet (or not a git checkout)
    }
  }
}

const lessons = read<{ lessons: DayLesson[] }>('public/day/lessons.json')?.lessons ?? []
const seen = new Set<string>()
for (const l of lessons) {
  const where = `lesson ${l.id}`
  if (!/^D\d{3}$/.test(l.id) || seen.has(l.id)) fail(`${where}: id must be D001-style and unique`)
  seen.add(l.id)
  if (!['candidate', 'rule', 'retired'].includes(l.status)) fail(`${where}: status`)
  if (!text(l.title) || !text(l.detail)) fail(`${where}: needs title and detail`)
  if (!l.evidence?.length || l.evidence[0].kind !== 'origin') fail(`${where}: evidence must start with its origin`)
  if (l.status === 'rule' && !l.evidence.some((e) => e.kind === 'confirmed'))
    fail(`${where}: a rule needs a confirming case`)
}
if (lessons.filter((l) => l.status !== 'retired').length > 12) fail('more than 12 active lessons')

if (problems.length) {
  console.error(`Day check: ${problems.length} problem(s)`)
  for (const p of problems) console.error(`- ${p}`)
  process.exit(1)
}
console.log('Day check: ok')
