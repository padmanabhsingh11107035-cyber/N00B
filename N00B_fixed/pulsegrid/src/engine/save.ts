/**
 * Versioned local save. Everything the player keeps between sessions lives in one JSON record so
 * it is easy to migrate. Corrupt or foreign data falls back to defaults instead of crashing.
 */
export type Quality = 'low' | 'medium' | 'high'
export type Locale = 'en' | 'zh-CN'
export type BestRecord = { score: number; rank: string; combo: number; accuracy: number }
export type SaveData = {
  version: 1
  musicVolume: number
  sfxVolume: number
  muted: boolean
  quality: Quality
  reducedMotion: boolean
  /** Soft in-key beat ticks and a riser into each round's target beat. */
  beatAssist: boolean
  tutorialDone: boolean
  /** Audio/input calibration: positive when the player hears the beat late (e.g. Bluetooth). */
  offsetMs: number
  lastSong: string
  best: Record<string, BestRecord>
}

export const SAVE_KEY = 'noob.pulsegrid.save'
export const OFFSET_LIMIT = 150

export function defaultSave(): SaveData {
  return {
    version: 1,
    musicVolume: 0.8,
    sfxVolume: 0.8,
    muted: false,
    quality: 'high',
    reducedMotion: false,
    beatAssist: true,
    tutorialDone: false,
    offsetMs: 0,
    lastSong: '',
    best: {},
  }
}

const clamp01 = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback)
const RANKS = new Set(['S', 'A', 'B', 'C', 'D', 'F'])

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
  const best: Record<string, BestRecord> = {}
  if (data.best && typeof data.best === 'object' && !Array.isArray(data.best)) {
    for (const [id, value] of Object.entries(data.best as Record<string, unknown>)) {
      const v = value as Partial<BestRecord> | null
      if (!v || typeof v !== 'object' || !Number.isFinite(v.score) || typeof v.rank !== 'string' || !RANKS.has(v.rank)) continue
      best[id.slice(0, 40)] = {
        score: Math.max(0, Math.floor(v.score as number)),
        rank: v.rank,
        combo: Number.isFinite(v.combo) ? Math.max(0, Math.floor(v.combo as number)) : 0,
        accuracy: clamp01(v.accuracy, 0),
      }
    }
  }
  const offset = typeof data.offsetMs === 'number' && Number.isFinite(data.offsetMs) ? Math.round(data.offsetMs) : 0
  return {
    version: 1,
    musicVolume: clamp01(data.musicVolume, base.musicVolume),
    sfxVolume: clamp01(data.sfxVolume, base.sfxVolume),
    muted: data.muted === true,
    quality: data.quality === 'low' || data.quality === 'medium' || data.quality === 'high' ? data.quality : base.quality,
    reducedMotion: data.reducedMotion === true,
    beatAssist: data.beatAssist !== false,
    tutorialDone: data.tutorialDone === true,
    offsetMs: Math.max(-OFFSET_LIMIT, Math.min(OFFSET_LIMIT, offset)),
    lastSong: typeof data.lastSong === 'string' ? data.lastSong.slice(0, 40) : '',
    best,
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
