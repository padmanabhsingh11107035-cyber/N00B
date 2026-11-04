/**
 * Versioned local settings. Player settings and the sandbox configuration (seed, mode,
 * difficulty) persist so repeat sessions never need reconfiguration. The world itself is
 * stored separately (see game/worldsave.ts). Corrupt data falls back to defaults.
 */
export type Quality = 'low' | 'medium' | 'high'
export type Mode = 'survival' | 'creative'
export type Difficulty = 'peaceful' | 'normal' | 'hard'

export type SandboxConfig = { seed: string; mode: Mode; difficulty: Difficulty }

export type SaveData = {
  version: 1
  musicVolume: number
  sfxVolume: number
  muted: boolean
  sensitivity: number
  invertY: boolean
  quality: Quality
  reducedMotion: boolean
  headBob: boolean
  fov: number
  /** Terrain streaming radius in chunks. */
  viewDistance: number
  tutorialDone: boolean
  sandbox: SandboxConfig
}

export const SAVE_KEY = 'terraforge.settings'

export function defaultSave(): SaveData {
  return {
    version: 1,
    musicVolume: 0.6,
    sfxVolume: 0.8,
    muted: false,
    sensitivity: 1,
    invertY: false,
    quality: 'high',
    reducedMotion: false,
    headBob: true,
    fov: 75,
    viewDistance: 4,
    tutorialDone: false,
    sandbox: { seed: 'Hearthvale', mode: 'survival', difficulty: 'normal' },
  }
}

const clamp01 = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback)
const inRange = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : fallback)

export function parseSandbox(raw: unknown): SandboxConfig {
  const base = defaultSave().sandbox
  if (!raw || typeof raw !== 'object') return base
  const d = raw as Record<string, unknown>
  return {
    seed: typeof d.seed === 'string' && d.seed.trim() ? d.seed.trim().slice(0, 32) : base.seed,
    mode: d.mode === 'creative' ? 'creative' : 'survival',
    difficulty: d.difficulty === 'peaceful' || d.difficulty === 'hard' ? d.difficulty : 'normal',
  }
}

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
  if (data.version !== 1) return base
  return {
    version: 1,
    musicVolume: clamp01(data.musicVolume, base.musicVolume),
    sfxVolume: clamp01(data.sfxVolume, base.sfxVolume),
    muted: data.muted === true,
    sensitivity: inRange(data.sensitivity, 0.2, 3, base.sensitivity),
    invertY: data.invertY === true,
    quality: data.quality === 'low' || data.quality === 'medium' || data.quality === 'high' ? data.quality : base.quality,
    reducedMotion: data.reducedMotion === true,
    headBob: data.headBob !== false,
    fov: Math.round(inRange(data.fov, 55, 100, base.fov)),
    viewDistance: Math.round(inRange(data.viewDistance, 2, 6, base.viewDistance)),
    tutorialDone: data.tutorialDone === true,
    sandbox: parseSandbox(data.sandbox),
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
      // Private browsing or quota: the game keeps working with in-memory settings.
    }
  }
}
