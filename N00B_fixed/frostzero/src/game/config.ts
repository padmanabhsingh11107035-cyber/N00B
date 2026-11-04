/**
 * All gameplay tuning in one place. The simulation (`sim.ts`), the level builder, the autopilot
 * verification test and the view all read these numbers, so a change here stays covered.
 */
export const DEFAULT_CONFIG = {
  sim: {
    gravity: -36,
    /** Jump take-off speed; ramps add part of their vertical speed on top. */
    jump: 12.5,
    rampJumpCarry: 0.8,
    /** Extra gravity while rising with the jump button released (tap = short hop). */
    lowJumpMul: 2.4,
    /** Shift in the air: instant downward speed and heavier gravity until touchdown. */
    slamSpeed: 30,
    slamGravMul: 1.5,
    maxFall: -60,
    coyote: 0.1,
    jumpBuffer: 0.13,
    /** Shift pressed this long before take-off still slams the moment the rider is airborne. */
    slamBuffer: 0.25,
    /** Lateral carving speed and how fast it responds on the ground / in the air. */
    lateral: 13,
    groundResponse: 16,
    airResponse: 8,
    /** Platform edges forgive this much overhang (metres). */
    edgeGrace: 0.15,
    /** Landing a little below a ledge still counts as landing (metres). */
    ledgeCatch: 0.55,
    /** Holding brake scales forward speed toward this fraction. */
    brakeMul: 0.6,
    brakeResponse: 5,
    boostPad: 12,
    boostSlam: 6,
    /** A slam only boosts after a real drop (seconds airborne), so hop-slam spam gains nothing. */
    slamBoostAir: 0.6,
    boostDecay: 0.85,
    boostMax: 18,
    railBonus: 4.5,
    railSnap: 0.9,
    crumbleDelay: 0.42,
    baseSpeedStart: 25.5,
    baseSpeedEnd: 37.5,
    /** The avalanche runs this much faster than the base speed (per-section override). */
    wallExtra: 2.8,
    wallStartGap: 36,
    wallMaxGap: 56,
    /** Falling this far below the slope line is a death. */
    killDepth: 16,
    /** Downhill grade of the whole run (metres of drop per metre forward). */
    grade: 0.05,
  },
  player: { hx: 0.42, hy: 0.8, hz: 0.42 },
  camera: { fov: 68, fovMax: 106, distance: 6.3, height: 2.55, lookAhead: 14 },
  run: {
    respawnDelay: 0.62,
    /** Seconds added per death when ranking a finished run. */
    deathPenalty: 4,
  },
} as const

type Mutable<T> = { -readonly [K in keyof T]: T[K] extends object ? Mutable<T[K]> : T[K] }

/** Active values are copied from source defaults so Preview Apply never mutates source data. */
export const CONFIG: Mutable<typeof DEFAULT_CONFIG> = structuredClone(DEFAULT_CONFIG)
