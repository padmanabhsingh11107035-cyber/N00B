/**
 * All gameplay tuning in one place. Change numbers here before touching game code; tests read
 * the same values so rule changes stay covered.
 */
export const DEFAULT_CONFIG = {
  /** Half-width of each timing window around the beat, in milliseconds. */
  judge: {
    perfect: 45,
    great: 85,
    cool: 130,
    bad: 190,
  },
  score: {
    perfect: 400,
    great: 280,
    cool: 160,
    bad: 40,
    /** Each arrow in the sequence adds this fraction of the base grade value. */
    arrowBonus: 0.25,
    /** Combo multiplier grows by this much per combo step, capped at `comboCap` steps. */
    comboStep: 0.025,
    comboCap: 40,
    feverMultiplier: 2,
    finishMultiplier: 3,
    /** Spotlight rounds multiply Perfect/Great points by this. */
    spotlightMultiplier: 2,
    /** Freestyle bonus per chain step: link k of an unbroken chain pays k × this (× grade weight). */
    freestyleLink: 400,
  },
  energy: {
    start: 100,
    max: 100,
    perfect: 4,
    great: 3,
    cool: 1,
    bad: -6,
    miss: -14,
  },
  fever: {
    perfect: 20,
    great: 10,
    cool: 4,
    /** A miss knocks this much out of the fever gauge. */
    missPenalty: 40,
    /** Rounds a fever lasts once the gauge is full. */
    rounds: 4,
  },
  rivals: {
    /** Added to every rival's song skill (0..1). Negative makes rivals easier to beat. */
    skillBias: 0,
  },
  camera: {
    fov: 42,
    distance: 8.8,
    height: 2.6,
    /** 0 = locked camera, 1 = default drift between angles. */
    sway: 1,
    /** Strength of the on-beat zoom punch. */
    beatPunch: 1,
  },
} as const

// Gameplay always reads active values here. Source defaults remain immutable for
// Apply never writes source or local storage.
type MutableConfig<T> = { -readonly [K in keyof T]: T[K] extends number ? number : T[K] extends object ? MutableConfig<T[K]> : T[K] }
export type GameConfig = MutableConfig<typeof DEFAULT_CONFIG>
export const CONFIG: GameConfig = structuredClone(DEFAULT_CONFIG)
