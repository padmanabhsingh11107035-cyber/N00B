/**
 * Deterministic random numbers. Every procedural decision in a run flows from one 32-bit seed, so
 * the same seed always rebuilds the same floor (replays, bug reports, tests).
 */
export type Rng = {
  /** Uniform float in [0, 1). */
  (): number
  int(min: number, max: number): number
  pick<T>(items: readonly T[]): T
  chance(p: number): boolean
  shuffle<T>(items: T[]): T[]
  weighted<T extends string>(weights: Partial<Record<T, number>>): T
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  const next = (() => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }) as Rng
  next.int = (min, max) => min + Math.floor(next() * (max - min + 1))
  next.pick = items => items[Math.floor(next() * items.length)]
  next.chance = p => next() < p
  next.shuffle = items => {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(next() * (i + 1))
      ;[items[i], items[j]] = [items[j], items[i]]
    }
    return items
  }
  next.weighted = weights => {
    const entries = Object.entries(weights) as [string, number][]
    const total = entries.reduce((n, [, w]) => n + Math.max(0, w), 0)
    let r = next() * total
    for (const [k, w] of entries) {
      r -= Math.max(0, w)
      if (r < 0) return k as never
    }
    return entries[entries.length - 1][0] as never
  }
  return next
}

/** Mix a base seed with a salt (attempt number, room id) into a new well-distributed seed. */
export function hashSeed(seed: number, salt: number): number {
  let h = (seed ^ Math.imul(salt + 0x9e3779b9, 0x85ebca6b)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d)
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b)
  return (h ^ (h >>> 16)) >>> 0
}

/** Human-friendly seeds: 6-digit numbers are easy to share and type. */
export function randomSeed(): number {
  return 100000 + Math.floor(Math.random() * 900000)
}

export function parseSeed(text: string): number | null {
  const t = text.trim()
  if (!t) return null
  if (/^\d{1,9}$/.test(t)) return Number(t)
  // Any other text hashes to a stable seed, so "gym-day" is a valid seed too.
  let h = 2166136261
  for (let i = 0; i < t.length; i += 1) h = Math.imul(h ^ t.charCodeAt(i), 16777619)
  return (h >>> 0) % 1_000_000_000
}
