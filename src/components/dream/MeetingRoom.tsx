import { useEffect, useMemo, useRef, useState } from 'react'

import { DREAM_AGENTS, type DreamAgentId, type DreamReport } from '@/lib/dreamTeam'
import { formatDate } from '@/lib/format'

/**
 * Team Lynch's office: the seven agents as little pixel characters (the same family as
 * the site's chef logo). Most of the week they move between the work desks, the games
 * corner and the gym; at meeting time (Mondays around 18:00 Bangkok) and retro time
 * (Saturdays around 09:00) they all sit at the meeting table and talk. Tap one to see
 * what it last said and what it's doing now.
 *
 * The room is square and laid out in % of its side, so 1% across is 1% down.
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

type Mode = 'walk' | 'stand' | 'meet' | 'type' | 'game' | 'arcade' | 'run' | 'lift'

function Sprite({ agent, mode, step, slow }: { agent: DreamAgentId; mode: Mode; step: 0 | 1; slow: 0 | 1 }) {
  const { body, shade, hat } = LOOK[agent]
  const eyes =
    hat === 'glasses'
      ? []
      : ([
          [3, 7, 1, 2, '#111'],
          [8, 7, 1, 2, '#111'],
        ] as Px[])
  const stride = (mode === 'walk' || mode === 'run') && step === 1
  const extra: Px[] =
    mode === 'game'
      ? [
          // A game controller in its hands.
          [3, 10, 6, 2, '#2b2b2b'],
          [4, 10, 1, 1, '#e04848'],
          [7, 10, 1, 1, '#5bc0de'],
        ]
      : mode === 'lift'
        ? // Dumbbells: overhead, then down at the chest.
          slow
          ? [
              [0, 0, 2, 2, '#333'],
              [2, 0, 8, 1, '#9a9a9a'],
              [10, 0, 2, 2, '#333'],
            ]
          : [
              [0, 9, 2, 2, '#333'],
              [2, 10, 8, 1, '#9a9a9a'],
              [10, 9, 2, 2, '#333'],
            ]
        : []
  const px: Px[] = [
    [2, 5, 8, 1, body],
    [1, 6, 10, 6, body],
    [1, 6, 1, 6, shade],
    [0, 9, 12, 1, body],
    [0, 9, 1, 1, shade],
    ...eyes,
    // Legs: two frames while walking or running, together otherwise.
    ...((stride
      ? [
          [3, 12, 2, 2, shade],
          [7, 12, 2, 2, shade],
        ]
      : [
          [2, 12, 2, 2, shade],
          [8, 12, 2, 2, shade],
        ]) as Px[]),
    ...hatPixels(hat),
    ...extra,
  ]
  return (
    <svg viewBox="0 0 12 16" className="size-full" shapeRendering="crispEdges" aria-hidden>
      {px.map(([x, y, w, h, c], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} fill={c} />
      ))}
    </svg>
  )
}

/** A small pixel-art picture on a vw × vh grid, placed at (x, y) % of the room and w % wide. */
function Pixels({
  x,
  y,
  w,
  vw,
  vh,
  px,
  z,
}: {
  x: number
  y: number
  w: number
  vw: number
  vh: number
  px: Px[]
  z?: number
}) {
  return (
    <svg
      viewBox={`0 0 ${vw} ${vh}`}
      className="absolute block h-auto"
      style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, zIndex: z ?? Math.round(y + (w * vh) / vw) }}
      shapeRendering="crispEdges"
      aria-hidden
    >
      {px.map(([px0, py, pw, ph, c], i) => (
        <rect key={i} x={px0} y={py} width={pw} height={ph} fill={c} />
      ))}
    </svg>
  )
}

const PLANT: Px[] = [
  [4, 0, 2, 2, '#4f9d3a'],
  [1, 2, 3, 2, '#3f8a2c'],
  [6, 2, 3, 2, '#3f8a2c'],
  [3, 3, 4, 3, '#5fb043'],
  [0, 4, 3, 2, '#4f9d3a'],
  [7, 4, 3, 2, '#4f9d3a'],
  [4, 6, 2, 2, '#2f6e22'],
  [2, 8, 6, 1, '#b5653a'],
  [2, 9, 6, 4, '#c8794a'],
  [2, 9, 1, 4, '#a5562e'],
]
const SHELF: Px[] = [
  [0, 0, 14, 16, '#7a4e30'],
  [1, 1, 12, 14, '#5c3a22'],
  [1, 5, 12, 1, '#7a4e30'],
  [1, 10, 12, 1, '#7a4e30'],
  [2, 2, 1, 3, '#d9534f'],
  [3, 2, 1, 3, '#5bc0de'],
  [4, 3, 1, 2, '#f0ad4e'],
  [6, 2, 2, 3, '#5cb85c'],
  [9, 2, 1, 3, '#e8e8e8'],
  [10, 3, 2, 2, '#9b59b6'],
  [2, 7, 2, 3, '#f0ad4e'],
  [5, 6, 1, 4, '#337ab7'],
  [6, 7, 1, 3, '#d9534f'],
  [8, 7, 3, 3, '#e8e8e8'],
  [2, 11, 3, 4, '#5cb85c'],
  [6, 12, 1, 3, '#9b59b6'],
  [7, 11, 1, 4, '#5bc0de'],
  [9, 12, 3, 3, '#f0ad4e'],
]
const COOLER: Px[] = [
  [2, 0, 6, 5, '#7fc4f0'],
  [3, 1, 4, 3, '#a9dcfa'],
  [1, 5, 8, 11, '#e8e8e8'],
  [1, 5, 1, 11, '#c9c9c9'],
  [3, 7, 1, 1, '#d9534f'],
  [6, 7, 1, 1, '#337ab7'],
  [2, 10, 6, 1, '#bdbdbd'],
]
const BOARD: Px[] = [
  [0, 0, 28, 14, '#d8d8d8'],
  [1, 1, 26, 12, '#f8f8f4'],
  [3, 10, 4, 1, '#3fa34d'],
  [6, 9, 3, 1, '#3fa34d'],
  [8, 8, 3, 1, '#3fa34d'],
  [10, 9, 3, 1, '#3fa34d'],
  [12, 7, 3, 1, '#3fa34d'],
  [14, 6, 3, 1, '#3fa34d'],
  [16, 5, 3, 1, '#3fa34d'],
  [18, 6, 2, 1, '#3fa34d'],
  [19, 4, 3, 1, '#3fa34d'],
  [21, 3, 3, 1, '#3fa34d'],
  [3, 3, 7, 1, '#9aa3b5'],
  [3, 5, 5, 1, '#9aa3b5'],
  [23, 2, 2, 1, '#d9534f'],
]
const WINDOW: Px[] = [
  [0, 0, 16, 12, '#c9c2b4'],
  [1, 1, 14, 10, '#8fc8f0'],
  [1, 7, 14, 4, '#b6e0f7'],
  [7, 1, 2, 10, '#c9c2b4'],
  [1, 5, 14, 1, '#c9c2b4'],
  [3, 2, 3, 1, '#ffffff'],
  [10, 3, 3, 1, '#ffffff'],
]
const CLOCK: Px[] = [
  [2, 0, 6, 1, '#333'],
  [0, 2, 1, 6, '#333'],
  [9, 2, 1, 6, '#333'],
  [2, 9, 6, 1, '#333'],
  [1, 1, 8, 8, '#333'],
  [2, 1, 6, 8, '#fafafa'],
  [1, 2, 8, 6, '#fafafa'],
  [4, 2, 1, 3, '#333'],
  [5, 4, 2, 1, '#d9534f'],
]
const LAMP: Px[] = [
  [2, 0, 6, 4, '#f2c94c'],
  [3, 4, 4, 1, '#d9a62a'],
  [4, 5, 2, 9, '#555'],
  [2, 14, 6, 2, '#444'],
]

const DESK: Px[] = [
  [10, 0, 6, 4, '#2f2f2f'],
  [11, 1, 4, 2, '#5aa9e6'],
  [12, 3, 2, 1, '#2f2f2f'],
  [2, 3, 6, 1, '#dcdcdc'],
  [0, 2, 1, 2, '#f4efe2'],
  [0, 4, 16, 2, '#a8743f'],
  [0, 6, 16, 1, '#7a5230'],
  [1, 7, 1, 2, '#7a5230'],
  [14, 7, 1, 2, '#7a5230'],
]
const TREADMILL: Px[] = [
  [11, 0, 3, 2, '#444'],
  [12, 0, 1, 1, '#5fd35f'],
  [11, 2, 1, 6, '#8a8a8a'],
  [0, 7, 12, 2, '#2b2b2b'],
  [0, 7, 12, 1, '#555'],
  [0, 9, 1, 1, '#2b2b2b'],
  [11, 9, 1, 1, '#2b2b2b'],
]
const RACK: Px[] = [
  [0, 1, 12, 1, '#777'],
  [0, 1, 1, 5, '#777'],
  [11, 1, 1, 5, '#777'],
  [0, 4, 12, 1, '#777'],
  [1, 2, 1, 2, '#333'],
  [2, 3, 2, 1, '#9a9a9a'],
  [4, 2, 1, 2, '#333'],
  [6, 2, 1, 2, '#c0392b'],
  [7, 3, 2, 1, '#9a9a9a'],
  [9, 2, 1, 2, '#c0392b'],
]
const BALL: Px[] = [
  [2, 0, 4, 1, '#8e5bd6'],
  [1, 1, 6, 1, '#8e5bd6'],
  [0, 2, 8, 4, '#8e5bd6'],
  [1, 6, 6, 1, '#7445c4'],
  [2, 7, 4, 1, '#7445c4'],
  [2, 2, 2, 1, '#b58cf0'],
]
const TV: Px[] = [
  [0, 0, 20, 11, '#222'],
  [1, 1, 18, 9, '#1d2b53'],
  [14, 2, 3, 1, '#ffffff'],
  [12, 4, 1, 1, '#f2c94c'],
  [5, 5, 2, 2, '#e04848'],
  [2, 7, 9, 1, '#3fa34d'],
  [12, 8, 6, 1, '#3fa34d'],
  [7, 11, 6, 1, '#555'],
  [4, 12, 12, 1, '#5c3a22'],
]
const SOFA: Px[] = [
  [1, 0, 24, 5, '#5b6abf'],
  [0, 3, 3, 8, '#4a57a8'],
  [23, 3, 3, 8, '#4a57a8'],
  [3, 5, 20, 4, '#6c7bd0'],
  [10, 5, 1, 4, '#5b6abf'],
  [16, 5, 1, 4, '#5b6abf'],
  [3, 9, 20, 2, '#4a57a8'],
]
const BEANBAG: Px[] = [
  [2, 0, 6, 1, '#d9a62a'],
  [1, 1, 8, 1, '#d9a62a'],
  [0, 2, 10, 4, '#e8b93a'],
  [1, 6, 8, 1, '#b8891c'],
  [2, 2, 3, 1, '#f5d470'],
]
const arcade = (body: string, dark: string): Px[] => [
  [0, 0, 9, 17, body],
  [1, 1, 7, 2, '#f2c94c'],
  [1, 4, 7, 5, '#111'],
  [2, 5, 2, 2, '#5bc0de'],
  [5, 6, 2, 2, '#e04848'],
  [0, 10, 9, 2, dark],
  [2, 9, 1, 1, '#e04848'],
  [5, 10, 1, 1, '#5fd35f'],
  [7, 10, 1, 1, '#f2c94c'],
  [1, 12, 7, 5, dark],
  [4, 13, 1, 2, '#f2c94c'],
]
const POSTER: Px[] = [
  [0, 0, 10, 12, '#2b2b2b'],
  [1, 1, 8, 10, '#e04848'],
  [2, 4, 1, 3, '#2b2b2b'],
  [3, 5, 4, 1, '#f5f5f5'],
  [7, 4, 1, 3, '#2b2b2b'],
  [2, 8, 6, 1, '#f5f5f5'],
  [3, 2, 4, 1, '#f5f5f5'],
]

/** Things on the floor, % of the room: drawn by their bottom edge, and walked round. */
type Thing = {
  x: number
  y: number
  w: number
  vw: number
  vh: number
  px: Px[]
  block?: [number, number, number, number]
}
const DESKS = [
  [3, 24],
  [17, 24],
  [3, 40],
  [17, 40],
] as const
const TREADMILLS = [70, 84] as const
const ARCADES = [
  [60, '#7a2fb5', '#5a1f88'],
  [70, '#2f8fb5', '#1f6a88'],
] as const
const THINGS: Thing[] = [
  ...DESKS.map(([x, y]): Thing => ({ x, y, w: 13, vw: 16, vh: 9, px: DESK, block: [x, y + 3, 13, 4.5] })),
  { x: 34, y: 14, w: 8, vw: 14, vh: 16, px: SHELF, block: [34, 14, 8, 9] },
  { x: 61, y: 15, w: 6, vw: 10, vh: 13, px: PLANT, block: [61, 15, 6, 8] },
  ...TREADMILLS.map((x): Thing => ({ x, y: 19, w: 13, vw: 14, vh: 10, px: TREADMILL, block: [x, 24, 13, 4.5] })),
  { x: 71, y: 34, w: 12, vw: 12, vh: 6, px: RACK, block: [71, 34, 12, 6] },
  { x: 90, y: 35, w: 6, vw: 8, vh: 8, px: BALL, block: [90, 35, 6, 6] },
  { x: 2, y: 53, w: 6, vw: 10, vh: 13, px: PLANT, block: [2, 53, 6, 8] },
  { x: 93, y: 55, w: 5, vw: 10, vh: 13, px: PLANT, block: [93, 55, 5, 6.5] },
  { x: 8, y: 62, w: 18, vw: 20, vh: 13, px: TV, block: [8, 64, 18, 9.7] },
  { x: 5, y: 84, w: 26, vw: 26, vh: 11, px: SOFA, block: [5, 84, 26, 11] },
  { x: 32, y: 82, w: 5, vw: 10, vh: 16, px: LAMP, block: [32, 86, 5, 4] },
  { x: 41, y: 86, w: 9, vw: 10, vh: 7, px: BEANBAG, block: [41, 86, 9, 6] },
  ...ARCADES.map(([x, body, dark]): Thing => ({
    x,
    y: 72,
    w: 8,
    vw: 9,
    vh: 17,
    px: arcade(body, dark),
    block: [x, 76, 8, 11],
  })),
  { x: 90, y: 74, w: 7, vw: 10, vh: 16, px: COOLER, block: [90, 77, 7, 8] },
]

/** Where an agent can be, and what it does there. `over`: drawn in front of the thing it's on. */
type Spot = { id: string; x: number; y: number; mode: Mode; label: string; zone: Zone; over?: boolean }
type Zone = 'work' | 'play' | 'gym' | 'break'
const SPOTS: Spot[] = [
  ...DESKS.map(([x, y], i): Spot => ({
    id: `desk${i}`,
    x: x + 4.5,
    y: y + 3.5,
    mode: 'type',
    label: 'กำลังทำงานที่โต๊ะ',
    zone: 'work',
  })),
  { id: 'shelf', x: 38, y: 27, mode: 'stand', label: 'หาหนังสืออ่าน', zone: 'work' },
  ...[11.5, 18, 24.5].map((x, i): Spot => ({
    id: `sofa${i}`,
    x,
    y: 93,
    mode: 'game',
    label: 'เล่นเกมบนโซฟา',
    zone: 'play',
    over: true,
  })),
  { id: 'beanbag', x: 45.5, y: 91, mode: 'game', label: 'เล่นเกมบนบีนแบ็ก', zone: 'play', over: true },
  ...ARCADES.map(([x], i): Spot => ({
    id: `arcade${i}`,
    x: x + 4,
    y: 93,
    mode: 'arcade',
    label: 'เล่นตู้เกม',
    zone: 'play',
  })),
  ...TREADMILLS.map((x, i): Spot => ({
    id: `run${i}`,
    x: x + 5.5,
    y: 26,
    mode: 'run',
    label: 'วิ่งบนลู่วิ่ง',
    zone: 'gym',
    over: true,
  })),
  { id: 'lift0', x: 76, y: 51, mode: 'lift', label: 'ยกเวท', zone: 'gym' },
  { id: 'lift1', x: 89, y: 51, mode: 'lift', label: 'ยกเวท', zone: 'gym' },
  { id: 'cooler0', x: 86, y: 93, mode: 'stand', label: 'พักดื่มน้ำ', zone: 'break' },
  { id: 'cooler1', x: 80, y: 89, mode: 'stand', label: 'พักดื่มน้ำ', zone: 'break' },
]

/** What each agent likes doing when there's no meeting: work, play, gym, break. */
const LIKES: Record<DreamAgentId, Record<Zone, number>> = {
  atlas: { work: 4, play: 1, gym: 1, break: 1 },
  scout: { work: 3, play: 1, gym: 2, break: 1 },
  lens: { work: 4, play: 1, gym: 1, break: 1 },
  tempo: { work: 2, play: 3, gym: 1, break: 1 },
  story: { work: 3, play: 2, gym: 1, break: 1 },
  guard: { work: 2, play: 1, gym: 3, break: 1 },
  captain: { work: 3, play: 1, gym: 2, break: 1 },
}
const STAY: Record<Zone, [number, number]> = {
  work: [9000, 22000],
  play: [7000, 16000],
  gym: [6000, 13000],
  break: [3000, 7000],
}

/** The meeting table: an ellipse in the middle, and the seven seats round it. */
const TABLE = { cx: 50, cy: 53, rx: 13, ry: 8 }
const SEATS: [number, number][] = Array.from({ length: 7 }, (_, k) => {
  const a = ((-90 + (k * 360) / 7) * Math.PI) / 180
  return [50 + 17 * Math.cos(a), 53 + 13 * Math.sin(a)]
})

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

/** The floor as a 50 × 50 grid of 2% cells, with the walls, the table and the furniture blocked. */
const N = 50
const BLOCKED = (() => {
  const g = new Uint8Array(N * N)
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const x = i * 2 + 1
      const y = j * 2 + 1
      const wall = y < 16 || x < 2 || x > 98 || y > 98
      const table = ((x - TABLE.cx) / (TABLE.rx + 2)) ** 2 + ((y - TABLE.cy) / (TABLE.ry + 2)) ** 2 <= 1
      const thing = THINGS.some(
        ({ block: b }) => b && x > b[0] - 1 && x < b[0] + b[2] + 1 && y > b[1] - 1 && y < b[1] + b[3] + 1,
      )
      g[j * N + i] = wall || table || thing ? 1 : 0
    }
  return g
})()
const cell = (v: number) => Math.max(0, Math.min(N - 1, Math.floor(v / 2)))
const blockedAt = (x: number, y: number) => BLOCKED[cell(y) * N + cell(x)] === 1

/** Whether a straight walk from a to b stays on open floor (its first and last steps may be on furniture). */
function clear(a: [number, number], b: [number, number]): boolean {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1])
  for (let s = 2; s < d - 2; s += 0.8) {
    const t = s / d
    if (blockedAt(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return false
  }
  return true
}

/**
 * The way from a to b round the table and the furniture: A* over the grid (furniture costs a lot rather
 * than being a wall, so an agent sitting on the sofa can still get up), then straightened where the way is clear.
 */
function route(a: [number, number], b: [number, number]): [number, number][] {
  if (clear(a, b)) return [b]
  const start = cell(a[1]) * N + cell(a[0])
  const goal = cell(b[1]) * N + cell(b[0])
  const gScore = new Float64Array(N * N).fill(Infinity)
  const from = new Int32Array(N * N).fill(-1)
  const done = new Uint8Array(N * N)
  const hScore = (c: number) => Math.hypot((c % N) - (goal % N), Math.floor(c / N) - Math.floor(goal / N))
  gScore[start] = 0
  const open = [start]
  while (open.length) {
    let bi = 0
    for (let k = 1; k < open.length; k++)
      if (gScore[open[k]] + hScore(open[k]) < gScore[open[bi]] + hScore(open[bi])) bi = k
    const c = open.splice(bi, 1)[0]
    if (c === goal) break
    if (done[c]) continue
    done[c] = 1
    const ci = c % N
    const cj = Math.floor(c / N)
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const ni = ci + di
        const nj = cj + dj
        if ((!di && !dj) || ni < 0 || nj < 0 || ni >= N || nj >= N) continue
        const n = nj * N + ni
        if (di && dj && (BLOCKED[cj * N + ni] || BLOCKED[nj * N + ci])) continue
        const cost = (di && dj ? Math.SQRT2 : 1) * (BLOCKED[n] && n !== goal ? 25 : 1)
        if (gScore[c] + cost < gScore[n]) {
          gScore[n] = gScore[c] + cost
          from[n] = c
          open.push(n)
        }
      }
  }
  const cells: [number, number][] = []
  for (let c = goal; c !== -1 && c !== start; c = from[c]) cells.unshift([(c % N) * 2 + 1, Math.floor(c / N) * 2 + 1])
  cells[cells.length - 1] = b
  // Straighten: from each point, go to the furthest later point in a clear line.
  const legs: [number, number][] = []
  let at = a
  let k = 0
  while (k < cells.length) {
    let far = k
    for (let m = cells.length - 1; m > k; m--)
      if (clear(at, cells[m])) {
        far = m
        break
      }
    legs.push(cells[far])
    at = cells[far]
    k = far + 1
  }
  return legs
}

type Pos = { x: number; y: number; mode: Mode; facing: 1 | -1; ms: number; label: string; over?: boolean }

/**
 * The office pets: three little animals that wander about, nap and say hello when tapped.
 * They're not on the team, so they never come to meetings.
 */
type PetId = 'cat' | 'dog' | 'duck'
const PETS: { id: PetId; name: string; sound: string; speed: number }[] = [
  { id: 'cat', name: 'ปันผล แมวประจำออฟฟิศ', sound: 'เมี้ยว', speed: 75 },
  { id: 'dog', name: 'บูล หมาประจำออฟฟิศ', sound: 'โฮ่ง!', speed: 60 },
  { id: 'duck', name: 'ทองคำ ลูกเป็ดประจำออฟฟิศ', sound: 'ก๊าบ', speed: 110 },
]

function petPixels(id: PetId, step: 0 | 1, asleep: boolean): Px[] {
  const eyes = (y: number, a: number, b: number, c = '#111'): Px[] =>
    asleep
      ? [
          [a, y, 2, 1, c],
          [b, y, 2, 1, c],
        ]
      : [
          [a, y, 1, 1, c],
          [b, y, 1, 1, c],
        ]
  switch (id) {
    case 'cat': {
      const c = '#9aa0a8'
      const d = '#6f757d'
      return [
        [1, 0, 2, 2, c],
        [7, 0, 2, 2, c],
        [2, 1, 1, 1, '#f29bb0'],
        [7, 1, 1, 1, '#f29bb0'],
        [1, 1, 8, 5, c],
        [4, 1, 2, 1, d],
        [1, 3, 1, 1, d],
        [8, 3, 1, 1, d],
        ...eyes(3, 3, 6),
        [4, 4, 2, 1, '#f29bb0'],
        [2, 6, 6, 3, c],
        [4, 6, 2, 3, '#ececec'],
        [2, 9, 2, 1, d],
        [6, 9, 2, 1, d],
        ...((step
          ? [
              [8, 7, 2, 1, d],
              [10, 6, 1, 1, d],
            ]
          : [
              [8, 8, 2, 1, d],
              [10, 7, 1, 1, d],
            ]) as Px[]),
      ]
    }
    case 'dog': {
      const c = '#d99a4e'
      const d = '#b5772f'
      return [
        [1, 0, 2, 2, d],
        [7, 0, 2, 2, d],
        [1, 1, 8, 5, c],
        [3, 3, 4, 3, '#fbf3e6'],
        ...eyes(2, 3, 6),
        [4, 4, 2, 1, '#2b2b2b'],
        [2, 6, 6, 3, c],
        [4, 6, 2, 2, '#fbf3e6'],
        [2, 9, 2, 1, d],
        [6, 9, 2, 1, d],
        ...((step ? [[8, 5, 2, 2, d]] : [[9, 5, 2, 2, d]]) as Px[]),
      ]
    }
    case 'duck':
      return [
        [3, 0, 4, 4, '#f5d142'],
        ...eyes(1, 5, 5),
        [7, 2, 2, 1, '#f08a24'],
        [1, 4, 8, 4, '#f5d142'],
        [0, 4, 2, 2, '#f5d142'],
        [3, 5, 3, 2, step ? '#e2b92b' : '#d4aa1f'],
        ...((step
          ? [
              [3, 8, 2, 1, '#f08a24'],
              [6, 8, 1, 1, '#f08a24'],
            ]
          : [
              [3, 8, 1, 1, '#f08a24'],
              [5, 8, 2, 1, '#f08a24'],
            ]) as Px[]),
      ]
  }
}

/** A random open spot on the floor for a pet (anywhere it can stand, not on furniture or the table). */
function petSpot(): [number, number] {
  for (;;) {
    const x = rand(6, 94)
    const y = rand(22, 97)
    if (!blockedAt(x, y) && !blockedAt(x - 2, y) && !blockedAt(x + 2, y)) return [x, y]
  }
}

type PetPos = { x: number; y: number; ms: number; facing: 1 | -1; state: 'walk' | 'sit' | 'sleep' }

function Pets({ step, reduced }: { step: 0 | 1; reduced: boolean }) {
  const [pos, setPos] = useState<Record<PetId, PetPos>>(() => {
    const at = (id: PetId): PetPos => {
      const [x, y] = petSpot()
      return { x, y, ms: 0, facing: Math.random() < 0.5 ? 1 : -1, state: id === 'cat' ? 'sleep' : 'sit' }
    }
    return { cat: at('cat'), dog: at('dog'), duck: at('duck') }
  })
  const [said, setSaid] = useState<PetId | null>(null)
  const posRef = useRef(pos)
  useEffect(() => {
    posRef.current = pos
  }, [pos])

  useEffect(() => {
    if (reduced) return
    const timers: ReturnType<typeof setTimeout>[] = []
    for (const pet of PETS) {
      const next = () => {
        const p = posRef.current[pet.id]
        const r = Math.random()
        // Mostly potter about; sometimes sit a while or curl up for a nap (cats nap most).
        if (r < (pet.id === 'cat' ? 0.3 : 0.15)) {
          setPos((all) => ({ ...all, [pet.id]: { ...all[pet.id], state: 'sleep', ms: 0 } }))
          timers.push(setTimeout(next, rand(8000, 20000)))
          return
        }
        if (r < 0.4) {
          setPos((all) => ({ ...all, [pet.id]: { ...all[pet.id], state: 'sit', ms: 0 } }))
          timers.push(setTimeout(next, rand(2000, 6000)))
          return
        }
        const legs = route([p.x, p.y], petSpot())
        const walkLeg = (k: number, from: [number, number]) => {
          const to = legs[k]
          const ms = Math.round(Math.hypot(to[0] - from[0], to[1] - from[1]) * pet.speed)
          setPos((all) => ({
            ...all,
            [pet.id]: { x: to[0], y: to[1], ms, facing: to[0] < from[0] ? -1 : 1, state: 'walk' },
          }))
          timers.push(
            setTimeout(() => {
              if (k + 1 < legs.length) return walkLeg(k + 1, to)
              setPos((all) => ({ ...all, [pet.id]: { ...all[pet.id], state: 'sit', ms: 0 } }))
              timers.push(setTimeout(next, rand(1500, 5000)))
            }, ms),
          )
        }
        walkLeg(0, [p.x, p.y])
      }
      timers.push(setTimeout(next, rand(1000, 5000)))
    }
    return () => timers.forEach(clearTimeout)
  }, [reduced])

  useEffect(() => {
    if (!said) return
    const t = setTimeout(() => setSaid(null), 1500)
    return () => clearTimeout(t)
  }, [said])

  return PETS.map((pet) => {
    const p = pos[pet.id]
    const walking = p.state === 'walk'
    return (
      <button
        key={pet.id}
        type="button"
        onClick={() => setSaid(pet.id)}
        aria-label={pet.name}
        title={pet.name}
        className="absolute w-[7%] -translate-x-1/2 -translate-y-full"
        style={{
          aspectRatio: '12 / 10',
          left: `${p.x}%`,
          top: `${p.y}%`,
          transition: `left ${p.ms}ms linear, top ${p.ms}ms linear`,
          zIndex: Math.round(p.y),
        }}
      >
        <span
          className="block size-full"
          style={{ transform: `scaleX(${p.facing})${walking ? ` translateY(${step ? -1 : 0}px)` : ''}` }}
        >
          <svg viewBox="0 0 12 10" className="size-full" shapeRendering="crispEdges" aria-hidden>
            {petPixels(pet.id, walking || (pet.id === 'dog' && p.state === 'sit') ? step : 0, p.state === 'sleep').map(
              ([x, y, w, h, c], i) => (
                <rect key={i} x={x} y={y} width={w} height={h} fill={c} />
              ),
            )}
          </svg>
        </span>
        {p.state === 'sleep' && said !== pet.id && (
          <span className="text-muted-foreground absolute -top-3 right-0 text-[9px] leading-3 font-semibold">
            {step ? 'z' : 'Z'}
          </span>
        )}
        {said === pet.id && (
          <span className="bg-background text-foreground absolute -top-5 left-1/2 -translate-x-1/2 rounded-md border px-1 text-[10px] leading-4 whitespace-nowrap">
            {pet.sound}
          </span>
        )}
      </button>
    )
  })
}

/** Pick somewhere to go that nobody else has, by what this agent likes. */
function pickSpot(agent: DreamAgentId, taken: Set<string>, current?: string): Spot {
  const free = SPOTS.filter((s) => !taken.has(s.id) && s.id !== current)
  const weight = (s: Spot) => LIKES[agent][s.zone] / SPOTS.filter((t) => t.zone === s.zone).length
  let r = Math.random() * free.reduce((sum, s) => sum + weight(s), 0)
  for (const s of free) if ((r -= weight(s)) <= 0) return s
  return free[0] ?? SPOTS[0]
}

const atSpot = (s: Spot): Omit<Pos, 'facing' | 'ms'> => ({ x: s.x, y: s.y, mode: s.mode, label: s.label, over: s.over })
const MEETING_LABEL = { meeting: 'ประชุมทีม', retro: 'ทบทวนงานประจำสัปดาห์' }

export function MeetingRoom({ latest }: { latest: DreamReport | null }) {
  const agents = DREAM_AGENTS
  const [selected, setSelected] = useState<DreamAgentId>('captain')
  const [tick, setTick] = useState(0)
  const [session, setSession] = useState(() => meetingNow(new Date()))
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  // Where everyone is now: at the table during a meeting, else already at something they like doing.
  const claims = useRef(new Map<DreamAgentId, string>())
  const [pos, setPos] = useState<Record<string, Pos>>(() => {
    const now = meetingNow(new Date())
    const taken = new Set<string>()
    return Object.fromEntries(
      agents.map((a, i) => {
        if (now) {
          const [x, y] = SEATS[i]
          return [a.id, { x, y, mode: 'meet', facing: 1, ms: 0, label: MEETING_LABEL[now] } satisfies Pos]
        }
        const s = pickSpot(a.id, taken)
        taken.add(s.id)
        claims.current.set(a.id, s.id)
        return [a.id, { ...atSpot(s), facing: 1, ms: 0 } satisfies Pos]
      }),
    )
  })

  // The animation clock and the meeting clock.
  useEffect(() => {
    if (reduced) return
    const t = setInterval(() => setTick((n) => n + 1), 220)
    const c = setInterval(() => setSession(meetingNow(new Date())), 60_000)
    return () => {
      clearInterval(t)
      clearInterval(c)
    }
  }, [reduced])
  const step = (tick % 2) as 0 | 1
  const slow = (Math.floor(tick / 3) % 2) as 0 | 1

  // The latest positions, for the timers below (state in their closures would be stale).
  const posRef = useRef(pos)
  useEffect(() => {
    posRef.current = pos
  }, [pos])

  // Each agent decides what to do next on its own clock: to its seat at meeting time, else to something it likes.
  useEffect(() => {
    if (reduced) return
    const timers: ReturnType<typeof setTimeout>[] = []
    agents.forEach((a, i) => {
      const next = () => {
        const p = posRef.current[a.id]
        let target: [number, number]
        let arrive: Omit<Pos, 'facing' | 'ms'>
        let stay: number
        if (session) {
          claims.current.delete(a.id)
          target = SEATS[i]
          arrive = { x: target[0], y: target[1], mode: 'meet', label: MEETING_LABEL[session] }
          stay = 60_000
        } else {
          const mine = claims.current.get(a.id)
          claims.current.delete(a.id)
          const s = pickSpot(a.id, new Set(claims.current.values()), mine)
          claims.current.set(a.id, s.id)
          target = [s.x, s.y]
          arrive = atSpot(s)
          stay = rand(...STAY[s.zone])
        }
        if (Math.hypot(target[0] - p.x, target[1] - p.y) < 1) {
          timers.push(setTimeout(next, stay))
          return
        }
        const legs = route([p.x, p.y], target)
        const walkLeg = (k: number, from: [number, number]) => {
          const to = legs[k]
          const ms = Math.round(Math.hypot(to[0] - from[0], to[1] - from[1]) * 90)
          setPos((all) => ({
            ...all,
            [a.id]: { x: to[0], y: to[1], mode: 'walk', facing: to[0] < from[0] ? -1 : 1, ms, label: 'กำลังเดิน' },
          }))
          timers.push(
            setTimeout(() => {
              if (k + 1 < legs.length) return walkLeg(k + 1, to)
              setPos((all) => ({ ...all, [a.id]: { ...arrive, facing: all[a.id].facing, ms: 0 } }))
              timers.push(setTimeout(next, stay))
            }, ms),
          )
        }
        walkLeg(0, [p.x, p.y])
      }
      timers.push(setTimeout(next, session ? rand(300, 1500) : rand(2000, 9000)))
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
        className="relative mx-auto aspect-square w-full max-w-lg overflow-hidden rounded-2xl border"
        style={{
          backgroundColor: 'var(--card)',
          backgroundImage:
            'linear-gradient(45deg, color-mix(in oklab, var(--muted) 70%, transparent) 25%, transparent 25%, transparent 75%, color-mix(in oklab, var(--muted) 70%, transparent) 75%), linear-gradient(45deg, color-mix(in oklab, var(--muted) 70%, transparent) 25%, transparent 25%, transparent 75%, color-mix(in oklab, var(--muted) 70%, transparent) 75%)',
          backgroundSize: '32px 32px',
          backgroundPosition: '0 0, 16px 16px',
        }}
      >
        {/* The back wall: window over the desks, the team's whiteboard over the table, a gym poster and a clock. */}
        <div
          className="absolute inset-x-0 top-0 h-[13%] border-b-4"
          style={{ background: '#e9e1d2', borderColor: '#c9b89a' }}
        />
        <Pixels x={7} y={1.5} w={14} vw={16} vh={12} px={WINDOW} z={1} />
        <Pixels x={39} y={1} w={22} vw={28} vh={14} px={BOARD} z={1} />
        <Pixels x={75} y={1.5} w={7} vw={10} vh={12} px={POSTER} z={1} />
        <Pixels x={88} y={2.5} w={6} vw={10} vh={10} px={CLOCK} z={1} />
        {/* The zones' floors: carpet under the desks, rubber in the gym, a rug in the games corner, one under the table. */}
        <div
          className="absolute rounded-lg"
          style={{
            left: '2%',
            top: '14%',
            width: '30%',
            height: '38%',
            background: 'color-mix(in oklab, #4d7fb8 22%, transparent)',
          }}
        />
        <div
          className="absolute rounded-lg"
          style={{
            left: '68%',
            top: '14%',
            width: '30%',
            height: '38%',
            background:
              'repeating-linear-gradient(0deg, color-mix(in oklab, #4a4f57 55%, transparent) 0 6px, color-mix(in oklab, #3a3e45 55%, transparent) 6px 12px)',
          }}
        />
        <div
          className="absolute rounded-2xl border-4 border-dotted"
          style={{
            left: '2%',
            top: '76%',
            width: '52%',
            height: '22%',
            background: 'color-mix(in oklab, #8e5bd6 25%, transparent)',
            borderColor: 'color-mix(in oklab, #8e5bd6 45%, transparent)',
          }}
        />
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-[45%] border-4 border-dashed"
          style={{
            left: `${TABLE.cx}%`,
            top: `${TABLE.cy}%`,
            width: '42%',
            height: '34%',
            background: 'color-mix(in oklab, #c0504d 30%, transparent)',
            borderColor: 'color-mix(in oklab, #c0504d 55%, transparent)',
          }}
        />
        {THINGS.map((t, i) => (
          <Pixels key={i} x={t.x} y={t.y} w={t.w} vw={t.vw} vh={t.vh} px={t.px} />
        ))}
        {/* The meeting table, with the latest meeting's paper on it. */}
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-[40%] border-4"
          style={{
            left: `${TABLE.cx}%`,
            top: `${TABLE.cy}%`,
            width: `${TABLE.rx * 2}%`,
            height: `${TABLE.ry * 2}%`,
            background: '#8a5a3b',
            borderColor: '#6b4329',
            boxShadow: '0 6px 0 rgba(0,0,0,.25)',
            zIndex: TABLE.cy,
          }}
        >
          <div className="absolute top-1/2 left-1/2 h-1/3 w-1/4 -translate-x-1/2 -translate-y-1/2 rotate-[-6deg] bg-[#f4efe2]" />
        </div>
        <Pets step={step} reduced={reduced} />
        {agents.map((a) => {
          const p = pos[a.id]
          const moving = p.mode === 'walk' || p.mode === 'run'
          const talking = p.mode === 'meet'
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setSelected(a.id)}
              aria-label={`${a.name}: ${p.label}`}
              aria-pressed={selected === a.id}
              className="absolute w-[9%] -translate-x-1/2 -translate-y-full"
              style={{
                aspectRatio: '12 / 16',
                left: `${p.x}%`,
                top: `${p.y}%`,
                transition: `left ${p.ms}ms linear, top ${p.ms}ms linear`,
                zIndex: Math.round(p.y) + (p.over ? 10 : 0) + (selected === a.id ? 1 : 0),
              }}
            >
              {selected === a.id && (
                <span className="absolute -bottom-1 left-1/2 h-1.5 w-full -translate-x-1/2 rounded-full bg-black/25" />
              )}
              <span
                className="block size-full"
                style={{ transform: `scaleX(${p.facing})${moving ? ` translateY(${step ? -2 : 0}px)` : ''}` }}
              >
                <Sprite agent={a.id} mode={p.mode} step={moving ? step : 0} slow={slow} />
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
        <p className="text-xs">
          <span className="text-muted-foreground">ตอนนี้: </span>
          {pos[selected].label}
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
