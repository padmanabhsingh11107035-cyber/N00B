import * as THREE from 'three'
import { CATAPULT_BASE } from './layout'

/**
 * Camera director. Every mode produces a desired eye + look-at; the camera eases toward it with
 * mode-specific stiffness in *real* time (so the camera stays responsive during slow motion).
 * Screen shake uses a trauma model (shake ∝ trauma²) on top.
 *
 *  - intro:  sweeping fly-over from the castle back to the catapult at level start.
 *  - aim:    over-the-shoulder behind the catapult, following yaw, pulled in as power rises.
 *  - follow: chase the stone in flight.
 *  - impact: a vantage point beside the impact, slowly drifting while the castle collapses.
 *  - survey: free orbit around the castle (look input) to plan the next shot.
 *  - finale: slow orbit around the ruins for the results.
 */
export type CamMode = 'intro' | 'aim' | 'follow' | 'impact' | 'survey' | 'finale' | 'title'

export class CameraDirector {
  readonly camera: THREE.PerspectiveCamera
  mode: CamMode = 'title'
  private eye = new THREE.Vector3(0, 8, 14)
  private look = new THREE.Vector3(0, 3, -30)
  private goalEye = new THREE.Vector3()
  private goalLook = new THREE.Vector3()
  private stiffness = 4
  private t = 0
  private trauma = 0
  private fovKick = 0
  private baseFov: number
  private impactPoint = new THREE.Vector3()
  private impactSide = 1
  private orbit = { yaw: 0, pitch: 0.35, dist: 22 }
  /** Multiplier for shake/motion (reduced-motion setting). */
  motion = 1
  private castle = new THREE.Vector3(0, 3, -34)
  private ball: THREE.Vector3 | null = null
  private ballVel = new THREE.Vector3(0, 0, -1)

  constructor(aspect: number, fov = 52) {
    this.baseFov = fov
    this.camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 900)
    this.camera.position.copy(this.eye)
    this.camera.lookAt(this.look)
  }

  setCastle(center: THREE.Vector3): void {
    this.castle.copy(center)
  }

  set(mode: CamMode, snap = false): void {
    if (mode === this.mode && !snap) return
    this.mode = mode
    this.t = 0
    if (mode === 'survey') {
      const d = this.eye.clone().sub(this.castle)
      this.orbit.yaw = Math.atan2(d.x, d.z)
      this.orbit.pitch = 0.32
      this.orbit.dist = 24
    }
    if (snap) {
      this.computeGoal(0, { yaw: 0, power: 0 })
      this.eye.copy(this.goalEye)
      this.look.copy(this.goalLook)
    }
  }

  /** Point the impact camera at where the stone struck. */
  setImpact(at: THREE.Vector3, fromDir: THREE.Vector3): void {
    this.impactPoint.copy(at)
    // Choose the side that shows the castle broadside rather than end-on.
    this.impactSide = at.x - this.castle.x >= 0 ? 1 : -1
    if (Math.abs(at.x - this.castle.x) < 1.5) this.impactSide = fromDir.x >= 0 ? -1 : 1
  }

  trackBall(pos: THREE.Vector3 | null, vel: THREE.Vector3 | null): void {
    this.ball = pos ? (this.ball ?? new THREE.Vector3()).copy(pos) : null
    if (vel && vel.lengthSq() > 1) this.ballVel.copy(vel).normalize()
  }

  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount * this.motion)
  }

  kickFov(amount: number): void {
    this.fovKick += amount * this.motion
  }

  orbitInput(dx: number, dy: number, zoom: number): void {
    this.orbit.yaw -= dx * 1.4
    this.orbit.pitch = THREE.MathUtils.clamp(this.orbit.pitch + dy * 1.0, 0.06, 1.2)
    this.orbit.dist = THREE.MathUtils.clamp(this.orbit.dist + zoom, 10, 38)
  }

  private computeGoal(time: number, aim: { yaw: number; power: number }): void {
    const base = new THREE.Vector3(CATAPULT_BASE.x, CATAPULT_BASE.y, CATAPULT_BASE.z)
    switch (this.mode) {
      case 'title': {
        const a = time * 0.06 + 0.6
        this.goalEye.set(this.castle.x + Math.sin(a) * 26, 9 + Math.sin(time * 0.2) * 1.2, this.castle.z + Math.cos(a) * 26)
        this.goalLook.copy(this.castle).add(new THREE.Vector3(0, 1.5, 0))
        this.stiffness = 2
        break
      }
      case 'intro': {
        // 0 → 1 over ~3 s: circle the castle then glide back to the catapult.
        const k = Math.min(1, this.t / 3.2)
        const e = k * k * (3 - 2 * k)
        const a = 0.9 - e * 0.9
        const castleEye = new THREE.Vector3(this.castle.x + Math.sin(a) * 18, 7 + (1 - e) * 3, this.castle.z + Math.cos(a) * 18)
        const aimEye = this.aimEye(base, aim.yaw, 0)
        this.goalEye.lerpVectors(castleEye, aimEye, e * e)
        this.goalLook.lerpVectors(this.castle.clone().add(new THREE.Vector3(0, 2, 0)), this.aimLook(base, aim.yaw), e * e)
        this.stiffness = 6
        break
      }
      case 'aim': {
        this.goalEye.copy(this.aimEye(base, aim.yaw, aim.power))
        this.goalLook.copy(this.aimLook(base, aim.yaw))
        this.stiffness = 5
        break
      }
      case 'follow': {
        if (!this.ball) break
        const back = this.ballVel.clone().setY(this.ballVel.y * 0.4).normalize()
        this.goalEye.copy(this.ball).addScaledVector(back, -6.5).add(new THREE.Vector3(0, 2.2, 0))
        // Look ahead of the ball, biased toward the castle so the target is in frame.
        this.goalLook.copy(this.ball).addScaledVector(this.ballVel, 4).lerp(this.castle, 0.25)
        this.stiffness = 7
        break
      }
      case 'impact': {
        const drift = this.t * 0.05 * this.impactSide
        const a = this.impactSide * 0.95 + drift
        const focus = this.impactPoint.clone().lerp(this.castle, 0.45)
        focus.y = Math.max(2.2, focus.y * 0.6 + 1.2)
        const dist = 15.5 + Math.min(this.t, 4) * 0.5
        this.goalEye.set(focus.x + Math.sin(a) * dist, focus.y + 3.4, focus.z + Math.cos(a) * dist)
        this.goalLook.copy(focus)
        this.stiffness = this.t < 0.6 ? 3.2 : 2
        break
      }
      case 'survey': {
        const o = this.orbit
        this.goalEye.set(this.castle.x + Math.sin(o.yaw) * Math.cos(o.pitch) * o.dist, this.castle.y + Math.sin(o.pitch) * o.dist + 1, this.castle.z + Math.cos(o.yaw) * Math.cos(o.pitch) * o.dist)
        this.goalLook.copy(this.castle).add(new THREE.Vector3(0, 0.8, 0))
        this.stiffness = 5
        break
      }
      case 'finale': {
        const a = 0.7 + this.t * 0.12
        this.goalEye.set(this.castle.x + Math.sin(a) * 19, 7.5, this.castle.z + Math.cos(a) * 19)
        this.goalLook.copy(this.castle).add(new THREE.Vector3(0, 0.5, 0))
        this.stiffness = 1.6
        break
      }
    }
  }

  private aimEye(base: THREE.Vector3, yaw: number, power: number): THREE.Vector3 {
    const back = 8.8 - power * 1.4
    const side = 2.3
    const off = new THREE.Vector3(side, 5.3 + power * 0.25, back).applyAxisAngle(new THREE.Vector3(0, 1, 0), -yaw)
    return base.clone().add(off)
  }

  private aimLook(base: THREE.Vector3, yaw: number): THREE.Vector3 {
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw))
    const target = base.clone().addScaledVector(fwd, 26)
    target.y = 2.4
    return target
  }

  update(realDt: number, time: number, aim: { yaw: number; power: number }): void {
    this.t += realDt
    this.computeGoal(time, aim)
    const k = 1 - Math.exp(-this.stiffness * realDt)
    this.eye.lerp(this.goalEye, k)
    this.look.lerp(this.goalLook, Math.min(1, k * 1.25))
    // Keep the eye above the terrain/ground.
    if (this.eye.y < 0.8) this.eye.y = 0.8
    this.camera.position.copy(this.eye)
    this.camera.lookAt(this.look)
    // Shake.
    this.trauma = Math.max(0, this.trauma - realDt * 1.5)
    const s = this.trauma * this.trauma
    if (s > 0) {
      const n = (f: number, o: number) => Math.sin(time * f + o) * 0.6 + Math.sin(time * f * 2.3 + o * 1.7) * 0.4
      this.camera.position.x += n(47, 1) * s * 0.55
      this.camera.position.y += n(53, 2) * s * 0.45
      this.camera.position.z += n(41, 3) * s * 0.3
      this.camera.rotateZ(n(37, 4) * s * 0.035)
    }
    this.fovKick *= Math.exp(-realDt * 5)
    const fov = this.baseFov + this.fovKick + (this.mode === 'aim' ? -aim.power * 4 : 0)
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov
      this.camera.updateProjectionMatrix()
    }
  }

  /** Current eye position (listener position for audio panning). */
  get position(): THREE.Vector3 {
    return this.eye
  }
}
