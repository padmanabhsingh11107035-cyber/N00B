import * as THREE from 'three'
import { CONFIG } from './config'
import type { Rider } from './sim'

/**
 * The snowboarder. A twin-tip board with bindings, and a rider standing sideways on it
 * (regular stance: left foot at the nose). Legs and arms are solved with two-bone IK every
 * frame so the feet stay locked in the bindings while the body carves, crouches and grabs.
 *
 * Frames (all inside `edgeG`, which moves with the board):
 *   +z = board nose (direction of travel), -x = toe edge (the rider's chest faces -x),
 *   +x = heel edge, +y = up from the base.
 *
 * Poses blended from the sim state: athletic riding stance, toe/heel-side carves (board on
 * edge, rider inclined into the turn), speed tuck, ollie (tail pop), air with indy grab,
 * frontside 360 off big kickers, slam tuck-dive, landing absorb, heel-side hockey-stop brake
 * with spray, and boardslides on rails.
 */

const TRAIL = 26
const UP = new THREE.Vector3(0, 1, 0)

class Ribbon {
  readonly mesh: THREE.Mesh
  private readonly pts: THREE.Vector3[] = []
  private readonly pos: Float32Array
  private readonly col: Float32Array
  private readonly base: THREE.Color
  constructor(color: number) {
    this.base = new THREE.Color(color)
    const geo = new THREE.BufferGeometry()
    this.pos = new Float32Array(TRAIL * 2 * 3)
    this.col = new Float32Array(TRAIL * 2 * 3)
    const idx: number[] = []
    for (let i = 0; i < TRAIL - 1; i += 1) {
      const a = i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    geo.setIndex(idx)
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3))
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }))
    this.mesh.frustumCulled = false
  }
  reset(): void {
    this.pts.length = 0
  }
  push(p: THREE.Vector3, width: number, strength: number): void {
    this.pts.unshift(p.clone())
    if (this.pts.length > TRAIL) this.pts.pop()
    const n = this.pts.length
    for (let i = 0; i < TRAIL; i += 1) {
      const q = this.pts[Math.min(i, n - 1)] ?? p
      const k = 1 - i / (TRAIL - 1)
      const w = width * (0.3 + 0.7 * k)
      const o = i * 6
      this.pos[o] = q.x - w
      this.pos[o + 1] = q.y
      this.pos[o + 2] = q.z
      this.pos[o + 3] = q.x + w
      this.pos[o + 4] = q.y
      this.pos[o + 5] = q.z
      const c = k * k * strength * (i < n ? 1 : 0)
      for (const off of [0, 3]) {
        this.col[o + off] = this.base.r * c
        this.col[o + off + 1] = this.base.g * c
        this.col[o + off + 2] = this.base.b * c
      }
    }
    ;(this.mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true
    ;(this.mesh.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true
  }
}

// ── Geometry helpers ─────────────────────────────────────────────────────────
const BOARD_HALF_LEN = 0.78

const SCARF_N = 11
/**
 * Scarf as one continuous ribbon. Its points are computed every frame in the rider's own
 * (translation-only) frame, so it can never lag behind and break apart at speed; only the
 * flutter grows toward the tail.
 */
class Scarf {
  readonly mesh: THREE.Mesh
  private readonly pos = new Float32Array(SCARF_N * 2 * 3)
  constructor(mat: THREE.Material) {
    const geo = new THREE.BufferGeometry()
    const idx: number[] = []
    for (let i = 0; i < SCARF_N - 1; i += 1) {
      const a = i * 2
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
    geo.setIndex(idx)
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    this.mesh = new THREE.Mesh(geo, mat)
    this.mesh.frustumCulled = false
    this.mesh.castShadow = true
  }
  /** `anchor` is the back of the neck relative to the rider root. */
  update(anchor: THREE.Vector3, time: number, speed01: number, drift: number): void {
    const seg = 0.075
    const f1 = 11 + speed01 * 9
    const f2 = 14 + speed01 * 10
    const amp = 0.5 + speed01 * 0.8
    for (let i = 0; i < SCARF_N; i += 1) {
      const k = i / (SCARF_N - 1)
      const cx = anchor.x + Math.sin(time * f1 - i * 0.8) * 0.05 * k * amp - drift * k * 0.25
      const cy = anchor.y - 0.02 - k * 0.14 * (1 - 0.75 * speed01) + Math.sin(time * f2 - i * 1.05) * 0.045 * k * amp
      const cz = anchor.z - 0.04 - i * seg
      const half = 0.075 * (1 - 0.4 * k)
      // Tilted ~50° so the band reads from both the chase camera and the side.
      const twist = 0.9 + Math.sin(time * 9 - i * 0.7) * 0.5 * k
      const sx = Math.cos(twist) * half
      const sy = Math.sin(twist) * half
      const o = i * 6
      this.pos[o] = cx - sx
      this.pos[o + 1] = cy - sy
      this.pos[o + 2] = cz
      this.pos[o + 3] = cx + sx
      this.pos[o + 4] = cy + sy
      this.pos[o + 5] = cz
    }
    const g = this.mesh.geometry
    ;(g.attributes.position as THREE.BufferAttribute).needsUpdate = true
    g.computeVertexNormals()
  }
}
const BOARD_THICK = 0.024

/** Half-width of the board at z: sidecut waist between the contact points, rounded tips. */
function boardHalfWidth(z: number): number {
  const a = Math.abs(z)
  const contact = 0.6
  if (a <= contact) return 0.128 + 0.022 * (a / contact) ** 2
  const t = Math.min(1, (a - contact) / (BOARD_HALF_LEN - contact))
  return 0.15 * Math.sqrt(Math.max(0, 1 - t * t)) + 0.0001
}

function boardGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = []
  const N = 36
  for (let i = 0; i <= N; i += 1) {
    const z = -BOARD_HALF_LEN + (2 * BOARD_HALF_LEN * i) / N
    pts.push(new THREE.Vector2(boardHalfWidth(z), z))
  }
  for (let i = N - 1; i >= 1; i -= 1) {
    const z = -BOARD_HALF_LEN + (2 * BOARD_HALF_LEN * i) / N
    pts.push(new THREE.Vector2(-boardHalfWidth(z), z))
  }
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: BOARD_THICK, bevelEnabled: false, curveSegments: 1 })
  // Shape (x, y) → board (x, z); extrusion becomes thickness below y = 0, then lift onto y ≥ 0.
  geo.rotateX(Math.PI / 2)
  geo.translate(0, BOARD_THICK, 0)
  // Rocker at the tips: nose and tail curve up.
  const pos = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i += 1) {
    const a = Math.abs(pos.getZ(i))
    if (a > 0.52) pos.setY(i, pos.getY(i) + ((a - 0.52) / (BOARD_HALF_LEN - 0.52)) ** 2 * 0.085)
  }
  geo.computeVertexNormals()
  return geo
}

function boardTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 1024
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 0, 1024)
  grad.addColorStop(0, '#1a1f6b')
  grad.addColorStop(0.5, '#0d1140')
  grad.addColorStop(1, '#2a1266')
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 1024)
  // Nose/tail neon chevrons and a centre stripe.
  g.lineWidth = 18
  g.lineJoin = 'round'
  for (const [y0, dir, col] of [[140, 1, '#5ff3ff'], [884, -1, '#ff5fd2']] as const) {
    for (let k = 0; k < 3; k += 1) {
      g.strokeStyle = col
      g.globalAlpha = 1 - k * 0.28
      g.beginPath()
      const y = y0 + dir * k * 46
      g.moveTo(30, y + dir * 40)
      g.lineTo(128, y)
      g.lineTo(226, y + dir * 40)
      g.stroke()
    }
  }
  g.globalAlpha = 1
  g.fillStyle = '#5ff3ff'
  g.fillRect(122, 300, 12, 424)
  g.save()
  g.translate(128, 512)
  g.rotate(-Math.PI / 2)
  g.font = '900 64px Sora, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#ffffff'
  g.fillText('FROSTLINE', 0, 0)
  g.restore()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  // Cap UVs are raw shape coordinates (x ∈ ±0.15, z ∈ ±0.78): map them onto the canvas.
  t.repeat.set(1 / 0.3, -1 / (2 * BOARD_HALF_LEN))
  t.offset.set(0.5, 0.5)
  return t
}

const _d = new THREE.Vector3()
const _b = new THREE.Vector3()
/**
 * Two-bone IK. Writes the middle joint into `joint` and the reachable end into `end`.
 * `pole` is the direction the joint should bend toward.
 */
function solveIK(root: THREE.Vector3, target: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3, joint: THREE.Vector3, end: THREE.Vector3): void {
  _d.subVectors(target, root)
  let len = _d.length()
  const maxL = l1 + l2 - 1e-3
  const minL = Math.abs(l1 - l2) + 0.05
  if (len < 1e-5) {
    _d.set(0, -1, 0)
    len = minL
  } else {
    _d.divideScalar(len)
  }
  len = Math.min(maxL, Math.max(minL, len))
  end.copy(root).addScaledVector(_d, len)
  const x = (l1 * l1 - l2 * l2 + len * len) / (2 * len)
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x))
  _b.copy(pole).addScaledVector(_d, -pole.dot(_d))
  if (_b.lengthSq() < 1e-6) _b.set(1, 0, 0)
  _b.normalize()
  joint.copy(root).addScaledVector(_d, x).addScaledVector(_b, h)
}

const _dir = new THREE.Vector3()
/** Stretch a unit-length (along y) limb mesh between two points. */
function place(mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3): void {
  _dir.subVectors(b, a)
  const len = _dir.length()
  mesh.position.addVectors(a, b).multiplyScalar(0.5)
  if (len > 1e-5) mesh.quaternion.setFromUnitVectors(UP, _dir.divideScalar(len))
  mesh.scale.set(1, len, 1)
}

const _m = new THREE.Matrix4()
const _x = new THREE.Vector3()
const _z = new THREE.Vector3()
/** Orient `obj` so its +y follows `up` and its +z faces `fwd` (orthogonalised). */
function orient(obj: THREE.Object3D, up: THREE.Vector3, fwd: THREE.Vector3): void {
  _x.crossVectors(up, fwd).normalize()
  _z.crossVectors(_x, up).normalize()
  _m.makeBasis(_x, up, _z)
  obj.quaternion.setFromRotationMatrix(_m)
}

const smooth = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-dt * rate))
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

// Rider proportions (metres).
const THIGH = 0.46
const SHIN = 0.45
const UPPER_ARM = 0.3
const FOREARM = 0.29
const SPINE = 0.5
const STANCE = 0.27
const ANKLE_Y = 0.15

export class RiderView {
  readonly root = new THREE.Group()
  /** World-space parts (trails, scarf) the game adds to the scene next to `root`. */
  readonly extras: THREE.Object3D[]
  /** World position of the board tail and nose, for spray/trail effects. */
  readonly tailWorld = new THREE.Vector3()
  readonly noseWorld = new THREE.Vector3()
  /** Current board edge angle (+ toe side, − heel side) and hockey-stop amount, for spray. */
  edge = 0
  skid = 0

  private readonly yawG = new THREE.Group()
  private readonly pitchG = new THREE.Group()
  private readonly edgeG = new THREE.Group()
  private readonly thighs: THREE.Mesh[] = []
  private readonly shins: THREE.Mesh[] = []
  private readonly uppers: THREE.Mesh[] = []
  private readonly fores: THREE.Mesh[] = []
  private readonly gloves: THREE.Mesh[] = []
  private readonly knees: THREE.Mesh[] = []
  private readonly torso: THREE.Mesh
  private readonly pelvis: THREE.Mesh
  private readonly head = new THREE.Group()
  private readonly scarf: Scarf
  private readonly ribbons: Ribbon[]
  private readonly glow: THREE.MeshBasicMaterial

  // Smoothed pose state.
  private heading = 0
  private roll = 0
  private pitch = 0
  private crouch = 0.35
  private slide = 0
  private rail = 0
  private air = 0
  private grab = 0
  private slamW = 0
  private absorb = 0
  private ollie = 0
  private spin = 0
  private spinT = -1
  private spinDur = 1
  private wasGrounded = true
  private airTime = 0
  private lastVx = 0

  // Scratch joints.
  private readonly P = new THREE.Vector3()
  private readonly C = new THREE.Vector3()
  private readonly F = new THREE.Vector3()
  private readonly L = new THREE.Vector3()
  private readonly S = new THREE.Vector3()
  private readonly tmp = new THREE.Vector3()
  private readonly tmp2 = new THREE.Vector3()
  private readonly j = new THREE.Vector3()
  private readonly e = new THREE.Vector3()
  private readonly neck = new THREE.Vector3()

  constructor() {
    const jacket = new THREE.MeshStandardMaterial({ color: 0x3fd8ff, roughness: 0.6, flatShading: true, emissive: 0x06304a, emissiveIntensity: 0.4 })
    const jacketDark = new THREE.MeshStandardMaterial({ color: 0x1d2a74, roughness: 0.6, flatShading: true })
    const pants = new THREE.MeshStandardMaterial({ color: 0xf2f4ff, roughness: 0.7, flatShading: true })
    const accent = new THREE.MeshStandardMaterial({ color: 0xff4fb0, roughness: 0.45, emissive: 0xff2a90, emissiveIntensity: 0.35, flatShading: true })
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x161a3a, roughness: 0.5, flatShading: true })
    const bindingMat = new THREE.MeshStandardMaterial({ color: 0x0b0e24, roughness: 0.35, metalness: 0.5 })
    const helmet = new THREE.MeshStandardMaterial({ color: 0xf6f7ff, roughness: 0.35, metalness: 0.1, flatShading: true })
    this.glow = new THREE.MeshBasicMaterial({ color: 0x5ff3ff, toneMapped: false })
    const edgeSteel = new THREE.MeshStandardMaterial({ color: 0xcfd6ff, roughness: 0.25, metalness: 0.9 })
    const shadowed = <T extends THREE.Mesh>(m: T) => {
      m.castShadow = true
      return m
    }

    // ── Board ──
    const top = new THREE.MeshStandardMaterial({ map: boardTexture(), roughness: 0.35, metalness: 0.1 })
    const board = shadowed(new THREE.Mesh(boardGeometry(), [top, edgeSteel]))
    this.edgeG.add(board)
    for (const [z, angle] of [[STANCE, 0.26], [-STANCE, -0.1]] as const) {
      const b = new THREE.Group()
      b.position.set(0, BOARD_THICK, z)
      b.rotation.y = angle
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.025, 0.2), bindingMat)
      plate.position.y = 0.012
      b.add(plate)
      const highback = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.24, 0.19), bindingMat)
      highback.position.set(0.12, 0.13, 0)
      highback.rotation.z = -0.25
      b.add(highback)
      const boot = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.13, 0.13), bootMat))
      boot.position.set(-0.02, 0.085, 0)
      b.add(boot)
      for (const sx of [-0.07, 0.03]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.15), this.glow)
        strap.position.set(sx, 0.155, 0)
        b.add(strap)
      }
      this.edgeG.add(b)
    }

    // ── Body (limbs are unit-length along y; `place()` stretches them between joints) ──
    const limb = (r: number, mat: THREE.Material) => shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, 1, 8, 1), mat))
    for (let i = 0; i < 2; i += 1) {
      const th = limb(0.105, pants)
      const sh = limb(0.095, pants)
      const kn = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), pants))
      this.thighs.push(th)
      this.shins.push(sh)
      this.knees.push(kn)
      const up = limb(0.075, jacket)
      const fo = limb(0.066, jacket)
      const gl = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), accent))
      this.uppers.push(up)
      this.fores.push(fo)
      this.gloves.push(gl)
      this.edgeG.add(th, sh, kn, up, fo, gl)
    }
    // Baggy jacket torso: wider across the shoulders, with a hem band, chest stripe and hood.
    this.torso = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.2, 1, 8, 1), jacket))
    const hem = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.215, 0.14, 8, 1), jacketDark)
    hem.position.y = -0.43
    this.torso.add(hem)
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.217, 0.217, 0.06, 8, 1), accent)
    stripe.position.y = 0.12
    this.torso.add(stripe)
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), jacket)
    hood.position.set(0, 0.5, -0.1)
    hood.scale.set(1.1, 0.5, 0.8)
    this.torso.add(hood)
    this.pelvis = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), pants))
    this.pelvis.scale.set(1.15, 0.8, 0.95)
    this.edgeG.add(this.torso, this.pelvis)
    // Helmet + goggles (the goggles face local +z of the head group).
    const shell = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), helmet))
    shell.scale.set(1, 1.02, 1.08)
    this.head.add(shell)
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.148, 0.018, 4, 20), jacketDark)
    band.rotation.x = Math.PI / 2
    this.head.add(band)
    const goggles = new THREE.Mesh(new THREE.SphereGeometry(0.152, 14, 6, -Math.PI * 0.32, Math.PI * 0.64, Math.PI * 0.4, Math.PI * 0.2), this.glow)
    goggles.position.z = 0.012
    this.head.add(goggles)
    this.edgeG.add(this.head)
    // Scarf: a knot at the back of the neck plus one continuous ribbon streaming behind.
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), accent)
    knot.scale.set(1.4, 0.8, 1.4)
    this.head.add(knot)
    knot.position.set(0, -0.14, -0.06)
    this.scarf = new Scarf(new THREE.MeshStandardMaterial({ color: 0xff4fb0, roughness: 0.6, emissive: 0xff2a90, emissiveIntensity: 0.35, side: THREE.DoubleSide }))
    this.root.add(this.scarf.mesh)

    this.pitchG.add(this.edgeG)
    this.yawG.add(this.pitchG)
    this.root.add(this.yawG)
    this.ribbons = [new Ribbon(0x5ff3ff), new Ribbon(0xff5fe0)]
    this.extras = this.ribbons.map(r => r.mesh)
  }

  resetTrail(): void {
    for (const r of this.ribbons) r.reset()
    this.spinT = -1
    this.spin = 0
    this.wasGrounded = true
    this.airTime = 0
  }

  set visible(v: boolean) {
    this.root.visible = v
    for (const e of this.extras) e.visible = v
  }

  update(dt: number, pos: THREE.Vector3, p: Rider, time: number): void {
    this.root.position.copy(pos)
    const onRail = p.rail >= 0
    const grounded = p.grounded || onRail
    const braking = p.brake < 0.97 && grounded && !onRail
    const speed01 = clamp((p.speed - 20) / 28, 0, 1)
    const lat = clamp(p.vx / CONFIG.sim.lateral, -1, 1)

    // ── Take-off / landing transitions ──
    if (this.wasGrounded && !grounded && p.vy > 3) {
      this.ollie = 1
      const airEst = (2 * p.vy) / -CONFIG.sim.gravity
      // Big kickers get a frontside 360, timed to finish before touchdown.
      if (airEst > 0.85 && !p.slam) {
        this.spinT = 0
        this.spinDur = airEst * 0.78
      }
    }
    if (!grounded) this.airTime += dt
    if (!this.wasGrounded && grounded) {
      this.absorb = Math.min(1, 0.35 + this.airTime * 0.7)
      this.airTime = 0
      if (this.spinT >= 0) this.spinT = Math.max(this.spinT, 0.86)
    }
    this.wasGrounded = grounded
    if (this.spinT >= 0) {
      this.spinT += dt / this.spinDur
      const t = Math.min(1, this.spinT)
      this.spin = Math.PI * 2 * (t * t * (3 - 2 * t))
      if (t >= 1) {
        this.spinT = -1
        this.spin = 0
      }
    }

    // ── Blend weights ──
    this.rail = smooth(this.rail, onRail ? 1 : 0, 16, dt)
    this.slide = smooth(this.slide, braking ? 1 : 0, 9, dt)
    this.air = smooth(this.air, grounded ? 0 : 1, grounded ? 18 : 7, dt)
    const wantGrab = !grounded && !p.slam && this.airTime > 0.18 && p.vy > -14
    this.grab = smooth(this.grab, wantGrab ? 1 : 0, wantGrab ? 7 : 14, dt)
    this.slamW = smooth(this.slamW, p.slam && !grounded ? 1 : 0, 14, dt)
    this.absorb = Math.max(0, this.absorb - dt * 3.2)
    this.ollie = Math.max(0, this.ollie - dt * 3.5)
    this.skid = this.slide
    const ax = (p.vx - this.lastVx) / Math.max(dt, 1e-3)
    this.lastVx = p.vx

    // ── Board orientation ──
    // Heading follows the direction of travel; hockey stop and boardslide turn the board across.
    const travel = Math.atan2(p.vx, Math.max(4, p.speed))
    const across = this.rail * (Math.PI / 2) + this.slide * (1 - this.rail) * 1.2
    this.heading = smooth(this.heading, travel * (1 - this.rail), 12, dt)
    this.yawG.rotation.y = this.heading + across + this.spin
    // Edge: incline into the turn (toe edge = +roll when moving toward -x), dig heels to stop.
    const carve = clamp(-lat * 0.5 - ax * 0.003, -0.55, 0.55) * (1 - this.air * 0.7) * (1 - this.rail)
    const edgeTarget = carve * (1 - this.slide) - this.slide * 0.42
    this.roll = smooth(this.roll, edgeTarget, 10, dt)
    this.edgeG.rotation.z = this.roll
    this.edge = this.roll
    const slope = grounded ? -Math.atan(p.vy / Math.max(1, p.speed)) : 0
    const airPitch = !grounded ? clamp(-p.vy * 0.01, -0.25, 0.25) * (1 - this.grab * 0.5) : 0
    const pitchTarget = slope + airPitch + this.slamW * 0.35 - this.ollie * 0.45
    this.pitch = smooth(this.pitch, pitchTarget, 14, dt)
    this.pitchG.rotation.x = this.pitch

    // ── Body ──
    const toe = Math.max(0, carve) / 0.55
    const heel = Math.max(0, -carve) / 0.55
    const crouchTarget = clamp(
      0.3 + speed01 * 0.2 + toe * 0.04 + heel * 0.08 + this.slide * 0.28 + this.rail * 0.1 +
        this.air * (0.1 - speed01 * 0.1) + this.grab * 0.62 + this.slamW * 0.6 + this.absorb * 0.5 - this.ollie * 0.25,
      0,
      1,
    )
    this.crouch = smooth(this.crouch, crouchTarget, 14, dt)
    const c = this.crouch
    const bounce = grounded ? Math.sin(time * 21) * 0.008 * (0.3 + speed01) : 0
    // Pelvis: heel-side carves and stops sit back over the heels, toe-side drives the hips forward.
    const legReach = (THIGH + SHIN) * (0.97 - 0.5 * c)
    this.P.set(0.05 + heel * 0.07 + this.slide * 0.12 - toe * 0.05 + this.grab * 0.02, ANKLE_Y + legReach + bounce, -this.ollie * 0.08)
    // Shoulders open toward the nose; the chest faces the toe side (-x), rotated toward +z.
    const open = 0.5 * (1 - this.rail) * (1 - this.slide * 0.4) + this.rail * 0.1 + this.slamW * 0.2
    this.F.set(-Math.cos(open), 0, Math.sin(open))
    this.L.set(Math.sin(open), 0, Math.cos(open))
    const bend = 0.3 + speed01 * 0.25 + toe * 0.06 - heel * 0.1 + this.grab * 0.35 + this.slamW * 0.5 - this.slide * 0.1
    this.S.copy(UP).multiplyScalar(Math.cos(bend)).addScaledVector(this.F, Math.sin(bend))
    this.S.addScaledVector(this.L, this.ollie * 0.12 - this.slamW * 0.05).normalize()
    this.C.copy(this.P).addScaledVector(this.S, SPINE)
    this.pelvis.position.copy(this.P)
    orient(this.pelvis, UP, this.tmp.copy(this.F).multiplyScalar(0.6).addScaledVector(this.L, 0.4).normalize())
    // Torso cylinder between pelvis and chest, wide axis along the shoulders.
    this.torso.position.addVectors(this.P, this.C).multiplyScalar(0.5)
    orient(this.torso, this.S, this.tmp.crossVectors(this.L, this.S).normalize())
    this.torso.scale.set(1.12, SPINE + 0.12, 0.86)

    // Legs: feet locked in the bindings, knees bend toward the toes and slightly inward.
    for (let i = 0; i < 2; i += 1) {
      const front = i === 0
      const hip = this.tmp.copy(this.P).addScaledVector(this.L, front ? 0.11 : -0.11)
      hip.y -= 0.04
      const ankle = this.tmp2.set(0.01, ANKLE_Y, front ? STANCE : -STANCE)
      const pole = new THREE.Vector3(-1, 0.15, front ? -0.3 : 0.3)
      solveIK(hip, ankle, THIGH, SHIN, pole, this.j, this.e)
      place(this.thighs[i], hip, this.j)
      place(this.shins[i], this.j, this.e)
      this.knees[i].position.copy(this.j)
    }

    // Head: over the chest, looking down the fall line over the front shoulder.
    this.neck.copy(this.C).addScaledVector(this.S, 0.07)
    this.head.position.copy(this.neck).addScaledVector(UP, 0.17).addScaledVector(this.F, 0.02)
    const look = this.tmp.copy(this.L).multiplyScalar(0.9).addScaledVector(this.F, 0.35 + this.slide * 0.3)
    look.y = -0.12 - this.slamW * 0.3
    look.normalize()
    orient(this.head, UP, look)

    // Arms: blend hand targets between poses.
    const shL = new THREE.Vector3().copy(this.C).addScaledVector(this.L, 0.2).addScaledVector(this.S, -0.04)
    const shR = new THREE.Vector3().copy(this.C).addScaledVector(this.L, -0.2).addScaledVector(this.S, -0.04)
    const sway = Math.sin(time * 3.1) * 0.03
    const hand = (sh: THREE.Vector3, front: boolean) => {
      const side = front ? 1 : -1
      // Riding: front hand leads down the fall line, back hand low by the back knee.
      const out = new THREE.Vector3().copy(sh)
      if (front) out.addScaledVector(this.L, 0.36).addScaledVector(this.F, 0.16 + toe * 0.15).addScaledVector(UP, -0.3 + sway)
      else out.addScaledVector(this.L, -0.18).addScaledVector(this.F, 0.22 + toe * 0.12).addScaledVector(UP, -0.42 - sway)
      // Air (no grab yet): arms out for balance.
      const airP = new THREE.Vector3().copy(sh).addScaledVector(this.L, side * 0.42).addScaledVector(UP, front ? 0.12 : 0.2).addScaledVector(this.F, 0.08)
      // Indy grab: back hand to the toe edge between the bindings; front arm up and out.
      const grabP = front
        ? new THREE.Vector3().copy(sh).addScaledVector(this.L, 0.32).addScaledVector(UP, 0.3).addScaledVector(this.F, -0.05)
        : new THREE.Vector3(-0.15, 0.09, -0.04)
      // Slam: tuck-dive, both hands reach for the nose.
      const slamP = front ? new THREE.Vector3(-0.1, 0.12, 0.46) : new THREE.Vector3(-0.14, 0.1, 0.2)
      // Boardslide: arms wide along the board.
      const railP = new THREE.Vector3().copy(sh).addScaledVector(this.L, side * 0.5).addScaledVector(UP, 0.02)
      // Hockey stop: both hands forward over the toes for balance.
      const stopP = new THREE.Vector3().copy(sh).addScaledVector(this.F, 0.38).addScaledVector(UP, -0.18).addScaledVector(this.L, side * 0.12)
      out.lerp(airP, this.air * (1 - this.grab) * (1 - this.slamW))
      out.lerp(grabP, this.grab * (1 - this.slamW))
      out.lerp(slamP, this.slamW)
      out.lerp(railP, this.rail)
      out.lerp(stopP, this.slide * (1 - this.rail))
      return out
    }
    for (let i = 0; i < 2; i += 1) {
      const front = i === 0
      const sh = front ? shL : shR
      const target = hand(sh, front)
      const pole = new THREE.Vector3().copy(this.F).multiplyScalar(-0.5).addScaledVector(UP, -0.7).addScaledVector(this.L, front ? 0.35 : -0.35)
      solveIK(sh, target, UPPER_ARM, FOREARM, pole, this.j, this.e)
      place(this.uppers[i], sh, this.j)
      place(this.fores[i], this.j, this.e)
      this.gloves[i].position.copy(this.e)
    }

    // ── World-space extras ──
    this.root.updateMatrixWorld(true)
    this.edgeG.localToWorld(this.tailWorld.set(0, 0.02, -BOARD_HALF_LEN + 0.08))
    this.edgeG.localToWorld(this.noseWorld.set(0, 0.02, BOARD_HALF_LEN - 0.08))
    // Scarf streams back from the back of the neck (chest faces -x, so the back is +x).
    const anchor = this.edgeG.localToWorld(this.tmp.copy(this.neck).addScaledVector(this.F, -0.1)).sub(this.root.position)
    this.scarf.update(anchor, time, speed01, lat)
    // Twin edge trails from the tail corners.
    const boost = Math.min(1, p.boost / 12)
    const strength = (grounded ? 0.5 : 0.28) + boost * 0.9 + this.rail * 0.3
    this.ribbons.forEach((r, i) => {
      const local = new THREE.Vector3(i ? 0.12 : -0.12, 0.03, -BOARD_HALF_LEN + 0.1)
      this.edgeG.localToWorld(local)
      r.push(local, 0.05 + boost * 0.07, strength)
    })
    this.glow.color.setHSL(0.52 - boost * 0.05, 1, 0.6 + boost * 0.2)
  }
}
