import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'

export { RAPIER }

/** Initialise the Rapier WASM module once, before creating any `Physics`. */
let ready: Promise<void> | undefined
export function initPhysics(): Promise<void> {
  ready ??= RAPIER.init()
  return ready
}

type Binding = { body: RAPIER.RigidBody; object: THREE.Object3D; prev: THREE.Vector3; prevRot: THREE.Quaternion; cur: THREE.Vector3; curRot: THREE.Quaternion }

export type ContactForce = { collider1: number; collider2: number; force: number; maxForce: number; direction: { x: number; y: number; z: number } }

export type DynamicOptions = {
  linearDamping?: number
  angularDamping?: number
  ccd?: boolean
  /** Extra solver iterations for this body (tall stacks, heavy blocks). */
  solverIterations?: number
  userData?: unknown
}

export type WorldOptions = {
  gravity?: number
  /** Velocity solver iterations; more = stiffer stacks. Rapier default is 4. */
  solverIterations?: number
  /** Report contact-force events (needed for impact damage). */
  contactForces?: boolean
}

/**
 * Thin owner of one Rapier world. It steps at the loop's fixed rate and keeps dynamic/kinematic
 * bodies and their three.js objects in sync with render interpolation.
 *
 * Gameplay creates colliders through the helpers below instead of calling Rapier directly, so the
 * collider shape always matches the visible mesh size it was derived from.
 */
export class Physics {
  readonly world: RAPIER.World
  readonly events: RAPIER.EventQueue
  private bindings = new Map<number, Binding>()
  private forces: ContactForce[] = []
  private readonly contactForces: boolean

  constructor(options: WorldOptions | number = {}) {
    const o: WorldOptions = typeof options === 'number' ? { gravity: options } : options
    this.world = new RAPIER.World({ x: 0, y: o.gravity ?? -24, z: 0 })
    if (o.solverIterations) this.world.numSolverIterations = o.solverIterations
    this.events = new RAPIER.EventQueue(true)
    this.contactForces = o.contactForces ?? false
  }

  step(stepSeconds: number): void {
    for (const b of this.bindings.values()) {
      b.prev.copy(b.cur)
      b.prevRot.copy(b.curRot)
    }
    this.world.timestep = stepSeconds
    this.world.step(this.events)
    this.forces.length = 0
    if (this.contactForces) {
      this.events.drainContactForceEvents(e => {
        const d = e.maxForceDirection()
        this.forces.push({ collider1: e.collider1(), collider2: e.collider2(), force: e.totalForceMagnitude(), maxForce: e.maxForceMagnitude(), direction: { x: d.x, y: d.y, z: d.z } })
      })
    }
    for (const b of this.bindings.values()) {
      if (b.body.isSleeping()) continue
      const t = b.body.translation()
      const r = b.body.rotation()
      b.cur.set(t.x, t.y, t.z)
      b.curRot.set(r.x, r.y, r.z, r.w)
    }
  }

  /**
   * Put a freshly built structure to sleep as one consistent island: step once so contacts exist,
   * then sleep every dynamic body together. (Bodies created with `setSleeping(true)` move without
   * generating contacts in this Rapier build, and sleeping bodies one at a time drops contacts.)
   */
  settleAsleep(stepSeconds = 1 / 60, steps = 3): void {
    this.world.timestep = stepSeconds
    for (let i = 0; i < steps; i += 1) this.world.step(this.events)
    this.world.bodies.forEach(b => {
      if (b.isDynamic()) b.sleep()
    })
    for (const b of this.bindings.values()) this.snap(b.body)
  }

  /** Contact-force events reported by the last `step()` (above each collider's threshold). */
  get contactForceEvents(): readonly ContactForce[] {
    return this.forces
  }

  /** Copy body transforms to their objects, blending the last two steps by `alpha`. */
  sync(alpha: number): void {
    for (const b of this.bindings.values()) {
      b.object.position.lerpVectors(b.prev, b.cur, alpha)
      b.object.quaternion.slerpQuaternions(b.prevRot, b.curRot, alpha)
    }
  }

  /** Fixed box collider (level geometry). `size` is the full extent, matching BoxGeometry arguments. */
  addStaticBox(center: THREE.Vector3, size: THREE.Vector3, rotation?: THREE.Quaternion, friction = 0.9): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
      .setTranslation(center.x, center.y, center.z)
      .setFriction(friction)
    if (rotation) desc.setRotation(rotation)
    return this.world.createCollider(desc)
  }

  /** Fixed upright cylinder collider; matches CylinderGeometry(radius, radius, height). */
  addStaticCylinder(center: THREE.Vector3, radius: number, height: number, friction = 0.9): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cylinder(height / 2, radius).setTranslation(center.x, center.y, center.z).setFriction(friction)
    return this.world.createCollider(desc)
  }

  /** Sensor sphere that reports overlaps without physical response (pickups, triggers). */
  addSensorSphere(center: THREE.Vector3, radius: number): RAPIER.Collider {
    return this.world.createCollider(RAPIER.ColliderDesc.ball(radius).setTranslation(center.x, center.y, center.z).setSensor(true))
  }

  /** Kinematic body driven by gameplay (moving platforms, patrol drones), rendered with interpolation. */
  addKinematic(object: THREE.Object3D, collider: RAPIER.ColliderDesc): RAPIER.RigidBody {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(object.position.x, object.position.y, object.position.z),
    )
    this.world.createCollider(collider, body)
    this.bind(body, object)
    return body
  }

  /**
   * Dynamic body simulated by Rapier (blocks, debris, projectiles). The body starts at the
   * object's position and rotation; the collider's density sets its mass.
   */
  addDynamic(object: THREE.Object3D, collider: RAPIER.ColliderDesc, options: DynamicOptions | number = {}): { body: RAPIER.RigidBody; collider: RAPIER.Collider } {
    const o: DynamicOptions = typeof options === 'number' ? { linearDamping: options } : options
    const q = object.quaternion
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(object.position.x, object.position.y, object.position.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setLinearDamping(o.linearDamping ?? 0.05)
      .setAngularDamping(o.angularDamping ?? 0.1)
      .setCcdEnabled(o.ccd ?? false)
    if (o.solverIterations) desc.setAdditionalSolverIterations(o.solverIterations)
    if (o.userData !== undefined) desc.setUserData(o.userData as Record<string, unknown>)
    const body = this.world.createRigidBody(desc)
    const col = this.world.createCollider(collider, body)
    this.bind(body, object)
    return { body, collider: col }
  }

  bind(body: RAPIER.RigidBody, object: THREE.Object3D): void {
    const t = body.translation()
    const r = body.rotation()
    const cur = new THREE.Vector3(t.x, t.y, t.z)
    const curRot = new THREE.Quaternion(r.x, r.y, r.z, r.w)
    this.bindings.set(body.handle, { body, object, prev: cur.clone(), prevRot: curRot.clone(), cur, curRot })
    object.position.copy(cur)
    object.quaternion.copy(curRot)
  }

  /** Forget interpolation history after a teleport so the object does not streak across the map. */
  snap(body: RAPIER.RigidBody): void {
    const b = this.bindings.get(body.handle)
    if (!b) return
    const t = body.translation()
    const r = body.rotation()
    b.cur.set(t.x, t.y, t.z)
    b.curRot.set(r.x, r.y, r.z, r.w)
    b.prev.copy(b.cur)
    b.prevRot.copy(b.curRot)
  }

  /** Interpolated render transform of a bound body (for cameras that follow bodies). */
  renderPosition(body: RAPIER.RigidBody, alpha: number, out = new THREE.Vector3()): THREE.Vector3 {
    const b = this.bindings.get(body.handle)
    if (!b) {
      const t = body.translation()
      return out.set(t.x, t.y, t.z)
    }
    return out.lerpVectors(b.prev, b.cur, alpha)
  }

  removeBody(body: RAPIER.RigidBody): void {
    this.bindings.delete(body.handle)
    this.world.removeRigidBody(body)
  }

  get bodyCount(): number {
    return this.bindings.size
  }

  dispose(): void {
    this.bindings.clear()
    this.events.free()
    this.world.free()
  }
}
