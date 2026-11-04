import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { rng } from '../noise'
import { triplanarMaterial, type TriplanarUniforms } from '../materials'
import { applyOrientation } from './orientation'
import { sculpt, skinnedFrom, type Prim } from './sculpt'
import { addFeatures, type Features } from './features'
import { buildMeshMonster, meshModelFor } from './meshRig'
import { sourceQuaternion, type MonsterDef, type Part, type VitalSlot } from './defs'

/**
 * Monster builder. A hierarchy of Groups acts as the skeleton. The body is one smooth,
 * implicit-surface sculpt (see sculpt.ts) skinned to that skeleton, with photographic triplanar
 * hide shading; horns, plates, teeth, claws, crystals, moss and shell are rigid attachments.
 * Content is modelled facing +Z, then wrapped in a "source" rotation that mimics the authored
 * asset orientation and an "orient" group that applies the registry correction quaternion.
 */
export type HitSphere = { bone: THREE.Object3D; offset: THREE.Vector3; radius: number; part: Part; vital?: VitalSlot; world: THREE.Vector3 }
export type Anchor = { id: string; label: string; bone: THREE.Object3D; offset: THREE.Vector3; vital?: VitalSlot; ride?: boolean; world: THREE.Vector3; up: THREE.Vector3 }
export type Leg = {
  hip: THREE.Group
  knee: THREE.Group
  foot: THREE.Group
  upper: number
  lower: number
  front: boolean
  side: 1 | -1
  /** Foot rest position in body space. */
  rest: THREE.Vector3
  /** Foot home on the ground in content space. */
  home: THREE.Vector3
  /** IK bend direction in the hip's parent space (authored rigs keep the sculpt's own bend). */
  pole?: THREE.Vector3
  /** Gait group for hexapods: legs of the same group step together (tripod gait). */
  gait?: number
}
export type Vital = { slot: VitalSlot; mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; bone: THREE.Object3D; broken: boolean; hp: number; max: number }
export type MonsterRig = {
  def: MonsterDef
  root: THREE.Group
  orient: THREE.Group
  source: THREE.Group
  content: THREE.Group
  body: THREE.Group
  chest: THREE.Group
  neck: THREE.Group[]
  head: THREE.Group
  jaw: THREE.Group
  tail: THREE.Group[]
  tailEnd: THREE.Group
  legs: Leg[]
  vitals: Record<VitalSlot, Vital>
  hitSpheres: HitSphere[]
  anchors: Anchor[]
  plateMat: THREE.MeshStandardMaterial
  eyeMat: THREE.MeshStandardMaterial
  hideMat: THREE.MeshStandardMaterial
  /** Skin shader uniforms: enrage veins, hit flash, wound highlights. */
  skin: TriplanarUniforms
  skinMesh: THREE.SkinnedMesh
  /** Rigid clutter (moss cards, shell) that can shake loose when thrashing. */
  clutter: THREE.Object3D[]
  dims: { hipHeight: number; bodyLength: number; bodyWidth: number; bodyHeight: number; neckSeg: number; tailSeg: number; headLength: number; length: number; height: number }
  stats: { verts: number; tris: number; ms: number }
  dispose(): void
  features: Features
  /** Mesh rigs: the rest pose is the sculpt's own pose, so skip procedural rest offsets. */
  authored?: boolean
}

/** Texture source for monsters: the game and the library both register their asset loader. */
let textureSource: (key: string) => THREE.Texture = () => new THREE.Texture()
export function setMonsterTextureSource(fn: (key: string) => THREE.Texture): void {
  textureSource = fn
}
const HIDE: Record<string, string> = { mossback: 'tex.hide_moss', ashwing: 'tex.hide_ash', tidehorn: 'tex.hide_tide' }
let sculptCell = 0.17
/** Sculpt grid cell size in metres (smaller = smoother, slower). */
export function setSculptResolution(cell: number): void {
  sculptCell = cell
}

export function taperedTube(points: THREE.Vector3[], r0: number, r1: number, segments = 20, radial = 12): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points)
  const geo = new THREE.TubeGeometry(curve, segments, r0, radial, false)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const center = new THREE.Vector3()
  const v = new THREE.Vector3()
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments
    curve.getPointAt(t, center)
    const k = THREE.MathUtils.lerp(1, r1 / r0, Math.pow(t, 0.85)) * (1 + Math.sin(t * Math.PI) * 0.08)
    for (let j = 0; j <= radial; j += 1) {
      const idx = i * (radial + 1) + j
      v.fromBufferAttribute(pos, idx).sub(center).multiplyScalar(k).add(center)
      pos.setXYZ(idx, v.x, v.y, v.z)
    }
  }
  geo.computeVertexNormals()
  return geo
}

function weld(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute
  const map = new Map<string, number>()
  const verts: number[] = []
  const index: number[] = []
  for (let i = 0; i < pos.count; i += 1) {
    const key = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`
    let id = map.get(key)
    if (id === undefined) {
      id = verts.length / 3
      verts.push(pos.getX(i), pos.getY(i), pos.getZ(i))
      map.set(key, id)
    }
    index.push(id)
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  out.setIndex(index)
  return out
}

/** A smooth lumpy stone / shell / plate shape. */
export function lumpy(radius: number, random: () => number, detail = 3, amount = 0.18): THREE.BufferGeometry {
  const g = weld(new THREE.IcosahedronGeometry(radius, detail))
  const pos = g.attributes.position as THREE.BufferAttribute
  const seeds = Array.from({ length: 5 }, () => new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize())
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()
  for (let i = 0; i < pos.count; i += 1) {
    p.fromBufferAttribute(pos, i)
    n.copy(p).normalize()
    let d = 0
    for (const s of seeds) d += Math.pow(Math.max(0, n.dot(s)), 3)
    p.multiplyScalar(1 + (d - 0.4) * amount)
    pos.setXYZ(i, p.x, p.y, p.z)
  }
  g.computeVertexNormals()
  return g
}

/** Clustered hexagonal crystals (a vital point). */
export function crystal(size: number, random: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 7; i += 1) {
    const s = size * (i === 0 ? 1 : 0.4 + random() * 0.32)
    const tip = new THREE.CylinderGeometry(0, s * 0.42, s * 0.9, 6, 1)
    tip.translate(0, s * 1.65, 0)
    const shaft = new THREE.CylinderGeometry(s * 0.42, s * 0.36, s * 2.4, 6, 1)
    const m = mergeGeometries([tip.toNonIndexed(), shaft.toNonIndexed()])!
    m.translate(0, s * 0.6, 0)
    if (i > 0) {
      m.rotateZ((random() - 0.5) * 1.4)
      m.rotateX((random() - 0.5) * 1.4)
      m.translate((random() - 0.5) * size * 0.9, -size * 0.3, (random() - 0.5) * size * 0.9)
    }
    parts.push(m)
  }
  const merged = mergeGeometries(parts)!
  merged.computeVertexNormals()
  return merged
}

/** Crossed alpha cards (ferns / grass) placed by a callback. */
export function cardClump(count: number, w: number, h: number, place: (i: number, m: THREE.Matrix4) => void): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const m = new THREE.Matrix4()
  for (let i = 0; i < count; i += 1) {
    place(i, m)
    for (const rot of [0, Math.PI / 2]) {
      const g = new THREE.PlaneGeometry(w, h)
      g.translate(0, h / 2, 0)
      g.rotateY(rot + i)
      const nor = g.attributes.normal as THREE.BufferAttribute
      for (let k = 0; k < nor.count; k += 1) nor.setXYZ(k, nor.getX(k) * 0.35, 0.93, nor.getZ(k) * 0.35)
      g.applyMatrix4(m)
      parts.push(g)
    }
  }
  return mergeGeometries(parts)!
}

export function buildMonster(def: MonsterDef): MonsterRig {
  const model = meshModelFor(def)
  if (model) return buildMeshMonster(def, model)
  const P = def.plan
  const pal = def.palette
  const random = rng(def.id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7))
  const L = P.bodyLength
  const W = P.bodyWidth
  const H = P.bodyHeight
  const disposables: { dispose(): void }[] = []
  const hideTex = textureSource(HIDE[def.id] ?? 'tex.hide_moss')
  const hideCol = new THREE.Color(pal.hide)
  const bellyCol = new THREE.Color(pal.belly)
  const ratio = (a: number, b: number) => THREE.MathUtils.clamp(a / Math.max(0.02, b), 0.75, 1.6)
  const bellyTint = new THREE.Color(ratio(bellyCol.r, hideCol.r), ratio(bellyCol.g, hideCol.g), ratio(bellyCol.b, hideCol.b))
  const hideMat = triplanarMaterial({
    map: hideTex,
    tile: def.id === 'tidehorn' ? 2.8 : 2.3,
    belly: bellyTint,
    back: '#ebe6dc',
    roughness: def.id === 'tidehorn' ? 0.74 : 0.85,
    bump: 1.7,
    moss: P.moss ? { map: textureSource('tex.moss'), tile: 2.6, amount: 0.95 } : undefined,
    veins: pal.glow,
    veinBase: def.id === 'ashwing' ? 1.8 : 0,
    veinRange: def.id === 'ashwing' ? [0.0022, 0.0055] : undefined,
    wounds: true,
    skinned: true,
  })
  const plateMat = triplanarMaterial({ map: hideTex, tile: 1.3, color: new THREE.Color(pal.plate).multiplyScalar(1.7), roughness: 0.75, bump: 2.2 })
  plateMat.emissive = new THREE.Color(pal.glow)
  plateMat.emissiveIntensity = 0
  const hornMat = triplanarMaterial({ map: textureSource('tex.rock_face1_d'), tile: 1.1, color: new THREE.Color(pal.horn).multiplyScalar(1.2), roughness: 0.66, bump: 1.4 })
  const boneMat = new THREE.MeshStandardMaterial({ color: pal.horn, roughness: 0.55, metalness: 0, envMapIntensity: 0.4 })
  const eyeMat = new THREE.MeshStandardMaterial({ color: pal.eye, emissive: new THREE.Color(pal.eye), emissiveIntensity: 1.4, roughness: 0.15, metalness: 0 })
  const mouthMat = new THREE.MeshStandardMaterial({ color: '#3b1714', roughness: 0.62, metalness: 0, envMapIntensity: 0.3 })
  disposables.push(hideMat, plateMat, hornMat, boneMat, eyeMat, mouthMat)
  const prims: Prim[] = []
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
  const ell = (bone: THREE.Object3D, rx: number, ry: number, rz: number, x: number, y: number, z: number, blend: number, rot?: THREE.Euler) =>
    prims.push({ kind: 'ellipsoid', bone, center: V(x, y, z), radii: V(rx, ry, rz), rot, blend })
  const cap = (bone: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, blend: number) => prims.push({ kind: 'capsule', bone, a, b, ra, rb, blend })
  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    m.castShadow = true
    m.receiveShadow = true
    parent.add(m)
    disposables.push(geo)
    return m
  }

  const root = new THREE.Group()
  root.name = `monster:${def.id}`
  const orient = new THREE.Group()
  applyOrientation(orient, def)
  const source = new THREE.Group()
  source.quaternion.set(...sourceQuaternion(P.sourceFacing))
  const content = new THREE.Group()
  root.add(orient)
  orient.add(source)
  source.add(content)
  const body = new THREE.Group()
  body.name = 'body'
  body.position.set(0, P.hipHeight, 0)
  content.add(body)

  // ─── torso sculpt ─────────────────────────────────────────────────────
  ell(body, W / 2, H / 2, L / 2, 0, H * 0.15, 0, 0)
  ell(body, W * 0.44, H * 0.44, L * 0.26, 0, H * 0.3, L * 0.24, 1.4)
  ell(body, W * 0.42, H * 0.38, L * 0.22, 0, H * 0.2, -L * 0.3, 1.4)
  ell(body, W * 0.38, H * 0.28, L * 0.32, 0, -H * 0.12, L * 0.02, 1.2)
  for (const s of [-1, 1]) {
    ell(body, W * 0.2, H * 0.3, L * 0.13, s * W * 0.33, H * 0.02, L * 0.3, 1.1)
    ell(body, W * 0.22, H * 0.34, L * 0.15, s * W * 0.33, H * 0.06, -L * 0.3, 1.1)
    ell(body, W * 0.07, H * 0.22, L * 0.24, s * W * 0.43, H * 0.1, L * 0.03, 0.9, new THREE.Euler(0, 0, s * 0.3))
  }
  const topY = (z: number) => H * 0.15 + (H / 2) * Math.sqrt(Math.max(0, 1 - (z / (L / 2)) ** 2))
  const heartZ = -L * 0.04
  const plateGeos: THREE.BufferGeometry[] = []
  for (let i = 0; i < P.plates; i += 1) {
    const t = i / Math.max(1, P.plates - 1)
    const z = THREE.MathUtils.lerp(L * 0.36, -L * 0.42, t)
    if (Math.abs(z - heartZ) < L * 0.07) continue
    const h = P.plateHeight * (1 - Math.abs(t - 0.4) * 0.7)
    const g = lumpy(1, random, 2, 0.14)
    g.scale(h * 0.15, h * 0.62, h * 0.44)
    g.rotateX(-0.45)
    g.translate(0, topY(z) + h * 0.2, z)
    plateGeos.push(g)
  }
  if (plateGeos.length) add(body, mergeGeometries(plateGeos)!, plateMat)

  const clutter: THREE.Object3D[] = []
  if (P.moss) {
    const card = (key: string, tint: string) =>
      new THREE.MeshStandardMaterial({ map: textureSource(key), alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.92, metalness: 0, envMapIntensity: 0.25, color: tint })
    const fernMat = card('foliage.fern', '#b9c79a')
    const grassMat = card('foliage.grass_clump', '#c7cf9a')
    disposables.push(fernMat, grassMat)
    const place = (scale: number) => (_i: number, m: THREE.Matrix4) => {
      let z = 0
      do z = THREE.MathUtils.lerp(L * 0.36, -L * 0.4, random())
      while (Math.abs(z - heartZ) < L * 0.08)
      const x = (random() - 0.5) * W * 0.62
      const y = topY(z) * Math.sqrt(Math.max(0.2, 1 - (x / (W * 0.5)) ** 2)) - 0.12
      const s = scale * (0.7 + random() * 0.6)
      m.compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler((random() - 0.5) * 0.4, random() * 6.28, x * -0.18)), V(s, s, s))
    }
    const ferns = add(body, cardClump(22, 1.6, 1.25, place(1)), fernMat)
    const tufts = add(body, cardClump(30, 1.2, 0.8, place(1)), grassMat)
    ferns.castShadow = tufts.castShadow = false
    clutter.push(ferns, tufts)
  }
  if (P.shell) {
    const shellMat = triplanarMaterial({ map: textureSource('tex.rock_face1_d'), tile: 1.8, color: new THREE.Color(pal.plate).multiplyScalar(1.5), roughness: 0.86, bump: 2 })
    disposables.push(shellMat)
    const geos: THREE.BufferGeometry[] = []
    for (let i = 0; i < 22; i += 1) {
      const z = THREE.MathUtils.lerp(L * 0.36, -L * 0.38, random())
      if (Math.abs(z - heartZ) < L * 0.07) continue
      const side = random() > 0.5 ? 1 : -1
      const x = side * (W * 0.12 + random() * W * 0.26)
      const r = 0.55 + random() * 0.8
      const g = lumpy(r, random, 2, 0.35)
      g.scale(1, 0.55, 1)
      g.translate(x, topY(z) * Math.sqrt(Math.max(0.2, 1 - (x / (W * 0.5)) ** 2)) - r * 0.12, z)
      geos.push(g)
    }
    clutter.push(add(body, mergeGeometries(geos)!, shellMat))
  }
  const vitalMat = () => {
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(pal.glow).multiplyScalar(0.5), emissive: new THREE.Color(pal.glow).multiplyScalar(0.85), emissiveIntensity: 0.6, roughness: 0.14, metalness: 0.05, envMapIntensity: 1.1, flatShading: true })
    disposables.push(m)
    return m
  }
  const vitalBack = add(body, crystal(0.62, random), vitalMat(), 0, topY(heartZ) - 0.1, heartZ)

  // ─── neck & head ──────────────────────────────────────────────────────
  const chest = new THREE.Group()
  chest.name = 'chest'
  chest.position.set(0, H * 0.3, L * 0.44)
  body.add(chest)
  const neckSeg = P.neckLength / P.neckSegments
  const neck: THREE.Group[] = []
  let parent: THREE.Object3D = chest
  for (let i = 0; i < P.neckSegments; i += 1) {
    const g = new THREE.Group()
    g.name = `neck${i}`
    g.position.set(0, 0, i === 0 ? 0 : neckSeg)
    parent.add(g)
    const r = P.neckThick * (1 - i * 0.1)
    cap(g, V(0, 0, -neckSeg * 0.25), V(0, 0, neckSeg * 1.0), r * 1.02, r * 0.9, i === 0 ? 1.4 : 0.9)
    ell(g, r * 0.7, r * 0.55, neckSeg * 0.5, 0, -r * 0.42, neckSeg * 0.5, 0.7)
    const pg = lumpy(1, random, 2, 0.1)
    pg.scale(r * 0.13, r * 0.5, r * 0.4)
    pg.rotateX(-0.5)
    add(g, pg, plateMat, 0, r * 0.95, neckSeg * 0.45)
    neck.push(g)
    parent = g
  }
  const head = new THREE.Group()
  head.name = 'head'
  head.position.set(0, 0, neckSeg)
  parent.add(head)
  const hl = P.headLength
  const hw = P.headWidth
  const hh = P.headHeight
  ell(head, hw / 2, hh / 2, hl * 0.34, 0, hh * 0.12, hl * 0.22, 0.6)
  ell(head, hw * 0.36, hh * 0.32, hl * 0.36, 0, -hh * 0.02, hl * 0.62, 0.5)
  ell(head, hw * 0.52, hh * 0.18, hl * 0.17, 0, hh * 0.36, hl * 0.36, 0.35)
  for (const s of [-1, 1]) {
    ell(head, hw * 0.2, hh * 0.26, hl * 0.2, s * hw * 0.3, -hh * 0.06, hl * 0.3, 0.4)
    ell(head, hw * 0.08, hh * 0.08, hl * 0.12, s * hw * 0.15, hh * 0.14, hl * 0.86, 0.2)
    const eye = add(head, new THREE.SphereGeometry(hh * 0.085, 16, 12), eyeMat, s * hw * 0.35, hh * 0.22, hl * 0.47)
    eye.castShadow = false
  }
  const hornGeos: THREE.BufferGeometry[] = []
  const hlen = P.hornLength
  for (const s of [-1, 1]) {
    if (P.horns === 'crown') {
      for (const [ox, oy, oz, spread] of [[0.26, 0.44, 0.04, 0.12], [0.44, 0.28, -0.04, 0.3]] as const) {
        const a = V(s * hw * ox, hh * oy, hl * oz)
        hornGeos.push(taperedTube([a, a.clone().add(V(s * spread * 0.4, 0.35, -0.3).multiplyScalar(hlen)), a.clone().add(V(s * spread, 0.62, -0.85).multiplyScalar(hlen))], 0.22 * hlen * 0.5, 0.02))
      }
    } else if (P.horns === 'swept') {
      const a = V(s * hw * 0.3, hh * 0.33, hl * 0.05)
      hornGeos.push(taperedTube([a, a.clone().add(V(s * 0.15, 0.22, -0.5).multiplyScalar(hlen)), a.clone().add(V(s * 0.25, 0.34, -1.05).multiplyScalar(hlen))], 0.12 * hlen, 0.015, 24))
      const b = V(s * hw * 0.42, 0, hl * 0.3)
      hornGeos.push(taperedTube([b, b.clone().add(V(s * 0.3, -0.05, -0.25).multiplyScalar(hlen * 0.5))], 0.06 * hlen, 0.01, 8, 8))
    } else if (P.horns === 'ram') {
      const a = V(s * hw * 0.4, hh * 0.3, hl * 0.16)
      const pts = [[0, 0, 0], [0.35, 0.25, -0.15], [0.62, -0.05, -0.32], [0.62, -0.45, -0.05], [0.45, -0.38, 0.32], [0.38, -0.12, 0.5]].map(([x, y, z]) => a.clone().add(V(s * x, y, z).multiplyScalar(hlen)))
      hornGeos.push(taperedTube(pts, 0.17 * hlen, 0.03, 32, 12))
    }
  }
  if (P.horns === 'ram') {
    const n = V(0, hh * 0.2, hl * 0.72)
    hornGeos.push(taperedTube([n, n.clone().add(V(0, 0.35, 0.1).multiplyScalar(hlen * 0.5)), n.clone().add(V(0, 0.62, -0.05).multiplyScalar(hlen * 0.5))], 0.12 * hlen * 0.5, 0.01, 12, 10))
  }
  if (hornGeos.length) add(head, mergeGeometries(hornGeos)!, hornMat)
  const vitalHead = add(head, crystal(0.4, random), vitalMat(), 0, hh * 0.52, hl * 0.12)
  const jaw = new THREE.Group()
  jaw.name = 'jaw'
  jaw.position.set(0, -hh * 0.18, hl * 0.12)
  head.add(jaw)
  ell(jaw, hw * 0.34, hh * 0.16, hl * 0.42, 0, -hh * 0.12, hl * 0.4, 0.14)
  ell(jaw, hw * 0.26, hh * 0.14, hl * 0.2, 0, -hh * 0.2, hl * 0.12, 0.3)
  // Mouth interior so an open jaw reads as a mouth, not a gap.
  const mouth = add(jaw, new THREE.SphereGeometry(1, 16, 10), mouthMat, 0, -hh * 0.02, hl * 0.42)
  mouth.scale.set(hw * 0.28, hh * 0.1, hl * 0.36)
  mouth.castShadow = false
  const lowerTeeth: THREE.BufferGeometry[] = []
  const upperTeeth: THREE.BufferGeometry[] = []
  for (const s of [-1, 1]) {
    for (let i = 0; i < 7; i += 1) {
      const g = new THREE.ConeGeometry(0.06 * hh, 0.26 * hh * (i < 2 ? 1.4 : 1), 8)
      g.translate(s * hw * (0.27 - i * 0.022), hh * 0.06, hl * (0.2 + i * 0.1))
      lowerTeeth.push(g)
      const u = new THREE.ConeGeometry(0.06 * hh, 0.3 * hh * (i < 2 ? 1.5 : 1), 8)
      u.rotateX(Math.PI)
      u.translate(s * hw * (0.28 - i * 0.022), -hh * 0.2, hl * (0.34 + i * 0.09))
      upperTeeth.push(u)
    }
  }
  add(jaw, mergeGeometries(lowerTeeth)!, boneMat)
  add(head, mergeGeometries(upperTeeth)!, boneMat)

  // ─── tail ─────────────────────────────────────────────────────────────
  const tailSeg = P.tailLength / P.tailSegments
  const tail: THREE.Group[] = []
  parent = body
  const tailR = (i: number) => P.tailThick * (1 - (i / P.tailSegments) * 0.72)
  for (let i = 0; i < P.tailSegments; i += 1) {
    const g = new THREE.Group()
    g.name = `tail${i}`
    if (i === 0) g.position.set(0, H * 0.12, -L * 0.44)
    else g.position.set(0, 0, -tailSeg)
    parent.add(g)
    cap(g, V(0, 0, tailSeg * 0.2), V(0, 0, -tailSeg * 1.02), tailR(i), tailR(i + 1), i === 0 ? 1.5 : 0.8)
    if (i < P.tailSegments - 1) {
      const pg = lumpy(1, random, 2, 0.1)
      const r = tailR(i)
      pg.scale(r * 0.14, r * 0.5, r * 0.42)
      pg.rotateX(-0.6)
      add(g, pg, plateMat, 0, r * 0.9, -tailSeg * 0.5)
    }
    tail.push(g)
    parent = g
  }
  const lastR = tailR(P.tailSegments - 1)
  const tailEnd = new THREE.Group()
  tailEnd.name = 'tailEnd'
  tailEnd.position.set(0, 0, -tailSeg * 0.95)
  tail[tail.length - 1].add(tailEnd)
  const endR = Math.max(0.6, lastR) * 1.9
  if (P.tailEnd === 'club') {
    ell(tailEnd, endR, endR * 0.85, endR * 1.1, 0, 0, 0, 0.6)
    const spikes: THREE.BufferGeometry[] = []
    for (let i = 0; i < 8; i += 1) {
      const g = new THREE.ConeGeometry(endR * 0.2, endR * 0.95, 10)
      g.translate(0, endR * 0.95, 0)
      g.rotateZ((i / 8) * Math.PI * 2)
      g.rotateX((random() - 0.5) * 0.5)
      spikes.push(g)
    }
    add(tailEnd, mergeGeometries(spikes)!, hornMat)
  } else if (P.tailEnd === 'blade') {
    ell(tailEnd, endR * 0.38, endR * 0.42, endR * 1.1, 0, 0, 0, 0.5)
    for (const s of [-1, 1]) {
      const shape = new THREE.Shape()
      shape.moveTo(0, 0)
      shape.quadraticCurveTo(endR * 0.9, endR * 0.4, endR * 0.2, endR * 2.7)
      shape.quadraticCurveTo(endR * 0.1, endR * 1.2, 0, 0)
      const g = new THREE.ExtrudeGeometry(shape, { depth: endR * 0.08, bevelEnabled: true, bevelThickness: endR * 0.04, bevelSize: endR * 0.04, bevelSegments: 2, curveSegments: 10 })
      g.translate(0, 0, -endR * 0.04)
      g.rotateX(-Math.PI / 2)
      g.rotateY(s * 1.15)
      add(tailEnd, g, hornMat, s * endR * 0.3, 0, -endR * 0.1)
    }
  } else {
    ell(tailEnd, endR * 1.7, endR * 0.95, endR * 1.05, 0, 0, 0, 0.6)
    const hammer = add(tailEnd, lumpy(1, random, 3, 0.2), plateMat, 0, 0, -endR * 0.7)
    hammer.scale.set(endR * 1.3, endR * 0.75, endR * 0.55)
  }
  const vitalTail = add(tailEnd, crystal(0.36, random), vitalMat(), 0, endR * 0.8, 0)

  // ─── legs ─────────────────────────────────────────────────────────────
  const legs: Leg[] = []
  const LT = P.legThick
  const footH = LT * 0.55
  const clawJobs: { bone: THREE.Group; geo: THREE.BufferGeometry }[] = []
  for (const front of [true, false]) {
    for (const side of [1, -1] as const) {
      const hip = new THREE.Group()
      hip.name = `${front ? 'f' : 'b'}${side > 0 ? 'L' : 'R'}hip`
      const hipPos = front ? V(side * W * 0.4, -H * 0.1, L * 0.3) : V(side * W * 0.42, -H * 0.05, -L * 0.3)
      hip.position.copy(hipPos)
      body.add(hip)
      const reach = P.hipHeight + hipPos.y - footH
      const upper = reach * 0.56
      const lower = reach * 0.56
      const thick = LT * (front ? 1 : 1.12)
      cap(hip, V(0, LT * 0.5, 0), V(0, -upper, 0), thick * 1.18, LT * 0.74, 1.3)
      ell(hip, thick * 0.95, upper * 0.4, thick * 1.1, 0, -upper * 0.3, front ? 0.1 : -0.15, 0.7)
      const knee = new THREE.Group()
      knee.name = hip.name.replace('hip', 'knee')
      knee.position.set(0, -upper, 0)
      hip.add(knee)
      cap(knee, V(0, 0, 0), V(0, -lower, 0), LT * 0.74, LT * 0.52, 0.5)
      ell(knee, LT * 0.62, lower * 0.3, LT * 0.7, 0, -lower * 0.25, front ? -0.05 : 0.1, 0.5)
      const foot = new THREE.Group()
      foot.name = hip.name.replace('hip', 'foot')
      foot.position.set(0, -lower, 0)
      knee.add(foot)
      ell(foot, LT * 0.88, footH * 0.6, LT * 1.2, 0, -footH * 0.3, LT * 0.3, 0.45)
      for (let c = -1; c <= 1; c += 1) cap(foot, V(c * LT * 0.36, -footH * 0.38, LT * 0.7), V(c * LT * 0.5, -footH * 0.6, LT * 1.35), LT * 0.24, LT * 0.17, 0.3)
      const cg: THREE.BufferGeometry[] = []
      for (let c = -1; c <= 1; c += 1) {
        const g = new THREE.ConeGeometry(LT * 0.14, LT * 0.62, 10)
        g.rotateX(Math.PI / 2 + 0.35)
        g.translate(c * LT * 0.52, -footH * 0.72, LT * 1.62)
        cg.push(g)
      }
      clawJobs.push({ bone: foot, geo: mergeGeometries(cg)! })
      if (P.wings && front) {
        const wingMat = triplanarMaterial({ map: hideTex, tile: 1.6, color: new THREE.Color(pal.accent).multiplyScalar(2.2), roughness: 0.82, bump: 1 })
        wingMat.side = THREE.DoubleSide
        disposables.push(wingMat)
        const membrane = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
          // Subdivided, billowed triangle with a scalloped trailing edge.
          const n = 8
          const verts: number[] = []
          const idx: number[] = []
          const row = (i: number) => (i * (i + 1)) / 2
          const p = new THREE.Vector3()
          for (let i = 0; i <= n; i += 1)
            for (let j = 0; j <= i; j += 1) {
              const u = i / n
              const v = i === 0 ? 0 : j / i
              p.copy(a).lerp(b, u * (1 - v)).lerp(c, u * v)
              const billow = Math.sin(Math.PI * u) * Math.sin(Math.PI * v) * 0.35
              const scallop = i === n ? Math.sin(v * Math.PI * 4) * 0.25 : 0
              verts.push(p.x + side * billow, p.y - scallop, p.z)
            }
          for (let i = 0; i < n; i += 1)
            for (let j = 0; j <= i; j += 1) {
              idx.push(row(i) + j, row(i + 1) + j, row(i + 1) + j + 1)
              if (j < i) idx.push(row(i) + j, row(i + 1) + j + 1, row(i) + j + 1)
            }
          const g = new THREE.BufferGeometry()
          g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
          g.setIndex(idx)
          g.computeVertexNormals()
          return g
        }
        const wx = side * LT * 0.6
        add(hip, membrane(V(wx, 0.4, 0), V(wx, -upper, 0), V(wx, -upper * 0.1, -L * 0.62)), wingMat)
        add(knee, membrane(V(wx, 0, 0), V(wx, -lower * 0.85, 0.2), V(wx, upper * 0.9 - lower * 0.1, -L * 0.62)), wingMat)
        add(knee, taperedTube([V(wx, 0, 0), V(wx, 0.6, -L * 0.3), V(wx, 0.9, -L * 0.6)], LT * 0.16, 0.03, 16, 8), hornMat)
      }
      const rest = V(hipPos.x * 1.05, hipPos.y - reach, hipPos.z)
      legs.push({ hip, knee, foot, upper, lower, front, side, rest, home: V(hipPos.x * 1.05, 0, hipPos.z + (front ? 0.3 : -0.2)) })
    }
  }
  for (const c of clawJobs) add(c.bone, c.geo, hornMat)

  // ─── signature anatomy (antlers, grove, obsidian, reef...) ──────────────
  const features = addFeatures({
    def, body, neck, head, jaw, tail, tailEnd, hips: legs.map(l => l.hip),
    L, W, H, hl, hw, hh, neckSeg, tailSeg,
    neckR: i => P.neckThick * (1 - i * 0.1),
    tailR, heartZ, random,
    tex: textureSource,
    track: d => disposables.push(d),
  })
  clutter.push(...features.clutter)

  // ─── skin ─────────────────────────────────────────────────────────────
  root.updateMatrixWorld(true)
  const sculpted = sculpt(content, prims, sculptCell)
  const skinMesh = skinnedFrom(sculpted, hideMat, content)
  skinMesh.name = 'skin'
  disposables.push(sculpted.geometry)

  // ─── hit spheres & anchors ────────────────────────────────────────────
  const hitSpheres: HitSphere[] = []
  const sphere = (bone: THREE.Object3D, x: number, y: number, z: number, radius: number, part: Part, vital?: VitalSlot) =>
    hitSpheres.push({ bone, offset: V(x, y, z), radius, part, vital, world: new THREE.Vector3() })
  sphere(body, 0, H * 0.18, L * 0.3, W * 0.46, 'body')
  sphere(body, 0, H * 0.2, 0, W * 0.5, 'body')
  sphere(body, 0, H * 0.15, -L * 0.3, W * 0.44, 'body')
  sphere(body, 0, topY(heartZ) + 0.2, heartZ, 1.3, 'body', 'back')
  neck.forEach((g, i) => sphere(g, 0, 0, neckSeg * 0.5, P.neckThick * (1 - i * 0.1) * 1.05, 'neck'))
  sphere(head, 0, 0, hl * 0.35, hh * 0.72, 'head')
  sphere(head, 0, hh * 0.55, hl * 0.14, 0.9, 'head', 'head')
  sphere(jaw, 0, -hh * 0.1, hl * 0.4, hh * 0.35, 'head')
  tail.forEach((g, i) => sphere(g, 0, 0, -tailSeg * 0.5, tailR(i) * 1.05, 'tail'))
  sphere(tailEnd, 0, 0, 0, endR * 1.1, 'tail', 'tail')
  for (const leg of legs) {
    sphere(leg.hip, 0, -leg.upper * 0.45, 0, LT * 1.05, 'leg')
    sphere(leg.knee, 0, -leg.lower * 0.5, 0, LT * 0.8, 'leg')
    sphere(leg.foot, 0, -footH * 0.3, LT * 0.3, LT * 0.9, 'leg')
  }
  const anchors: Anchor[] = []
  const anchor = (id: string, label: string, bone: THREE.Object3D, x: number, y: number, z: number, vital?: VitalSlot, ride?: boolean) =>
    anchors.push({ id, label, bone, offset: V(x, y, z), vital, ride, world: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) })
  const vitalName = (slot: VitalSlot) => def.vitals.find(v => v.slot === slot)!.name
  anchor('tail', vitalName('tail'), tailEnd, 0, endR * 0.85, endR * 0.5, 'tail')
  anchor('tailBase', 'Tail', tail[1], 0, P.tailThick * 0.9, -tailSeg * 0.5)
  anchor('back', vitalName('back'), body, 0, topY(heartZ - 0.9), heartZ - 0.9, 'back')
  anchor('shoulders', 'Shoulders', body, 0, topY(L * 0.26) + H * 0.1, L * 0.26)
  anchor('neck', 'Neck', neck[Math.max(0, neck.length - 2)], 0, P.neckThick * 0.95, neckSeg * 0.5, undefined, true)
  anchor('head', vitalName('head'), head, 0, hh * 0.5, hl * 0.02, 'head')
  const vital = (slot: VitalSlot, mesh: THREE.Mesh, bone: THREE.Object3D): Vital => {
    mesh.castShadow = false
    return { slot, mesh, mat: mesh.material as THREE.MeshStandardMaterial, bone, broken: false, hp: 1, max: 1 }
  }
  const vitals: Record<VitalSlot, Vital> = { head: vital('head', vitalHead, head), back: vital('back', vitalBack, body), tail: vital('tail', vitalTail, tailEnd) }
  const length = L + P.neckLength + hl + P.tailLength
  return {
    def, root, orient, source, content, body, chest, neck, head, jaw, tail, tailEnd, legs, vitals, hitSpheres, anchors, plateMat, eyeMat, hideMat,
    skin: hideMat.userData.uniforms,
    features,
    skinMesh,
    clutter,
    dims: { hipHeight: P.hipHeight, bodyLength: L, bodyWidth: W, bodyHeight: H, neckSeg, tailSeg, headLength: hl, length, height: P.hipHeight + H * 0.65 + P.plateHeight },
    stats: sculpted.stats,
    dispose() {
      skinMesh.skeleton.dispose()
      for (const d of disposables) d.dispose()
    },
  }
}

const _v = new THREE.Vector3()
const _q = new THREE.Quaternion()
/** Refresh world positions of hit spheres and anchors (call after matrices are updated). */
export function refreshRigWorld(rig: MonsterRig): void {
  for (const s of rig.hitSpheres) s.world.copy(s.offset).applyMatrix4(s.bone.matrixWorld)
  for (const a of rig.anchors) {
    a.world.copy(a.offset).applyMatrix4(a.bone.matrixWorld)
    a.bone.getWorldQuaternion(_q)
    a.up.set(0, 1, 0).applyQuaternion(_q)
  }
}

export function vitalWorld(rig: MonsterRig, slot: VitalSlot, out = _v): THREE.Vector3 {
  return rig.vitals[slot].mesh.getWorldPosition(out)
}

/** Rest-space (content) position of a hit sphere, for wound highlights in the skin shader. */
export function restPositionOf(rig: MonsterRig, s: HitSphere, out: THREE.Vector3): THREE.Vector3 {
  // Skin shader positions are bind-pose content space; use the bone's inverse bind matrix.
  const i = rig.skinMesh.skeleton.bones.indexOf(s.bone as THREE.Bone)
  out.copy(s.offset)
  if (i >= 0) {
    const bind = new THREE.Matrix4().copy(rig.skinMesh.skeleton.boneInverses[i]).invert()
    out.applyMatrix4(bind)
    // boneInverses map from mesh (bind) space; the mesh sits at content identity.
    out.applyMatrix4(new THREE.Matrix4().copy(rig.skinMesh.bindMatrix).invert())
  }
  return out
}
