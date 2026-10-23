import { AlertTriangle, ChevronDown, ExternalLink, Newspaper } from 'lucide-react'
import { useMemo } from 'react'

import { FearGreedGauge } from '@/components/day/FearGreedGauge'
import { PlanChart } from '@/components/day/PlanChart'
import { SiteHeader } from '@/components/SiteHeader'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useDay, useMarket, type FearGreed } from '@/hooks/useDay'
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
    <main className="mx-auto max-w-5xl space-y-6 px-4 pt-6 pb-12 sm:pt-10">
      <SiteHeader active="day" />
      <header className="space-y-2">
        <p className="text-brand text-sm font-semibold">เดย์เทรด · เงินสมมติ</p>
        <h1 className="font-display text-3xl font-medium sm:text-4xl">เดย์เทรดรายวัน</h1>
        <p className="text-muted-foreground max-w-2xl leading-relaxed">
          ทุกวันก่อนตลาดสหรัฐฯ เปิด AI อ่านตลาดและข่าว คัดหุ้นที่เข้า setup แล้ววางแผนตาม Environment · Location ·
          Confirmation · Execution ระหว่างวันระบบเฝ้ากราฟ 5 นาทีจริง ถ้าไม่เกิดสัญญาณยืนยันก็ไม่เข้า ไม่มี pattern =
          ไม่เทรด
        </p>
      </header>

      <MarketStrip
        quotes={market.quotes}
        fearGreed={market.fearGreed ?? data?.scan?.fearGreed ?? null}
        loading={market.loading}
      />

      {error && <p className="text-muted-foreground text-sm">โหลดข้อมูลไม่ได้ ({error})</p>}
      {!data && !error && <p className="text-muted-foreground text-sm">กำลังโหลด…</p>}
      {data && (
        <>
          {data.desk ? (
            <>
              <Environment desk={data.desk} />
              <Plans desk={data.desk} outcomes={outcomes} bars={data.bars} />
            </>
          ) : (
            <Card>
              <CardContent className="text-muted-foreground text-sm">
                ยังไม่มีแผนเทรด AI จะเขียนแผนของแต่ละวันราว 20:05 น. (เวลาไทย) ก่อนตลาดสหรัฐฯ เปิด
              </CardContent>
            </Card>
          )}
          {data.scan && <Scanner rows={data.scan.rows} scannedAt={data.scan.scannedAt} />}
          <Account state={data.state} />
        </>
      )}
      <Rules />
    </main>
  )
}

function MarketStrip({
  quotes,
  fearGreed,
  loading,
}: {
  quotes: { symbol: string; name: string; price: number; changePct: number }[]
  fearGreed: FearGreed | null
  loading: boolean
}) {
  return (
    <section aria-label="ภาพรวมตลาด" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card className="col-span-2 gap-2 py-4 sm:col-span-1 sm:row-span-2">
        <CardContent className="space-y-2 px-4">
          <p className="text-muted-foreground text-xs">Fear &amp; Greed (CNN)</p>
          {fearGreed ? (
            <>
              <FearGreedGauge score={fearGreed.score} />
              <p className="-mt-1 text-center text-sm font-semibold">{fearGreedLabel(fearGreed.score)}</p>
              <p className="text-muted-foreground text-center text-xs">
                {fearGreed.previousClose != null && `เมื่อวาน ${Math.round(fearGreed.previousClose)}`}
                {fearGreed.previousWeek != null && ` · สัปดาห์ก่อน ${Math.round(fearGreed.previousWeek)}`}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">{loading ? 'กำลังโหลด…' : 'อ่านค่าไม่ได้ตอนนี้'}</p>
          )}
        </CardContent>
      </Card>
      {quotes.map((q) => (
        <Card key={q.symbol} className="gap-1 py-3">
          <CardContent className="px-4">
            <p className="text-muted-foreground text-xs">{q.name}</p>
            <p className="font-semibold tabular-nums">{formatNumber(q.price, q.price >= 1000 ? 0 : 2)}</p>
            <p className={`text-xs font-medium tabular-nums ${q.changePct >= 0 ? 'text-delta-up' : 'text-delta-down'}`}>
              {formatPercent(q.changePct, { signed: true, decimals: 2 })}
            </p>
          </CardContent>
        </Card>
      ))}
      {loading && !quotes.length && (
        <p className="text-muted-foreground col-span-2 self-center text-sm">กำลังโหลดราคา…</p>
      )}
    </section>
  )
}

const VERDICT_TONE = {
  trade: 'bg-delta-up/10 text-delta-up',
  caution: 'bg-brand-soft text-brand',
  'no-trade': 'bg-delta-down/10 text-delta-down',
} as const

function Environment({ desk }: { desk: DayDesk }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>
          แผนของรอบ {formatDate(desk.date)} · เขียน{' '}
          {new Date(desk.createdAt).toLocaleTimeString('th-TH-u-ca-gregory', { hour: '2-digit', minute: '2-digit' })} น.
          · โมเดล {desk.model}
        </CardDescription>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-sm ${VERDICT_TONE[desk.environment.verdict]}`}>
            {VERDICT_LABELS[desk.environment.verdict]}
          </span>
          <span className="font-display text-lg font-medium">{desk.environment.headline}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 text-sm leading-relaxed lg:grid-cols-3">
        <div className="space-y-2">
          <h3 className="font-semibold">Environment วันนี้</h3>
          <ul className="text-muted-foreground list-disc space-y-1 pl-5">
            {desk.environment.points.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
        <div className="space-y-2">
          <h3 className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="text-delta-down size-4" aria-hidden />
            สิ่งที่ต้องระวัง
          </h3>
          {desk.cautions.length ? (
            <ul className="space-y-1.5">
              {desk.cautions.map((c, i) => (
                <li key={i} className="flex gap-2">
                  {c.time && <span className="text-muted-foreground w-12 shrink-0 tabular-nums">{c.time}</span>}
                  <span>{c.what}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">ไม่มีเหตุการณ์ใหญ่ตามตาราง</p>
          )}
          <p className="text-muted-foreground text-xs">
            เวลานิวยอร์ก (ไทยเร็วกว่า 11 ชม. ช่วงหน้าร้อนสหรัฐฯ, 12 ชม. ช่วงหน้าหนาว)
          </p>
        </div>
        <div className="space-y-2">
          <h3 className="flex items-center gap-1.5 font-semibold">
            <Newspaper className="size-4" aria-hidden />
            ข่าวใหญ่
          </h3>
          <ul className="space-y-2">
            {desk.news.map((n, i) => (
              <li key={i}>
                <a
                  href={n.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand inline-flex items-start gap-1 font-medium hover:underline"
                >
                  {n.title}
                  <ExternalLink className="mt-1 size-3 shrink-0" aria-hidden />
                </a>
                <p className="text-muted-foreground text-xs">{n.note}</p>
              </li>
            ))}
          </ul>
        </div>
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
      <h2 id="plans" className="font-display text-xl font-medium">
        แผนเทรดวันนี้ ({desk.plans.length}/{RULES.maxPlans})
      </h2>
      {desk.plans.length === 0 && (
        <Card>
          <CardContent className="text-sm leading-relaxed">
            <p className="font-semibold">วันนี้ไม่มีแผนเทรด</p>
            <p className="text-muted-foreground">
              ไม่มีหุ้นที่เข้า setup และคุ้มเสี่ยงพอ การอยู่เฉยๆ ก็เป็นการตัดสินใจที่ดี
            </p>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {desk.plans.map((p) => (
          <PlanCard key={p.id} plan={p} outcome={outcomes.get(p.id)} bars={bars.get(p.ticker) ?? []} />
        ))}
      </div>
      {desk.passed.length > 0 && (
        <details className="group rounded-2xl border bg-card px-4 py-3 text-sm">
          <summary className="cursor-pointer list-none font-semibold [&::-webkit-details-marker]:hidden">
            ตัวที่ดูแล้วไม่เอา ({desk.passed.length})
            <ChevronDown
              className="text-muted-foreground ml-1 inline size-4 transition-transform group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <ul className="mt-2 space-y-1">
            {desk.passed.map((x) => (
              <li key={x.ticker}>
                <span className="font-semibold">{x.ticker}</span> <span className="text-muted-foreground">{x.why}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

function PlanCard({ plan, outcome, bars }: { plan: DayPlan; outcome?: PlanOutcome; bars: Bar[] }) {
  const lines = useMemo(
    () => [
      { price: plan.level, label: plan.levelName, color: '--brand' },
      { price: plan.target, label: 'เป้า', color: '--delta-up', dashed: true },
      ...(outcome?.entry ? [{ price: outcome.entry.price, label: 'เข้า', color: '--series-you' }] : []),
      ...(outcome?.stop != null ? [{ price: outcome.stop, label: 'stop', color: '--delta-down', dashed: true }] : []),
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
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span className="text-lg">{plan.ticker}</span>
          <span className="bg-muted rounded-full px-2 py-0.5 text-xs font-medium">{SETUP_LABELS[plan.setup]}</span>
          {outcome && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[outcome.status]}`}>
              {STATUS_LABELS[outcome.status]}
              {outcome.r != null && ` ${outcome.r >= 0 ? '+' : ''}${outcome.r.toFixed(2)}R`}
            </span>
          )}
        </CardTitle>
        <CardDescription className="leading-relaxed">{plan.why}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
          <span>
            จุด: {plan.levelName} {formatMoney(plan.level, '$')}
          </span>
          <span>
            เป้า: {plan.targetName} {formatMoney(plan.target, '$')}
          </span>
          {outcome?.stop != null && <span>stop {formatMoney(outcome.stop, '$')}</span>}
          {outcome?.rr != null && <span>คุ้มเสี่ยงตอนเข้า 1:{outcome.rr.toFixed(1)}</span>}
        </p>
        <PlanChart bars={bars} lines={lines} />
        <ol className="space-y-2">
          {steps.map(([name, text], i) => (
            <li key={name} className="flex gap-3">
              <span className="bg-brand text-background flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                {i + 1}
              </span>
              <span className="leading-relaxed">
                <span className="font-semibold">{name}: </span>
                {text}
              </span>
            </li>
          ))}
        </ol>
        {outcome && <p className="bg-muted/60 rounded-xl px-3 py-2 text-xs leading-relaxed">{outcome.note}</p>}
      </CardContent>
    </Card>
  )
}

const SCAN_TONE = {
  good: 'bg-delta-up/10 text-delta-up',
  wait: 'bg-brand-soft text-brand',
  avoid: 'bg-muted text-muted-foreground',
} as const
const SCAN_LABEL = { good: 'เข้า setup คุ้มเสี่ยง', wait: 'เฝ้าดู', avoid: 'ไม่ควรเข้า' } as const
const LOCATION_LABEL = { 'above-value': 'เหนือ value', 'in-value': 'ใน value', 'below-value': 'ใต้ value' } as const

function Scanner({ rows, scannedAt }: { rows: ScanRow[]; scannedAt: string }) {
  const counts = { good: 0, wait: 0, avoid: 0 }
  for (const r of rows) counts[r.status]++
  return (
    <Card>
      <CardHeader>
        <CardTitle>คัดหุ้นก่อนตลาดเปิด</CardTitle>
        <CardDescription>
          สแกน {rows.length} ตัว เมื่อ{' '}
          {new Date(scannedAt).toLocaleString('th-TH-u-ca-gregory', { dateStyle: 'medium', timeStyle: 'short' })} · เข้า
          setup {counts.good} · เฝ้าดู {counts.wait} · ไม่ควรเข้า {counts.avoid} · เทียบกับ value area
          (ช่วงราคาที่มีการซื้อขาย 70%) ของเมื่อวาน คุ้มเสี่ยงเป็นค่าประมาณก่อนเปิด
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>หุ้น</TableHead>
              <TableHead className="text-right">ก่อนเปิด</TableHead>
              <TableHead>ตำแหน่ง</TableHead>
              <TableHead>setup · จุด → เป้า</TableHead>
              <TableHead className="text-right">คุ้มเสี่ยง</TableHead>
              <TableHead>ผล</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.ticker} className="align-top">
                <TableCell className="font-semibold">{r.ticker}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(r.price)}
                  <div className={`text-xs ${r.gapPct >= 0 ? 'text-delta-up' : 'text-delta-down'}`}>
                    {formatPercent(r.gapPct, { signed: true, decimals: 1 })}
                  </div>
                </TableCell>
                <TableCell className="text-xs">{LOCATION_LABEL[r.location]}</TableCell>
                <TableCell className="text-xs">
                  {r.setup && SETUP_LABELS[r.setup].split(' (')[0]}
                  <div className="text-muted-foreground tabular-nums">
                    {r.levelName} {formatNumber(r.level)} → {formatNumber(r.target)}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.estRr != null ? `1:${r.estRr.toFixed(1)}` : '—'}
                </TableCell>
                <TableCell className="max-w-72 text-xs whitespace-normal">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${SCAN_TONE[r.status]}`}>
                    {SCAN_LABEL[r.status]}
                  </span>
                  <p className="text-muted-foreground mt-1 leading-relaxed">{r.reasons[0]}</p>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function Account({ state }: { state: DayState | null }) {
  if (!state || !state.days.length)
    return (
      <Card>
        <CardHeader>
          <CardTitle>พอร์ตเดย์เทรด (เงินสมมติ ${formatNumber(RULES.startingCashUsd, 0)})</CardTitle>
          <CardDescription>
            ยังไม่มีวันที่ให้คะแนนแล้ว ระบบให้คะแนนทุกแผนหลังตลาดปิด ราว 04:30 น. เวลาไทย
          </CardDescription>
        </CardHeader>
      </Card>
    )
  const stats = dayStats(state.account.trades)
  const counted = state.days.flatMap((d) => d.outcomes)
  const stayedOut = counted.filter((o) =>
    ['no-touch', 'no-confirm', 'skipped-rr', 'gap-stop'].includes(o.status),
  ).length
  return (
    <Card>
      <CardHeader>
        <CardTitle>พอร์ตเดย์เทรด</CardTitle>
        <CardDescription>
          เงินสมมติเริ่ม ${formatNumber(RULES.startingCashUsd, 0)} เสี่ยง {RULES.riskPct}% ต่อเทรด หยุดเมื่อขาดทุนถึง{' '}
          {RULES.dailyLossPct}% ของวัน รวมค่าคอมมิชชัน Dime! ทั้งซื้อและขาย
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-5">
          <Stat label="มูลค่าพอร์ต" value={formatMoney(state.account.cashUsd, '$')} />
          <Stat label="กำไร/ขาดทุน" value={formatSignedMoney(stats.pnlUsd, '$')} tone={stats.pnlUsd} />
          <Stat label="จำนวนเทรด" value={`${stats.trades}`} hint={`ไม่เข้า ${stayedOut} แผน`} />
          <Stat
            label="อัตราชนะ"
            value={stats.winRatePct != null ? formatPercent(stats.winRatePct, { decimals: 0 }) : '—'}
          />
          <Stat
            label="เฉลี่ยต่อเทรด"
            value={stats.avgR != null ? `${stats.avgR >= 0 ? '+' : ''}${stats.avgR.toFixed(2)}R` : '—'}
            tone={stats.avgR}
          />
        </dl>
        {state.account.trades.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>วัน</TableHead>
                <TableHead>หุ้น</TableHead>
                <TableHead className="text-right">เข้า</TableHead>
                <TableHead className="text-right">ออก</TableHead>
                <TableHead className="text-right">R</TableHead>
                <TableHead className="text-right">กำไร/ขาดทุน</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.account.trades.toReversed().map((t) => (
                <TableRow key={t.planId}>
                  <TableCell>{formatDate(t.date)}</TableCell>
                  <TableCell className="font-semibold">{t.ticker}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(t.entry)} <span className="text-muted-foreground text-xs">{t.entryTime}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(t.exit)} <span className="text-muted-foreground text-xs">{t.exitTime}</span>
                  </TableCell>
                  <TableCell className={`text-right tabular-nums ${t.r >= 0 ? 'text-delta-up' : 'text-delta-down'}`}>
                    {t.r >= 0 ? '+' : ''}
                    {t.r.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {t.taken ? formatSignedMoney(t.pnlUsd, '$') : t.note}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="text-muted-foreground text-xs leading-relaxed">
          ยังเร็วเกินไปที่จะสรุปจากไม่กี่เทรด ต้องมีอย่างน้อยราว 30–50 เทรดก่อนจะบอกได้ว่าวิธีคิดได้ผลหรือเป็นแค่ดวง
        </p>
      </CardContent>
    </Card>
  )
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: number | null }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={`text-lg font-semibold tabular-nums ${tone == null ? '' : tone >= 0 ? 'text-delta-up' : 'text-delta-down'}`}
      >
        {value}
      </dd>
      {hint && <dd className="text-muted-foreground text-xs">{hint}</dd>}
    </div>
  )
}

function Rules() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>กติกาของเดย์เทรด</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground space-y-3 text-sm leading-relaxed">
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>
            <span className="text-foreground font-semibold">Environment:</span> ก่อนเปิดตลาดดู Fear &amp; Greed, VIX,
            ดัชนี และข่าว/ตัวเลขที่จะออกวันนี้ ตัดสินว่าวันนี้เทรดได้ ระวัง หรือไม่เทรด
          </li>
          <li>
            <span className="text-foreground font-semibold">Location:</span> เทรดเฉพาะที่ระดับราคาสำคัญ: value area
            (VAH/VAL), POC และ high/low ของเมื่อวาน ไม่ไล่ราคากลางทาง
          </li>
          <li>
            <span className="text-foreground font-semibold">Confirmation:</span> ต้องมีแท่ง 5
            นาทีที่ระดับนั้นปิดกลับเหนือระดับ เป็นแท่งเขียว ปิดครึ่งบนของแท่ง และ volume สูงกว่าแท่งก่อนหน้าอย่างน้อย{' '}
            {RULES.volume.hold}–{RULES.volume.reclaim} เท่า (สัญญาณว่ามีคนรับของตรงนั้น) ไม่มีแท่งนี้ = ไม่เข้า
          </li>
          <li>
            <span className="text-foreground font-semibold">Execution:</span> ซื้อที่ราคาเปิดแท่งถัดไป stop
            ใต้จุดต่ำสุดที่ระดับนั้น เข้าเฉพาะเมื่อคุ้มเสี่ยงอย่างน้อย 1:{RULES.minRr} เข้าได้ 09:45–15:00 น. (นิวยอร์ก)
            ขายทุกตัวก่อนตลาดปิด ไม่ถือข้ามคืน
          </li>
        </ol>
        <p>
          ระบบเป็นคนตัดสินว่าเกิดสัญญาณหรือไม่ จากกราฟ 5 นาทีจริงตามกฎด้านบน AI เลือกได้แค่หุ้น ระดับ และเป้า
          ก่อนตลาดเปิด แผนที่บันทึกหลังตลาดเปิดนับเฉพาะแท่งหลังเวลาที่บันทึก ถ้าแท่งเดียวแตะทั้ง stop และเป้า นับเป็น
          stop
        </p>
        <p>
          ข้อจำกัด: วิธีในคลิปต้นแบบใช้ข้อมูล order flow (การรับของจริงในแต่ละราคา) และ gamma ของออปชัน
          ซึ่งเป็นข้อมูลแบบเสียเงิน ที่นี่ใช้ตัวแทนจากข้อมูลฟรี: value area คำนวณจากแท่ง 5 นาที และ “การรับของ” ดูจาก
          volume ที่พุ่งตอนราคาเด้งกลับ จึงหยาบกว่าของจริง
        </p>
        <p>เงินสมมติ ไม่ใช่เงินจริง และไม่ใช่คำแนะนำการลงทุน</p>
      </CardContent>
    </Card>
  )
}
