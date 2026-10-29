import * as THREE from 'three'
import { Physics, RAPIER } from '../engine/physics'
import { SleepManager } from '../engine/sleep'
import type { Vec3 } from './aim'
import { CONFIG, MATERIALS, type MaterialKind } from './config'
import type { LevelDef, PieceKind, PieceSpec } from './levels'

/**
 * The destruction simulation: builds a castle from level data into a Rapier world, turns
 * collisions into damage, breaks blocks into fragments, chains powder-barrel explosions and
 * decides when guards are knocked out. It is renderer-agnostic — `views` supplies the visible
 * objects (tests pass plain Object3Ds) — and reports everything that happened as events.
 *
 * Damage model: each step, a body's *unexpected* velocity change (what gravity alone would not
 * explain) is its jolt in m/s. Resting bodies feel nothing however heavy the load above them;
 * impacts, landings and blasts all register. Projectile contacts additionally use Rapier's
 * contact-force events, because a jammed block barely moves when struck yet should still crack.
 */
export type PieceViews = {
  create(spec: PieceSpec, fragment: boolean): THREE.Object3D
  ball(radius: number): THREE.Object3D
  /** Called when a piece's health drops (ratio = hp / maxHp). */
  damaged?(object: THREE.Object3D, ratio: number): void
  /** Guard was knocked out: switch to the dazed pose. */
  dazed?(object: THREE.Object3D): void
}

export type Piece = {
  id: number
  spec: PieceSpec
  kind: PieceKind
  body: RAPIER.RigidBody
  collider: RAPIER.Collider
  object: THREE.Object3D
  mass: number
  hp: number
  maxHp: number
  radius: number
  prevV: THREE.Vector3
  prevW: THREE.Vector3
  fragment: boolean
  alive: boolean
  /** Guards only. */
  startY: number
  tilt: number
  koAt: number
}

export type SimEvent =
  | { type: 'impact'; at: Vec3; kind: MaterialKind; dv: number; fromBall: boolean }
  | { type: 'break'; at: Vec3; kind: PieceKind; spec: PieceSpec; velocity: Vec3; fragment: boolean }
  | { type: 'explode'; at: Vec3; chain: number }
  | { type: 'guardDown'; at: Vec3; id: number }
  | { type: 'guardVanish'; at: Vec3; id: number }
  | { type: 'ballHit'; at: Vec3; speed: number; target: MaterialKind | 'ground'; first: boolean }

type Fade = { object: THREE.Object3D; t: number; from: number }
type PendingBlast = { at: THREE.Vector3; delay: number; chain: number }

const GROUND_SIZE = 240
const tmpV = new THREE.Vector3()
const tmpW = new THREE.Vector3()
const tmpQ = new THREE.Quaternion()

export class SiegeSim {
  /** Seeded RNG so a given sequence of shots replays identically (tests). */
  private seed = 0x9e3779b9
  private rng = (): number => {
    this.seed = (this.seed + 0x6d2b79f5) | 0
    let t = this.seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  readonly physics: Physics
  readonly sleep: SleepManager
  readonly root = new THREE.Group()
  readonly pieces = new Map<number, Piece>()
  private byCollider = new Map<number, Piece>()
  private events: SimEvent[] = []
  private fades: Fade[] = []
  private blasts: PendingBlast[] = []
  private nextId = 1
  private time = 0
  private readonly ground: RAPIER.Collider
  ball: { body: RAPIER.RigidBody; collider: RAPIER.Collider; object: THREE.Object3D; age: number; hit: boolean; prevSpeed: number } | null = null
  private oldBalls: { body: RAPIER.RigidBody; object: THREE.Object3D; age: number }[] = []
  /** Debris quality multiplier (low quality spawns fewer fragments). */
  debrisScale = 1

  constructor(readonly level: LevelDef, private readonly views: PieceViews, private readonly rules = CONFIG) {
    this.physics = new Physics({ gravity: rules.physics.gravity, solverIterations: rules.physics.solverIterations, contactForces: true })
    this.sleep = new SleepManager(this.physics.world, {
      linear: rules.sleep.linear,
      angular: rules.sleep.angular,
      settleSeconds: rules.sleep.settleSeconds,
      maxAwake: rules.sleep.maxAwake,
      budgets: { debris: rules.sleep.debrisBudget },
    })
    this.ground = this.physics.addStaticBox(new THREE.Vector3(0, -0.5, -20), new THREE.Vector3(GROUND_SIZE, 1, GROUND_SIZE), undefined, 0.95)
    for (const spec of level.pieces) this.addPiece(spec, false)
    this.physics.settleAsleep()
  }

  get guardsStanding(): number {
    let n = 0
    for (const p of this.pieces.values()) if (p.kind === 'guard' && p.alive && p.koAt < 0) n += 1
    return n
  }

  guards(): Piece[] {
    return [...this.pieces.values()].filter(p => p.kind === 'guard' && p.alive)
  }

  // ─── construction ───────────────────────────────────────────────────────

  private addPiece(spec: PieceSpec, fragment: boolean, velocity?: Vec3, spin?: Vec3): Piece {
    const mat = MATERIALS[spec.kind]
    const object = this.views.create(spec, fragment)
    object.position.set(...spec.pos)
    if (spec.rotY) object.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), spec.rotY)
    if (fragment && spin) object.quaternion.copy(tmpQ.set(spin.x, spin.y, spin.z, 1).normalize())
    const [sx, sy, sz] = spec.size
    let desc: RAPIER.ColliderDesc
    if (spec.shape === 'cyl') desc = RAPIER.ColliderDesc.cylinder(sy / 2, sx / 2)
    else if (spec.shape === 'cone') desc = RAPIER.ColliderDesc.cone(sy / 2, sx / 2)
    else desc = RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2)
    desc.setDensity(mat.density).setFriction(mat.friction).setRestitution(mat.restitution)
    const { body, collider } = this.physics.addDynamic(object, desc, {
      linearDamping: 0.02,
      angularDamping: spec.kind === 'guard' ? 0.4 : 0.12,
      solverIterations: spec.kind === 'stone' && !fragment ? 2 : 0,
    })
    if (velocity) body.setLinvel(velocity, true)
    if (fragment && spin) body.setAngvel({ x: spin.x * 6, y: spin.y * 6, z: spin.z * 6 }, true)
    const id = this.nextId++
    const piece: Piece = {
      id,
      spec,
      kind: spec.kind,
      body,
      collider,
      object,
      mass: body.mass(),
      hp: mat.hp,
      maxHp: mat.hp,
      radius: Math.max(sx, sy, sz) * 0.5,
      prevV: new THREE.Vector3(),
      prevW: new THREE.Vector3(),
      fragment,
      alive: true,
      startY: spec.pos[1],
      tilt: 0,
      koAt: -1,
    }
    if (velocity) piece.prevV.set(velocity.x, velocity.y, velocity.z)
    this.pieces.set(id, piece)
    this.byCollider.set(collider.handle, piece)
    this.root.add(object)
    this.sleep.track(body, fragment
      ? { tag: 'debris', lifetime: this.rules.sleep.debrisLifetime * (0.8 + this.rng() * 0.4), onExpire: () => this.removePiece(piece, true) }
      : { tag: spec.kind === 'guard' ? 'guard' : 'block' })
    return piece
  }

  /** Fire a stone ball. The previous ball is kept (rolling in the rubble) until the next one. */
  launch(origin: Vec3, velocity: Vec3): void {
    if (this.ball) this.retireBall()
    const r = this.rules.ball.radius
    const object = this.views.ball(r)
    object.position.set(origin.x, origin.y, origin.z)
    const desc = RAPIER.ColliderDesc.ball(r)
      .setDensity(MATERIALS.ball.density)
      .setFriction(MATERIALS.ball.friction)
      .setRestitution(MATERIALS.ball.restitution)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(40)
    const { body, collider } = this.physics.addDynamic(object, desc, { ccd: true, linearDamping: 0.0, angularDamping: 1.2 })
    body.setLinvel(velocity, true)
    body.setAngvel({ x: -6, y: 0, z: 0 }, true)
    this.root.add(object)
    this.sleep.track(body, { tag: 'projectile', neverForceSleep: true })
    this.ball = { body, collider, object, age: 0, hit: false, prevSpeed: Math.hypot(velocity.x, velocity.y, velocity.z) }
  }

  private retireBall(): void {
    if (!this.ball) return
    this.sleep.setNeverForceSleep(this.ball.body, false)
    this.oldBalls.push({ body: this.ball.body, object: this.ball.object, age: this.ball.age })
    this.ball = null
    while (this.oldBalls.length > 2) {
      const old = this.oldBalls.shift()!
      this.sleep.untrack(old.body)
      this.physics.removeBody(old.body)
      this.fades.push({ object: old.object, t: 0, from: 1 })
    }
  }

  // ─── simulation ─────────────────────────────────────────────────────────

  /** Advance one fixed step; returns the events that happened during it. */
  step(dt: number): SimEvent[] {
    this.events = []
    this.time += dt
    for (const b of this.blasts) b.delay -= dt
    const due = this.blasts.filter(b => b.delay <= 0)
    this.blasts = this.blasts.filter(b => b.delay > 0)
    for (const b of due) this.explode(b.at, b.chain)

    const ballPrevSpeed = this.ball ? this.ball.prevSpeed : 0
    this.physics.step(dt)
    this.sleep.step(dt)

    // Projectile contacts → direct damage and the "first hit" moment.
    const ballDv = new Map<Piece, number>()
    if (this.ball) {
      const bh = this.ball.collider.handle
      for (const e of this.physics.contactForceEvents) {
        if (e.collider1 !== bh && e.collider2 !== bh) continue
        const other = e.collider1 === bh ? e.collider2 : e.collider1
        const piece = this.byCollider.get(other)
        const at = this.ball.body.translation()
        if (!this.ball.hit && (piece || other === this.ground.handle)) {
          this.ball.hit = true
          this.events.push({ type: 'ballHit', at: { x: at.x, y: at.y, z: at.z }, speed: ballPrevSpeed, target: piece ? piece.kind === 'guard' ? 'guard' : piece.kind : 'ground', first: true })
        }
        if (!piece || !piece.alive) continue
        const factor = piece.kind === 'stone' ? 0.55 : 1
        const dv = Math.min((e.force * dt) / piece.mass, ballPrevSpeed * 1.25) * factor
        ballDv.set(piece, Math.max(ballDv.get(piece) ?? 0, dv))
      }
      const v = this.ball.body.linvel()
      this.ball.prevSpeed = Math.hypot(v.x, v.y, v.z)
      this.ball.age += dt
    }

    const breaks: Piece[] = []
    const g = this.rules.physics.gravity
    for (const p of this.pieces.values()) {
      if (!p.alive) continue
      const asleep = p.body.isSleeping()
      const v = p.body.linvel()
      const w = p.body.angvel()
      tmpV.set(v.x, v.y, v.z)
      tmpW.set(w.x, w.y, w.z)
      let jolt = 0
      if (!asleep) {
        const lin = Math.hypot(tmpV.x - p.prevV.x, tmpV.y - (p.prevV.y + g * dt), tmpV.z - p.prevV.z)
        const ang = tmpW.distanceTo(p.prevW) * p.radius * 0.5
        jolt = Math.max(lin, ang)
      }
      jolt = Math.max(jolt, ballDv.get(p) ?? 0)
      if (asleep) {
        p.prevV.set(0, 0, 0)
        p.prevW.set(0, 0, 0)
      } else {
        p.prevV.copy(tmpV)
        p.prevW.copy(tmpW)
      }
      const t = p.body.translation()
      if (t.y < this.rules.physics.killY) {
        if (p.kind === 'guard' && p.koAt < 0) this.knockOut(p)
        this.removePiece(p, false)
        continue
      }
      if (p.kind === 'guard') {
        this.stepGuard(p, jolt, dt)
        continue
      }
      if (p.fragment) continue
      const mat = MATERIALS[p.kind]
      if (jolt > 2.2) this.events.push({ type: 'impact', at: { x: t.x, y: t.y, z: t.z }, kind: p.kind, dv: jolt, fromBall: ballDv.has(p) })
      if (jolt > mat.minDv) {
        const before = p.hp
        p.hp -= jolt - mat.minDv
        if (p.hp <= 0) breaks.push(p)
        else if (before / p.maxHp > 0.55 && p.hp / p.maxHp <= 0.55) this.views.damaged?.(p.object, p.hp / p.maxHp)
      }
    }
    for (const p of breaks) this.breakPiece(p, 0)

    // Spent balls and fading debris.
    for (const b of this.oldBalls) b.age += dt
    if (this.ball && this.ball.age > this.rules.ball.lifetime) this.retireBall()
    return this.events
  }

  private stepGuard(p: Piece, jolt: number, dt: number): void {
    if (p.koAt >= 0) {
      if (this.time - p.koAt > this.rules.guard.vanish) {
        const t = p.body.translation()
        this.events.push({ type: 'guardVanish', at: { x: t.x, y: t.y, z: t.z }, id: p.id })
        this.removePiece(p, true)
      }
      return
    }
    if (p.body.isSleeping()) return
    const q = p.body.rotation()
    const upY = 1 - 2 * (q.x * q.x + q.z * q.z)
    p.tilt = upY < this.rules.guard.tiltUp ? p.tilt + dt : 0
    const dropped = p.startY - p.body.translation().y > this.rules.guard.fallDrop
    if (jolt > MATERIALS.guard.minDv || dropped || p.tilt > this.rules.guard.tiltSeconds) this.knockOut(p)
  }

  private knockOut(p: Piece): void {
    if (p.koAt >= 0) return
    p.koAt = this.time
    const t = p.body.translation()
    this.views.dazed?.(p.object)
    this.events.push({ type: 'guardDown', at: { x: t.x, y: t.y + 0.4, z: t.z }, id: p.id })
  }

  /** Destroy a piece: fragments for blocks, an explosion for powder. */
  private breakPiece(p: Piece, chain: number): void {
    if (!p.alive) return
    const t = p.body.translation()
    const v = p.body.linvel()
    const at = new THREE.Vector3(t.x, t.y, t.z)
    this.events.push({ type: 'break', at: { x: t.x, y: t.y, z: t.z }, kind: p.kind, spec: p.spec, velocity: { x: v.x, y: v.y, z: v.z }, fragment: p.fragment })
    const rot = p.body.rotation()
    this.removePiece(p, false)
    if (p.kind === 'powder') {
      this.blasts.push({ at, delay: chain === 0 ? 0 : this.rules.explosion.chainDelay, chain })
      return
    }
    this.spawnFragments(p, at, new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w), v)
  }

  private spawnFragments(p: Piece, at: THREE.Vector3, rot: THREE.Quaternion, v: Vec3): void {
    const mat = MATERIALS[p.kind]
    if (p.spec.shape !== 'box' || mat.fragments === 0 || this.debrisScale <= 0) return
    const size = new THREE.Vector3(...p.spec.size)
    // Split along the longest axis (planks snap in two); stone also splits the second axis.
    const axes = [0, 1, 2].sort((a, b) => size.getComponent(b) - size.getComponent(a))
    const splits = [1, 1, 1]
    splits[axes[0]] = size.getComponent(axes[0]) > 0.7 ? 2 : 1
    if (p.kind === 'stone' && size.getComponent(axes[1]) > 0.5) splits[axes[1]] = 2
    const count = splits[0] * splits[1] * splits[2]
    if (count === 1 && size.x * size.y * size.z < 0.08) return
    const piece = new THREE.Vector3(size.x / splits[0], size.y / splits[1], size.z / splits[2])
    const shrink = 0.9
    for (let i = 0; i < splits[0]; i += 1)
      for (let j = 0; j < splits[1]; j += 1)
        for (let k = 0; k < splits[2]; k += 1) {
          if (this.debrisScale < 1 && this.rng() > this.debrisScale) continue
          const local = new THREE.Vector3(
            (i + 0.5) * piece.x - size.x / 2,
            (j + 0.5) * piece.y - size.y / 2,
            (k + 0.5) * piece.z - size.z / 2,
          ).applyQuaternion(rot)
          const pos = at.clone().add(local)
          const spec: PieceSpec = {
            kind: p.kind,
            shape: 'box',
            style: p.spec.style,
            pos: [pos.x, pos.y, pos.z],
            size: [piece.x * shrink * (0.9 + this.rng() * 0.12), piece.y * shrink, piece.z * shrink * (0.9 + this.rng() * 0.12)],
          }
          const kick = local.clone().normalize().multiplyScalar(1.6 + this.rng() * 1.6)
          const frag = this.addPiece(spec, true, { x: v.x + kick.x, y: v.y + kick.y + 1.2, z: v.z + kick.z }, { x: this.rng() - 0.5, y: this.rng() - 0.5, z: this.rng() - 0.5 })
          frag.object.quaternion.copy(rot)
          frag.body.setRotation(rot, true)
          this.physics.snap(frag.body)
        }
  }

  /** Powder blast: push and damage everything nearby, knock out guards, chain other barrels. */
  explode(at: THREE.Vector3, chain = 0): void {
    const E = this.rules.explosion
    this.sleep.wakeInRadius(at, E.radius * 1.3)
    this.events.push({ type: 'explode', at: { x: at.x, y: at.y, z: at.z }, chain })
    const hits: { p: Piece; f: number }[] = []
    const push = (body: RAPIER.RigidBody, mass: number, blast: number, f: number) => {
      const t = body.translation()
      const dir = new THREE.Vector3(t.x - at.x, t.y - at.y + 0.9, t.z - at.z).normalize()
      const dv = E.strength * f * blast
      body.applyImpulse({ x: dir.x * dv * mass, y: dir.y * dv * mass, z: dir.z * dv * mass }, true)
      body.applyTorqueImpulse({ x: (this.rng() - 0.5) * mass * f * 3, y: (this.rng() - 0.5) * mass * f * 3, z: (this.rng() - 0.5) * mass * f * 3 }, true)
    }
    for (const p of this.pieces.values()) {
      if (!p.alive) continue
      const t = p.body.translation()
      const d = at.distanceTo(tmpV.set(t.x, t.y, t.z))
      if (d >= E.radius) continue
      const f = 1 - d / E.radius
      push(p.body, p.mass, MATERIALS[p.kind].blast, f)
      hits.push({ p, f })
    }
    for (const b of [this.ball?.body, ...this.oldBalls.map(o => o.body)]) {
      if (!b) continue
      const t = b.translation()
      const d = at.distanceTo(tmpV.set(t.x, t.y, t.z))
      if (d < E.radius) push(b, b.mass(), MATERIALS.ball.blast, 1 - d / E.radius)
    }
    for (const { p, f } of hits) {
      if (p.kind === 'guard') {
        if (f > 0.2) this.knockOut(p)
        continue
      }
      if (p.fragment) continue
      const dmg = E.damage * Math.pow(f, 1.3) * (p.kind === 'stone' ? 0.75 : 1)
      p.hp -= dmg
      if (p.hp <= 0) this.breakPiece(p, chain + 1)
      else if (p.hp / p.maxHp <= 0.55) this.views.damaged?.(p.object, p.hp / p.maxHp)
    }
  }

  private removePiece(p: Piece, fade: boolean): void {
    if (!p.alive) return
    p.alive = false
    this.sleep.untrack(p.body)
    this.byCollider.delete(p.collider.handle)
    this.physics.removeBody(p.body)
    this.pieces.delete(p.id)
    if (fade) this.fades.push({ object: p.object, t: 0, from: p.object.scale.x })
    else this.root.remove(p.object)
  }

  /** Visual-only: shrink out removed debris. `dt` is game time. */
  animate(dt: number): void {
    for (const f of this.fades) {
      f.t += dt / 0.35
      f.object.scale.setScalar(Math.max(0.001, f.from * (1 - f.t)))
    }
    for (const f of this.fades) if (f.t >= 1) this.root.remove(f.object)
    this.fades = this.fades.filter(f => f.t < 1)
  }

  /** True when the castle has come to rest (ignoring a slowly rolling ball). */
  settled(): boolean {
    return this.blasts.length === 0 && this.sleep.isSettled(1, ['projectile', 'debris'])
  }

  ballPosition(): THREE.Vector3 | null {
    if (!this.ball) return null
    const t = this.ball.body.translation()
    return new THREE.Vector3(t.x, t.y, t.z)
  }

  ballVelocity(): THREE.Vector3 | null {
    if (!this.ball) return null
    const v = this.ball.body.linvel()
    return new THREE.Vector3(v.x, v.y, v.z)
  }

  dispose(): void {
    this.sleep.clear()
    this.physics.dispose()
    this.root.clear()
  }
}
