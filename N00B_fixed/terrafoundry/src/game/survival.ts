import { CONFIG } from './config'

export type Difficulty = 'peaceful' | 'normal' | 'hard'
export type GameMode = 'survival' | 'creative'

export const DIFFICULTY: Record<Difficulty, { hunger: number; damage: number; hostiles: number; starve: boolean; label: string }> = {
  peaceful: { hunger: 0.6, damage: 0, hostiles: 0, starve: false, label: 'Peaceful' },
  normal: { hunger: 1, damage: 1, hostiles: 1, starve: true, label: 'Normal' },
  hard: { hunger: 1.35, damage: 1.5, hostiles: 1.7, starve: true, label: 'Hard' },
}

export type Stats = { health: number; hunger: number; stamina: number; staminaWait: number }
export const MAX_STAT = 100

export function freshStats(): Stats {
  return { health: MAX_STAT, hunger: MAX_STAT, stamina: MAX_STAT, staminaWait: 0 }
}

/** Advance survival by `dt`. Returns damage taken from starvation this tick. */
export function tickStats(s: Stats, dt: number, sprinting: boolean, difficulty: Difficulty, mode: GameMode): number {
  const cfg = CONFIG.survival
  if (mode === 'creative') {
    s.health = s.hunger = s.stamina = MAX_STAT
    return 0
  }
  const diff = DIFFICULTY[difficulty]
  s.hunger = Math.max(0, s.hunger - cfg.hungerDrain * diff.hunger * (sprinting ? cfg.sprintHungerMult : 1) * dt)
  let starve = 0
  if (s.hunger <= 0 && diff.starve) {
    starve = cfg.starveDamage * dt
    s.health = Math.max(0, s.health - starve)
  } else if (s.hunger >= cfg.regenHungerMin && s.health < MAX_STAT) {
    const heal = Math.min(cfg.regenRate * dt, MAX_STAT - s.health)
    s.health += heal
    s.hunger = Math.max(0, s.hunger - heal * 0.25)
  }
  if (sprinting) {
    s.stamina = Math.max(0, s.stamina - cfg.staminaSprintCost * dt)
    s.staminaWait = cfg.staminaDelay
  } else if (s.staminaWait > 0) {
    s.staminaWait -= dt
  } else {
    const hungerFactor = s.hunger > 15 ? 1 : 0.4
    s.stamina = Math.min(MAX_STAT, s.stamina + cfg.staminaRegen * hungerFactor * dt)
  }
  return starve
}

/** Spend stamina for an action; fails (returns false) if not enough. */
export function spendStamina(s: Stats, amount: number, mode: GameMode): boolean {
  if (mode === 'creative') return true
  if (s.stamina < amount) return false
  s.stamina -= amount
  s.staminaWait = CONFIG.survival.staminaDelay
  return true
}

/** Apply food; returns false when it would be wasted. */
export function eat(s: Stats, food: { hunger: number; health: number }): boolean {
  // Eating is refused only when the food could not restore anything right now.
  const feeds = food.hunger > 0 && s.hunger < MAX_STAT - 1
  const heals = food.health > 0 && s.health < MAX_STAT
  if (!feeds && !heals) return false
  s.hunger = Math.min(MAX_STAT, s.hunger + food.hunger)
  s.health = Math.max(1, Math.min(MAX_STAT, s.health + food.health))
  return true
}

/** Damage scaled by difficulty; returns true when the player died. */
export function hurt(s: Stats, amount: number, difficulty: Difficulty, mode: GameMode, scaled = true): boolean {
  if (mode === 'creative') return false
  const a = scaled ? amount * Math.max(DIFFICULTY[difficulty].damage, 0.5) : amount
  s.health = Math.max(0, s.health - a)
  return s.health <= 0
}

export function fallDamage(impactSpeed: number): number {
  const over = -impactSpeed - CONFIG.survival.fallSafeSpeed
  return over > 0 ? over * CONFIG.survival.fallDamage : 0
}
