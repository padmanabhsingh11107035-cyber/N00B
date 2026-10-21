import { describe, expect, it } from 'vitest'
import { LEVEL_FLOORS, TOTAL_FLOORS, checkRun } from '../server/helix-rules.mjs'
import { SLOT_ANGLE, angleDiff, dailySeed, extendTower, generateTower, probe, stageOf, type Tower } from '../src/game/level'
import { BALL_RADIUS, GRAVITY, ROT_SPEED, Sim, floorY } from '../src/game/sim'

type Skill = { name: string; delay: number; care: number; speed: number; aimError: number }
const NOVICE: Skill = { name: 'novice', delay: 0.22, care: 0.55, speed: 0.75, aimError: 0.25 }
const REGULAR: Skill = { name: 'regular', delay: 0.14, care: 0.85, speed: 0.9, aimError: 0.12 }
const EXPERT: Skill = { name: 'expert', delay: 0.06, care: 0.99, speed: 1, aimError: 0.04 }

function rngFor(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0
    return a / 4294967296
  }
}

/** Heuristic player: aims for the gap, avoids landing on hazards it notices in time. */
function play(tower: Tower, skill: Skill, seed: number, levels = 1) {
  const sim = new Sim(tower)
  const r = rngFor(seed)
  const dt = 1 / 60
  const history: number[] = []
  let firstScoreAt = -1
  let aimOffset = 0
  let aimFloor = -1
  let cause = ''
  let levelEvents = 0
  let saved = 0
  while (!sim.over && sim.levelsCleared < levels && sim.time < 300 * levels) {
    const view = Math.max(0, history.length - Math.round(skill.delay / dt))
    void view
    if (sim.floor !== aimFloor) {
      aimFloor = sim.floor
      aimOffset = (r() - 0.5) * skill.aimError * 2
    }
    let turn = 0
    {
      const spec = tower.floors[sim.floor]
      const gapSlots = spec.slots.filter(s => s === 'gap').length
      const gapCenter = spec.offset + (gapSlots / 2) * SLOT_ANGLE + aimOffset
      const diff = angleDiff(gapCenter, sim.ballAngle)
      // Ball angle = −phi, so turning positive moves the ball angle negative.
      turn = Math.abs(diff) < 0.05 ? 0 : -Math.max(-1, Math.min(1, diff / (0.25 + skill.delay * 2))) * skill.speed
      // Hazard check on the predicted landing spot.
      const top = floorY(sim.floor)
      const h = sim.y - BALL_RADIUS - top
      const disc = sim.vy * sim.vy + 2 * GRAVITY * h
      const tc = (sim.vy + Math.sqrt(Math.max(0, disc))) / GRAVITY
      if (tc < 0.35 && r() < skill.care) {
        const options = [turn, 0, -turn].filter((v, i, a) => a.indexOf(v) === i)
        for (const o of options) {
          const predicted = sim.ballAngle - o * ROT_SPEED * Math.min(tc, 0.3)
          const p = probe(spec, predicted, sim.time + tc)
          if (p.kind === 'safe' || p.kind === 'gap') {
            turn = o
            break
          }
        }
      }
    }
    history.push(turn)
    const delayed = history[Math.max(0, history.length - 1 - Math.round(skill.delay / dt))]
    for (const e of sim.step(dt, delayed, 0)) {
      if (e.type === 'death') cause = `${e.cause}@s${tower.floors[e.floor].stage}`
      if (e.type === 'level') levelEvents += 1
      if (e.type === 'saved') saved += 1
    }
    if (firstScoreAt < 0 && sim.score > 0) firstScoreAt = sim.time
  }
  return { cause, levelEvents, saved, levelsCleared: sim.levelsCleared, score: sim.score, floors: sim.floors, time: sim.time, over: sim.over, firstScoreAt, bestChain: sim.bestChain, smashes: sim.smashes }
}

describe('tower generation', () => {
  it('is deterministic per seed and differs across days', () => {
    const a = generateTower(dailySeed('2026-09-27'))
    const b = generateTower(dailySeed('2026-09-27'))
    const c = generateTower(dailySeed('2026-09-28'))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c))
    expect(a.floors.length).toBe(TOTAL_FLOORS)
  })
  it('always leaves a gap and keeps the first floors hazard-free', () => {
    for (let s = 0; s < 50; s += 1) {
      const t = generateTower(s * 7919)
      for (const f of t.floors) expect(f.slots.includes('gap')).toBe(true)
      for (const f of t.floors.slice(0, 3)) expect(f.slots.some(k => k === 'danger' || k === 'blink') || !!f.sweeper).toBe(false)
    }
  })
  it('ramps difficulty: fewer gap slots and more hazards later', () => {
    const t = generateTower(12345)
    const hazards = (i: number) => t.floors[i].slots.filter(k => k === 'danger' || k === 'blink').length
    const gaps = (i: number) => t.floors[i].slots.filter(k => k === 'gap').length
    const early = t.floors.slice(0, 10).reduce((n, f) => n + hazards(f.index), 0)
    const late = t.floors.slice(-10).reduce((n, f) => n + hazards(f.index), 0)
    expect(late).toBeGreaterThan(early * 2)
    expect(gaps(0)).toBeGreaterThan(gaps(TOTAL_FLOORS - 1))
    expect(t.floors.some(f => f.sweeper)).toBe(true)
    expect(t.floors.some(f => f.blink)).toBe(true)
  })
})

describe('levels never end', () => {
  it('clearing 90 floors pays a level and the run goes straight on into the next one', () => {
    let found = false
    for (let seed = 1; seed <= 40 && !found; seed += 1) {
      const tower = generateTower(dailySeed('2026-10-21') ^ (seed * 2654435761))
      const sim = new Sim(tower)
      const dt = 1 / 60
      let levelEvent: { level: number; points: number } | null = null
      let before = 0
      const guide = () => {
        const spec = tower.floors[sim.floor]
        const gapSlots = spec.slots.filter(s => s === 'gap').length
        const diff = angleDiff(spec.offset + (gapSlots / 2) * SLOT_ANGLE, sim.ballAngle)
        return Math.abs(diff) < 0.04 ? 0 : -Math.max(-1, Math.min(1, diff / 0.3))
      }
      while (!sim.over && sim.time < 400 && sim.floor < LEVEL_FLOORS + 25) {
        if (sim.floor === LEVEL_FLOORS - 1) before = sim.score
        for (const e of sim.step(dt, guide(), 0)) if (e.type === 'level') levelEvent = { level: e.level, points: e.points }
      }
      if (sim.floor >= LEVEL_FLOORS + 25 && levelEvent) {
        found = true
        expect(levelEvent).toEqual({ level: 1, points: 500 })
        expect(sim.over).toBeNull()
        expect(sim.level).toBe(2)
        expect(sim.levelsCleared).toBe(1)
        expect(tower.floors.length).toBeGreaterThanOrEqual(LEVEL_FLOORS * 2)
        expect(tower.floors[LEVEL_FLOORS].index).toBe(LEVEL_FLOORS)
        expect(sim.stage).toBe(stageOf(sim.floor))
        expect(sim.score).toBeGreaterThan(before)
      }
    }
    expect(found).toBe(true)
  })
  it('is the same tower for everyone, however far it has been built', () => {
    const a = generateTower(777)
    const b = generateTower(777)
    for (let i = 0; i < 3; i += 1) { extendTower(a); extendTower(b) }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(a.floors.length).toBe(LEVEL_FLOORS * 4)
    expect(a.floors.every((f, i) => f.index === i && f.slots.includes('gap'))).toBe(true)
    expect(a.floors.slice(LEVEL_FLOORS, LEVEL_FLOORS + 3).some(f => f.slots.some(k => k === 'danger'))).toBe(false)
  })
  it('stays fair in later levels: never fewer than 2 gap slots, hazards capped', () => {
    const t = generateTower(4242)
    for (let l = 0; l < 12; l += 1) extendTower(t)
    for (const f of t.floors) {
      expect(f.slots.filter(k => k === 'gap').length).toBeGreaterThanOrEqual(2)
      expect(f.slots.filter(k => k === 'danger' || k === 'blink').length).toBeLessThanOrEqual(4)
    }
  })
})

describe('the shield', () => {
  it('forgives the first hazard of a level and not the second', () => {
    const tower = generateTower(5)
    // a floor with no way through: everything on it is a hazard
    tower.floors[0] = { ...tower.floors[0], slots: new Array(16).fill('danger'), sweeper: undefined, blink: undefined }
    const sim = new Sim(tower)
    expect(sim.shield).toBe(1)
    const kinds: string[] = []
    for (let i = 0; i < 600 && !sim.over; i += 1) for (const e of sim.step(1 / 60, 0, 0)) kinds.push(e.type)
    expect(kinds.filter(k => k === 'saved')).toHaveLength(1)
    expect(kinds.indexOf('saved')).toBeLessThan(kinds.indexOf('death'))
    expect(sim.over).toBe('dead')
    expect(sim.shield).toBe(0)
  })
})

describe('simulated players', () => {
  const report: string[] = []
  const clearRate = (skill: Skill, levels: number, n = 60) => {
    let cleared = 0
    for (let s = 0; s < n; s += 1) {
      const tower = generateTower(dailySeed(`2026-10-${String((s % 28) + 1).padStart(2, '0')}`) ^ (s * 2654435761))
      if (play(tower, skill, s + 1, levels).levelsCleared >= levels) cleared += 1
    }
    return cleared / n
  }
  for (const skill of [NOVICE, REGULAR, EXPERT]) {
    it(`${skill.name}: every run passes server plausibility checks`, () => {
      const runs = []
      for (let s = 0; s < 60; s += 1) {
        const tower = generateTower(dailySeed(`2026-10-${String((s % 28) + 1).padStart(2, '0')}`) ^ (s * 2654435761))
        const res = play(tower, skill, s + 1)
        runs.push(res)
        const verdict = checkRun({ score: res.score, durationMs: Math.floor(res.time * 1000), floors: res.floors })
        // Runs shorter than a second are never submitted by the client.
        if (res.time >= 1) expect(verdict, JSON.stringify(res)).toBeNull()
      }
      const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
      const scores = runs.map(r => r.score)
      const first = runs.map(r => r.firstScoreAt).filter(t => t >= 0)
      report.push(`${skill.name.padEnd(8)} median score ${med(scores)} · max ${Math.max(...scores)} · median floors ${med(runs.map(r => r.floors))} · median time ${med(runs.map(r => r.time)).toFixed(1)}s`)
      if (skill === NOVICE) expect(med(first)).toBeLessThan(10)
    })
  }
  it('is easy for people: most careful players clear level 1, and later levels are still reachable', () => {
    const novice = clearRate(NOVICE, 1)
    const regular = clearRate(REGULAR, 1)
    const expert = clearRate(EXPERT, 1)
    report.push(`level 1 cleared: novice ${Math.round(novice * 100)}% · regular ${Math.round(regular * 100)}% · expert ${Math.round(expert * 100)}%`)
    expect(novice).toBeGreaterThanOrEqual(0.5)
    expect(regular).toBeGreaterThanOrEqual(0.7)
    expect(expert).toBeGreaterThanOrEqual(0.85)
    expect(clearRate(REGULAR, 3, 40)).toBeGreaterThanOrEqual(0.25)
  })
  it('prints the difficulty report', () => {
    console.log(['', ...report].join(String.fromCharCode(10)))
  })
})
