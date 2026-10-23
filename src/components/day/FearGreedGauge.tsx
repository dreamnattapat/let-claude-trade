import { fearGreedLabel } from '@/lib/day/market'

/** CNN's five bands, 0–100, with the Thai names the page uses. */
const BANDS = [
  { from: 0, to: 25, label: 'กลัวสุดขีด', tone: 'var(--delta-down)' },
  { from: 25, to: 45, label: 'กลัว', tone: 'var(--delta-down)' },
  { from: 45, to: 55, label: 'กลาง', tone: 'var(--muted-foreground)' },
  { from: 55, to: 75, label: 'โลภ', tone: 'var(--delta-up)' },
  { from: 75, to: 100, label: 'โลภสุดขีด', tone: 'var(--delta-up)' },
]

const CX = 150
const CY = 150
const R_OUT = 130
const R_IN = 86

/** A point on the half circle: 0 at the left, 100 at the right. */
function at(value: number, r: number): [number, number] {
  const a = Math.PI * (1 - value / 100)
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)]
}

function arc(from: number, to: number): string {
  const gap = 0.6 // a thin gap between bands
  const [a, b] = [from + gap, to - gap]
  const [x1, y1] = at(a, R_OUT)
  const [x2, y2] = at(b, R_OUT)
  const [x3, y3] = at(b, R_IN)
  const [x4, y4] = at(a, R_IN)
  return `M${x1},${y1} A${R_OUT},${R_OUT} 0 0 1 ${x2},${y2} L${x3},${y3} A${R_IN},${R_IN} 0 0 0 ${x4},${y4} Z`
}

/** A half-dial gauge: five bands, the current band filled, a needle at the score. */
export function FearGreedGauge({ score }: { score: number }) {
  const s = Math.min(100, Math.max(0, score))
  const [nx, ny] = at(s, R_IN - 14)
  return (
    <svg
      viewBox="0 0 300 184"
      className="w-full"
      role="img"
      aria-label={`Fear & Greed ${Math.round(s)}: ${fearGreedLabel(s)}`}
    >
      {BANDS.map((b) => {
        const active = s >= b.from && (s < b.to || (b.to === 100 && s === 100))
        const [lx, ly] = at((b.from + b.to) / 2, (R_OUT + R_IN) / 2)
        return (
          <g key={b.label}>
            <path
              d={arc(b.from, b.to)}
              fill={active ? b.tone : 'var(--muted)'}
              fillOpacity={active ? 0.25 : 1}
              stroke={active ? b.tone : 'none'}
              strokeWidth={active ? 1.5 : 0}
            />
            <text
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="10.5"
              fontWeight={active ? 700 : 500}
              fill={active ? 'var(--foreground)' : 'var(--muted-foreground)'}
            >
              {b.label}
            </text>
          </g>
        )
      })}
      {[0, 25, 50, 75, 100].map((t) => {
        const [x, y] = at(t, R_IN - 8)
        return (
          <text
            key={t}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="9"
            fill="var(--muted-foreground)"
          >
            {t}
          </text>
        )
      })}
      <line x1={CX} y1={CY} x2={nx} y2={ny} stroke="var(--foreground)" strokeWidth="4" strokeLinecap="round" />
      <circle cx={CX} cy={CY} r="30" fill="var(--card)" stroke="var(--border)" />
      <text
        x={CX}
        y={CY - 4}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="26"
        fontWeight="700"
        fill="var(--foreground)"
      >
        {Math.round(s)}
      </text>
    </svg>
  )
}
