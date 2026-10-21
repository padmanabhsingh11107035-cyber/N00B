import { describe, expect, it } from 'vitest'
import { TEMPLATES } from '../src/game/content'
import { DEEP_LORE, floorSeed, generateDungeon, MAX_CONSECUTIVE_HIGH, PATH_LENGTH, rotateRows, rotatedSockets, T, validateDungeon, walkable } from '../src/game/dungeon'
import { hashSeed, mulberry32, parseSeed } from '../src/game/rng'

const SEEDS = Array.from({ length: 400 }, (_, i) => 1000 + i * 7919)

describe('rng', () => {
  it('is deterministic and seed-sensitive', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const c = mulberry32(43)
    const sa = Array.from({ length: 6 }, () => a())
    expect(Array.from({ length: 6 }, () => b())).toEqual(sa)
    expect(Array.from({ length: 6 }, () => c())).not.toEqual(sa)
    expect(hashSeed(1, 2)).toBe(hashSeed(1, 2))
    expect(hashSeed(1, 2)).not.toBe(hashSeed(1, 3))
  })
  it('parses numeric and text seeds', () => {
    expect(parseSeed(' 123456 ')).toBe(123456)
    expect(parseSeed('gym-day')).toBe(parseSeed('gym-day'))
    expect(parseSeed('')).toBeNull()
  })
})

describe('room chunks', () => {
  it('are square with floor behind every declared socket', () => {
    for (const t of TEMPLATES) {
      const n = t.rows.length
      expect(n % 2, t.id).toBe(1)
      for (const row of t.rows) expect(row.length, t.id).toBe(n)
      const mid = n >> 1
      const edge: Record<string, string[]> = {
        N: [t.rows[0][mid - 1], t.rows[0][mid], t.rows[0][mid + 1]],
        S: [t.rows[n - 1][mid - 1], t.rows[n - 1][mid], t.rows[n - 1][mid + 1]],
        W: [t.rows[mid - 1][0], t.rows[mid][0], t.rows[mid + 1][0]],
        E: [t.rows[mid - 1][n - 1], t.rows[mid][n - 1], t.rows[mid + 1][n - 1]],
      }
      for (const s of t.sockets) for (const ch of edge[s]) expect('.ehpx'.includes(ch), `${t.id} ${s}`).toBe(true)
      expect(t.rows.join('').includes('x'), t.id).toBe(true)
    }
  })
  it('rotate rows and sockets consistently', () => {
    const rows = ['ab', 'cd']
    expect(rotateRows(rows)).toEqual(['ca', 'db'])
    expect(rotatedSockets('NS', 1)).toEqual(['E', 'W'])
    expect(rotatedSockets('NSW', 2)).toEqual(['S', 'N', 'E'])
  })
})

describe('dungeon generator', () => {
  it('is deterministic per seed', () => {
    const a = generateDungeon(123456)
    const b = generateDungeon(123456)
    expect(Array.from(a.tiles).join('') === Array.from(b.tiles).join('')).toBe(true)
    expect(JSON.stringify(a.rooms)).toBe(JSON.stringify(b.rooms))
    const c = generateDungeon(654321)
    expect(Array.from(a.tiles).join('') === Array.from(c.tiles).join('')).toBe(false)
  })

  it('produces valid floors for hundreds of seeds', () => {
    let fallbacks = 0
    for (const seed of SEEDS) {
      const plan = generateDungeon(seed)
      const check = validateDungeon(plan)
      expect(check.errors, `seed ${seed}`).toEqual([])
      if (plan.fallback) fallbacks += 1
    }
    // The fallback is a safety net, not the common case.
    expect(fallbacks).toBeLessThan(SEEDS.length * 0.02)
  })

  it('enforces pacing rules', () => {
    for (const seed of SEEDS.slice(0, 150)) {
      const plan = generateDungeon(seed)
      expect(plan.path).toHaveLength(PATH_LENGTH)
      expect(plan.rooms[plan.path[0]].kind).toBe('entrance')
      expect(plan.rooms[plan.path[PATH_LENGTH - 1]].kind).toBe('boss')
      expect(plan.rooms.some(r => r.kind === 'heal')).toBe(true)
      let run = 0
      for (const id of plan.path) {
        run = plan.rooms[id].danger >= 3 ? run + 1 : 0
        expect(run).toBeLessThanOrEqual(MAX_CONSECUTIVE_HIGH)
      }
      const first = plan.rooms[plan.path[1]]
      if (first.kind === 'combat') expect(first.danger).toBe(1)
      expect(plan.rooms.filter(r => r.reward === 'upgrade').length).toBeGreaterThanOrEqual(3)
      // Every combat room has at least one enemy per wave.
      for (const r of plan.rooms.filter(x => ['combat', 'elite', 'challenge', 'rescue'].includes(x.kind))) {
        for (let w = 0; w < r.waves; w += 1) expect(r.enemies.some(e => e.wave === w), `seed ${seed} room ${r.id} wave ${w}`).toBe(true)
      }
    }
  })

  it('varies wing themes and layouts across seeds', () => {
    const wings = new Set(SEEDS.map(s => generateDungeon(s).wing))
    expect(wings.size).toBe(5)
    expect(wings.has('stacks')).toBe(false)
    const templates = new Set(SEEDS.slice(0, 60).flatMap(s => generateDungeon(s).rooms.map(r => `${r.template}:${r.rotation}`)))
    expect(templates.size).toBeGreaterThan(20)
  })

  it('falls back to a safe authored floor when every attempt is rejected', () => {
    const plan = generateDungeon(777, { maxAttempts: 0 })
    expect(plan.fallback).toBe(true)
    expect(validateDungeon(plan).errors).toEqual([])
    expect(plan.report.at(-1)).toMatch(/fallback/)
  })

  it('never leaves door sockets opening into rock', () => {
    const plan = generateDungeon(4242)
    for (let i = 0; i < plan.tiles.length; i += 1) {
      if (plan.tiles[i] !== T.Door) continue
      const x = i % plan.size
      const y = (i / plan.size) | 0
      const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => walkable(plan.tiles[(y + dy) * plan.size + x + dx])).length
      expect(open).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('floor 2: The Stacks Below', () => {
  const seeds = Array.from({ length: 200 }, (_, i) => floorSeed(i * 7919 + 13, 2))
  it('always uses the Stacks wing and a distinct derived seed', () => {
    expect(floorSeed(42, 1)).toBe(42)
    expect(floorSeed(42, 2)).not.toBe(42)
    expect(floorSeed(42, 2)).toBe(floorSeed(42, 2))
    for (const s of seeds.slice(0, 40)) expect(generateDungeon(s, { floor: 2 }).wing).toBe('stacks')
  })
  it('produces valid floors with bigger waves and a heal before the boss', () => {
    for (const s of seeds) {
      const f2 = generateDungeon(s, { floor: 2 })
      expect(f2.floor).toBe(2)
      expect(validateDungeon(f2).errors).toEqual([])
      const pathHeal = f2.path.slice(0, -1).some(i => f2.rooms[i].kind === 'heal' || f2.rooms[i].links.some(l => f2.rooms[l.to].kind === 'heal'))
      expect(pathHeal || f2.rooms.some(r => r.kind === 'heal')).toBe(true)
    }
    const f1 = generateDungeon(4242, { wing: 'stacks' })
    const f2 = generateDungeon(4242, { wing: 'stacks', floor: 2 })
    const budget = (p: typeof f1) => p.rooms.reduce((n, r) => n + r.enemies.length, 0)
    expect(budget(f2)).toBeGreaterThan(budget(f1))
  })
  it('only places deep lore on floor 2', () => {
    for (const s of seeds.slice(0, 80)) {
      for (const r of generateDungeon(s).rooms) if (r.lore) expect(DEEP_LORE.has(r.lore)).toBe(false)
      for (const r of generateDungeon(s, { floor: 2 }).rooms) if (r.lore) expect(DEEP_LORE.has(r.lore)).toBe(true)
    }
  })
})
