import * as THREE from 'three'
import type { Audio } from '../engine/audio'
import { ENEMIES, type EnemyDef, type EnemyType } from './content'
import type { Fx, Telegraph } from './fx'
import { HERO_RADIUS, type Hero } from './hero'
import type { Level } from './level'
import { makeBruiser, makeMonitor, makeShade, makeSwarm, type EnemyRig } from './models'
import { makeHumanoidEnemy } from './actors'

export type CombatCtx = {
  hero: Hero
  level: Level
  fx: Fx
  audio: Audio
  hurtHero: (amount: number, from: THREE.Vector3, knock?: number) => void
  shake: (v: number) => void
  slow: number
  tint: string
}

type State = 'spawn' | 'chase' | 'windup' | 'act' | 'recover' | 'stun' | 'dying'

const tmp = new THREE.Vector3()
const tmp2 = new THREE.Vector3()

export class Enemy {
  readonly def: EnemyDef
  readonly rig: EnemyRig
  readonly pos = new THREE.Vector3()
  readonly prev = new THREE.Vector3()
  readonly knock = new THREE.Vector3()
  readonly dir = new THREE.Vector3(0, 0, -1)
  hp: number
  maxHp: number
  radius: number
  speed: number
  damage: number
  state: State = 'spawn'
  t = 0.8
  cd = 1 + Math.random()
  contactCd = 0
  flashT = 0
  stunT = 0
  facing = 0
  alive = true
  removed = false
  lungeHit = false
  strafe = Math.random() < 0.5 ? 1 : -1
  strafeT = 2
  lastHitId = -1
  private tele?: Telegraph
  private phase = Math.random() * 10
  private renderT = -1
  private clipState: State | null = null

  constructor(readonly type: EnemyType, readonly elite: boolean, x: number, z: number, tint: string) {
    this.def = ENEMIES[type]
    const mult = elite ? 2.4 : 1
    this.hp = this.maxHp = Math.round(this.def.hp * mult)
    this.radius = this.def.radius * (elite ? 1.2 : 1)
    this.speed = this.def.speed * (elite ? 1.1 : 1)
    this.damage = Math.round(this.def.damage * (elite ? 1.3 : 1))
    this.rig = ((type === 'shade' || type === 'bruiser') ? makeHumanoidEnemy(type, tint, elite) : null)
      ?? (type === 'swarm' ? makeSwarm(elite) : type === 'shade' ? makeShade(tint, elite) : type === 'monitor' ? makeMonitor(elite) : makeBruiser(tint, elite))
    this.pos.set(x, 0, z)
    this.prev.copy(this.pos)
    this.rig.root.position.copy(this.pos)
    if (this.rig.char) this.rig.char.dissolve = 1
    else this.rig.root.scale.set(1, 0.01, 1)
  }

  get targetable(): boolean {
    return this.alive && this.state !== 'spawn'
  }
  get center(): THREE.Vector3 {
    return tmp2.set(this.pos.x, this.type === 'monitor' ? 1.9 : this.type === 'bruiser' ? 1.6 : 1.0, this.pos.z)
  }

  /** Returns true if this hit killed the enemy. */
  hurt(amount: number, from: THREE.Vector3 | null, force: number, fx: Fx): boolean {
    if (!this.alive || this.state === 'spawn') return false
    this.hp -= amount
    this.flashT = 0.12
    if (from) {
      const resist = this.type === 'bruiser' ? 0.3 : this.elite ? 0.6 : 1
      tmp.set(this.pos.x - from.x, 0, this.pos.z - from.z).normalize().multiplyScalar(force * resist)
      this.knock.add(tmp)
    }
    if (this.hp <= 0) {
      this.alive = false
      this.state = 'dying'
      this.t = this.rig.char ? 1.1 : 0.4
      fx.removeTelegraph(this.tele)
      return true
    }
    return false
  }

  stun(seconds: number, fx: Fx): void {
    if (!this.alive || this.state === 'spawn') return
    this.state = 'stun'
    this.t = seconds * (this.type === 'bruiser' ? 0.6 : 1)
    fx.removeTelegraph(this.tele)
  }

  update(dt: number, ctx: CombatCtx, others: Enemy[]): void {
    this.prev.copy(this.pos)
    this.flashT = Math.max(0, this.flashT - dt)
    this.contactCd = Math.max(0, this.contactCd - dt)
    this.phase += dt
    if (this.type === 'shade' && this.rig.char && this.alive && this.state !== 'spawn' && Math.random() < dt * 5) {
      ctx.fx.smoke(tmp2.set(this.pos.x + (Math.random() - 0.5) * 0.5, 0.3, this.pos.z + (Math.random() - 0.5) * 0.5), '#2a1242', 1, 0.9, 1.0, 0.5)
    }
    const hero = ctx.hero
    const toHero = tmp.set(hero.pos.x - this.pos.x, 0, hero.pos.z - this.pos.z)
    const dist = toHero.length()
    if (dist > 1e-4) toHero.divideScalar(dist)
    this.t -= dt
    const sp = this.speed * ctx.slow
    let move = 0
    const moveDir = new THREE.Vector3()

    if (this.state === 'dying') {
      if (this.t <= 0) this.removed = true
      return
    }
    if (this.state === 'spawn') {
      if (this.t <= 0) this.state = 'chase'
      return
    }
    if (this.state === 'stun') {
      if (this.t <= 0) {
        this.state = 'chase'
        this.cd = Math.max(this.cd, 0.4)
      }
    } else {
      this.cd -= dt * ctx.slow
    }

    const steer = () => {
      if (ctx.level.los(this.pos.x, this.pos.z, hero.pos.x, hero.pos.z)) moveDir.copy(toHero)
      else if (!ctx.level.flowDir(this.pos.x, this.pos.z, moveDir)) moveDir.copy(toHero)
    }

    switch (this.type) {
      case 'swarm': {
        if (this.state !== 'chase') break
        steer()
        const side = Math.sin(this.phase * 5) * 0.6
        moveDir.x += -toHero.z * side
        moveDir.z += toHero.x * side
        moveDir.normalize()
        move = sp
        if (dist < this.radius + HERO_RADIUS + 0.25 && this.contactCd <= 0) {
          this.contactCd = 0.9
          ctx.hurtHero(this.damage, this.pos, 5)
          this.knock.addScaledVector(toHero, -7)
        }
        break
      }
      case 'shade': {
        if (this.state === 'chase') {
          steer()
          move = sp
          if (dist < 4 && this.cd <= 0 && ctx.level.los(this.pos.x, this.pos.z, hero.pos.x, hero.pos.z)) {
            this.state = 'windup'
            this.t = this.elite ? 0.45 : 0.6
            this.dir.copy(toHero)
            this.tele = ctx.fx.telegraphLine(this.pos.x, this.pos.z, Math.atan2(-this.dir.x, -this.dir.z), 6, 1.5, this.t, '#ff4fd8')
            ctx.audio.play('telegraph')
          }
        } else if (this.state === 'windup') {
          if (this.t <= 0) {
            this.state = 'act'
            this.t = 0.3
            this.lungeHit = false
          }
        } else if (this.state === 'act') {
          moveDir.copy(this.dir)
          move = 17
          if (!this.lungeHit && dist < this.radius + HERO_RADIUS + 0.6) {
            this.lungeHit = true
            ctx.hurtHero(this.damage, this.pos, 9)
          }
          if (this.t <= 0) {
            this.state = 'recover'
            this.t = 0.65
          }
        } else if (this.state === 'recover' && this.t <= 0) {
          this.state = 'chase'
          this.cd = 1.4 + Math.random() * 0.6
        }
        break
      }
      case 'monitor': {
        this.strafeT -= dt
        if (this.strafeT <= 0) {
          this.strafe *= -1
          this.strafeT = 1.5 + Math.random() * 1.5
        }
        if (this.state === 'chase') {
          const see = ctx.level.los(this.pos.x, this.pos.z, hero.pos.x, hero.pos.z)
          if (!see || dist > 11) {
            steer()
            move = sp
          } else {
            moveDir.set(-toHero.z * this.strafe, 0, toHero.x * this.strafe)
            if (dist < 6) moveDir.addScaledVector(toHero, -1)
            moveDir.normalize()
            move = sp * 0.7
          }
          if (see && dist < 16 && this.cd <= 0) {
            this.state = 'windup'
            this.t = 0.7
            this.dir.copy(toHero)
            this.tele = ctx.fx.telegraphLine(this.pos.x, this.pos.z, Math.atan2(-this.dir.x, -this.dir.z), Math.min(dist + 2, 16), 0.35, this.t, '#ff3b3b')
            ctx.audio.play('telegraph')
          }
        } else if (this.state === 'windup') {
          if (this.t <= 0) {
            const angles = this.elite ? [-0.22, 0, 0.22] : [0]
            for (const a of angles) {
              const d = this.dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a)
              ctx.fx.shoot('enemy', new THREE.Vector3(this.pos.x + d.x * 0.6, 1.3, this.pos.z + d.z * 0.6), d.multiplyScalar(12.5), this.damage, '#ff3b3b', 0.32)
            }
            ctx.audio.play('enemyShoot')
            this.state = 'recover'
            this.t = 0.35
          }
        } else if (this.state === 'recover' && this.t <= 0) {
          this.state = 'chase'
          this.cd = 2 + Math.random() * 0.8
        }
        break
      }
      case 'bruiser': {
        if (this.state === 'chase') {
          steer()
          move = sp
          if (dist < 3.6 && this.cd <= 0) {
            this.state = 'windup'
            this.t = this.elite ? 0.75 : 0.9
            this.dir.copy(toHero)
            const cx = this.pos.x + this.dir.x * 1.4
            const cz = this.pos.z + this.dir.z * 1.4
            this.tele = ctx.fx.telegraphCircle(cx, cz, 3.1, this.t, '#ff7a45')
            this.tele.mesh.userData.cx = cx
            this.tele.mesh.userData.cz = cz
            ctx.audio.play('telegraph')
          }
        } else if (this.state === 'windup') {
          if (this.t <= 0) {
            const cx = this.pos.x + this.dir.x * 1.4
            const cz = this.pos.z + this.dir.z * 1.4
            const p = new THREE.Vector3(cx, 0, cz)
            ctx.fx.ring(p, '#ff7a45', 0.5, 3.4, 0.4)
            ctx.fx.burst(p.setY(0.3), '#ffcf4d', 16, 8, 0.18, 0.5)
            ctx.audio.play('slam')
            ctx.shake(0.35)
            if (Math.hypot(hero.pos.x - cx, hero.pos.z - cz) < 3.1 + HERO_RADIUS && hero.y < 1) ctx.hurtHero(this.damage, p, 12)
            if (this.elite) {
              for (let i = 0; i < 8; i += 1) {
                const a = (i / 8) * Math.PI * 2
                ctx.fx.shoot('enemy', new THREE.Vector3(cx, 0.8, cz), new THREE.Vector3(Math.cos(a) * 9, 0, Math.sin(a) * 9), 10, '#ff7a45', 0.3)
              }
            }
            this.state = 'recover'
            this.t = 0.9
          }
        } else if (this.state === 'recover' && this.t <= 0) {
          this.state = 'chase'
          this.cd = 2 + Math.random() * 0.8
        }
        break
      }
    }

    // Separation so packs spread out instead of stacking.
    for (const o of others) {
      if (o === this || !o.alive) continue
      const dx = this.pos.x - o.pos.x
      const dz = this.pos.z - o.pos.z
      const min = this.radius + o.radius
      const d2 = dx * dx + dz * dz
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2)
        const push = (min - d) * 0.5
        this.pos.x += (dx / d) * push
        this.pos.z += (dz / d) * push
      }
    }
    if (move > 0 && this.state !== 'stun') {
      this.pos.addScaledVector(moveDir, move * dt)
      if (this.state !== 'act') {
        const target = Math.atan2(-toHero.x, -toHero.z)
        let d = target - this.facing
        d = Math.atan2(Math.sin(d), Math.cos(d))
        this.facing += d * Math.min(1, dt * 8)
      } else this.facing = Math.atan2(-this.dir.x, -this.dir.z)
    } else if (this.state === 'windup' || this.state === 'recover') {
      const target = Math.atan2(-this.dir.x, -this.dir.z)
      this.facing += Math.atan2(Math.sin(target - this.facing), Math.cos(target - this.facing)) * Math.min(1, dt * 10)
    }
    this.pos.addScaledVector(this.knock, dt)
    this.knock.multiplyScalar(Math.exp(-dt * 8))
    ctx.level.collide(this.pos, this.radius, true)
  }

  render(alpha: number, t: number): void {
    const r = this.rig
    r.root.position.lerpVectors(this.prev, this.pos, alpha)
    r.body.rotation.y = this.facing
    if (r.char) {
      this.renderChar(t)
      return
    }
    const flash = this.flashT > 0 ? 1.4 : this.state === 'windup' ? 0.25 + Math.sin(t * 40) * 0.25 : 0
    for (const m of r.flash) m.emissiveIntensity = flash
    if (this.state === 'spawn') {
      const k = 1 - Math.max(0, this.t) / 0.8
      r.root.scale.set(1, Math.max(0.01, k), 1)
    } else if (this.state === 'dying') {
      const k = Math.max(0, this.t / 0.4)
      r.root.scale.set(1 + (1 - k) * 0.4, Math.max(0.01, k), 1 + (1 - k) * 0.4)
    } else r.root.scale.set(1, 1, 1)
    const stunWobble = this.state === 'stun' ? Math.sin(t * 25) * 0.15 : 0
    r.body.rotation.z = stunWobble
    const p = r.parts
    switch (this.type) {
      case 'swarm':
        p.wingL.rotation.z = Math.sin(t * 18 + this.phase) * 0.7
        p.wingR.rotation.z = -Math.sin(t * 18 + this.phase) * 0.7
        r.body.position.y = 1.05 + Math.sin(t * 6 + this.phase) * 0.18
        break
      case 'shade': {
        const lunge = this.state === 'act' ? 1 : this.state === 'windup' ? -0.4 : 0
        p.clawL.rotation.x = -lunge * 1.2
        p.clawR.rotation.x = -lunge * 1.2
        r.body.position.y = 0.1 + Math.sin(t * 3 + this.phase) * 0.08
        r.body.rotation.x = lunge * 0.35
        break
      }
      case 'monitor':
        p.rotor.rotation.y = t * 20
        r.body.position.y = 1.9 + Math.sin(t * 2.5 + this.phase) * 0.15
        ;(p.eye as THREE.Mesh).scale.setScalar(this.state === 'windup' ? 1.3 + Math.sin(t * 30) * 0.2 : 1)
        break
      case 'bruiser': {
        const raise = this.state === 'windup' ? Math.min(1, (0.9 - this.t) / 0.5) : this.state === 'recover' ? Math.max(0, this.t - 0.5) : 0
        p.armL.rotation.x = -raise * 2.6 + Math.sin(t * 4 + this.phase) * 0.2
        p.armR.rotation.x = -raise * 2.6 - Math.sin(t * 4 + this.phase) * 0.2
        r.body.position.y = Math.abs(Math.sin(t * 4 + this.phase)) * 0.12
        break
      }
    }
    if (p.halo) {
      p.halo.position.y = this.type === 'swarm' ? 0.35 : this.type === 'monitor' ? 0.85 : this.type === 'bruiser' ? 3.3 : 2.25
      p.halo.rotation.z = t * 2
    }
  }

  /** Humanoid enemies: state-driven clips, dissolve spawn/death, hit flash. */
  private renderChar(t: number): void {
    const r = this.rig
    const c = r.char!
    const dt = this.renderT < 0 ? 0 : Math.min(0.1, Math.max(0, t - this.renderT))
    this.renderT = t
    const shade = this.type === 'shade'
    if (this.state !== this.clipState) {
      this.clipState = this.state
      switch (this.state) {
        case 'spawn': c.play('Idle_Loop', { fade: 0 }); break
        case 'chase': c.play('Jog_Fwd_Loop', { speed: shade ? 1.15 : 0.8, fade: 0.2 }); break
        case 'windup': c.play('Spell_Simple_Enter', { loop: false, duration: Math.max(0.25, this.t), fade: 0.12, force: true }); break
        case 'act': c.play(shade ? 'Punch_Cross' : 'Jump_Land', { loop: false, speed: shade ? 1.6 : 1.3, fade: 0.06, force: true }); break
        case 'recover': c.play('Idle_Loop', { fade: 0.3 }); break
        case 'stun': c.play('Hit_Chest', { loop: false, fade: 0.08, force: true }); break
        case 'dying': c.play('Death01', { loop: false, speed: 1.3, fade: 0.1, force: true }); break
      }
    }
    c.update(dt)
    c.time = t
    c.flash = this.flashT > 0 ? 1.2 : this.state === 'windup' ? 0.25 + Math.sin(t * 40) * 0.25 : 0
    c.dissolve = this.state === 'spawn' ? Math.max(0, this.t / 0.8) : this.state === 'dying' ? Math.min(1, Math.max(0, 1 - this.t / 0.55)) : 0
    r.body.rotation.z = this.state === 'stun' ? Math.sin(t * 25) * 0.08 : 0
    if (shade) {
      r.body.position.y = 0.06 + Math.sin(t * 3 + this.phase) * 0.05
      const w = r.parts.wisp
      if (w) w.scale.setScalar(1.5 + Math.sin(t * 5 + this.phase) * 0.2)
    }
    const halo = r.parts.halo
    if (halo) {
      halo.position.y = shade ? 2.25 : 2.75
      halo.rotation.z = t * 2
    }
  }
  dispose(fx: Fx): void {
    fx.removeTelegraph(this.tele)
    this.rig.root.removeFromParent()
    this.rig.char?.dispose()
  }
}
