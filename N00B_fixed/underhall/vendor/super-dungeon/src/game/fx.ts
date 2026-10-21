import * as THREE from 'three'
import { texture } from './assets3d'

/**
 * Realistic VFX, same API as before (burst / ring / slash / telegraphs / shots) plus dust, smoke,
 * flash, embers and impact helpers.
 *
 * - Particles are camera-facing soft sprites from the Kenney particle atlas (public/fx/particles.webp),
 *   drawn in two batched pools (one draw call each): additive glow (sparks, flares, energy) and
 *   alpha-blended smoke/dust. Live particles are packed contiguously every frame.
 * - Shockwaves, slash arcs and attack telegraphs are shader decals with soft edges and animated fills.
 * - Projectiles: hot core + halo + particle trail; hero bolts carry one of a fixed pool of point
 *   lights (fixed light count, so no shader recompiles mid-fight).
 * - `reduced` (heat / low quality) halves emission; `load` feeds the streaming heat gauge.
 */

type Pool = 'add' | 'alpha'
type Particle = {
  pos: THREE.Vector3; vel: THREE.Vector3; life: number; max: number; s0: number; s1: number
  rot: number; spin: number; cell: number; color: THREE.Color; a0: number; gravity: number; drag: number; floor: boolean
}
type Ring = { mesh: THREE.Mesh; life: number; max: number; from: number; to: number }
type Slash = { mesh: THREE.Mesh; life: number; max: number }

export type Telegraph = {
  mesh: THREE.Group
  fill: THREE.Mesh
  life: number
  max: number
  kind: 'circle' | 'line'
  done: boolean
}

export type Shot = {
  mesh: THREE.Mesh
  pos: THREE.Vector3
  vel: THREE.Vector3
  radius: number
  damage: number
  owner: 'hero' | 'enemy'
  life: number
  alive: boolean
  chain: boolean
  crit: boolean
  hit: Set<unknown>
  pierce: number
  color: THREE.Color
  light: THREE.PointLight | null
  trailT: number
}

export const CELL = { smoke: 0, puff: 1, glow: 2, flare: 3, soft: 4, bolt: 5, star: 6, cross: 7, twirl: 8, burst: 9, dirt: 10, slash: 11, streak: 12, fire: 13, muzzle: 14, dark: 15 } as const

const MAX = { add: 700, alpha: 320 }

const SPRITE_VS = /* glsl */ `
attribute vec3 iPos; attribute vec4 iData; attribute vec4 iColor;
varying vec2 vUv; varying vec4 vColor;
void main() {
  float size = iData.x; float rot = iData.y; float cell = iData.z;
  vec2 c = position.xy;
  float cs = cos(rot), sn = sin(rot);
  vec2 p = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) * size;
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  mv.xy += p;
  gl_Position = projectionMatrix * mv;
  float cx = mod(cell, 4.0); float cy = floor(cell / 4.0);
  vUv = (vec2(cx, 3.0 - cy) + uv) * 0.25;
  vColor = iColor;
}`
const SPRITE_FS = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv; varying vec4 vColor;
void main() {
  vec4 t = texture2D(map, vUv);
  gl_FragColor = vec4(vColor.rgb * t.rgb, t.a * vColor.a);
  if (gl_FragColor.a < 0.004) discard;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

const DECAL_VS = /* glsl */ `
varying vec2 vUv; varying vec3 vP;
void main() { vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`

/** Ground telegraph: soft base, bright animated edge, fill front that sweeps toward the strike. */
const TELE_FS = /* glsl */ `
uniform vec3 uColor; uniform float uProgress; uniform float uTime; uniform float uLine;
varying vec2 vUv;
void main() {
  float a;
  if (uLine > 0.5) {
    float across = abs(vUv.x - 0.5) * 2.0; float along = vUv.y;
    float edge = smoothstep(0.82, 0.97, across) * (1.0 - smoothstep(0.97, 1.0, across));
    float fill = step(along, uProgress) * (0.28 + 0.5 * smoothstep(uProgress - 0.08, uProgress, along));
    float chev = step(0.5, fract(along * 6.0 - uTime * 2.5 + across * 0.6)) * 0.08;
    a = 0.12 + edge * 0.9 + fill + chev;
    a *= 1.0 - smoothstep(0.985, 1.0, along);
  } else {
    float r = length(vUv - 0.5) * 2.0;
    if (r > 1.0) discard;
    float edge = smoothstep(0.86, 0.97, r) * (1.0 - smoothstep(0.97, 1.0, r));
    float front = smoothstep(uProgress - 0.12, uProgress, r) * step(r, uProgress);
    float fill = step(r, uProgress) * 0.25 + front * 0.6;
    float ang = atan(vUv.y - 0.5, vUv.x - 0.5);
    float tick = step(0.82, fract(ang * 3.8197 + uTime * 0.6)) * smoothstep(0.7, 0.9, r) * 0.25;
    a = 0.1 + edge * (0.85 + 0.15 * sin(uTime * 14.0)) + fill + tick;
  }
  gl_FragColor = vec4(uColor * (1.0 + a), clamp(a, 0.0, 1.0) * 0.85);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

/** Shockwave: bright leading band with a soft trailing haze. */
const RING_FS = /* glsl */ `
uniform vec3 uColor; uniform float uK;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float band = smoothstep(0.7, 0.96, r) * (1.0 - smoothstep(0.96, 1.0, r));
  float haze = smoothstep(0.2, 0.95, r) * (1.0 - smoothstep(0.95, 1.0, r)) * 0.35;
  float a = (band + haze) * (1.0 - uK);
  gl_FragColor = vec4(uColor * (1.5 + band * 2.0), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

/** Punch arc: hot outer rim, streaky inner fade, tapering tail. */
const SLASH_FS = /* glsl */ `
uniform vec3 uColor; uniform float uK;
varying vec3 vP;
void main() {
  float r = length(vP.xz);
  float ang = atan(vP.z, vP.x);
  float radial = smoothstep(1.2, 2.2, r) * (1.0 - smoothstep(2.18, 2.3, r));
  float tail = smoothstep(-1.26, 0.2, -ang) ;
  float streak = 0.75 + 0.25 * sin(r * 40.0);
  float a = radial * tail * streak * (1.0 - uK);
  gl_FragColor = vec4(mix(uColor, vec3(1.0), radial * 0.5) * 2.2, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

function spriteMaterial(pool: Pool): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: texture('fx/particles.webp', { srgb: true }) } },
    vertexShader: SPRITE_VS,
    fragmentShader: SPRITE_FS,
    transparent: true,
    depthWrite: false,
    blending: pool === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending,
    toneMapped: pool !== 'add',
  })
}

function decalMaterial(fs: string, uniforms: Record<string, THREE.IUniform>, additive = true): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms, vertexShader: DECAL_VS, fragmentShader: fs, transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  })
}

class SpritePool {
  readonly mesh: THREE.Mesh
  readonly list: Particle[] = []
  private readonly free: Particle[] = []
  private readonly aPos: THREE.InstancedBufferAttribute
  private readonly aData: THREE.InstancedBufferAttribute
  private readonly aColor: THREE.InstancedBufferAttribute
  private readonly geo: THREE.InstancedBufferGeometry

  constructor(readonly kind: Pool, readonly max: number) {
    const plane = new THREE.PlaneGeometry(1, 1)
    const geo = new THREE.InstancedBufferGeometry()
    geo.index = plane.index
    geo.setAttribute('position', plane.getAttribute('position'))
    geo.setAttribute('uv', plane.getAttribute('uv'))
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage)
    this.aData = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage)
    this.aColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('iPos', this.aPos)
    geo.setAttribute('iData', this.aData)
    geo.setAttribute('iColor', this.aColor)
    geo.instanceCount = 0
    this.geo = geo
    this.mesh = new THREE.Mesh(geo, spriteMaterial(kind))
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = kind === 'alpha' ? 5 : 6
    for (let i = 0; i < max; i += 1) {
      this.free.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, max: 1, s0: 1, s1: 1, rot: 0, spin: 0, cell: 0, color: new THREE.Color(), a0: 1, gravity: 0, drag: 0, floor: true })
    }
  }

  take(): Particle | null {
    const p = this.free.pop()
    if (!p) return null
    this.list.push(p)
    return p
  }

  clear(): void {
    while (this.list.length) this.free.push(this.list.pop()!)
    this.geo.instanceCount = 0
  }

  update(dt: number): void {
    const P = this.aPos.array as Float32Array
    const D = this.aData.array as Float32Array
    const C = this.aColor.array as Float32Array
    let n = 0
    for (let i = this.list.length - 1; i >= 0; i -= 1) {
      const p = this.list[i]
      p.life -= dt
      if (p.life <= 0) {
        this.list[i] = this.list[this.list.length - 1]
        this.list.pop()
        this.free.push(p)
        continue
      }
      p.vel.y -= p.gravity * dt
      if (p.drag) p.vel.multiplyScalar(Math.exp(-p.drag * dt))
      p.pos.addScaledVector(p.vel, dt)
      if (p.floor && p.pos.y < 0.03) {
        p.pos.y = 0.03
        p.vel.y *= -0.35
        p.vel.x *= 0.6
        p.vel.z *= 0.6
      }
      p.rot += p.spin * dt
      const k = 1 - p.life / p.max // 0 → 1 over life
      const fadeIn = Math.min(1, k * 8)
      const a = p.a0 * fadeIn * (1 - k) * (this.kind === 'alpha' ? 1 : 1 - k * 0.3)
      P[n * 3] = p.pos.x; P[n * 3 + 1] = p.pos.y; P[n * 3 + 2] = p.pos.z
      D[n * 4] = p.s0 + (p.s1 - p.s0) * (1 - (1 - k) * (1 - k)); D[n * 4 + 1] = p.rot; D[n * 4 + 2] = p.cell; D[n * 4 + 3] = 0
      C[n * 4] = p.color.r; C[n * 4 + 1] = p.color.g; C[n * 4 + 2] = p.color.b; C[n * 4 + 3] = a
      n += 1
    }
    this.geo.instanceCount = n
    this.aPos.needsUpdate = this.aData.needsUpdate = this.aColor.needsUpdate = true
    this.aPos.clearUpdateRanges(); this.aPos.addUpdateRange(0, n * 3)
    this.aData.clearUpdateRanges(); this.aData.addUpdateRange(0, n * 4)
    this.aColor.clearUpdateRanges(); this.aColor.addUpdateRange(0, n * 4)
  }
}

type EmitOpts = {
  vel?: THREE.Vector3; life?: number; size?: number; size1?: number; cell?: number; color?: THREE.ColorRepresentation | THREE.Color
  alpha?: number; gravity?: number; drag?: number; spin?: number; rot?: number; floor?: boolean; intensity?: number
}

const tmpC = new THREE.Color()

export class Fx {
  readonly group = new THREE.Group()
  private readonly add = new SpritePool('add', MAX.add)
  private readonly alpha = new SpritePool('alpha', MAX.alpha)
  private rings: Ring[] = []
  private slashes: Slash[] = []
  readonly telegraphs: Telegraph[] = []
  readonly shots: Shot[] = []
  private readonly lights: THREE.PointLight[] = []
  private readonly quad = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
  private readonly lineQuad = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5)
  private readonly slashGeo = new THREE.RingGeometry(1.2, 2.3, 32, 1, -Math.PI * 0.4, Math.PI * 0.8).rotateX(-Math.PI / 2)
  private readonly coreGeo = new THREE.SphereGeometry(1, 14, 10)
  private time = 0
  reduced = false

  constructor() {
    this.group.add(this.alpha.mesh, this.add.mesh)
    // Fixed pool of travelling lights for hero projectiles (constant light count = no recompiles).
    for (let i = 0; i < 2; i += 1) {
      const l = new THREE.PointLight('#7ef9ff', 0, 7, 2)
      l.castShadow = false
      this.lights.push(l)
      this.group.add(l)
    }
  }

  /** Rough on-screen VFX load, 0..1 (particles, live projectiles, telegraphs); feeds loading heat. */
  get load(): number {
    const p = this.add.list.length + this.alpha.list.length
    let s = 0
    for (const x of this.shots) if (x.alive) s += 1
    return Math.min(1, (p / 360) * 0.5 + (s / 10) * 0.35 + this.telegraphs.length * 0.06)
  }

  /** Low-level emit into a pool. */
  emit(pool: Pool, pos: THREE.Vector3, o: EmitOpts = {}): void {
    const p = (pool === 'add' ? this.add : this.alpha).take()
    if (!p) return
    p.pos.copy(pos)
    if (o.vel) p.vel.copy(o.vel)
    else p.vel.set(0, 0, 0)
    p.life = p.max = o.life ?? 0.5
    p.s0 = o.size ?? 0.3
    p.s1 = o.size1 ?? p.s0
    p.cell = o.cell ?? CELL.glow
    const c = o.color instanceof THREE.Color ? o.color : tmpC.set(o.color ?? '#ffffff')
    p.color.copy(c).multiplyScalar(o.intensity ?? 1)
    p.a0 = o.alpha ?? 1
    p.gravity = o.gravity ?? 0
    p.drag = o.drag ?? 0
    p.spin = o.spin ?? (Math.random() - 0.5) * 2
    p.rot = o.rot ?? Math.random() * Math.PI * 2
    p.floor = o.floor ?? true
  }

  private n(count: number): number {
    return this.reduced ? Math.ceil(count / 2) : count
  }

  /** Impact burst: hot flash, spark shower and (for big hits) a smoke puff. Signature unchanged. */
  burst(pos: THREE.Vector3, color: THREE.ColorRepresentation, count = 12, speed = 6, size = 0.14, life = 0.5, gravity = 12): void {
    const c = new THREE.Color(color)
    const v = new THREE.Vector3()
    this.emit('add', pos, { cell: CELL.glow, size: size * 5, size1: size * 9, life: Math.min(0.22, life * 0.5), color: c, intensity: 2.2, spin: 0 })
    this.emit('add', pos, { cell: CELL.burst, size: size * 4, size1: size * 8, life: Math.min(0.18, life * 0.4), color: tmpC.copy(c).lerp(new THREE.Color('#ffffff'), 0.5), intensity: 1.8 })
    const n = this.n(count)
    for (let k = 0; k < n; k += 1) {
      const a = Math.random() * Math.PI * 2
      const u = Math.random() * 0.9 + 0.1
      v.set(Math.cos(a) * speed * u, (Math.random() * 0.8 + 0.4) * speed * 0.7, Math.sin(a) * speed * u)
      this.emit('add', pos, { vel: v, cell: CELL.flare, size: size * 2.2, size1: size * 0.6, life: life * (0.6 + Math.random() * 0.6), color: c, intensity: 2.5, gravity, drag: 1.5 })
    }
    if (count >= 10) this.smoke(pos, '#6d6a78', Math.ceil(count / 8), size * 6, 0.9)
  }

  /** Directional hit sparks (from `dir`), e.g. punches. */
  impact(pos: THREE.Vector3, dir: THREE.Vector3, color: THREE.ColorRepresentation, strength = 1): void {
    const c = new THREE.Color(color)
    const v = new THREE.Vector3()
    this.emit('add', pos, { cell: CELL.star, size: 0.9 * strength, size1: 1.6 * strength, life: 0.14, color: c, intensity: 2.5, spin: 0, rot: Math.random() })
    this.emit('add', pos, { cell: CELL.glow, size: 1.2 * strength, size1: 2 * strength, life: 0.18, color: c, intensity: 1.6 })
    const n = this.n(Math.round(9 * strength))
    for (let k = 0; k < n; k += 1) {
      v.copy(dir).multiplyScalar(4 + Math.random() * 6).add(new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5))
      this.emit('add', pos, { vel: v, cell: CELL.flare, size: 0.22, size1: 0.05, life: 0.25 + Math.random() * 0.25, color: c, intensity: 3, gravity: 14, drag: 2 })
    }
  }

  flash(pos: THREE.Vector3, color: THREE.ColorRepresentation, size = 1.5, life = 0.2): void {
    this.emit('add', pos, { cell: CELL.glow, size: size * 0.6, size1: size, life, color, intensity: 2, spin: 0 })
  }

  /** Low rolling dust (footsteps, landings, dashes, slams). */
  dust(pos: THREE.Vector3, count = 4, size = 0.8, spread = 1.5, color: THREE.ColorRepresentation = '#9a8f84'): void {
    const v = new THREE.Vector3()
    const p = new THREE.Vector3()
    for (let k = 0; k < this.n(count); k += 1) {
      const a = Math.random() * Math.PI * 2
      p.set(pos.x + Math.cos(a) * 0.2, 0.15, pos.z + Math.sin(a) * 0.2)
      v.set(Math.cos(a) * spread * (0.4 + Math.random()), 0.3 + Math.random() * 0.5, Math.sin(a) * spread * (0.4 + Math.random()))
      this.emit('alpha', p, { vel: v, cell: Math.random() < 0.5 ? CELL.smoke : CELL.puff, size: size * 0.5, size1: size * 1.6, life: 0.7 + Math.random() * 0.5, color, alpha: 0.35, drag: 3, spin: (Math.random() - 0.5) })
    }
  }

  smoke(pos: THREE.Vector3, color: THREE.ColorRepresentation, count = 3, size = 1, life = 1.2, rise = 0.8): void {
    const v = new THREE.Vector3()
    for (let k = 0; k < this.n(count); k += 1) {
      v.set((Math.random() - 0.5) * 1.2, rise * (0.5 + Math.random()), (Math.random() - 0.5) * 1.2)
      this.emit('alpha', pos, { vel: v, cell: color === '#000000' ? CELL.dark : CELL.smoke, size: size * 0.5, size1: size * 1.4, life: life * (0.7 + Math.random() * 0.6), color, alpha: 0.45, drag: 1.2, floor: false })
    }
  }

  embers(pos: THREE.Vector3, color: THREE.ColorRepresentation, count = 6, spread = 0.6): void {
    const v = new THREE.Vector3()
    const p = new THREE.Vector3()
    for (let k = 0; k < this.n(count); k += 1) {
      p.set(pos.x + (Math.random() - 0.5) * spread, pos.y + Math.random() * spread, pos.z + (Math.random() - 0.5) * spread)
      v.set((Math.random() - 0.5) * 0.6, 0.8 + Math.random() * 1.4, (Math.random() - 0.5) * 0.6)
      this.emit('add', p, { vel: v, cell: CELL.flare, size: 0.12 + Math.random() * 0.1, size1: 0.02, life: 0.8 + Math.random() * 0.8, color, intensity: 2.5, drag: 0.8, floor: false })
    }
  }

  /** Expanding shockwave decal (+ dust ring for big ones). Signature unchanged. */
  ring(pos: THREE.Vector3, color: THREE.ColorRepresentation, from: number, to: number, life = 0.35): void {
    let r = this.rings.find(x => x.life <= 0)
    if (!r) {
      const mat = decalMaterial(RING_FS, { uColor: { value: new THREE.Color() }, uK: { value: 0 } })
      r = { mesh: new THREE.Mesh(this.quad, mat), life: 0, max: 1, from: 0, to: 1 }
      r.mesh.renderOrder = 4
      this.rings.push(r)
      this.group.add(r.mesh)
    }
    ;((r.mesh.material as THREE.ShaderMaterial).uniforms.uColor.value as THREE.Color).set(color)
    r.mesh.position.set(pos.x, pos.y + 0.09, pos.z)
    r.mesh.visible = true
    r.life = r.max = life
    r.from = from
    r.to = to
    if (to >= 3) {
      const p = new THREE.Vector3()
      const v = new THREE.Vector3()
      const n = this.n(Math.min(18, Math.round(to * 3)))
      for (let k = 0; k < n; k += 1) {
        const a = (k / n) * Math.PI * 2
        p.set(pos.x + Math.cos(a) * from, 0.2, pos.z + Math.sin(a) * from)
        v.set(Math.cos(a), 0.15, Math.sin(a)).multiplyScalar(((to - from) / life) * 0.55)
        this.emit('alpha', p, { vel: v, cell: CELL.smoke, size: 0.8, size1: 2.2, life: life * 2.4, color: '#8d8494', alpha: 0.3, drag: 3 })
      }
    }
  }

  /** Punch arc at chest height. Signature unchanged. */
  slash(pos: THREE.Vector3, facing: number, color: THREE.ColorRepresentation, flip: boolean, big = false): void {
    let s = this.slashes.find(x => x.life <= 0)
    if (!s) {
      s = { mesh: new THREE.Mesh(this.slashGeo, decalMaterial(SLASH_FS, { uColor: { value: new THREE.Color() }, uK: { value: 0 } })), life: 0, max: 1 }
      s.mesh.renderOrder = 7
      this.slashes.push(s)
      this.group.add(s.mesh)
    }
    ;((s.mesh.material as THREE.ShaderMaterial).uniforms.uColor.value as THREE.Color).set(color)
    s.mesh.position.set(pos.x, 1.15, pos.z)
    s.mesh.rotation.set(flip ? 0.35 : -0.35, facing + Math.PI / 2, 0, 'YXZ')
    s.mesh.scale.setScalar(big ? 1.3 : 0.95)
    s.mesh.visible = true
    s.life = s.max = big ? 0.2 : 0.15
  }

  private tele(kind: 'circle' | 'line', color: string, duration: number): { g: THREE.Group; mesh: THREE.Mesh } {
    const g = new THREE.Group()
    const mat = decalMaterial(TELE_FS, {
      uColor: { value: new THREE.Color(color) }, uProgress: { value: 0 }, uTime: { value: 0 }, uLine: { value: kind === 'line' ? 1 : 0 },
    })
    const mesh = new THREE.Mesh(kind === 'line' ? this.lineQuad : this.quad, mat)
    mesh.renderOrder = 3
    g.add(mesh)
    this.group.add(g)
    void duration
    return { g, mesh }
  }

  telegraphCircle(x: number, z: number, radius: number, duration: number, color = '#ff4f6d'): Telegraph {
    const { g, mesh } = this.tele('circle', color, duration)
    mesh.scale.set(radius * 2, 1, radius * 2)
    g.position.set(x, 0.06, z)
    const t: Telegraph = { mesh: g, fill: mesh, life: duration, max: duration, kind: 'circle', done: false }
    this.telegraphs.push(t)
    return t
  }

  telegraphLine(x: number, z: number, angle: number, length: number, width: number, duration: number, color = '#ff4f6d'): Telegraph {
    const { g, mesh } = this.tele('line', color, duration)
    mesh.scale.set(width, 1, length)
    g.position.set(x, 0.07, z)
    g.rotation.y = angle
    const t: Telegraph = { mesh: g, fill: mesh, life: duration, max: duration, kind: 'line', done: false }
    this.telegraphs.push(t)
    return t
  }

  removeTelegraph(t: Telegraph | undefined): void {
    if (!t || t.done) return
    t.done = true
    t.mesh.removeFromParent()
    ;(t.fill.material as THREE.Material).dispose()
  }

  shoot(owner: 'hero' | 'enemy', pos: THREE.Vector3, vel: THREE.Vector3, damage: number, color: string, radius = 0.3, opts: { chain?: boolean; crit?: boolean; life?: number; pierce?: number } = {}): Shot {
    let s = this.shots.find(x => !x.alive)
    if (!s) {
      const mesh = new THREE.Mesh(this.coreGeo, new THREE.MeshBasicMaterial({ toneMapped: false }))
      s = { mesh, pos: new THREE.Vector3(), vel: new THREE.Vector3(), radius, damage, owner, life: 0, alive: false, chain: false, crit: false, hit: new Set(), pierce: 0, color: new THREE.Color(), light: null, trailT: 0 }
      this.shots.push(s)
      this.group.add(mesh)
    }
    s.alive = true
    s.owner = owner
    s.pos.copy(pos)
    s.vel.copy(vel)
    s.radius = radius
    s.damage = damage
    s.life = opts.life ?? 1.6
    s.chain = opts.chain ?? false
    s.crit = opts.crit ?? false
    s.pierce = opts.pierce ?? 0
    s.hit.clear()
    s.color.set(color)
    s.trailT = 0
    // White-hot core tinted by the shot colour; the halo and trail carry the colour.
    ;(s.mesh.material as THREE.MeshBasicMaterial).color.copy(s.color).lerp(new THREE.Color('#ffffff'), 0.65).multiplyScalar(2)
    s.mesh.scale.setScalar(radius * 0.55)
    s.mesh.position.copy(pos)
    s.mesh.visible = true
    if (owner === 'hero') {
      const l = this.lights.find(x => !x.userData.busy)
      if (l) {
        l.userData.busy = true
        l.color.copy(s.color)
        l.intensity = 6
        s.light = l
      }
    }
    this.emit('add', pos, { cell: CELL.muzzle, size: radius * 5, size1: radius * 7, life: 0.12, color: s.color, intensity: 2 })
    return s
  }

  killShot(s: Shot): void {
    if (s.alive) {
      this.emit('add', s.pos, { cell: CELL.glow, size: s.radius * 5, size1: s.radius * 9, life: 0.18, color: s.color, intensity: 2 })
      this.smoke(s.pos, '#5b5866', 1, s.radius * 5, 0.6, 0.4)
    }
    s.alive = false
    s.mesh.visible = false
    if (s.light) {
      s.light.intensity = 0
      s.light.userData.busy = false
      s.light = null
    }
  }

  clear(): void {
    for (const t of [...this.telegraphs]) this.removeTelegraph(t)
    this.telegraphs.length = 0
    for (const s of this.shots) {
      s.alive = true
      s.pos.set(0, -100, 0)
      this.killShot(s)
    }
    this.add.clear()
    this.alpha.clear()
    for (const r of this.rings) {
      r.life = 0
      r.mesh.visible = false
    }
    for (const s of this.slashes) {
      s.life = 0
      s.mesh.visible = false
    }
  }

  update(dt: number): void {
    this.time += dt
    // Projectile halos + trails (positions are advanced by the game; mirror them here).
    for (const s of this.shots) {
      if (!s.alive) continue
      s.mesh.position.copy(s.pos)
      if (s.light) s.light.position.copy(s.pos)
      this.emit('add', s.pos, { cell: CELL.glow, size: s.radius * 4.2, life: dt * 1.5 + 0.001, color: s.color, intensity: 1.6, spin: 0 })
      s.trailT -= dt
      if (s.trailT <= 0) {
        s.trailT = this.reduced ? 0.035 : 0.018
        this.emit('add', s.pos, { cell: CELL.glow, size: s.radius * 3, size1: s.radius * 0.6, life: 0.28, color: s.color, intensity: 1.3, floor: false })
        if (Math.random() < 0.35) this.emit('add', s.pos, { vel: new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2), cell: CELL.flare, size: 0.14, size1: 0.02, life: 0.3, color: s.color, intensity: 2.5, floor: false })
      }
    }
    this.add.update(dt)
    this.alpha.update(dt)
    for (const r of this.rings) {
      if (r.life <= 0) continue
      r.life -= dt
      const k = 1 - Math.max(0, r.life) / r.max
      const rad = r.from + (r.to - r.from) * (1 - (1 - k) * (1 - k))
      r.mesh.scale.set(rad * 2, 1, rad * 2)
      ;(r.mesh.material as THREE.ShaderMaterial).uniforms.uK.value = k
      if (r.life <= 0) r.mesh.visible = false
    }
    for (const s of this.slashes) {
      if (s.life <= 0) continue
      s.life -= dt
      ;(s.mesh.material as THREE.ShaderMaterial).uniforms.uK.value = 1 - Math.max(0, s.life / s.max)
      if (s.life <= 0) s.mesh.visible = false
    }
    for (let i = this.telegraphs.length - 1; i >= 0; i -= 1) {
      const t = this.telegraphs[i]
      if (t.done) {
        this.telegraphs.splice(i, 1)
        continue
      }
      t.life -= dt
      const u = (t.fill.material as THREE.ShaderMaterial).uniforms
      u.uProgress.value = Math.min(1, 1 - t.life / t.max)
      u.uTime.value = this.time
      if (t.life <= 0) {
        this.removeTelegraph(t)
        this.telegraphs.splice(i, 1)
      }
    }
  }
}
