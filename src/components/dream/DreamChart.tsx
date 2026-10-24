import { ColorType, createChart, CrosshairMode, LineSeries, LineStyle, type Time } from 'lightweight-charts'
import { useEffect, useRef, useState } from 'react'

import type { DreamPoint } from '@/lib/dream'
import { formatDate, formatPercent } from '@/lib/format'

const toPct = (value: number, start: number) => (value / start - 1) * 100

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

type Badge = 'team' | 'spy' | 'themes' | 'vgt'

/** A round badge at the end of a line: the site's logo for the team, a red "500" for the S&P 500, "ETF" for the basket. */
function EndBadge({ badge, x, y }: { badge: Badge; x: number; y: number }) {
  const ring = { team: '--series-dream', spy: '--series-spy', themes: '--series-invested', vgt: '--series-vgt' }[badge]
  return (
    <span
      className="bg-card pointer-events-none absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden rounded-full text-[9px] font-bold"
      style={{ left: x, top: y, boxShadow: `0 0 0 2px var(${ring})`, zIndex: badge === 'team' ? 3 : 2 }}
      aria-hidden
    >
      {badge === 'team' ? (
        <img src="/logo.png" alt="" className="size-6 object-contain" />
      ) : badge === 'spy' ? (
        <span className="flex size-full items-center justify-center bg-[#c8343e] text-[10px] font-extrabold text-white">
          500
        </span>
      ) : badge === 'vgt' ? (
        <span className="flex size-full items-center justify-center bg-[#96151d] font-serif text-sm font-bold text-white">
          V
        </span>
      ) : (
        <span style={{ color: `var(${ring})` }}>ETF</span>
      )}
    </span>
  )
}

/** Dream vs the S&P 500 and the five-theme ETF basket, % since the start. */
export function DreamChart({ points, startingCash }: { points: DreamPoint[]; startingCash: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  // Where each line ends, in pixels, for the round badges that say whose line it is.
  const [ends, setEnds] = useState<{ key: Badge; x: number; y: number }[]>([])
  const pct = (v: number) => toPct(v, startingCash)

  useEffect(() => {
    const chart = createChart(ref.current!, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: cssVar('--chart-axis-text'),
        fontFamily: getComputedStyle(document.body).fontFamily,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: cssVar('--chart-grid') } },
      rightPriceScale: { borderVisible: false },
      // Room on the right for the badges at the ends of the lines.
      timeScale: { borderVisible: false, rightOffset: 1.2 },
      crosshair: { mode: CrosshairMode.Magnet, horzLine: { visible: false, labelVisible: false } },
      localization: { locale: 'th-TH-u-ca-gregory', priceFormatter: (v: number) => `${v.toFixed(1)}%` },
      handleScroll: false,
      handleScale: false,
    })
    const line = (color: string, dashed = false) =>
      chart.addSeries(LineSeries, {
        color: cssVar(color),
        lineWidth: 2,
        lineStyle: dashed ? LineStyle.Dashed : LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: false,
      })
    // The basket is dashed and muted: a yardstick, not a contender.
    const themed = points.filter((p) => p.themes != null)
    const themes = themed.length ? line('--series-invested', true) : null
    themes?.setData(themed.map((p) => ({ time: p.date as Time, value: toPct(p.themes!, startingCash) })))
    const vgtPoints = points.filter((p) => p.extra?.VGT != null)
    const vgt = vgtPoints.length ? line('--series-vgt') : null
    vgt?.setData(vgtPoints.map((p) => ({ time: p.date as Time, value: toPct(p.extra!.VGT, startingCash) })))
    const spy = line('--series-spy')
    const dream = line('--series-dream')
    spy.setData(points.map((p) => ({ time: p.date as Time, value: toPct(p.spy, startingCash) })))
    dream.setData(points.map((p) => ({ time: p.date as Time, value: toPct(p.value, startingCash) })))
    chart.timeScale().fitContent()

    const last = points.at(-1)!
    const place = () => {
      const x = chart.timeScale().timeToCoordinate(last.date as Time)
      if (x == null) return
      const at = (key: Badge, series: typeof spy | null, value: number | undefined) => {
        const y = series && value != null ? series.priceToCoordinate(toPct(value, startingCash)) : null
        return y == null ? [] : [{ key, x, y }]
      }
      setEnds([
        ...at('themes', themes, themed.at(-1)?.themes),
        ...at('vgt', vgt, vgtPoints.at(-1)?.extra?.VGT),
        ...at('spy', spy, last.spy),
        ...at('team', dream, last.value),
      ])
    }
    // After the first layout, and whenever the chart's size changes.
    requestAnimationFrame(place)
    chart.timeScale().subscribeSizeChange(place)
    chart.timeScale().subscribeVisibleLogicalRangeChange(place)
    const index = new Map(points.map((p, i) => [p.date, i]))
    chart.subscribeCrosshairMove((param) => setHovered(param.time ? (index.get(String(param.time)) ?? null) : null))
    return () => chart.remove()
  }, [points, startingCash])

  const shown = points[hovered ?? points.length - 1]
  return (
    <div className="space-y-2">
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {(
          [
            ['ทีม Lynch', '--series-dream', shown && pct(shown.value)],
            ['S&P 500', '--series-spy', shown && pct(shown.spy)],
            ...(shown?.themes != null ? ([['ETF 5 ธีม', '--series-invested', pct(shown.themes)]] as const) : []),
            ...(shown?.extra?.VGT != null ? ([['VGT', '--series-vgt', pct(shown.extra.VGT)]] as const) : []),
          ] as const
        ).map(([label, color, value]) => (
          <div key={label} className="flex items-center gap-2">
            <span
              className="h-0.5 w-4 rounded-full"
              style={
                color === '--series-invested'
                  ? { backgroundImage: `repeating-linear-gradient(90deg, var(${color}) 0 4px, transparent 4px 7px)` }
                  : { background: `var(${color})` }
              }
              aria-hidden
            />
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-semibold tabular-nums">{formatPercent(value, { signed: true, decimals: 2 })}</dd>
          </div>
        ))}
        <p className="text-muted-foreground text-xs sm:ml-auto">{shown ? formatDate(shown.date) : ''}</p>
      </dl>
      <div className="relative">
        <div ref={ref} className="h-56 w-full" />
        {ends.map((e) => (
          <EndBadge key={e.key} badge={e.key} x={e.x} y={e.y} />
        ))}
      </div>
    </div>
  )
}
