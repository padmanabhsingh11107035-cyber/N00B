import {
  CLASSMATE_BY_ID, UPGRADES, type ClassmateId, type DevId, type Rarity, type RelicId, type UpgradeId,
} from './content'
import type { Rng } from './rng'

/**
 * Pure run rules (unit-tested): hero stats are always re-derived from the current build so the
 * order upgrades were picked in never matters, and nothing drifts between saves.
 */

export type HeroStats = {
  maxHp: number
  moveSpeed: number
  meleeMult: number
  boltMult: number
  damageMult: number
  boltCost: number
  powerGain: number
  powerRegen: number
  dashCooldown: number
  critChance: number
  lifesteal: number
  splitShot: boolean
  chain: boolean
  seismic: boolean
  afterimage: boolean
  shield: boolean
  novaRadius: number
  novaDamage: number
  novaStun: number
  damageTaken: number
  creditMult: number
  shopDiscount: number
  revive: boolean
  enemySlow: number
  revealMap: boolean
  healOnClear: number
  startPower: number
  rerolls: number
}

export const BASE_STATS: HeroStats = {
  maxHp: 100, moveSpeed: 7.4, meleeMult: 1, boltMult: 1, damageMult: 1, boltCost: 18, powerGain: 1, powerRegen: 2.5,
  dashCooldown: 0.7, critChance: 0.05, lifesteal: 0, splitShot: false, chain: false, seismic: false, afterimage: false,
  shield: false, novaRadius: 6, novaDamage: 55, novaStun: 1.2, damageTaken: 1, creditMult: 1, shopDiscount: 1,
  revive: false, enemySlow: 1, revealMap: false, healOnClear: 0, startPower: 20, rerolls: 0,
}

export type RunBuild = { upgrades: Partial<Record<UpgradeId, number>>; relics: RelicId[]; classmates: ClassmateId[] }
export type MetaProgress = { dev: Record<DevId, number>; rescued: ClassmateId[] }

export const emptyBuild = (): RunBuild => ({ upgrades: {}, relics: [], classmates: [] })
export const emptyDev = (): Record<DevId, number> => ({ vitality: 0, training: 0, focus: 0, insight: 0 })

export function deriveStats(build: RunBuild, meta: MetaProgress): HeroStats {
  const s: HeroStats = { ...BASE_STATS }
  const n = (id: UpgradeId) => build.upgrades[id] ?? 0
  // Hero Development Board (permanent).
  s.maxHp += meta.dev.vitality * 10
  s.damageMult *= 1 + meta.dev.training * 0.06
  s.startPower += meta.dev.focus * 15
  s.rerolls += meta.dev.insight
  // Upgrades picked this run.
  s.meleeMult *= 1 + 0.3 * n('knuckles')
  s.seismic = n('seismic') > 0
  s.lifesteal += n('vampiric')
  s.splitShot = n('splitShot') > 0
  s.chain = n('chain') > 0
  for (let i = 0; i < n('overcharge'); i += 1) {
    s.boltCost *= 0.65
    s.boltMult *= 1.2
  }
  s.afterimage = n('afterimage') > 0
  s.moveSpeed *= 1 + 0.12 * n('momentum')
  s.dashCooldown *= Math.pow(0.75, n('momentum'))
  s.novaRadius *= 1 + 0.4 * n('nova')
  s.novaDamage *= 1 + 0.5 * n('nova')
  s.novaStun += 0.8 * n('nova')
  s.powerGain *= 1 + 0.5 * n('surge')
  s.shield = n('shield') > 0
  s.maxHp += 25 * n('heart')
  s.damageTaken *= Math.pow(0.85, n('bulwark'))
  s.critChance += 0.15 * n('critical')
  if (n('glass') > 0) {
    s.damageMult *= 1.4
    s.maxHp -= 25
  }
  // Relics.
  const has = (id: RelicId) => build.relics.includes(id)
  if (has('cape')) s.revive = true
  if (has('crest')) s.damageMult *= 1.2
  if (has('compass')) {
    s.revealMap = true
    s.critChance += 0.1
  }
  if (has('key')) {
    s.creditMult *= 1.6
    s.shopDiscount *= 0.75
  }
  if (has('hourglass')) s.enemySlow *= 0.85
  if (has('shard')) s.powerRegen += 4
  // Classmates: everyone rescued ever (permanent) plus anyone freed this run.
  for (const id of new Set([...meta.rescued, ...build.classmates])) {
    if (!CLASSMATE_BY_ID[id]) continue
    if (id === 'pixel') s.boltMult *= 1.2
    if (id === 'rocky') s.maxHp += 15
    if (id === 'zephyr') s.moveSpeed *= 1.08
    if (id === 'mira') s.healOnClear += 6
    if (id === 'tock') s.dashCooldown *= 0.8
    if (id === 'blaze') s.meleeMult *= 1.15
  }
  s.maxHp = Math.max(40, Math.round(s.maxHp))
  return s
}

const RARITY_WEIGHT: Record<Rarity, number> = { common: 60, rare: 30, epic: 10 }
const ELITE_WEIGHT: Record<Rarity, number> = { common: 35, rare: 42, epic: 23 }

/** Three distinct, non-maxed upgrade offers. Seeded, so the same seed offers the same cards. */
export function rollUpgradeChoices(rng: Rng, build: RunBuild, elite = false, count = 3): UpgradeId[] {
  const pool = UPGRADES.filter(u => (build.upgrades[u.id] ?? 0) < u.max)
  const out: UpgradeId[] = []
  const table = elite ? ELITE_WEIGHT : RARITY_WEIGHT
  while (out.length < count && pool.length > 0) {
    const total = pool.reduce((n, u) => n + table[u.rarity], 0)
    let r = rng() * total
    let idx = pool.length - 1
    for (let i = 0; i < pool.length; i += 1) {
      r -= table[pool[i].rarity]
      if (r < 0) {
        idx = i
        break
      }
    }
    out.push(pool[idx].id)
    pool.splice(idx, 1)
  }
  return out
}

export function addUpgrade(build: RunBuild, id: UpgradeId): RunBuild {
  return { ...build, upgrades: { ...build.upgrades, [id]: (build.upgrades[id] ?? 0) + 1 } }
}

export type Hit = { amount: number; crit: boolean }
export function rollDamage(base: number, mult: number, critChance: number, roll: number): Hit {
  const crit = roll < critChance
  return { amount: Math.max(1, Math.round(base * mult * (crit ? 2 : 1))), crit }
}

export type DamageResult = { hp: number; blocked: boolean; taken: number }
/** Resolve an incoming hit against HP and the Super Barrier. */
export function takeDamage(hp: number, amount: number, stats: Pick<HeroStats, 'damageTaken'>, shieldReady: boolean): DamageResult {
  if (shieldReady) return { hp, blocked: true, taken: 0 }
  const taken = Math.max(1, Math.round(amount * stats.damageTaken))
  return { hp: Math.max(0, hp - taken), blocked: false, taken }
}

export type RunSummary = {
  seed: number
  won: boolean
  roomsCleared: number
  kills: number
  rescues: number
  relics: number
  lore: number
  seconds: number
  credits: number
  /** Bosses beaten this run (one per floor). */
  bosses: number
  /** Deepest floor reached (1-based). */
  floor: number
}

/** Merits are the permanent currency spent on the Hero Development Board. */
export function computeMerits(s: RunSummary): number {
  return s.roomsCleared * 2 + s.rescues * 6 + s.relics * 4 + s.lore * 2 + Math.floor(s.kills / 5) + s.bosses * 25 + (s.won ? 15 : 0)
}

/** Hero rank shown on results: a quick read of how the run went. */
export function heroRank(s: RunSummary): 'S' | 'A' | 'B' | 'C' | 'D' {
  if (s.won && s.seconds < 1200 && s.rescues > 0) return 'S'
  if (s.won) return 'A'
  if (s.bosses > 0 || s.roomsCleared >= 7) return 'B'
  if (s.roomsCleared >= 2) return 'C'
  return 'D'
}

export function formatClock(seconds: number): string {
  const t = Math.max(0, Math.floor(seconds))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}
