/** Deterministic noise helpers: the valley is identical on every load and in tests. */

/** Mulberry32: tiny seeded RNG returning [0, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed + 1, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** Smooth value noise in [-1, 1]. */
export function valueNoise(x: number, z: number, seed = 0): number {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = x - ix
  const fz = z - iz
  const u = fx * fx * (3 - 2 * fx)
  const v = fz * fz * (3 - 2 * fz)
  const a = hash(ix, iz, seed)
  const b = hash(ix + 1, iz, seed)
  const c = hash(ix, iz + 1, seed)
  const d = hash(ix + 1, iz + 1, seed)
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1
}

/** Fractal Brownian motion in roughly [-1, 1]. */
export function fbm(x: number, z: number, octaves = 4, seed = 0): number {
  let sum = 0
  let amp = 0.5
  let freq = 1
  let norm = 0
  for (let i = 0; i < octaves; i += 1) {
    sum += amp * valueNoise(x * freq, z * freq, seed + i * 17)
    norm += amp
    amp *= 0.5
    freq *= 2.03
  }
  return sum / norm
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/** Shortest signed angle from `a` to `b`. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

export function dampAngle(from: number, to: number, lambda: number, dt: number): number {
  return from + angleDelta(from, to) * (1 - Math.exp(-lambda * dt))
}

export function damp(from: number, to: number, lambda: number, dt: number): number {
  return from + (to - from) * (1 - Math.exp(-lambda * dt))
}
