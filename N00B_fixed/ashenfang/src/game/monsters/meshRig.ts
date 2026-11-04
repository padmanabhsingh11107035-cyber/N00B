import * as THREE from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { solveTwoBone } from '../ik'
import type { TriplanarUniforms } from '../materials'
import type { Features, Emitter, EmitKind } from './features'
import { sourceQuaternion, type MonsterDef, type Part, type VitalSlot } from './defs'
import { applyOrientation } from './orientation'
import type { Anchor, HitSphere, Leg, MonsterRig, Vital } from './rig'
import { SKELETONS, type SkeletonSpec, type V3 } from './skeletons'

/**
 * Builds a MonsterRig from a generated, textured creature mesh (see scripts/assets/build_meshes.py)
 * and the joint spec in skeletons.ts. The result has the exact same contract as the procedural
 * rig, so the animator, AI, climbing and hit logic run unchanged:
 *  - joint Groups carry identity rotations at rest; legs are IK-posed onto the sculpt's own bend
 *    before binding, and keep that bend direction as their IK pole;
 *  - skin weights come from a two-pass, radius-normalised distance-to-bone-segment field with a
 *    soft exponential falloff (4 influences), which blends joints smoothly on messy scan-like meshes;
 *  - the PBR material keeps the generated albedo/normal/roughness maps with metal and glare cut
 *    down, and gains the enrage glow, wound scarring and hit-flash uniforms of the hide shader.
 */
let modelSource: (key: string) => GLTF | undefined = () => undefined
export function setMonsterModelSource(fn: (key: string) => GLTF | undefined): void {
  modelSource = fn
}
export function meshModelFor(def: MonsterDef): GLTF | undefined {
  const spec = SKELETONS[def.id as keyof typeof SKELETONS]
  return spec ? modelSource(spec.model) : undefined
}

const MAX_WOUNDS = 6
type GlowMask = 'ember' | 'cyan' | 'amber'
const LOOK: Record<string, { mask: GlowMask; glow: string; base: number; metal: number; emit: [EmitKind, 'body' | 'head' | 'tail' | 'back', number][] }> = {
  mossback: { mask: 'amber', glow: '#ffb347', base: 0.0, metal: 0.05, emit: [['leaf', 'back', 0.9], ['spore', 'head', 1.2], ['spore', 'body', 0.8]] },
  ashwing: { mask: 'ember', glow: '#ff5a1f', base: 0.9, metal: 0.2, emit: [['ember', 'back', 2.2], ['ember', 'tail', 1.4], ['smoke', 'head', 0.7]] },
  tidehorn: { mask: 'cyan', glow: '#3fe0ff', base: 0.55, metal: 0.12, emit: [['drip', 'body', 1.6], ['drip', 'head', 1.0], ['glint', 'back', 0.8]] },
}

const V = (p: V3) => new THREE.Vector3(p[0], p[1], p[2])
const _p = new THREE.Vector3()

function segDist(px: number, py: number, pz: number, a: THREE.Vector3, ab: THREE.Vector3, abLenSq: number): number {
  const apx = px - a.x
  const apy = py - a.y
  const apz = pz - a.z
  let t = abLenSq > 1e-9 ? (apx * ab.x + apy * ab.y + apz * ab.z) / abLenSq : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const dx = apx - ab.x * t
  const dy = apy - ab.y * t
  const dz = apz - ab.z * t
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/** Dequantise and bake the node transform so positions are plain metres in the model frame. */
function extractGeometry(gltf: GLTF): { geo: THREE.BufferGeometry; src: THREE.MeshStandardMaterial } {
  let mesh: THREE.Mesh | undefined
  gltf.scene.updateMatrixWorld(true)
  gltf.scene.traverse(o => {
    if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh
  })
  if (!mesh) throw new Error('monster GLB has no mesh')
  const g = mesh.geometry
  const geo = new THREE.BufferGeometry()
  for (const name of ['position', 'normal', 'uv'] as const) {
    const at = g.getAttribute(name) as THREE.BufferAttribute | undefined
    if (!at) continue
    const n = at.count
    const out = new Float32Array(n * at.itemSize)
    for (let i = 0; i < n; i += 1) for (let c = 0; c < at.itemSize; c += 1) out[i * at.itemSize + c] = at.getComponent(i, c)
    geo.setAttribute(name, new THREE.BufferAttribute(out, at.itemSize))
  }
  if (g.index) geo.setIndex(new THREE.BufferAttribute(Uint32Array.from(g.index.array as ArrayLike<number>), 1))
  geo.applyMatrix4(mesh.matrixWorld)
  if (!geo.getAttribute('normal')) geo.computeVertexNormals()
  return { geo, src: mesh.material as THREE.MeshStandardMaterial }
}

function hideMaterial(src: THREE.MeshStandardMaterial, look: (typeof LOOK)[string]): THREE.MeshStandardMaterial & { userData: { uniforms: TriplanarUniforms } } {
  const mat = new THREE.MeshStandardMaterial({
    map: src.map,
    normalMap: src.normalMap,
    roughnessMap: src.roughnessMap,
    metalnessMap: src.metalnessMap,
    roughness: 1,
    metalness: look.metal,
    envMapIntensity: 0.55,
    normalScale: new THREE.Vector2(1, 1),
  })
  if (src.normalScale) mat.normalScale.copy(src.normalScale)
  const uniforms = {
    uEnrage: { value: 0 },
    uFlash: { value: 0 },
    uWounds: { value: Array.from({ length: MAX_WOUNDS }, () => new THREE.Vector4(0, -999, 0, 0)) },
    uWoundColor: { value: new THREE.Color('#ff5a2a') },
    uGlow: { value: new THREE.Color(look.glow) },
    uGlowBase: { value: look.base },
    uTime: { value: 0 },
  }
  const maskGlsl =
    look.mask === 'ember'
      ? 'smoothstep(0.06, 0.22, c.r - max(c.g, c.b) * 1.35)'
      : look.mask === 'cyan'
        ? 'smoothstep(0.05, 0.2, c.b - c.r * 1.4) * smoothstep(0.08, 0.2, c.g)'
        : 'smoothstep(0.02, 0.14, c.r - c.b * 1.9) * smoothstep(0.25, 0.4, c.r)'
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vRest;
uniform float uEnrage, uFlash, uGlowBase, uTime;
uniform vec3 uGlow, uWoundColor;
uniform vec4 uWounds[${MAX_WOUNDS}];`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
{
  vec3 c = diffuseColor.rgb;
  float m = ${maskGlsl};
  float pulse = 0.7 + 0.3 * sin(vRest.z * 1.1 + vRest.y * 1.7 - uTime * 2.4);
  totalEmissiveRadiance += uGlow * m * pulse * (uGlowBase + uEnrage * 1.8);
  // Enrage: dark crevices of the hide flush with a faint inner heat.
  float lum = dot(c, vec3(0.3, 0.59, 0.11));
  totalEmissiveRadiance += uGlow * smoothstep(0.06, 0.015, lum) * uEnrage * 0.35 * pulse;
}
for (int i = 0; i < ${MAX_WOUNDS}; i++) {
  vec4 w = uWounds[i];
  if (w.w <= 0.0) continue;
  float d = length(vRest - w.xyz) / max(w.w, 0.01);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.07, 0.04), smoothstep(1.0, 0.4, d) * 0.5);
  totalEmissiveRadiance += uWoundColor * smoothstep(1.0, 0.6, d) * smoothstep(0.35, 0.8, d) * 0.6;
}
totalEmissiveRadiance += vec3(1.0, 0.92, 0.82) * uFlash;`,
      )
  }
  mat.customProgramCacheKey = () => `meshhide-${look.mask}`
  return Object.assign(mat, { userData: { uniforms } }) as never
}

function crystalGeometry(seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const r = (i: number) => Math.abs(Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453) % 1
  for (let i = 0; i < 4; i += 1) {
    const g = new THREE.OctahedronGeometry(0.22 + r(i) * 0.12, 0)
    g.scale(0.7, 2.2 + r(i + 4) * 0.8, 0.7)
    g.rotateZ((r(i + 8) - 0.5) * 1.1)
    g.rotateX((r(i + 12) - 0.5) * 1.1)
    g.translate((r(i + 16) - 0.5) * 0.5, 0.25, (r(i + 20) - 0.5) * 0.5)
    parts.push(g.toNonIndexed())
  }
  const pos: number[] = []
  for (const p of parts) pos.push(...(p.getAttribute('position').array as Float32Array))
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  out.computeVertexNormals()
  for (const p of parts) p.dispose()
  return out
}

export function buildMeshMonster(def: MonsterDef, gltf: GLTF): MonsterRig {
  const t0 = performance.now()
  const spec: SkeletonSpec = SKELETONS[def.id as keyof typeof SKELETONS]
  const look = LOOK[def.id] ?? LOOK.mossback
  const disposables: { dispose(): void }[] = []

  const root = new THREE.Group()
  root.name = `monster:${def.id}`
  const orient = new THREE.Group()
  applyOrientation(orient, def)
  const source = new THREE.Group()
  // Same simulated source facing as the procedural rig, so the registry correction cancels it.
  source.quaternion.set(...sourceQuaternion(def.plan.sourceFacing))
  const content = new THREE.Group()
  root.add(orient)
  orient.add(source)
  source.add(content)

  // ─── skeleton ───────────────────────────────────────────────────────────
  const abs = new Map<THREE.Object3D, THREE.Vector3>()
  abs.set(content, new THREE.Vector3())
  const joint = (name: string, parent: THREE.Object3D, at: THREE.Vector3): THREE.Group => {
    const g = new THREE.Group()
    g.name = name
    g.position.copy(at).sub(abs.get(parent)!)
    parent.add(g)
    abs.set(g, at.clone())
    return g
  }
  const body = joint('body', content, new THREE.Vector3(0, spec.bodyY, 0))
  const chest = joint('chest', body, V(spec.chest))
  const neck: THREE.Group[] = []
  let parent: THREE.Object3D = chest
  spec.neck.forEach((p, i) => {
    const g = joint(`neck${i}`, parent, V(p))
    neck.push(g)
    parent = g
  })
  const head = joint('head', parent, V(spec.head))
  const jaw = joint('jaw', head, V(spec.jaw?.at ?? spec.head))
  const tail: THREE.Group[] = []
  parent = body
  spec.tail.forEach((p, i) => {
    const g = joint(`tail${i}`, parent, V(p))
    tail.push(g)
    parent = g
  })
  const tailEnd = joint('tailEnd', parent, V(spec.tailTip))

  const legs: Leg[] = []
  spec.legs.forEach((ls, i) => {
    const hipAt = V(ls.hip)
    const kneeAt = V(ls.knee)
    const footAt = V(ls.foot)
    const side = (ls.hip[0] >= 0 ? 1 : -1) as 1 | -1
    const hip = joint(`${ls.front ? 'f' : 'b'}${side > 0 ? 'L' : 'R'}hip${i}`, body, hipAt)
    const upper = kneeAt.distanceTo(hipAt)
    const lower = footAt.distanceTo(kneeAt)
    const knee = new THREE.Group()
    knee.name = hip.name.replace('hip', 'knee')
    knee.position.set(0, -upper, 0)
    hip.add(knee)
    const foot = new THREE.Group()
    foot.name = hip.name.replace('hip', 'foot')
    foot.position.set(0, -lower, 0)
    knee.add(foot)
    // Rest bend direction -> pole (in the hip's parent space, which is body space).
    const bodyAbs = abs.get(body)!
    const hipL = hipAt.clone().sub(bodyAbs)
    const footL = footAt.clone().sub(bodyAbs)
    const kneeL = kneeAt.clone().sub(bodyAbs)
    const axis = footL.clone().sub(hipL).normalize()
    const kv = kneeL.clone().sub(hipL)
    const pole = kv.sub(axis.clone().multiplyScalar(kv.dot(axis)))
    if (pole.lengthSq() < 1e-6) pole.set(0, 0, ls.front ? -1 : 1)
    pole.normalize()
    solveTwoBone(hip, knee, footL, upper, lower, pole)
    foot.quaternion.copy(hip.quaternion).multiply(knee.quaternion).invert()
    legs.push({
      hip, knee, foot, upper, lower, front: ls.front, side,
      rest: footL.clone(),
      home: new THREE.Vector3(footAt.x, 0, footAt.z),
      pole,
      gait: ls.gait,
    })
  })

  // ─── bone segments for skin weights ───────────────────────────────────────
  type Seg = { bone: THREE.Object3D; a: THREE.Vector3; b: THREE.Vector3; part: Part }
  const segs: Seg[] = []
  const seg = (bone: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, part: Part) => segs.push({ bone, a, b, part })
  seg(body, V(spec.pelvis), V(spec.chest), 'body')
  seg(chest, V(spec.chest), V(spec.neck[0] ?? spec.head), 'body')
  spec.neck.forEach((p, i) => seg(neck[i], V(p), V(spec.neck[i + 1] ?? spec.head), 'neck'))
  seg(head, V(spec.head), V(spec.headTip), 'head')
  if (spec.jaw) seg(jaw, V(spec.jaw.at), V(spec.jaw.tip), 'head')
  spec.tail.forEach((p, i) => seg(tail[i], V(p), V(spec.tail[i + 1] ?? spec.tailTip), 'tail'))
  const lastTail = V(spec.tail[spec.tail.length - 1] ?? spec.pelvis)
  const tipDir = V(spec.tailTip).sub(lastTail).multiplyScalar(0.45)
  seg(tailEnd, V(spec.tailTip), V(spec.tailTip).add(tipDir), 'tail')
  spec.legs.forEach((ls, i) => {
    const l = legs[i]
    seg(l.hip, V(ls.hip), V(ls.knee), 'leg')
    seg(l.knee, V(ls.knee), V(ls.foot), 'leg')
    const f = V(ls.foot)
    seg(l.foot, f, f.clone().add(new THREE.Vector3(0, -0.1, 0.5)), 'leg')
  })
  const ab = segs.map(s => s.b.clone().sub(s.a))
  const abL = ab.map(v => v.lengthSq())

  // ─── geometry + weights ─────────────────────────────────────────────────
  const { geo, src } = extractGeometry(gltf)
  disposables.push(geo)
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const n = pos.count
  const S = segs.length
  const dist = new Float32Array(n * S)
  const nearest = new Uint16Array(n)
  for (let v = 0; v < n; v += 1) {
    const x = pos.getX(v)
    const y = pos.getY(v)
    const z = pos.getZ(v)
    let best = 1e9
    let bi = 0
    for (let s = 0; s < S; s += 1) {
      const d = segDist(x, y, z, segs[s].a, ab[s], abL[s])
      dist[v * S + s] = d
      if (d < best) {
        best = d
        bi = s
      }
    }
    nearest[v] = bi
  }
  // Pass 2: bone "thickness" = 70th percentile distance of its nearest vertices.
  const radius = new Float32Array(S)
  {
    const buckets: number[][] = Array.from({ length: S }, () => [])
    for (let v = 0; v < n; v += 1) buckets[nearest[v]].push(dist[v * S + nearest[v]])
    for (let s = 0; s < S; s += 1) {
      const b = buckets[s].sort((p, q) => p - q)
      radius[s] = Math.max(0.3, b.length ? b[Math.floor(b.length * 0.7)] : 0.6)
    }
  }
  const skinIndex = new Uint16Array(n * 4)
  const skinWeight = new Float32Array(n * 4)
  const K = 5.5
  const idx = [0, 0, 0, 0]
  const nd = [0, 0, 0, 0]
  for (let v = 0; v < n; v += 1) {
    nd.fill(1e9)
    for (let s = 0; s < S; s += 1) {
      const q = dist[v * S + s] / radius[s]
      if (q < nd[3]) {
        let k = 3
        while (k > 0 && q < nd[k - 1]) {
          nd[k] = nd[k - 1]
          idx[k] = idx[k - 1]
          k -= 1
        }
        nd[k] = q
        idx[k] = s
      }
    }
    let sum = 0
    const w = [0, 0, 0, 0]
    for (let k = 0; k < 4; k += 1) {
      w[k] = Math.exp(-(nd[k] - nd[0]) * K)
      if (w[k] < 0.02) w[k] = 0
      sum += w[k]
    }
    for (let k = 0; k < 4; k += 1) {
      skinIndex[v * 4 + k] = idx[k]
      skinWeight[v * 4 + k] = w[k] / sum
    }
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4))
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4))
  geo.computeBoundingSphere()

  // Surface snapping for vitals/anchors: highest vertex in a small column around (x, z).
  const surfaceTop = (p: THREE.Vector3, r = 0.55, below = 2.2, above = 0.9): THREE.Vector3 => {
    let best = -1e9
    for (let v = 0; v < n; v += 1) {
      const y = pos.getY(v)
      if (y < p.y - below || y > p.y + above) continue
      const dx = pos.getX(v) - p.x
      const dz = pos.getZ(v) - p.z
      if (dx * dx + dz * dz < r * r && y > best) best = y
    }
    return new THREE.Vector3(p.x, best > -1e8 ? best : p.y, p.z)
  }

  // ─── mesh ─────────────────────────────────────────────────────────────
  const hideMat = hideMaterial(src, look)
  disposables.push(hideMat)
  const skinMesh = new THREE.SkinnedMesh(geo, hideMat)
  skinMesh.name = 'skin'
  skinMesh.castShadow = true
  skinMesh.receiveShadow = true
  skinMesh.frustumCulled = false
  content.add(skinMesh)
  root.updateMatrixWorld(true)
  skinMesh.bind(new THREE.Skeleton(segs.map(s => s.bone) as THREE.Bone[]), skinMesh.matrixWorld)

  const toBone = (bone: THREE.Object3D, contentPoint: THREE.Vector3) => bone.worldToLocal(content.localToWorld(contentPoint.clone()))

  // ─── vitals ─────────────────────────────────────────────────────────────
  const vitalMat = (slot: VitalSlot) => {
    const m = new THREE.MeshStandardMaterial({ color: look.glow, emissive: look.glow, emissiveIntensity: 1.1, roughness: 0.35, metalness: 0, transparent: true, opacity: 0.92 })
    m.name = `vital:${slot}`
    disposables.push(m)
    return m
  }
  const vitalBone: Record<VitalSlot, THREE.Object3D> = { head, back: body, tail: tailEnd }
  const vitalAt: Record<VitalSlot, THREE.Vector3> = {
    head: surfaceTop(V(spec.vitals.head), 0.45, 1.6, 0.6),
    back: surfaceTop(V(spec.vitals.back), 0.6, 2.5, 1.2),
    tail: surfaceTop(V(spec.vitals.tail), 0.5, 1.8, 0.8),
  }
  const vitals = {} as Record<VitalSlot, Vital>
  ;(['head', 'back', 'tail'] as VitalSlot[]).forEach((slot, i) => {
    const g = crystalGeometry(i + def.id.length)
    disposables.push(g)
    const mat = vitalMat(slot)
    const mesh = new THREE.Mesh(g, mat)
    mesh.name = `vital:${slot}`
    mesh.castShadow = false
    const bone = vitalBone[slot]
    mesh.position.copy(toBone(bone, vitalAt[slot].clone().add(new THREE.Vector3(0, -0.15, 0))))
    mesh.scale.setScalar(slot === 'back' ? 1.25 : 1)
    bone.add(mesh)
    vitals[slot] = { slot, mesh, mat, bone, broken: false, hp: 1, max: 1 }
  })

  // ─── hit spheres ───────────────────────────────────────────────────────
  const hitSpheres: HitSphere[] = []
  segs.forEach((s, i) => {
    const len = Math.sqrt(abL[i])
    const r = radius[i] * 1.05
    const count = Math.max(1, Math.min(4, Math.round(len / Math.max(0.6, r * 1.3))))
    for (let k = 0; k < count; k += 1) {
      const t = (k + 0.5) / count
      _p.copy(s.a).lerp(s.b, t)
      hitSpheres.push({ bone: s.bone, offset: toBone(s.bone, _p), radius: r, part: s.part, world: new THREE.Vector3() })
    }
  })
  const partOf: Record<VitalSlot, Part> = { head: 'head', back: 'body', tail: 'tail' }
  for (const slot of ['head', 'back', 'tail'] as VitalSlot[]) {
    hitSpheres.push({ bone: vitalBone[slot], offset: toBone(vitalBone[slot], vitalAt[slot]), radius: slot === 'back' ? 1.3 : 1.0, part: partOf[slot], vital: slot, world: new THREE.Vector3() })
  }

  // ─── climb anchors ──────────────────────────────────────────────────────
  const anchors: Anchor[] = []
  const vitalName = (slot: VitalSlot) => def.vitals.find(v => v.slot === slot)!.name
  const anchor = (id: string, label: string, bone: THREE.Object3D, at: THREE.Vector3, vital?: VitalSlot, ride?: boolean) =>
    anchors.push({ id, label, bone, offset: toBone(bone, at), vital, ride, world: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) })
  anchor('tail', vitalName('tail'), tailEnd, vitalAt.tail, 'tail')
  const tb = tail[Math.min(1, tail.length - 1)]
  anchor('tailBase', 'Tail', tb, surfaceTop(abs.get(tb)!.clone(), 0.6, 2, 2))
  anchor('back', vitalName('back'), body, surfaceTop(vitalAt.back.clone().add(new THREE.Vector3(0, 0, -0.9)), 0.6, 2.5, 1.5), 'back')
  anchor('shoulders', 'Shoulders', chest, surfaceTop(V(spec.chest), 0.6, 1, 3.5))
  const nb = neck[Math.max(0, neck.length - 2)] ?? chest
  anchor('neck', 'Neck', nb, surfaceTop(abs.get(nb)!.clone(), 0.5, 1, 2.5), undefined, true)
  anchor('head', vitalName('head'), head, vitalAt.head, 'head')

  // ─── ambient emitters ───────────────────────────────────────────────────
  const emitBone = { body, head, tail: tailEnd, back: body }
  const emitAt = { body: V(spec.chest).lerp(V(spec.pelvis), 0.5), head: V(spec.head), tail: V(spec.tailTip), back: vitalAt.back }
  const emitters: Emitter[] = look.emit.map(([kind, where, rate]) => ({ kind, bone: emitBone[where], offset: toBone(emitBone[where], emitAt[where]), rate, acc: Math.random() }))
  const features: Features = { glow: [], emitters, sway: [], clutter: [] }

  // ─── dims ─────────────────────────────────────────────────────────────
  geo.computeBoundingBox()
  const bb = geo.boundingBox!
  let bw = 0
  let byMin = 1e9
  let byMax = -1e9
  for (let v = 0; v < n; v += 1) {
    const s = nearest[v]
    if (s > 1) continue
    bw = Math.max(bw, Math.abs(pos.getX(v)))
    byMin = Math.min(byMin, pos.getY(v))
    byMax = Math.max(byMax, pos.getY(v))
  }
  const neckLen = spec.neck.reduce((acc, p, i) => acc + V(p).distanceTo(V(spec.neck[i + 1] ?? spec.head)), 0)
  const tailLen = spec.tail.reduce((acc, p, i) => acc + V(p).distanceTo(V(spec.tail[i + 1] ?? spec.tailTip)), 0)
  const plateMat = new THREE.MeshStandardMaterial({ color: '#222' })
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#222' })
  disposables.push(plateMat, eyeMat)
  const tris = geo.index ? geo.index.count / 3 : n / 3
  return {
    def, root, orient, source, content, body, chest, neck, head, jaw, tail, tailEnd, legs, vitals, hitSpheres, anchors,
    plateMat, eyeMat, hideMat,
    skin: hideMat.userData.uniforms,
    features,
    skinMesh,
    clutter: [],
    authored: true,
    dims: {
      hipHeight: spec.bodyY,
      bodyLength: Math.abs(spec.chest[2] - spec.pelvis[2]),
      bodyWidth: bw * 2,
      bodyHeight: byMax - byMin,
      neckSeg: neckLen / Math.max(1, spec.neck.length),
      tailSeg: tailLen / Math.max(1, spec.tail.length),
      headLength: V(spec.head).distanceTo(V(spec.headTip)),
      length: bb.max.z - bb.min.z,
      height: bb.max.y,
    },
    stats: { verts: n, tris, ms: performance.now() - t0 },
    dispose() {
      skinMesh.skeleton.dispose()
      for (const d of disposables) d.dispose()
    },
  }
}

/** Advance time-based shader effects (glow pulse) for mesh rigs. */
export function tickMeshRig(rig: MonsterRig, time: number): void {
  const u = rig.skin as TriplanarUniforms & { uTime?: { value: number } }
  if (u.uTime) u.uTime.value = time
}
