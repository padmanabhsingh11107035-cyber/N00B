import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { initPhysics } from '../src/engine/physics'
import { launchVelocity, releasePoint, type Aim } from '../src/game/aim'
import { CONFIG } from '../src/game/config'
import { LEVELS, guardCount, type LevelDef } from '../src/game/levels'
import { createRun, destroy, fire, guardDown, resolveShot, stars, type RunState } from '../src/game/rules'
import { SiegeSim } from '../src/game/sim'
import { CATAPULT_BASE, RELEASE_LOCAL } from '../src/game/layout'

/**
 * Automated playtest: a greedy "skilled player" solves ballistic shots at guards, barrels and
 * structural blocks, simulates each candidate from the current castle state and keeps the best.
 * Run with AUTOPLAY=1 (slow). It proves both castles are clearable and measures stars.
 */
const views = { create: () => new THREE.Object3D(), ball: () => new THREE.Object3D() }

function solve(target: THREE.Vector3, pitch: number): Aim | null {
  let yaw = Math.atan2(target.x - CATAPULT_BASE.x, -(target.z - CATAPULT_BASE.z))
  for (let i = 0; i < 3; i += 1) {
    const o = releasePoint(CATAPULT_BASE, yaw, RELEASE_LOCAL)
    yaw = Math.atan2(target.x - o.x, -(target.z - o.z))
  }
  const o = releasePoint(CATAPULT_BASE, yaw, RELEASE_LOCAL)
  const D = Math.hypot(target.x - o.x, target.z - o.z)
  const h = target.y - o.y
  const g = -CONFIG.physics.gravity
  const denom = 2 * Math.cos(pitch) ** 2 * (D * Math.tan(pitch) - h)
  if (denom <= 0) return null
  const v = Math.sqrt((g * D * D) / denom)
  const power = (v - CONFIG.ball.minSpeed) / (CONFIG.ball.maxSpeed - CONFIG.ball.minSpeed)
  if (power < 0.05 || power > 1 || Math.abs(yaw) > CONFIG.aim.maxYaw) return null
  return { yaw, pitch, power }
}

type ShotResult = { run: RunState; sim: SiegeSim }

function shoot(sim: SiegeSim, run: RunState, aim: Aim): RunState {
  const fired = fire(run)
  if (!fired) return run
  let r = fired
  sim.launch(releasePoint(CATAPULT_BASE, aim.yaw, RELEASE_LOCAL), launchVelocity(aim))
  let t = 0
  let hitAt = -1
  while (t < CONFIG.shot.maxWatch + 3) {
    for (const e of sim.step(1 / 60)) {
      if (e.type === 'break' && !e.fragment && e.kind !== 'guard') r = destroy(r, e.kind).state
      if (e.type === 'guardDown') r = guardDown(r).state
      if (e.type === 'ballHit') hitAt = t
    }
    t += 1 / 60
    if (hitAt >= 0 && t - hitAt > CONFIG.shot.minWatch && sim.settled()) break
  }
  return resolveShot(r)
}

function replay(level: LevelDef, shots: Aim[]): ShotResult {
  const sim = new SiegeSim(level, views)
  let run = createRun(level, guardCount(level))
  for (const a of shots) run = shoot(sim, run, a)
  return { run, sim }
}

function candidates(sim: SiegeSim): Aim[] {
  const targets: THREE.Vector3[] = []
  for (const p of sim.pieces.values()) {
    if (p.fragment || !p.alive) continue
    if ((p.kind === 'guard' && p.koAt < 0) || p.kind === 'powder') {
      const t = p.body.translation()
      targets.push(new THREE.Vector3(t.x, t.y, t.z))
    }
  }
  const blocks = [...sim.pieces.values()].filter(p => !p.fragment && p.alive && (p.kind === 'stone' || p.kind === 'wood'))
  for (let i = 0; i < 6 && blocks.length; i += 1) {
    const p = blocks[Math.floor((i * 7919) % blocks.length)]
    const t = p.body.translation()
    targets.push(new THREE.Vector3(t.x, t.y, t.z))
  }
  const out: Aim[] = []
  for (const t of targets)
    for (const pitch of [0.42, 0.62, 0.85])
      for (const dz of [0.6, 0, -0.6]) {
        const a = solve(t.clone().add(new THREE.Vector3(0, 0, dz)), pitch)
        if (a) out.push(a)
      }
  return out
}

describe.skipIf(!(globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env.AUTOPLAY)('autoplay', () => {
  it('clears both castles with a greedy skilled player', async () => {
    await initPhysics()
    const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env
    for (const level of LEVELS.filter(l => !env.ONLY || l.id === env.ONLY)) {
      const chosen: Aim[] = []
      let state = replay(level, [])
      for (let turn = 0; turn < level.ammo && state.run.phase === 'playing'; turn += 1) {
        const cands = candidates(state.sim)
        state.sim.dispose()
        let best: { aim: Aim; value: number; run: RunState } | null = null
        for (const aim of cands) {
          const r = replay(level, [...chosen, aim])
          const value = (r.run.guardsTotal - r.run.guardsLeft) * 20000 + r.run.score
          r.sim.dispose()
          if (!best || value > best.value) best = { aim, value, run: r.run }
        }
        if (!best) break
        chosen.push(best.aim)
        state = replay(level, chosen)
        console.log(`${level.id} shot ${turn + 1}: yaw ${best.aim.yaw.toFixed(3)} pitch ${best.aim.pitch} power ${best.aim.power.toFixed(3)} → guards left ${state.run.guardsLeft}, score ${state.run.score}, phase ${state.run.phase} (${cands.length} candidates)`)
      }
      console.log(`${level.id}: ${state.run.phase} with ${state.run.ammo} stones left, score ${state.run.score}, stars ${stars(state.run, level)} (thresholds ${level.stars})`)
      for (const p of state.sim.pieces.values()) if (p.kind === 'guard' && p.alive && p.koAt < 0) console.log('standing guard at', JSON.stringify(p.body.translation()))
      expect(state.run.phase).toBe('won')
      state.sim.dispose()
    }
  }, 1_800_000)
})
