import { CONFIG } from './config'

/**
 * Pure hunt rules: monster health, faints, the quest clock, hunter vitals, damage formulas and
 * the results rank. No three.js and no DOM — the scene reports events, tests cover every rule.
 */
export type HuntPhase = 'hunting' | 'won' | 'lost'
export type LoseReason = 'faints' | 'time'

export type HuntState = {
  unranked: boolean
  phase: HuntPhase
  loseReason?: LoseReason
  quarry: string
  elapsed: number
  timeLimit: number
  faints: number
  maxFaints: number
  monsterHp: number
  monsterMax: number
  damageDealt: number
  hits: number
  vitalStrikes: number
  biggestHit: number
  partsBroken: string[]
  totalParts: number
  potionsUsed: number
  damageTaken: number
  wallSlams: number
  mounts: number
}

export function createHunt(quarry: string, monsterMax: number, totalParts: number, rules = CONFIG): HuntState {
  return {
    unranked: false,
    phase: 'hunting',
    quarry,
    elapsed: 0,
    timeLimit: rules.hunt.timeLimit,
    faints: 0,
    maxFaints: rules.hunt.maxFaints,
    monsterHp: monsterMax,
    monsterMax,
    damageDealt: 0,
    hits: 0,
    vitalStrikes: 0,
    biggestHit: 0,
    partsBroken: [],
    totalParts,
    potionsUsed: 0,
    damageTaken: 0,
    wallSlams: 0,
    mounts: 0,
  }
}

export function tickHunt(s: HuntState, dt: number): HuntState {
  if (s.phase !== 'hunting') return s
  const elapsed = s.elapsed + dt
  if (elapsed >= s.timeLimit) return { ...s, elapsed: s.timeLimit, phase: 'lost', loseReason: 'time' }
  return { ...s, elapsed }
}

/** Apply hunter damage to the monster. `vital` counts the hit as a vital strike. */
export function dealDamage(s: HuntState, amount: number, vital = false): { state: HuntState; killed: boolean } {
  if (s.phase !== 'hunting' || amount <= 0) return { state: s, killed: false }
  const dealt = Math.min(amount, s.monsterHp)
  const monsterHp = s.monsterHp - dealt
  const next: HuntState = {
    ...s,
    monsterHp,
    damageDealt: s.damageDealt + dealt,
    hits: s.hits + 1,
    vitalStrikes: s.vitalStrikes + (vital ? 1 : 0),
    biggestHit: Math.max(s.biggestHit, amount),
  }
  if (monsterHp <= 0) return { state: { ...next, monsterHp: 0, phase: 'won' }, killed: true }
  return { state: next, killed: false }
}

export function breakPart(s: HuntState, id: string): HuntState {
  if (s.partsBroken.includes(id)) return s
  return { ...s, partsBroken: [...s.partsBroken, id] }
}

export function recordFaint(s: HuntState): HuntState {
  if (s.phase !== 'hunting') return s
  const faints = s.faints + 1
  if (faints >= s.maxFaints) return { ...s, faints, phase: 'lost', loseReason: 'faints' }
  return { ...s, faints }
}

export type Rank = 'S' | 'A' | 'B' | 'C' | '-'

/** Results rank: speed, survival and vital point breaks. */
export function rankHunt(s: HuntState): Rank {
  if (s.phase !== 'won') return '-'
  let points = 0
  const t = s.elapsed / s.timeLimit
  points += t < 0.25 ? 3 : t < 0.4 ? 2 : t < 0.6 ? 1 : 0
  points += s.faints === 0 ? 2 : s.faints === 1 ? 1 : 0
  points += s.partsBroken.length >= s.totalParts ? 2 : s.partsBroken.length >= 2 ? 1 : 0
  return points >= 6 ? 'S' : points >= 4 ? 'A' : points >= 2 ? 'B' : 'C'
}

export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

// ─── hunter vitals ─────────────────────────────────────────────────────────

export type Vitals = {
  hp: number
  /** Recoverable health: part of each hit slowly regenerates (shown red on the bar). */
  red: number
  max: number
  stamina: number
  maxStamina: number
  /** Seconds until stamina starts regenerating again. */
  staminaDelay: number
}

export function createVitals(rules = CONFIG): Vitals {
  return { hp: rules.hunter.maxHealth, red: 0, max: rules.hunter.maxHealth, stamina: rules.hunter.maxStamina, maxStamina: rules.hunter.maxStamina, staminaDelay: 0 }
}

export function takeHit(v: Vitals, damage: number): Vitals {
  const hp = Math.max(0, v.hp - damage)
  const red = hp <= 0 ? 0 : Math.min(v.red + damage * 0.5, v.max - hp)
  return { ...v, hp, red }
}

export function regenRed(v: Vitals, dt: number, rate: number): Vitals {
  if (v.red <= 0 || v.hp <= 0) return v
  const gain = Math.min(v.red, rate * dt)
  return { ...v, hp: Math.min(v.max, v.hp + gain), red: v.red - gain }
}

export function heal(v: Vitals, amount: number): Vitals {
  if (v.hp <= 0) return v
  const hp = Math.min(v.max, v.hp + amount)
  return { ...v, hp, red: Math.max(0, Math.min(v.red, v.max - hp)) }
}

/** Spend stamina. Actions need at least a sliver; returns null when too exhausted. */
export function spendStamina(v: Vitals, cost: number, delay = CONFIG.hunter.staminaDelay): Vitals | null {
  if (v.stamina < Math.min(cost, 8)) return null
  return { ...v, stamina: Math.max(0, v.stamina - cost), staminaDelay: delay }
}

export function drainStamina(v: Vitals, perSecond: number, dt: number, delay = CONFIG.hunter.staminaDelay): Vitals {
  return { ...v, stamina: Math.max(0, v.stamina - perSecond * dt), staminaDelay: delay }
}

export function regenStamina(v: Vitals, dt: number, rate: number): Vitals {
  if (v.staminaDelay > 0) return { ...v, staminaDelay: Math.max(0, v.staminaDelay - dt) }
  if (v.stamina >= v.maxStamina) return v
  return { ...v, stamina: Math.min(v.maxStamina, v.stamina + rate * dt) }
}

// ─── damage formulas ────────────────────────────────────────────────────────

export type HitModifiers = { vital?: boolean; exposed?: boolean; mounted?: boolean }

/** Hunter → monster damage: attack power × motion value × part multiplier × situational bonuses. */
export function hunterDamage(power: number, motion: number, partMult: number, mods: HitModifiers = {}): number {
  let dmg = power * motion * partMult
  if (mods.vital) dmg *= CONFIG.hunter.vitalMultiplier
  if (mods.exposed) dmg *= 1.25
  if (mods.mounted && mods.vital) dmg *= 1.2
  return Math.max(1, Math.round(dmg))
}

/** Monster → hunter damage with the quarry's multiplier and the rage bonus. */
export function monsterDamage(base: number, quarryMult: number, enraged: boolean, scale = CONFIG.monster.damageScale): number {
  return Math.max(1, Math.round(base * quarryMult * scale * (enraged ? 1.15 : 1)))
}
