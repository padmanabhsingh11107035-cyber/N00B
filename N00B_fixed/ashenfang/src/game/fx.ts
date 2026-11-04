import * as THREE from 'three'
import { bakedGeometry, envTexture } from './envAssets'
import { heightAt, normalAt } from './terrain'
import { GroundSpikes, type SpikeTheme } from './spikes'

/**
 * Pooled visual effects. Particles are camera-facing instanced quads (one draw call per pool)
 * with per-particle colour, size, rotation, spin and optional velocity stretch, textured with
 * the generated sprite sheet (smoke, dirt clods, flame, splash, slash arc) or procedural glow.
 * Also: photoscanned rock debris, shockwave rings, hazard marks and the greatsword slash ribbon.
 * Nothing allocates per frame after construction.
 */
type Mode = 'add' | 'lit' | 'albedo'
type Particle = {
  alive: boolean
  p: THREE.Vector3
  v: THREE.Vector3
  life: number
  max: number
  size: number
  grow: number
  color: THREE.Color
  gravity: number
  drag: number
  rot: number
  spin: number
  alpha: number
  /** Fraction of life spent fading in (0 = pop in). */
  fadeIn: number
  /** Stops on the ground instead of falling through. */
  ground: boolean
}

const QUAD = (() => {
  const g = new THREE.InstancedBufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2))
  g.setIndex([0, 1, 2, 0, 2, 3])
  return g
})()

/** Procedural sprites (no download): soft glow dot, spark streak, radial star flare, ring. */
function canvasTexture(draw: (c: CanvasRenderingContext2D, s: number) => void, size = 128): THREE.Texture {
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const c = cv.getContext('2d')!
  draw(c, size)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
const TEX = {
  dot: () =>
    canvasTexture((c, s) => {
      const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
      g.addColorStop(0, 'rgba(255,255,255,1)')
      g.addColorStop(0.25, 'rgba(255,255,255,0.75)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      c.fillStyle = g
      c.fillRect(0, 0, s, s)
    }),
  streak: () =>
    canvasTexture((c, s) => {
      const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
      g.addColorStop(0, 'rgba(255,255,255,1)')
      g.addColorStop(0.35, 'rgba(255,240,210,0.6)')
      g.addColorStop(1, 'rgba(255,200,120,0)')
      c.fillStyle = g
      c.save()
      c.translate(s / 2, s / 2)
      c.scale(0.28, 1)
      c.translate(-s / 2, -s / 2)
      c.fillRect(0, 0, s, s)
      c.restore()
    }),
  star: () =>
    canvasTexture((c, s) => {
      const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
      g.addColorStop(0, 'rgba(255,255,255,1)')
      g.addColorStop(0.12, 'rgba(255,245,220,0.9)')
      g.addColorStop(0.4, 'rgba(255,200,120,0.18)')
      g.addColorStop(1, 'rgba(255,160,60,0)')
      c.fillStyle = g
      c.fillRect(0, 0, s, s)
      c.globalCompositeOperation = 'lighter'
      c.translate(s / 2, s / 2)
      for (let i = 0; i < 8; i += 1) {
        c.rotate(Math.PI / 4)
        const w = i % 2 ? 0.012 : 0.022
        const l = i % 2 ? 0.34 : 0.5
        const lg = c.createLinearGradient(0, 0, s * l, 0)
        lg.addColorStop(0, 'rgba(255,250,235,0.95)')
        lg.addColorStop(1, 'rgba(255,220,160,0)')
        c.fillStyle = lg
        c.beginPath()
        c.moveTo(0, -s * w)
        c.lineTo(s * l, 0)
        c.lineTo(0, s * w)
        c.fill()
      }
    }, 256),
  ring: () =>
    canvasTexture((c, s) => {
      const g = c.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s / 2)
      g.addColorStop(0, 'rgba(255,255,255,0)')
      g.addColorStop(0.72, 'rgba(255,255,255,0.15)')
      g.addColorStop(0.88, 'rgba(255,255,255,1)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      c.fillStyle = g
      c.fillRect(0, 0, s, s)
    }, 256),
}

class SpritePool {
  readonly mesh: THREE.Mesh
  private items: Particle[] = []
  private aPos: Float32Array
  private aVel: Float32Array
  private aCol: Float32Array
  private aMisc: Float32Array
  private next = 0
  alive = 0

  constructor(scene: THREE.Scene, count: number, map: THREE.Texture, mode: Mode, opts: { stretch?: number; boost?: number; order?: number } = {}) {
    const geo = QUAD.clone() as THREE.InstancedBufferGeometry
    geo.instanceCount = count
    this.aPos = new Float32Array(count * 3)
    this.aVel = new Float32Array(count * 3)
    this.aCol = new Float32Array(count * 3)
    this.aMisc = new Float32Array(count * 3)
    const inst = (arr: Float32Array, n: number) => new THREE.InstancedBufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('iPos', inst(this.aPos, 3))
    geo.setAttribute('iVel', inst(this.aVel, 3))
    geo.setAttribute('iCol', inst(this.aCol, 3))
    geo.setAttribute('iMisc', inst(this.aMisc, 3)) // size, alpha, rotation
    const frag =
      mode === 'add'
        ? 'vec3 c = t.rgb * vC * uBoost; gl_FragColor = vec4(c, t.a * vA);'
        : mode === 'lit'
          ? // Smoke/dust: the sprite's luminance is its self-shadowing; alpha drops the dark fringe.
            'float l = dot(t.rgb, vec3(0.333)); float a = t.a * smoothstep(0.1, 0.42, l) * vA; gl_FragColor = vec4(vC * (0.45 + 0.75 * l) * uLight, a);'
          : 'gl_FragColor = vec4(t.rgb * vC * uLight, t.a * vA);'
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: map }, uStretch: { value: opts.stretch ?? 0 }, uBoost: { value: opts.boost ?? 1.4 }, uLight: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec3 iPos; attribute vec3 iVel; attribute vec3 iCol; attribute vec3 iMisc;
        uniform float uStretch;
        varying vec2 vUv; varying vec3 vC; varying float vA;
        void main() {
          vUv = uv; vC = iCol; vA = iMisc.y;
          vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
          float s = iMisc.x;
          vec2 corner = position.xy;
          if (uStretch > 0.0) {
            vec2 d = (modelViewMatrix * vec4(iVel, 0.0)).xy;
            float len = length(d);
            vec2 dir = len > 1e-4 ? d / len : vec2(0.0, 1.0);
            vec2 perp = vec2(-dir.y, dir.x);
            mv.xy += dir * corner.y * (s + len * uStretch) + perp * corner.x * s;
          } else {
            float c = cos(iMisc.z), sn = sin(iMisc.z);
            mv.xy += vec2(corner.x * c - corner.y * sn, corner.x * sn + corner.y * c) * s;
          }
          gl_Position = projectionMatrix * mv;
          if (vA <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; uniform float uBoost; uniform float uLight;
        varying vec2 vUv; varying vec3 vC; varying float vA;
        void main() {
          vec4 t = texture2D(uMap, vUv);
          ${frag}
          if (gl_FragColor.a < 0.004) discard;
        }`,
      transparent: true,
      depthWrite: false,
      blending: mode === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending,
    })
    this.mesh = new THREE.Mesh(geo, mat)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = opts.order ?? (mode === 'add' ? 4 : 3)
    scene.add(this.mesh)
    for (let i = 0; i < count; i += 1)
      this.items.push({
        alive: false,
        p: new THREE.Vector3(),
        v: new THREE.Vector3(),
        life: 0,
        max: 1,
        size: 1,
        grow: 0,
        color: new THREE.Color(),
        gravity: 0,
        drag: 0,
        rot: 0,
        spin: 0,
        alpha: 1,
        fadeIn: 0.08,
        ground: false,
      })
  }

  set light(v: number) {
    ;(this.mesh.material as THREE.ShaderMaterial).uniforms.uLight.value = v
  }

  spawn(p: THREE.Vector3, v: THREE.Vector3, life: number, size: number, color: THREE.Color | string, o: Partial<Pick<Particle, 'gravity' | 'drag' | 'grow' | 'spin' | 'alpha' | 'fadeIn' | 'ground' | 'rot'>> = {}): void {
    const it = this.items[this.next]
    this.next = (this.next + 1) % this.items.length
    it.alive = true
    it.p.copy(p)
    it.v.copy(v)
    it.life = it.max = life
    it.size = size
    it.color.set(color)
    it.gravity = o.gravity ?? 0
    it.drag = o.drag ?? 0
    it.grow = o.grow ?? 0
    it.spin = o.spin ?? 0
    it.rot = o.rot ?? Math.random() * Math.PI * 2
    it.alpha = o.alpha ?? 1
    it.fadeIn = o.fadeIn ?? 0.08
    it.ground = o.ground ?? false
  }

  update(dt: number): void {
    let alive = 0
    for (let i = 0; i < this.items.length; i += 1) {
      const it = this.items[i]
      if (it.alive) {
        it.life -= dt
        if (it.life <= 0) it.alive = false
        else {
          alive += 1
          it.v.y += it.gravity * dt
          it.v.multiplyScalar(Math.exp(-it.drag * dt))
          it.p.addScaledVector(it.v, dt)
          if (it.ground) {
            const g = heightAt(it.p.x, it.p.z) + it.size * 0.2
            if (it.p.y < g) {
              it.p.y = g
              it.v.multiplyScalar(0.3)
              it.v.y = 0
              it.spin *= 0.3
            }
          }
          it.size = Math.max(0, it.size + it.grow * dt)
          it.rot += it.spin * dt
        }
      }
      const k = it.alive ? 1 - it.life / it.max : 1
      const a = it.alive ? it.alpha * Math.min(1, k / Math.max(0.001, it.fadeIn)) * Math.min(1, (1 - k) * 3.2) : 0
      this.aPos[i * 3] = it.p.x
      this.aPos[i * 3 + 1] = it.p.y
      this.aPos[i * 3 + 2] = it.p.z
      this.aVel[i * 3] = it.v.x
      this.aVel[i * 3 + 1] = it.v.y
      this.aVel[i * 3 + 2] = it.v.z
      this.aCol[i * 3] = it.color.r
      this.aCol[i * 3 + 1] = it.color.g
      this.aCol[i * 3 + 2] = it.color.b
      this.aMisc[i * 3] = it.size
      this.aMisc[i * 3 + 1] = a
      this.aMisc[i * 3 + 2] = it.rot
    }
    this.alive = alive
    const g = this.mesh.geometry
    ;(['iPos', 'iVel', 'iCol', 'iMisc'] as const).forEach(n => (g.attributes[n].needsUpdate = true))
  }

  clear(): void {
    for (const it of this.items) it.alive = false
  }
}

type Ring = { mesh: THREE.Mesh; t: number; dur: number; radius: number; alive: boolean }
type Mark = { mesh: THREE.Mesh; t: number; delay: number; alive: boolean }
type Debris = { p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; w: THREE.Vector3; s: number; life: number }

const _v = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _s = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)
const rand = (a: number, b: number) => a + Math.random() * (b - a)

export class Fx {
  /** Spawn-count multiplier set from graphics quality (low 0.45, medium 0.75, high 1). */
  density = 1
  private sparksPool: SpritePool
  private glow: SpritePool
  private flame: SpritePool
  private smoke: SpritePool
  private dirt: SpritePool
  private water: SpritePool
  private flashArc: SpritePool
  private flashStar: SpritePool
  private rings: Ring[] = []
  private marks: Mark[] = []
  private debris: Debris[] = []
  private debrisMesh: THREE.InstancedMesh
  private trail: THREE.Mesh
  private trailBase: THREE.Vector3[] = []
  private trailTip: THREE.Vector3[] = []
  private trailAge: number[] = []
  private trailActive = false
  private trailFade = 0
  private trailMat: THREE.ShaderMaterial
  private markMat: THREE.ShaderMaterial
  private time = 0

  /** Rupture-attack ground spikes (roots / obsidian / coral). */
  readonly spikes: GroundSpikes
  constructor(scene: THREE.Scene) {
    this.spikes = new GroundSpikes(scene)
    this.sparksPool = new SpritePool(scene, 700, TEX.streak(), 'add', { stretch: 0.045, boost: 1.8, order: 6 })
    this.glow = new SpritePool(scene, 900, TEX.dot(), 'add', { boost: 1.5, order: 6 })
    this.flame = new SpritePool(scene, 320, envTexture('fx.flame'), 'add', { boost: 1.25, order: 5 })
    this.smoke = new SpritePool(scene, 520, envTexture('fx.smoke'), 'lit', { order: 3 })
    this.dirt = new SpritePool(scene, 260, envTexture('fx.dirt'), 'albedo', { order: 3 })
    this.water = new SpritePool(scene, 260, envTexture('fx.splash'), 'albedo', { order: 3 })
    this.flashArc = new SpritePool(scene, 24, envTexture('fx.slash'), 'add', { boost: 1.6, order: 7 })
    this.flashStar = new SpritePool(scene, 24, TEX.star(), 'add', { boost: 1.3, order: 7 })
    const ringTex = TEX.ring()
    const ringGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2)
    for (let i = 0; i < 8; i += 1) {
      const mat = new THREE.MeshBasicMaterial({ map: ringTex, color: '#fff1c9', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
      const mesh = new THREE.Mesh(ringGeo, mat)
      mesh.visible = false
      mesh.renderOrder = 4
      scene.add(mesh)
      this.rings.push({ mesh, t: 0, dur: 0.5, radius: 10, alive: false })
    }
    this.markMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color('#ff9a3c') }, uK: { value: 0 }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uK; uniform float uTime; varying vec2 vUv;
        void main(){
          vec2 d = vUv - 0.5;
          float r = length(d) * 2.0;
          if (r > 1.0) discard;
          float ang = atan(d.y, d.x);
          float ring = smoothstep(0.86, 0.93, r) * (1.0 - smoothstep(0.96, 1.0, r));
          float ticks = step(0.5, fract(ang * 3.8197 + uTime * 0.8)) * smoothstep(0.78, 0.82, r) * (1.0 - smoothstep(0.84, 0.86, r));
          float fill = step(r, uK) * (0.22 + 0.16 * sin(uTime * 18.0)) * (0.6 + 0.4 * r);
          float inner = smoothstep(uK - 0.05, uK, r) * (1.0 - smoothstep(uK, uK + 0.02, r)) * 0.9;
          float a = max(ring * 0.95, max(fill, max(inner, ticks * 0.7)));
          gl_FragColor = vec4(uColor * 1.5, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const markGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2)
    for (let i = 0; i < 48; i += 1) {
      const mesh = new THREE.Mesh(markGeo, this.markMat.clone())
      mesh.visible = false
      mesh.renderOrder = 4
      scene.add(mesh)
      this.marks.push({ mesh, t: 0, delay: 1, alive: false })
    }
    // Debris: photoscanned rock chunks when available.
    const rockGeo = bakedGeometry('model.rockmoss_2')?.clone() ?? new THREE.IcosahedronGeometry(1, 1)
    rockGeo.computeBoundingSphere()
    const rs = 1 / Math.max(0.01, rockGeo.boundingSphere!.radius)
    rockGeo.scale(rs, rs, rs)
    const rockMat = new THREE.MeshStandardMaterial({ map: envTexture('tex.rock_moss_d'), normalMap: envTexture('tex.rock_moss_n'), roughness: 0.92, envMapIntensity: 0.2 })
    rockMat.color.setRGB(2.1, 2.05, 1.95)
    this.debrisMesh = new THREE.InstancedMesh(rockGeo, rockMat, 120)
    this.debrisMesh.castShadow = true
    this.debrisMesh.count = 0
    this.debrisMesh.frustumCulled = false
    scene.add(this.debrisMesh)
    // Slash trail ribbon: white-hot edge fading to the swing colour.
    const N = 16
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(N * 2 * 2), 2).setUsage(THREE.DynamicDrawUsage))
    const idx: number[] = []
    for (let i = 0; i < N - 1; i += 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
    geo.setIndex(idx)
    this.trailMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color('#ffe7b8') }, uFade: { value: 0 } },
      vertexShader: 'attribute vec2 aT; varying vec2 vT; void main(){ vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uFade; varying vec2 vT;
        void main(){
          float age = vT.x;
          float edge = smoothstep(0.0, 1.0, vT.y);
          float a = pow(1.0 - age, 1.8) * edge * uFade;
          float streaks = 0.75 + 0.25 * sin(vT.y * 40.0 + age * 12.0);
          vec3 hot = mix(uColor, vec3(1.0, 0.98, 0.92), smoothstep(0.75, 1.0, vT.y) * (1.0 - age));
          if (a < 0.01) discard;
          gl_FragColor = vec4(hot * 1.6 * streaks, a * 0.8);
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
    this.trail = new THREE.Mesh(geo, this.trailMat)
    this.trail.frustumCulled = false
    this.trail.renderOrder = 5
    this.trail.visible = false
    scene.add(this.trail)
    for (let i = 0; i < N; i += 1) {
      this.trailBase.push(new THREE.Vector3())
      this.trailTip.push(new THREE.Vector3())
      this.trailAge.push(1)
    }
  }

  private n(count: number): number {
    return Math.max(1, Math.round(count * this.density))
  }

  /** Live particle count across pools: the loader pauses background streaming when this is high. */
  get activeCount(): number {
    return this.sparksPool.alive + this.glow.alive + this.flame.alive + this.smoke.alive + this.dirt.alive + this.water.alive + this.debris.length * 3
  }

  /** Scene light level for lit sprites (smoke/dust darken at dusk or in shadowed arenas). */
  setLight(k: number): void {
    this.smoke.light = k
    this.dirt.light = k
    this.water.light = k
  }

  sparks(p: THREE.Vector3, count: number, color = '#ffc56b', speed = 9, dir?: THREE.Vector3): void {
    for (let i = 0, n = this.n(count); i < n; i += 1) {
      _v.set(Math.random() - 0.5, Math.random() * 0.8 + 0.1, Math.random() - 0.5).normalize().multiplyScalar(speed * rand(0.4, 1.2))
      if (dir) _v.addScaledVector(dir, speed * 0.5)
      this.sparksPool.spawn(p, _v, rand(0.22, 0.5), rand(0.05, 0.1), color, { gravity: -16, drag: 1.6, fadeIn: 0.001 })
    }
  }

  embers(p: THREE.Vector3, count: number, color: string, spread = 1, rise = 2.5): void {
    for (let i = 0, n = this.n(count); i < n; i += 1) {
      _v2.set(p.x + (Math.random() - 0.5) * spread, p.y + (Math.random() - 0.5) * spread, p.z + (Math.random() - 0.5) * spread)
      _v.set((Math.random() - 0.5) * 1.5, rise * rand(0.5, 1.5), (Math.random() - 0.5) * 1.5)
      this.glow.spawn(_v2, _v, rand(0.8, 2), rand(0.08, 0.2), color, { gravity: 0.4, drag: 0.6, fadeIn: 0.15 })
    }
  }

  /** Soft billowing dust at ground level (lit smoke sprites) with a few clods. */
  dust(p: THREE.Vector3, count: number, radius = 1.5, color = '#b9a888', size = 1.6): void {
    for (let i = 0, n = this.n(count); i < n; i += 1) {
      const a = Math.random() * Math.PI * 2
      const r = Math.random() * radius
      _v2.set(p.x + Math.cos(a) * r, p.y + 0.25 + Math.random() * 0.4, p.z + Math.sin(a) * r)
      _v.set(Math.cos(a) * rand(1, 4), rand(0.5, 2), Math.sin(a) * rand(1, 4))
      this.smoke.spawn(_v2, _v, rand(1.1, 2.2), size * rand(0.7, 1.3), color, { gravity: 0.25, drag: 1.9, grow: size * 0.9, spin: rand(-0.8, 0.8), alpha: 0.75, fadeIn: 0.12 })
    }
    if (size > 1.2) this.dirtBurst(p, Math.round(count * 0.35), 3 + size)
  }

  /** Flying soil clods and grass bits that bounce on the terrain. */
  dirtBurst(p: THREE.Vector3, count: number, power = 6): void {
    for (let i = 0, n = this.n(count); i < n; i += 1) {
      const a = Math.random() * Math.PI * 2
      _v.set(Math.cos(a) * power * rand(0.2, 0.8), power * rand(0.6, 1.3), Math.sin(a) * power * rand(0.2, 0.8))
      this.dirt.spawn(p, _v, rand(0.7, 1.3), rand(0.35, 0.9), '#ffffff', { gravity: -20, drag: 0.4, spin: rand(-6, 6), fadeIn: 0.001, ground: true })
    }
  }

  splash(p: THREE.Vector3, count: number, power = 1): void {
    for (let i = 0, n = this.n(Math.ceil(count * 0.5)); i < n; i += 1) {
      _v.set((Math.random() - 0.5) * 1.5 * power, rand(1.5, 3.5) * power, (Math.random() - 0.5) * 1.5 * power)
      this.water.spawn(p, _v, rand(0.45, 0.8), rand(0.8, 1.6) * power, '#f2fbff', { gravity: -9, drag: 0.8, grow: 2.2 * power, spin: rand(-0.5, 0.5), rot: rand(-0.3, 0.3), fadeIn: 0.05 })
    }
    for (let i = 0, n = this.n(count); i < n; i += 1) {
      const a = Math.random() * Math.PI * 2
      _v.set(Math.cos(a) * rand(1, 3) * power, rand(3, 7) * power, Math.sin(a) * rand(1, 3) * power)
      this.glow.spawn(p, _v, rand(0.5, 0.9), rand(0.05, 0.1), '#dff4ff', { gravity: -16, drag: 0.4, fadeIn: 0.001 })
    }
    this.smoke.spawn(p, _v.set(0, 0.6, 0), 1.4, 1.6 * power, '#e9f3f6', { grow: 2.5 * power, drag: 1, alpha: 0.45 })
  }

  /** Camera-facing flash: `arc` = slash crescent, `star` = radial flare. */
  flash(p: THREE.Vector3, color: string, size: number, kind: 'arc' | 'star' = 'star', life = 0.16): void {
    const pool = kind === 'arc' ? this.flashArc : this.flashStar
    pool.spawn(p, _v.set(0, 0, 0), life, size, color, { grow: kind === 'arc' ? size * 2.5 : size * 4, fadeIn: 0.001 })
  }

  /** Hit burst: slash arc, sparks, hide chips, a puff; vital hits add a star flare and embers. */
  impact(p: THREE.Vector3, color: string, heavy: boolean, vital: boolean): void {
    this.flash(p, vital ? '#ffc56b' : '#fff2d8', heavy ? 3.4 : 2.2, 'arc', heavy ? 0.2 : 0.14)
    if (vital || heavy) this.flash(p, vital ? '#ffb347' : '#fff6e6', vital ? 5.5 : 3.2, 'star', vital ? 0.24 : 0.14)
    this.sparks(p, heavy ? 34 : 16, vital ? '#ffd873' : '#ffe8c0', heavy ? 13 : 9)
    for (let i = 0, n = this.n(heavy ? 12 : 6); i < n; i += 1) {
      _v.set(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).multiplyScalar(7)
      this.dirt.spawn(p, _v, rand(0.5, 0.9), rand(0.18, 0.35), color, { gravity: -18, drag: 0.8, spin: rand(-8, 8), fadeIn: 0.001, ground: true })
    }
    this.smoke.spawn(p, _v.set(0, 0.4, 0), 0.9, heavy ? 1.6 : 1, '#d8ccb4', { grow: 2.4, drag: 1.5, alpha: 0.4, spin: rand(-1, 1) })
    if (vital) this.embers(p, 22, '#ffb347', 0.9, 3.5)
  }

  /** Flame burst (Ashwing embers, eruptions, charge overcharge). */
  fire(p: THREE.Vector3, count: number, color = '#ffb35a', spread = 1, rise = 5): void {
    for (let i = 0, n = this.n(count); i < n; i += 1) {
      _v2.set(p.x + (Math.random() - 0.5) * spread, p.y + Math.random() * 0.4, p.z + (Math.random() - 0.5) * spread)
      _v.set((Math.random() - 0.5) * 1.2, rise * rand(0.6, 1.3), (Math.random() - 0.5) * 1.2)
      this.flame.spawn(_v2, _v, rand(0.35, 0.75), rand(0.8, 1.8) * Math.max(0.6, spread * 0.5), color, { drag: 1.4, grow: -0.6, rot: rand(-0.25, 0.25), spin: rand(-0.6, 0.6), fadeIn: 0.12 })
    }
    this.embers(p, Math.round(count * 0.6), '#ffb347', spread, rise * 0.8)
    for (let i = 0, n = this.n(Math.ceil(count / 4)); i < n; i += 1)
      this.smoke.spawn(_v2.set(p.x, p.y + 1.2, p.z), _v.set((Math.random() - 0.5) * 1.5, rise * 0.5, (Math.random() - 0.5) * 1.5), rand(1.4, 2.4), rand(1, 2), '#4a4038', {
        grow: 2,
        drag: 1,
        alpha: 0.5,
        spin: rand(-0.5, 0.5),
        fadeIn: 0.3,
      })
  }

  /** Green healing spiral rising around the hunter. */
  heal(p: THREE.Vector3): void {
    for (let i = 0, n = this.n(36); i < n; i += 1) {
      const a = (i / 36) * Math.PI * 6
      const r = 0.7
      _v2.set(p.x + Math.cos(a) * r, p.y + (i / 36) * 1.6, p.z + Math.sin(a) * r)
      _v.set(-Math.sin(a) * 1.4, 1.4, Math.cos(a) * 1.4)
      this.glow.spawn(_v2, _v, rand(0.7, 1.2), rand(0.08, 0.16), i % 3 ? '#9dff8a' : '#e6ffd0', { drag: 0.8, fadeIn: 0.1 })
    }
    this.ring(p, 2.2, '#9dff8a', 0.6)
  }

  /** Blue afterimage points along the hunter's silhouette (Flow Evade). */
  ghost(points: THREE.Vector3[], color = '#7fd8ff'): void {
    for (const q of points) this.glow.spawn(q, _v.set(0, 0.2, 0), 0.45, 0.55, color, { alpha: 0.55, fadeIn: 0.001, grow: -0.6 })
  }

  /** One Emberwisp: a drifting guide light. */
  wisp(p: THREE.Vector3, v: THREE.Vector3, bright: number): void {
    this.glow.spawn(p, v, rand(1.2, 1.8), rand(0.1, 0.18) * (0.7 + bright * 0.5), bright > 0.6 ? '#9ff6ff' : '#6fd3ff', { drag: 0.3, alpha: 0.55 + bright * 0.45, fadeIn: 0.2 })
  }

  debrisBurst(p: THREE.Vector3, count: number, power: number): void {
    for (let i = 0, n = this.n(count); i < n; i += 1) {
      if (this.debris.length >= 120) this.debris.shift()
      const a = Math.random() * Math.PI * 2
      this.debris.push({
        p: new THREE.Vector3(p.x + Math.cos(a) * 1.5, p.y + 0.4, p.z + Math.sin(a) * 1.5),
        v: new THREE.Vector3(Math.cos(a) * power * rand(0.4, 1.4), power * rand(0.8, 1.7), Math.sin(a) * power * rand(0.4, 1.4)),
        r: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        w: new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12),
        s: rand(0.12, 0.5),
        life: rand(2.4, 3.6),
      })
    }
    this.dirtBurst(p, Math.round(count * 0.8), power * 0.8)
  }

  /** Ambient creature emitters (falling leaves, spores, embers, vent smoke, water drips, glints). */
  ambient(kind: 'leaf' | 'spore' | 'ember' | 'smoke' | 'drip' | 'glint', p: THREE.Vector3, vel?: THREE.Vector3): void {
    const vx = vel?.x ?? 0
    const vz = vel?.z ?? 0
    switch (kind) {
      case 'leaf':
        _v.set(vx * 0.4 + rand(-0.8, 0.8), rand(-0.3, 0.4), vz * 0.4 + rand(-0.8, 0.8))
        this.dirt.spawn(p, _v, rand(2.6, 4), rand(0.28, 0.42), Math.random() < 0.5 ? '#7e9a3a' : '#a5a24a', { gravity: -0.9, drag: 1.6, spin: rand(-4, 4), rot: rand(0, 6), fadeIn: 0.2, ground: true })
        break
      case 'spore':
        _v.set(rand(-0.3, 0.3), rand(0.2, 0.7), rand(-0.3, 0.3))
        this.glow.spawn(p, _v, rand(2.2, 3.6), rand(0.12, 0.22), '#e5f28e', { gravity: 0.05, drag: 0.8, fadeIn: 0.4 })
        break
      case 'ember':
        _v.set(vx * 0.3 + rand(-0.6, 0.6), rand(1.4, 3.2), vz * 0.3 + rand(-0.6, 0.6))
        this.glow.spawn(p, _v, rand(0.9, 1.8), rand(0.09, 0.18), Math.random() < 0.7 ? '#ffae4a' : '#ff6a2a', { gravity: 0.5, drag: 0.7, fadeIn: 0.1 })
        break
      case 'smoke':
        _v.set(vx * 0.3 + rand(-0.3, 0.3), rand(1.0, 1.8), vz * 0.3 + rand(-0.3, 0.3))
        this.smoke.spawn(p, _v, rand(1.8, 2.8), rand(0.7, 1.1), '#51453f', { drag: 0.6, grow: 1.6, spin: rand(-0.4, 0.4), alpha: 0.32, fadeIn: 0.3 })
        break
      case 'drip':
        _v.set(vx * 0.5, -0.4, vz * 0.5)
        this.water.spawn(p, _v, rand(0.7, 1.0), rand(0.16, 0.26), '#dff4f7', { gravity: -9.8, drag: 0.1, fadeIn: 0.05 })
        break
      case 'glint':
        _v.set(rand(-0.2, 0.2), rand(0.1, 0.4), rand(-0.2, 0.2))
        this.glow.spawn(p, _v, rand(1.2, 2), rand(0.1, 0.18), '#7ff5e6', { drag: 1.2, fadeIn: 0.3 })
        break
    }
  }
  /** Ground eruption: spikes burst out of the earth with dirt, clods and a flash of the theme colour. */
  rupture(p: THREE.Vector3, theme: SpikeTheme, radius: number, big: boolean): void {
    this.spikes.burst(p, theme, big ? 5 : 3, radius * 0.7, (theme === 'coral' ? 3.2 : theme === 'obsidian' ? 3.6 : 3.0) * (big ? 1.15 : 0.9))
    this.dirtBurst(p, big ? 10 : 6, 6.5)
    this.dust(p, big ? 6 : 3, radius * 0.6, theme === 'coral' ? '#b8c2bd' : '#a8977a', 2.2)
    if (big) this.debrisBurst(p, 3, 5)
  }
  ring(p: THREE.Vector3, radius: number, color = '#fff1c9', dur = 0.5): void {
    const r = this.rings.find(x => !x.alive) ?? this.rings[0]
    r.alive = true
    r.t = 0
    r.dur = dur
    r.radius = radius
    r.mesh.visible = true
    r.mesh.position.set(p.x, p.y + 0.3, p.z)
    ;(r.mesh.material as THREE.MeshBasicMaterial).color.set(color)
  }

  /** Big ground shockwave: ring, a dust wall and clods. */
  shockwave(p: THREE.Vector3, radius: number, color = '#fff1c9'): void {
    this.ring(p, radius, color, 0.55)
    this.ring(p, radius * 0.6, '#ffffff', 0.35)
    for (let i = 0, n = this.n(26); i < n; i += 1) {
      const a = (i / 26) * Math.PI * 2
      _v2.set(p.x + Math.cos(a) * radius * 0.25, p.y + 0.4, p.z + Math.sin(a) * radius * 0.25)
      _v.set(Math.cos(a) * radius * 1.4, rand(0.6, 1.8), Math.sin(a) * radius * 1.4)
      this.smoke.spawn(_v2, _v, rand(1.2, 1.9), rand(1.4, 2.4), '#bfb095', { drag: 2.6, grow: 2.2, spin: rand(-0.6, 0.6), alpha: 0.7 })
    }
  }

  mark(p: THREE.Vector3, radius: number, delay: number, color: string): void {
    const m = this.marks.find(x => !x.alive) ?? this.marks[0]
    m.alive = true
    m.t = 0
    m.delay = delay
    m.mesh.visible = true
    const n = normalAt(p.x, p.z)
    m.mesh.position.set(p.x, heightAt(p.x, p.z) + 0.12, p.z)
    m.mesh.quaternion.setFromUnitVectors(UP, _v.set(n.x, n.y, n.z))
    m.mesh.scale.setScalar(radius)
    ;(m.mesh.material as THREE.ShaderMaterial).uniforms.uColor.value.set(color)
  }

  clearMarks(): void {
    for (const m of this.marks) {
      m.alive = false
      m.mesh.visible = false
    }
  }

  /** Drop every live effect (hunt restart). */
  clearAll(): void {
    this.clearMarks()
    for (const p of [this.sparksPool, this.glow, this.flame, this.smoke, this.dirt, this.water, this.flashArc, this.flashStar]) p.clear()
    this.debris.length = 0
    this.spikes.clear()
  }

  trailStart(color: string): void {
    this.trailActive = true
    this.trailFade = 1
    this.trailMat.uniforms.uColor.value.set(color)
    for (let i = 0; i < this.trailAge.length; i += 1) this.trailAge[i] = 1
    this.trail.visible = true
  }

  trailPush(base: THREE.Vector3, tip: THREE.Vector3): void {
    if (!this.trailActive) return
    const b = this.trailBase.pop()!
    const t = this.trailTip.pop()!
    this.trailAge.pop()
    this.trailBase.unshift(b.copy(base))
    this.trailTip.unshift(t.copy(tip))
    this.trailAge.unshift(0)
  }

  trailEnd(): void {
    this.trailActive = false
  }

  update(dt: number): void {
    this.time += dt
    for (const p of [this.sparksPool, this.glow, this.flame, this.smoke, this.dirt, this.water, this.flashArc, this.flashStar]) p.update(dt)
    this.spikes.update(dt)
    for (const r of this.rings) {
      if (!r.alive) continue
      r.t += dt
      const k = r.t / r.dur
      if (k >= 1) {
        r.alive = false
        r.mesh.visible = false
        continue
      }
      const s = r.radius * (0.1 + 0.9 * Math.sqrt(k))
      r.mesh.scale.set(s, 1, s)
      ;(r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.95
    }
    for (const m of this.marks) {
      if (!m.alive) continue
      m.t += dt
      const u = (m.mesh.material as THREE.ShaderMaterial).uniforms
      u.uK.value = Math.min(1, m.t / m.delay)
      u.uTime.value = this.time
      if (m.t >= m.delay) {
        m.alive = false
        m.mesh.visible = false
      }
    }
    let n = 0
    for (let i = this.debris.length - 1; i >= 0; i -= 1) {
      const d = this.debris[i]
      d.life -= dt
      if (d.life <= 0) {
        this.debris.splice(i, 1)
        continue
      }
      d.v.y -= 22 * dt
      d.p.addScaledVector(d.v, dt)
      const g = heightAt(d.p.x, d.p.z) + d.s * 0.5
      if (d.p.y < g) {
        d.p.y = g
        d.v.multiplyScalar(0.35)
        d.v.y = Math.abs(d.v.y) * 0.3
        d.w.multiplyScalar(0.5)
      }
      d.r.x += d.w.x * dt
      d.r.y += d.w.y * dt
      d.r.z += d.w.z * dt
    }
    for (const d of this.debris) {
      _q.setFromEuler(d.r)
      const s = d.s * Math.min(1, d.life)
      _m.compose(d.p, _q, _s.set(s, s, s))
      this.debrisMesh.setMatrixAt(n, _m)
      n += 1
    }
    this.debrisMesh.count = n
    this.debrisMesh.instanceMatrix.needsUpdate = true
    if (this.trail.visible) {
      for (let i = 0; i < this.trailAge.length; i += 1) this.trailAge[i] += dt
      if (!this.trailActive) this.trailFade = Math.max(0, this.trailFade - dt * 5)
      if (this.trailFade <= 0) this.trail.visible = false
      this.trailMat.uniforms.uFade.value = this.trailFade
      const pos = this.trail.geometry.attributes.position as THREE.BufferAttribute
      const at = this.trail.geometry.attributes.aT as THREE.BufferAttribute
      const N = this.trailBase.length
      for (let i = 0; i < N; i += 1) {
        const b = this.trailBase[i]
        const t = this.trailTip[i]
        pos.setXYZ(i * 2, b.x, b.y, b.z)
        pos.setXYZ(i * 2 + 1, t.x, t.y, t.z)
        const age = Math.min(1, this.trailAge[i] / 0.22)
        at.setXY(i * 2, Math.max(age, i / (N - 1)), 0)
        at.setXY(i * 2 + 1, Math.max(age, i / (N - 1)), 1)
      }
      pos.needsUpdate = true
      at.needsUpdate = true
    }
  }
}


