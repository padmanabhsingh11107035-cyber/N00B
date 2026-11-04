import * as THREE from 'three'

/**
 * Sprite particle system. Two instanced billboard meshes share one painted atlas
 * (public/assets/vfx/particles.png, 8×4 cells of 128 px):
 *  - `lit`   alpha-blended sprites (smoke, dust, wood chips, rock shards, leaves) whose colour
 *            is scaled by scene light so debris never glows at night;
 *  - `glow`  additive sprites (sparks, embers, glints, rings, flames, collect orbs).
 * Particles are structure-of-arrays for cheap per-frame updates; `flat` particles lie on the
 * ground plane (shockwave rings). Presets below map gameplay events to layered bursts.
 */
export const CELL = {
  smoke1: 0, smoke2: 1, dust: 2, spark: 3, ember: 4, glow: 5, ring: 6, star: 7,
  flame: 8, chip1: 9, chip2: 10, bark: 11, rock1: 12, rock2: 13, dirt: 14, crystal1: 15,
  crystal2: 16, leaf: 17, dot: 18,
} as const

const MAX = 1600
const tmp = new THREE.Vector3()

const VS = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iData; // size, rotation, cell, flat
attribute vec4 iColor;
uniform vec3 uRight;
uniform vec3 uUp;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec2 p = position.xy;
  float c = cos(iData.y), s = sin(iData.y);
  vec2 q = vec2(p.x * c - p.y * s, p.x * s + p.y * c) * iData.x;
  vec3 w = iData.w > 0.5 ? iPos + vec3(q.x, 0.0, q.y) : iPos + uRight * q.x + uUp * q.y;
  float cell = iData.z;
  vUv = (vec2(mod(cell, 8.0), 3.0 - floor(cell / 8.0)) + uv) / vec2(8.0, 4.0);
  vColor = iColor;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`
const FS = /* glsl */ `
uniform sampler2D uMap;
uniform float uLight;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec4 t = texture2D(uMap, vUv);
  vec4 col = t * vColor;
  col.rgb *= uLight;
  if (col.a < 0.004) discard;
  gl_FragColor = col;
  #include <colorspace_fragment>
}`

type Emit = {
  x: number; y: number; z: number; vx: number; vy: number; vz: number
  life: number; size: number; cell: number; r: number; g: number; b: number; a?: number
  grow?: number; rot?: number; spin?: number; flat?: boolean; gravity?: number; drag?: number
  flutter?: number; home?: boolean; stretch?: boolean; floorY?: number; pulse?: number
}

class Layer {
  readonly mesh: THREE.Mesh
  readonly geo: THREE.InstancedBufferGeometry
  readonly mat: THREE.ShaderMaterial
  n = 0
  px = new Float32Array(MAX); py = new Float32Array(MAX); pz = new Float32Array(MAX)
  vx = new Float32Array(MAX); vy = new Float32Array(MAX); vz = new Float32Array(MAX)
  life = new Float32Array(MAX); max = new Float32Array(MAX)
  size = new Float32Array(MAX); grow = new Float32Array(MAX)
  rot = new Float32Array(MAX); spin = new Float32Array(MAX)
  cell = new Float32Array(MAX); flat = new Uint8Array(MAX)
  grav = new Float32Array(MAX); drag = new Float32Array(MAX)
  r = new Float32Array(MAX); g = new Float32Array(MAX); b = new Float32Array(MAX); a = new Float32Array(MAX)
  flutter = new Float32Array(MAX); pulse = new Float32Array(MAX); home = new Uint8Array(MAX); stretch = new Uint8Array(MAX)
  floorY = new Float32Array(MAX)
  private aPos: THREE.InstancedBufferAttribute
  private aData: THREE.InstancedBufferAttribute
  private aColor: THREE.InstancedBufferAttribute
  private floats: Float32Array[]
  private bytes: Uint8Array[]
  constructor(map: THREE.Texture, additive: boolean) {
    const base = new THREE.PlaneGeometry(1, 1)
    this.geo = new THREE.InstancedBufferGeometry()
    this.geo.index = base.index
    this.geo.setAttribute('position', base.getAttribute('position'))
    this.geo.setAttribute('uv', base.getAttribute('uv'))
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3).setUsage(THREE.DynamicDrawUsage)
    this.aData = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage)
    this.aColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage)
    this.geo.setAttribute('iPos', this.aPos)
    this.geo.setAttribute('iData', this.aData)
    this.geo.setAttribute('iColor', this.aColor)
    this.geo.instanceCount = 0
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      uniforms: { uMap: { value: map }, uLight: { value: 1 }, uRight: { value: new THREE.Vector3(1, 0, 0) }, uUp: { value: new THREE.Vector3(0, 1, 0) } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    })
    this.mesh = new THREE.Mesh(this.geo, this.mat)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = additive ? 3 : 2
    this.floats = [this.px, this.py, this.pz, this.vx, this.vy, this.vz, this.life, this.max, this.size, this.grow, this.rot, this.spin, this.cell, this.grav, this.drag, this.r, this.g, this.b, this.a, this.flutter, this.pulse, this.floorY]
    this.bytes = [this.flat, this.home, this.stretch]
  }
  add(o: Emit): void {
    if (this.n >= MAX) return
    const i = this.n++
    this.px[i] = o.x; this.py[i] = o.y; this.pz[i] = o.z
    this.vx[i] = o.vx; this.vy[i] = o.vy; this.vz[i] = o.vz
    this.life[i] = this.max[i] = o.life
    this.size[i] = o.size; this.grow[i] = o.grow ?? 0
    this.rot[i] = o.rot ?? Math.random() * Math.PI * 2; this.spin[i] = o.spin ?? 0
    this.cell[i] = o.cell; this.flat[i] = o.flat ? 1 : 0
    this.grav[i] = o.gravity ?? 0; this.drag[i] = o.drag ?? 0.6
    this.r[i] = o.r; this.g[i] = o.g; this.b[i] = o.b; this.a[i] = o.a ?? 1
    this.flutter[i] = o.flutter ?? 0; this.pulse[i] = o.pulse ?? 0; this.home[i] = o.home ? 1 : 0; this.stretch[i] = o.stretch ? 1 : 0
    this.floorY[i] = o.floorY ?? -1e9
  }
  private kill(i: number): void {
    const j = --this.n
    if (i === j) return
    for (const arr of this.floats) arr[i] = arr[j]
    for (const arr of this.bytes) arr[i] = arr[j]
  }
  clear(): void {
    this.n = 0
    this.geo.instanceCount = 0
  }
  update(dt: number, target: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3): void {
    const P = this.aPos.array as Float32Array
    const D = this.aData.array as Float32Array
    const C = this.aColor.array as Float32Array
    for (let i = this.n - 1; i >= 0; i--) {
      this.life[i] -= dt
      if (this.life[i] <= 0) this.kill(i)
    }
    for (let i = 0; i < this.n; i++) {
      const k = 1 - this.life[i] / this.max[i]
      if (this.home[i]) {
        const ax = target.x - this.px[i], ay = target.y - 0.35 - this.py[i], az = target.z - this.pz[i]
        const pull = 5 + k * 46
        this.vx[i] = (this.vx[i] + ax * pull * dt) * 0.86
        this.vy[i] = (this.vy[i] + ay * pull * dt) * 0.86
        this.vz[i] = (this.vz[i] + az * pull * dt) * 0.86
        if (ax * ax + ay * ay + az * az < 0.18) this.life[i] = Math.min(this.life[i], 0.02)
      } else {
        this.vy[i] += this.grav[i] * dt
        const d = Math.exp(-this.drag[i] * dt)
        this.vx[i] *= d
        this.vz[i] *= d
        if (this.grav[i] >= 0) this.vy[i] *= d
        if (this.flutter[i]) {
          const t = this.life[i] * 5 + i
          this.vx[i] += Math.sin(t) * this.flutter[i] * dt
          this.vz[i] += Math.cos(t * 1.3) * this.flutter[i] * dt
        }
      }
      this.px[i] += this.vx[i] * dt
      this.py[i] += this.vy[i] * dt
      this.pz[i] += this.vz[i] * dt
      // Debris settles on the ground instead of falling through it.
      if (this.py[i] < this.floorY[i]) {
        this.py[i] = this.floorY[i]
        this.vy[i] *= -0.25
        this.vx[i] *= 0.5
        this.vz[i] *= 0.5
        this.spin[i] *= 0.5
      }
      this.rot[i] += this.spin[i] * dt
      let rot = this.rot[i]
      if (this.stretch[i]) {
        tmp.set(this.vx[i], this.vy[i], this.vz[i])
        rot = Math.atan2(tmp.dot(up), tmp.dot(right))
      }
      // Fast pop-in, a cushioned size ease-out and a short taper give every puff a soft,
      // hand-animated feel instead of the constant-size "particle emitter" look.
      const env = Math.min(1, k * 10) * Math.min(1, (1 - k) * 2.5)
      const ease = 1 - (1 - k) * (1 - k)
      const pulse = this.pulse[i] ? 0.9 + 0.1 * Math.sin(k * Math.PI * this.pulse[i]) : 1
      const s = this.size[i] * Math.max(0.05, 1 + this.grow[i] * ease) * pulse
      P[i * 3] = this.px[i]; P[i * 3 + 1] = this.py[i]; P[i * 3 + 2] = this.pz[i]
      D[i * 4] = s; D[i * 4 + 1] = rot; D[i * 4 + 2] = this.cell[i]; D[i * 4 + 3] = this.flat[i]
      C[i * 4] = this.r[i]; C[i * 4 + 1] = this.g[i]; C[i * 4 + 2] = this.b[i]; C[i * 4 + 3] = this.a[i] * env
    }
    this.geo.instanceCount = this.n
    for (const [attr, size] of [[this.aPos, 3], [this.aData, 4], [this.aColor, 4]] as const) {
      attr.clearUpdateRanges()
      attr.addUpdateRange(0, Math.max(1, this.n) * size)
      attr.needsUpdate = true
    }
    this.mat.uniforms.uRight.value.copy(right)
    this.mat.uniforms.uUp.value.copy(up)
  }
}

export type Burst = 'wood' | 'stone' | 'crystal' | 'dirt' | 'sand' | 'soft' | 'blood' | 'hollow' | 'place' | 'build' | 'remove'

type Prop = { obj: THREE.Object3D; t: number; dur: number; kind: 'fall' | 'shrink' | 'pop'; axis: THREE.Vector3; base: THREE.Quaternion; onDone?: () => void; landed?: boolean; height: number }

const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)]
const col = new THREE.Color()
const UP = new THREE.Vector3(0, 1, 0)

export class Fx {
  readonly group = new THREE.Group()
  readonly texture: THREE.Texture
  private lit: Layer
  private glow: Layer
  private props: Prop[] = []
  private light = 1
  private ambientIn = 0.2
  /** Scales VFX density (quality/reduced-motion). */
  density = 1
  /** Ground height lookup so debris settles on terrain. */
  ground: (x: number, z: number) => number = () => -1e9
  onPropLanded?: (at: THREE.Vector3, size: number) => void
  private right = new THREE.Vector3(1, 0, 0)
  private up = new THREE.Vector3(0, 1, 0)
  private q = new THREE.Quaternion()
  constructor() {
    this.texture = new THREE.TextureLoader().load('./assets/vfx/particles.png')
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.lit = new Layer(this.texture, false)
    this.glow = new Layer(this.texture, true)
    this.group.add(this.lit.mesh, this.glow.mesh)
  }

  /** Live particle count (busy-detection for the background loader). */
  get active(): number {
    return this.lit.n + this.glow.n + this.props.length * 8
  }

  clear(): void {
    this.lit.clear()
    this.glow.clear()
  }

  setLight(k: number): void {
    this.light = k
    this.lit.mat.uniforms.uLight.value = k
  }

  private count(n: number): number {
    const v = n * this.density
    return Math.floor(v) + (Math.random() < v % 1 ? 1 : 0)
  }

  private emit(layer: Layer, e: Emit, color: THREE.ColorRepresentation, vary = 0.15): void {
    col.set(color)
    const m = 1 - vary + Math.random() * vary * 2
    e.r = col.r * m
    e.g = col.g * m
    e.b = col.b * m
    layer.add(e)
  }

  /** Subtle life around the player: drifting pollen by day and warm firefly bokeh after dusk. */
  private ambient(at: THREE.Vector3, dt: number): void {
    this.ambientIn -= dt
    if (this.ambientIn > 0 || this.density <= 0) return
    const night = THREE.MathUtils.clamp((0.58 - this.light) / 0.3, 0, 1)
    const firefly = night > 0.22
    this.ambientIn = firefly ? rnd(0.16, 0.32) : rnd(0.36, 0.7)
    const c = this.count(firefly ? 1 + night * 1.4 : 0.65)
    for (let i = 0; i < c; i++) {
      const near = firefly ? 7 : 9
      this.emit(this.glow, {
        x: at.x + rnd(-near, near), y: at.y + (firefly ? rnd(-1.05, 1.7) : rnd(-0.7, 2.7)), z: at.z + rnd(-near, near),
        vx: rnd(-0.16, 0.16), vy: firefly ? rnd(-0.04, 0.14) : rnd(0.04, 0.18), vz: rnd(-0.16, 0.16),
        life: firefly ? rnd(2.3, 4.4) : rnd(2.5, 4.5), size: firefly ? rnd(0.08, 0.15) : rnd(0.035, 0.07),
        cell: firefly ? CELL.glow : CELL.dot, r: 1, g: 1, b: 1, a: firefly ? 0.62 : 0.3,
        drag: 1.15, flutter: firefly ? 0.75 : 0.35, pulse: firefly ? rnd(3, 6) : 2,
      }, firefly ? pick([0xffd56b, 0xffed9f, 0xffc45f]) : pick([0xffefb4, 0xf7e2b0, 0xd9f0b6]), 0.08)
    }
    // One rare leaf makes a breezy clearing feel alive without permanently filling the pool.
    if (!firefly && Math.random() < 0.13 * this.density) this.leaves(at, 1, 6, pick([0xc9dc7a, 0xb7cf75, 0xf0d78d]))
  }

  /** Radial spray of debris sprites off a surface. */
  private spray(at: THREE.Vector3, n: THREE.Vector3, cells: readonly number[], color: THREE.ColorRepresentation, count: number, size: number, speed = 4, life = 0.9): void {
    const floor = this.ground(at.x, at.z) + 0.03
    for (let i = 0, c = this.count(count); i < c; i++) {
      const sp = speed * rnd(0.5, 1.2)
      this.emit(this.lit, {
        x: at.x + n.x * 0.06, y: at.y + n.y * 0.06, z: at.z + n.z * 0.06,
        vx: n.x * sp + rnd(-2.4, 2.4), vy: n.y * sp + rnd(1, 4), vz: n.z * sp + rnd(-2.4, 2.4),
        life: life * rnd(0.7, 1.3), size: size * rnd(0.6, 1.3), cell: pick(cells), r: 1, g: 1, b: 1,
        spin: rnd(-14, 14), gravity: -15, drag: 0.8, floorY: floor,
      }, color, 0.2)
    }
  }

  private puff(at: THREE.Vector3, color: THREE.ColorRepresentation, count: number, size: number, rise = 0.6, life = 1.2, alpha = 0.55, spread = 0.5): void {
    for (let i = 0, c = this.count(count); i < c; i++) {
      this.emit(this.lit, {
        x: at.x + rnd(-spread, spread), y: at.y + rnd(-0.1, 0.25), z: at.z + rnd(-spread, spread),
        vx: rnd(-0.8, 0.8), vy: rise * rnd(0.5, 1.4), vz: rnd(-0.8, 0.8),
        life: life * rnd(0.7, 1.3), size: size * rnd(0.7, 1.2), grow: 1.4, cell: pick([CELL.smoke1, CELL.smoke2, CELL.dust]), r: 1, g: 1, b: 1, a: alpha,
        spin: rnd(-0.8, 0.8), drag: 1.5,
      }, color, 0.08)
    }
  }

  sparks(at: THREE.Vector3, n: THREE.Vector3, count: number, color: THREE.ColorRepresentation = 0xffc070, speed = 7): void {
    for (let i = 0, c = this.count(count); i < c; i++) {
      const sp = speed * rnd(0.5, 1.3)
      this.emit(this.glow, {
        x: at.x, y: at.y, z: at.z,
        vx: n.x * sp + rnd(-3, 3), vy: n.y * sp + rnd(0, 4), vz: n.z * sp + rnd(-3, 3),
        life: rnd(0.2, 0.45), size: rnd(0.18, 0.32), cell: CELL.spark, r: 1, g: 1, b: 1, gravity: -14, drag: 1.2, stretch: true,
      }, color, 0.1)
    }
  }

  /** Material-aware hit burst (the "every hit feels like a hit" layer). */
  burst(kind: Burst, at: THREE.Vector3, n: THREE.Vector3, power = 1): void {
    const p = power
    switch (kind) {
      case 'wood':
        this.spray(at, n, [CELL.chip1, CELL.chip2, CELL.bark], 0xe8bb76, 7 * p, 0.13, 4.2)
        this.puff(at, 0xf3dfae, 3 * p, 0.5, 0.32, 0.82, 0.42, 0.18)
        break
      case 'stone':
        this.spray(at, n, [CELL.rock1, CELL.rock2], 0xb9b2a8, 6 * p, 0.12, 4.7)
        this.puff(at, 0xd7d0c5, 4 * p, 0.58, 0.38, 0.95, 0.48, 0.18)
        this.ring(at, 0xd8d0c4, 0.8 * p, 0.38, 0.32)
        break
      case 'crystal':
        this.spray(at, n, [CELL.crystal1, CELL.crystal2], 0x8fe9df, 7 * p, 0.14, 5.2)
        this.sparks(at, n, 6 * p, 0xb5fff0, 5.5)
        this.glint(at, 0xc2fff4, 2 * p, 0.48)
        break
      case 'dirt':
        this.spray(at, n, [CELL.dirt, CELL.dirt, CELL.rock2], 0xb99b78, 7 * p, 0.13, 3.8)
        this.puff(at, 0xc9ad89, 4 * p, 0.7, 0.35, 1.1, 0.46, 0.2)
        break
      case 'sand':
        this.spray(at, n, [CELL.dust, CELL.dirt], 0xe9d7ae, 6 * p, 0.16, 3.5)
        this.puff(at, 0xd8c49a, 4 * p, 0.7, 0.35, 1, 0.45, 0.2)
        break
      case 'soft':
        this.spray(at, n, [CELL.leaf, CELL.leaf, CELL.chip2], 0xd8e8a0, 6 * p, 0.1, 3)
        this.pollen(at, 4 * p)
        break
      case 'blood':
        this.spray(at, n, [CELL.dot, CELL.dot, CELL.dust], 0xd66c72, 6 * p, 0.1, 3.5, 0.55)
        this.puff(at, 0xcb7883, 3 * p, 0.46, 0.22, 0.65, 0.3, 0.12)
        break
      case 'hollow':
        this.puff(at, 0x8466a3, 5 * p, 0.72, 0.68, 1.1, 0.55, 0.18)
        this.sparks(at, n, 5 * p, 0x9ff8ef, 4.8)
        break
      case 'place':
        this.ring(at, 0xffdc8d, 1.6 * p, 0.52, 0.72)
        this.puff(at, 0xf3e6c8, 6 * p, 0.62, 0.22, 1, 0.46, 0.8)
        this.glint(at.clone().setY(at.y + 0.5), 0xffe2a8, 2, 0.4)
        break
      case 'build':
        this.puff(at, 0xf3e6c8, 3 * p, 0.52, 0.22, 0.8, 0.42, 0.5)
        break
      case 'remove':
        this.spray(at, n, [CELL.chip1, CELL.chip2, CELL.rock1], 0xd8c29d, 10 * p, 0.14, 3.9)
        this.puff(at, 0xe2d3b8, 5 * p, 0.8, 0.35, 1, 0.48, 0.5)
        break
    }
  }

  /** Legacy API: generic chips. */
  chips(at: THREE.Vector3, normal: THREE.Vector3, color: THREE.ColorRepresentation, count = 8, glow = false, size = 0.06): void {
    if (glow) this.burst('crystal', at, normal, count / 8)
    else this.spray(at, normal, [CELL.rock1, CELL.dirt, CELL.chip1], color, count, size * 3)
  }

  /** Floating leaves (tree hits and falls). */
  leaves(at: THREE.Vector3, count: number, spread = 3, color: THREE.ColorRepresentation = 0xffffff): void {
    const floor = this.ground(at.x, at.z) + 0.02
    for (let i = 0, c = this.count(count); i < c; i++) {
      this.emit(this.lit, {
        x: at.x + rnd(-spread, spread), y: at.y + rnd(-1, 1.5), z: at.z + rnd(-spread, spread),
        vx: rnd(-0.8, 0.8), vy: rnd(-0.4, 0.4), vz: rnd(-0.8, 0.8),
        life: rnd(2.2, 3.8), size: rnd(0.14, 0.22), cell: CELL.leaf, r: 1, g: 1, b: 1,
        spin: rnd(-3, 3), gravity: -1.2, drag: 1.4, flutter: 5, floorY: floor,
      }, color, 0.25)
    }
  }

  pollen(at: THREE.Vector3, count: number, color: THREE.ColorRepresentation = 0xfff2b0): void {
    const firefly = this.light < 0.5
    for (let i = 0, c = this.count(count); i < c; i++) {
      this.emit(this.glow, {
        x: at.x + rnd(-0.6, 0.6), y: at.y + rnd(0, 0.5), z: at.z + rnd(-0.6, 0.6),
        vx: rnd(-0.35, 0.35), vy: firefly ? rnd(-0.02, 0.2) : rnd(0.12, 0.42), vz: rnd(-0.35, 0.35),
        life: firefly ? rnd(1.7, 3) : rnd(1.2, 2.4), size: firefly ? rnd(0.08, 0.13) : rnd(0.05, 0.09),
        cell: firefly ? CELL.glow : CELL.dot, r: 1, g: 1, b: 1, a: firefly ? 0.62 : 0.48, drag: 1, flutter: firefly ? 1.1 : 1.8, pulse: firefly ? rnd(3, 5) : 2,
      }, firefly ? 0xffdd78 : color, 0.1)
    }
  }

  /** Star/glow glints (crystals, crafting, pickups). */
  glint(at: THREE.Vector3, color: THREE.ColorRepresentation, count = 2, size = 0.45): void {
    for (let i = 0, c = this.count(count); i < c; i++) {
      this.emit(this.glow, {
        x: at.x + rnd(-0.2, 0.2), y: at.y + rnd(-0.1, 0.3), z: at.z + rnd(-0.2, 0.2),
        vx: 0, vy: rnd(0.2, 0.6), vz: 0,
        life: rnd(0.45, 0.72), size: size * rnd(0.62, 0.9), cell: i % 2 ? CELL.glow : CELL.star, r: 1, g: 1, b: 1, spin: rnd(-1.2, 1.2), grow: 0.16, pulse: 5,
      }, color, 0.05)
    }
  }

  /** Expanding flat ring on the ground (placement, shockwaves, level-ups). */
  ring(at: THREE.Vector3, color: THREE.ColorRepresentation, radius = 2, life = 0.6, alpha = 1): void {
    this.emit(this.glow, {
      x: at.x, y: at.y + 0.06, z: at.z, vx: 0, vy: 0, vz: 0,
      life, size: radius * 0.3, grow: 2.3, cell: CELL.ring, r: 1, g: 1, b: 1, a: alpha, flat: true, rot: 0,
    }, color, 0)
  }

  /** Big impact: boss slam / roar. */
  shockwave(at: THREE.Vector3, radius = 7): void {
    this.ring(at, 0xffb070, radius, 0.7)
    this.ring(at, 0xfff0d0, radius * 0.6, 0.45, 0.7)
    this.puff(at, 0x9a8a74, 14, 1.3, 0.8, 1.6, 0.55, radius * 0.35)
    this.spray(at, UP, [CELL.rock1, CELL.rock2, CELL.dirt], 0xd8ccb8, 16, 0.25, 7)
  }

  /** Creature death: dust + soul motes (night creatures) or a quiet puff (wildlife). */
  death(at: THREE.Vector3, night: boolean, size = 1): void {
    if (night) {
      this.puff(at, 0x8466a3, 11 * size, 0.9 * size, 0.78, 1.65, 0.62, 0.45 * size)
      for (let i = 0, c = this.count(12 * size); i < c; i++) {
        this.emit(this.glow, {
          x: at.x + rnd(-0.5, 0.5) * size, y: at.y + rnd(0, 1.4) * size, z: at.z + rnd(-0.5, 0.5) * size,
          vx: rnd(-0.4, 0.4), vy: rnd(1, 2.6), vz: rnd(-0.4, 0.4),
          life: rnd(0.8, 1.55), size: rnd(0.12, 0.23), cell: i % 3 ? CELL.star : CELL.glow, r: 1, g: 1, b: 1, drag: 0.8, flutter: 2, pulse: 4,
        }, pick([0xaef8ff, 0xd9b4ff, 0xffd294]), 0.1)
      }
      this.ring(at, 0xbea7e8, 1.6 * size, 0.6, 0.62)
    } else {
      this.puff(at, 0xe7c9a5, 7 * size, 0.72, 0.35, 1.2, 0.45, 0.4)
      this.pollen(at, 3)
    }
  }

  /** Burning away at dawn: flames + embers rising. */
  burn(at: THREE.Vector3, height = 1.8): void {
    for (let i = 0, c = this.count(10); i < c; i++) {
      this.emit(this.glow, {
        x: at.x + rnd(-0.35, 0.35), y: at.y + rnd(0, height), z: at.z + rnd(-0.35, 0.35),
        vx: rnd(-0.3, 0.3), vy: rnd(1, 2.4), vz: rnd(-0.3, 0.3),
        life: rnd(0.5, 1), size: rnd(0.35, 0.6), cell: CELL.flame, r: 1, g: 1, b: 1, rot: rnd(-0.3, 0.3), drag: 1, pulse: 3,
      }, 0xffbd62, 0.1)
    }
    this.embers(at.clone().setY(at.y + height * 0.5), 8)
    this.puff(at.clone().setY(at.y + height * 0.6), 0x3a3230, 5, 0.8, 1.2, 1.5, 0.5, 0.3)
  }

  /** Small orbs that fly into the player to show collected items. */
  collect(at: THREE.Vector3, color: THREE.ColorRepresentation, count = 4): void {
    for (let i = 0, c = Math.max(1, this.count(count)); i < c; i++) {
      this.emit(this.glow, {
        x: at.x + rnd(-0.2, 0.2), y: at.y + rnd(0, 0.4), z: at.z + rnd(-0.2, 0.2),
        vx: rnd(-2.5, 2.5), vy: rnd(2, 4.5), vz: rnd(-2.5, 2.5),
        life: 1, size: 0.2, cell: CELL.glow, r: 1, g: 1, b: 1, home: true,
      }, color, 0.05)
    }
  }

  /** Rising embers (campfires, torches, dawn burn). */
  embers(at: THREE.Vector3, count = 1): void {
    for (let i = 0, c = Math.max(count > 0 ? 1 : 0, this.count(count)); i < c; i++) {
      this.emit(this.glow, {
        x: at.x + rnd(-0.18, 0.18), y: at.y, z: at.z + rnd(-0.18, 0.18),
        vx: rnd(-0.3, 0.3), vy: rnd(0.9, 2.1), vz: rnd(-0.3, 0.3),
        life: rnd(1, 2), size: rnd(0.07, 0.13), cell: CELL.ember, r: 1, g: 1, b: 1, drag: 0.4, flutter: 2.5, pulse: 3,
      }, pick([0xffad4d, 0xffd77a, 0xff8f46]), 0.1)
    }
  }

  /** Campfire flame tongues + smoke column (called at ~8 Hz per visible fire). */
  fire(at: THREE.Vector3, strength = 1): void {
    for (let i = 0, c = Math.max(1, this.count(2 * strength)); i < c; i++) {
      this.emit(this.glow, {
        x: at.x + rnd(-0.15, 0.15), y: at.y + rnd(0, 0.1), z: at.z + rnd(-0.15, 0.15),
        vx: rnd(-0.1, 0.1), vy: rnd(0.8, 1.4), vz: rnd(-0.1, 0.1),
        life: rnd(0.35, 0.6), size: rnd(0.35, 0.55) * strength, grow: -0.45, cell: CELL.flame, r: 1, g: 1, b: 1, rot: rnd(-0.25, 0.25), drag: 1.5, pulse: 3,
      }, pick([0xffbf5e, 0xff9746, 0xffd982]), 0.05)
    }
    if (Math.random() < 0.35) this.puff(at.clone().setY(at.y + 0.9), 0x5a5048, 1, 0.6, 1.1, 2.6, 0.22, 0.1)
    if (Math.random() < 0.5) this.embers(at.clone().setY(at.y + 0.3), 1)
  }

  /** Arrow flight trail mote. */
  trail(at: THREE.Vector3): void {
    this.emit(this.glow, { x: at.x, y: at.y, z: at.z, vx: 0, vy: 0, vz: 0, life: 0.28, size: 0.16, cell: CELL.spark, r: 1, g: 1, b: 1, a: 0.28, rot: Math.random() * Math.PI, grow: -0.32 }, 0xfff5dc, 0)
  }

  /** Level-up / skill burst around the player. */
  levelUp(at: THREE.Vector3): void {
    this.ring(at, 0xffd88a, 2.4, 0.9)
    for (let i = 0, c = this.count(18); i < c; i++) {
      const a = (i / 18) * Math.PI * 2
      this.emit(this.glow, {
        x: at.x + Math.cos(a) * 0.8, y: at.y + rnd(0, 0.3), z: at.z + Math.sin(a) * 0.8,
        vx: Math.cos(a) * 0.4, vy: rnd(1.5, 3), vz: Math.sin(a) * 0.4,
        life: rnd(0.9, 1.4), size: rnd(0.15, 0.3), cell: i % 3 ? CELL.star : CELL.glow, r: 1, g: 1, b: 1, spin: rnd(-2, 2), drag: 0.8, pulse: 4,
      }, pick([0xffe6a0, 0xffc860, 0xfff4d8]), 0.05)
    }
  }

  /** Footstep dust when sprinting/landing. */
  footDust(at: THREE.Vector3, color: THREE.ColorRepresentation, amount = 1): void {
    this.puff(at, color, 2 * amount, 0.35, 0.25, 0.7, 0.35 * Math.min(1, amount), 0.25)
  }

  /** Water splash. */
  splash(at: THREE.Vector3, amount = 1): void {
    this.ring(at, 0xd8f0ff, 1.2 * amount, 0.6, 0.6)
    this.spray(at, UP, [CELL.dot, CELL.dot], 0xe8f6ff, 10 * amount, 0.1, 4, 0.6)
  }

  /** Animate a detached object (felled tree, broken rock, removed piece) then dispose it. */
  animateProp(obj: THREE.Object3D, kind: Prop['kind'], away?: THREE.Vector3, onDone?: () => void, height = 5): void {
    const axis = new THREE.Vector3(0, 1, 0)
    if (away) axis.set(away.z, 0, -away.x).normalize()
    this.group.add(obj)
    this.props.push({ obj, t: 0, dur: kind === 'fall' ? 2.2 : kind === 'pop' ? 0.25 : 0.4, kind, axis, base: obj.quaternion.clone(), onDone, height })
  }

  update(dt: number, player: THREE.Vector3, camera?: THREE.Camera): void {
    if (camera) {
      this.right.setFromMatrixColumn(camera.matrixWorld, 0).normalize()
      this.up.setFromMatrixColumn(camera.matrixWorld, 1).normalize()
    }
    this.ambient(player, dt)
    this.lit.update(dt, player, this.right, this.up)
    this.glow.update(dt, player, this.right, this.up)
    for (let i = this.props.length - 1; i >= 0; i--) {
      const p = this.props[i]
      p.t += dt
      const k = Math.min(1, p.t / p.dur)
      if (p.kind === 'fall') {
        // Accelerating topple, a small bounce on impact, then sink away.
        const fk = Math.min(1, p.t / 1.25)
        let a = fk * fk * (Math.PI / 2 - 0.08)
        if (fk >= 1) {
          if (!p.landed) {
            p.landed = true
            const top = tmp.set(0, p.height * 0.6, 0).applyQuaternion(p.obj.quaternion).add(p.obj.position)
            this.onPropLanded?.(top.clone(), p.height / 5)
          }
          const bt = p.t - 1.25
          a -= Math.sin(Math.min(1, bt / 0.3) * Math.PI) * 0.06
        }
        p.obj.quaternion.copy(p.base).premultiply(this.q.setFromAxisAngle(p.axis, a))
        if (k > 0.8) p.obj.scale.setScalar(Math.max(0.001, 1 - (k - 0.8) * 5))
      } else if (p.kind === 'shrink') {
        p.obj.scale.setScalar(Math.max(0.001, 1 - k * k))
        p.obj.position.y -= dt * 0.6
      } else {
        const s = k < 0.3 ? 1 + k : Math.max(0.001, 1.3 * (1 - (k - 0.3) / 0.7))
        p.obj.scale.setScalar(s)
      }
      if (k >= 1) {
        this.group.remove(p.obj)
        p.obj.traverse((o) => {
          if (o instanceof THREE.Mesh && o.userData.disposable) o.geometry.dispose()
        })
        p.onDone?.()
        this.props.splice(i, 1)
      }
    }
  }
}
