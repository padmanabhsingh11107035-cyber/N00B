import * as THREE from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { ENV_INTENSITY, triplanarMaterial } from './materials'

/**
 * The hunter: the rigged catalog mannequin (UAL) dressed in a bone-attached armour kit that
 * follows the concept art — iron helmet with brass trim, fur collar, layered pauldrons, leather
 * coat, belt with pouches and potion vials, tassets, knee cops, greaves, a forearm grapple
 * launcher, a verlet cape — plus the rune greatsword built as a diamond-section blade whose
 * silhouette is traced from its painted texture. Animation lives in `hunterAnim.ts`.
 */

export type HunterSource = { gltf(key: string): GLTF | undefined; texture(key: string): THREE.Texture }
let source: HunterSource | null = null
export function setHunterSource(s: HunterSource): void {
  source = s
}

/** Blade hit segment in sword space (grip at origin, blade along +Y), before SWORD_SCALE. */
export const BLADE = { base: 0.3, tip: 2.4, radius: 0.4 }
/** Visual/physical sword scale: the blade stays huge but fits a 1.8 m hunter's back. */
export const SWORD_SCALE = 0.84
/** Stance coordinates were authored for a 0.66 m arm; the mannequin reaches 0.547 m. */
export const STANCE_SCALE = 0.83

export const CLIP_NAMES = [
  'Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Sword_Idle', 'Crouch_Idle_Loop', 'Crouch_Fwd_Loop', 'Roll', 'Hit_Chest', 'Hit_Head',
  'Death01', 'Jump_Start', 'Jump_Loop', 'Jump_Land', 'Driving_Loop', 'Interact', 'Push_Loop', 'Spell_Simple_Shoot',
] as const
export type ClipName = (typeof CLIP_NAMES)[number]

export type BoneKey = 'root' | 'pelvis' | 'spine1' | 'spine2' | 'spine3' | 'neck' | 'head' | 'clavR' | 'upperR' | 'lowerR' | 'handR' | 'clavL' | 'upperL' | 'lowerL' | 'handL' | 'thighR' | 'calfR' | 'footR' | 'thighL' | 'calfL' | 'footL'
const BONE_NAMES: Record<BoneKey, string> = {
  root: 'root', pelvis: 'pelvis', spine1: 'spine_01', spine2: 'spine_02', spine3: 'spine_03', neck: 'neck_01', head: 'Head',
  clavR: 'clavicle_r', upperR: 'upperarm_r', lowerR: 'lowerarm_r', handR: 'hand_r', clavL: 'clavicle_l', upperL: 'upperarm_l', lowerL: 'lowerarm_l', handL: 'hand_l',
  thighR: 'thigh_r', calfR: 'calf_r', footR: 'foot_r', thighL: 'thigh_l', calfL: 'calf_l', footL: 'foot_l',
}
/** Bind-pose joint positions (model space, metres) — also used to build the fallback skeleton. */
const REST: Record<BoneKey, [number, number, number]> = {
  root: [0, 0, 0], pelvis: [0, 0.917, -0.05], spine1: [0, 1.051, -0.016], spine2: [0, 1.174, 0], spine3: [0, 1.315, -0.005], neck: [0, 1.488, -0.011], head: [0, 1.569, 0.005],
  clavR: [-0.019, 1.458, 0.071], upperR: [-0.192, 1.441, -0.065], lowerR: [-0.466, 1.441, -0.07], handR: [-0.739, 1.441, -0.065],
  clavL: [0.019, 1.458, 0.071], upperL: [0.192, 1.441, -0.065], lowerL: [0.466, 1.441, -0.07], handL: [0.739, 1.441, -0.065],
  thighR: [-0.089, 0.932, 0.001], calfR: [-0.089, 0.532, -0.001], footR: [-0.089, 0.104, -0.036],
  thighL: [0.089, 0.932, 0.001], calfL: [0.089, 0.532, -0.001], footL: [0.089, 0.104, -0.036],
}
const PARENT: Partial<Record<BoneKey, BoneKey>> = {
  pelvis: 'root', spine1: 'pelvis', spine2: 'spine1', spine3: 'spine2', neck: 'spine3', head: 'neck', clavR: 'spine3', upperR: 'clavR', lowerR: 'upperR', handR: 'lowerR',
  clavL: 'spine3', upperL: 'clavL', lowerL: 'upperL', handL: 'lowerL', thighR: 'pelvis', calfR: 'thighR', footR: 'calfR', thighL: 'pelvis', calfL: 'thighL', footL: 'calfL',
}

export type ClothPoint = { p: THREE.Vector3; prev: THREE.Vector3; pinned: boolean; anchor?: THREE.Object3D }
export type Cape = { mesh: THREE.Mesh; cols: number; rows: number; points: ClothPoint[]; restY: number[]; restX: number }

export type HunterModel = {
  root: THREE.Group
  /** Spin/tilt pivot at the hips (thrown spins, knock-backs). */
  pivot: THREE.Group
  body: THREE.Object3D
  skinned: THREE.SkinnedMesh[]
  bones: Record<BoneKey, THREE.Object3D>
  /** Bind-pose quaternions of the hands in model space. */
  handRest: { R: THREE.Quaternion; L: THREE.Quaternion }
  clips: Map<ClipName, THREE.AnimationClip>
  /** Sheathed sword transform relative to spine_03. */
  sheath: THREE.Matrix4
  sword: THREE.Group
  swordGlow: THREE.MeshStandardMaterial
  launcher: THREE.Object3D
  hook: THREE.Group
  rope: THREE.Mesh
  cape: Cape
  materials: THREE.Material[]
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.castShadow = shadow
  m.receiveShadow = true
  return m
}

/** Blade outline traced from the painted texture: [row px, left px, right px]. */
const BLADE_ROWS: [number, number, number][] = [
  [292, 76, 164], [342, 75, 166], [404, 76, 170], [466, 75, 171], [528, 74, 172], [590, 73, 173], [652, 72, 174], [714, 70, 174], [776, 68, 173],
  [838, 67, 172], [869, 67, 167], [900, 69, 159], [931, 74, 148], [962, 83, 134], [993, 93, 120], [1010, 100, 111], [1021, 104, 106],
]
const TEX_W = 236
const TEX_H = 1024

function bladeGeometry(): THREE.BufferGeometry {
  const sy = 2.26 / (1021 - 292)
  const sz = 0.0037
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  // Four strips (front-left, front-right, back-right, back-left), each with its own vertices so the
  // central ridge and both edges stay crisp. Strip corners: 0 edge A, 1 front ridge, 2 edge B, 3 back ridge.
  const strips: [number, number, number][] = [[0, 1, 1], [1, 2, 1], [2, 3, -1], [3, 0, -1]]
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  for (const [ka, kb, outward] of strips) {
    const base = pos.length / 3
    BLADE_ROWS.forEach(([row, xl, xr], i) => {
      const y = 0.2 + (row - 292) * sy
      const t = Math.max(0.004, 0.024 * (1 - (i / (BLADE_ROWS.length - 1)) ** 2))
      const xc = (xl + xr) / 2
      const pts: [number, number, number][] = [
        // [thickness x, width z, u px]
        [0, (xl - 122) * sz, xl + 1.5],
        [t, (xc - 122) * sz, xc],
        [0, (xr - 122) * sz, xr - 1.5],
        [-t, (xc - 122) * sz, xc],
      ]
      for (const k of [ka, kb]) {
        const [x, z, u] = pts[k]
        pos.push(x, y, z)
        uv.push(u / TEX_W, 1 - row / TEX_H)
      }
      if (i > 0) {
        const p = base + (i - 1) * 2
        for (const tri of [[p, p + 2, p + 1], [p + 1, p + 2, p + 3]]) {
          a.fromArray(pos, tri[0] * 3)
          b.fromArray(pos, tri[1] * 3)
          c.fromArray(pos, tri[2] * 3)
          const nx = b.sub(a).cross(c.sub(a)).x
          if (Math.sign(nx) === outward || nx === 0) idx.push(tri[0], tri[1], tri[2])
          else idx.push(tri[0], tri[2], tri[1])
        }
      }
    })
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

function mergeAll(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = []
  const nrm: number[] = []
  const idx: number[] = []
  for (const g of geos) {
    const base = pos.length / 3
    const p = g.getAttribute('position')
    const n = g.getAttribute('normal')
    for (let i = 0; i < p.count; i += 1) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i))
      nrm.push(n.getX(i), n.getY(i), n.getZ(i))
    }
    if (g.index) for (let i = 0; i < g.index.count; i += 1) idx.push(base + g.index.getX(i))
    else for (let i = 0; i < p.count; i += 1) idx.push(base + i)
    g.dispose()
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  out.setIndex(idx)
  return out
}

function buildSword(src: HunterSource | null, mats: THREE.Material[]): { sword: THREE.Group; glow: THREE.MeshStandardMaterial } {
  const authored = src ? buildAuthoredSword(src, mats) : null
  if (authored) return authored
  const sword = new THREE.Group()
  sword.name = 'greatsword'
  const blade = new THREE.MeshStandardMaterial({
    map: src?.texture('tex.greatsword') ?? null,
    emissiveMap: src?.texture('tex.greatsword_glow') ?? null,
    emissive: new THREE.Color('#ff8a2a'),
    emissiveIntensity: 0.3,
    metalness: 0.5,
    roughness: 0.52,
    envMapIntensity: ENV_INTENSITY.armor,
    alphaTest: src ? 0.45 : 0,
    color: src ? '#ffffff' : '#8a9096',
  })
  const brass = new THREE.MeshStandardMaterial({ color: '#8c6a3c', metalness: 0.55, roughness: 0.46, envMapIntensity: ENV_INTENSITY.armor })
  const wrap = src ? triplanarMaterial({ map: src.texture('tex.leather'), tile: 0.09, color: '#b0564a', roughness: 0.8, bump: 1.4, envIntensity: 0.3 }) : new THREE.MeshStandardMaterial({ color: '#5a2a22' })
  mats.push(blade, brass, wrap)
  sword.add(mesh(bladeGeometry(), blade))
  // Grip with raised wrap bands, pommel, crossguard with flared ends and a centre diamond.
  sword.add(mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.5, 14), wrap, 0, -0.14, 0))
  const bands: THREE.BufferGeometry[] = []
  for (let i = 0; i < 9; i += 1) {
    const g = new THREE.TorusGeometry(0.034, 0.006, 6, 16)
    g.rotateX(Math.PI / 2)
    g.rotateZ(0.25)
    g.translate(0, -0.36 + i * 0.055, 0)
    bands.push(g)
  }
  sword.add(mesh(mergeAll(bands), wrap))
  const pommel = mesh(new THREE.SphereGeometry(0.052, 16, 12), brass, 0, -0.43, 0)
  pommel.scale.set(1, 1.25, 1)
  sword.add(pommel)
  sword.add(mesh(new THREE.ConeGeometry(0.03, 0.07, 10).rotateX(Math.PI), brass, 0, -0.5, 0))
  sword.add(mesh(new THREE.BoxGeometry(0.075, 0.07, 0.5), brass, 0, 0.15, 0))
  for (const s of [-1, 1]) {
    const flare = mesh(new THREE.CylinderGeometry(0.02, 0.055, 0.11, 4), brass, 0, 0.16, s * 0.29)
    flare.rotation.x = s * (Math.PI / 2)
    sword.add(flare)
  }
  const diamond = mesh(new THREE.OctahedronGeometry(0.06, 0), brass, 0, 0.16, 0)
  diamond.scale.set(0.9, 1.3, 1)
  sword.add(diamond)
  sword.scale.setScalar(SWORD_SCALE)
  return { sword, glow: blade }
}

/**
 * The sculpted greatsword (generated mesh, `model.greatsword`). The build step leaves it 3 units
 * tall with the tip at y = 0 and the blade width along X; here it is baked into sword space:
 * tip up at y = 2.46, pommel at -0.54, blade width along Z, matching the procedural blade so
 * BLADE hit segments, grip IK and the sheath all stay valid.
 */
function buildAuthoredSword(src: HunterSource, mats: THREE.Material[]): { sword: THREE.Group; glow: THREE.MeshStandardMaterial } | null {
  const gltf = src.gltf('model.greatsword')
  if (!gltf) return null
  let found: THREE.Mesh | null = null
  gltf.scene.updateMatrixWorld(true)
  gltf.scene.traverse(o => {
    if (!found && (o as THREE.Mesh).isMesh) found = o as THREE.Mesh
  })
  const srcMesh = found as THREE.Mesh | null
  if (!srcMesh) return null
  const g = srcMesh.geometry
  const geo = new THREE.BufferGeometry()
  for (const name of ['position', 'normal', 'uv'] as const) {
    const at = g.getAttribute(name) as THREE.BufferAttribute | undefined
    if (!at) continue
    const out = new Float32Array(at.count * at.itemSize)
    for (let i = 0; i < at.count; i += 1) for (let c = 0; c < at.itemSize; c += 1) out[i * at.itemSize + c] = at.getComponent(i, c)
    geo.setAttribute(name, new THREE.BufferAttribute(out, at.itemSize))
  }
  if (g.index) geo.setIndex(new THREE.BufferAttribute(Uint32Array.from(g.index.array as ArrayLike<number>), 1))
  geo.applyMatrix4(srcMesh.matrixWorld)
  // Width X -> Z, then flip tip-up, then lift so the tip lands at the procedural blade's tip.
  geo.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2))
  geo.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI))
  geo.computeBoundingBox()
  const bb = geo.boundingBox!
  geo.translate(-(bb.min.x + bb.max.x) / 2, 2.46 - bb.max.y, -(bb.min.z + bb.max.z) / 2)
  if (!geo.getAttribute('normal')) geo.computeVertexNormals()
  const m = srcMesh.material as THREE.MeshStandardMaterial
  // Forged metal, not a mirror: keep reflections subdued; the charge glow rides the albedo map
  // as a warm ember emissive that idles at zero, so nothing glares until the blade is charged.
  const mat = new THREE.MeshStandardMaterial({
    map: m.map,
    normalMap: m.normalMap,
    roughnessMap: m.roughnessMap,
    metalnessMap: m.metalnessMap,
    metalness: 0.75,
    roughness: 0.85,
    envMapIntensity: ENV_INTENSITY.armor,
    emissive: new THREE.Color('#ff7a26'),
    emissiveMap: m.map,
    emissiveIntensity: 0,
  })
  mat.userData.albedoGlow = true
  mats.push(mat)
  const blade = new THREE.Mesh(geo, mat)
  blade.castShadow = true
  blade.name = 'greatswordMesh'
  const sword = new THREE.Group()
  sword.name = 'greatsword'
  sword.add(blade)
  sword.scale.setScalar(SWORD_SCALE)
  return { sword, glow: mat }
}

/** Push vertices along their normals by hashed noise for a shaggy fur silhouette. */
function shaggy(g: THREE.BufferGeometry, amount: number, seed: number): THREE.BufferGeometry {
  g.computeVertexNormals()
  const p = g.getAttribute('position') as THREE.BufferAttribute
  const n = g.getAttribute('normal') as THREE.BufferAttribute
  const h = (x: number) => {
    const s = Math.sin(x * 127.1 + seed * 311.7) * 43758.5453
    return s - Math.floor(s)
  }
  for (let i = 0; i < p.count; i += 1) {
    const k = (h(p.getX(i) * 91 + p.getZ(i) * 57 + p.getY(i) * 13) * 0.8 + 0.2) * amount
    p.setXYZ(i, p.getX(i) + n.getX(i) * k, p.getY(i) + n.getY(i) * k - k * 0.4, p.getZ(i) + n.getZ(i) * k)
  }
  g.computeVertexNormals()
  return g
}

function buildHook(steel: THREE.Material, brass: THREE.Material): THREE.Group {
  const hook = new THREE.Group()
  hook.add(mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.14, 12).rotateX(Math.PI / 2), brass, 0, 0, -0.02))
  hook.add(mesh(new THREE.ConeGeometry(0.035, 0.12, 12).rotateX(Math.PI / 2), steel, 0, 0, 0.1))
  for (let i = 0; i < 3; i += 1) {
    const ang = (i / 3) * Math.PI * 2
    const curve = new THREE.QuadraticBezierCurve3(V(0, 0, 0.02), V(Math.cos(ang) * 0.1, Math.sin(ang) * 0.1, 0.06), V(Math.cos(ang) * 0.12, Math.sin(ang) * 0.12, -0.06))
    hook.add(mesh(new THREE.TubeGeometry(curve, 8, 0.012, 6), steel))
  }
  hook.visible = false
  return hook
}

/** Tattered cloth alpha: ragged bottom edge, frayed sides and a few moth holes. */
function capeAlpha(): THREE.Texture {
  const W = 128
  const H = 256
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#000'
  let seed = 11
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  g.beginPath()
  g.moveTo(0, H)
  for (let x = 0; x <= W; x += 4) {
    const spike = rnd() < 0.25 ? rnd() * 70 : rnd() * 26
    g.lineTo(x, H - 8 - spike - Math.sin(x * 0.09) * 10)
  }
  g.lineTo(W, H)
  g.closePath()
  g.fill()
  for (let i = 0; i < 9; i += 1) {
    g.beginPath()
    g.ellipse(rnd() * W, H * (0.55 + rnd() * 0.35), 2 + rnd() * 6, 3 + rnd() * 9, rnd() * 3, 0, Math.PI * 2)
    g.fill()
  }
  for (const side of [0, W]) {
    for (let y = H * 0.35; y < H; y += 6) {
      g.fillRect(side === 0 ? 0 : W - 1 - rnd() * 6, y, 1 + rnd() * 6, 3)
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.NoColorSpace
  return t
}

function buildCape(root: THREE.Object3D, anchorBone: THREE.Object3D, src: HunterSource | null, mats: THREE.Material[]): Cape {
  const cols = 7
  const rows = 10
  const restX = 0.34 / (cols - 1)
  const points: ClothPoint[] = []
  const restY: number[] = []
  let seed = 5
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let c = 0; c < cols; c += 1) restY.push(0.098 * (0.82 + rnd() * 0.3))
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = -0.17 + c * restX
      const p = V(x * (1 + r * 0.03), 1.44 - r * restY[c], -0.16 - r * 0.012)
      const pt: ClothPoint = { p: p.clone(), prev: p.clone(), pinned: r === 0 }
      if (r === 0) {
        const a = new THREE.Object3D()
        a.position.copy(p)
        root.add(a)
        anchorBone.attach(a)
        pt.anchor = a
      }
      points.push(pt)
    }
  }
  const geo = new THREE.BufferGeometry()
  const pos = new Float32Array(cols * rows * 3)
  const uv: number[] = []
  const col: number[] = []
  const idx: number[] = []
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      uv.push(c / (cols - 1), 1 - r / (rows - 1))
      const grime = 1 - (r / (rows - 1)) * 0.45
      col.push(grime, grime * 0.96, grime * 0.94)
      if (r < rows - 1 && c < cols - 1) {
        const i = r * cols + c
        idx.push(i, i + cols, i + 1, i + 1, i + cols, i + cols + 1)
      }
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  geo.setIndex(idx)
  const cloth = src?.texture('tex.leather')
  const mat = new THREE.MeshStandardMaterial({
    color: '#b8342a',
    map: cloth ?? null,
    alphaMap: capeAlpha(),
    alphaTest: 0.5,
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.95,
    metalness: 0,
    envMapIntensity: 0.3,
  })
  mats.push(mat)
  const m = new THREE.Mesh(geo, mat)
  m.name = 'cape'
  m.castShadow = true
  m.receiveShadow = true
  m.frustumCulled = false
  m.matrixAutoUpdate = false
  return { mesh: m, cols, rows, points, restY, restX }
}

function fallbackBody(): { body: THREE.Object3D; bones: Record<BoneKey, THREE.Object3D> } {
  const body = new THREE.Group()
  const bones = {} as Record<BoneKey, THREE.Object3D>
  for (const k of Object.keys(REST) as BoneKey[]) {
    const b = new THREE.Bone()
    b.name = BONE_NAMES[k]
    bones[k] = b
  }
  for (const k of Object.keys(REST) as BoneKey[]) {
    const parent = PARENT[k]
    const p = V(...REST[k])
    if (parent) {
      p.sub(V(...REST[parent]))
      bones[parent].add(bones[k])
    } else body.add(bones[k])
    bones[k].position.copy(p)
  }
  const mat = new THREE.MeshStandardMaterial({ color: '#6b4a33', roughness: 0.85 })
  const torso = mesh(new THREE.CapsuleGeometry(0.16, 0.45, 6, 12), mat, 0, 0.1, 0)
  bones.spine2.add(torso)
  return { body, bones }
}

/**
 * Swap the mannequin's geometry for the authored hunter skin. Vertices are brought into the
 * mannequin mesh's bind space through their rendered rest positions, joints are remapped by bone
 * name, and the generated PBR maps are kept (metal/env glare kept modest).
 */
function adoptAuthoredSkin(body: THREE.Object3D, mannGltf: GLTF, skinGltf: GLTF, materials: THREE.Material[], skinned: THREE.SkinnedMesh[]): boolean {
  let target: THREE.SkinnedMesh | undefined
  body.traverse(o => {
    const sm = o as THREE.SkinnedMesh
    if (sm.isSkinnedMesh && (!target || sm.geometry.getAttribute('position').count > target.geometry.getAttribute('position').count)) target = sm
  })
  let srcMesh: THREE.SkinnedMesh | undefined
  skinGltf.scene.traverse(o => {
    if (!srcMesh && (o as THREE.SkinnedMesh).isSkinnedMesh) srcMesh = o as THREE.SkinnedMesh
  })
  let mannRef: THREE.SkinnedMesh | undefined
  mannGltf.scene.traverse(o => {
    const sm = o as THREE.SkinnedMesh
    if (sm.isSkinnedMesh && sm.name === target?.name) mannRef = sm
  })
  if (!target || !srcMesh || !mannRef) return false
  skinGltf.scene.updateMatrixWorld(true)
  mannGltf.scene.updateMatrixWorld(true)
  const g = srcMesh.geometry
  const pos = g.getAttribute('position')
  const nrm = g.getAttribute('normal')
  const uv = g.getAttribute('uv')
  const si = g.getAttribute('skinIndex')
  const sw = g.getAttribute('skinWeight')
  const n = pos.count
  // Rendered rest position of a skinned vertex: sum_k w_k (bone_k.matrixWorld * IBM_k) * bindMatrix * v.
  // Solve for the mannequin-space vertex that renders at the same place under the same joints.
  const boneMats = (m: THREE.SkinnedMesh) => m.skeleton.bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, m.skeleton.boneInverses[i]))
  const srcMats = boneMats(srcMesh)
  const mannMats = boneMats(mannRef)
  const byName = new Map(target.skeleton.bones.map((b, i) => [b.name, i]))
  const mannByName = new Map(mannRef.skeleton.bones.map((b, i) => [b.name, i]))
  const remap = srcMesh.skeleton.bones.map(b => byName.get(b.name) ?? 0)
  const remapRef = srcMesh.skeleton.bones.map(b => mannByName.get(b.name) ?? 0)
  const P = new Float32Array(n * 3)
  const N = new Float32Array(n * 3)
  const SI = new Uint16Array(n * 4)
  const SW = new Float32Array(n * 4)
  const v = new THREE.Vector3()
  const Ms = new THREE.Matrix4()
  const Mm = new THREE.Matrix4()
  const T = new THREE.Matrix4()
  const nm = new THREE.Matrix3()
  const acc = (out: THREE.Matrix4, mats: THREE.Matrix4[], idx: number[], w: number[]) => {
    const e = out.elements
    e.fill(0)
    for (let k = 0; k < 4; k += 1) {
      if (!w[k]) continue
      const f = mats[idx[k]].elements
      for (let c = 0; c < 16; c += 1) e[c] += f[c] * w[k]
    }
    return out
  }
  const js = [0, 0, 0, 0]
  const jm = [0, 0, 0, 0]
  const ws = [0, 0, 0, 0]
  for (let i = 0; i < n; i += 1) {
    let sum = 0
    for (let k = 0; k < 4; k += 1) {
      const j = si.getComponent(i, k)
      js[k] = j
      jm[k] = remapRef[j] ?? 0
      ws[k] = sw.getComponent(i, k)
      sum += ws[k]
    }
    for (let k = 0; k < 4; k += 1) {
      ws[k] /= sum || 1
      SI[i * 4 + k] = remap[js[k]] ?? 0
      SW[i * 4 + k] = ws[k]
    }
    acc(Ms, srcMats, js, ws).multiply(srcMesh.bindMatrix)
    acc(Mm, mannMats, jm, ws).multiply(mannRef.bindMatrix)
    T.copy(Mm).invert().multiply(Ms)
    v.fromBufferAttribute(pos, i).applyMatrix4(T)
    P.set([v.x, v.y, v.z], i * 3)
    if (nrm) {
      v.fromBufferAttribute(nrm, i).applyMatrix3(nm.getNormalMatrix(T)).normalize()
      N.set([v.x, v.y, v.z], i * 3)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3))
  if (nrm) geo.setAttribute('normal', new THREE.BufferAttribute(N, 3))
  else geo.computeVertexNormals()
  if (uv) {
    const U = new Float32Array(n * 2)
    for (let i = 0; i < n; i += 1) U.set([uv.getX(i), uv.getY(i)], i * 2)
    geo.setAttribute('uv', new THREE.BufferAttribute(U, 2))
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4))
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4))
  if (g.index) geo.setIndex(Array.from(g.index.array as ArrayLike<number>))
  geo.computeBoundingSphere()
  const sm = srcMesh.material as THREE.MeshStandardMaterial
  const mat = new THREE.MeshStandardMaterial({
    map: sm.map, normalMap: sm.normalMap, roughnessMap: sm.roughnessMap, metalnessMap: sm.metalnessMap,
    roughness: 1, metalness: 0.75, envMapIntensity: ENV_INTENSITY.armor,
  })
  if (sm.normalScale) mat.normalScale.copy(sm.normalScale)
  mat.name = 'hunterSkin'
  materials.push(mat)
  body.traverse(o => {
    const s = o as THREE.SkinnedMesh
    if (s.isSkinnedMesh && s !== target) s.visible = false
  })
  target.geometry = geo
  target.material = mat
  target.castShadow = true
  target.receiveShadow = true
  target.frustumCulled = false
  skinned.push(target)
  return true
}

export function buildHunter(): HunterModel {
  const src = source
  const materials: THREE.Material[] = []
  const root = new THREE.Group()
  root.name = 'hunter'
  const pivot = new THREE.Group()
  pivot.position.y = 0.95
  root.add(pivot)
  const inner = new THREE.Group()
  inner.position.y = -0.95
  pivot.add(inner)

  const gltf = src?.gltf('model.hunter')
  let body: THREE.Object3D
  let bones: Record<BoneKey, THREE.Object3D>
  const skinned: THREE.SkinnedMesh[] = []
  const clips = new Map<ClipName, THREE.AnimationClip>()
  if (gltf) {
    body = cloneSkinned(gltf.scene)
    bones = {} as Record<BoneKey, THREE.Object3D>
    for (const k of Object.keys(BONE_NAMES) as BoneKey[]) bones[k] = body.getObjectByName(BONE_NAMES[k]) ?? new THREE.Object3D()
    for (const clip of gltf.animations) if ((CLIP_NAMES as readonly string[]).includes(clip.name)) clips.set(clip.name as ClipName, clip)
  } else {
    const fb = fallbackBody()
    body = fb.body
    bones = fb.bones
  }
  inner.add(body)
  root.updateMatrixWorld(true)

  // ─── materials ────────────────────────────────────────────────────────
  const leatherTex = src?.texture('tex.leather')
  const rockTex = src?.texture('tex.rock_face1_d')
  const tri = (map: THREE.Texture | undefined, o: { tile: number; color: string; roughness: number; bump?: number; skinned?: boolean; env?: number }) => {
    const m = map ? triplanarMaterial({ map, tile: o.tile, color: o.color, roughness: o.roughness, bump: o.bump ?? 1.2, skinned: o.skinned, envIntensity: o.env ?? 0.35 }) : new THREE.MeshStandardMaterial({ color: o.color, roughness: o.roughness })
    materials.push(m)
    return m
  }
  const outfit = tri(leatherTex, { tile: 0.22, color: '#ffffff', roughness: 0.82, bump: 1.3, skinned: true })
  outfit.vertexColors = true
  const joints = tri(leatherTex, { tile: 0.12, color: '#ffffff', roughness: 0.78, bump: 1.6, skinned: true })
  joints.vertexColors = true
  const coat = tri(leatherTex, { tile: 0.22, color: '#b98a60', roughness: 0.8, bump: 1.3 })
  const strap = tri(leatherTex, { tile: 0.1, color: '#7a5a40', roughness: 0.82, bump: 1.2 })
  const fur = tri(leatherTex, { tile: 0.035, color: '#b9ada0', roughness: 1, bump: 3.2, env: 0.2 })
  const iron = tri(rockTex, { tile: 0.28, color: '#7b7f84', roughness: 0.5, bump: 0.9, env: ENV_INTENSITY.armor })
  iron.metalness = 0.55
  const ironShell = tri(rockTex, { tile: 0.28, color: '#7b7f84', roughness: 0.5, bump: 0.9, env: ENV_INTENSITY.armor })
  ironShell.metalness = 0.55
  ironShell.side = THREE.DoubleSide
  const brass = new THREE.MeshStandardMaterial({ color: '#8c6a3c', metalness: 0.55, roughness: 0.45, envMapIntensity: ENV_INTENSITY.armor })
  const teal = new THREE.MeshStandardMaterial({ color: '#2f8f89', metalness: 0.45, roughness: 0.4, emissive: new THREE.Color('#1b5c58'), emissiveIntensity: 0.35, envMapIntensity: 0.4 })
  const glassRed = new THREE.MeshStandardMaterial({ color: '#9a2020', roughness: 0.18, emissive: new THREE.Color('#5a0c0c'), emissiveIntensity: 0.35, envMapIntensity: 0.6 })
  const glassGreen = new THREE.MeshStandardMaterial({ color: '#2f8a3a', roughness: 0.18, emissive: new THREE.Color('#0d4015'), emissiveIntensity: 0.35, envMapIntensity: 0.6 })
  const cork = new THREE.MeshStandardMaterial({ color: '#8a6a48', roughness: 0.9 })
  materials.push(brass, teal, glassRed, glassGreen, cork)

  // Zone the mannequin by bind-pose position: skin, sleeves, coat, trousers, gloves and boots.
  const zone = (p: THREE.Vector3, out: THREE.Color) => {
    const ax = Math.abs(p.x)
    if (p.y > 1.5 && ax < 0.13) out.set('#e7ae8e')
    else if (ax > 0.64) out.set('#5a4030')
    else if (ax > 0.2 && p.y > 1.3) out.set('#94643f')
    else if (p.y > 0.74) out.set('#a2704a')
    else if (p.y > 0.2) out.set('#57514b')
    else out.set('#6a4a32')
    out.multiplyScalar(1.45)
  }
  const tmp = new THREE.Vector3()
  const colr = new THREE.Color()
  // Authored skin: the generated armoured hunter, weight-transferred onto this exact skeleton
  // (scripts/assets/bind_hunter.py). Its geometry replaces the mannequin's; clips are untouched.
  const skinSrc = gltf ? src?.gltf('model.hunterSkin') : undefined
  const authored = !!(gltf && skinSrc && adoptAuthoredSkin(body, gltf, skinSrc, materials, skinned))
  if (!authored) body.traverse(o => {
    const sm = o as THREE.SkinnedMesh
    if (!sm.isSkinnedMesh) return
    const isJoint = /joint/i.test((sm.material as THREE.Material).name)
    const posAttr = sm.geometry.getAttribute('position')
    const colors = new Float32Array(posAttr.count * 3)
    for (let i = 0; i < posAttr.count; i += 1) {
      tmp.fromBufferAttribute(posAttr, i).applyMatrix4(sm.matrixWorld)
      zone(tmp, colr)
      if (isJoint) colr.multiplyScalar(0.62)
      colors.set([colr.r, colr.g, colr.b], i * 3)
    }
    sm.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    sm.material = isJoint ? joints : outfit
    sm.castShadow = true
    sm.receiveShadow = true
    sm.frustumCulled = false
    skinned.push(sm)
  })

  const att = (bone: BoneKey, o: THREE.Object3D) => {
    root.add(o)
    o.updateMatrixWorld(true)
    bones[bone].attach(o)
    return o
  }
  const put = (bone: BoneKey, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = true) => att(bone, mesh(geo, mat, x, y, z, shadow)) as THREE.Mesh
  if (!authored) {
  // ─── armour kit (authored in bind-pose model space, then attached to bones) ─
  // Helmet: dome, brass rim and crest, nasal guard, cheek/neck guard.
  const helmS = (g: THREE.BufferGeometry) => g.scale(0.93, 1, 1.08)
  put('head', helmS(new THREE.SphereGeometry(0.148, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.56)), iron, 0, 1.66, 0.005)
  put('head', helmS(new THREE.TorusGeometry(0.145, 0.011, 8, 40).rotateX(Math.PI / 2)), brass, 0, 1.632, 0.005)
  put('head', new THREE.TorusGeometry(0.149, 0.008, 6, 28, Math.PI).rotateY(Math.PI / 2).scale(1, 1, 1.08), brass, 0, 1.66, 0.005)
  put('head', new THREE.BoxGeometry(0.022, 0.1, 0.014), brass, 0, 1.59, 0.162)
  put('head', helmS(new THREE.CylinderGeometry(0.146, 0.13, 0.13, 24, 1, true, 0.8, Math.PI * 2 - 1.6)), ironShell, 0, 1.57, 0.005)
  // Fur collar with a ragged fringe.
  put('spine3', shaggy(new THREE.TorusGeometry(0.135, 0.05, 18, 56).rotateX(Math.PI / 2).scale(1.18, 1, 0.98), 0.022, 7), fur, 0, 1.465, -0.02)
  put('spine3', shaggy(new THREE.TorusGeometry(0.16, 0.032, 14, 56).rotateX(Math.PI / 2).scale(1.15, 1, 0.95), 0.026, 13), fur, 0, 1.43, -0.025)
  // Pauldrons: layered iron caps and lames with brass rims.
  for (const s of [-1, 1] as const) {
    const bone: BoneKey = s > 0 ? 'upperL' : 'upperR'
    const tilt = -s * 0.85
    put(bone, new THREE.SphereGeometry(0.118, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1, 0.85, 1.25).rotateZ(tilt), iron, s * 0.235, 1.475, -0.065)
    put(bone, new THREE.TorusGeometry(0.118, 0.008, 6, 32).rotateX(Math.PI / 2).scale(1, 1, 1.25).rotateZ(tilt), brass, s * 0.235, 1.475, -0.065)
    put(bone, new THREE.CylinderGeometry(0.088, 0.084, 0.07, 20, 1, true, -0.4, Math.PI + 0.8).rotateZ(Math.PI / 2), ironShell, s * 0.305, 1.45, -0.065)
    put(bone, new THREE.CylinderGeometry(0.08, 0.076, 0.065, 20, 1, true, -0.4, Math.PI + 0.8).rotateZ(Math.PI / 2), ironShell, s * 0.36, 1.445, -0.065)
    // Bracers.
    const fore: BoneKey = s > 0 ? 'lowerL' : 'lowerR'
    put(fore, new THREE.CylinderGeometry(0.052, 0.046, 0.17, 16).rotateZ(Math.PI / 2), strap, s * 0.6, 1.441, -0.068)
    for (const dx of [0.52, 0.68]) put(fore, new THREE.TorusGeometry(0.05, 0.007, 6, 18).rotateY(Math.PI / 2), brass, s * dx, 1.441, -0.068)
    // Tassets and leg armour.
    const thigh: BoneKey = s > 0 ? 'thighL' : 'thighR'
    const calf: BoneKey = s > 0 ? 'calfL' : 'calfR'
    const front = put(thigh, new THREE.BoxGeometry(0.15, 0.3, 0.014), coat, s * 0.1, 0.8, 0.105)
    front.rotation.x = -0.12
    const back = put(thigh, new THREE.BoxGeometry(0.16, 0.32, 0.014), coat, s * 0.1, 0.79, -0.135)
    back.rotation.x = 0.12
    const side = put(thigh, new THREE.BoxGeometry(0.014, 0.28, 0.17), coat, s * 0.17, 0.81, -0.015)
    side.rotation.z = s * 0.12
    put(calf, new THREE.SphereGeometry(0.058, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), iron, s * 0.089, 0.54, 0.052)
    put(calf, new THREE.TorusGeometry(0.058, 0.006, 6, 20), brass, s * 0.089, 0.54, 0.052)
    put(calf, new THREE.CylinderGeometry(0.068, 0.058, 0.3, 18, 1, true, -1.3, 2.6), ironShell, s * 0.089, 0.33, 0.004)
    put(calf, new THREE.TorusGeometry(0.068, 0.014, 8, 20).rotateX(Math.PI / 2), strap, s * 0.089, 0.19, -0.005)
  }
  // Belt, buckle, pouches and potion vials.
  put('pelvis', new THREE.TorusGeometry(0.168, 0.024, 8, 36).rotateX(Math.PI / 2).scale(1, 1, 0.8), strap, 0, 0.99, -0.02)
  put('pelvis', new THREE.BoxGeometry(0.07, 0.055, 0.02), brass, 0, 0.99, 0.118)
  for (const [x, z, ry] of [[0.14, 0.07, 0.6], [-0.165, 0.0, -1.3], [0.11, -0.12, 2.4]] as const) {
    const p = put('pelvis', new THREE.BoxGeometry(0.075, 0.085, 0.05), strap, x, 0.95, z)
    p.rotation.y = ry
  }
  ;[[-0.06, glassRed], [-0.092, glassGreen], [-0.122, glassRed]].forEach(([x, glass]) => {
    const xx = x as number
    const zz = 0.118 - Math.max(0, -xx - 0.06) * 0.6
    put('pelvis', new THREE.CylinderGeometry(0.014, 0.014, 0.07, 10), glass as THREE.Material, xx, 0.94, zz)
    put('pelvis', new THREE.CylinderGeometry(0.009, 0.009, 0.02, 8), cork, xx, 0.985, zz)
  })
  // Sword harness across the chest and back.
  const chestStrap = put('spine3', new THREE.BoxGeometry(0.045, 0.62, 0.012), strap, 0.0, 1.22, 0.128)
  chestStrap.rotation.z = -0.55
  const backStrap = put('spine3', new THREE.BoxGeometry(0.045, 0.62, 0.012), strap, 0.0, 1.24, -0.15)
  backStrap.rotation.z = 0.55
  put('spine3', new THREE.TorusGeometry(0.026, 0.007, 6, 16), brass, -0.02, 1.26, 0.136)
  }
  // Grapple launcher on the left forearm (aims along the arm toward the hand).
  put('lowerL', new THREE.CylinderGeometry(0.034, 0.034, 0.19, 14).rotateZ(Math.PI / 2), brass, 0.6, 1.5, -0.068)
  for (let i = 0; i < 6; i += 1) put('lowerL', new THREE.TorusGeometry(0.038, 0.007, 6, 16).rotateY(Math.PI / 2), teal, 0.545 + i * 0.022, 1.5, -0.068)
  put('lowerL', new THREE.CylinderGeometry(0.014, 0.014, 0.12, 10).rotateZ(Math.PI / 2), iron, 0.72, 1.5, -0.068)
  const launcher = new THREE.Object3D()
  launcher.name = 'launcher'
  launcher.position.set(0.78, 1.5, -0.068)
  att('lowerL', launcher)

  // ─── cape, sheath, sword, hook, rope ──────────────────────────────────
  const cape = buildCape(root, bones.spine3, src, materials)
  root.add(cape.mesh)
  // The generated hunter wears a fur mantle and tabard instead of the cloth cape.
  cape.mesh.visible = !authored
  const { sword, glow } = buildSword(src, materials)
  root.add(sword)
  const dir = V(0.5, -0.84, -0.2).normalize()
  const edge = V(-dir.y, dir.x, 0).normalize()
  const xAxis = new THREE.Vector3().crossVectors(dir, edge)
  const sheathWorld = new THREE.Matrix4().makeBasis(xAxis, dir, edge).setPosition(-0.24, 1.72, -0.21).scale(V(SWORD_SCALE, SWORD_SCALE, SWORD_SCALE))
  const sheath = new THREE.Matrix4().copy(bones.spine3.matrixWorld).invert().multiply(sheathWorld)
  const hook = buildHook(iron, brass)
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 6, 1, true).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: '#b8a47e', roughness: 0.92, map: leatherTex ?? null }))
  materials.push(rope.material as THREE.Material)
  rope.visible = false
  rope.frustumCulled = false
  rope.castShadow = true

  const handRest = { R: bones.handR.getWorldQuaternion(new THREE.Quaternion()), L: bones.handL.getWorldQuaternion(new THREE.Quaternion()) }
  return { root, pivot, body, skinned, bones, handRest, clips, sheath, sword, swordGlow: glow, launcher, hook, rope, cape, materials }
}
