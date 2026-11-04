/** Pure progression rules: skills XP, the Rested buff and night-wave composition. */

export type SkillId = 'woodcutting' | 'mining' | 'foraging' | 'hunting' | 'building'
export const SKILLS: SkillId[] = ['woodcutting', 'mining', 'foraging', 'hunting', 'building']
export const SKILL_NAMES: Record<SkillId, string> = {
  woodcutting: 'Woodcutting',
  mining: 'Mining',
  foraging: 'Foraging',
  hunting: 'Hunting',
  building: 'Building',
}
export const SKILL_DESC: Record<SkillId, string> = {
  woodcutting: 'Chop trees faster. +4% chopping power per level.',
  mining: 'Break stone and crystal faster. +4% mining power per level.',
  foraging: 'Gather more from plants. +4% chance of a bonus drop per level.',
  hunting: 'Hit harder with spears, blades and arrows. +4% damage per level.',
  building: 'Build sturdier. Placing pieces refunds materials 4% of the time per level.',
}
export const MAX_SKILL = 20

export type SkillState = { level: number; xp: number }
export type Skills = Record<SkillId, SkillState>

export function newSkills(): Skills {
  return Object.fromEntries(SKILLS.map((s) => [s, { level: 1, xp: 0 }])) as Skills
}

/** XP needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return Math.round(40 * Math.pow(level, 1.35))
}

/** Adds XP; returns the number of levels gained (0 when none). Mutates `skills`. */
export function addXp(skills: Skills, id: SkillId, amount: number): number {
  const s = skills[id]
  if (s.level >= MAX_SKILL || amount <= 0) return 0
  s.xp += amount
  let gained = 0
  while (s.level < MAX_SKILL && s.xp >= xpToNext(s.level)) {
    s.xp -= xpToNext(s.level)
    s.level++
    gained++
  }
  if (s.level >= MAX_SKILL) s.xp = 0
  return gained
}

/** Multiplier for the skill's main effect: +4% per level above 1. */
export function skillBonus(skills: Skills, id: SkillId): number {
  return 1 + (skills[id].level - 1) * 0.04
}

export function parseSkills(v: unknown): Skills {
  const out = newSkills()
  if (!v || typeof v !== 'object') return out
  for (const id of SKILLS) {
    const s = (v as Record<string, unknown>)[id] as { level?: unknown; xp?: unknown } | undefined
    if (!s) continue
    const level = Number(s.level)
    const xp = Number(s.xp)
    if (Number.isFinite(level)) out[id].level = Math.max(1, Math.min(MAX_SKILL, Math.floor(level)))
    if (Number.isFinite(xp)) out[id].xp = Math.max(0, Math.min(xpToNext(out[id].level) - 1, xp))
  }
  return out
}

// ─── Rested ───────────────────────────────────────────────────────────────

export const RESTED = {
  /** Seconds of Rested granted (refreshed while you stay near a comfortable fire). */
  duration: 300,
  /** Seconds spent near a comfortable fire before Rested applies. */
  warmup: 4,
  radius: 6,
  minPieces: 3,
  staminaRegenMult: 1.5,
  xpMult: 1.1,
}

/** Comfort is "near a lit campfire with at least N building pieces around". */
export function isComfortable(nearFire: boolean, piecesNearby: number): boolean {
  return nearFire && piecesNearby >= RESTED.minPieces
}

// ─── Night waves ──────────────────────────────────────────────────────────

export type WaveKind = 'wolf' | 'ghoul' | 'werewolf'
export type Wave = { night: number; title: string; sub: string; spawns: WaveKind[]; boss: boolean }

export function isBossNight(night: number): boolean {
  return night > 0 && night % 3 === 0
}

/** Deterministic wave composition for a 1-based night number and difficulty multiplier. */
export function waveFor(night: number, difficulty: 'gentle' | 'normal' | 'harsh' = 'normal'): Wave {
  const n = Math.max(1, Math.floor(night))
  const mult = difficulty === 'gentle' ? 0.65 : difficulty === 'harsh' ? 1.35 : 1
  const total = Math.max(2, Math.round((3 + n * 1.5) * mult))
  const spawns: WaveKind[] = []
  const ghoulShare = n >= 2 ? Math.min(0.6, 0.25 + n * 0.07) : 0
  for (let i = 0; i < total; i++) spawns.push(i / total < ghoulShare ? 'ghoul' : 'wolf')
  // Interleave so ghouls and wolves arrive mixed.
  spawns.sort((a, b) => (a === b ? 0 : a === 'wolf' ? -1 : 1))
  const mixed: WaveKind[] = []
  const wolves = spawns.filter((k) => k === 'wolf')
  const ghouls = spawns.filter((k) => k === 'ghoul')
  while (wolves.length || ghouls.length) {
    if (wolves.length) mixed.push(wolves.shift()!)
    if (ghouls.length) mixed.push(ghouls.shift()!)
  }
  const boss = isBossNight(n)
  if (boss) mixed.push('werewolf')
  const title = boss ? `Night ${n} — The Elder Howler` : n === 1 ? 'Night 1 — The Pack Hunts' : `Night ${n} — The Hollow Rise`
  const sub = boss ? 'A giant beast stalks the dark. Hold your ground.' : n === 1 ? 'Wolves circle outside the firelight.' : 'The dead walk with the wolves tonight.'
  return { night: n, title, sub, spawns: mixed, boss }
}

/** Seconds between spawn bursts within a wave. */
export const WAVE_BURST_GAP = 14
export const WAVE_BURST_SIZE = 3
