import { CONFIG } from './config'
import { tuning } from './tuning'

/**
 * Pure run rules: clock, deaths, checkpoints, finish and ranking. No three.js, no DOM; the
 * scene reports events and reads the state. Unit tested in tests/rules.test.ts.
 */
export type RunPhase = 'playing' | 'won'
export type Rank = 'S' | 'A' | 'B' | 'C'
export type RunState = {
  phase: RunPhase
  elapsed: number
  deaths: number
  checkpoint: number
  /** Deaths since the last checkpoint (drives the "keep trying" encouragement). */
  streak: number
  /** Gameplay-tuned runs remain playable but are not eligible for ranked local records. */
  unranked: boolean
  rank?: Rank
}

/** Reference time for a clean, well-boosted run (measured by the autopilot test). */
export const PAR_SECONDS = 69

export function createRun(): RunState {
  tuning.activate('run')
  return { phase: 'playing', elapsed: 0, deaths: 0, checkpoint: 0, streak: 0, unranked: tuning.unranked }
}

export function tick(s: RunState, dt: number): RunState {
  if (s.phase !== 'playing') return s
  return { ...s, elapsed: s.elapsed + dt }
}

export function die(s: RunState): RunState {
  if (s.phase !== 'playing') return s
  return { ...s, deaths: s.deaths + 1, streak: s.streak + 1 }
}

export function reachCheckpoint(s: RunState, index: number): RunState {
  if (s.phase !== 'playing' || index <= s.checkpoint) return s
  return { ...s, checkpoint: index, streak: 0 }
}

export function finish(s: RunState): RunState {
  if (s.phase !== 'playing') return s
  return { ...s, phase: 'won', rank: rankOf(s.elapsed, s.deaths) }
}

/** Time plus a per-death penalty, compared against par. */
export function rankOf(seconds: number, deaths: number, par = PAR_SECONDS): Rank {
  const score = seconds + deaths * CONFIG.run.deathPenalty
  if (deaths <= 1 && score <= par * 1.12) return 'S'
  if (score <= par * 1.45) return 'A'
  if (score <= par * 2.2) return 'B'
  return 'C'
}

const RANK_ORDER: Rank[] = ['C', 'B', 'A', 'S']
export function betterRank(a: Rank | '', b: Rank): boolean {
  return a === '' || RANK_ORDER.indexOf(b) > RANK_ORDER.indexOf(a)
}

/** `83.456` → `1:23.45`. */
export function formatTime(seconds: number): string {
  const cs = Math.max(0, Math.floor(seconds * 100))
  const m = Math.floor(cs / 6000)
  const s = Math.floor((cs % 6000) / 100)
  const c = cs % 100
  return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`
}
