import { fbm, rng, smoothstep } from './noise'

/**
 * The Emberwild Basin: an analytic height field so gameplay (hunter, monster, camera, props)
 * samples the exact same ground the mesh is built from. Pure and deterministic; unit tested.
 */
export const WATER_LEVEL = -0.4
export const WORLD = {
  /** Terrain mesh extent (square, centred on the origin). */
  size: 360,
  segments: 240,
  /** Hunter can roam inside this radius; the rim cliffs rise beyond it. */
  arena: 84,
  /** The monster stays inside this radius (it slams into the rim when ridden past it). */
  monsterArena: 72,
}
export const LAKE = { x: 44, z: -50, r: 21 }
export const CAMP = { x: 0, z: 72, height: 1.8 }

export type ObstacleKind = 'spire' | 'boulder' | 'tree'
export type Obstacle = { x: number; z: number; r: number; h: number; kind: ObstacleKind }

/** Towering rock spires: solid cover, and the targets for ridden wall slams. */
export const SPIRES: Obstacle[] = [
  { x: -50, z: 12, r: 5.2, h: 17, kind: 'spire' },
  { x: -24, z: 48, r: 4.6, h: 13, kind: 'spire' },
  { x: 32, z: 38, r: 5.0, h: 19, kind: 'spire' },
  { x: 60, z: 0, r: 4.4, h: 12, kind: 'spire' },
  { x: -36, z: -44, r: 5.4, h: 15, kind: 'spire' },
  { x: 4, z: -58, r: 4.2, h: 11, kind: 'spire' },
]

function baseHeight(x: number, z: number): number {
  const r = Math.hypot(x, z)
  const calm = 0.45 + 0.55 * smoothstep(10, 60, r)
  let h = fbm(x * 0.016, z * 0.016, 4, 3) * 3.4 * calm + fbm(x * 0.06, z * 0.06, 2, 9) * 0.5 * calm
  h += (r / 84) ** 2 * 2.4
  const edge = r + fbm(x * 0.025, z * 0.025, 3, 5) * 12
  const rim = smoothstep(80, 122, edge)
  const ridge = 1 - Math.abs(fbm(x * 0.035, z * 0.035, 4, 11))
  h += rim * (24 + ridge * 26 + fbm(x * 0.008, z * 0.008, 2, 21) * 12)
  return h
}

export function heightAt(x: number, z: number): number {
  let h = baseHeight(x, z)
  const dc = Math.hypot(x - CAMP.x, z - CAMP.z)
  if (dc < 18) {
    const k = 1 - smoothstep(8, 18, dc)
    h += (CAMP.height - h) * k
  }
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z) / LAKE.r
  if (dl < 1.4) {
    const k = 1 - smoothstep(0.3, 1.25, dl)
    h += (WATER_LEVEL - 1.25 - h) * k
  }
  return h
}

/** Surface normal from central differences. */
export function normalAt(x: number, z: number, out: { x: number; y: number; z: number } = { x: 0, y: 1, z: 0 }) {
  const e = 0.6
  const dx = heightAt(x + e, z) - heightAt(x - e, z)
  const dz = heightAt(x, z + e) - heightAt(x, z - e)
  const len = Math.hypot(dx, 2 * e, dz)
  out.x = -dx / len
  out.y = (2 * e) / len
  out.z = -dz / len
  return out
}

export function waterDepth(x: number, z: number): number {
  return WATER_LEVEL - heightAt(x, z)
}

/** Boulders and meadow trees, placed deterministically around the spires, lake and camp. */
function planObstacles(): Obstacle[] {
  const out: Obstacle[] = [...SPIRES]
  const random = rng(4242)
  const clear = (x: number, z: number, r: number) => {
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + r + 2) return false
    if (Math.hypot(x - CAMP.x, z - CAMP.z) < 14 + r) return false
    if (Math.hypot(x, z) < 16) return false
    return out.every(o => Math.hypot(o.x - x, o.z - z) > o.r + r + 5)
  }
  let tries = 0
  let boulders = 0
  while (boulders < 16 && tries < 600) {
    tries += 1
    const a = random() * Math.PI * 2
    const d = 18 + random() * 60
    const x = Math.cos(a) * d
    const z = Math.sin(a) * d
    const r = 1.1 + random() * 1.6
    if (!clear(x, z, r)) continue
    out.push({ x, z, r, h: r * 1.3, kind: 'boulder' })
    boulders += 1
  }
  // Groves: clusters of trees at the meadow edge.
  const groves = [
    { x: -62, z: -18, n: 7 },
    { x: 56, z: 32, n: 6 },
    { x: -44, z: 62, n: 6 },
    { x: 28, z: -72, n: 5 },
    { x: 70, z: -24, n: 4 },
  ]
  for (const g of groves) {
    let placed = 0
    for (let i = 0; i < 60 && placed < g.n; i += 1) {
      const x = g.x + (random() - 0.5) * 16
      const z = g.z + (random() - 0.5) * 16
      if (Math.hypot(x, z) > WORLD.arena - 2) continue
      if (!clear(x, z, 0.3)) continue
      out.push({ x, z, r: 0.7, h: 9, kind: 'tree' })
      placed += 1
    }
  }
  return out
}

export const OBSTACLES: Obstacle[] = planObstacles()

/** Push a circle of radius `r` out of every obstacle. Mutates and returns `p`. */
export function resolveObstacles<T extends { x: number; z: number }>(p: T, r: number, list: Obstacle[] = OBSTACLES): T {
  for (const o of list) {
    const dx = p.x - o.x
    const dz = p.z - o.z
    const min = o.r + r
    const d2 = dx * dx + dz * dz
    if (d2 < min * min && d2 > 1e-8) {
      const d = Math.sqrt(d2)
      p.x = o.x + (dx / d) * min
      p.z = o.z + (dz / d) * min
    }
  }
  return p
}

/** Keep a point inside a radius around the basin centre. */
export function clampToArena<T extends { x: number; z: number }>(p: T, radius: number): T {
  const d = Math.hypot(p.x, p.z)
  if (d > radius) {
    p.x *= radius / d
    p.z *= radius / d
  }
  return p
}

/** Top and base of the waterfall cascading into the lake from the rim behind it. */
export function waterfallLine(): { top: { x: number; z: number; y: number }; bottom: { x: number; z: number; y: number } } {
  const len = Math.hypot(LAKE.x, LAKE.z)
  const dx = LAKE.x / len
  const dz = LAKE.z / len
  let bottom = { x: LAKE.x, z: LAKE.z, y: WATER_LEVEL }
  let top = bottom
  for (let t = LAKE.r * 0.5; t < LAKE.r * 3; t += 0.5) {
    const x = LAKE.x + dx * t
    const z = LAKE.z + dz * t
    const h = heightAt(x, z)
    if (h < WATER_LEVEL + 0.2) bottom = { x, z, y: WATER_LEVEL }
    if (h > WATER_LEVEL + 13) {
      top = { x, z, y: h }
      break
    }
  }
  return { top, bottom }
}
