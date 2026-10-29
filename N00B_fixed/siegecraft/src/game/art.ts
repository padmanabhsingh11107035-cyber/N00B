import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { PieceSpec } from './levels'

/**
 * Procedural low-poly art. Every castle piece is ONE merged, non-indexed, vertex-coloured
 * geometry drawn with a shared flat-shaded material, so a 160-piece castle costs ~160 draw calls
 * and the palette stays consistent. Guards and the catapult are small groups.
 */
export const PALETTE = {
  wood: [0xb0733f, 0x9c6435, 0xc4874b, 0x8d5a31],
  woodDark: 0x5e3a20,
  woodLight: 0xd9a462,
  stone: [0xa3a39c, 0x959a9c, 0xb4b0a4, 0x8c9094],
  stoneDark: 0x6c6f73,
  mortar: 0x7c7a72,
  roof: 0xc0503a,
  roofDark: 0x8e3526,
  iron: 0x3b3d44,
  powder: 0xb8392b,
  powderBand: 0xe9c24f,
  skin: 0xf0c49a,
  tabard: 0x2f7d8c,
  tabardDark: 0x215a66,
  helmet: 0xb9c0c9,
  gold: 0xe8b83c,
  plume: 0xe0413a,
  ball: 0x8f8a82,
  flag: 0x2f7d8c,
  grass: [0x7fae4c, 0x74a445, 0x8bb857, 0x6a9a3f],
}

const rng = (() => {
  let s = 1337
  return () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
})()

const tmpColor = new THREE.Color()

/** Paint a non-indexed geometry: one colour per triangle pair (face) with a little variation. */
function paint(geo: THREE.BufferGeometry, color: number, vary = 0.06, perTriangle = 2): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo
  const count = g.attributes.position.count
  const colors = new Float32Array(count * 3)
  const base = new THREE.Color(color)
  for (let tri = 0; tri < count / 3; tri += 1) {
    if (tri % perTriangle === 0) {
      const k = 1 + (rng() - 0.5) * 2 * vary
      tmpColor.copy(base).multiplyScalar(k)
    }
    for (let v = 0; v < 3; v += 1) {
      const i = (tri * 3 + v) * 3
      colors[i] = tmpColor.r
      colors[i + 1] = tmpColor.g
      colors[i + 2] = tmpColor.b
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  g.deleteAttribute('uv')
  return g
}

function boxAt(sx: number, sy: number, sz: number, x: number, y: number, z: number, color: number, vary = 0.06, rotY = 0, rotZ = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(sx, sy, sz)
  if (rotZ) g.rotateZ(rotZ)
  if (rotY) g.rotateY(rotY)
  g.translate(x, y, z)
  return paint(g, color, vary)
}

/** Slightly irregular box (hand-hewn stone), jitter kept inside the collider bounds. */
function roughBox(sx: number, sy: number, sz: number, color: number, amount = 0.035): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(sx, sy, sz, 1, 1, 1)
  const p = g.attributes.position as THREE.BufferAttribute
  const seen = new Map<string, [number, number, number]>()
  for (let i = 0; i < p.count; i += 1) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`
    let off = seen.get(key)
    if (!off) {
      off = [(rng() - 0.5) * amount, (rng() - 0.5) * amount, (rng() - 0.5) * amount]
      seen.set(key, off)
    }
    // Pull corners inward so the silhouette stays within the physics box.
    p.setXYZ(i, p.getX(i) * (1 - amount) + off[0], p.getY(i) * (1 - amount * 0.6) + off[1], p.getZ(i) * (1 - amount) + off[2])
  }
  return paint(g, color, 0.05, 2)
}

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)]
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false)!
  for (const p of parts) p.dispose()
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

// ─── piece geometries ─────────────────────────────────────────────────────

function plank(sx: number, sy: number, sz: number): THREE.BufferGeometry {
  const base = pick(PALETTE.wood)
  const long = sx >= sz ? 'x' : 'z'
  const parts = [boxAt(sx, sy, sz, 0, 0, 0, base, 0.05)]
  // Board seams: darker grooves on the top along the long axis.
  const across = long === 'x' ? sz : sx
  const boards = Math.max(2, Math.round(across / 0.33))
  for (let i = 1; i < boards; i += 1) {
    const o = -across / 2 + (across * i) / boards
    if (long === 'x') parts.push(boxAt(sx * 0.98, 0.012, 0.03, 0, sy / 2, o, PALETTE.woodDark, 0))
    else parts.push(boxAt(0.03, 0.012, sz * 0.98, o, sy / 2, 0, PALETTE.woodDark, 0))
  }
  return merge(parts)
}

function post(sx: number, sy: number, sz: number): THREE.BufferGeometry {
  const c = pick(PALETTE.wood)
  return merge([
    boxAt(sx, sy, sz, 0, 0, 0, c, 0.07),
    boxAt(sx * 1.04, 0.05, sz * 1.04, 0, sy / 2 - 0.12, 0, PALETTE.iron, 0),
    boxAt(sx * 1.04, 0.05, sz * 1.04, 0, -sy / 2 + 0.12, 0, PALETTE.iron, 0),
  ])
}

function crate(s: number): THREE.BufferGeometry {
  const inner = pick(PALETTE.wood)
  const frame = PALETTE.woodLight
  const e = 0.12
  const h = s / 2 - e / 2
  const parts = [boxAt(s * 0.94, s * 0.94, s * 0.94, 0, 0, 0, inner, 0.05)]
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    parts.push(boxAt(s, e, e, 0, a * h, b * h, frame, 0.04))
    parts.push(boxAt(e, s, e, a * h, 0, b * h, frame, 0.04))
    parts.push(boxAt(e, e, s, a * h, b * h, 0, frame, 0.04))
  }
  // Diagonal braces on two faces.
  for (const z of [-1, 1]) parts.push(boxAt(s * 1.2, e * 0.8, 0.04, 0, 0, z * (s / 2 - 0.005), frame, 0.03, 0, Math.PI / 4))
  return merge(parts)
}

function log(sx: number, sy: number): THREE.BufferGeometry {
  const r = sx / 2
  const tip = Math.min(0.35, sy * 0.2)
  const body = new THREE.CylinderGeometry(r, r * 1.02, sy - tip, 7)
  body.translate(0, -tip / 2, 0)
  const point = new THREE.ConeGeometry(r, tip, 7)
  point.translate(0, sy / 2 - tip / 2, 0)
  const c = pick(PALETTE.wood)
  return merge([paint(body, c, 0.07, 1), paint(point, PALETTE.woodLight, 0.05, 1), boxAt(sx * 1.06, 0.06, sx * 1.06, 0, sy * 0.1, 0, PALETTE.iron, 0)])
}

function roof(d: number, h: number): THREE.BufferGeometry {
  const cone = new THREE.ConeGeometry(d / 2, h, 8, 2)
  const parts = [paint(cone, PALETTE.roof, 0.08, 1)]
  const rim = new THREE.CylinderGeometry(d / 2 * 1.02, d / 2 * 1.02, 0.12, 8)
  rim.translate(0, -h / 2 + 0.06, 0)
  parts.push(paint(rim, PALETTE.roofDark, 0.04, 1))
  const cap = new THREE.OctahedronGeometry(0.16)
  cap.translate(0, h / 2 + 0.05, 0)
  parts.push(paint(cap, PALETTE.gold, 0.02, 1))
  return merge(parts)
}

function stoneBlock(sx: number, sy: number, sz: number): THREE.BufferGeometry {
  return roughBox(sx, sy, sz, pick(PALETTE.stone), 0.045)
}

function merlon(sx: number, sy: number, sz: number): THREE.BufferGeometry {
  return merge([roughBox(sx, sy, sz, pick(PALETTE.stone), 0.05), boxAt(sx * 1.03, 0.05, sz * 1.03, 0, sy / 2 - 0.02, 0, PALETTE.stoneDark, 0.02)])
}

function gate(sx: number, sy: number, sz: number): THREE.BufferGeometry {
  const parts = [boxAt(sx, sy, sz, 0, 0, 0, PALETTE.wood[1], 0.05)]
  for (const x of [-sx / 3, 0, sx / 3]) parts.push(boxAt(0.025, sy * 0.98, sz * 1.02, x, 0, 0, PALETTE.woodDark, 0))
  for (const y of [-sy * 0.28, sy * 0.28]) parts.push(boxAt(sx * 1.01, 0.07, sz * 1.04, 0, y, 0, PALETTE.iron, 0))
  return merge(parts)
}

function barrel(d: number, h: number): THREE.BufferGeometry {
  const r = d / 2
  const pts: THREE.Vector2[] = []
  for (let i = 0; i <= 6; i += 1) {
    const t = i / 6
    pts.push(new THREE.Vector2(r * (0.86 + 0.14 * Math.sin(t * Math.PI)), -h / 2 + t * h))
  }
  const body = new THREE.LatheGeometry(pts, 10)
  const parts = [paint(body, PALETTE.powder, 0.05, 1)]
  for (const y of [-h * 0.36, h * 0.36]) {
    const hoop = new THREE.CylinderGeometry(r * 0.96, r * 0.96, 0.06, 10, 1, true)
    hoop.translate(0, y, 0)
    parts.push(paint(hoop, PALETTE.iron, 0, 1))
  }
  const band = new THREE.CylinderGeometry(r * 1.005, r * 1.005, 0.12, 10, 1, true)
  parts.push(paint(band, PALETTE.powderBand, 0.02, 1))
  for (const y of [-h / 2 + 0.005, h / 2 - 0.005]) {
    const lid = new THREE.CircleGeometry(r * 0.86, 10)
    lid.rotateX(y > 0 ? -Math.PI / 2 : Math.PI / 2)
    lid.translate(0, y, 0)
    parts.push(paint(lid, PALETTE.woodDark, 0.04, 1))
  }
  // Fuse on top.
  const fuse = new THREE.CylinderGeometry(0.025, 0.025, 0.16, 4)
  fuse.translate(r * 0.4, h / 2 + 0.08, 0)
  parts.push(paint(fuse, 0x2a2a2a, 0, 1))
  // Flame emblem on the band (a flat diamond on two sides).
  for (const s of [-1, 1]) {
    const em = new THREE.OctahedronGeometry(0.1, 0)
    em.scale(0.6, 1.2, 0.2)
    em.translate(0, 0, s * r * 1.0)
    parts.push(paint(em, 0xfff1c0, 0, 1))
  }
  return merge(parts)
}

export function pieceGeometry(spec: PieceSpec): THREE.BufferGeometry {
  const [sx, sy, sz] = spec.size
  switch (spec.style) {
    case 'plank':
    case 'beam':
      return plank(sx, sy, sz)
    case 'post':
      return post(sx, sy, sz)
    case 'crate':
      return sx > 0.7 ? crate(sx) : plank(sx, sy, sz)
    case 'log':
      return spec.shape === 'box' && sy > 1 ? log(sx, sy) : plank(sx, sy, sz)
    case 'roof':
      return roof(sx, sy)
    case 'merlon':
      return merlon(sx, sy, sz)
    case 'gate':
      return gate(sx, sy, sz)
    case 'barrel':
      return barrel(sx, sy)
    case 'block':
    default:
      return spec.kind === 'stone' ? stoneBlock(sx, sy, sz) : plank(sx, sy, sz)
  }
}

/** Fragment geometry: plain chunk in the parent's material colours. */
export function fragmentGeometry(spec: PieceSpec): THREE.BufferGeometry {
  const [sx, sy, sz] = spec.size
  if (spec.kind === 'stone') return roughBox(sx, sy, sz, pick(PALETTE.stone), 0.12)
  const base = spec.style === 'gate' ? PALETTE.wood[1] : pick(PALETTE.wood)
  const g = new THREE.BoxGeometry(sx, sy, sz)
  // Splintered ends: pinch one end.
  const p = g.attributes.position as THREE.BufferAttribute
  const long = sx >= sy && sx >= sz ? 0 : sy >= sz ? 1 : 2
  for (let i = 0; i < p.count; i += 1) {
    const v = [p.getX(i), p.getY(i), p.getZ(i)]
    if (v[long] > 0) {
      for (let a = 0; a < 3; a += 1) if (a !== long) v[a] *= 0.55 + rng() * 0.3
      v[long] *= 1 + (rng() - 0.5) * 0.3
    }
    p.setXYZ(i, v[0], v[1], v[2])
  }
  return merge([paint(g, base, 0.08, 2)])
}

// ─── materials ────────────────────────────────────────────────────────────

export class ArtKit {
  readonly solid = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.88, metalness: 0.02 })
  readonly cracked = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0, color: 0x9a8f86 })
  readonly skin = new THREE.MeshStandardMaterial({ color: PALETTE.skin, flatShading: true, roughness: 0.8 })
  readonly tabard = new THREE.MeshStandardMaterial({ color: PALETTE.tabard, flatShading: true, roughness: 0.85 })
  readonly helmet = new THREE.MeshStandardMaterial({ color: PALETTE.helmet, flatShading: true, roughness: 0.35, metalness: 0.55 })
  readonly gold = new THREE.MeshStandardMaterial({ color: PALETTE.gold, flatShading: true, roughness: 0.35, metalness: 0.7 })
  readonly dark = new THREE.MeshStandardMaterial({ color: 0x1d1b22, flatShading: true, roughness: 0.6 })
  readonly plume = new THREE.MeshStandardMaterial({ color: PALETTE.plume, flatShading: true, roughness: 0.8 })
  readonly flag = new THREE.MeshStandardMaterial({ color: PALETTE.flag, flatShading: true, roughness: 0.9, side: THREE.DoubleSide })
  readonly flame = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.1, 0.6) })
  readonly star = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.6, 0.9) })
  readonly ballMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 })
  private geoCache = new Map<string, THREE.BufferGeometry>()
  readonly flags: THREE.Mesh[] = []
  readonly torches: THREE.Object3D[] = []

  constructor(private readonly projectileTemplate?: THREE.Object3D) {}

  /** Visible object for a castle piece or fragment (origin = piece centre). */
  piece(spec: PieceSpec, fragment: boolean): THREE.Object3D {
    if (spec.kind === 'guard') return this.guard(spec.style === 'captain')
    const key = fragment ? '' : `${spec.style}|${spec.size.join(',')}|${Math.floor(rng() * 3)}`
    let geo = key ? this.geoCache.get(key) : undefined
    if (!geo) {
      geo = fragment ? fragmentGeometry(spec) : pieceGeometry(spec)
      if (key) this.geoCache.set(key, geo)
    }
    const mesh = new THREE.Mesh(geo, this.solid)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.userData.kind = spec.kind
    if (spec.flag) this.addFlag(mesh, spec)
    if (spec.torch) this.addTorch(mesh, spec)
    return mesh
  }

  private addFlag(parent: THREE.Object3D, spec: PieceSpec): void {
    const top = spec.size[1] / 2
    const pole = new THREE.Mesh(paint(new THREE.CylinderGeometry(0.035, 0.035, 1.7, 5), PALETTE.woodDark, 0, 1), this.solid)
    pole.position.set(0, top + 0.8, 0)
    pole.castShadow = true
    parent.add(pole)
    const cloth = new THREE.PlaneGeometry(0.9, 0.5, 6, 2)
    cloth.translate(0.45, 0, 0)
    const flag = new THREE.Mesh(cloth, this.flag)
    flag.position.set(0.02, top + 1.4, 0)
    flag.castShadow = true
    flag.userData.base = (cloth.attributes.position.array as Float32Array).slice()
    parent.add(flag)
    this.flags.push(flag)
  }

  private addTorch(parent: THREE.Object3D, spec: PieceSpec): void {
    const top = spec.size[1] / 2
    const holder = new THREE.Mesh(paint(new THREE.CylinderGeometry(0.05, 0.035, 0.45, 5), PALETTE.woodDark, 0, 1), this.solid)
    holder.position.set(0, top + 0.22, 0)
    parent.add(holder)
    const fire = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 5), this.flame)
    fire.position.set(0, top + 0.6, 0)
    parent.add(fire)
    this.torches.push(fire)
  }

  /** Round little castle guard: tabard body, face, helmet, spear. ~0.9 tall, origin at centre. */
  guard(captain: boolean): THREE.Object3D {
    const g = new THREE.Group()
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.5, 7), this.tabard)
    body.position.y = -0.18
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.06, 7), this.dark)
    belt.position.y = -0.2
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), this.skin)
    head.position.y = 0.2
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.215, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), captain ? this.gold : this.helmet)
    helm.position.y = 0.24
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.04, 8), captain ? this.gold : this.helmet)
    brim.position.y = 0.24
    const eyes = new THREE.Group()
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.02), this.dark)
      eye.position.set(s * 0.075, 0.18, 0.19)
      eyes.add(eye)
    }
    eyes.name = 'eyes'
    const dazedEyes = new THREE.Group()
    for (const s of [-1, 1]) for (const r of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.018, 0.02), this.dark)
      bar.position.set(s * 0.075, 0.18, 0.195)
      bar.rotation.z = (r * Math.PI) / 4
      dazedEyes.add(bar)
    }
    dazedEyes.visible = false
    dazedEyes.name = 'dazedEyes'
    const feet = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.07, 0.26), this.dark)
    feet.position.y = -0.415
    const spear = new THREE.Group()
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 4), this.solid)
    ;(shaft.geometry as THREE.BufferGeometry) = paint(shaft.geometry, PALETTE.woodDark, 0, 1)
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), this.helmet)
    tip.position.y = 0.56
    spear.add(shaft, tip)
    spear.position.set(0.27, 0.05, 0.05)
    const hand = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), this.skin)
    hand.position.set(0.25, -0.1, 0.06)
    g.add(body, belt, head, helm, brim, eyes, dazedEyes, feet, spear, hand)
    if (captain) {
      const plume = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 5), this.plume)
      plume.position.set(0, 0.52, -0.02)
      plume.rotation.x = -0.3
      g.add(plume)
      const cape = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.5, 0.04), this.plume)
      cape.position.set(0, -0.12, -0.22)
      g.add(cape)
    }
    const stars = new THREE.Group()
    for (let i = 0; i < 3; i += 1) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), this.star)
      const a = (i / 3) * Math.PI * 2
      s.position.set(Math.cos(a) * 0.24, 0, Math.sin(a) * 0.24)
      stars.add(s)
    }
    stars.position.y = 0.55
    stars.visible = false
    stars.name = 'stars'
    g.add(stars)
    g.traverse(o => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true
        o.receiveShadow = true
      }
    })
    g.userData.kind = 'guard'
    return g
  }

  /** Swap a guard to the knocked-out look. */
  daze(obj: THREE.Object3D): void {
    const eyes = obj.getObjectByName('eyes')
    const dazed = obj.getObjectByName('dazedEyes')
    const stars = obj.getObjectByName('stars')
    if (eyes) eyes.visible = false
    if (dazed) dazed.visible = true
    if (stars) stars.visible = true
    obj.userData.dazed = true
  }

  crack(obj: THREE.Object3D): void {
    if ((obj as THREE.Mesh).isMesh) (obj as THREE.Mesh).material = this.cracked
  }

  ball(radius: number): THREE.Object3D {
    if (this.projectileTemplate) {
      const model = this.projectileTemplate.clone(true)
      model.updateWorldMatrix(true, true)
      const bounds = new THREE.Box3().setFromObject(model)
      const size = bounds.getSize(new THREE.Vector3())
      const diameter = Math.max(size.x, size.y, size.z)
      if (!Number.isFinite(diameter) || diameter <= 0) throw new Error('Stone projectile model has no usable bounds')
      const center = bounds.getCenter(new THREE.Vector3())
      const group = new THREE.Group()
      group.name = 'StoneProjectile'
      group.add(model)
      model.position.sub(center)
      model.scale.multiplyScalar((radius * 2) / diameter)
      model.traverse(node => {
        if ((node as THREE.Mesh).isMesh) {
          const mesh = node as THREE.Mesh
          mesh.castShadow = true
          mesh.receiveShadow = true
        }
      })
      return group
    }
    const g = new THREE.IcosahedronGeometry(radius, 1)
    const p = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i += 1) {
      const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i))
      const n = 1 + Math.sin(v.x * 17 + v.y * 11) * 0.04 + Math.cos(v.z * 13) * 0.03
      v.multiplyScalar(n)
      p.setXYZ(i, v.x, v.y, v.z)
    }
    const mesh = new THREE.Mesh(merge([paint(g, PALETTE.ball, 0.12, 1)]), this.ballMat)
    mesh.castShadow = true
    mesh.receiveShadow = true
    return mesh
  }

  /** Animate flags and torches. */
  animate(time: number): void {
    for (const f of this.flags) {
      const pos = f.geometry.attributes.position as THREE.BufferAttribute
      const base = f.userData.base as Float32Array
      for (let i = 0; i < pos.count; i += 1) {
        const x = base[i * 3]
        pos.setZ(i, Math.sin(time * 5 + x * 5) * 0.08 * x)
      }
      pos.needsUpdate = true
    }
    for (const t of this.torches) {
      const s = 1 + Math.sin(time * 23 + t.id) * 0.12 + Math.sin(time * 37) * 0.08
      t.scale.set(1, s, 1)
    }
  }
}
