import * as THREE from 'three'
import { ClipPoseCache } from './clipPose'
import type { HunterState } from './hunter'
import { STANCE_SCALE, SWORD_SCALE, type ClipName, type HunterModel } from './hunterModel'
import type { Knock } from './monsters/monster'

/**
 * Hunter animation: catalog clips give the body its organic weight (locomotion with synced
 * phases, rolls, flinches, falls, crouches, riding), then procedural layers put the greatsword
 * choreography on top — spine bend/twist, a torso "stance frame", two-bone arm IK onto the grip
 * with proper hand orientation, and a sheath-to-stance blend so every attack starts as a draw.
 * The cape is a small verlet cloth that collides with the body.
 */

export type StancePose = { grip: THREE.Vector3; q: THREE.Quaternion; twist: number; bend: number; crouch: number; left?: THREE.Vector3 }

export type AnimInput = {
  state: HunterState
  stateT: number
  speed: number
  grounded: boolean
  riding: boolean
  mounted: boolean
  knock: Knock
  thrown: boolean
  /** 0..1 progress through the dodge. */
  dodgeK: number
  /** Knockdown: seconds before getting up begins (state time), or -1 if not applicable. */
  getUpAt: number
  stance: StancePose
  carry: StancePose
  glow: number
  time: number
}

const LOCO: { clip: ClipName; speed: number }[] = [
  { clip: 'Walk_Loop', speed: 1.7 },
  { clip: 'Jog_Fwd_Loop', speed: 4.4 },
  { clip: 'Sprint_Loop', speed: 7.0 },
]
const NO_IK: HunterState[] = ['dodge', 'hit', 'down', 'faint', 'air', 'hook']

const _v = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _v3 = new THREE.Vector3()
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _c = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()
const _q3 = new THREE.Quaternion()
const _qa = new THREE.Quaternion()
const _qb = new THREE.Quaternion()
const _qh = new THREE.Quaternion()
const _e = new THREE.Euler()
const _m = new THREE.Matrix4()
const _m2 = new THREE.Matrix4()
const _s = new THREE.Vector3()
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const tri = (a: number, b: number, c: number, x: number) => (x <= a || x >= c ? 0 : x < b ? smooth(a, b, x) : 1 - smooth(b, c, x))
const dampK = (rate: number, dt: number) => 1 - Math.exp(-rate * dt)

/** Rotate a bone by a world-space rotation, keeping its parent. */
function rotateWorld(bone: THREE.Object3D, rot: THREE.Quaternion): void {
  bone.getWorldQuaternion(_q3)
  _q3.premultiply(rot)
  setWorldQuaternion(bone, _q3)
}
function setWorldQuaternion(bone: THREE.Object3D, q: THREE.Quaternion): void {
  if (bone.parent) {
    bone.parent.getWorldQuaternion(_q2)
    bone.quaternion.copy(_q2.invert().multiply(q))
  } else bone.quaternion.copy(q)
  bone.updateMatrixWorld(true)
}

export class HunterAnimator {
  readonly mixer: THREE.AnimationMixer
  private readonly actions = new Map<ClipName, THREE.AnimationAction>()
  private readonly weights = new Map<ClipName, number>()
  private readonly target = new Map<ClipName, number>()
  private drawn = 0
  private leftW = 0
  private phase = 0
  private pelvisRest = new THREE.Vector3()
  private lastRoot = new THREE.Vector3(1e9, 0, 0)
  private readonly clothSpheres: { bone: THREE.Object3D; offset: THREE.Vector3; r: number; world: THREE.Vector3 }[]
  /** Clip pose snapshot: stops procedural layers compounding when the mixer skips a bone. */
  private readonly clipPose: ClipPoseCache

  constructor(private readonly M: HunterModel) {
    this.mixer = new THREE.AnimationMixer(M.body)
    for (const [name, clip] of M.clips) {
      const a = this.mixer.clipAction(clip)
      a.play()
      a.setEffectiveWeight(0)
      a.enabled = true
      this.actions.set(name, a)
      this.weights.set(name, name === 'Idle_Loop' ? 1 : 0)
    }
    this.clipPose = new ClipPoseCache(M.body, M.clips.values())
    M.root.updateMatrixWorld(true)
    M.bones.pelvis.getWorldPosition(this.pelvisRest)
    M.root.worldToLocal(this.pelvisRest)
    const B = M.bones
    this.clothSpheres = [
      { bone: B.spine3, offset: new THREE.Vector3(0, -0.04, 0.03), r: 0.14 },
      { bone: B.spine2, offset: new THREE.Vector3(0, 0, 0.0), r: 0.155 },
      { bone: B.spine1, offset: new THREE.Vector3(0, 0, 0), r: 0.16 },
      { bone: B.pelvis, offset: new THREE.Vector3(0, -0.05, 0), r: 0.18 },
      { bone: B.thighL, offset: new THREE.Vector3(0, -0.2, 0), r: 0.11 },
      { bone: B.thighR, offset: new THREE.Vector3(0, -0.2, 0), r: 0.11 },
      { bone: B.calfL, offset: new THREE.Vector3(0, -0.12, 0), r: 0.08 },
      { bone: B.calfR, offset: new THREE.Vector3(0, -0.12, 0), r: 0.08 },
    ].map(s => ({ ...s, offset: this.boneLocalOffset(s.bone, s.offset), world: new THREE.Vector3() }))
  }

  /** Convert a model-space offset at bind pose into the bone's local space. */
  private boneLocalOffset(bone: THREE.Object3D, modelOffset: THREE.Vector3): THREE.Vector3 {
    const w = bone.getWorldPosition(new THREE.Vector3()).add(modelOffset)
    return bone.worldToLocal(w)
  }

  private want(name: ClipName, w: number): void {
    if (this.actions.has(name)) this.target.set(name, (this.target.get(name) ?? 0) + w)
  }

  private setTime(name: ClipName, t: number): void {
    const a = this.actions.get(name)
    if (!a) return
    a.timeScale = 0
    a.time = Math.min(Math.max(0, t), a.getClip().duration - 1e-3)
  }

  update(dt: number, I: AnimInput): void {
    const M = this.M
    this.target.clear()
    const crouchW = Math.min(1, Math.max(0, I.stance.crouch * 1.8))
    let rate = 12
    switch (I.state) {
      case 'move':
      case 'drink': {
        const sp = I.speed
        const idle = 1 - smooth(0.12, 0.9, sp)
        const walk = tri(0.12, 1.7, 4.2, sp)
        const jog = sp < 1.7 ? 0 : sp < 4.2 ? smooth(1.7, 4.2, sp) : 1 - smooth(6.0, 8.2, sp)
        const sprint = smooth(6.0, 8.2, sp)
        const drawnIdle = this.drawn > 0.5 ? 1 : 0
        this.want(drawnIdle ? 'Sword_Idle' : 'Idle_Loop', idle)
        this.want('Walk_Loop', walk)
        this.want('Jog_Fwd_Loop', jog)
        this.want('Sprint_Loop', sprint)
        // Phase-synced locomotion: one shared normalised phase, stride blended by weight.
        let sw = 0
        let stride = 0
        for (const l of LOCO) {
          const w = l.clip === 'Walk_Loop' ? walk : l.clip === 'Jog_Fwd_Loop' ? jog : sprint
          const a = this.actions.get(l.clip)
          if (!a) continue
          sw += w
          stride += w * l.speed * a.getClip().duration
        }
        if (sw > 1e-3) this.phase = (this.phase + (dt * sp) / (stride / sw)) % 1
        for (const l of LOCO) this.setTime(l.clip, this.phase * (this.actions.get(l.clip)?.getClip().duration ?? 1))
        break
      }
      case 'attack':
      case 'charge':
      case 'victory':
      case 'stun':
        this.want('Sword_Idle', 1 - crouchW)
        this.want('Crouch_Idle_Loop', crouchW)
        break
      case 'dodge':
        rate = 30
        this.want('Roll', 1)
        this.setTime('Roll', 0.1 + I.dodgeK * 1.22)
        break
      case 'hit':
        rate = 30
        if (I.knock === 'back') {
          this.want('Hit_Head', 1)
          this.setTime('Hit_Head', I.stateT * 0.9)
        } else {
          this.want('Hit_Chest', 1)
          this.setTime('Hit_Chest', I.stateT)
        }
        break
      case 'down':
        if (I.getUpAt >= 0 && I.stateT > I.getUpAt) {
          // Push up off the ground: the fall played back quickly, handing over to a crouch
          // (a straight fade to idle made the body float upright through the floor).
          rate = 22
          const u = I.stateT - I.getUpAt
          const toCrouch = smooth(0.12, 0.34, u)
          this.want('Death01', 1 - toCrouch)
          this.want('Crouch_Idle_Loop', toCrouch)
          this.setTime('Death01', Math.max(0.55, 2.3 - u * 5))
        } else {
          rate = 20
          this.want('Death01', 1)
          this.setTime('Death01', Math.min(I.stateT * 1.3, 2.3))
        }
        break
      case 'faint':
        rate = 20
        this.want('Death01', 1)
        this.setTime('Death01', Math.min(I.stateT, 2.35))
        break
      case 'air':
      case 'hook':
        this.want('Jump_Loop', 1)
        break
      case 'mounted':
        this.want(I.riding ? 'Driving_Loop' : 'Crouch_Idle_Loop', 1)
        break
      default:
        this.want('Idle_Loop', 1)
    }
    // Damp and normalise weights (under-weighted blends would pull toward the bind pose).
    let sum = 0
    const k = dampK(rate, dt)
    for (const [name] of this.actions) {
      const w = this.weights.get(name)! + ((this.target.get(name) ?? 0) - this.weights.get(name)!) * k
      this.weights.set(name, w < 1e-3 ? 0 : w)
      sum += w
    }
    for (const [name, a] of this.actions) {
      const w = sum > 1e-4 ? this.weights.get(name)! / sum : name === 'Idle_Loop' ? 1 : 0
      a.setEffectiveWeight(w)
      if (!LOCO.some(l => l.clip === name) && !['Roll', 'Hit_Chest', 'Hit_Head', 'Death01'].includes(name)) a.timeScale = 1
    }
    // Undo last frame's procedural layers so a skipped (unchanged) binding holds the clip value.
    this.clipPose.restore()
    this.mixer.update(dt)
    this.clipPose.capture()

    // Lock horizontal root motion at the pelvis (the simulation owns displacement).
    const pelvis = M.bones.pelvis
    M.root.updateMatrixWorld(true)
    pelvis.getWorldPosition(_v)
    M.root.worldToLocal(_v)
    _v.x = this.pelvisRest.x
    _v.z = this.pelvisRest.z
    M.root.localToWorld(_v)
    if (pelvis.parent) {
      pelvis.parent.worldToLocal(_v)
      pelvis.position.copy(_v)
    }

    // Pivot for thrown spins and heavy knock-backs.
    let px = 0
    if (I.state === 'air' && I.thrown) px = -I.stateT * 6
    M.pivot.rotation.set(px, 0, 0)
    M.root.updateMatrixWorld(true)

    // Spine layering: the stance bend/twist spread over three vertebrae.
    const rootQ = M.root.getWorldQuaternion(_qh)
    const st = I.stance
    _e.set(st.bend / 3, st.twist / 3, 0, 'YXZ')
    _q.setFromEuler(_e)
    _q.premultiply(rootQ).multiply(_q2.copy(rootQ).invert())
    for (const b of [M.bones.spine1, M.bones.spine2, M.bones.spine3]) rotateWorld(b, _q)
    // Keep the head looking where the hunter is going.
    _e.set(-st.bend * 0.45, -st.twist * 0.55, 0, 'YXZ')
    _q.setFromEuler(_e)
    _q.premultiply(rootQ).multiply(_q2.copy(rootQ).invert())
    rotateWorld(M.bones.head, _q)

    // Stance frame at the shoulders (stance coordinates are scaled to the mannequin's reach).
    const S = STANCE_SCALE
    const frameQ = new THREE.Quaternion().setFromEuler(_e.set(st.bend, st.twist, 0, 'YXZ')).premultiply(rootQ)
    const shoulders = M.bones.upperL.getWorldPosition(_a).add(M.bones.upperR.getWorldPosition(_b)).multiplyScalar(0.5)
    const origin = _v2.set(0, -0.5 * S, 0).applyQuaternion(frameQ).add(shoulders)
    const toWorld = (p: THREE.Vector3, out: THREE.Vector3) => out.copy(p).multiplyScalar(S).applyQuaternion(frameQ).add(origin)

    // Sword: blend sheath (on the back) and stance (in the hands) by how drawn it is.
    const drawnTarget = NO_IK.includes(I.state) ? 0 : smooth(0.03, 0.2, st.grip.distanceTo(I.carry.grip) + (1 - Math.abs(st.q.dot(I.carry.q))) * 0.6)
    // Draw fast (attacks start as draws), sheathe at a readable pace.
    this.drawn += (drawnTarget - this.drawn) * dampK(drawnTarget > this.drawn ? 16 : 7, dt)
    if (Math.abs(drawnTarget - this.drawn) < 1e-3) this.drawn = drawnTarget
    const leftTarget = NO_IK.includes(I.state) ? 0 : st.left ? 1 : this.drawn
    this.leftW += (leftTarget - this.leftW) * dampK(14, dt)
    const gripW = toWorld(st.grip, new THREE.Vector3())
    const stanceQ = new THREE.Quaternion().copy(frameQ).multiply(st.q)
    _m.copy(M.bones.spine3.matrixWorld).multiply(M.sheath)
    const sheathP = new THREE.Vector3()
    const sheathQ = new THREE.Quaternion()
    _m.decompose(sheathP, sheathQ, _s)
    const swordP = sheathP.lerp(gripW, this.drawn)
    // Travel over the right shoulder rather than straight through the torso.
    const arc = 4 * this.drawn * (1 - this.drawn)
    if (arc > 1e-3) swordP.addScaledVector(_c.set(-0.16, 0.26, -0.06).applyQuaternion(rootQ), arc)
    const swordQ = sheathQ.slerp(stanceQ, this.drawn)
    _m2.compose(swordP, swordQ, _s.setScalar(SWORD_SCALE))
    _m.copy(M.root.matrixWorld).invert().multiply(_m2)
    _m.decompose(M.sword.position, M.sword.quaternion, M.sword.scale)
    M.sword.updateMatrixWorld(true)
    const axis = _v3.set(0, 1, 0).applyQuaternion(swordQ)

    // Arms: right hand at the grip, left lower on the handle or at its stance target.
    if (this.drawn > 0.01) this.solveArm('R', swordP, axis, this.drawn, rootQ)
    if (this.leftW > 0.01) {
      const left = st.left ? toWorld(st.left, new THREE.Vector3()) : swordP.clone().addScaledVector(axis, -0.19 * SWORD_SCALE)
      this.solveArm('L', left, st.left ? null : axis, this.leftW, rootQ)
    }

    // The sculpted blade glows through its whole albedo, so it idles dark and only ignites on charge.
    const glowTarget = M.swordGlow.userData.albedoGlow ? Math.max(0, I.glow - 0.3) * 0.45 : I.glow
    M.swordGlow.emissiveIntensity += (glowTarget - M.swordGlow.emissiveIntensity) * dampK(14, dt || 1 / 60)
    this.updateCape(dt, I)
  }

  /**
   * World-space two-bone IK for one arm, then orient the hand so the thumb runs up the handle.
   * Blended against the clip pose by `w`.
   */
  private solveArm(side: 'R' | 'L', target: THREE.Vector3, handle: THREE.Vector3 | null, w: number, rootQ: THREE.Quaternion): void {
    const B = this.M.bones
    const upper = side === 'R' ? B.upperR : B.upperL
    const lower = side === 'R' ? B.lowerR : B.lowerL
    const hand = side === 'R' ? B.handR : B.handL
    const s = side === 'R' ? -1 : 1
    _qa.copy(upper.quaternion)
    _qb.copy(lower.quaternion)
    const handClip = hand.quaternion.clone()
    const A = upper.getWorldPosition(new THREE.Vector3())
    // Fingers run from the wrist across the handle; the wrist sits just behind it.
    const f = target.clone().sub(A)
    if (handle) f.addScaledVector(handle, -f.dot(handle))
    if (f.lengthSq() < 1e-6) f.set(0, 0, 1).applyQuaternion(rootQ)
    f.normalize()
    const wrist = handle ? target.clone().addScaledVector(f, -0.075) : target.clone()
    const Bp = lower.getWorldPosition(new THREE.Vector3())
    const Cp = hand.getWorldPosition(new THREE.Vector3())
    const la = Bp.distanceTo(A)
    const lb = Cp.distanceTo(Bp)
    const dir = wrist.clone().sub(A)
    const d = Math.min(Math.max(dir.length(), 0.05), (la + lb) * 0.999)
    dir.normalize()
    const cosA = Math.min(1, Math.max(-1, (la * la + d * d - lb * lb) / (2 * la * d)))
    const sinA = Math.sqrt(1 - cosA * cosA)
    const pole = new THREE.Vector3(s * 0.35, -0.55, -0.5).applyQuaternion(rootQ)
    pole.addScaledVector(dir, -pole.dot(dir)).normalize()
    const elbow = A.clone().addScaledVector(dir, cosA * la).addScaledVector(pole, sinA * la)
    _q.setFromUnitVectors(_a.subVectors(Bp, A).normalize(), _b.subVectors(elbow, A).normalize())
    rotateWorld(upper, _q)
    lower.getWorldPosition(Bp)
    hand.getWorldPosition(Cp)
    const reach = A.clone().addScaledVector(dir, d)
    _q.setFromUnitVectors(_a.subVectors(Cp, Bp).normalize(), _b.subVectors(reach, Bp).normalize())
    rotateWorld(lower, _q)
    if (handle) {
      // Map rest (fingers ±X, thumb +Z in model space) onto (f, handle).
      const f0 = new THREE.Vector3(s, 0, 0).applyQuaternion(rootQ)
      const t0 = new THREE.Vector3(0, 0, 1).applyQuaternion(rootQ)
      const t = handle.clone().addScaledVector(f, -handle.dot(f)).normalize()
      const B0 = new THREE.Matrix4().makeBasis(f0, t0, new THREE.Vector3().crossVectors(f0, t0))
      const B1 = new THREE.Matrix4().makeBasis(f, t, new THREE.Vector3().crossVectors(f, t))
      const R = new THREE.Quaternion().setFromRotationMatrix(B1.multiply(B0.transpose()))
      const rest = side === 'R' ? this.M.handRest.R : this.M.handRest.L
      setWorldQuaternion(hand, R.multiply(rootQ.clone().multiply(rest)))
    }
    if (w < 0.999) {
      upper.quaternion.slerpQuaternions(_qa, upper.quaternion.clone(), w)
      lower.quaternion.slerpQuaternions(_qb, lower.quaternion.clone(), w)
      hand.quaternion.slerpQuaternions(handClip, hand.quaternion.clone(), w)
      upper.updateMatrixWorld(true)
    }
  }

  private updateCape(dt: number, I: AnimInput): void {
    const cape = this.M.cape
    const root = this.M.root
    root.updateMatrixWorld(true)
    for (const s of this.clothSpheres) s.world.copy(s.offset).applyMatrix4(s.bone.matrixWorld)
    const rootPos = root.getWorldPosition(_v)
    const teleport = rootPos.distanceTo(this.lastRoot) > 3
    this.lastRoot.copy(rootPos)
    const { cols, rows, points } = cape
    if (teleport) {
      // Re-hang the cape straight down from its anchors.
      for (let r = 0; r < rows; r += 1)
        for (let c = 0; c < cols; c += 1) {
          const a = points[c].anchor!.getWorldPosition(_a)
          const p = points[r * cols + c]
          p.p.set(a.x, a.y - r * cape.restY[c], a.z).addScaledVector(_b.set(0, 0, -1).applyQuaternion(root.quaternion), 0.05 + r * 0.01)
          p.prev.copy(p.p)
        }
    }
    const h = Math.min(dt, 1 / 30) / 2
    const gust = 0.6 + Math.sin(I.time * 1.3) * 0.4 + Math.sin(I.time * 3.7) * 0.2
    const wind = _c.set(1.2 * gust, 0, 0.5 * gust)
    for (let step = 0; step < 2 && h > 0; step += 1) {
      for (let i = 0; i < points.length; i += 1) {
        const pt = points[i]
        if (pt.pinned) {
          pt.anchor!.getWorldPosition(pt.p)
          pt.prev.copy(pt.p)
          continue
        }
        _a.subVectors(pt.p, pt.prev).multiplyScalar(0.965)
        pt.prev.copy(pt.p)
        pt.p.add(_a).addScaledVector(wind, h * h).y -= 9.8 * h * h
      }
      for (let it = 0; it < 4; it += 1) {
        for (let r = 0; r < rows; r += 1)
          for (let c = 0; c < cols; c += 1) {
            const i = r * cols + c
            if (c < cols - 1) this.constrain(points[i], points[i + 1], cape.restX * (1 + r * 0.03))
            if (r < rows - 1) this.constrain(points[i], points[i + cols], cape.restY[c])
          }
        // Long-range attachment: no point drifts further from its column anchor than the
        // rest length of the cloth above it, and nothing rises above the shoulders.
        for (let r = 1; r < rows; r += 1)
          for (let c = 0; c < cols; c += 1) {
            const pt = points[r * cols + c]
            const anchor = points[c].p
            const maxLen = r * cape.restY[c] * 1.03
            _a.subVectors(pt.p, anchor)
            const dd = _a.length()
            if (dd > maxLen) pt.p.copy(anchor).addScaledVector(_a, maxLen / dd)
            if (!(I.state === 'air' && I.thrown) && pt.p.y > anchor.y + 0.04) pt.p.y = anchor.y + 0.04
          }
        for (const pt of points) {
          if (pt.pinned) continue
          for (const s of this.clothSpheres) {
            _a.subVectors(pt.p, s.world)
            const dd = _a.length()
            const r = s.r + 0.02
            if (dd < r && dd > 1e-5) pt.p.addScaledVector(_a, (r - dd) / dd)
          }
        }
      }
    }
    const pos = cape.mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < points.length; i += 1) pos.setXYZ(i, points[i].p.x, points[i].p.y, points[i].p.z)
    pos.needsUpdate = true
    cape.mesh.geometry.computeVertexNormals()
    cape.mesh.geometry.computeBoundingSphere()
    cape.mesh.matrix.copy(root.matrixWorld).invert()
    cape.mesh.matrixWorldNeedsUpdate = true
  }

  private constrain(a: { p: THREE.Vector3; pinned: boolean }, b: { p: THREE.Vector3; pinned: boolean }, rest: number): void {
    _a.subVectors(b.p, a.p)
    const d = _a.length()
    if (d < 1e-6) return
    const diff = (d - rest) / d
    if (a.pinned && b.pinned) return
    if (a.pinned) b.p.addScaledVector(_a, -diff)
    else if (b.pinned) a.p.addScaledVector(_a, diff)
    else {
      a.p.addScaledVector(_a, diff * 0.5)
      b.p.addScaledVector(_a, -diff * 0.5)
    }
  }
}
