export type AimTeam = 'enemy' | 'friendly'
export type AimPoint = Readonly<{ x: number; y: number; z: number }>
export type AimAssistTarget<T = number> = {
  id: T
  team: AimTeam
  alive: boolean
  point: AimPoint
}

/**
 * Pick the enemy closest to the crosshair, not simply the nearest enemy. The caller supplies only
 * aim points and a world-occlusion test, keeping this helper deterministic and easy to verify.
 */
export function selectAimAssistTarget<T>(
  origin: AimPoint,
  forward: AimPoint,
  targets: readonly AimAssistTarget<T>[],
  isVisible: (target: AimAssistTarget<T>) => boolean,
  maxDistance = 75,
  maxAngleRadians = Math.PI / 18,
): AimAssistTarget<T> | undefined {
  const fl = Math.hypot(forward.x, forward.y, forward.z)
  if (!(fl > 1e-6) || !Number.isFinite(fl)) return undefined
  const fx = forward.x / fl
  const fy = forward.y / fl
  const fz = forward.z / fl
  const minDot = Math.cos(maxAngleRadians)
  const maxDistanceSq = maxDistance * maxDistance
  let best: AimAssistTarget<T> | undefined
  let bestScore = Infinity

  for (const target of targets) {
    if (!target.alive || target.team !== 'enemy') continue
    const dx = target.point.x - origin.x
    const dy = target.point.y - origin.y
    const dz = target.point.z - origin.z
    const distanceSq = dx * dx + dy * dy + dz * dz
    if (!(distanceSq > 1e-6) || distanceSq > maxDistanceSq) continue
    const distance = Math.sqrt(distanceSq)
    const dot = (dx * fx + dy * fy + dz * fz) / distance
    if (dot < minDot || !isVisible(target)) continue
    // Favor alignment strongly, using distance only as a subtle tie-breaker.
    const score = (1 - dot) * 100 + distance * 0.0005
    if (score < bestScore) {
      best = target
      bestScore = score
    }
  }
  return best
}
