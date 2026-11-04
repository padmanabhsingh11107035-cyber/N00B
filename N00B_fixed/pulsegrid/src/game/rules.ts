import { CONFIG, type GameConfig } from './config'

/**
 * Pure performance rules: judging, score, combo, energy, fever, rank and rival simulation.
 * No three.js, no DOM, no audio — the scene reports judged rounds and reads the resulting state.
 */
export type Grade = 'perfect' | 'great' | 'cool' | 'bad' | 'miss'
export const GRADES: readonly Grade[] = ['perfect', 'great', 'cool', 'bad', 'miss']
export type Rank = 'S' | 'A' | 'B' | 'C' | 'D' | 'F'
export type PerfPhase = 'playing' | 'cleared' | 'failed'

export type Perf = {
  unranked: boolean
  phase: PerfPhase
  noFail: boolean
  score: number
  combo: number
  maxCombo: number
  /** Consecutive Perfects. */
  chain: number
  counts: Record<Grade, number>
  energy: number
  /** Fever gauge 0..100; fills with good grades. */
  fever: number
  /** Rounds of fever left (0 = not in fever). */
  feverRounds: number
  rounds: number
  /** Sum of per-round accuracy weights, for the accuracy percentage. */
  weight: number
  finishHit: boolean
  /** Current unbroken freestyle chain, best chain this song, and total freestyle bonus earned. */
  fsChain: number
  fsBest: number
  fsBonus: number
}

export type RoundInfo = {
  arrows: number
  finish: boolean
  /** Spotlight round: Perfect/Great score double. */
  spotlight?: boolean
  /** Freestyle link: good grades extend the chain and pay a growing bonus. */
  freestyle?: boolean
}
export type GradeResult = { state: Perf; points: number; feverStarted: boolean; failed: boolean; /** Freestyle chain bonus included in `points`. */ bonus: number; chainBroken: boolean }

const WEIGHT: Record<Grade, number> = { perfect: 1, great: 0.8, cool: 0.5, bad: 0.2, miss: 0 }

/** Grade a press `offset` seconds away from the beat (negative = early). */
export function judge(offset: number, windows: GameConfig['judge'] = CONFIG.judge): Grade {
  const ms = Math.abs(offset) * 1000
  if (ms <= windows.perfect) return 'perfect'
  if (ms <= windows.great) return 'great'
  if (ms <= windows.cool) return 'cool'
  if (ms <= windows.bad) return 'bad'
  return 'miss'
}

export function createPerf(noFail = false, rules: GameConfig = CONFIG): Perf {
  return {
    unranked: false,
    phase: 'playing',
    noFail,
    score: 0,
    combo: 0,
    maxCombo: 0,
    chain: 0,
    counts: { perfect: 0, great: 0, cool: 0, bad: 0, miss: 0 },
    energy: rules.energy.start,
    fever: 0,
    feverRounds: 0,
    rounds: 0,
    weight: 0,
    finishHit: false,
    fsChain: 0,
    fsBest: 0,
    fsBonus: 0,
  }
}

export function comboMultiplier(combo: number, rules: GameConfig = CONFIG): number {
  return 1 + Math.min(combo, rules.score.comboCap) * rules.score.comboStep
}

/** Points for one judged round (exported for popups and tests). */
export function roundPoints(grade: Grade, info: RoundInfo, combo: number, fever: boolean, rules: GameConfig = CONFIG): number {
  if (grade === 'miss') return 0
  const base = rules.score[grade]
  const arrows = 1 + info.arrows * rules.score.arrowBonus
  const spot = info.spotlight && (grade === 'perfect' || grade === 'great') ? rules.score.spotlightMultiplier : 1
  const mult = comboMultiplier(combo, rules) * (fever ? rules.score.feverMultiplier : 1) * (info.finish ? rules.score.finishMultiplier : 1) * spot
  return Math.round((base * arrows * mult) / 10) * 10
}

const CHAIN_WEIGHT: Record<Grade, number> = { perfect: 1, great: 0.75, cool: 0.5, bad: 0, miss: 0 }
/** Freestyle bonus for landing a link that makes the chain `chain` long (1-based). */
export function freestyleBonus(chain: number, grade: Grade, rules: GameConfig = CONFIG): number {
  if (chain <= 0) return 0
  return Math.round((rules.score.freestyleLink * chain * CHAIN_WEIGHT[grade]) / 10) * 10
}
/** Apply one judged round. Frozen once the performance has ended. */
export function applyGrade(s: Perf, grade: Grade, info: RoundInfo, rules: GameConfig = CONFIG): GradeResult {
  if (s.phase !== 'playing') return { state: s, points: 0, feverStarted: false, failed: false, bonus: 0, chainBroken: false }
  const good = grade === 'perfect' || grade === 'great' || grade === 'cool'
  const combo = good ? s.combo + 1 : 0
  const inFever = s.feverRounds > 0
  const fsChain = info.freestyle ? (good ? s.fsChain + 1 : 0) : s.fsChain
  const bonus = info.freestyle && good ? freestyleBonus(fsChain, grade, rules) : 0
  const chainBroken = !!info.freestyle && !good && s.fsChain > 0
  const points = roundPoints(grade, info, combo, inFever, rules) + bonus
  let fever = s.fever
  let feverRounds = inFever ? s.feverRounds - 1 : 0
  let feverStarted = false
  if (!inFever) {
    if (grade === 'miss') fever = Math.max(0, fever - rules.fever.missPenalty)
    else if (grade !== 'bad') fever = Math.min(100, fever + rules.fever[grade])
    if (fever >= 100) {
      fever = 0
      feverRounds = rules.fever.rounds
      feverStarted = true
    }
  }
  const rawEnergy = Math.max(0, Math.min(rules.energy.max, s.energy + rules.energy[grade]))
  const failed = rawEnergy <= 0 && !s.noFail
  const state: Perf = {
    ...s,
    score: s.score + points,
    combo,
    maxCombo: Math.max(s.maxCombo, combo),
    chain: grade === 'perfect' ? s.chain + 1 : 0,
    counts: { ...s.counts, [grade]: s.counts[grade] + 1 },
    energy: s.noFail ? Math.max(rawEnergy, 1) : rawEnergy,
    fever,
    feverRounds,
    rounds: s.rounds + 1,
    weight: s.weight + WEIGHT[grade],
    finishHit: s.finishHit || (info.finish && good),
    fsChain,
    fsBest: Math.max(s.fsBest, fsChain),
    fsBonus: s.fsBonus + bonus,
    phase: failed ? 'failed' : 'playing',
  }
  return { state, points, feverStarted, failed, bonus, chainBroken }
}

/** The song reached its end without failing. */
export function clearPerf(s: Perf): Perf {
  return s.phase === 'playing' ? { ...s, phase: 'cleared' } : s
}

export function accuracy(s: Perf): number {
  return s.rounds === 0 ? 0 : s.weight / s.rounds
}

export function rankFor(s: Perf): Rank {
  if (s.phase === 'failed') return 'F'
  const a = accuracy(s)
  if (a >= 0.93 && s.counts.miss === 0) return 'S'
  if (a >= 0.85) return 'A'
  if (a >= 0.7) return 'B'
  if (a >= 0.5) return 'C'
  return 'D'
}

const RANK_ORDER: Rank[] = ['F', 'D', 'C', 'B', 'A', 'S']
export function betterRank(a: Rank, b: Rank): boolean {
  return RANK_ORDER.indexOf(a) > RANK_ORDER.indexOf(b)
}

/**
 * Map a uniform roll in [0, 1) to a grade for a rival of `skill` (0..1). Higher skill shifts the
 * distribution toward Perfect; even a flawless rival misses occasionally.
 */
export function rivalGrade(skill: number, roll: number): Grade {
  const k = Math.max(0, Math.min(1, skill))
  const p = [0.08 + 0.62 * k, 0.22 + 0.06 * k, 0.28 - 0.18 * k, 0.2 - 0.14 * k]
  const miss = Math.max(0.02, 1 - p.reduce((a, b) => a + b, 0))
  const total = p.reduce((a, b) => a + b, 0) + miss
  let acc = 0
  for (let i = 0; i < 4; i += 1) {
    acc += p[i] / total
    if (roll < acc) return GRADES[i]
  }
  return 'miss'
}

/** 1-based placement of `mine` among all scores (ties favour the player). */
export function placement(all: readonly number[], mine: number): number {
  return 1 + all.filter(score => score > mine).length
}

export function ordinal(n: number): string {
  const s = n % 100
  if (s >= 11 && s <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}
