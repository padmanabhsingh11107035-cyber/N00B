/**
 * Versioned local save. Everything the player keeps between sessions lives in one JSON record so
 * it is easy to migrate. Corrupt or foreign data falls back to defaults instead of crashing.
 */
export type Locale = 'en' | 'zh-CN'
export type Quality = 'low' | 'medium' | 'high'
export type ScoreEntry = { name: string; score: number; stars: number; shots: number; at: number }
export type LevelProgress = { stars: number; best: number }

export type SaveData = {
  version: 1
  /** '' = never chosen; the game follows the browser language until the player picks one. */
  locale: Locale | ''
  masterVolume: number
  musicVolume: number
  sfxVolume: number
  muted: boolean
  /** Aim rate multiplier for drag, keys and sticks. */
  sensitivity: number
  /** false = slingshot drag (pull back to aim forward); true = drag points where you aim. */
  invertDrag: boolean
  quality: Quality
  /** Weaker screen shake and camera motion. */
  reducedMotion: boolean
  /** Slow-motion impact moments. */
  slowmo: boolean
  tutorialDone: boolean
  playerName: string
  progress: Record<string, LevelProgress>
  /** Per-level local leaderboards. */
  boards: Record<string, ScoreEntry[]>
}

export const SAVE_KEY = 'noob.siegecraft.save'
export const LEADERBOARD_SIZE = 8

export function defaultSave(): SaveData {
  return {
    version: 1,
    locale: '',
    masterVolume: 0.9,
    musicVolume: 0.6,
    sfxVolume: 0.85,
    muted: false,
    sensitivity: 1,
    invertDrag: false,
    quality: 'high',
    reducedMotion: false,
    slowmo: true,
    tutorialDone: false,
    playerName: '',
    progress: {},
    boards: {},
  }
}

const clamp01 = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback)
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

function parseEntry(e: unknown): ScoreEntry | null {
  if (!isObj(e) || typeof e.name !== 'string' || typeof e.score !== 'number' || !Number.isFinite(e.score)) return null
  return {
    name: e.name.slice(0, 12).trim(),
    score: Math.max(0, Math.floor(e.score)),
    stars: typeof e.stars === 'number' ? Math.min(3, Math.max(0, Math.floor(e.stars))) : 0,
    shots: typeof e.shots === 'number' && Number.isFinite(e.shots) ? Math.max(0, Math.floor(e.shots)) : 0,
    at: typeof e.at === 'number' && Number.isFinite(e.at) ? e.at : 0,
  }
}

/** Parse untrusted stored JSON into a valid SaveData (pure; unit tested). */
export function parseSave(raw: string | null): SaveData {
  const base = defaultSave()
  if (!raw) return base
  let data: Record<string, unknown>
  try {
    const parsed = JSON.parse(raw)
    if (!isObj(parsed)) return base
    data = parsed
  } catch {
    return base
  }
  if (data.version !== 1) return base
  const progress: Record<string, LevelProgress> = {}
  if (isObj(data.progress)) {
    for (const [id, p] of Object.entries(data.progress)) {
      if (!isObj(p)) continue
      const stars = typeof p.stars === 'number' ? Math.min(3, Math.max(0, Math.floor(p.stars))) : 0
      const best = typeof p.best === 'number' && Number.isFinite(p.best) ? Math.max(0, Math.floor(p.best)) : 0
      progress[id.slice(0, 24)] = { stars, best }
    }
  }
  const boards: Record<string, ScoreEntry[]> = {}
  if (isObj(data.boards)) {
    for (const [id, list] of Object.entries(data.boards)) {
      if (!Array.isArray(list)) continue
      boards[id.slice(0, 24)] = list.map(parseEntry).filter((e): e is ScoreEntry => !!e).slice(0, LEADERBOARD_SIZE)
    }
  }
  return {
    version: 1,
    locale: data.locale === 'en' || data.locale === 'zh-CN' ? data.locale : '',
    masterVolume: clamp01(data.masterVolume, base.masterVolume),
    musicVolume: clamp01(data.musicVolume, base.musicVolume),
    sfxVolume: clamp01(data.sfxVolume, base.sfxVolume),
    muted: data.muted === true,
    sensitivity: typeof data.sensitivity === 'number' && data.sensitivity >= 0.3 && data.sensitivity <= 2.5 ? data.sensitivity : base.sensitivity,
    invertDrag: data.invertDrag === true,
    quality: data.quality === 'low' || data.quality === 'medium' || data.quality === 'high' ? data.quality : base.quality,
    reducedMotion: data.reducedMotion === true,
    slowmo: data.slowmo !== false,
    tutorialDone: data.tutorialDone === true,
    playerName: typeof data.playerName === 'string' ? data.playerName.trim().slice(0, 12).trim() : base.playerName,
    progress,
    boards,
  }
}

/** Insert a run into a bounded, deterministically ordered leaderboard (higher score, fewer shots, earlier). */
export function insertScore(board: ScoreEntry[], entry: ScoreEntry): { board: ScoreEntry[]; rank: number } {
  const next = [...board, entry].sort((a, b) => b.score - a.score || a.shots - b.shots || a.at - b.at).slice(0, LEADERBOARD_SIZE)
  return { board: next, rank: next.indexOf(entry) }
}

/** Merge a finished level into progress, keeping the best stars and score. */
export function mergeProgress(progress: Record<string, LevelProgress>, level: string, stars: number, score: number): Record<string, LevelProgress> {
  const prev = progress[level] ?? { stars: 0, best: 0 }
  return { ...progress, [level]: { stars: Math.max(prev.stars, stars), best: Math.max(prev.best, score) } }
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
