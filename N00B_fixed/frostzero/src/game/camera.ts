import * as THREE from 'three'
import { CONFIG } from './config'

/**
 * Third-person chase camera. Locks to the rider's forward position (no lag jitter at high
 * speed), eases laterally and vertically, widens the FOV with speed and boosts, rolls into
 * carves and shakes on impacts. Speed lines are camera-space streaks that fade in with speed.
 */
const LINES = 130

export class ChaseCamera {
  readonly camera: THREE.PerspectiveCamera
  private readonly lines: THREE.LineSegments
  private readonly linePos: Float32Array
  private readonly seeds: Float32Array
  private readonly x = { v: 0 }
  private y = 0
  private fov: number = CONFIG.camera.fov
  private roll = 0
  private shake = 0
  private kick = 0
  private time = 0
  reducedMotion = false

  constructor() {
    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, innerWidth / innerHeight, 0.1, 2200)
    this.linePos = new Float32Array(LINES * 6)
    this.seeds = new Float32Array(LINES * 3)
    for (let i = 0; i < LINES; i += 1) {
      this.seeds[i * 3] = Math.random() * Math.PI * 2
      this.seeds[i * 3 + 1] = 1.6 + Math.random() * 3.2
      this.seeds[i * 3 + 2] = Math.random()
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3))
    this.lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xcff8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
    this.lines.frustumCulled = false
    this.camera.add(this.lines)
  }

  /** Impulses from gameplay events. */
  addShake(amount: number): void {
    if (!this.reducedMotion) this.shake = Math.min(1.2, this.shake + amount)
  }
  /** Current boost kick (0..1), used to pulse the speed blur. */
  get kickAmount(): number {
    return this.kick
  }
  addKick(amount: number): void {
    this.kick = Math.min(1, this.kick + amount)
  }

  snap(target: THREE.Vector3): void {
    this.x.v = target.x
    this.y = target.y
  }

  update(dt: number, target: THREE.Vector3, vx: number, speed01: number, airborne: boolean): void {
    const c = CONFIG.camera
    this.time += dt
    this.x.v += (target.x * 0.85 - this.x.v) * (1 - Math.exp(-dt * 7))
    this.y += (target.y - this.y) * (1 - Math.exp(-dt * (airborne ? 3.2 : 6)))
    // Closer and lower as speed builds: the ground rushing past right under the lens sells speed.
    const dist = c.distance * (1 - speed01 * 0.14) + this.kick * 1.4
    const cam = this.camera
    cam.position.set(this.x.v, this.y + c.height - speed01 * 0.25, target.z - dist)
    cam.lookAt(target.x * 0.9, this.y + 1.0, target.z + c.lookAhead)
    const motion = this.reducedMotion ? 0.3 : 1
    // Bank into the carve (world -x is screen right; rolling negative tilts the view right).
    this.roll += (vx * 0.012 * motion - this.roll) * (1 - Math.exp(-dt * 6))
    cam.rotateZ(this.roll)
    // High-frequency buzz from the snow at speed (grounded only).
    if (!airborne && !this.reducedMotion) {
      const b = 0.004 + speed01 * speed01 * 0.02
      cam.position.y += (Math.sin(this.time * 57) + Math.sin(this.time * 83) * 0.6) * b
      cam.position.x += Math.sin(this.time * 71) * b * 0.6
    }
    if (this.shake > 0.001) {
      const s = this.shake * this.shake * 0.35
      cam.position.x += (Math.random() - 0.5) * s
      cam.position.y += (Math.random() - 0.5) * s
      cam.rotateZ((Math.random() - 0.5) * s * 0.05)
      this.shake = Math.max(0, this.shake - dt * 2.4)
    }
    this.kick = Math.max(0, this.kick - dt * 1.6)
    const targetFov = c.fov + (c.fovMax - c.fov) * speed01 * (this.reducedMotion ? 0.5 : 1) + this.kick * 14
    this.fov += (targetFov - this.fov) * (1 - Math.exp(-dt * 4))
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov
      cam.updateProjectionMatrix()
    }

    // Speed lines stream toward the camera in its own space.
    const mat = this.lines.material as THREE.LineBasicMaterial
    const strength = Math.max(0, (speed01 - 0.08) / 0.92) + this.kick * 0.9
    mat.opacity = Math.min(0.75, strength * 0.65) * (this.reducedMotion ? 0.4 : 1)
    this.lines.visible = mat.opacity > 0.01
    if (!this.lines.visible) return
    const flow = 80 + speed01 * 140
    for (let i = 0; i < LINES; i += 1) {
      const a = this.seeds[i * 3]
      const r = this.seeds[i * 3 + 1]
      let z = ((this.seeds[i * 3 + 2] + this.time * flow * 0.02) % 1) * -40 - 2
      z = Math.min(-2, z)
      const len = 3 + speed01 * 9 + this.kick * 6
      const x = Math.cos(a) * r * 1.6
      const y = Math.sin(a) * r
      const o = i * 6
      this.linePos[o] = x
      this.linePos[o + 1] = y
      this.linePos[o + 2] = z
      this.linePos[o + 3] = x * 1.04
      this.linePos[o + 4] = y * 1.04
      this.linePos[o + 5] = z + len
    }
    ;(this.lines.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true
  }
}
