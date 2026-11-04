import type * as THREE from 'three'
import type { MonsterDef } from './defs'

/**
 * Orientation overrides saved from the /enemies debugger. When "Apply in game" is enabled for a
 * quarry, its corrected quaternion is stored here and used instead of the registry default,
 * so a model-orientation fix can be verified in a real hunt before being copied into defs.ts.
 */
const KEY = 'noob.ashenfang.orientation.v1'
export type Quat = [number, number, number, number]

function read(): Record<string, Quat> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const data = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, Quat> = {}
    for (const [id, q] of Object.entries(data)) {
      if (Array.isArray(q) && q.length === 4 && q.every(n => typeof n === 'number' && Number.isFinite(n))) out[id] = q as Quat
    }
    return out
  } catch {
    return {}
  }
}

export function orientationOverride(id: string): Quat | null {
  return read()[id] ?? null
}

export function setOrientationOverride(id: string, q: Quat | null): void {
  try {
    const all = read()
    if (q) all[id] = q
    else delete all[id]
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* storage unavailable: overrides simply do not persist */
  }
}

/** The quaternion a rig should use: saved override if present, else the registry value. */
export function effectiveOrientation(def: MonsterDef): Quat {
  return orientationOverride(def.id) ?? def.orientation
}

export function applyOrientation(orient: THREE.Object3D, def: MonsterDef): void {
  const q = effectiveOrientation(def)
  orient.quaternion.set(q[0], q[1], q[2], q[3]).normalize()
}
