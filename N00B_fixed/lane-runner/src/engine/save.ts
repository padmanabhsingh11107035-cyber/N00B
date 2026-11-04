/**
 * Versioned local save. Everything the player keeps between sessions lives in one JSON record so
 * it is easy to migrate. Corrupt or foreign data falls back to defaults instead of crashing.
 * v1 saves (stage mode) migrate: settings, coins, Armory levels and best score are kept.
 */
import { noUpgrades, UPGRADES, type UpgradeLevels } from '../game/rules'

export type Quality = 'low' | 'medium' | 'high'
export type SaveData = {
  version: 2
  musicVolume: number
  sfxVolume: number
  muted: boolean
  quality: Quality
  reducedMotion: boolean
  damageNumbers: boolean
  screenShake: boolean
  tutorialDone: boolean
  coins: number
  upgrades: UpgradeLevels
  bestScore: number
  bestDistance: number
  bestSector: number
  runs: number
  totalKills: number
  bossesKilled: number
  dailySeed: number
  dailyBest: number
}
export const SAVE_KEY = 'lanerunner.save'
/** Key used before the game was renamed from Horde Forge; read once so progress carries over. */
export const LEGACY_SAVE_KEYS = ['hordeforge.save']

export function defaultSave(): SaveData {
  return {
    version: 2,
    musicVolume: 0.55,
    sfxVolume: 0.8,
    muted: false,
    quality: 'high',
    reducedMotion: false,
    damageNumbers: true,
    screenShake: true,
    tutorialDone: false,
    coins: 0,
    upgrades: noUpgrades(),
    bestScore: 0,
    bestDistance: 0,
    bestSector: 0,
    runs: 0,
    totalKills: 0,
    bossesKilled: 0,
    dailySeed: 0,
    dailyBest: 0,
  }
}

const clamp01 = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback)
const nat = (v: unknown, fallback = 0, max = Number.MAX_SAFE_INTEGER) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(max, Math.floor(v)) : fallback)

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
  if (data.version !== 1 && data.version !== 2) return base
  const up = (data.upgrades && typeof data.upgrades === 'object' ? data.upgrades : {}) as Record<string, unknown>
  const upgrades = noUpgrades()
  for (const def of UPGRADES) upgrades[def.id] = nat(up[def.id], 0, def.max)
  return {
    version: 2,
    musicVolume: clamp01(data.musicVolume, base.musicVolume),
    sfxVolume: clamp01(data.sfxVolume, base.sfxVolume),
    muted: data.muted === true,
    quality: data.quality === 'low' || data.quality === 'medium' || data.quality === 'high' ? data.quality : base.quality,
    reducedMotion: data.reducedMotion === true,
    damageNumbers: data.damageNumbers !== false,
    screenShake: data.screenShake !== false,
    tutorialDone: data.tutorialDone === true,
    coins: nat(data.coins),
    upgrades,
    bestScore: nat(data.bestScore),
    bestDistance: nat(data.bestDistance),
    bestSector: nat(data.bestSector, 0, 999),
    runs: nat(data.runs),
    totalKills: nat(data.totalKills),
    bossesKilled: nat(data.bossesKilled),
    dailySeed: nat(data.dailySeed, 0, 0xffffffff),
    dailyBest: nat(data.dailyBest),
  }
}

export class SaveStore {
  data: SaveData
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = globalThis.localStorage) {
    let raw: string | null = null
    try {
      raw = this.storage?.getItem(SAVE_KEY) ?? null
      for (const k of LEGACY_SAVE_KEYS) if (raw === null) raw = this.storage?.getItem(k) ?? null
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
