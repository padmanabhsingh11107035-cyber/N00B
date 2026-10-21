import { LEVEL_FLOORS, STAGE_FLOORS } from '../../server/helix-rules.mjs'

/** Every floor is a ring split into this many equal slots. */
export const SLOTS = 16
export const SLOT_ANGLE = (Math.PI * 2) / SLOTS

export type SlotKind = 'safe' | 'gap' | 'danger' | 'blink'

/** A danger arc that orbits the floor at its own speed. Angles are in the floor's local frame. */
export type Sweeper = { start: number; width: number; speed: number }

export type FloorSpec = {
  index: number
  stage: number
  /** Rotation of slot 0 in the tower frame (radians). */
  offset: number
  slots: SlotKind[]
  sweeper?: Sweeper
  /** Blink hazards are active while ((t + phase) mod period) < period · duty. */
  blink?: { period: number; phase: number; duty: number }
}

/** The floors built so far: level 1 first, and every later level is added by `extendTower` as the ball nears it. */
export type Tower = { seed: number; floors: FloorSpec[]; levels: number }

/** Small fast deterministic PRNG (mulberry32). */
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

/** FNV-1a string hash → 32-bit seed. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export const dailySeed = (day: string) => hashSeed(`helix-drop/daily/${day}`)

/** Stage (0-5) of a floor; the six stages repeat in every level. */
export function stageOf(floor: number): number {
  let left = floor % LEVEL_FLOORS
  for (let s = 0; s < STAGE_FLOORS.length; s += 1) {
    if (left < STAGE_FLOORS[s]) return s
    left -= STAGE_FLOORS[s]
  }
  return STAGE_FLOORS.length - 1
}

/** True when `floor` is the last floor of its stage. */
export function isStageEnd(floor: number): boolean {
  const local = floor % LEVEL_FLOORS
  let acc = 0
  for (const f of STAGE_FLOORS) {
    acc += f
    if (local === acc - 1) return true
  }
  return false
}

/** Level (1, 2, 3 …) a floor belongs to. */
export const levelOf = (floor: number) => Math.floor(floor / LEVEL_FLOORS) + 1

export const wrapAngle = (a: number) => {
  const t = a % (Math.PI * 2)
  return t < 0 ? t + Math.PI * 2 : t
}

/**
 * Difficulty knobs by floor. `d` rises 0 → 1 across a level; stages add discrete steps so each
 * theme change also feels like a new challenge. Still fair for people (a gap is never narrower than 2 slots and the
 * ball's landing spot is always safe), but it asks for real steering: narrower gaps, hazards from the second stage,
 * blinking plates and sweepers earlier, and fewer straight drops. Each new level is harder than the one before, up to a ceiling.
 */
function knobs(local: number, stage: number, level: number) {
  const d = local / (LEVEL_FLOORS - 1)
  const lv = Math.min(level - 1, 8)
  return {
    gap: local < 8 ? 4 : stage <= 1 ? 3 : stage === 2 ? (local % 3 === 0 ? 2 : 3) : stage === 3 ? (local % 2 === 0 ? 2 : 3) : local % 3 === 0 || lv >= 4 ? 2 : 3,
    dangerMin: local < 4 ? 0 : [0, 0, 1, 1, 1, 2][stage],
    dangerMax: local < 4 ? 0 : [1, 2, 2, 3, 3, 3][stage] + (lv >= 2 ? 1 : 0),
    blinkChance: stage >= 2 ? 0.1 + 0.05 * (stage - 2) + 0.03 * lv : 0,
    sweeperChance: stage >= 3 ? 0.1 + 0.06 * (stage - 3) + 0.03 * lv : 0,
    /** Chance that a floor keeps its hazards off the short way from where the ball lands to the gap. */
    guard: stage <= 1 ? 0.85 : 0.55,
    blinkPeriod: 2.2 - 0.5 * d,
    /** Chance that the next floor's gap sits right under this one: a "chute" for chains/smash. */
    chute: 0.38 - 0.14 * d,
  }
}

/** The 90 floors of one level, continuing from the floor above (`prev`, none for level 1). */
function generateLevel(seed: number, level: number, prev: FloorSpec | null): FloorSpec[] {
  const r = rng(level === 1 ? seed : (seed ^ Math.imul(level, 0x9e3779b1)) >>> 0)
  const base = (level - 1) * LEVEL_FLOORS
  const floors: FloorSpec[] = []
  // Where the gap above sat (tower frame); the first floor of level 1 has a gap a quarter turn away so the first input already scores.
  let prevGapCenter = prev ? prev.offset + (prev.slots.filter(k => k === 'gap').length / 2) * SLOT_ANGLE : 0
  for (let li = 0; li < LEVEL_FLOORS; li += 1) {
    const i = base + li
    const stage = stageOf(li)
    const k = knobs(li, stage, level)
    const slots: SlotKind[] = new Array(SLOTS).fill('safe')
    // Gap slots start at local slot 0.
    for (let s = 0; s < k.gap; s += 1) slots[s] = 'gap'
    // Where to put this floor's gap (tower frame): a short turn from the previous one (never more than about a third of a lap),
    // or directly underneath it for a chute.
    let gapCenter: number
    if (i === 0) gapCenter = Math.PI / 2
    else if (r() < k.chute) gapCenter = prevGapCenter + (r() - 0.5) * SLOT_ANGLE * 1.2
    else gapCenter = prevGapCenter + (r() < 0.5 ? -1 : 1) * (Math.PI * (0.22 + r() * 0.4))
    const offset = wrapAngle(gapCenter - (k.gap * SLOT_ANGLE) / 2)
    // Slots directly beneath the previous floor's gap are the landing zone: keep them safe so a
    // clean drop never lands on a hazard the player could not see.
    const above = li === 0 ? prev : floors[li - 1]
    const landing = new Set<number>()
    if (above) {
      const prevGap = above.slots.map((s, j) => (s === 'gap' ? j : -1)).filter(j => j >= 0)
      for (const j of prevGap) {
        const a = wrapAngle(above.offset + (j + 0.5) * SLOT_ANGLE - offset)
        landing.add(Math.floor(a / SLOT_ANGLE) % SLOTS)
      }
    }
    // The short way from the landing zone to the gap is where the ball usually turns: most floors keep their hazards off it.
    const corridor = new Set<number>()
    if (i > 0 && r() < k.guard) {
      const way = angleDiff(gapCenter, prevGapCenter)
      for (let s = 0; s < SLOTS; s += 1) {
        const along = angleDiff(offset + (s + 0.5) * SLOT_ANGLE, prevGapCenter)
        if (Math.sign(along) === Math.sign(way) && Math.abs(along) <= Math.abs(way) + SLOT_ANGLE * 0.75) corridor.add(s)
      }
    }
    const free = () => {
      const out: number[] = []
      for (let s = k.gap + 1; s < SLOTS - 1; s += 1) if (slots[s] === 'safe' && !landing.has(s) && !corridor.has(s)) out.push(s)
      // Late stages may put a hazard right beside the gap (never in the first levels).
      if (stage >= 4 && level >= 3) for (const s of [k.gap, SLOTS - 1]) if (slots[s] === 'safe' && !landing.has(s) && !corridor.has(s)) out.push(s)
      return out
    }
    const hazards = () => slots.filter(k => k === 'danger' || k === 'blink').length
    const dangers = k.dangerMin + Math.floor(r() * (k.dangerMax - k.dangerMin + 1))
    for (let n = 0; n < dangers; n += 1) {
      const options = free()
      if (!options.length || hazards() >= 4) break
      const s = options[Math.floor(r() * options.length)]
      slots[s] = 'danger'
      // Sometimes grow into a two-slot block for readable larger hazards.
      if (stage >= 3 && hazards() < 4 && r() < 0.25 && s + 1 < SLOTS && slots[s + 1] === 'safe' && !landing.has(s + 1) && s + 1 > k.gap) slots[s + 1] = 'danger'
    }
    let blink: FloorSpec['blink']
    if (hazards() < 4 && r() < k.blinkChance) {
      const options = free()
      for (let n = 0; n < 1 && options.length; n += 1) {
        const pick = options.splice(Math.floor(r() * options.length), 1)[0]
        slots[pick] = 'blink'
      }
      blink = { period: k.blinkPeriod, phase: r() * k.blinkPeriod, duty: 0.45 }
    }
    let sweeper: Sweeper | undefined
    if (r() < k.sweeperChance) {
      const speed = (0.5 + r() * 0.5 + stage * 0.04) * (r() < 0.5 ? -1 : 1)
      sweeper = { start: r() * Math.PI * 2, width: SLOT_ANGLE, speed }
    }
    floors.push({ index: i, stage, offset, slots, sweeper, blink })
    prevGapCenter = gapCenter
  }
  return floors
}

/** A new tower: level 1. */
export function generateTower(seed: number): Tower {
  return { seed, floors: generateLevel(seed, 1, null), levels: 1 }
}

/** Add the next level below the floors built so far (the same tower for the same seed, whoever plays). */
export function extendTower(tower: Tower): void {
  tower.levels += 1
  tower.floors.push(...generateLevel(tower.seed, tower.levels, tower.floors[tower.floors.length - 1]))
}

/** Slot under a tower-frame angle. */
export function slotAt(floor: FloorSpec, towerAngle: number): number {
  return Math.floor(wrapAngle(towerAngle - floor.offset) / SLOT_ANGLE) % SLOTS
}

export function blinkActive(floor: FloorSpec, time: number): boolean {
  if (!floor.blink) return false
  const { period, phase, duty } = floor.blink
  return ((time + phase) % period) / period < duty
}

/** Sweeper arc start (tower frame) at `time`. */
export function sweeperStart(floor: FloorSpec, time: number): number {
  const s = floor.sweeper!
  return wrapAngle(floor.offset + s.start + s.speed * time)
}

/** Signed smallest difference a − b in (−π, π]. */
export function angleDiff(a: number, b: number): number {
  let d = wrapAngle(a - b)
  if (d > Math.PI) d -= Math.PI * 2
  return d
}

export type Probe = { kind: SlotKind | 'sweeper'; /** Distance (rad) from the probe to the nearest active hazard edge. */ hazardDistance: number }

/**
 * What the ball touches on `floor` at tower-frame angle `angle` and run time `time`. Pure, shared by
 * gameplay and tests.
 */
export function probe(floor: FloorSpec, angle: number, time: number): Probe {
  const slot = slotAt(floor, angle)
  let kind: Probe['kind'] = floor.slots[slot]
  const blinkOn = blinkActive(floor, time)
  if (kind === 'blink') kind = blinkOn ? 'blink' : 'safe'
  let nearest = Infinity
  // Distance to hazard slot edges.
  for (let s = 0; s < SLOTS; s += 1) {
    const k = floor.slots[s]
    if (k !== 'danger' && !(k === 'blink' && blinkOn)) continue
    const a0 = floor.offset + s * SLOT_ANGLE
    const a1 = a0 + SLOT_ANGLE
    const inside = wrapAngle(angle - a0) < SLOT_ANGLE
    if (inside) nearest = 0
    else nearest = Math.min(nearest, Math.abs(angleDiff(angle, a0)), Math.abs(angleDiff(angle, a1)))
  }
  if (floor.sweeper) {
    const a0 = sweeperStart(floor, time)
    const w = floor.sweeper.width
    if (wrapAngle(angle - a0) < w) {
      if (kind !== 'gap') kind = 'sweeper'
      nearest = 0
    } else nearest = Math.min(nearest, Math.abs(angleDiff(angle, a0)), Math.abs(angleDiff(angle, a0 + w)))
  }
  return { kind, hazardDistance: nearest }
}
