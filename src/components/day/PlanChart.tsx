import { CandlestickSeries, ColorType, createChart, LineStyle, type Time, type UTCTimestamp } from 'lightweight-charts'
import { useEffect, useRef } from 'react'

import type { Bar } from '@/lib/day/bars'

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** Today's 5-minute candles with the plan's level, target, and the trade's entry and stop once there is one. */
export function PlanChart({
  bars,
  lines,
}: {
  bars: Bar[]
  lines: { price: number; label: string; color: string; dashed?: boolean }[]
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!bars.length) return
    const chart = createChart(ref.current!, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: cssVar('--chart-axis-text'),
        fontFamily: getComputedStyle(document.body).fontFamily,
        fontSize: 11,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: cssVar('--chart-grid') } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      localization: {
        // Bars carry New York times; show them as they are.
        timeFormatter: (t: UTCTimestamp) => new Date(t * 1000).toISOString().slice(11, 16),
      },
      handleScroll: false,
      handleScale: false,
    })
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: cssVar('--delta-up'),
      downColor: cssVar('--delta-down'),
      borderVisible: false,
      wickUpColor: cssVar('--delta-up'),
      wickDownColor: cssVar('--delta-down'),
      priceLineVisible: false,
      lastValueVisible: false,
    })
    // Lightweight Charts shows UTC: shift each bar to its New York wall-clock time.
    const nyTime = (b: Bar) => (Date.parse(`${b.date}T${b.time}:00Z`) / 1000) as Time
    candles.setData(bars.map((b) => ({ time: nyTime(b), open: b.o, high: b.h, low: b.l, close: b.c })))
    for (const l of lines)
      candles.createPriceLine({
        price: l.price,
        color: cssVar(l.color) || l.color,
        lineWidth: 1,
        lineStyle: l.dashed ? LineStyle.Dashed : LineStyle.Solid,
        axisLabelVisible: true,
        title: l.label,
      })
    chart.timeScale().fitContent()
    return () => chart.remove()
  }, [bars, lines])
  if (!bars.length) return null
  return <div ref={ref} className="h-48 w-full" />
}
