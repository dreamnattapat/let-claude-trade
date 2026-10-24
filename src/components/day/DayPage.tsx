import { AlertTriangle, ExternalLink, Newspaper, Gauge } from 'lucide-react'
import { useMemo, useState } from 'react'

import { FearGreedGauge } from '@/components/day/FearGreedGauge'
import { PlanChart } from '@/components/day/PlanChart'
import { PnlCalendar } from '@/components/day/PnlCalendar'
import { Fold, Stat, toneOf } from '@/components/shared'
import { SiteHeader } from '@/components/SiteHeader'
import { Card, CardContent } from '@/components/ui/card'
import { useDay, useMarket, type FearGreed, type Quote } from '@/hooks/useDay'
import type { Bar } from '@/lib/day/bars'
import { dayStats, RULES, STATUS_LABELS, type PlanOutcome, type PlanStatus } from '@/lib/day/engine'
import { fearGreedLabel } from '@/lib/day/market'
import { SETUP_LABELS, VERDICT_LABELS, type DayDesk, type DayPlan, type DayState, type ScanRow } from '@/lib/day/types'
import { formatDate, formatMoney, formatNumber, formatPercent, formatSignedMoney } from '@/lib/format'

export function DayPage() {
  const { data, error } = useDay()
  const market = useMarket()
  const outcomes = useMemo(() => {
    const map = new Map<string, PlanOutcome>()
    const graded = data?.state?.days.find((d) => d.date === data.desk?.date)
    for (const o of graded?.outcomes ?? []) map.set(o.planId, o)
    // Live beats the last grade while the session runs.
    for (const [id, o] of data?.live ?? []) if (!graded || o.status !== 'waiting' || !map.has(id)) map.set(id, o)
    return map
  }, [data])

  return (
    <main className="mx-auto max-w-5xl space-y-4 px-4 pt-6 pb-12 sm:pt-10">
      <SiteHeader active="day" />
      <header>
        <h1 className="font-display text-2xl font-medium sm:text-3xl">Day Cook</h1>
        <p className="text-muted-foreground text-sm">
          <a href="#rules" className="text-brand hover:underline">
            วิธีทำงาน
          </a>
        </p>
      </header>

      {error && <p className="text-muted-foreground text-sm">โหลดข้อมูลไม่ได้ ({error})</p>}
      {!data && !error && <p className="text-muted-foreground text-sm">กำลังโหลด…</p>}
      {data && <Portfolio data={data} outcomes={outcomes} />}
      <Market quotes={market.quotes} fearGreed={market.fearGreed ?? data?.scan?.fearGreed ?? null} />
      {data?.desk ? (
        <>
          <Today desk={data.desk} />
          <Plans desk={data.desk} outcomes={outcomes} bars={data.bars} />
        </>
      ) : (
        data && <p className="text-muted-foreground text-sm">ยังไม่มีแผนวันนี้ AI เขียนแผนราว 20:05 น.</p>
      )}
      {data?.scan && <Scanner rows={data.scan.rows} scannedAt={data.scan.scannedAt} />}
      <Rules />
    </main>
  )
}

function Portfolio({
  data,
  outcomes,
}: {
  data: NonNullable<ReturnType<typeof useDay>['data']>
  outcomes: Map<string, PlanOutcome>
}) {
  const state: DayState = data.state ?? {
    updatedAt: '',
    days: [],
    account: { cashUsd: RULES.startingCashUsd, trades: [], points: [] },
    stats: dayStats([]),
  }
  const stats = dayStats(state.account.trades)
  const equity = state.account.cashUsd
  const pnl = equity - RULES.startingCashUsd
  return (
    <Card className="gap-0 py-4">
      <CardContent className="space-y-4 px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <p className="text-muted-foreground text-xs">พอร์ต</p>
            <p className="font-display text-3xl font-medium tabular-nums">{formatMoney(equity, '$')}</p>
            <p className={`text-sm font-semibold tabular-nums ${toneOf(pnl)}`}>
              {formatSignedMoney(pnl, '$')} (
              {formatPercent((pnl / RULES.startingCashUsd) * 100, {
                signed: true,
                decimals: 2,
              })}
              )
            </p>
          </div>
          <dl className="flex gap-5 text-sm">
            <Stat label="เทรด" value={`${stats.trades}`} />
            <Stat
              label="ชนะ"
              value={stats.winRatePct != null ? formatPercent(stats.winRatePct, { decimals: 0 }) : '—'}
            />
            <Stat
              label="เฉลี่ย"
              value={stats.avgR != null ? `${stats.avgR >= 0 ? '+' : ''}${stats.avgR.toFixed(2)}R` : '—'}
              tone={stats.avgR}
            />
            <Stat label="ค่าคอม" value={formatMoney(stats.commissionUsd, '$')} />
          </dl>
        </div>

        {data.desk && <Holding desk={data.desk} outcomes={outcomes} bars={data.bars} equity={equity} />}

        <PnlCalendar state={state} pending={data.desk?.date} />

        {state.account.trades.length > 0 && (
          <Fold title={`ประวัติเทรด (${state.account.trades.filter((t) => t.taken).length})`}>
            <ul className="divide-y">
              {state.account.trades.toReversed().map((t) => (
                <li key={t.planId} className="flex items-center gap-3 py-2 text-sm">
                  <span className="text-muted-foreground w-14 shrink-0 text-xs">{formatDate(t.date).slice(0, -5)}</span>
                  <span className="w-14 shrink-0 font-semibold">{t.ticker}</span>
                  <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs tabular-nums">
                    {formatNumber(t.entry)} → {formatNumber(t.exit)}
                  </span>
                  <span className={`text-right tabular-nums ${toneOf(t.pnlUsd)}`}>
                    {t.taken ? formatSignedMoney(t.pnlUsd, '$') : 'ข้าม'}
                    <span className="block text-xs">
                      {t.r >= 0 ? '+' : ''}
                      {t.r.toFixed(2)}R
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Fold>
        )}
      </CardContent>
    </Card>
  )
}

/** What the paper account holds right now: today's trades that are in, at the latest 5-minute close. */
function Holding({
  desk,
  outcomes,
  bars,
  equity,
}: {
  desk: DayDesk
  outcomes: Map<string, PlanOutcome>
  bars: Map<string, Bar[]>
  equity: number
}) {
  const fee = RULES.commissionPct / 100
  const open = desk.plans
    .map((p) => ({ plan: p, o: outcomes.get(p.id) }))
    .filter((x): x is { plan: DayPlan; o: PlanOutcome } => x.o?.status === 'open' && !!x.o.entry && x.o.stop != null)
    .map(({ plan, o }) => {
      const entry = o.entry!.price
      const units = Math.min(
        (equity * RULES.riskPct) / 100 / (entry - o.stop!),
        (equity * RULES.maxPositionPct) / 100 / entry,
      )
      const price = bars.get(plan.ticker)?.at(-1)?.c ?? entry
      return {
        plan,
        o,
        entry,
        units,
        price,
        pnl: units * (price - entry) - units * entry * fee,
        r: (price - entry) / (entry - o.stop!),
      }
    })
  const invested = open.reduce((s, p) => s + p.units * p.entry, 0)
  return (
    <div className="bg-muted/50 rounded-xl px-3 py-2.5 text-sm">
      <p className="text-muted-foreground mb-1 text-xs">ถืออยู่ตอนนี้</p>
      {open.length === 0 ? (
        <p>เงินสด 100%</p>
      ) : (
        <>
          <ul className="space-y-1.5">
            {open.map((p) => (
              <li key={p.plan.id} className="flex items-center gap-3">
                <span className="w-14 shrink-0 font-semibold">{p.plan.ticker}</span>
                <span className="text-muted-foreground min-w-0 flex-1 text-xs tabular-nums">
                  {formatNumber(p.units, 2)} หุ้น · เข้า {formatNumber(p.entry)} · ตอนนี้ {formatNumber(p.price)}
                  <br />
                  stop {formatNumber(p.o.stop)} · เป้า {formatNumber(p.plan.target)}
                </span>
                <span className={`text-right tabular-nums ${toneOf(p.pnl)}`}>
                  {formatSignedMoney(p.pnl, '$')}
                  <span className="block text-xs">
                    {p.r >= 0 ? '+' : ''}
                    {p.r.toFixed(2)}R
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground mt-1.5 text-xs">
            เงินสด {formatMoney(equity - invested, '$')} · กำไร/ขาดทุนคิดแบบขายตอนนี้ หักค่าคอมทั้งซื้อและขาย
          </p>
        </>
      )}
    </div>
  )
}

function Market({ quotes, fearGreed }: { quotes: Quote[]; fearGreed: FearGreed | null }) {
  return (
    <Card className="gap-0 py-4">
      <CardContent className="grid items-center gap-4 px-4 sm:grid-cols-[13rem_1fr] sm:px-6">
        <div className="mx-auto w-full max-w-52 text-center">
          {fearGreed ? (
            <>
              <FearGreedGauge score={fearGreed.score} />
              <p className="-mt-1 text-sm font-semibold">Fear &amp; Greed: {fearGreedLabel(fearGreed.score)}</p>
              {fearGreed.previousClose != null && (
                <p className="text-muted-foreground text-xs">
                  Yesterday {Math.round(fearGreed.previousClose)}
                  {fearGreed.previousWeek != null && ` · Last week ${Math.round(fearGreed.previousWeek)}`}
                </p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground flex items-center justify-center gap-1 text-sm">
              <Gauge className="size-4" aria-hidden /> Fear &amp; Greed กำลังโหลด…
            </p>
          )}
        </div>
        <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
          {quotes.map((q) => (
            <li key={q.symbol} className="flex items-baseline justify-between gap-2">
              <span className="text-muted-foreground truncate text-xs">
                {q.name.replace(' (futures)', '').replace(' (ความกลัว)', '')}
              </span>
              <span className="text-right tabular-nums">
                {formatNumber(q.price, q.price >= 1000 ? 0 : 2)}{' '}
                <span className={`text-xs ${toneOf(q.changePct)}`}>
                  {formatPercent(q.changePct, { signed: true, decimals: 1 })}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

const VERDICT_TONE = {
  trade: 'bg-delta-up/10 text-delta-up',
  caution: 'bg-brand-soft text-brand',
  'no-trade': 'bg-delta-down/10 text-delta-down',
} as const

function Today({ desk }: { desk: DayDesk }) {
  return (
    <Card className="gap-0 py-4">
      <CardContent className="px-4 sm:px-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${VERDICT_TONE[desk.environment.verdict]}`}
          >
            {VERDICT_LABELS[desk.environment.verdict]}
          </span>
          <span className="text-muted-foreground text-xs">{formatDate(desk.date)}</span>
        </div>
        <p className="mb-2 font-medium leading-snug">{desk.environment.headline}</p>
        <Fold title={`ภาวะตลาด (${desk.environment.points.length})`}>
          <ul className="text-muted-foreground list-disc space-y-1 pl-5">
            {desk.environment.points.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </Fold>
        <Fold
          title={
            <span className="inline-flex items-center gap-1.5">
              <AlertTriangle className="text-delta-down size-4" aria-hidden /> ระวัง ({desk.cautions.length})
            </span>
          }
        >
          <ul className="space-y-1">
            {desk.cautions.map((c, i) => (
              <li key={i} className="flex gap-2">
                {c.time && <span className="text-muted-foreground w-11 shrink-0 tabular-nums">{c.time}</span>}
                <span>{c.what}</span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground mt-1 text-xs">เวลานิวยอร์ก</p>
        </Fold>
        <Fold
          title={
            <span className="inline-flex items-center gap-1.5">
              <Newspaper className="size-4" aria-hidden /> ข่าว ({desk.news.length})
            </span>
          }
        >
          <ul className="space-y-2">
            {desk.news.map((n, i) => (
              <li key={i}>
                <a
                  href={n.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand inline-flex gap-1 font-medium hover:underline"
                >
                  {n.title}
                  <ExternalLink className="mt-1 size-3 shrink-0" aria-hidden />
                </a>
                <p className="text-muted-foreground text-xs">{n.note}</p>
              </li>
            ))}
          </ul>
        </Fold>
      </CardContent>
    </Card>
  )
}

const STATUS_TONE: Record<PlanStatus, string> = {
  waiting: 'bg-muted text-muted-foreground',
  open: 'bg-brand-soft text-brand',
  'no-touch': 'bg-muted text-muted-foreground',
  'no-confirm': 'bg-muted text-muted-foreground',
  'skipped-rr': 'bg-muted text-muted-foreground',
  'gap-stop': 'bg-muted text-muted-foreground',
  win: 'bg-delta-up/10 text-delta-up',
  loss: 'bg-delta-down/10 text-delta-down',
  'time-exit': 'bg-brand-soft text-brand',
}

function Plans({
  desk,
  outcomes,
  bars,
}: {
  desk: DayDesk
  outcomes: Map<string, PlanOutcome>
  bars: Map<string, Bar[]>
}) {
  return (
    <section aria-labelledby="plans" className="space-y-3">
      <h2 id="plans" className="font-display text-lg font-medium">
        แผนวันนี้ ({desk.plans.length})
      </h2>
      {desk.plans.length === 0 && (
        <p className="text-muted-foreground text-sm">ไม่มีหุ้นที่เข้าเงื่อนไข วันนี้อยู่เฉยๆ</p>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {desk.plans.map((p) => (
          <PlanCard key={p.id} plan={p} outcome={outcomes.get(p.id)} bars={bars.get(p.ticker) ?? []} />
        ))}
      </div>
      {desk.passed.length > 0 && (
        <Card className="gap-0 py-1">
          <CardContent className="px-4 sm:px-6">
            <Fold title={`ดูแล้วไม่เอา (${desk.passed.length})`}>
              <ul className="space-y-1">
                {desk.passed.map((x) => (
                  <li key={x.ticker}>
                    <span className="font-semibold">{x.ticker}</span>{' '}
                    <span className="text-muted-foreground">{x.why}</span>
                  </li>
                ))}
              </ul>
            </Fold>
          </CardContent>
        </Card>
      )}
    </section>
  )
}

function PlanCard({ plan, outcome, bars }: { plan: DayPlan; outcome?: PlanOutcome; bars: Bar[] }) {
  const lines = useMemo(
    () => [
      { price: plan.level, label: 'จุด', color: '--brand' },
      { price: plan.target, label: 'เป้า', color: '--delta-up', dashed: true },
      ...(outcome?.entry ? [{ price: outcome.entry.price, label: 'เข้า', color: '--series-you' }] : []),
      ...(outcome?.stop != null
        ? [
            {
              price: outcome.stop,
              label: 'stop',
              color: '--delta-down',
              dashed: true,
            },
          ]
        : []),
    ],
    [plan, outcome],
  )
  const steps = [
    ['Environment', plan.environment],
    ['Location', plan.location],
    ['Confirmation', plan.confirmation],
    ['Execution', plan.execution],
  ] as const
  return (
    <Card className="gap-0 py-4">
      <CardContent className="space-y-2 px-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-semibold">{plan.ticker}</span>
          <span className="text-muted-foreground text-xs">{SETUP_LABELS[plan.setup].split(' (')[0]}</span>
          {outcome && (
            <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[outcome.status]}`}>
              {STATUS_LABELS[outcome.status]}
              {outcome.r != null && ` ${outcome.r >= 0 ? '+' : ''}${outcome.r.toFixed(2)}R`}
            </span>
          )}
        </div>
        <p className="text-sm tabular-nums">
          รอที่ <span className="font-semibold">{formatNumber(plan.level)}</span>{' '}
          <span className="text-muted-foreground">({plan.levelName})</span> → เป้า{' '}
          <span className="font-semibold">{formatNumber(plan.target)}</span>
          {outcome?.rr != null && (
            <span className="text-muted-foreground"> · 1:{outcome.rr.toFixed(1)} หลังค่าคอม</span>
          )}
        </p>
        {outcome && <p className="text-muted-foreground text-xs">{outcome.note}</p>}
        <PlanChart bars={bars} lines={lines} />
        <Fold title="แผน 4 ขั้น">
          <p className="text-muted-foreground mb-2">{plan.why}</p>
          <ol className="space-y-1.5">
            {steps.map(([name, text], i) => (
              <li key={name} className="flex gap-2">
                <span className="bg-brand text-background flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold">
                  {i + 1}
                </span>
                <span>
                  <span className="font-semibold">{name}: </span>
                  {text}
                </span>
              </li>
            ))}
          </ol>
        </Fold>
      </CardContent>
    </Card>
  )
}

const SCAN_TONE = {
  good: 'bg-delta-up/10 text-delta-up',
  wait: 'bg-brand-soft text-brand',
  avoid: 'bg-muted text-muted-foreground',
} as const
const SCAN_LABEL = {
  good: 'เข้าเงื่อนไข',
  wait: 'เฝ้าดู',
  avoid: 'ไม่เอา',
} as const
const LOCATION_LABEL = {
  'above-value': 'เหนือ VA',
  'in-value': 'ใน VA',
  'below-value': 'ใต้ VA',
} as const

function Scanner({ rows, scannedAt }: { rows: ScanRow[]; scannedAt: string }) {
  const [show, setShow] = useState<ScanRow['status']>('good')
  const counts = { good: 0, wait: 0, avoid: 0 }
  for (const r of rows) counts[r.status]++
  const shown = rows.filter((r) => r.status === show)
  return (
    <Card className="gap-0 py-4">
      <CardContent className="space-y-3 px-4 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-medium">คัดหุ้น</h2>
          <p className="text-muted-foreground text-xs">
            {rows.length} ตัว ·{' '}
            {new Date(scannedAt).toLocaleTimeString('th-TH-u-ca-gregory', {
              hour: '2-digit',
              minute: '2-digit',
            })}{' '}
            น.
          </p>
        </div>
        <div className="flex gap-1" role="tablist">
          {(['good', 'wait', 'avoid'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={show === k}
              onClick={() => setShow(k)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${show === k ? SCAN_TONE[k] + ' ring-1 ring-current' : 'text-muted-foreground'}`}
            >
              {SCAN_LABEL[k]} {counts[k]}
            </button>
          ))}
        </div>
        <ul className="divide-y">
          {shown.map((r) => (
            <li key={r.ticker} className="py-2 text-sm">
              <div className="flex items-baseline gap-2">
                <span className="w-14 shrink-0 font-semibold">{r.ticker}</span>
                <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs tabular-nums">
                  {LOCATION_LABEL[r.location]} · {r.levelName?.replace(' เมื่อวาน', '')} {formatNumber(r.level)} →{' '}
                  {formatNumber(r.target)}
                </span>
                <span className="tabular-nums">{r.estRr != null ? `1:${r.estRr.toFixed(1)}` : '—'}</span>
              </div>
              <p className="text-muted-foreground pl-16 text-xs">{r.reasons[0]}</p>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-xs">
          VA = value area ของเมื่อวาน (ช่วงราคาที่ซื้อขาย 70%) · คุ้มเสี่ยงเป็นค่าประมาณ
        </p>
      </CardContent>
    </Card>
  )
}

function Rules() {
  return (
    <Card id="rules" className="gap-0 py-1">
      <CardContent className="px-4 sm:px-6">
        <Fold title="วิธีทำงานและกติกา">
          <ol className="text-muted-foreground list-decimal space-y-1.5 pl-5">
            <li>
              <span className="text-foreground font-semibold">Environment</span> ก่อนเปิดตลาด AI ดู Fear &amp; Greed,
              VIX, ดัชนี, ข่าว แล้วตัดสิน: เทรด / ระวัง / ไม่เทรด
            </li>
            <li>
              <span className="text-foreground font-semibold">Location</span> รอที่ระดับราคาสำคัญของเมื่อวานเท่านั้น
              (VAH, VAL, POC, high, low)
            </li>
            <li>
              <span className="text-foreground font-semibold">Confirmation</span> แท่ง 5 นาทีที่แนวต้องปิดกลับเหนือแนว
              เป็นแท่งเขียว ปิดครึ่งบน volume ≥{RULES.volume.hold}–{RULES.volume.reclaim} เท่า ไม่มีแท่งนี้ = ไม่เข้า
            </li>
            <li>
              <span className="text-foreground font-semibold">Execution</span> ซื้อแท่งถัดไป stop ใต้จุดต่ำสุดที่แนว
              เข้าเมื่อคุ้ม ≥1:
              {RULES.minRr} หลังหักค่าคอมไปกลับ ช่วง 09:45–15:00 น. (นิวยอร์ก) ขายหมดก่อนปิด
            </li>
          </ol>
          <ul className="text-muted-foreground mt-3 list-disc space-y-1 pl-5">
            <li>
              เสี่ยง {RULES.riskPct}% ต่อเทรด หยุดเมื่อขาดทุน {RULES.dailyLossPct}% ของวัน ไม่เกิน {RULES.maxPlans}{' '}
              แผนต่อวัน พอร์ตทบต้น รวมค่าคอม Dime!
            </li>
            <li>ระบบตัดสินสัญญาณเองจากกราฟจริง แผนนับตั้งแต่เวลาที่บันทึก แท่งที่แตะทั้ง stop และเป้า นับเป็น stop</li>
            <li>ใช้ข้อมูลฟรีแทน order flow และ gamma ในคลิปต้นแบบ จึงหยาบกว่าของจริง</li>
            <li>เงินสมมติ ไม่ใช่คำแนะนำการลงทุน</li>
          </ul>
        </Fold>
      </CardContent>
    </Card>
  )
}
