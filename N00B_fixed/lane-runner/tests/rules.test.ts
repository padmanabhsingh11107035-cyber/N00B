import { describe, expect, it } from 'vitest'
import {
  applyGate, buyUpgrade, dailySeed, drawPerks, gateIsGood, gateLabel, hpScale, makeBoss, makeRng, noUpgrades,
  PERKS, raiseGate, runScore, SQUAD_CAP, startingStats, upgradeCost, UPGRADES, comboMultiplier, applyCoinBonus,
  sectorOf, SECTOR_LEN, MAX_WEAPON, BOSS_ORDER,
} from '../src/game/rules'
import { generateSector, trapPool, ROAD_HALF, ARENA_LEN } from '../src/game/procgen'
import { defaultSave, parseSave, SaveStore, SAVE_KEY } from '../src/engine/save'

const base = { count: 10, weapon: 1, rate: 1, fallen: 0 }

describe('gates', () => {
  it('adds, multiplies, subtracts and divides soldiers', () => {
    expect(applyGate(base, { kind: 'add', n: 5 }, 0).stats.count).toBe(15)
    expect(applyGate(base, { kind: 'mul', n: 3 }, 0).stats.count).toBe(30)
    const sub = applyGate(base, { kind: 'sub', n: 4 }, 0)
    expect(sub.stats.count).toBe(6)
    expect(sub.stats.fallen).toBe(4)
    expect(sub.good).toBe(false)
    expect(applyGate(base, { kind: 'div', n: 3 }, 0).stats.count).toBe(4)
  })
  it('caps squad size and never goes negative', () => {
    expect(applyGate({ ...base, count: 300 }, { kind: 'mul', n: 3 }, 0).stats.count).toBe(SQUAD_CAP)
    expect(applyGate(base, { kind: 'sub', n: 50 }, 0).stats.count).toBe(0)
  })
  it('revives only fallen soldiers', () => {
    const r = applyGate({ ...base, fallen: 3 }, { kind: 'heal', n: 8 }, 0)
    expect(r.stats.count).toBe(13)
    expect(r.stats.fallen).toBe(0)
    expect(applyGate(base, { kind: 'heal', n: 8 }, 0).good).toBe(false)
  })
  it('clamps weapon tiers', () => {
    expect(applyGate({ ...base, weapon: MAX_WEAPON }, { kind: 'weapon', n: 1 }, 0).stats.weapon).toBe(MAX_WEAPON)
    expect(applyGate({ ...base, weapon: 0 }, { kind: 'weapon', n: -1 }, 0).stats.weapon).toBe(0)
  })
  it('gamble is an honest coin flip', () => {
    expect(applyGate(base, { kind: 'gamble' }, 0.2).stats.count).toBe(30)
    expect(applyGate(base, { kind: 'gamble' }, 0.8).stats.count).toBe(5)
  })
  it('labels and tones match the effect', () => {
    expect(gateLabel({ kind: 'mul', n: 2 }).big).toBe('×2')
    expect(gateIsGood({ kind: 'add', n: 1 })).toBe(true)
    expect(gateIsGood({ kind: 'div', n: 2 })).toBe(false)
    expect(gateIsGood({ kind: 'rate', pct: -20 })).toBe(false)
  })
  it('shootable gates rise with damage, with rising cost and a cap', () => {
    const a = raiseGate(1, 0, 100, 10)
    expect(a.value).toBeGreaterThan(1)
    const b = raiseGate(20, 0, 100, 10)
    expect(b.value - 20).toBeLessThan(a.value - 1)
    expect(raiseGate(1, 0, 1e9, 10, 30).value).toBe(30)
  })
})

describe('perks and armory', () => {
  it('draws distinct, non-maxed perks deterministically', () => {
    const a = drawPerks(makeRng(7), {})
    const b = drawPerks(makeRng(7), {})
    expect(a.map(p => p.id)).toEqual(b.map(p => p.id))
    expect(new Set(a.map(p => p.id)).size).toBe(3)
    const maxed = Object.fromEntries(PERKS.map(p => [p.id, p.max]))
    expect(drawPerks(makeRng(1), maxed)).toHaveLength(0)
  })
  it('prices and buys upgrades', () => {
    const def = UPGRADES[0]
    expect(upgradeCost(def, def.max)).toBeNull()
    const lv = noUpgrades()
    expect(buyUpgrade(lv, 0, 'squad')).toBeNull()
    const r = buyUpgrade(lv, 1000, 'squad')!
    expect(r.levels.squad).toBe(1)
    expect(r.coins).toBe(1000 - upgradeCost(def, 0)!)
    expect(startingStats(r.levels).count).toBe(startingStats(lv).count + 1)
  })
})

describe('scaling, bosses and scoring', () => {
  it('threat grows monotonically', () => {
    for (let t = 0; t < 10; t++) expect(hpScale(t + 1)).toBeGreaterThan(hpScale(t))
    expect(sectorOf(SECTOR_LEN * 2 + 1)).toBe(2)
  })
  it('bosses follow the intro order, then get more modifiers and HP', () => {
    for (let s = 0; s < BOSS_ORDER.length; s++) expect(makeBoss(makeRng(s), s).body).toBe(BOSS_ORDER[s])
    const early = makeBoss(makeRng(3), 1)
    const late = makeBoss(makeRng(3), 7)
    expect(late.mods.length).toBeGreaterThan(early.mods.length)
    expect(late.hp).toBeGreaterThan(early.hp)
    expect(new Set(late.mods).size).toBe(late.mods.length)
  })
  it('scores and coins', () => {
    expect(runScore(100, 50, 1)).toBe(200 + 50 + 1500)
    expect(comboMultiplier(0)).toBe(1)
    expect(comboMultiplier(1000)).toBe(5)
    expect(applyCoinBonus(100, 2, true)).toBe(240)
    expect(dailySeed(new Date('2026-01-01T10:00:00'))).toBe(dailySeed(new Date('2026-01-01T22:00:00')))
  })
})

describe('procedural sectors', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = JSON.stringify(generateSector(42, 3))
    expect(JSON.stringify(generateSector(42, 3))).toBe(a)
    expect(JSON.stringify(generateSector(43, 3))).not.toBe(a)
  })
  it('every sector is well-formed and ends in a boss arena', () => {
    for (let seed = 1; seed <= 6; seed++) {
      let prevEnd = 0
      for (let i = 0; i < 8; i++) {
        const s = generateSector(seed, i)
        expect(s.start).toBe(prevEnd)
        prevEnd = s.end
        const ds = s.chunks.map(c => c.d)
        expect([...ds].sort((x, y) => x - y)).toEqual(ds)
        for (const c of s.chunks) expect(c.d).toBeGreaterThanOrEqual(s.start)
        const last = s.chunks[s.chunks.length - 1]
        expect(last.kind).toBe('boss')
        expect(s.end - last.d).toBeGreaterThanOrEqual(ARENA_LEN * 0.5)
        expect(s.chunks.some(c => c.kind === 'gates')).toBe(true)
        expect(s.chunks.some(c => c.kind === 'horde')).toBe(true)
        for (const c of s.chunks) {
          if (c.kind === 'gates') for (const g of c.gates) expect(Math.abs(g.x) + g.w / 2).toBeLessThanOrEqual(ROAD_HALF + 0.01)
          if (c.kind === 'gates' && c.gates.length > 1) expect(c.gates.some(g => gateIsGood(g.op))).toBe(true)
        }
      }
    }
  })
  it('introduces more trap types and more traps in later sectors', () => {
    const kinds = (i: number) => Object.keys(trapPool(i)).length
    expect(kinds(6)).toBeGreaterThan(kinds(0))
    const traps = (i: number) => generateSector(9, i).chunks.filter(c => c.kind === 'trap').length
    expect(traps(6)).toBeGreaterThanOrEqual(traps(0))
  })
})

describe('save', () => {
  it('defaults on garbage and clamps bad values', () => {
    expect(parseSave(null)).toEqual(defaultSave())
    expect(parseSave('{not json')).toEqual(defaultSave())
    const s = parseSave(JSON.stringify({ version: 2, coins: -5, musicVolume: 7, upgrades: { squad: 999 } }))
    expect(s.coins).toBe(0)
    expect(s.musicVolume).toBe(1)
    expect(s.upgrades.squad).toBeLessThanOrEqual(UPGRADES.find(u => u.id === 'squad')!.max)
  })
  it('migrates v1 coins and settings', () => {
    const s = parseSave(JSON.stringify({ version: 1, coins: 321, muted: true, bestScore: 5000 }))
    expect(s.version).toBe(2)
    expect(s.coins).toBe(321)
    expect(s.muted).toBe(true)
  })
  it('round-trips through storage and survives storage failures', () => {
    const mem = new Map<string, string>()
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }
    new SaveStore(storage).update({ coins: 42, bestScore: 900 })
    expect(JSON.parse(mem.get(SAVE_KEY)!).coins).toBe(42)
    expect(new SaveStore(storage).data.bestScore).toBe(900)
    const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
    const s = new SaveStore(broken)
    expect(() => s.update({ coins: 1 })).not.toThrow()
    expect(s.data.coins).toBe(1)
  })
})

import { bossFightSeconds, bossHp, bossPhaseFloor, squadDps } from '../src/game/rules'

describe('boss fight sizing', () => {
  const combat = { hollow: 0, sharpshooter: 0, armoryDamage: 0 }
  it('never drops below the base HP of the body', () => {
    expect(bossHp(9000, 1, 0)).toBe(9000)
  })
  it('scales with real squad firepower to the target fight length', () => {
    const dps = squadDps({ soldiers: 100, weapon: 5, rateMul: 1, combat, grenadier: 0 })
    expect(bossHp(9000, dps, 2)).toBeCloseTo(dps * bossFightSeconds(2), -1)
  })
  it('counts weapon damage, not just tier: a minigun squad is far stronger than a carbine squad', () => {
    const carbine = squadDps({ soldiers: 50, weapon: 0, rateMul: 1, combat, grenadier: 0 })
    const minigun = squadDps({ soldiers: 50, weapon: 5, rateMul: 1, combat, grenadier: 0 })
    expect(minigun / carbine).toBeGreaterThan(5)
  })
  it('fights get longer each sector, capped', () => {
    expect(bossFightSeconds(1)).toBeGreaterThan(bossFightSeconds(0))
    expect(bossFightSeconds(50)).toBe(70)
    expect(bossPhaseFloor(0) * 3).toBeLessThan(bossFightSeconds(0))
  })
})

import { bossHitCap } from '../src/game/rules'
describe('boss hit cap', () => {
  it('bounds a single attack and rises with phase, capped at 30%', () => {
    expect(bossHitCap(0, 0)).toBeCloseTo(0.12)
    expect(bossHitCap(2, 0)).toBeGreaterThan(bossHitCap(0, 0))
    expect(bossHitCap(2, 40)).toBe(0.3)
  })
})

describe('rename carry-over', () => {
  it('reads progress from the pre-rename Horde Forge save key and writes the new key', () => {
    const mem = new Map<string, string>([['hordeforge.save', JSON.stringify({ ...defaultSave(), coins: 777, bestScore: 4321 })]])
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }
    const s = new SaveStore(storage)
    expect(s.data.coins).toBe(777)
    s.update({ coins: 780 })
    expect(SAVE_KEY).toBe('lanerunner.save')
    expect(JSON.parse(mem.get(SAVE_KEY)!).coins).toBe(780)
    expect(new SaveStore(storage).data.coins).toBe(780)
  })
})

describe('Lurker ambushes', () => {
  it('introduces rooftop Leapers in the first sector and burrowers soon after', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const s0 = generateSector(seed, 0).chunks
      expect(s0.some(c => c.kind === 'rooftop')).toBe(true)
      const early = [0, 1, 2].flatMap(i => generateSector(seed, i).chunks)
      expect(early.some(c => c.kind === 'burrow')).toBe(true)
    }
  })
  it('ambush packs only use creature archetypes and grow in later sectors', () => {
    const size = (i: number) => [1, 2, 3, 4].flatMap(seed => generateSector(seed, i).chunks)
      .filter(c => c.kind === 'rooftop' || c.kind === 'burrow')
      .reduce((n, c) => n + (c as { archs: string[] }).archs.length, 0)
    expect(size(7)).toBeGreaterThan(size(0))
    for (const c of generateSector(3, 6).chunks) {
      if (c.kind === 'rooftop' || c.kind === 'burrow') for (const a of c.archs) expect(['leaper', 'quiller', 'howler', 'gulper']).toContain(a)
    }
  })
})
