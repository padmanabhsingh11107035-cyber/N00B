/**
 * All gameplay tuning in one place. Change numbers here before touching game code; tests read
 * the same values so rule changes stay covered.
 */
export const DEFAULT_CONFIG = {
  player: {
    radius: 0.3,
    height: 1.8,
    eye: 1.62,
    walkSpeed: 4.6,
    sprintSpeed: 7.4,
    acceleration: 42,
    airControl: 0.35,
    jumpSpeed: 7.4,
    gravity: -24,
    maxFall: -48,
    stepHeight: 0.62,
    swimSpeed: 2.8,
    flySpeed: 15,
    reach: 5.5,
  },
  survival: {
    /** Hunger points lost per second at rest (100 = full). */
    hungerDrain: 0.07,
    sprintHungerMult: 2.2,
    starveDamage: 0.9,
    regenRate: 0.7,
    regenHungerMin: 55,
    staminaSprintCost: 15,
    staminaJumpCost: 7,
    staminaSwingCost: 2.2,
    staminaRegen: 26,
    staminaDelay: 0.8,
    fallSafeSpeed: 13,
    fallDamage: 5,
  },
  mining: {
    /** Damage multiplier for every hit on resources, pieces and terrain. */
    power: 1,
    digRadius: 1.35,
    digDepth: 0.34,
    maxDigDepth: 14,
    raiseAmount: 0.42,
    regrowSeconds: 300,
  },
  creatures: {
    maxWildlife: 8,
    maxHostiles: 5,
    hostileDamage: 10,
    hostileSpeed: 3.9,
    hostileSight: 30,
    campfireSafeRadius: 11,
    wildlifeSpeed: 6.8,
  },
  camera: {
    /** Head-bob strength (0 disables). */
    bob: 1,
  },
  map: {
    /** Metres around the player revealed on the world map. */
    revealRadius: 72,
    /** Landmarks listed on the map within this distance. */
    poiRadius: 2400,
    /** Rested lasts this much longer under a roof. */
    shelterBonus: 1.5,
  },
} as const

// Gameplay always reads active values here. Source defaults remain immutable for
// Apply never writes source or local storage.
type MutableConfig<T> = { -readonly [K in keyof T]: T[K] extends number ? number : T[K] extends object ? MutableConfig<T[K]> : T[K] }
export const CONFIG: MutableConfig<typeof DEFAULT_CONFIG> = structuredClone(DEFAULT_CONFIG)

/** Terrain chunk edge length in metres (one vertex per metre). */
export const CHUNK = 32
export const SEA_LEVEL = 0
