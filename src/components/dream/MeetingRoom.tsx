import { useEffect, useMemo, useRef, useState } from 'react'

import { DREAM_AGENTS, type DreamAgentId, type DreamReport } from '@/lib/dreamTeam'
import { formatDate } from '@/lib/format'

/**
 * Team Lynch's meeting room: the seven agents as little pixel characters (the same
 * family as the site's chef logo). Most of the week they wander and sit down to work;
 * at meeting time (Mondays around 18:00 Bangkok) and retro time (Saturdays around
 * 09:00) they all sit at the table and talk. Tap one to see what it last said.
 */

/** Each agent's body colour, darker shade, and what it wears. */
const LOOK: Record<DreamAgentId, { body: string; shade: string; hat: Hat }> = {
  atlas: { body: '#6b77e0', shade: '#4a55c4', hat: 'mortarboard' },
  scout: { body: '#4d93e0', shade: '#2a6cc0', hat: 'explorer' },
  lens: { body: '#38a58c', shade: '#1f7a68', hat: 'glasses' },
  tempo: { body: '#d9a62a', shade: '#a77a0f', hat: 'headphones' },
  story: { body: '#e8794a', shade: '#c4561a', hat: 'beret' },
  guard: { body: '#5f9e3a', shade: '#3f7a1f', hat: 'helmet' },
  captain: { body: '#9466de', shade: '#7445c4', hat: 'captain' },
}
type Hat = 'mortarboard' | 'explorer' | 'glasses' | 'headphones' | 'beret' | 'helmet' | 'captain'

/** Pixels as [x, y, w, h, colour]; the sprite is 12 × 16. */
type Px = [number, number, number, number, string]

function hatPixels(hat: Hat): Px[] {
  switch (hat) {
    case 'mortarboard':
      return [
        [1, 2, 10, 1, '#222'],
        [3, 3, 6, 2, '#222'],
        [10, 3, 1, 3, '#f2c94c'],
      ]
    case 'explorer':
      return [
        [3, 1, 6, 3, '#c8a96e'],
        [3, 3, 6, 1, '#8a6d3b'],
        [0, 4, 12, 1, '#c8a96e'],
      ]
    case 'glasses':
      return [
        [2, 6, 3, 3, '#f5f5f5'],
        [7, 6, 3, 3, '#f5f5f5'],
        [5, 7, 2, 1, '#f5f5f5'],
        [3, 7, 1, 1, '#111'],
        [8, 7, 1, 1, '#111'],
      ]
    case 'headphones':
      return [
        [2, 3, 8, 1, '#333'],
        [1, 4, 1, 1, '#333'],
        [10, 4, 1, 1, '#333'],
        [0, 5, 2, 3, '#e04848'],
        [10, 5, 2, 3, '#e04848'],
      ]
    case 'beret':
      return [
        [2, 3, 8, 2, '#b3263a'],
        [5, 2, 2, 1, '#b3263a'],
      ]
    case 'helmet':
      return [
        [2, 2, 8, 3, '#7a8a6a'],
        [1, 4, 10, 1, '#5d6b50'],
      ]
    case 'captain':
      return [
        [2, 2, 8, 2, '#1f2a44'],
        [2, 4, 8, 1, '#f5f5f5'],
        [5, 2, 2, 1, '#f2c94c'],
        [1, 5, 10, 1, '#1f2a44'],
      ]
  }
}

function Sprite({ agent, step, typing }: { agent: DreamAgentId; step: 0 | 1; typing: boolean }) {
  const { body, shade, hat } = LOOK[agent]
  const eyes =
    hat === 'glasses'
      ? []
      : ([
          [3, 7, 1, 2, '#111'],
          [8, 7, 1, 2, '#111'],
        ] as Px[])
  const px: Px[] = [
    [2, 5, 8, 1, body],
    [1, 6, 10, 6, body],
    [1, 6, 1, 6, shade],
    [0, 9, 12, 1, body],
    [0, 9, 1, 1, shade],
    ...eyes,
    // Legs: two frames while walking, together while sitting or standing.
    ...((step === 0
      ? [
          [2, 12, 2, 2, shade],
          [8, 12, 2, 2, shade],
        ]
      : [
          [3, 12, 2, 2, shade],
          [7, 12, 2, 2, shade],
        ]) as Px[]),
    ...hatPixels(hat),
    ...((typing
      ? [
          [0, 14, 12, 2, '#3b3b3b'],
          [1, 14, 10, 1, '#5aa9e6'],
        ]
      : []) as Px[]),
  ]
  return (
    <svg viewBox="0 0 12 16" className="size-full" shapeRendering="crispEdges" aria-hidden>
      {px.map(([x, y, w, h, c], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} fill={c} />
      ))}
    </svg>
  )
}

/** Seats around the table, % of the room. */
const SEATS: [number, number][] = [
  [50, 22],
  [72, 30],
  [80, 52],
  [66, 72],
  [34, 72],
  [20, 52],
  [28, 30],
]

type Mode = 'sit' | 'walk' | 'stand'
type Pos = { x: number; y: number; mode: Mode; facing: 1 | -1; ms: number }

/** Meeting time (Mon 17:30–19:30) or retro time (Sat 08:45–10:00), Bangkok. */
function meetingNow(now: Date): 'meeting' | 'retro' | null {
  const bkk = new Date(now.getTime() + 7 * 3600_000)
  const day = bkk.getUTCDay()
  const m = bkk.getUTCHours() * 60 + bkk.getUTCMinutes()
  if (day === 1 && m >= 17 * 60 + 30 && m < 19 * 60 + 30) return 'meeting'
  if (day === 6 && m >= 8 * 60 + 45 && m < 10 * 60) return 'retro'
  return null
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)

/** A random spot on the floor, not on the table (an ellipse in the middle). */
function freeSpot(): [number, number] {
  for (;;) {
    const x = rand(8, 92)
    const y = rand(14, 90)
    if (((x - 50) / 26) ** 2 + ((y - 50) / 22) ** 2 > 1) return [x, y]
  }
}

export function MeetingRoom({ latest }: { latest: DreamReport | null }) {
  const agents = DREAM_AGENTS
  const [selected, setSelected] = useState<DreamAgentId>('captain')
  const [step, setStep] = useState<0 | 1>(0)
  const [session, setSession] = useState(() => meetingNow(new Date()))
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const [pos, setPos] = useState<Record<string, Pos>>(() =>
    Object.fromEntries(
      agents.map((a, i) => [a.id, { x: SEATS[i][0], y: SEATS[i][1], mode: 'sit' as Mode, facing: 1 as const, ms: 0 }]),
    ),
  )

  // The walking step and the meeting clock.
  useEffect(() => {
    if (reduced) return
    const t = setInterval(() => setStep((s) => (s ? 0 : 1)), 220)
    const c = setInterval(() => setSession(meetingNow(new Date())), 60_000)
    return () => {
      clearInterval(t)
      clearInterval(c)
    }
  }, [reduced])

  // The latest positions, for the timers below (state in their closures would be stale).
  const posRef = useRef(pos)
  useEffect(() => {
    posRef.current = pos
  }, [pos])

  // Each agent decides what to do next on its own clock: sit and work, or wander somewhere and stand.
  useEffect(() => {
    if (reduced) return
    const timers: ReturnType<typeof setTimeout>[] = []
    agents.forEach((a, i) => {
      const seat = SEATS[i]
      const next = () => {
        const p = posRef.current[a.id]
        // Back to the seat at meeting time, or after a wander; otherwise sometimes get up and walk.
        const target: [number, number] = session || p.mode !== 'sit' || Math.random() < 0.45 ? seat : freeSpot()
        const dist = Math.hypot(target[0] - p.x, target[1] - p.y)
        const ms = dist < 1 ? 0 : Math.round(dist * 90)
        const atSeat = target === seat
        setPos((all) => ({
          ...all,
          [a.id]: {
            x: target[0],
            y: target[1],
            mode: ms ? 'walk' : atSeat ? 'sit' : 'stand',
            facing: target[0] < p.x ? -1 : 1,
            ms,
          },
        }))
        timers.push(
          setTimeout(() => {
            setPos((all) => ({ ...all, [a.id]: { ...all[a.id], mode: atSeat ? 'sit' : 'stand', ms: 0 } }))
            timers.push(setTimeout(next, session ? 60_000 : rand(3000, 9000)))
          }, ms),
        )
      }
      timers.push(setTimeout(next, rand(500, 4000)))
    })
    return () => timers.forEach(clearTimeout)
  }, [session, reduced, agents])

  const memo = latest?.memos.find((m) => m.agent === selected)
  const agent = agents.find((a) => a.id === selected)!
  const joinsLater = agent.since != null && (!latest || latest.date < agent.since)

  return (
    <section aria-labelledby="team" className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="team" className="font-display text-lg font-medium">
          ห้องทีม
        </h2>
        <p className="text-muted-foreground text-xs">
          {session === 'meeting'
            ? 'กำลังประชุม'
            : session === 'retro'
              ? 'กำลังทบทวนงาน'
              : 'แตะที่ตัวละครเพื่อดูว่าพูดอะไร'}
        </p>
      </div>
      <div
        className="relative h-56 overflow-hidden rounded-2xl border sm:h-72"
        style={{
          backgroundColor: 'var(--card)',
          backgroundImage:
            'linear-gradient(45deg, color-mix(in oklab, var(--muted) 70%, transparent) 25%, transparent 25%, transparent 75%, color-mix(in oklab, var(--muted) 70%, transparent) 75%), linear-gradient(45deg, color-mix(in oklab, var(--muted) 70%, transparent) 25%, transparent 25%, transparent 75%, color-mix(in oklab, var(--muted) 70%, transparent) 75%)',
          backgroundSize: '32px 32px',
          backgroundPosition: '0 0, 16px 16px',
        }}
      >
        {/* The table, with the latest meeting's headline as the paper on it. */}
        <div
          className="absolute top-1/2 left-1/2 h-[34%] w-[42%] -translate-x-1/2 -translate-y-1/2 rounded-[40%] border-4"
          style={{ background: '#8a5a3b', borderColor: '#6b4329', boxShadow: '0 6px 0 rgba(0,0,0,.25)' }}
        >
          <div className="absolute top-1/2 left-1/2 h-1/3 w-1/4 -translate-x-1/2 -translate-y-1/2 rotate-[-6deg] bg-[#f4efe2]" />
        </div>
        {agents.map((a) => {
          const p = pos[a.id]
          const moving = p.mode === 'walk'
          const talking = session != null && p.mode === 'sit'
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setSelected(a.id)}
              aria-label={a.name}
              aria-pressed={selected === a.id}
              className="absolute size-10 -translate-x-1/2 -translate-y-full sm:size-12"
              style={{
                left: `${p.x}%`,
                top: `${p.y + 8}%`,
                transition: `left ${p.ms}ms linear, top ${p.ms}ms linear`,
                zIndex: Math.round(p.y),
              }}
            >
              {selected === a.id && (
                <span className="absolute -bottom-1 left-1/2 h-1.5 w-8 -translate-x-1/2 rounded-full bg-black/25" />
              )}
              <span
                className="block size-full"
                style={{
                  transform: `scaleX(${p.facing})${moving ? ` translateY(${step ? -2 : 0}px)` : ''}`,
                }}
              >
                <Sprite agent={a.id} step={moving ? step : 0} typing={p.mode === 'sit' && !session} />
              </span>
              {talking && (
                <span className="bg-background text-foreground absolute -top-4 left-1/2 -translate-x-1/2 rounded-md border px-1 text-[10px] leading-4">
                  {step ? '…' : '··'}
                </span>
              )}
              {selected === a.id && (
                <span className="bg-foreground text-background absolute -top-5 left-1/2 -translate-x-1/2 rounded px-1 text-[10px] leading-4 font-semibold whitespace-nowrap">
                  {a.name}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div className="bg-card space-y-1 rounded-2xl border px-4 py-3 text-sm">
        <p>
          <span className="font-semibold">{agent.name}</span>
          <span className="text-muted-foreground">
            {' '}
            · {agent.thaiName} · {agent.role}
          </span>
        </p>
        <p className="text-muted-foreground text-xs leading-relaxed">{agent.focus}</p>
        {joinsLater && (
          <p className="text-xs">
            เข้าทีมตั้งแต่ประชุม <span className="font-semibold">{formatDate(agent.since)}</span>
          </p>
        )}
        {memo && (
          <div className="pt-1 text-xs leading-relaxed">
            <p>
              <span className="font-semibold">ประชุมล่าสุด: </span>
              {memo.title}
              {memo.stance && <span className="text-muted-foreground"> · มุมมอง {memo.stance}</span>}
            </p>
            {memo.points[0] && <p className="text-muted-foreground">“{memo.points[0]}”</p>}
          </div>
        )}
      </div>
    </section>
  )
}
