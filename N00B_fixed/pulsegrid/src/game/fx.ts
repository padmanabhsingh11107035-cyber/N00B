import * as THREE from 'three'

/**
 * World VFX: pooled point-sprite particles textured from the Kenney Particle Pack atlas (CC0,
 * 5x5 cells of 256 px; order in scripts/assets/build-images.py). Two pools: additive (sparks,
 * stars, flares, embers, pyro) and alpha-blended (confetti, CO2, smoke). Sustained emitters
 * drive pyro gerbs, CO2 jets and Fever embers; dust motes float through the beams at all times.
 * `active` feeds the background loader's calm gate.
 */
export const CELL = {
  spark1: 0, spark2: 1, spark4: 2, spark5: 3, star1: 4, star4: 5, star6: 6, star8: 7,
  flare: 8, light1: 9, light3: 10, magic2: 11, magic4: 12, circle: 13, trace: 14, twirl: 15,
  smoke: 16, symbol: 17, square: 18, scorch: 19, slash: 20,
} as const

type Spec = {
  count: number
  pos: THREE.Vector3
  spread?: number
  speed: [number, number]
  dir?: THREE.Vector3
  /** 0 = exactly along dir, 1 = full sphere. */
  cone?: number
  gravity?: number
  drag?: number
  life: [number, number]
  size: [number, number]
  color: THREE.ColorRepresentation | THREE.ColorRepresentation[]
  alpha?: number
  cell: number | number[]
  spin?: number
  flutter?: boolean
}

const vert = /* glsl */ `
  attribute vec4 aColor;
  attribute vec4 aData; // size, cell, rotation, flutter phase
  uniform float uScale;
  varying vec4 vColor;
  varying vec3 vData;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aData.x * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
    vColor = aColor;
    vData = aData.yzw;
  }`
const frag = /* glsl */ `
  uniform sampler2D uAtlas;
  varying vec4 vColor;
  varying vec3 vData;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float c = cos(vData.y), s = sin(vData.y);
    p = mat2(c, -s, s, c) * p;
    if (vData.z != 0.0) { p.y /= max(0.15, abs(cos(vData.z))); }
    if (abs(p.x) > 0.5 || abs(p.y) > 0.5) discard;
    float cell = vData.x;
    vec2 off = vec2(mod(cell, 5.0), 4.0 - floor(cell / 5.0)) * 0.2;
    vec4 tex = texture2D(uAtlas, off + (vec2(p.x, -p.y) + 0.5) * 0.2);
    float a = tex.a * vColor.a;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor.rgb * tex.rgb, a);
    #include <colorspace_fragment>
  }`

class Pool {
  readonly points: THREE.Points
  readonly mat: THREE.ShaderMaterial
  count = 0
  private readonly pos: Float32Array
  private readonly col: Float32Array
  private readonly data: Float32Array
  private readonly vel: Float32Array
  private readonly life: Float32Array
  private readonly phys: Float32Array
  private readonly sizes: Float32Array
  private readonly flutter: Uint8Array
  private readonly geo = new THREE.BufferGeometry()

  constructor(readonly max: number, atlas: THREE.Texture, additive: boolean) {
    this.pos = new Float32Array(max * 3)
    this.col = new Float32Array(max * 4)
    this.data = new Float32Array(max * 4)
    this.vel = new Float32Array(max * 3)
    this.life = new Float32Array(max * 2)
    this.phys = new Float32Array(max * 4)
    this.sizes = new Float32Array(max * 2)
    this.flutter = new Uint8Array(max)
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage))
    this.geo.setAttribute('aData', new THREE.BufferAttribute(this.data, 4).setUsage(THREE.DynamicDrawUsage))
    this.geo.setDrawRange(0, 0)
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uAtlas: { value: atlas }, uScale: { value: 600 } },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    })
    this.points = new THREE.Points(this.geo, this.mat)
    this.points.frustumCulled = false
    this.points.renderOrder = additive ? 6 : 5
  }

  spawn(p: THREE.Vector3, v: THREE.Vector3, life: number, s0: number, s1: number, color: THREE.Color, alpha: number, cell: number, gravity: number, drag: number, spin: number, flutter: boolean) {
    if (this.count >= this.max) return
    const i = this.count++
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z
    this.life[i * 2] = 0
    this.life[i * 2 + 1] = life
    this.sizes[i * 2] = s0
    this.sizes[i * 2 + 1] = s1
    this.col[i * 4] = color.r; this.col[i * 4 + 1] = color.g; this.col[i * 4 + 2] = color.b; this.col[i * 4 + 3] = 0
    this.data[i * 4] = s0
    this.data[i * 4 + 1] = cell
    this.data[i * 4 + 2] = Math.random() * 6.28
    this.data[i * 4 + 3] = flutter ? 0.001 + Math.random() * 6.28 : 0
    this.phys[i * 4] = gravity; this.phys[i * 4 + 1] = drag; this.phys[i * 4 + 2] = spin; this.phys[i * 4 + 3] = alpha
    this.flutter[i] = flutter ? 1 : 0
  }

  private move(from: number, to: number) {
    this.pos.copyWithin(to * 3, from * 3, from * 3 + 3)
    this.vel.copyWithin(to * 3, from * 3, from * 3 + 3)
    this.life.copyWithin(to * 2, from * 2, from * 2 + 2)
    this.sizes.copyWithin(to * 2, from * 2, from * 2 + 2)
    this.col.copyWithin(to * 4, from * 4, from * 4 + 4)
    this.data.copyWithin(to * 4, from * 4, from * 4 + 4)
    this.phys.copyWithin(to * 4, from * 4, from * 4 + 4)
    this.flutter[to] = this.flutter[from]
  }

  update(dt: number) {
    let i = 0
    while (i < this.count) {
      const age = (this.life[i * 2] += dt)
      const max = this.life[i * 2 + 1]
      if (age >= max) {
        this.count--
        if (i !== this.count) this.move(this.count, i)
        continue
      }
      const u = age / max
      const drag = Math.exp(-this.phys[i * 4 + 1] * dt)
      const o = i * 3
      this.vel[o] *= drag
      this.vel[o + 1] = this.vel[o + 1] * drag + this.phys[i * 4] * dt
      this.vel[o + 2] *= drag
      if (this.flutter[i]) {
        this.vel[o] += Math.sin(age * 5 + i) * dt * 1.5
        this.vel[o + 1] = Math.max(this.vel[o + 1], -1.1)
        this.data[i * 4 + 3] += dt * 9
      }
      this.pos[o] += this.vel[o] * dt
      this.pos[o + 1] += this.vel[o + 1] * dt
      this.pos[o + 2] += this.vel[o + 2] * dt
      if (this.pos[o + 1] < 0.01 && this.vel[o + 1] < 0) {
        this.pos[o + 1] = 0.01
        this.vel[o + 1] *= -0.25
        this.vel[o] *= 0.5
        this.vel[o + 2] *= 0.5
      }
      this.data[i * 4] = this.sizes[i * 2] + (this.sizes[i * 2 + 1] - this.sizes[i * 2]) * u
      this.data[i * 4 + 2] += this.phys[i * 4 + 2] * dt
      const fadeIn = Math.min(1, age / 0.05)
      const fadeOut = u > 0.65 ? 1 - (u - 0.65) / 0.35 : 1
      this.col[i * 4 + 3] = this.phys[i * 4 + 3] * fadeIn * fadeOut
      i++
    }
    this.geo.setDrawRange(0, this.count)
    for (const name of ['position', 'aColor', 'aData']) {
      const a = this.geo.getAttribute(name) as THREE.BufferAttribute
      a.needsUpdate = true
    }
  }

  clear() {
    this.count = 0
    this.geo.setDrawRange(0, 0)
  }
}

function cellTexture(atlas: THREE.Texture, cell: number): THREE.Texture {
  const t = atlas.clone()
  t.repeat.set(0.2, 0.2)
  t.offset.set((cell % 5) * 0.2, 1 - (Math.floor(cell / 5) + 1) * 0.2)
  t.needsUpdate = true
  return t
}

type Emitter = { kind: 'fountain' | 'co2'; at: THREE.Vector3; left: number; acc: number; color: THREE.Color }

export class Effects {
  readonly group = new THREE.Group()
  /** Particle count multiplier (reduced motion / low quality → 0.5). */
  scale = 1
  private readonly add: Pool
  private readonly alpha: Pool
  private readonly emitters: Emitter[] = []
  private readonly rings: Array<{ mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; t: number; dur: number; scale: number }> = []
  private readonly dust: THREE.Points
  private readonly dustVel: Float32Array
  private readonly r = new THREE.Vector3()
  private readonly vv = new THREE.Vector3()
  private readonly pp = new THREE.Vector3()
  private readonly up = new THREE.Vector3(0, 1, 0)
  private readonly tmp = new THREE.Vector3()
  private readonly colors: THREE.Color[] = []
  private emberOn = false
  private emberColors = [new THREE.Color('#ff7a3d'), new THREE.Color('#ff3fb8'), new THREE.Color('#ffd27a')]

  constructor(atlas: THREE.Texture) {
    this.add = new Pool(1600, atlas, true)
    this.alpha = new Pool(700, atlas, false)
    this.group.add(this.alpha.points, this.add.points)
    const ringTex = cellTexture(atlas, CELL.circle)
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
      mesh.rotation.x = -Math.PI / 2
      mesh.visible = false
      mesh.renderOrder = 4
      this.group.add(mesh)
      this.rings.push({ mesh, mat, t: 0, dur: 1, scale: 1 })
    }
    const N = 260
    const p = new Float32Array(N * 3)
    this.dustVel = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) {
      p[i * 3] = (Math.random() - 0.5) * 14
      p[i * 3 + 1] = 0.3 + Math.random() * 5.8
      p[i * 3 + 2] = -3 + Math.random() * 6.5
      this.dustVel[i * 3] = (Math.random() - 0.5) * 0.05
      this.dustVel[i * 3 + 1] = (Math.random() - 0.3) * 0.04
      this.dustVel[i * 3 + 2] = (Math.random() - 0.5) * 0.05
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(p, 3))
    this.dust = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.05, map: cellTexture(atlas, CELL.light1), color: '#b9b2ff', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }))
    this.dust.frustumCulled = false
    this.group.add(this.dust)
  }

  /** Live particle count (feeds the calm gate and budgets). */
  get active(): number {
    return this.add.count + this.alpha.count
  }

  /** Pixel scale for point sizes: viewport height / (2 tan(fov/2)). */
  setViewport(heightPx: number, fovDeg: number): void {
    const s = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2))
    this.add.mat.uniforms.uScale.value = s
    this.alpha.mat.uniforms.uScale.value = s
  }

  emit(spec: Spec, additive = true): void {
    const pool = additive ? this.add : this.alpha
    const n = Math.max(spec.count > 0 ? 1 : 0, Math.round(spec.count * this.scale))
    const list = Array.isArray(spec.color) ? spec.color : [spec.color]
    while (this.colors.length < list.length) this.colors.push(new THREE.Color())
    list.forEach((c, i) => this.colors[i].set(c))
    const cells = Array.isArray(spec.cell) ? spec.cell : [spec.cell]
    const dir = spec.dir ?? this.up
    const cone = spec.cone ?? 1
    for (let i = 0; i < n; i++) {
      this.r.randomDirection()
      this.vv.copy(dir).normalize().multiplyScalar(1 - cone).addScaledVector(this.r, cone).normalize()
      this.vv.multiplyScalar(spec.speed[0] + Math.random() * (spec.speed[1] - spec.speed[0]))
      this.pp.copy(spec.pos)
      if (spec.spread) this.pp.add(this.tmp.randomDirection().multiplyScalar(Math.random() * spec.spread))
      const life = spec.life[0] + Math.random() * (spec.life[1] - spec.life[0])
      const j = 0.7 + Math.random() * 0.6
      pool.spawn(this.pp, this.vv, life, spec.size[0] * j, spec.size[1] * j, this.colors[i % list.length], spec.alpha ?? 1, cells[i % cells.length], spec.gravity ?? 0, spec.drag ?? 0.5, (Math.random() - 0.5) * (spec.spin ?? 2), !!spec.flutter)
    }
  }

  sparkle(at: THREE.Vector3, count: number, color: THREE.ColorRepresentation): void {
    this.emit({ count, pos: at, spread: 0.3, speed: [2, 5], cone: 0.75, gravity: -5, drag: 1.2, life: [0.5, 1.1], size: [0.22, 0.02], color: [color, '#ffffff'], cell: [CELL.star1, CELL.star4, CELL.spark1, CELL.flare], spin: 5 })
  }

  /** Flare core + radial spark burst (Perfect / finish). */
  starburst(at: THREE.Vector3, color: THREE.ColorRepresentation, power = 1): void {
    // Small, short flare core so the burst never hides the dancer (especially in close-ups).
    this.emit({ count: 2, pos: at, speed: [0, 0.1], life: [0.2, 0.3], size: [0.45 * power, 0.8 * power], color, alpha: 0.35, cell: CELL.flare, spin: 1 })
    this.emit({ count: Math.round(34 * power), pos: at, speed: [3, 8 * power], cone: 1, gravity: -3, drag: 2.2, life: [0.45, 0.9], size: [0.16, 0.02], color: [color, '#fff6d8'], cell: [CELL.spark1, CELL.spark2, CELL.star6], spin: 8 })
  }

  confetti(at: THREE.Vector3, count: number, colors: THREE.ColorRepresentation[], power = 1): void {
    this.emit({ count, pos: at, spread: 0.6, speed: [3 * power, 7.5 * power], dir: this.tmp.set(0, 1, 0.25), cone: 0.55, gravity: -3.2, drag: 1.4, life: [2.6, 4.2], size: [0.13, 0.11], color: colors, cell: CELL.square, spin: 6, flutter: true }, false)
  }

  shockwave(at: THREE.Vector3, color: THREE.ColorRepresentation, scale = 4, dur = 0.7): void {
    const r = this.rings.find((x) => !x.mesh.visible) ?? this.rings[0]
    r.mesh.visible = true
    r.mesh.position.set(at.x, 0.03, at.z)
    r.mat.color.set(color)
    r.t = 0
    r.dur = dur
    r.scale = scale
  }

  /** Small sparkle trail; call per frame on a moving source (e.g. a hand bone). */
  trail(at: THREE.Vector3, color: THREE.ColorRepresentation): void {
    this.emit({ count: 2, pos: at, spread: 0.04, speed: [0.1, 0.6], cone: 1, gravity: -0.6, drag: 1, life: [0.3, 0.55], size: [0.1, 0.01], color: [color, '#ffffff'], cell: [CELL.star1, CELL.light1], spin: 3 })
  }

  /** Dark smoke puff on a miss. */
  puff(at: THREE.Vector3, color: THREE.ColorRepresentation = '#5a2030'): void {
    this.emit({ count: 10, pos: at, spread: 0.3, speed: [0.3, 1.2], cone: 1, gravity: 0.3, drag: 1.5, life: [0.8, 1.3], size: [0.5, 1.4], color, alpha: 0.45, cell: CELL.smoke, spin: 0.6 }, false)
  }

  /** Pyro gerb spark fountain for `seconds`. */
  fountain(at: THREE.Vector3, seconds = 1.6, color: THREE.ColorRepresentation = '#ffc46a'): void {
    this.emitters.push({ kind: 'fountain', at: at.clone(), left: seconds, acc: 0, color: new THREE.Color(color) })
    this.emit({ count: 3, pos: this.tmp.copy(at).setY(0.25), speed: [0, 0.1], life: [0.25, 0.35], size: [1.1, 1.6], color, alpha: 0.55, cell: CELL.flare })
  }

  /** CO2 jet for `seconds`. */
  co2(at: THREE.Vector3, seconds = 0.8): void {
    this.emitters.push({ kind: 'co2', at: at.clone(), left: seconds, acc: 0, color: new THREE.Color('#e8ecff') })
  }

  /** Fever embers rising across the stage while on. */
  embers(on: boolean, colors?: THREE.ColorRepresentation[]): void {
    this.emberOn = on
    if (colors) this.emberColors = colors.map((c) => new THREE.Color(c))
  }

  clear(): void {
    this.add.clear()
    this.alpha.clear()
    this.emitters.length = 0
    this.emberOn = false
    for (const r of this.rings) r.mesh.visible = false
  }

  update(dt: number, beat = 0): void {
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i]
      e.left -= dt
      if (e.left <= 0) {
        this.emitters.splice(i, 1)
        continue
      }
      const rate = e.kind === 'fountain' ? 150 : 65
      e.acc += dt * rate * this.scale
      const n = Math.floor(e.acc)
      e.acc -= n
      if (!n) continue
      if (e.kind === 'fountain') {
        this.emit({ count: n, pos: e.at, spread: 0.04, speed: [6, 9.5], dir: this.tmp.set((Math.random() - 0.5) * 0.1, 1, 0), cone: 0.1, gravity: -9.5, drag: 0.4, life: [0.7, 1.3], size: [0.09, 0.02], color: [e.color, '#fff3c4'], cell: [CELL.spark1, CELL.spark4, CELL.light1], spin: 2 })
      } else {
        this.emit({ count: n, pos: e.at, spread: 0.05, speed: [8, 11], dir: this.tmp.set(0, 1, 0.05), cone: 0.06, gravity: 0.5, drag: 2.4, life: [1.1, 1.8], size: [0.35, 2.6], color: e.color, alpha: 0.3, cell: CELL.smoke, spin: 0.5 }, false)
      }
    }
    if (this.emberOn && this.active < 1300 && Math.random() < dt * 45 * this.scale) {
      const c = this.emberColors[Math.floor(Math.random() * this.emberColors.length)]
      this.emit({ count: 1, pos: this.pp.set((Math.random() - 0.5) * 13, 0.1, -2.5 + Math.random() * 5.5), speed: [0.6, 1.6], dir: this.up, cone: 0.25, gravity: 0.3, drag: 0.3, life: [2, 3.5], size: [0.08, 0.02], color: c, cell: CELL.light1, spin: 1 })
    }
    this.add.update(dt)
    this.alpha.update(dt)
    for (const r of this.rings) {
      if (!r.mesh.visible) continue
      r.t += dt
      const u = r.t / r.dur
      if (u >= 1) {
        r.mesh.visible = false
        continue
      }
      const s = 0.4 + (1 - Math.pow(1 - u, 3)) * r.scale
      r.mesh.scale.set(s, s, 1)
      r.mat.opacity = (1 - u) * 0.8
    }
    const p = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute
    const arr = p.array as Float32Array
    const sway = Math.sin(beat * Math.PI * 0.5) * 0.02
    for (let i = 0; i < p.count; i++) {
      arr[i * 3] += (this.dustVel[i * 3] + sway) * dt
      arr[i * 3 + 1] += this.dustVel[i * 3 + 1] * dt
      arr[i * 3 + 2] += this.dustVel[i * 3 + 2] * dt
      if (arr[i * 3 + 1] > 6.3) arr[i * 3 + 1] = 0.3
      if (arr[i * 3 + 1] < 0.2) arr[i * 3 + 1] = 6
      if (Math.abs(arr[i * 3]) > 7.5) arr[i * 3] *= -0.98
    }
    p.needsUpdate = true
  }
}
