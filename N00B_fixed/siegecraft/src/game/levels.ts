/**
 * Pure level data: the two castles as lists of physical pieces. No three.js or Rapier here, so
 * tests can build and simulate the same layouts headlessly.
 *
 * Coordinates: the catapult stands at the origin facing −Z; y = 0 is the ground. `pos` is the
 * piece centre, `size` the full extent (for cylinders/cones: [diameter, height, diameter]).
 * Pieces are placed touching exactly; structures start asleep and only wake when struck.
 */
export type PieceKind = 'wood' | 'stone' | 'powder' | 'guard'
export type PieceShape = 'box' | 'cyl' | 'cone'
export type PieceStyle = 'post' | 'beam' | 'plank' | 'crate' | 'log' | 'roof' | 'block' | 'merlon' | 'gate' | 'barrel' | 'guard' | 'captain'
export type PieceSpec = {
  kind: PieceKind
  shape: PieceShape
  style: PieceStyle
  pos: [number, number, number]
  size: [number, number, number]
  rotY?: number
  /** Decorative flag mounted on this piece. */
  flag?: boolean
  /** Torch mounted on this piece (stone keep ambience). */
  torch?: boolean
}

export type LevelId = 'timber' | 'keep'
export type Theme = 'sunset' | 'dusk'

export type LevelDef = {
  id: LevelId
  index: number
  ammo: number
  theme: Theme
  /** Castle centre on the ground, used by cameras. */
  center: [number, number, number]
  /** Score thresholds for 2 and 3 stars (1 star = cleared). */
  stars: [number, number]
  pieces: PieceSpec[]
}

const GUARD: [number, number, number] = [0.5, 0.9, 0.42]
const BARREL: [number, number, number] = [0.74, 0.88, 0.74]

function guard(x: number, floorY: number, z: number, rotY = 0, style: PieceStyle = 'guard'): PieceSpec {
  return { kind: 'guard', shape: 'box', style, pos: [x, floorY + GUARD[1] / 2, z], size: GUARD, rotY }
}

function barrel(x: number, floorY: number, z: number): PieceSpec {
  return { kind: 'powder', shape: 'cyl', style: 'barrel', pos: [x, floorY + BARREL[1] / 2, z], size: BARREL }
}

function box(kind: PieceKind, style: PieceStyle, x: number, y: number, z: number, sx: number, sy: number, sz: number, extra: Partial<PieceSpec> = {}): PieceSpec {
  return { kind, shape: 'box', style, pos: [x, y, z], size: [sx, sy, sz], ...extra }
}

/** Level 1 — The Timber Watchtower: tall, light, brittle, with powder stored inside. */
function timber(): LevelDef {
  const cx = 0
  const cz = -34
  const p: PieceSpec[] = []
  const half = 1.32
  let y = 0
  for (let storey = 0; storey < 3; storey += 1) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(box('wood', 'post', cx + sx * half, y + 1.0, cz + sz * half, 0.36, 2.0, 0.36))
    for (const sx of [-1, 1]) p.push(box('wood', 'beam', cx + sx * half, y + 2.0 + 0.12, cz, 0.42, 0.24, 3.04))
    for (const z of [-1.02, 0, 1.02]) p.push(box('wood', 'plank', cx, y + 2.24 + 0.12, cz + z, 3.2, 0.24, 1.0))
    y += 2.48
    if (storey === 0) {
      p.push(guard(cx - 0.4, y, cz + 0.1, 0.2))
      p.push(barrel(cx + 0.75, y, cz - 0.55))
    } else if (storey === 1) {
      p.push(guard(cx + 0.35, y, cz + 0.2, -0.3))
    }
  }
  // Lookout with roof on the top floor.
  p.push(guard(cx, y, cz, 0, 'captain'))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(box('wood', 'post', cx + sx * 1.22, y + 0.72, cz + sz * 1.22, 0.3, 1.44, 0.3))
  for (const sx of [-1, 1]) p.push(box('wood', 'beam', cx + sx * 1.22, y + 1.44 + 0.11, cz, 0.36, 0.22, 2.8))
  p.push({ kind: 'wood', shape: 'cone', style: 'roof', pos: [cx, y + 1.66 + 0.9, cz], size: [4.3, 1.8, 4.3], rotY: Math.PI / 4, flag: true })
  // Ground floor powder store.
  p.push(barrel(cx - 0.55, 0, cz - 0.5))
  // Palisade in front of the tower.
  for (let i = 0; i < 10; i += 1) p.push(box('wood', 'log', cx - 2.7 + i * 0.6, 0.95, cz + 3.7, 0.42, 1.9, 0.42, { rotY: (i % 3) * 0.3 }))
  // Scaffold lookout to the right: two crate stacks, a plank and a guard.
  const sxp = cx + 6.6
  for (const dx of [-0.95, 0.95]) {
    p.push(box('wood', 'crate', sxp + dx, 0.5, cz + 0.6, 1.0, 1.0, 1.0))
    p.push(box('wood', 'crate', sxp + dx, 1.5, cz + 0.6, 1.0, 1.0, 1.0, { rotY: 0.08 }))
  }
  p.push(box('wood', 'plank', sxp, 2.0 + 0.11, cz + 0.6, 3.0, 0.22, 1.0))
  p.push(guard(sxp, 2.22, cz + 0.6, -0.4))
  p.push(barrel(sxp, 0, cz + 0.6))
  // Storehouse to the left: crate pyramid with powder.
  const lx = cx - 6.6
  for (let i = 0; i < 3; i += 1) p.push(box('wood', 'crate', lx - 1.05 + i * 1.05, 0.5, cz - 0.4, 1.0, 1.0, 1.0))
  for (let i = 0; i < 2; i += 1) p.push(box('wood', 'crate', lx - 0.525 + i * 1.05, 1.5, cz - 0.4, 1.0, 1.0, 1.0))
  p.push(barrel(lx, 2.0, cz - 0.4))
  p.push(barrel(lx + 1.9, 0, cz + 0.9))
  return { id: 'timber', index: 0, ammo: 5, theme: 'sunset', center: [cx, 3.6, cz], stars: [12000, 18500], pieces: p }
}

/** Hollow square ring of stone blocks with alternating orientation per layer (interlocked corners). */
function ring(p: PieceSpec[], cx: number, cz: number, outer: number, t: number, layerH: number, layers: number, y0: number, kind: PieceKind = 'stone'): number {
  const off = outer / 2 - t / 2
  const inner = outer - 2 * t
  let y = y0
  for (let l = 0; l < layers; l += 1) {
    const typeA = (layers - 1 - l) % 2 === 0 // top layer is always type A
    const cy = y + layerH / 2
    if (typeA) {
      for (const s of [-1, 1]) p.push(box(kind, 'block', cx, cy, cz + s * off, outer, layerH, t))
      for (const s of [-1, 1]) p.push(box(kind, 'block', cx + s * off, cy, cz, t, layerH, inner))
    } else {
      for (const s of [-1, 1]) p.push(box(kind, 'block', cx + s * off, cy, cz, t, layerH, outer))
      for (const s of [-1, 1]) p.push(box(kind, 'block', cx, cy, cz + s * off, inner, layerH, t))
    }
    y += layerH
  }
  return y
}

/** Level 2 — The Stone Keep: heavy walls, towers and a two-tier keep with a powder cellar. */
function keep(): LevelDef {
  const cx = 0
  const cz = -40
  const p: PieceSpec[] = []
  // Curtain wall in running bond with a wooden gate and merlons.
  const wz = cz + 5.2
  const bw = 1.2
  const bh = 0.7
  const bd = 0.8
  for (let row = 0; row < 4; row += 1) {
    const y = row * bh + bh / 2
    if (row % 2 === 0) {
      for (let i = 0; i < 7; i += 1) {
        const x = cx - 3.6 + i * bw
        const gate = row === 0 && i === 3
        p.push(box(gate ? 'wood' : 'stone', gate ? 'gate' : 'block', x, y, wz, bw, bh, bd))
      }
    } else {
      for (const s of [-1, 1]) p.push(box('stone', 'block', cx + s * 3.9, y, wz, 0.6, bh, bd))
      for (let i = 0; i < 6; i += 1) {
        const x = cx - 3.0 + i * bw
        const gate = row === 1 && (i === 2 || i === 3)
        p.push(box(gate ? 'wood' : 'stone', gate ? 'gate' : 'block', x, y, wz, bw, bh, bd))
      }
    }
  }
  for (let i = 0; i < 7; i += 1) p.push(box('stone', 'merlon', cx - 3.9 + i * 1.3, 4 * bh + 0.25, wz, 0.6, 0.5, bd, { torch: i === 1 || i === 5 }))
  // Wall-walk scaffold behind the curtain: the sentry peeks over the merlons.
  const scx = cx + 2.0
  const scz = wz - 1.35
  for (const dx of [-0.9, 0.9]) {
    p.push(box('wood', 'crate', scx + dx, 0.5, scz, 0.9, 1.0, 0.9))
    p.push(box('wood', 'crate', scx + dx, 1.5, scz, 0.9, 1.0, 0.9, { rotY: 0.06 }))
  }
  p.push(box('wood', 'plank', scx, 2.11, scz, 2.8, 0.22, 0.9))
  p.push(guard(scx, 2.22, scz, 0.3))
  p.push(barrel(scx, 0, scz))
  // Keep: lower ring, wooden floor, upper ring, top floor, corner merlons.
  const kz = cz - 0.6
  let top = ring(p, cx, kz, 4.2, 0.7, 0.7, 5, 0)
  p.push(barrel(cx - 0.75, 0, kz + 0.4))
  p.push(barrel(cx + 0.7, 0, kz - 0.5))
  for (const z of [-1.05, -0.35, 0.35, 1.05]) p.push(box('wood', 'plank', cx, top + 0.12, kz + z, 4.2, 0.24, 0.7))
  const ledge = top
  top += 0.24
  // Sentry on the front ledge of the lower keep, exposed to direct fire.
  p.push(guard(cx - 0.5, ledge, kz + 1.8, -0.2))
  top = ring(p, cx, kz, 3.0, 0.6, 0.6, 3, top)
  for (const z of [-0.6, 0, 0.6]) p.push(box('wood', 'plank', cx, top + 0.11, kz + z, 3.0, 0.22, 0.6))
  const floor = top + 0.22
  p.push(guard(cx, floor, kz, 0, 'captain'))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(box('stone', 'merlon', cx + sx * 1.2, top + 0.2, kz + sz * 1.2, 0.6, 0.4, 0.6, { flag: sx === 1 && sz === -1 }))
  // Flanking towers with powder at the base.
  for (const s of [-1, 1]) {
    const tx = cx + s * 6.3
    const tz = cz + 3.6
    const tt = ring(p, tx, tz, 2.4, 0.6, 0.6, 7, 0)
    for (const z of [-0.3, 0.3]) p.push(box('wood', 'plank', tx, tt + 0.1, tz + z, 2.4, 0.2, 0.6))
    p.push(guard(tx, tt + 0.2, tz, s * 0.4))
    for (const mx of [-1, 1]) for (const mz of [-1, 1]) p.push(box('stone', 'merlon', tx + mx * 0.95, tt + 0.225, tz + mz * 0.95, 0.5, 0.45, 0.5, { flag: mx === 1 && mz === -1 }))
    p.push(barrel(tx, 0, tz))
  }
  return { id: 'keep', index: 1, ammo: 6, theme: 'dusk', center: [cx, 3.2, cz], stars: [11000, 17000], pieces: p }
}

export const LEVELS: LevelDef[] = [timber(), keep()]

export function levelById(id: string): LevelDef {
  return LEVELS.find(l => l.id === id) ?? LEVELS[0]
}

export function guardCount(level: LevelDef): number {
  return level.pieces.filter(p => p.kind === 'guard').length
}
