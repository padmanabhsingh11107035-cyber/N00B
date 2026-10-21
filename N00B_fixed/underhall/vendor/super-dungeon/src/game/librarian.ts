import * as THREE from 'three'
import { BOSSES, type EnemyType } from './content'
import type { BossActor, BossCtx } from './boss'
import type { CombatCtx } from './enemies'
import type { Telegraph } from './fx'
import { HERO_RADIUS } from './hero'
import { makeLibrarian, type LibrarianRig } from './models'
import { BossAnimator } from './bossAnim'
import { booksTexture, glow, toon } from './toon'

/**
 * The Librarian — Warden of the Stacks Below, final boss of Floor 2.
 * Phases OVERDUE → SILENCE → CLOSING TIME (66% / 33% HP). Every attack is telegraphed:
 *  - storm:   a rotating spiral of paper pages (strafe around it)
 *  - shelves: parallel floor stripes, then bookshelves crash down on them (step off the stripe)
 *  - shush:   "SHHH!" — an expanding wall of silence (dash through it for i-frames, or outrun it)
 *  - summon:  overdue notices come alive (swarms, later shades)
 *  - blink:   vanishes and reappears across the reading room (phase 2+)
 */

type State = 'dormant' | 'intro' | 'idle' | 'storm' | 'shelves' | 'shush' | 'summon' | 'blink' | 'phase' | 'dying' | 'dead'
type Attack = 'storm' | 'shelves' | 'shush' | 'summon' | 'blink'

const PATTERNS: Record<number, Attack[]> = {
  1: ['storm', 'shelves', 'shush', 'summon', 'storm', 'shelves'],
  2: ['blink', 'storm', 'shelves', 'shush', 'summon', 'shelves', 'shush'],
  3: ['blink', 'shush', 'storm', 'shelves', 'blink', 'storm', 'summon', 'shelves'],
}

const STORM_WINDUP = 0.75
const STORM_TIME = 2.3
const SHELF_WARN = 1.15
const SHELF_HALF = 0.8
const WAVE_SPEED = 8.5
const WAVE_MAX = 17
const WAVE_BAND = 0.6

type Shelf = { axis: 'x' | 'z'; at: number; t: number; tele?: Telegraph; mesh: THREE.Mesh; landed: boolean; linger: number }
type Wave = { r: number; hit: boolean; mesh: THREE.Mesh; delay: number }

const shelfGeo = new THREE.BoxGeometry(1, 2.4, 1)
let shelfMats: THREE.Material[] | null = null
const waveGeo = new THREE.CylinderGeometry(1, 1, 1, 56, 1, true)

export class Librarian implements BossActor {
  readonly def = BOSSES.librarian
  readonly rig: LibrarianRig
  readonly pos = new THREE.Vector3()
  readonly prev = new THREE.Vector3()
  readonly radius = 1.6
  hp = BOSSES.librarian.hp
  maxHp = BOSSES.librarian.hp
  phase = 1
  state: State = 'dormant'
  t = 0
  alive = true
  flashT = 0
  facing = 0
  private idx = 0
  private storms = 0
  private spin = 0
  private emitT = 0
  private pageSfxT = 0
  private shelves: Shelf[] = []
  private waves: Wave[] = []
  private tele?: Telegraph
  private hover = 0
  private anim!: BossAnimator
  private blinkDone = false
  private vanish = 0
  private readonly waveMat: THREE.MeshBasicMaterial

  constructor(x: number, z: number, private readonly arena = 22) {
    this.rig = makeLibrarian()
    this.anim = new BossAnimator(this.rig, {
      dormant: ['Idle_Loop'], intro: ['Jump_Land', { loop: false, speed: 0.55 }], idle: ['Spell_Simple_Idle_Loop'],
      storm: ['Spell_Simple_Shoot', { speed: 0.9 }], shelves: ['Push_Loop', { speed: 1.2 }], shush: ['Interact', { loop: false, speed: 0.9 }],
      summon: ['Spell_Simple_Enter', { loop: false, speed: 0.8 }], blink: ['Spell_Simple_Idle_Loop'],
      phase: ['Hit_Head', { loop: false, speed: 0.7 }], dying: ['Death01', { loop: false, speed: 0.55 }],
    }, {
      // Long reading-room mantle: aubergine (her skirt) outside, cardigan-teal lining, red-gold hem.
      color: '#34223f', lining: '#1f5c5a', trim: 'redgold', length: 1.22, topW: 0.32, botW: 0.84,
    })
    this.pos.set(x, 0, z)
    this.prev.copy(this.pos)
    this.rig.root.position.copy(this.pos)
    this.rig.root.visible = false
    this.waveMat = glow('#7effd4', 0.5)
    this.waveMat.side = THREE.DoubleSide
    this.waveMat.depthWrite = false
  }

  get targetable(): boolean {
    return this.alive && this.state !== 'dormant' && this.state !== 'intro' && this.state !== 'phase' && this.state !== 'dying' && this.vanish < 0.6
  }
  get center(): THREE.Vector3 {
    return new THREE.Vector3(this.pos.x, 2.5 + this.hover * 0.8, this.pos.z)
  }

  private faded = false
  private shells: THREE.Object3D[] | null = null

  setFade(on: boolean): void {
    if (on === this.faded) return
    this.faded = on
    const own = new Set<THREE.Material>([...this.rig.flash, ...this.anim.materials])
    if (!this.shells) {
      this.shells = []
      this.rig.body.traverse(o => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined
        if (m && !own.has(m) && !m.transparent) this.shells!.push(o)
      })
    }
    for (const o of this.shells) o.visible = !on
    for (const m of this.rig.flash) {
      m.transparent = on
      m.opacity = on ? 0.3 : 1
      m.depthWrite = !on
      m.needsUpdate = true
    }
    this.anim.setFade(on)
  }

  wake(): void {
    if (this.state !== 'dormant') return
    this.state = 'intro'
    this.t = 2.8
    this.rig.root.visible = true
  }

  hurt(amount: number, _from: THREE.Vector3 | null, _force: number, ctx: BossCtx): boolean {
    if (!this.targetable) return false
    this.hp = Math.max(0, this.hp - amount)
    this.flashT = 0.1
    if (this.hp <= 0) {
      this.alive = false
      this.state = 'dying'
      this.t = 3
      this.cleanup(ctx)
      return true
    }
    const next = this.hp < this.maxHp * 0.33 ? 3 : this.hp < this.maxHp * 0.66 ? 2 : 1
    if (next > this.phase) {
      this.phase = next
      this.state = 'phase'
      this.t = 1.8
      this.idx = 0
      this.vanish = 0
      this.cleanup(ctx)
      ctx.onPhase(next)
      ctx.audio.play('libRoar')
      ctx.shake(0.6)
      ctx.fx.ring(this.pos.clone(), '#7effd4', 1, 14, 0.7)
      const away = new THREE.Vector3().subVectors(ctx.hero.pos, this.pos).setY(0)
      if (away.length() < 9) ctx.hero.impulse.addScaledVector(away.normalize(), 16)
    }
    return false
  }

  private cleanup(ctx: CombatCtx): void {
    ctx.fx.removeTelegraph(this.tele)
    for (const s of this.shelves) {
      ctx.fx.removeTelegraph(s.tele)
      s.mesh.removeFromParent()
    }
    this.shelves = []
    for (const w of this.waves) w.mesh.removeFromParent()
    this.waves = []
  }

  dispose(): void {
    for (const s of this.shelves) s.mesh.removeFromParent()
    for (const w of this.waves) w.mesh.removeFromParent()
    this.shelves = []
    this.waves = []
    this.rig.root.removeFromParent()
  }

  update(dt: number, ctx: BossCtx): void {
    this.prev.copy(this.pos)
    this.flashT = Math.max(0, this.flashT - dt)
    if (this.state === 'dormant' || this.state === 'dead') return
    this.t -= dt
    const hero = ctx.hero
    const toHero = new THREE.Vector3(hero.pos.x - this.pos.x, 0, hero.pos.z - this.pos.z)
    const dist = toHero.length()
    toHero.normalize()
    const faceTarget = Math.atan2(-toHero.x, -toHero.z)
    this.facing += Math.atan2(Math.sin(faceTarget - this.facing), Math.cos(faceTarget - this.facing)) * Math.min(1, dt * 3)

    // Shelves and silence waves keep resolving even while she starts her next move.
    this.updateShelves(dt, ctx)
    this.updateWaves(dt, ctx)

    if (this.state === 'dying') {
      if (Math.random() < 0.5) ctx.fx.burst(this.center.add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3)), Math.random() < 0.5 ? '#7effd4' : '#f5f1e6', 6, 8, 0.2, 0.6, 4)
      if (this.t <= 0) {
        this.state = 'dead'
        this.rig.root.visible = false
        ctx.fx.ring(this.pos.clone(), '#7effd4', 1, 18, 0.9)
        ctx.fx.burst(this.center, '#ffffff', 70, 14, 0.3, 1.2, 6)
      }
      return
    }
    if (this.state === 'intro') {
      if (this.t < 1.7 && this.t + dt >= 1.7) {
        ctx.audio.play('libRoar')
        ctx.shake(0.5)
        ctx.say('SHHH...')
      }
      if (this.t <= 0) {
        this.state = 'idle'
        this.t = 1.1
      }
      return
    }
    if (this.state === 'phase') {
      if (this.t <= 0) {
        this.state = 'idle'
        this.t = 0.6
        ctx.say(this.phase === 2 ? 'SILENCE!' : 'CLOSING TIME!')
        for (let i = 0; i < 2; i += 1) {
          const a = Math.random() * Math.PI * 2
          ctx.spawn('swarm', this.pos.x + Math.cos(a) * 4, this.pos.z + Math.sin(a) * 4)
        }
      }
      return
    }

    // Glide to a reading distance, staying inside the arena.
    if (this.state === 'idle' || this.state === 'summon' || this.state === 'shelves') {
      const want = new THREE.Vector3()
      if (dist < 7) want.copy(toHero).multiplyScalar(-1)
      else if (dist > 11) want.copy(toHero)
      want.x += (ctx.center.x - this.pos.x) * 0.06
      want.z += (ctx.center.z - this.pos.z) * 0.06
      this.pos.addScaledVector(want, dt * (this.phase === 3 ? 3.6 : 2.8) * ctx.slow)
      ctx.level.collide(this.pos, this.radius, true)
    }

    switch (this.state) {
      case 'idle': {
        if (this.t > 0) break
        const pattern = PATTERNS[this.phase]
        let next = pattern[this.idx % pattern.length]
        this.idx += 1
        if (next === 'summon' && ctx.enemyCount >= 5) next = 'storm'
        this.begin(next, ctx)
        break
      }
      case 'storm': {
        if (this.t > STORM_TIME) break
        const arms = this.phase === 3 ? 4 : 3
        const dir = this.storms % 2 ? -1 : 1
        this.spin += dir * (this.phase === 1 ? 1.7 : 2.1) * dt
        this.emitT -= dt
        this.pageSfxT -= dt
        if (this.pageSfxT <= 0) {
          ctx.audio.play('pages')
          this.pageSfxT = 0.75
        }
        while (this.emitT <= 0) {
          this.emitT += this.phase === 1 ? 0.13 : 0.1
          for (let k = 0; k < arms; k += 1) {
            const a = this.spin + (k / arms) * Math.PI * 2
            const v = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(this.phase === 3 ? 8.2 : 7.2)
            ctx.fx.shoot('enemy', new THREE.Vector3(this.pos.x + Math.cos(a) * 1.6, 1.2, this.pos.z + Math.sin(a) * 1.6), v, 10, '#f5f1e6', 0.33, { life: 3 })
          }
        }
        if (this.t <= 0) {
          this.storms += 1
          this.toIdle()
        }
        break
      }
      case 'shelves': {
        if (this.shelves.length === 0 && this.t <= 0) this.toIdle()
        break
      }
      case 'shush': {
        if (this.t <= 0) {
          const double = this.phase === 3
          this.emitWave(ctx, 0)
          if (double) this.emitWave(ctx, 0.6)
          ctx.audio.play('shush')
          ctx.say('SHHH!')
          ctx.shake(0.35)
          this.toIdle(double ? 0.9 : 0.4)
        }
        break
      }
      case 'summon': {
        if (this.t <= 0) {
          const types: EnemyType[] = this.phase === 1 ? ['swarm', 'swarm', 'swarm'] : ['swarm', 'swarm', 'shade']
          if (this.phase === 3 && ctx.enemyCount < 3) types.push('monitor')
          types.forEach((type, i) => {
            const a = (i / types.length) * Math.PI * 2 + Math.random()
            ctx.spawn(type, this.pos.x + Math.cos(a) * 3.5, this.pos.z + Math.sin(a) * 3.5)
          })
          ctx.fx.ring(this.pos.clone(), '#c58cff', 1, 6, 0.5)
          ctx.say('OVERDUE!')
          this.toIdle()
        }
        break
      }
      case 'blink': {
        // 0.9 s: fade out (0.45 s), teleport, fade back in.
        const k = 1 - this.t / 0.9
        this.vanish = k < 0.5 ? k * 2 : Math.max(0, 2 - k * 2)
        if (!this.blinkDone && k >= 0.5) {
          this.blinkDone = true
          ctx.fx.burst(this.center, '#7effd4', 24, 8, 0.2, 0.6, 2)
          // Reappear on the far side of the room from the hero.
          const side = new THREE.Vector3(ctx.center.x - hero.pos.x, 0, ctx.center.z - hero.pos.z)
          if (side.lengthSq() < 1) side.set(Math.random() - 0.5, 0, Math.random() - 0.5)
          side.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 1.4)
          this.pos.set(ctx.center.x + side.x * 6, 0, ctx.center.z + side.z * 6)
          ctx.level.collide(this.pos, this.radius, true)
          this.prev.copy(this.pos)
          ctx.audio.play('blink')
          ctx.fx.ring(this.pos.clone(), '#7effd4', 0.5, 4, 0.4)
        }
        if (this.t <= 0) {
          this.vanish = 0
          this.toIdle(0.25)
        }
        break
      }
    }
  }

  private begin(a: Attack, ctx: BossCtx): void {
    this.state = a
    if (a === 'storm') {
      this.t = STORM_TIME + STORM_WINDUP
      this.emitT = 0
      this.pageSfxT = 0
      this.spin = Math.random() * Math.PI * 2
      this.tele = ctx.fx.telegraphCircle(this.pos.x, this.pos.z, 2.8, STORM_WINDUP, '#f5f1e6')
      ctx.audio.play('telegraph')
    } else if (a === 'shelves') {
      this.dropShelves(ctx)
      this.t = 0.5
    } else if (a === 'shush') {
      this.t = 0.95
      this.tele = ctx.fx.telegraphCircle(this.pos.x, this.pos.z, 3.2, 0.95, '#7effd4')
      ctx.audio.play('telegraph')
    } else if (a === 'summon') {
      this.t = 0.7
      this.tele = ctx.fx.telegraphCircle(this.pos.x, this.pos.z, 3.5, 0.7, '#c58cff')
    } else {
      this.t = 0.9
      this.blinkDone = false
      ctx.audio.play('blink')
    }
  }

  /** Parallel stripes across the reading room; one always runs under the hero. */
  private dropShelves(ctx: BossCtx): void {
    const hero = ctx.hero
    const axis: 'x' | 'z' = Math.random() < 0.5 ? 'x' : 'z'
    const count = this.phase === 1 ? 3 : this.phase === 2 ? 4 : 5
    const heroAt = axis === 'x' ? hero.pos.z : hero.pos.x
    const spacing = this.phase === 3 ? 3.1 : 3.5
    const offset = Math.floor(Math.random() * count)
    const half = this.arena / 2
    const parent = this.rig.root.parent
    const mats = this.shelfMaterials()
    for (let i = 0; i < count; i += 1) {
      const at = heroAt + (i - offset) * spacing
      const delay = i * (this.phase === 3 ? 0.14 : 0.2)
      const warn = SHELF_WARN - (this.phase === 3 ? 0.15 : 0) + delay
      const angle = axis === 'x' ? -Math.PI / 2 : 0
      const x0 = axis === 'x' ? ctx.center.x - half : at
      const z0 = axis === 'x' ? at : ctx.center.z + half
      const tele = ctx.fx.telegraphLine(x0, z0, angle, this.arena, SHELF_HALF * 2, warn, '#ff9f43')
      const m = new THREE.Mesh(shelfGeo, mats)
      m.scale.set(axis === 'x' ? this.arena : 1, 1, axis === 'x' ? 1 : this.arena)
      m.position.set(axis === 'x' ? ctx.center.x : at, 9, axis === 'x' ? at : ctx.center.z)
      if (axis === 'z') m.rotation.y = Math.PI / 2
      if (axis === 'z') m.scale.set(this.arena, 1, 1)
      m.visible = false
      m.castShadow = true
      parent?.add(m)
      this.shelves.push({ axis, at, t: warn, tele, mesh: m, landed: false, linger: 0.7 })
    }
    ctx.audio.play('telegraph')
  }

  private updateShelves(dt: number, ctx: BossCtx): void {
    const hero = ctx.hero
    for (let i = this.shelves.length - 1; i >= 0; i -= 1) {
      const s = this.shelves[i]
      if (!s.landed) {
        s.t -= dt
        const fall = 0.32
        if (s.t < fall) {
          s.mesh.visible = true
          const k = 1 - Math.max(0, s.t) / fall
          s.mesh.position.y = 9 - (9 - 1.2) * k * k
        }
        if (s.t <= 0) {
          s.landed = true
          s.mesh.position.y = 1.2
          const perp = s.axis === 'x' ? Math.abs(hero.pos.z - s.at) : Math.abs(hero.pos.x - s.at)
          if (perp < SHELF_HALF + HERO_RADIUS && hero.y < 1.2) ctx.hurtHero(22, new THREE.Vector3(hero.pos.x, 0, hero.pos.z).add(s.axis === 'x' ? new THREE.Vector3(0, 0, -Math.sign(hero.pos.z - s.at || 1)) : new THREE.Vector3(-Math.sign(hero.pos.x - s.at || 1), 0, 0)), 9)
          const p = s.axis === 'x' ? new THREE.Vector3(hero.pos.x, 0.3, s.at) : new THREE.Vector3(s.at, 0.3, hero.pos.z)
          ctx.fx.burst(p, '#c9a27a', 16, 8, 0.2, 0.5)
          ctx.audio.play('shelf')
          ctx.shake(0.28)
        }
      } else {
        s.linger -= dt
        s.mesh.scale.y = Math.max(0.01, Math.min(1, s.linger / 0.3))
        s.mesh.position.y = 1.2 * s.mesh.scale.y
        if (s.linger <= 0) {
          s.mesh.removeFromParent()
          this.shelves.splice(i, 1)
        }
      }
    }
  }

  private shelfMaterials(): THREE.Material[] {
    if (!shelfMats) {
      const side = toon('#5a3d2b')
      const tex = booksTexture().clone()
      tex.wrapS = THREE.RepeatWrapping
      tex.repeat.set(Math.round(this.arena / 2), 1)
      tex.needsUpdate = true
      const face = new THREE.MeshStandardMaterial({ map: tex, color: '#ffffff' })
      shelfMats = [side, side, side, side, face, face]
    }
    return shelfMats
  }

  /** The rig plus every material the fight creates later (shelves, silence waves), for shader warm-up. */
  warmSet(): THREE.Object3D {
    const g = new THREE.Group()
    g.add(this.rig.root, new THREE.Mesh(shelfGeo, this.shelfMaterials()), new THREE.Mesh(waveGeo, this.waveMat))
    return g
  }

  private emitWave(ctx: BossCtx, delay: number): void {
    const m = new THREE.Mesh(waveGeo, this.waveMat)
    m.position.set(this.pos.x, 0.5, this.pos.z)
    m.scale.set(0.5, 1, 0.5)
    m.visible = delay <= 0
    this.rig.root.parent?.add(m)
    this.waves.push({ r: 0.5, hit: false, mesh: m, delay })
    ctx.fx.ring(this.pos.clone(), '#7effd4', 0.5, 3.5, 0.3)
  }

  private updateWaves(dt: number, ctx: BossCtx): void {
    const hero = ctx.hero
    for (let i = this.waves.length - 1; i >= 0; i -= 1) {
      const w = this.waves[i]
      if (w.delay > 0) {
        w.delay -= dt
        if (w.delay <= 0) {
          w.mesh.visible = true
          w.mesh.position.set(this.pos.x, 0.5, this.pos.z)
          ctx.audio.play('shush')
        }
        continue
      }
      w.r += WAVE_SPEED * dt
      w.mesh.scale.set(w.r, 1, w.r)
      const d = Math.hypot(hero.pos.x - w.mesh.position.x, hero.pos.z - w.mesh.position.z)
      if (!w.hit && Math.abs(d - w.r) < WAVE_BAND + HERO_RADIUS && hero.y < 0.9) {
        w.hit = true
        ctx.hurtHero(16, w.mesh.position.clone(), 12)
      }
      if (w.r > WAVE_MAX) {
        w.mesh.removeFromParent()
        this.waves.splice(i, 1)
      }
    }
  }

  private toIdle(extra = 0): void {
    this.state = 'idle'
    this.t = (this.phase === 1 ? 1.25 : this.phase === 2 ? 0.95 : 0.75) + extra
  }

  render(alpha: number, t: number): void {
    const r = this.rig
    r.root.position.lerpVectors(this.prev, this.pos, alpha)
    this.hover = Math.sin(t * 1.3) * 0.2 + 0.45
    r.body.position.y = this.hover
    if (this.state === 'intro') {
      // Descends from the dark above the reading room.
      const k = Math.min(1, (2.8 - this.t) / 1.5)
      r.body.position.y = 7 * (1 - k) * (1 - k) + this.hover
    }
    r.body.rotation.y = this.facing
    r.books.rotation.y = t * (0.5 + this.phase * 0.35) * (this.storms % 2 ? -1 : 1)
    r.books.position.y = 3.4 + this.hover + Math.sin(t * 2) * 0.15
    r.hem.rotation.z = t
    r.tome.position.y = 3.5 + Math.sin(t * 2.4) * 0.12
    r.tome.rotation.y = Math.sin(t * 0.8) * 0.2
    const windup = (this.state === 'storm' && this.t > STORM_TIME) || this.state === 'shush' || this.state === 'summon'
    for (const l of r.lenses) l.scale.setScalar(windup ? 1.35 + Math.sin(t * 30) * 0.2 : 1)
    const raise = this.state === 'shelves' ? 1 : this.state === 'shush' ? 0.6 : 0
    r.handL.position.y = 3.8 + Math.sin(t * 2) * 0.25 + raise * 1.6
    r.handR.position.y = 3.8 + Math.cos(t * 2) * 0.25 + raise * 1.6
    r.handL.position.z = r.handR.position.z = this.state === 'storm' ? -1.1 : -0.5
    const flash = this.flashT > 0 ? 1.2 : this.state === 'phase' ? 0.6 + Math.sin(t * 30) * 0.4 : 0
    for (const m of r.flash) m.emissiveIntensity = flash
    // 0.8 keeps her 5 m tall: imposing, but her face stays in the boss camera's frame.
    const base = 0.8
    const s = (this.state === 'dying' ? Math.max(0.2, this.t / 3) : 1 - this.vanish * 0.85) * base
    r.root.scale.set(s, this.state === 'dying' ? s : base * (1 + this.vanish * 0.6), s)
    r.books.visible = this.vanish < 0.7
    if (this.state === 'dying') r.body.rotation.z = Math.sin(t * 30) * 0.08
    if (this.anim.active) this.anim.update(this.state, t, flash, this.state === 'dying' ? 1 - this.t / 3 : this.vanish)
  }
}
