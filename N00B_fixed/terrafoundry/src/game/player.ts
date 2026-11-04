import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { Input } from '../engine/input'
import { makePieceObject } from './building'
import { TEX, WU } from './materials'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { CONFIG, SEA_LEVEL } from './config'
import type { ItemId } from './items'
import { ITEMS } from './items'
import type { Body, WorldPhysics } from './physics'
import { fallDamage, spendStamina, type GameMode, type Stats } from './survival'
import { tuning } from './tuning'

export type MoveEvents = { jumped: boolean; landed: number | null; fallDamage: number; step: boolean; splash: boolean }

const SKIN = new THREE.MeshStandardMaterial({ color: 0xc69a74, roughness: 0.75 })
const SLEEVE = new THREE.MeshStandardMaterial({ color: 0x55604a, roughness: 0.9 })
const CUFF = new THREE.MeshStandardMaterial({ color: 0x3f4636, roughness: 0.95 })
const HANDLE = new THREE.MeshStandardMaterial({ color: 0xb89470, map: TEX.planksAlb, normalMap: TEX.planksNor, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.78, metalness: 0 })
const BARK = new THREE.MeshStandardMaterial({ color: 0xc2ab94, map: TEX.barkAlb, normalMap: TEX.barkNor, roughness: 0.92, metalness: 0 })
const ENDGRAIN = new THREE.MeshStandardMaterial({ color: 0xd9b98a, map: TEX.planksAlb, roughness: 0.85, metalness: 0 })
const BONE = new THREE.MeshStandardMaterial({ color: 0xe8dcc4, roughness: 0.6, metalness: 0 })
const WRAP = new THREE.MeshStandardMaterial({ color: 0x6d5a3e, roughness: 0.95, metalness: 0 })
/** Knapped flint/stone: bound to the loaded PBR stone set when a held model is built. */
const STONE = new THREE.MeshStandardMaterial({ color: 0xb4ada2, roughness: 0.86, metalness: 0 })
function bindStone(): void {
  const a = WU.tStoneAlb.value as THREE.Texture
  const n = WU.tStoneNor.value as THREE.Texture
  if (STONE.map !== a) {
    STONE.map = a
    STONE.normalMap = n
    STONE.normalScale.set(1.1, 1.1)
    STONE.needsUpdate = true
  }
}
const CRYSTAL = new THREE.MeshStandardMaterial({ color: 0x86d6cb, emissive: 0x2f9e92, emissiveIntensity: 0.18, roughness: 0.42, metalness: 0, transparent: true, opacity: 0.94 })
const STRING = new THREE.MeshStandardMaterial({ color: 0x9c8f76, roughness: 0.9 })
const FLETCH_GEO = new THREE.PlaneGeometry(1, 1)
/** Arrows: pale birch shaft, soft coral fletching (STYLE.md accent) so they read against foliage. */
const SHAFT = new THREE.MeshStandardMaterial({ color: 0xe2cda4, roughness: 0.72, metalness: 0 })
const FLETCH_ARROW = new THREE.MeshStandardMaterial({ color: 0xef8a6a, roughness: 0.9, metalness: 0, side: THREE.DoubleSide })
const NOCK = new THREE.MeshStandardMaterial({ color: 0x4fb8ae, roughness: 0.8, metalness: 0 })

function vm(g: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0): THREE.Mesh {
  const o = new THREE.Mesh(g, mat)
  o.position.set(x, y, z)
  o.scale.set(sx, sy, sz)
  o.rotation.set(rx, ry, rz)
  return o
}

const CYL = new THREE.CylinderGeometry(1, 1, 1, 12)
const BOX = new RoundedBoxGeometry(1, 1, 1, 2, 0.18)
const ICO = lumpy(3, 0.08, 4.1, 0)
const LOG = (() => {
  const g = new THREE.CylinderGeometry(1, 1.06, 1, 18, 3, true)
  const pos = g.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getZ(i), pos.getX(i))
    const r = 1 + Math.sin(a * 7 + pos.getY(i) * 3) * 0.035
    pos.setXYZ(i, pos.getX(i) * r, pos.getY(i), pos.getZ(i) * r)
  }
  g.computeVertexNormals()
  return g
})()
const DISC = new THREE.CircleGeometry(1, 18)
const SPH = new THREE.SphereGeometry(1, 16, 12)
const PRISM = new THREE.CylinderGeometry(0.7, 1, 1, 6)
// Knapped stone head: a squashed, slightly lumpy dodecahedron.
const KNAP = lumpy(2, 0.07, 9.1, 0.35)
/** Rounded river-stone: smooth, gently lumpy, with shallow conchoidal flakes. */
const PEBBLE = lumpy(4, 0.1, 3.3, 0.12)
function lumpy(detail: number, amp: number, freq: number, flake: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail)
  const pos = g.getAttribute('position')
  const uv: number[] = []
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const n = 1 + Math.sin(x * freq + y * 5.3) * amp + Math.cos(z * freq * 0.8 + x * 2.1) * amp * 0.8
    // Flake scallops: quantize a direction field into shallow dished facets.
    const f = flake * Math.abs(Math.sin(x * 4.7 + z * 3.1) * Math.cos(y * 5.9 - x * 1.3))
    const k = n - f * 0.35
    pos.setXYZ(i, x * k, y * k, z * k)
    uv.push(Math.atan2(z, x) / (Math.PI * 2) + 0.5, y * 0.5 + 0.5)
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.deleteAttribute('normal')
  const m = mergeVertices(g, 1e-4)
  m.computeVertexNormals()
  return m
}
const BOW_R = 0.42
const BOW_HALF = Math.PI * 0.3
const BOW_TIP_Y = BOW_R * Math.sin(BOW_HALF)
const BOW_TIP_Z = BOW_R - BOW_R * Math.cos(BOW_HALF)
/** How far the string travels toward the eye at full draw (bow-space metres). */
const BOW_PULL = 0.22
// Limb arc in the YZ plane: grip at the origin, tips curving back toward the eye; tapered.
const BOW_LIMB = (() => {
  const g = new THREE.TorusGeometry(BOW_R, 0.012, 8, 40, BOW_HALF * 2)
  g.rotateZ(-BOW_HALF)
  g.rotateY(Math.PI / 2)
  g.translate(0, 0, BOW_R)
  const pos = g.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    const a = Math.asin(Math.max(-1, Math.min(1, y / BOW_R)))
    const k = 1 - 0.45 * Math.abs(a / BOW_HALF)
    const cy = BOW_R * Math.sin(a)
    const cz = BOW_R - BOW_R * Math.cos(a)
    pos.setXYZ(i, pos.getX(i) * k, cy + (y - cy) * k, cz + (pos.getZ(i) - cz) * k)
  }
  g.computeVertexNormals()
  return g
})()
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)
/** Poses the two string segments from each tip to the nock point pulled back by `d` (0..1). */
export function poseBowString(g: THREE.Object3D, d: number, arrow = d > 0.02, slide = 0): void {
  const nockZ = BOW_TIP_Z + d * BOW_PULL
  for (const [name, sgn] of [['stringTop', 1], ['stringBot', -1]] as const) {
    const s = g.getObjectByName(name)
    if (!s) continue
    _a.set(0, sgn * BOW_TIP_Y, BOW_TIP_Z)
    _b.set(0, 0, nockZ)
    s.position.copy(_a).add(_b).multiplyScalar(0.5)
    const len = _a.distanceTo(_b)
    s.scale.set(0.0028, len, 0.0028)
    s.quaternion.setFromUnitVectors(_up, _b.sub(_a).normalize())
  }
  const nocked = g.getObjectByName('nocked')
  if (nocked) {
    nocked.visible = arrow
    // `slide` eases a freshly nocked arrow in from behind the string.
    nocked.position.set(0.012, 0, Math.max(nockZ, BOW_TIP_Z) + slide * 0.16)
  }
}

/** A small 3D model of the held item, in hand-space (origin at the grip, +Y along the handle). */
export function heldModel(id: ItemId | null): THREE.Group {
  const g = new THREE.Group()
  if (!id) return g
  bindStone()
  const def = ITEMS[id]
  if (id === 'bow') {
    // Upright bow in its own mount space: grip at the origin, limbs arc away (-Z) and the tips
    // come back toward the eye; the string runs tip -> nock -> tip and is re-posed every frame.
    g.add(new THREE.Mesh(BOW_LIMB, HANDLE))
    g.add(vm(CYL, WRAP, 0, 0, 0, 0.022, 0.13, 0.022))
    for (const sgn of [1, -1]) {
      g.add(vm(SPH, WRAP, 0, sgn * BOW_TIP_Y, BOW_TIP_Z, 0.013))
      const str = vm(CYL, STRING, 0, 0, 0, 0.0028, 1, 0.0028)
      str.name = sgn > 0 ? 'stringTop' : 'stringBot'
      g.add(str)
    }
    const nocked = new THREE.Group()
    nocked.name = 'nocked'
    nocked.add(vm(CYL, SHAFT, 0, 0, -0.38, 0.0085, 0.8, 0.0085, Math.PI / 2, 0, 0))
    nocked.add(vm(CYL, NOCK, 0, 0, 0.0, 0.011, 0.025, 0.011, Math.PI / 2, 0, 0))
    nocked.add(vm(PRISM, STONE, 0, 0, -0.8, 0.02, 0.06, 0.009, -Math.PI / 2, 0, 0))
    for (let i = 0; i < 3; i++) {
      const f = vm(FLETCH_GEO, FLETCH_ARROW, 0, 0, -0.07, 0.026, 0.1, 1, 0, 0, 0)
      f.rotation.set(Math.PI / 2, 0, (i * Math.PI * 2) / 3)
      nocked.add(f)
    }
    nocked.visible = false
    g.add(nocked)
    poseBowString(g, 0)
    return g
  }
  if (id === 'arrow') {
    g.add(vm(CYL, SHAFT, 0, 0.18, 0, 0.0085, 0.5, 0.0085))
    g.add(vm(PRISM, STONE, 0, 0.45, 0, 0.02, 0.055, 0.009))
    g.add(vm(CYL, NOCK, 0, -0.07, 0, 0.011, 0.025, 0.011))
    for (let i = 0; i < 3; i++) g.add(vm(FLETCH_GEO, FLETCH_ARROW, 0, -0.03, 0, 0.032, 0.085, 1, 0, (i * Math.PI * 2) / 3, 0))
    g.rotation.set(-0.35, 0, 0)
    return g
  }
  if (def.tool) {
    const head = def.tool.tier === 2 ? CRYSTAL : STONE
    g.add(vm(CYL, HANDLE, 0, 0.16, 0, 0.017, 0.46, 0.017))
    g.add(vm(CYL, WRAP, 0, 0.32, 0, 0.021, 0.06, 0.021))
    switch (def.tool.kind) {
      case 'axe':
        // Wedge head lashed through the haft with a fibre binding.
        g.add(vm(def.tool.tier === 2 ? PRISM : KNAP, head, 0.06, 0.36, 0, 0.08, 0.066, 0.02, 0, 0, def.tool.tier === 2 ? Math.PI / 2 : -0.08))
        g.add(vm(CYL, WRAP, 0.012, 0.36, 0, 0.024, 0.05, 0.024, 0, 0, 0.5))
        break
      case 'pickaxe':
        g.add(vm(KNAP, head, 0.08, 0.38, 0, 0.12, 0.028, 0.026, 0, 0, -0.18))
        g.add(vm(KNAP, head, -0.08, 0.38, 0, 0.12, 0.028, 0.026, 0, 0, 0.18))
        break
      case 'shovel':
        g.add(vm(SPH, head, 0, 0.45, 0, 0.065, 0.095, 0.016))
        break
      case 'weapon':
        if (def.tool.tier === 2) g.add(vm(PRISM, head, 0, 0.52, 0, 0.028, 0.42, 0.01))
        else g.add(vm(KNAP, head, 0, 0.45, 0, 0.028, 0.08, 0.014))
        break
    }
    g.rotation.set(-0.35, 0, 0)
    return g
  }
  if (def.place && def.place !== 'soil') {
    const obj = makePieceObject(def.place, 5)
    const box = new THREE.Box3().setFromObject(obj)
    const size = box.getSize(new THREE.Vector3())
    const s = 0.13 / Math.max(size.x, size.y, size.z)
    obj.scale.setScalar(s)
    obj.position.set(0, 0.06, -0.03)
    obj.traverse(o => (o.castShadow = false))
    g.add(obj)
    return g
  }
  const c = (hex: number) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.85, metalness: 0 })
  switch (id) {
    case 'wood': {
      // A short split log: bark sleeve, pale end grain and a snapped branch nub.
      const log = new THREE.Group()
      log.add(vm(LOG, BARK, 0, 0, 0, 0.055, 0.22, 0.055))
      log.add(vm(DISC, ENDGRAIN, 0, 0.11, 0, 0.056, 0.056, 0.056, -Math.PI / 2))
      log.add(vm(DISC, ENDGRAIN, 0, -0.11, 0, 0.058, 0.058, 0.058, Math.PI / 2))
      log.add(vm(CYL, BARK, 0.05, 0.03, 0, 0.012, 0.05, 0.012, 0, 0, -1.1))
      log.rotation.set(0, 0.3, 1.25)
      log.position.y = 0.06
      g.add(log)
      break
    }
    case 'planks':
      g.add(vm(BOX, HANDLE, 0, 0.05, 0, 0.21, 0.022, 0.07, 0, 0.05, 0))
      g.add(vm(BOX, HANDLE, 0.01, 0.075, 0.004, 0.2, 0.022, 0.066, 0, -0.08, 0))
      break
    case 'stone': g.add(vm(PEBBLE, STONE, 0, 0.065, 0, 0.066, 0.052, 0.06, 0.3, 0.5, 0.1)); break
    case 'soil': g.add(vm(PEBBLE, c(0x5e4630), 0, 0.06, 0, 0.066, 0.05, 0.066)); break
    case 'crystal':
      g.add(vm(PRISM, CRYSTAL, 0, 0.085, 0, 0.03, 0.14, 0.03))
      g.add(vm(PRISM, CRYSTAL, 0.028, 0.06, 0.01, 0.018, 0.08, 0.018, 0, 0, -0.5))
      g.add(vm(PRISM, CRYSTAL, -0.024, 0.055, -0.008, 0.015, 0.065, 0.015, 0, 0, 0.55))
      g.add(vm(PEBBLE, STONE, 0, 0.02, 0, 0.04, 0.022, 0.035))
      break
    case 'fiber': {
      // A tied bundle of long grass blades that splay at both ends.
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2
        const tone = i % 3 === 0 ? 0xb6bb62 : i % 3 === 1 ? 0x93a04a : 0xc9c27a
        g.add(vm(CYL, c(tone), Math.cos(a) * 0.008, 0.08, Math.sin(a) * 0.008, 0.0035, 0.22, 0.006, Math.sin(a) * 0.12, 0, Math.cos(a) * 0.12))
      }
      g.add(vm(CYL, WRAP, 0, 0.08, 0, 0.016, 0.018, 0.016))
      g.rotation.z = 0.6
      break
    }
    case 'berries': {
      const berry = new THREE.MeshStandardMaterial({ color: 0x8e1d34, roughness: 0.32, metalness: 0 })
      const pts = [[0, 0.05, 0], [0.03, 0.045, 0.012], [-0.028, 0.048, 0.01], [0.012, 0.075, -0.004], [-0.012, 0.07, 0.02], [0.006, 0.046, -0.028]]
      for (const [x, y, z] of pts) g.add(vm(SPH, berry, x, y, z, 0.021))
      g.add(vm(SPH, c(0x3f6b2c), 0.0, 0.092, 0, 0.034, 0.006, 0.02, 0.3, 0.4, 0))
      break
    }
    case 'raw_meat': case 'cooked_meat': case 'skewer': {
      const raw = id === 'raw_meat'
      const meat = new THREE.MeshStandardMaterial({ color: raw ? 0xa9474f : 0x7a3f22, roughness: raw ? 0.48 : 0.72, metalness: 0 })
      if (id === 'skewer') {
        g.add(vm(CYL, HANDLE, 0, 0.1, 0, 0.005, 0.32, 0.005))
        for (let i = 0; i < 3; i++) g.add(vm(ICO, meat, 0, 0.1 + i * 0.05, 0, 0.026, 0.022, 0.026, i, i * 2, 0))
      } else {
        g.add(vm(ICO, meat, 0, 0.07, 0, 0.062, 0.045, 0.085))
        g.add(vm(CYL, BONE, 0, 0.07, -0.085, 0.011, 0.07, 0.011, Math.PI / 2, 0, 0))
        g.add(vm(SPH, BONE, 0, 0.07, -0.122, 0.018))
      }
      break
    }
    case 'bandage':
      g.add(vm(CYL, c(0xebe1cc), 0, 0.06, 0, 0.038, 0.07, 0.038, 0, 0, Math.PI / 2))
      g.add(vm(BOX, c(0xe2d6bd), 0.02, 0.022, 0.03, 0.06, 0.004, 0.05, 0.1, 0.4, 0))
      break
    default: g.add(vm(PEBBLE, STONE, 0, 0.06, 0, 0.05))
  }
  // Loose materials and food sit small in the palm.
  g.scale.setScalar(0.44)
  g.position.set(0, 0.02, -0.015)
  return g
}

/**
 * Hand frames for the bow in bow-mount space. `palm` is the wrist-space offset from the wrist bone
 * to the centre of the closed fist; `x`/`y` are where the wrist's X (fist axis) and Y (fingers)
 * should point, expressed in bow space (+Y up the grip, -Z toward the target).
 */
export const BOW_HAND = {
  left: { x: new THREE.Vector3(0, -1, 0), y: new THREE.Vector3(1, 0, -0.35), palm: new THREE.Vector3(0.0, 0.07, 0.025) },
  right: { x: new THREE.Vector3(0, 1, 0), y: new THREE.Vector3(-0.25, 0, -1), palm: new THREE.Vector3(0.0, 0.075, 0.02) },
}
const _q0 = new THREE.Quaternion()
const _q1 = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()
const _q3 = new THREE.Quaternion()
const _q4 = new THREE.Quaternion()
const _t0 = new THREE.Vector3()
const _t1 = new THREE.Vector3()
const _t2 = new THREE.Vector3()
const _t3 = new THREE.Vector3()
const _t4 = new THREE.Vector3()
const _t5 = new THREE.Vector3()
const _t6 = new THREE.Vector3()
const _m = new THREE.Matrix4()
/** World quaternion for a wrist whose X/Y axes point along the given bow-space directions. */
function basis(out: THREE.Quaternion, h: { x: THREE.Vector3; y: THREE.Vector3 }, mountQ: THREE.Quaternion): THREE.Quaternion {
  const x = _t5.copy(h.x).normalize()
  const y = _t6.copy(h.y).addScaledVector(x, -h.y.dot(x)).normalize()
  const z = new THREE.Vector3().crossVectors(x, y)
  _m.makeBasis(x, y, z)
  return out.setFromRotationMatrix(_m).premultiply(mountQ)
}
/**
 * Aims a forearm bone from `elbow` toward `target`, slides it so the fist centre lands on the
 * target, then sets the wrist's world orientation. `k` blends from the animated pose.
 */
function solveForearm(lower: THREE.Object3D, wrist: THREE.Object3D, target: THREE.Vector3, elbow: THREE.Vector3, wristQ: THREE.Quaternion, k: number): void {
  const parent = lower.parent
  if (!parent) return
  const palm = wrist.name.endsWith('L') ? BOW_HAND.left.palm : BOW_HAND.right.palm
  // Where the wrist bone must sit so the fist centre is on the target.
  const wristTarget = new THREE.Vector3().copy(palm).applyQuaternion(wristQ).negate().add(target)
  lower.updateWorldMatrix(true, true)
  const lp = lower.getWorldPosition(new THREE.Vector3())
  const wp = wrist.getWorldPosition(new THREE.Vector3())
  const cur = wp.clone().sub(lp).normalize()
  const want = wristTarget.clone().sub(elbow).normalize()
  const rot = _q3.setFromUnitVectors(cur, want)
  const lowerWQ = lower.getWorldQuaternion(new THREE.Quaternion())
  const parentWQ = parent.getWorldQuaternion(_q4)
  const newLocal = parentWQ.clone().invert().multiply(rot.multiply(lowerWQ))
  lower.quaternion.slerp(newLocal, k)
  lower.updateWorldMatrix(false, true)
  const wp2 = wrist.getWorldPosition(new THREE.Vector3())
  const lw = lower.getWorldPosition(new THREE.Vector3()).add(wristTarget.sub(wp2).multiplyScalar(k))
  lower.position.copy(parent.worldToLocal(lw))
  lower.updateWorldMatrix(false, true)
  const wpq = wrist.parent!.getWorldQuaternion(new THREE.Quaternion())
  wrist.quaternion.slerp(wpq.invert().multiply(wristQ), k)
  wrist.updateWorldMatrix(false, true)
}

/** Grip offset of held items relative to the rig's right wrist bone (tuned in the model lab). */
export const GRIP = { pos: new THREE.Vector3(0.0, 0.085, 0.02), rot: new THREE.Euler(0.2, 0, -1.45), scale: 1 }
/** Placement of the arms rig in camera space. */
export const RIG = { pos: new THREE.Vector3(0, 0.02, 0.04), scale: 1 }

type RigClip = 'Idle' | 'Walk' | 'Sprint' | 'SwordIdle' | 'SwordWalk' | 'SwordSprint' | 'Punch' | 'PunchLeft' | 'SwordSlashRight' | 'SwordSlashLeft' | 'SwordOverhead' | 'SwordThrust' | 'Grab' | 'Inspect' | 'Guard'

export class Player {
  readonly body: Body
  yaw = 0
  pitch = -0.1
  flying = false
  swimming = false
  sprinting = false
  readonly prev = new THREE.Vector3()
  readonly camera: THREE.PerspectiveCamera
  readonly hand = new THREE.Group()
  /** Camera-space mount for the bow (held upright, left of centre). */
  private readonly bowMount = new THREE.Group()
  private held = new THREE.Group()
  private heldId: ItemId | null | undefined = undefined
  private bob = 0
  private bobAmp = 0
  private dip = 0
  private stepAcc = 0
  private peakFall = 0
  /** 0..1 swing progress; < 0 = idle. */
  swing = -1
  private swingDur = 0.4
  private eatT = 0
  private inWater = false
  private proc = new THREE.Group()
  private rig: THREE.Object3D | null = null
  private mixer: THREE.AnimationMixer | null = null
  private actions = new Map<RigClip, THREE.AnimationAction>()
  private loopClip: RigClip | null = null
  private oneShot: THREE.AnimationAction | null = null
  private wrist: THREE.Object3D | null = null
  private grip = new THREE.Group()
  private moveK = 0
  /** Bow draw 0..1 (set by the game while aiming). */
  draw = 0
  private bowK = 0
  private bones: { lL: THREE.Object3D; wL: THREE.Object3D; lR: THREE.Object3D; wR: THREE.Object3D } | null = null
  private rest: Array<[THREE.Object3D, THREE.Vector3, THREE.Quaternion]> = []
  /** Camera recoil/kick in radians (decays). */
  private kick = 0
  private kickYaw = 0
  /** Whether an arrow can be nocked (set by the game). */
  arrowReady = false
  /** Smoothed draw, release twang and follow-through. */
  private drawS = 0
  private drawV = 0
  private releaseT = -1
  private releaseAmt = 0
  private lastDraw = 0
  /** View-model inertia: look lag spring (x = yaw, y = pitch), strafe roll and vertical lift. */
  private lag = new THREE.Vector2()
  private lagV = new THREE.Vector2()
  private lastYaw = 0
  private lastPitch = 0
  private roll = 0
  private lift = 0
  /** Equip transition 0..1 (1 = settled). */
  private equipT = 1

  constructor(fov: number) {
    this.body = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), radius: CONFIG.player.radius, height: CONFIG.player.height, grounded: false }
    this.camera = new THREE.PerspectiveCamera(fov, innerWidth / innerHeight, 0.05, 1400)
    this.camera.rotation.order = 'YXZ'
    // Forearm reaching in from the lower right: a rounded sleeve, cuff and a closed fist.
    const arm = new THREE.Group()
    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.36, 4, 12), SLEEVE)
    sleeve.position.set(0.02, -0.1, 0.2)
    sleeve.rotation.set(2.02, 0, -0.12)
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.05, 14), CUFF)
    cuff.position.set(0.004, -0.018, 0.045)
    cuff.rotation.set(2.02, 0, -0.12)
    const fist = new THREE.Mesh(new RoundedBoxGeometry(0.078, 0.07, 0.092, 3, 0.03), SKIN)
    fist.rotation.set(0.25, 0, -0.1)
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.035, 3, 8), SKIN)
    thumb.position.set(-0.04, 0.012, -0.012)
    thumb.rotation.set(0.9, 0, 0.5)
    arm.add(sleeve, cuff, fist, thumb)
    this.proc.add(arm)
    this.hand.add(this.proc, this.held)
    this.hand.position.set(0.27, -0.25, -0.42)
    this.hand.traverse(o => (o.renderOrder = 10))
    this.camera.add(this.hand)
    this.camera.add(this.bowMount)
  }

  teleport(p: THREE.Vector3): void {
    this.body.pos.copy(p)
    this.body.vel.set(0, 0, 0)
    this.prev.copy(p)
    this.body.grounded = false
    this.peakFall = 0
  }

  forward(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch))
  }

  eye(out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.body.pos).setY(this.body.pos.y + CONFIG.player.eye)
  }

  setHeld(id: ItemId | null): void {
    if (id === this.heldId) return
    this.heldId = id
    this.held.removeFromParent()
    this.held = heldModel(id)
    this.held.traverse(o => {
      o.renderOrder = 10
      o.castShadow = false
    })
    if (id === 'bow') this.bowMount.add(this.held)
    else if (this.rig) this.grip.add(this.held)
    else this.hand.add(this.held)
    this.equipT = 0
  }

  /** Swaps the placeholder forearm for the rigged, textured FPS arms. */
  setArms(gltf: GLTF): void {
    if (this.rig) return
    const rig = cloneSkinned(gltf.scene)
    rig.traverse(o => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      m.frustumCulled = false
      m.castShadow = false
      m.receiveShadow = false
      m.renderOrder = 10
      const fix = (x: THREE.Material) => {
        const c = x.clone() as THREE.MeshStandardMaterial
        c.metalness = 0
        c.roughness = Math.max(0.62, c.roughness ?? 0.7)
        c.envMapIntensity = 0.4
        return c
      }
      m.material = Array.isArray(m.material) ? m.material.map(fix) : fix(m.material)
    })
    rig.position.copy(RIG.pos)
    rig.scale.setScalar(RIG.scale)
    this.mixer = new THREE.AnimationMixer(rig)
    for (const clip of gltf.animations) {
      const a = this.mixer.clipAction(clip)
      const once = !/Idle|Walk|Sprint|Guard$/.test(clip.name)
      if (once) {
        a.setLoop(THREE.LoopOnce, 1)
        a.clampWhenFinished = false
      }
      this.actions.set(clip.name as RigClip, a)
    }
    this.mixer.addEventListener('finished', e => {
      const a = (e as unknown as { action: THREE.AnimationAction }).action
      if (a === this.oneShot) {
        a.fadeOut(0.12)
        this.oneShot = null
      }
    })
    this.wrist = rig.getObjectByName('DEF-wristR') ?? null
    this.grip.position.copy(GRIP.pos)
    this.grip.rotation.copy(GRIP.rot)
    this.grip.scale.setScalar(GRIP.scale)
    ;(this.wrist ?? rig).add(this.grip)
    this.rig = rig
    this.proc.visible = false
    this.hand.add(rig)
    this.held.removeFromParent()
    this.grip.add(this.held)
    this.playLoop('Idle')
  }

  get hasRig(): boolean {
    return !!this.rig
  }

  private playLoop(name: RigClip, rate = 1): void {
    const a = this.actions.get(name)
    if (!a) return
    a.timeScale = rate
    if (this.loopClip === name) return
    const prev = this.loopClip ? this.actions.get(this.loopClip) : null
    a.reset().setEffectiveWeight(1).fadeIn(0.2).play()
    prev?.fadeOut(0.2)
    this.loopClip = name
  }

  private playOnce(name: RigClip, seconds: number): void {
    const a = this.actions.get(name)
    if (!a) return
    this.oneShot?.fadeOut(0.06)
    a.reset()
    a.timeScale = Math.max(0.6, (a.getClip().duration * 0.92) / Math.max(0.12, seconds))
    a.setEffectiveWeight(1).fadeIn(0.05).play()
    this.oneShot = a
  }

  /** Camera kick (recoil / hit reaction). */
  addKick(pitch: number, yaw = 0): void {
    this.kick += pitch
    this.kickYaw += yaw
  }

  startSwing(seconds: number): void {
    this.swing = 0
    this.swingDur = seconds
    if (this.rig) {
      const kind = this.heldId ? ITEMS[this.heldId].tool?.kind : undefined
      const clip: RigClip = !kind ? (Math.random() < 0.5 ? 'Punch' : 'PunchLeft') : kind === 'weapon' ? (Math.random() < 0.5 ? 'SwordSlashRight' : 'SwordSlashLeft') : kind === 'shovel' ? 'SwordThrust' : 'SwordOverhead'
      this.playOnce(clip, seconds)
    }
  }

  startEat(): void {
    this.eatT = 0.5
    if (this.rig) this.playOnce('Grab', 0.45)
  }

  look(input: Input): void {
    const look = input.takeLook()
    this.yaw -= look.x
    this.pitch = Math.max(-1.54, Math.min(1.54, this.pitch - look.y))
  }

  /** One fixed simulation step. */
  step(dt: number, input: Input, physics: WorldPhysics, stats: Stats, mode: GameMode): MoveEvents {
    const cfg = CONFIG.player
    const b = this.body
    const ev: MoveEvents = { jumped: false, landed: null, fallDamage: 0, step: false, splash: false }
    this.prev.copy(b.pos)
    if (mode !== 'creative') this.flying = false
    else if (input.consume('fly')) this.flying = !this.flying

    const feetWater = SEA_LEVEL - b.pos.y
    this.swimming = !this.flying && feetWater > 1.05
    const wet = feetWater > 0.2
    if (wet && !this.inWater && b.vel.y < -3) ev.splash = true
    this.inWater = wet

    const fx = -Math.sin(this.yaw)
    const fz = -Math.cos(this.yaw)
    const rx = Math.cos(this.yaw)
    const rz = -Math.sin(this.yaw)
    const mx = input.move.x
    const my = input.move.y
    const wishX = fx * my + rx * mx
    const wishZ = fz * my + rz * mx
    const moving = Math.abs(mx) + Math.abs(my) > 0.1
    const wantSprint = input.held('sprint') && my > 0.2
    this.sprinting = wantSprint && !this.swimming && (mode === 'creative' || stats.stamina > 1) && (b.grounded || this.flying)
    let speed = this.flying ? cfg.flySpeed * (input.held('sprint') ? 2 : 1) : this.swimming ? cfg.swimSpeed : this.sprinting ? cfg.sprintSpeed : cfg.walkSpeed
    if (wet && !this.swimming && !this.flying) speed *= 0.75
    const accel = b.grounded || this.flying || this.swimming ? cfg.acceleration : cfg.acceleration * cfg.airControl
    const tx = wishX * speed
    const tz = wishZ * speed
    const dvx = tx - b.vel.x
    const dvz = tz - b.vel.z
    const dv = Math.hypot(dvx, dvz)
    const maxDv = accel * dt
    if (dv > maxDv) {
      b.vel.x += (dvx / dv) * maxDv
      b.vel.z += (dvz / dv) * maxDv
    } else {
      b.vel.x = tx
      b.vel.z = tz
    }

    if (this.flying) {
      const vy = input.held('jump') ? speed : input.held('descend') ? -speed : 0
      b.vel.y += (vy - b.vel.y) * Math.min(1, dt * 8)
      input.consume('jump')
    } else if (this.swimming) {
      b.vel.y += cfg.gravity * 0.12 * dt
      if (input.held('jump')) b.vel.y += (3.4 - b.vel.y) * Math.min(1, dt * 5)
      else if (input.held('descend')) b.vel.y += (-2.6 - b.vel.y) * Math.min(1, dt * 5)
      else b.vel.y += (feetWater > 1.35 ? 0.9 : -0.3 - b.vel.y) * Math.min(1, dt * 2)
      b.vel.y *= 0.96
      input.consume('jump')
    } else {
      b.vel.y = Math.max(b.vel.y + cfg.gravity * dt, cfg.maxFall)
      if (b.grounded && input.consume('jump')) {
        if (spendStamina(stats, CONFIG.survival.staminaJumpCost, mode) || stats.stamina > 0) {
          tuning.activate('jump')
          b.vel.y = CONFIG.player.jumpSpeed
          b.grounded = false
          ev.jumped = true
        }
      }
    }
    if (b.vel.y < 0) this.peakFall = Math.min(this.peakFall, b.vel.y)
    const landed = physics.moveBody(b, dt, cfg.stepHeight, this.flying)
    if (landed !== null) {
      ev.landed = landed
      if (!wet && !this.flying && mode !== 'creative') ev.fallDamage = fallDamage(landed)
      this.dip = Math.min(0.2, -landed * 0.012)
      this.peakFall = 0
    }
    if (b.grounded || this.swimming || this.flying) this.peakFall = 0

    const hs = Math.hypot(b.vel.x, b.vel.z)
    if (b.grounded && moving && hs > 0.5) {
      this.stepAcc += hs * dt
      if (this.stepAcc > (this.sprinting ? 2.2 : 1.7)) {
        this.stepAcc = 0
        ev.step = true
      }
      this.bob += dt * hs * 1.9
      this.bobAmp += (1 - this.bobAmp) * Math.min(1, dt * 8)
    } else {
      this.bobAmp += (0 - this.bobAmp) * Math.min(1, dt * 6)
    }
    return ev
  }

  /** Place the camera with render interpolation and animate the view model. */
  render(alpha: number, frame: number, bobScale: number): void {
    const b = this.body
    const x = this.prev.x + (b.pos.x - this.prev.x) * alpha
    const y = this.prev.y + (b.pos.y - this.prev.y) * alpha
    const z = this.prev.z + (b.pos.z - this.prev.z) * alpha
    this.dip += (0 - this.dip) * Math.min(1, frame * 7)
    const bob = Math.sin(this.bob * 2) * 0.045 * this.bobAmp * bobScale
    const sway = Math.cos(this.bob) * 0.03 * this.bobAmp * bobScale
    this.camera.position.set(x + Math.cos(this.yaw) * sway * 0.5, y + CONFIG.player.eye + bob - this.dip, z - Math.sin(this.yaw) * sway * 0.5)
    this.kick *= Math.exp(-frame * 12)
    this.kickYaw *= Math.exp(-frame * 12)
    this.camera.rotation.set(this.pitch + this.kick, this.yaw + this.kickYaw, 0)

    // View model: idle breathing, walk sway, swing arc, eat bob.
    const t = performance.now() / 1000
    const f = Math.max(1 / 240, Math.min(1 / 20, frame))
    // Look lag: the hands trail the camera a little and spring back with a soft overshoot.
    let dyaw = this.yaw - this.lastYaw
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw))
    const dpitch = this.pitch - this.lastPitch
    this.lastYaw = this.yaw
    this.lastPitch = this.pitch
    const tx = THREE.MathUtils.clamp((-dyaw / f) * 0.014, -0.11, 0.11)
    const ty = THREE.MathUtils.clamp((-dpitch / f) * 0.012, -0.08, 0.08)
    this.lagV.x += ((tx - this.lag.x) * 150 - this.lagV.x * 15) * f
    this.lagV.y += ((ty - this.lag.y) * 150 - this.lagV.y * 15) * f
    this.lag.x += this.lagV.x * f
    this.lag.y += this.lagV.y * f
    // Strafe roll and jump/fall lift.
    const right = b.vel.x * Math.cos(this.yaw) - b.vel.z * Math.sin(this.yaw)
    this.roll += (THREE.MathUtils.clamp(-right * 0.012, -0.07, 0.07) - this.roll) * Math.min(1, f * 8)
    this.lift += ((this.flying || this.swimming ? 0 : THREE.MathUtils.clamp(-b.vel.y * 0.005, -0.035, 0.03)) - this.lift) * Math.min(1, f * 7)
    // Equip: lower out of view, then rise back with a gentle overshoot.
    this.equipT = Math.min(1, this.equipT + f / 0.34)
    const eq = this.equipT
    const back = 1 + 2.2 * Math.pow(eq - 1, 3) + 1.2 * Math.pow(eq - 1, 2)
    const equipDrop = (1 - back) * 0.26
    const equipTilt = (1 - back) * 0.7
    // Bow draw: spring toward the input; on release the string snaps forward and quivers.
    const want = this.heldId === 'bow' ? this.draw : 0
    if (this.lastDraw > 0.2 && want < 0.05) {
      this.releaseT = 0
      this.releaseAmt = this.lastDraw
      this.drawS = 0
      this.drawV = 0
    }
    this.lastDraw = want
    if (this.releaseT >= 0) {
      this.releaseT += f
      if (this.releaseT > 0.8) this.releaseT = -1
    }
    this.drawV += ((want - this.drawS) * 220 - this.drawV * 26) * f
    this.drawS = THREE.MathUtils.clamp(this.drawS + this.drawV * f, 0, 1)
    const rt = this.releaseT
    const twang = rt >= 0 ? -this.releaseAmt * 0.12 * Math.exp(-rt * 13) * Math.cos(rt * 62) : 0
    let rx = 0
    let ry = 0
    let pz = -0.42
    let py = -0.25 + Math.sin(t * 1.6) * 0.004 + bob * 0.4 - this.dip * 0.6
    let px = 0.27 + sway * 0.6
    if (this.swing >= 0) {
      this.swing += frame / this.swingDur
      const k = Math.min(1, this.swing)
      const arc = Math.sin(k * Math.PI)
      rx = -arc * 1.25
      ry = arc * 0.35
      pz -= arc * 0.12
      py += arc * 0.05
      px -= arc * 0.06
      if (this.swing >= 1) this.swing = -1
    }
    if (this.eatT > 0) {
      this.eatT -= frame
      const e = Math.sin((0.5 - this.eatT) * Math.PI * 6) * 0.03
      px -= 0.12
      py += 0.1 + e
      rx = 0.5
    }
    // Bow: upright, canted, left of centre; drawing brings it in, centres it and pulls the string.
    if (this.heldId === 'bow') {
      const d = this.draw
      const shake = d > 0.95 ? Math.sin(t * 40) * 0.0015 : 0
      const ds = this.drawS
      // Recoil nudge on release: the bow hand kicks forward-down and settles.
      const kickB = rt >= 0 ? this.releaseAmt * Math.exp(-rt * 9) * Math.sin(Math.min(1, rt * 10) * Math.PI) : 0
      this.bowMount.position.set(
        -0.12 + (px - 0.27) * 0.8 + ds * 0.06 + shake + this.lag.x * 0.5,
        -0.085 + (py + 0.25) * 0.8 + ds * 0.035 - equipDrop + this.lift + this.lag.y * 0.5 - kickB * 0.012,
        -0.6 + ds * 0.06 - kickB * 0.02,
      )
      this.bowMount.rotation.set(0.05 - ds * 0.04 - equipTilt * 0.6 + this.lag.y * 0.8 + kickB * 0.05, 0.12 - ds * 0.1 + this.lag.x * 0.9, 0.32 - ds * 0.18 + this.roll * 1.2)
      // The next arrow slides onto the string shortly after a shot (if you have one).
      const renock = rt >= 0 ? Math.max(0, Math.min(1, (rt - 0.28) / 0.3)) : 1
      const slide = 1 - (1 - Math.pow(1 - renock, 3))
      poseBowString(this.held, rt >= 0 ? twang : ds, this.arrowReady && renock > 0, slide)
      // Aim the nocked arrow at the crosshair so it reads as a clean diagonal past the bow hand
      // (a shaft lying exactly along the view ray would hide behind both fists).
      const nocked = this.held.getObjectByName('nocked')
      if (nocked?.visible) {
        this.camera.updateMatrixWorld(true)
        nocked.lookAt(this.camera.localToWorld(_t0.set(0.03, 0.01, -7)))
        nocked.rotateY(Math.PI)
      }
      void d
    }
    if (this.rig && this.mixer) {
      // Rigged arms: animation carries swings; code adds breathing, bob, sway and dips.
      const hs = Math.hypot(b.vel.x, b.vel.z)
      this.moveK += ((b.grounded && hs > 0.6 ? 1 : 0) - this.moveK) * Math.min(1, frame * 6)
      const armed = !!this.heldId
      const loop: RigClip = this.moveK < 0.5 ? (armed ? 'SwordIdle' : 'Idle') : this.sprinting ? (armed ? 'SwordSprint' : 'Sprint') : armed ? 'SwordWalk' : 'Walk'
      this.playLoop(this.heldId === 'bow' ? 'Guard' : loop, loop.includes('Walk') ? Math.max(0.7, hs / 4.2) : 1)
      // Undo last frame's IK so bones without animation tracks don't keep the bow pose.
      for (const [b, p, q] of this.rest) {
        b.position.copy(p)
        b.quaternion.copy(q)
      }
      this.mixer.update(frame)
      // Breathing adds a hint of rotation, not just translation, so the idle feels alive.
      const breathe = Math.sin(t * 1.6) * 0.006
      const swingK = this.swing >= 0 ? 0.3 : 1
      this.hand.position.set((px - 0.27) * swingK + this.lag.x * 0.35, (py + 0.25) * swingK - equipDrop + this.lift + this.lag.y * 0.35, (pz + 0.42) * swingK)
      this.hand.rotation.set(
        (this.eatT > 0 ? 0.2 : this.drawS * 0.1) * swingK - equipTilt + this.lag.y * 0.9 + breathe,
        this.lag.x * 1.1,
        this.roll + this.lag.x * 0.35,
      )
      this.bowK += ((this.heldId === 'bow' ? 1 : 0) - this.bowK) * Math.min(1, frame * 10)
      if (this.bowK > 0.01 && this.heldId === 'bow') this.solveBowHands()
      return
    }
    this.hand.position.set(px + this.lag.x * 0.35, py - equipDrop + this.lift + this.lag.y * 0.35, pz)
    this.hand.rotation.set(rx - equipTilt + this.lag.y * 0.9, ry + this.lag.x * 1.1, this.roll)
  }

  /**
   * Two-hand bow pose on top of the animated rig: the left fist closes on the grip and the right
   * hand hooks the string at the nock, following it back as the draw builds. The rig has forearms
   * only, so each arm is aimed from a virtual elbow and slid so the wrist lands on its target.
   */
  private solveBowHands(): void {
    if (!this.bones) {
      const get = (n: string) => this.rig!.getObjectByName(n) ?? null
      const lL = get('DEF-lowerarm01L'), wL = get('DEF-wristL'), lR = get('DEF-lowerarm01R'), wR = get('DEF-wristR')
      if (!lL || !wL || !lR || !wR) return
      this.bones = { lL, wL, lR, wR }
      this.rest = [lL, wL, lR, wR].map(b => [b, b.position.clone(), b.quaternion.clone()])
    }
    const { lL, wL, lR, wR } = this.bones
    this.camera.updateMatrixWorld(true)
    const mq = this.bowMount.getWorldQuaternion(_q0)
    const d = this.drawS
    const rt = this.releaseT
    const follow = rt >= 0 ? this.releaseAmt * Math.exp(-rt * 5.5) * Math.min(1, rt * 14) : 0
    // Left: fist around the grip; fingers wrap toward the right, knuckles face out-left.
    const gripW = this.bowMount.localToWorld(_t0.set(0.0, -0.005, 0.012))
    const qL = basis(_q1, BOW_HAND.left, mq)
    const elbowL = _t1.copy(gripW).add(_t2.set(-0.11, -0.17, 0.2).applyQuaternion(this.camera.quaternion))
    solveForearm(lL, wL, gripW, elbowL, qL, this.bowK)
    // Right: fingers hooked on the string, drawing back toward the cheek.
    // After release the fingers spring off the string: back past the cheek and out, then return.
    const hd = Math.max(d, follow * 1.08)
    const nockW = this.bowMount.localToWorld(_t3.set(0.035 * follow, 0.02 * follow, BOW_TIP_Z + hd * BOW_PULL + 0.004))
    const qR = basis(_q2, BOW_HAND.right, mq)
    const elbowR = _t4.copy(nockW).add(_t2.set(0.16 + d * 0.06, -0.12 + d * 0.06, 0.18 - d * 0.1).applyQuaternion(this.camera.quaternion))
    solveForearm(lR, wR, nockW, elbowR, qR, this.bowK)
  }

  /** Whether the current swing just crossed its impact point this frame. */
  get swinging(): boolean {
    return this.swing >= 0
  }
}
