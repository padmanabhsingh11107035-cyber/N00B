import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { CoverKind, Dir, WingDef } from './content'
import { DIR_VEC } from './content'
import { T, TILE, type RoomKind, type RoomPlan } from './dungeon'
import {
  bannerTexture, booksTexture, canvasTexture, chalkboardTexture, glow, lockerTexture, posterTexture, stripeTexture, toon,
} from './toon'
import { COVER_PROPS, fitScale, instanceProp, propModel, surface, TRIM_SURFACE, WING_LOOKS, type PropId, type WingLook } from './surfaces'
import { glowSprite } from './actors'

/**
 * Turns a tile plan (dungeon floor or hub) into renderable, collidable 3D space.
 * Tile (tx, ty) covers world x ∈ [tx·2, tx·2+2], z ∈ [ty·2, ty·2+2]; y is up.
 */

export const WALL_H = 3.2

export type LevelSource = {
  kind: 'dungeon' | 'hub'
  size: number
  tiles: Uint8Array
  rooms: RoomPlan[]
  palette: WingDef
  renderCover?: boolean
}

export type Circle = { x: number; z: number; r: number }

export const tileCenter = (t: number) => t * TILE + TILE / 2
export const worldToTile = (v: number) => Math.floor(v / TILE)

const KIND_COLOR: Partial<Record<RoomKind, string>> = {
  heal: '#6dff9e', shop: '#ffd35c', rescue: '#7ef9ff', lore: '#c58cff', treasure: '#ffcf4d', challenge: '#ff4f6d',
  boss: '#e8384f', exit: '#7ef9ff', entrance: '#ffd35c', elite: '#ff7a45',
}

function colored(geo: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo
  const c = new THREE.Color(color)
  const n = g.attributes.position.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i += 1) {
    arr[i * 3] = c.r
    arr[i * 3 + 1] = c.g
    arr[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  g.deleteAttribute('uv')
  return g
}
const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) => colored(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color)
const cyl = (r0: number, r1: number, h: number, x: number, y: number, z: number, color: string, seg = 10) => colored(new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y, z), color)
const ball = (r: number, x: number, y: number, z: number, color: string) => colored(new THREE.SphereGeometry(r, 12, 8).translate(x, y, z), color)

/** Solid prop body + glowing accent for each wing's cover type. */
function coverGeometry(kind: CoverKind, trim: string): { body: THREE.BufferGeometry; accent: THREE.BufferGeometry } {
  switch (kind) {
    case 'desk':
      return {
        body: mergeGeometries([
          box(1.7, 0.1, 1.1, 0, 0.8, 0, '#b07a45'),
          ...[[-0.75, -0.45], [0.75, -0.45], [-0.75, 0.45], [0.75, 0.45]].map(([x, z]) => box(0.08, 0.76, 0.08, x, 0.38, z, '#3a2a2a')),
          box(1.3, 0.5, 0.08, 0, 1.1, 0.62, '#5b6ee1'),
          box(0.45, 0.09, 0.32, -0.35, 0.9, -0.1, '#e8384f'),
          box(0.4, 0.07, 0.3, -0.33, 0.98, -0.1, '#2f5d9f'),
        ])!,
        accent: mergeGeometries([box(0.3, 0.02, 0.22, 0.45, 0.86, -0.15, trim), cyl(0.03, 0.03, 0.3, 0.2, 0.95, 0.2, trim, 6)])!,
      }
    case 'bench':
      return {
        body: mergeGeometries([box(1.8, 0.88, 1.3, 0, 0.44, 0, '#3d6e73'), box(1.9, 0.08, 1.4, 0, 0.92, 0, '#e8e4d8'), box(0.08, 0.7, 0.08, 0.7, 1.3, 0.5, '#9aa7a8')])!,
        accent: mergeGeometries([cyl(0.12, 0.16, 0.34, -0.5, 1.13, -0.2, trim), ball(0.18, 0.05, 1.12, 0.25, trim), cyl(0.06, 0.1, 0.42, 0.5, 1.17, -0.3, '#7ef9ff')])!,
      }
    case 'case':
      return {
        body: mergeGeometries([box(1.4, 0.9, 1.4, 0, 0.45, 0, '#4a2f1d'), box(1.5, 0.08, 1.5, 0, 0.93, 0, '#ffcf4d')])!,
        accent: mergeGeometries([cyl(0.12, 0.18, 0.12, 0, 1.03, 0, trim), cyl(0.06, 0.06, 0.3, 0, 1.24, 0, trim, 6), cyl(0.32, 0.12, 0.4, 0, 1.58, 0, trim), ball(0.1, 0, 1.9, 0, '#fff0b3')])!,
      }
    case 'shelf':
      return {
        body: mergeGeometries([
          box(1.9, 2.4, 0.9, 0, 1.2, 0, '#4a2f1d'),
          box(1.8, 0.42, 0.96, 0, 0.5, 0, '#5a4a8a'),
          box(1.8, 0.42, 0.96, 0, 1.1, 0, '#b33a3a'),
          box(1.8, 0.42, 0.96, 0, 1.7, 0, '#2f5d9f'),
        ])!,
        accent: mergeGeometries([box(0.35, 0.28, 0.24, 0.3, 2.56, 0, trim), box(0.2, 0.05, 0.3, -0.5, 2.43, 0.1, trim)])!,
      }
    case 'mat':
      return {
        body: mergeGeometries([box(1.8, 0.36, 1.8, 0, 0.18, 0, '#2f5d9f'), box(1.66, 0.36, 1.66, 0, 0.54, 0, '#e8384f'), box(1.5, 0.3, 1.5, 0, 0.87, 0, '#ffe066')])!,
        accent: mergeGeometries([ball(0.34, 0, 1.55, 0, trim)])!,
      }
  }
}

type DecorPanel = { tex: THREE.Texture; w: number; h: number; y: number }
function wallPanels(src: LevelSource): DecorPanel[] {
  const p = src.palette
  if (src.kind === 'hub') return [
    { tex: bannerTexture('SUPER', '#2d3fae', '#ffd35c'), w: 1.2, h: 2.4, y: 1.9 },
    { tex: bannerTexture('HERO ACADEMY', '#e8384f', '#fff4d8'), w: 1.2, h: 2.4, y: 1.9 },
    { tex: posterTexture('BE THE\nHERO', '#2d3fae'), w: 1.1, h: 1.55, y: 1.6 },
  ]
  switch (p.id) {
    case 'classrooms': return [
      { tex: chalkboardTexture(), w: 1.9, h: 0.95, y: 1.6 },
      { tex: lockerTexture('#5b6ee1'), w: 1.9, h: 1.9, y: 1.0 },
      { tex: posterTexture('NO FLYING\nIN HALLS', '#ffd35c'), w: 1.0, h: 1.4, y: 1.6 },
    ]
    case 'labs': return [
      { tex: posterTexture('DANGER:\nSENTIENT', '#6dff9e'), w: 1.0, h: 1.4, y: 1.6 },
      { tex: chalkboardTexture(), w: 1.9, h: 0.95, y: 1.6 },
      { tex: lockerTexture('#3d6e73'), w: 1.9, h: 1.9, y: 1.0 },
    ]
    case 'trophy': return [
      { tex: bannerTexture('CHAMPS 1987', '#c98f3a', '#1b1838'), w: 1.1, h: 2.2, y: 1.9 },
      { tex: bannerTexture('GO SUPER', '#e8384f', '#ffcf4d'), w: 1.1, h: 2.2, y: 1.9 },
      { tex: posterTexture('HALL OF\nFAME', '#ffcf4d'), w: 1.0, h: 1.4, y: 1.6 },
    ]
    case 'library': return [
      { tex: booksTexture(), w: 1.95, h: 1.95, y: 1.05 },
      { tex: booksTexture(), w: 1.95, h: 1.95, y: 1.05 },
      { tex: posterTexture('SHHH!\nTHEY HEAR', '#c58cff'), w: 1.0, h: 1.4, y: 1.6 },
    ]
    case 'stacks': return [
      { tex: booksTexture(), w: 1.95, h: 1.95, y: 1.05 },
      { tex: bannerTexture('RETURN ALL BOOKS', '#1c4a45', '#7effd4'), w: 1.1, h: 2.2, y: 1.9 },
      { tex: posterTexture('SILENCE\nIS LAW', '#7effd4'), w: 1.0, h: 1.4, y: 1.6 },
    ]
    case 'gym': return [
      { tex: bannerTexture('GRAVITY OPTIONAL', '#2f5d9f', '#7ef9ff'), w: 1.1, h: 2.2, y: 1.9 },
      { tex: lockerTexture('#e8384f'), w: 1.9, h: 1.9, y: 1.0 },
      { tex: posterTexture('DODGE!\nDUCK! DIVE!', '#ff6b8b'), w: 1.0, h: 1.4, y: 1.6 },
    ]
    default: return []
  }
}

/** Footprint / max height (m) for standing wall props and mounted pieces. */
const WALL_FITS: Record<PropId, [number, number]> = {
  painted_wooden_bench: [1.7, 1.0], marble_bust_01: [0.7, 0.9], drawer_cabinet: [1.3, 1.3], steel_frame_shelves_01: [1.6, 2.0],
  vintage_cabinet_01: [1.4, 2.0], shelf_01: [1.8, 2.4], fancy_picture_frame_01: [1.1, 1.1], industrial_wall_lamp: [0.45, 0.6],
  schooldesk_01: [1.4, 1], schoolchair_01: [0.6, 1], wooden_display_shelves_01: [1.6, 2], book_encyclopedia_set_01: [0.8, 0.4],
}
/** Small wall-mounted props: shadow casting costs more than it adds. */
const MOUNTED_NO_SHADOW = new Set<string>(['industrial_wall_lamp', 'fancy_picture_frame_01'])

export class Level {
  readonly group = new THREE.Group()
  readonly size: number
  readonly tiles: Uint8Array
  readonly rooms: RoomPlan[]
  readonly palette: WingDef
  readonly circles: Circle[] = []
  readonly lights: THREE.PointLight[] = []
  readonly moon: THREE.DirectionalLight
  private locked = new Set<number>()
  private barriers = new Map<number, THREE.Mesh[]>()
  private barrierTex: THREE.Texture
  private dist: Int16Array
  private flowFrom = -1
  private animated: { obj: THREE.Object3D; kind: 'spin' | 'bob' | 'pulse'; base: number; speed: number }[] = []
  private disposables: { dispose(): void }[] = []
  private readonly trimCuts: { nx: number; nz: number; plane: number; c: number; half: number; y0: number; y1: number }[] = []
  readonly look: WingLook
  private motes?: THREE.Points
  private flicker: { light: THREE.Sprite; base: number; seed: number }[] = []

  constructor(readonly src: LevelSource, shadowMapSize: number) {
    this.size = src.size
    this.tiles = src.tiles
    this.rooms = src.rooms
    this.palette = src.palette
    this.dist = new Int16Array(this.size * this.size)
    this.barrierTex = stripeTexture(src.palette.trim).clone()
    this.barrierTex.needsUpdate = true
    this.barrierTex.wrapS = this.barrierTex.wrapT = THREE.RepeatWrapping
    this.barrierTex.repeat.set(3, 1.5)
    this.look = WING_LOOKS[src.palette.id] ?? WING_LOOKS.classrooms
    this.buildFloor()
    this.buildWalls()
    if (src.renderCover !== false) this.buildCover()
    this.buildDecor()
    this.buildTrim()
    this.buildBarriers()
    this.buildMotes()
    // Lighting: sky/ground fill, a moonlight key that follows the player, and a small pool of
    // coloured point lights parked in the nearest rooms.
    const hemi = new THREE.HemisphereLight(src.palette.sky, src.palette.ground, 0.7)
    this.group.add(hemi)
    this.moon = new THREE.DirectionalLight('#dfe6ff', 2.1)
    this.moon.castShadow = true
    this.moon.shadow.mapSize.set(shadowMapSize, shadowMapSize)
    const c = this.moon.shadow.camera
    c.left = -24
    c.right = 24
    c.top = 24
    c.bottom = -24
    c.near = 1
    c.far = 80
    this.moon.shadow.bias = -0.0008
    this.moon.shadow.normalBias = 0.04
    this.group.add(this.moon, this.moon.target)
    for (let i = 0; i < 3; i += 1) {
      const l = new THREE.PointLight('#ffffff', 0, 30, 1.4)
      l.position.y = 5
      this.lights.push(l)
      this.group.add(l)
    }
  }

  // ─── Queries ───────────────────────────────────────────────────────────

  tile(tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= this.size || ty >= this.size) return T.Void
    return this.tiles[ty * this.size + tx]
  }
  solidForPlayer(tx: number, ty: number): boolean {
    const v = this.tile(tx, ty)
    if (v === T.Floor) return false
    if (v === T.Door) return this.locked.has(ty * this.size + tx)
    return true
  }
  solidForEnemy(tx: number, ty: number): boolean {
    return this.tile(tx, ty) !== T.Floor
  }
  solidForShot(tx: number, ty: number): boolean {
    return this.solidForPlayer(tx, ty)
  }
  roomAtWorld(x: number, z: number, inset = 0): RoomPlan | undefined {
    const tx = worldToTile(x)
    const ty = worldToTile(z)
    return this.rooms.find(r => tx >= r.x0 + inset && ty >= r.y0 + inset && tx < r.x0 + r.w - inset && ty < r.y0 + r.h - inset)
  }
  roomCenter(r: RoomPlan): THREE.Vector3 {
    return new THREE.Vector3(tileCenter(r.center.tx), 0, tileCenter(r.center.ty))
  }

  /** Push a circle out of solid tiles and static prop circles. */
  collide(p: THREE.Vector3, r: number, enemy = false): boolean {
    let hit = false
    const solid = enemy ? (x: number, y: number) => this.solidForEnemy(x, y) : (x: number, y: number) => this.solidForPlayer(x, y)
    for (let iter = 0; iter < 2; iter += 1) {
      const minX = worldToTile(p.x - r)
      const maxX = worldToTile(p.x + r)
      const minY = worldToTile(p.z - r)
      const maxY = worldToTile(p.z + r)
      for (let ty = minY; ty <= maxY; ty += 1) for (let tx = minX; tx <= maxX; tx += 1) {
        if (!solid(tx, ty)) continue
        const x0 = tx * TILE
        const z0 = ty * TILE
        const cx = Math.max(x0, Math.min(p.x, x0 + TILE))
        const cz = Math.max(z0, Math.min(p.z, z0 + TILE))
        let dx = p.x - cx
        let dz = p.z - cz
        const d2 = dx * dx + dz * dz
        if (d2 >= r * r) continue
        hit = true
        if (d2 < 1e-8) {
          // Centre inside the tile: push out along the shallowest axis.
          const pen = [p.x - x0, x0 + TILE - p.x, p.z - z0, z0 + TILE - p.z]
          const m = pen.indexOf(Math.min(...pen))
          if (m === 0) p.x = x0 - r
          else if (m === 1) p.x = x0 + TILE + r
          else if (m === 2) p.z = z0 - r
          else p.z = z0 + TILE + r
          continue
        }
        const d = Math.sqrt(d2)
        dx /= d
        dz /= d
        p.x = cx + dx * r
        p.z = cz + dz * r
      }
    }
    for (const c of this.circles) {
      const dx = p.x - c.x
      const dz = p.z - c.z
      const min = r + c.r
      const d2 = dx * dx + dz * dz
      if (d2 < min * min && d2 > 1e-8) {
        const d = Math.sqrt(d2)
        p.x = c.x + (dx / d) * min
        p.z = c.z + (dz / d) * min
        hit = true
      }
    }
    return hit
  }

  /** Line of sight at shoulder height (cover and closed doors block). */
  los(ax: number, az: number, bx: number, bz: number): boolean {
    const d = Math.hypot(bx - ax, bz - az)
    const steps = Math.ceil(d / 0.5)
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps
      if (this.solidForShot(worldToTile(ax + (bx - ax) * t), worldToTile(az + (bz - az) * t))) return false
    }
    return true
  }

  /** Fraction (0..1) of the segment from→to that is clear of wall volume, for the camera. */
  cameraClear(from: THREE.Vector3, to: THREE.Vector3): number {
    const d = from.distanceTo(to)
    const steps = Math.ceil(d / 0.2)
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps
      const x = from.x + (to.x - from.x) * t
      const y = from.y + (to.y - from.y) * t
      const z = from.z + (to.z - from.z) * t
      // A camera only just above a wall still sees its top face fill the lower screen.
      if (y > WALL_H + 1.4) continue
      const v = this.tile(worldToTile(x), worldToTile(z))
      if (v === T.Wall || v === T.Pillar || v === T.Void || (v === T.Cover && y < 1.1)) return Math.max(0, (i - 1.5) / steps)
    }
    return 1
  }

  // ─── Doors ─────────────────────────────────────────────────────────────

  private doorTiles(room: RoomPlan, dir: Dir): number[] {
    const mid = room.w >> 1
    const out: number[] = []
    for (let k = -1; k <= 1; k += 1) {
      let x: number, y: number
      if (dir === 'N' || dir === 'S') {
        x = room.x0 + mid + k
        y = dir === 'N' ? room.y0 - 1 : room.y0 + room.h
      } else {
        y = room.y0 + mid + k
        x = dir === 'W' ? room.x0 - 1 : room.x0 + room.w
      }
      out.push(y * this.size + x)
    }
    return out
  }
  lockRoom(room: RoomPlan): void {
    for (const d of room.doors) for (const i of this.doorTiles(room, d)) this.locked.add(i)
    for (const m of this.barriers.get(room.id) ?? []) m.visible = true
  }
  unlockRoom(room: RoomPlan): void {
    for (const d of room.doors) for (const i of this.doorTiles(room, d)) this.locked.delete(i)
    for (const m of this.barriers.get(room.id) ?? []) m.visible = false
  }
  /** Lock a single door (e.g. the boss arena exit until the Proctor falls). */
  lockDoorTo(room: RoomPlan, toRoom: number, locked: boolean): void {
    const link = room.links.find(l => l.to === toRoom)
    if (!link) return
    for (const i of this.doorTiles(room, link.dir)) {
      if (locked) this.locked.add(i)
      else this.locked.delete(i)
    }
    const m = (this.barriers.get(room.id) ?? []).find(b => b.userData.dir === link.dir)
    if (m) m.visible = locked
  }

  // ─── Flow field for enemy pathing ──────────────────────────────────────

  updateFlow(px: number, pz: number): void {
    const tx = worldToTile(px)
    const ty = worldToTile(pz)
    const start = ty * this.size + tx
    if (start === this.flowFrom) return
    this.flowFrom = start
    this.dist.fill(-1)
    if (tx < 0 || ty < 0 || tx >= this.size || ty >= this.size) return
    const q = new Int32Array(this.size * this.size)
    let head = 0
    let tail = 0
    q[tail++] = start
    this.dist[start] = 0
    while (head < tail) {
      const i = q[head++]
      const x = i % this.size
      const y = (i / this.size) | 0
      const d = this.dist[i]
      if (d > 40) continue
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= this.size || ny >= this.size) continue
        const j = ny * this.size + nx
        if (this.dist[j] !== -1 || this.solidForEnemy(nx, ny)) continue
        this.dist[j] = d + 1
        q[tail++] = j
      }
    }
  }
  /** Direction toward the player along the flow field (or null if unknown). */
  flowDir(x: number, z: number, out: THREE.Vector3): THREE.Vector3 | null {
    const tx = worldToTile(x)
    const ty = worldToTile(z)
    const here = this.dist[ty * this.size + tx]
    if (here === undefined || here <= 0) return null
    let best = here
    let bx = 0
    let by = 0
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = tx + dx
      const ny = ty + dy
      if (nx < 0 || ny < 0 || nx >= this.size || ny >= this.size) continue
      if (dx && dy && (this.solidForEnemy(tx + dx, ty) || this.solidForEnemy(tx, ty + dy))) continue
      const d = this.dist[ny * this.size + nx]
      if (d >= 0 && d < best) {
        best = d
        bx = nx
        by = ny
      }
    }
    if (best === here) return null
    out.set(tileCenter(bx) - x, 0, tileCenter(by) - z)
    return out.normalize()
  }

  // ─── Per-frame ─────────────────────────────────────────────────────────

  update(t: number, focus: THREE.Vector3, current?: RoomPlan): void {
    this.barrierTex.offset.x = -t * 0.8
    for (const a of this.animated) {
      if (a.kind === 'spin') a.obj.rotation.y = t * a.speed
      else if (a.kind === 'bob') a.obj.position.y = a.base + Math.sin(t * a.speed) * 0.15
      else a.obj.scale.setScalar(1 + Math.sin(t * a.speed) * 0.08)
    }
    if (this.motes) {
      this.motes.position.set(focus.x, 0, focus.z)
      ;(this.motes.material as THREE.ShaderMaterial).uniforms.uTime.value = t
    }
    for (const f of this.flicker) {
      const n = Math.sin(t * 13 + f.seed) * Math.sin(t * 7.3 + f.seed * 2)
      f.light.scale.setScalar(f.base * (0.92 + 0.08 * n + (n > 0.93 ? -0.3 : 0)))
    }
    this.moon.position.set(focus.x - 12, 26, focus.z - 8)
    this.moon.target.position.set(focus.x, 0, focus.z)
    // Point light pool: current room + two nearest others.
    const sorted = [...this.rooms].sort((a, b) => {
      const da = (tileCenter(a.center.tx) - focus.x) ** 2 + (tileCenter(a.center.ty) - focus.z) ** 2
      const db = (tileCenter(b.center.tx) - focus.x) ** 2 + (tileCenter(b.center.ty) - focus.z) ** 2
      return (a === current ? -1e9 : da) - (b === current ? -1e9 : db)
    })
    this.lights.forEach((l, i) => {
      const r = sorted[i]
      if (!r) {
        l.intensity = 0
        return
      }
      l.position.set(tileCenter(r.center.tx), 7.5, tileCenter(r.center.ty))
      l.color.set(r.light.color)
      const target = (i === 0 ? 40 : 20) * r.light.intensity
      l.intensity += (target - l.intensity) * 0.1
      l.distance = r.w * TILE * 1.3
    })
  }

  dispose(): void {
    this.group.traverse(o => {
      const m = o as THREE.Mesh
      if (m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh) m.geometry?.dispose()
    })
    for (const d of this.disposables) d.dispose()
    this.barrierTex.dispose()
    this.group.removeFromParent()
  }

  // ─── Builders ──────────────────────────────────────────────────────────

  private roomOf(tx: number, ty: number): RoomPlan | undefined {
    return this.rooms.find(r => tx >= r.x0 && ty >= r.y0 && tx < r.x0 + r.w && ty < r.y0 + r.h)
  }

  /** Walkable tiles as one merged mesh with world-space UVs (continuous texture across tiles). */
  private buildFloor(): void {
    const p = this.palette
    const L = this.look
    const walk: [number, number][] = []
    for (let y = 0; y < this.size; y += 1) for (let x = 0; x < this.size; x += 1) {
      const v = this.tiles[y * this.size + x]
      if (v === T.Floor || v === T.Door || v === T.Cover) walk.push([x, y])
    }
    const n = walk.length
    const pos = new Float32Array(n * 12)
    const uv = new Float32Array(n * 8)
    const col = new Float32Array(n * 12)
    const idx = new Uint32Array(n * 6)
    const c = new THREE.Color()
    const white = new THREE.Color('#ffffff')
    const corridor = new THREE.Color('#ffffff').lerp(new THREE.Color(p.corridor), 0.35).multiplyScalar(0.8)
    const door = new THREE.Color('#ffffff').lerp(new THREE.Color(p.trim), 0.25).multiplyScalar(0.75)
    walk.forEach(([x, y], i) => {
      const x0 = x * TILE
      const z0 = y * TILE
      const corners = [[x0, z0], [x0, z0 + TILE], [x0 + TILE, z0 + TILE], [x0 + TILE, z0]]
      const room = this.roomOf(x, y)
      const v = this.tiles[y * this.size + x]
      if (v === T.Door) c.copy(door)
      else if (room) {
        c.copy(white)
        const tint = KIND_COLOR[room.kind]
        if (tint && room.kind !== 'entrance' && this.src.kind === 'dungeon') c.lerp(new THREE.Color(tint), room.kind === 'boss' ? 0.14 : 0.07)
      } else c.copy(corridor)
      corners.forEach(([cx, cz], k) => {
        pos.set([cx, 0, cz], i * 12 + k * 3)
        uv.set([cx / L.floorScale, -cz / L.floorScale], i * 8 + k * 2)
        col.set([c.r, c.g, c.b], i * 12 + k * 3)
      })
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6)
    })
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    geo.setIndex(new THREE.BufferAttribute(idx, 1))
    geo.computeVertexNormals()
    geo.computeTangents?.()
    const mat = surface(L.floor, { tint: p.floorA, tintAmount: L.tint, roughness: L.gloss, vertexColors: true, env: 0.5, minRough: 0.6 })
    const floor = new THREE.Mesh(geo, mat)
    floor.receiveShadow = true
    this.group.add(floor)
    // Room-type floor sigils so every special room reads at a glance (soft additive inlays).
    for (const r of this.rooms) {
      const color = KIND_COLOR[r.kind]
      if (!color || this.src.kind === 'hub') continue
      const size = r.kind === 'boss' ? 7 : 2.4
      const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.0), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
      this.disposables.push(ringMat)
      const ring = new THREE.Mesh(new THREE.RingGeometry(size, size + 0.18, 64).rotateX(-Math.PI / 2), ringMat)
      ring.position.set(tileCenter(r.center.tx), 0.025, tileCenter(r.center.ty))
      this.group.add(ring)
      if (r.kind === 'boss') {
        const inner = new THREE.Mesh(new THREE.RingGeometry(3.4, 3.55, 6).rotateX(-Math.PI / 2), ringMat)
        inner.position.copy(ring.position)
        this.group.add(inner)
        this.animated.push({ obj: inner, kind: 'spin', base: 0, speed: 0.2 })
      }
    }
  }

  /** Wall faces that meet open floor: [cellX, cellY, dir]. */
  private openFaces(): { x: number; y: number; d: Dir; pillar: boolean }[] {
    const out: { x: number; y: number; d: Dir; pillar: boolean }[] = []
    for (let y = 0; y < this.size; y += 1) for (let x = 0; x < this.size; x += 1) {
      const v = this.tiles[y * this.size + x]
      if (v !== T.Wall && v !== T.Pillar) continue
      for (const d of ['N', 'E', 'S', 'W'] as Dir[]) {
        const dv = DIR_VEC[d]
        const nb = this.tile(x + dv.x, y + dv.y)
        if (nb === T.Floor || nb === T.Door || nb === T.Cover) out.push({ x, y, d, pillar: v === T.Pillar })
      }
    }
    return out
  }

  /**
   * Walls as merged face geometry with world-space UVs: plaster above a dark wood wainscot,
   * a chair rail, a thin neon baseboard (the wing's accent colour), dark caps, and a soft
   * contact-shadow strip on the floor along every wall.
   */
  private buildWalls(): void {
    const p = this.palette
    const L = this.look
    const faces = this.openFaces()
    const WAIN = 1.0
    const upper: number[] = []
    const upperUv: number[] = []
    const lower: number[] = []
    const lowerUv: number[] = []
    const ao: number[] = []
    const aoUv: number[] = []
    const quad = (P: number[], U: number[], a: THREE.Vector3, b: THREE.Vector3, y0: number, y1: number, u0: number, u1: number, scale: number) => {
      const v = [[a.x, y0, a.z, u0, y0], [b.x, y0, b.z, u1, y0], [b.x, y1, b.z, u1, y1], [a.x, y0, a.z, u0, y0], [b.x, y1, b.z, u1, y1], [a.x, y1, a.z, u0, y1]]
      for (const [x, y, z, u, vv] of v) {
        P.push(x, y, z)
        U.push(u / scale, vv / scale)
      }
    }
    const A = new THREE.Vector3()
    const B = new THREE.Vector3()
    for (const f of faces) {
      const dv = DIR_VEC[f.d]
      // Face plane sits on the tile edge toward the open neighbour; winding faces outward.
      const cx = tileCenter(f.x) + dv.x * TILE / 2
      const cz = tileCenter(f.y) + dv.y * TILE / 2
      const tx = -dv.y
      const tz = dv.x
      A.set(cx - tx * TILE / 2, 0, cz - tz * TILE / 2)
      B.set(cx + tx * TILE / 2, 0, cz + tz * TILE / 2)
      // Keep front faces toward the room: swap for consistent CCW seen from the neighbour.
      const a = A.clone()
      const b = B.clone()
      const along0 = a.x * Math.abs(tx) + a.z * Math.abs(tz)
      const along1 = b.x * Math.abs(tx) + b.z * Math.abs(tz)
      const inset = 0.035
      const la = a.clone().add(new THREE.Vector3(dv.x * inset, 0, dv.y * inset))
      const lb = b.clone().add(new THREE.Vector3(dv.x * inset, 0, dv.y * inset))
      quad(upper, upperUv, b, a, WAIN, WALL_H, along1, along0, L.wallScale)
      quad(lower, lowerUv, lb, la, 0, WAIN, along1, along0, 1.5)
      // Floor contact shadow strip (0.8 m into the room).
      const oa = a.clone().add(new THREE.Vector3(dv.x * 0.8, 0, dv.y * 0.8))
      const ob = b.clone().add(new THREE.Vector3(dv.x * 0.8, 0, dv.y * 0.8))
      for (const [q, v] of [[a, 0], [b, 0], [ob, 1], [a, 0], [ob, 1], [oa, 1]] as Array<[THREE.Vector3, number]>) {
        ao.push(q.x, 0.012, q.z)
        aoUv.push(0.5, v)
      }
    }
    const build = (P: number[], U: number[]) => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
      g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2))
      g.computeVertexNormals()
      return g
    }
    const wallMat = surface(L.wall, { tint: p.wall, tintAmount: L.tint + 0.1, roughness: 1, env: 0.3, key: 'wall', minRough: 0.75 })
    wallMat.side = THREE.DoubleSide
    wallMat.shadowSide = THREE.DoubleSide
    const trimMat = surface(TRIM_SURFACE, { tint: p.wall, tintAmount: 0.25, roughness: 0.9, env: 0.35, key: 'wain', minRough: 0.7 })
    trimMat.side = THREE.DoubleSide
    const upperMesh = new THREE.Mesh(build(upper, upperUv), wallMat)
    const lowerMesh = new THREE.Mesh(build(lower, lowerUv), trimMat)
    upperMesh.castShadow = upperMesh.receiveShadow = true
    lowerMesh.castShadow = lowerMesh.receiveShadow = true
    this.group.add(upperMesh, lowerMesh)
    const aoMat = new THREE.MeshBasicMaterial({
      color: '#000000', transparent: true, depthWrite: false, opacity: 0.55,
      alphaMap: canvasTexture('wall-ao', 4, 64, g => {
        const grd = g.createLinearGradient(0, 0, 0, 64)
        grd.addColorStop(0, '#ffffff')
        grd.addColorStop(0.35, '#555555')
        grd.addColorStop(1, '#000000')
        g.fillStyle = grd
        g.fillRect(0, 0, 4, 64)
      }),
    })
    const aoMesh = new THREE.Mesh(build(ao, aoUv), aoMat)
    aoMesh.renderOrder = 1
    this.group.add(aoMesh)
    this.disposables.push(aoMat)
    // Caps over every wall cell that borders open floor.
    const cells: [number, number, number][] = []
    const nearOpen = (x: number, y: number) => {
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const v = this.tile(x + dx, y + dy)
        if (v === T.Floor || v === T.Door || v === T.Cover) return true
      }
      return false
    }
    for (let y = 0; y < this.size; y += 1) for (let x = 0; x < this.size; x += 1) {
      const v = this.tiles[y * this.size + x]
      if ((v === T.Wall || v === T.Pillar) && nearOpen(x, y)) cells.push([x, y, v])
    }
    const capMat = toon(new THREE.Color(p.wallTop).multiplyScalar(0.35), { roughness: 0.7, key: 'cap' })
    const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE + 0.08, 0.16, TILE + 0.08), capMat, cells.length)
    const m = new THREE.Matrix4()
    cells.forEach(([x, y], i) => {
      m.makeTranslation(tileCenter(x), WALL_H + 0.08, tileCenter(y))
      caps.setMatrixAt(i, m)
    })
    caps.castShadow = true
    this.group.add(caps)
  }

  /**
   * Chair rail, crown moulding and neon baseboard on every open face, built after the decor so each
   * run is interrupted wherever a poster, locker bank, bookcase or piece of furniture sits on the
   * wall: trim never draws across (or through) anything mounted in front of it.
   */
  private buildTrim(): void {
    const p = this.palette
    const faces = this.openFaces()
    const TRIMS = [
      { y: 1.0, h: 0.08, rail: true },
      { y: WALL_H - 0.1, h: 0.08, rail: true },
      { y: 0.07, h: 0.035, rail: false },
    ]
    const rails: THREE.Matrix4[] = []
    const neon: THREE.Matrix4[] = []
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    for (const f of faces) {
      const dv = DIR_VEC[f.d]
      const alongZ = dv.x !== 0
      const plane = alongZ ? tileCenter(f.x) + dv.x * TILE / 2 : tileCenter(f.y) + dv.y * TILE / 2
      const c = alongZ ? tileCenter(f.y) : tileCenter(f.x)
      q.setFromAxisAngle(up, alongZ ? Math.PI / 2 : 0)
      const cuts = this.trimCuts.filter(k => k.nx === dv.x && k.nz === dv.y && Math.abs(k.plane - plane) < 0.3)
      for (const t of TRIMS) {
        // Subtract every cut overlapping this trim's height from the segment [c - T/2, c + T/2].
        let pieces: [number, number][] = [[c - TILE / 2, c + TILE / 2]]
        for (const k of cuts) {
          if (k.y1 < t.y - t.h / 2 || k.y0 > t.y + t.h / 2) continue
          const a = k.c - k.half - 0.02
          const b = k.c + k.half + 0.02
          pieces = pieces.flatMap(([u, v]): [number, number][] => {
            if (b <= u || a >= v) return [[u, v]]
            const out: [number, number][] = []
            if (a - u > 0.03) out.push([u, a])
            if (v - b > 0.03) out.push([b, v])
            return out
          })
        }
        for (const [u, v] of pieces) {
          const mid = (u + v) / 2
          const pos = alongZ ? new THREE.Vector3(plane + dv.x * 0.05, t.y, mid) : new THREE.Vector3(mid, t.y, plane + dv.y * 0.05)
          ;(t.rail ? rails : neon).push(new THREE.Matrix4().compose(pos, q, new THREE.Vector3((v - u) / TILE, 1, 1)))
        }
      }
    }
    const railMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE, 0.08, 0.1), toon('#2a1c14', { roughness: 0.45, key: 'rail' }), rails.length)
    rails.forEach((mm, i) => railMesh.setMatrixAt(i, mm))
    railMesh.castShadow = true
    const neonMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(p.trim).multiplyScalar(0.9), toneMapped: false })
    this.disposables.push(neonMat)
    const neonMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE, 0.035, 0.03), neonMat, neon.length)
    neon.forEach((mm, i) => neonMesh.setMatrixAt(i, mm))
    this.group.add(railMesh, neonMesh)
  }
  /** Register a wall region (face point x/z, facing yaw rot) that wall trim must not cross. */
  private cutTrim(x: number, z: number, rot: number, half: number, y0: number, y1: number): void {
    const nx = Math.round(Math.sin(rot)) || 0
    const nz = Math.round(Math.cos(rot)) || 0
    this.trimCuts.push({ nx, nz, plane: nx !== 0 ? x : z, c: nx !== 0 ? z : x, half, y0, y1 })
  }
  /** Placement matrix for a prop standing on tile (x, y) with a yaw. */
  private static place(x: number, z: number, yaw: number, y = 0): THREE.Matrix4 {
    return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1))
  }

  private addProp(id: PropId, placements: THREE.Matrix4[], footprint: number, maxH = Infinity): number | null {
    const model = propModel(id)
    if (!model || !placements.length) return model ? fitScale(model, footprint, maxH) * model.size.y : null
    const k = fitScale(model, footprint, maxH)
    for (const inst of instanceProp(model, placements, k)) {
      if (MOUNTED_NO_SHADOW.has(id)) inst.castShadow = false
      this.group.add(inst)
    }
    return model.size.y * k
  }

  private buildCover(): void {
    const p = this.palette
    const spots: [number, number][] = []
    for (let y = 0; y < this.size; y += 1) for (let x = 0; x < this.size; x += 1) if (this.tiles[y * this.size + x] === T.Cover) spots.push([x, y])
    if (!spots.length) return
    const ids = COVER_PROPS[p.cover] ?? []
    const haveModels = ids.length > 0 && ids.every(id => propModel(id))
    const yawOf = (x: number, y: number) => (((x * 7 + y * 13) % 4) * Math.PI) / 2
    if (haveModels) {
      const main = spots.map(([x, y]) => Level.place(tileCenter(x), tileCenter(y), yawOf(x, y)))
      if (p.cover === 'desk') {
        this.addProp('schooldesk_01', main, 1.45, 1.0)
        const chairs = spots.map(([x, y]) => {
          const yaw = yawOf(x, y)
          return Level.place(tileCenter(x) + Math.sin(yaw) * 0.62, tileCenter(y) + Math.cos(yaw) * 0.62, yaw + Math.PI + ((x + y) % 3 - 1) * 0.15)
        })
        this.addProp('schoolchair_01', chairs, 0.62, 1.0)
      } else if (p.cover === 'shelf') {
        const h = this.addProp('shelf_01', main, 1.9, 2.5) ?? 2.2
        const books = spots.map(([x, y]) => Level.place(tileCenter(x), tileCenter(y), yawOf(x, y) + Math.PI / 2, h))
        this.addProp('book_encyclopedia_set_01', books, 0.9, 0.4)
      } else if (p.cover === 'case') {
        const h = this.addProp('wooden_display_shelves_01', main, 1.8, 2.0) ?? 1.8
        this.addTrophies(spots.map(([x, y]) => new THREE.Vector3(tileCenter(x), h, tileCenter(y))), p.trim)
      } else if (p.cover === 'bench') {
        const h = this.addProp('steel_frame_shelves_01', main, 1.85, 1.9) ?? 1.8
        this.addBeakers(spots.map(([x, y]) => new THREE.Vector3(tileCenter(x), h, tileCenter(y))), p.trim)
      }
      return
    }
    if (p.cover === 'mat') {
      this.addMats(spots, yawOf)
      return
    }
    // Procedural fallback (props not loaded).
    const { body, accent } = coverGeometry(p.cover, p.trim)
    const bodyMesh = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05 }), spots.length)
    const accentMesh = new THREE.InstancedMesh(accent, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), spots.length)
    bodyMesh.castShadow = true
    bodyMesh.receiveShadow = true
    spots.forEach(([x, y], i) => {
      const m = Level.place(tileCenter(x), tileCenter(y), yawOf(x, y))
      bodyMesh.setMatrixAt(i, m)
      accentMesh.setMatrixAt(i, m)
    })
    this.group.add(bodyMesh, accentMesh)
    this.disposables.push(bodyMesh.material as THREE.Material, accentMesh.material as THREE.Material)
  }

  /** Gold trophy cups on top of trophy cases (metallic PBR + a faint glint). */
  private addTrophies(tops: THREE.Vector3[], trim: string): void {
    const gold = toon('#d9a441', { roughness: 0.22, metalness: 1, key: 'gold' })
    const cup = mergeGeometries([
      new THREE.CylinderGeometry(0.16, 0.2, 0.08, 20).translate(0, 0.04, 0),
      new THREE.CylinderGeometry(0.04, 0.04, 0.22, 12).translate(0, 0.19, 0),
      new THREE.CylinderGeometry(0.22, 0.08, 0.3, 24, 1, true).translate(0, 0.45, 0),
      new THREE.TorusGeometry(0.1, 0.02, 8, 16).rotateY(Math.PI / 2).translate(0.24, 0.47, 0),
      new THREE.TorusGeometry(0.1, 0.02, 8, 16).rotateY(Math.PI / 2).translate(-0.24, 0.47, 0),
    ].map(g => g.toNonIndexed()))!
    const inst = new THREE.InstancedMesh(cup, gold, tops.length)
    tops.forEach((t, i) => inst.setMatrixAt(i, Level.place(t.x, t.z, i * 1.3, t.y)))
    inst.castShadow = true
    this.group.add(inst)
    for (const t of tops) {
      const g = glowSprite(trim, 0.5, 0.3)
      g.position.set(t.x, t.y + 0.5, t.z)
      this.group.add(g)
    }
  }

  /** Glass beakers with glowing reagents on lab shelving. */
  private addBeakers(tops: THREE.Vector3[], trim: string): void {
    const glass = new THREE.MeshPhysicalMaterial({ color: '#dff6ff', roughness: 0.25, metalness: 0, transparent: true, opacity: 0.3, depthWrite: false })
    const liquid = new THREE.MeshBasicMaterial({ color: new THREE.Color(trim).multiplyScalar(0.85), toneMapped: false })
    this.disposables.push(glass, liquid)
    const shell = new THREE.CylinderGeometry(0.1, 0.12, 0.34, 16, 1, true)
    const fill = new THREE.CylinderGeometry(0.09, 0.11, 0.18, 12)
    const n = tops.length * 3
    const shells = new THREE.InstancedMesh(shell, glass, n)
    const fills = new THREE.InstancedMesh(fill, liquid, n)
    tops.forEach((t, i) => {
      for (let k = 0; k < 3; k += 1) {
        const x = t.x + (k - 1) * 0.42
        shells.setMatrixAt(i * 3 + k, Level.place(x, t.z, 0, t.y + 0.17))
        fills.setMatrixAt(i * 3 + k, Level.place(x, t.z, 0, t.y + 0.09))
      }
      const g = glowSprite(trim, 0.8, 0.25)
      g.position.set(t.x, t.y + 0.25, t.z)
      this.group.add(g)
    })
    this.group.add(fills, shells)
  }

  /** Stacked vinyl gym mats with a medicine ball (procedural PBR). */
  private addMats(spots: [number, number][], yawOf: (x: number, y: number) => number): void {
    const vinylA = new THREE.MeshPhysicalMaterial({ color: '#2f5d9f', roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.3 })
    const vinylB = new THREE.MeshPhysicalMaterial({ color: '#b3122e', roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.3 })
    const ballMat = toon('#5a3a28', { roughness: 0.7, key: 'medball' })
    this.disposables.push(vinylA, vinylB)
    const slab = new THREE.BoxGeometry(1.8, 0.3, 1.8, 1, 1, 1)
    const a = new THREE.InstancedMesh(slab, vinylA, spots.length * 2)
    const b = new THREE.InstancedMesh(slab, vinylB, spots.length)
    const ball = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 24, 16), ballMat, spots.length)
    spots.forEach(([x, y], i) => {
      const yaw = yawOf(x, y)
      a.setMatrixAt(i * 2, Level.place(tileCenter(x), tileCenter(y), yaw, 0.15))
      b.setMatrixAt(i, Level.place(tileCenter(x), tileCenter(y), yaw + 0.08, 0.45))
      a.setMatrixAt(i * 2 + 1, Level.place(tileCenter(x), tileCenter(y), yaw - 0.05, 0.75))
      ball.setMatrixAt(i, Level.place(tileCenter(x) + 0.3, tileCenter(y) - 0.2, 0, 1.2))
    })
    for (const m of [a, b, ball]) {
      m.castShadow = true
      m.receiveShadow = true
      this.group.add(m)
    }
  }

  private buildDecor(): void {
    const panels = wallPanels(this.src)
    const L = this.look
    const wallProps: THREE.Matrix4[][] = L.wallProps.map(() => [])
    const mounted: THREE.Matrix4[][] = L.mounted.map(() => [])
    const lampGlows: THREE.Vector3[] = []
    const mats = panels.map(pp => new THREE.MeshStandardMaterial({ map: pp.tex, transparent: true, alphaTest: 0.1, roughness: 0.85, metalness: 0 }))
    this.disposables.push(...mats)
    for (const room of this.rooms) {
      if (room.kind === 'boss' && this.src.kind === 'dungeon') continue
      let placed = 0
      const budget = this.src.kind === 'hub' ? 10 : 4
      const mid = room.w >> 1
      // Candidate inner wall faces: every other tile along each side, away from door sockets.
      const faces: { x: number; z: number; rot: number }[] = []
      for (let i = 1; i < room.w - 1; i += 2) {
        if (Math.abs(i - mid) <= 2) continue
        faces.push({ x: tileCenter(room.x0 + i), z: room.y0 * TILE + 0.04, rot: 0 })
        faces.push({ x: tileCenter(room.x0 + i), z: (room.y0 + room.h) * TILE - 0.04, rot: Math.PI })
        faces.push({ x: room.x0 * TILE + 0.04, z: tileCenter(room.y0 + i), rot: Math.PI / 2 })
        faces.push({ x: (room.x0 + room.w) * TILE - 0.04, z: tileCenter(room.y0 + i), rot: -Math.PI / 2 })
      }
      const used = new Set<number>()
      const clear = (f: { x: number; z: number; rot: number }, dist = 1.2) => this.tile(worldToTile(f.x + Math.sin(f.rot) * dist), worldToTile(f.z + Math.cos(f.rot) * dist)) === T.Floor
      for (let k = 0; k < faces.length && placed < budget && panels.length; k += 1) {
        const fi = (k * 7 + room.id * 3) % faces.length
        const f = faces[fi]
        if (used.has(fi) || !clear(f)) continue
        used.add(fi)
        const pi = (placed + room.id) % panels.length
        const pp = panels[pi]
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(pp.w, pp.h), mats[pi])
        plane.position.set(f.x + Math.sin(f.rot) * 0.035, pp.y, f.z + Math.cos(f.rot) * 0.035)
        this.cutTrim(f.x, f.z, f.rot, pp.w / 2, pp.y - pp.h / 2, pp.y + pp.h / 2)
        plane.rotation.y = f.rot
        plane.receiveShadow = true
        this.group.add(plane)
        placed += 1
      }
      // Standing furniture against free faces (collides), then wall-mounted pieces above.
      let stand = 0
      let mount = 0
      for (let k = 0; k < faces.length; k += 1) {
        const fi = (k * 5 + room.id * 11 + 3) % faces.length
        if (used.has(fi)) continue
        const f = faces[fi]
        if (!clear(f, 1.0) || !clear(f, 2.2)) continue
        if (stand < (this.src.kind === 'hub' ? 3 : 2) && L.wallProps.length) {
          const which = (stand + room.id) % L.wallProps.length
          const pid = L.wallProps[which]
          const model = propModel(pid)
          const k = model ? fitScale(model, WALL_FITS[pid][0], WALL_FITS[pid][1]) : 1
          // The model's back (local -Z side) must sit in front of the 0.1 m chair rail.
          const off = model ? Math.max(0.35, 0.14 - model.min.z * k) : 0.35
          const x = f.x + Math.sin(f.rot) * off
          const z = f.z + Math.cos(f.rot) * off
          if (model) this.cutTrim(f.x, f.z, f.rot, (model.size.x * k) / 2, 0, model.size.y * k)
          wallProps[which].push(Level.place(x, z, f.rot))
          this.circles.push({ x: x + Math.sin(f.rot) * 0.1, z: z + Math.cos(f.rot) * 0.1, r: 0.55 })
          used.add(fi)
          stand += 1
        } else if (mount < 2 && L.mounted.length) {
          const which = (mount + room.id) % L.mounted.length
          const id = L.mounted[which]
          const y = id === 'industrial_wall_lamp' ? 2.3 : 1.75
          mounted[which].push(Level.place(f.x + Math.sin(f.rot) * 0.02, f.z + Math.cos(f.rot) * 0.02, f.rot, y))
          const mm = propModel(id)
          if (mm) {
            const k = fitScale(mm, WALL_FITS[id][0], WALL_FITS[id][1])
            this.cutTrim(f.x, f.z, f.rot, (mm.size.x * k) / 2, y + mm.min.y * k, y + (mm.min.y + mm.size.y) * k)
          }
          if (id === 'industrial_wall_lamp') lampGlows.push(new THREE.Vector3(f.x + Math.sin(f.rot) * 0.3, y + 0.05, f.z + Math.cos(f.rot) * 0.3))
          used.add(fi)
          mount += 1
        }
      }
    }
    L.wallProps.forEach((id, i) => this.addProp(id, wallProps[i], WALL_FITS[id][0], WALL_FITS[id][1]))
    L.mounted.forEach((id, i) => this.addProp(id, mounted[i], WALL_FITS[id][0], WALL_FITS[id][1]))
    // Warm lamp glow (sprite halo, gently flickering) instead of more real lights.
    lampGlows.forEach((v, i) => {
      const g = glowSprite('#ffc27a', 0.7, 0.35)
      g.position.copy(v)
      this.group.add(g)
      this.flicker.push({ light: g, base: 0.7, seed: i * 1.7 })
    })
    // Lamp posts on authored decor anchors ('p'): iron posts with glowing lanterns; they collide.
    const pole = new THREE.CylinderGeometry(0.06, 0.1, 2.4, 12)
    const cage = new THREE.CylinderGeometry(0.2, 0.16, 0.42, 6, 1, true)
    const bulb = new THREE.SphereGeometry(0.13, 16, 12)
    const iron = toon('#1c1a22', { roughness: 0.35, metalness: 0.9, key: 'iron' })
    for (const room of this.rooms) {
      for (const d of room.decor) {
        const x = tileCenter(d.tx)
        const z = tileCenter(d.ty)
        const post = new THREE.Mesh(pole, iron)
        post.position.set(x, 1.2, z)
        post.castShadow = true
        const lantern = new THREE.Mesh(cage, iron)
        lantern.position.set(x, 2.55, z)
        const b = new THREE.Mesh(bulb, glow(new THREE.Color(room.light.color).multiplyScalar(1.6).getStyle()))
        b.position.set(x, 2.55, z)
        const halo = glowSprite(room.light.color, 0.8, 0.3)
        halo.position.set(x, 2.55, z)
        this.group.add(post, lantern, b, halo)
        this.flicker.push({ light: halo, base: 0.8, seed: d.tx * 3.1 + d.ty })
        this.circles.push({ x, z, r: 0.3 })
      }
    }
  }

  /** Drifting dust motes around the player (soft additive points; cheap atmosphere). */
  private buildMotes(): void {
    const N = 220
    const pos = new Float32Array(N * 3)
    const seed = new Float32Array(N)
    for (let i = 0; i < N; i += 1) {
      pos[i * 3] = (Math.random() - 0.5) * 28
      pos[i * 3 + 1] = Math.random() * 3.2
      pos[i * 3 + 2] = (Math.random() - 0.5) * 28
      seed[i] = Math.random() * 100
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1))
    const tint = new THREE.Color(this.palette.lights[0] ?? '#ffffff').lerp(new THREE.Color('#ffffff'), 0.6)
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: tint } },
      vertexShader: /* glsl */ `
        attribute float seed; uniform float uTime; varying float vA;
        void main() {
          vec3 p = position;
          p.x += sin(uTime * 0.21 + seed) * 0.8;
          p.z += cos(uTime * 0.17 + seed * 1.3) * 0.8;
          p.y = mod(p.y + uTime * 0.06 + seed * 0.01, 3.2) + 0.1;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = min((40.0 + mod(seed, 1.0) * 45.0) / -mv.z, 7.0);
          vA = (0.35 + 0.65 * abs(sin(uTime * 0.7 + seed))) * smoothstep(40.0, 6.0, -mv.z) * smoothstep(3.0, 7.0, -mv.z);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d) * vA * 0.5;
          gl_FragColor = vec4(uColor, a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })
    this.disposables.push(mat)
    this.motes = new THREE.Points(g, mat)
    this.motes.frustumCulled = false
    this.group.add(this.motes)
  }

  private buildBarriers(): void {
    const mat = new THREE.MeshBasicMaterial({ map: this.barrierTex, color: this.palette.trim, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })
    this.disposables.push(mat)
    const geo = new THREE.PlaneGeometry(TILE * 3, 2.6)
    for (const room of this.rooms) {
      const list: THREE.Mesh[] = []
      const mid = room.w >> 1
      for (const dir of room.doors) {
        const m = new THREE.Mesh(geo, mat)
        let x: number, z: number
        if (dir === 'N' || dir === 'S') {
          x = tileCenter(room.x0 + mid)
          z = dir === 'N' ? room.y0 * TILE - 0.2 : (room.y0 + room.h) * TILE + 0.2
        } else {
          z = tileCenter(room.y0 + mid)
          x = dir === 'W' ? room.x0 * TILE - 0.2 : (room.x0 + room.w) * TILE + 0.2
          m.rotation.y = Math.PI / 2
        }
        m.position.set(x, 1.3, z)
        m.visible = false
        m.userData.dir = dir
        this.group.add(m)
        list.push(m)
      }
      this.barriers.set(room.id, list)
    }
  }

  /** Register a spinning/bobbing decorative object (used by the hub and interactables). */
  animate(obj: THREE.Object3D, kind: 'spin' | 'bob' | 'pulse', speed: number): void {
    this.animated.push({ obj, kind, base: obj.position.y, speed })
  }
}
