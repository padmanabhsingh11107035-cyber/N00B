/**
 * Live gameplay tuning. Everything the Tweak panel can change lives here; defaults are frozen in
 * DEFAULT_CONFIG so the panel can show what was changed.
 */
export const DEFAULT_CONFIG = {
  squad: {
    /** forward run speed (m/s) */
    runSpeed: 9.5,
    /** max lateral steering speed (m/s) */
    steerSpeed: 17,
    /** metres of steering per dragged pixel */
    dragSensitivity: 0.03,
    /** extra soldiers at run start (on top of the Armory) */
    startBonus: 0,
  },
  combat: {
    /** multiplier on every weapon's bullet speed */
    bulletSpeedMul: 1,
    /** max auto-fire range (m) */
    range: 46,
    /** half-width of the auto-aim cone at range (m) */
    aimWindow: 3.4,
    /** grenade blast damage before threat scaling */
    grenadeDamage: 700,
  },
  camera: {
    fov: 55,
    height: 8.2,
    distance: 10.2,
    follow: 7,
    lookAhead: 14,
  },
  run: {
    /** multipliers on the procedural difficulty curves */
    hpMul: 1,
    densityMul: 1,
    trapMul: 1,
    bossHpMul: 1,
  },
}
type Mutable<T> = { -readonly [K in keyof T]: T[K] extends object ? Mutable<T[K]> : T[K] }
export const CONFIG: Mutable<typeof DEFAULT_CONFIG> = JSON.parse(JSON.stringify(DEFAULT_CONFIG))
