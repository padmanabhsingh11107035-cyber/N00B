import { sanitizeLab, type LabParams } from '../sim/tracks'

/**
 * Versioned local save. Settings, cosmetic choices, best times and Track Lab layouts live in
 * one JSON record. Corrupt or foreign data falls back to defaults instead of crashing.
 */
export type Quality = 'low' | 'medium' | 'high'
export type Device = 'auto' | 'kbLeft' | 'kbRight' | 'pad0' | 'pad1'
export type AiSkillSetting = 'relaxed' | 'pro'
export type AssistMode = 'off' | 'light' | 'strong'
export type CustomCar = {
  name: string
  chassis: number
  primary: string
  secondary: string
  accent: string
  wheels: 'street' | 'grip' | 'dirt' | 'slick' | 'beadlock' | 'neon'
  aero: 'clean' | 'wing' | 'rally'
  bodyKit: 'stock' | 'wide' | 'street' | 'retro'
  hood: 'smooth' | 'vented' | 'carbon'
  spoiler: 'none' | 'ducktail' | 'gt' | 'drift'
  paintFinish: 'metallic' | 'matte' | 'pearl' | 'chrome'
  paintPattern: 'solid' | 'split' | 'stripe' | 'sunset'
  power: number
  grip: number
  boost: number
}
/** `totalAssist` / `lapAssist` mark a best driven with corner assist on (a marker, not an invalidation). */
export type BestTime = { total: number; lap: number; totalAssist?: boolean; lapAssist?: boolean }

export type SaveData = {
  version: 3
  musicVolume: number
  sfxVolume: number
  muted: boolean
  quality: Quality
  reducedMotion: boolean
  cameraShake: boolean
  /** Corner assist strength for player 1 (solo, online, split-screen left). Strong by default. */
  assistP1: AssistMode
  /** Corner assist strength for player 2 in split-screen. */
  assistP2: AssistMode
  playerName: string
  chassis: number
  livery: number
  p2Chassis: number
  p2Livery: number
  p1Device: Device
  p2Device: Device
  aiSkill: AiSkillSetting
  items: boolean
  customCar: CustomCar | null
  points: number
  racesPlayed: number
  upgrades: { power: number; grip: number; boost: number }
  controlsSeen: boolean
  bests: Record<string, BestTime>
  customTracks: LabParams[]
}

export const SAVE_KEY = 'canyon-circuit.save'
export const MAX_CUSTOM_TRACKS = 12
export const CHASSIS_COUNT = 7
export const LIVERY_COUNT = 8
export const DEFAULT_CUSTOM_CAR: CustomCar = {
  name: 'Canyon One', chassis: 0, primary: '#e0561b', secondary: '#1d1d20', accent: '#f2c14e',
  wheels: 'street', aero: 'clean', bodyKit: 'stock', hood: 'smooth', spoiler: 'ducktail', paintFinish: 'metallic', paintPattern: 'stripe', power: 50, grip: 50, boost: 50,
}

export function defaultSave(): SaveData {
  return {
    version: 3,
    musicVolume: 0.7,
    sfxVolume: 0.8,
    muted: false,
    quality: 'high',
    reducedMotion: false,
    cameraShake: true,
    assistP1: 'strong',
    assistP2: 'strong',
    playerName: 'RACER',
    chassis: 0,
    livery: 0,
    p2Chassis: 1,
    p2Livery: 2,
    p1Device: 'kbLeft',
    p2Device: 'kbRight',
    aiSkill: 'pro',
    items: true,
    customCar: null,
    points: 0,
    racesPlayed: 0,
    upgrades: { power: 0, grip: 0, boost: 0 },
    controlsSeen: false,
    bests: {},
    customTracks: [],
  }
}

const clamp01 = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback)
const index = (v: unknown, count: number, fallback: number) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < count ? v : fallback)
const DEVICES: Device[] = ['auto', 'kbLeft', 'kbRight', 'pad0', 'pad1']
const ASSIST_MODES: AssistMode[] = ['off', 'light', 'strong']
const WHEEL_KINDS: CustomCar['wheels'][] = ['street', 'grip', 'dirt', 'slick', 'beadlock', 'neon']
const AERO_KINDS: CustomCar['aero'][] = ['clean', 'wing', 'rally']
const BODY_KITS: CustomCar['bodyKit'][] = ['stock', 'wide', 'street', 'retro']
const HOODS: CustomCar['hood'][] = ['smooth', 'vented', 'carbon']
const SPOILERS: CustomCar['spoiler'][] = ['none', 'ducktail', 'gt', 'drift']
const PAINT_FINISHES: CustomCar['paintFinish'][] = ['metallic', 'matte', 'pearl', 'chrome']
const PAINT_PATTERNS: CustomCar['paintPattern'][] = ['solid', 'split', 'stripe', 'sunset']
const hex = (v: unknown, fallback: string): string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback
const customCar = (v: unknown): CustomCar | null => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const d = v as Partial<CustomCar>
  const clamp100 = (n: unknown, fallback: number) => typeof n === 'number' && Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : fallback
  return {
    name: typeof d.name === 'string' && d.name.trim() ? d.name.trim().replace(/[^\w .-]/g, '').slice(0, 18) || DEFAULT_CUSTOM_CAR.name : DEFAULT_CUSTOM_CAR.name,
    chassis: index(d.chassis, CHASSIS_COUNT, DEFAULT_CUSTOM_CAR.chassis),
    primary: hex(d.primary, DEFAULT_CUSTOM_CAR.primary),
    secondary: hex(d.secondary, DEFAULT_CUSTOM_CAR.secondary),
    accent: hex(d.accent, DEFAULT_CUSTOM_CAR.accent),
    wheels: WHEEL_KINDS.includes(d.wheels as CustomCar['wheels']) ? d.wheels as CustomCar['wheels'] : DEFAULT_CUSTOM_CAR.wheels,
    aero: AERO_KINDS.includes(d.aero as CustomCar['aero']) ? d.aero as CustomCar['aero'] : DEFAULT_CUSTOM_CAR.aero,
    bodyKit: BODY_KITS.includes(d.bodyKit as CustomCar['bodyKit']) ? d.bodyKit as CustomCar['bodyKit'] : DEFAULT_CUSTOM_CAR.bodyKit,
    hood: HOODS.includes(d.hood as CustomCar['hood']) ? d.hood as CustomCar['hood'] : DEFAULT_CUSTOM_CAR.hood,
    spoiler: SPOILERS.includes(d.spoiler as CustomCar['spoiler']) ? d.spoiler as CustomCar['spoiler'] : DEFAULT_CUSTOM_CAR.spoiler,
    paintFinish: PAINT_FINISHES.includes(d.paintFinish as CustomCar['paintFinish']) ? d.paintFinish as CustomCar['paintFinish'] : DEFAULT_CUSTOM_CAR.paintFinish,
    paintPattern: PAINT_PATTERNS.includes(d.paintPattern as CustomCar['paintPattern']) ? d.paintPattern as CustomCar['paintPattern'] : DEFAULT_CUSTOM_CAR.paintPattern,
    power: clamp100(d.power, DEFAULT_CUSTOM_CAR.power),
    grip: clamp100(d.grip, DEFAULT_CUSTOM_CAR.grip),
    boost: clamp100(d.boost, DEFAULT_CUSTOM_CAR.boost),
  }
}
/** Valid mode, else migrate the old boolean `cornerAssist` (false -> off, otherwise strong). */
const assistMode = (v: unknown, legacy: unknown): AssistMode => (ASSIST_MODES.includes(v as AssistMode) ? (v as AssistMode) : legacy === false ? 'off' : 'strong')

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
  if (data.version !== 2 && data.version !== 3) return base
  const bests: Record<string, BestTime> = {}
  if (data.bests && typeof data.bests === 'object' && !Array.isArray(data.bests)) {
    for (const [id, v] of Object.entries(data.bests as Record<string, unknown>).slice(0, 64)) {
      const b = v as BestTime
      if (typeof id === 'string' && id.length <= 40 && b && Number.isFinite(b.total) && b.total > 0 && Number.isFinite(b.lap) && b.lap >= 0) bests[id] = { total: b.total, lap: b.lap, ...(b.totalAssist === true ? { totalAssist: true } : {}), ...(b.lapAssist === true ? { lapAssist: true } : {}) }
    }
  }
  const tracks = Array.isArray(data.customTracks) ? data.customTracks.filter(t => t && typeof t === 'object').slice(0, MAX_CUSTOM_TRACKS).map(t => sanitizeLab(t as Partial<LabParams>)) : []
  return {
    version: 3,
    musicVolume: clamp01(data.musicVolume, base.musicVolume),
    sfxVolume: clamp01(data.sfxVolume, base.sfxVolume),
    muted: data.muted === true,
    quality: data.quality === 'low' || data.quality === 'medium' || data.quality === 'high' ? data.quality : base.quality,
    reducedMotion: data.reducedMotion === true,
    cameraShake: data.cameraShake !== false,
    assistP1: assistMode(data.assistP1, data.cornerAssist),
    assistP2: assistMode(data.assistP2, data.cornerAssist),
    playerName: typeof data.playerName === 'string' && data.playerName.trim() ? data.playerName.trim().replace(/[^\w .-]/g, '').slice(0, 14) || base.playerName : base.playerName,
    chassis: index(data.chassis, CHASSIS_COUNT, base.chassis),
    livery: index(data.livery, LIVERY_COUNT, base.livery),
    p2Chassis: index(data.p2Chassis, CHASSIS_COUNT, base.p2Chassis),
    p2Livery: index(data.p2Livery, LIVERY_COUNT, base.p2Livery),
    p1Device: DEVICES.includes(data.p1Device as Device) ? (data.p1Device as Device) : base.p1Device,
    p2Device: DEVICES.includes(data.p2Device as Device) ? (data.p2Device as Device) : base.p2Device,
    aiSkill: data.aiSkill === 'relaxed' ? 'relaxed' : 'pro',
    items: data.items !== false,
    customCar: customCar(data.customCar),
    points: typeof data.points === 'number' && Number.isFinite(data.points) ? Math.max(0, Math.min(999999, Math.floor(data.points))) : base.points,
    racesPlayed: typeof data.racesPlayed === 'number' && Number.isFinite(data.racesPlayed) ? Math.max(0, Math.min(9999, Math.floor(data.racesPlayed))) : base.racesPlayed,
    upgrades: data.upgrades && typeof data.upgrades === 'object' && !Array.isArray(data.upgrades)
      ? {
        power: typeof (data.upgrades as Record<string, unknown>).power === 'number' ? Math.max(0, Math.min(10, Math.floor((data.upgrades as Record<string, unknown>).power as number))) : 0,
        grip: typeof (data.upgrades as Record<string, unknown>).grip === 'number' ? Math.max(0, Math.min(10, Math.floor((data.upgrades as Record<string, unknown>).grip as number))) : 0,
        boost: typeof (data.upgrades as Record<string, unknown>).boost === 'number' ? Math.max(0, Math.min(10, Math.floor((data.upgrades as Record<string, unknown>).boost as number))) : 0,
      }
      : base.upgrades,
    controlsSeen: data.controlsSeen === true,
    bests,
    customTracks: tracks,
  }
}

/**
 * Returns the improved best record, or null when the run is not a new best. Each improved part
 * carries whether that run (total) or that lap was driven with assist on; kept parts keep their flag.
 */
export function improveBest(prev: BestTime | undefined, total: number, lap: number, totalAssist = false, lapAssist = false): BestTime | null {
  if (!(total > 0)) return null
  const newTotal = !prev || total < prev.total
  const newLap = lap > 0 && (!prev || !(prev.lap > 0) || lap < prev.lap)
  if (prev && !newTotal && !newLap) return null
  const next: BestTime = { total: newTotal ? total : prev!.total, lap: newLap ? lap : (prev?.lap ?? 0) }
  const ta = newTotal ? totalAssist : prev?.totalAssist === true
  const la = newLap ? lapAssist : prev?.lapAssist === true
  if (ta) next.totalAssist = true
  if (la) next.lapAssist = true
  return next
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
