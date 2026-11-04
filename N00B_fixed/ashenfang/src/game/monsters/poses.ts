import type { AttackId } from './defs'
import type { Pose } from './animator'
import { restPose } from './animator'

/**
 * Pose library: pure functions that write a target `Pose` for each behaviour at a given phase
 * progress. The hunt AI and the /enemies preview both use these, so what you inspect in the
 * library is exactly what you fight.
 */
export type Phase = 'windup' | 'active' | 'recover'
export type Timing = { windup: number; active: number; recover: number }

export const BASE_TIMING: Record<AttackId, Timing> = {
  bite: { windup: 0.6, active: 0.3, recover: 0.9 },
  tail: { windup: 0.75, active: 0.7, recover: 1.0 },
  charge: { windup: 0.95, active: 2.4, recover: 1.3 },
  slam: { windup: 1.05, active: 0.24, recover: 1.6 },
  volley: { windup: 1.15, active: 0.45, recover: 1.1 },
  rupture: { windup: 1.0, active: 0.3, recover: 1.5 },
  roar: { windup: 0.5, active: 1.7, recover: 0.6 },
  signature: { windup: 1.8, active: 3.0, recover: 1.8 },
}

/** Wind-up scales with the quarry's telegraph stat; rage shortens every wind-up. */
export function timing(id: AttackId, telegraph: number, enraged: boolean): Timing {
  const b = BASE_TIMING[id]
  const w = telegraph * (enraged ? 0.88 : 1)
  return { windup: b.windup * w, active: b.active, recover: b.recover * (enraged ? 0.85 : 1) }
}

const REST = restPose()
export function setRest(p: Pose): Pose {
  return Object.assign(p, REST)
}

const ease = (k: number) => k * k * (3 - 2 * k)
const lerp = (a: number, b: number, k: number) => a + (b - a) * k

/** Walk → run blend. `run` 0..1, `limp` adds a hobble when weakened. */
export function locomotion(p: Pose, speed: number, run: number, time: number, limp = 0): void {
  setRest(p)
  const bob = Math.sin(time * (3 + run * 5)) * (0.06 + run * 0.18) * Math.min(1, speed / 2)
  p.bodyY = bob - run * 0.35
  p.bodyPitch = run * 0.08
  p.neckPitch = 0.08 + run * 0.22
  p.headPitch = run * 0.1
  p.tailPitch = run * 0.25
  p.tailWave = 1 - run * 0.5
  p.bodyRoll = limp * Math.sin(time * 3.2) * 0.1
}

export function grazePose(p: Pose, k: number, time: number): void {
  setRest(p)
  const w = Math.sin(Math.min(1, k) * Math.PI)
  p.neckPitch = 0.9 * w
  p.headPitch = 0.45 * w
  p.jaw = 0.04 + Math.max(0, Math.sin(time * 5)) * 0.15 * w
  p.bodyPitch = 0.08 * w
}

/** Per-quarry strike depth: 0 = shallow legacy pose, 1 = deepest; tuned so strikes graze the ground. */
export type StrikeDepth = { bite: number; tail: number }
const DEFAULT_STRIKE: StrikeDepth = { bite: 0.55, tail: 0.3 }

export function attackPose(p: Pose, id: AttackId, phase: Phase, k: number, time: number, strike: StrikeDepth = DEFAULT_STRIKE): void {
  setRest(p)
  const mixB = (a: number, b: number) => a + (b - a) * strike.bite
  const mixT = (a: number, b: number) => a + (b - a) * strike.tail
  const e = ease(Math.min(1, Math.max(0, k)))
  switch (id) {
    case 'bite':
      // Rear back, then plunge the jaws all the way down to the hunter's level.
      if (phase === 'windup') {
        p.neckPitch = -0.45 * e
        p.headPitch = -0.35 * e
        p.jaw = 0.1 + 0.65 * e
        p.bodyY = -0.25 * e
        p.bodyPitch = -0.08 * e
        p.eyeGlow = 1 + e * 1.5
        p.shake = e * 0.5
      } else if (phase === 'active') {
        p.neckPitch = lerp(-0.45, mixB(0.65, 1.25), e)
        p.headPitch = lerp(-0.35, mixB(0.3, 0.75), e)
        p.jaw = k < 0.6 ? 0.85 : 0.05
        p.bodyPitch = lerp(-0.08, mixB(0.14, 0.3), e)
        p.bodyY = lerp(-0.25, mixB(-0.5, -1.1), e)
        p.frontReach = 0.35 * e
        p.eyeGlow = 2.5
      } else {
        const r = 1 - e
        const hold = k < 0.4 ? 1 : r
        p.neckPitch = mixB(0.65, 1.25) * hold
        p.headPitch = mixB(0.3, 0.75) * hold
        p.bodyPitch = mixB(0.14, 0.3) * hold
        p.bodyY = mixB(-0.5, -1.1) * hold
        p.frontReach = 0.35 * hold
      }
      break
    case 'tail':
      // Coil, crouch and drag the tail flat across the ground in a full sweep.
      if (phase === 'windup') {
        p.bodyYaw = 0.3 * e
        p.tailYaw = -1.1 * e
        p.tailPitch = 0.3 * e
        p.bodyY = -0.6 * e
        p.neckYaw = 0.4 * e
        p.neckPitch = 0.25 * e
        p.eyeGlow = 1 + e
        p.shake = e * 0.4
      } else if (phase === 'active') {
        p.bodyYaw = lerp(0.3, -0.2, e)
        p.tailYaw = lerp(-1.1, 0.7, e)
        p.tailPitch = mixT(0.2, -1.05)
        p.bodyY = mixT(-0.35, -1.0)
        p.bodyPitch = -0.12
        p.neckYaw = lerp(0.4, -0.5, e)
        p.neckPitch = 0.25
        p.tailWave = 0
      } else {
        const r = 1 - e
        p.tailYaw = 0.7 * r
        p.tailPitch = mixT(0.2, -1.05) * r
        p.bodyYaw = -0.2 * r
        p.neckYaw = -0.5 * r
        p.bodyY = mixT(-0.35, -1.0) * r
        p.bodyPitch = -0.12 * r
      }
      break
    case 'charge':
      // Horns-down battering run: the head ploughs along at hunter height.
      if (phase === 'windup') {
        p.neckPitch = 0.9 * e
        p.headPitch = 0.45 * e
        p.bodyY = -0.9 * e
        p.bodyPitch = 0.2 * e
        p.tailPitch = 0.4 * e
        p.frontLift = Math.max(0, Math.sin(time * 9)) * 0.25 * e
        p.frontReach = -0.4
        p.eyeGlow = 1 + e * 1.8
        p.jaw = 0.25 * e
      } else if (phase === 'active') {
        p.neckPitch = 1.0
        p.headPitch = 0.5
        p.bodyY = -0.8 + Math.sin(time * 9) * 0.2
        p.bodyPitch = 0.2
        p.tailPitch = 0.3
        p.tailWave = 0.3
        p.eyeGlow = 2.4
        p.jaw = 0.3
      } else {
        const r = 1 - e
        p.bodyPitch = -0.12 * r
        p.bodyRoll = 0.12 * r
        p.neckPitch = 0.4 * r
        p.bodyY = -0.3 * r
      }
      break
    case 'slam':
      if (phase === 'windup') {
        p.bodyPitch = -0.72 * e
        p.bodyY = 1.4 * e
        p.frontLift = e
        p.frontReach = 0.6
        p.neckPitch = -0.25 * e
        p.headPitch = 0.35 * e
        p.jaw = 0.5 * e
        p.tailPitch = -0.35 * e
        p.eyeGlow = 1 + e * 1.8
      } else if (phase === 'active') {
        p.bodyPitch = lerp(-0.72, 0.22, e)
        p.bodyY = lerp(1.4, -0.9, e)
        p.frontLift = 1 - e
        p.frontReach = 0.6
        p.neckPitch = lerp(-0.25, 0.6, e)
        p.headPitch = 0.25
        p.jaw = 0.3
        p.eyeGlow = 2.5
      } else {
        const hold = k < 0.65 ? 1 : 1 - ease((k - 0.65) / 0.35)
        p.bodyPitch = 0.18 * hold
        p.bodyY = -0.95 * hold
        p.neckPitch = 0.8 * hold
        p.headPitch = 0.4 * hold
        p.jaw = 0.2 * hold
      }
      break
    case 'volley':
      if (phase === 'windup') {
        p.plateGlow = 3.2 * e
        p.shake = 0.6 + e * 0.8
        p.bodyY = -0.35 * e
        p.neckPitch = -0.3 * e
        p.jaw = 0.3 * e
        p.tailPitch = 0.3 * e
        p.eyeGlow = 1 + e
      } else if (phase === 'active') {
        p.plateGlow = lerp(3.2, 1.2, e)
        p.bodyY = 0.35 * (1 - e)
        p.neckPitch = -0.4
        p.jaw = 0.5
      } else {
        const r = 1 - e
        p.plateGlow = 1.2 * r
        p.neckPitch = -0.4 * r
      }
      break
    case 'rupture':
      // Rear onto the hind legs, glow building in the plates, then drive forelegs and jaws into the earth.
      if (phase === 'windup') {
        p.bodyPitch = -0.45 * e
        p.bodyY = 0.8 * e
        p.frontLift = 0.8 * e
        p.frontReach = 0.3
        p.neckPitch = -0.35 * e
        p.headPitch = -0.2 * e
        p.jaw = 0.6 * e
        p.tailPitch = -0.2 * e
        p.plateGlow = 2.6 * e
        p.eyeGlow = 1 + e * 1.8
        p.shake = 0.3 + e * 0.9
      } else if (phase === 'active') {
        p.bodyPitch = lerp(-0.45, 0.28, e)
        p.bodyY = lerp(0.8, -1.0, e)
        p.frontLift = 0.8 * (1 - e)
        p.frontReach = 0.5
        p.neckPitch = lerp(-0.35, mixB(0.65, 1.25), e)
        p.headPitch = lerp(-0.2, mixB(0.3, 0.75), e)
        p.jaw = 0.4
        p.plateGlow = 3.2
        p.eyeGlow = 2.6
      } else {
        const hold = k < 0.55 ? 1 : 1 - ease((k - 0.55) / 0.45)
        p.bodyPitch = 0.28 * hold
        p.bodyY = -1.0 * hold
        p.frontReach = 0.5 * hold
        p.neckPitch = mixB(0.65, 1.25) * hold
        p.headPitch = mixB(0.3, 0.75) * hold
        p.plateGlow = 3.2 * hold
        p.shake = 0.5 * hold
      }
      break
    case 'signature': {
      // Wind-up: a rising, trembling roar. Active: three pounding slams. Recover: the heavy slam settle.
      if (phase === 'windup') {
        const w = k < 0.6
        attackPose(p, 'roar', w ? 'windup' : 'active', w ? k / 0.6 : (k - 0.6) / 0.4, time, strike)
        p.shake = Math.max(p.shake ?? 0, 0.7 * e)
        p.eyeGlow = 3
        p.plateGlow = 1 + e
      } else if (phase === 'active') {
        const c = (k * 3) % 1
        attackPose(p, 'slam', c < 0.7 ? 'windup' : 'active', c < 0.7 ? c / 0.7 : (c - 0.7) / 0.3, time, strike)
        p.eyeGlow = 3
        p.plateGlow = 2
      } else {
        attackPose(p, 'slam', 'recover', k, time, strike)
        p.plateGlow = 1.2 * (1 - e)
      }
      return
    }
    case 'roar':
      if (phase === 'windup') {
        p.neckPitch = 0.35 * e
        p.headPitch = 0.2 * e
        p.bodyY = -0.3 * e
      } else if (phase === 'active') {
        p.neckPitch = -0.55
        p.headPitch = -0.4
        p.jaw = 1.0
        p.bodyY = 0.15
        p.bodyPitch = -0.12
        p.shake = 1.2
        p.eyeGlow = 2.6
        p.plateGlow = 0.8
      } else {
        const r = 1 - e
        p.neckPitch = -0.55 * r
        p.headPitch = -0.4 * r
        p.jaw = 1.0 * r
      }
      break
  }
}

export function flinchPose(p: Pose, k: number, dir: number): void {
  setRest(p)
  const w = Math.sin(Math.min(1, k) * Math.PI)
  p.headPitch = -0.35 * w
  p.neckPitch = -0.2 * w
  p.neckYaw = 0.5 * dir * w
  p.bodyRoll = 0.14 * dir * w
  p.bodyY = -0.3 * w
  p.jaw = 0.5 * w
}

/** Knocked onto its side: `k` 0..1 over the downed time, last 18% is getting up. */
export function topplePose(p: Pose, k: number, time: number): void {
  setRest(p)
  const down = k < 0.12 ? ease(k / 0.12) : k > 0.82 ? 1 - ease((k - 0.82) / 0.18) : 1
  p.bodyRoll = 1.3 * down
  p.bodyY = -2.6 * down
  p.flail = down
  p.neckPitch = 0.3 * down
  p.headPitch = 0.1 * down
  p.jaw = (0.25 + Math.max(0, Math.sin(time * 4)) * 0.2) * down
  p.tailWave = 0.4
  p.eyeGlow = 0.8
}

export function thrashPose(p: Pose, phase: 'warn' | 'buck' | 'idle', k: number, time: number): void {
  setRest(p)
  if (phase === 'warn') {
    const e = ease(k)
    p.bodyY = -0.55 * e
    p.shake = 0.8 + e
    p.neckPitch = 0.2 * e
    p.eyeGlow = 1.5 + e
  } else if (phase === 'buck') {
    const s = Math.sin(k * Math.PI)
    p.bodyY = 0.9 * s
    p.bodyRoll = Math.sin(time * 16) * 0.32 * s
    p.bodyPitch = -0.3 * s
    p.neckPitch = -0.4 * s
    p.jaw = 0.7 * s
    p.eyeGlow = 2.4
  } else {
    p.bodyRoll = Math.sin(time * 2.2) * 0.08
    p.neckYaw = Math.sin(time * 1.4) * 0.3
    p.jaw = 0.2
  }
}

export function deathPose(p: Pose, k: number): void {
  setRest(p)
  const e = ease(Math.min(1, k))
  p.bodyRoll = 1.38 * e
  p.bodyY = -2.9 * e
  p.neckPitch = 0.7 * e
  p.headPitch = 0.4 * e
  p.jaw = 0.4 * e
  p.tailWave = 1 - e
  p.eyeGlow = 1 - e
  p.flail = e > 0.2 && e < 0.7 ? 0.6 : 0
}

/** Preview behaviours for the /enemies library; loops seamlessly. */
export type PreviewBehaviour = 'idle' | 'walk' | 'run' | AttackId | 'flinch' | 'topple' | 'thrash' | 'death'
export const PREVIEW_BEHAVIOURS: PreviewBehaviour[] = ['idle', 'walk', 'run', 'bite', 'tail', 'charge', 'slam', 'volley', 'rupture', 'roar', 'signature', 'flinch', 'topple', 'thrash', 'death']

export function previewDuration(b: PreviewBehaviour): number {
  if (b in BASE_TIMING) {
    const t = BASE_TIMING[b as AttackId]
    return t.windup + t.active + t.recover + 0.8
  }
  return b === 'topple' ? 6 : b === 'death' ? 4.5 : b === 'thrash' ? 2.6 : b === 'flinch' ? 1.6 : 4
}

/** Writes the pose for behaviour `b` at time `t` into `p`; returns a treadmill speed. */
export function previewPose(p: Pose, b: PreviewBehaviour, t: number, time: number, walk: number, run: number, strike?: StrikeDepth): number {
  if (b === 'idle') {
    setRest(p)
    p.neckYaw = Math.sin(time * 0.5) * 0.3
    return 0
  }
  if (b === 'walk') {
    locomotion(p, walk, 0, time)
    return walk
  }
  if (b === 'run') {
    locomotion(p, run, 1, time)
    return run * 0.6
  }
  if (b === 'flinch') {
    flinchPose(p, Math.min(1, t / 1), 1)
    return 0
  }
  if (b === 'topple') {
    topplePose(p, Math.min(1, t / 5.2), time)
    return 0
  }
  if (b === 'thrash') {
    const phase = t < 0.9 ? 'warn' : t < 1.4 ? 'buck' : 'idle'
    thrashPose(p, phase, phase === 'warn' ? t / 0.9 : phase === 'buck' ? (t - 0.9) / 0.5 : 0, time)
    return 0
  }
  if (b === 'death') {
    deathPose(p, t / 2.5)
    return 0
  }
  const tm = BASE_TIMING[b]
  if (t < tm.windup) attackPose(p, b, 'windup', t / tm.windup, time, strike)
  else if (t < tm.windup + tm.active) attackPose(p, b, 'active', (t - tm.windup) / tm.active, time, strike)
  else if (t < tm.windup + tm.active + tm.recover) attackPose(p, b, 'recover', (t - tm.windup - tm.active) / tm.recover, time, strike)
  else setRest(p)
  return b === 'charge' && t > tm.windup && t < tm.windup + tm.active ? run * 0.5 : 0
}
