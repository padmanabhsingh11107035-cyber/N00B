import * as THREE from 'three'
import { CONFIG } from './config'
import { angleDelta, clamp, damp } from './noise'
import { heightAt, OBSTACLES } from './terrain'

/**
 * Over-the-shoulder orbit camera. Mouse/stick orbit, optional monster lock-on, terrain and rock
 * collision, trauma-based shake, FOV kicks for sprinting and charged strikes, and a wider framing
 * while mounted or near the colossus so its scale stays readable.
 */
export type CameraFrame = {
  target: THREE.Vector3
  look: { x: number; y: number }
  sensitivity: number
  invertY: boolean
  lockTarget: THREE.Vector3 | null
  mounted: boolean
  riding: boolean
  sprinting: boolean
  charge: number
  monsterDistance: number
  monsterHeight: number
  shakeEnabled: boolean
  /** Monster hit spheres the camera must not sit inside. */
  occluders?: { world: THREE.Vector3; radius: number }[]
}

const _occ: { world: THREE.Vector3; radius: number }[] = []
const _desired = new THREE.Vector3()
const _focus = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _p = new THREE.Vector3()
const _look = new THREE.Vector3()

export class HuntCamera {
  readonly camera: THREE.PerspectiveCamera
  yaw = Math.PI
  pitch = 0.18
  private dist = CONFIG.camera.distance
  private focus = new THREE.Vector3()
  private trauma = 0
  private fovKick = 0
  private time = 0
  private lockBlend = 0
  private lookAt = new THREE.Vector3()

  constructor() {
    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, innerWidth / innerHeight, 0.1, 2400)
  }

  /** Forward direction on the ground plane (used for movement input). */
  get groundYaw(): number {
    return this.yaw
  }

  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount)
  }

  kick(amount: number): void {
    this.fovKick = Math.max(this.fovKick, amount)
  }

  snap(target: THREE.Vector3, yaw: number, pitch = 0.18): void {
    this.yaw = yaw
    this.pitch = pitch
    this.focus.copy(target)
    this.dist = CONFIG.camera.distance
    this.trauma = 0
  }

  update(dt: number, f: CameraFrame): void {
    this.time += dt
    const C = CONFIG.camera
    const sens = 0.0022 * f.sensitivity
    this.yaw -= f.look.x * sens
    this.pitch += f.look.y * sens * (f.invertY ? -1 : 1)
    // Lock-on steers the orbit toward the monster while still allowing fine adjustment.
    this.lockBlend = damp(this.lockBlend, f.lockTarget ? 1 : 0, 6, dt)
    if (f.lockTarget && this.lockBlend > 0.01) {
      const dx = f.lockTarget.x - f.target.x
      const dz = f.lockTarget.z - f.target.z
      const wantYaw = Math.atan2(dx, dz)
      this.yaw += angleDelta(this.yaw, wantYaw) * (1 - Math.exp(-4 * dt)) * this.lockBlend
      const horiz = Math.hypot(dx, dz)
      const wantPitch = clamp(-Math.atan2(f.lockTarget.y - (f.target.y + C.height), horiz) + 0.2, C.minPitch, C.maxPitch)
      this.pitch += (wantPitch - this.pitch) * (1 - Math.exp(-2.5 * dt)) * this.lockBlend
    }
    this.pitch = clamp(this.pitch, C.minPitch, C.maxPitch)
    // Riding the colossus: settle into a high vantage above its back so the body never swallows the view.
    if (f.mounted && this.pitch < 0.32) this.pitch += (0.32 - this.pitch) * (1 - Math.exp(-5 * dt))

    // Framing: pull back when mounted or close to the monster.
    const near = clamp((26 - f.monsterDistance) / 26, 0, 1)
    let want = C.distance + near * 2.2 + (f.monsterHeight > 8 ? 0.8 : 0) * near
    let height = C.height
    let shoulder = C.shoulder
    if (f.mounted) {
      want = C.distance + 4.5
      height = C.height + 1.2
      shoulder = 0.4
    }
    if (f.riding) want += 1.5
    this.dist = damp(this.dist, want, 3, dt)
    this.focus.x = damp(this.focus.x, f.target.x, C.follow, dt)
    this.focus.z = damp(this.focus.z, f.target.z, C.follow, dt)
    this.focus.y = damp(this.focus.y, f.target.y, f.mounted ? 7 : C.follow * 0.8, dt)

    _focus.copy(this.focus).setY(this.focus.y + height)
    const cp = Math.cos(this.pitch)
    _dir.set(Math.sin(this.yaw) * cp, -Math.sin(this.pitch), Math.cos(this.yaw) * cp)
    const rx = -Math.cos(this.yaw)
    const rz = Math.sin(this.yaw)
    _focus.x += rx * shoulder
    _focus.z += rz * shoulder
    // March from focus outward and stop before terrain or rock spires.
    let d = this.dist
    const steps = 16
    const occ = _occ
    occ.length = 0
    if (f.occluders) {
      for (const o of f.occluders) {
        // Skip spheres that contain the focus (e.g. the hunter standing on the back).
        if (o.world.distanceToSquared(_focus) > (o.radius + 0.2) ** 2 && o.world.distanceTo(_focus) < this.dist + o.radius + 1) {
          // Mounted: only parts rising above the rider (neck, head, spines) can block the view.
          if (f.mounted && o.world.y + o.radius * 0.3 < _focus.y) continue
          occ.push(o)
        }
      }
    }
    for (let i = 1; i <= steps; i += 1) {
      const t = (i / steps) * this.dist
      _p.copy(_focus).addScaledVector(_dir, -t)
      const g = heightAt(_p.x, _p.z) + 0.45
      let blocked = _p.y < g - 0.6
      if (!blocked) {
        for (const o of occ) {
          if (_p.distanceToSquared(o.world) < (o.radius + 0.35) ** 2) {
            blocked = true
            break
          }
        }
      }
      if (!blocked) {
        for (const o of OBSTACLES) {
          if (o.kind === 'tree') continue
          if (_p.y < heightAt(o.x, o.z) + o.h && Math.hypot(_p.x - o.x, _p.z - o.z) < o.r + 0.4) {
            blocked = true
            break
          }
        }
      }
      if (blocked) {
        d = Math.max(1.2, t - this.dist / steps)
        break
      }
    }
    _desired.copy(_focus).addScaledVector(_dir, -d)
    const g = heightAt(_desired.x, _desired.z) + 0.45
    if (_desired.y < g) _desired.y = g
    this.camera.position.copy(_desired)

    // Look target leads slightly ahead so the monster fills the upper frame.
    _look.copy(_focus).addScaledVector(_dir, 4)
    if (f.lockTarget) _look.lerp(f.lockTarget, 0.25 * this.lockBlend)
    this.lookAt.lerp(_look, 1 - Math.exp(-18 * dt))
    if (this.lookAt.lengthSq() === 0) this.lookAt.copy(_look)
    this.camera.lookAt(this.lookAt)

    // Trauma shake.
    this.trauma = Math.max(0, this.trauma - dt * 1.4)
    if (f.shakeEnabled && this.trauma > 0) {
      const s = this.trauma * this.trauma
      const t = this.time * 38
      this.camera.position.x += (Math.sin(t * 1.1) + Math.sin(t * 2.3) * 0.5) * s * 0.35
      this.camera.position.y += (Math.sin(t * 1.7 + 1) + Math.sin(t * 3.1) * 0.5) * s * 0.3
      this.camera.rotateZ(Math.sin(t * 0.9 + 2) * s * 0.035)
    }
    this.fovKick = Math.max(0, this.fovKick - dt * 2.2)
    const fov = C.fov + (f.sprinting ? 5 : 0) + f.charge * -4 + this.fovKick * 10 + (f.mounted ? 4 : 0)
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = damp(this.camera.fov, fov, 6, dt)
      this.camera.updateProjectionMatrix()
    }
  }

  /** Cinematic orbit for the title screen and victory. */
  orbit(dt: number, center: THREE.Vector3, radius: number, height: number, speed: number, shift = 0): void {
    this.time += dt
    const a = this.time * speed
    this.camera.position.set(center.x + Math.sin(a) * radius, 0, center.z + Math.cos(a) * radius)
    const g = heightAt(this.camera.position.x, this.camera.position.z)
    this.camera.position.y = Math.max(g + 2, center.y + height)
    // Shift the look point sideways so the subject sits off-centre (room for the title menu).
    const dx = center.x - this.camera.position.x
    const dz = center.z - this.camera.position.z
    const len = Math.hypot(dx, dz) || 1
    this.camera.lookAt(center.x + (dz / len) * shift, center.y, center.z - (dx / len) * shift)
    if (Math.abs(this.camera.fov - 55) > 0.01) {
      this.camera.fov = 55
      this.camera.updateProjectionMatrix()
    }
    this.yaw = Math.atan2(center.x - this.camera.position.x, center.z - this.camera.position.z)
  }
}
