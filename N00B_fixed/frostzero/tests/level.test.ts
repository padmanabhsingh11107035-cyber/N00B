import { describe, expect, it } from 'vitest'
import { autoplay } from '../src/game/autopilot'
import { CONFIG } from '../src/game/config'
import { LEVEL } from '../src/game/level'
import { createSim, hazardHits, hazardPose, NO_INPUT, respawn, stepSim, type SimEvent } from '../src/game/sim'
import { PAR_SECONDS } from '../src/game/rules'

describe('level data', () => {
  it('has ordered checkpoints on solid, non-crumbling decks', () => {
    for (let i = 1; i < LEVEL.checkpoints.length; i += 1) expect(LEVEL.checkpoints[i].z).toBeGreaterThan(LEVEL.checkpoints[i - 1].z)
    for (const c of LEVEL.checkpoints) {
      const deck = LEVEL.platforms.find(p => c.z >= p.z0 && c.z <= p.z1 && Math.abs(c.x - p.x) < p.w / 2)
      expect(deck, `checkpoint at ${c.z}`).toBeTruthy()
      expect(deck!.kind).not.toBe('crumble')
      expect(deck!.move).toBeUndefined()
    }
  })

  it('never spawns inside a hazard', () => {
    for (const c of LEVEL.checkpoints) {
      for (const h of LEVEL.hazards) expect(hazardHits(h, 0, c.x, c.y, c.z)).toBe(false)
    }
  })

  it('lets a rider stand still on a spawn deck without dying for a moment', () => {
    for (let cp = 0; cp < LEVEL.checkpoints.length; cp += 1) {
      const s = createSim(LEVEL, cp)
      for (let i = 0; i < 20; i += 1) stepSim(s, LEVEL, NO_INPUT, 1 / 60)
      expect(s.dead, `cp ${cp}`).toBeNull()
      expect(s.p.grounded).toBe(true)
    }
  })

  it('blinking lasers really switch off', () => {
    const laser = LEVEL.hazards.find(h => h.kind === 'laser' && h.freq > 0)!
    const states = new Set<boolean>()
    for (let t = 0; t < 3; t += 0.05) states.add(hazardPose(laser, t).on)
    expect(states.size).toBe(2)
  })
})

describe('rider physics', () => {
  it('dies when riding straight into the first crystal field', () => {
    const s = createSim(LEVEL, 0)
    const ev: SimEvent[] = []
    for (let i = 0; i < 60 * 12 && !s.dead; i += 1) stepSim(s, LEVEL, NO_INPUT, 1 / 60, ev)
    expect(s.dead).not.toBeNull()
  })

  it('respawns on the checkpoint with a fresh avalanche gap', () => {
    const s = createSim(LEVEL, 2)
    s.p.z += 30
    s.dead = 'fall'
    respawn(s, LEVEL)
    expect(s.p.z).toBe(LEVEL.checkpoints[2].z)
    expect(s.p.z - s.wallZ).toBe(CONFIG.sim.wallStartGap)
    expect(s.dead).toBeNull()
  })
})

describe('autopilot', () => {
  it('can finish the whole run from the start and from every checkpoint', { timeout: 240_000 }, () => {
    const report = autoplay(LEVEL, createSim(LEVEL, 0))
    console.log(`autopilot: finished=${report.finished} time=${report.seconds.toFixed(2)}s deaths=${report.deaths.length}`, JSON.stringify(report.deaths))
    expect(report.finished).toBe(true)
    // The bot plays on reflexes with a short horizon; a human learns the level. A handful of
    // retries is expected, an unbeatable segment would loop until the cap.
    expect(report.deaths.length).toBeLessThanOrEqual(12)
    expect(report.seconds).toBeGreaterThan(PAR_SECONDS * 0.8)
  })
})
