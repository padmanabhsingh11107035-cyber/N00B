/**
 * Procedural bosses. A BossSpec (rules.makeBoss) picks a body, 1–4 modifiers and an attack set;
 * this module runs it: intro walk-in and roar, a standoff at ~17 m from the squad, a telegraphed
 * attack loop, phase breaks at 66% / 33% HP, modifier behaviour and a dramatic death.
 *
 * Every attack draws its danger area on the ground before it lands (honest, dodgeable):
 *  charge (lane rectangle, then a dash), slam (circle at the squad), shockwave (half-road wave),
 *  acid (several circles), summon (roar + adds), sweep (full width with a safe gap), boulder (circle).
 */
import * as THREE from 'three'
import type { Audio } from '../engine/audio'
import type { Assets } from '../engine/assets'
import type { Enemies } from './enemies'
import type { Fx, Telegraph } from './fx'
import { ARCHETYPE_LOOKS } from './looks'
import { ROAD_HALF } from './procgen'
import { BOSS_BODIES, type BossAttack, type BossSpec, bossHitCap, bossPhaseFloor } from './rules'
import type { Squad } from './squad'
import { type VatAnim, VatCrowd, type VatLibrary, createVatMaterial, newAnim, playAnim, stepAnim } from './vat'

export interface BossCtx {
  fx: Fx
  audio: Audio
  squad: Squad
  enemies: Enemies
  shake: (a: number) => void
  onLost: (n: number, cause: string, x: number, z: number) => void
  hpScale: () => number
  shieldTrap: () => boolean
  onPhase: (text: string) => void
}

type State = 'intro' | 'idle' | 'windup' | 'act' | 'recover' | 'stagger' | 'dying' | 'dead'
interface Pending { kind: BossAttack; t: number; max: number; tele: (Telegraph | null)[]; x: number; z: number; data: number[] }

const STANDOFF = 17

export class Boss {
  readonly group = new THREE.Group()
  readonly spec: BossSpec
  x = 0
  z = 0
  hp: number
  maxHp: number
  trail: number
  state: State = 'intro'
  radius: number
  scale: number
  private crowd: VatCrowd
  private anim: VatAnim
  private stateT = 0
  private flash = 0
  private flashCd = 0
  private yaw = 0
  private next: BossAttack
  private attackIdx = 0
  private pending: Pending[] = []
  private lastDamage = 0
  private time = 0
  private phase = 0
  private dashTo = { x: 0, z: 0 }
  private chargeLeft = 0
  private meleeCd = 0
  private enraged = false
  private armorPlates: THREE.Mesh[] = []
  private aura: THREE.Mesh
  private toxicT = 0
  private deadT = 0
  private tint = new THREE.Color()
  /** Seconds spent in the current phase; the next HP threshold is shielded until `phaseFloor`. */
  private phaseT = 0
  private readonly phaseFloor: number
  /** >0 while the barrier is visibly absorbing damage (drives the shell and the HUD). */
  shieldT = 0
  /** Damage soaked by the barrier since the last read (for HUD feedback). */
  absorbed = 0
  private barrier: THREE.Mesh
  private barrierMat: THREE.MeshBasicMaterial

  constructor(spec: BossSpec, lib: VatLibrary, assets: Assets, private readonly ctx: BossCtx, spawnZ: number) {
    this.spec = spec
    const body = BOSS_BODIES[spec.body]
    this.hp = this.maxHp = this.trail = spec.hp
    this.scale = body.scale
    this.radius = 0.55 * body.scale
    const base = ARCHETYPE_LOOKS[body.texture]
    const look = { ...base, inflate: base.inflate.map(v => v * body.inflate + 0.01) as typeof base.inflate, roughness: 0.8 }
    const tex = assets.has('tex', body.texture) ? body.texture : 'brute'
    const mat = createVatMaterial(lib, assets.tex(tex), look)
    mat.fog = false // bosses always read clearly through fog
    this.crowd = new VatCrowd(lib, mat, 1)
    this.group.add(this.crowd)
    this.anim = newAnim('z_walk')
    this.anim.speed = 0.7
    this.z = spawnZ
    this.next = spec.attacks[0]
    if (spec.mods.includes('armored')) {
      const m = new THREE.MeshStandardMaterial({ color: 0x5a5e66, roughness: 0.5, metalness: 0.3 })
      for (let i = 0; i < 3; i++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.18), m)
        this.armorPlates.push(p)
        this.group.add(p)
      }
    }
    this.aura = new THREE.Mesh(new THREE.RingGeometry(this.radius * 1.3, this.radius * 1.6, 48), new THREE.MeshBasicMaterial({
      color: spec.mods.includes('toxic') ? 0x8cff3a : 0xff3a2a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    this.phaseFloor = bossPhaseFloor(spec.sector)
    this.barrierMat = new THREE.MeshBasicMaterial({
      color: 0x6ad8ff, wireframe: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    })
    this.barrier = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), this.barrierMat)
    this.barrier.visible = false
    this.group.add(this.barrier)
    this.aura.rotation.x = -Math.PI / 2
    this.aura.position.y = 0.04
    this.group.add(this.aura)
  }

  get alive() { return this.state !== 'dying' && this.state !== 'dead' }
  get title() { return BOSS_BODIES[this.spec.body].title }
  get isEnraged() { return this.enraged }
  private get speedMul() { return this.enraged ? 1.5 : 1 }

  damage(amount: number): boolean {
    if (!this.alive || this.state === 'intro') return false
    let dmg = amount
    if (this.spec.mods.includes('armored') && this.hp > this.maxHp * 0.5) dmg *= 0.6
    // Phase-break stagger is a brief invulnerable roar; each phase then lasts at least phaseFloor
    // seconds — overflow damage hits a visible barrier instead of skipping the phase.
    if (this.state === 'stagger') { this.absorb(dmg); return false }
    if (this.phaseT < this.phaseFloor) {
      const floorHp = [0.66, 0.33, 0][this.phase] * this.maxHp + this.maxHp * 0.004
      if (this.hp - dmg < floorHp) {
        const take = Math.max(0, this.hp - floorHp)
        this.absorb(dmg - take)
        dmg = take
      }
    }
    this.hp -= dmg
    this.lastDamage = this.time
    if (this.flashCd <= 0) { this.flash = 0.6; this.flashCd = 0.12 }
    const frac = this.hp / this.maxHp
    if (this.hp > 0 && ((this.phase === 0 && frac < 0.66) || (this.phase === 1 && frac < 0.33))) {
      this.phase++
      this.phaseT = 0
      this.cancelPending()
      this.state = 'stagger'
      this.stateT = 1.4
      playAnim(this.anim, 'z_cast', 0.1)
      this.ctx.audio.play('roar', { vol: 0.9, rate: 0.85 })
      this.ctx.shake(0.4)
      this.ctx.fx.shockwave(this.x, this.z, 8, 0xff5a2a)
      this.ctx.onPhase(this.phase === 1 ? 'PHASE 2' : 'FINAL PHASE')
      this.summon(6 + this.spec.sector * 2)
      if (this.phase === 1 && this.spec.mods.includes('enraged')) this.enraged = true
      if (this.phase === 2) this.enraged = true
    }
    if (this.hp <= 0) { this.die(); return true }
    return false
  }

  get shielded() { return this.shieldT > 0 }
  /** Attacks started so far (balance telemetry). */
  get attackCount() { return this.attackIdx }
  /** Total damage soaked by barriers (balance telemetry). */
  soaked = 0
  private absorb(dmg: number) {
    if (dmg <= 0) return
    this.absorbed += dmg
    this.soaked += dmg
    this.shieldT = 0.35
  }

  private die() {
    this.hp = 0
    this.state = 'dying'
    this.deadT = 0
    this.cancelPending()
    playAnim(this.anim, 'z_death', 0.1)
    this.anim.speed = 0.7
    this.ctx.audio.play('roar', { vol: 1, rate: 0.6 })
    this.ctx.shake(0.6)
  }

  private cancelPending() {
    for (const p of this.pending) for (const t of p.tele) t?.hide()
    this.pending.length = 0
  }

  private summon(n: number) {
    const hp = this.ctx.hpScale()
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const arch = this.spec.body === 'blisterMother' ? (i % 3 === 0 ? 'blister' : 'crawler') : i % 3 === 0 ? 'runner' : 'walker'
      this.ctx.enemies.spawn(arch, Math.max(-ROAD_HALF + 0.5, Math.min(ROAD_HALF - 0.5, this.x + Math.cos(a) * 3)), this.z + Math.sin(a) * 2 - 1, hp, { state: 'chase' })
    }
    this.ctx.fx.spawnPuff(this.x, this.z, 0xff5a2a)
  }

  private tele(): Telegraph | null {
    const t = this.ctx.fx.telegraph()
    if (t) t.active = true
    return t
  }
  private capReal() {
    const n = this.ctx.squad.count
    return Math.max(n < 15 ? 1 : 2, Math.round(n * bossHitCap(this.phase, this.spec.sector)))
  }
  /** Kill soldiers matching `pred`; one attack can only take a bounded bite (`budget`, real soldiers). */
  private killIn(pred: (x: number, z: number) => boolean, chance: number, cause: string, x: number, z: number, budget = this.capReal()): number {
    const sq = this.ctx.squad
    if (budget <= 0) return 0
    let any = false
    for (const s of sq.soldiers) if (pred(s.x, s.z)) { any = true; break }
    if (!any || this.ctx.shieldTrap()) return 0
    const lost = sq.killWhere(pred, chance, Math.max(1, Math.ceil(budget / sq.perVisible)))
    if (lost) this.ctx.onLost(lost, cause, x, z)
    return lost
  }
  private push(kind: BossAttack, t: number, tele: (Telegraph | null)[], x: number, z: number, data: number[] = []) {
    this.pending.push({ kind, t, max: t, tele, x, z, data })
  }

  private begin(kind: BossAttack) {
    const sq = this.ctx.squad
    const f = this.enraged ? 0.78 : 1
    this.state = 'windup'
    playAnim(this.anim, kind === 'summon' ? 'z_cast' : kind === 'charge' ? 'z_idle' : 'z_attack', 0.12)
    this.anim.speed = 0.6
    switch (kind) {
      case 'charge': {
        const tx = sq.x
        const len = Math.abs(this.z - sq.z) + 6
        const t = this.tele()
        const yaw = Math.atan2(tx - this.x, sq.z - this.z)
        t?.rect((this.x + tx) / 2, this.z + (sq.z + 3 - this.z) / 2, 3.4, len, yaw)
        this.dashTo = { x: tx, z: sq.z + 3 }
        this.push(kind, 1.3 * f, [t], tx, sq.z, [len])
        this.stateT = 1.3 * f
        this.ctx.audio.play('roar', { vol: 0.6, rate: 1.1 })
        break
      }
      case 'slam': {
        const t = this.tele()
        const x = sq.x + (Math.random() - 0.5) * 1.5, z = sq.z
        t?.circle(x, z, 4.0)
        this.push(kind, 1.35 * f, [t], x, z, [4.0])
        this.stateT = 1.35 * f
        break
      }
      case 'shockwave': {
        const side = sq.x < 0 ? -1 : 1
        const t = this.tele()
        const cx = side * ROAD_HALF / 2
        const len = Math.abs(this.z - sq.z) + 8
        t?.rect(cx, this.z + (sq.z + 4 - this.z) / 2, ROAD_HALF, len, 0)
        this.push(kind, 1.15 * f, [t], cx, sq.z, [side])
        this.stateT = 1.15 * f
        break
      }
      case 'acid': {
        const n = 3 + Math.min(3, this.spec.sector)
        const teles: (Telegraph | null)[] = []
        const data: number[] = []
        for (let i = 0; i < n; i++) {
          const x = Math.max(-ROAD_HALF + 1.5, Math.min(ROAD_HALF - 1.5, sq.x + (Math.random() - 0.5) * 8))
          const z = sq.z + (Math.random() - 0.5) * 5
          const t = this.tele()
          t?.circle(x, z, 2.1, 0x8cff3a)
          teles.push(t)
          data.push(x, z)
        }
        this.push(kind, 1.45 * f, teles, 0, 0, data)
        this.stateT = 0.9
        this.ctx.audio.play('spit', { vol: 0.8, rate: 0.7 })
        break
      }
      case 'summon':
        this.stateT = 1.0
        this.push(kind, 0.9, [], this.x, this.z)
        this.ctx.audio.play('scream', { vol: 0.8, rate: 0.7 })
        this.ctx.fx.shockwave(this.x, this.z, 6, 0xc07aff)
        break
      case 'sweep': {
        const gapW = 3.4
        const gapX = (Math.random() < 0.5 ? -1 : 1) * (1.2 + Math.random() * (ROAD_HALF - gapW / 2 - 1.5))
        const z = sq.z
        const leftW = gapX - gapW / 2 + ROAD_HALF, rightW = ROAD_HALF - (gapX + gapW / 2)
        const t1 = leftW > 0.2 ? this.tele() : null
        const t2 = rightW > 0.2 ? this.tele() : null
        t1?.rect(-ROAD_HALF + leftW / 2, z, leftW, 4.2, 0)
        t2?.rect(ROAD_HALF - rightW / 2, z, rightW, 4.2, 0)
        this.push(kind, 1.4 * f, [t1, t2], gapX, z, [gapW])
        this.stateT = 1.4 * f
        break
      }
      case 'boulder': {
        const t = this.tele()
        const x = sq.x, z = sq.z - 1
        t?.circle(x, z, 2.8, 0xffa040)
        this.push(kind, 1.4 * f, [t], x, z)
        this.stateT = 0.8
        this.ctx.audio.play('whistle', { vol: 0.4, rate: 0.8 })
        break
      }
    }
  }

  private resolve(p: Pending) {
    const fx = this.ctx.fx
    for (const t of p.tele) t?.hide()
    switch (p.kind) {
      case 'charge':
        if (!this.alive) return
        this.state = 'act'
        this.chargeLeft = this.capReal()
        playAnim(this.anim, 'z_run', 0.08)
        this.anim.speed = 1.6
        this.ctx.audio.play('roar', { vol: 0.8 })
        break
      case 'slam': {
        const r = p.data[0]
        fx.explosion(p.x, 0.3, p.z, 1.2, 0xffa060)
        fx.shockwave(p.x, p.z, r, 0xffc080)
        fx.dust(p.x, p.z, 8, 2.2)
        fx.decal('scorch', p.x, p.z, r * 1.4, 0.7)
        this.ctx.audio.play('slam', { vol: 1 })
        this.ctx.shake(0.55)
        this.killIn((x, z) => (x - p.x) ** 2 + (z - p.z) ** 2 < r * r, 0.9, 'slam', p.x, p.z)
        if (this.alive) playAnim(this.anim, 'z_slam', 0.05)
        break
      }
      case 'shockwave': {
        const side = p.data[0]
        for (let i = 0; i < 8; i++) {
          const z = this.z + (p.z + 4 - this.z) * (i / 7)
          fx.dust(p.x, z, 2, 1.8, 0x9a8a72, 0.5)
          fx.addP('ring', p.x, 0.2, z, 0, 0, 0, 0.4, 1, 4, 0xffb060, 0.8)
        }
        this.ctx.audio.play('slam', { vol: 0.8, rate: 1.2 })
        this.ctx.shake(0.4)
        this.killIn(x => (side < 0 ? x < 0.1 : x > -0.1), 0.7, 'shockwave', p.x, p.z)
        if (this.alive) playAnim(this.anim, 'z_slam', 0.05)
        break
      }
      case 'acid':
        { // the whole volley shares one bounded budget
          let left = this.capReal()
          for (let i = 0; i < p.data.length; i += 2) left -= this.ctx.enemies.acidAt(p.data[i], p.data[i + 1], 2.1, left)
        }
        break
      case 'summon':
        this.summon(this.spec.mods.includes('summoner') ? 12 : 8)
        break
      case 'sweep': {
        const gx = p.x, gw = p.data[0]
        for (let i = 0; i < 10; i++) {
          const x = -ROAD_HALF + (i + 0.5) * (ROAD_HALF * 2 / 10)
          if (Math.abs(x - gx) < gw / 2) continue
          fx.addP('streak', x, 1, p.z, 0, 0, 0, 0.25, 1.4, 2.4, 0xffd0a0, 0.9)
          fx.dust(x, p.z, 1, 1.4)
        }
        this.ctx.audio.play('crusher', { vol: 0.7, rate: 1.3 })
        this.ctx.shake(0.35)
        this.killIn((x, z) => Math.abs(x - gx) > gw / 2 && Math.abs(z - p.z) < 2.1, 0.8, 'sweep', p.x, p.z)
        break
      }
      case 'boulder':
        fx.explosion(p.x, 0.5, p.z, 1.4, 0xffa060)
        fx.dust(p.x, p.z, 6, 2)
        for (let i = 0; i < 16; i++) fx.shards.spawn(p.x, 0.5, p.z, (Math.random() - 0.5) * 9, 3 + Math.random() * 5, (Math.random() - 0.5) * 9, 0.3 + Math.random() * 0.3, new THREE.Color(0x6a6259), 1.6, 0.3)
        this.ctx.audio.play('explosion', { vol: 0.8, rate: 0.8 })
        this.ctx.shake(0.4)
        this.killIn((x, z) => (x - p.x) ** 2 + (z - p.z) ** 2 < 2.8 * 2.8, 0.85, 'boulder', p.x, p.z)
        break
    }
  }

  update(dt: number) {
    this.time += dt
    this.flash = Math.max(0, this.flash - dt * 5)
    this.flashCd -= dt
    this.trail += (this.hp - this.trail) * Math.min(1, dt * 2.5)
    this.shieldT = Math.max(0, this.shieldT - dt)
    if (this.alive && this.state !== 'intro' && this.state !== 'stagger') this.phaseT += dt
    const sq = this.ctx.squad
    const fx = this.ctx.fx
    stepAnim(this.anim, dt)
    this.aura.position.set(this.x, 0.04, this.z)
    ;(this.aura.material as THREE.MeshBasicMaterial).opacity = this.alive ? 0.25 + 0.15 * Math.sin(this.time * 4) + (this.enraged ? 0.2 : 0) : 0
    // pending attacks resolve on their own timers (including the explosive death blast)
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i]
      p.t -= dt
      for (const t of p.tele) if (t) t.u.uProgress.value = Math.min(1, 1 - Math.max(0, p.t) / p.max)
      if (p.t <= 0) { this.pending.splice(i, 1); this.resolve(p) }
    }
    if (this.state === 'dead') { this.deadT += dt; return }
    if (this.state === 'dying') {
      this.deadT += dt
      if (Math.random() < 20 * dt) fx.gib(this.x + (Math.random() - 0.5) * 2, 1.5 + Math.random() * 3, this.z, 2, 1.2)
      if (Math.random() < 6 * dt) fx.explosion(this.x + (Math.random() - 0.5) * 3, 1 + Math.random() * 3, this.z + (Math.random() - 0.5) * 2, 0.8, 0xff7a2a)
      if (this.deadT > 1.6) {
        this.state = 'dead'
        fx.explosion(this.x, 1.5, this.z, 3, 0xff8a2a)
        fx.shockwave(this.x, this.z, 10, 0xffc060)
        fx.gib(this.x, 2, this.z, 26, 2)
        fx.decal('blood', this.x, this.z, 6, 0.9)
        this.ctx.audio.play('explosion', { vol: 1, rate: 0.7 })
        this.ctx.shake(0.8)
        if (this.spec.mods.includes('explosive')) {
          const t = this.tele()
          t?.circle(this.x, this.z + 6, 6.5)
          this.push('slam', 1.3, [t], this.x, this.z + 6, [6.5])
        }
      }
      return
    }
    // modifier behaviours
    if (this.spec.mods.includes('regenerating') && this.time - this.lastDamage > 2 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.015 * dt)
      if (Math.random() < 8 * dt) fx.heal(this.x + (Math.random() - 0.5) * 2, 1 + Math.random() * 3, this.z)
    }
    if (this.spec.mods.includes('toxic')) {
      this.toxicT -= dt
      if (this.toxicT <= 0) { this.toxicT = 3.2; if (this.state !== 'intro') this.ctx.enemies.acidAt(this.x + (Math.random() - 0.5) * 3, this.z + 2, 1.8) }
      if (Math.random() < 8 * dt) fx.alphaP('smoke', this.x + (Math.random() - 0.5) * 2, 1 + Math.random() * 2, this.z, 0, 0.6, 0, 1.6, 1, 2.4, 0x8ad83a, 0.25)
    }
    if (this.enraged && Math.random() < 14 * dt) fx.addP('glow', this.x + (Math.random() - 0.5) * 2, Math.random() * 3.5 * this.scale / 3, this.z, 0, 1.5, 0, 0.6, 0.5, 0.1, 0xff3a1a, 1)

    const standZ = sq.z - STANDOFF
    this.stateT -= dt
    switch (this.state) {
      case 'intro': {
        this.z += Math.min(5 * dt, Math.max(0, standZ - this.z))
        if (standZ - this.z < 0.5) {
          this.state = 'recover'
          this.stateT = 0.8
          playAnim(this.anim, 'z_cast', 0.15)
          this.ctx.audio.play('roar', { vol: 1 })
          this.ctx.shake(0.5)
          fx.shockwave(this.x, this.z, 9, 0xff5a2a)
        }
        break
      }
      case 'idle': {
        const dx = sq.x - this.x
        this.x += Math.sign(dx) * Math.min(Math.abs(dx), 2.4 * this.speedMul * dt)
        const dz = standZ - this.z
        this.z += Math.sign(dz) * Math.min(Math.abs(dz), 2 * dt)
        if (this.anim.clip !== 'z_walk') playAnim(this.anim, 'z_walk', 0.2)
        this.anim.speed = 0.8 * this.speedMul
        if (this.stateT <= 0) {
          const kind = this.next
          this.attackIdx++
          this.next = this.spec.attacks[this.attackIdx % this.spec.attacks.length]
          this.begin(kind)
        }
        break
      }
      case 'windup':
        if (this.stateT <= 0) {
          this.state = 'recover'
          // later phases chain attacks back-to-back
          const combo = this.phase > 0 && Math.random() < 0.25 + 0.2 * this.phase
          this.stateT = (combo ? 0.15 : 0.55) / this.speedMul
        }
        break
      case 'act': {
        const dx = this.dashTo.x - this.x, dz = this.dashTo.z - this.z
        const d = Math.hypot(dx, dz)
        const step = 24 * dt
        if (d <= step) {
          this.x = this.dashTo.x; this.z = this.dashTo.z
          this.state = 'recover'
          this.stateT = 0.45
          fx.dust(this.x, this.z, 6, 2)
          this.ctx.shake(0.4)
          playAnim(this.anim, 'z_idle', 0.2)
        } else {
          this.x += (dx / d) * step; this.z += (dz / d) * step
          if (Math.random() < 30 * dt) fx.dust(this.x, this.z + 1, 1, 1.4)
          const bx = this.x, bz = this.z, r = this.radius + 0.6
          this.chargeLeft -= this.killIn((x, z) => (x - bx) ** 2 + (z - bz) ** 2 < r * r, 1, 'charge', bx, bz, this.chargeLeft)
          this.ctx.enemies.forEachNear(bx, bz, r, zb => this.ctx.enemies.kill(zb, 'trap', true))
        }
        break
      }
      case 'recover':
      case 'stagger':
        if (this.stateT <= 0) {
          if (this.z > standZ + 1) { this.z -= 12 * dt; if (this.anim.clip !== 'z_walk') playAnim(this.anim, 'z_walk', 0.2); this.stateT = 0.02; break }
          this.state = 'idle'
          this.stateT = (this.enraged ? 0.5 : 0.85) + Math.random() * 0.4
        }
        break
    }
    // too close: melee the squad
    if (this.state !== 'intro' && Math.abs(this.z - sq.z) < this.radius + sq.halfD + 0.5 && Math.abs(this.x - sq.x) < this.radius + sq.halfW) {
      // contact stomps: on a cooldown and through the same bounded budget as attacks
      this.meleeCd -= dt
      if (this.meleeCd <= 0) {
        this.meleeCd = 0.6
        const bx = this.x, bz = this.z, r = this.radius + 0.4
        this.killIn((x, z) => (x - bx) ** 2 + (z - bz) ** 2 < r * r, 0.6, 'boss', bx, bz, Math.max(1, Math.round(this.capReal() * 0.35)))
      }
    }
    const want = Math.atan2(sq.x - this.x, sq.z - this.z)
    this.yaw += (want - this.yaw) * Math.min(1, dt * 4)
    this.x = Math.max(-ROAD_HALF + 1, Math.min(ROAD_HALF - 1, this.x))
  }

  render() {
    const sink = this.state === 'dead' ? Math.min(3, Math.max(0, this.deadT - 1) * 0.6) : 0
    const k = this.enraged && this.alive ? 0.25 + 0.1 * Math.sin(this.time * 10) : 0
    this.crowd.set(0, this.x, -sink, this.z, this.yaw, this.scale, this.anim, this.flash, 1, 0)
    this.crowd.tint(0, this.tint.setRGB(1, 1 - k, 1 - k))
    this.crowd.commit(this.state === 'dead' && this.deadT > 6 ? 0 : 1)
    if (this.alive) this.ctx.fx.shadow(this.x, this.z, this.radius * 1.5, 0.6)
    const shell = this.alive ? Math.max(this.shieldT / 0.35, this.state === 'stagger' ? 0.7 : 0) : 0
    this.barrier.visible = shell > 0.01
    if (this.barrier.visible) {
      const r = this.radius * 2.2
      this.barrier.position.set(this.x, this.scale * 0.85, this.z)
      this.barrier.scale.set(r, this.scale * 1.05, r)
      this.barrier.rotation.y = this.time * 0.8
      this.barrierMat.opacity = 0.18 + 0.5 * shell * (0.75 + 0.25 * Math.sin(this.time * 30))
    }
    const armor = this.hp > this.maxHp * 0.5 && this.alive
    this.armorPlates.forEach((p, i) => {
      p.visible = armor
      const a = this.yaw + (i - 1) * 0.6
      p.position.set(this.x + Math.sin(a) * this.radius * 0.8, this.scale * (0.95 + i * 0.12), this.z + Math.cos(a) * this.radius * 0.8)
      p.rotation.y = a
    })
  }

  dispose() {
    this.cancelPending()
    this.group.traverse(o => { const m = o as THREE.Mesh; if (m.geometry && !(o instanceof VatCrowd)) m.geometry.dispose() })
    this.crowd.dispose()
    this.barrierMat.dispose()
  }
}
