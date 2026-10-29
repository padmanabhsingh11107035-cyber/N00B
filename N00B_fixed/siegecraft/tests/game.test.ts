import * as THREE from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import { initPhysics } from '../src/engine/physics'
import { launchVelocity, releasePoint } from '../src/game/aim'
import { CATAPULT_BASE, RELEASE_LOCAL } from '../src/game/layout'
import { guardCount, LEVELS } from '../src/game/levels'
import { createRun, destroy, fire, guardDown, resolveShot, stars } from '../src/game/rules'
import { SiegeSim } from '../src/game/sim'

const views = { create: () => new THREE.Object3D(), ball: () => new THREE.Object3D() }

describe('rules', () => {
  const level = LEVELS[0]
  it('spends ammo, chains points and awards the ammo bonus on the last guard', () => {
    let s = createRun(level, 2)
    s = fire(s)!
    const a = destroy(s, 'wood')
    const b = destroy(a.state, 'wood')
    expect(b.points).toBeGreaterThan(a.points)
    s = guardDown(b.state).state
    s = guardDown(s).state
    expect(s.phase).toBe('won')
    expect(s.ammoBonus).toBe((level.ammo - 1) * 2500)
    expect(stars(s, level)).toBeGreaterThanOrEqual(1)
  })
  it('loses when out of stones with guards standing', () => {
    let s = createRun(level, 1)
    for (let i = 0; i < level.ammo; i += 1) s = resolveShot(fire(s)!)
    expect(s.phase).toBe('lost')
    expect(fire(s)).toBeNull()
    expect(stars(s, level)).toBe(0)
  })
})

describe('castles', () => {
  beforeAll(async () => {
    await initPhysics()
  })
  for (const level of LEVELS) {
    it(`${level.id} stands still and asleep when untouched`, () => {
      const sim = new SiegeSim(level, views)
      let events = 0
      for (let i = 0; i < 240; i += 1) events += sim.step(1 / 60).filter(e => e.type === 'break' || e.type === 'guardDown').length
      expect(events).toBe(0)
      expect(sim.guardsStanding).toBe(guardCount(level))
      expect(sim.sleep.stats.awake).toBe(0)
      sim.dispose()
    })
  }
  it('replays a shot identically (seeded simulation)', () => {
    const run = () => {
      const sim = new SiegeSim(LEVELS[0], views)
      const aim = { yaw: -0.04, pitch: 0.42, power: 0.65 }
      sim.launch(releasePoint(CATAPULT_BASE, aim.yaw, RELEASE_LOCAL), launchVelocity(aim))
      let n = 0
      for (let i = 0; i < 300; i += 1) n += sim.step(1 / 60).length
      const sig = [...sim.pieces.values()].reduce((acc, p) => acc + p.body.translation().x + p.body.translation().y * 3, 0)
      const out = `${n}:${sig.toFixed(3)}:${sim.guardsStanding}`
      sim.dispose()
      return out
    }
    const a = run()
    expect(run()).toBe(a)
    expect(Number(a.split(':')[0])).toBeGreaterThan(5)
  })
})
