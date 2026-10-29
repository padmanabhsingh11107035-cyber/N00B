import { CONFIG } from './config'

/**
 * Pure ballistics shared by the aim preview, the catapult and tests. Yaw 0 faces −Z; positive yaw
 * turns toward +X (right on screen from behind the catapult). Pitch is the elevation angle.
 */
export type Vec3 = { x: number; y: number; z: number }

export type Aim = { yaw: number; pitch: number; power: number }

export function launchSpeed(power: number, rules = CONFIG): number {
  const p = Math.min(1, Math.max(0, power))
  return rules.ball.minSpeed + (rules.ball.maxSpeed - rules.ball.minSpeed) * p
}

export function aimDirection(yaw: number, pitch: number): Vec3 {
  const c = Math.cos(pitch)
  return { x: Math.sin(yaw) * c, y: Math.sin(pitch), z: -Math.cos(yaw) * c }
}

export function launchVelocity(aim: Aim, rules = CONFIG): Vec3 {
  const d = aimDirection(aim.yaw, aim.pitch)
  const s = launchSpeed(aim.power, rules)
  return { x: d.x * s, y: d.y * s, z: d.z * s }
}

/** Position along a drag-free ballistic arc at time t. */
export function arcPoint(origin: Vec3, v: Vec3, g: number, t: number): Vec3 {
  return { x: origin.x + v.x * t, y: origin.y + v.y * t + 0.5 * g * t * t, z: origin.z + v.z * t }
}

/** Sample `count` evenly spaced points over `seconds` of flight. */
export function arcPoints(origin: Vec3, v: Vec3, g: number, seconds: number, count: number): Vec3[] {
  const out: Vec3[] = []
  for (let i = 1; i <= count; i += 1) out.push(arcPoint(origin, v, g, (seconds * i) / count))
  return out
}

/** Where the arc comes back down to height `y` (ground), or null if it never does. */
export function landingPoint(origin: Vec3, v: Vec3, g: number, y = 0): Vec3 | null {
  // origin.y + v.y t + g/2 t² = y  →  (g/2) t² + v.y t + (origin.y − y) = 0, g < 0
  const a = 0.5 * g
  const b = v.y
  const c = origin.y - y
  const disc = b * b - 4 * a * c
  if (disc < 0 || a === 0) return null
  const t = (-b - Math.sqrt(disc)) / (2 * a)
  return t > 0 ? arcPoint(origin, v, g, t) : null
}

/** Rotate the catapult's local release point by the current yaw into world space. */
export function releasePoint(base: Vec3, yaw: number, local: Vec3): Vec3 {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  // Local −Z is forward; rotating by yaw about +Y toward +X.
  return { x: base.x + local.x * c - local.z * s, y: base.y + local.y, z: base.z + local.x * s + local.z * c }
}
