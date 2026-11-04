import * as THREE from 'three'
import { CHUNK } from './config'
import { MeshBuilder, shaderTime } from './geo'
import { clamp, hash2, mulberry32, smoothstep } from './noise'
import { BUILDER_KEYS, buildResource, generateChunk, newBuilders, type Resource } from './resources'
import { ATLAS, createWorldMaterials, type WorldMaterials } from './materials'
import { appendCover, natureReady, type CoverKind } from './nature'
import { ckey, type Terrain } from './terrain'

export class Chunk {
  readonly group = new THREE.Group()
  terrain?: THREE.Mesh
  readonly meshes: Partial<Record<(typeof BUILDER_KEYS)[number], THREE.Mesh>> = {}
  grass?: THREE.Mesh
  constructor(readonly cx: number, readonly cz: number, readonly key: number, readonly resources: Resource[]) {
    this.group.position.set(cx * CHUNK, 0, cz * CHUNK)
  }
}

const COL = {
  dryTint: new THREE.Color('#ffe9a8'),
  lush: new THREE.Color('#5f7536'),
  dry: new THREE.Color('#8a8646'),
  dirt: new THREE.Color('#6b4f36'),
  rock: new THREE.Color('#7d776c'),
  stone: new THREE.Color('#645f58'),
  sand: new THREE.Color('#c7b387'),
  wet: new THREE.Color('#6f654f'),
  snow: new THREE.Color('#e8e6df'),
}

/**
 * Streams terrain chunks around a focus point. Each chunk is one smooth vertex-coloured terrain
 * mesh, one merged mesh for its trees/rocks/plants, one for glowing crystal, and (near the
 * player) a swaying grass layer.
 */
export class ChunkManager {
  readonly group = new THREE.Group()
  readonly chunks = new Map<number, Chunk>()
  radius = 4
  grassRadius = 1
  grassEnabled = true
  /** Hidden resources (harvested or temporarily extracted for animation). */
  hidden: (r: Resource) => boolean = () => false
  readonly mats: WorldMaterials
  /** Material per resource builder layer. */
  readonly layerMat: Record<(typeof BUILDER_KEYS)[number], THREE.Material>
  constructor(readonly terrain: Terrain) {
    this.mats = createWorldMaterials()
    const m = this.mats
    this.layerMat = { main: m.misc, glow: m.glow, bark: m.bark, leaf: m.leaves, rock: m.rock, kit: m.kit }
    this.group.name = 'chunks'
  }
  get(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(ckey(cx, cz))
  }

  /** Synchronously load the chunks around (x, z) — used for the first playable area. */
  ensureNear(x: number, z: number, r = 1): void {
    const pcx = Math.floor(x / CHUNK)
    const pcz = Math.floor(z / CHUNK)
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (!this.get(pcx + dx, pcz + dz)) this.load(pcx + dx, pcz + dz)
    this.updateGrass(x, z)
  }

  /** Stream around (x, z) within a per-frame time budget. Returns chunks still pending. */
  update(x: number, z: number, budgetMs: number): number {
    const pcx = Math.floor(x / CHUNK)
    const pcz = Math.floor(z / CHUNK)
    const R = this.radius
    const want: [number, number, number][] = []
    for (let dx = -R; dx <= R; dx++) {
      for (let dz = -R; dz <= R; dz++) {
        const d2 = dx * dx + dz * dz
        if (d2 > (R + 0.5) ** 2) continue
        if (!this.get(pcx + dx, pcz + dz)) want.push([d2, pcx + dx, pcz + dz])
      }
    }
    want.sort((a, b) => a[0] - b[0])
    const t0 = performance.now()
    let built = 0
    for (const [, cx, cz] of want) {
      if (built > 0 && performance.now() - t0 > budgetMs) break
      this.load(cx, cz)
      built++
    }
    for (const c of this.chunks.values()) {
      const dx = c.cx - pcx
      const dz = c.cz - pcz
      if (dx * dx + dz * dz > (R + 1.6) ** 2) this.unload(c)
    }
    this.updateGrass(x, z)
    return want.length - built
  }

  private load(cx: number, cz: number): Chunk {
    const key = ckey(cx, cz)
    const c = new Chunk(cx, cz, key, generateChunk(this.terrain, cx, cz))
    this.chunks.set(key, c)
    this.buildTerrain(c)
    this.buildResources(c)
    this.group.add(c.group)
    return c
  }

  private unload(c: Chunk): void {
    for (const m of [c.terrain, c.grass, ...Object.values(c.meshes)]) m?.geometry.dispose()
    this.group.remove(c.group)
    this.chunks.delete(c.key)
  }

  clear(): void {
    for (const c of [...this.chunks.values()]) this.unload(c)
  }

  /** Rebuild terrain (and dependent resources/grass) for edited chunks that are loaded. */
  rebuild(keys: Iterable<number>): void {
    for (const k of keys) {
      const c = this.chunks.get(k)
      if (!c) continue
      this.buildTerrain(c)
      this.buildResources(c)
      if (c.grass) this.buildGrass(c)
    }
  }

  rebuildResources(key: number): void {
    const c = this.chunks.get(key)
    if (c) this.buildResources(c)
  }

  chunkOf(r: Resource): Chunk | undefined {
    const [cx, cz] = r.key.split(',').map(Number)
    return this.get(cx, cz)
  }

  /** Loaded, visible resources within `radius` of (x, z). */
  resourcesNear(x: number, z: number, radius: number, out: Resource[] = []): Resource[] {
    out.length = 0
    const r = radius + 2
    // POI features can sit up to ~14 m outside the chunk that owns them.
    const pad = r + 14
    const c0x = Math.floor((x - pad) / CHUNK)
    const c1x = Math.floor((x + pad) / CHUNK)
    const c0z = Math.floor((z - pad) / CHUNK)
    const c1z = Math.floor((z + pad) / CHUNK)
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        const c = this.get(cx, cz)
        if (!c) continue
        for (const res of c.resources) {
          if (this.hidden(res)) continue
          const dx = res.x - x
          const dz = res.z - z
          if (dx * dx + dz * dz <= r * r) out.push(res)
        }
      }
    }
    return out
  }

  private buildTerrain(c: Chunk): void {
    const t = this.terrain
    const N = CHUNK + 1
    const W = CHUNK + 3
    const x0 = c.cx * CHUNK
    const z0 = c.cz * CHUNK
    const hs = new Float32Array(W * W)
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) hs[j * W + i] = t.baseHeight(x0 + i - 1, z0 + j - 1) + t.edit(x0 + i - 1, z0 + j - 1)
    const pos = new Float32Array(N * N * 3)
    const nor = new Float32Array(N * N * 3)
    const col = new Float32Array(N * N * 3)
    const sw0 = new Float32Array(N * N * 3)
    const sw1 = new Float32Array(N * N * 3)
    const uv = new Float32Array(N * N * 2)
    const w = [0, 0, 0, 0, 0, 0] // grass, forest, dirt, rock, sand, snow
    const mix = (layer: number, a: number) => {
      if (a <= 0) return
      for (let q = 0; q < 6; q++) w[q] *= 1 - a
      w[layer] += a
    }
    const n = new THREE.Vector3()
    const cc = new THREE.Color()
    const tmp = new THREE.Color()
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i
        const hi = (j + 1) * W + (i + 1)
        const h = hs[hi]
        const hl = hs[hi - 1]
        const hr = hs[hi + 1]
        const hu = hs[hi - W]
        const hd = hs[hi + W]
        n.set(-(hr - hl) * 0.5, 1, -(hd - hu) * 0.5).normalize()
        pos[k * 3] = i
        pos[k * 3 + 1] = h
        pos[k * 3 + 2] = j
        nor[k * 3] = n.x
        nor[k * 3 + 1] = n.y
        nor[k * 3 + 2] = n.z
        uv[k * 2] = (x0 + i) / 4
        uv[k * 2 + 1] = (z0 + j) / 4
        const wx = x0 + i
        const wz = z0 + j
        const d = t.edit(wx, wz)
        const m = t.moisture(wx, wz)
        const det = t.detail(wx, wz)
        w.fill(0)
        w[0] = 1
        const lush = smoothstep(-0.45, 0.35, m + det * 0.2)
        mix(1, (1 - lush) * 0.75 + smoothstep(0.35, 0.9, det) * 0.2)
        mix(4, smoothstep(1.9, 0.9, h + det * 0.4))
        const rockW = Math.max(smoothstep(0.86, 0.7, n.y), smoothstep(35, 44, h + det * 3))
        mix(3, rockW)
        mix(5, smoothstep(47, 56, h + det * 4) * smoothstep(0.55, 0.78, n.y))
        const ad = Math.abs(d)
        if (ad > 0.08) mix(2, smoothstep(0.1, 0.5, ad))
        if (d < -1) mix(3, smoothstep(1.1, 2.1, -d))
        sw0[k * 3] = w[1]
        sw0[k * 3 + 1] = w[2]
        sw0[k * 3 + 2] = w[3]
        sw1[k * 3] = w[4]
        sw1[k * 3 + 1] = w[5]
        // Vertex colour = soft cavity AO, subtle variation and a warm/cool moisture tint.
        const lap = (hl + hr + hu + hd) * 0.25 - h
        const ao = (1 - clamp(lap * 0.16, -0.08, 0.26)) * (0.93 + 0.12 * det)
        cc.setRGB(1, 1, 1).lerp(tmp.setRGB(1.06, 1.02, 0.86), (1 - lush) * 0.6 * w[0]).multiplyScalar(ao)
        if (h < -0.4) cc.multiplyScalar(1 - 0.35 * smoothstep(-0.4, -3, h))
        col[k * 3] = cc.r
        col[k * 3 + 1] = cc.g
        col[k * 3 + 2] = cc.b
      }
    }
    const idx = new Uint16Array(CHUNK * CHUNK * 6)
    let q = 0
    for (let j = 0; j < CHUNK; j++) {
      for (let i = 0; i < CHUNK; i++) {
        const a = j * N + i
        const b = a + 1
        const cI = a + N
        const dI = cI + 1
        idx[q++] = a; idx[q++] = cI; idx[q++] = b
        idx[q++] = b; idx[q++] = cI; idx[q++] = dI
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    g.setAttribute('aSw0', new THREE.BufferAttribute(sw0, 3))
    g.setAttribute('aSw1', new THREE.BufferAttribute(sw1, 3))
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    g.setIndex(new THREE.BufferAttribute(idx, 1))
    g.computeBoundingSphere()
    if (c.terrain) {
      c.terrain.geometry.dispose()
      c.terrain.geometry = g
    } else {
      c.terrain = new THREE.Mesh(g, this.mats.terrain)
      c.terrain.receiveShadow = true
      c.terrain.castShadow = true
      c.group.add(c.terrain)
    }
  }

  buildResources(c: Chunk): void {
    const B = newBuilders()
    const x0 = c.cx * CHUNK
    const z0 = c.cz * CHUNK
    for (const r of c.resources) {
      r.y = this.terrain.height(r.x, r.z) + r.dy
      if (this.hidden(r)) continue
      buildResource(r, B, x0, 0, z0)
    }
    for (const key of BUILDER_KEYS) {
      const g = B[key].build()
      const mesh = c.meshes[key]
      if (!g) {
        if (mesh) {
          mesh.geometry.dispose()
          c.group.remove(mesh)
          delete c.meshes[key]
        }
        continue
      }
      if (mesh) {
        mesh.geometry.dispose()
        mesh.geometry = g
      } else {
        const m = new THREE.Mesh(g, this.layerMat[key])
        m.castShadow = key !== 'glow'
        m.receiveShadow = true
        c.group.add(m)
        c.meshes[key] = m
      }
    }
  }
  private updateGrass(x: number, z: number): void {
    const pcx = Math.floor(x / CHUNK)
    const pcz = Math.floor(z / CHUNK)
    for (const c of this.chunks.values()) {
      const near = this.grassEnabled && Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz)) <= this.grassRadius
      if (near && !c.grass) this.buildGrass(c)
      else if (!near && c.grass) {
        c.grass.geometry.dispose()
        c.group.remove(c.grass)
        c.grass = undefined
      }
    }
  }

  private buildGrass(c: Chunk): void {
    const t = this.terrain
    const rnd = mulberry32(Math.floor(hash2(c.cx, c.cz, t.seed ^ 0x6a55) * 4294967296))
    // Once the required day bundle is ready, use the kit silhouettes directly. Everything is
    // still baked into one BufferGeometry/material for the chunk (no per-tuft draw calls).
    if (natureReady()) {
      const b = new MeshBuilder()
      const layers = { main: b, bark: b, leaf: b, rock: b, kit: b }
      const x0 = c.cx * CHUNK
      const z0 = c.cz * CHUNK
      const p = new THREE.Vector3()
      const q = new THREE.Quaternion()
      const s = new THREE.Vector3()
      const e = new THREE.Euler()
      for (let i = 0; i < 620; i++) {
        const lx = rnd() * CHUNK
        const lz = rnd() * CHUNK
        const wx = x0 + lx
        const wz = z0 + lz
        const h = t.height(wx, wz)
        if (h < 1.7 || h > 40 || t.normal(wx, wz).y < 0.84 || Math.abs(t.edit(Math.round(wx), Math.round(wz))) > 0.12) continue
        const lush = smoothstep(-0.45, 0.35, t.moisture(wx, wz))
        if (rnd() > 0.48 + lush * 0.38) continue
        const roll = rnd()
        const kind: CoverKind = roll < 0.035 ? 'mushroom' : roll < 0.08 ? 'pebble' : roll < 0.16 ? 'flower' : roll < 0.23 ? 'fern' : roll < 0.31 ? 'clover' : 'grass'
        const scale = (kind === 'pebble' ? 0.65 : kind === 'mushroom' ? 0.5 : kind === 'fern' ? 0.72 : 0.46) * (0.78 + rnd() * 0.42)
        const m = new THREE.Matrix4().compose(p.set(lx, h - 0.025, lz), q.setFromEuler(e.set(0, rnd() * Math.PI * 2, 0)), s.setScalar(scale))
        appendCover(kind, layers, m, Math.floor(rnd() * 9999), rnd)
      }
      const g = b.build()
      if (g) {
        if (c.grass) { c.grass.geometry.dispose(); c.grass.geometry = g }
        else { c.grass = new THREE.Mesh(g, this.mats.kit); c.grass.receiveShadow = true; c.group.add(c.grass) }
        c.grass.material = this.mats.kit
        return
      }
    }
    const pos: number[] = []
    const nor: number[] = []
    const col: number[] = []
    const sway: number[] = []
    const uvs: number[] = []
    const idx: number[] = []
    const x0 = c.cx * CHUNK
    const z0 = c.cz * CHUNK
    const tint = new THREE.Color()
    const card = (lx: number, h: number, lz: number, a: number, wdt: number, hgt: number, r: readonly number[], lean: number) => {
      const base = pos.length / 3
      const dx = Math.cos(a) * wdt * 0.5
      const dz = Math.sin(a) * wdt * 0.5
      const lx2 = Math.cos(a + Math.PI / 2) * lean
      const lz2 = Math.sin(a + Math.PI / 2) * lean
      pos.push(lx - dx, h, lz - dz, lx + dx, h, lz + dz, lx + dx + lx2, h + hgt, lz + dz + lz2, lx - dx + lx2, h + hgt, lz - dz + lz2)
      uvs.push(r[0], r[1], r[0] + r[2], r[1], r[0] + r[2], r[1] + r[3], r[0], r[1] + r[3])
      for (let v = 0; v < 4; v++) {
        nor.push(0, 1, 0)
        col.push(tint.r, tint.g, tint.b)
      }
      sway.push(0, 0, 1.25, 1.25)
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
    for (let i = 0; i < 1500; i++) {
      const lx = rnd() * CHUNK
      const lz = rnd() * CHUNK
      const wx = x0 + lx
      const wz = z0 + lz
      const h = t.height(wx, wz)
      if (h < 1.7 || h > 40) continue
      if (Math.abs(t.edit(Math.round(wx), Math.round(wz))) > 0.12) continue
      const ny = t.normal(wx, wz).y
      if (ny < 0.84) continue
      const m = t.moisture(wx, wz)
      if (rnd() > 0.5 + m * 0.5) continue
      const lush = smoothstep(-0.45, 0.35, m)
      const roll = rnd()
      const kind = roll < 0.07 + lush * 0.05 ? ATLAS.flowers : roll < 0.14 + lush * 0.08 ? ATLAS.fern : ATLAS.grass
      const big = kind === ATLAS.grass ? 0.55 + rnd() * 0.45 : 0.5 + rnd() * 0.35
      tint.setRGB(1, 1, 1).lerp(COL.dryTint, (1 - lush) * 0.7).multiplyScalar(0.78 + rnd() * 0.3)
      const a = rnd() * Math.PI
      const hy = h - 0.04
      card(lx, hy, lz, a, big * 1.25, big, kind, (rnd() - 0.5) * 0.15)
      card(lx, hy, lz, a + Math.PI / 2, big * 1.25, big, kind, (rnd() - 0.5) * 0.15)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 1))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    g.setIndex(idx)
    g.computeBoundingSphere()
    if (c.grass) {
      c.grass.geometry.dispose()
      c.grass.geometry = g
    } else {
      c.grass = new THREE.Mesh(g, this.mats.grass)
      c.grass.receiveShadow = true
      c.group.add(c.grass)
    }
  }
  tick(seconds: number): void {
    shaderTime.value += seconds
  }
}
