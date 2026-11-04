import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { CHUNK } from './config'
import { ICO1, ICO2, ICO3, MeshBuilder, color, lumpy } from './geo'
import { ATLAS } from './materials'
import { appendNature } from './nature'
import type { ItemId } from './items'
import { clamp, hash2, mulberry32, smoothstep } from './noise'
import type { Poi, PoiType } from './poi'
import type { Terrain } from './terrain'

export type ResType = 'oak' | 'pine' | 'boulder' | 'pebble' | 'fiber' | 'bush' | 'crystal' | 'monolith' | 'altar' | 'ruin' | 'log' | 'tent' | 'firepit' | 'urn' | 'crate'
export type ResMat = 'wood' | 'stone' | 'soft' | 'crystal' | 'none'
export type Shape = { k: 'cyl' | 'sph'; dy: number; r: number; h?: number }

export type ResDef = {
  name: string
  hp: number
  mat: ResMat
  regrow?: boolean
  /** Solid collision circle (radius, height), scaled by the instance scale. */
  collide?: { r: number; h: number }
  shapes: Shape[]
  loot?: boolean
}

export const RES: Record<ResType, ResDef> = {
  oak: { name: 'Broadleaf Tree', hp: 9, mat: 'wood', collide: { r: 0.3, h: 9 }, shapes: [{ k: 'cyl', dy: 0, r: 0.45, h: 3.2 }, { k: 'sph', dy: 4, r: 2.2 }] },
  pine: { name: 'Pine', hp: 10, mat: 'wood', collide: { r: 0.26, h: 9 }, shapes: [{ k: 'cyl', dy: 0, r: 0.45, h: 1.6 }, { k: 'cyl', dy: 1.4, r: 1.5, h: 4.6 }] },
  boulder: { name: 'Boulder', hp: 12, mat: 'stone', collide: { r: 0.95, h: 1.1 }, shapes: [{ k: 'sph', dy: 0.3, r: 1.05 }] },
  pebble: { name: 'Loose Stones', hp: 1, mat: 'soft', regrow: true, shapes: [{ k: 'sph', dy: 0.1, r: 0.4 }] },
  fiber: { name: 'Fiber Grass', hp: 1, mat: 'soft', regrow: true, shapes: [{ k: 'cyl', dy: 0, r: 0.45, h: 1 }] },
  bush: { name: 'Berry Bush', hp: 1, mat: 'soft', regrow: true, shapes: [{ k: 'sph', dy: 0.5, r: 0.8 }] },
  crystal: { name: 'Crystal Formation', hp: 10, mat: 'crystal', collide: { r: 0.5, h: 1.3 }, shapes: [{ k: 'cyl', dy: 0, r: 0.75, h: 1.7 }] },
  monolith: { name: 'Ancient Monolith', hp: Infinity, mat: 'none', collide: { r: 0.6, h: 5 }, shapes: [{ k: 'cyl', dy: 0, r: 0.8, h: 5 }] },
  altar: { name: 'Stone Altar', hp: Infinity, mat: 'none', collide: { r: 1.2, h: 0.9 }, shapes: [{ k: 'cyl', dy: 0, r: 1.3, h: 0.9 }] },
  ruin: { name: 'Ruined Masonry', hp: 12, mat: 'stone', collide: { r: 0.66, h: 1 }, shapes: [{ k: 'sph', dy: 0.5, r: 0.8 }] },
  log: { name: 'Fallen Log', hp: 5, mat: 'wood', collide: { r: 0.45, h: 0.6 }, shapes: [{ k: 'sph', dy: 0.3, r: 0.9 }] },
  tent: { name: 'Old Tent', hp: Infinity, mat: 'none', collide: { r: 1.35, h: 2.2 }, shapes: [{ k: 'sph', dy: 1, r: 1.7 }] },
  firepit: { name: 'Cold Firepit', hp: Infinity, mat: 'none', shapes: [{ k: 'sph', dy: 0.1, r: 0.7 }] },
  urn: { name: 'Sealed Urn', hp: 2, mat: 'soft', collide: { r: 0.34, h: 0.8 }, shapes: [{ k: 'sph', dy: 0.4, r: 0.48 }], loot: true },
  crate: { name: 'Supply Crate', hp: 3, mat: 'wood', collide: { r: 0.45, h: 0.7 }, shapes: [{ k: 'sph', dy: 0.35, r: 0.58 }], loot: true },
}

export type Resource = {
  key: string
  type: ResType
  x: number
  z: number
  /** Current world y of the base (terrain height + dy). Updated on chunk rebuild. */
  y: number
  dy: number
  rot: number
  s: number
  seed: number
  hp: number
  poi?: PoiType
}

const rint = (rnd: () => number, a: number, b: number) => a + Math.floor(rnd() * (b - a + 1))

export function rollDrops(r: Resource, rnd: () => number): [ItemId, number][] {
  switch (r.type) {
    case 'oak': return [['wood', 3 + Math.round(r.s * 1.6) + rint(rnd, 0, 1)]]
    case 'pine': return [['wood', 4 + Math.round(r.s * 1.6) + rint(rnd, 0, 1)]]
    case 'boulder': return rnd() < 0.14 ? [['stone', rint(rnd, 4, 6)], ['crystal', 1]] : [['stone', rint(rnd, 4, 6)]]
    case 'pebble': return [['stone', rint(rnd, 1, 2)]]
    case 'fiber': return [['fiber', rint(rnd, 2, 3)]]
    case 'bush': return [['berries', rint(rnd, 2, 4)], ['fiber', 1]]
    case 'crystal': return [['crystal', rint(rnd, 2, 4)]]
    case 'ruin': return [['stone', rint(rnd, 3, 5)]]
    case 'log': return [['wood', 3]]
    case 'urn':
    case 'crate':
      return lootTable(r.poi ?? 'camp', rnd)
    default: return []
  }
}

export function lootTable(type: PoiType, rnd: () => number): [ItemId, number][] {
  switch (type) {
    case 'stones': return [['crystal', rint(rnd, 3, 5)], ['stone', 4], ['cooked_meat', 2]]
    case 'crystals': return [['crystal', rint(rnd, 4, 6)], ['bandage', 1], ['fiber', 4]]
    case 'ruin': return [['stone', 8], ['crystal', 2], ['lamp', 1], ['bandage', 2]]
    case 'camp':
    default:
      return [['planks', 6], ['fiber', 5], ['cooked_meat', 2], ['torch', 3], [rnd() < 0.5 ? 'stone_pickaxe' : 'stone_axe', 1]]
  }
}

// ─── Generation ─────────────────────────────────────────────────────────────

/** Deterministic natural resources for one chunk, plus any POI features centred inside it. */
export function generateChunk(terrain: Terrain, cx: number, cz: number): Resource[] {
  const out: Resource[] = []
  const rnd = mulberry32(Math.floor(hash2(cx, cz, terrain.seed ^ 0x7e57) * 4294967296))
  let i = 0
  const push = (type: ResType, x: number, z: number, s: number, dy = 0, rot = rnd() * Math.PI * 2, poi?: PoiType) => {
    out.push({ key: `${cx},${cz},${i++}`, type, x, z, y: 0, dy, rot, s, seed: Math.floor(rnd() * 1e9), hp: RES[type].hp * (type === 'oak' || type === 'pine' || type === 'boulder' ? clamp(s, 0.8, 1.4) : 1), poi })
  }
  const step = 4
  for (let gx = 0; gx < CHUNK / step; gx++) {
    for (let gz = 0; gz < CHUNK / step; gz++) {
      const x = cx * CHUNK + gx * step + rnd() * step
      const z = cz * CHUNK + gz * step + rnd() * step
      const roll = rnd()
      const s = 0.8 + rnd() * 0.55
      const h = terrain.baseHeight(x, z)
      if (h < 0.35) continue
      const poi = terrain.pois.at(x, z)
      if (poi && Math.hypot(poi.x - x, poi.z - z) < poi.radius + 3) continue
      const ny = terrain.normal(x, z).y
      const m = terrain.moisture(x, z) + terrain.detail(x, z) * 0.35
      const forest = smoothstep(-0.12, 0.4, m)
      if (h < 1.7) {
        if (roll < 0.1) push('fiber', x, z, s)
        else if (roll < 0.15) push('pebble', x, z, s)
        continue
      }
      if (h > 40 || ny < 0.74) {
        if (roll < 0.1) push('boulder', x, z, s * 1.1)
        else if (roll < 0.118 && h > 22) push('crystal', x, z, s)
        else if (roll < 0.16) push('pebble', x, z, s)
        continue
      }
      if (h > 23) {
        const pine = 0.1 + forest * 0.32
        if (roll < pine) push('pine', x, z, s)
        else if (roll < pine + 0.05) push('boulder', x, z, s)
        else if (roll < pine + 0.09) push('pebble', x, z, s)
        else if (roll < pine + 0.13) push('fiber', x, z, s)
        else if (roll < pine + 0.135) push('crystal', x, z, s * 0.85)
        continue
      }
      const oak = 0.025 + forest * 0.34
      const pine = forest * 0.06
      if (roll < oak) push('oak', x, z, s)
      else if (roll < oak + pine) push('pine', x, z, s)
      else if (roll < oak + pine + 0.03) push('boulder', x, z, s * 0.9)
      else if (roll < oak + pine + 0.09) push('pebble', x, z, s)
      else if (roll < oak + pine + 0.18) push('fiber', x, z, s)
      else if (roll < oak + pine + 0.23) push('bush', x, z, s)
      else if (roll < oak + pine + 0.235) push('log', x, z, 1)
    }
  }
  // POI features belong to the chunk that contains the POI centre.
  const x0 = cx * CHUNK
  const z0 = cz * CHUNK
  for (const poi of terrain.pois.near(x0 + CHUNK / 2, z0 + CHUNK / 2, CHUNK)) {
    if (poi.x < x0 || poi.x >= x0 + CHUNK || poi.z < z0 || poi.z >= z0 + CHUNK) continue
    layoutPoi(poi, (type, x, z, s, dy, rot) => push(type, x, z, s, dy, rot, poi.type))
  }
  return out
}

type Emit = (type: ResType, x: number, z: number, s: number, dy?: number, rot?: number) => void

function layoutPoi(poi: Poi, emit: Emit): void {
  const rnd = mulberry32(poi.seed)
  const { x, z } = poi
  switch (poi.type) {
    case 'stones': {
      const n = 7
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd() * 0.2
        emit('monolith', x + Math.cos(a) * 8, z + Math.sin(a) * 8, 0.85 + rnd() * 0.35, 0, -a)
      }
      emit('altar', x, z, 1, 0, rnd() * 6)
      emit('urn', x, z, 1, 0.86, rnd() * 6)
      for (let i = 0; i < 5; i++) emit('pebble', x + (rnd() - 0.5) * 22, z + (rnd() - 0.5) * 22, 1)
      break
    }
    case 'crystals': {
      for (let i = 0; i < 10; i++) {
        const a = rnd() * Math.PI * 2
        const r = 2.5 + rnd() * 9
        emit('crystal', x + Math.cos(a) * r, z + Math.sin(a) * r, 0.9 + rnd() * 0.8)
      }
      for (let i = 0; i < 4; i++) {
        const a = rnd() * Math.PI * 2
        emit('boulder', x + Math.cos(a) * 11, z + Math.sin(a) * 11, 1 + rnd() * 0.4)
      }
      emit('crate', x + 1, z - 1, 1)
      break
    }
    case 'camp': {
      emit('tent', x + 3.5, z - 2.5, 1, 0, 0.6)
      emit('firepit', x, z, 1)
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.4
        emit('log', x + Math.cos(a) * 2.3, z + Math.sin(a) * 2.3, 1, 0, a + Math.PI / 2)
      }
      emit('crate', x + 5.8, z + 0.4, 1)
      emit('crate', x - 4.5, z - 3, 1)
      for (let i = 0; i < 6; i++) emit(i % 2 ? 'fiber' : 'pebble', x + (rnd() - 0.5) * 20, z + (rnd() - 0.5) * 20, 1)
      break
    }
    case 'ruin':
    default: {
      const segs = 18
      const gapA = Math.floor(rnd() * segs)
      for (let i = 0; i < segs; i++) {
        if (i === gapA || i === (gapA + 1) % segs) continue
        const a = (i / segs) * Math.PI * 2
        const stack = 1 + Math.floor(rnd() * 3.2)
        for (let k = 0; k < stack; k++) emit('ruin', x + Math.cos(a) * 6.2, z + Math.sin(a) * 6.2, 1, k * 0.98, -a + (rnd() - 0.5) * 0.1)
      }
      for (let i = 0; i < 6; i++) {
        const a = rnd() * Math.PI * 2
        emit('ruin', x + Math.cos(a) * (8 + rnd() * 5), z + Math.sin(a) * (8 + rnd() * 5), 1, -0.25, rnd() * 6)
      }
      emit('urn', x, z, 1)
      break
    }
  }
}

// ─── Procedural models ──────────────────────────────────────────────────────

const M = new THREE.Matrix4()
const Q = new THREE.Quaternion()
const E = new THREE.Euler()
const V = new THREE.Vector3()
const S = new THREE.Vector3()
function mat(px: number, py: number, pz: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  return new THREE.Matrix4().compose(V.set(px, py, pz), Q.setFromEuler(E.set(rx, ry, rz)), S.set(sx, sy, sz))
}

const CYL8 = new THREE.CylinderGeometry(1, 1, 1, 8, 2).translate(0, 0.5, 0)
const TRUNK = new THREE.CylinderGeometry(0.62, 1, 1, 9, 4).translate(0, 0.5, 0)
const CONE = new THREE.ConeGeometry(1, 1, 10, 2).translate(0, 0.5, 0)
const PRISM = (() => {
  const body = new THREE.CylinderGeometry(0.86, 1, 0.72, 6, 1).translate(0, 0.36, 0)
  const tip = new THREE.ConeGeometry(0.86, 0.28, 6, 1).translate(0, 0.86, 0)
  const b = new MeshBuilder()
  b.add(body.toNonIndexed(), new THREE.Matrix4(), color(0xffffff))
  b.add(tip.toNonIndexed(), new THREE.Matrix4(), color(0xffffff))
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3))
  g.computeVertexNormals()
  return g
})()
const RBOX = new RoundedBoxGeometry(1, 1, 1, 2, 0.14)
const URN = new THREE.LatheGeometry([
  new THREE.Vector2(0, 0), new THREE.Vector2(0.2, 0.02), new THREE.Vector2(0.3, 0.2), new THREE.Vector2(0.33, 0.42),
  new THREE.Vector2(0.24, 0.66), new THREE.Vector2(0.14, 0.74), new THREE.Vector2(0.17, 0.8), new THREE.Vector2(0, 0.8),
], 14)
const TENT = new THREE.CylinderGeometry(1.5, 1.5, 3, 3, 1).rotateX(-Math.PI / 2).translate(0, 0.75, 0)


const tmpC = new THREE.Color()
const MOSS = color('#7d9a4a')
function mossy(base: THREE.Color, amount: number) {
  return (_x: number, _y: number, _z: number, _nx: number, ny: number) => tmpC.copy(base).lerp(MOSS, smoothstep(0.5, 0.92, ny) * amount)
}

/** One builder per world material so a chunk renders in a handful of draw calls. */
export type Builders = { main: MeshBuilder; glow: MeshBuilder; bark: MeshBuilder; leaf: MeshBuilder; rock: MeshBuilder; kit: MeshBuilder }
export const BUILDER_KEYS = ['main', 'glow', 'bark', 'leaf', 'rock', 'kit'] as const
export function newBuilders(): Builders {
  return { main: new MeshBuilder(), glow: new MeshBuilder(), bark: new MeshBuilder(), leaf: new MeshBuilder(), rock: new MeshBuilder(), kit: new MeshBuilder() }
}

const CARD = new THREE.PlaneGeometry(1, 1)
const CARD_ROOT = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0)
const _c = new THREE.Vector3()
const LEAF_TINTS = ['#ffffff', '#f2f7e8', '#e6efd6', '#fbf6e4']
const AUTUMN_TINT = color('#ffb070')

/**
 * Adds one resource's model to the per-material builders, positioned relative to `origin`.
 * Trees: bark-textured tapered trunks + alpha leaf-card canopies (spherical normals) around a
 * dark core so canopies read as volumes. Rocks: triplanar PBR rock tinted by vertex colour.
 */
export function buildResource(r: Resource, B: Builders, ox: number, oy: number, oz: number): void {
  const rnd = mulberry32(r.seed)
  const base = new THREE.Matrix4().compose(V.set(r.x - ox, r.y - oy, r.z - oz), Q.setFromEuler(E.set(0, r.rot, 0)), S.set(r.s, r.s, r.s))
  type Opt = Parameters<MeshBuilder['add']>[6]
  const put = (b: MeshBuilder, g: THREE.BufferGeometry, local: THREE.Matrix4, c: THREE.Color | ((x: number, y: number, z: number, nx: number, ny: number, nz: number) => THREE.Color), sway = 0, jitter = 0.12, opt?: Opt) =>
    b.add(g, M.multiplyMatrices(base, local), c, sway, jitter, rnd, opt)
  const world = (x: number, y: number, z: number) => _c.set(x, y, z).applyMatrix4(base).clone()
  const barkUv = (h: number, around = 2) => [0, 0, around, h / 1.5] as const
  switch (r.type) {
    case 'oak': {
      const twisted = r.seed % 11 === 0
      const kit = `${twisted ? 'TwistedTree' : 'CommonTree'}_${1 + (r.seed % 5)}`
      if (appendNature(kit, B, base, rnd, 0.9)) break
      const lean = (rnd() - 0.5) * 0.12
      const bark = color('#b8a898').offsetHSL(0, 0, (rnd() - 0.5) * 0.06)
      put(B.bark, TRUNK, mat(0, -0.2, 0, lean, 0, lean * 0.6, 0.32, 3.8, 0.32), bark, 0.05, 0.06, { uv: barkUv(3.8) })
      put(B.bark, TRUNK, mat(0.2, 2.1, 0, 0, 0, -0.9, 0.12, 1.7, 0.12), bark, 0.25, 0.06, { uv: barkUv(1.7, 1) })
      put(B.bark, TRUNK, mat(-0.15, 2.4, 0.1, 0.5, 0, 0.8, 0.1, 1.5, 0.1), bark, 0.25, 0.06, { uv: barkUv(1.5, 1) })
      put(B.bark, TRUNK, mat(0, 2.6, -0.15, -0.7, 0, 0.1, 0.09, 1.3, 0.09), bark, 0.25, 0.06, { uv: barkUv(1.3, 1) })
      const autumn = rnd() < 0.1
      const species = rnd() < 0.3 ? ATLAS.beech : rnd() < 0.2 ? ATLAS.birch : ATLAS.oak
      const tint = color(LEAF_TINTS[Math.floor(rnd() * LEAF_TINTS.length)])
      if (autumn) tint.multiply(AUTUMN_TINT)
      const center = world(0, 4.1, 0)
      const blobs = 6 + Math.floor(rnd() * 3)
      for (let i = 0; i < blobs; i++) {
        const a = (i / blobs) * Math.PI * 2 + rnd()
        const rr = i === 0 ? 0 : 0.9 + rnd() * 0.6
        const rad = i === 0 ? 1.55 : 1.0 + rnd() * 0.5
        const cy = 3.8 + (i === 0 ? 0.7 : (rnd() - 0.3) * 1.0)
        const cx = Math.cos(a) * rr
        const cz = Math.sin(a) * rr
        // No solid core: dense, overlapping leaf cards read as volume without black lumps.
        const cards = 12 + Math.floor(rnd() * 4)
        for (let k = 0; k < cards; k++) {
          const u = rnd() * Math.PI * 2
          const v = Math.acos(1 - rnd() * 1.6) // bias upward
          const d = rad * (0.2 + rnd() * 0.65)
          const px = cx + Math.sin(v) * Math.cos(u) * d
          const py = cy + Math.cos(v) * d * 0.8
          const pz = cz + Math.sin(v) * Math.sin(u) * d
          const size = rad * (1.05 + rnd() * 0.5)
          const shade = 0.82 + 0.28 * Math.cos(v)
          put(B.leaf, CARD, mat(px, py, pz, rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI, size, size, size), tint.clone().multiplyScalar(shade), 1, 0.1, { uv: species, center })
        }
      }
      break
    }
    case 'pine': {
      if (appendNature(`Pine_${1 + (r.seed % 5)}`, B, base, rnd, 0.8)) break
      const bark = color('#a89585')
      put(B.bark, TRUNK, mat(0, -0.2, 0, 0, 0, 0, 0.25, 6.6, 0.25), bark, 0.05, 0.05, { uv: barkUv(6.6) })
      const tint = color(LEAF_TINTS[Math.floor(rnd() * LEAF_TINTS.length)]).multiplyScalar(0.92)
      const tiers = 6
      const center = world(0, 3.8, 0)
      for (let i = 0; i < tiers; i++) {
        const t = i / (tiers - 1)
        const rad = 2.05 - t * 1.4 + rnd() * 0.15
        const y = 1.35 + i * 0.86
        put(B.main, CONE, mat(0, y + 0.1, 0, 0, rnd() * 3, 0, rad * 0.6, 1.4 - t * 0.3, rad * 0.6), color('#33462a'), 0.6 + t * 0.5, 0.06, { center })
        const n = Math.max(5, Math.round(9 - t * 4))
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + rnd() * 0.5 + i
          const d = rad * 0.52
          const size = rad * (1.05 + rnd() * 0.25)
          const m = new THREE.Matrix4().compose(
            V.set(Math.cos(a) * d, y + 0.45, Math.sin(a) * d),
            Q.setFromEuler(E.set(-1.05 - rnd() * 0.35, -a + Math.PI / 2, 0, 'YXZ')),
            S.set(size * 0.9, size, size),
          )
          put(B.leaf, CARD, m, tint.clone().multiplyScalar(0.8 + t * 0.3), 0.6 + t * 0.6, 0.08, { uv: ATLAS.pine, center, up: 0.5 })
        }
      }
      for (let k = 0; k < 2; k++) put(B.leaf, CARD_ROOT, mat(0, 6.1, 0, 0, k * Math.PI / 2, 0, 0.9, 1.4, 0.9), tint, 1.2, 0.05, { uv: ATLAS.pine, center, up: 0.6 })
      break
    }
    case 'fiber': {
      const plant = ['Fern_1', 'Plant_1_Big', 'Plant_7_Big'][r.seed % 3]
      if (appendNature(plant, B, base, rnd, 1.15)) break
      const tint = color(rnd() < 0.5 ? '#f0ffc8' : '#e2eeb0')
      for (let k = 0; k < 3; k++) put(B.leaf, CARD_ROOT, mat(0, -0.05, 0, 0, (k / 3) * Math.PI + rnd() * 0.3, 0, 1.15, 1.2 + rnd() * 0.4, 1.15), tint, 1.3, 0.12, { uv: ATLAS.grass, swayY: 0, center: world(0, -0.8, 0), up: 1 })
      break
    }
    case 'bush': {
      if (appendNature(r.seed % 3 ? 'Bush_Common_Flowers' : 'Bush_Common', B, base, rnd, 0.6)) break
      put(B.main, lumpy(ICO1, rnd, 0.25), mat(0, 0.42, 0, rnd(), rnd(), 0, 0.5, 0.4, 0.5), color('#3a5226'), 0.4, 0.1, { center: world(0, 0.42, 0) })
      const center = world(0, 0.3, 0)
      for (let k = 0; k < 4; k++) put(B.leaf, CARD_ROOT, mat(0, -0.02, 0, (rnd() - 0.5) * 0.2, (k / 4) * Math.PI + rnd() * 0.4, 0, 1.45, 1.25, 1.45), color('#ffffff').multiplyScalar(0.9 + rnd() * 0.15), 0.45, 0.1, { uv: ATLAS.berry, center, up: 0.6 })
      break
    }
    case 'boulder': {
      if (appendNature(`Rock_Medium_${1 + (r.seed % 3)}`, B, base, rnd)) break
      const rock = color('#857f73').offsetHSL(0, 0, (rnd() - 0.5) * 0.08)
      put(B.rock, lumpy(ICO3, rnd, 0.3, 1.7), mat(0, 0.35, 0, rnd() * 0.3, 0, rnd() * 0.3, 1.2, 0.85, 1.0), mossy(rock, 0.7 * rnd()), 0, 0.06)
      if (rnd() < 0.5) put(B.rock, lumpy(ICO1, rnd, 0.3), mat(0.9, 0.1, 0.5, 0, 0, 0, 0.45), mossy(rock, 0.5), 0, 0.08)
      break
    }
    case 'pebble': {
      const round = r.seed % 2 === 0
      const kit = round ? `Pebble_Round_${1 + (r.seed % 5)}` : `Pebble_Square_${1 + (r.seed % 6)}`
      if (appendNature(kit, B, base, rnd)) break
      const rock = color('#9a958a')
      const n = 2 + Math.floor(rnd() * 2)
      for (let i = 0; i < n; i++) put(B.rock, lumpy(ICO1, rnd, 0.35), mat((rnd() - 0.5) * 0.5, 0.05, (rnd() - 0.5) * 0.5, rnd(), rnd(), 0, 0.14 + rnd() * 0.12, 0.09, 0.16 + rnd() * 0.1), rock, 0, 0.18)
      break
    }
    case 'crystal': {
      const rock = color('#6f6a62')
      put(B.rock, lumpy(ICO1, rnd, 0.3), mat(0, 0.05, 0, 0, 0, 0, 0.62, 0.3, 0.55), rock, 0, 0.1)
      const n = 3 + Math.floor(rnd() * 4)
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2
        const tilt = i === 0 ? 0 : 0.25 + rnd() * 0.45
        const h = i === 0 ? 1.5 : 0.6 + rnd() * 0.7
        const w = i === 0 ? 0.22 : 0.1 + rnd() * 0.1
        const c = color(rnd() < 0.72 ? '#6fd3c9' : '#8f7ae0')
        put(B.glow, PRISM, mat(Math.cos(a) * 0.18 * (i ? 1 : 0), 0.1, Math.sin(a) * 0.18 * (i ? 1 : 0), Math.sin(a) * tilt, 0, -Math.cos(a) * tilt, w, h, w), c, 0, 0.18)
      }
      break
    }
    case 'monolith': {
      const rock = color('#76726a').offsetHSL(0, 0, (rnd() - 0.5) * 0.05)
      put(B.rock, lumpy(ICO2, rnd, 0.12, 1.4), mat(0, 2.3, 0, (rnd() - 0.5) * 0.08, 0, (rnd() - 0.5) * 0.08, 0.68, 2.6, 0.42), mossy(rock, 0.9), 0, 0.04)
      const rune = color('#8ff5e8')
      for (let k = 0; k < 3; k++) put(B.glow, RBOX, mat(0, 1.6 + k * 0.7, 0.4, 0, 0, (k - 1) * 0.5, 0.26, 0.05, 0.05), rune, 0, 0)
      break
    }
    case 'altar': {
      const rock = color('#8b867b')
      put(B.rock, lumpy(ICO2, rnd, 0.08, 1.2), mat(0, 0.42, 0, 0, 0, 0, 1.3, 0.46, 1.3), mossy(rock, 0.3), 0, 0.04)
      break
    }
    case 'ruin': {
      const rock = color('#8a8478').offsetHSL(0, 0, (rnd() - 0.5) * 0.08)
      put(B.rock, RBOX, mat(0, 0.49, 0, (rnd() - 0.5) * 0.06, 0, (rnd() - 0.5) * 0.08, 1.3 + rnd() * 0.2, 0.98, 0.9), mossy(rock, 0.8 * rnd()), 0, 0.05)
      break
    }
    case 'log': {
      put(B.bark, CYL8, mat(-1.1, 0.3, 0, 0, 0, -Math.PI / 2, 0.3, 2.2, 0.3), mossy(color('#b8a898'), 0.5), 0, 0.06, { uv: barkUv(2.2) })
      break
    }
    case 'tent': {
      put(B.main, TENT, mat(0, 0, 0), (_x, _y, _z, _nx, ny) => tmpC.set('#a8916a').multiplyScalar(0.82 + ny * 0.2), 0.08, 0.04)
      const pole = color('#6b4a32')
      put(B.main, CYL8, mat(0, 0, 1.52, 0, 0, 0, 0.05, 2.35, 0.05), pole)
      put(B.main, CYL8, mat(0, 0, -1.52, 0, 0, 0, 0.05, 2.35, 0.05), pole)
      break
    }
    case 'firepit': {
      const rock = color('#77726a')
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        put(B.rock, lumpy(ICO1, rnd, 0.3), mat(Math.cos(a) * 0.62, 0.08, Math.sin(a) * 0.62, 0, rnd(), 0, 0.2, 0.15, 0.18), rock, 0, 0.15)
      }
      const char = color('#2b2520')
      for (let i = 0; i < 3; i++) put(B.rock, CYL8, mat(0, 0.12, 0, 0, (i / 3) * Math.PI, Math.PI / 2 - 0.2, 0.07, 0.8, 0.07), char)
      break
    }
    case 'urn': {
      put(B.main, URN, mat(0, 0, 0), (_x, y) => tmpC.set('#a0653c').multiplyScalar(0.8 + clamp(y - r.y + oy, 0, 1) * 0.3), 0, 0.05)
      break
    }
    case 'crate': {
      const wood = color('#9a7045')
      put(B.main, RBOX, mat(0, 0.35, 0, 0, 0, 0, 0.8, 0.7, 0.8), wood, 0, 0.05)
      const band = color('#5c412a')
      put(B.main, RBOX, mat(0, 0.35, 0, 0, 0, 0, 0.84, 0.12, 0.84), band)
      break
    }
  }
}
