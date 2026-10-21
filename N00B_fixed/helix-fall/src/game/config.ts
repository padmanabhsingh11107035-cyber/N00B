/**
 * Helix Fall's small set of live camera controls. Gameplay and simulation constants remain
 * the supplied source game's values; these camera settings are visual-only Tweak parameters.
 */
export const DEFAULT_CONFIG = {
  camera: {
    distance: 10.5,
    fov: 52,
  },
} as const

type MutableConfig<T> = { -readonly [K in keyof T]: T[K] extends number ? number : T[K] extends object ? MutableConfig<T[K]> : T[K] }
export const CONFIG: MutableConfig<typeof DEFAULT_CONFIG> = structuredClone(DEFAULT_CONFIG)
