/**
 * Local persistence: settings, per-quarry hunt records and onboarding progress. Everything is
 * validated on load so a corrupted or older save never breaks boot.
 */
export type Quality = 'low' | 'medium' | 'high'

export type Settings = {
  music: number
  sfx: number
  muted: boolean
  sensitivity: number
  invertY: boolean
  quality: Quality
  shake: boolean
  damageNumbers: boolean
  tips: boolean
}

export type HuntRecord = { bestTime: number; bestRank: string; hunts: number }

export type SaveData = {
  version: 2
  settings: Settings
  records: Record<string, HuntRecord>
  tutorialDone: boolean
  quarry: string
}

export const SAVE_KEY = 'noob.ashenfang.save.v2'
const QUALITIES: Quality[] = ['low', 'medium', 'high']
const RANK_ORDER = ['S', 'A', 'B', 'C']

export function defaultSave(quality: Quality = 'high'): SaveData {
  return {
    version: 2,
    settings: { music: 0.7, sfx: 0.85, muted: false, sensitivity: 1, invertY: false, quality, shake: true, damageNumbers: true, tips: true },
    records: {},
    tutorialDone: false,
    quarry: 'mossback',
  }
}

const num = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)

export function parseSave(raw: string | null, quality: Quality = 'high'): SaveData {
  const base = defaultSave(quality)
  if (!raw) return base
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return base
  }
  if (!data || typeof data !== 'object') return base
  const d = data as Partial<SaveData> & { settings?: Partial<Settings> }
  const s: Partial<Settings> = d.settings ?? {}
  const settings: Settings = {
    music: num(s.music, 0, 1, base.settings.music),
    sfx: num(s.sfx, 0, 1, base.settings.sfx),
    muted: bool(s.muted, false),
    sensitivity: num(s.sensitivity, 0.2, 3, 1),
    invertY: bool(s.invertY, false),
    quality: QUALITIES.includes(s.quality as Quality) ? (s.quality as Quality) : quality,
    shake: bool(s.shake, true),
    damageNumbers: bool(s.damageNumbers, true),
    tips: bool(s.tips, true),
  }
  const records: Record<string, HuntRecord> = {}
  if (d.records && typeof d.records === 'object') {
    for (const [id, r] of Object.entries(d.records)) {
      if (!r || typeof r !== 'object') continue
      const rec = r as Partial<HuntRecord>
      const bestTime = num(rec.bestTime, 0, 1e6, 0)
      if (bestTime <= 0) continue
      records[id] = { bestTime, bestRank: RANK_ORDER.includes(rec.bestRank as string) ? (rec.bestRank as string) : 'C', hunts: Math.floor(num(rec.hunts, 0, 1e6, 1)) }
    }
  }
  return { version: 2, settings, records, tutorialDone: bool(d.tutorialDone, false), quarry: typeof d.quarry === 'string' ? d.quarry : base.quarry }
}

/** Record a completed hunt. Returns the new data and whether it set a new best time. */
export function recordHunt(data: SaveData, quarry: string, time: number, rank: string): { data: SaveData; isBest: boolean } {
  const prev = data.records[quarry]
  const isBest = !prev || time < prev.bestTime
  const bestRank = !prev || RANK_ORDER.indexOf(rank) < RANK_ORDER.indexOf(prev.bestRank) ? rank : prev.bestRank
  const rec: HuntRecord = { bestTime: isBest ? time : prev.bestTime, bestRank, hunts: (prev?.hunts ?? 0) + 1 }
  return { data: { ...data, records: { ...data.records, [quarry]: rec } }, isBest }
}

export class SaveStore {
  data: SaveData
  constructor(private readonly storage: Storage | null, quality: Quality) {
    let raw: string | null = null
    try {
      raw = storage?.getItem(SAVE_KEY) ?? null
    } catch {
      raw = null
    }
    this.data = parseSave(raw, quality)
  }
  get settings(): Settings {
    return this.data.settings
  }
  updateSettings(patch: Partial<Settings>): void {
    this.data = { ...this.data, settings: { ...this.data.settings, ...patch } }
    this.persist()
  }
  update(patch: Partial<SaveData>): void {
    this.data = { ...this.data, ...patch }
    this.persist()
  }
  recordHunt(quarry: string, time: number, rank: string): boolean {
    const res = recordHunt(this.data, quarry, time, rank)
    this.data = res.data
    this.persist()
    return res.isBest
  }
  persist(): void {
    try {
      this.storage?.setItem(SAVE_KEY, JSON.stringify(this.data))
    } catch {
      /* storage full or blocked: settings still apply for this session */
    }
  }
}
