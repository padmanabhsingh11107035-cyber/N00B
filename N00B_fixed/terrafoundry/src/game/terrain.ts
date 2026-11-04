import * as THREE from 'three'
import { CHUNK, SEA_LEVEL } from './config'
import { Simplex, clamp, lerp, smoothstep } from './noise'
import { POI_BLEND, POI_FLAT, PoiField } from './poi'

export type Surface = 'grass' | 'sand' | 'rock' | 'snow' | 'dirt' | 'stone'

/** Vertex key for integer lattice coordinates (±65k m). */
export const vkey = (ix: number, iz: number) => (ix + 65536) * 131072 + (iz + 65536)
export const ckey = (cx: number, cz: number) => (cx + 32768) * 65536 + (cz + 32768)
export const ckeyXZ = (key: number): [number, number] => [Math.floor(key / 65536) - 32768, (key % 65536) - 32768]

/**
 * Smooth, rounded heightfield: continental shelves, rolling hills, ridged mountain ranges, and
 * sparse edits (digging and raising) layered on top. One vertex per metre; every query uses the
 * exact triangle interpolation of the rendered mesh so collision matches what you see.
 */
export class Terrain {
  readonly pois: PoiField
  readonly edits = new Map<number, number>()
  private readonly nCont: Simplex
  private readonly nHill: Simplex
  private readonly nMount: Simplex
  private readonly nRidge: Simplex
  private readonly nDetail: Simplex
  private readonly nMoist: Simplex
  private cache = new Map<number, number>()

  constructor(readonly seed: number) {
    this.nCont = new Simplex(seed ^ 0x1a2b)
    this.nHill = new Simplex(seed ^ 0x3c4d)
    this.nMount = new Simplex(seed ^ 0x5e6f)
    this.nRidge = new Simplex(seed ^ 0x7081)
    this.nDetail = new Simplex(seed ^ 0x92a3)
    this.nMoist = new Simplex(seed ^ 0xb4c5)
    this.pois = new PoiField(seed, (x, z) => this.rawHeight(x, z))
  }

  rawHeight(x: number, z: number): number {
    const c = this.nCont.fbm(x * 0.0014, z * 0.0014, 4) + 0.16 * this.nDetail.noise(x * 0.005, z * 0.005)
    const land = smoothstep(-0.3, 0.18, c + 0.2)
    let h = lerp(-15, 3.5, land)
    h += (this.nHill.fbm(x * 0.0105, z * 0.0105, 4) * 6.5 + 2.5) * land
    const mm = smoothstep(0.02, 0.42, this.nMount.fbm(x * 0.0026 + 31.7, z * 0.0026 - 12.3, 3))
    if (mm > 0) h += mm * mm * land * (this.nRidge.ridged(x * 0.0058, z * 0.0058, 3) * 62 + 4)
    h += this.nDetail.noise(x * 0.09, z * 0.09) * 0.25
    return h
  }

  baseHeight(x: number, z: number): number {
    const raw = this.rawHeight(x, z)
    const poi = this.pois.at(x, z)
    if (!poi) return raw
    const d = Math.hypot(x - poi.x, z - poi.z)
    if (d >= POI_FLAT + POI_BLEND) return raw
    return lerp(raw, poi.h, smoothstep(POI_FLAT + POI_BLEND, POI_FLAT * 0.6, d))
  }

  /** Base height at an integer vertex (cached for gameplay queries). */
  private baseVertex(ix: number, iz: number): number {
    const k = vkey(ix, iz)
    let h = this.cache.get(k)
    if (h === undefined) {
      if (this.cache.size > 80000) this.cache.clear()
      h = this.baseHeight(ix, iz)
      this.cache.set(k, h)
    }
    return h
  }

  edit(ix: number, iz: number): number {
    return this.edits.get(vkey(ix, iz)) ?? 0
  }

  vertex(ix: number, iz: number): number {
    return this.baseVertex(ix, iz) + this.edit(ix, iz)
  }

  /** Exact surface height (matches the rendered triangle split along the b–c diagonal). */
  height(x: number, z: number): number {
    const ix = Math.floor(x)
    const iz = Math.floor(z)
    const fx = x - ix
    const fz = z - iz
    const hb = this.vertex(ix + 1, iz)
    const hc = this.vertex(ix, iz + 1)
    if (fx + fz <= 1) {
      const ha = this.vertex(ix, iz)
      return ha + (hb - ha) * fx + (hc - ha) * fz
    }
    const hd = this.vertex(ix + 1, iz + 1)
    return hd + (hc - hd) * (1 - fx) + (hb - hd) * (1 - fz)
  }

  normal(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
    const e = 0.5
    const dx = this.height(x + e, z) - this.height(x - e, z)
    const dz = this.height(x, z + e) - this.height(x, z - e)
    return out.set(-dx, 2 * e, -dz).normalize()
  }

  moisture(x: number, z: number): number {
    return this.nMoist.fbm(x * 0.004, z * 0.004, 3)
  }

  /** Low-frequency variation used for grass tint and foliage density. */
  detail(x: number, z: number): number {
    return this.nDetail.noise(x * 0.03, z * 0.03)
  }

  surfaceAt(x: number, z: number): Surface {
    const h = this.height(x, z)
    const d = this.edit(Math.round(x), Math.round(z))
    if (d < -1.6) return 'stone'
    if (d < -0.25 || d > 0.25) return 'dirt'
    const ny = this.normal(x, z).y
    if (h > 52 && ny > 0.62) return 'snow'
    if (ny < 0.74 || h > 40) return 'rock'
    if (h < SEA_LEVEL + 1.6) return 'sand'
    return 'grass'
  }

  /**
   * Smoothly lower (amount < 0) or raise (amount > 0) the ground around (x, z).
   * Returns the chunk keys whose meshes must be rebuilt.
   */
  deform(x: number, z: number, radius: number, amount: number, maxDepth: number): Set<number> {
    const dirty = new Set<number>()
    const x0 = Math.floor(x - radius)
    const x1 = Math.ceil(x + radius)
    const z0 = Math.floor(z - radius)
    const z1 = Math.ceil(z + radius)
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const d = Math.hypot(ix - x, iz - z)
        if (d >= radius) continue
        const f = 1 - (d / radius) ** 2
        const k = vkey(ix, iz)
        const next = clamp((this.edits.get(k) ?? 0) + amount * f * f, -maxDepth, 12)
        if (Math.abs(next) < 0.002) this.edits.delete(k)
        else this.edits.set(k, next)
        for (let ox = -1; ox <= 1; ox++) {
          for (let oz = -1; oz <= 1; oz++) dirty.add(ckey(Math.floor((ix + ox) / CHUNK), Math.floor((iz + oz) / CHUNK)))
        }
      }
    }
    return dirty
  }

  /** A dry, gentle spot near the origin to start (or respawn) on. */
  findSpawn(): THREE.Vector3 {
    for (let r = 0; r < 3000; r += 12) {
      const steps = Math.max(1, Math.floor((r * Math.PI * 2) / 12))
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2
        const x = Math.cos(a) * r
        const z = Math.sin(a) * r
        const h = this.baseHeight(x, z)
        if (h < 3 || h > 14) continue
        if (this.normal(x, z).y < 0.93) continue
        return new THREE.Vector3(x, h, z)
      }
    }
    return new THREE.Vector3(0, Math.max(this.baseHeight(0, 0), 2), 0)
  }
}
