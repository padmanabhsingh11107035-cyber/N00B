import type { Difficulty, Mode } from '../engine/save'

export const WORLD_KEY = 'terraforge.world'

export type WorldSave = {
  version: 1
  seed: string
  mode: Mode
  difficulty: Difficulty
  /** Day time 0..1 and day counter. */
  time: number
  day: number
  player: { x: number; y: number; z: number; yaw: number; pitch: number; health: number; hunger: number; stamina: number; flying: boolean }
  spawn: { x: number; y: number; z: number } | null
  hotbar: number
  inventory: unknown
  pieces: number[][]
  /** Terrain edits: [vertexKey, offset]. */
  edits: [number, number][]
  /** Harvested resources: [key, regrowAtWorldSeconds or -1 for permanent]. */
  harvested: [string, number][]
  discovered: string[]
  worldSeconds: number
  tips: string[]
  savedAt: number
  /** v1.1 progression (optional for older saves). */
  skills?: unknown
  rested?: number
  lastWave?: number
  nightsSurvived?: number
  /** v1.2: chest contents as [piece index in `pieces`, slots]. */
  chests?: [number, unknown][]
  /** v1.2: explored 64 m map tiles (tile keys). */
  explored?: number[]
  /** v1.3: map waypoints [x, z, colour index]. */
  pins?: [number, number, number][]
}

const num = (v: unknown, fallback: number, lo = -1e7, hi = 1e7) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : fallback)

/** Parse untrusted stored JSON; returns null when the save is missing or unusable. */
export function parseWorld(raw: string | null): WorldSave | null {
  if (!raw) return null
  let d: Record<string, unknown>
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    d = parsed
  } catch {
    return null
  }
  if (d.version !== 1 || typeof d.seed !== 'string' || !d.seed) return null
  const p = (d.player ?? {}) as Record<string, unknown>
  const s = d.spawn as Record<string, unknown> | null
  const pairs = <T>(v: unknown, ok: (e: unknown[]) => boolean, max: number): T[] => (Array.isArray(v) ? (v.filter(e => Array.isArray(e) && ok(e)).slice(0, max) as T[]) : [])
  return {
    version: 1,
    seed: d.seed.slice(0, 32),
    mode: d.mode === 'creative' ? 'creative' : 'survival',
    difficulty: d.difficulty === 'peaceful' || d.difficulty === 'hard' ? d.difficulty : 'normal',
    time: num(d.time, 0.3, 0, 1),
    day: Math.floor(num(d.day, 1, 1, 1e6)),
    player: {
      x: num(p.x, 0), y: num(p.y, 20), z: num(p.z, 0), yaw: num(p.yaw, 0), pitch: num(p.pitch, 0, -1.6, 1.6),
      health: num(p.health, 100, 1, 100), hunger: num(p.hunger, 100, 0, 100), stamina: num(p.stamina, 100, 0, 100), flying: p.flying === true,
    },
    spawn: s && typeof s === 'object' && [s.x, s.y, s.z].every(v => typeof v === 'number' && Number.isFinite(v)) ? { x: s.x as number, y: s.y as number, z: s.z as number } : null,
    hotbar: Math.floor(num(d.hotbar, 0, 0, 8)),
    inventory: d.inventory,
    pieces: pairs<number[]>(d.pieces, e => e.every(v => typeof v === 'number'), 20000),
    edits: pairs<[number, number]>(d.edits, e => e.length === 2 && Number.isFinite(e[0]) && Number.isFinite(e[1]), 400000),
    harvested: pairs<[string, number]>(d.harvested, e => e.length === 2 && typeof e[0] === 'string' && Number.isFinite(e[1]), 200000),
    discovered: Array.isArray(d.discovered) ? d.discovered.filter((v): v is string => typeof v === 'string').slice(0, 5000) : [],
    worldSeconds: num(d.worldSeconds, 0, 0, 1e9),
    tips: Array.isArray(d.tips) ? d.tips.filter((v): v is string => typeof v === 'string').slice(0, 50) : [],
    savedAt: num(d.savedAt, 0, 0, 1e14),
    skills: d.skills,
    rested: num(d.rested, 0, 0, 3600),
    lastWave: Math.floor(num(d.lastWave, 0, 0, 1e6)),
    nightsSurvived: Math.floor(num(d.nightsSurvived, 0, 0, 1e6)),
    chests: pairs<[number, unknown]>(d.chests, e => e.length === 2 && Number.isInteger(e[0]) && Array.isArray(e[1]), 5000),
    pins: Array.isArray(d.pins) ? d.pins.filter((v): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every(n => Number.isFinite(n))).slice(0, 5) : [],
    explored: Array.isArray(d.explored) ? d.explored.filter((v): v is number => Number.isInteger(v)).slice(0, 200000) : [],
  }
}

export function loadWorld(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): WorldSave | null {
  try {
    return parseWorld(storage?.getItem(WORLD_KEY) ?? null)
  } catch {
    return null
  }
}

export function storeWorld(save: WorldSave, storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage): boolean {
  try {
    storage?.setItem(WORLD_KEY, JSON.stringify(save))
    return true
  } catch {
    return false
  }
}

export function deleteWorld(storage: Pick<Storage, 'removeItem'> | undefined = globalThis.localStorage): void {
  try {
    storage?.removeItem(WORLD_KEY)
  } catch {
    // ignore
  }
}
