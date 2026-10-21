// Shared, dependency-free scoring rules for Helix Drop.
// The browser game imports this file for its score math, and the leaderboard server imports the
// same file to reject submissions that the rules could never produce.

/** Floors per stage; clearing the last floor of the last stage completes the level. */
export const STAGE_FLOORS = [10, 12, 14, 16, 18, 20]
export const TOTAL_FLOORS = STAGE_FLOORS.reduce((a, b) => a + b, 0)
/** One level = this many floors. Clearing it starts the next level straight away, and levels never run out. */
export const LEVEL_FLOORS = TOTAL_FLOORS

export const SCORE = {
  /** Points for one floor at multiplier ×1. */
  floor: 10,
  /** Multiplier = floors passed in the current fall, capped here. */
  maxMultiplier: 8,
  /** Extra points when a floor is smashed in Smash mode. */
  smash: 20,
  /** Once per floor: bouncing right next to a hazard edge. */
  nearMiss: 5,
  /** Stage n (1-based) awards n × stageClear. */
  stageClear: 50,
  /** Clearing a level (every 90 floors). */
  finish: 500,
  /** Time bonus of the original single tower (no longer paid; kept for the plausibility check below). */
  parSeconds: 150,
  perSecond: 5,
}

/** Fastest physically possible time to pass one floor (terminal velocity through the spacing). */
export const MIN_MS_PER_FLOOR = 100
export const MAX_RUN_MS = 3_600_000
export const MAX_SCORE = 100_000_000
export const RULES_VERSION = 'v1'
export const BOARD_ID = 'helix-v1'
/** "Today" for the daily tower and today's board is the UTC+8 calendar day, shared by client and server. */
export const DAY_OFFSET_HOURS = 8

export function boardDay(nowMs = Date.now()) {
  return new Date(nowMs + DAY_OFFSET_HOURS * 3_600_000).toISOString().slice(0, 10)
}

export function floorPoints(chain) {
  return SCORE.floor * Math.max(1, Math.min(chain, SCORE.maxMultiplier))
}

/** Number of fully cleared stages after passing `floors` floors (within the current level). */
export function stagesCleared(floors) {
  let left = floors % LEVEL_FLOORS
  let n = 0
  for (const f of STAGE_FLOORS) {
    if (left < f) break
    left -= f
    n += 1
  }
  return n
}

export function stageBonusTotal(stages) {
  let sum = 0
  for (let i = 1; i <= stages; i += 1) sum += i * SCORE.stageClear
  return sum
}

/** Stage bonuses collected over `floors` floors, counting every finished level. */
export function stageBonusForFloors(floors) {
  const levels = Math.floor(floors / LEVEL_FLOORS)
  return levels * stageBonusTotal(STAGE_FLOORS.length) + stageBonusTotal(stagesCleared(floors))
}

export function finishBonus(seconds) {
  return SCORE.finish + Math.max(0, Math.floor(SCORE.parSeconds - seconds)) * SCORE.perSecond
}

/**
 * Plausibility check for a submitted run. Returns null when acceptable, or a short reason code.
 * This bounds what the rules can award; it is not a replay verification.
 */
export function checkRun({ score, durationMs, floors }) {
  if (!Number.isSafeInteger(score) || !Number.isSafeInteger(durationMs) || !Number.isSafeInteger(floors)) return 'not_integer'
  if (score < 0 || score > MAX_SCORE) return 'score_bounds'
  if (floors < 0) return 'floor_bounds'
  if (durationMs < 1000 || durationMs > MAX_RUN_MS) return 'duration_bounds'
  if (score % 5 !== 0) return 'score_granularity'
  if (durationMs < floors * MIN_MS_PER_FLOOR) return 'too_fast'
  const levels = Math.floor(floors / LEVEL_FLOORS)
  const perFloorMax = SCORE.floor * SCORE.maxMultiplier + SCORE.smash + SCORE.nearMiss
  const max = floors * perFloorMax + stageBonusForFloors(floors) + levels * SCORE.finish
  if (score > max) return 'score_too_high'
  const min = floors * SCORE.floor + stageBonusForFloors(floors) + levels * SCORE.finish
  if (score < min) return 'score_too_low'
  return null
}
