import * as THREE from 'three'
import { solveTwoBone } from '../ik'
import type { Leg, MonsterRig } from './rig'
import { refreshRigWorld } from './rig'

/**
 * Procedural monster animation. A `Pose` is a small set of high-level joint parameters; the
 * animator damps the current pose toward a target, applies it to the bone hierarchy, then plants
 * each foot with a stepping gait and two-bone IK so the colossus walks convincingly on uneven
 * terrain. `worldSpace=false` runs the gait on a virtual treadmill in model space (used by the
 * /enemies library so orientation edits rotate the model rigidly).
 */
export type Pose = {
  bodyY: number
  bodyPitch: number
  bodyRoll: number
  bodyYaw: number
  neckPitch: number
  neckYaw: number
  headPitch: number
  headYaw: number
  jaw: number
  tailYaw: number
  tailPitch: number
  tailWave: number
  frontLift: number
  frontReach: number
  flail: number
  plateGlow: number
  eyeGlow: number
  shake: number
}

export function restPose(): Pose {
  return { bodyY: 0, bodyPitch: 0, bodyRoll: 0, bodyYaw: 0, neckPitch: 0, neckYaw: 0, headPitch: 0, headYaw: 0, jaw: 0.04, tailYaw: 0, tailPitch: 0, tailWave: 1, frontLift: 0, frontReach: 0, flail: 0, plateGlow: 0, eyeGlow: 1, shake: 0 }
}

type Step = { from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number }

const _w = new THREE.Vector3()
const _home = new THREE.Vector3()
const _pred = new THREE.Vector3()
const _local = new THREE.Vector3()
const _free = new THREE.Vector3()
const _tuck = new THREE.Vector3()
const _pole = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _rootPos = new THREE.Vector3()

export type AnimatorUpdate = {
  /** 0..1 airborne weight: legs tuck up instead of reaching for the ground. */
  hover?: number
  /** Terrain height in world space; required when `worldSpace` is true. */
  ground?: (x: number, z: number) => number
  /** Treadmill speed (m/s, model forward) for model-space previews. */
  treadmill?: number
}

export class MonsterAnimator {
  readonly pose = restPose()
  readonly target = restPose()
  lambda = 7
  slopePitch = 0
  slopeRoll = 0
  time = 0
  onFootstep?: (world: THREE.Vector3, leg: Leg) => void
  private plants: THREE.Vector3[]
  private steps: (Step | null)[]
  private lastRoot = new THREE.Vector3()
  private hasLast = false
  private velocity = new THREE.Vector3()

  constructor(readonly rig: MonsterRig, readonly worldSpace: boolean) {
    this.plants = rig.legs.map(() => new THREE.Vector3())
    this.steps = rig.legs.map(() => null)
  }

  /** Snap the pose to the target and plant every foot at home. */
  reset(ground?: (x: number, z: number) => number): void {
    Object.assign(this.pose, this.target)
    this.hasLast = false
    this.applyPose()
    this.rig.root.updateMatrixWorld(true)
    this.rig.legs.forEach((leg, i) => {
      this.homeOf(leg, ground, this.plants[i])
      this.steps[i] = null
    })
  }

  private homeOf(leg: Leg, ground: ((x: number, z: number) => number) | undefined, out: THREE.Vector3): THREE.Vector3 {
    out.copy(leg.home)
    if (this.worldSpace) {
      this.rig.content.localToWorld(out)
      out.y = ground ? ground(out.x, out.z) : 0
    }
    return out
  }

  private gaitToWorld(p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    out.copy(p)
    return this.worldSpace ? out : this.rig.content.localToWorld(out)
  }

  private applyPose(): void {
    const { rig, pose: p } = this
    const P = rig.def.plan
    const t = this.time
    const breathe = Math.sin(t * 1.6) * 0.07
    const shake = p.shake > 0 ? Math.sin(t * 47) * 0.025 * p.shake : 0
    rig.body.position.set(0, rig.dims.hipHeight + p.bodyY + breathe, 0)
    rig.body.rotation.set(p.bodyPitch + this.slopePitch + shake, p.bodyYaw, p.bodyRoll + this.slopeRoll + shake * 0.6, 'YXZ')
    const n = rig.neck.length
    rig.neck.forEach((g, i) => {
      const sway = Math.sin(t * 0.9 - i * 0.7) * 0.02
      const rise = rig.authored ? 0 : i === 0 ? -P.neckRise * 1.2 : (P.neckRise * 0.2) / Math.max(1, n - 1)
      g.rotation.x = rise + p.neckPitch / n + sway
      g.rotation.y = p.neckYaw / n
    })
    rig.head.rotation.x = (rig.authored ? 0 : P.neckRise * 0.9) + p.headPitch
    rig.head.rotation.y = p.headYaw
    rig.jaw.rotation.x = p.jaw
    const tn = rig.tail.length
    rig.tail.forEach((g, i) => {
      g.rotation.y = p.tailYaw / tn + Math.sin(t * 1.2 - i * 0.55) * 0.06 * p.tailWave
      g.rotation.x = p.tailPitch / tn + (rig.authored ? 0 : i === 0 ? -0.2 : 0.025) + Math.sin(t * 0.8 - i * 0.4) * 0.015 * p.tailWave
    })
    rig.eyeMat.emissiveIntensity = 2.4 * p.eyeGlow
    rig.plateMat.emissiveIntensity = p.plateGlow
  }

  update(dt: number, opts: AnimatorUpdate = {}): void {
    const { rig, pose, target } = this
    this.time += dt
    const k = 1 - Math.exp(-this.lambda * dt)
    for (const key of Object.keys(pose) as (keyof Pose)[]) pose[key] += (target[key] - pose[key]) * k
    this.applyPose()
    rig.root.updateMatrixWorld(true)

    // Body velocity in gait space.
    if (this.worldSpace) {
      rig.root.getWorldPosition(_rootPos)
      if (this.hasLast && dt > 0) this.velocity.subVectors(_rootPos, this.lastRoot).divideScalar(dt)
      else this.velocity.set(0, 0, 0)
      this.lastRoot.copy(_rootPos)
      this.hasLast = true
    } else {
      this.velocity.set(0, 0, opts.treadmill ?? 0)
      // Ground slides backward under planted feet.
      for (let i = 0; i < this.plants.length; i += 1) if (!this.steps[i]) this.plants[i].z -= this.velocity.z * dt
    }
    const speed = Math.hypot(this.velocity.x, this.velocity.z)
    const stepDur = THREE.MathUtils.clamp(0.62 - speed * 0.024, 0.24, 0.62)
    const threshold = 1.2 + speed * 0.04
    const lift = THREE.MathUtils.clamp(0.5 + speed * 0.06, 0.5, 1.4)
    const hover = THREE.MathUtils.clamp(opts.hover ?? 0, 0, 1)
    const freeze = pose.flail > 0.5 || hover > 0.5

    rig.legs.forEach((leg, i) => {
      const plant = this.plants[i]
      const home = this.homeOf(leg, opts.ground, _home)
      const step = this.steps[i]
      if (step) {
        step.t += dt / step.dur
        if (step.t >= 1) {
          plant.copy(step.to)
          this.steps[i] = null
          this.onFootstep?.(this.gaitToWorld(plant, _w), leg)
        }
      } else if (!freeze) {
        _pred.copy(home)
        if (this.worldSpace) _pred.addScaledVector(this.velocity, stepDur * 0.95)
        else _pred.z += this.velocity.z * stepDur * 0.95
        if (this.worldSpace && opts.ground) _pred.y = opts.ground(_pred.x, _pred.z)
        const dist = Math.hypot(plant.x - _pred.x, plant.z - _pred.z)
        if (dist > 9) plant.copy(_pred)
        else if (dist > threshold && this.canStep(i)) this.steps[i] = { from: plant.clone(), to: _pred.clone(), t: 0, dur: stepDur * (0.9 + (i % 2) * 0.1) }
      }
      // Current foot position in gait space.
      const cur = this.steps[i]
      if (cur) {
        const e = cur.t * cur.t * (3 - 2 * cur.t)
        _w.lerpVectors(cur.from, cur.to, e)
        _w.y += Math.sin(Math.PI * cur.t) * lift
      } else _w.copy(plant)
      this.gaitToWorld(_w, _local)
      rig.body.worldToLocal(_local)
      // Free (raised / flailing) target in body space.
      const reach = leg.upper + leg.lower
      _free.copy(leg.rest)
      let wFree = 0
      if (leg.front && pose.frontLift > 0.001) {
        _free.y += reach * 0.55 * pose.frontLift
        _free.z += pose.frontReach * pose.frontLift * 2
        wFree = pose.frontLift
      }
      if (pose.flail > 0.001) {
        const ph = this.time * 6 + i * 1.7
        _free.set(leg.rest.x * 1.2, leg.rest.y * 0.55 + Math.sin(ph) * 0.7, leg.rest.z + Math.cos(ph * 0.9) * 1.1)
        wFree = Math.max(wFree, pose.flail)
      }
      if (hover > 0.001) {
        const ph = this.time * 2.2 + i
        _tuck.set(leg.rest.x * 1.1, leg.rest.y * 0.45 + Math.sin(ph) * 0.15, leg.rest.z + (leg.front ? reach * 0.35 : -reach * 0.45))
        _free.lerp(_tuck, hover / Math.max(hover, wFree, 1e-3))
        wFree = Math.max(wFree, hover)
      }
      _local.lerp(_free, THREE.MathUtils.clamp(wFree, 0, 1))
      if (leg.pole) _pole.copy(leg.pole)
      else _pole.set(leg.side * 0.25, -0.1, leg.front ? -1 : 1)
      solveTwoBone(leg.hip, leg.knee, _local, leg.upper, leg.lower, _pole)
      _q.copy(leg.hip.quaternion).multiply(leg.knee.quaternion).invert()
      leg.foot.quaternion.copy(_q)
    })
    rig.root.updateMatrixWorld(true)
    refreshRigWorld(rig)
  }

  /** A leg may lift only while its lateral and same-side neighbours are planted (trot gait). */
  private canStep(i: number): boolean {
    const legs = this.rig.legs
    const me = legs[i]
    for (let j = 0; j < legs.length; j += 1) {
      if (j === i || !this.steps[j]) continue
      const o = legs[j]
      if (me.gait !== undefined && o.gait !== undefined) {
        if (o.gait !== me.gait) return false
        continue
      }
      if (o.front === me.front || o.side === me.side) return false
    }
    return true
  }
}
