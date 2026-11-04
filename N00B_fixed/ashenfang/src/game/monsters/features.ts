import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { triplanarMaterial } from '../materials'
import type { MonsterDef } from './defs'
import { cardClump, taperedTube } from './rig'

/**
 * Signature anatomy that makes each colossus read at a glance (its "headgear" and silhouette):
 *
 * - Mossback — branching bark antlers with leafy tips and hanging moss, a living grove of
 *   trees on its back, curtains of swaying vines and glowing shelf fungi that shed spores.
 * - Ashwing — obsidian shard crests along neck, spine and tail with molten cores, glowing ember
 *   vents on its flanks that smoke and spit sparks, and a spiked brow and jaw.
 * - Tidehorn — coral reefs growing on its shell with glowing anemone tips, barnacles, rows of
 *   bioluminescent spots, a translucent crest fin along the neck and dripping kelp.
 *
 * Everything is rigid geometry parented to rig bones (merged per bone/material to keep draw
 * calls low). Returns glow materials to pulse, sway pivots for secondary motion, and emitter
 * points the hunt uses for ambient particles.
 */
export type EmitKind = 'leaf' | 'spore' | 'ember' | 'smoke' | 'drip' | 'glint'
export type Emitter = { kind: EmitKind; bone: THREE.Object3D; offset: THREE.Vector3; rate: number; acc: number }
export type Sway = { obj: THREE.Object3D; axis: 'x' | 'z'; base: number; amp: number; speed: number; phase: number }
export type Features = {
  glow: { mat: THREE.MeshStandardMaterial; base: number }[]
  emitters: Emitter[]
  sway: Sway[]
  /** Tall parts the mounted camera may need to see through. */
  clutter: THREE.Object3D[]
}

export type FeatureCtx = {
  def: MonsterDef
  body: THREE.Group
  neck: THREE.Group[]
  head: THREE.Group
  jaw: THREE.Group
  tail: THREE.Group[]
  tailEnd: THREE.Group
  hips: THREE.Group[]
  L: number
  W: number
  H: number
  hl: number
  hw: number
  hh: number
  neckSeg: number
  tailSeg: number
  neckR: (i: number) => number
  tailR: (i: number) => number
  heartZ: number
  random: () => number
  tex: (key: string) => THREE.Texture
  track: (d: { dispose(): void }) => void
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const Z = new THREE.Vector3(0, 0, 1)
const Y = new THREE.Vector3(0, 1, 0)

export function addFeatures(c: FeatureCtx): Features {
  const f: Features = { glow: [], emitters: [], sway: [], clutter: [] }
  const buckets = new Map<THREE.Object3D, Map<THREE.Material, THREE.BufferGeometry[]>>()
  const put = (bone: THREE.Object3D, mat: THREE.Material, g: THREE.BufferGeometry) => {
    let m = buckets.get(bone)
    if (!m) buckets.set(bone, (m = new Map()))
    let a = m.get(mat)
    if (!a) m.set(mat, (a = []))
    a.push(stripToPN(g))
  }
  const glowMat = (color: string, emissive: string, intensity: number, extra: THREE.MeshStandardMaterialParameters = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(emissive), emissiveIntensity: intensity, roughness: 0.35, metalness: 0, envMapIntensity: 0.4, ...extra })
    c.track(m)
    f.glow.push({ mat: m, base: intensity })
    return m
  }
  const std = (p: THREE.MeshStandardMaterialParameters) => {
    const m = new THREE.MeshStandardMaterial({ metalness: 0, envMapIntensity: 0.35, ...p })
    c.track(m)
    return m
  }
  const emit = (kind: EmitKind, bone: THREE.Object3D, offset: THREE.Vector3, rate: number) => f.emitters.push({ kind, bone, offset, rate, acc: Math.random() })
  const swayPivot = (parent: THREE.Object3D, at: THREE.Vector3, amp: number, speed: number) => {
    const g = new THREE.Group()
    g.position.copy(at)
    parent.add(g)
    const axis = c.random() > 0.5 ? 'x' : 'z'
    f.sway.push({ obj: g, axis, base: 0, amp, speed, phase: c.random() * 6.28 })
    return g
  }
  const addMesh = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, shadow = true) => {
    const mesh = new THREE.Mesh(g, m)
    mesh.castShadow = shadow
    mesh.receiveShadow = true
    parent.add(mesh)
    c.track(g)
    return mesh
  }
  const { L, W, H, random } = c
  const cross = (z: number) => Math.sqrt(Math.max(0.04, 1 - (z / (L * 0.5)) ** 2))
  /** Point on the torso surface at longitudinal z and angle `a` around the body (0 = side, +π/2 = top). */
  const torso = (side: number, z: number, a: number, inset = 0.12) => {
    const rz = cross(z)
    const n = V(side * Math.cos(a), Math.sin(a), 0)
    const p = V(side * (W / 2) * rz * Math.cos(a), H * 0.15 + (H / 2) * rz * Math.sin(a), z)
    return { p: p.addScaledVector(n, -inset), n }
  }
  const backY = (x: number, z: number) => H * 0.15 + (H / 2) * cross(z) * Math.sqrt(Math.max(0.2, 1 - (x / (W * 0.5)) ** 2))

  /** Recursive branching tube (antlers, trees, coral). Tips are returned in the same space. */
  const branch = (out: THREE.BufferGeometry[], tips: THREE.Vector3[], start: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, depth: number, spread: number, up: number) => {
    const d = dir.clone().normalize()
    const side = V(random() - 0.5, random() - 0.5, random() - 0.5).multiplyScalar(len * 0.18)
    const mid = start.clone().addScaledVector(d, len * 0.5).add(side)
    const end = start.clone().addScaledVector(d, len)
    end.y += up * len * 0.15
    out.push(taperedTube([start, mid, end], r, depth === 0 ? r * 0.25 : r * 0.66, 10, 7))
    if (depth === 0) {
      tips.push(end)
      return
    }
    const kids = random() < 0.35 ? 3 : 2
    for (let i = 0; i < kids; i += 1) {
      const nd = d.clone()
      const ax = V(random() - 0.5, random() - 0.5, random() - 0.5).cross(d).normalize()
      nd.applyAxisAngle(ax, spread * (0.6 + random() * 0.6))
      nd.y += up * 0.4
      branch(out, tips, end, nd, len * (0.66 + random() * 0.14), r * 0.64, depth - 1, spread, up)
    }
  }
  /** A hanging strand (vine / moss / kelp) as its own sway pivot. */
  const strand = (parent: THREE.Object3D, at: THREE.Vector3, len: number, r: number, mat: THREE.Material, wave = 0.25) => {
    const piv = swayPivot(parent, at, 0.09 + random() * 0.08, 1 + random() * 0.9)
    const pts: THREE.Vector3[] = []
    const dx = (random() - 0.5) * 0.4
    const dz = (random() - 0.5) * 0.4
    for (let i = 0; i <= 5; i += 1) {
      const k = i / 5
      pts.push(V(dx * k + Math.sin(k * 5 + dz * 9) * wave * k, -len * k, dz * k + Math.cos(k * 4 + dx * 7) * wave * k))
    }
    addMesh(piv, taperedTube(pts, r, r * 0.3, 12, 5), mat, false)
    return piv
  }

  if (c.def.id === 'mossback') buildMossback()
  else if (c.def.id === 'ashwing') buildAshwing()
  else if (c.def.id === 'tidehorn') buildTidehorn()

  for (const [bone, byMat] of buckets)
    for (const [mat, geos] of byMat) {
      const merged = mergeGeometries(geos)
      if (!merged) continue
      merged.computeVertexNormals()
      const m = addMesh(bone, merged, mat)
      if (mat.userData.clutter) f.clutter.push(m)
    }
  return f

  // ─── Mossback: the walking grove ──────────────────────────────────────
  function buildMossback(): void {
    const bark = triplanarMaterial({ map: c.tex('tex.bark_d'), tile: 1.1, color: '#cbb996', roughness: 0.93, bump: 1.8 })
    c.track(bark)
    const leaf = std({ map: c.tex('foliage.leaf_broad'), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, color: '#b7cc86', envMapIntensity: 0.25 })
    const mossStrand = std({ color: '#5d7033', roughness: 0.96 })
    const fungus = std({ color: '#d8b77c', roughness: 0.7 })
    const fungusGlow = glowMat('#e2b765', '#ffae42', 0.22, { roughness: 0.6 })

    // Branching antlers — the Mossback's crown of living wood.
    const antlerGeos: THREE.BufferGeometry[] = []
    const tips: THREE.Vector3[] = []
    for (const s of [-1, 1]) {
      const start = V(s * c.hw * 0.28, c.hh * 0.4, c.hl * 0.06)
      branch(antlerGeos, tips, start, V(s * 0.6, 0.78, -0.3), c.def.plan.hornLength * 0.95, 0.26, 3, 0.58, 0.55)
    }
    for (const g of antlerGeos) put(c.head, bark, g)
    tips.forEach((t, i) => {
      if (i % 4 === 0) {
        const leaves = cardClump(2, 0.8, 0.6, (_k, m) => m.compose(t.clone().add(V((random() - 0.5) * 0.3, -0.2, (random() - 0.5) * 0.3)), new THREE.Quaternion().setFromEuler(new THREE.Euler(random() - 0.5, random() * 6, random() - 0.5)), V(1, 1, 1)))
        addMesh(c.head, leaves, leaf, false)
      } else if (i % 3 === 1) strand(c.head, t, 0.9 + random() * 0.8, 0.045, mossStrand, 0.12)
    })

    // A grove of small trees rooted in the back.
    const trees: [number, number, number][] = [
      [W * 0.12, L * 0.27, 1.0],
      [-W * 0.16, -L * 0.17, 1.15],
      [W * 0.06, -L * 0.34, 0.85],
      [-W * 0.2, L * 0.1, 0.7],
    ]
    for (const [x, z, sc] of trees) {
      const base = V(x, backY(x, z) - 0.25, z)
      const trunk: THREE.BufferGeometry[] = []
      const crown: THREE.Vector3[] = []
      branch(trunk, crown, base, V(x * 0.08, 1, (random() - 0.5) * 0.2), 1.7 * sc, 0.3 * sc, 2, 0.55, 0.9)
      const pivot = swayPivot(c.body, base, 0.03, 0.7 + random() * 0.4)
      pivot.userData.tree = true
      const local = (v: THREE.Vector3) => v.clone().sub(base)
      const tg = mergeGeometries(trunk.map(g => stripToPN(g).translate(-base.x, -base.y, -base.z)))!
      tg.computeVertexNormals()
      f.clutter.push(addMesh(pivot, tg, bark))
      const cards = cardClump(crown.length * 5, 2.1 * sc, 1.7 * sc, (i, m) => {
        const t = local(crown[i % crown.length])
        const off = V((random() - 0.5) * 1.6, (random() - 0.35) * 1.1, (random() - 0.5) * 1.6).multiplyScalar(sc)
        m.compose(t.add(off), new THREE.Quaternion().setFromEuler(new THREE.Euler((random() - 0.5) * 0.8, random() * 6.28, (random() - 0.5) * 0.8)), V(1, 1, 1))
      })
      const canopy = addMesh(pivot, cards, leaf, true)
      f.clutter.push(canopy)
      const top = local(crown[0]).add(V(0, 0.4, 0))
      emit('leaf', pivot, top, 0.35 * sc)
    }

    // Curtains of vines under the belly and neck, and a root beard under the jaw.
    for (let i = 0; i < 12; i += 1) {
      const z = (random() - 0.5) * L * 0.62
      const side = random() > 0.5 ? 1 : -1
      const { p } = torso(side, z, -0.95 - random() * 0.4, 0.2)
      strand(c.body, p, 1.1 + random() * 1.5, 0.075, mossStrand)
    }
    c.neck.forEach((g, i) => {
      for (let k = 0; k < 2; k += 1) strand(g, V((random() - 0.5) * 0.6, -c.neckR(i) * 0.85, c.neckSeg * (0.3 + k * 0.4)), 0.9 + random() * 0.8, 0.06, mossStrand)
    })
    for (let k = 0; k < 4; k += 1) strand(c.jaw, V((k - 1.5) * 0.22, -c.hh * 0.3, c.hl * (0.25 + random() * 0.2)), 0.5 + random() * 0.5, 0.04, mossStrand, 0.08)

    // Shelf fungi stacked on the flanks; the glowing ones shed spores.
    const shelf = (bone: THREE.Object3D, p: THREE.Vector3, n: THREE.Vector3, r: number, glowing: boolean) => {
      for (let t = 0; t < 3; t += 1) {
        const rr = r * (1 - t * 0.22)
        const g = new THREE.CylinderGeometry(rr, rr * 0.92, 0.12 + rr * 0.08, 16, 1, false, -Math.PI / 2, Math.PI)
        g.scale(1, 1, 0.85)
        const q = new THREE.Quaternion().setFromUnitVectors(Z, V(n.x, 0, n.z).normalize())
        g.applyQuaternion(q)
        g.translate(p.x, p.y + t * (0.22 + rr * 0.2) - 0.2, p.z)
        put(bone, glowing && t === 0 ? fungusGlow : fungus, g)
      }
      if (glowing) emit('spore', bone, p.clone().addScaledVector(n, r * 0.6), 0.45)
    }
    for (let i = 0; i < 9; i += 1) {
      const side = i % 2 ? 1 : -1
      const z = THREE.MathUtils.lerp(L * 0.3, -L * 0.36, i / 8)
      const { p, n } = torso(side, z, (random() - 0.4) * 0.8, 0.05)
      shelf(c.body, p, n, 0.35 + random() * 0.3, i % 3 === 0)
    }
    c.tail.slice(0, 3).forEach((g, i) => shelf(g, V(c.tailR(i) * 0.85, 0, -c.tailSeg * 0.5), V(1, 0, 0), 0.28, i === 1))
  }

  // ─── Ashwing: obsidian and embers ─────────────────────────────────────
  function buildAshwing(): void {
    const obsidian = std({ color: '#241d1e', roughness: 0.24, metalness: 0.08, flatShading: true, envMapIntensity: 0.75 })
    const magma = glowMat('#5a1a08', '#ff5a1f', 1.1, { roughness: 0.5 })
    const vent = glowMat('#3a1206', '#ff7a2a', 2.2, { roughness: 0.6 })
    const shard = (bone: THREE.Object3D, at: THREE.Vector3, h: number, w: number, tiltX: number, tiltZ: number, core = true) => {
      const g = new THREE.ConeGeometry(1, 1, 5, 1)
      g.translate(0, 0.5, 0)
      g.scale(w, h, w * 0.8)
      g.rotateY(random() * 6.28)
      g.rotateX(tiltX)
      g.rotateZ(tiltZ)
      g.translate(at.x, at.y, at.z)
      put(bone, obsidian, g)
      if (core) {
        const m = new THREE.SphereGeometry(1, 8, 6)
        m.scale(w * 0.9, w * 0.35, w * 0.9)
        m.translate(at.x, at.y + w * 0.1, at.z)
        put(bone, magma, m)
      }
    }
    // Obsidian crest down the neck, spine and tail.
    c.neck.forEach((g, i) => {
      const r = c.neckR(i)
      for (let k = 0; k < 2; k += 1) shard(g, V(0, r * 0.85, c.neckSeg * (0.25 + k * 0.45)), 1.6 + i * 0.18, 0.3, -0.55, (random() - 0.5) * 0.2)
    })
    for (let i = 0; i < 9; i += 1) {
      const z = THREE.MathUtils.lerp(L * 0.4, -L * 0.42, i / 8)
      if (Math.abs(z - c.heartZ) < L * 0.08) continue
      const h = 2.2 + Math.sin((i / 8) * Math.PI) * 2.0
      shard(c.body, V(0, backY(0, z) - 0.1, z), h, 0.42, -0.5, 0)
      for (const s of [-1, 1]) if (i % 2 === 0) shard(c.body, V(s * W * 0.16, backY(s * W * 0.16, z) - 0.15, z), h * 0.55, 0.2, -0.45, -s * 0.5)
    }
    c.tail.forEach((g, i) => {
      if (i >= c.tail.length - 1) return
      const r = c.tailR(i)
      shard(g, V(0, r * 0.8, -c.tailSeg * 0.4), 1.4 - i * 0.1, 0.24, -0.7, 0, i % 2 === 0)
    })
    // Spiked brow and jaw: a horned war-mask.
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k += 1) shard(c.head, V(s * c.hw * (0.38 + k * 0.04), c.hh * (0.18 - k * 0.08), c.hl * (0.3 - k * 0.14)), 0.7 - k * 0.12, 0.1, -1.2, -s * 0.7, false)
      for (let k = 0; k < 2; k += 1) shard(c.jaw, V(s * c.hw * 0.3, -c.hh * 0.22, c.hl * (0.2 + k * 0.18)), 0.45, 0.08, Math.PI - 0.5, s * 0.3, false)
    }
    // Ember vents on the upper flanks that smoke and spit sparks.
    for (const s of [-1, 1])
      for (let k = 0; k < 3; k += 1) {
        const z = L * (0.22 - k * 0.2)
        const { p, n } = torso(s, z, 0.55, 0.0)
        const g = new THREE.SphereGeometry(1, 12, 8)
        g.scale(0.16, 0.34, 1.0)
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), n))
        g.translate(p.x, p.y, p.z)
        put(c.body, vent, g)
        emit('ember', c.body, p.clone().addScaledVector(n, 0.3), 1.4)
        if (k !== 1) emit('smoke', c.body, p.clone().addScaledVector(n, 0.4), 0.45)
      }
    emit('ember', c.jaw, V(0, 0, c.hl * 0.55), 0.8)
    emit('smoke', c.head, V(0, c.hh * 0.1, c.hl * 0.9), 0.3)
  }

  // ─── Tidehorn: a walking reef ─────────────────────────────────────────
  function buildTidehorn(): void {
    const coralA = std({ color: '#e27b5c', roughness: 0.82 })
    const coralB = std({ color: '#f0c8a2', roughness: 0.82 })
    const barnacle = std({ color: '#d6d0c2', roughness: 0.86 })
    const kelp = std({ color: '#44603c', roughness: 0.9, side: THREE.DoubleSide })
    const lum = glowMat('#1d5a57', '#4fe3d4', 1.0, { roughness: 0.3 })
    const anemone = glowMat('#2d6f73', '#66f0e2', 0.8, { roughness: 0.4 })
    const fin = std({ color: '#79aeb4', roughness: 0.45, transparent: true, opacity: 0.72, side: THREE.DoubleSide, emissive: new THREE.Color('#2f8f95'), emissiveIntensity: 0.12, depthWrite: false })
    const spine = std({ color: '#d9ddd4', roughness: 0.55 })

    // Coral reefs on the shell.
    for (let i = 0; i < 7; i += 1) {
      const z = THREE.MathUtils.lerp(L * 0.34, -L * 0.36, i / 6) + (random() - 0.5) * 0.6
      if (Math.abs(z - c.heartZ) < L * 0.08) continue
      const x = (i % 2 ? 1 : -1) * W * (0.08 + random() * 0.14)
      const base = V(x, backY(x, z) - 0.2, z)
      const geos: THREE.BufferGeometry[] = []
      const tips: THREE.Vector3[] = []
      for (let k = 0; k < 3; k += 1) branch(geos, tips, base, V((random() - 0.5) * 0.8, 1, (random() - 0.5) * 0.8), 0.9 + random() * 0.5, 0.16, 2, 0.7, 0.8)
      const mat = i % 2 ? coralA : coralB
      mat.userData.clutter = true
      for (const g of geos) put(c.body, mat, g)
      tips.forEach((t, k) => {
        if (k % 2) return
        const s = new THREE.SphereGeometry(0.13, 8, 6)
        s.translate(t.x, t.y, t.z)
        put(c.body, anemone, s)
      })
      if (i % 2 === 0) emit('glint', c.body, tips[0].clone(), 0.35)
    }
    // Barnacles on the back, flanks, head and hips.
    const barn = (bone: THREE.Object3D, p: THREE.Vector3, n: THREE.Vector3, s: number) => {
      const g = new THREE.CylinderGeometry(0.08 * s, 0.17 * s, 0.17 * s, 7, 1, true)
      g.translate(0, 0.08 * s, 0)
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, n.clone().normalize()))
      g.translate(p.x, p.y, p.z)
      put(bone, barnacle, g)
    }
    for (let i = 0; i < 46; i += 1) {
      const side = random() > 0.5 ? 1 : -1
      const { p, n } = torso(side, (random() - 0.5) * L * 0.8, -0.2 + random() * 1.6, 0.04)
      barn(c.body, p, n, 0.8 + random() * 0.9)
    }
    for (let i = 0; i < 10; i += 1) barn(c.head, V((random() - 0.5) * c.hw * 0.8, c.hh * (0.3 + random() * 0.15), c.hl * (0.1 + random() * 0.5)), V(0, 1, 0.2), 0.6 + random() * 0.5)
    for (const hip of c.hips) for (let i = 0; i < 4; i += 1) barn(hip, V((random() - 0.5) * 0.6, -0.6 - random() * 1.2, 0.7), V(0, 0, 1), 0.7)
    // Bioluminescent spot rows along the flanks, neck and tail.
    const spot = (bone: THREE.Object3D, p: THREE.Vector3, r: number) => {
      const g = new THREE.SphereGeometry(r, 8, 6)
      g.translate(p.x, p.y, p.z)
      put(bone, lum, g)
    }
    for (const s of [-1, 1])
      for (let i = 0; i < 11; i += 1) {
        const z = THREE.MathUtils.lerp(L * 0.42, -L * 0.42, i / 10)
        spot(c.body, torso(s, z, 0.12, -0.04).p, 0.2)
        if (i % 2 === 0) spot(c.body, torso(s, z, -0.35, -0.04).p, 0.16)
      }
    c.neck.forEach((g, i) => {
      for (const s of [-1, 1]) spot(g, V(s * c.neckR(i) * 0.95, 0, c.neckSeg * 0.5), 0.12)
    })
    c.tail.forEach((g, i) => {
      for (const s of [-1, 1]) spot(g, V(s * c.tailR(i) * 0.9, c.tailR(i) * 0.25, -c.tailSeg * 0.5), 0.1)
    })
    // Translucent crest fin along the neck and shoulders.
    const crest = (bone: THREE.Object3D, base: THREE.Vector3[], heights: number[]) => {
      const verts: number[] = []
      const idx: number[] = []
      base.forEach((b, i) => {
        const tip = b.clone().add(V(0, heights[i], -heights[i] * 0.35))
        put(bone, spine, taperedTube([b, b.clone().lerp(tip, 0.5).add(V(0, 0, 0.05)), tip], 0.07, 0.015, 8, 6))
        verts.push(b.x, b.y, b.z, tip.x, tip.y - 0.05, tip.z)
        if (i > 0) {
          const a = (i - 1) * 2
          idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
        }
      })
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
      g.setIndex(idx)
      g.computeVertexNormals()
      addMesh(bone, g, fin, false)
    }
    c.neck.forEach((g, i) => {
      const r = c.neckR(i)
      const zs = [0, 0.35, 0.7, 1.0].map(k => c.neckSeg * k)
      crest(g, zs.map(z => V(0, r * 0.88, z)), zs.map((_z, k) => 1.5 + (c.neck.length - i) * 0.45 - k * 0.15))
    })
    const bz = [L * 0.44, L * 0.36, L * 0.28, L * 0.2]
    crest(c.body, bz.map(z => V(0, backY(0, z) - 0.1, z)), [2.6, 2.3, 1.8, 1.1])
    // Dripping kelp from the horns, jaw and belly.
    for (const s of [-1, 1]) strand(c.head, V(s * c.hw * 0.55, c.hh * 0.1, c.hl * 0.2), 1.0 + random() * 0.6, 0.05, kelp, 0.18)
    for (let k = 0; k < 3; k += 1) strand(c.jaw, V((k - 1) * 0.35, -c.hh * 0.3, c.hl * 0.35), 0.7 + random() * 0.5, 0.045, kelp, 0.12)
    for (let i = 0; i < 8; i += 1) {
      const { p } = torso(random() > 0.5 ? 1 : -1, (random() - 0.5) * L * 0.6, -1.0 - random() * 0.3, 0.2)
      strand(c.body, p, 1.0 + random() * 1.2, 0.07, kelp, 0.3)
      if (i % 2 === 0) emit('drip', c.body, p.clone().add(V(0, -0.3, 0)), 1.2)
    }
    emit('drip', c.jaw, V(0, -c.hh * 0.35, c.hl * 0.5), 1.4)
  }
}

/** Keep only position + normal so heterogeneous primitives merge cleanly. */
function stripToPN(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g
  for (const k of Object.keys(out.attributes)) if (k !== 'position' && k !== 'normal') out.deleteAttribute(k)
  if (!out.attributes.normal) out.computeVertexNormals()
  return out
}

/** Secondary motion + glow pulse. `agitation` 0..1 (speed, thrash), `glow` 0..3 (plate glow / rage). */
export function animateFeatures(f: Features, time: number, agitation: number, glow: number): void {
  const amp = 1 + agitation * 1.8
  for (const s of f.sway) s.obj.rotation[s.axis] = s.base + Math.sin(time * s.speed * (1 + agitation * 0.6) + s.phase) * s.amp * amp
  f.glow.forEach((g, i) => {
    g.mat.emissiveIntensity = g.base * (0.8 + 0.2 * Math.sin(time * 1.7 + i * 1.3)) * (1 + glow * 0.45)
  })
}
