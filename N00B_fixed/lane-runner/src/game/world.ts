/**
 * The world: an endless ruined city road running toward −Z (world z = −distance).
 *
 * Everything is recycled around the camera: the road/sidewalk strip snaps forward in 24 m steps
 * (texture-continuous), buildings and props live in deterministic slots (hash of slot index) so the
 * street wall is stable while it scrolls, and every sector has its own theme (sky, fog, light,
 * facade set, prop mix, ambient particles) that blends in over the first metres of the sector.
 * Surfaces are matte (no metalness, no env reflections) to avoid glare.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Assets } from '../engine/assets'
import type { Fx } from './fx'
import { ROAD_HALF, THEME_COUNT } from './procgen'
import { SECTOR_LEN } from './rules'

type PropKind = 'car' | 'barrier' | 'lamp' | 'dumpster' | 'fireBarrel' | 'rubble' | 'sandbags' | 'container' | 'fence' | 'grave' | 'hazmat' | 'tyres' | 'drums'
export interface Theme {
  name: string
  skyTop: number; skyHorizon: number; fog: number; fogNear: number; fogFar: number
  sun: number; sunI: number; sunDir: [number, number, number]; hemiSky: number; hemiGround: number; hemiI: number
  road: number; facade: number; facades: ('facade_a' | 'facade_b' | 'facade_c')[]
  props: Partial<Record<PropKind, number>>; exposure: number
  ambient: 'embers' | 'ash' | 'toxic' | 'fogbank' | 'dust'
  skyline: number; lampGlow: number
}
export const THEMES: Theme[] = [
  { name: 'Downtown Dusk', skyTop: 0x1b2340, skyHorizon: 0xe0703a, fog: 0x5b4447, fogNear: 45, fogFar: 175, sun: 0xffb27a, sunI: 2.1, sunDir: [-0.4, 0.55, -1],
    hemiSky: 0x9aa8d8, hemiGround: 0x3a2c24, hemiI: 1.05, road: 0xb8b0aa, facade: 0xd8cfc6, facades: ['facade_a', 'facade_b'],
    props: { car: 3, barrier: 2, lamp: 2.2, fireBarrel: 1.1, dumpster: 1, rubble: 1.2, tyres: 0.9, drums: 0.6 }, exposure: 1.0, ambient: 'embers', skyline: 0xe8b0a0, lampGlow: 0.55 },
  { name: 'Industrial Docks', skyTop: 0x27394a, skyHorizon: 0x9aa7a2, fog: 0x56636b, fogNear: 40, fogFar: 165, sun: 0xdfe8f0, sunI: 1.6, sunDir: [0.5, 0.7, -0.6],
    hemiSky: 0xb6c6d4, hemiGround: 0x33322e, hemiI: 1.15, road: 0xa9aaa6, facade: 0xc9cdd0, facades: ['facade_c', 'facade_b'],
    props: { container: 2.4, barrier: 2, lamp: 1.6, dumpster: 1, car: 1.2, sandbags: 1, drums: 1.4, tyres: 0.8 }, exposure: 1.0, ambient: 'dust', skyline: 0xb8c4cc, lampGlow: 0.3 },
  { name: 'Quarantine Zone', skyTop: 0x14231a, skyHorizon: 0x7fa45e, fog: 0x3c5137, fogNear: 32, fogFar: 150, sun: 0xd6ffb0, sunI: 1.5, sunDir: [-0.3, 0.6, -1],
    hemiSky: 0xa8d69a, hemiGround: 0x2a2e20, hemiI: 1.05, road: 0xa4ab98, facade: 0xbcc8b0, facades: ['facade_b', 'facade_a'],
    props: { hazmat: 2.2, sandbags: 2, barrier: 2, fence: 1.4, car: 1.4, lamp: 1.2, drums: 0.8 }, exposure: 1.0, ambient: 'toxic', skyline: 0xb0d0a0, lampGlow: 0.35 },
  { name: 'Burning Highway', skyTop: 0x0a0c18, skyHorizon: 0xc2441c, fog: 0x2e1c1d, fogNear: 38, fogFar: 160, sun: 0xff8a4a, sunI: 1.7, sunDir: [0.2, 0.5, -1],
    hemiSky: 0x7a6aa0, hemiGround: 0x40241a, hemiI: 1.0, road: 0x9d938e, facade: 0xb8aaa2, facades: ['facade_c', 'facade_a'],
    props: { car: 3.2, fireBarrel: 2.4, barrier: 2.2, rubble: 1.6, lamp: 1.4, tyres: 1.4 }, exposure: 1.08, ambient: 'embers', skyline: 0xff9a7a, lampGlow: 0.7 },
  { name: 'Cemetery Fog', skyTop: 0x262a36, skyHorizon: 0x8a8fa0, fog: 0x62677a, fogNear: 22, fogFar: 125, sun: 0xcfd6ff, sunI: 1.3, sunDir: [0.3, 0.8, -0.5],
    hemiSky: 0xb8c0e0, hemiGround: 0x2c2c30, hemiI: 1.2, road: 0x9fa0a6, facade: 0xb4b4bc, facades: ['facade_a'],
    props: { grave: 3, fence: 2.4, rubble: 1.4, lamp: 1.2, car: 0.6 }, exposure: 1.0, ambient: 'fogbank', skyline: 0xc0c4d8, lampGlow: 0.45 },
]

// ───────────── helpers ─────────────
function colored(g: THREE.BufferGeometry, hex: number, jitter = 0): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g
  const n = geo.getAttribute('position').count
  const c = new THREE.Color(hex)
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const k = jitter ? 1 + (Math.random() * 2 - 1) * jitter : 1
    arr[i * 3] = c.r * k; arr[i * 3 + 1] = c.g * k; arr[i * 3 + 2] = c.b * k
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  geo.deleteAttribute('uv')
  return geo
}
const at = (g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
  g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g
}
function propGeometry(kind: PropKind): THREE.BufferGeometry {
  const B = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)
  const parts: THREE.BufferGeometry[] = []
  switch (kind) {
    case 'car': {
      parts.push(colored(at(B(1.9, 0.62, 4.3), 0, 0.62, 0), 0xffffff, 0.04))
      const cab = B(1.72, 0.62, 2.2); const p = cab.getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setX(i, p.getX(i) * 0.86); p.setZ(i, p.getZ(i) * 0.78) }
      parts.push(colored(at(cab, 0, 1.23, -0.2), 0xe6e6e6, 0.03))
      parts.push(colored(at(B(1.6, 0.46, 2.0), 0, 1.26, -0.2), 0x1a1d22))
      for (const [x, z] of [[-0.9, 1.35], [0.9, 1.35], [-0.9, -1.4], [0.9, -1.4]]) parts.push(colored(at(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12), x, 0.36, z, 0, 0, Math.PI / 2), 0x151515))
      parts.push(colored(at(B(1.8, 0.16, 0.12), 0, 0.72, 2.18), 0x777777))
      parts.push(colored(at(B(0.4, 0.14, 0.06), -0.6, 0.8, 2.2), 0xfff0c0))
      parts.push(colored(at(B(0.4, 0.14, 0.06), 0.6, 0.8, 2.2), 0xfff0c0))
      break
    }
    case 'barrier': {
      const g = new THREE.CylinderGeometry(0.2, 0.42, 0.85, 4, 1)
      g.rotateY(Math.PI / 4); g.scale(1, 1, 5.4)
      parts.push(colored(at(g, 0, 0.42, 0), 0xb9b4aa, 0.05))
      parts.push(colored(at(B(0.62, 0.12, 2.2), 0, 0.06, 0), 0xa8a399))
      parts.push(colored(at(B(0.44, 0.1, 0.5), 0, 0.6, 0.6), 0xd05a22))
      break
    }
    case 'lamp':
      parts.push(colored(at(new THREE.CylinderGeometry(0.09, 0.13, 7, 8), 0, 3.5, 0), 0x3b3e42))
      parts.push(colored(at(B(0.12, 0.12, 2.4), 0, 6.9, 0), 0x3b3e42, 0).rotateZ(0))
      parts.push(colored(at(B(0.5, 0.18, 0.8), 0, 6.8, 1.1), 0x2c2e31))
      parts.push(colored(at(B(0.4, 0.04, 0.6), 0, 6.69, 1.1), 0xfff2d0))
      break
    case 'dumpster':
      parts.push(colored(at(B(2.0, 1.25, 1.2), 0, 0.72, 0), 0x2f5a3e, 0.05))
      parts.push(colored(at(B(2.05, 0.1, 1.3), 0, 1.4, -0.05, -0.2), 0x24452f))
      for (const x of [-0.8, 0.8]) parts.push(colored(at(new THREE.CylinderGeometry(0.1, 0.1, 0.14, 8), x, 0.1, 0.45, Math.PI / 2), 0x111111))
      break
    case 'fireBarrel':
      parts.push(colored(at(new THREE.CylinderGeometry(0.34, 0.34, 0.95, 12, 1, true), 0, 0.48, 0), 0x6a3a22, 0.1))
      parts.push(colored(at(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 12), 0, 0.3, 0), 0x3a2418))
      parts.push(colored(at(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 12), 0, 0.7, 0), 0x3a2418))
      parts.push(colored(at(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 12), 0, 0.88, 0), 0xff7a2a))
      break
    case 'rubble':
      for (let i = 0; i < 7; i++) {
        const g = new THREE.IcosahedronGeometry(0.25 + Math.random() * 0.45, 0)
        g.scale(1, 0.55, 1)
        parts.push(colored(at(g, (Math.random() - 0.5) * 2.4, 0.12, (Math.random() - 0.5) * 2.4, Math.random(), Math.random(), 0), 0x7a746c, 0.12))
      }
      parts.push(colored(at(B(0.12, 0.12, 2.2), 0.3, 0.3, 0, 0.3, 0.6, 0.2), 0x5a3a2a))
      break
    case 'sandbags':
      for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) {
        const g = new THREE.CapsuleGeometry(0.2, 0.55, 2, 6)
        g.rotateZ(Math.PI / 2); g.scale(1, 0.7, 1.3)
        parts.push(colored(at(g, 0, 0.18 + r * 0.3, (i - 1.5) * 0.62 + (r ? 0.3 : 0), 0, Math.PI / 2), 0x9a8a62, 0.08))
      }
      break
    case 'container':
      parts.push(colored(at(B(2.4, 2.6, 6.0), 0, 1.3, 0), 0xffffff, 0.02))
      for (let i = -5; i <= 5; i++) parts.push(colored(at(B(2.46, 2.4, 0.08), 0, 1.3, i * 0.52), 0xdddddd))
      break
    case 'fence':
      for (let i = -2; i <= 2; i++) parts.push(colored(at(B(0.08, 1.8, 0.08), 0, 0.9, i * 1.0), 0x2a2a2a))
      parts.push(colored(at(B(0.05, 0.05, 4.2), 0, 1.6, 0), 0x2a2a2a))
      parts.push(colored(at(B(0.05, 0.05, 4.2), 0, 0.5, 0), 0x2a2a2a))
      for (let i = -2; i < 2; i++) parts.push(colored(at(B(0.02, 1.1, 0.02), 0, 1.05, i + 0.5, 0.6), 0x3a3a3a))
      break
    case 'grave':
      for (let i = 0; i < 3; i++) {
        const h = 0.7 + Math.random() * 0.5
        parts.push(colored(at(B(0.18, h, 0.62), (Math.random() - 0.5) * 1.6, h / 2, (i - 1) * 1.4, 0, 0, (Math.random() - 0.5) * 0.2), 0x8a8a90, 0.08))
      }
      parts.push(colored(at(B(0.1, 1.5, 0.1), 0.6, 0.75, 0.3), 0x6a6a70))
      parts.push(colored(at(B(0.1, 0.1, 0.7), 0.6, 1.2, 0.3), 0x6a6a70))
      break
    case 'hazmat':
      parts.push(colored(at(new THREE.CylinderGeometry(0.32, 0.32, 0.95, 12), 0, 0.48, 0), 0xd8c22a, 0.05))
      parts.push(colored(at(new THREE.CylinderGeometry(0.33, 0.33, 0.1, 12), 0, 0.72, 0), 0x222222))
      parts.push(colored(at(new THREE.CylinderGeometry(0.32, 0.32, 0.95, 12), 0.72, 0.48, 0.3), 0x3a8a3a, 0.05))
      parts.push(colored(at(B(1.4, 0.9, 0.1), -0.1, 0.45, -0.7), 0xe6e6e6))
      parts.push(colored(at(B(1.2, 0.18, 0.12), -0.1, 0.6, -0.7), 0xd83a2a))
      break
    case 'tyres':
      for (let i = 0; i < 3; i++) parts.push(colored(at(new THREE.TorusGeometry(0.28, 0.1, 6, 14), 0, 0.1 + i * 0.19, 0, Math.PI / 2), 0x1a1a1a, 0.05))
      break
    case 'drums':
      for (const [x, z] of [[0, 0], [0.68, 0.1], [0.3, 0.66]]) parts.push(colored(at(new THREE.CylinderGeometry(0.3, 0.3, 0.92, 12), x, 0.46, z), 0x2a5a9a, 0.06))
      break
  }
  return mergeGeometries(parts, false)!
}
const PROP_KINDS: PropKind[] = ['car', 'barrier', 'lamp', 'dumpster', 'fireBarrel', 'rubble', 'sandbags', 'container', 'fence', 'grave', 'hazmat', 'tyres', 'drums']

/**
 * Photoscanned props (Poly Haven, CC0; decimated + 512 px textures).
 * Each kind swaps from its procedural fallback to the textured GLB as soon as that model has
 * streamed in. `parts` places several copies per prop slot: [dx, dy, dz, rx, ry, rz, scale].
 */
interface PropModel { key: string; scale: number; tint?: boolean; bright?: number; metal?: number; parts: [number, number, number, number, number, number, number][] }
const PROP_MODELS: Partial<Record<PropKind, PropModel>> = {
  car: { key: 'car', scale: 1.08, tint: true, bright: 1.9, metal: 0, parts: [[0, 0, 0, 0, 0, 0, 1]] },
  barrier: { key: 'barrier', scale: 1.35, parts: [[0, 0, -1.05, 0, Math.PI / 2, 0, 1], [0.06, 0, 1.05, 0, Math.PI / 2 + 0.12, 0, 1]] },
  fireBarrel: { key: 'barrel_fire', scale: 1.15, bright: 1.2, parts: [[0, 0, 0, 0, 0, 0, 1]] },
  dumpster: { key: 'trashcan', scale: 1.15, parts: [[0, 0, 0, 0, Math.PI / 2, 0, 1]] },
  hazmat: { key: 'barrel_toxic', scale: 1.1, parts: [[0, 0, 0, 0, 0, 0, 1], [0.7, 0, 0.35, 0, 1.2, 0, 1], [0.15, 0, -0.72, 0, 2.3, 0, 1], [-0.6, 0.3, 0.2, Math.PI / 2, 0.4, 0, 1]] },
  tyres: { key: 'tyre', scale: 1.1, parts: [[0, 0.09, 0, Math.PI / 2, 0, 0, 1], [0.04, 0.27, 0.03, Math.PI / 2, 0.5, 0, 1], [-0.02, 0.45, -0.02, Math.PI / 2, 1.1, 0, 1], [0.9, 0, 0.6, 0, 0.7, 0.18, 1]] },
  drums: { key: 'barrel_blue', scale: 1.05, parts: [[0, 0, 0, 0, 0, 0, 1], [0.68, 0, 0.1, 0, 0.8, 0, 1], [0.3, 0, 0.66, 0, 1.9, 0, 1]] },
}
/** Tone a GLB material down for the scene: no glare, modest metal, no emission. */
function tameMaterial(src: THREE.Material, pm?: PropModel): THREE.Material {
  const m = src.clone() as THREE.MeshStandardMaterial
  if ('metalness' in m) {
    m.metalness = Math.min(m.metalness, pm?.metal ?? 0.35)
    if (pm?.metal === 0) m.metalnessMap = null
    if (pm?.bright) m.color.multiplyScalar(pm.bright)
    m.roughness = Math.max(m.roughness, 0.6)
    m.envMapIntensity = 0.35
    m.emissive?.setHex(0x000000)
    m.emissiveMap = null
  }
  return m
}
/** Subtle multipliers over the photoscanned car-cover texture. */
const CAR_TINTS = [0xffffff, 0xe0d6c8, 0xc8d0d8, 0xd8c8b0, 0xb8b8b0, 0xc8d0b8]
const CAR_COLORS = [0x8a2a22, 0x2c4a6a, 0x6a6a6a, 0xbdb8ae, 0x2a2a2a, 0x5a6a3a, 0xa87a2a]
const CONTAINER_COLORS = [0x9a3a2a, 0x2a5a8a, 0x3a6a3a, 0xb8862a, 0x6a6a6a]

function hash(i: number, salt: number): number {
  let h = Math.imul(i ^ 0x5bd1e995, 0x27d4eb2d) ^ Math.imul(salt + 0x9e3779b9, 0x85ebca6b)
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12
  return (h >>> 0) / 4294967296
}

const SLOT = 16
const PROP_SLOT = 7
const SNAP = 24
const AHEAD = 230
const BEHIND = 40
const FACE_X = ROAD_HALF + 0.35 + 4.6 + 0.2

export class World {
  readonly group = new THREE.Group()
  readonly hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1)
  readonly sun = new THREE.DirectionalLight(0xffffff, 2)
  private strip = new THREE.Group()
  private roadMat: THREE.MeshStandardMaterial
  private walkMat: THREE.MeshStandardMaterial
  private facadeMats = new Map<string, THREE.MeshStandardMaterial>()
  private buildings = new Map<string, THREE.InstancedMesh>()
  private backRow: THREE.InstancedMesh
  private props = new Map<PropKind, THREE.InstancedMesh>()
  private modelProps = new Map<PropKind, { meshes: THREE.InstancedMesh[]; parts: THREE.Matrix4[]; tint: boolean }>()
  private readonly assetsRef: Assets
  private readonly pm4 = new THREE.Matrix4()
  private glows: THREE.Sprite[] = []
  private fires: { x: number; y: number; z: number; s: number }[] = []
  private skyCanvas = document.createElement('canvas')
  private skyTex: THREE.CanvasTexture
  private skyline: THREE.Mesh
  private skyU: Record<string, THREE.IUniform>
  private sunGlow: THREE.Sprite
  private fog: THREE.Fog
  private cur: { skyTop: THREE.Color; skyHorizon: THREE.Color; fog: THREE.Color; sun: THREE.Color; hemiSky: THREE.Color; hemiGround: THREE.Color; road: THREE.Color; facade: THREE.Color; skyline: THREE.Color }
  private curN = { fogNear: 40, fogFar: 160, sunI: 2, hemiI: 1, exposure: 1, lampGlow: 0.5 }
  private lastSlot = Number.NaN
  private themeIdx = -1
  private themeBlend = 1
  private from!: Theme
  private to!: Theme
  private alert = 0
  private alertTarget = 0
  exposure = 1
  private m4 = new THREE.Matrix4(); private q = new THREE.Quaternion(); private v = new THREE.Vector3(); private s = new THREE.Vector3(); private e = new THREE.Euler()
  private c = new THREE.Color()
  private ambientT = 0

  constructor(assets: Assets, scene: THREE.Scene) {
    this.assetsRef = assets
    this.fog = new THREE.Fog(0x555555, 40, 160)
    scene.fog = this.fog
    this.skyCanvas.width = 4; this.skyCanvas.height = 256
    this.skyTex = new THREE.CanvasTexture(this.skyCanvas)
    this.skyTex.colorSpace = THREE.SRGBColorSpace
    scene.background = this.skyTex
    this.cur = {
      skyTop: new THREE.Color(), skyHorizon: new THREE.Color(), fog: new THREE.Color(), sun: new THREE.Color(), hemiSky: new THREE.Color(),
      hemiGround: new THREE.Color(), road: new THREE.Color(), facade: new THREE.Color(), skyline: new THREE.Color(),
    }
    this.group.add(this.hemi, this.sun, this.sun.target, this.strip)

    // Road strip (snaps forward in SNAP steps)
    const L = AHEAD + BEHIND + SNAP * 2
    const asphalt = assets.tex('asphalt'), walk = assets.tex('sidewalk')
    this.roadMat = new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.96, metalness: 0 })
    this.walkMat = new THREE.MeshStandardMaterial({ map: walk, roughness: 0.94, metalness: 0 })
    asphalt.repeat.set((ROAD_HALF * 2 + 0.7) / 8, L / 8)
    walk.repeat.set(4.6 / 6, L / 6)
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2 + 0.7, L), this.roadMat)
    road.rotation.x = -Math.PI / 2
    road.position.z = -L / 2 + BEHIND + SNAP
    this.strip.add(road)
    const lines = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2 + 0.7, L), new THREE.MeshStandardMaterial({ map: this.laneTexture(L), transparent: true, roughness: 0.9, depthWrite: false }))
    lines.rotation.x = -Math.PI / 2
    lines.position.set(0, 0.012, road.position.z)
    this.strip.add(lines)
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(4.6, L), this.walkMat)
      w.rotation.x = -Math.PI / 2
      w.position.set(sx * (ROAD_HALF + 0.35 + 2.3), 0.16, road.position.z)
      this.strip.add(w)
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, L), new THREE.MeshStandardMaterial({ color: 0x9a968e, roughness: 0.9 }))
      curb.position.set(sx * (ROAD_HALF + 0.35 + 0.02), 0.08, road.position.z)
      this.strip.add(curb)
    }
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, L), new THREE.MeshStandardMaterial({ color: 0x1e1c1b, roughness: 1 }))
    ground.rotation.x = -Math.PI / 2
    ground.position.set(0, -0.03, road.position.z)
    this.strip.add(ground)

    // Buildings: one InstancedMesh per facade (6 face materials: sides use the facade too, roof dark).
    const roof = new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 1 })
    for (const key of ['facade_a', 'facade_b', 'facade_c'] as const) {
      const mat = new THREE.MeshStandardMaterial({ map: assets.tex(key), roughness: 0.95, metalness: 0 })
      this.facadeMats.set(key, mat)
      const geo = new THREE.BoxGeometry(1, 1, 1)
      geo.translate(0, 0.5, 0)
      const mesh = new THREE.InstancedMesh(geo, [mat, mat, roof, roof, mat, mat], 48)
      mesh.count = 0
      mesh.frustumCulled = false
      this.buildings.set(key, mesh)
      this.group.add(mesh)
    }
    const back = new THREE.BoxGeometry(1, 1, 1)
    back.translate(0, 0.5, 0)
    this.backRow = new THREE.InstancedMesh(back, new THREE.MeshStandardMaterial({ map: assets.tex('facade_b'), color: 0x6a6670, roughness: 1 }), 48)
    this.backRow.count = 0
    this.backRow.frustumCulled = false
    this.group.add(this.backRow)

    // Props
    const propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 })
    for (const k of PROP_KINDS) {
      const mesh = new THREE.InstancedMesh(propGeometry(k), propMat, 40)
      mesh.count = 0
      mesh.frustumCulled = false
      for (let i = 0; i < 40; i++) mesh.setColorAt(i, this.c.setRGB(1, 1, 1))
      this.props.set(k, mesh)
      this.group.add(mesh)
    }
    // Lamp glows (additive sprites)
    const glowTex = radialTexture()
    for (let i = 0; i < 24; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd8a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }))
      sp.scale.set(1.9, 1.9, 1)
      sp.visible = false
      this.glows.push(sp)
      this.group.add(sp)
    }
    // Skyline backdrop with sky fade at the top and fog fade at the bottom.
    this.skyU = {
      uMap: { value: assets.tex('skyline') }, uTint: { value: new THREE.Color(1, 1, 1) }, uFog: { value: new THREE.Color() },
    }
    this.skyline = new THREE.Mesh(new THREE.PlaneGeometry(620, 262), new THREE.ShaderMaterial({
      uniforms: this.skyU, transparent: true, depthWrite: false, fog: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform sampler2D uMap; uniform vec3 uTint; uniform vec3 uFog; varying vec2 vUv;
        void main(){ vec4 t = texture2D(uMap, vUv); vec3 c = t.rgb * uTint;
          float lum = dot(t.rgb, vec3(0.3,0.5,0.2));
          float a = 1.0 - smoothstep(0.42, 0.78, vUv.y) * (1.0 - smoothstep(0.35, 0.55, lum) * 0.0);
          c = mix(c, uFog, (1.0 - smoothstep(0.0, 0.34, vUv.y)) * 0.75);
          gl_FragColor = vec4(c, a); }`,
    }))
    this.skyline.renderOrder = -10
    this.group.add(this.skyline)
    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa060, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.5 }))
    this.sunGlow.scale.set(180, 120, 1)
    this.sunGlow.renderOrder = -9
    this.group.add(this.sunGlow)
    this.setTheme(0, true)
  }

  private laneTexture(L: number): THREE.CanvasTexture {
    const cv = document.createElement('canvas')
    cv.width = 256; cv.height = 512
    const g = cv.getContext('2d')!
    const W = ROAD_HALF * 2 + 0.7
    const px = (m: number) => ((m + W / 2) / W) * 256
    g.clearRect(0, 0, 256, 512)
    // edge lines (solid, yellow-ish, worn)
    g.fillStyle = 'rgba(230,196,90,0.75)'
    for (const x of [-ROAD_HALF + 0.25, ROAD_HALF - 0.25]) g.fillRect(px(x) - 2, 0, 4, 512)
    // centre dashed white line
    g.fillStyle = 'rgba(235,235,225,0.8)'
    for (let y = 0; y < 512; y += 128) g.fillRect(px(0) - 2.5, y + 20, 5, 70)
    // wear
    const img = g.getImageData(0, 0, 256, 512)
    for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > 0) img.data[i] *= 0.45 + Math.random() * 0.55
    g.putImageData(img, 0, 0)
    const t = new THREE.CanvasTexture(cv)
    t.colorSpace = THREE.SRGBColorSpace
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(1, L / SNAP)
    t.anisotropy = 4
    return t
  }

  themeAt(distance: number): Theme { return THEMES[Math.floor(Math.max(0, distance) / SECTOR_LEN) % THEME_COUNT] }

  setTheme(idx: number, instant = false) {
    if (idx === this.themeIdx) return
    const next = THEMES[idx % THEMES.length]
    this.from = instant || !this.to ? next : this.snapshot()
    this.to = next
    this.themeIdx = idx
    this.themeBlend = instant ? 1 : 0
    if (instant) this.applyBlend(1)
  }
  /** Red emergency tint during boss fights / danger (0..1). */
  setAlert(v: number) { this.alertTarget = v }

  private snapshot(): Theme {
    const h = (c: THREE.Color) => c.getHex()
    return { ...this.to, skyTop: h(this.cur.skyTop), skyHorizon: h(this.cur.skyHorizon), fog: h(this.cur.fog), sun: h(this.cur.sun), hemiSky: h(this.cur.hemiSky),
      hemiGround: h(this.cur.hemiGround), road: h(this.cur.road), facade: h(this.cur.facade), skyline: h(this.cur.skyline), fogNear: this.curN.fogNear,
      fogFar: this.curN.fogFar, sunI: this.curN.sunI, hemiI: this.curN.hemiI, exposure: this.curN.exposure, lampGlow: this.curN.lampGlow }
  }
  private applyBlend(t: number) {
    const a = this.from, b = this.to
    const L = (k: keyof typeof this.cur, x: number, y: number) => this.cur[k].setHex(x).lerp(this.c.setHex(y), t)
    L('skyTop', a.skyTop, b.skyTop); L('skyHorizon', a.skyHorizon, b.skyHorizon); L('fog', a.fog, b.fog); L('sun', a.sun, b.sun)
    L('hemiSky', a.hemiSky, b.hemiSky); L('hemiGround', a.hemiGround, b.hemiGround); L('road', a.road, b.road); L('facade', a.facade, b.facade); L('skyline', a.skyline, b.skyline)
    const n = (x: number, y: number) => x + (y - x) * t
    this.curN.fogNear = n(a.fogNear, b.fogNear); this.curN.fogFar = n(a.fogFar, b.fogFar); this.curN.sunI = n(a.sunI, b.sunI)
    this.curN.hemiI = n(a.hemiI, b.hemiI); this.curN.exposure = n(a.exposure, b.exposure); this.curN.lampGlow = n(a.lampGlow, b.lampGlow)
    const al = this.alert
    const red = this.c.setHex(0xff3020)
    this.fog.color.copy(this.cur.fog).lerp(red, al * 0.18)
    this.fog.near = this.curN.fogNear; this.fog.far = this.curN.fogFar
    this.sun.color.copy(this.cur.sun).lerp(red, al * 0.35); this.sun.intensity = this.curN.sunI
    this.hemi.color.copy(this.cur.hemiSky).lerp(red, al * 0.25); this.hemi.groundColor.copy(this.cur.hemiGround); this.hemi.intensity = this.curN.hemiI * 1.45
    this.roadMat.color.copy(this.cur.road); this.walkMat.color.copy(this.cur.road).multiplyScalar(1.05)
    for (const m of this.facadeMats.values()) m.color.copy(this.cur.facade)
    ;(this.skyU.uTint.value as THREE.Color).copy(this.cur.skyline)
    ;(this.skyU.uFog.value as THREE.Color).copy(this.fog.color)
    ;(this.sunGlow.material as THREE.SpriteMaterial).color.copy(this.cur.skyHorizon)
    this.exposure = this.curN.exposure * 1.1
    for (const g of this.glows) (g.material as THREE.SpriteMaterial).opacity = this.curN.lampGlow * 0.55
    const ctx = this.skyCanvas.getContext('2d')!
    const grad = ctx.createLinearGradient(0, 0, 0, 256)
    grad.addColorStop(0, '#' + this.cur.skyTop.getHexString())
    grad.addColorStop(0.62, '#' + this.c.copy(this.cur.skyTop).lerp(this.cur.skyHorizon, 0.55).getHexString())
    grad.addColorStop(0.86, '#' + this.cur.skyHorizon.getHexString())
    grad.addColorStop(1, '#' + this.fog.color.getHexString())
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 4, 256)
    this.skyTex.needsUpdate = true
  }

  get fogColor() { return this.fog.color }
  get fogNear() { return this.fog.near }
  get fogFar() { return this.fog.far }

  update(dt: number, camZ: number, fx: Fx | null, calm: boolean) {
    // theme transitions
    if (this.themeBlend < 1 || Math.abs(this.alert - this.alertTarget) > 0.001) {
      this.themeBlend = Math.min(1, this.themeBlend + dt / 4)
      this.alert += (this.alertTarget - this.alert) * Math.min(1, dt * 2)
      const t = this.themeBlend
      this.applyBlend(t * t * (3 - 2 * t))
    }
    // strip snap
    this.strip.position.z = Math.floor(camZ / SNAP) * SNAP
    this.skyline.position.set(0, 58, camZ - 230)
    this.sunGlow.position.set(this.to.sunDir[0] * 90, 26, camZ - 225)
    this.sun.position.set(this.to.sunDir[0] * 40, 40, camZ + 20)
    this.sun.target.position.set(0, 0, camZ - 30)
    const slot = Math.floor(-camZ / PROP_SLOT)
    if (slot !== this.lastSlot || this.adoptModels()) { this.lastSlot = slot; this.layout(camZ) }
    if (fx) this.ambient(dt, camZ, fx, calm)
  }

  private themeForZ(z: number) { return this.themeAt(-z) }

  /** Rebuild building and prop instances for the visible window. */
  /** Swap procedural props for streamed-in GLB props (returns true if anything changed). */
  private adoptModels(): boolean {
    let changed = false
    for (const kind of Object.keys(PROP_MODELS) as PropKind[]) {
      if (this.modelProps.has(kind)) continue
      const pm = PROP_MODELS[kind]!
      const root = this.assetsRef.models.get(pm.key)
      if (!root) continue
      root.updateMatrixWorld(true)
      const cap = 40 * pm.parts.length
      const meshes: THREE.InstancedMesh[] = []
      root.traverse(o => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh) return
        const g = mesh.geometry.clone()
        g.applyMatrix4(mesh.matrixWorld)
        const mats = Array.isArray(mesh.material) ? mesh.material.map(x => tameMaterial(x, pm)) : tameMaterial(mesh.material, pm)
        const im = new THREE.InstancedMesh(g, mats, cap)
        im.count = 0
        im.frustumCulled = false
        im.castShadow = false
        if (pm.tint) for (let i = 0; i < cap; i++) im.setColorAt(i, this.c.setRGB(1, 1, 1))
        meshes.push(im)
        this.group.add(im)
      })
      const parts = pm.parts.map(([dx, dy, dz, rx, ry, rz, sc]) => new THREE.Matrix4().compose(
        new THREE.Vector3(dx, dy, dz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3().setScalar(pm.scale * sc)))
      this.modelProps.set(kind, { meshes, parts, tint: !!pm.tint })
      const old = this.props.get(kind)
      if (old) { old.count = 0; old.visible = false }
      changed = true
    }
    return changed
  }

  /** The street-facing building occupying slot z on `side` (−1 left, +1 right), or null for an alley. Mirrors layout(). */
  buildingAt(side: number, z: number): { x: number; top: number; z0: number; z1: number } | null {
    const sIdx = Math.floor(-z / SLOT)
    const h = hash(sIdx, side > 0 ? 11 : 23)
    if (h < 0.1) return null
    const zc = -(sIdx + 0.5) * SLOT
    const theme = this.themeForZ(zc)
    const key = theme.facades[Math.floor(hash(sIdx, side * 7 + 3) * theme.facades.length) % theme.facades.length]
    const height = key === 'facade_a' ? 17 + hash(sIdx, 5) * 5 : key === 'facade_b' ? 13 + hash(sIdx, 6) * 4 : 9 + hash(sIdx, 7) * 3
    const width = SLOT - 0.4 - hash(sIdx, 9) * 1.2
    return { x: side * FACE_X, top: height, z0: zc - width / 2, z1: zc + width / 2 }
  }
  private layout(camZ: number) {
    this.adoptModels()
    const counts = new Map<string, number>()
    const zNear = camZ + BEHIND, zFar = camZ - AHEAD
    let back = 0
    for (const side of [-1, 1]) {
      const s0 = Math.floor(-zNear / SLOT), s1 = Math.ceil(-zFar / SLOT)
      for (let sIdx = s0; sIdx <= s1; sIdx++) {
        const h = hash(sIdx, side > 0 ? 11 : 23)
        const zc = -(sIdx + 0.5) * SLOT
        const theme = this.themeForZ(zc)
        if (h < 0.1) continue // alley
        const key = theme.facades[Math.floor(hash(sIdx, side * 7 + 3) * theme.facades.length) % theme.facades.length]
        const mesh = this.buildings.get(key)!
        const i = counts.get(key) ?? 0
        if (i >= 48) continue
        const height = key === 'facade_a' ? 17 + hash(sIdx, 5) * 5 : key === 'facade_b' ? 13 + hash(sIdx, 6) * 4 : 9 + hash(sIdx, 7) * 3
        const width = SLOT - 0.4 - hash(sIdx, 9) * 1.2
        const depth = 12
        this.e.set(0, side < 0 ? 0 : Math.PI, 0)
        this.q.setFromEuler(this.e)
        this.v.set(side * (FACE_X + depth / 2), 0, zc)
        this.s.set(depth, height, width)
        this.m4.compose(this.v, this.q, this.s)
        mesh.setMatrixAt(i, this.m4)
        counts.set(key, i + 1)
        // back row: taller silhouettes
        if (back < 48 && hash(sIdx, side + 40) > 0.35) {
          const bh = 24 + hash(sIdx, side + 41) * 22
          this.v.set(side * (FACE_X + 20 + hash(sIdx, 42) * 8), 0, zc + (hash(sIdx, 43) - 0.5) * 6)
          this.s.set(14, bh, 12 + hash(sIdx, 44) * 6)
          this.m4.compose(this.v, this.q, this.s)
          this.backRow.setMatrixAt(back++, this.m4)
        }
      }
    }
    for (const [key, mesh] of this.buildings) { mesh.count = counts.get(key) ?? 0; mesh.instanceMatrix.needsUpdate = true }
    this.backRow.count = back
    this.backRow.instanceMatrix.needsUpdate = true

    // props on sidewalks
    const pc = new Map<PropKind, number>()
    this.fires.length = 0
    let glow = 0
    const p0 = Math.floor(-zNear / PROP_SLOT), p1 = Math.ceil(-zFar / PROP_SLOT)
    for (const side of [-1, 1]) {
      for (let pIdx = p0; pIdx <= p1; pIdx++) {
        const zc = -(pIdx + 0.5) * PROP_SLOT
        const theme = this.themeForZ(zc)
        const r = hash(pIdx, side > 0 ? 101 : 202)
        if (r < 0.38) continue
        let total = 0
        for (const k in theme.props) total += theme.props[k as PropKind]!
        let pick = hash(pIdx, side > 0 ? 303 : 404) * total
        let kind: PropKind = 'rubble'
        for (const k in theme.props) { pick -= theme.props[k as PropKind]!; if (pick <= 0) { kind = k as PropKind; break } }
        const mesh = this.props.get(kind)!
        const i = pc.get(kind) ?? 0
        if (i >= 40) continue
        const jz = (hash(pIdx, 505) - 0.5) * 3
        let x = side * (ROAD_HALF + 0.35 + 2.2 + (hash(pIdx, 606) - 0.5) * 1.6)
        let yaw = (hash(pIdx, 707) - 0.5) * 0.6
        let roll = 0
        if (kind === 'lamp') { x = side * (ROAD_HALF + 0.9); yaw = side < 0 ? Math.PI / 2 : -Math.PI / 2 }
        if (kind === 'barrier' || kind === 'fence' || kind === 'sandbags') { x = side * (ROAD_HALF + 0.95); yaw = (hash(pIdx, 708) - 0.5) * 0.3 }
        if (kind === 'car') { yaw = (hash(pIdx, 709) - 0.5) * 1.4 + (hash(pIdx, 710) < 0.5 ? Math.PI : 0); if (hash(pIdx, 711) < 0.12) roll = Math.PI * 0.5 * side * 0.9 }
        if (kind === 'container') { x = side * (ROAD_HALF + 3.1); yaw = (hash(pIdx, 712) - 0.5) * 0.2 }
        this.e.set(0, yaw, roll, 'YXZ')
        this.q.setFromEuler(this.e)
        this.v.set(x, kind === 'car' && roll ? 0.97 : 0.16, zc + jz)
        this.s.set(1, 1, 1)
        this.m4.compose(this.v, this.q, this.s)
        mesh.setMatrixAt(i, this.m4)
        const mp = this.modelProps.get(kind)
        if (mp) {
          const np = mp.parts.length
          for (let j = 0; j < np; j++) {
            this.pm4.multiplyMatrices(this.m4, mp.parts[j])
            for (const im of mp.meshes) im.setMatrixAt(i * np + j, this.pm4)
          }
          if (mp.tint) {
            const burnt = theme.name === 'Burning Highway' && hash(pIdx, 713) < 0.5
            this.c.setHex(burnt ? 0x3a302a : CAR_TINTS[Math.floor(hash(pIdx, 714) * CAR_TINTS.length)])
            for (const im of mp.meshes) for (let j = 0; j < np; j++) im.setColorAt(i * np + j, this.c)
          }
        }
        if (kind === 'car') {
          const burnt = theme.name === 'Burning Highway' && hash(pIdx, 713) < 0.5
          mesh.setColorAt(i, this.c.setHex(burnt ? 0x2a2522 : CAR_COLORS[Math.floor(hash(pIdx, 714) * CAR_COLORS.length)]))
          if (burnt) this.fires.push({ x, y: 1.4, z: zc + jz, s: 1.5 })
        } else if (kind === 'container') mesh.setColorAt(i, this.c.setHex(CONTAINER_COLORS[Math.floor(hash(pIdx, 715) * CONTAINER_COLORS.length)]))
        else mesh.setColorAt(i, this.c.setRGB(1, 1, 1))
        if (kind === 'fireBarrel') this.fires.push({ x, y: 1.0, z: zc + jz, s: 0.8 })
        if (kind === 'lamp' && glow < this.glows.length) {
          const g = this.glows[glow++]
          g.visible = true
          g.position.set(x - side * 1.1, 6.6, zc + jz)
        }
        pc.set(kind, i + 1)
      }
    }
    for (let g = glow; g < this.glows.length; g++) this.glows[g].visible = false
    for (const [k, mesh] of this.props) {
      mesh.count = pc.get(k) ?? 0
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
    for (const [k, mp] of this.modelProps) {
      const n = (pc.get(k) ?? 0) * mp.parts.length
      for (const im of mp.meshes) {
        im.count = n
        im.instanceMatrix.needsUpdate = true
        if (im.instanceColor) im.instanceColor.needsUpdate = true
      }
    }
  }

  private ambient(dt: number, camZ: number, fx: Fx, calm: boolean) {
    this.ambientT += dt
    const d = fx.density * (calm ? 1 : 0.5)
    // fires on props near the camera
    for (const f of this.fires) {
      if (f.z > camZ + 10 || f.z < camZ - 90) continue
      if (Math.random() < 14 * dt * d) fx.fire(f.x, f.y, f.z, f.s)
      if (Math.random() < 2.5 * dt * d) fx.embers(f.x, f.y + 0.6, f.z)
      if (Math.random() < 1.2 * dt * d) fx.smoke(f.x, f.y + 1.5, f.z, 1.6 * f.s, 0x221e1c, 0.45, 3)
    }
    const kind = this.to.ambient
    const rate = (kind === 'fogbank' ? 3 : kind === 'toxic' ? 5 : 8) * d
    if (Math.random() < rate * dt) {
      const x = (Math.random() * 2 - 1) * 16
      const z = camZ - 10 - Math.random() * 60
      switch (kind) {
        case 'embers': fx.addP('glow', x, Math.random() * 3, z, 0.4, 0.8 + Math.random(), 0.5, 3 + Math.random() * 2, 0.14, 0.04, 0xff7a2a, 1, { drag: 0.1 }); break
        case 'ash': case 'dust': fx.alphaP('dot', x, 1 + Math.random() * 5, z, 0.6, -0.1, 0.4, 4, 0.07, 0.07, 0xd8d0c0, 0.6); break
        case 'toxic': fx.alphaP('smoke', x, 0.4, z, 0.2, 0.15, 0.1, 5, 2.5, 5, 0x7cc24a, 0.16, { fadeIn: 0.3 }); break
        case 'fogbank': fx.alphaP('smoke', x * 1.2, 0.6, z, 0.3, 0.05, 0, 7, 4, 8, 0xb8bccb, 0.14, { fadeIn: 0.35 }); break
      }
    }
  }
}

function radialTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = cv.height = 128
  const g = cv.getContext('2d')!
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.2, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
