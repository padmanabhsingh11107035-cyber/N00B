import { describe, expect, it } from 'vitest'
import { UPGRADES } from '../src/game/content'
import { mulberry32 } from '../src/game/rng'
import {
  addUpgrade, BASE_STATS, computeMerits, deriveStats, emptyBuild, emptyDev, formatClock, heroRank, rollDamage,
  rollUpgradeChoices, takeDamage, type RunSummary,
} from '../src/game/rules'

const meta = () => ({ dev: emptyDev(), rescued: [] as never[] })

describe('stats', () => {
  it('start from base stats', () => {
    expect(deriveStats(emptyBuild(), meta())).toEqual(BASE_STATS)
  })
  it('apply upgrades, relics, classmates and the development board', () => {
    let b = addUpgrade(emptyBuild(), 'heart')
    b = addUpgrade(b, 'heart')
    b = addUpgrade(b, 'glass')
    b = { ...b, relics: ['crest'], classmates: ['rocky'] }
    const s = deriveStats(b, { dev: { ...emptyDev(), vitality: 2, training: 1 }, rescued: ['rocky', 'pixel'] })
    // 100 + 20 (vitality) + 50 (heart x2) - 25 (glass) + 15 (rocky, counted once)
    expect(s.maxHp).toBe(160)
    expect(s.damageMult).toBeCloseTo(1.06 * 1.4 * 1.2)
    expect(s.boltMult).toBeCloseTo(1.2)
  })
  it('is order-independent', () => {
    const a = deriveStats(addUpgrade(addUpgrade(emptyBuild(), 'momentum'), 'overcharge'), meta())
    const b = deriveStats(addUpgrade(addUpgrade(emptyBuild(), 'overcharge'), 'momentum'), meta())
    expect(a).toEqual(b)
  })
})

describe('upgrade choices', () => {
  it('offers three distinct cards, deterministically', () => {
    const a = rollUpgradeChoices(mulberry32(9), emptyBuild())
    expect(new Set(a).size).toBe(3)
    expect(rollUpgradeChoices(mulberry32(9), emptyBuild())).toEqual(a)
  })
  it('never offers maxed upgrades', () => {
    let b = emptyBuild()
    for (const u of UPGRADES) if (u.id !== 'heart') for (let i = 0; i < u.max; i += 1) b = addUpgrade(b, u.id)
    for (let seed = 0; seed < 20; seed += 1) expect(rollUpgradeChoices(mulberry32(seed), b)).toEqual(['heart'])
  })
})

describe('combat math', () => {
  it('rolls crits and scales damage', () => {
    expect(rollDamage(10, 1.5, 0.1, 0.5)).toEqual({ amount: 15, crit: false })
    expect(rollDamage(10, 1.5, 0.1, 0.05)).toEqual({ amount: 30, crit: true })
  })
  it('lets the barrier absorb a hit', () => {
    expect(takeDamage(50, 20, { damageTaken: 1 }, true)).toEqual({ hp: 50, blocked: true, taken: 0 })
    expect(takeDamage(50, 20, { damageTaken: 0.85 }, false)).toEqual({ hp: 33, blocked: false, taken: 17 })
    expect(takeDamage(5, 20, { damageTaken: 1 }, false).hp).toBe(0)
  })
})

describe('progression', () => {
  const run: RunSummary = { seed: 1, won: true, roomsCleared: 8, kills: 52, rescues: 1, relics: 1, lore: 1, seconds: 900, credits: 0, bosses: 2, floor: 2 }
  it('awards merits', () => {
    expect(computeMerits(run)).toBe(16 + 6 + 4 + 2 + 10 + 50 + 15)
    expect(computeMerits({ ...run, won: false, bosses: 0, floor: 1, roomsCleared: 0, kills: 0, rescues: 0, relics: 0, lore: 0 })).toBe(0)
  })
  it('ranks runs', () => {
    expect(heroRank(run)).toBe('S')
    expect(heroRank({ ...run, rescues: 0 })).toBe('A')
    expect(heroRank({ ...run, won: false, roomsCleared: 3, bosses: 0 })).toBe('C')
    expect(heroRank({ ...run, won: false, roomsCleared: 3, bosses: 1 })).toBe('B')
  })
  it('formats the clock', () => {
    expect(formatClock(125)).toBe('2:05')
  })
})
