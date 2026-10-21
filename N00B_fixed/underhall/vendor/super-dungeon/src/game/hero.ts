import * as THREE from 'three'
import { makeHeroView, type HeroView } from './actors'
import type { Level } from './level'
import { BASE_STATS, type HeroStats } from './rules'
import { CONFIG } from '../../../../src/game/config'
import { tuning } from '../../../../src/game/tuning'

export type HeroIntent = {
  /** World-space move vector (length ≤ 1). */
  move: THREE.Vector3
  attack: boolean
  bolt: boolean
  dash: boolean
  /** Jump pressed this step (buffered briefly by the hero). */
  jump: boolean
  /** Sprint held. */
  sprint: boolean
  nova: boolean
  /** Unit XZ aim for melee (auto-targeted), and for bolts. */
  aim: THREE.Vector3
}

export type HeroEvent =
  | { type: 'melee'; index: number; dir: THREE.Vector3 }
  | { type: 'bolt'; dir: THREE.Vector3 }
  | { type: 'nova' }
  | { type: 'dash'; dir: THREE.Vector3 }
  | { type: 'jump' }
  | { type: 'land'; impact: number }
  | { type: 'nopower' }
  | { type: 'swing' }

export const HERO_RADIUS = 0.45
export const NOVA_COST = 60
const COMBO_TIMES = [0.24, 0.24, 0.4]
const GRAVITY = 30
const COMBO_HIT_AT = [0.07, 0.07, 0.13]

export class Hero {
  readonly rig: HeroView
  readonly pos = new THREE.Vector3()
  readonly prev = new THREE.Vector3()
  readonly impulse = new THREE.Vector3()
  facing = Math.PI
  stats: HeroStats = { ...BASE_STATS }
  hp = 100
  power = 20
  readonly maxPower = 100
  alive = true
  y = 0
  vy = 0
  dashT = 0
  dashCd = 0
  iframes = 0
  attackT = 0
  attackDur = 0.24
  combo = 0
  comboWindow = 0
  private pendingHit = -1
  private pendingIndex = 0
  private pendingDir = new THREE.Vector3()
  boltCd = 0
  boltPose = 0
  novaPose = 0
  shieldCd = 0
  hurtFlash = 0
  slow = 1
  private dashDir = new THREE.Vector3()
  private jumpBuf = 0
  private coyote = 0
  /** True while sprint is held and the hero is actually running (not attacking/dashing). */
  sprinting = false
  private stride = 0
  private speedNow = 0
  private noPowerCd = 0
  private readonly tmp = new THREE.Vector3()

  constructor() {
    this.rig = makeHeroView()
  }

  get shieldReady(): boolean {
    return this.stats.shield && this.shieldCd <= 0
  }

  place(x: number, z: number, facing = Math.PI): void {
    this.pos.set(x, 0, z)
    this.prev.copy(this.pos)
    this.impulse.set(0, 0, 0)
    this.facing = facing
    this.y = 0
    this.vy = 0
    this.rig.cape?.reset()
  }

  step(dt: number, intent: HeroIntent, level: Level): HeroEvent[] {
    const events: HeroEvent[] = []
    this.prev.copy(this.pos)
    this.dashCd = Math.max(0, this.dashCd - dt)
    this.iframes = Math.max(0, this.iframes - dt)
    this.boltCd = Math.max(0, this.boltCd - dt)
    this.comboWindow = Math.max(0, this.comboWindow - dt)
    this.shieldCd = Math.max(0, this.shieldCd - dt)
    this.hurtFlash = Math.max(0, this.hurtFlash - dt)
    this.noPowerCd = Math.max(0, this.noPowerCd - dt)
    this.boltPose = Math.max(0, this.boltPose - dt)
    this.novaPose = Math.max(0, this.novaPose - dt)
    this.power = Math.min(this.maxPower, this.power + this.stats.powerRegen * dt)
    if (!this.alive) return events

    // Dash (highest priority, cancels attacks).
    if (intent.dash && this.dashCd <= 0 && this.dashT <= 0) {
      this.dashDir.copy(intent.move.lengthSq() > 0.01 ? intent.move : this.tmp.set(-Math.sin(this.facing), 0, -Math.cos(this.facing))).setY(0).normalize()
      tuning.activate('dash')
      this.dashT = CONFIG.superDungeon.dashDuration
      this.dashCd = this.stats.dashCooldown
      this.iframes = Math.max(this.iframes, 0.3)
      this.attackT = 0
      this.pendingHit = -1
      this.facing = Math.atan2(-this.dashDir.x, -this.dashDir.z)
      events.push({ type: 'dash', dir: this.dashDir.clone() })
    }
    // Jump: short input buffer + coyote time so presses just before landing still count.
    this.jumpBuf = intent.jump ? 0.14 : Math.max(0, this.jumpBuf - dt)
    const grounded = this.y <= 0 && this.vy <= 0
    this.coyote = grounded ? 0.1 : Math.max(0, this.coyote - dt)
    if (this.jumpBuf > 0 && this.coyote > 0 && this.dashT <= 0) {
      tuning.activate('jump')
      this.vy = CONFIG.superDungeon.jumpImpulse
      this.y = Math.max(this.y, 0.001)
      this.jumpBuf = 0
      this.coyote = 0
      events.push({ type: 'jump' })
    }
    // Melee combo.
    if (intent.attack && this.attackT <= 0 && this.dashT <= 0) {
      this.combo = this.comboWindow > 0 ? (this.combo + 1) % 3 : 0
      this.attackDur = COMBO_TIMES[this.combo]
      this.attackT = this.attackDur
      this.comboWindow = this.attackDur + 0.38
      this.pendingHit = COMBO_HIT_AT[this.combo]
      this.pendingIndex = this.combo
      this.pendingDir.copy(intent.aim)
      this.facing = Math.atan2(-intent.aim.x, -intent.aim.z)
      this.impulse.addScaledVector(intent.aim, this.combo === 2 ? 7 : 4.5)
      events.push({ type: 'swing' })
    }
    if (this.pendingHit >= 0) {
      this.pendingHit -= dt
      if (this.pendingHit < 0) events.push({ type: 'melee', index: this.pendingIndex, dir: this.pendingDir.clone() })
    }
    this.attackT = Math.max(0, this.attackT - dt)
    // Power bolt (hold to fire).
    if (intent.bolt && this.boltCd <= 0 && this.dashT <= 0 && this.attackT <= 0.05) {
      if (this.power >= this.stats.boltCost) {
        this.power -= this.stats.boltCost
        this.boltCd = 0.3
        this.boltPose = 0.22
        this.facing = Math.atan2(-intent.aim.x, -intent.aim.z)
        events.push({ type: 'bolt', dir: intent.aim.clone() })
      } else if (this.noPowerCd <= 0) {
        this.noPowerCd = 0.8
        events.push({ type: 'nopower' })
      }
    }
    // Super Nova.
    if (intent.nova) {
      if (this.power >= NOVA_COST) {
        this.power -= NOVA_COST
        this.novaPose = 0.45
        this.iframes = Math.max(this.iframes, 0.35)
        events.push({ type: 'nova' })
      } else if (this.noPowerCd <= 0) {
        this.noPowerCd = 0.8
        events.push({ type: 'nopower' })
      }
    }

    // Movement.
    let speed = this.stats.moveSpeed * CONFIG.superDungeon.moveSpeedMultiplier * this.slow
    this.sprinting = intent.sprint && intent.move.lengthSq() > 0.25 && this.attackT <= 0 && this.boltPose <= 0 && this.dashT <= 0
    if (this.sprinting) speed *= CONFIG.superDungeon.sprintMultiplier
    if (this.attackT > 0) speed *= 0.3
    if (this.boltPose > 0) speed *= 0.6
    const v = this.tmp.set(0, 0, 0)
    if (this.dashT > 0) {
      this.dashT -= dt
      v.copy(this.dashDir).multiplyScalar(CONFIG.superDungeon.dashSpeed)
    } else {
      v.copy(intent.move).multiplyScalar(speed)
      if (intent.move.lengthSq() > 0.01 && this.attackT <= 0 && this.boltPose <= 0) {
        const target = Math.atan2(-intent.move.x, -intent.move.z)
        let d = target - this.facing
        d = Math.atan2(Math.sin(d), Math.cos(d))
        this.facing += d * Math.min(1, dt * 16)
      }
    }
    v.add(this.impulse)
    this.impulse.multiplyScalar(Math.exp(-dt * 9))
    this.pos.addScaledVector(v, dt)
    level.collide(this.pos, HERO_RADIUS)
    this.speedNow = Math.hypot(this.pos.x - this.prev.x, this.pos.z - this.prev.z) / dt
    this.stride += this.speedNow * dt
    // Vertical (jumps and vent launches).
    if (this.y > 0 || this.vy > 0) {
      this.vy -= GRAVITY * dt
      this.y = Math.max(0, this.y + this.vy * dt)
      if (this.y === 0) {
        events.push({ type: 'land', impact: -this.vy })
        this.vy = 0
      }
    }
    return events
  }

  launch(v: number): void {
    this.vy = Math.max(this.vy, v)
  }

  // Animation edge detection (render-side, so gameplay stays untouched).
  private lastT = -1
  private lastAttackT = 0
  private lastDashT = 0
  private lastBolt = 0
  private lastNova = 0
  private step0 = 0

  /** Interpolated pose + clip-driven animation (legacy procedural pose as fallback). */
  render(alpha: number, t: number): void {
    const r = this.rig
    r.root.position.lerpVectors(this.prev, this.pos, alpha)
    r.root.position.y = this.y
    r.body.rotation.y = this.facing
    const dt = this.lastT < 0 ? 0 : Math.min(0.1, Math.max(0, t - this.lastT))
    this.lastT = t
    const moving = Math.min(1, this.speedNow / 6)
    if (r.char) this.animate(dt, t, moving)
    else if (r.legacy) this.legacyPose(t, moving)
    const glowing = this.attackT > 0 || this.boltPose > 0 || this.novaPose > 0
    r.handL.visible = glowing && (this.combo !== 0 || this.novaPose > 0)
    r.handR.visible = glowing
    r.barrier.visible = this.shieldReady
    if (r.barrier.visible) {
      r.barrier.scale.setScalar(1 + Math.sin(t * 3) * 0.03)
      ;(r.barrier.material as THREE.ShaderMaterial).uniforms.uTime.value = t
    }
    r.aura.scale.setScalar(1 + Math.sin(t * 4) * 0.05)
    this.lastAttackT = this.attackT
    this.lastDashT = this.dashT
    this.lastBolt = this.boltPose
    this.lastNova = this.novaPose
  }

  /** Brief landing-pose window after touching down (render side). */
  landT = 0
  private wasAir = false
  /** Footstep phase crossings, consumed by the game for dust puffs. */
  footstep = false

  private animate(dt: number, t: number, moving: number): void {
    const c = this.rig.char!
    const newSwing = this.attackT > this.lastAttackT + 1e-4
    const newDash = this.dashT > this.lastDashT + 1e-4
    const newBolt = this.boltPose > this.lastBolt + 1e-4
    const newNova = this.novaPose > this.lastNova + 1e-4
    const air = this.y > 0.05
    if (this.wasAir && !air) this.landT = 0.3
    this.wasAir = air
    this.landT = Math.max(0, this.landT - dt)
    if (!this.alive) {
      c.play('Death01', { fade: 0.15, loop: false, duration: 1.3 })
    } else if (this.dashT > 0 || (c.current === 'Roll' && !c.finished() && this.attackT <= 0 && this.boltPose <= 0)) {
      c.play('Roll', { fade: 0.06, loop: false, duration: 0.48, force: newDash, from: 0.08 })
    } else if (this.novaPose > 0) {
      c.play('Jump_Land', { fade: 0.05, loop: false, duration: 0.5, force: newNova })
    } else if (this.attackT > 0) {
      const clip = this.combo === 0 ? 'Punch_Jab' : this.combo === 1 ? 'Punch_Cross' : 'Sword_Attack'
      const dur = this.combo === 2 ? 0.58 : this.attackDur + 0.2
      c.play(clip, { fade: 0.05, loop: false, duration: dur, force: newSwing, from: this.combo === 2 ? 0.12 : 0.08 })
    } else if (this.boltPose > 0) {
      c.play('Spell_Simple_Shoot', { fade: 0.06, loop: false, duration: 0.5, force: newBolt, from: 0.1 })
    } else if (this.y > 0 && this.vy > 2 && c.current !== 'Jump_Loop') {
      c.play('Jump_Start', { fade: 0.06, loop: false, duration: 0.3, from: 0.25 })
    } else if (this.y > 0.15) {
      c.play('Jump_Loop', { fade: 0.15 })
    } else if (this.landT > 0 && this.speedNow < 2) {
      c.play('Jump_Land', { fade: 0.05, loop: false, duration: 0.35, from: 0.1 })
    } else if (this.speedNow > 0.6) {
      if (this.sprinting || this.speedNow > 10) c.play('Sprint_Loop', { fade: 0.18, speed: Math.min(1.4, Math.max(0.8, this.speedNow / 10.5)) })
      else c.play('Jog_Fwd_Loop', { fade: 0.18, speed: Math.min(1.6, Math.max(0.75, this.speedNow / 5)) })
    } else {
      c.play('Idle_Loop', { fade: 0.25 })
    }
    c.update(dt)
    // Hit flash + invulnerability shimmer through the shader, not by hiding the mesh.
    c.flash = this.hurtFlash > 0 ? 0.35 + 0.35 * Math.sin(t * 40) : 0
    c.time = t
    this.footstep = false
    if (moving > 0.3 && this.y < 0.05 && (c.current === 'Jog_Fwd_Loop' || c.current === 'Sprint_Loop')) {
      const ph = Math.floor(c.progress() * 2)
      if (ph !== this.step0) this.footstep = true
      this.step0 = ph
    }
    this.rig.root.updateMatrixWorld(true)
    this.rig.cape?.update(dt, this.facing, t, this.speedNow)
  }

  private legacyPose(t: number, moving: number): void {
    const r = this.rig.legacy!
    const s = Math.sin(this.stride * 1.35)
    r.legL.rotation.x = s * 0.8 * moving
    r.legR.rotation.x = -s * 0.8 * moving
    r.armL.rotation.set(-s * 0.6 * moving, 0, 0.12)
    r.armR.rotation.set(s * 0.6 * moving, 0, -0.12)
    r.body.position.y = Math.abs(Math.cos(this.stride * 1.35)) * 0.08 * moving
    r.body.rotation.x = moving * 0.12
    if (this.dashT > 0) {
      r.body.rotation.x = 0.55
      r.armL.rotation.x = 1.2
      r.armR.rotation.x = 1.2
    }
    if (this.attackT > 0) {
      const p = 1 - this.attackT / this.attackDur
      const punch = Math.sin(Math.min(1, p * 1.6) * Math.PI)
      if (this.combo === 0) r.armR.rotation.set(-Math.PI / 2 * punch - 0.1, 0.2 * punch, -0.12)
      else if (this.combo === 1) r.armL.rotation.set(-Math.PI / 2 * punch - 0.1, -0.2 * punch, 0.12)
      else {
        r.armR.rotation.set(-Math.PI * 0.95 * punch, 0, -0.1)
        r.armL.rotation.set(-Math.PI * 0.95 * punch, 0, 0.1)
      }
    }
    if (this.boltPose > 0) r.armR.rotation.set(-Math.PI / 2, 0, -0.05)
    if (this.novaPose > 0) {
      r.armL.rotation.set(-Math.PI, 0, 0.6)
      r.armR.rotation.set(-Math.PI, 0, -0.6)
    }
    if (r.cape) r.cape.rotation.x = -(0.15 + moving * 0.9 + (this.dashT > 0 ? 0.5 : 0) + Math.sin(t * 7) * 0.05 * (0.4 + moving))
    r.body.visible = !(this.hurtFlash > 0 && Math.floor(t * 20) % 2 === 0)
  }
}
