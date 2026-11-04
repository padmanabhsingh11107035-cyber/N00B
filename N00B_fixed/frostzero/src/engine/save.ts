/**
 * Versioned local save. Settings and personal records live in one JSON record; corrupt or foreign
 * data falls back to defaults instead of crashing.
 */
export type Locale = 'en' | 'zh-CN'
export type Quality = 'low' | 'medium' | 'high'
export type SavedRank = '' | 'S' | 'A' | 'B' | 'C'
export type ScoreEntry = { name: string; score: number; seconds: number; at: number }
export const LEADERBOARD_SIZE = 10

export type SaveData = {
  version: 1
  /** '' = never chosen; the game follows the browser language until the player picks one. */
  locale: Locale | ''
  musicVolume: number
  sfxVolume: number
  muted: boolean
  sensitivity: number
  invertY: boolean
  quality: Quality
  reducedMotion: boolean
  tutorialDone: boolean
  playerName: string
  leaderboard: ScoreEntry[]
  /** Best finish time in seconds (0 = never finished). */
  bestTime: number
  bestDeaths: number
  bestRank: SavedRank
  clears: number
  attempts: number
  totalDeaths: number
}

export const SAVE_KEY = 'frostline.save'

export function defaultSave(): SaveData {
  return {
    version: 1,
    locale: '',
    musicVolume: 0.6,
    sfxVolume: 0.8,
    muted: false,
    sensitivity: 1,
    invertY: false,
    quality: 'high',
    reducedMotion: false,
    tutorialDone: false,
    playerName: 'PLAYER',
    leaderboard: [],
    bestTime: 0,
    bestDeaths: 0,
    bestRank: '',
    clears: 0,
    attempts: 0,
    totalDeaths: 0,
  }
}

const clamp01 = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback)
const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0)

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
  const rank = data.bestRank
  const board = Array.isArray(data.leaderboard) ? data.leaderboard : []
  return {
    version: 1,
    locale: data.locale === 'en' || data.locale === 'zh-CN' ? data.locale : '',
    musicVolume: clamp01(data.musicVolume, base.musicVolume),
    sfxVolume: clamp01(data.sfxVolume, base.sfxVolume),
    muted: data.muted === true,
    sensitivity: typeof data.sensitivity === 'number' && data.sensitivity >= 0.2 && data.sensitivity <= 3 ? data.sensitivity : base.sensitivity,
    invertY: data.invertY === true,
    quality: data.quality === 'low' || data.quality === 'medium' || data.quality === 'high' ? data.quality : base.quality,
    reducedMotion: data.reducedMotion === true,
    tutorialDone: data.tutorialDone === true,
    playerName: typeof data.playerName === 'string' && data.playerName.trim() ? data.playerName.trim().slice(0, 16) : base.playerName,
    leaderboard: board
      .filter((entry): entry is ScoreEntry => !!entry && typeof entry === 'object' && typeof (entry as ScoreEntry).name === 'string' && Number.isFinite((entry as ScoreEntry).score))
      .map(entry => ({ name: entry.name.slice(0, 16), score: Math.max(0, Math.floor(entry.score)), seconds: Number.isFinite(entry.seconds) ? entry.seconds : 0, at: Number.isFinite(entry.at) ? entry.at : 0 }))
      .slice(0, LEADERBOARD_SIZE),
    bestTime: typeof data.bestTime === 'number' && Number.isFinite(data.bestTime) && data.bestTime > 0 ? data.bestTime : 0,
    bestDeaths: count(data.bestDeaths),
    bestRank: rank === 'S' || rank === 'A' || rank === 'B' || rank === 'C' ? rank : '',
    clears: count(data.clears),
    attempts: count(data.attempts),
    totalDeaths: count(data.totalDeaths),
  }
}

/** Whether a finished run beats the stored personal best (faster wins). */
export function isNewBest(save: SaveData, seconds: number): boolean {
  return save.bestTime <= 0 || seconds < save.bestTime
}

/** Insert a run into a bounded, deterministic leaderboard. */
export function insertScore(board: ScoreEntry[], entry: ScoreEntry): { board: ScoreEntry[]; rank: number } {
  const next = [...board, entry].sort((a, b) => b.score - a.score || a.seconds - b.seconds || a.at - b.at).slice(0, LEADERBOARD_SIZE)
  return { board: next, rank: next.indexOf(entry) }
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
