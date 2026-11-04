import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { defaultSave, parseSave, recordHunt } from '../src/engine/save'
import { CONFIG } from '../src/game/config'
import { MONSTERS, monsterById, sourceQuaternion } from '../src/game/monsters/defs'
import {
  breakPart,
  createHunt,
  createVitals,
  dealDamage,
  formatClock,
  heal,
  hunterDamage,
  monsterDamage,
  rankHunt,
  recordFaint,
  regenRed,
  regenStamina,
  spendStamina,
  takeHit,
  tickHunt,
} from '../src/game/rules'
import { clampToArena, heightAt, resolveObstacles, SPIRES } from '../src/game/terrain'

describe('hunt state', () => {
  it('wins when the monster reaches zero', () => {
    let s = createHunt('mossback', 100, 3)
    const a = dealDamage(s, 60, true)
    expect(a.killed).toBe(false)
    expect(a.state.vitalStrikes).toBe(1)
    s = a.state
    const b = dealDamage(s, 60)
    expect(b.killed).toBe(true)
    expect(b.state.phase).toBe('won')
    expect(b.state.monsterHp).toBe(0)
    // Further damage is ignored once the hunt is over.
    expect(dealDamage(b.state, 10).state).toBe(b.state)
  })
  it('loses after the faint limit or when time runs out', () => {
    let s = createHunt('mossback', 100, 3)
    for (let i = 0; i < CONFIG.hunt.maxFaints; i += 1) s = recordFaint(s)
    expect(s.phase).toBe('lost')
    expect(s.loseReason).toBe('faints')
    const t = tickHunt(createHunt('mossback', 100, 3), CONFIG.hunt.timeLimit + 1)
    expect(t.phase).toBe('lost')
    expect(t.loseReason).toBe('time')
  })
  it('records each broken part once', () => {
    const s = breakPart(breakPart(createHunt('m', 10, 3), 'head'), 'head')
    expect(s.partsBroken).toEqual(['head'])
  })
  it('ranks only won hunts and rewards clean fast kills', () => {
    const lost = createHunt('m', 10, 3)
    expect(rankHunt(lost)).toBe('-')
    const won = { ...dealDamage(createHunt('m', 10, 3), 20).state, elapsed: 120, partsBroken: ['head', 'back', 'tail'] }
    const slow = { ...won, elapsed: CONFIG.hunt.timeLimit - 1, partsBroken: [], faints: 2 }
    const order = ['S', 'A', 'B', 'C']
    expect(order.indexOf(rankHunt(won))).toBeLessThan(order.indexOf(rankHunt(slow)))
  })
  it('formats the hunt clock', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(65.9)).toBe('1:05')
  })
})

describe('hunter vitals', () => {
  it('leaves recoverable red health after a hit and regenerates it', () => {
    const v = takeHit(createVitals(), 40)
    expect(v.hp).toBe(CONFIG.hunter.maxHealth - 40)
    expect(v.red).toBeGreaterThan(0)
    const r = regenRed(v, 100, 10)
    expect(r.red).toBe(0)
    expect(r.hp).toBeGreaterThan(v.hp)
    expect(r.hp).toBeLessThanOrEqual(r.max)
  })
  it('heals without exceeding max health', () => {
    const v = heal(takeHit(createVitals(), 10), 999)
    expect(v.hp).toBe(v.max)
  })
  it('refuses actions when exhausted and regenerates after the delay', () => {
    const tired = { ...createVitals(), stamina: 2 }
    expect(spendStamina(tired, 20)).toBeNull()
    const spent = spendStamina(createVitals(), 30)!
    expect(spent.stamina).toBe(CONFIG.hunter.maxStamina - 30)
    const waiting = regenStamina(spent, 0.01, 50)
    expect(waiting.stamina).toBe(spent.stamina)
    let v = spent
    for (let i = 0; i < 200; i += 1) v = regenStamina(v, 0.05, 50)
    expect(v.stamina).toBe(v.maxStamina)
  })
})

describe('damage', () => {
  it('vital and mounted strikes hit harder than plain ones', () => {
    const plain = hunterDamage(50, 1, 1)
    expect(hunterDamage(50, 1, 1, { vital: true })).toBeGreaterThan(plain)
    expect(hunterDamage(50, 1, 1.4)).toBeGreaterThan(plain)
    expect(hunterDamage(0.01, 0.01, 0.01)).toBe(1)
  })
  it('enraged monsters deal more damage', () => {
    expect(monsterDamage(40, 1, true)).toBeGreaterThan(monsterDamage(40, 1, false))
  })
})

describe('saves', () => {
  it('falls back to defaults on corrupt data', () => {
    expect(parseSave('{not json')).toEqual(defaultSave())
    expect(parseSave(null, 'low').settings.quality).toBe('low')
  })
  it('keeps the best time and rank per quarry', () => {
    let d = defaultSave()
    d = recordHunt(d, 'mossback', 500, 'B').data
    const better = recordHunt(d, 'mossback', 300, 'A')
    expect(better.isBest).toBe(true)
    const worse = recordHunt(better.data, 'mossback', 900, 'C')
    expect(worse.isBest).toBe(false)
    expect(worse.data.records.mossback.bestTime).toBe(300)
    expect(worse.data.records.mossback.hunts).toBe(3)
    expect(parseSave(JSON.stringify(worse.data)).records.mossback.bestTime).toBe(300)
  })
})

describe('monster registry', () => {
  it('has unique ids, abilities and three vital points each', () => {
    expect(new Set(MONSTERS.map(m => m.id)).size).toBe(MONSTERS.length)
    for (const m of MONSTERS) {
      expect(m.abilities.length).toBeGreaterThanOrEqual(5)
      expect(m.vitals.map(v => v.slot).sort()).toEqual(['back', 'head', 'tail'])
      expect(m.stats.hp).toBeGreaterThan(0)
    }
    expect(monsterById('unknown')).toBe(MONSTERS[0])
  })
  it('registry orientation corrects each authored source facing to +Z forward, +Y up', () => {
    for (const m of MONSTERS) {
      const src = new THREE.Quaternion(...sourceQuaternion(m.plan.sourceFacing))
      const fix = new THREE.Quaternion(...m.orientation)
      const total = fix.multiply(src)
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(total)
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(total)
      expect(fwd.z, m.id).toBeCloseTo(1, 4)
      expect(up.y, m.id).toBeCloseTo(1, 4)
    }
  })
})

describe('terrain', () => {
  it('is deterministic and keeps actors inside the arena and outside spires', () => {
    expect(heightAt(12.5, -7.25)).toBe(heightAt(12.5, -7.25))
    const far = clampToArena({ x: 9999, z: 0 }, 1)
    expect(Math.hypot(far.x, far.z)).toBeLessThan(9999)
    const s = SPIRES[0]
    const p = resolveObstacles({ x: s.x, z: s.z + 0.01 }, 1)
    expect(Math.hypot(p.x - s.x, p.z - s.z)).toBeGreaterThanOrEqual(s.r)
  })
})

describe('monster roster (ground-level attacks)', () => {
  it('every quarry has the Rupture ground attack and a full moveset', () => {
    for (const m of MONSTERS) {
      const ids = m.abilities.map(a => a.id)
      expect(ids).toContain('rupture')
      for (const id of ['bite', 'tail', 'charge', 'slam', 'volley', 'roar']) expect(ids).toContain(id)
    }
  })
  it('bite and tail strike depths are tuned so strikes graze the ground', () => {
    for (const m of MONSTERS) {
      expect(m.plan.strike.bite).toBeGreaterThan(0.3)
      expect(m.plan.strike.bite).toBeLessThanOrEqual(1)
      expect(m.plan.strike.tail).toBeGreaterThan(0.05)
      expect(m.plan.strike.tail).toBeLessThanOrEqual(1)
    }
  })
})

describe('phase 4: signatures and mesh skeletons', () => {
  it('every quarry has a unique enraged signature move', async () => {
    const names = new Set<string>()
    for (const m of MONSTERS) {
      const sig = m.abilities.find(a => a.id === 'signature')
      expect(sig, m.id).toBeTruthy()
      expect(sig!.damage).toBeGreaterThan(0)
      names.add(sig!.name)
    }
    expect(names.size).toBe(MONSTERS.length)
  })
  it('every quarry has a mesh skeleton with feet on the ground and distinct body plans', async () => {
    const { SKELETONS } = await import('../src/game/monsters/skeletons')
    const legCounts = new Set<number>()
    for (const m of MONSTERS) {
      const s = SKELETONS[m.id as keyof typeof SKELETONS]
      expect(s, m.id).toBeTruthy()
      expect(s.legs.length).toBeGreaterThanOrEqual(2)
      for (const l of s.legs) expect(Math.abs(l.foot[1])).toBeLessThan(1.2)
      legCounts.add(s.legs.length)
    }
    // Not every monster is a four-legged dino.
    expect(legCounts.size).toBeGreaterThan(1)
  })
})

describe('hunter animation: procedural layers never compound', () => {
  // A clip that holds a bone perfectly still is exactly the case where three.js skips the write.
  const setup = () => {
    const root = new THREE.Object3D()
    const spine = new THREE.Bone()
    spine.name = 'spine_01'
    root.add(spine)
    const held = new THREE.QuaternionKeyframeTrack('spine_01.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1])
    const clip = new THREE.AnimationClip('Hold', 1, [held])
    const mixer = new THREE.AnimationMixer(root)
    mixer.clipAction(clip).play()
    return { root, spine, clip, mixer }
  }
  const bend = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.1)
  const angle = (q: THREE.Quaternion) => 2 * Math.acos(Math.min(1, Math.abs(q.w)))

  it('reproduces the three.js skip: without a restore the bend accumulates', () => {
    const { spine, mixer } = setup()
    for (let i = 0; i < 20; i += 1) {
      mixer.update(1 / 60)
      spine.quaternion.premultiply(bend)
    }
    expect(angle(spine.quaternion)).toBeGreaterThan(1)
  })

  it('ClipPoseCache keeps the procedural bend at exactly one layer', async () => {
    const { ClipPoseCache } = await import('../src/game/clipPose')
    const { root, spine, clip, mixer } = setup()
    const cache = new ClipPoseCache(root, [clip])
    expect(cache.size).toBe(1)
    for (let i = 0; i < 20; i += 1) {
      cache.restore()
      mixer.update(1 / 60)
      cache.capture()
      spine.quaternion.premultiply(bend)
    }
    expect(angle(spine.quaternion)).toBeCloseTo(0.1, 5)
  })
})
