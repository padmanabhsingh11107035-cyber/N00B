import { CONFIG } from './config'

/**
 * The hand-built run, as plain data (no three.js). Forward is +z, x is lateral, the whole slope
 * drops by `grade` per metre. The simulation, the renderer and the autopilot test all read the
 * same `LEVEL`, so what you see is exactly what collides.
 */
export type Motion = { amp: number; freq: number; phase: number }
export type PlatformKind = 'ice' | 'bridge' | 'crumble' | 'safe' | 'ramp' | 'finish'
export type Platform = {
  id: number
  kind: PlatformKind
  x: number
  w: number
  z0: number
  z1: number
  y0: number
  y1: number
  thick: number
  move?: Motion
}
export type HazardKind = 'spike' | 'stub' | 'barrier' | 'slider' | 'gate' | 'pendulum' | 'spinner' | 'laser' | 'ceiling' | 'block'
export type Hazard = {
  id: number
  kind: HazardKind
  /** Centre (for pendulums: the pivot). */
  x: number
  y: number
  z: number
  hx: number
  hy: number
  hz: number
  /** slider/gate: lateral amplitude; pendulum: swing amplitude in radians. */
  amp: number
  freq: number
  phase: number
  /** pendulum arm length; spinner angular speed (rad/s) lives in `freq`. */
  len: number
  /** laser: fraction of each cycle the beam is live (1 = always). */
  duty: number
}
export type Rail = { id: number; x: number; z0: number; z1: number; y0: number; y1: number }
export type Pad = { id: number; x: number; z: number; w: number; len: number; y: number }
export type Checkpoint = { x: number; y: number; z: number }
export type Section = { z: number; key: string; hint: string | null; speedMul: number; wallExtra: number }

export type Level = {
  platforms: Platform[]
  hazards: Hazard[]
  rails: Rail[]
  pads: Pad[]
  checkpoints: Checkpoint[]
  sections: Section[]
  finishZ: number
  length: number
  index: LevelIndex
}

export const slopeY = (z: number): number => -CONFIG.sim.grade * z
export const topAt = (p: Platform, z: number): number => p.y0 + ((p.y1 - p.y0) * (z - p.z0)) / (p.z1 - p.z0)
export const railY = (r: Rail, z: number): number => r.y0 + ((r.y1 - r.y0) * (z - r.z0)) / (r.z1 - r.z0)

type PlatOpts = { x?: number; w?: number; dy?: number; dy1?: number; kind?: PlatformKind; thick?: number; move?: Motion }

class Builder {
  readonly platforms: Platform[] = []
  readonly hazards: Hazard[] = []
  readonly rails: Rail[] = []
  readonly pads: Pad[] = []
  readonly checkpoints: Checkpoint[] = []
  readonly sections: Section[] = []

  plat(z0: number, len: number, o: PlatOpts = {}): Platform {
    const dy = o.dy ?? 0
    const dy1 = o.dy1 ?? dy
    const kind = o.kind ?? (dy1 !== dy ? 'ramp' : (o.w ?? 12) <= 3.4 ? 'bridge' : 'ice')
    const p: Platform = {
      id: this.platforms.length,
      kind,
      x: o.x ?? 0,
      w: o.w ?? 12,
      z0,
      z1: z0 + len,
      y0: slopeY(z0) + dy,
      y1: slopeY(z0 + len) + dy1,
      thick: o.thick ?? (kind === 'bridge' || kind === 'crumble' ? 1.4 : 3.2),
      move: o.move,
    }
    this.platforms.push(p)
    return p
  }

  private hazard(h: Omit<Hazard, 'id' | 'amp' | 'freq' | 'phase' | 'len' | 'duty'> & Partial<Hazard>): Hazard {
    const full: Hazard = { amp: 0, freq: 0, phase: 0, len: 0, duty: 1, ...h, id: this.hazards.length }
    this.hazards.push(full)
    return full
  }

  /** Tall ice crystal: steer around it. */
  spike(p: Platform, z: number, x: number, size = 1.3): void {
    this.hazard({ kind: 'spike', x, y: topAt(p, z) + 1.3, z, hx: size / 2, hy: 1.3, hz: size / 2 })
  }
  /** Knee-high crystal: jump over it. */
  stub(p: Platform, z: number, x: number): void {
    this.hazard({ kind: 'stub', x, y: topAt(p, z) + 0.45, z, hx: 0.55, hy: 0.45, hz: 0.45 })
  }
  barrier(p: Platform, z: number, h = 0.8): void {
    this.hazard({ kind: 'barrier', x: p.x, y: topAt(p, z) + h / 2, z, hx: p.w / 2 + 0.6, hy: h / 2, hz: 0.3 })
  }
  slider(p: Platform, z: number, x: number, hx: number, amp: number, freq: number, phase: number, h = 2.2): void {
    this.hazard({ kind: 'slider', x, y: topAt(p, z) + h / 2, z, hx, hy: h / 2, hz: 0.55, amp, freq, phase })
  }
  /** Sliding wall pair with a moving opening of `gap` metres. */
  gate(p: Platform, z: number, gap: number, amp: number, freq: number, phase: number): void {
    const half = p.w / 2 + 1
    const y = topAt(p, z) + 2.4
    for (const side of [-1, 1]) {
      this.hazard({ kind: 'gate', x: p.x + side * (gap / 2 + half), y, z, hx: half, hy: 2.4, hz: 0.5, amp, freq, phase })
    }
  }
  pendulum(p: Platform, z: number, len: number, amp: number, freq: number, phase: number): void {
    this.hazard({ kind: 'pendulum', x: p.x, y: topAt(p, z) + len + 1.05, z, hx: 0.95, hy: 0.95, hz: 0.95, amp, freq, phase, len })
  }
  spinner(p: Platform, z: number, x: number, len: number, speed: number, phase: number): void {
    this.hazard({ kind: 'spinner', x, y: topAt(p, z) + 0.5, z, hx: len, hy: 0.28, hz: 0.28, freq: speed, phase })
  }
  /** Laser fence at `height` above the deck; `freq` 0 = always live. */
  laser(p: Platform, z: number, height: number, freq = 0, duty = 1, phase = 0): void {
    this.hazard({ kind: 'laser', x: p.x, y: topAt(p, z) + height, z, hx: p.w / 2 + 0.4, hy: 0.12, hz: 0.12, freq, duty, phase })
  }
  /** Hanging slab whose underside sits `bottom` metres above the deck. */
  ceiling(p: Platform, z: number, bottom: number, depth = 2.4): void {
    this.hazard({ kind: 'ceiling', x: p.x, y: topAt(p, z) + bottom + 3, z, hx: p.w / 2 + 0.6, hy: 3, hz: depth / 2 })
  }
  block(r: Rail, z: number): void {
    this.hazard({ kind: 'block', x: r.x, y: railY(r, z) + 0.65, z, hx: 0.55, hy: 0.65, hz: 0.5 })
  }
  pad(p: Platform, z: number, x: number, w = 3, len = 6): void {
    this.pads.push({ id: this.pads.length, x, z, w, len, y: topAt(p, z) })
  }
  rail(z0: number, len: number, x: number, dy: number): Rail {
    const r: Rail = { id: this.rails.length, x, z0, z1: z0 + len, y0: slopeY(z0) + dy, y1: slopeY(z0 + len) + dy }
    this.rails.push(r)
    return r
  }
  checkpoint(p: Platform, z: number, x = p.x): void {
    this.checkpoints.push({ x, y: topAt(p, z), z })
  }
  section(z: number, key: string, hint: string | null, speedMul = 1, wallExtra: number = CONFIG.sim.wallExtra): void {
    this.sections.push({ z, key, hint, speedMul, wallExtra })
  }
}

function build(): Level {
  const b = new Builder()

  // ── 1 · Glacier start: wide deck, crystal lanes, first boost pad ─────────
  b.section(-40, 'section.s1', 'hint.steer', 1, 1.2)
  const a = b.plat(-40, 340, { w: 16 })
  b.checkpoint(a, 0)
  for (const x of [-6, -3.2, 3.2, 6]) b.spike(a, 100, x)
  for (const x of [-7, -4.5, -2, 0.3]) b.spike(a, 130, x)
  for (const x of [-0.3, 2, 4.5, 7]) b.spike(a, 160, x)
  for (const x of [-7, -4.5, 4.5, 7]) b.spike(a, 190, x)
  for (const x of [-1.6, 0, 1.6]) b.spike(a, 215, x)
  b.pad(a, 238, 0)

  // ── 2 · Crystal corridor: barriers, first gaps, a sliding block ──────────
  b.section(250, 'section.s2', 'hint.jump')
  b.barrier(a, 272)
  const bb = b.plat(308, 90, { w: 12 })
  for (const x of [-4.5, -1.8, 0.9]) b.spike(bb, 326, x)
  for (const x of [-0.9, 1.8, 4.5]) b.spike(bb, 350, x)
  b.barrier(bb, 374)
  const c = b.plat(408, 70, { x: -2, w: 10 })
  b.spike(c, 428, -2)
  b.slider(c, 452, -2, 1.2, 3.2, 0.45, 0)
  b.pad(c, 466, -2)
  const d = b.plat(488, 72, { w: 14, kind: 'safe' })
  b.checkpoint(d, 500)

  // ── 3 · Broken bridges: narrow spans, offsets, stubs ─────────────────────
  b.section(560, 'section.s3', 'hint.bridge')
  const e = b.plat(571, 45, { x: -3, w: 3 })
  b.pad(e, 598, -3, 2.4)
  const f = b.plat(626, 40, { x: 2, w: 2.6 })
  b.stub(f, 648, 2)
  const g = b.plat(677, 36, { x: -1, w: 2.4 })
  b.slider(g, 697, -1, 0.8, 2.6, 0.5, 1)
  const h = b.plat(724, 34, { x: 3, w: 2.4 })
  b.stub(h, 742, 3)
  b.plat(768, 30, { x: 0, w: 2.4, dy: 1 })
  const j = b.plat(808, 72, { w: 14, kind: 'safe' })
  b.checkpoint(j, 820)
  b.pad(j, 858, 0)

  // ── 4 · Gates & pendulums: timing, brake to wait ─────────────────────────
  b.section(880, 'section.s4', 'hint.brake')
  const k = b.plat(880, 150, { w: 10 })
  b.gate(k, 905, 3.4, 3, 0.35, 0)
  b.gate(k, 945, 3.2, 3.2, 0.45, 1.5)
  b.gate(k, 985, 3.0, 3.4, 0.55, 3)
  b.pad(k, 1014, 0)
  const l = b.plat(1040, 72, { w: 3.2 })
  b.pendulum(l, 1058, 6, 1, 0.5, 0)
  b.pendulum(l, 1078, 6, 1, 0.5, 2.2)
  b.pendulum(l, 1098, 6, 1.05, 0.55, 4)
  const m = b.plat(1122, 78, { w: 14, kind: 'safe' })
  b.checkpoint(m, 1135)
  b.pad(m, 1176, 3)

  // ── 5 · Crumbling ice, slam under the slabs, laser pair ──────────────────
  b.section(1200, 'section.s5', 'hint.crumble')
  b.plat(1210, 14, { x: 0, w: 5, kind: 'crumble' })
  b.plat(1231, 12, { x: 3.5, w: 4.5, kind: 'crumble' })
  b.plat(1250, 12, { x: -1, w: 4.5, kind: 'crumble' })
  b.plat(1270, 12, { x: -4.5, w: 4.5, kind: 'crumble' })
  b.plat(1290, 14, { x: 0, w: 5, kind: 'crumble' })
  b.section(1306, 'section.s5b', 'hint.slam')
  // Launch lip, then hanging slabs far enough out that a human can see them and slam in time
  // (Shift from ~0.25 s before the lip to ~0.4 s after it; riding on without slamming still hits).
  b.plat(1314, 16, { w: 6, dy: 0, dy1: 4 })
  const n = b.plat(1330, 74, { w: 10 })
  b.ceiling(n, 1348, 2.3)
  b.ceiling(n, 1362, 2.3)
  b.laser(n, 1378, 0.35)
  b.laser(n, 1394, 1.95)
  const o = b.plat(1414, 86, { w: 14, kind: 'safe' })
  b.checkpoint(o, 1426)
  b.pad(o, 1462, 3)

  // ── 6 · Kicker canyon: ramp jumps, spinners, a drifting island ───────────
  b.section(1500, 'section.s6', 'hint.ramp', 1, 2.4)
  b.plat(1500, 16, { w: 6, dy: 0, dy1: 2.5 })
  const i1 = b.plat(1538, 22, { w: 8 })
  b.spinner(i1, 1552, 0, 3.6, 2.2, 0)
  b.plat(1560, 14, { w: 6, dy: 0, dy1: 2.5 })
  b.plat(1598, 20, { w: 6, move: { amp: 3, freq: 0.3, phase: 0 } })
  b.plat(1626, 14, { w: 6, dy: 0, dy1: 3 })
  const i3 = b.plat(1664, 22, { x: -3, w: 7 })
  b.spinner(i3, 1671, -3, 3.4, -2.6, 1)
  b.pad(i3, 1681, -3)
  const p = b.plat(1696, 64, { w: 14, kind: 'safe' })
  b.checkpoint(p, 1708)
  b.pad(p, 1742, 0)

  // ── 7 · Light rails: grind, hop between rails, dodge blocks ──────────────
  b.section(1760, 'section.s7', 'hint.rail', 1, 2.4)
  const ra = [-4, 0, 4].map(x => b.rail(1768, 100, x, 1.2))
  b.block(ra[1], 1790)
  b.block(ra[0], 1808)
  b.block(ra[2], 1808)
  b.block(ra[1], 1826)
  b.block(ra[0], 1842)
  b.block(ra[1], 1856)
  b.block(ra[2], 1856)
  const rb0 = b.rail(1880, 45, -4, 1.2)
  const rb1 = b.rail(1880, 80, 0, 1.2)
  const rb2 = b.rail(1900, 60, 4, 1.2)
  b.block(rb1, 1895)
  b.block(rb0, 1912)
  b.block(rb1, 1935)
  b.block(rb2, 1950)
  const q = b.plat(1970, 70, { w: 14, kind: 'safe', dy: -0.5 })
  b.checkpoint(q, 1982)
  b.pad(q, 2022, -3)

  // ── 8 · Final sprint: faster avalanche, everything at once ───────────────
  b.section(2040, 'section.s8', 'hint.sprint', 1.12, 3.4)
  const r1 = b.plat(2040, 60, { w: 9, dy: -0.5 })
  b.slider(r1, 2058, 0, 1.4, 3.2, 0.6, 0)
  b.spinner(r1, 2078, 0, 4.2, 2.8, 0)
  b.pad(r1, 2092, 0)
  b.plat(2110, 12, { x: 2, w: 3.2, dy: -0.5, kind: 'crumble' })
  b.plat(2129, 12, { x: -2, w: 3.2, dy: -0.5, kind: 'crumble' })
  b.plat(2148, 12, { x: 1, w: 3.2, dy: -0.5, kind: 'crumble' })
  const r3 = b.plat(2170, 80, { w: 8, dy: -0.5 })
  b.gate(r3, 2190, 3, 2.6, 0.6, 0.5)
  b.laser(r3, 2210, 0.35, 0.8, 0.6, 0)
  b.pendulum(r3, 2228, 6, 1.1, 0.6, 1)
  b.pad(r3, 2244, 0)
  b.plat(2250, 14, { w: 6, dy: -0.5, dy1: 2.5 })
  b.plat(2296, 120, { w: 24, kind: 'finish', dy: -0.5 })
  const finishZ = 2310

  const level = {
    platforms: b.platforms,
    hazards: b.hazards,
    rails: b.rails,
    pads: b.pads,
    checkpoints: b.checkpoints,
    sections: b.sections,
    finishZ,
    length: finishZ,
  }
  return { ...level, index: buildIndex(level) }
}

// ── Spatial index: fixed z buckets so each step only tests nearby objects ──
export const BUCKET = 20
export type Bucket = { platforms: number[]; hazards: number[]; rails: number[]; pads: number[] }
export type LevelIndex = { buckets: Bucket[]; offset: number }

function buildIndex(l: Omit<Level, 'index'>): LevelIndex {
  const offset = 100
  const buckets: Bucket[] = []
  const add = (list: keyof Bucket, id: number, z0: number, z1: number) => {
    const a = Math.floor((z0 - 2 + offset) / BUCKET)
    const bEnd = Math.floor((z1 + 2 + offset) / BUCKET)
    for (let i = Math.max(0, a); i <= bEnd; i += 1) {
      buckets[i] ??= { platforms: [], hazards: [], rails: [], pads: [] }
      buckets[i][list].push(id)
    }
  }
  for (const p of l.platforms) add('platforms', p.id, p.z0, p.z1)
  for (const h of l.hazards) {
    const reach = h.kind === 'spinner' ? h.hx : h.hz
    add('hazards', h.id, h.z - reach, h.z + reach)
  }
  for (const r of l.rails) add('rails', r.id, r.z0, r.z1)
  for (const p of l.pads) add('pads', p.id, p.z - p.len / 2, p.z + p.len / 2)
  return { buckets, offset }
}

const EMPTY: Bucket = { platforms: [], hazards: [], rails: [], pads: [] }
export function bucketAt(l: Level, z: number): Bucket {
  return l.index.buckets[Math.floor((z + l.index.offset) / BUCKET)] ?? EMPTY
}

export const LEVEL: Level = build()
