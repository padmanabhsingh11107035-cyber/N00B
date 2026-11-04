/**
 * Pooled visual effects. Everything is instanced and allocation-free per frame:
 *  - two billboard particle systems (additive: fire/sparks/muzzle/glow; alpha: smoke/blood/dust)
 *    sampling texture atlases built from the generated VFX sprites + a few procedural shapes;
 *  - ground decals (blood pools, scorch marks, acid), blob shadows, health bars;
 *  - physical debris (gore chunks, brass casings, concrete, shield and glass shards);
 *  - bullet tracers (axis-aligned stretched billboards), lightning arcs;
 *  - ground telegraph shapes (ring / rectangle with a fill sweep) and shockwave rings;
 *  - DOM floating text (damage numbers, gate results) projected every frame.
 */
import * as THREE from 'three'

export type AddFrame = 'muzzle' | 'fireball' | 'sparks' | 'flame' | 'glow' | 'streak' | 'ring' | 'star'
export type AlphaFrame = 'smoke' | 'blood' | 'acid' | 'scorch' | 'dot' | 'blob' | 'shard' | 'drop'
const ADD_FRAMES: AddFrame[] = ['muzzle', 'fireball', 'sparks', 'flame', 'glow', 'streak', 'ring', 'star']
const ALPHA_FRAMES: AlphaFrame[] = ['smoke', 'blood', 'acid', 'scorch', 'dot', 'blob', 'shard', 'drop']

type Img = CanvasImageSource & { width: number; height: number }
function drawCell(ctx: CanvasRenderingContext2D, img: Img, i: number, cols: number, cell: number, flipped: boolean) {
  const x = (i % cols) * cell, y = Math.floor(i / cols) * cell
  ctx.save()
  if (flipped) { ctx.translate(x, y + cell); ctx.scale(1, -1); ctx.drawImage(img, 0, 0, cell, cell) }
  else ctx.drawImage(img, x, y, cell, cell)
  ctx.restore()
}
function proc(ctx: CanvasRenderingContext2D, kind: string, i: number, cols: number, cell: number) {
  const x = (i % cols) * cell, y = Math.floor(i / cols) * cell, c = cell / 2
  ctx.save()
  ctx.translate(x + c, y + c)
  const rg = (stops: [number, string][], r = c) => { const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r); for (const [o, s] of stops) g.addColorStop(o, s); return g }
  switch (kind) {
    case 'glow': ctx.fillStyle = rg([[0, 'rgba(255,255,255,1)'], [0.22, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]); ctx.fillRect(-c, -c, cell, cell); break
    case 'streak': {
      const g = ctx.createLinearGradient(-c, 0, c, 0)
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,0.8)'); g.addColorStop(0.92, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.ellipse(0, 0, c, c * 0.16, 0, 0, Math.PI * 2); ctx.fill()
      break
    }
    case 'ring': ctx.strokeStyle = 'rgba(255,255,255,1)'; ctx.lineWidth = cell * 0.045; ctx.shadowColor = '#fff'; ctx.shadowBlur = cell * 0.05
      ctx.beginPath(); ctx.arc(0, 0, c * 0.84, 0, Math.PI * 2); ctx.stroke(); break
    case 'star': {
      ctx.fillStyle = rg([[0, 'rgba(255,255,255,1)'], [0.12, 'rgba(255,255,255,0.7)'], [0.4, 'rgba(255,255,255,0)']])
      ctx.fillRect(-c, -c, cell, cell)
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      for (const a of [0, Math.PI / 2]) { ctx.save(); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, 0, c * 0.95, c * 0.05, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore() }
      break
    }
    case 'dot': ctx.fillStyle = rg([[0, 'rgba(255,255,255,1)'], [0.55, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]); ctx.beginPath(); ctx.arc(0, 0, c, 0, Math.PI * 2); ctx.fill(); break
    case 'blob': ctx.fillStyle = rg([[0, 'rgba(0,0,0,0.85)'], [0.5, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0)']]); ctx.beginPath(); ctx.arc(0, 0, c, 0, Math.PI * 2); ctx.fill(); break
    case 'shard': ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.moveTo(-c * 0.2, -c * 0.9); ctx.lineTo(c * 0.5, c * 0.3); ctx.lineTo(-c * 0.1, c * 0.85); ctx.lineTo(-c * 0.55, 0.1 * c); ctx.closePath(); ctx.fill(); break
    case 'drop': ctx.fillStyle = rg([[0, 'rgba(255,255,255,1)'], [0.6, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]); ctx.beginPath(); ctx.ellipse(0, 0, c * 0.45, c * 0.9, 0, 0, Math.PI * 2); ctx.fill(); break
  }
  ctx.restore()
}

// ───────────────────────── Billboard particle system ─────────────────────────
const PARTICLE_VS = /* glsl */`
  attribute vec3 aPos; attribute vec4 aData; attribute vec4 aCol;
  uniform vec2 uGrid; uniform float uFogNear; uniform float uFogFar;
  varying vec2 vUv; varying vec4 vCol; varying float vFog;
  void main() {
    vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    float c = cos(aData.y), s = sin(aData.y);
    vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * aData.x;
    vec3 wp = aPos + camR * p.x + camU * p.y;
    vec4 mv = viewMatrix * vec4(wp, 1.0);
    gl_Position = projectionMatrix * mv;
    float f = aData.w;
    vec2 cell = vec2(mod(f, uGrid.x), floor(f / uGrid.x));
    vUv = vec2((uv.x + cell.x) / uGrid.x, (uv.y + (uGrid.y - 1.0 - cell.y)) / uGrid.y);
    vCol = vec4(aCol.rgb, aData.z);
    vFog = smoothstep(uFogNear, uFogFar, -mv.z);
  }`
const PARTICLE_FS_ADD = /* glsl */`
  uniform sampler2D uMap; varying vec2 vUv; varying vec4 vCol; varying float vFog;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    vec3 c = t.rgb * t.a * vCol.rgb * vCol.a * (1.0 - vFog);
    gl_FragColor = vec4(c, 1.0);
  }`
const PARTICLE_FS_ALPHA = /* glsl */`
  uniform sampler2D uMap; uniform vec3 uFogColor; varying vec2 vUv; varying vec4 vCol; varying float vFog;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    float a = t.a * vCol.a;
    if (a < 0.01) discard;
    gl_FragColor = vec4(mix(t.rgb * vCol.rgb, uFogColor, vFog * 0.85), a);
  }`

export interface SpawnOpts { rot?: number; spin?: number; grav?: number; drag?: number; ground?: boolean; fadeIn?: number }
class Particles {
  readonly mesh: THREE.Mesh
  private geo: THREE.InstancedBufferGeometry
  private aPos: THREE.InstancedBufferAttribute
  private aData: THREE.InstancedBufferAttribute
  private aCol: THREE.InstancedBufferAttribute
  private f: Float32Array[]
  private px: Float32Array; private py: Float32Array; private pz: Float32Array
  private vx: Float32Array; private vy: Float32Array; private vz: Float32Array
  private life: Float32Array; private maxLife: Float32Array
  private s0: Float32Array; private s1: Float32Array; private rot: Float32Array; private spin: Float32Array
  private a0: Float32Array; private frame: Float32Array; private grav: Float32Array; private drag: Float32Array
  private cr: Float32Array; private cg: Float32Array; private cb: Float32Array; private fadeIn: Float32Array; private ground: Float32Array
  count = 0
  readonly uniforms: Record<string, THREE.IUniform>
  constructor(readonly cap: number, map: THREE.Texture, additive: boolean) {
    const base = new THREE.PlaneGeometry(1, 1)
    this.geo = new THREE.InstancedBufferGeometry()
    this.geo.index = base.index
    this.geo.setAttribute('position', base.getAttribute('position'))
    this.geo.setAttribute('uv', base.getAttribute('uv'))
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage)
    this.aData = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage)
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage)
    this.geo.setAttribute('aPos', this.aPos); this.geo.setAttribute('aData', this.aData); this.geo.setAttribute('aCol', this.aCol)
    this.geo.instanceCount = 0
    this.uniforms = {
      uMap: { value: map }, uGrid: { value: new THREE.Vector2(4, 2) },
      uFogNear: { value: 40 }, uFogFar: { value: 160 }, uFogColor: { value: new THREE.Color() },
    }
    const mat = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VS, fragmentShader: additive ? PARTICLE_FS_ADD : PARTICLE_FS_ALPHA,
      uniforms: this.uniforms, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    })
    this.mesh = new THREE.Mesh(this.geo, mat)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = additive ? 12 : 10
    const F = () => new Float32Array(cap)
    this.px = F(); this.py = F(); this.pz = F(); this.vx = F(); this.vy = F(); this.vz = F()
    this.life = F(); this.maxLife = F(); this.s0 = F(); this.s1 = F(); this.rot = F(); this.spin = F()
    this.a0 = F(); this.frame = F(); this.grav = F(); this.drag = F(); this.cr = F(); this.cg = F(); this.cb = F(); this.fadeIn = F(); this.ground = F()
    this.f = [this.px, this.py, this.pz, this.vx, this.vy, this.vz, this.life, this.maxLife, this.s0, this.s1, this.rot, this.spin,
      this.a0, this.frame, this.grav, this.drag, this.cr, this.cg, this.cb, this.fadeIn, this.ground]
  }
  spawn(frame: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number,
    size0: number, size1: number, color: THREE.Color, alpha: number, o?: SpawnOpts) {
    let i = this.count
    if (i >= this.cap) i = Math.floor(Math.random() * this.cap)
    else this.count++
    this.px[i] = x; this.py[i] = y; this.pz[i] = z; this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz
    this.life[i] = life; this.maxLife[i] = life; this.s0[i] = size0; this.s1[i] = size1
    this.rot[i] = o?.rot ?? Math.random() * Math.PI * 2; this.spin[i] = o?.spin ?? 0
    this.a0[i] = alpha; this.frame[i] = frame; this.grav[i] = o?.grav ?? 0; this.drag[i] = o?.drag ?? 0
    this.cr[i] = color.r; this.cg[i] = color.g; this.cb[i] = color.b
    this.fadeIn[i] = o?.fadeIn ?? 0; this.ground[i] = o?.ground ? 1 : 0
  }
  update(dt: number) {
    const P = this.aPos.array as Float32Array, D = this.aData.array as Float32Array, C = this.aCol.array as Float32Array
    let n = this.count
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt
      if (this.life[i] <= 0) {
        n--
        if (i !== n) for (const a of this.f) a[i] = a[n]
        i--
        continue
      }
      const k = Math.max(0, 1 - this.drag[i] * dt)
      this.vx[i] *= k; this.vy[i] = this.vy[i] * k - this.grav[i] * dt; this.vz[i] *= k
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt
      if (this.ground[i] > 0 && this.py[i] < 0.05) { this.py[i] = 0.05; this.vy[i] *= -0.3; this.vx[i] *= 0.6; this.vz[i] *= 0.6 }
      this.rot[i] += this.spin[i] * dt
      const t = 1 - this.life[i] / this.maxLife[i]
      const fi = this.fadeIn[i] > 0 ? Math.min(1, t / this.fadeIn[i]) : 1
      const a = this.a0[i] * fi * (1 - t * t)
      P[i * 3] = this.px[i]; P[i * 3 + 1] = this.py[i]; P[i * 3 + 2] = this.pz[i]
      D[i * 4] = this.s0[i] + (this.s1[i] - this.s0[i]) * t; D[i * 4 + 1] = this.rot[i]; D[i * 4 + 2] = a; D[i * 4 + 3] = this.frame[i]
      C[i * 4] = this.cr[i]; C[i * 4 + 1] = this.cg[i]; C[i * 4 + 2] = this.cb[i]
    }
    this.count = n
    this.geo.instanceCount = n
    this.aPos.needsUpdate = true; this.aData.needsUpdate = true; this.aCol.needsUpdate = true
  }
  clear() { this.count = 0; this.geo.instanceCount = 0 }
}

// ───────────────────────── Ground quads (decals, shadows) ─────────────────────────
const GROUND_VS = /* glsl */`
  attribute vec4 aQuad; attribute vec4 aCol; attribute float aFrame;
  uniform vec2 uGrid; uniform float uFogNear; uniform float uFogFar; uniform float uY;
  varying vec2 vUv; varying vec4 vCol; varying float vFog;
  void main() {
    float c = cos(aQuad.w), s = sin(aQuad.w);
    vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * aQuad.z;
    vec4 mv = viewMatrix * vec4(aQuad.x + p.x, uY, aQuad.y - p.y, 1.0);
    gl_Position = projectionMatrix * mv;
    vec2 cell = vec2(mod(aFrame, uGrid.x), floor(aFrame / uGrid.x));
    vUv = vec2((uv.x + cell.x) / uGrid.x, (uv.y + (uGrid.y - 1.0 - cell.y)) / uGrid.y);
    vCol = aCol;
    vFog = smoothstep(uFogNear, uFogFar, -mv.z);
  }`
const GROUND_FS = /* glsl */`
  uniform sampler2D uMap; varying vec2 vUv; varying vec4 vCol; varying float vFog;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    float a = t.a * vCol.a * (1.0 - vFog);
    if (a < 0.01) discard;
    gl_FragColor = vec4(t.rgb * vCol.rgb, a);
  }`
class GroundQuads {
  readonly mesh: THREE.Mesh
  private geo: THREE.InstancedBufferGeometry
  private aQuad: THREE.InstancedBufferAttribute
  private aCol: THREE.InstancedBufferAttribute
  private aFrame: THREE.InstancedBufferAttribute
  readonly uniforms: Record<string, THREE.IUniform>
  constructor(readonly cap: number, map: THREE.Texture, y: number, order: number) {
    const base = new THREE.PlaneGeometry(1, 1)
    this.geo = new THREE.InstancedBufferGeometry()
    this.geo.index = base.index
    this.geo.setAttribute('position', base.getAttribute('position'))
    this.geo.setAttribute('uv', base.getAttribute('uv'))
    this.aQuad = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage)
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage)
    this.aFrame = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage)
    this.geo.setAttribute('aQuad', this.aQuad); this.geo.setAttribute('aCol', this.aCol); this.geo.setAttribute('aFrame', this.aFrame)
    this.geo.instanceCount = 0
    this.uniforms = { uMap: { value: map }, uGrid: { value: new THREE.Vector2(4, 2) }, uFogNear: { value: 40 }, uFogFar: { value: 160 }, uY: { value: y } }
    const mat = new THREE.ShaderMaterial({
      vertexShader: GROUND_VS, fragmentShader: GROUND_FS,
      uniforms: this.uniforms, transparent: true, depthWrite: false,
    })
    this.mesh = new THREE.Mesh(this.geo, mat)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = order
  }
  set(i: number, x: number, z: number, size: number, rot: number, frame: number, r: number, g: number, b: number, a: number) {
    const Q = this.aQuad.array as Float32Array, C = this.aCol.array as Float32Array, F = this.aFrame.array as Float32Array
    Q[i * 4] = x; Q[i * 4 + 1] = z; Q[i * 4 + 2] = size; Q[i * 4 + 3] = rot
    C[i * 4] = r; C[i * 4 + 1] = g; C[i * 4 + 2] = b; C[i * 4 + 3] = a
    F[i] = frame
  }
  commit(n: number) {
    this.geo.instanceCount = n
    this.aQuad.needsUpdate = true; this.aCol.needsUpdate = true; this.aFrame.needsUpdate = true
  }
}

// ───────────────────────── Tracers (axis billboards) ─────────────────────────
const TRACER_VS = /* glsl */`
  attribute vec3 aA; attribute vec3 aB; attribute vec4 aCol;
  varying vec2 vUv; varying vec3 vCol;
  void main() {
    vec3 axis = aB - aA;
    vec3 mid = mix(aA, aB, position.x + 0.5);
    vec3 toCam = normalize(cameraPosition - mid);
    vec3 side = normalize(cross(axis, toCam)) * aCol.a;
    vec3 wp = mid + side * position.y * 2.0;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
    vUv = uv; vCol = aCol.rgb;
  }`
const TRACER_FS = /* glsl */`
  varying vec2 vUv; varying vec3 vCol;
  void main() {
    float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
    float along = smoothstep(0.0, 0.8, vUv.x);
    float core = pow(across, 4.0);
    vec3 c = vCol * across * along + vec3(1.0) * core * along * 0.8;
    gl_FragColor = vec4(c, 1.0);
  }`
class Tracers {
  readonly mesh: THREE.Mesh
  private geo: THREE.InstancedBufferGeometry
  private aA: THREE.InstancedBufferAttribute
  private aB: THREE.InstancedBufferAttribute
  private aCol: THREE.InstancedBufferAttribute
  n = 0
  constructor(readonly cap: number) {
    const base = new THREE.PlaneGeometry(1, 1)
    this.geo = new THREE.InstancedBufferGeometry()
    this.geo.index = base.index
    this.geo.setAttribute('position', base.getAttribute('position'))
    this.geo.setAttribute('uv', base.getAttribute('uv'))
    this.aA = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage)
    this.aB = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage)
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage)
    this.geo.setAttribute('aA', this.aA); this.geo.setAttribute('aB', this.aB); this.geo.setAttribute('aCol', this.aCol)
    this.geo.instanceCount = 0
    const mat = new THREE.ShaderMaterial({ vertexShader: TRACER_VS, fragmentShader: TRACER_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    this.mesh = new THREE.Mesh(this.geo, mat)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 13
  }
  begin() { this.n = 0 }
  add(ax: number, ay: number, az: number, bx: number, by: number, bz: number, c: THREE.Color, width: number, intensity = 1) {
    if (this.n >= this.cap) return
    const i = this.n++
    const A = this.aA.array as Float32Array, B = this.aB.array as Float32Array, C = this.aCol.array as Float32Array
    A[i * 3] = ax; A[i * 3 + 1] = ay; A[i * 3 + 2] = az
    B[i * 3] = bx; B[i * 3 + 1] = by; B[i * 3 + 2] = bz
    C[i * 4] = c.r * intensity; C[i * 4 + 1] = c.g * intensity; C[i * 4 + 2] = c.b * intensity; C[i * 4 + 3] = width
  }
  end() {
    this.geo.instanceCount = this.n
    this.aA.needsUpdate = true; this.aB.needsUpdate = true; this.aCol.needsUpdate = true
  }
}

// ───────────────────────── Health bars ─────────────────────────
const BAR_VS = /* glsl */`
  attribute vec4 aBar; attribute vec4 aInfo;
  varying vec2 vUv; varying vec4 vInfo;
  void main() {
    vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 wp = aBar.xyz + camR * position.x * aBar.w + camU * position.y * aBar.w * 0.16;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
    vUv = uv; vInfo = aInfo;
  }`
const BAR_FS = /* glsl */`
  varying vec2 vUv; varying vec4 vInfo;
  void main() {
    float fill = vInfo.x; float trail = vInfo.y;
    vec3 bg = vec3(0.06, 0.03, 0.03);
    vec3 col = vInfo.z > 0.5 ? vec3(0.95, 0.2, 0.85) : mix(vec3(0.95, 0.15, 0.08), vec3(1.0, 0.72, 0.12), fill);
    vec3 c = vUv.x < fill ? col : (vUv.x < trail ? vec3(1.0, 0.95, 0.85) : bg);
    float edge = step(0.14, vUv.y) * step(vUv.y, 0.86) * step(0.015, vUv.x) * step(vUv.x, 0.985);
    c = mix(vec3(0.0), c, edge);
    gl_FragColor = vec4(c, 0.9 * vInfo.w);
  }`
class Bars {
  readonly mesh: THREE.Mesh
  private geo: THREE.InstancedBufferGeometry
  private aBar: THREE.InstancedBufferAttribute
  private aInfo: THREE.InstancedBufferAttribute
  n = 0
  constructor(readonly cap: number) {
    const base = new THREE.PlaneGeometry(1, 1)
    this.geo = new THREE.InstancedBufferGeometry()
    this.geo.index = base.index
    this.geo.setAttribute('position', base.getAttribute('position'))
    this.geo.setAttribute('uv', base.getAttribute('uv'))
    this.aBar = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage)
    this.aInfo = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage)
    this.geo.setAttribute('aBar', this.aBar); this.geo.setAttribute('aInfo', this.aInfo)
    this.geo.instanceCount = 0
    const mat = new THREE.ShaderMaterial({ vertexShader: BAR_VS, fragmentShader: BAR_FS, transparent: true, depthWrite: false })
    this.mesh = new THREE.Mesh(this.geo, mat)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 20
  }
  begin() { this.n = 0 }
  add(x: number, y: number, z: number, w: number, fill: number, trail: number, elite: boolean, alpha = 1) {
    if (this.n >= this.cap) return
    const i = this.n++
    const B = this.aBar.array as Float32Array, I = this.aInfo.array as Float32Array
    B[i * 4] = x; B[i * 4 + 1] = y; B[i * 4 + 2] = z; B[i * 4 + 3] = w
    I[i * 4] = fill; I[i * 4 + 1] = trail; I[i * 4 + 2] = elite ? 1 : 0; I[i * 4 + 3] = alpha
  }
  end() { this.geo.instanceCount = this.n; this.aBar.needsUpdate = true; this.aInfo.needsUpdate = true }
}

// ───────────────────────── Debris ─────────────────────────
class Debris {
  readonly mesh: THREE.InstancedMesh
  private f: Float32Array[]
  private px: Float32Array; private py: Float32Array; private pz: Float32Array
  private vx: Float32Array; private vy: Float32Array; private vz: Float32Array
  private ax: Float32Array; private ay: Float32Array; private az: Float32Array; private ang: Float32Array; private angV: Float32Array
  private sc: Float32Array; private life: Float32Array; private maxLife: Float32Array; private bounce: Float32Array
  private cr: Float32Array; private cg: Float32Array; private cb: Float32Array
  n = 0
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private v = new THREE.Vector3(); private s = new THREE.Vector3()
  private axis = new THREE.Vector3(); private c = new THREE.Color()
  onLand?: (x: number, z: number) => void
  constructor(readonly cap: number, geo: THREE.BufferGeometry, mat: THREE.Material) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.frustumCulled = false
    this.mesh.count = 0
    const F = () => new Float32Array(cap)
    this.px = F(); this.py = F(); this.pz = F(); this.vx = F(); this.vy = F(); this.vz = F()
    this.ax = F(); this.ay = F(); this.az = F(); this.ang = F(); this.angV = F(); this.sc = F(); this.life = F(); this.maxLife = F(); this.bounce = F()
    this.cr = F(); this.cg = F(); this.cb = F()
    this.f = [this.px, this.py, this.pz, this.vx, this.vy, this.vz, this.ax, this.ay, this.az, this.ang, this.angV, this.sc, this.life, this.maxLife, this.bounce, this.cr, this.cg, this.cb]
    for (let i = 0; i < cap; i++) this.mesh.setColorAt(i, this.c.setRGB(1, 1, 1))
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage)
  }
  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, scale: number, color: THREE.Color, life = 1.6, bounce = 0.3) {
    let i = this.n
    if (i >= this.cap) i = Math.floor(Math.random() * this.cap)
    else this.n++
    this.px[i] = x; this.py[i] = y; this.pz[i] = z; this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz
    this.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
    this.ax[i] = this.axis.x; this.ay[i] = this.axis.y; this.az[i] = this.axis.z
    this.ang[i] = Math.random() * 6; this.angV[i] = 6 + Math.random() * 14
    this.sc[i] = scale; this.life[i] = life; this.maxLife[i] = life; this.bounce[i] = bounce
    this.cr[i] = color.r; this.cg[i] = color.g; this.cb[i] = color.b
  }
  update(dt: number) {
    let n = this.n
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt
      if (this.life[i] <= 0) { n--; if (i !== n) for (const a of this.f) a[i] = a[n]; i--; continue }
      this.vy[i] -= 22 * dt
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt
      const r = this.sc[i] * 0.4
      if (this.py[i] < r) {
        if (this.vy[i] < -3 && this.onLand) this.onLand(this.px[i], this.pz[i])
        this.py[i] = r; this.vy[i] = -this.vy[i] * this.bounce[i]; this.vx[i] *= 0.55; this.vz[i] *= 0.55; this.angV[i] *= 0.5
      }
      this.ang[i] += this.angV[i] * dt
      const t = this.life[i] / this.maxLife[i]
      const s = this.sc[i] * Math.min(1, t * 4)
      this.axis.set(this.ax[i], this.ay[i], this.az[i])
      this.q.setFromAxisAngle(this.axis, this.ang[i])
      this.v.set(this.px[i], this.py[i], this.pz[i])
      this.s.set(s, s, s)
      this.m.compose(this.v, this.q, this.s)
      this.mesh.setMatrixAt(i, this.m)
      this.mesh.setColorAt(i, this.c.setRGB(this.cr[i], this.cg[i], this.cb[i]))
    }
    this.n = n
    this.mesh.count = n
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }
  clear() { this.n = 0; this.mesh.count = 0 }
}

// ───────────────────────── Telegraphs ─────────────────────────
const TELE_FS = /* glsl */`
  uniform vec3 uColor; uniform float uProgress; uniform float uTime; uniform float uShape; uniform float uAlpha;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float a = 0.0;
    if (uShape < 0.5) {
      float r = length(p);
      if (r > 1.0) discard;
      float rim = smoothstep(0.86, 0.95, r) * (1.0 - smoothstep(0.97, 1.0, r));
      float fill = step(r, uProgress) * 0.34;
      float stripes = step(0.5, fract((p.x + p.y) * 4.0 - uTime * 1.5)) * 0.08;
      a = rim * 0.95 + fill + stripes * (1.0 - r);
    } else {
      vec2 q = abs(p);
      float edge = max(smoothstep(0.9, 0.98, q.x), smoothstep(0.94, 0.99, q.y));
      float fill = step(vUv.y, uProgress) * 0.3;
      float stripes = step(0.5, fract((vUv.x * 3.0 + vUv.y * 6.0) - uTime * 1.8)) * 0.1;
      a = edge * 0.95 + fill + stripes;
    }
    float pulse = 0.75 + 0.25 * sin(uTime * 18.0);
    gl_FragColor = vec4(uColor * (0.9 + uProgress * 0.6), a * uAlpha * pulse);
  }`
export class Telegraph {
  readonly mesh: THREE.Mesh
  readonly u: { uColor: { value: THREE.Color }; uProgress: { value: number }; uTime: { value: number }; uShape: { value: number }; uAlpha: { value: number } }
  active = false
  constructor() {
    this.u = { uColor: { value: new THREE.Color(0xff2a1a) }, uProgress: { value: 0 }, uTime: { value: 0 }, uShape: { value: 0 }, uAlpha: { value: 1 } }
    const mat = new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: TELE_FS, uniforms: this.u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })
    const g = new THREE.PlaneGeometry(1, 1)
    g.rotateX(-Math.PI / 2)
    this.mesh = new THREE.Mesh(g, mat)
    this.mesh.visible = false
    this.mesh.renderOrder = 9
    this.mesh.frustumCulled = false
  }
  circle(x: number, z: number, r: number, color = 0xff2a1a) {
    this.active = true; this.mesh.visible = true
    this.u.uShape.value = 0; this.u.uColor.value.set(color); this.u.uProgress.value = 0; this.u.uAlpha.value = 1
    this.mesh.position.set(x, 0.07, z); this.mesh.scale.set(r * 2, 1, r * 2); this.mesh.rotation.y = 0
    return this
  }
  /** Rectangle centred at (x,z), `w` across X and `len` along Z (before yaw). */
  rect(x: number, z: number, w: number, len: number, yaw = 0, color = 0xff2a1a) {
    this.active = true; this.mesh.visible = true
    this.u.uShape.value = 1; this.u.uColor.value.set(color); this.u.uProgress.value = 0; this.u.uAlpha.value = 1
    this.mesh.position.set(x, 0.07, z); this.mesh.scale.set(w, 1, len); this.mesh.rotation.y = yaw
    return this
  }
  hide() { this.active = false; this.mesh.visible = false }
}

// ───────────────────────── Floating DOM text ─────────────────────────
export type TextStyle = 'dmg' | 'crit' | 'elite' | 'burn' | 'good' | 'bad' | 'gold' | 'big' | 'coin' | 'loss'
interface FloatItem { el: HTMLDivElement; x: number; y: number; z: number; life: number; max: number; vy: number; style: TextStyle | ''; alive: boolean; ox: number }

export class Fx {
  readonly group = new THREE.Group()
  add!: Particles
  alpha!: Particles
  decals!: GroundQuads
  shadows!: GroundQuads
  tracers = new Tracers(480)
  bars = new Bars(180)
  gore!: Debris
  casings!: Debris
  shards!: Debris
  telegraphs: Telegraph[] = []
  private lightning: THREE.LineSegments
  private lightningPos: Float32Array
  private lightningLife = new Float32Array(48)
  private lightningSlot = 0
  private decalData: { x: number; z: number; s: number; r: number; f: number; c: THREE.Color; a: number; life: number; max: number }[] = []
  private shadowN = 0
  private texts: FloatItem[] = []
  /** 0..1 density multiplier (quality + adaptive). */
  density = 1
  private tmpC = new THREE.Color()
  private v3 = new THREE.Vector3()
  ready = false
  time = 0

  constructor(private readonly camera: THREE.PerspectiveCamera, private readonly textLayer: HTMLElement) {
    this.group.add(this.tracers.mesh, this.bars.mesh)
    const lg = new THREE.BufferGeometry()
    this.lightningPos = new Float32Array(48 * 8 * 6)
    lg.setAttribute('position', new THREE.BufferAttribute(this.lightningPos, 3).setUsage(THREE.DynamicDrawUsage))
    this.lightning = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xd6c8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
    this.lightning.frustumCulled = false
    this.group.add(this.lightning)
    for (let i = 0; i < 20; i++) { const t = new Telegraph(); this.telegraphs.push(t); this.group.add(t.mesh) }
    for (let i = 0; i < 70; i++) {
      const el = document.createElement('div')
      el.className = 'ftext'
      el.style.display = 'none'
      textLayer.appendChild(el)
      this.texts.push({ el, x: 0, y: 0, z: 0, life: 0, max: 1, vy: 0, style: '', alive: false, ox: 0 })
    }
  }

  /** Build atlases from the loaded FX textures (call once the fx group is loaded). */
  init(src: Record<string, THREE.Texture | undefined>) {
    const cell = 256
    const mk = (frames: string[]) => {
      const cv = document.createElement('canvas')
      cv.width = cell * 4; cv.height = cell * 2
      const ctx = cv.getContext('2d')!
      frames.forEach((f, i) => {
        const t = src[f]
        if (t?.image) drawCell(ctx, t.image as Img, i, 4, cell, t.flipY === false)
        else proc(ctx, f, i, 4, cell)
      })
      const tex = new THREE.CanvasTexture(cv)
      tex.colorSpace = THREE.SRGBColorSpace
      return tex
    }
    const addTex = mk(ADD_FRAMES)
    const alphaTex = mk(ALPHA_FRAMES)
    this.add = new Particles(2600, addTex, true)
    this.alpha = new Particles(2000, alphaTex, false)
    this.decals = new GroundQuads(320, alphaTex, 0.022, 3)
    this.shadows = new GroundQuads(700, alphaTex, 0.03, 4)
    const goreMat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.0 })
    const brassMat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.15 })
    const shardMat = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.05 })
    this.gore = new Debris(420, new THREE.IcosahedronGeometry(0.5, 0), goreMat)
    this.casings = new Debris(260, new THREE.CylinderGeometry(0.16, 0.16, 0.6, 6), brassMat)
    this.shards = new Debris(360, new THREE.BoxGeometry(1, 0.14, 0.7), shardMat)
    this.gore.onLand = (x, z) => { if (Math.random() < 0.3) this.decal('blood', x, z, 0.35 + Math.random() * 0.5, 0.85) }
    this.group.add(this.add.mesh, this.alpha.mesh, this.decals.mesh, this.shadows.mesh, this.gore.mesh, this.casings.mesh, this.shards.mesh)
    this.ready = true
  }

  setFog(near: number, far: number, color: THREE.Color) {
    if (!this.ready) return
    for (const u of [this.add.uniforms, this.alpha.uniforms, this.decals.uniforms, this.shadows.uniforms]) {
      u.uFogNear.value = near; u.uFogFar.value = far
      if (u.uFogColor) (u.uFogColor.value as THREE.Color).copy(color)
    }
  }

  private col(c: number | THREE.Color) { return typeof c === 'number' ? this.tmpC.setHex(c) : c }
  private rnd(a: number) { return (Math.random() * 2 - 1) * a }
  private n(k: number) { return Math.max(1, Math.round(k * this.density)) }

  // ─── primitives ───
  addP(frame: AddFrame, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, c: number | THREE.Color, a = 1, o?: SpawnOpts) {
    if (this.ready) this.add.spawn(ADD_FRAMES.indexOf(frame), x, y, z, vx, vy, vz, life, s0, s1, this.col(c), a, o)
  }
  alphaP(frame: AlphaFrame, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, c: number | THREE.Color, a = 1, o?: SpawnOpts) {
    if (this.ready) this.alpha.spawn(ALPHA_FRAMES.indexOf(frame), x, y, z, vx, vy, vz, life, s0, s1, this.col(c), a, o)
  }
  decal(kind: 'blood' | 'acid' | 'scorch' | 'dot', x: number, z: number, size: number, alpha = 0.9, color = 0xffffff, life = 14) {
    if (!this.ready) return
    if (this.decalData.length >= this.decals.cap) this.decalData.shift()
    this.decalData.push({ x, z, s: size, r: Math.random() * 6.28, f: ALPHA_FRAMES.indexOf(kind), c: new THREE.Color(color), a: alpha, life, max: life })
  }
  shadow(x: number, z: number, r: number, a = 0.55) {
    if (!this.ready || this.shadowN >= this.shadows.cap) return
    this.shadows.set(this.shadowN++, x, z, r * 2, 0, 5, 1, 1, 1, a)
  }
  telegraph(): Telegraph | null { return this.telegraphs.find(t => !t.active) ?? null }
  lightningArc(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    const slot = this.lightningSlot
    this.lightningSlot = (this.lightningSlot + 1) % 48
    const segs = 8
    const P = this.lightningPos
    let px = ax, py = ay, pz = az
    for (let s = 0; s < segs; s++) {
      const t = (s + 1) / segs
      const last = s === segs - 1
      const nx = ax + (bx - ax) * t + (last ? 0 : this.rnd(0.45))
      const ny = ay + (by - ay) * t + (last ? 0 : this.rnd(0.35))
      const nz = az + (bz - az) * t + (last ? 0 : this.rnd(0.45))
      const o = (slot * segs + s) * 6
      P[o] = px; P[o + 1] = py; P[o + 2] = pz; P[o + 3] = nx; P[o + 4] = ny; P[o + 5] = nz
      px = nx; py = ny; pz = nz
    }
    this.lightningLife[slot] = 0.14
    ;(this.lightning.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
    this.addP('glow', bx, by, bz, 0, 0, 0, 0.2, 1.4, 0.6, 0x9d7bff, 1)
  }

  // ─── presets ───
  muzzle(x: number, y: number, z: number, heavy: boolean, color: number) {
    const s = heavy ? 1.05 : 0.75
    this.addP('muzzle', x, y, z, 0, 0, 0, 0.055, s * 0.9, s * 1.25, 0xffffff, 1, { rot: Math.PI / 2 + this.rnd(0.35) })
    this.addP('glow', x, y, z, 0, 0, 0, 0.07, s * 1.5, s * 0.5, color, 0.8)
  }
  casing(x: number, y: number, z: number) {
    if (!this.ready || Math.random() > this.density) return
    this.casings.spawn(x, y, z, 1.5 + Math.random() * 1.5, 2.5 + Math.random() * 2, this.rnd(1.2), 0.11, this.tmpC.setHex(0xc8a24a), 1.1, 0.45)
  }
  impact(x: number, y: number, z: number, blood: boolean, color = 0xffc46b) {
    if (blood) {
      for (let i = 0, n = this.n(3); i < n; i++)
        this.alphaP('drop', x, y, z, this.rnd(2.2), 1 + Math.random() * 2.4, -2 - Math.random() * 3, 0.45, 0.2, 0.1, 0x7a0a08, 0.95, { grav: 14, rot: this.rnd(3) })
      this.alphaP('blood', x, y, z, 0, 0.6, -0.5, 0.3, 0.45, 1.0, 0x9a1510, 0.75)
    } else {
      this.addP('star', x, y, z, 0, 0, 0, 0.1, 0.5, 0.9, color, 1)
      for (let i = 0, n = this.n(3); i < n; i++) this.addP('glow', x, y, z, this.rnd(4), Math.random() * 4, this.rnd(4), 0.25, 0.14, 0.04, color, 1, { grav: 12 })
    }
  }
  sparks(x: number, y: number, z: number, n: number, color = 0xffc46b, speed = 6) {
    for (let i = 0, k = this.n(n); i < k; i++)
      this.addP('glow', x, y, z, this.rnd(speed), Math.random() * speed * 0.9, this.rnd(speed), 0.3 + Math.random() * 0.3, 0.18, 0.05, color, 1, { grav: 14, ground: true })
    this.addP('star', x, y, z, 0, 0, 0, 0.12, 0.8, 1.6, color, 0.9)
  }
  gib(x: number, y: number, z: number, n: number, big = 1, tint = 0x6b0d0a) {
    if (!this.ready) return
    for (let i = 0, k = this.n(n); i < k; i++) {
      this.tmpC.setHex(tint).offsetHSL(0, 0, this.rnd(0.06))
      this.gore.spawn(x + this.rnd(0.3), y + Math.random() * 0.6, z + this.rnd(0.3), this.rnd(4.5), 3 + Math.random() * 5, this.rnd(4.5), (0.1 + Math.random() * 0.16) * big, this.tmpC, 1.4 + Math.random(), 0.25)
    }
    for (let i = 0, k = this.n(n + 2); i < k; i++)
      this.alphaP('drop', x, y + 0.6, z, this.rnd(3.5), 2 + Math.random() * 3.5, this.rnd(3.5), 0.6, 0.28 * big, 0.14, 0x6d0806, 0.95, { grav: 15, rot: this.rnd(3) })
    this.alphaP('blood', x, y + 0.6, z, 0, 0.4, 0, 0.45, 0.7 * big, 1.9 * big, 0x8a0f0b, 0.8)
    this.decal('blood', x + this.rnd(0.3), z + this.rnd(0.3), (1.1 + Math.random() * 0.9) * big, 0.9)
  }
  dust(x: number, z: number, n = 1, size = 0.9, color = 0x8f8173, a = 0.32) {
    for (let i = 0; i < n; i++)
      this.alphaP('smoke', x + this.rnd(0.3), 0.15, z + this.rnd(0.3), this.rnd(0.6), 0.4 + Math.random() * 0.4, this.rnd(0.6), 0.7 + Math.random() * 0.5, size * 0.5, size * 1.6, color, a, { fadeIn: 0.15, spin: this.rnd(0.8) })
  }
  smoke(x: number, y: number, z: number, size = 2, color = 0x3a3533, a = 0.55, life = 2.4) {
    this.alphaP('smoke', x, y, z, this.rnd(0.4), 1.2 + Math.random(), this.rnd(0.4), life, size * 0.6, size * 1.8, color, a, { fadeIn: 0.2, spin: this.rnd(0.4) })
  }
  explosion(x: number, y: number, z: number, radius: number, color = 0xff8a2a) {
    const r = radius
    this.addP('glow', x, y + 0.5, z, 0, 0, 0, 0.22, r * 3.5, r * 5, 0xffd08a, 1)
    for (let i = 0, k = this.n(7); i < k; i++)
      this.addP('fireball', x + this.rnd(r * 0.4), y + 0.4 + Math.random() * r * 0.4, z + this.rnd(r * 0.4), this.rnd(r * 1.6), 1 + Math.random() * r * 1.4, this.rnd(r * 1.6), 0.45 + Math.random() * 0.35, r * 0.8, r * 1.9, color, 1, { drag: 3, spin: this.rnd(2) })
    for (let i = 0, k = this.n(14); i < k; i++)
      this.addP('glow', x, y + 0.5, z, this.rnd(r * 6), 2 + Math.random() * r * 5, this.rnd(r * 6), 0.5 + Math.random() * 0.5, 0.28, 0.08, 0xffb24a, 1, { grav: 16, ground: true })
    for (let i = 0, k = this.n(6); i < k; i++)
      this.smoke(x + this.rnd(r * 0.6), y + 0.8, z + this.rnd(r * 0.6), r * 1.1, 0x2a2624, 0.6, 1.8 + Math.random())
    this.shockwave(x, z, r * 1.6, 0xffa050)
    this.decal('scorch', x, z, r * 2.2, 0.85)
    if (this.ready) for (let i = 0, k = this.n(6); i < k; i++)
      this.shards.spawn(x, y + 0.3, z, this.rnd(8), 4 + Math.random() * 6, this.rnd(8), 0.25 + Math.random() * 0.25, this.tmpC.setHex(0x2d2a28), 1.6, 0.3)
  }
  shockwave(x: number, z: number, r: number, color: number) {
    this.addP('ring', x, 0.25, z, 0, 0, 0, 0.35, r * 0.4, r * 2.2, color, 1)
  }
  flameJet(x: number, z: number, h: number, w: number) {
    for (let i = 0, k = this.n(3); i < k; i++)
      this.addP('flame', x + this.rnd(w * 0.3), 0.3, z + this.rnd(0.3), this.rnd(0.5), h * (2.6 + Math.random() * 1.6), this.rnd(0.5), 0.4 + Math.random() * 0.2, w * 0.9, w * 1.6, 0xffffff, 1, { drag: 1.2, rot: this.rnd(0.25) })
    if (Math.random() < 0.3 * this.density) this.smoke(x, h * 1.4, z, 1.6, 0x2c2826, 0.4, 1.8)
    if (Math.random() < 0.5) this.addP('glow', x, h * 0.5 + 0.4, z, 0, 0, 0, 0.14, w * 2.4, w * 2.8, 0xff7a2a, 0.7)
  }
  fire(x: number, y: number, z: number, size = 1) {
    this.addP('flame', x + this.rnd(0.2 * size), y, z + this.rnd(0.2 * size), this.rnd(0.2), 1.6 * size + Math.random() * size, this.rnd(0.2), 0.45 + Math.random() * 0.3, size * 0.9, size * 0.4, 0xffffff, 0.95, { rot: this.rnd(0.3) })
  }
  embers(x: number, y: number, z: number) {
    this.addP('glow', x, y, z, this.rnd(0.6), 0.8 + Math.random() * 1.2, this.rnd(0.6), 2 + Math.random() * 2, 0.12, 0.03, 0xff8a3a, 1, { drag: 0.2 })
  }
  acid(x: number, y: number, z: number, n = 6) {
    for (let i = 0, k = this.n(n); i < k; i++)
      this.alphaP('drop', x, y, z, this.rnd(3), 1.5 + Math.random() * 3, this.rnd(3), 0.6, 0.28, 0.12, 0x8cff2a, 0.95, { grav: 14 })
    this.addP('glow', x, y, z, 0, 0, 0, 0.3, 1.5, 2.4, 0x6aff2a, 0.6)
  }
  gateBurst(x: number, y: number, z: number, w: number, color: number) {
    if (!this.ready) return
    for (let i = 0, k = this.n(22); i < k; i++) {
      this.tmpC.setHex(color).offsetHSL(0, 0, Math.random() * 0.2)
      this.shards.spawn(x + this.rnd(w / 2), y + this.rnd(1.2), z, this.rnd(5), 2 + Math.random() * 5, -2 - Math.random() * 6, 0.18 + Math.random() * 0.22, this.tmpC, 1.2, 0.35)
    }
    for (let i = 0, k = this.n(26); i < k; i++)
      this.addP('glow', x + this.rnd(w / 2), y + this.rnd(1.4), z, this.rnd(3), Math.random() * 4, -Math.random() * 6, 0.6 + Math.random() * 0.4, 0.3, 0.06, color, 1, { grav: 6 })
    this.addP('glow', x, y, z, 0, 0, 0, 0.3, w * 1.2, w * 2, color, 0.9)
    this.shockwave(x, z, w * 0.8, color)
  }
  spawnPuff(x: number, z: number, color = 0x7ecbff) {
    this.dust(x, z, 2, 1.1, 0x9a8f86)
    this.addP('ring', x, 0.2, z, 0, 0, 0, 0.35, 0.4, 2.2, color, 0.9)
    this.addP('glow', x, 1, z, 0, 3, 0, 0.35, 1.2, 0.3, color, 0.8)
  }
  heal(x: number, y: number, z: number) {
    for (let i = 0, k = this.n(4); i < k; i++) this.addP('glow', x + this.rnd(0.4), y + Math.random(), z + this.rnd(0.4), 0, 1.5 + Math.random(), 0, 0.7, 0.25, 0.05, 0x6aff9a, 1)
  }
  coinSpark(x: number, y: number, z: number) {
    this.addP('star', x, y, z, 0, 2.5, 0, 0.35, 0.5, 0.2, 0xffd24a, 1)
  }

  // ─── floating text ───
  text(x: number, y: number, z: number, str: string, style: TextStyle, life = 0.8) {
    let t = this.texts.find(f => !f.alive)
    if (!t) t = this.texts.reduce((a, b) => (a.life < b.life ? a : b))
    t.alive = true; t.x = x; t.y = y; t.z = z; t.life = life; t.max = life
    t.vy = style === 'big' || style === 'good' || style === 'bad' || style === 'gold' ? 1.2 : 2.4
    t.ox = (Math.random() - 0.5) * 18
    t.el.className = `ftext ft-${style}`
    t.el.textContent = str
    t.style = style
    t.el.style.display = 'block'
    t.el.style.animation = 'none'
    void t.el.offsetWidth
    t.el.style.animation = ''
  }

  update(dt: number) {
    this.time += dt
    if (this.ready) {
      this.add.update(dt)
      this.alpha.update(dt)
      this.gore.update(dt)
      this.casings.update(dt)
      this.shards.update(dt)
      let k = 0
      for (let i = 0; i < this.decalData.length; i++) {
        const d = this.decalData[i]
        d.life -= dt
        if (d.life <= 0) continue
        this.decalData[k] = d
        const a = d.a * Math.min(1, d.life / 3)
        const grow = Math.min(1, 0.4 + (d.max - d.life) * 3)
        this.decals.set(k, d.x, d.z, d.s * grow, d.r, d.f, d.c.r, d.c.g, d.c.b, a)
        k++
      }
      this.decalData.length = k
      this.decals.commit(k)
      this.shadows.commit(this.shadowN)
      this.shadowN = 0
    }
    for (const t of this.telegraphs) if (t.active) t.u.uTime.value = this.time
    let dirty = false
    for (let s = 0; s < 48; s++) {
      if (this.lightningLife[s] > 0) {
        this.lightningLife[s] -= dt
        if (this.lightningLife[s] <= 0) { this.lightningPos.fill(0, s * 48, s * 48 + 48); dirty = true }
      }
    }
    if (dirty) (this.lightning.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
    const w = this.textLayer.clientWidth, h = this.textLayer.clientHeight
    for (const t of this.texts) {
      if (!t.alive) continue
      t.life -= dt
      if (t.life <= 0) { t.alive = false; t.el.style.display = 'none'; continue }
      t.y += t.vy * dt
      t.vy *= 1 - 2.5 * dt
      this.v3.set(t.x, t.y, t.z).project(this.camera)
      if (this.v3.z > 1) { t.el.style.display = 'none'; continue }
      t.el.style.display = 'block'
      const sx = (this.v3.x * 0.5 + 0.5) * w + t.ox, sy = (-this.v3.y * 0.5 + 0.5) * h
      t.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`
      t.el.style.opacity = Math.min(1, t.life / (t.max * 0.35)).toFixed(2)
    }
  }
  get liveParticles() { return this.ready ? this.add.count + this.alpha.count : 0 }
  clear() {
    if (!this.ready) return
    this.add.clear(); this.alpha.clear(); this.gore.clear(); this.casings.clear(); this.shards.clear()
    this.decalData.length = 0
    for (const t of this.telegraphs) t.hide()
    for (const t of this.texts) { t.alive = false; t.el.style.display = 'none' }
  }
}
