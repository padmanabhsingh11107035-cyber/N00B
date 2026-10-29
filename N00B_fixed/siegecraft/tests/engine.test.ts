import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it } from 'vitest'
import { initPhysics } from '../src/engine/physics'
import { SleepManager } from '../src/engine/sleep'
import { pulseValue, TimeScale } from '../src/engine/timescale'

describe('TimeScale', () => {
  it('eases into a pulse, holds, and returns to 1', () => {
    const ts = new TimeScale()
    ts.pulse({ scale: 0.2, hold: 0.5, easeIn: 0.1, easeOut: 0.2 })
    expect(ts.update(0.05)).toBeLessThan(1)
    expect(ts.update(0.1)).toBeCloseTo(0.2, 5)
    ts.update(0.5)
    expect(ts.update(0.3)).toBe(1)
    expect(ts.active).toBe(false)
  })
  it('lets the strongest pulse win and replaces pulses by id', () => {
    const ts = new TimeScale()
    ts.pulse({ scale: 0.5, hold: 1, easeIn: 0 })
    ts.pulse({ scale: 0.25, hold: 1, easeIn: 0, id: 'hit' })
    expect(ts.update(0.01)).toBeCloseTo(0.25, 5)
    ts.pulse({ scale: 0.4, hold: 1, easeIn: 0, id: 'hit' })
    expect(ts.update(0.01)).toBeCloseTo(0.4, 5)
    ts.clear()
    expect(ts.update(0.01)).toBe(1)
  })
  it('pulse curve is continuous at the boundaries', () => {
    const p = { scale: 0.3, hold: 0.2, easeIn: 0.1, easeOut: 0.3 }
    expect(pulseValue({ ...p, age: 0 })).toBeCloseTo(1, 5)
    expect(pulseValue({ ...p, age: 0.1 })).toBeCloseTo(0.3, 5)
    expect(pulseValue({ ...p, age: 0.6 })).toBe(1)
  })
})

describe('SleepManager', () => {
  beforeAll(async () => {
    await initPhysics()
  })
  it('puts a resting stack to sleep and keeps the count within budget', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    world.createCollider(RAPIER.ColliderDesc.cuboid(20, 0.5, 20).setTranslation(0, -0.5, 0))
    const sleep = new SleepManager(world)
    for (let i = 0; i < 6; i += 1) {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0.5 + i * 1.001, 0))
      world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5), body)
      sleep.track(body, { tag: 'block' })
    }
    let stats = sleep.step(1 / 60)
    for (let i = 0; i < 240; i += 1) {
      world.step()
      stats = sleep.step(1 / 60)
    }
    expect(stats.total).toBe(6)
    expect(stats.awake).toBe(0)
    world.free()
  })
})
