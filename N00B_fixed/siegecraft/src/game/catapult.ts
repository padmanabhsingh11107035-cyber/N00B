import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { arcPoints, landingPoint, launchVelocity, releasePoint, type Aim } from './aim'
import { CONFIG } from './config'
import { ARM_LENGTH, ARM_PIVOT, CATAPULT_BASE, RELEASE_ANGLE, RELEASE_LOCAL } from './layout'

/**
 * The player's counterweight catapult: a procedural low-poly model whose throwing arm winds back
 * while charging, whips forward on release and rewinds to reload. Also owns the aim preview
 * (dotted arc + landing marker).
 *
 * Arm angle φ is measured about the pivot's X axis: direction = (0, sin φ, −cos φ).
 * φ = 45° is the release pose (bucket at RELEASE_LOCAL).
 */
const PIVOT = new THREE.Vector3(ARM_PIVOT.x, ARM_PIVOT.y, ARM_PIVOT.z)
const ARM = ARM_LENGTH
const RELEASE_PHI = RELEASE_ANGLE
const COCKED_PHI = THREE.MathUtils.degToRad(200)
const WOUND_PHI = THREE.MathUtils.degToRad(214)
const STOP_PHI = THREE.MathUtils.degToRad(68)
/** Height of the stone centre above the arm axis while it sits in the bucket. */
const BALL_LIFT = 0.12 + CONFIG.ball.radius * 0.9
// Sanity: RELEASE_LOCAL must equal the bucket stone position at RELEASE_PHI.
if (import.meta.env?.DEV) {
  const y = PIVOT.y + BALL_LIFT * Math.cos(RELEASE_PHI) + ARM * Math.sin(RELEASE_PHI)
  const z = PIVOT.z + BALL_LIFT * Math.sin(RELEASE_PHI) - ARM * Math.cos(RELEASE_PHI)
  if (Math.abs(y - RELEASE_LOCAL.y) > 0.03 || Math.abs(z - RELEASE_LOCAL.z) > 0.03) console.warn('catapult release mismatch', y, z)
}

type ArmState = 'ready' | 'swing' | 'rest' | 'reload'

function vc(g: THREE.BufferGeometry, color: number, vary = 0.06): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g
  const n = geo.attributes.position.count
  const arr = new Float32Array(n * 3)
  const c = new THREE.Color()
  for (let t = 0; t < n / 3; t += 1) {
    c.set(color).multiplyScalar(1 + (Math.random() - 0.5) * 2 * vary)
    for (let v = 0; v < 3; v += 1) arr.set([c.r, c.g, c.b], (t * 3 + v) * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  geo.deleteAttribute('uv')
  return geo
}

function box(sx: number, sy: number, sz: number, x: number, y: number, z: number, color: number, rx = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(sx, sy, sz)
  if (rx) g.rotateX(rx)
  g.translate(x, y, z)
  return vc(g, color)
}

export class Catapult {
  readonly root = new THREE.Group()
  private arm = new THREE.Group()
  private ballInBucket: THREE.Object3D
  private wheels: THREE.Mesh[] = []
  private rope: THREE.Mesh
  private state: ArmState = 'ready'
  private phi = COCKED_PHI
  private t = 0
  private onRelease: (() => void) | null = null
  /** Visual charge 0..1 (winds the arm back). */
  charge = 0
  private preview: THREE.InstancedMesh
  private marker: THREE.Mesh
  private readonly dots = 26
  private m = new THREE.Matrix4()

  constructor(ball: THREE.Object3D, mat: THREE.Material) {
    const wood = 0x9c6435
    const dark = 0x6b4226
    const iron = 0x3b3d44
    const frame: THREE.BufferGeometry[] = []
    // Base rails and cross beams.
    for (const s of [-1, 1]) frame.push(box(0.26, 0.26, 3.6, s * 0.78, 0.55, 0.2, wood))
    for (const z of [-1.3, 0.2, 1.7]) frame.push(box(1.8, 0.2, 0.24, 0, 0.6, z, dark))
    // A-frame uprights holding the axle.
    for (const s of [-1, 1]) {
      frame.push(box(0.2, 1.7, 0.2, s * 0.78, 1.25, PIVOT.z - 0.45, wood, 0.28))
      frame.push(box(0.2, 1.7, 0.2, s * 0.78, 1.25, PIVOT.z + 0.45, wood, -0.28))
      frame.push(box(0.3, 0.3, 0.3, s * 0.78, PIVOT.y, PIVOT.z, iron))
    }
    // Stop bar the arm slams into.
    const stopY = PIVOT.y + Math.sin(STOP_PHI) * 1.25 - 0.14
    const stopZ = PIVOT.z - Math.cos(STOP_PHI) * 1.25 - 0.1
    for (const s of [-1, 1]) frame.push(box(0.16, stopY - 0.5, 0.16, s * 0.6, (stopY + 0.5) / 2, stopZ - 0.05, wood))
    frame.push(box(1.4, 0.2, 0.2, 0, stopY, stopZ - 0.05, dark))
    // Winch drum at the back.
    const drum = new THREE.CylinderGeometry(0.2, 0.2, 1.3, 8)
    drum.rotateZ(Math.PI / 2)
    drum.translate(0, 0.95, 1.75)
    frame.push(vc(drum, dark))
    const frameGeo = mergeGeometries(frame)!
    frameGeo.computeVertexNormals()
    const frameMesh = new THREE.Mesh(frameGeo, mat)
    frameMesh.castShadow = true
    frameMesh.receiveShadow = true
    this.root.add(frameMesh)
    // Wheels.
    for (const s of [-1, 1]) for (const z of [-1.1, 1.4]) {
      const g = new THREE.CylinderGeometry(0.44, 0.44, 0.16, 9)
      g.rotateZ(Math.PI / 2)
      const w = new THREE.Mesh(mergeGeometries([vc(g, dark), vc(new THREE.BoxGeometry(0.18, 0.12, 0.8), wood), vc(new THREE.BoxGeometry(0.18, 0.8, 0.12), wood)])!, mat)
      w.geometry.computeVertexNormals()
      w.position.set(s * 0.98, 0.44, z)
      w.castShadow = true
      this.wheels.push(w)
      this.root.add(w)
    }
    // Throwing arm (pivot at origin of the arm group, pointing along local −Z at φ = 0).
    const armParts = [
      box(0.2, 0.2, ARM + 0.9, 0, 0, -(ARM - 0.9) / 2, wood),
      box(0.24, 0.24, 0.24, 0, 0, 0, iron),
      // Bucket at the long end.
      box(0.72, 0.1, 0.72, 0, 0.12, -ARM, dark),
      box(0.72, 0.28, 0.08, 0, 0.26, -ARM - 0.34, dark),
      box(0.72, 0.28, 0.08, 0, 0.26, -ARM + 0.34, dark),
      box(0.08, 0.28, 0.72, -0.34, 0.26, -ARM, dark),
      box(0.08, 0.28, 0.72, 0.34, 0.26, -ARM, dark),
      // Counterweight box at the short end.
      box(0.9, 0.7, 0.7, 0, -0.35, 0.9, 0x7c7a72),
      box(0.96, 0.1, 0.76, 0, 0.02, 0.9, iron),
    ]
    const armGeo = mergeGeometries(armParts)!
    armGeo.computeVertexNormals()
    const armMesh = new THREE.Mesh(armGeo, mat)
    armMesh.castShadow = true
    this.arm.add(armMesh)
    this.arm.position.copy(PIVOT)
    this.root.add(this.arm)
    this.ballInBucket = ball
    ball.position.set(0, BALL_LIFT, -ARM)
    this.arm.add(ball)
    // Winch rope from the drum to the arm tip.
    this.rope = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 4), new THREE.MeshStandardMaterial({ color: 0xd9c18f, roughness: 1 }))
    this.root.add(this.rope)
    this.root.position.set(CATAPULT_BASE.x, CATAPULT_BASE.y, CATAPULT_BASE.z)

    // Aim preview.
    this.preview = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.11, 0), new THREE.MeshBasicMaterial({ color: 0xfff4d6, transparent: true, opacity: 0.9, depthWrite: false }), this.dots)
    this.preview.frustumCulled = false
    this.preview.renderOrder = 5
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.8, 24), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }))
    this.marker.rotation.x = -Math.PI / 2
    this.marker.renderOrder = 5
    this.applyArm()
  }

  /** Scene objects outside the catapult root (preview lives in world space). */
  get extras(): THREE.Object3D[] {
    return [this.preview, this.marker]
  }

  set yaw(y: number) {
    this.root.rotation.y = -y
  }

  get ready(): boolean {
    return this.state === 'ready'
  }

  /** Swing the arm; `release` is called when the bucket reaches the release pose. */
  fire(release: () => void): void {
    if (this.state !== 'ready') return
    this.state = 'swing'
    this.t = 0
    this.onRelease = release
  }

  /** Rewind and load a new stone (visual only). */
  reload(hasAmmo: boolean): void {
    if (this.state === 'ready' || this.state === 'reload') return
    this.state = 'reload'
    this.t = 0
    this.ballInBucket.visible = false
    this.ballInBucket.userData.hasAmmo = hasAmmo
  }

  /** Snap back to the ready pose (level start). */
  reset(hasAmmo = true): void {
    this.state = 'ready'
    this.phi = COCKED_PHI
    this.charge = 0
    this.ballInBucket.visible = hasAmmo
    this.onRelease = null
    this.applyArm()
  }

  update(dt: number, time: number): void {
    this.t += dt
    switch (this.state) {
      case 'ready': {
        const target = COCKED_PHI + (WOUND_PHI - COCKED_PHI) * this.charge
        this.phi += (target - this.phi) * Math.min(1, dt * 14)
        // Nervous tremble at high charge.
        if (this.charge > 0.75) this.phi += Math.sin(time * 70) * 0.004 * (this.charge - 0.75) * 4
        break
      }
      case 'swing': {
        // Accelerating whip from the wound pose through release to the stop bar.
        const dur = 0.16
        const k = Math.min(1, this.t / dur)
        const start = COCKED_PHI + (WOUND_PHI - COCKED_PHI) * this.charge
        const eased = k * k
        // Angles decrease from ~200° toward 78°.
        this.phi = start + (STOP_PHI - start) * eased
        if (this.onRelease && this.phi <= RELEASE_PHI) {
          // Hide the bucket ball; the physics ball takes over at the release point.
          this.ballInBucket.visible = false
          const cb = this.onRelease
          this.onRelease = null
          cb()
        }
        if (k >= 1) {
          this.state = 'rest'
          this.t = 0
          this.charge = 0
        }
        break
      }
      case 'rest': {
        // Bounce off the stop bar.
        this.phi = STOP_PHI + Math.sin(this.t * 26) * Math.exp(-this.t * 7) * 0.12
        break
      }
      case 'reload': {
        const dur = 0.9
        const k = Math.min(1, this.t / dur)
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
        this.phi = STOP_PHI + (COCKED_PHI - STOP_PHI) * e
        for (const w of this.wheels) w.rotation.x = Math.sin(k * Math.PI) * 0.1
        if (k > 0.7 && this.ballInBucket.userData.hasAmmo) this.ballInBucket.visible = true
        if (k >= 1) {
          this.state = 'ready'
          this.phi = COCKED_PHI
        }
        break
      }
    }
    this.applyArm()
  }

  private applyArm(): void {
    // Arm group points along −Z; rotate about X so the long end follows φ.
    this.arm.rotation.x = this.phi
    // Rope: from winch drum to the bucket end (only taut while cocked).
    const tip = new THREE.Vector3(0, 0, -ARM).applyEuler(this.arm.rotation).add(PIVOT)
    const drum = new THREE.Vector3(0, 0.95, 1.75)
    const taut = this.state === 'ready' || (this.state === 'reload' && this.t > 0.6)
    this.rope.visible = taut
    if (taut) {
      const mid = tip.clone().add(drum).multiplyScalar(0.5)
      const len = tip.distanceTo(drum)
      this.rope.position.copy(mid)
      this.rope.scale.set(1, len, 1)
      this.rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), drum.clone().sub(tip).normalize())
    }
  }

  /** Update the dotted arc and landing marker for the current aim. */
  showPreview(aim: Aim | null, alpha = 1): void {
    if (!aim) {
      this.preview.visible = false
      this.marker.visible = false
      return
    }
    this.preview.visible = true
    const origin = releasePoint(CATAPULT_BASE, aim.yaw, RELEASE_LOCAL)
    const v = launchVelocity(aim)
    const g = CONFIG.physics.gravity
    const pts = arcPoints(origin, v, g, CONFIG.aim.previewSeconds, this.dots)
    const q = new THREE.Quaternion()
    const mat = this.preview.material as THREE.MeshBasicMaterial
    mat.opacity = 0.9 * alpha
    for (let i = 0; i < pts.length; i += 1) {
      const fade = 1 - i / pts.length
      const s = 0.55 + fade * 0.7
      this.m.compose(new THREE.Vector3(pts[i].x, pts[i].y, pts[i].z), q, new THREE.Vector3(s, s, s))
      this.preview.setMatrixAt(i, this.m)
    }
    this.preview.count = pts.length
    this.preview.instanceMatrix.needsUpdate = true
    const land = landingPoint(origin, v, g, 0)
    // The ground marker is always shown so distance can be judged even when the arc is cut short.
    this.marker.visible = !!land
    if (land) {
      this.marker.position.set(land.x, 0.08, land.z)
      // Grow with distance so it stays readable far down range.
      this.marker.scale.setScalar(1 + Math.hypot(land.x - origin.x, land.z - origin.z) / 22)
      ;(this.marker.material as THREE.MeshBasicMaterial).opacity = 0.85 * alpha
    }
  }
}
