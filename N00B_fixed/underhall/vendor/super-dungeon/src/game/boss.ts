import * as THREE from 'three'
import { BOSSES, type BossDef, type EnemyType } from './content'
import type { CombatCtx } from './enemies'
import type { Telegraph } from './fx'
import { HERO_RADIUS } from './hero'
import { makeProctor, type BossRig } from './models'
import { BossAnimator } from './bossAnim'
import { glow } from './toon'

/**
 * The Proctor — Keeper of the Final Exam. Three phases (Quiz → Midterms → Final Exam) with
 * readable, telegraphed attacks. Phase changes at 66% and 33% HP push the hero back and
 * add harder patterns.
 */

type BossState = 'dormant' | 'intro' | 'idle' | 'volley' | 'slam' | 'summon' | 'beam' | 'phase' | 'dying' | 'dead'
type Attack = 'volley' | 'slam' | 'summon' | 'beam'

export type BossCtx = CombatCtx & {
  spawn: (type: EnemyType, x: number, z: number) => void
  enemyCount: number
  center: THREE.Vector3
  onPhase: (phase: number) => void
  /** Comic speech popup above the boss (e.g. "SHHH!"). */
  say: (text: string) => void
}

/** What the game needs from any boss. The Proctor and the Librarian both implement it. */
export interface BossActor {
  readonly def: BossDef
  readonly rig: { root: THREE.Group }
  readonly pos: THREE.Vector3
  readonly prev: THREE.Vector3
  readonly radius: number
  hp: number
  maxHp: number
  phase: number
  readonly state: string
  alive: boolean
  readonly targetable: boolean
  readonly center: THREE.Vector3
  setFade(on: boolean): void
  wake(): void
  hurt(amount: number, from: THREE.Vector3 | null, force: number, ctx: BossCtx): boolean
  update(dt: number, ctx: BossCtx): void
  render(alpha: number, t: number): void
  /** Remove any world objects the boss spawned outside its own rig. */
  dispose(): void
}

const PATTERNS: Record<number, Attack[]> = {
  1: ['volley', 'slam', 'volley', 'summon', 'slam'],
  2: ['slam', 'volley', 'summon', 'slam', 'volley'],
  3: ['beam', 'volley', 'slam', 'summon', 'beam', 'slam'],
}

export class Boss implements BossActor {
  readonly def = BOSSES.proctor
  readonly rig: BossRig
  readonly pos = new THREE.Vector3()
  readonly prev = new THREE.Vector3()
  readonly radius = 1.9
  hp = BOSSES.proctor.hp
  maxHp = BOSSES.proctor.hp
  phase = 1
  state: BossState = 'dormant'
  t = 0
  alive = true
  flashT = 0
  facing = 0
  private idx = 0
  private volleys = 0
  private slams: { x: number; z: number; t: number; tele: Telegraph }[] = []
  private slamLeft = 0
  private slamNext = 0
  private beamAngle = 0
  private beamSweep = 0
  private beamHitCd = 0
  private beam: THREE.Mesh
  private tele?: Telegraph
  private hover = 0
  private anim!: BossAnimator

  constructor(x: number, z: number) {
    this.rig = makeProctor()
    this.anim = new BossAnimator(this.rig, {
      dormant: ['Spell_Simple_Idle_Loop'], intro: ['Jump_Land', { loop: false, speed: 0.6 }], idle: ['Spell_Simple_Idle_Loop'],
      volley: ['Spell_Simple_Shoot', { speed: 1.1 }], slam: ['Sword_Attack', { speed: 1.25 }], summon: ['Spell_Simple_Enter', { loop: false, speed: 0.8 }],
      beam: ['Spell_Simple_Shoot', { loop: false, speed: 0.45 }], phase: ['Hit_Chest', { loop: false, speed: 0.7 }], dying: ['Death01', { loop: false, speed: 0.6 }],
    }, {
      // Floor-length academic gown-cape: gown indigo outside, crimson hood lining, red-gold hem.
      color: '#241b4d', lining: '#7a1426', trim: 'redgold', length: 1.34, topW: 0.34, botW: 0.9,
    })
    this.pos.set(x, 0, z)
    this.prev.copy(this.pos)
    this.rig.root.position.copy(this.pos)
    this.rig.root.visible = false
    this.beam = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 24).translate(0, 0, -12), glow('#ff4f6d', 0.85))
    this.beam.position.y = 1.2
    this.beam.visible = false
    this.rig.root.add(this.beam)
  }

  get targetable(): boolean {
    return this.alive && this.state !== 'dormant' && this.state !== 'intro' && this.state !== 'phase' && this.state !== 'dying'
  }
  get center(): THREE.Vector3 {
    return new THREE.Vector3(this.pos.x, 2.6 + this.hover, this.pos.z)
  }

  private faded = false
  private shells: THREE.Object3D[] | null = null

  /** Semi-transparent when the Proctor blocks the camera's view of the hero. */
  setFade(on: boolean): void {
    if (on === this.faded) return
    this.faded = on
    const own = new Set<THREE.Material>([...this.rig.flash, ...this.anim.materials])
    if (!this.shells) {
      // Outline shells and other shared materials are hidden rather than mutated.
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

  dispose(): void {
    this.rig.root.removeFromParent()
  }

  wake(): void {
    if (this.state !== 'dormant') return
    this.state = 'intro'
    this.t = 2.6
    this.rig.root.visible = true
  }

  hurt(amount: number, _from: THREE.Vector3 | null, _force: number, ctx: BossCtx): boolean {
    if (!this.targetable) return false
    this.hp = Math.max(0, this.hp - amount)
    this.flashT = 0.1
    if (this.hp <= 0) {
      this.alive = false
      this.state = 'dying'
      this.t = 2.8
      this.cleanup(ctx)
      return true
    }
    const next = this.hp < this.maxHp * 0.33 ? 3 : this.hp < this.maxHp * 0.66 ? 2 : 1
    if (next > this.phase) {
      this.phase = next
      this.state = 'phase'
      this.t = 1.8
      this.idx = 0
      this.cleanup(ctx)
      ctx.onPhase(next)
      ctx.audio.play('roar')
      ctx.shake(0.6)
      ctx.fx.ring(this.pos.clone(), '#c58cff', 1, 14, 0.7)
      const away = new THREE.Vector3().subVectors(ctx.hero.pos, this.pos).setY(0)
      if (away.length() < 9) ctx.hero.impulse.addScaledVector(away.normalize(), 16)
    }
    return false
  }

  private cleanup(ctx: CombatCtx): void {
    ctx.fx.removeTelegraph(this.tele)
    for (const s of this.slams) ctx.fx.removeTelegraph(s.tele)
    this.slams = []
    this.slamLeft = 0
    this.beam.visible = false
  }

  update(dt: number, ctx: BossCtx): void {
    this.prev.copy(this.pos)
    this.flashT = Math.max(0, this.flashT - dt)
    this.beamHitCd = Math.max(0, this.beamHitCd - dt)
    if (this.state === 'dormant' || this.state === 'dead') return
    this.t -= dt
    const hero = ctx.hero
    const toHero = new THREE.Vector3(hero.pos.x - this.pos.x, 0, hero.pos.z - this.pos.z)
    const dist = toHero.length()
    toHero.normalize()
    const faceTarget = Math.atan2(-toHero.x, -toHero.z)
    if (this.state !== 'beam') this.facing += Math.atan2(Math.sin(faceTarget - this.facing), Math.cos(faceTarget - this.facing)) * Math.min(1, dt * 3)

    if (this.state === 'dying') {
      if (Math.random() < 0.5) ctx.fx.burst(this.center.add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3)), Math.random() < 0.5 ? '#ffcf4d' : '#c58cff', 6, 8, 0.2, 0.6, 4)
      if (this.t <= 0) {
        this.state = 'dead'
        this.rig.root.visible = false
        ctx.fx.ring(this.pos.clone(), '#ffcf4d', 1, 18, 0.9)
        ctx.fx.burst(this.center, '#ffffff', 60, 14, 0.3, 1.2, 6)
      }
      return
    }
    if (this.state === 'intro') {
      if (this.t < 1.6 && this.t + dt >= 1.6) {
        ctx.audio.play('roar')
        ctx.shake(0.5)
      }
      if (this.t <= 0) {
        this.state = 'idle'
        this.t = 1.2
      }
      return
    }
    if (this.state === 'phase') {
      if (this.t <= 0) {
        this.state = 'idle'
        this.t = 0.6
        for (let i = 0; i < 2; i += 1) {
          const a = Math.random() * Math.PI * 2
          ctx.spawn('swarm', this.pos.x + Math.cos(a) * 4, this.pos.z + Math.sin(a) * 4)
        }
      }
      return
    }

    // Drift to keep a comfortable fighting distance, always inside the arena.
    if (this.state === 'idle' || this.state === 'volley' || this.state === 'summon') {
      const want = new THREE.Vector3()
      if (dist < 6) want.copy(toHero).multiplyScalar(-1)
      else if (dist > 10) want.copy(toHero)
      want.x += (ctx.center.x - this.pos.x) * 0.05
      want.z += (ctx.center.z - this.pos.z) * 0.05
      this.pos.addScaledVector(want, dt * 3.2 * ctx.slow)
      ctx.level.collide(this.pos, this.radius, true)
    }

    switch (this.state) {
      case 'idle': {
        if (this.t > 0) break
        const pattern = PATTERNS[this.phase]
        let next = pattern[this.idx % pattern.length]
        this.idx += 1
        if (next === 'summon' && ctx.enemyCount >= 5) next = 'volley'
        this.begin(next, ctx, dist)
        break
      }
      case 'volley': {
        if (this.t <= 0) {
          const n = this.phase === 1 ? 14 : 18
          const off = this.volleys % 2 ? Math.PI / n : 0
          for (let i = 0; i < n; i += 1) {
            const a = (i / n) * Math.PI * 2 + off
            const v = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(this.phase === 3 ? 9.5 : 8)
            ctx.fx.shoot('enemy', new THREE.Vector3(this.pos.x + Math.cos(a) * 1.8, 1.2, this.pos.z + Math.sin(a) * 1.8), v, 13, '#ffd35c', 0.36, { life: 3 })
          }
          ctx.audio.play('enemyShoot')
          ctx.fx.ring(this.pos.clone(), '#ffd35c', 1, 4, 0.3)
          this.volleys += 1
          if (this.phase >= 2 && this.volleys % 2 === 1) this.t = 0.45
          else this.toIdle()
        }
        break
      }
      case 'slam': {
        this.slamNext -= dt
        if (this.slamLeft > 0 && this.slamNext <= 0) {
          this.slamLeft -= 1
          this.slamNext = this.phase === 1 ? 0.6 : 0.45
          const lead = new THREE.Vector3().subVectors(hero.pos, hero.prev).multiplyScalar(18)
          const x = hero.pos.x + lead.x
          const z = hero.pos.z + lead.z
          this.slams.push({ x, z, t: 0.85, tele: ctx.fx.telegraphCircle(x, z, 2.4, 0.85, '#e8384f') })
          ctx.audio.play('telegraph')
        }
        for (let i = this.slams.length - 1; i >= 0; i -= 1) {
          const s = this.slams[i]
          s.t -= dt
          if (s.t <= 0) {
            const p = new THREE.Vector3(s.x, 0.2, s.z)
            ctx.fx.ring(p, '#e8384f', 0.5, 2.8, 0.35)
            ctx.fx.burst(p, '#e8384f', 14, 9, 0.18, 0.5)
            ctx.audio.play('slam')
            ctx.shake(0.3)
            if (Math.hypot(hero.pos.x - s.x, hero.pos.z - s.z) < 2.4 + HERO_RADIUS && hero.y < 1) ctx.hurtHero(20, p, 10)
            this.slams.splice(i, 1)
          }
        }
        if (this.slamLeft <= 0 && this.slams.length === 0) this.toIdle()
        break
      }
      case 'summon': {
        if (this.t <= 0) {
          const types: EnemyType[] = this.phase === 1 ? ['swarm', 'swarm', 'swarm'] : ['swarm', 'swarm', Math.random() < 0.5 ? 'shade' : 'monitor']
          types.forEach((type, i) => {
            const a = (i / types.length) * Math.PI * 2 + Math.random()
            ctx.spawn(type, this.pos.x + Math.cos(a) * 3.5, this.pos.z + Math.sin(a) * 3.5)
          })
          ctx.fx.ring(this.pos.clone(), '#c58cff', 1, 6, 0.5)
          this.toIdle()
        }
        break
      }
      case 'beam': {
        if (this.t > 2.3) break
        if (!this.beam.visible) {
          this.beam.visible = true
          ctx.audio.play('bolt')
        }
        this.beamAngle += this.beamSweep * dt
        this.facing = this.beamAngle
        const dir = new THREE.Vector3(-Math.sin(this.beamAngle), 0, -Math.cos(this.beamAngle))
        const rel = new THREE.Vector3(hero.pos.x - this.pos.x, 0, hero.pos.z - this.pos.z)
        const along = rel.dot(dir)
        const perp = Math.abs(rel.x * dir.z - rel.z * dir.x)
        if (along > 0 && along < 24 && perp < 0.65 + HERO_RADIUS && this.beamHitCd <= 0 && hero.y < 1.4) {
          this.beamHitCd = 0.5
          ctx.hurtHero(18, this.pos, 8)
        }
        if (Math.random() < 0.5) ctx.fx.burst(new THREE.Vector3(this.pos.x + dir.x * 3, 1.2, this.pos.z + dir.z * 3), '#ff4f6d', 2, 3, 0.12, 0.3, 0)
        if (this.t <= 0) {
          this.beam.visible = false
          this.toIdle()
        }
        break
      }
    }
  }

  private begin(a: Attack, ctx: BossCtx, _dist: number): void {
    this.state = a
    if (a === 'volley') {
      this.t = 0.8
      this.tele = ctx.fx.telegraphCircle(this.pos.x, this.pos.z, 2.6, 0.8, '#ffd35c')
      ctx.audio.play('telegraph')
    } else if (a === 'slam') {
      this.slamLeft = this.phase === 1 ? 3 : 4
      this.slamNext = 0.2
      this.t = 10
    } else if (a === 'summon') {
      this.t = 0.7
      this.tele = ctx.fx.telegraphCircle(this.pos.x, this.pos.z, 3.5, 0.7, '#c58cff')
    } else {
      const toHero = Math.atan2(-(ctx.hero.pos.x - this.pos.x), -(ctx.hero.pos.z - this.pos.z))
      this.beamSweep = (Math.random() < 0.5 ? 1 : -1) * 0.85
      this.beamAngle = toHero - this.beamSweep * 0.5
      this.facing = this.beamAngle
      this.t = 3.5
      this.tele = ctx.fx.telegraphLine(this.pos.x, this.pos.z, this.beamAngle, 22, 1.4, 1.2, '#ff4f6d')
      ctx.audio.play('telegraph')
    }
  }

  private toIdle(): void {
    this.state = 'idle'
    this.t = this.phase === 1 ? 1.3 : this.phase === 2 ? 1.0 : 0.8
  }

  render(alpha: number, t: number): void {
    const r = this.rig
    r.root.position.lerpVectors(this.prev, this.pos, alpha)
    this.hover = Math.sin(t * 1.5) * 0.25 + 0.3
    r.body.position.y = this.hover
    if (this.state === 'intro') {
      const k = Math.min(1, (2.6 - this.t) / 1.4)
      r.body.position.y = -5.5 * (1 - k) + this.hover
    }
    r.body.rotation.y = this.facing
    r.pages.rotation.y = t * (0.6 + this.phase * 0.3)
    r.pages.position.y = 3.2 + this.hover
    r.hem.rotation.z = t
    const windup = this.state === 'volley' || this.state === 'summon' || (this.state === 'beam' && this.t > 2.3)
    r.eye.scale.setScalar(windup ? 1.4 + Math.sin(t * 30) * 0.2 : 1)
    r.handL.position.y = 3.4 + Math.sin(t * 2) * 0.3
    r.handR.position.y = 3.4 + Math.cos(t * 2) * 0.3
    r.handR.rotation.x = this.state === 'slam' ? -0.8 + Math.sin(t * 12) * 0.5 : 0
    const flash = this.flashT > 0 ? 1.2 : this.state === 'phase' ? 0.6 + Math.sin(t * 30) * 0.4 : 0
    for (const m of r.flash) m.emissiveIntensity = flash
    if (this.state === 'dying') {
      r.body.rotation.z = Math.sin(t * 30) * 0.08
      r.root.scale.setScalar(Math.max(0.2, this.t / 2.8))
    }
    if (this.anim.active) {
      r.handR.rotation.x = 0
      this.anim.update(this.state, t, flash, this.state === 'dying' ? 1 - this.t / 2.8 : 0)
    }
    this.beam.rotation.y = this.facing
  }
}
