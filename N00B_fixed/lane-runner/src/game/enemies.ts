/**
 * Zombies. Each zombie is simulated individually (steering, separation, knockback, attacks,
 * burning, affixes) and drawn through one instanced VAT crowd per archetype texture.
 *
 * Archetype behaviours:
 *  walker/walker2 — shamble in, bite one soldier and die in the clash (crowd trade);
 *  runner — sprints; crawler — low, fast, hard to see; brute — tanky, smashes 3 soldiers per swing;
 *  retcher — stops at range and lobs acid globs that leave burning pools; blister — swells and
 *  bursts into an acid cloud when killed or when it reaches the squad; riot — shield absorbs 80%
 *  of frontal damage until broken; wailer — shrieks to haste nearby zombies and call runners.
 * Elite affixes: vampiric (heals on kills), splitting (splits into runners), hasted, shielded.
 */
import * as THREE from 'three'
import type { Assets } from '../engine/assets'
import type { Audio } from '../engine/audio'
import type { Fx } from './fx'
import { ARCHETYPE_LOOKS } from './looks'
import type { Squad } from './squad'
import { type ClipName, type VatAnim, VatCrowd, type VatLibrary, createVatMaterial, newAnim, playAnim, stepAnim } from './vat'
import { ROAD_HALF } from './procgen'
import { ARCH, type Affix, type Arch, type LurkerArch, RIOT_BLOCK, isLurker } from './rules'
import { CREATURES, type Building, type LurkerState, LurkerBrain, creatureReady } from './creatures'
import { createCreatureMaterial } from './vat'

export type KillCause = 'bullet' | 'explosion' | 'fire' | 'trap' | 'contact' | 'lightning'
export interface Zombie {
  id: number
  arch: Arch
  x: number; z: number; kx: number; kz: number
  hp: number; maxHp: number; trail: number
  speed: number; radius: number; scale: number; inflate: number
  state: 'idle' | 'chase' | 'attack' | 'cast' | 'dead'
  anim: VatAnim
  flash: number
  elite: Affix | null
  shield: number
  burn: number; burnDps: number
  yaw: number
  stagger: number
  cd: number
  castT: number
  deadT: number
  lastHit: number
  wake: number
  haste: number
  swell: number
  crowd: string
  seen: boolean
  gibbed: boolean
  laneX: number
  /** Lurker ambush state (null for regular zombies) */
  lurk: LurkerState | null
  /** untargetable & not collidable (perched, on a wall, airborne, underground) */
  hidden: boolean
}
interface Glob { x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number }
interface Pool { x: number; z: number; r: number; t: number; max: number; tick: number; left: number }

export interface EnemyCtx {
  fx: Fx
  audio: Audio
  squad: Squad
  onKill: (z: Zombie, cause: KillCause) => void
  onSoldiersLost: (n: number, cause: string, x: number, z: number) => void
  shake: (a: number) => void
  shieldTrap: () => boolean
  /** A Lurker ambush is about to hit (first cue of a pack): banners + one-time hints. */
  announce?: (arch: LurkerArch, how: 'roof' | 'wall' | 'burrow') => void
}

const CROWD_OF: Record<Arch, string> = {
  walker: 'walker', walker2: 'walker2', runner: 'runner', brute: 'brute', retcher: 'retcher', blister: 'blister', riot: 'riot', wailer: 'wailer', crawler: 'wailer',
  leaper: 'leaper', quiller: 'quiller', howler: 'howler', gulper: 'gulper',
}
const CAPS: Record<string, number> = { walker: 300, walker2: 220, runner: 180, brute: 30, retcher: 50, blister: 50, riot: 70, wailer: 80 }
const AFFIX_TINT: Record<Affix, number> = { vampiric: 0xff6a6a, splitting: 0x9aff7a, hasted: 0xffe07a, shielded: 0x8ac8ff }
const CELL = 1.6
export const MAX_ZOMBIES = 460

export class Enemies {
  readonly group = new THREE.Group()
  list: Zombie[] = []
  private crowds = new Map<string, VatCrowd>()
  private nextId = 1
  private grid = new Map<number, Zombie[]>()
  private globs: Glob[] = []
  private pools: Pool[] = []
  private globMesh: THREE.InstancedMesh
  private m4 = new THREE.Matrix4()
  private white = new THREE.Color(1, 1, 1)
  private tint = new THREE.Color()
  time = 0
  /** spawn requests that could not fit under MAX_ZOMBIES */
  private backlog: (() => void)[] = []

  readonly brain: LurkerBrain
  constructor(lib: VatLibrary, private readonly assets: Assets, readonly ctx: EnemyCtx) {
    for (const key of Object.keys(CAPS)) {
      const look = ARCHETYPE_LOOKS[key]
      const mat = createVatMaterial(lib, assets.tex(key), { ...look, roughness: 0.86 })
      const crowd = new VatCrowd(lib, mat, CAPS[key])
      this.crowds.set(key, crowd)
      this.group.add(crowd)
    }
    this.globMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.28, 1), new THREE.MeshBasicMaterial({ color: 0x9cff3a }), 40)
    this.globMesh.count = 0
    this.globMesh.frustumCulled = false
    this.group.add(this.globMesh)
    this.brain = new LurkerBrain(this)
    this.group.add(this.brain.group)
  }
  /** Creature crowds are created lazily, once their streamed VAT library + PBR maps are in. */
  private ensureCreature(n: LurkerArch): boolean {
    if (this.crowds.has(n)) return true
    if (!creatureReady(this.assets, n)) return false
    const lib = this.assets.vats.get(n)!
    const a = this.assets
    const mat = createCreatureMaterial(lib, { color: a.tex(`${n}_color`), normal: a.tex(`${n}_normal`), rough: a.tex(`${n}_rough`), emissive: a.tex(`${n}_emissive`) }, 0xffffff, CREATURES[n].glowI)
    const crowd = new VatCrowd(lib, mat, CREATURES[n].cap)
    this.crowds.set(n, crowd)
    this.group.add(crowd)
    return true
  }
  libDuration(zb: Zombie, clip: ClipName) { return this.assets.vats.get(zb.crowd)?.duration(clip) ?? 1 }

  /** Is the archetype's texture loaded (otherwise we substitute a walker)? */
  available(arch: Arch) { return isLurker(arch) ? this.ensureCreature(arch) : this.assets.has('tex', CROWD_OF[arch]) }
  get alive() { let n = 0; for (const z of this.list) if (z.state !== 'dead') n++; return n }

  spawn(arch: Arch, x: number, z: number, hpScale: number, opts: { elite?: Affix | null; wake?: number; state?: Zombie['state'] } = {}): Zombie | null {
    if (!this.available(arch)) {
      if (isLurker(arch)) return null
      arch = 'walker'
    }
    if (this.list.length >= MAX_ZOMBIES) {
      if (isLurker(arch)) return null
      this.backlog.push(() => { this.spawn(arch, x, z, hpScale, opts) })
      if (this.backlog.length > 200) this.backlog.shift()
      return null
    }
    const d = ARCH[arch]
    const elite = opts.elite ?? null
    const hp = d.hp * hpScale * (elite ? 3.2 : 1)
    const zb: Zombie = {
      id: this.nextId++, arch, x, z, kx: 0, kz: 0, hp, maxHp: hp, trail: hp,
      speed: d.speed * (0.88 + Math.random() * 0.24) * (elite === 'hasted' ? 1.7 : 1), radius: d.radius * (elite ? 1.2 : 1),
      scale: d.scale * (0.94 + Math.random() * 0.12) * (elite ? 1.22 : 1), inflate: 0.85 + Math.random() * 0.35,
      state: opts.state ?? 'idle', anim: newAnim(isLurker(arch) ? 'idle' : arch === 'crawler' ? 'z_crawl' : 'z_idle', Math.random() * 3), flash: 0,
      elite, shield: arch === 'riot' ? 260 * hpScale : elite === 'shielded' ? hp * 0.4 : 0,
      burn: 0, burnDps: 0, yaw: 0, stagger: 0, cd: 0.5 + Math.random(), castT: 0, deadT: 0, lastHit: -9,
      wake: opts.wake ?? 38 + Math.random() * 10, haste: 0, swell: 0, crowd: CROWD_OF[arch], seen: false, gibbed: false,
      laneX: x, lurk: null, hidden: false,
    }
    zb.anim.speed = 0.8 + Math.random() * 0.4
    this.list.push(zb)
    return zb
  }

  // ─── spatial queries ───
  private key(cx: number, cz: number) { return (cx + 512) * 4096 + (cz + 2048 * 16) }
  private rebuildGrid() {
    for (const arr of this.grid.values()) arr.length = 0
    for (const z of this.list) {
      if (z.state === 'dead' || z.hidden) continue
      const k = this.key(Math.floor(z.x / CELL), Math.floor(z.z / CELL))
      let a = this.grid.get(k)
      if (!a) { a = []; this.grid.set(k, a) }
      a.push(z)
    }
  }
  forEachNear(x: number, z: number, r: number, fn: (zb: Zombie) => void) {
    const c0 = Math.floor((x - r) / CELL), c1 = Math.floor((x + r) / CELL)
    const r0 = Math.floor((z - r) / CELL), r1 = Math.floor((z + r) / CELL)
    for (let cx = c0; cx <= c1; cx++) for (let cz = r0; cz <= r1; cz++) {
      const a = this.grid.get(this.key(cx, cz))
      if (!a) continue
      for (const zb of a) if (zb.state !== 'dead' && (zb.x - x) ** 2 + (zb.z - z) ** 2 <= (r + zb.radius) ** 2) fn(zb)
    }
  }
  /** First zombie hit by a segment (bullet path), excluding ids in `skip`. */
  hitSegment(x0: number, z0: number, x1: number, z1: number, width: number, skip: number[] | null): Zombie | null {
    const minX = Math.min(x0, x1) - 1.5, maxX = Math.max(x0, x1) + 1.5
    const minZ = Math.min(z0, z1) - 1.5, maxZ = Math.max(z0, z1) + 1.5
    let best: Zombie | null = null
    let bestT = Infinity
    const dx = x1 - x0, dz = z1 - z0
    const len2 = dx * dx + dz * dz || 1
    for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++) for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz++) {
      const a = this.grid.get(this.key(cx, cz))
      if (!a) continue
      for (const zb of a) {
        if (zb.state === 'dead' || (skip && skip.includes(zb.id))) continue
        const t = Math.max(0, Math.min(1, ((zb.x - x0) * dx + (zb.z - z0) * dz) / len2))
        const px = x0 + dx * t, pz = z0 + dz * t
        const rr = zb.radius + width
        if ((zb.x - px) ** 2 + (zb.z - pz) ** 2 <= rr * rr && t < bestT) { bestT = t; best = zb }
      }
    }
    return best
  }
  /** Nearest awake zombies ahead of the squad, sorted (auto-aim candidates). */
  targets(sx: number, sz: number, range: number, out: Zombie[], max = 28): Zombie[] {
    out.length = 0
    for (const z of this.list) {
      if (z.state === 'dead' || z.hidden) continue
      const dz = sz - z.z
      if (dz < -1 || dz > range) continue
      if (Math.abs(z.x - sx) > ROAD_HALF * 2) continue
      out.push(z)
    }
    out.sort((a, b) => (sz - a.z) - (sz - b.z))
    if (out.length > max) out.length = max
    return out
  }
  densest(_sx: number, sz: number, range: number): { x: number; z: number; n: number } | null {
    let best: { x: number; z: number; n: number } | null = null
    for (const z of this.list) {
      if (z.state === 'dead' || z.hidden || sz - z.z < 6 || sz - z.z > range) continue
      let n = 0
      this.forEachNear(z.x, z.z, 3, () => { n++ })
      if (!best || n > best.n) best = { x: z.x, z: z.z, n }
    }
    return best
  }

  // ─── damage ───
  damage(zb: Zombie, amount: number, cause: KillCause, fromX = zb.x, fromZ = zb.z + 5, knock = 1): boolean {
    if (zb.state === 'dead' || zb.hidden) return false
    let dmg = amount
    if (zb.arch === 'riot' && zb.shield > 0 && cause === 'bullet' && fromZ > zb.z) {
      const blocked = dmg * RIOT_BLOCK
      zb.shield -= blocked
      dmg -= blocked
      if (Math.random() < 0.35) this.ctx.fx.sparks(zb.x, 1.2, zb.z + 0.5, 3, 0xbfe0ff, 5)
      if (zb.shield <= 0) {
        this.ctx.fx.sparks(zb.x, 1.2, zb.z + 0.4, 18, 0xbfe0ff, 8)
        this.ctx.fx.gateBurst(zb.x, 1.1, zb.z + 0.4, 1.2, 0x8ab8ff)
        this.ctx.audio.play('shield_break', { vol: 0.7 })
        this.ctx.fx.text(zb.x, 2.6, zb.z, 'SHIELD BROKEN', 'elite', 1)
      }
    } else if (zb.elite === 'shielded' && zb.shield > 0) {
      const absorbed = Math.min(zb.shield, dmg)
      zb.shield -= absorbed
      dmg -= absorbed
      if (zb.shield <= 0) { this.ctx.audio.play('shield_break', { vol: 0.6 }); this.ctx.fx.gateBurst(zb.x, 1.2, zb.z, 1.4, 0x8ac8ff) }
    }
    zb.hp -= dmg
    if (zb.lurk) this.brain.onDamage(zb, dmg)
    if ((zb.state as Zombie['state']) === 'dead') return true
    zb.flash = 1
    zb.lastHit = this.time
    if (!zb.seen) { zb.seen = true; if (zb.state === 'idle') zb.state = 'chase' }
    // knockback away from the source (bullets push zombies back toward −Z)
    const k = ARCH[zb.arch].knock * knock * Math.min(2.5, amount / (zb.maxHp * 0.25 + 1))
    const dx = zb.x - fromX, dz = zb.z - fromZ
    const l = Math.hypot(dx, dz) || 1
    zb.kx += (dx / l) * k * 1.4
    zb.kz += (dz / l) * k * 2.2
    if (amount > zb.maxHp * 0.3 && zb.arch !== 'brute' && zb.arch !== 'howler' && zb.arch !== 'gulper') zb.stagger = 0.25
    if (zb.hp <= 0) {
      this.kill(zb, cause, -zb.hp > zb.maxHp * 0.6 || cause === 'explosion')
      return true
    }
    return false
  }

  kill(zb: Zombie, cause: KillCause, gib: boolean) {
    if (zb.state === 'dead') return
    zb.state = 'dead'
    zb.deadT = 0
    zb.hp = 0
    if (zb.lurk) { this.brain.onKill(zb, cause, gib); this.ctx.onKill(zb, cause); return }
    const fx = this.ctx.fx
    const big = zb.arch === 'brute' ? 1.8 : zb.arch === 'blister' ? 1.5 : 1
    if (zb.arch === 'blister') {
      this.burst(zb.x, zb.z, 3.2)
      gib = true
    }
    if (gib) {
      zb.gibbed = true
      fx.gib(zb.x, 0.9 * zb.scale, zb.z, zb.arch === 'brute' ? 12 : 7, big)
    } else {
      playAnim(zb.anim, 'z_death', 0.08)
      zb.anim.speed = 1 + Math.random() * 0.3
      fx.impact(zb.x, 1.2 * zb.scale, zb.z, true)
      fx.decal('blood', zb.x, zb.z - 0.4, 1.2 * big, 0.85)
      fx.dust(zb.x, zb.z, 1, 1, 0x7a6e62)
    }
    if (zb.burn > 0) {
      fx.explosion(zb.x, 0.6, zb.z, 0.8, 0xff7a2a)
      // burning kills spread fire (incendiary)
      this.forEachNear(zb.x, zb.z, 2.2, o => { if (o !== zb) { o.burn = Math.max(o.burn, 2.2); o.burnDps = Math.max(o.burnDps, zb.burnDps * 0.8) } })
    }
    this.ctx.audio.play('zombie_die', { vol: 0.5, max: 5, gap: 0.04, rate: zb.arch === 'brute' ? 0.7 : 1 })
    if (zb.elite === 'splitting') {
      for (let i = 0; i < 3; i++) this.spawn('runner', zb.x + (Math.random() - 0.5) * 1.5, zb.z + (Math.random() - 0.5), zb.maxHp / (ARCH.walker.hp * 3.2) * 0.5, { state: 'chase' })
      fx.spawnPuff(zb.x, zb.z, 0x9aff7a)
    }
    this.ctx.onKill(zb, cause)
  }

  /** Visible-soldier cap so one acid event takes at most `frac` of the squad (min `min` real soldiers). */
  private acidCap(frac: number, min: number) {
    const sq = this.ctx.squad
    return Math.max(1, Math.ceil(Math.max(min, sq.count * frac) / sq.perVisible))
  }
  /** Blister acid burst / acid glob impact. */
  private burst(x: number, z: number, r: number, budget?: number): number {
    const fx = this.ctx.fx
    fx.acid(x, 1, z, 16)
    fx.shockwave(x, z, r, 0x8cff3a)
    for (let i = 0; i < 5; i++) fx.alphaP('smoke', x + (Math.random() - 0.5) * r, 0.6, z + (Math.random() - 0.5) * r, 0, 0.5, 0, 2.2, 1.5, 3.5, 0x8ad83a, 0.4, { fadeIn: 0.1 })
    fx.decal('acid', x, z, r * 1.6, 0.9, 0xffffff, 6)
    this.ctx.audio.play('spit', { vol: 0.8, rate: 0.7 })
    const sq = this.ctx.squad
    // each pool can only claim ~3% of the squad over its whole life
    this.pools.push({ x, z, r: r * 0.8, t: 3.5, max: 3.5, tick: 0, left: Math.max(1, Math.round(sq.count * 0.03)) })
    if (budget !== undefined && budget <= 0) return 0
    if (Math.abs(sq.z - z) < r + sq.halfD && !this.ctx.shieldTrap()) {
      const cap = budget === undefined ? this.acidCap(0.06, 2) : Math.max(1, Math.ceil(budget / sq.perVisible))
      const lost = sq.killWhere((sx, sz) => (sx - x) ** 2 + (sz - z) ** 2 < r * r, 0.32, cap)
      if (lost) this.ctx.onSoldiersLost(lost, 'acid', x, z)
      return lost
    }
    return 0
  }

  update(dt: number) {
    this.time += dt
    const sq = this.ctx.squad
    const fx = this.ctx.fx
    this.rebuildGrid()
    // backlog spawns when room frees up
    while (this.backlog.length && this.list.length < MAX_ZOMBIES - 20) this.backlog.shift()!()
    let hordeNear = 0
    this.hordeNear = 0
    for (const zb of this.list) {
      if (zb.state === 'dead') {
        zb.deadT += dt
        if (zb.lurk) this.brain.updateDead(zb, dt)
        zb.flash = Math.max(0, zb.flash - dt * 7)
        stepAnim(zb.anim, dt)
        zb.x += zb.kx * dt; zb.z += zb.kz * dt
        zb.kx *= 1 - dt * 5; zb.kz *= 1 - dt * 5
        continue
      }
      zb.flash = Math.max(0, zb.flash - dt * 7)
      zb.stagger = Math.max(0, zb.stagger - dt)
      zb.haste = Math.max(0, zb.haste - dt)
      zb.trail += (zb.hp - zb.trail) * Math.min(1, dt * 3)
      const dzs = zb.z - sq.z // negative = ahead of squad
      if (zb.state === 'idle') {
        if (-dzs < zb.wake) {
          zb.state = 'chase'
          playAnim(zb.anim, zb.arch === 'crawler' ? 'z_crawl' : zb.arch === 'runner' || zb.elite === 'hasted' ? 'z_run' : 'z_walk', 0.3)
        } else {
          zb.x += zb.kx * dt; zb.z += zb.kz * dt
          zb.kx *= 1 - dt * 6; zb.kz *= 1 - dt * 6
          stepAnim(zb.anim, dt)
          continue
        }
      }
      if (-dzs < 30) hordeNear++
      // burning
      if (zb.burn > 0) {
        zb.burn -= dt
        if (Math.random() < 12 * dt * fx.density) fx.fire(zb.x + (Math.random() - 0.5) * 0.4, 0.9 * zb.scale, zb.z, 0.5 * zb.scale)
        if (this.damage(zb, zb.burnDps * dt, 'fire', zb.x, zb.z, 0)) continue
      }
      if (zb.lurk) {
        this.brain.update(zb, dt)
        if (!zb.hidden && -dzs < 30) hordeNear += 3
        continue
      }
      // elite aura
      if (zb.elite && Math.random() < 6 * dt) fx.addP('glow', zb.x + (Math.random() - 0.5) * 0.8, 0.3 + Math.random() * 1.8 * zb.scale, zb.z, 0, 1, 0, 0.6, 0.35, 0.1, AFFIX_TINT[zb.elite], 1)
      // target: nearest soldier or squad centre
      let tx = sq.x, tz = sq.z
      let near: { x: number; z: number } | null = null
      if (sq.soldiers.length && Math.abs(dzs) < 8) {
        let best = Infinity
        for (const s of sq.soldiers) {
          const d = (s.x - zb.x) ** 2 + (s.z - zb.z) ** 2
          if (d < best) { best = d; near = s }
        }
        if (near) { tx = near.x; tz = near.z }
      } else {
        // approach toward the squad but keep roughly in own lane until close (hordes stay spread)
        tx = zb.laneX + (sq.x - zb.laneX) * Math.min(1, Math.max(0, 1 - (-dzs - 6) / 30))
      }
      const dx = tx - zb.x, dz = tz - zb.z
      const dist = Math.hypot(dx, dz) || 1
      let spd = zb.speed * (zb.haste > 0 ? 1.6 : 1) * (zb.stagger > 0 ? 0.15 : 1)
      // retcher: hold at range and cast
      if (zb.arch === 'retcher' && -dzs > 10 && -dzs < 24) {
        spd = 0.2
        zb.cd -= dt
        if (zb.cd <= 0 && zb.state !== 'cast') { zb.state = 'cast'; zb.castT = 0.55; playAnim(zb.anim, 'z_cast', 0.1); fx.addP('glow', zb.x, 1.6, zb.z, 0, 0, 0, 0.55, 0.6, 1.4, 0x8cff3a, 1) }
      }
      // wailer: shriek buff
      if (zb.arch === 'wailer' && -dzs < 32 && -dzs > 4) {
        zb.cd -= dt
        if (zb.cd <= 0 && zb.state !== 'cast') {
          zb.state = 'cast'; zb.castT = 0.6; zb.cd = 6
          playAnim(zb.anim, 'z_cast', 0.1)
          this.ctx.audio.play('scream', { vol: 0.8, max: 2, gap: 0.5 })
          fx.shockwave(zb.x, zb.z, 7, 0xc07aff)
          fx.addP('ring', zb.x, 1.6, zb.z, 0, 0, 0, 0.5, 1, 6, 0xc07aff, 0.8)
          this.forEachNear(zb.x, zb.z, 8, o => { o.haste = 3; if (o.state === 'idle') o.state = 'chase' })
          for (let i = 0; i < 3; i++) this.spawn('runner', zb.x + (Math.random() - 0.5) * 6, zb.z - 4 - Math.random() * 4, zb.maxHp / (ARCH.wailer.hp * 3), { state: 'chase' })
        }
      }
      if (zb.state === 'cast') {
        zb.castT -= dt
        spd = 0
        if (zb.castT <= 0) {
          if (zb.arch === 'retcher') {
            zb.cd = 2.6 + Math.random() * 1.2
            this.throwGlob(zb.x, zb.z, sq.x + (Math.random() - 0.5) * 2.5, sq.z - 1.2 * Math.random())
          }
          zb.state = 'chase'
          playAnim(zb.anim, zb.arch === 'runner' ? 'z_run' : 'z_walk', 0.2)
        }
      }
      // blister swelling near the squad
      if (zb.arch === 'blister' && dist < 2.8) {
        zb.swell += dt * 2
        zb.flash = Math.max(zb.flash, 0.5 + 0.5 * Math.sin(this.time * 30))
        if (zb.swell > 0.7) { this.kill(zb, 'contact', true); continue }
      }
      // contact attack
      const reach = zb.radius + 0.45
      if (near && dist < reach + 0.2 && zb.arch !== 'blister') {
        zb.cd -= dt
        if (zb.state !== 'attack') { zb.state = 'attack'; playAnim(zb.anim, 'z_attack', 0.08); zb.cd = Math.min(zb.cd, 0.25) }
        if (zb.cd <= 0) {
          const d = ARCH[zb.arch]
          const heavy = zb.arch === 'brute' || zb.arch === 'riot'
          const lost = sq.killNear(zb.x, zb.z, Math.max(1, d.kills))
          if (lost) {
            this.ctx.onSoldiersLost(lost, zb.arch, zb.x, zb.z)
            fx.gib(near.x, 0.9, near.z, 4, 0.8)
            if (zb.elite === 'vampiric') { zb.hp = Math.min(zb.maxHp, zb.hp + zb.maxHp * 0.3); fx.heal(zb.x, 1.2, zb.z) }
          }
          if (heavy) {
            zb.cd = zb.arch === 'brute' ? 1.0 : 0.8
            this.ctx.shake(zb.arch === 'brute' ? 0.35 : 0.15)
            fx.dust(zb.x, zb.z + 0.6, 3, 1.4)
            fx.shockwave(zb.x, zb.z + 0.5, 1.6, 0xffa060)
            playAnim(zb.anim, 'z_walk', 0); playAnim(zb.anim, 'z_attack', 0.05)
          } else {
            // the bite costs the zombie its life: crowd clash trade
            this.kill(zb, 'contact', Math.random() < 0.5)
            continue
          }
        }
        spd = 0.4
      } else if (zb.state === 'attack') {
        zb.state = 'chase'
        playAnim(zb.anim, zb.arch === 'crawler' ? 'z_crawl' : zb.arch === 'runner' || zb.elite === 'hasted' ? 'z_run' : 'z_walk', 0.2)
      }
      // integrate
      const vx = (dx / dist) * spd, vz = (dz / dist) * spd
      zb.x += (vx + zb.kx) * dt
      zb.z += (vz + zb.kz) * dt
      zb.kx *= 1 - dt * 6; zb.kz *= 1 - dt * 6
      zb.x = Math.max(-ROAD_HALF - 3, Math.min(ROAD_HALF + 3, zb.x))
      const targetYaw = Math.atan2(vx, vz)
      let dy = targetYaw - zb.yaw
      while (dy > Math.PI) dy -= Math.PI * 2
      while (dy < -Math.PI) dy += Math.PI * 2
      zb.yaw += dy * Math.min(1, dt * 6)
      const ref = zb.anim.clip === 'z_run' ? 5.2 : zb.anim.clip === 'z_crawl' ? 3.2 : 1.6
      if (zb.state === 'chase') zb.anim.speed = Math.max(0.5, Math.min(1.7, spd / ref))
      else if (zb.state === 'attack' || zb.state === 'cast') zb.anim.speed = 1.1
      stepAnim(zb.anim, dt)
      this.separate(zb, dt)
    }
    this.hordeNear = hordeNear
    this.afterUpdate(dt)
  }
  /** Push `zb` out of overlapping neighbours. */
  separate(zb: Zombie, dt: number) {
      this.forEachNear(zb.x, zb.z, zb.radius * 1.6, o => {
        if (o === zb) return
        const ox = zb.x - o.x, oz = zb.z - o.z
        const d2 = ox * ox + oz * oz
        const min = zb.radius + o.radius
        if (d2 > 1e-5 && d2 < min * min) {
          const d = Math.sqrt(d2)
          const push = (min - d) * 0.5 * Math.min(1, dt * 12)
          zb.x += (ox / d) * push; zb.z += (oz / d) * push
        }
      })
  }
  private afterUpdate(dt: number) {
    const sq = this.ctx.squad
    const fx = this.ctx.fx
    const hordeNear = this.hordeNear
    // prune dead after their animation / behind the camera
    let w = 0
    for (const zb of this.list) {
      const gone = (zb.state === 'dead' && (zb.gibbed || zb.deadT > (zb.lurk ? 3.6 : 2.6))) || zb.z > sq.z + 22
      if (!gone) this.list[w++] = zb
    }
    this.list.length = w
    // acid globs
    for (let i = this.globs.length - 1; i >= 0; i--) {
      const g = this.globs[i]
      g.t += dt
      g.vy -= 20 * dt
      g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt
      if (Math.random() < 20 * dt) fx.alphaP('drop', g.x, g.y, g.z, 0, -1, 0, 0.3, 0.2, 0.05, 0x8cff2a, 0.8)
      if (g.y <= 0.1) { this.globs.splice(i, 1); this.burst(g.x, g.z, 1.8) }
    }
    for (let i = this.pools.length - 1; i >= 0; i--) {
      const p = this.pools[i]
      p.t -= dt
      p.tick -= dt
      if (Math.random() < 6 * dt) fx.alphaP('smoke', p.x + (Math.random() - 0.5) * p.r, 0.2, p.z + (Math.random() - 0.5) * p.r, 0, 0.4, 0, 1.2, 0.6, 1.6, 0x8ad83a, 0.3)
      if (p.tick <= 0) {
        p.tick = 0.5
        if (p.left > 0 && Math.abs(sq.z - p.z) < p.r + sq.halfD) {
          const cap = Math.max(1, Math.ceil(Math.min(p.left, Math.max(1, sq.count * 0.02)) / sq.perVisible))
          const lost = sq.killWhere((sx, sz) => (sx - p.x) ** 2 + (sz - p.z) ** 2 < p.r * p.r, 0.12, cap)
          if (lost) { p.left -= lost; this.ctx.onSoldiersLost(lost, 'acid', p.x, p.z) }
        }
      }
      if (p.t <= 0) this.pools.splice(i, 1)
    }
    this.ctx.audio.loop('horde_loop', Math.min(0.55, hordeNear / 60))
    this.brain.updateShared(dt)
  }
  private hordeNear = 0

  // ─── Lurker ambushes ───
  /** Rooftop/facade ambush: Leapers perch on roof edges, Quillers cling to facades. Returns spawned count. */
  ambushRoof(archs: LurkerArch[], z0: number, hpScale: number, buildingAt: (side: number, z: number) => Building | null): number {
    let n = 0
    const firstSide = Math.random() < 0.5 ? -1 : 1
    for (let k = 0; k < archs.length; k++) {
      const arch = archs[k]
      const pref = (k % 2 === 0 ? firstSide : -firstSide) * (Math.random() < 0.2 ? -1 : 1)
      const zBase = z0 - k * 3.6 - Math.random() * 2.5
      // alleys: try nearby slots on the preferred facade, then the opposite one
      let b: Building | null = null, side = pref, z = zBase
      search: for (const sd of [pref, -pref]) for (const off of [0, -9, 8, -17, 16]) {
        const hit = buildingAt(sd, zBase + off)
        if (hit) { b = hit; side = sd; z = zBase + off; break search }
      }
      if (!b) continue
      const zb = this.spawn(arch, side * Math.abs(b.x), z, hpScale, { state: 'chase' })
      if (!zb) continue
      if (arch === 'quiller') this.brain.wall(zb, b, side, k)
      else this.brain.perch(zb, b, side, k)
      n++
    }
    return n
  }
  /** Burrow ambush: tunnellers start under the road at z0 and surface ahead of the squad. */
  ambushBurrow(archs: LurkerArch[], z0: number, hpScale: number): number {
    let n = 0
    for (let k = 0; k < archs.length; k++) {
      const lateral = (k % 2 === 0 ? 1 : -1) * (1.5 + Math.random() * 3) * (Math.random() < 0.5 ? 1 : -1)
      const zb = this.spawn(archs[k], lateral, z0 - k * 10, hpScale, { state: 'chase' })
      if (!zb) continue
      this.brain.burrow(zb, k, lateral)
      n++
    }
    return n
  }

  private throwGlob(x: number, z: number, tx: number, tz: number) {
    const T = 1.1
    this.globs.push({ x, y: 1.6, z, vx: (tx - x) / T, vy: 10, vz: (tz - z) / T, t: 0 })
    this.ctx.audio.play('spit', { vol: 0.6 })
  }
  /** Squad-wide boss hazard helpers use this too. */
  acidAt(x: number, z: number, r: number, budget?: number) { return this.burst(x, z, r, budget) }

  render(barsOn: boolean, camZ: number) {
    const counts = new Map<string, number>()
    const fx = this.ctx.fx
    for (const zb of this.list) {
      const crowd = this.crowds.get(zb.crowd)
      if (!crowd) continue
      const lurk = zb.lurk
      if (lurk && zb.state !== 'dead' && (lurk.mode === 'tunnel' || lurk.mode === 'rise')) continue
      const i = counts.get(zb.crowd) ?? 0
      if (i >= (lurk ? CREATURES[zb.arch as LurkerArch].cap : CAPS[zb.crowd])) continue
      counts.set(zb.crowd, i + 1)
      if (lurk) { this.renderCreature(zb, lurk, crowd, i, barsOn, camZ); continue }
      const sink = zb.state === 'dead' ? Math.max(0, zb.deadT - 1.7) * 0.8 : 0
      const swell = zb.arch === 'blister' ? 1 + zb.swell * 0.8 : 1
      const pitch = zb.stagger > 0 ? -0.2 : 0
      crowd.set(i, zb.x, -sink, zb.z, zb.yaw, zb.scale, zb.anim, zb.flash, zb.inflate * swell, pitch)
      crowd.tint(i, zb.elite ? this.tint.setHex(AFFIX_TINT[zb.elite]) : zb.burn > 0 ? this.tint.setRGB(1, 0.75, 0.6) : this.white)
      if (zb.state !== 'dead') {
        fx.shadow(zb.x, zb.z, zb.radius * 1.1, 0.5)
        const show = zb.elite || zb.arch === 'brute' || zb.arch === 'riot' || (zb.hp < zb.maxHp && this.time - zb.lastHit < 2.5)
        if (barsOn && show && camZ - zb.z < 55) fx.bars.add(zb.x, 2.05 * zb.scale + 0.2, zb.z, zb.elite || zb.arch === 'brute' ? 1.3 : 0.8, zb.hp / zb.maxHp, zb.trail / zb.maxHp, !!zb.elite)
      }
    }
    for (const [key, crowd] of this.crowds) crowd.commit(counts.get(key) ?? 0)
    this.brain.render()
    let g = 0
    for (const gl of this.globs) {
      this.m4.makeTranslation(gl.x, gl.y, gl.z)
      this.globMesh.setMatrixAt(g++, this.m4)
      if (g >= 40) break
    }
    this.globMesh.count = g
    this.globMesh.instanceMatrix.needsUpdate = true
  }

  private renderCreature(zb: Zombie, lurk: LurkerState, crowd: VatCrowd, i: number, barsOn: boolean, camZ: number) {
    const fx = this.ctx.fx
    const def = CREATURES[zb.arch as LurkerArch]
    const sink = zb.state === 'dead' ? Math.max(0, zb.deadT - 2.4) * 0.8 : 0
    const onWall = lurk.mode === 'wall' || (lurk.mode === 'air' && zb.arch === 'quiller') || (lurk.mode === 'air' && zb.arch === 'leaper')
    if (onWall && zb.state !== 'dead') crowd.place(i, zb.x, lurk.y, zb.z, lurk.q, zb.scale, zb.anim, zb.flash, 1, lurk.glow)
    else crowd.set(i, zb.x, lurk.y - sink, zb.z, zb.yaw, zb.scale, zb.anim, zb.flash, 1, zb.stagger > 0 ? -0.12 : 0, 0, lurk.glow)
    crowd.tint(i, zb.burn > 0 ? this.tint.setRGB(1, 0.8, 0.65) : this.white)
    if (zb.state === 'dead' || lurk.mode === 'wall' || lurk.mode === 'perch') return
    const h = Math.min(1, lurk.y / 14)
    fx.shadow(zb.x, zb.z, def.shadow * (1 - h * 0.5), 0.55 * (1 - h * 0.6))
    const show = !zb.hidden && (zb.arch === 'howler' || zb.arch === 'gulper' || (zb.hp < zb.maxHp && this.time - zb.lastHit < 2.5))
    if (barsOn && show && camZ - zb.z < 60) fx.bars.add(zb.x, def.bar * zb.scale + lurk.y, zb.z, zb.arch === 'howler' ? 1.8 : 1.1, zb.hp / zb.maxHp, zb.trail / zb.maxHp, true)
  }

  clear() {
    this.brain.clear()
    this.list.length = 0
    this.globs.length = 0
    this.pools.length = 0
    this.backlog.length = 0
    for (const c of this.crowds.values()) c.commit(0)
  }
}

export const CLIP_FOR: Record<Arch, ClipName> = {
  walker: 'z_walk', walker2: 'z_walk', runner: 'z_run', brute: 'z_walk', retcher: 'z_walk', blister: 'z_walk', riot: 'z_walk', wailer: 'z_walk', crawler: 'z_crawl',
  leaper: 'run', quiller: 'run', howler: 'run', gulper: 'run',
}
