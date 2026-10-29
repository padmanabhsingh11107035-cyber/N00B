import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Theme } from './levels'

/**
 * The battlefield around the castle: gradient sky with sun glow, a low-poly valley (flat where
 * physics happens), distant mountains, drifting clouds, instanced trees/rocks/grass, and the
 * sun + hemisphere lighting for each theme. Purely visual — physics uses a flat ground plane.
 */
type ThemeDef = {
  top: number
  mid: number
  horizon: number
  ground: number
  sun: THREE.Vector3
  sunColor: number
  sunIntensity: number
  hemiSky: number
  hemiGround: number
  hemiIntensity: number
  fogNear: number
  fogFar: number
  grass: number[]
  mountain: number
  cloud: number
  exposure: number
  motes: number
}

export const THEMES: Record<Theme, ThemeDef> = {
  sunset: {
    top: 0x4a74b8,
    mid: 0xf2b27a,
    horizon: 0xffdca8,
    ground: 0x6a8a44,
    sun: new THREE.Vector3(0.62, 0.42, -0.66).normalize(),
    sunColor: 0xffd2a0,
    sunIntensity: 2.6,
    hemiSky: 0xbcd4ff,
    hemiGround: 0x7a6040,
    hemiIntensity: 1.05,
    fogNear: 70,
    fogFar: 230,
    grass: [0x86b24e, 0x7aa847, 0x94bd58, 0x70a043],
    mountain: 0x8c8fb0,
    cloud: 0xfff0e0,
    exposure: 1.02,
    motes: 0xfff2c0,
  },
  dusk: {
    top: 0x1f2a5c,
    mid: 0x7a5a9a,
    horizon: 0xf29a78,
    ground: 0x4b6a48,
    sun: new THREE.Vector3(-0.78, 0.36, 0.22).normalize(),
    sunColor: 0xffb892,
    sunIntensity: 2.4,
    hemiSky: 0x9fb0ee,
    hemiGround: 0x5c4c58,
    hemiIntensity: 1.25,
    fogNear: 60,
    fogFar: 210,
    grass: [0x5f8c4c, 0x557f45, 0x6a9855, 0x4e7640],
    mountain: 0x5b5a88,
    cloud: 0xf0c8d8,
    exposure: 1.05,
    motes: 0xffd27a,
  },
}

let seed = 7
const rnd = () => {
  seed = (seed * 16807) % 2147483647
  return seed / 2147483647
}

function colorize(g: THREE.BufferGeometry, color: number, vary = 0.06): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g
  const n = geo.attributes.position.count
  const arr = new Float32Array(n * 3)
  const c = new THREE.Color()
  for (let t = 0; t < n / 3; t += 1) {
    c.set(color).multiplyScalar(1 + (rnd() - 0.5) * 2 * vary)
    for (let v = 0; v < 3; v += 1) arr.set([c.r, c.g, c.b], (t * 3 + v) * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  geo.deleteAttribute('uv')
  return geo
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function noise2(x: number, z: number): number {
  return Math.sin(x * 0.071 + Math.sin(z * 0.05) * 1.7) * 0.5 + Math.sin(z * 0.083 + x * 0.021) * 0.35 + Math.sin((x + z) * 0.17) * 0.15
}

/** Visual terrain height. Zero across the play corridor so it matches the physics ground. */
export function terrainHeight(x: number, z: number): number {
  // Catapult mound.
  const dm = Math.hypot(x, z - 0.6)
  const mound = 1.36 * (1 - smoothstep(3.6, 8.5, dm))
  // Distance outside the play corridor.
  const cx = Math.max(0, Math.abs(x) - 17)
  const cz = Math.max(0, -62 - z, z - 12)
  const out = Math.hypot(cx, cz)
  const hills = (noise2(x, z) * 0.5 + 0.55) * 9 * smoothstep(0, 38, out) + smoothstep(30, 110, out) * 10
  return Math.max(mound, hills - 0.02)
}

export class World {
  readonly group = new THREE.Group()
  readonly sun: THREE.DirectionalLight
  readonly hemi: THREE.HemisphereLight
  readonly theme: ThemeDef
  private clouds: THREE.Object3D[] = []
  private motes?: THREE.Points
  private skyMat: THREE.ShaderMaterial

  constructor(themeId: Theme, readonly detail: 'low' | 'medium' | 'high', castleZ: number) {
    seed = themeId === 'sunset' ? 11 : 23
    const th = (this.theme = THEMES[themeId])
    // Sky dome.
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(th.top) },
        mid: { value: new THREE.Color(th.mid) },
        horizon: { value: new THREE.Color(th.horizon) },
        sunDir: { value: th.sun.clone() },
        sunColor: { value: new THREE.Color(th.sunColor) },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; varying vec3 vDir;
        void main(){ float h = vDir.y; vec3 c = mix(horizon, mid, smoothstep(0.0, 0.22, h)); c = mix(c, top, smoothstep(0.18, 0.75, h));
        c = mix(c, horizon * 0.9, smoothstep(0.0, -0.2, h));
        float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        c += sunColor * (pow(s, 900.0) * 3.0 + pow(s, 24.0) * 0.35 + pow(s, 4.0) * 0.12);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
    })
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), this.skyMat)
    sky.renderOrder = -10
    sky.frustumCulled = false
    this.group.add(sky)

    // Lights.
    this.hemi = new THREE.HemisphereLight(th.hemiSky, th.hemiGround, th.hemiIntensity)
    this.group.add(this.hemi)
    this.sun = new THREE.DirectionalLight(th.sunColor, th.sunIntensity)
    const target = new THREE.Vector3(0, 0, castleZ * 0.72)
    this.sun.position.copy(target).addScaledVector(th.sun, 80)
    this.sun.target.position.copy(target)
    this.sun.castShadow = true
    const cam = this.sun.shadow.camera
    cam.left = -30
    cam.right = 30
    cam.top = 30
    cam.bottom = -30
    cam.near = 20
    cam.far = 160
    this.sun.shadow.bias = -0.0006
    this.sun.shadow.normalBias = 0.03
    this.group.add(this.sun, this.sun.target)
    const fill = new THREE.DirectionalLight(th.hemiSky, 0.35)
    fill.position.set(-th.sun.x * 50, 30, -th.sun.z * 50)
    this.group.add(fill)

    this.buildTerrain()
    this.buildMountains()
    this.buildClouds()
    this.buildTrees()
    this.buildProps()
    if (detail !== 'low') this.buildMotes()
  }

  get fogColor(): THREE.Color {
    return new THREE.Color(this.theme.horizon).lerp(new THREE.Color(this.theme.mid), 0.25)
  }

  private buildTerrain(): void {
    const size = 420
    const seg = this.detail === 'low' ? 70 : 110
    const g = new THREE.PlaneGeometry(size, size, seg, seg)
    g.rotateX(-Math.PI / 2)
    g.translate(0, 0, -30)
    const p = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i += 1) {
      const x = p.getX(i)
      const z = p.getZ(i)
      // Keep the grid regular in the corridor, jitter outside for a faceted look.
      const out = Math.abs(x) > 18 || z < -64 || z > 14
      const jx = out ? (rnd() - 0.5) * 1.6 : 0
      const jz = out ? (rnd() - 0.5) * 1.6 : 0
      p.setXYZ(i, x + jx, terrainHeight(x + jx, z + jz), z + jz)
    }
    const geo = g.toNonIndexed()
    const pos = geo.attributes.position as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)
    const c = new THREE.Color()
    const dirt = new THREE.Color(0xc79f68)
    const rock = new THREE.Color(this.theme.mountain).lerp(new THREE.Color(0x8a8578), 0.5)
    for (let t = 0; t < pos.count / 3; t += 1) {
      const i = t * 3
      const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3
      const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3
      const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3
      c.set(this.theme.grass[Math.floor(rnd() * this.theme.grass.length)])
      // Dirt road from the catapult to the castle, and a trampled yard around the castle.
      const road = Math.abs(x - Math.sin(z * 0.12) * 1.2) < 1.6 && z < 2 && z > -30
      const yard = Math.hypot(x * 0.8, z + 37) < 9.5
      if (road) c.lerp(dirt, 0.8)
      else if (yard) c.lerp(dirt, 0.35 + rnd() * 0.2)
      if (y > 9) c.lerp(rock, smoothstep(9, 18, y))
      c.multiplyScalar(0.94 + rnd() * 0.1)
      for (let v = 0; v < 3; v += 1) colors.set([c.r, c.g, c.b], (i + v) * 3)
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }))
    mesh.receiveShadow = true
    this.group.add(mesh)
  }

  private buildMountains(): void {
    const parts: THREE.BufferGeometry[] = []
    for (let i = 0; i < 26; i += 1) {
      const a = (i / 26) * Math.PI * 2 + rnd() * 0.2
      const d = 190 + rnd() * 60
      const h = 40 + rnd() * 55
      const r = 38 + rnd() * 30
      const cone = new THREE.ConeGeometry(r, h, 5 + Math.floor(rnd() * 3), 1)
      cone.rotateY(rnd() * Math.PI)
      cone.translate(Math.sin(a) * d, h / 2 - 6, -30 - Math.cos(a) * d)
      parts.push(colorize(cone, this.theme.mountain, 0.08))
      // Snow cap on the tallest.
      if (h > 80) {
        const cap = new THREE.ConeGeometry(r * 0.28, h * 0.28, 5)
        cap.translate(Math.sin(a) * d, h - 6 - h * 0.14 + 0.5, -30 - Math.cos(a) * d)
        parts.push(colorize(cap, 0xf4f0ff, 0.03))
      }
    }
    const geo = mergeGeometries(parts)!
    geo.computeVertexNormals()
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }))
    this.group.add(mesh)
  }

  private buildClouds(): void {
    const mat = new THREE.MeshStandardMaterial({ color: this.theme.cloud, flatShading: true, roughness: 1, emissive: this.theme.cloud, emissiveIntensity: 0.25, fog: false })
    for (let i = 0; i < 14; i += 1) {
      const parts: THREE.BufferGeometry[] = []
      const n = 3 + Math.floor(rnd() * 4)
      for (let k = 0; k < n; k += 1) {
        const s = 4 + rnd() * 5
        const ico = new THREE.IcosahedronGeometry(s, 0)
        ico.scale(1.3, 0.7, 1)
        ico.translate(k * 5 - n * 2.5 + rnd() * 2, rnd() * 2, rnd() * 4)
        parts.push(ico)
      }
      const cloud = new THREE.Mesh(mergeGeometries(parts)!, mat)
      const a = rnd() * Math.PI * 2
      const d = 120 + rnd() * 120
      cloud.position.set(Math.sin(a) * d, 55 + rnd() * 35, -40 - Math.cos(a) * d * 0.8)
      cloud.userData.speed = 0.6 + rnd() * 0.8
      this.clouds.push(cloud)
      this.group.add(cloud)
    }
  }

  private buildTrees(): void {
    const pine = mergeGeometries([
      colorize(new THREE.CylinderGeometry(0.22, 0.3, 1.4, 5).translate(0, 0.7, 0), 0x6b4a2e),
      colorize(new THREE.ConeGeometry(1.6, 2.6, 6).translate(0, 2.4, 0), 0x3f7a4a),
      colorize(new THREE.ConeGeometry(1.25, 2.2, 6).translate(0, 3.6, 0), 0x47885a),
      colorize(new THREE.ConeGeometry(0.85, 1.8, 6).translate(0, 4.7, 0), 0x519462),
    ])!
    const round = mergeGeometries([
      colorize(new THREE.CylinderGeometry(0.24, 0.32, 1.8, 5).translate(0, 0.9, 0), 0x6b4a2e),
      colorize(new THREE.IcosahedronGeometry(1.7, 0).translate(0, 3.0, 0), 0x6ea24a, 0.1),
      colorize(new THREE.IcosahedronGeometry(1.1, 0).translate(0.9, 2.5, 0.4), 0x7cb052, 0.1),
    ])!
    pine.computeVertexNormals()
    round.computeVertexNormals()
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 })
    const count = this.detail === 'low' ? 90 : this.detail === 'medium' ? 150 : 210
    const pines = new THREE.InstancedMesh(pine, mat, count)
    const rounds = new THREE.InstancedMesh(round, mat, count)
    let np = 0
    let nr = 0
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    for (let tries = 0; tries < count * 6 && (np < count || nr < count); tries += 1) {
      const x = (rnd() - 0.5) * 260
      const z = 20 - rnd() * 170
      // Keep the flight corridor and the view behind the catapult clear.
      if (Math.abs(x) < 22 && z > -70 && z < 16) continue
      if (Math.abs(x) < 10 && z > 0) continue
      const y = terrainHeight(x, z)
      if (y > 16) continue
      const s = 0.8 + rnd() * 0.9
      q.setFromAxisAngle(up, rnd() * Math.PI * 2)
      m.compose(new THREE.Vector3(x, y - 0.1, z), q, new THREE.Vector3(s, s * (0.9 + rnd() * 0.3), s))
      if (rnd() < 0.55 && np < count) pines.setMatrixAt(np++, m)
      else if (nr < count) rounds.setMatrixAt(nr++, m)
    }
    pines.count = np
    rounds.count = nr
    for (const t of [pines, rounds]) {
      t.castShadow = this.detail === 'high'
      t.receiveShadow = true
      this.group.add(t)
    }
    // Rocks.
    const rockGeo = colorize(new THREE.DodecahedronGeometry(1, 0), 0x9a968c, 0.1)
    rockGeo.computeVertexNormals()
    const rocks = new THREE.InstancedMesh(rockGeo, mat, 60)
    let nk = 0
    for (let i = 0; i < 400 && nk < 60; i += 1) {
      const x = (rnd() - 0.5) * 120
      const z = 12 - rnd() * 90
      if (Math.abs(x) < 15 && z > -60) continue
      const s = 0.4 + rnd() * 1.4
      q.setFromEuler(new THREE.Euler(rnd(), rnd() * 3, rnd()))
      m.compose(new THREE.Vector3(x, terrainHeight(x, z) + s * 0.2, z), q, new THREE.Vector3(s, s * 0.7, s))
      rocks.setMatrixAt(nk++, m)
    }
    rocks.count = nk
    rocks.receiveShadow = true
    this.group.add(rocks)
    // Grass tufts across the field (skip on low).
    if (this.detail !== 'low') {
      const tuft = mergeGeometries([0, 1, 2].map(k => colorize(new THREE.ConeGeometry(0.09, 0.5, 3).rotateZ((k - 1) * 0.35).translate((k - 1) * 0.1, 0.22, 0), this.theme.grass[2], 0.1)))!
      tuft.computeVertexNormals()
      const n = this.detail === 'high' ? 900 : 450
      const grass = new THREE.InstancedMesh(tuft, mat, n)
      let ng = 0
      for (let i = 0; i < n * 3 && ng < n; i += 1) {
        const x = (rnd() - 0.5) * 70
        const z = 14 - rnd() * 90
        if (Math.abs(x - Math.sin(z * 0.12) * 1.2) < 2 && z < 2 && z > -30) continue
        const s = 0.7 + rnd() * 0.9
        q.setFromAxisAngle(up, rnd() * 6)
        m.compose(new THREE.Vector3(x, terrainHeight(x, z), z), q, new THREE.Vector3(s, s, s))
        grass.setMatrixAt(ng++, m)
      }
      grass.count = ng
      this.group.add(grass)
    }
  }

  private buildProps(): void {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 })
    // Spare ammunition pile and a camp banner next to the catapult.
    const parts: THREE.BufferGeometry[] = []
    const stone = 0x8f8a82
    const pile: [number, number, number][] = [[2.6, 0.35, 1.2], [3.2, 0.35, 1.4], [2.9, 0.35, 1.9], [2.9, 0.9, 1.5], [3.4, 0.35, 0.8]]
    for (const [x, y, z] of pile) parts.push(colorize(new THREE.IcosahedronGeometry(0.42, 0).translate(x, y + terrainHeight(x, z) - 0.05, z), stone, 0.1))
    // Wooden platform under the catapult.
    for (let i = 0; i < 6; i += 1) parts.push(colorize(new THREE.BoxGeometry(3.6, 0.14, 0.62).translate(0, 1.33, -1.6 + i * 0.64), 0x9c6435, 0.07))
    // Banner pole + cloth.
    const bx = -4.6
    const bz = -1.6
    const by = terrainHeight(bx, bz)
    parts.push(colorize(new THREE.CylinderGeometry(0.06, 0.07, 3.6, 5).translate(bx, by + 1.8, bz), 0x5e3a20))
    parts.push(colorize(new THREE.BoxGeometry(0.05, 1.1, 0.7).translate(bx, by + 2.9, bz + 0.37), 0xe8a23a, 0.02))
    parts.push(colorize(new THREE.OctahedronGeometry(0.24).scale(0.3, 1, 1).translate(bx + 0.03, by + 2.95, bz + 0.37), 0x7a2a1e, 0.02))
    // Fences along the field edges.
    for (const side of [-1, 1]) for (let i = 0; i < 9; i += 1) {
      const z = 4 - i * 3.2
      const x = side * (13 + Math.sin(i) * 0.5)
      const y = terrainHeight(x, z)
      parts.push(colorize(new THREE.BoxGeometry(0.16, 1.1, 0.16).translate(x, y + 0.55, z), 0x7a5230))
      if (i < 8) parts.push(colorize(new THREE.BoxGeometry(0.08, 0.14, 3.2).translate(x, y + 0.75, z - 1.6), 0x9c6a3c))
    }
    const geo = mergeGeometries(parts)!
    geo.computeVertexNormals()
    const mesh = new THREE.Mesh(geo, mat)
    mesh.castShadow = true
    mesh.receiveShadow = true
    this.group.add(mesh)
  }

  private buildMotes(): void {
    const n = 140
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i += 1) pos.set([(rnd() - 0.5) * 60, 0.5 + rnd() * 10, 8 - rnd() * 60], i * 3)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const m = new THREE.PointsMaterial({ color: this.theme.motes, size: 0.12, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending })
    this.motes = new THREE.Points(g, m)
    this.group.add(this.motes)
  }

  update(time: number, dt: number): void {
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt
      if (c.position.x > 260) c.position.x = -260
    }
    if (this.motes) {
      const p = this.motes.geometry.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < p.count; i += 1) {
        p.setY(i, p.getY(i) + Math.sin(time * 0.7 + i) * 0.004)
        p.setX(i, p.getX(i) + Math.cos(time * 0.5 + i * 1.3) * 0.004)
      }
      p.needsUpdate = true
    }
  }

  setShadowSize(size: number): void {
    this.sun.shadow.mapSize.set(size, size)
    this.sun.shadow.map?.dispose()
    this.sun.shadow.map = null
  }

  dispose(): void {
    this.group.traverse(o => {
      const m = o as THREE.Mesh
      if (m.geometry) m.geometry.dispose()
      const mat = m.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach(x => x.dispose())
      else mat?.dispose()
    })
    this.sun.shadow.map?.dispose()
  }
}
