import * as THREE from 'three'
import { CONFIG } from './config'
import { angleDelta, clamp, damp } from './noise'
import { createVitals, drainStamina, heal, regenRed, regenStamina, spendStamina, takeHit as vitalsHit, type Vitals } from './rules'
import { clampToArena, heightAt, resolveObstacles, WATER_LEVEL, WORLD } from './terrain'
import { BLADE, buildHunter, type HunterModel } from './hunterModel'
import { HunterAnimator } from './hunterAnim'
import type { Anchor, HitSphere } from './monsters/rig'
import type { Knock } from './monsters/monster'

/**
 * The hunter: locomotion, the greatsword moveset, dodge i-frames, reactions, the grappling hook,
 * climbing, mounted strikes, bracing and riding. Swords are animated with stance keyframes (grip
 * position + blade orientation in torso space) and both arms are solved onto the grip with IK.
 */
export type HunterState = 'move' | 'attack' | 'charge' | 'dodge' | 'hit' | 'down' | 'stun' | 'hook' | 'mounted' | 'air' | 'drink' | 'faint' | 'victory'

export type HunterIntent = {
  moveX: number
  moveY: number
  camYaw: number
  sprint: boolean
  attack: boolean
  heavyHeld: boolean
  heavy: boolean
  dodge: boolean
  grapple: boolean
  potion: boolean
}

export type HunterWorld = {
  anchors: Anchor[]
  /** Anchor index the reticle is on (-1 = none). */
  grappleTarget: number
  bucking: boolean
  monsterAlive: boolean
  pushSpheres: HitSphere[]
}

export type HunterEvent =
  | { type: 'swing'; heavy: boolean; level: number }
  | { type: 'step'; water: boolean; pos: THREE.Vector3 }
  | { type: 'dodge'; leap?: boolean }
  | { type: 'vault' }
  | { type: 'chargeLevel'; level: number }
  | { type: 'hookFire' }
  | { type: 'latch'; anchor: number }
  | { type: 'climb'; anchor: number }
  | { type: 'land'; hard: boolean; pos: THREE.Vector3 }
  | { type: 'drink' }
  | { type: 'thrown' }
  | { type: 'jumpOff' }
  | { type: 'rideStart' }
  | { type: 'noStamina' }
  | { type: 'exhausted' }
  | { type: 'brace' }
  | { type: 'mount'; anchor: number }

export type Swing = { id: string; motion: number; hit: boolean; mounted: boolean; heavy: boolean; level: number }

type Stance = { grip: THREE.Vector3; q: THREE.Quaternion; twist: number; bend: number; crouch: number; left?: THREE.Vector3 }

const _m = new THREE.Matrix4()
function stance(grip: [number, number, number], dir: [number, number, number], edge: [number, number, number], o: { twist?: number; bend?: number; crouch?: number; left?: [number, number, number] } = {}): Stance {
  const y = new THREE.Vector3(...dir).normalize()
  const z = new THREE.Vector3(...edge)
  z.addScaledVector(y, -z.dot(y))
  if (z.lengthSq() < 1e-6) z.set(0, 0, 1)
  z.normalize()
  const x = new THREE.Vector3().crossVectors(y, z)
  _m.makeBasis(x, y, z)
  return { grip: new THREE.Vector3(...grip), q: new THREE.Quaternion().setFromRotationMatrix(_m), twist: o.twist ?? 0, bend: o.bend ?? 0, crouch: o.crouch ?? 0, left: o.left ? new THREE.Vector3(...o.left) : undefined }
}

const ST = {
  carry: stance([-0.2, 0.3, 0.28], [-0.3, 0.75, -0.6], [-1, 0, 0]),
  ready: stance([-0.04, 0.2, 0.42], [0.05, 0.9, 0.35], [0, -0.35, 0.9], { crouch: 0.08 }),
  overUp: stance([-0.05, 0.8, 0.04], [0, 0.35, -1], [0, 1, 0.35], { bend: -0.15, twist: 0.1 }),
  overMid: stance([-0.02, 0.62, 0.42], [0, 1, 0.12], [0, -0.12, 1], { bend: 0.05 }),
  overDown: stance([0, -0.02, 0.62], [0, -0.35, 1], [0, -1, -0.35], { bend: 0.38, crouch: 0.24 }),
  sweepStart: stance([-0.42, 0.22, 0.18], [-1, 0.12, -0.35], [0.2, 0, 1], { twist: 0.65, crouch: 0.12 }),
  sweepMid: stance([0, 0.2, 0.55], [0, 0.08, 1], [1, 0, 0], { crouch: 0.16 }),
  sweepEnd: stance([0.38, 0.18, 0.3], [1, 0.1, -0.1], [0, 0, -1], { twist: -0.65, crouch: 0.12 }),
  riseStart: stance([-0.2, -0.2, 0.2], [-0.3, -0.55, -0.8], [0, -0.8, 0.55], { twist: 0.4, crouch: 0.3, bend: 0.25 }),
  riseLow: stance([-0.05, -0.22, 0.52], [0, -0.85, 0.52], [0, 0.5, 0.85], { crouch: 0.28, bend: 0.2 }),
  riseMid: stance([-0.04, 0.32, 0.58], [0, 0.3, 1], [0, 1, -0.3], { crouch: 0.1 }),
  riseEnd: stance([0.02, 0.82, 0.22], [0.1, 0.7, -0.7], [0, 0.7, 0.7], { bend: -0.2 }),
  charge: stance([-0.16, 0.72, -0.02], [-0.3, 0.5, -0.85], [0, 1, 0.3], { twist: 0.5, crouch: 0.16, bend: -0.05 }),
  chargeDown: stance([0, -0.12, 0.72], [0, -0.5, 1], [0, -1, -0.5], { bend: 0.45, crouch: 0.32 }),
  mountIdle: stance([-0.22, 0.05, 0.38], [-0.05, -0.95, 0.3], [0, 0, 1], { crouch: 0.5, bend: 0.35, left: [0.22, -0.55, 0.35] }),
  mountUp: stance([-0.1, 0.62, 0.28], [0, -0.9, 0.35], [0, 0, 1], { crouch: 0.35, bend: 0.1, left: [0.22, -0.5, 0.35] }),
  mountStab: stance([-0.05, -0.22, 0.42], [0, -1, 0.15], [0, 0, 1], { crouch: 0.55, bend: 0.5, left: [0.22, -0.55, 0.35] }),
  mountHigh: stance([0, 0.88, 0.14], [0, -0.8, 0.5], [0, 0, 1], { crouch: 0.25, bend: -0.1, left: [0.2, -0.3, 0.35] }),
  ride: stance([-0.25, 0.2, 0.3], [-0.5, 0.6, -0.6], [-1, 0, 0], { crouch: 0.6, bend: 0.3, left: [0.18, -0.35, 0.5] }),
  stun: stance([-0.1, -0.1, 0.45], [0, -1, 0.2], [0, 0, 1], { crouch: 0.3, bend: 0.3, left: [0.12, 0.72, 0.1] }),
  drink: stance([-0.2, 0.3, 0.28], [-0.3, 0.75, -0.6], [-1, 0, 0], { left: [0.06, 0.7, 0.2] }),
  aim: stance([-0.2, 0.3, 0.28], [-0.3, 0.75, -0.6], [-1, 0, 0], { left: [0.3, 0.5, 0.62] }),
  victory: stance([-0.22, 0.95, 0.12], [-0.1, 1, 0.1], [0, 0, 1], { bend: -0.15 }),
}

type Key = { t: number; s: Stance | null }
type AttackDef = { keys: Key[]; dur: number; active: [number, number]; motion: number; lunge: [number, number, number]; combo: number; next?: string; mounted?: boolean }

const ATTACKS: Record<string, AttackDef> = {
  overhead: { keys: [{ t: 0, s: null }, { t: 0.3, s: ST.overUp }, { t: 0.4, s: ST.overMid }, { t: 0.48, s: ST.overDown }, { t: 0.76, s: ST.overDown }, { t: 0.95, s: ST.ready }], dur: 0.95, active: [0.38, 0.52], motion: 0.48, lunge: [0.34, 0.5, 1.3], combo: 0.56, next: 'sweep' },
  sweep: { keys: [{ t: 0, s: null }, { t: 0.22, s: ST.sweepStart }, { t: 0.33, s: ST.sweepMid }, { t: 0.42, s: ST.sweepEnd }, { t: 0.62, s: ST.sweepEnd }, { t: 0.8, s: ST.ready }], dur: 0.8, active: [0.27, 0.44], motion: 0.36, lunge: [0.25, 0.42, 0.9], combo: 0.48, next: 'rising' },
  rising: { keys: [{ t: 0, s: null }, { t: 0.26, s: ST.riseStart }, { t: 0.34, s: ST.riseLow }, { t: 0.4, s: ST.riseMid }, { t: 0.47, s: ST.riseEnd }, { t: 0.7, s: ST.riseEnd }, { t: 0.9, s: ST.ready }], dur: 0.9, active: [0.32, 0.48], motion: 0.42, lunge: [0.3, 0.46, 1.0], combo: 0.54, next: 'overhead' },
  charged: { keys: [{ t: 0, s: null }, { t: 0.1, s: ST.overMid }, { t: 0.2, s: ST.chargeDown }, { t: 0.62, s: ST.chargeDown }, { t: 0.95, s: ST.ready }], dur: 0.95, active: [0.06, 0.24], motion: 0.62, lunge: [0.04, 0.2, 1.6], combo: 0.5, next: 'sweep' },
  stab: { keys: [{ t: 0, s: null }, { t: 0.16, s: ST.mountUp }, { t: 0.25, s: ST.mountStab }, { t: 0.5, s: ST.mountIdle }], dur: 0.5, active: [0.19, 0.3], motion: 0.3, lunge: [0, 0, 0], combo: 0.3, mounted: true },
  finisher: { keys: [{ t: 0, s: null }, { t: 0.12, s: ST.mountStab }, { t: 0.62, s: ST.mountStab }, { t: 0.9, s: ST.mountIdle }], dur: 0.9, active: [0.05, 0.18], motion: 1.4, lunge: [0, 0, 0], combo: 0.9, mounted: true },
  rideStab: { keys: [{ t: 0, s: null }, { t: 0.14, s: ST.mountUp }, { t: 0.22, s: ST.mountStab }, { t: 0.46, s: ST.ride }], dur: 0.46, active: [0.17, 0.27], motion: 0.18, lunge: [0, 0, 0], combo: 0.3, mounted: true },
  plunge: { keys: [{ t: 0, s: null }, { t: 0.14, s: ST.overUp }, { t: 0.3, s: ST.overMid }, { t: 9, s: ST.overMid }], dur: 9, active: [0.12, 9], motion: 0.8, lunge: [0, 0, 0], combo: 9 },
}

export const CHARGE_LEVELS = [0.55, 1.1, 1.65]
export const CHARGE_MOTION = [0.62, 0.9, 1.25, 1.6]

const _v = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _v3 = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()
const UP = new THREE.Vector3(0, 1, 0)
const smooth = (k: number) => k * k * (3 - 2 * k)

export class Hunter {
  readonly model: HunterModel
  readonly pos = new THREE.Vector3()
  readonly vel = new THREE.Vector3()
  vy = 0
  heading = 0
  grounded = true
  state: HunterState = 'move'
  stateT = 0
  vitals: Vitals = createVitals()
  potions = CONFIG.hunt.potions
  swing: Swing | null = null
  attackId = ''
  attackT = 0
  hitstop = 0
  chargeT = 0
  chargeLevel = 0
  /** Flow Evade reward: the next charge starts at level 1. */
  primed = false
  /** Set by a Spike Vault: the next plunge hits harder. Consumed by the game on impact. */
  vaultBoost = false
  private airIframe = 0
  mountAnchor = -1
  riding = false
  private rideQueuedT = 0
  bracing = false
  grappleCooldown = 0
  hookAnchor = -1
  hookPhase: 'shoot' | 'pull' = 'shoot'
  hookT = 0
  private hookFrom = new THREE.Vector3()
  private hookPos = new THREE.Vector3()
  knock: Knock = 'flinch'
  private knockDir = new THREE.Vector3()
  private queued: 'attack' | 'heavy' | 'dodge' | null = null
  private dodgeDir = new THREE.Vector3()
  private cur: Stance = { ...ST.carry, grip: ST.carry.grip.clone(), q: ST.carry.q.clone() }
  private from: Stance = { ...ST.carry, grip: ST.carry.grip.clone(), q: ST.carry.q.clone() }
  private walkPhase = 0
  /** Seconds the weapon stays drawn in the ready guard after an attack. */
  private readyT = 0
  private lastStep = 0
  private moveSpeed = 0
  private climb: { from: number; to: number; t: number } | null = null
  private drinkHealed = 0
  private airAttack = false
  private thrown = false
  private events: HunterEvent[] = []
  private rideYaw = 0
  exhausted = false
  sprinting = false
  time = 0

  private readonly anim: HunterAnimator
  constructor() {
    this.model = buildHunter()
    this.anim = new HunterAnimator(this.model)
  }

  get iframes(): boolean {
    if (this.state === 'dodge') return this.stateT > 0.04 && this.stateT < 0.38
    return this.state === 'down' || this.state === 'hook' || this.state === 'faint' || this.state === 'victory' || (this.state === 'air' && (this.stateT < 0.35 || this.airIframe > 0))
  }

  get mounted(): boolean {
    return this.mountAnchor >= 0
  }

  get targetable(): boolean {
    return this.state !== 'faint' && this.state !== 'victory' && !this.mounted
  }

  /** The current swing while its hit window is open (null otherwise or once it connected). */
  get activeSwing(): Swing | null {
    if (this.state !== 'attack' || !this.swing || this.swing.hit) return null
    const def = ATTACKS[this.attackId]
    return this.attackT >= def.active[0] && this.attackT <= def.active[1] ? this.swing : null
  }

  /** True around the hit window so the slash trail can be drawn. */
  get inSwingWindow(): boolean {
    if (this.state !== 'attack') return false
    const def = ATTACKS[this.attackId]
    return !def.mounted && this.attackT >= def.active[0] - 0.05 && this.attackT <= def.active[1] + 0.06
  }

  get attackName(): string {
    return this.state === 'attack' ? this.attackId : this.state === 'charge' ? 'charge' : ''
  }

  get chargeProgress(): number {
    return this.state === 'charge' ? clamp(this.chargeT / CHARGE_LEVELS[2], 0, 1) : 0
  }

  get isFinisherCharging(): boolean {
    return this.state === 'charge' && this.mountAnchor >= 0
  }

  reset(pos: THREE.Vector3, heading: number): void {
    this.pos.copy(pos)
    this.pos.y = heightAt(pos.x, pos.z)
    this.vel.set(0, 0, 0)
    this.vy = 0
    this.heading = heading
    this.grounded = true
    this.vitals = createVitals()
    this.potions = CONFIG.hunt.potions
    this.swing = null
    this.mountAnchor = -1
    this.riding = false
    this.hookAnchor = -1
    this.queued = null
    this.climb = null
    this.exhausted = false
    this.setState('move')
    this.model.hook.visible = false
    this.model.rope.visible = false
    Object.assign(this.cur, { ...ST.carry, grip: ST.carry.grip.clone(), q: ST.carry.q.clone() })
    this.sync(0)
  }

  /** Respawn at camp after fainting. */
  respawn(pos: THREE.Vector3, heading: number): void {
    const potions = this.potions
    this.reset(pos, heading)
    this.potions = potions
  }

  private setState(s: HunterState): void {
    // Keep the blade drawn in a guard for a moment after swinging, Monster Hunter style.
    if (s === 'move' && (this.state === 'attack' || this.state === 'charge')) this.readyT = 2.2
    else if (s !== 'move') this.readyT = 0
    this.state = s
    this.stateT = 0
  }

  private snapshot(): void {
    this.from.grip.copy(this.cur.grip)
    this.from.q.copy(this.cur.q)
    this.from.twist = this.cur.twist
    this.from.bend = this.cur.bend
    this.from.crouch = this.cur.crouch
    this.from.left = this.cur.left?.clone()
  }

  private blendTo(s: Stance, k: number): void {
    const c = this.cur
    c.grip.lerp(s.grip, k)
    c.q.slerp(s.q, k)
    c.twist += (s.twist - c.twist) * k
    c.bend += (s.bend - c.bend) * k
    c.crouch += (s.crouch - c.crouch) * k
    if (s.left) {
      if (!c.left) c.left = this.leftGrip(_v3).clone()
      c.left.lerp(s.left, k)
    } else if (c.left) {
      const lg = this.leftGrip(_v3)
      c.left.lerp(lg, Math.min(1, k * 1.5))
      if (c.left.distanceToSquared(lg) < 0.0004) c.left = undefined
    }
  }

  /** Left hand's grip point below the right hand, in torso space. */
  private leftGrip(out: THREE.Vector3): THREE.Vector3 {
    return out.set(0, -0.24, 0).applyQuaternion(this.cur.q).add(this.cur.grip)
  }

  private evalKeys(def: AttackDef, t: number): void {
    const keys = def.keys
    let i = 0
    while (i < keys.length - 2 && t >= keys[i + 1].t) i += 1
    const a = keys[i]
    const b = keys[i + 1]
    const k = clamp((t - a.t) / Math.max(1e-4, b.t - a.t), 0, 1)
    const sa = a.s ?? this.from
    const sb = b.s ?? this.from
    const e = smooth(k)
    this.cur.grip.lerpVectors(sa.grip, sb.grip, e)
    this.cur.q.slerpQuaternions(sa.q, sb.q, e)
    this.cur.twist = sa.twist + (sb.twist - sa.twist) * e
    this.cur.bend = sa.bend + (sb.bend - sa.bend) * e
    this.cur.crouch = sa.crouch + (sb.crouch - sa.crouch) * e
    const la = sa.left
    const lb = sb.left
    if (la || lb) {
      const pa = la ?? _v.set(0, -0.24, 0).applyQuaternion(sa.q).add(sa.grip)
      const pb = lb ?? _v2.set(0, -0.24, 0).applyQuaternion(sb.q).add(sb.grip)
      this.cur.left = (this.cur.left ?? new THREE.Vector3()).lerpVectors(pa, pb, e)
    } else this.cur.left = undefined
  }

  private startAttack(id: string, level = 0): void {
    const def = ATTACKS[id]
    this.snapshot()
    this.attackId = id
    this.attackT = 0
    this.queued = null
    const motion = id === 'charged' ? CHARGE_MOTION[level] : def.motion
    this.swing = { id, motion, hit: false, mounted: !!def.mounted, heavy: id === 'charged' || id === 'finisher' || id === 'plunge', level }
    this.setState('attack')
    this.events.push({ type: 'swing', heavy: this.swing.heavy, level })
  }

  private startCharge(): void {
    this.snapshot()
    this.chargeT = this.primed ? CHARGE_LEVELS[0] : 0
    this.chargeLevel = 0
    this.primed = false
    this.queued = null
    this.setState('charge')
  }

  private tryDodge(intent: HunterIntent): boolean {
    const v = spendStamina(this.vitals, CONFIG.hunter.dodgeCost)
    if (!v) {
      this.events.push({ type: 'noStamina' })
      return false
    }
    this.vitals = v
    const dir = this.inputDir(intent, _v)
    if (dir.lengthSq() < 0.01) dir.set(Math.sin(this.heading), 0, Math.cos(this.heading))
    this.dodgeDir.copy(dir).normalize()
    this.heading = Math.atan2(this.dodgeDir.x, this.dodgeDir.z)
    this.swing = null
    this.queued = null
    this.snapshot()
    // Sprinting into a dodge becomes a forward leap: airborne i-frames that clear ground attacks.
    const flat = Math.hypot(this.vel.x, this.vel.z)
    if (intent.sprint && this.state === 'move' && this.grounded && flat > CONFIG.hunter.sprintSpeed * 0.75) {
      this.vel.copy(this.dodgeDir).multiplyScalar(Math.max(flat, 9.5))
      this.vy = 7.2
      this.grounded = false
      this.airAttack = false
      this.airIframe = 0.55
      this.setState('air')
      this.events.push({ type: 'dodge', leap: true })
      return true
    }
    this.setState('dodge')
    this.events.push({ type: 'dodge' })
    return true
  }

  private inputDir(intent: HunterIntent, out: THREE.Vector3): THREE.Vector3 {
    const s = Math.sin(intent.camYaw)
    const c = Math.cos(intent.camYaw)
    // Camera forward = (sin yaw, 0, cos yaw); right = (-cos yaw, 0, sin yaw).
    out.set(s * intent.moveY - c * intent.moveX, 0, c * intent.moveY + s * intent.moveX)
    return out
  }

  /** Spike Vault: an erupting spike launches the hunter skyward; a boosted plunge is primed. */
  vault(): void {
    this.swing = null
    this.queued = null
    this.airAttack = false
    this.vaultBoost = true
    this.primed = true
    this.vy = 12.5
    this.vel.set(Math.sin(this.heading) * 3.5, 0, Math.cos(this.heading) * 3.5)
    this.grounded = false
    this.airIframe = 0.9
    this.snapshot()
    this.setState('air')
    this.events.push({ type: 'vault' })
  }
  /** Apply a monster hit. Returns false when i-frames evaded it. */
  applyHit(damage: number, knock: Knock, from: THREE.Vector3): 'hit' | 'evaded' | 'ignored' {
    if (this.state === 'faint' || this.state === 'victory') return 'ignored'
    if (this.iframes) return 'evaded'
    if (this.mounted) return 'ignored'
    this.vitals = vitalsHit(this.vitals, damage)
    this.swing = null
    this.queued = null
    this.knock = knock
    this.knockDir.set(this.pos.x - from.x, 0, this.pos.z - from.z)
    if (this.knockDir.lengthSq() < 1e-4) this.knockDir.set(-Math.sin(this.heading), 0, -Math.cos(this.heading))
    this.knockDir.normalize()
    this.snapshot()
    if (this.vitals.hp <= 0) {
      this.setState('faint')
      this.vy = knock === 'down' ? 6 : 0
      return 'hit'
    }
    if (knock === 'stun') this.setState('stun')
    else if (knock === 'down') {
      this.setState('down')
      this.vy = 7
      this.grounded = false
      this.heading = Math.atan2(-this.knockDir.x, -this.knockDir.z)
    } else this.setState('hit')
    return 'hit'
  }

  /** Thrown off the monster (buck without bracing, topple or stamina out). */
  throwOff(): void {
    if (this.mountAnchor < 0) return
    const a = this.lastAnchorUp
    this.mountAnchor = -1
    this.riding = false
    this.climb = null
    this.swing = null
    this.thrown = true
    this.vy = 6
    this.vel.set(a.x * 6 + Math.sin(this.heading + Math.PI / 2) * 6, 0, a.z * 6 + Math.cos(this.heading + Math.PI / 2) * 6)
    this.grounded = false
    this.snapshot()
    this.setState('air')
    this.events.push({ type: 'thrown' })
  }

  private lastAnchorUp = new THREE.Vector3(0, 1, 0)

  victory(): void {
    if (this.mountAnchor >= 0) this.throwOff()
    this.snapshot()
    this.setState('victory')
  }

  drinkPotion(): boolean {
    if (this.potions <= 0 || this.state !== 'move') return false
    this.potions -= 1
    this.drinkHealed = 0
    this.snapshot()
    this.setState('drink')
    this.events.push({ type: 'drink' })
    return true
  }

  update(dt: number, intent: HunterIntent, world: HunterWorld): HunterEvent[] {
    this.events.length = 0
    this.time += dt
    this.grappleCooldown = Math.max(0, this.grappleCooldown - dt)
    const sdt = this.hitstop > 0 ? dt * 0.06 : dt
    this.hitstop = Math.max(0, this.hitstop - dt)
    this.stateT += sdt
    this.sprinting = false
    this.bracing = false
    const H = CONFIG.hunter

    switch (this.state) {
      case 'move':
        this.updateMove(dt, intent, world)
        break
      case 'attack':
        this.updateAttack(sdt, dt, intent, world)
        break
      case 'charge':
        this.updateCharge(sdt, dt, intent, world)
        break
      case 'dodge': {
        const k = this.stateT / H.dodgeTime
        const sp = H.dodgeSpeed * (k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3)
        this.vel.copy(this.dodgeDir).multiplyScalar(sp)
        this.blendTo(ST.carry, 1 - Math.exp(-14 * dt))
        if (this.stateT >= H.dodgeTime) this.setState('move')
        break
      }
      case 'hit': {
        const dur = this.knock === 'back' ? 0.75 : 0.38
        const sp = this.knock === 'back' ? 7 * Math.max(0, 1 - this.stateT / 0.5) : 2 * Math.max(0, 1 - this.stateT / 0.25)
        this.vel.copy(this.knockDir).multiplyScalar(sp)
        // The blade is sheathed while staggered: hold the carry stance so it is not re-drawn on recovery.
        this.blendTo(ST.carry, 1 - Math.exp(-10 * dt))
        if (this.stateT >= dur) this.setState('move')
        break
      }
      case 'down': {
        if (!this.grounded) this.vel.copy(this.knockDir).multiplyScalar(7)
        else this.vel.multiplyScalar(Math.exp(-8 * dt))
        this.blendTo(ST.carry, 1 - Math.exp(-8 * dt))
        if (this.grounded && this.stateT > 0.9 && intent.dodge) {
          this.tryDodge(intent)
          break
        }
        if (this.grounded && this.stateT > 1.6) this.setState('move')
        break
      }
      case 'stun':
        this.vel.multiplyScalar(Math.exp(-10 * dt))
        this.blendTo(ST.stun, 1 - Math.exp(-10 * dt))
        if (this.stateT > 1.15) this.setState('move')
        break
      case 'drink': {
        this.blendTo(ST.drink, 1 - Math.exp(-10 * dt))
        this.walk(dt, intent, H.walkSpeed * 0.35, false)
        const heal0 = CONFIG.hunter.potionHeal
        if (this.stateT > 0.5) {
          const want = Math.min(heal0, ((this.stateT - 0.5) / 0.9) * heal0)
          this.vitals = heal(this.vitals, want - this.drinkHealed)
          this.drinkHealed = want
        }
        if (this.stateT > 1.4) this.setState('move')
        break
      }
      case 'hook':
        this.updateHook(dt, world)
        break
      case 'mounted':
        this.updateMounted(dt, intent, world)
        break
      case 'air':
        this.updateAir(dt, intent)
        break
      case 'faint':
        this.vel.multiplyScalar(Math.exp(-6 * dt))
        this.blendTo(ST.carry, 1 - Math.exp(-6 * dt))
        break
      case 'victory':
        this.vel.multiplyScalar(Math.exp(-8 * dt))
        this.blendTo(ST.victory, 1 - Math.exp(-5 * dt))
        break
    }

    // Stamina & recoverable health.
    if (!this.sprinting && !this.bracing && this.state !== 'mounted' && this.state !== 'charge') this.vitals = regenStamina(this.vitals, dt, H.staminaRegen * (this.state === 'move' ? 1 : 0.5))
    if (this.vitals.stamina <= 0.5 && !this.exhausted) {
      this.exhausted = true
      this.events.push({ type: 'exhausted' })
    }
    if (this.exhausted && this.vitals.stamina > 30) this.exhausted = false
    this.vitals = regenRed(this.vitals, dt, H.redRegen)

    this.integrate(dt, world)
    this.sync(dt)
    return this.events
  }

  private walk(dt: number, intent: HunterIntent, maxSpeed: number, allowTurn: boolean): void {
    const dir = this.inputDir(intent, _v)
    const mag = Math.min(1, dir.length())
    const want = _v2.copy(dir).multiplyScalar(maxSpeed)
    const k = 1 - Math.exp(-CONFIG.hunter.acceleration * dt)
    this.vel.x += (want.x - this.vel.x) * k
    this.vel.z += (want.z - this.vel.z) * k
    if (mag > 0.05 && allowTurn) {
      const target = Math.atan2(dir.x, dir.z)
      this.heading += angleDelta(this.heading, target) * (1 - Math.exp(-CONFIG.hunter.turnSpeed * dt))
    }
  }

  private updateMove(dt: number, intent: HunterIntent, world: HunterWorld): void {
    const H = CONFIG.hunter
    const moving = Math.hypot(intent.moveX, intent.moveY) > 0.1
    let speed = H.walkSpeed
    if (intent.sprint && moving && !this.exhausted && this.vitals.stamina > 0) {
      speed = H.sprintSpeed
      this.sprinting = true
      this.vitals = drainStamina(this.vitals, H.sprintDrain, dt)
    }
    const depth = WATER_LEVEL - heightAt(this.pos.x, this.pos.z)
    if (depth > 0.35) speed *= 0.7
    if (this.sprinting) this.readyT = 0
    this.readyT = Math.max(0, this.readyT - dt)
    // Weapon drawn: walk a little slower with the blade held in the ready guard.
    this.walk(dt, intent, this.readyT > 0 ? Math.min(speed, H.walkSpeed * 0.8) : speed, true)
    if (this.readyT > 0) this.blendTo(ST.ready, 1 - Math.exp(-8 * dt))
    else this.blendTo(ST.carry, 1 - Math.exp(-5 * dt))
    if (intent.dodge) {
      this.tryDodge(intent)
      return
    }
    if (intent.grapple && this.tryGrapple(world)) return
    if (intent.heavy) {
      this.startCharge()
      return
    }
    if (intent.attack) {
      this.startAttack('overhead')
      return
    }
    if (intent.potion) this.drinkPotion()
  }

  private updateAttack(sdt: number, dt: number, intent: HunterIntent, world: HunterWorld): void {
    const def = ATTACKS[this.attackId]
    this.attackT += sdt
    const t = this.attackT
    this.evalKeys(def, t)
    if (intent.attack) this.queued = 'attack'
    if (intent.heavy || (intent.heavyHeld && this.queued === null && t > def.combo && !def.mounted && this.attackId !== 'charged')) this.queued = intent.heavy ? 'heavy' : this.queued
    if (intent.dodge) this.queued = 'dodge'
    if (this.swing) this.swing.hit = this.swing.hit || false
    if (def.mounted) {
      this.stickToAnchor(world, dt)
      this.vitals = drainStamina(this.vitals, CONFIG.grapple.gripDrain, dt)
      if (!world.monsterAlive || this.vitals.stamina <= 0) {
        this.throwOff()
        return
      }
      if (world.bucking && !intent.sprint && this.stateT > 0.1) {
        this.throwOff()
        return
      }
    } else if (this.attackId === 'plunge') {
      if (this.grounded) {
        this.swing = null
        this.attackId = 'overhead'
        this.attackT = 0.5
        this.snapshot()
        this.events.push({ type: 'land', hard: true, pos: this.pos.clone() })
      }
      return
    } else {
      // Aim during the first moments, then lunge along the facing.
      const dir = this.inputDir(intent, _v)
      if (t < 0.14 && dir.lengthSq() > 0.01) this.heading += angleDelta(this.heading, Math.atan2(dir.x, dir.z)) * (1 - Math.exp(-14 * dt))
      const [l0, l1, dist] = def.lunge
      const sp = t > l0 && t < l1 ? dist / (l1 - l0) : 0
      this.vel.set(Math.sin(this.heading) * sp, 0, Math.cos(this.heading) * sp)
    }
    if (this.swing && (t < def.active[0] || t > def.active[1])) {
      if (t > def.active[1]) this.swing = null
    }
    if (t >= def.combo && this.queued) {
      const q = this.queued
      this.queued = null
      if (q === 'dodge') {
        if (def.mounted) this.jumpOff()
        else this.tryDodge(intent)
        return
      }
      if (def.mounted) {
        if (q === 'attack') this.startAttack(this.riding ? 'rideStab' : 'stab')
        else if (q === 'heavy' && !this.riding) this.startCharge()
        return
      }
      if (q === 'heavy') this.startCharge()
      else if (def.next) this.startAttack(def.next)
      return
    }
    if (t >= def.dur) {
      this.swing = null
      if (def.mounted) this.setState('mounted')
      else this.setState('move')
    }
  }

  private updateCharge(sdt: number, dt: number, intent: HunterIntent, world: HunterWorld): void {
    const mounted = this.mountAnchor >= 0
    if (mounted) {
      this.stickToAnchor(world, dt)
      this.vitals = drainStamina(this.vitals, CONFIG.grapple.gripDrain, dt)
      if ((world.bucking && !intent.sprint) || this.vitals.stamina <= 0 || !world.monsterAlive) {
        this.throwOff()
        return
      }
    }
    this.chargeT += sdt
    const target = mounted ? ST.mountHigh : ST.charge
    this.blendTo(target, 1 - Math.exp(-9 * sdt))
    const shake = this.chargeLevel >= 2 ? 0.012 : 0
    this.cur.grip.x += (Math.random() - 0.5) * shake
    if (!mounted) {
      this.vel.multiplyScalar(Math.exp(-10 * sdt))
      const dir = this.inputDir(intent, _v)
      if (dir.lengthSq() > 0.01) this.heading += angleDelta(this.heading, Math.atan2(dir.x, dir.z)) * (1 - Math.exp(-3 * sdt))
    }
    const lvl = CHARGE_LEVELS.filter(x => this.chargeT >= x * (mounted ? 0.75 : 1)).length
    if (lvl > this.chargeLevel) {
      this.chargeLevel = lvl
      this.events.push({ type: 'chargeLevel', level: lvl })
    }
    if (intent.dodge) {
      if (mounted) this.jumpOff()
      else this.tryDodge(intent)
      return
    }
    if (!intent.heavyHeld || this.chargeT > (mounted ? 1.6 : 2.4)) {
      if (mounted) {
        this.startAttack('finisher', this.chargeLevel)
        if (this.swing) this.swing.motion = 0.6 + this.chargeLevel * 0.35
      } else this.startAttack('charged', this.chargeLevel)
    }
  }

  private tryGrapple(world: HunterWorld): boolean {
    if (world.grappleTarget < 0 || this.grappleCooldown > 0 || !world.monsterAlive) return false
    const v = spendStamina(this.vitals, 8)
    if (!v) {
      this.events.push({ type: 'noStamina' })
      return false
    }
    this.vitals = v
    this.hookAnchor = world.grappleTarget
    this.hookPhase = 'shoot'
    this.hookT = 0
    this.launcherWorld(this.hookFrom)
    this.hookPos.copy(this.hookFrom)
    this.snapshot()
    this.setState('hook')
    this.events.push({ type: 'hookFire' })
    return true
  }

  private launcherWorld(out: THREE.Vector3): THREE.Vector3 {
    this.model.root.updateMatrixWorld(true)
    return this.model.launcher.getWorldPosition(out)
  }

  private updateHook(dt: number, world: HunterWorld): void {
    const a = world.anchors[this.hookAnchor]
    if (!a || !world.monsterAlive) {
      this.setState('air')
      return
    }
    this.hookT += dt
    this.blendTo(ST.aim, 1 - Math.exp(-16 * dt))
    const to = a.world
    this.heading += angleDelta(this.heading, Math.atan2(to.x - this.pos.x, to.z - this.pos.z)) * (1 - Math.exp(-12 * dt))
    if (this.hookPhase === 'shoot') {
      this.vel.multiplyScalar(Math.exp(-10 * dt))
      const d = this.hookFrom.distanceTo(to)
      const k = Math.min(1, (this.hookT * 70) / Math.max(1, d))
      this.hookPos.lerpVectors(this.hookFrom, to, k)
      if (k >= 1) {
        this.hookPhase = 'pull'
        this.hookT = 0
        this.grounded = false
        this.events.push({ type: 'latch', anchor: this.hookAnchor })
      }
    } else {
      this.hookPos.copy(to)
      const d = _v.subVectors(to, this.pos)
      const dist = d.length()
      const sp = Math.min(34, 12 + this.hookT * 60)
      if (dist < 1.1 || this.hookT > 1.6) {
        this.mountAt(this.hookAnchor)
        return
      }
      d.normalize()
      // Arc: lift slightly in the first half of the flight.
      this.vel.copy(d).multiplyScalar(sp)
      this.vy = d.y * sp + (dist > 6 ? 3 : 0)
      this.grounded = false
    }
  }

  private mountAt(i: number): void {
    this.mountAnchor = i
    this.riding = false
    this.climb = null
    this.hookAnchor = -1
    this.vel.set(0, 0, 0)
    this.vy = 0
    this.snapshot()
    this.setState('mounted')
    this.events.push({ type: 'mount', anchor: i })
  }

  private jumpOff(): void {
    if (this.mountAnchor < 0) return
    this.mountAnchor = -1
    this.riding = false
    this.climb = null
    this.swing = null
    this.thrown = false
    this.airAttack = false
    this.vy = 9
    this.vel.set(-Math.sin(this.heading) * 5, 0, -Math.cos(this.heading) * 5)
    this.grounded = false
    this.grappleCooldown = CONFIG.grapple.cooldown
    this.snapshot()
    this.setState('air')
    this.events.push({ type: 'jumpOff' })
  }

  private stickToAnchor(world: HunterWorld, dt: number): void {
    let p: THREE.Vector3
    let up: THREE.Vector3
    let bone: THREE.Object3D
    const anchors = world.anchors
    if (this.climb) {
      const a = anchors[this.climb.from]
      const b = anchors[this.climb.to]
      const k = smooth(clamp(this.climb.t, 0, 1))
      p = _v.lerpVectors(a.world, b.world, k)
      p.addScaledVector(_v2.lerpVectors(a.up, b.up, k), Math.sin(Math.PI * k) * 0.6)
      up = _v2.lerpVectors(a.up, b.up, k).normalize()
      bone = k < 0.5 ? a.bone : b.bone
    } else {
      const a = anchors[this.mountAnchor]
      p = _v.copy(a.world)
      up = _v2.copy(a.up)
      bone = a.bone
    }
    this.lastAnchorUp.copy(up)
    this.pos.copy(p)
    this.vel.set(0, 0, 0)
    this.vy = 0
    bone.getWorldQuaternion(_q)
    // Face along the bone's forward (toward the head), stay upright relative to the surface.
    const fwd = _v3.set(0, 0, 1).applyQuaternion(_q)
    this.heading = Math.atan2(fwd.x, fwd.z)
    this.surfaceUp.lerp(up, 1 - Math.exp(-12 * dt)).normalize()
  }

  surfaceUp = new THREE.Vector3(0, 1, 0)

  private updateMounted(dt: number, intent: HunterIntent, world: HunterWorld): void {
    const G = CONFIG.grapple
    const n = world.anchors.length
    if (!world.monsterAlive) {
      this.jumpOff()
      return
    }
    // Brace with the sprint key: required to survive a buck.
    if (intent.sprint) {
      this.bracing = true
      this.vitals = drainStamina(this.vitals, G.braceDrain, dt)
    } else this.vitals = drainStamina(this.vitals, G.gripDrain * (this.riding ? 0.6 : 1), dt)
    if (world.bucking && !this.bracing) {
      this.throwOff()
      return
    }
    if (this.vitals.stamina <= 0) {
      this.throwOff()
      return
    }
    if (this.climb) {
      this.climb.t += dt / 0.55
      if (this.climb.t >= 1) {
        this.mountAnchor = this.climb.to
        this.climb = null
        this.events.push({ type: 'climb', anchor: this.mountAnchor })
      }
    }
    this.stickToAnchor(world, dt)
    this.blendTo(this.riding ? ST.ride : ST.mountIdle, 1 - Math.exp(-10 * dt))
    if (this.riding) {
      this.rideYaw = intent.camYaw
      if (intent.attack) this.startAttack('rideStab')
      else if (intent.dodge) this.jumpOff()
      return
    }
    if (!this.climb) {
      // Climb toward the head (forward) or tail (back) along the anchor chain.
      if (intent.moveY > 0.5 && this.mountAnchor < n - 1) this.startClimb(this.mountAnchor + 1)
      else if (intent.moveY < -0.5 && this.mountAnchor > 0) this.startClimb(this.mountAnchor - 1)
    }
    if (intent.dodge) {
      this.jumpOff()
      return
    }
    if (intent.grapple) this.rideQueuedT = 0.8
    this.rideQueuedT = Math.max(0, this.rideQueuedT - dt)
    if (this.rideQueuedT > 0 && world.anchors[this.mountAnchor]?.ride && !this.climb) {
      this.rideQueuedT = 0
      this.riding = true
      this.events.push({ type: 'rideStart' })
      return
    }
    if (this.climb) return
    if (intent.heavy) this.startCharge()
    else if (intent.attack) this.startAttack('stab')
  }

  private startClimb(to: number): void {
    const v = spendStamina(this.vitals, CONFIG.grapple.climbCost)
    if (!v) return
    this.vitals = v
    this.climb = { from: this.mountAnchor, to, t: 0 }
  }

  /** Desired ride direction in world space from the stick/keys relative to the camera. */
  rideDirection(intent: HunterIntent): { x: number; z: number } | null {
    if (!this.riding) return null
    const d = this.inputDir(intent, _v)
    if (d.lengthSq() < 0.01) return null
    return { x: d.x, z: d.z }
  }

  private updateAir(dt: number, intent: HunterIntent): void {
    this.airIframe = Math.max(0, this.airIframe - dt)
    this.blendTo(ST.ready, 1 - Math.exp(-8 * dt))
    this.vel.multiplyScalar(Math.exp(-0.8 * dt))
    const dir = this.inputDir(intent, _v)
    this.vel.addScaledVector(dir, dt * 6)
    if (intent.attack && !this.airAttack && !this.thrown && this.stateT > 0.1) {
      this.airAttack = true
      this.vy = Math.min(this.vy, 2)
      this.startAttack('plunge')
      return
    }
    if (this.grounded) {
      const hard = this.thrown
      this.thrown = false
      this.events.push({ type: 'land', hard, pos: this.pos.clone() })
      if (hard) {
        this.knock = 'down'
        this.setState('down')
        this.stateT = 0.6
      } else this.setState('move')
    }
  }

  private integrate(dt: number, world: HunterWorld): void {
    if (this.mounted) return
    const H = CONFIG.hunter
    if (this.state === 'move' || this.state === 'drink') {
      // Friction when no input.
    }
    const flying = this.state === 'hook' && this.hookPhase === 'pull'
    this.pos.x += this.vel.x * dt
    this.pos.z += this.vel.z * dt
    const ground = heightAt(this.pos.x, this.pos.z)
    if (flying) {
      this.pos.y += this.vy * dt
      if (this.pos.y < ground) this.pos.y = ground
    } else if (!this.grounded || this.pos.y > ground + 0.05) {
      const g = this.state === 'attack' && this.attackId === 'plunge' ? H.gravity * 1.6 : H.gravity
      this.vy += g * dt
      this.pos.y += this.vy * dt
      if (this.pos.y <= ground) {
        this.pos.y = ground
        this.vy = 0
        this.grounded = true
      } else this.grounded = false
    } else {
      this.pos.y = ground
      this.vy = 0
      this.grounded = true
    }
    if (!flying) {
      resolveObstacles(this.pos, 0.45)
      clampToArena(this.pos, WORLD.arena)
      // Keep out of the monster's body when on foot.
      for (const s of world.pushSpheres) {
        if (s.part === 'tail' && s.radius < 0.9) continue
        const dy = this.pos.y + 0.9 - s.world.y
        if (Math.abs(dy) > s.radius + 0.9) continue
        const dx = this.pos.x - s.world.x
        const dz = this.pos.z - s.world.z
        const horiz = Math.sqrt(Math.max(0, (s.radius + 0.45) ** 2 - Math.max(0, Math.abs(dy) - 0.9) ** 2))
        const d = Math.hypot(dx, dz)
        if (d < horiz && d > 1e-4 && s.world.y - s.radius < this.pos.y + 1.7) {
          this.pos.x = s.world.x + (dx / d) * horiz
          this.pos.z = s.world.z + (dz / d) * horiz
        }
      }
    }
    // Footsteps.
    const sp = Math.hypot(this.vel.x, this.vel.z)
    this.moveSpeed = sp
    if (this.grounded && this.state === 'move' && sp > 0.5) {
      this.walkPhase += dt * (5 + sp * 1.05)
      const stepIdx = Math.floor(this.walkPhase / Math.PI)
      if (stepIdx !== this.lastStep) {
        this.lastStep = stepIdx
        this.events.push({ type: 'step', water: WATER_LEVEL - ground > 0.05, pos: this.pos.clone() })
      }
    } else if (this.state === 'move') this.walkPhase = damp(this.walkPhase, Math.round(this.walkPhase / Math.PI) * Math.PI, 8, dt)
  }

  /** Blade segment in world space. */
  bladeSegment(base: THREE.Vector3, tip: THREE.Vector3): void {
    this.model.sword.updateWorldMatrix(true, false)
    base.set(0, BLADE.base, 0).applyMatrix4(this.model.sword.matrixWorld)
    tip.set(0, BLADE.tip, 0).applyMatrix4(this.model.sword.matrixWorld)
  }

  hookWorld(): THREE.Vector3 | null {
    if (this.state !== 'hook') return null
    return this.hookPos
  }

  /** Pose the model from the simulation state. */
  sync(dt: number): void {
    const M = this.model
    M.root.position.copy(this.pos)
    const mounted = this.mounted
    if (mounted) {
      _q.setFromUnitVectors(UP, this.surfaceUp)
      _q2.setFromAxisAngle(UP, this.heading)
      M.root.quaternion.copy(_q).multiply(_q2)
    } else {
      this.surfaceUp.set(0, 1, 0)
      M.root.quaternion.setFromAxisAngle(UP, this.heading)
    }
    const glow = this.state === 'charge' ? 0.5 + this.chargeLevel * 1.1 + Math.sin(this.time * 20) * 0.2 * this.chargeLevel : this.swing?.heavy ? 1.6 : 0.3
    this.anim.update(dt, {
      state: this.state,
      stateT: this.stateT,
      speed: this.state === 'move' || this.state === 'drink' ? this.moveSpeed : 0,
      grounded: this.grounded,
      riding: this.riding,
      mounted,
      knock: this.knock,
      thrown: this.thrown,
      dodgeK: clamp(this.stateT / CONFIG.hunter.dodgeTime, 0, 1),
      getUpAt: this.state === 'down' && this.grounded ? 1.25 : -1,
      stance: this.cur,
      carry: ST.carry,
      glow,
      time: this.time,
    })
    // Grapple rope.
    const hook = this.hookWorld()
    if (hook) {
      M.root.updateMatrixWorld(true)
      const from = M.launcher.getWorldPosition(_v)
      M.hook.visible = true
      M.hook.position.copy(hook)
      M.hook.lookAt(from)
      M.hook.rotateY(Math.PI)
      const len = from.distanceTo(hook)
      M.rope.visible = len > 0.2
      M.rope.position.copy(from)
      M.rope.scale.set(1, len, 1)
      M.rope.quaternion.setFromUnitVectors(UP, _v2.subVectors(hook, from).normalize())
    } else {
      M.hook.visible = false
      M.rope.visible = false
    }
  }

  get rideCamYaw(): number {
    return this.rideYaw
  }
}
