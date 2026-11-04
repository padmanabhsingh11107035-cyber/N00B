import * as THREE from 'three'

/**
 * Implicit-surface creature sculpting.
 *
 * A body plan registers primitives (ellipsoids and tapered capsules) in the local space of the
 * bone that should carry them. At rest pose the primitives are evaluated as a smooth-union
 * signed distance field on a grid, meshed with naive surface nets, relaxed with Taubin
 * smoothing and skinned: every vertex is weighted to the bones whose primitives it is closest to,
 * then weights are diffused across mesh neighbours so joints bend like flesh instead of hinging.
 */
export type Prim =
  | { kind: 'ellipsoid'; bone: THREE.Object3D; center: THREE.Vector3; radii: THREE.Vector3; rot?: THREE.Euler; blend: number }
  | { kind: 'capsule'; bone: THREE.Object3D; a: THREE.Vector3; b: THREE.Vector3; ra: number; rb: number; blend: number }

type Compiled = {
  boneIndex: number
  kind: 0 | 1
  blend: number
  // ellipsoid: centre + inverse rotation (3x3) + radii; capsule: endpoints + radii
  c: THREE.Vector3
  inv: THREE.Matrix3
  r: THREE.Vector3
  a: THREE.Vector3
  ba: THREE.Vector3
  baLen2: number
  ra: number
  rb: number
  min: THREE.Vector3
  max: THREE.Vector3
}

const _p = new THREE.Vector3()
const _q = new THREE.Vector3()

function evalPrim(c: Compiled, x: number, y: number, z: number): number {
  if (c.kind === 0) {
    _p.set(x - c.c.x, y - c.c.y, z - c.c.z).applyMatrix3(c.inv)
    const k0 = Math.hypot(_p.x / c.r.x, _p.y / c.r.y, _p.z / c.r.z)
    const k1 = Math.hypot(_p.x / (c.r.x * c.r.x), _p.y / (c.r.y * c.r.y), _p.z / (c.r.z * c.r.z))
    return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(c.r.x, c.r.y, c.r.z)
  }
  const px = x - c.a.x
  const py = y - c.a.y
  const pz = z - c.a.z
  let h = (px * c.ba.x + py * c.ba.y + pz * c.ba.z) / c.baLen2
  h = h < 0 ? 0 : h > 1 ? 1 : h
  const dx = px - c.ba.x * h
  const dy = py - c.ba.y * h
  const dz = pz - c.ba.z * h
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (c.ra + (c.rb - c.ra) * h)
}

function smin(a: number, b: number, k: number): number {
  if (k <= 1e-4) return Math.min(a, b)
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}

export type SculptResult = { geometry: THREE.BufferGeometry; bones: THREE.Object3D[]; stats: { verts: number; tris: number; ms: number } }

export function sculpt(space: THREE.Object3D, prims: Prim[], cell = 0.18): SculptResult {
  const t0 = performance.now()
  space.updateMatrixWorld(true)
  const spaceInv = new THREE.Matrix4().copy(space.matrixWorld).invert()
  const bones: THREE.Object3D[] = []
  const boneIdx = new Map<THREE.Object3D, number>()
  const compiled: Compiled[] = []
  const m = new THREE.Matrix4()
  const rotM = new THREE.Matrix4()
  const gmin = new THREE.Vector3(Infinity, Infinity, Infinity)
  const gmax = new THREE.Vector3(-Infinity, -Infinity, -Infinity)
  for (const pr of prims) {
    let bi = boneIdx.get(pr.bone)
    if (bi === undefined) {
      bi = bones.length
      bones.push(pr.bone)
      boneIdx.set(pr.bone, bi)
    }
    m.multiplyMatrices(spaceInv, pr.bone.matrixWorld)
    const c: Compiled = {
      boneIndex: bi, kind: pr.kind === 'ellipsoid' ? 0 : 1, blend: pr.blend, c: new THREE.Vector3(), inv: new THREE.Matrix3(), r: new THREE.Vector3(),
      a: new THREE.Vector3(), ba: new THREE.Vector3(), baLen2: 1, ra: 0, rb: 0, min: new THREE.Vector3(), max: new THREE.Vector3(),
    }
    const pad = pr.blend * 0.6 + cell * 2
    if (pr.kind === 'ellipsoid') {
      c.c.copy(pr.center).applyMatrix4(m)
      rotM.extractRotation(m)
      if (pr.rot) rotM.multiply(new THREE.Matrix4().makeRotationFromEuler(pr.rot))
      c.inv.setFromMatrix4(rotM).transpose()
      c.r.copy(pr.radii)
      const rr = Math.max(pr.radii.x, pr.radii.y, pr.radii.z) + pad
      c.min.copy(c.c).subScalar(rr)
      c.max.copy(c.c).addScalar(rr)
    } else {
      c.a.copy(pr.a).applyMatrix4(m)
      const b = pr.b.clone().applyMatrix4(m)
      c.ba.subVectors(b, c.a)
      c.baLen2 = Math.max(1e-6, c.ba.lengthSq())
      c.ra = pr.ra
      c.rb = pr.rb
      const rr = Math.max(pr.ra, pr.rb) + pad
      c.min.copy(c.a).min(b).subScalar(rr)
      c.max.copy(c.a).max(b).addScalar(rr)
    }
    gmin.min(c.min)
    gmax.max(c.max)
    compiled.push(c)
  }
  const nx = Math.ceil((gmax.x - gmin.x) / cell) + 1
  const ny = Math.ceil((gmax.y - gmin.y) / cell) + 1
  const nz = Math.ceil((gmax.z - gmin.z) / cell) + 1
  const N = nx * ny * nz
  const field = new Float32Array(N).fill(1e3)
  const idx = (i: number, j: number, k: number) => i + nx * (j + ny * k)
  // Evaluate each primitive only inside its padded bounds.
  for (const c of compiled) {
    const i0 = Math.max(0, Math.floor((c.min.x - gmin.x) / cell))
    const i1 = Math.min(nx - 1, Math.ceil((c.max.x - gmin.x) / cell))
    const j0 = Math.max(0, Math.floor((c.min.y - gmin.y) / cell))
    const j1 = Math.min(ny - 1, Math.ceil((c.max.y - gmin.y) / cell))
    const k0 = Math.max(0, Math.floor((c.min.z - gmin.z) / cell))
    const k1 = Math.min(nz - 1, Math.ceil((c.max.z - gmin.z) / cell))
    for (let k = k0; k <= k1; k += 1) {
      const z = gmin.z + k * cell
      for (let j = j0; j <= j1; j += 1) {
        const y = gmin.y + j * cell
        let o = idx(i0, j, k)
        for (let i = i0; i <= i1; i += 1, o += 1) {
          const d = evalPrim(c, gmin.x + i * cell, y, z)
          field[o] = smin(field[o], d, c.blend)
        }
      }
    }
  }
  // Surface nets: one vertex per sign-changing cell.
  const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1)
  const cidx = (i: number, j: number, k: number) => i + (nx - 1) * (j + (ny - 1) * k)
  const pos: number[] = []
  const corner = new Float32Array(8)
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]
  const off = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]]
  for (let k = 0; k < nz - 1; k += 1)
    for (let j = 0; j < ny - 1; j += 1)
      for (let i = 0; i < nx - 1; i += 1) {
        let mask = 0
        for (let c = 0; c < 8; c += 1) {
          const v = field[idx(i + off[c][0], j + off[c][1], k + off[c][2])]
          corner[c] = v
          if (v < 0) mask |= 1 << c
        }
        if (mask === 0 || mask === 255) continue
        let sx = 0
        let sy = 0
        let sz = 0
        let n = 0
        for (const [a, b] of EDGES) {
          const va = corner[a]
          const vb = corner[b]
          if (va < 0 === vb < 0) continue
          const t = va / (va - vb)
          sx += off[a][0] + (off[b][0] - off[a][0]) * t
          sy += off[a][1] + (off[b][1] - off[a][1]) * t
          sz += off[a][2] + (off[b][2] - off[a][2]) * t
          n += 1
        }
        cellVert[cidx(i, j, k)] = pos.length / 3
        pos.push(gmin.x + (i + sx / n) * cell, gmin.y + (j + sy / n) * cell, gmin.z + (k + sz / n) * cell)
      }
  const index: number[] = []
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return
    if (flip) index.push(a, c, b, a, d, c)
    else index.push(a, b, c, a, c, d)
  }
  for (let k = 1; k < nz - 1; k += 1)
    for (let j = 1; j < ny - 1; j += 1)
      for (let i = 1; i < nx - 1; i += 1) {
        const inside = field[idx(i, j, k)] < 0
        if (i < nx - 1 && inside !== field[idx(i + 1, j, k)] < 0)
          quad(cellVert[cidx(i, j - 1, k - 1)], cellVert[cidx(i, j, k - 1)], cellVert[cidx(i, j, k)], cellVert[cidx(i, j - 1, k)], !inside)
        if (j < ny - 1 && inside !== field[idx(i, j + 1, k)] < 0)
          quad(cellVert[cidx(i - 1, j, k - 1)], cellVert[cidx(i - 1, j, k)], cellVert[cidx(i, j, k)], cellVert[cidx(i, j, k - 1)], !inside)
        if (k < nz - 1 && inside !== field[idx(i, j, k + 1)] < 0)
          quad(cellVert[cidx(i - 1, j - 1, k)], cellVert[cidx(i, j - 1, k)], cellVert[cidx(i, j, k)], cellVert[cidx(i - 1, j, k)], !inside)
      }
  const V = pos.length / 3
  const P = new Float32Array(pos)
  // Adjacency for smoothing and weight diffusion.
  const nbr: number[][] = Array.from({ length: V }, () => [])
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t]
    const b = index[t + 1]
    const c = index[t + 2]
    nbr[a].push(b, c)
    nbr[b].push(a, c)
    nbr[c].push(a, b)
  }
  const tmp = new Float32Array(P.length)
  const relax = (lambda: number) => {
    for (let v = 0; v < V; v += 1) {
      const ns = nbr[v]
      if (!ns.length) {
        tmp[v * 3] = P[v * 3]
        tmp[v * 3 + 1] = P[v * 3 + 1]
        tmp[v * 3 + 2] = P[v * 3 + 2]
        continue
      }
      let ax = 0
      let ay = 0
      let az = 0
      for (const n of ns) {
        ax += P[n * 3]
        ay += P[n * 3 + 1]
        az += P[n * 3 + 2]
      }
      const inv = 1 / ns.length
      tmp[v * 3] = P[v * 3] + (ax * inv - P[v * 3]) * lambda
      tmp[v * 3 + 1] = P[v * 3 + 1] + (ay * inv - P[v * 3 + 1]) * lambda
      tmp[v * 3 + 2] = P[v * 3 + 2] + (az * inv - P[v * 3 + 2]) * lambda
    }
    P.set(tmp)
  }
  for (let it = 0; it < 3; it += 1) {
    relax(0.55)
    relax(-0.58)
  }
  // Skin weights from primitive proximity (per bone: the nearest of its primitives).
  const B = bones.length
  const W = new Float32Array(V * B)
  for (let v = 0; v < V; v += 1) {
    const x = P[v * 3]
    const y = P[v * 3 + 1]
    const z = P[v * 3 + 2]
    let total = 0
    for (const c of compiled) {
      if (x < c.min.x || y < c.min.y || z < c.min.z || x > c.max.x || y > c.max.y || z > c.max.z) continue
      const d = Math.max(0, evalPrim(c, x, y, z) + cell)
      const w = 1 / Math.pow(0.05 + d, 4)
      const o = v * B + c.boneIndex
      if (w > W[o]) {
        total += w - W[o]
        W[o] = w
      }
    }
    if (total <= 0) {
      // Fallback: nearest primitive overall.
      let best = 0
      let bd = Infinity
      for (const c of compiled) {
        const d = evalPrim(c, x, y, z)
        if (d < bd) {
          bd = d
          best = c.boneIndex
        }
      }
      W[v * B + best] = 1
    }
  }
  // Normalise then diffuse across neighbours for soft, fleshy joints.
  const normRow = (arr: Float32Array, v: number) => {
    let s = 0
    for (let b = 0; b < B; b += 1) s += arr[v * B + b]
    if (s > 0) for (let b = 0; b < B; b += 1) arr[v * B + b] /= s
  }
  for (let v = 0; v < V; v += 1) normRow(W, v)
  const W2 = new Float32Array(W.length)
  for (let it = 0; it < 4; it += 1) {
    for (let v = 0; v < V; v += 1) {
      const ns = nbr[v]
      for (let b = 0; b < B; b += 1) {
        let acc = W[v * B + b] * 2
        for (const n of ns) acc += W[n * B + b] / (ns.length / 2 || 1)
        W2[v * B + b] = acc / 3
      }
      normRow(W2, v)
    }
    W.set(W2)
  }
  const skinIndex = new Uint16Array(V * 4)
  const skinWeight = new Float32Array(V * 4)
  const order: number[] = []
  for (let v = 0; v < V; v += 1) {
    order.length = 0
    for (let b = 0; b < B; b += 1) if (W[v * B + b] > 1e-4) order.push(b)
    order.sort((a, b) => W[v * B + b] - W[v * B + a])
    let s = 0
    for (let q = 0; q < 4 && q < order.length; q += 1) s += W[v * B + order[q]]
    for (let q = 0; q < 4; q += 1) {
      const b = order[q]
      skinIndex[v * 4 + q] = b ?? 0
      skinWeight[v * 4 + q] = b === undefined ? 0 : W[v * B + b] / (s || 1)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(P, 3))
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4))
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4))
  geometry.setIndex(V > 65535 ? new THREE.Uint32BufferAttribute(index, 1) : new THREE.Uint16BufferAttribute(index, 1))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  void _q
  return { geometry, bones, stats: { verts: V, tris: index.length / 3, ms: Math.round(performance.now() - t0) } }
}

/** Build a SkinnedMesh bound to the (Group-based) bone hierarchy at its current rest pose. */
export function skinnedFrom(result: SculptResult, material: THREE.Material, parent: THREE.Object3D): THREE.SkinnedMesh {
  const mesh = new THREE.SkinnedMesh(result.geometry, material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  parent.add(mesh)
  parent.updateMatrixWorld(true)
  const skeleton = new THREE.Skeleton(result.bones as THREE.Bone[])
  mesh.bind(skeleton, mesh.matrixWorld)
  return mesh
}
