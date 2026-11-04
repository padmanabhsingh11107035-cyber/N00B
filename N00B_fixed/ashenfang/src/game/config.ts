/**
 * All gameplay tuning in one place. Change numbers here before touching game code; tests read
 * the same values so rule changes stay covered.
 */
export const DEFAULT_CONFIG = {
  hunt: {
    /** Seconds before the hunt fails. */
    timeLimit: 1200,
    /** Fainting this many times fails the hunt. */
    maxFaints: 3,
    potions: 4,
    maxPotions: 6,
  },
  hunter: {
    maxHealth: 150,
    maxStamina: 100,
    walkSpeed: 5.4,
    sprintSpeed: 8.6,
    acceleration: 11,
    turnSpeed: 11,
    staminaRegen: 28,
    staminaDelay: 0.55,
    sprintDrain: 15,
    dodgeCost: 22,
    dodgeSpeed: 10.5,
    dodgeTime: 0.56,
    /** Recoverable (red) health regained per second. */
    redRegen: 3.2,
    potionHeal: 70,
    /** Weapon attack power: multiplies every motion value. */
    attackPower: 100,
    /** Damage multiplier for strikes on an unbroken vital point. */
    vitalMultiplier: 1.8,
    gravity: -26,
  },
  grapple: {
    range: 34,
    /** Stamina drained per second while clinging to the monster. */
    gripDrain: 3.2,
    braceDrain: 14,
    climbCost: 3,
    /** Longest ride before the monster shakes the hunter loose. */
    rideTime: 14,
    cooldown: 0.8,
  },
  monster: {
    healthScale: 1,
    damageScale: 1,
    /** >1 attacks more often with shorter pauses. */
    aggression: 1,
  },
  camera: {
    fov: 60,
    distance: 5.8,
    height: 1.6,
    shoulder: 0.85,
    follow: 12,
    minPitch: -0.45,
    maxPitch: 1.05,
  },
} as const

// Gameplay always reads active values here. Source defaults remain immutable for
// Apply never writes source or local storage.
type MutableConfig<T> = { -readonly [K in keyof T]: T[K] extends number ? number : T[K] extends object ? MutableConfig<T[K]> : T[K] }
export const CONFIG: MutableConfig<typeof DEFAULT_CONFIG> = structuredClone(DEFAULT_CONFIG)
