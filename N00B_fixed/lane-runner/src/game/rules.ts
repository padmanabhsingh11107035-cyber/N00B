/**
 * Pure game rules for Lane Runner: Endless. No three.js, no DOM — everything here is unit tested.
 */

// ───────────────────────── RNG ─────────────────────────
export type Rng = () => number
/** mulberry32 — tiny, fast, deterministic. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
export function dailySeed(date = new Date()): number {
  return hashString(`daily:${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`)
}
export function seedLabel(seed: number): string {
  return (seed >>> 0).toString(36).toUpperCase().padStart(6, '0').slice(-6)
}
export const pick = <T>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length) % arr.length]
export const range = (rng: Rng, a: number, b: number) => a + (b - a) * rng()
export const irange = (rng: Rng, a: number, b: number) => Math.floor(a + (b - a + 1) * rng())
export function weighted<K extends string>(rng: Rng, weights: Partial<Record<K, number>>): K {
  let total = 0
  for (const k in weights) total += Math.max(0, weights[k] ?? 0)
  let r = rng() * total
  let last = Object.keys(weights)[0] as K
  for (const k in weights) {
    const w = Math.max(0, weights[k] ?? 0)
    if (w <= 0) continue
    last = k
    r -= w
    if (r <= 0) return k
  }
  return last
}

// ───────────────────────── Weapons ─────────────────────────
export interface Weapon {
  name: string
  dmg: number
  /** shots per second per soldier */
  rate: number
  pellets: number
  spread: number
  pierce: number
  speed: number
  color: number
  heavy: boolean
}
export const WEAPONS: readonly Weapon[] = [
  { name: 'Carbine', dmg: 10, rate: 3.2, pellets: 1, spread: 0.02, pierce: 0, speed: 62, color: 0xffc46b, heavy: false },
  { name: 'Burst Rifle', dmg: 13, rate: 3.8, pellets: 1, spread: 0.025, pierce: 0, speed: 66, color: 0xffd27a, heavy: false },
  { name: 'Heavy Rifle', dmg: 19, rate: 3.6, pellets: 1, spread: 0.02, pierce: 1, speed: 72, color: 0xffe08f, heavy: false },
  { name: 'Shotgun', dmg: 11, rate: 2.4, pellets: 4, spread: 0.12, pierce: 0, speed: 58, color: 0xffb35c, heavy: true },
  { name: 'LMG', dmg: 22, rate: 5.0, pellets: 1, spread: 0.035, pierce: 1, speed: 74, color: 0xffcf6e, heavy: true },
  { name: 'Minigun', dmg: 24, rate: 8.0, pellets: 1, spread: 0.05, pierce: 1, speed: 80, color: 0xfff0a8, heavy: true },
  { name: 'Ion Rifle', dmg: 46, rate: 5.2, pellets: 1, spread: 0.02, pierce: 3, speed: 90, color: 0x7fe8ff, heavy: true },
]
export const MAX_WEAPON = WEAPONS.length - 1
export const weaponAt = (tier: number): Weapon => WEAPONS[Math.max(0, Math.min(MAX_WEAPON, Math.floor(tier)))]
export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

// ───────────────────────── Gates ─────────────────────────
export type GateOp =
  | { kind: 'add'; n: number }
  | { kind: 'mul'; n: number }
  | { kind: 'sub'; n: number }
  | { kind: 'div'; n: number }
  | { kind: 'weapon'; n: number }
  | { kind: 'rate'; pct: number }
  | { kind: 'heal'; n: number }
  | { kind: 'gamble' }

export type GateTone = 'good' | 'bad' | 'gold' | 'risk' | 'heal'
export function gateTone(op: GateOp): GateTone {
  switch (op.kind) {
    case 'add': case 'mul': return 'good'
    case 'sub': case 'div': return 'bad'
    case 'weapon': return op.n > 0 ? 'gold' : 'bad'
    case 'rate': return op.pct > 0 ? 'good' : 'bad'
    case 'heal': return 'heal'
    case 'gamble': return 'risk'
  }
}
export const gateIsGood = (op: GateOp) => { const t = gateTone(op); return t === 'good' || t === 'gold' || t === 'heal' }
export function gateLabel(op: GateOp): { big: string; small: string } {
  switch (op.kind) {
    case 'add': return { big: `+${op.n}`, small: 'SOLDIERS' }
    case 'mul': return { big: `×${op.n}`, small: 'SQUAD SIZE' }
    case 'sub': return { big: `−${op.n}`, small: 'SOLDIERS' }
    case 'div': return { big: `÷${op.n}`, small: 'SQUAD SIZE' }
    case 'weapon': return op.n > 0 ? { big: 'WEAPON', small: 'TIER UP' } : { big: 'WEAPON', small: 'TIER DOWN' }
    case 'rate': return { big: `${op.pct > 0 ? '+' : '−'}${Math.abs(op.pct)}%`, small: 'FIRE RATE' }
    case 'heal': return { big: `+${op.n}`, small: 'REVIVE FALLEN' }
    case 'gamble': return { big: '?', small: '50% ×3 · 50% ÷2' }
  }
}

export interface SquadStats { count: number; weapon: number; rate: number; fallen: number }
export const SQUAD_CAP = 400

export interface GateResult { stats: SquadStats; text: string; good: boolean }
/** Apply a gate to the squad (pure). `roll` in [0,1) resolves the gamble. */
export function applyGate(s: SquadStats, op: GateOp, roll: number): GateResult {
  const out = { ...s }
  let text = ''
  switch (op.kind) {
    case 'add': out.count = s.count + op.n; text = `+${op.n}`; break
    case 'mul': out.count = s.count * op.n; text = `×${op.n}`; break
    case 'sub': out.count = s.count - op.n; text = `−${op.n}`; break
    case 'div': out.count = Math.ceil(s.count / op.n); text = `÷${op.n}`; break
    case 'weapon':
      out.weapon = Math.max(0, Math.min(MAX_WEAPON, s.weapon + op.n))
      text = out.weapon === s.weapon ? (op.n > 0 ? 'MAX WEAPON' : 'NO EFFECT') : weaponAt(out.weapon).name.toUpperCase()
      break
    case 'rate':
      out.rate = Math.max(0.5, Math.min(3, Math.round(s.rate * (1 + op.pct / 100) * 100) / 100))
      text = `${op.pct > 0 ? '+' : '−'}${Math.abs(op.pct)}% RATE`
      break
    case 'heal': {
      const n = Math.max(0, Math.min(op.n, s.fallen, SQUAD_CAP - s.count))
      out.count = s.count + n
      out.fallen = s.fallen - n
      text = n > 0 ? `REVIVED ${n}` : 'NO ONE TO REVIVE'
      break
    }
    case 'gamble': {
      const win = roll < 0.5
      out.count = win ? s.count * 3 : Math.ceil(s.count / 2)
      text = win ? 'JACKPOT ×3' : 'BUST ÷2'
      break
    }
  }
  out.count = Math.max(0, Math.min(SQUAD_CAP, Math.round(out.count)))
  if (out.count < s.count && op.kind !== 'heal') out.fallen = s.fallen + (s.count - out.count)
  const good = op.kind === 'gamble' ? out.count >= s.count : op.kind === 'heal' ? out.count > s.count : gateIsGood(op)
  return { stats: out, text, good }
}

/** Shootable gate: damage raises the value by +1 per `perPoint` (each point costs a bit more). */
export function raiseGate(value: number, carry: number, damage: number, perPoint: number, cap = 60): { value: number; carry: number } {
  let total = carry + damage
  let v = value
  const cost = (x: number) => perPoint * (1 + Math.max(0, x) / 6)
  while (v < cap && total >= cost(v)) { total -= cost(v); v++ }
  return { value: v, carry: v >= cap ? 0 : total }
}

// ───────────────────────── Perks ─────────────────────────
export type PerkId =
  | 'ricochet' | 'pierce' | 'incendiary' | 'medic' | 'grenadier' | 'overclock'
  | 'hollow' | 'sharpshooter' | 'shield' | 'chain' | 'magnet' | 'rally'
export type Rarity = 'common' | 'rare' | 'epic'
export interface PerkDef { id: PerkId; name: string; rarity: Rarity; desc: string; stat: string; icon: string; max: number }
export const PERKS: readonly PerkDef[] = [
  { id: 'ricochet', name: 'Ricochet Rounds', rarity: 'rare', desc: 'Bullets bounce to a nearby zombie for 50% damage.', stat: '+1 bounce', icon: 'ricochet', max: 2 },
  { id: 'pierce', name: 'Piercing Rounds', rarity: 'common', desc: 'Bullets pass through one more zombie.', stat: '+1 pierce', icon: 'pierce', max: 3 },
  { id: 'incendiary', name: 'Incendiary', rarity: 'epic', desc: 'Hits ignite zombies for 3 s. Burning kills spread the fire.', stat: '+60% burn', icon: 'incendiary', max: 2 },
  { id: 'medic', name: 'Field Medic', rarity: 'rare', desc: 'Revives one fallen soldier every 6 seconds.', stat: '1 per 6 s', icon: 'medic', max: 2 },
  { id: 'grenadier', name: 'Grenadier', rarity: 'rare', desc: 'Every 4 s a grenade is lobbed at the densest cluster.', stat: '1 per 4 s', icon: 'grenade', max: 2 },
  { id: 'overclock', name: 'Overclock', rarity: 'common', desc: 'The whole squad fires faster.', stat: '+15% rate', icon: 'overclock', max: 5 },
  { id: 'hollow', name: 'Hollow Points', rarity: 'common', desc: 'Every bullet hits harder.', stat: '+20% damage', icon: 'skull', max: 5 },
  { id: 'sharpshooter', name: 'Sharpshooter', rarity: 'rare', desc: 'More critical hits; crits deal 2.5× damage.', stat: '+10% crit', icon: 'sharpshooter', max: 3 },
  { id: 'shield', name: 'Blast Shield', rarity: 'epic', desc: 'The first trap hit in each sector is fully absorbed.', stat: '1 per sector', icon: 'shield', max: 1 },
  { id: 'chain', name: 'Chain Lightning', rarity: 'epic', desc: '10% of hits arc lightning to 3 nearby zombies.', stat: '10% chance', icon: 'chain', max: 2 },
  { id: 'magnet', name: 'Magnet', rarity: 'common', desc: 'All coin pickups are doubled.', stat: '×2 coins', icon: 'magnet', max: 1 },
  { id: 'rally', name: 'Rally Cry', rarity: 'rare', desc: 'A new soldier joins every 100 m.', stat: '+1 per 100 m', icon: 'rally', max: 3 },
]
export const PERK_BY_ID = Object.fromEntries(PERKS.map(p => [p.id, p])) as Record<PerkId, PerkDef>
export type PerkStacks = Partial<Record<PerkId, number>>
const RARITY_WEIGHT: Record<Rarity, number> = { common: 6, rare: 3.2, epic: 1.4 }

/** Draw up to n distinct perks that are not maxed out. */
export function drawPerks(rng: Rng, owned: PerkStacks, n = 3): PerkDef[] {
  const pool = PERKS.filter(p => (owned[p.id] ?? 0) < p.max)
  const out: PerkDef[] = []
  while (out.length < n && pool.length) {
    let total = 0
    for (const p of pool) total += RARITY_WEIGHT[p.rarity]
    let r = rng() * total
    let idx = 0
    for (; idx < pool.length - 1; idx++) { r -= RARITY_WEIGHT[pool[idx].rarity]; if (r <= 0) break }
    out.push(pool[idx])
    pool.splice(idx, 1)
  }
  return out
}

// ───────────────────────── Armory (persistent) ─────────────────────────
export type UpgradeId = 'squad' | 'damage' | 'rate' | 'armor' | 'munitions' | 'coins'
export interface UpgradeDef { id: UpgradeId; name: string; desc: string; max: number; base: number; growth: number; icon: string }
export const UPGRADES: readonly UpgradeDef[] = [
  { id: 'squad', name: 'Recruits', desc: '+1 starting soldier', max: 10, base: 60, growth: 1.42, icon: 'soldier' },
  { id: 'damage', name: 'Ammunition', desc: '+8% bullet damage', max: 10, base: 80, growth: 1.48, icon: 'skull' },
  { id: 'rate', name: 'Trigger Work', desc: '+5% fire rate', max: 10, base: 80, growth: 1.48, icon: 'overclock' },
  { id: 'armor', name: 'Body Armor', desc: '6% chance to shrug off a lethal hit', max: 5, base: 150, growth: 1.7, icon: 'shield' },
  { id: 'munitions', name: 'Munitions', desc: '+1 grenade and +1 medkit per run', max: 3, base: 200, growth: 2, icon: 'grenade' },
  { id: 'coins', name: 'Scavenger', desc: '+10% coins earned', max: 5, base: 120, growth: 1.6, icon: 'coin' },
]
export type UpgradeLevels = Record<UpgradeId, number>
export const noUpgrades = (): UpgradeLevels => ({ squad: 0, damage: 0, rate: 0, armor: 0, munitions: 0, coins: 0 })
export function upgradeCost(def: UpgradeDef, level: number): number | null {
  if (level >= def.max) return null
  return Math.round(def.base * Math.pow(def.growth, level) / 5) * 5
}
export function buyUpgrade(levels: UpgradeLevels, coins: number, id: UpgradeId): { levels: UpgradeLevels; coins: number } | null {
  const def = UPGRADES.find(u => u.id === id)!
  const cost = upgradeCost(def, levels[id])
  if (cost === null || cost > coins) return null
  return { levels: { ...levels, [id]: levels[id] + 1 }, coins: coins - cost }
}
export const START_SQUAD = 4
export function startingStats(levels: UpgradeLevels): SquadStats {
  return { count: START_SQUAD + levels.squad, weapon: 0, rate: 1 + 0.05 * levels.rate, fallen: 0 }
}

// ───────────────────────── Threat / scaling ─────────────────────────
export const SECTOR_LEN = 720
export const TUTORIAL_LEN = 240
export const sectorOf = (distance: number) => Math.max(0, Math.floor(distance / SECTOR_LEN))
/** Continuous threat level: +1 per sector. */
export const threatAt = (distance: number) => Math.max(0, distance / SECTOR_LEN)
/** Zombie HP multiplier. Exponential so late runs need upgrades and good gates. */
export const hpScale = (threat: number) => Math.pow(1.55, threat) * (1 + 0.1 * threat)
export const densityScale = (threat: number) => Math.min(3.2, 1 + 0.32 * threat + 0.03 * threat * threat)
export const eliteChance = (threat: number) => (threat < 1 ? 0 : Math.min(0.12, 0.025 + 0.015 * (threat - 1)))
export const trapScale = (threat: number) => 1 + 0.22 * threat

// ───────────────────────── Enemies ─────────────────────────
export type Arch = 'walker' | 'walker2' | 'runner' | 'brute' | 'retcher' | 'blister' | 'riot' | 'wailer' | 'crawler'
  | LurkerArch
/** Ambush predators (see creatures.ts); they never walk in with regular hordes. */
export type LurkerArch = 'leaper' | 'quiller' | 'howler' | 'gulper'
export const LURKERS: readonly LurkerArch[] = ['leaper', 'quiller', 'howler', 'gulper']
export const isLurker = (a: Arch): a is LurkerArch => (LURKERS as readonly string[]).includes(a)
export interface ArchDef {
  hp: number; speed: number; radius: number; kills: number; coins: number; score: number
  /** first sector (0-based) the archetype appears in hordes */
  from: number
  texture: string
  scale: number
  knock: number
}
export const ARCH: Record<Arch, ArchDef> = {
  walker: { hp: 34, speed: 2.4, radius: 0.42, kills: 1, coins: 1, score: 10, from: 0, texture: 'walker', scale: 1.0, knock: 1 },
  walker2: { hp: 40, speed: 2.3, radius: 0.44, kills: 1, coins: 1, score: 10, from: 0, texture: 'walker2', scale: 1.02, knock: 1 },
  runner: { hp: 26, speed: 5.6, radius: 0.4, kills: 1, coins: 1, score: 14, from: 0, texture: 'runner', scale: 0.96, knock: 1.2 },
  brute: { hp: 520, speed: 2.0, radius: 0.85, kills: 3, coins: 8, score: 90, from: 0, texture: 'brute', scale: 1.45, knock: 0.08 },
  retcher: { hp: 70, speed: 2.0, radius: 0.45, kills: 1, coins: 3, score: 30, from: 1, texture: 'retcher', scale: 0.98, knock: 0.8 },
  blister: { hp: 150, speed: 1.7, radius: 0.7, kills: 0, coins: 4, score: 40, from: 1, texture: 'blister', scale: 1.1, knock: 0.4 },
  crawler: { hp: 30, speed: 4.4, radius: 0.45, kills: 1, coins: 2, score: 20, from: 1, texture: 'wailer', scale: 0.92, knock: 0.9 },
  riot: { hp: 130, speed: 2.2, radius: 0.55, kills: 1, coins: 4, score: 45, from: 2, texture: 'riot', scale: 1.05, knock: 0.3 },
  wailer: { hp: 90, speed: 2.5, radius: 0.45, kills: 1, coins: 5, score: 50, from: 2, texture: 'wailer', scale: 0.95, knock: 0.7 },
  leaper: { hp: 120, speed: 8.2, radius: 0.75, kills: 2, coins: 5, score: 70, from: 0, texture: 'leaper', scale: 1.4, knock: 0.35 },
  quiller: { hp: 85, speed: 6.5, radius: 0.65, kills: 1, coins: 5, score: 65, from: 1, texture: 'quiller', scale: 1.35, knock: 0.5 },
  howler: { hp: 1150, speed: 3.2, radius: 1.45, kills: 3, coins: 16, score: 220, from: 2, texture: 'howler', scale: 1.25, knock: 0.04 },
  gulper: { hp: 440, speed: 3.0, radius: 1.2, kills: 2, coins: 12, score: 150, from: 1, texture: 'gulper', scale: 1.4, knock: 0.08 },
}
export const ARCHES = Object.keys(ARCH) as Arch[]
export type Affix = 'vampiric' | 'splitting' | 'hasted' | 'shielded'
export const AFFIXES: readonly Affix[] = ['vampiric', 'splitting', 'hasted', 'shielded']

/** Horde mix weights for a sector (0-based). */
export function hordeMix(sector: number): Partial<Record<Arch, number>> {
  const w: Partial<Record<Arch, number>> = { walker: 10, walker2: 6, runner: sector === 0 ? 2.5 : 4.5 }
  if (sector >= 1) { w.retcher = 1.3; w.blister = 1.4; w.crawler = 1.6 }
  if (sector >= 2) { w.riot = 1.8; w.wailer = 0.8 }
  if (sector >= 3) { w.runner = 5.5; w.brute = 0.4 }
  return w
}

// ───────────────────────── Bosses ─────────────────────────
export type BossBody = 'bruteKing' | 'blisterMother' | 'riotWarden' | 'abomination'
export type BossMod = 'armored' | 'enraged' | 'summoner' | 'toxic' | 'regenerating' | 'explosive'
export type BossAttack = 'charge' | 'slam' | 'shockwave' | 'acid' | 'summon' | 'sweep' | 'boulder'
export interface BossBodyDef { texture: string; scale: number; hp: number; speed: number; attacks: BossAttack[]; title: string; inflate: number }
export const BOSS_BODIES: Record<BossBody, BossBodyDef> = {
  bruteKing: { texture: 'brute', scale: 3.0, hp: 9000, speed: 3.2, attacks: ['charge', 'slam', 'sweep', 'boulder'], title: 'Brute King', inflate: 1.2 },
  blisterMother: { texture: 'blister', scale: 3.1, hp: 11000, speed: 2.6, attacks: ['acid', 'summon', 'slam', 'shockwave'], title: 'Blister Mother', inflate: 1.5 },
  riotWarden: { texture: 'riot', scale: 3.0, hp: 12500, speed: 3.0, attacks: ['charge', 'shockwave', 'sweep', 'boulder'], title: 'Riot Warden', inflate: 1.4 },
  abomination: { texture: 'abomination', scale: 3.5, hp: 15000, speed: 3.0, attacks: ['slam', 'shockwave', 'acid', 'summon', 'charge', 'boulder'], title: 'Abomination', inflate: 1.2 },
}
export const BOSS_ORDER: readonly BossBody[] = ['bruteKing', 'blisterMother', 'riotWarden', 'abomination']
export const BOSS_MODS: readonly BossMod[] = ['armored', 'enraged', 'summoner', 'toxic', 'regenerating', 'explosive']
export const MOD_LABEL: Record<BossMod, string> = {
  armored: 'ARMORED', enraged: 'ENRAGED', summoner: 'SUMMONER', toxic: 'TOXIC', regenerating: 'REGENERATING', explosive: 'EXPLOSIVE',
}
const NAME_A = ['GORE', 'ROT', 'BILE', 'GRIM', 'DREAD', 'CARRION', 'BLIGHT', 'HUSK', 'SKULL', 'PUS', 'MARROW', 'ASH']
const NAME_B = ['MAW', 'FANG', 'HIDE', 'JAW', 'GUT', 'BORN', 'CLAW', 'SPINE', 'TUSK', 'HOWL']
const EPITHETS = ['THE UNBROKEN', 'THE HUNGERING', 'OF A THOUSAND TEETH', 'THE WALKING PLAGUE', 'THE GRAVE-KING', 'MOTHER OF PUS',
  'WHO SWALLOWED THE CITY', 'THE IRON MOURNER', 'THE LAST SCREAM', 'THE BUTCHER']
export function bossName(rng: Rng): string {
  return `${pick(rng, NAME_A)}${pick(rng, NAME_B)}, ${pick(rng, EPITHETS)}`
}
export interface BossSpec { body: BossBody; mods: BossMod[]; attacks: BossAttack[]; name: string; hp: number; sector: number }
export function makeBoss(rng: Rng, sector: number): BossSpec {
  const body = sector < BOSS_ORDER.length ? BOSS_ORDER[sector] : pick(rng, BOSS_ORDER)
  const def = BOSS_BODIES[body]
  const nMods = Math.min(4, 1 + Math.floor(sector / 2))
  const modPool = BOSS_MODS.filter(m => !(m === 'summoner' && def.attacks.includes('summon')))
  const mods: BossMod[] = []
  while (mods.length < nMods) {
    const m = pick(rng, modPool)
    if (!mods.includes(m)) mods.push(m)
  }
  const nAtk = Math.min(def.attacks.length, sector >= 2 ? 4 : 3)
  const pool = [...def.attacks]
  const attacks: BossAttack[] = []
  while (attacks.length < nAtk) attacks.push(pool.splice(Math.floor(rng() * pool.length), 1)[0])
  if (mods.includes('summoner') && !attacks.includes('summon')) attacks.push('summon')
  const hp = Math.round(def.hp * hpScale(sector) * (sector === 0 ? 0.5 : 1))
  return { body, mods, attacks, name: bossName(rng), hp, sector }
}

/**
 * Boss fights are sized to the squad's real firepower so they last long enough to show every attack.
 * `bossFightSeconds` is the target time-to-kill at full focus fire; `bossHp` never goes below the
 * body's base HP. `bossPhaseFloor` is the minimum time a boss spends in each of its 3 phases — damage
 * past the next threshold before that is absorbed by a visible shield.
 */
export const bossFightSeconds = (sector: number) => Math.min(70, 26 + 7 * Math.max(0, sector))
export function bossHp(baseHp: number, squadDps: number, sector: number, mul = 1): number {
  return Math.round(Math.max(baseHp, squadDps * bossFightSeconds(sector)) * mul)
}
/** Largest share of the squad a single boss attack can kill (grows by phase and sector). */
export const bossHitCap = (phase: number, sector: number) => Math.min(0.3, 0.12 + 0.05 * phase + 0.015 * Math.max(0, sector))
export const bossPhaseFloor = (sector: number) => Math.min(11, 7 + Math.max(0, sector))
/** Expected damage per second of the whole squad at full focus on one target. */
export function squadDps(o: { soldiers: number; weapon: number; rateMul: number; combat: CombatMods; grenadier: number }): number {
  const w = weaponAt(o.weapon)
  const crit = 1 + critChance(o.combat.sharpshooter) * (critMult(o.combat.sharpshooter) - 1)
  return bulletDamage(o.weapon, o.combat) * w.rate * o.rateMul * o.soldiers * crit * (1 + 0.12 * o.grenadier)
}

// ───────────────────────── Combat maths ─────────────────────────
export interface CombatMods { hollow: number; sharpshooter: number; armoryDamage: number }
export const bulletDamage = (weapon: number, m: CombatMods) => weaponAt(weapon).dmg * (1 + 0.2 * m.hollow) * (1 + 0.08 * m.armoryDamage)
export const critChance = (sharpshooter: number) => 0.05 + 0.1 * sharpshooter
export const critMult = (sharpshooter: number) => (sharpshooter > 0 ? 2.5 : 2)
/** Riot shields absorb 80% of damage from the front. */
export const RIOT_BLOCK = 0.8

// ───────────────────────── Scoring / rewards ─────────────────────────
export const comboMultiplier = (combo: number) => 1 + Math.min(4, Math.floor(combo / 10) * 0.25)
export const COMBO_WINDOW = 2.2
export function runScore(distance: number, killScore: number, bosses: number): number {
  return Math.round(Math.floor(distance) * 2 + killScore + bosses * 1500)
}
export const sectorCoins = (sector: number) => 40 + sector * 35
export function applyCoinBonus(coins: number, scavenger: number, magnet: boolean): number {
  return Math.round(coins * (1 + 0.1 * scavenger) * (magnet ? 2 : 1))
}
export function formatDistance(m: number): string {
  return `${Math.floor(m).toLocaleString('en-US')} m`
}
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
