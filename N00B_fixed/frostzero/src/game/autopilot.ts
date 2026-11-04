import { cloneSim, respawn, stepSim, type SimInput, type SimState } from './sim'
import type { Level } from './level'

/**
 * Look-ahead autopilot. Every decision it tries short two-stage action plans in cloned
 * simulations and keeps the one that survives longest and travels furthest. Used by the test
 * suite to prove every checkpoint segment is beatable, and to measure the par time.
 */
type Plan = { steer: number; jump: 0 | 1 | 2; slam: boolean; brake: boolean }

const PLANS: Plan[] = []
for (const steer of [-1, -0.4, 0, 0.4, 1]) {
  for (const jump of [0, 1, 2] as const) PLANS.push({ steer, jump, slam: false, brake: false })
  PLANS.push({ steer, jump: 0, slam: true, brake: false })
  PLANS.push({ steer, jump: 0, slam: false, brake: true })
}
const SECOND: Plan[] = PLANS.filter(p => p.steer !== -0.4 && p.steer !== 0.4)

const SEG1 = 8
const SEG2 = 16
const COAST = 48
const DT = 1 / 60

function input(plan: Plan, i: number): SimInput {
  return { steer: plan.steer, brake: plan.brake, jumpPressed: plan.jump > 0 && i === 0, jumpHeld: plan.jump === 2, slamPressed: plan.slam && i === 0 }
}

function run(s: SimState, l: Level, plan: Plan, steps: number): number {
  for (let i = 0; i < steps; i += 1) {
    stepSim(s, l, input(plan, i), DT)
    if (s.dead) return i
    if (s.finished) return steps
  }
  return steps
}

function score(s: SimState, survived: number): number {
  if (s.dead) return survived * 10 - 1e6
  if (s.finished) return 1e7
  return s.p.z * 10 + Math.min(40, s.p.z - s.wallZ)
}

export function choose(s: SimState, l: Level): Plan {
  let best = PLANS[0]
  let bestScore = -Infinity
  for (const a of PLANS) {
    const s1 = cloneSim(s)
    const k1 = run(s1, l, a, SEG1)
    if (s1.dead) {
      const sc = score(s1, k1)
      if (sc > bestScore) {
        bestScore = sc
        best = a
      }
      continue
    }
    let aBest = -Infinity
    for (const b of SECOND) {
      const s2 = cloneSim(s1)
      let k = SEG1 + run(s2, l, b, SEG2)
      if (!s2.dead && !s2.finished) k += run(s2, l, { ...b, jump: 0, slam: false }, COAST)
      aBest = Math.max(aBest, score(s2, k))
      if (aBest >= 1e7) break
    }
    // Slightly prefer not braking and not steering when outcomes tie.
    const sc = aBest - (a.brake ? 0.5 : 0) - Math.abs(a.steer) * 0.05
    if (sc > bestScore) {
      bestScore = sc
      best = a
    }
  }
  return best
}

export type BotReport = { finished: boolean; seconds: number; deaths: { z: number; cause: string; cp: number }[]; minGap: number[] }

/** Play the whole level (respawning at checkpoints) and report what happened. */
export function autoplay(l: Level, start: SimState, maxSeconds = 600, decideEvery = 6): BotReport {
  const s = start
  const deaths: BotReport['deaths'] = []
  const minGap: number[] = l.checkpoints.map(() => Infinity)
  let steps = 0
  let plan: Plan = PLANS[0]
  let planStep = 0
  while (steps < maxSeconds * 60) {
    if (steps % decideEvery === 0) {
      plan = choose(s, l)
      planStep = 0
    }
    stepSim(s, l, input(plan, planStep), DT)
    planStep += 1
    steps += 1
    minGap[s.cp] = Math.min(minGap[s.cp], s.p.z - s.wallZ)
    if (s.finished) return { finished: true, seconds: steps * DT, deaths, minGap }
    if (s.dead) {
      deaths.push({ z: Math.round(s.p.z), cause: s.dead, cp: s.cp })
      if (deaths.length > 80) break
      respawn(s, l)
      steps = Math.ceil(steps / decideEvery) * decideEvery
    }
  }
  return { finished: false, seconds: steps * DT, deaths, minGap }
}
