import * as THREE from 'three'
import type { ChunkManager } from './chunks'
import { PIECES, pieceColliders, rampHeight, type Box, type Piece } from './pieces'
const colBuf: Box[] = []
import { RES, type Resource } from './resources'
import type { Terrain } from './terrain'

export type Body = { pos: THREE.Vector3; vel: THREE.Vector3; radius: number; height: number; grounded: boolean }
export type Circle = { x: number; z: number; r: number; y0: number; y1: number }

export interface PieceQuery {
  near(x: number, z: number, r: number, out?: Piece[]): Piece[]
}

export type TargetSphere = { x: number; y: number; z: number; r: number; ref: unknown }

export type Hit = {
  kind: 'terrain' | 'resource' | 'piece' | 'creature'
  t: number
  point: THREE.Vector3
  normal: THREE.Vector3
  res?: Resource
  piece?: Piece
  creature?: unknown
}

const EPS = 0.001
const resBuf: Resource[] = []
const pieceBuf: Piece[] = []

/**
 * Analytic collision against the heightfield, placed pieces (axis-aligned boxes and ramp
 * surfaces) and resource trunks/rocks (vertical circles). Shared by the player and creatures.
 */
export class WorldPhysics {
  constructor(readonly terrain: Terrain, readonly chunks: ChunkManager, readonly pieces: PieceQuery) {}

  private gather(x: number, z: number, r: number, boxes: Box[], ramps: Piece[], circles: Circle[]): void {
    boxes.length = 0
    ramps.length = 0
    circles.length = 0
    for (const p of this.pieces.near(x, z, r, pieceBuf)) {
      const def = PIECES[p.id]
      if (def.ramp) ramps.push(p)
      else if (def.solid) pieceColliders(p, boxes)
    }
    for (const res of this.chunks.resourcesNear(x, z, r, resBuf)) {
      const c = RES[res.type].collide
      if (!c) continue
      circles.push({ x: res.x, z: res.z, r: c.r * res.s, y0: res.y - 0.2, y1: res.y + c.h * res.s })
    }
  }

  private boxes: Box[] = []
  private ramps: Piece[] = []
  private circles: Circle[] = []

  groundAt(x: number, z: number, maxY: number, radius: number, boxes = this.boxes, ramps = this.ramps, circles = this.circles): number {
    let g = this.terrain.height(x, z)
    const rr = radius * 0.75
    for (const b of boxes) {
      if (b.maxY > maxY + EPS || b.maxY <= g) continue
      if (x + rr > b.minX && x - rr < b.maxX && z + rr > b.minZ && z - rr < b.maxZ) g = b.maxY
    }
    for (const p of ramps) {
      const h = rampHeight(p, PIECES[p.id], x, z)
      if (h !== null && h <= maxY + EPS && h > g) g = h
    }
    for (const c of circles) {
      if (c.y1 > maxY + EPS || c.y1 <= g) continue
      const dx = x - c.x
      const dz = z - c.z
      if (dx * dx + dz * dz < c.r * c.r) g = c.y1
    }
    return g
  }

  /** Move a body by its velocity for `dt`; returns the landing speed (negative) when it lands. */
  moveBody(b: Body, dt: number, step: number, fly = false): number | null {
    const { pos, vel, radius: r, height } = b
    const reach = 2.5 + Math.hypot(vel.x, vel.z) * dt
    this.gather(pos.x, pos.z, reach, this.boxes, this.ramps, this.circles)
    const allowance = b.grounded ? step : 0.08
    const dx = vel.x * dt
    const dz = vel.z * dt
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / (r * 0.8)))
    for (let i = 0; i < n; i++) {
      pos.x += dx / n
      for (const box of this.boxes) {
        if (box.maxY <= pos.y + allowance || box.minY >= pos.y + height) continue
        if (pos.x + r > box.minX && pos.x - r < box.maxX && pos.z + r > box.minZ && pos.z - r < box.maxZ) {
          pos.x = dx > 0 ? box.minX - r - EPS : dx < 0 ? box.maxX + r + EPS : pos.x < (box.minX + box.maxX) / 2 ? box.minX - r - EPS : box.maxX + r + EPS
          vel.x = 0
        }
      }
      pos.z += dz / n
      for (const box of this.boxes) {
        if (box.maxY <= pos.y + allowance || box.minY >= pos.y + height) continue
        if (pos.x + r > box.minX && pos.x - r < box.maxX && pos.z + r > box.minZ && pos.z - r < box.maxZ) {
          pos.z = dz > 0 ? box.minZ - r - EPS : dz < 0 ? box.maxZ + r + EPS : pos.z < (box.minZ + box.maxZ) / 2 ? box.minZ - r - EPS : box.maxZ + r + EPS
          vel.z = 0
        }
      }
      for (const c of this.circles) {
        if (c.y1 <= pos.y + allowance || c.y0 >= pos.y + height) continue
        const ox = pos.x - c.x
        const oz = pos.z - c.z
        const d = Math.hypot(ox, oz)
        const min = r + c.r
        if (d >= min) continue
        const nx = d > 1e-5 ? ox / d : 1
        const nz = d > 1e-5 ? oz / d : 0
        pos.x = c.x + nx * min
        pos.z = c.z + nz * min
        const into = vel.x * nx + vel.z * nz
        if (into < 0) {
          vel.x -= into * nx
          vel.z -= into * nz
        }
      }
    }
    const prevY = pos.y
    pos.y += vel.y * dt
    if (vel.y > 0) {
      for (const box of this.boxes) {
        if (box.minY < prevY + height - EPS || box.minY > pos.y + height) continue
        if (pos.x + r > box.minX && pos.x - r < box.maxX && pos.z + r > box.minZ && pos.z - r < box.maxZ) {
          pos.y = box.minY - height - EPS
          vel.y = 0
        }
      }
    }
    const ground = this.groundAt(pos.x, pos.z, Math.max(prevY, pos.y) + allowance, r)
    let landed: number | null = null
    if (pos.y <= ground) {
      if (!b.grounded && vel.y < 0) landed = vel.y
      pos.y = ground
      if (vel.y < 0) vel.y = 0
      b.grounded = true
    } else if (!fly && b.grounded && vel.y <= 0 && pos.y - ground < 0.42) {
      pos.y = ground
      vel.y = 0
      b.grounded = true
    } else {
      b.grounded = false
    }
    return landed
  }

  /** True when a box placed at `box` would intersect any loaded resource collider. */
  blockedByResource(box: Box): boolean {
    const cx = (box.minX + box.maxX) / 2
    const cz = (box.minZ + box.maxZ) / 2
    for (const res of this.chunks.resourcesNear(cx, cz, 4, resBuf)) {
      const c = RES[res.type].collide
      if (!c) continue
      const r = c.r * res.s
      if (res.y + c.h * res.s < box.minY || res.y > box.maxY) continue
      const nx = Math.max(box.minX, Math.min(res.x, box.maxX))
      const nz = Math.max(box.minZ, Math.min(res.z, box.maxZ))
      if ((nx - res.x) ** 2 + (nz - res.z) ** 2 < r * r * 0.8) return true
    }
    return false
  }

  /** Nearest thing the ray hits within `maxDist`: terrain, resource, piece or creature. */
  raycast(o: THREE.Vector3, d: THREE.Vector3, maxDist: number, creatures: TargetSphere[] = []): Hit | null {
    let best = null as Hit | null
    const consider = (h: Hit | null) => {
      if (h && h.t >= 0 && h.t <= maxDist && (!best || h.t < best.t)) best = h
    }
    consider(this.rayTerrain(o, d, maxDist))
    for (const res of this.chunks.resourcesNear(o.x, o.z, maxDist + 3, resBuf)) {
      const def = RES[res.type]
      for (const s of def.shapes) {
        const cy = res.y + s.dy * res.s
        const r = s.r * res.s
        const t = s.k === 'sph' ? raySphere(o, d, res.x, cy, res.z, r) : rayCylinder(o, d, res.x, res.z, r, cy, cy + (s.h ?? 1) * res.s)
        if (t === null || (best && t >= best.t)) continue
        const point = o.clone().addScaledVector(d, t)
        const normal = s.k === 'sph' ? point.clone().sub(new THREE.Vector3(res.x, cy, res.z)).normalize() : cylNormal(point, res.x, res.z, cy + (s.h ?? 1) * res.s)
        consider({ kind: 'resource', t, point, normal, res })
      }
    }
    for (const p of this.pieces.near(o.x, o.z, maxDist + 2, pieceBuf)) {
      colBuf.length = 0
      pieceColliders(p, colBuf)
      for (const box of colBuf) {
        const hit = rayBox(o, d, box)
        if (hit && (!best || hit.t < best.t)) consider({ kind: 'piece', t: hit.t, point: o.clone().addScaledVector(d, hit.t), normal: hit.n, piece: p })
      }
    }
    for (const c of creatures) {
      const t = raySphere(o, d, c.x, c.y, c.z, c.r)
      if (t !== null && (!best || t < best.t)) {
        const point = o.clone().addScaledVector(d, t)
        consider({ kind: 'creature', t, point, normal: point.clone().sub(new THREE.Vector3(c.x, c.y, c.z)).normalize(), creature: c.ref })
      }
    }
    return best
  }

  private rayTerrain(o: THREE.Vector3, d: THREE.Vector3, maxDist: number): Hit | null {
    const t = this.terrain
    const stepLen = 0.12
    let prev = 0
    if (o.y <= t.height(o.x, o.z)) return null
    for (let s = stepLen; s <= maxDist + stepLen; s += stepLen) {
      const x = o.x + d.x * s
      const y = o.y + d.y * s
      const z = o.z + d.z * s
      if (y <= t.height(x, z)) {
        let lo = prev
        let hi = s
        for (let i = 0; i < 7; i++) {
          const mid = (lo + hi) / 2
          if (o.y + d.y * mid <= t.height(o.x + d.x * mid, o.z + d.z * mid)) hi = mid
          else lo = mid
        }
        const point = o.clone().addScaledVector(d, hi)
        return { kind: 'terrain', t: hi, point, normal: t.normal(point.x, point.z) }
      }
      prev = s
    }
    return null
  }
}

export function raySphere(o: THREE.Vector3, d: THREE.Vector3, cx: number, cy: number, cz: number, r: number): number | null {
  const ox = o.x - cx
  const oy = o.y - cy
  const oz = o.z - cz
  const b = ox * d.x + oy * d.y + oz * d.z
  const c = ox * ox + oy * oy + oz * oz - r * r
  const disc = b * b - c
  if (disc < 0) return null
  const s = Math.sqrt(disc)
  const t = -b - s
  if (t >= 0) return t
  return -b + s >= 0 ? 0 : null
}

export function rayCylinder(o: THREE.Vector3, d: THREE.Vector3, cx: number, cz: number, r: number, y0: number, y1: number): number | null {
  const ox = o.x - cx
  const oz = o.z - cz
  const a = d.x * d.x + d.z * d.z
  let best: number | null = null
  if (a > 1e-8) {
    const b = ox * d.x + oz * d.z
    const c = ox * ox + oz * oz - r * r
    const disc = b * b - a * c
    if (disc >= 0) {
      const t = (-b - Math.sqrt(disc)) / a
      const y = o.y + d.y * t
      if (t >= 0 && y >= y0 && y <= y1) best = t
    }
  }
  if (Math.abs(d.y) > 1e-8) {
    for (const cap of [y1, y0]) {
      const t = (cap - o.y) / d.y
      if (t < 0 || (best !== null && t >= best)) continue
      const x = ox + d.x * t
      const z = oz + d.z * t
      if (x * x + z * z <= r * r) best = t
    }
  }
  return best
}

function cylNormal(p: THREE.Vector3, cx: number, cz: number, top: number): THREE.Vector3 {
  if (Math.abs(p.y - top) < 0.02) return new THREE.Vector3(0, 1, 0)
  return new THREE.Vector3(p.x - cx, 0, p.z - cz).normalize()
}

export function rayBox(o: THREE.Vector3, d: THREE.Vector3, b: Box): { t: number; n: THREE.Vector3 } | null {
  let tmin = -Infinity
  let tmax = Infinity
  let axis = 0
  let sign = 1
  const mins = [b.minX, b.minY, b.minZ]
  const maxs = [b.maxX, b.maxY, b.maxZ]
  const os = [o.x, o.y, o.z]
  const ds = [d.x, d.y, d.z]
  for (let i = 0; i < 3; i++) {
    if (Math.abs(ds[i]) < 1e-9) {
      if (os[i] < mins[i] || os[i] > maxs[i]) return null
      continue
    }
    let t1 = (mins[i] - os[i]) / ds[i]
    let t2 = (maxs[i] - os[i]) / ds[i]
    let s = -1
    if (t1 > t2) {
      const tmp = t1
      t1 = t2
      t2 = tmp
      s = 1
    }
    if (t1 > tmin) {
      tmin = t1
      axis = i
      sign = s
    }
    tmax = Math.min(tmax, t2)
    if (tmin > tmax) return null
  }
  if (tmax < 0) return null
  const n = new THREE.Vector3()
  n.setComponent(axis, sign)
  return { t: Math.max(0, tmin), n }
}
