/** All gameplay tuning lives here. CONFIG is what the game reads; DEFAULT_CONFIG stays an untouched copy of the numbers. */
export type MaterialKind = 'wood' | 'stone' | 'powder' | 'guard' | 'ball'

export type Material = {
  /** kg per m³ in game units (mass = density × volume). */
  density: number
  friction: number
  restitution: number
  /** Damage threshold in equivalent velocity change (m/s). */
  minDv: number
  hp: number
  /** Fragments produced when broken (0 = particles only). */
  fragments: number
  /** Explosion push multiplier: heavy stone moves less. */
  blast: number
}

export const MATERIALS: Record<MaterialKind, Material> = {
  wood: { density: 2.2, friction: 0.78, restitution: 0.02, minDv: 3.0, hp: 8, fragments: 2, blast: 1 },
  stone: { density: 5.6, friction: 0.9, restitution: 0.01, minDv: 3.2, hp: 17, fragments: 3, blast: 0.7 },
  powder: { density: 1.6, friction: 0.7, restitution: 0.05, minDv: 3.0, hp: 4, fragments: 0, blast: 1.2 },
  guard: { density: 1.5, friction: 0.9, restitution: 0.02, minDv: 3.4, hp: 1, fragments: 0, blast: 1.3 },
  ball: { density: 26, friction: 0.6, restitution: 0.08, minDv: 999, hp: 999, fragments: 0, blast: 0.3 },
}

const baseConfig = {
  physics: {
    gravity: -15,
    solverIterations: 8,
    /** Bodies below this height are removed (fell off the world). */
    killY: -8,
  },
  sleep: {
    linear: 0.14,
    angular: 0.25,
    settleSeconds: 0.5,
    maxAwake: 170,
    /** Live fragment bodies at once; the oldest disappear beyond this. */
    debrisBudget: 70,
    debrisLifetime: 7,
  },
  ball: {
    radius: 0.46,
    /** Launch speed at zero and full power (m/s). */
    minSpeed: 12,
    maxSpeed: 33,
    /** Seconds before a spent ball is cleaned up. */
    lifetime: 14,
  },
  aim: {
    minPitch: (10 * Math.PI) / 180,
    maxPitch: (68 * Math.PI) / 180,
    startPitch: (36 * Math.PI) / 180,
    maxYaw: (24 * Math.PI) / 180,
    /** Radians per second at full stick / key deflection. */
    yawSpeed: 0.55,
    pitchSpeed: 0.75,
    /** Radians per pixel of horizontal drag. */
    dragYaw: 0.0016,
    /** Fraction of the short screen side that equals full power when pulling back. */
    dragPower: 0.34,
    /** Seconds to charge from zero to full with a held button. */
    chargeSeconds: 1.25,
    /** Shots with less power than this are cancelled instead of fired. */
    minPower: 0.08,
    /** Seconds of trajectory shown by the aim preview. */
    previewSeconds: 1.45,
    wheelPitch: 0.0011,
  },
  explosion: {
    radius: 3.8,
    /** Velocity change (m/s) given to a body at the centre, fading to 0 at the radius. */
    strength: 15,
    /** Damage (dv units) at the centre. */
    damage: 30,
    /** Delay between chained barrels (seconds) so chains read as a sequence. */
    chainDelay: 0.11,
  },
  guard: {
    /** Knocked out if its body drops this far below where it stood. */
    fallDrop: 1.1,
    /** Knocked out once tilted past this (up-vector y) for `tiltSeconds`. */
    tiltUp: 0.45,
    tiltSeconds: 0.3,
    /** Seconds the dazed guard stays before vanishing in a puff. */
    vanish: 0.9,
  },
  score: {
    wood: 100,
    stone: 250,
    powder: 300,
    guard: 1000,
    /** Bonus per unused stone at the end of a won level. */
    ammoBonus: 2500,
    /** Chain multiplier: each destruction during one shot adds this, capped at `chainMax`. */
    chainStep: 0.1,
    chainMax: 3,
  },
  shot: {
    /** Seconds after impact before the player may skip ahead. */
    minWatch: 1.2,
    /** Hard cap on waiting for the castle to settle. */
    maxWatch: 7,
    /** Seconds to keep watching after the last guard falls before results. */
    finale: 2.8,
  },
  slowmo: {
    impact: { scale: 0.18, hold: 0.42, easeIn: 0.02, easeOut: 0.55 },
    explosion: { scale: 0.25, hold: 0.3, easeIn: 0.02, easeOut: 0.5 },
    finale: { scale: 0.2, hold: 0.9, easeIn: 0.05, easeOut: 0.9 },
  },
  camera: {
    fov: 52,
    aimFov: 47,
  },
} as const

type MutableDeep<T> = T extends number
  ? number
  : T extends readonly unknown[]
    ? { -readonly [K in keyof T]: MutableDeep<T[K]> }
    : T extends object
      ? { -readonly [K in keyof T]: MutableDeep<T[K]> }
      : T

export const DEFAULT_CONFIG = baseConfig
export const CONFIG: MutableDeep<typeof baseConfig> = structuredClone(baseConfig)
