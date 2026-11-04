import type { ItemId, PieceId, Station } from './items'

export type Vec3 = { x: number; y: number; z: number }
export type Box = { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }
export type SnapKind = 'block' | 'cell' | 'edge' | 'corner' | 'ridge' | 'free'

export type PieceDef = {
  id: PieceId
  item: ItemId
  name: string
  /** Unrotated size (x, y, z); position is the bottom centre. */
  size: [number, number, number]
  snap: SnapKind
  hp: number
  mat: 'stone' | 'wood' | 'soft'
  solid: boolean
  ramp?: boolean
  light?: { color: number; intensity: number; distance: number; y: number }
  /** Night creatures will not approach within this radius. */
  ward?: number
  station?: Station
  /** Storage slots (chests). */
  storage?: number
  /** Door: collision comes from its frame and leaf instead of the full box. */
  door?: boolean
  /** Window wall: hollow collider around the pane opening. */
  window?: boolean
  /** Hip corner: walkable surface rises toward local +x and +z (height = rise·min(u, v)). */
  hip?: boolean
  /** Gable: right-triangle wall rising toward local +x. */
  gable?: boolean
  /** Counts as overhead cover for the Sheltered check. */
  roof?: boolean
}

export const PIECES: Record<PieceId, PieceDef> = {
  stone_block: { id: 'stone_block', item: 'stone_block', name: 'Rounded Stone Block', size: [1, 1, 1], snap: 'block', hp: 6, mat: 'stone', solid: true },
  foundation: { id: 'foundation', item: 'foundation', name: 'Stone Foundation', size: [2, 1, 2], snap: 'cell', hp: 14, mat: 'stone', solid: true },
  wood_floor: { id: 'wood_floor', item: 'wood_floor', name: 'Wood Floor', size: [2, 0.16, 2], snap: 'cell', hp: 7, mat: 'wood', solid: true },
  wood_wall: { id: 'wood_wall', item: 'wood_wall', name: 'Wood Wall', size: [2, 2.4, 0.18], snap: 'edge', hp: 8, mat: 'wood', solid: true },
  wood_ramp: { id: 'wood_ramp', item: 'wood_ramp', name: 'Wood Ramp', size: [2, 1.2, 2], snap: 'cell', hp: 7, mat: 'wood', solid: false, ramp: true },
  wood_pillar: { id: 'wood_pillar', item: 'wood_pillar', name: 'Wood Pillar', size: [0.34, 2.4, 0.34], snap: 'corner', hp: 6, mat: 'wood', solid: true },
  campfire: { id: 'campfire', item: 'campfire', name: 'Campfire', size: [1.1, 0.5, 1.1], snap: 'free', hp: 3, mat: 'soft', solid: false, light: { color: 0xff9a4a, intensity: 26, distance: 16, y: 0.7 }, ward: 12, station: 'campfire' },
  workbench: { id: 'workbench', item: 'workbench', name: 'Workbench', size: [1.6, 0.95, 0.8], snap: 'free', hp: 5, mat: 'wood', solid: true, station: 'workbench' },
  torch: { id: 'torch', item: 'torch', name: 'Torch', size: [0.2, 1.05, 0.2], snap: 'free', hp: 1, mat: 'soft', solid: false, light: { color: 0xffa860, intensity: 12, distance: 11, y: 1.05 }, ward: 6 },
  lamp: { id: 'lamp', item: 'lamp', name: 'Crystal Lamp', size: [0.6, 0.9, 0.6], snap: 'free', hp: 3, mat: 'stone', solid: true, light: { color: 0x8ff5e8, intensity: 16, distance: 14, y: 0.75 }, ward: 9 },
  // New pieces are appended so saved piece indices stay valid.
  wood_door: { id: 'wood_door', item: 'wood_door', name: 'Wood Door', size: [2, 2.4, 0.18], snap: 'edge', hp: 10, mat: 'wood', solid: true, door: true },
  wood_roof: { id: 'wood_roof', item: 'wood_roof', name: 'Shingle Roof', size: [2, 1.1, 2], snap: 'cell', hp: 7, mat: 'wood', solid: false, ramp: true, roof: true },
  storage_chest: { id: 'storage_chest', item: 'storage_chest', name: 'Storage Chest', size: [1.0, 0.78, 0.62], snap: 'free', hp: 6, mat: 'wood', solid: true, storage: 18 },
  wood_window: { id: 'wood_window', item: 'wood_window', name: 'Window Wall', size: [2, 2.4, 0.18], snap: 'edge', hp: 8, mat: 'wood', solid: true, window: true },
  half_wall: { id: 'half_wall', item: 'half_wall', name: 'Half Wall', size: [2, 1.2, 0.18], snap: 'edge', hp: 6, mat: 'wood', solid: true },
  gable_wall: { id: 'gable_wall', item: 'gable_wall', name: 'Gable Wall', size: [2, 1.1, 0.18], snap: 'edge', hp: 6, mat: 'wood', solid: true, gable: true },
  ridge_cap: { id: 'ridge_cap', item: 'ridge_cap', name: 'Ridge Cap', size: [2.1, 0.3, 0.62], snap: 'ridge', hp: 5, mat: 'wood', solid: false, roof: true },
  roof_corner: { id: 'roof_corner', item: 'roof_corner', name: 'Roof Corner', size: [2, 1.1, 2], snap: 'cell', hp: 7, mat: 'wood', solid: false, ramp: true, hip: true, roof: true },
}

/** Pieces that snap to 2 m grid edges (walls and their variants). */
export const isEdgePiece = (id: PieceId): boolean => PIECES[id].snap === 'edge'
/** Sloped roof surfaces (plain slopes and hip corners). */
export const isRoofSlope = (id: PieceId): boolean => id === 'wood_roof' || id === 'roof_corner'

/** Window opening: 1.0 m wide, sill at 0.9 m, head at 1.9 m, centred in the 2 m wall. */
export const WINDOW = { half: 0.5, sill: 0.9, head: 1.9 }

/** `open`: doors only — 0 closed, ±1 swung toward local ±z. */
export type Piece = { uid: number; id: PieceId; x: number; y: number; z: number; rot: number; hp: number; open?: number }
export type Placement = { x: number; y: number; z: number; rot: number }
export type PlaceHit = { point: Vec3; normal: Vec3; piece?: Piece | null }

export function rotatedSize(def: PieceDef, rot: number): [number, number, number] {
  const [sx, sy, sz] = def.size
  return rot % 2 === 1 ? [sz, sy, sx] : [sx, sy, sz]
}

export function placementBox(def: PieceDef, p: Placement): Box {
  const [sx, sy, sz] = rotatedSize(def, p.rot)
  return { minX: p.x - sx / 2, minY: p.y, minZ: p.z - sz / 2, maxX: p.x + sx / 2, maxY: p.y + sy, maxZ: p.z + sz / 2 }
}

export const pieceBox = (p: Piece): Box => placementBox(PIECES[p.id], p)

export function boxesOverlap(a: Box, b: Box, shrink = 0.03): boolean {
  return a.minX + shrink < b.maxX && a.maxX - shrink > b.minX && a.minY + shrink < b.maxY && a.maxY - shrink > b.minY && a.minZ + shrink < b.maxZ && a.maxZ - shrink > b.minZ
}

// ─── Doors ────────────────────────────────────────────────────────────────
/** Door opening: 1.1 m wide, 2.1 m tall, centred in a 2 m wall edge. */
export const DOOR = { half: 0.55, height: 2.1, leaf: 0.045 }

/** Rotate a local-space (x, z) offset by quarter turns (matches Object3D.rotation.y = rot·π/2). */
export function rotXZ(x: number, z: number, rot: number): [number, number] {
  switch (((rot % 4) + 4) % 4) {
    case 1: return [z, -x]
    case 2: return [-x, -z]
    case 3: return [-z, x]
    default: return [x, z]
  }
}

/** Inverse of rotXZ: world offset → local (x, z). */
export function unrotXZ(x: number, z: number, rot: number): [number, number] {
  return rotXZ(x, z, 4 - (((rot % 4) + 4) % 4))
}

function localBox(p: Piece, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Box {
  const [ax, az] = rotXZ(x0, z0, p.rot)
  const [bx, bz] = rotXZ(x1, z1, p.rot)
  return { minX: p.x + Math.min(ax, bx), maxX: p.x + Math.max(ax, bx), minY: p.y + y0, maxY: p.y + y1, minZ: p.z + Math.min(az, bz), maxZ: p.z + Math.max(az, bz) }
}

/** Door leaf box: closed in the frame, or swung 90° on its hinge (local x = −half) toward ±z. */
export function doorLeafBox(p: Piece, open = p.open ?? 0): Box {
  const { half, height, leaf } = DOOR
  if (!open) return localBox(p, -half, half, 0.02, height, -leaf, leaf)
  return localBox(p, -half - leaf, -half + leaf * 2, 0.02, height, 0, Math.sign(open) * half * 2)
}

/**
 * Collision boxes for a piece. Doors are hollow: two jambs, a lintel and the leaf (which moves
 * with the door); everything else uses its full box.
 */
export function pieceColliders(p: Piece, out: Box[]): void {
  const def = PIECES[p.id]
  if (def.window) {
    const { half, sill, head } = WINDOW
    const t = 0.09
    out.push(localBox(p, -1, -half, 0, 2.4, -t, t), localBox(p, half, 1, 0, 2.4, -t, t), localBox(p, -half, half, 0, sill, -t, t), localBox(p, -half, half, head, 2.4, -t, t))
    return
  }
  if (!def.door) {
    out.push(pieceBox(p))
    return
  }
  const { half, height } = DOOR
  const t = 0.09
  out.push(localBox(p, -1, -half, 0, 2.4, -t, t), localBox(p, half, 1, 0, 2.4, -t, t), localBox(p, -half, half, height, 2.4, -t, t), doorLeafBox(p))
}

/** Which side (local ±z) of a door a point is on. */
export function doorSide(p: Piece, x: number, z: number): number {
  const [, lz] = unrotXZ(x - p.x, z - p.z, p.rot)
  return lz >= 0 ? 1 : -1
}

/** World direction (x, z) a ramp or roof rises toward. */
export function slopeDir(rot: number): [number, number] {
  return rotXZ(0, 1, rot)
}

/** Height of a ramp surface at (x, z), or null outside its footprint. The ramp rises along its rotated local +z. */
export function rampHeight(p: Placement, def: PieceDef, x: number, z: number): number | null {
  const b = placementBox(def, p)
  if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return null
  const len = def.size[2]
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
  if (def.hip) {
    const [lx, lz] = unrotXZ(x - p.x, z - p.z, p.rot)
    return p.y + Math.min(clamp01(lz / len + 0.5), clamp01(lx / def.size[0] + 0.5)) * def.size[1]
  }
  const a = (p.rot * Math.PI) / 2
  const along = (x - p.x) * Math.sin(a) + (z - p.z) * Math.cos(a)
  return p.y + clamp01(along / len + 0.5) * def.size[1]
}

/** Quarter-turn index that faces the player's view direction (forward = (-sin yaw, -cos yaw)). */
export function facingRot(yaw: number): number {
  return ((Math.round((yaw + Math.PI) / (Math.PI / 2)) % 4) + 4) % 4
}

function dominant(n: Vec3): Vec3 {
  const ax = Math.abs(n.x)
  const ay = Math.abs(n.y)
  const az = Math.abs(n.z)
  if (ay >= ax && ay >= az) return { x: 0, y: Math.sign(n.y), z: 0 }
  if (ax >= az) return { x: Math.sign(n.x), y: 0, z: 0 }
  return { x: 0, y: 0, z: Math.sign(n.z) }
}

const CELL_PIECES = new Set<PieceId>(['foundation', 'wood_floor', 'wood_ramp'])

/**
 * Where a piece lands for a given aim point. Foundations, floors and ramps sit on a 2 m grid,
 * walls on its edges, pillars on its corners, stone blocks on a 1 m grid relative to their
 * neighbours; props (campfire, workbench, torch, lamp) go exactly where you aim.
 */
export function snapPiece(def: PieceDef, hit: PlaceHit, yaw: number, rotOffset: number): Placement {
  const { point: p, normal: n } = hit
  const piece = hit.piece ?? null
  const rot = (facingRot(yaw) + rotOffset) % 4
  const up = n.y > 0.5
  const top = piece ? pieceBox(piece).maxY : p.y
  switch (def.snap) {
    case 'block': {
      if (piece && piece.id === 'stone_block') {
        const a = dominant(n)
        return { x: piece.x + a.x, y: piece.y + a.y, z: piece.z + a.z, rot: 0 }
      }
      const x = Math.floor(p.x + n.x * 0.5) + 0.5
      const z = Math.floor(p.z + n.z * 0.5) + 0.5
      if (up) return { x, y: piece ? top : p.y - 0.18, z, rot: 0 }
      if (n.y < -0.5) return { x, y: p.y - 1, z, rot: 0 }
      return { x, y: p.y - 0.5, z, rot: 0 }
    }
    case 'cell': {
      // Roof beside roof: step up or down the slope, or continue level along the ridge.
      if (isRoofSlope(def.id) && piece && isRoofSlope(piece.id)) {
        const dx = p.x - piece.x
        const dz = p.z - piece.z
        const [sx, sz] = slopeDir(piece.rot)
        const stepX = Math.abs(dx) >= Math.abs(dz) ? Math.sign(dx) : 0
        const stepZ = stepX ? 0 : Math.sign(dz) || 1
        // Hip corners slope both ways, so treat any step away from their low edges as level.
        const along = piece.id === 'roof_corner' ? 0 : stepX * sx + stepZ * sz
        return { x: piece.x + stepX * 2, y: piece.y + along * def.size[1], z: piece.z + stepZ * 2, rot: (piece.rot + rotOffset) % 4 }
      }
      if (piece && CELL_PIECES.has(piece.id) && Math.abs(n.y) < 0.5) {
        const a = dominant(n)
        return { x: piece.x + a.x * 2, y: top - def.size[1], z: piece.z + a.z * 2, rot }
      }
      const x = Math.floor(p.x / 2) * 2 + 1
      const z = Math.floor(p.z / 2) * 2 + 1
      if (piece && up) return { x, y: top, z, rot }
      if (piece) return { x, y: p.y - def.size[1] / 2, z, rot }
      const y = def.id === 'foundation' ? p.y - 0.62 : def.id === 'wood_floor' ? p.y + 0.02 : p.y - 0.04
      return { x, y, z, rot }
    }
    case 'edge': {
      const qx = up ? p.x : p.x + n.x * 0.3
      const qz = up ? p.z : p.z + n.z * 0.3
      const x0 = Math.floor(qx / 2) * 2
      const z0 = Math.floor(qz / 2) * 2
      const fx = qx - x0
      const fz = qz - z0
      const opts: [number, number, number, number][] = [
        [fx, x0, z0 + 1, 1],
        [2 - fx, x0 + 2, z0 + 1, 1],
        [fz, x0 + 1, z0, 0],
        [2 - fz, x0 + 1, z0 + 2, 0],
      ]
      opts.sort((a, b) => a[0] - b[0])
      const [, x, z, r] = opts[0]
      const y = piece ? (up ? top : isEdgePiece(piece.id) ? piece.y : top) : p.y - 0.1
      // Gables rise toward local +x; R flips which end is high.
      return { x, y, z, rot: def.gable ? r + (rotOffset % 2) * 2 : r }
    }
    case 'ridge': {
      // Along the high edge of a roof slope, or continuing an existing ridge cap.
      if (piece && piece.id === 'ridge_cap') {
        const [ax, az] = rotXZ(1, 0, piece.rot)
        const d = (p.x - piece.x) * ax + (p.z - piece.z) * az >= 0 ? 2 : -2
        return { x: piece.x + ax * d, y: piece.y, z: piece.z + az * d, rot: piece.rot }
      }
      if (piece && isRoofSlope(piece.id)) {
        const rise = PIECES[piece.id].size[1]
        const [sx, sz] = slopeDir(piece.rot)
        return { x: piece.x + sx, y: piece.y + rise - 0.1, z: piece.z + sz, rot: piece.rot % 2 }
      }
      return { x: p.x, y: p.y - 0.02, z: p.z, rot }
    }
    case 'corner': {
      const x = Math.round(p.x / 2) * 2
      const z = Math.round(p.z / 2) * 2
      const y = piece ? (up ? top : piece.y) : p.y - 0.1
      return { x, y, z, rot: 0 }
    }
    case 'free':
    default:
      return { x: p.x, y: piece && up ? top : p.y - 0.02, z: p.z, rot }
  }
}
