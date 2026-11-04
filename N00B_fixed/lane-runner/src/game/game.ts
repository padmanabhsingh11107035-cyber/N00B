/**
 * Game orchestration for Lane Runner: Endless.
 *
 * Owns the scene and runs a fixed-step simulation: the squad runs down an endless procedural road
 * (sectors from procgen), soldiers auto-fire real bullets at the nearest threats, gates change the
 * squad, traps/hazards/zombies kill individual soldiers, and every sector ends in a procedural
 * boss arena followed by a perk choice. Rendering adds camera juice (trauma shake, zoom with squad
 * size, hit-stop and slow motion on big moments).
 *
 * Honesty: the squad count shown is the real count used for damage. When more soldiers exist than
 * are drawn, each drawn soldier fires for count/visible soldiers.
 */
import * as THREE from 'three'
import type { Assets } from '../engine/assets'
import type { Audio } from '../engine/audio'
import type { Input } from '../engine/input'
import type { Renderer } from '../engine/renderer'
import { Boss } from './boss'
import { CONFIG } from './config'
import { Enemies, type KillCause, type Zombie } from './enemies'
import { Fx } from './fx'
import { setPropModels, Hazards } from './hazards'
import { ARCHETYPE_LOOKS } from './looks'
import { type Chunk, generateSector, ROAD_HALF, type Sector, type TrapKind } from './procgen'
import {
  AFFIXES, applyCoinBonus, applyGate, ARCH, type Arch, bossHp, bulletDamage, squadDps, COMBO_WINDOW, comboMultiplier, critChance, critMult,
  drawPerks, type GateOp, hpScale, makeRng, MAX_WEAPON, type PerkDef, type PerkId, type PerkStacks, runScore, SECTOR_LEN,
  sectorCoins, sectorOf, type SquadStats, threatAt, trapScale, type UpgradeLevels, weaponAt, weighted, type LurkerArch } from './rules'
import { Squad } from './squad'
import { createVatMaterial, newAnim, VatCrowd, type VatLibrary } from './vat'
import { THEMES, World } from './world'
import { CREATURES } from './creatures'

export type Mode = 'title' | 'playing' | 'paused' | 'perk' | 'over'
export interface RunStats {
  distance: number; sector: number; kills: number; killScore: number; bosses: number; coins: number; score: number
  peakSquad: number; time: number; seed: number; daily: boolean; causes: Record<string, number>; weapon: number; perks: PerkStacks
}
export interface GameEvents {
  hint: (text: string, key: string) => void
  banner: (title: string, sub: string, style: 'sector' | 'boss' | 'clear' | 'phase' | 'danger') => void
  toast: (text: string, tone: 'good' | 'bad' | 'gold' | 'info') => void
  perkChoice: (perks: PerkDef[]) => void
  gameOver: (stats: RunStats) => void
  coinFly: (sx: number, sy: number) => void
  hurt: (amount: number) => void
  squadPulse: (delta: number) => void
  gate: (good: boolean) => void
}
export interface StartOptions { seed: number; daily: boolean; stats: SquadStats; upgrades: UpgradeLevels; tutorial: boolean }

interface Bullet {
  x: number; y: number; z: number; vx: number; vz: number; dmg: number; pierce: number; bounce: number
  life: number; hit: number[]; crit: boolean; color: number; heavy: boolean
}
interface Grenade { x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number }

const SPAWN_AHEAD = 105
/** Measured share of theoretical squad DPS that actually lands on a boss (bot telemetry). */
const BOSS_FOCUS = 0.5
const BULLET_CAP = 700
const MAX_SHOTS_PER_SEC = 340
const TRAP_HINTS: Record<TrapKind, string> = {
  saw: 'SAW BLADE: it sweeps side to side. Time your lane',
  spikes: 'SPIKE PLATE: lights flash red before the spikes fire',
  flame: 'FLAME BAR: nozzles alternate. Run through the dark ones',
  laser: 'LASER FENCE: cross while the beams are off',
  crusher: 'CRUSHER: the red shadow shows where it slams',
  mines: 'MINEFIELD: shoot the mines or weave between them',
  toxic: 'TOXIC POOL: soldiers inside keep dying. Go around',
  airstrike: 'AIRSTRIKE ZONE: keep moving away from the red circles',
}
const ARCH_HINTS: Partial<Record<Arch, string>> = {
  retcher: 'RETCHER: lobs acid from range. Kill it first',
  blister: 'BLISTER: bursts into acid. Pop it far away',
  crawler: 'CRAWLER: low and fast. Keep your guns on the ground',
  riot: 'RIOT ZOMBIE: its shield blocks 80% until it breaks',
  wailer: 'WAILER: its shriek hastes the horde and calls runners',
}

export class Game {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(52, 1, 0.3, 420)
  mode: Mode = 'title'
  reducedMotion = false
  damageNumbers = true
  screenShake = true
  readonly world: World
  readonly fx: Fx
  readonly squad = new Squad()
  readonly enemies: Enemies
  readonly hazards: Hazards
  boss: Boss | null = null
  private shieldTextT = -9
  /** Per-boss fight telemetry for balancing (read by scripts/playtest.mjs). */
  readonly bossLog: { sector: number; hp: number; dps: number; start: number; secs: number; attacks: number; soakedPct: number; squadEnd: number }[] = []
  private soldierCrowd: VatCrowd
  private prisonerCrowd: VatCrowd
  private bullets: Bullet[] = []
  private grenades: Grenade[] = []
  private muzzleLight = new THREE.PointLight(0xffb060, 0, 14, 2)
  // run state
  stats: SquadStats = { count: 0, weapon: 0, rate: 1, fallen: 0 }
  distance = 0
  time = 0
  seed = 1
  daily = false
  kills = 0
  killScore = 0
  bosses = 0
  runCoins = 0
  peak = 0
  combo = 0
  comboT = 0
  grenadeCount = 0
  medkits = 0
  perks: PerkStacks = {}
  shieldCharge = 0
  baseDensity = 1
  busy = false
  private upgrades: UpgradeLevels = { squad: 0, damage: 0, rate: 0, armor: 0, munitions: 0, coins: 0 }
  private tutorial = false
  private sectors = new Map<number, Sector>()
  private cursor = new Map<number, number>()
  private curSector = -1
  private arena: { spec: Sector['boss']; d: number; state: 'approach' | 'fight' | 'clear'; t: number } | null = null
  private causes: Record<string, number> = {}
  private hintsSeen = new Set<string>()
  private rng = makeRng(1)
  private trauma = 0
  private timeScale = 1
  private slowT = 0
  private hitStop = 0
  private camPos = new THREE.Vector3(0, 12, 12)
  private camLook = new THREE.Vector3()
  private medicT = 0
  private grenadierT = 0
  private rallyD = 0
  private overT = 0
  private coinFlyBudget = 0
  private targetsBuf: Zombie[] = []
  private aimBuf: { x: number; z: number; kind: string }[] = []
  private v3 = new THREE.Vector3()
  private tmpColor = new THREE.Color()
  private fps = 60

  constructor(readonly renderer: Renderer, readonly assets: Assets, readonly lib: VatLibrary, readonly audio: Audio, readonly input: Input, textLayer: HTMLElement, private readonly ev: GameEvents) {
    this.scene.add(this.camera)
    this.world = new World(assets, this.scene)
    this.scene.add(this.world.group)
    this.fx = new Fx(this.camera, textLayer)
    this.scene.add(this.fx.group)
    const soldierMat = createVatMaterial(lib, assets.tex('soldier'), { ...ARCHETYPE_LOOKS.soldier, roughness: 0.78 })
    this.soldierCrowd = new VatCrowd(lib, soldierMat, 230)
    this.prisonerCrowd = new VatCrowd(lib, soldierMat, 30)
    this.scene.add(this.soldierCrowd)
    this.muzzleLight.position.set(0, 2, -1)
    this.scene.add(this.muzzleLight)
    this.squad.onJoin = s => this.fx.spawnPuff(s.x, s.z, 0x7ecbff)
    this.squad.onDeath = s => {
      this.fx.gib(s.x, 0.9, s.z, 3, 0.7)
      this.fx.decal('blood', s.x, s.z, 0.9, 0.8)
    }
    this.enemies = new Enemies(lib, assets, {
      fx: this.fx, audio, squad: this.squad,
      onKill: (z, c) => this.onKill(z, c),
      onSoldiersLost: (n, c, x, z) => this.onLost(n, c, x, z),
      shake: a => this.shake(a),
      shieldTrap: () => this.useShield(),
      announce: (arch, how) => this.announceLurker(arch, how),
    })
    this.scene.add(this.enemies.group)
    this.hazards = new Hazards({
      fx: this.fx, audio, squad: this.squad, enemies: this.enemies,
      trapKill: (pred, chance, cause, x, z) => this.trapKill(pred, chance, cause, x, z),
      explode: (x, z, r, d, hurts) => this.explode(x, z, r, d, hurts),
      shake: a => this.shake(a),
      onGate: (spec, _v, x, z) => this.onGate(spec.op, x, z),
      onLoot: (l, x, z) => this.onLoot(l, x, z),
      onRescue: (n, x, z) => this.onRescue(n, x, z),
      onLost: (n, c, x, z) => this.onLost(n, c, x, z),
      onDestroyed: (_k, x, z, coins) => this.addCoins(coins, x, 1, z),
      hpScale: () => this.hp(),
      trapScale: () => trapScale(this.threat) * CONFIG.run.trapMul,
    })
    this.hazards.setPrisonerCrowd(this.prisonerCrowd, newAnim('soldier_cheer'))
    this.scene.add(this.hazards.group)
    this.toTitle()
  }

  /** Call once the fx textures are loaded. */
  initFx() {
    const t = (k: string) => (this.assets.has('tex', k) ? this.assets.tex(k) : undefined)
    setPropModels(this.assets.models)
    this.fx.init({ muzzle: t('muzzle'), fireball: t('fireball'), sparks: t('sparks'), flame: t('flame'), smoke: t('smoke'), blood: t('blood'), acid: t('acid'), scorch: t('scorch') })
  }

  get threat() { return threatAt(this.distance) }
  /**
   * Squad-relative pressure (the genre's rubber band): a bigger, better-armed squad meets bigger and
   * tougher crowds, so growth feels spectacular without ever turning into a walkover.
   * p = squad firepower relative to a ~14-soldier baseline; crowd size takes √p (capped), HP the rest.
   */
  pressure(): { p: number; count: number; hp: number } {
    const fire = this.squad.count * (1 + 0.35 * this.stats.weapon) * this.stats.rate
    const p = Math.max(1, fire / 14)
    const count = Math.min(3.6, Math.sqrt(p))
    return { p, count, hp: Math.pow(p / count, 0.75) }
  }
  /** Expected squad DPS at full focus on one target (weapon, perks, Armory, crits). */
  squadDps() {
    const w = this.perks
    return squadDps({
      soldiers: this.squad.count, weapon: this.stats.weapon,
      rateMul: this.stats.rate * (1 + 0.15 * (w.overclock ?? 0)) * (1 + 0.06 * this.upgrades.rate),
      combat: { hollow: w.hollow ?? 0, sharpshooter: w.sharpshooter ?? 0, armoryDamage: this.upgrades.damage }, grenadier: w.grenadier ?? 0,
    })
  }
  private hp() { return hpScale(this.threat) * CONFIG.run.hpMul * (this.distance < 240 ? 0.8 : 1) * this.pressure().hp }
  get sectorIndex() { return sectorOf(this.distance) }
  sector(i: number): Sector {
    let s = this.sectors.get(i)
    if (!s) { s = generateSector(this.seed, i); this.sectors.set(i, s); this.cursor.set(i, 0) }
    return s
  }

  // ───────────────────────── lifecycle ─────────────────────────
  toTitle() {
    this.clearRun()
    this.mode = 'title'
    this.squad.visibleCap = 150
    this.squad.reset(14)
    this.world.setTheme(0, true)
    this.world.setAlert(0)
  }
  private clearRun() {
    this.enemies.clear()
    this.hazards.clear()
    this.fx.clear()
    if (this.boss) { this.scene.remove(this.boss.group); this.boss.dispose() }
    this.boss = null
    this.bullets.length = 0
    this.grenades.length = 0
    this.sectors.clear()
    this.cursor.clear()
    this.arena = null
    this.distance = 0
    this.squad.z = 0
    this.squad.x = 0
    this.squad.targetX = 0
    this.curSector = -1
    this.trauma = 0
    this.audio.stopLoops()
  }

  start(o: StartOptions) {
    this.clearRun()
    this.seed = o.seed >>> 0
    this.daily = o.daily
    this.rng = makeRng(this.seed ^ 0xabcdef)
    this.upgrades = o.upgrades
    this.stats = { ...o.stats, count: o.stats.count + CONFIG.squad.startBonus }
    this.tutorial = o.tutorial
    this.time = 0; this.kills = 0; this.killScore = 0; this.bosses = 0; this.runCoins = 0; this.combo = 0; this.comboT = 0
    this.perks = {}
    this.causes = {}
    this.hintsSeen.clear()
    this.grenadeCount = 1 + o.upgrades.munitions
    this.medkits = 1 + o.upgrades.munitions
    this.shieldCharge = 0
    this.medicT = 0; this.grenadierT = 0; this.rallyD = 0; this.overT = 0
    this.squad.armor = 0.06 * o.upgrades.armor
    this.squad.reset(this.stats.count)
    this.peak = this.squad.count
    this.timeScale = 1; this.slowT = 0; this.hitStop = 0
    this.mode = 'playing'
    this.enterSector(0)
    this.audio.playMusic('run')
  }
  pause() { if (this.mode === 'playing') { this.mode = 'paused'; this.audio.pauseAll(true) } }
  resume() { if (this.mode === 'paused') { this.mode = 'playing'; this.audio.pauseAll(false) } }

  choosePerk(id: PerkId) {
    if (this.mode !== 'perk') return
    this.perks[id] = (this.perks[id] ?? 0) + 1
    if (id === 'shield') this.shieldCharge = 1
    this.audio.play('perk', { vol: 0.8 })
    this.fx.gateBurst(this.squad.x, 1.2, this.squad.z, 4, 0xffd24a)
    this.squad.cheering = 1.2
    this.mode = 'playing'
    this.audio.playMusic('run')
  }

  private enterSector(i: number) {
    this.curSector = i
    const s = this.sector(i)
    this.sector(i + 1)
    this.world.setTheme(s.theme, i === 0)
    if (this.perks.shield) this.shieldCharge = 1
    this.ev.banner(`SECTOR ${i + 1}`, THEMES[s.theme].name.toUpperCase(), 'sector')
    if (i > 0) this.ev.toast(`THREAT ${(threatAt(s.start) + 1).toFixed(1)}  ·  ZOMBIE HP ×${hpScale(threatAt(s.start)).toFixed(1)}`, 'info')
    // staggered loading: current + next sector now, the rest in the background
    void this.assets.require(`sector-${Math.min(i, 3)}`)
    void this.assets.require(`sector-${Math.min(i + 1, 3)}`)
    this.assets.prefetch([`sector-${Math.min(i + 2, 3)}`, 'late'])
  }

  // ───────────────────────── spawning ─────────────────────────
  private spawnChunks() {
    const i = this.curSector
    for (const si of [i, i + 1]) {
      const s = this.sector(si)
      let c = this.cursor.get(si) ?? 0
      while (c < s.chunks.length) {
        const ch = s.chunks[c]
        const trigger = ch.kind === 'ambush' ? ch.d - 10 : ch.kind === 'rooftop' ? ch.d - 75 : ch.kind === 'burrow' ? ch.d - 62 : ch.kind === 'hint' ? ch.d : ch.kind === 'boss' ? ch.d - 60 : ch.d - SPAWN_AHEAD
        if (this.distance < trigger) break
        // never start the next sector's content before this sector's boss is dead
        if (si > i && this.arena) break
        this.spawnChunk(ch)
        c++
      }
      this.cursor.set(si, c)
      if (c < s.chunks.length) break
    }
  }
  private pickArch(mix: Partial<Record<Arch, number>>): Arch {
    const a = weighted(this.rng, mix)
    return this.enemies.available(a) ? a : 'walker'
  }
  private lurkerBannerT = -99
  private announceLurker(arch: LurkerArch, how: 'roof' | 'wall' | 'burrow') {
    this.hintOnce(arch, CREATURES[arch].hint)
    if (this.time - this.lurkerBannerT < 7) return
    this.lurkerBannerT = this.time
    if (how === 'roof') this.ev.banner('ROOFTOP AMBUSH!', 'LEAPERS ABOVE. WATCH THE RED RINGS', 'danger')
    else if (how === 'wall') this.ev.banner('ON THE WALLS!', 'QUILLERS ARE CRAWLING DOWN', 'danger')
    else this.ev.banner(arch === 'howler' ? 'HOWLER BELOW!' : 'SOMETHING BURROWS…', arch === 'howler' ? 'SHOOT THE SAC OR LEAVE ITS LANE' : 'IT SURFACES INSIDE THE RED RING', 'danger')
  }
  /** Scale a Lurker pack with squad pressure (gentler than hordes: these are elite threats). */
  private lurkerPack(archs: LurkerArch[]): LurkerArch[] {
    const k = Math.min(1.7, Math.sqrt(Math.max(1, this.pressure().count)) * CONFIG.run.densityMul)
    const out = archs.map(a => (this.enemies.available(a) ? a : a === 'quiller' ? 'leaper' : a === 'howler' ? 'gulper' : a))
      .filter(a => this.enemies.available(a))
    const extra = Math.round(out.length * k) - out.length
    for (let i = 0; i < extra && out.length; i++) out.push(out[i % out.length])
    return out
  }
  private hintOnce(key: string, text: string) {
    if (this.hintsSeen.has(key)) return
    this.hintsSeen.add(key)
    this.ev.hint(text, key)
  }
  private spawnChunk(ch: Chunk) {
    const hp = this.hp()
    const rnd = this.rng
    switch (ch.kind) {
      case 'hint': if (this.tutorial) this.ev.hint(ch.text, ch.key); return
      case 'horde': {
        const n = Math.round(ch.count * CONFIG.run.densityMul * this.pressure().count)
        const z0 = -ch.d
        for (let k = 0; k < n; k++) {
          let x = 0, z = 0
          const u = rnd(), v = rnd()
          switch (ch.formation) {
            case 'flood': x = (u * 2 - 1) * (ROAD_HALF - 0.5); z = z0 - v * ch.depth; break
            case 'wedge': { const row = v * ch.depth; x = (u * 2 - 1) * Math.min(ROAD_HALF - 0.5, 0.6 + row * 0.45); z = z0 - row; break }
            case 'pincer': x = (u < 0.5 ? -1 : 1) * (ROAD_HALF - 0.8 - rnd() * 2.6); z = z0 - v * ch.depth; break
            case 'stream': x = (ch.d % 2 ? -1 : 1) * 2.8 + (u - 0.5) * 3; z = z0 - v * ch.depth * 1.6; break
          }
          const arch = this.pickArch(ch.mix)
          const elite = rnd() < ch.elite ? AFFIXES[Math.floor(rnd() * AFFIXES.length)] : null
          this.enemies.spawn(arch, x, z, hp, { elite })
          const h = ARCH_HINTS[arch]
          if (h) this.hintOnce(arch, h)
        }
        return
      }
      case 'ambush': {
        const n = Math.round(ch.count * CONFIG.run.densityMul * this.pressure().count)
        this.ev.banner('AMBUSH!', 'THEY ARE COMING FROM THE SIDES', 'danger')
        this.audio.play('scream', { vol: 0.6 })
        for (let k = 0; k < n; k++) {
          const side = k % 2 ? -1 : 1
          this.enemies.spawn(this.pickArch(ch.mix), side * (ROAD_HALF + 1.5 + rnd() * 2), this.squad.z - 10 - rnd() * 14, hp, { state: 'chase', wake: 99 })
        }
        return
      }
      case 'rooftop': {
        const pack = this.lurkerPack(ch.archs)
        const n = pack.length ? this.enemies.ambushRoof(pack, -ch.d, hp, (side, z) => this.world.buildingAt(side, z)) : 0
        if (!n) this.spawnChunk({ kind: 'ambush', d: ch.d, count: 6 + ch.archs.length * 2, mix: { runner: 3, crawler: 1 } })
        return
      }
      case 'burrow': {
        const pack = this.lurkerPack(ch.archs).slice(0, 4)
        const n = pack.length ? this.enemies.ambushBurrow(pack, -ch.d, hp) : 0
        if (!n) this.spawnChunk({ kind: 'ambush', d: ch.d, count: 8, mix: { crawler: 2, runner: 1 } })
        return
      }
      case 'elite': {
        const arch = this.enemies.available(ch.arch) ? ch.arch : 'walker'
        this.enemies.spawn(arch, 0, -ch.d - 6, hp, { elite: ch.affix })
        this.hintOnce('elite', 'ELITE ZOMBIE: glowing aura, 3× HP and a special power')
        const esc = Math.round(ch.escort * CONFIG.run.densityMul * this.pressure().count)
        for (let k = 0; k < esc; k++) this.enemies.spawn(this.pickArch({ walker: 2, runner: 1 }), (rnd() * 2 - 1) * (ROAD_HALF - 0.5), -ch.d - rnd() * 10, hp)
        return
      }
      case 'barricade': {
        this.hazards.spawn(ch)
        const esc = Math.round(ch.escort * CONFIG.run.densityMul * this.pressure().count)
        for (let k = 0; k < esc; k++) this.enemies.spawn(this.pickArch({ walker: 2, walker2: 1, runner: 1 }), (rnd() * 2 - 1) * (ROAD_HALF - 0.5), -ch.d - 2 - rnd() * 8, hp)
        this.hintOnce('barricade', 'BARRICADE: it blocks the road. Shoot it down')
        return
      }
      case 'trap':
        this.hazards.spawn(ch)
        this.hintOnce(`trap-${ch.trap}`, TRAP_HINTS[ch.trap])
        return
      case 'turret': this.hazards.spawn(ch); this.hintOnce('turret', 'ENEMY TURRET: destroy it before it picks off your squad'); return
      case 'supply': this.hazards.spawn(ch); this.hintOnce('supply', 'SUPPLY CRATE: shoot it open for loot'); return
      case 'rescue': this.hazards.spawn(ch); this.hintOnce('rescue', 'SURVIVORS: shoot the cage to free them'); return
      case 'boss':
        this.arena = { spec: ch.spec, d: ch.d, state: 'approach', t: 0 }
        void this.assets.require(`sector-${Math.min(this.curSector, 3)}`)
        return
      default: this.hazards.spawn(ch)
    }
  }

  // ───────────────────────── callbacks ─────────────────────────
  private useShield(): boolean {
    if (this.shieldCharge <= 0) return false
    this.shieldCharge = 0
    this.fx.gateBurst(this.squad.x, 1.2, this.squad.z, this.squad.halfW * 2 + 1, 0x8ac8ff)
    this.fx.text(this.squad.x, 2.6, this.squad.z, 'BLAST SHIELD!', 'good', 1.2)
    this.audio.play('shield_break', { vol: 0.8 })
    return true
  }
  private trapKill(pred: (x: number, z: number) => boolean, chance: number, cause: string, x: number, z: number): number {
    let any = false
    for (const s of this.squad.soldiers) if (pred(s.x, s.z)) { any = true; break }
    if (!any) return 0
    if (this.useShield()) return 0
    const lost = this.squad.killWhere(pred, Math.min(1, chance * CONFIG.run.trapMul))
    if (lost) this.onLost(lost, cause, x, z)
    return lost
  }
  private onLost(n: number, cause: string, x: number, z: number) {
    if (n <= 0) return
    this.stats.fallen += n
    this.causes[cause] = (this.causes[cause] ?? 0) + n
    this.fx.text(x, 2.2, z, `−${n}`, 'loss', 0.9)
    this.audio.play('soldier_down', { vol: 0.55, max: 3, gap: 0.08 })
    this.ev.hurt(n)
    this.ev.squadPulse(-n)
    this.shake(Math.min(0.35, 0.08 + n * 0.02))
  }
  private onKill(z: Zombie, _cause: KillCause) {
    const d = ARCH[z.arch]
    this.kills++
    this.combo++
    this.comboT = COMBO_WINDOW
    const mult = comboMultiplier(this.combo)
    this.killScore += Math.round(d.score * (z.elite ? 3 : 1) * mult)
    this.addCoins(d.coins * (z.elite ? 4 : 1), z.x, 1.2, z.z)
    if (z.elite) { this.fx.text(z.x, 2.8, z.z, 'ELITE DOWN', 'elite', 1); this.hit(0.06) }
    if (z.arch === 'brute') { this.shake(0.25); this.hit(0.05) }
    if (this.combo % 25 === 0) this.ev.toast(`${this.combo} KILL STREAK  ×${mult.toFixed(2)}`, 'gold')
  }
  private addCoins(n: number, x: number, y: number, z: number) {
    if (n <= 0 || this.mode === 'title') return
    this.runCoins += applyCoinBonus(n, this.upgrades.coins, !!this.perks.magnet)
    this.fx.coinSpark(x, y, z)
    if (this.coinFlyBudget >= 1) {
      this.coinFlyBudget--
      this.v3.set(x, y, z).project(this.camera)
      if (this.v3.z < 1) this.ev.coinFly((this.v3.x * 0.5 + 0.5) * innerWidth, (-this.v3.y * 0.5 + 0.5) * innerHeight)
    }
  }
  private onGate(op: GateOp, x: number, z: number) {
    const before = this.squad.count
    const res = applyGate({ ...this.stats, count: before }, op, this.rng())
    this.stats = res.stats
    this.fx.gateBurst(x, 1.8, z, 5, op.kind === 'weapon' && res.good ? 0xffb52a : res.good ? 0x3aa8ff : 0xff3a2a)
    this.fx.text(x, 3.2, z, res.text, res.good ? 'big' : 'bad', 1.3)
    this.audio.play(res.good ? 'gate_good' : 'gate_bad', { vol: 0.8 })
    this.ev.gate(res.good)
    if (res.stats.count !== before) {
      this.squad.setCount(res.stats.count, { x, z: z + 1 })
      if (res.stats.count > before) { this.audio.play('join', { vol: 0.6 }); this.squad.cheering = 0.4 }
      this.ev.squadPulse(res.stats.count - before)
    }
    if (op.kind === 'weapon' && res.good) this.ev.toast(`WEAPON: ${weaponAt(this.stats.weapon).name.toUpperCase()}`, 'gold')
    if (!res.good) this.shake(0.2)
  }
  private onLoot(l: 'weapon' | 'grenade' | 'medkit' | 'coins', x: number, z: number) {
    switch (l) {
      case 'weapon':
        if (this.stats.weapon < MAX_WEAPON) { this.stats.weapon++; this.ev.toast(`WEAPON: ${weaponAt(this.stats.weapon).name.toUpperCase()}`, 'gold') }
        else { this.addCoins(30, x, 1, z); this.ev.toast('MAX WEAPON: +30 COINS', 'gold') }
        break
      case 'grenade': this.grenadeCount++; this.ev.toast('+1 GRENADE', 'good'); break
      case 'medkit': this.medkits++; this.ev.toast('+1 MEDKIT', 'good'); break
      case 'coins': this.coinFlyBudget += 10; this.addCoins(25 + this.curSector * 15, x, 1, z); this.ev.toast('COIN CACHE', 'gold'); break
    }
    this.audio.play('coin', { vol: 0.7 })
    this.fx.text(x, 2.4, z, l.toUpperCase(), 'gold', 1)
  }
  private onRescue(n: number, x: number, z: number) {
    this.squad.setCount(this.squad.count + n, { x, z })
    this.fx.text(x, 3, z, `+${n} SURVIVORS`, 'big', 1.2)
    this.audio.play('join', { vol: 0.8 })
    this.ev.squadPulse(n)
  }
  private explode(x: number, z: number, r: number, dmg: number, hurtsSquad: boolean) {
    this.fx.explosion(x, 0.6, z, r * 0.45)
    this.fx.decal('scorch', x, z, r * 1.5, 0.85)
    this.fx.shockwave(x, z, r, 0xffa050)
    this.audio.play('explosion', { vol: 0.85, max: 4, gap: 0.05 })
    this.shake(0.3 + Math.min(0.3, r * 0.05))
    this.enemies.forEachNear(x, z, r, zb => {
      const f = 1 - (Math.hypot(zb.x - x, zb.z - z) / (r + zb.radius)) * 0.5
      this.enemies.damage(zb, dmg * f, 'explosion', x, z, 3)
    })
    this.hazards.blast(x, z, r, dmg * 0.5)
    const b = this.boss
    if (b?.alive && Math.hypot(b.x - x, b.z - z) < r + b.radius) this.damageBoss(dmg * 0.4, b.x, 2, b.z, false)
    if (hurtsSquad) this.trapKill((sx, sz) => (sx - x) ** 2 + (sz - z) ** 2 < r * r * 0.8, 0.75, 'explosion', x, z)
  }
  private damageBoss(dmg: number, x: number, y: number, z: number, crit: boolean) {
    const b = this.boss
    if (!b) return
    const killed = b.damage(dmg)
    if (b.absorbed > 0) {
      // the phase barrier soaked this hit: blue sparks + an occasional SHIELDED callout
      b.absorbed = 0
      if (Math.random() < 0.35) this.fx.sparks(x, y, z, 2, 0x6ad8ff, 6)
      if (this.time - this.shieldTextT > 1.8) { this.shieldTextT = this.time; this.fx.text(x, y + 0.6, z, 'SHIELDED', 'elite', 0.8) }
      return
    }
    if (this.damageNumbers && (crit || Math.random() < 0.15)) this.fx.text(x, y, z, Math.round(dmg).toString(), crit ? 'crit' : 'dmg', 0.6)
    if (killed) this.onBossKilled()
  }
  private onBossKilled() {
    const b = this.boss!
    const log = this.bossLog[this.bossLog.length - 1]
    if (log) Object.assign(log, { secs: +(this.time - log.start).toFixed(1), attacks: b.attackCount, soakedPct: Math.round((100 * b.soaked) / b.maxHp), squadEnd: this.squad.count })
    this.bosses++
    this.killScore += 1500 * (b.spec.sector + 1)
    this.slowT = 1.6
    this.coinFlyBudget += 16
    this.addCoins(sectorCoins(b.spec.sector), b.x, 3, b.z)
    for (let i = 0; i < 16; i++) this.fx.coinSpark(b.x + (Math.random() - 0.5) * 4, 1 + Math.random() * 4, b.z + (Math.random() - 0.5) * 3)
    this.ev.banner('BOSS DEFEATED', b.spec.name, 'clear')
    this.audio.play('victory', { vol: 0.9 })
    this.audio.stopMusic(1.5)
    this.squad.cheering = 3
    for (const zb of this.enemies.list) if (zb.state !== 'dead' && Math.abs(zb.z - b.z) < 30) this.enemies.kill(zb, 'explosion', true)
    if (this.arena) { this.arena.state = 'clear'; this.arena.t = 0 }
  }
  private throwGrenade(auto = false) {
    if (this.mode !== 'playing') return
    if (!auto) {
      if (this.grenadeCount <= 0) { this.audio.play('ui_click', { vol: 0.3, rate: 0.6 }); return }
      this.grenadeCount--
    }
    const sq = this.squad
    let tx = sq.x, tz = sq.z - 18
    const b = this.boss
    const dense = b?.alive ? { x: b.x, z: b.z } : this.enemies.densest(sq.x, sq.z, 34)
    if (dense) { tx = dense.x; tz = dense.z }
    const T = 0.8
    this.grenades.push({ x: sq.x, y: 1.6, z: sq.z - 0.5, vx: (tx - sq.x) / T, vy: 8.8, vz: (tz - sq.z + 0.5) / T, t: T })
    this.audio.play('ui_click', { vol: 0.5, rate: 0.8 })
    if (!auto) this.ev.toast('GRENADE OUT!', 'info')
  }
  private useMedkit() {
    if (this.mode !== 'playing') return
    if (this.medkits <= 0) { this.audio.play('ui_click', { vol: 0.3, rate: 0.6 }); return }
    if (this.stats.fallen <= 0) { this.ev.toast('NO FALLEN SOLDIERS TO REVIVE', 'info'); return }
    this.medkits--
    const add = Math.min(this.stats.fallen, Math.max(6, Math.ceil(this.stats.fallen * 0.35)))
    this.stats.fallen -= add
    this.squad.setCount(this.squad.count + add, { x: this.squad.x, z: this.squad.z + 1 })
    for (const s of this.squad.soldiers) if (Math.random() < 0.5) this.fx.heal(s.x, 1, s.z)
    this.fx.shockwave(this.squad.x, this.squad.z, 4, 0x6aff9a)
    this.fx.text(this.squad.x, 3, this.squad.z, `+${add} REVIVED`, 'good', 1.2)
    this.audio.play('perk', { vol: 0.7, rate: 1.2 })
    this.ev.squadPulse(add)
  }
  shake(a: number) { if (this.screenShake && !this.reducedMotion) this.trauma = Math.min(1, this.trauma + a) }
  private hit(s: number) { if (!this.reducedMotion) this.hitStop = Math.max(this.hitStop, s) }
  setVisibleCap(n: number) { this.squad.visibleCap = n }
  /** Screen position (CSS px) above the squad centre for the HUD count tag, or null if off-screen. */
  squadAnchor(): { x: number; y: number } | null {
    const sq = this.squad
    if (!sq.count) return null
    this.v3.set(sq.x, 2.3 + Math.min(1.2, Math.sqrt(sq.count) * 0.08), sq.z - sq.halfD * 0.3).project(this.camera)
    if (this.v3.z > 1) return null
    return { x: (this.v3.x * 0.5 + 0.5) * innerWidth, y: (-this.v3.y * 0.5 + 0.5) * innerHeight }
  }
  pressGrenade() { this.throwGrenade() }
  pressMedkit() { this.useMedkit() }

  // ───────────────────────── simulation ─────────────────────────
  step(dt: number) {
    if (this.mode === 'title') { this.stepTitle(dt); return }
    if (this.mode !== 'playing') return
    if (this.hitStop > 0) { this.hitStop -= dt; return }
    if (this.slowT > 0) { this.slowT -= dt; this.timeScale = 0.35 } else this.timeScale = 1
    const d = dt * this.timeScale
    this.time += d
    const sq = this.squad
    if (this.input.consume('grenade')) this.throwGrenade()
    if (this.input.consume('medkit')) this.useMedkit()
    const drag = this.input.takeDrag()
    sq.targetX = Math.max(-ROAD_HALF + 0.6, Math.min(ROAD_HALF - 0.6, sq.targetX + drag * CONFIG.squad.dragSensitivity + this.input.steer * CONFIG.squad.steerSpeed * d))
    // forward motion (halts at barricades and in the boss arena)
    let forward = CONFIG.squad.runSpeed
    const block = this.hazards.blockZ(sq.z)
    if (block !== null) {
      const gap = sq.z - sq.halfD - 1.2 - block
      forward = Math.max(0, Math.min(forward, gap / d))
    }
    if (this.arena) {
      if (this.arena.state !== 'clear' && this.distance >= this.arena.d) forward = 0
      this.stepArena(d)
    }
    sq.update(d, forward, CONFIG.squad.steerSpeed)
    this.distance = -sq.z
    const si = this.sectorIndex
    if (si !== this.curSector && !this.arena) this.enterSector(si)
    this.spawnChunks()
    this.stepPerks(d)
    this.fire(d)
    this.stepBullets(d)
    this.stepGrenades(d)
    this.enemies.update(d)
    this.hazards.update(d)
    if (this.boss) this.boss.update(d)
    this.comboT -= d
    if (this.comboT <= 0) this.combo = 0
    this.coinFlyBudget = Math.min(12, this.coinFlyBudget + d * 6)
    this.peak = Math.max(this.peak, sq.count)
    this.stats.count = sq.count
    if (sq.blocked > 0) { this.fx.text(sq.x, 2.4, sq.z, 'ARMOR!', 'good', 0.6); sq.blocked = 0 }
    if (sq.count <= 0) {
      this.overT += dt
      this.slowT = 0.2
      if (this.overT > 1.2) this.gameOver()
    }
  }

  private stepArena(d: number) {
    const a = this.arena!
    a.t += d
    if (a.state === 'approach' && this.distance >= a.d - 30 && !this.boss) {
      // Size the fight to the squad's real firepower (see rules.bossHp) so every boss gets to fight.
      // ~40–70% of theoretical DPS lands on the boss in practice (adds soak fire, back ranks out of range, misses)
      const hp = bossHp(a.spec.hp, this.squadDps() * BOSS_FOCUS, a.spec.sector, CONFIG.run.bossHpMul)
      this.boss = new Boss({ ...a.spec, hp }, this.lib, this.assets, {
        fx: this.fx, audio: this.audio, squad: this.squad, enemies: this.enemies, shake: x => this.shake(x),
        onLost: (n, c, x, z) => this.onLost(n, c, x, z), hpScale: () => this.hp(), shieldTrap: () => this.useShield(),
        onPhase: t => this.ev.banner(t, this.boss?.spec.name ?? '', 'phase'),
      }, -a.d - 38)
      this.scene.add(this.boss.group)
      this.bossLog.push({ sector: a.spec.sector, hp, dps: Math.round(this.squadDps()), start: this.time, secs: 0, attacks: 0, soakedPct: 0, squadEnd: 0 })
      this.audio.playMusic('boss')
      this.audio.play('boss_intro', { vol: 0.9 })
      this.ev.banner(`BOSS: ${this.boss.title.toUpperCase()}`, a.spec.name, 'boss')
      this.world.setAlert(1)
      a.state = 'fight'
    }
    if (a.state === 'clear') {
      this.world.setAlert(0)
      if (a.t > 2.6) {
        if (this.boss) { this.scene.remove(this.boss.group); this.boss.dispose() }
        this.boss = null
        this.arena = null
        const choices = drawPerks(this.rng, this.perks, 3)
        if (choices.length) { this.mode = 'perk'; this.ev.perkChoice(choices) } else this.audio.playMusic('run')
      }
    }
  }

  private stepPerks(d: number) {
    const p = this.perks
    if (p.medic) {
      this.medicT += d
      if (this.medicT >= 6 / p.medic) {
        this.medicT = 0
        if (this.stats.fallen > 0) {
          this.stats.fallen--
          this.squad.setCount(this.squad.count + 1, { x: this.squad.x, z: this.squad.z + 1.5 })
          this.fx.heal(this.squad.x, 1.4, this.squad.z)
        }
      }
    }
    if (p.grenadier) {
      this.grenadierT += d
      if (this.grenadierT >= 4 / p.grenadier) { this.grenadierT = 0; if (this.enemies.alive > 4 || this.boss?.alive) this.throwGrenade(true) }
    }
    if (p.rally) {
      this.rallyD += CONFIG.squad.runSpeed * d
      if (this.rallyD >= 100 / p.rally) { this.rallyD = 0; this.squad.setCount(this.squad.count + 1, { x: this.squad.x, z: this.squad.z + 3 }); this.ev.squadPulse(1) }
    }
  }

  private fire(d: number) {
    const sq = this.squad
    this.muzzleLight.intensity *= 0.8
    if (!sq.soldiers.length) return
    const w = weaponAt(this.stats.weapon)
    const rate = w.rate * this.stats.rate * (1 + 0.15 * (this.perks.overclock ?? 0)) * (1 + 0.06 * this.upgrades.rate)
    const desired = sq.soldiers.length * rate
    const budget = Math.min(desired, MAX_SHOTS_PER_SEC)
    const perShotComp = desired / Math.max(1e-3, budget) // fewer bullets carry the full damage
    const perRate = budget / sq.soldiers.length
    const dmgBase = bulletDamage(this.stats.weapon, { hollow: this.perks.hollow ?? 0, sharpshooter: this.perks.sharpshooter ?? 0, armoryDamage: this.upgrades.damage })
    const dmg = dmgBase * sq.perVisible * perShotComp
    const range = CONFIG.combat.range
    const targets = this.enemies.targets(sq.x, sq.z, range, this.targetsBuf)
    const aims = this.hazards.aimTargets(sq.z, range, this.aimBuf)
    const boss = this.boss?.alive && this.boss.state !== 'intro' ? this.boss : null
    const speed = w.speed * CONFIG.combat.bulletSpeedMul
    const sharpshooter = this.perks.sharpshooter ?? 0
    let muzzles = 0
    let shots = 0
    for (const s of sq.soldiers) {
      s.fireCd -= d
      if (s.fireCd > 0 || s.joinT > 0.2) continue
      s.fireCd += (1 / perRate) * (0.85 + Math.random() * 0.3)
      if (s.fireCd < 0) s.fireCd = 0
      // aim: nearest zombie in this soldier's cone, else boss, else a shootable, else straight ahead
      let tx = s.x, tz = s.z - range
      let found = false
      for (const t of targets) {
        const dz = s.z - t.z
        if (dz < 0.5) continue
        if (Math.abs(t.x - s.x) < 1 + CONFIG.combat.aimWindow * (dz / range)) { tx = t.x; tz = t.z; found = true; break }
      }
      if (!found && boss && s.z - boss.z < range + 10) { tx = boss.x + (Math.random() - 0.5) * boss.radius; tz = boss.z; found = true }
      if (!found) for (const a of aims) if (Math.abs(a.x - s.x) < 1 + CONFIG.combat.aimWindow) { tx = a.x + (Math.random() - 0.5); tz = a.z; break }
      if (this.bullets.length >= BULLET_CAP) continue
      const base = Math.atan2(tx - s.x, tz - (s.z - 0.55))
      for (let p = 0; p < w.pellets; p++) {
        const ang = base + (Math.random() - 0.5) * w.spread * 2
        const crit = Math.random() < critChance(sharpshooter)
        this.bullets.push({
          x: s.x + 0.12, y: 1.25, z: s.z - 0.55, vx: Math.sin(ang) * speed, vz: Math.cos(ang) * speed,
          dmg: (dmg / w.pellets) * (crit ? critMult(sharpshooter) : 1), pierce: w.pierce + (this.perks.pierce ?? 0),
          bounce: this.perks.ricochet ?? 0, life: range / speed + 0.1, hit: [], crit, color: w.color, heavy: w.heavy,
        })
      }
      s.recoil = 1
      shots++
      if (muzzles < 26 && Math.random() < 0.6) { muzzles++; this.fx.muzzle(s.x + 0.12, 1.25, s.z - 0.7, w.heavy, w.color) }
      if (Math.random() < 0.08) this.fx.casing(s.x + 0.25, 1.2, s.z - 0.2)
    }
    if (shots) {
      this.audio.play(w.heavy ? 'shot_heavy' : 'shot_rifle', { vol: Math.min(0.5, 0.18 + shots * 0.02), jitter: 0.08, max: 6, gap: w.heavy ? 0.05 : 0.035 })
      this.muzzleLight.intensity = Math.min(9, 3 + shots * 0.6)
    }
    this.muzzleLight.position.set(sq.x, 2.2, sq.z - sq.halfD - 1)
  }

  private stepBullets(d: number) {
    const e = this.enemies
    const boss = this.boss?.alive && this.boss.state !== 'intro' ? this.boss : null
    const inc = this.perks.incendiary ?? 0
    const chain = this.perks.chain ?? 0
    let w = 0
    for (const b of this.bullets) {
      const x0 = b.x, z0 = b.z
      b.x += b.vx * d; b.z += b.vz * d
      b.life -= d
      let alive = b.life > 0
      const hz = this.hazards.hitSegment(x0, z0, b.x, b.z, b.dmg)
      if (hz) {
        this.fx.impact(hz.x, 1.2, hz.z, false, b.color)
        if (hz.absorbed) alive = false
      }
      if (alive && boss) {
        const lx = b.x - x0, lz = b.z - z0
        const t = Math.max(0, Math.min(1, ((boss.x - x0) * lx + (boss.z - z0) * lz) / (lx * lx + lz * lz || 1)))
        const px = x0 + lx * t, pz = z0 + lz * t
        if ((px - boss.x) ** 2 + (pz - boss.z) ** 2 < boss.radius * boss.radius) {
          this.fx.impact(px, 1 + Math.random() * boss.scale * 0.8, pz + 0.3, true)
          this.damageBoss(b.dmg, px, 1.5 + Math.random() * boss.scale, pz, b.crit)
          alive = false
        }
      }
      if (alive) {
        const z = e.hitSegment(x0, z0, b.x, b.z, 0.08, b.hit)
        if (z) {
          b.hit.push(z.id)
          this.fx.impact(z.x, 0.9 + Math.random() * 0.8 * z.scale, z.z + 0.2, true)
          const killed = e.damage(z, b.dmg, 'bullet', x0, z0 + 3, b.heavy ? 1.5 : 1)
          if (this.damageNumbers && (b.crit || Math.random() < 0.12)) this.fx.text(z.x, 2 * z.scale, z.z, Math.round(b.dmg).toString(), b.crit ? 'crit' : z.burn > 0 ? 'burn' : 'dmg', 0.55)
          if (inc && !killed) { z.burn = 3; z.burnDps = Math.max(z.burnDps, b.dmg * 0.6 * inc) }
          if (chain && Math.random() < 0.1 * chain) this.chainLightning(z, b.dmg * 0.8)
          if (b.pierce > 0) { b.pierce--; b.dmg *= 0.8 }
          else if (b.bounce > 0) {
            b.bounce--
            let best: Zombie | null = null
            let bd = 36
            e.forEachNear(z.x, z.z, 6, o => {
              if (o.state === 'dead' || b.hit.includes(o.id)) return
              const dd = (o.x - z.x) ** 2 + (o.z - z.z) ** 2
              if (dd < bd) { bd = dd; best = o }
            })
            const o = best as Zombie | null
            if (o) {
              const sp = Math.hypot(b.vx, b.vz)
              const l = Math.sqrt(bd) || 1
              b.vx = ((o.x - z.x) / l) * sp; b.vz = ((o.z - z.z) / l) * sp
              b.x = z.x; b.z = z.z; b.dmg *= 0.5; b.life = 0.3
              this.fx.sparks(z.x, 1.2, z.z, 3, 0xbfe0ff, 5)
            } else alive = false
          } else alive = false
        }
      }
      if (alive) this.bullets[w++] = b
    }
    this.bullets.length = w
  }

  private chainLightning(from: Zombie, dmg: number) {
    let n = 0
    this.enemies.forEachNear(from.x, from.z, 5, o => {
      if (o === from || o.state === 'dead' || n >= 3) return
      n++
      this.fx.lightningArc(from.x, 1.3, from.z, o.x, 1.3, o.z)
      this.enemies.damage(o, dmg, 'lightning', from.x, from.z, 0.5)
    })
    if (n) this.audio.play('laser', { vol: 0.25, rate: 1.8, max: 2, gap: 0.1 })
  }

  private stepGrenades(d: number) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i]
      g.t -= d
      g.vy -= 22 * d
      g.x += g.vx * d; g.y += g.vy * d; g.z += g.vz * d
      if (Math.random() < 0.6) this.fx.alphaP('smoke', g.x, g.y, g.z, 0, 0.3, 0, 0.5, 0.25, 0.6, 0x8a8480, 0.5)
      this.fx.addP('glow', g.x, g.y, g.z, 0, 0, 0, 0.05, 0.4, 0.4, 0xff9a3a, 1)
      if (g.y <= 0.2 || g.t <= -0.5) {
        this.grenades.splice(i, 1)
        this.explode(g.x, g.z, 4.6, CONFIG.combat.grenadeDamage * this.hp() * (1 + 0.08 * this.upgrades.damage), false)
        this.hit(0.04)
      }
    }
  }

  private gameOver() {
    this.mode = 'over'
    this.audio.stopMusic(1)
    this.audio.stopLoops()
    this.audio.play('defeat', { vol: 0.9 })
    this.ev.gameOver(this.runStats())
  }
  runStats(): RunStats {
    return {
      distance: this.distance, sector: this.sectorIndex, kills: this.kills, killScore: this.killScore, bosses: this.bosses,
      coins: this.runCoins, score: runScore(this.distance, this.killScore, this.bosses), peakSquad: this.peak, time: this.time,
      seed: this.seed, daily: this.daily, causes: { ...this.causes }, weapon: this.stats.weapon, perks: { ...this.perks },
    }
  }

  private stepTitle(dt: number) {
    this.time += dt
    this.squad.targetX = Math.sin(this.time * 0.35) * 2.2
    this.squad.update(dt, 6.5, 6)
    this.distance = -this.squad.z
    if (this.distance > SECTOR_LEN * 0.8) { this.squad.z = 0; this.squad.reset(14) }
  }

  // ───────────────────────── rendering ─────────────────────────
  render(_alpha: number, frameDt: number) {
    this.fps += (1 / Math.max(1e-3, frameDt) - this.fps) * 0.05
    const sq = this.squad
    const frozen = this.mode === 'paused' || this.mode === 'perk'
    const dt = frozen ? 0 : Math.min(0.05, frameDt) * (this.mode === 'playing' ? this.timeScale : 1)
    this.world.update(frozen ? 0 : frameDt, this.camera.position.z, this.fx.ready ? this.fx : null, !this.busy)
    this.renderer.gl.toneMappingExposure = this.world.exposure
    this.fx.setFog(this.world.fogNear, this.world.fogFar, this.world.fogColor)
    const shadow = (x: number, z: number, r: number, a: number) => { if (this.fx.ready) this.fx.shadow(x, z, r, a) }
    sq.render(this.soldierCrowd, shadow)
    if (this.fx.ready) this.fx.bars.begin()
    this.enemies.render(this.fx.ready && this.mode !== 'title', this.camera.position.z)
    if (this.boss) this.boss.render()
    if (this.fx.ready) {
      this.hazards.bars((x, y, z, w, f) => this.fx.bars.add(x, y, z, w, f, f, false), this.camera.position.z)
      this.fx.bars.end()
      this.fx.tracers.begin()
      for (const b of this.bullets) {
        const len = b.heavy ? 0.075 : 0.055
        this.fx.tracers.add(b.x - b.vx * len, b.y, b.z - b.vz * len, b.x, b.y, b.z, this.tmpColor.setHex(b.color), b.heavy ? 0.09 : 0.06, b.crit ? 2.2 : 1.4)
      }
      this.fx.tracers.end()
      for (const g of this.grenades) this.fx.shadow(g.x, g.z, 0.3, 0.4)
      this.fx.update(dt)
    }
    this.updateCamera(frameDt)
    // busy gate for the background loader: heavy scenes pause prefetch
    this.busy = this.mode === 'playing' && (this.enemies.alive > 70 || this.fx.liveParticles > 1100 || !!this.boss || this.fps < 45)
    this.assets.busy = this.busy
    if (this.fx.ready) this.fx.density = this.fps < 40 ? Math.max(0.45, this.fx.density - frameDt * 0.5) : Math.min(this.baseDensity, this.fx.density + frameDt * 0.2)
  }

  private updateCamera(frameDt: number) {
    const sq = this.squad
    const C = CONFIG.camera
    const cam = this.camera
    if (cam.fov !== C.fov) { cam.fov = C.fov; cam.updateProjectionMatrix() }
    let px: number, py: number, pz: number, lx: number, ly: number, lz: number
    const title = this.mode === 'title'
    if (title) {
      const t = this.time
      px = sq.x + Math.sin(t * 0.18) * 7; py = 3.2 + Math.sin(t * 0.25) * 0.8; pz = sq.z - 9
      lx = sq.x; ly = 1.4; lz = sq.z + 1.5
    } else {
      const grow = Math.min(1.45, 1 + Math.sqrt(sq.count) / 38)
      const arena = this.boss ? 1.18 : 1
      px = sq.x * 0.55; py = C.height * grow * arena; pz = sq.z + C.distance * grow * arena
      lx = sq.x * 0.6; ly = 0; lz = sq.z - C.lookAhead
      if (this.boss?.alive) lz = (lz + this.boss.z) / 2 - 2
    }
    // snap when switching between title and run framing
    const snap = title ? this.camPos.y > 8 : this.camPos.y < 6
    const k = snap ? 1 : 1 - Math.exp(-C.follow * frameDt * (title ? 0.6 : 1))
    this.camPos.lerp(this.v3.set(px, py, pz), k)
    this.camLook.lerp(this.v3.set(lx, ly, lz), k)
    this.trauma = Math.max(0, this.trauma - frameDt * 1.6)
    const s = this.trauma * this.trauma
    const t = performance.now() / 1000
    cam.position.set(this.camPos.x + s * 0.9 * noise(t * 23), this.camPos.y + s * 0.6 * noise(t * 29 + 7), this.camPos.z)
    cam.lookAt(this.camLook)
    cam.rotateZ(s * 0.035 * noise(t * 17 + 3))
  }

  // ───────────────────────── HUD snapshot ─────────────────────────
  hud() {
    const s = this.sector(Math.max(0, this.curSector))
    const bossD = s.chunks.find(c => c.kind === 'boss')?.d ?? s.end
    const w = weaponAt(this.stats.weapon)
    const b = this.boss
    return {
      count: this.squad.count, fallen: this.stats.fallen, weapon: w.name, tier: this.stats.weapon + 1, weaponColor: w.color,
      rate: this.stats.rate, distance: this.distance, sector: Math.max(0, this.curSector) + 1,
      theme: THEMES[s.theme].name, threat: this.threat + 1, score: runScore(this.distance, this.killScore, this.bosses),
      coins: this.runCoins, combo: this.combo, comboMult: comboMultiplier(this.combo), comboT: Math.max(0, this.comboT / COMBO_WINDOW),
      grenades: this.grenadeCount, medkits: this.medkits, perks: this.perks, shield: this.shieldCharge,
      progress: Math.max(0, Math.min(1, (this.distance - s.start) / Math.max(1, bossD - s.start))),
      boss: b ? { name: b.spec.name, title: b.title, hp: b.hp / b.maxHp, trail: b.trail / b.maxHp, mods: b.spec.mods, enraged: b.isEnraged, shielded: b.shielded || b.state === 'stagger' } : null,
      kills: this.kills,
    }
  }
}

function noise(t: number) { return Math.sin(t) * 0.6 + Math.sin(t * 2.3 + 1.3) * 0.3 + Math.sin(t * 5.1 + 0.7) * 0.1 }
