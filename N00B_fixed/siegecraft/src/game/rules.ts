import { CONFIG } from './config'
import type { LevelDef, PieceKind } from './levels'

/**
 * Pure run rules: ammo, destruction score with per-shot chain multiplier, guards, win/lose and
 * stars. No three.js, no Rapier, no DOM — the scene reports events and reads the resulting state.
 */
export type RunPhase = 'playing' | 'won' | 'lost'

export type RunState = {
  level: string
  phase: RunPhase
  ammo: number
  ammoMax: number
  shots: number
  guardsTotal: number
  guardsLeft: number
  /** Destruction + guard points (chain multiplier applied). */
  score: number
  destruction: number
  guardPoints: number
  /** Destructions during the current shot, drives the chain multiplier. */
  chain: number
  bestChain: number
  destroyed: Record<'wood' | 'stone' | 'powder', number>
  elapsed: number
  /** Unused-ammo bonus, set when the level is won (already included in `score`). */
  ammoBonus: number
  /** Set when this result must not enter the saved records. */
  unranked?: boolean
}

export function createRun(level: LevelDef, guards: number): RunState {
  return {
    level: level.id,
    phase: 'playing',
    ammo: level.ammo,
    ammoMax: level.ammo,
    shots: 0,
    guardsTotal: guards,
    guardsLeft: guards,
    score: 0,
    destruction: 0,
    guardPoints: 0,
    chain: 0,
    bestChain: 0,
    destroyed: { wood: 0, stone: 0, powder: 0 },
    elapsed: 0,
    ammoBonus: 0,
  }
}

export function chainMultiplier(chain: number, rules = CONFIG): number {
  return Math.min(rules.score.chainMax, 1 + Math.max(0, chain - 1) * rules.score.chainStep)
}

/** Spend one stone. Returns null when there is no ammo left or the run is over. */
export function fire(s: RunState): RunState | null {
  if (s.phase !== 'playing' || s.ammo <= 0) return null
  return { ...s, ammo: s.ammo - 1, shots: s.shots + 1, chain: 0 }
}

/** A block or barrel was destroyed. Returns the points awarded (for popups). */
export function destroy(s: RunState, kind: Exclude<PieceKind, 'guard'>, rules = CONFIG): { state: RunState; points: number } {
  if (s.phase !== 'playing') return { state: s, points: 0 }
  const chain = s.chain + 1
  const points = Math.round(rules.score[kind] * chainMultiplier(chain, rules))
  return {
    state: {
      ...s,
      chain,
      bestChain: Math.max(s.bestChain, chain),
      score: s.score + points,
      destruction: s.destruction + points,
      destroyed: { ...s.destroyed, [kind]: s.destroyed[kind] + 1 },
    },
    points,
  }
}

/** A guard was knocked out. The level is won when the last one falls. */
export function guardDown(s: RunState, rules = CONFIG): { state: RunState; points: number } {
  if (s.phase !== 'playing' || s.guardsLeft <= 0) return { state: s, points: 0 }
  const chain = s.chain + 1
  const points = Math.round(rules.score.guard * chainMultiplier(chain, rules))
  const guardsLeft = s.guardsLeft - 1
  let next: RunState = { ...s, chain, bestChain: Math.max(s.bestChain, chain), guardsLeft, score: s.score + points, guardPoints: s.guardPoints + points }
  if (guardsLeft === 0) {
    const ammoBonus = next.ammo * rules.score.ammoBonus
    next = { ...next, phase: 'won', ammoBonus, score: next.score + ammoBonus }
  }
  return { state: next, points }
}

/** The current shot has come to rest. With guards standing and no stones left, the run is lost. */
export function resolveShot(s: RunState): RunState {
  if (s.phase !== 'playing') return s
  if (s.ammo <= 0 && s.guardsLeft > 0) return { ...s, phase: 'lost' }
  return s
}

export function tick(s: RunState, dt: number): RunState {
  return s.phase === 'playing' ? { ...s, elapsed: s.elapsed + dt } : s
}

/** 1 star for clearing, 2 and 3 at the level's score thresholds. */
export function stars(s: RunState, level: LevelDef): number {
  if (s.phase !== 'won') return 0
  let n = 1
  if (s.score >= level.stars[0]) n += 1
  if (s.score >= level.stars[1]) n += 1
  return n
}
