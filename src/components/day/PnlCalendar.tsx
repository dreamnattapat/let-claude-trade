import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { DayTrade } from '@/lib/day/engine'
import type { DayState } from '@/lib/day/types'
import { formatSignedMoney } from '@/lib/format'

const MONTHS = new Intl.DateTimeFormat('th-TH-u-ca-gregory', { month: 'long', year: 'numeric' })
const WEEKDAYS = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.']

const iso = (d: Date) => d.toISOString().slice(0, 10)

/** A trading calendar: each weekday's P&L and trade count, a month at a time. */
export function PnlCalendar({ state }: { state: DayState }) {
  const days = useMemo(() => {
    const map = new Map<string, { pnl: number; trades: number; planned: boolean; verdict?: string }>()
    for (const d of state.days) map.set(d.date, { pnl: 0, trades: 0, planned: true, verdict: d.verdict })
    for (const t of state.account.trades.filter((x: DayTrade) => x.taken)) {
      const day = map.get(t.date) ?? { pnl: 0, trades: 0, planned: true }
      day.pnl += t.pnlUsd
      day.trades += 1
      map.set(t.date, day)
    }
    return map
  }, [state])
  const latest = state.days.at(-1)?.date ?? iso(new Date())
  const [month, setMonth] = useState(() => latest.slice(0, 7))
  const [y, m] = month.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1, 1))
  const shift = (n: number) => setMonth(iso(new Date(Date.UTC(y, m - 1 + n, 1))).slice(0, 7))

  // Weekdays of the month, padded so the 1st lands under its weekday.
  const cells: (string | null)[] = []
  const lead = (first.getUTCDay() + 6) % 7 // Monday = 0
  if (lead < 5) for (let i = 0; i < lead; i++) cells.push(null)
  for (let d = new Date(first); d.getUTCMonth() === m - 1; d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay()
    if (wd !== 0 && wd !== 6) cells.push(iso(d))
  }
  const inMonth = [...days].filter(([date]) => date.startsWith(month))
  const total = inMonth.reduce((s, [, d]) => s + d.pnl, 0)
  const trades = inMonth.reduce((s, [, d]) => s + d.trades, 0)

  return (
    <section aria-label="ปฏิทินกำไรขาดทุน" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => shift(-1)}
          className="hover:bg-muted rounded-full p-2"
          aria-label="เดือนก่อน"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <div className="text-center">
          <p className="font-semibold">{MONTHS.format(first)}</p>
          <p
            className={`text-sm font-semibold tabular-nums ${total > 0 ? 'text-delta-up' : total < 0 ? 'text-delta-down' : 'text-muted-foreground'}`}
          >
            {formatSignedMoney(total, '$')} · {trades} เทรด
          </p>
        </div>
        <button
          type="button"
          onClick={() => shift(1)}
          className="hover:bg-muted rounded-full p-2"
          aria-label="เดือนถัดไป"
        >
          <ChevronRight className="size-5" aria-hidden />
        </button>
      </div>
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        {WEEKDAYS.map((w) => (
          <p key={w} className="text-muted-foreground text-center text-xs font-semibold">
            {w}
          </p>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={`pad-${i}`} />
          const d = days.get(date)
          const tone =
            !d || d.trades === 0
              ? 'bg-muted/60'
              : d.pnl > 0
                ? 'bg-delta-up/15'
                : d.pnl < 0
                  ? 'bg-delta-down/15'
                  : 'bg-muted'
          const text = !d || d.trades === 0 ? 'text-muted-foreground' : d.pnl > 0 ? 'text-delta-up' : 'text-delta-down'
          return (
            <div
              key={date}
              className={`flex min-h-16 flex-col items-center justify-center rounded-xl px-1 py-2 text-center sm:min-h-20 ${tone}`}
              title={d?.verdict === 'no-trade' ? 'AI ตัดสินว่าไม่เทรดวันนี้' : undefined}
            >
              <span className="text-muted-foreground text-xs">{Number(date.slice(8))}</span>
              {d && d.trades > 0 ? (
                <>
                  <span className={`text-xs font-semibold tabular-nums sm:text-sm ${text}`}>
                    {formatSignedMoney(d.pnl, '$').replace('.00', '')}
                  </span>
                  <span className="text-muted-foreground text-[10px] sm:text-xs">{d.trades} เทรด</span>
                </>
              ) : (
                <span className="text-muted-foreground text-[10px] sm:text-xs">
                  {d ? (d.verdict === 'no-trade' ? 'ไม่เทรด' : 'ไม่เข้า') : '—'}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-muted-foreground text-xs">"ไม่เข้า" คือวันที่มีแผนแต่ไม่เกิดสัญญาณ ซึ่งนับว่าทำตามกฎ</p>
    </section>
  )
}
