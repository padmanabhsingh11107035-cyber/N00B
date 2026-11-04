import type { ToolStats } from './items'
import type { PieceDef } from './pieces'
import type { ResDef, ResMat } from './resources'

/** Damage a hit deals to a world resource; 0 means the tool cannot harvest it. */
export function resourcePower(tool: ToolStats | undefined, mat: ResMat): number {
  const k = tool?.kind
  const t2 = tool?.tier === 2
  switch (mat) {
    case 'wood':
      return k === 'axe' ? (t2 ? 6 : 3) : k === 'weapon' ? 1.5 : k ? 1.2 : 1
    case 'stone':
      return k === 'pickaxe' ? (t2 ? 6 : 3) : 0
    case 'crystal':
      return k === 'pickaxe' ? (t2 ? 5 : 2) : 0
    case 'soft':
      return 1
    case 'none':
    default:
      return 0
  }
}

/** Damage a hit deals to a placed piece (anything can dismantle, the right tool is faster). */
export function piecePower(tool: ToolStats | undefined, mat: PieceDef['mat']): number {
  const k = tool?.kind
  const t2 = tool?.tier === 2
  if (mat === 'stone') return k === 'pickaxe' ? (t2 ? 7 : 4) : 1
  if (mat === 'wood') return k === 'axe' ? (t2 ? 7 : 4) : 1.5
  return 3
}

/** Fraction of a full dig each hit removes; rock is slow without a pickaxe. */
export function digPower(tool: ToolStats | undefined, rock: boolean): number {
  const k = tool?.kind
  const t2 = tool?.tier === 2
  if (rock) return k === 'pickaxe' ? (t2 ? 1 : 0.6) : k === 'shovel' ? 0.35 : k ? 0.2 : 0.12
  return k === 'shovel' ? 1 : k === 'pickaxe' ? 0.6 : k ? 0.5 : 0.4
}

export function neededTool(mat: ResMat): string | null {
  return mat === 'stone' || mat === 'crystal' ? 'Needs a pickaxe' : mat === 'none' ? 'Cannot be harvested' : null
}

/** World seconds until a harvested resource returns (-1 = never). */
export function regrowDelay(def: ResDef, type: string, inPoi: boolean, base: number): number {
  if (inPoi || def.loot) return -1
  if (def.regrow) return base
  if (type === 'crystal') return base * 4
  return base * 3
}

const JOINTS = new Set(['wood_wall', 'wood_pillar', 'wood_door', 'wood_window', 'half_wall', 'gable_wall'])
const ROOFING = new Set(['wood_roof', 'roof_corner', 'ridge_cap', 'gable_wall'])
const CAPS = new Set(['ridge_cap', 'gable_wall'])
/**
 * Walls and pillars may share edges and corners with each other; ridge caps and gables tuck
 * under/over roof slopes (and walls) so roofs can be finished cleanly.
 */
export function overlapAllowed(a: string, b: string): boolean {
  if (JOINTS.has(a) && JOINTS.has(b)) return true
  if (CAPS.has(a) || CAPS.has(b)) return (ROOFING.has(a) || JOINTS.has(a)) && (ROOFING.has(b) || JOINTS.has(b))
  return false
}

type EdgeLike = { id: string; x: number; y: number; z: number; rot: number }
/** Walls and doors may touch at corners but never share the same edge slot. */
const EDGE_H: Record<string, number> = { wood_wall: 2.4, wood_door: 2.4, wood_window: 2.4, half_wall: 1.2, gable_wall: 1.1 }
export function sameEdge(a: EdgeLike, b: EdgeLike): boolean {
  const ha = EDGE_H[a.id]
  const hb = EDGE_H[b.id]
  if (!ha || !hb) return false
  // Same slot when their vertical spans overlap (stacked half walls or a gable on a wall are fine).
  return a.rot % 2 === b.rot % 2 && Math.abs(a.x - b.x) < 0.2 && Math.abs(a.z - b.z) < 0.2 && a.y < b.y + hb - 0.05 && b.y < a.y + ha - 0.05
}
