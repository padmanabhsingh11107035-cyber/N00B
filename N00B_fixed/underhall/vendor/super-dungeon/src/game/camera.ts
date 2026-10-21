import * as THREE from 'three'
import type { Level } from './level'
import { CONFIG } from '../../../../src/game/config'
/**
 * Over-the-shoulder follow camera. Mouse/stick yaw + pitch orbit a pivot above the hero's right
 * shoulder; the boom pulls in when walls get in the way, and trauma-based shake sells impacts.
 */
export class ShoulderCamera {
  readonly camera = new THREE.PerspectiveCamera(CONFIG.superDungeon.cameraFov, 1, 0.1, 160)
  yaw = Math.PI
  pitch = 0.32
  private boom = 5.4
  private shoulder = 0.85
  private readonly height = 1.75
  private trauma = 0
  private readonly pivot = new THREE.Vector3()
  private readonly desired = new THREE.Vector3()
  private readonly look = new THREE.Vector3()
  private readonly smoothPivot = new THREE.Vector3()
  private initialized = false
  reducedMotion = false
  /** Extra zoom-out used for the boss arena. */
  zoom = 1
  /** 0..1 sprint amount: widens the FOV slightly for a sense of speed. */
  sprint = 0
  private fovNow = CONFIG.superDungeon.cameraFov

  forward(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
  }
  right(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw))
  }
  addTrauma(v: number): void {
    this.trauma = Math.min(1, this.trauma + v)
  }
  snap(): void {
    this.initialized = false
  }

  update(target: THREE.Vector3, look: { x: number; y: number }, dt: number, level?: Level): void {
    this.yaw -= look.x
    this.pitch = THREE.MathUtils.clamp(this.pitch + look.y, -0.2, 1.05)
    const f = this.forward()
    const r = this.right()
    this.pivot.copy(target).addScaledVector(r, this.shoulder)
    this.pivot.y += this.height
    if (!this.initialized) {
      this.smoothPivot.copy(this.pivot)
      this.initialized = true
    } else this.smoothPivot.lerp(this.pivot, 1 - Math.exp(-dt * CONFIG.superDungeon.cameraFollow))
    const want = CONFIG.superDungeon.cameraDistance * this.zoom
    const cp = Math.cos(this.pitch)
    const sp = Math.sin(this.pitch)
    this.desired.copy(this.smoothPivot).addScaledVector(f, -want * cp)
    this.desired.y += want * sp
    let clear = 1
    if (level) clear = level.cameraClear(this.smoothPivot, this.desired)
    const boomTarget = Math.max(0.9, want * clear)
    // Pull in instantly, ease back out.
    this.boom = boomTarget < this.boom ? boomTarget : this.boom + (boomTarget - this.boom) * (1 - Math.exp(-dt * 4))
    this.camera.position.copy(this.smoothPivot).addScaledVector(f, -this.boom * cp)
    this.camera.position.y += this.boom * sp
    this.look.copy(this.smoothPivot).addScaledVector(f, 4)
    this.look.y -= 0.6
    this.camera.lookAt(this.look)
    const fov = CONFIG.superDungeon.cameraFov + (this.reducedMotion ? 0 : this.sprint * 7)
    if (Math.abs(fov - this.fovNow) > 0.01) {
      this.fovNow += (fov - this.fovNow) * (1 - Math.exp(-dt * 6))
      this.camera.fov = this.fovNow
      this.camera.updateProjectionMatrix()
    }
    if (this.trauma > 0) {
      const s = this.reducedMotion ? 0 : this.trauma * this.trauma
      this.camera.rotation.z += (Math.random() - 0.5) * 0.05 * s
      this.camera.position.x += (Math.random() - 0.5) * 0.35 * s
      this.camera.position.y += (Math.random() - 0.5) * 0.35 * s
      this.trauma = Math.max(0, this.trauma - dt * 1.8)
    }
  }
}
