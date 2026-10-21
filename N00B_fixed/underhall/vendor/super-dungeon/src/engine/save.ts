import { CLASSMATES, LORE, RELICS, type ClassmateId, type DevId, type RelicId } from '../game/content'

/**
 * Versioned local save. Settings and permanent progression (merits, development board,
 * rescued classmates, codex) live in one JSON record. Corrupt or foreign data falls back to
 * defaults instead of crashing.
 */
export type Quality = 'low' | 'medium' | 'high'

export type SaveData = {
  version: 2
  musicVolume: number
  sfxVolume: number
  muted: boolean
  sensitivity: number
  invertY: boolean
  quality: Quality
  reducedMotion: boolean
  introSeen: boolean
  /** Finished (or skipped) the first-time movement training in the Hall of Origins. */
  tutorialDone: boolean
  merits: number
  dev: Record<DevId, number>
  rescued: ClassmateId[]
  relics: RelicId[]
  lore: string[]
  runs: number
  wins: number
  bestClear: number
  lastSeed: number
  totalKills: number
}

export const SAVE_KEY = 'underhall-after-curfew.save'

export function defaultSave(): SaveData {
  return {
    version: 2,
    musicVolume: 0.6,
    sfxVolume: 0.8,
    muted: false,
    sensitivity: 1,
    invertY: false,
    quality: 'high',
    reducedMotion: false,
    introSeen: false,
    tutorialDone: false,
    merits: 0,
    dev: { vitality: 0, training: 0, focus: 0, insight: 0 },
    rescued: [],
    relics: [],
    lore: [],
    runs: 0,
    wins: 0,
    bestClear: 0,
    lastSeed: 0,
    totalKills: 0,
  }
}

const clamp01 = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback)
const count = (v: unknown, max = 1e9) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : 0)
const ids = <T extends string>(v: unknown, allowed: readonly string[]): T[] =>
  Array.isArray(v) ? ([...new Set(v.filter((x): x is T => typeof x === 'string' && allowed.includes(x)))] as T[]) : []

/** Parse untrusted stored JSON into a valid SaveData (pure; unit tested). */
export function parseSave(raw: string | null): SaveData {
  const base = defaultSave()
  if (!raw) return base
  let data: Record<string, unknown>
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return base
    data = parsed as Record<string, unknown>
  } catch {
    return base
  }
  if (data.version !== 2) return base
  const dev = (data.dev && typeof data.dev === 'object' ? data.dev : {}) as Record<string, unknown>
  return {
    version: 2,
    musicVolume: clamp01(data.musicVolume, base.musicVolume),
    sfxVolume: clamp01(data.sfxVolume, base.sfxVolume),
    muted: data.muted === true,
    sensitivity: typeof data.sensitivity === 'number' && data.sensitivity >= 0.2 && data.sensitivity <= 3 ? data.sensitivity : base.sensitivity,
    invertY: data.invertY === true,
    quality: data.quality === 'low' || data.quality === 'medium' || data.quality === 'high' ? data.quality : base.quality,
    reducedMotion: data.reducedMotion === true,
    introSeen: data.introSeen === true,
    // Optional within v2: saves from before the tutorial existed simply get it once.
    tutorialDone: data.tutorialDone === true,
    merits: count(data.merits),
    dev: { vitality: count(dev.vitality, 5), training: count(dev.training, 5), focus: count(dev.focus, 3), insight: count(dev.insight, 3) },
    rescued: ids<ClassmateId>(data.rescued, CLASSMATES.map(c => c.id)),
    relics: ids<RelicId>(data.relics, RELICS.map(r => r.id)),
    lore: ids<string>(data.lore, LORE.map(l => l.id)),
    runs: count(data.runs),
    wins: count(data.wins),
    bestClear: count(data.bestClear),
    lastSeed: count(data.lastSeed),
    totalKills: count(data.totalKills),
  }
}

export class SaveStore {
  data: SaveData
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = globalThis.localStorage) {
    let raw: string | null = null
    try {
      raw = this.storage?.getItem(SAVE_KEY) ?? null
    } catch {
      raw = null
    }
    this.data = parseSave(raw)
  }
  update(patch: Partial<SaveData>): void {
    this.data = { ...this.data, ...patch }
    try {
      this.storage?.setItem(SAVE_KEY, JSON.stringify(this.data))
    } catch {
      // Private browsing or quota: the game keeps working with in-memory progress.
    }
  }
}
