import * as THREE from 'three'
import { SEA_LEVEL } from './config'
import { ICO2, MeshBuilder, lumpy } from './geo'
import { clamp, mulberry32, smoothstep } from './noise'

/** Day length in real seconds (one full cycle). */
export const DAY_SECONDS = 1200

type Key = { e: number; zenith: string; horizon: string; sun: string; fog: string }
// Keyed by sun elevation (sin of the sun angle).
const KEYS: Key[] = [
  { e: -0.4, zenith: '#070b16', horizon: '#141b29', sun: '#6b7fae', fog: '#111723' },
  { e: -0.12, zenith: '#1c2440', horizon: '#51405a', sun: '#8f6a8a', fog: '#35303f' },
  { e: 0.02, zenith: '#4a5f86', horizon: '#e39a62', sun: '#ffb070', fog: '#b98c6c' },
  { e: 0.18, zenith: '#5d86ad', horizon: '#e8cfa6', sun: '#ffe0b3', fog: '#c9bea4' },
  { e: 0.5, zenith: '#4f81b0', horizon: '#cfd6cf', sun: '#fff4e2', fog: '#b9c3be' },
  { e: 1, zenith: '#4479ad', horizon: '#c9d4d0', sun: '#ffffff', fog: '#b4c0bc' },
]
const KC = KEYS.map(k => ({ e: k.e, zenith: new THREE.Color(k.zenith), horizon: new THREE.Color(k.horizon), sun: new THREE.Color(k.sun), fog: new THREE.Color(k.fog) }))

function sample(e: number, field: 'zenith' | 'horizon' | 'sun' | 'fog', out: THREE.Color): THREE.Color {
  if (e <= KC[0].e) return out.copy(KC[0][field])
  for (let i = 1; i < KC.length; i++) {
    if (e <= KC[i].e) {
      const t = (e - KC[i - 1].e) / (KC[i].e - KC[i - 1].e)
      return out.copy(KC[i - 1][field]).lerp(KC[i][field], t)
    }
  }
  return out.copy(KC[KC.length - 1][field])
}

/** Clock text for a 0..1 day time (0 = midnight). */
export function clockText(t: number): string {
  const mins = Math.floor((((t % 1) + 1) % 1) * 24 * 60)
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

/** 0 at night, 1 in full day (smooth across dawn/dusk). */
export function daylight(t: number): number {
  const e = Math.sin((t - 0.25) * Math.PI * 2)
  return smoothstep(-0.12, 0.12, e)
}

export class Environment {
  readonly sun = new THREE.DirectionalLight(0xffffff, 3)
  readonly hemi = new THREE.HemisphereLight(0xbfd4e6, 0x5a4a36, 0.9)
  readonly fog = new THREE.Fog(0xb9c3be, 40, 140)
  readonly sunDir = new THREE.Vector3(0, 1, 0)
  private sky: THREE.Mesh
  private skyU: { zenith: { value: THREE.Color }; horizon: { value: THREE.Color }; sunColor: { value: THREE.Color }; sunDir: { value: THREE.Vector3 }; night: { value: number } }
  private stars: THREE.Points
  private clouds: THREE.Mesh
  private cloudMat: THREE.MeshLambertMaterial
  readonly water: THREE.Mesh
  private waterTex: THREE.CanvasTexture
  private tmp = new THREE.Color()
  /** Current 0..1 daylight factor. */
  day = 1
  underwater = false
  private fogFar = 140

  constructor(private readonly scene: THREE.Scene) {
    scene.fog = this.fog
    this.sun.castShadow = true
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.05
    const cam = this.sun.shadow.camera
    cam.left = cam.bottom = -45
    cam.right = cam.top = 45
    cam.near = 1
    cam.far = 260
    scene.add(this.sun, this.sun.target, this.hemi)

    this.skyU = {
      zenith: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      sunColor: { value: new THREE.Color() },
      sunDir: { value: this.sunDir },
      night: { value: 0 },
    }
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyU,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }',
      fragmentShader: `uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunColor; uniform vec3 sunDir; uniform float night; varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.5));
          col = mix(col, horizon * 0.72, clamp(-h * 4.0, 0.0, 1.0));
          float s = max(dot(d, sunDir), 0.0);
          col += sunColor * (pow(s, 1400.0) * 14.0 + pow(s, 60.0) * 0.35 + pow(s, 6.0) * 0.12) * (1.0 - night * 0.9);
          float m = max(dot(d, -sunDir), 0.0);
          col += vec3(0.85, 0.9, 1.0) * (pow(m, 2200.0) * 5.0 + pow(m, 60.0) * 0.05) * night;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    })
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMat)
    this.sky.renderOrder = -10
    this.sky.frustumCulled = false
    scene.add(this.sky)

    const rnd = mulberry32(99)
    const starPos: number[] = []
    for (let i = 0; i < 1600; i++) {
      const u = rnd() * 2 - 1
      const a = rnd() * Math.PI * 2
      const r = Math.sqrt(1 - u * u)
      if (u < -0.05) continue
      starPos.push(Math.cos(a) * r * 850, u * 850, Math.sin(a) * r * 850)
    }
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3))
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xdfe6ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }))
    this.stars.frustumCulled = false
    scene.add(this.stars)

    const cb = new MeshBuilder()
    const white = new THREE.Color(1, 1, 1)
    for (let c = 0; c < 16; c++) {
      const a = rnd() * Math.PI * 2
      const r = 220 + rnd() * 380
      const cx = Math.cos(a) * r
      const cz = Math.sin(a) * r
      const cy = 150 + rnd() * 40
      const n = 7 + Math.floor(rnd() * 6)
      const len = 40 + rnd() * 50
      for (let i = 0; i < n; i++) {
        // Heap the puffs: bigger and higher toward the middle of each cloud, flat-ish base.
        const u = n === 1 ? 0 : i / (n - 1) - 0.5
        const mid = 1 - Math.abs(u) * 1.4
        const s = (10 + rnd() * 8) * (0.6 + mid * 0.8)
        const px = cx + u * len + (rnd() - 0.5) * 6
        const pz = cz + (rnd() - 0.5) * 18
        const py = cy + s * 0.28 + rnd() * 3
        const m = new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), new THREE.Quaternion(), new THREE.Vector3(s, s * 0.62, s * 0.9))
        cb.add(lumpy(ICO2, rnd, 0.14), m, (_x, _y, _z, _nx, ny) => this.tmp.copy(white).multiplyScalar(0.9 + ny * 0.1))
      }
    }
    this.cloudMat = new THREE.MeshLambertMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0.94 })
    this.clouds = new THREE.Mesh(cb.build()!, this.cloudMat)
    this.clouds.frustumCulled = false
    scene.add(this.clouds)

    this.waterTex = this.makeWaterNormal()
    const wm = new THREE.MeshStandardMaterial({ color: 0x2f5a63, roughness: 0.42, metalness: 0, envMapIntensity: 0.3, transparent: true, opacity: 0.82, normalMap: this.waterTex, normalScale: new THREE.Vector2(0.45, 0.45) })
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600).rotateX(-Math.PI / 2), wm)
    this.water.position.y = SEA_LEVEL
    this.water.receiveShadow = true
    this.water.renderOrder = 2
    scene.add(this.water)
  }

  private makeWaterNormal(): THREE.CanvasTexture {
    const size = 128
    const c = document.createElement('canvas')
    c.width = c.height = size
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(size, size)
    const h = (x: number, y: number) => Math.sin((x / size) * Math.PI * 2 * 3 + Math.sin((y / size) * Math.PI * 2 * 2) * 1.5) * 0.5 + Math.sin((y / size) * Math.PI * 2 * 4 + (x / size) * Math.PI * 2) * 0.5
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = h(x + 1, y) - h(x - 1, y)
        const dy = h(x, y + 1) - h(x, y - 1)
        const n = new THREE.Vector3(-dx, -dy, 1.4).normalize()
        const i = (y * size + x) * 4
        img.data[i] = (n.x * 0.5 + 0.5) * 255
        img.data[i + 1] = (n.y * 0.5 + 0.5) * 255
        img.data[i + 2] = (n.z * 0.5 + 0.5) * 255
        img.data[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    const t = new THREE.CanvasTexture(c)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(160, 160)
    return t
  }

  setShadowQuality(enabled: boolean, size: number): void {
    this.sun.castShadow = enabled
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size)
      this.sun.shadow.map?.dispose()
      this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget
    }
  }

  setViewDistance(metres: number): void {
    this.fogFar = metres
  }

  /** Update lighting for day time `t` (0..1) around the camera at `focus`. */
  update(t: number, focus: THREE.Vector3, camY: number, seconds: number): void {
    const ang = (t - 0.25) * Math.PI * 2
    const e = Math.sin(ang)
    this.sunDir.set(Math.cos(ang) * 0.9, e, 0.35).normalize()
    this.day = smoothstep(-0.12, 0.12, e)
    const night = 1 - this.day
    const U = this.skyU
    sample(e, 'zenith', U.zenith.value)
    sample(e, 'horizon', U.horizon.value)
    sample(e, 'sun', U.sunColor.value)
    U.night.value = night

    // Key light: the sun by day, a cool moon by night (direction flips below the horizon).
    const lightDir = e > -0.04 ? this.sunDir : this.tmpDir.copy(this.sunDir).negate()
    const sunUp = clamp(e * 4, 0, 1)
    const moonUp = clamp(-e * 4, 0, 1)
    this.sun.intensity = sunUp * 3.1 + moonUp * 0.6
    if (e > -0.04) this.sun.color.copy(U.sunColor.value)
    else this.sun.color.set(0x9fb3e0)
    const snap = 2
    const fx = Math.round(focus.x / snap) * snap
    const fz = Math.round(focus.z / snap) * snap
    this.sun.position.set(fx + lightDir.x * 120, focus.y + lightDir.y * 120, fz + lightDir.z * 120)
    this.sun.target.position.set(fx, focus.y, fz)
    this.hemi.intensity = 0.42 + this.day * 0.62
    this.hemi.color.copy(U.zenith.value).lerp(this.tmp.set(0xffffff), 0.45)
    this.hemi.groundColor.set(0x5a4a36).multiplyScalar(0.4 + this.day * 0.6)

    this.underwater = camY < SEA_LEVEL - 0.05
    if (this.underwater) {
      this.fog.color.set(0x1f4048).multiplyScalar(0.35 + this.day * 0.65)
      this.fog.near = 0.5
      this.fog.far = 22
    } else {
      sample(e, 'fog', this.fog.color)
      this.fog.near = this.fogFar * 0.3
      this.fog.far = this.fogFar
    }

    this.sky.position.copy(focus)
    this.stars.position.copy(focus)
    this.stars.rotation.y = t * Math.PI * 2
    ;(this.stars.material as THREE.PointsMaterial).opacity = smoothstep(0.35, 0.95, night)
    this.clouds.position.set(focus.x, 0, focus.z)
    this.clouds.rotation.y += seconds * 0.002
    this.cloudMat.color.copy(U.horizon.value).lerp(this.tmp.set(0xffffff), 0.35 + this.day * 0.5)
    // Self-lit fill keeps shaded undersides soft instead of stony grey.
    this.cloudMat.emissive.copy(this.cloudMat.color).multiplyScalar(0.18 + this.day * 0.42)
    this.water.position.set(Math.round(focus.x / 10) * 10, SEA_LEVEL, Math.round(focus.z / 10) * 10)
    // The plane moves in whole 10 m tiles, so the ripple texture stays world-stable.
    this.waterTime += seconds
    this.waterTex.offset.set(this.waterTime * 0.012, this.waterTime * 0.007)
    ;(this.water.material as THREE.MeshStandardMaterial).color.set(0x2f5a63).multiplyScalar(0.3 + this.day * 0.7)
  }

  private tmpDir = new THREE.Vector3()
  private waterTime = 0

  dispose(): void {
    this.scene.remove(this.sky, this.stars, this.clouds, this.water, this.sun, this.sun.target, this.hemi)
  }
}
