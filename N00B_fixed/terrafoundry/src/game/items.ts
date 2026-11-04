/** Item catalogue, tool stats and crafting recipes (pure data). */

export type ItemId =
  | 'wood' | 'stone' | 'fiber' | 'crystal' | 'soil' | 'berries' | 'raw_meat' | 'cooked_meat' | 'skewer'
  | 'planks' | 'bandage' | 'stone_axe' | 'stone_pickaxe' | 'stone_shovel' | 'stone_spear'
  | 'crystal_pickaxe' | 'crystal_axe' | 'crystal_blade' | 'torch' | 'campfire' | 'workbench' | 'lamp'
  | 'stone_block' | 'foundation' | 'wood_floor' | 'wood_wall' | 'wood_ramp' | 'wood_pillar' | 'bow' | 'arrow'
  | 'wood_door' | 'wood_roof' | 'storage_chest'
  | 'wood_window' | 'half_wall' | 'gable_wall' | 'ridge_cap' | 'roof_corner'

export type PieceId = 'stone_block' | 'foundation' | 'wood_floor' | 'wood_wall' | 'wood_ramp' | 'wood_pillar' | 'campfire' | 'workbench' | 'torch' | 'lamp' | 'wood_door' | 'wood_roof' | 'storage_chest' | 'wood_window' | 'half_wall' | 'gable_wall' | 'ridge_cap' | 'roof_corner'
export type ToolKind = 'axe' | 'pickaxe' | 'shovel' | 'weapon' | 'bow'
export type ItemCat = 'material' | 'tool' | 'food' | 'build'
export type Station = 'workbench' | 'campfire'

export type ToolStats = { kind: ToolKind; tier: 1 | 2; durability: number; damage: number; swing: number }
export type ItemDef = {
  id: ItemId
  name: string
  desc: string
  stack: number
  cat: ItemCat
  tool?: ToolStats
  food?: { hunger: number; health: number }
  place?: PieceId | 'soil'
}

const d = (id: ItemId, name: string, cat: ItemCat, desc: string, extra: Partial<ItemDef> = {}): ItemDef =>
  ({ id, name, cat, desc, stack: cat === 'tool' ? 1 : 64, ...extra })

export const ITEMS: Record<ItemId, ItemDef> = {
  wood: d('wood', 'Wood', 'material', 'Rough timber from felled trees.'),
  stone: d('stone', 'Stone', 'material', 'Weathered stone, good for tools and masonry.'),
  fiber: d('fiber', 'Plant Fiber', 'material', 'Tough grass fibre for bindings.'),
  crystal: d('crystal', 'Crystal', 'material', 'A luminous shard that holds an edge.'),
  soil: d('soil', 'Soil', 'material', 'Loose earth. Place it to raise the ground.', { place: 'soil' }),
  planks: d('planks', 'Planks', 'material', 'Split boards for carpentry.'),
  berries: d('berries', 'Wild Berries', 'food', 'Tart and filling enough.', { food: { hunger: 9, health: 1 } }),
  raw_meat: d('raw_meat', 'Raw Venison', 'food', 'Best cooked over a campfire.', { food: { hunger: 10, health: -3 } }),
  cooked_meat: d('cooked_meat', 'Roast Venison', 'food', 'Hearty, hot and restorative.', { food: { hunger: 32, health: 8 } }),
  skewer: d('skewer', 'Berry Skewer', 'food', 'Venison glazed with berries. A proper meal.', { food: { hunger: 48, health: 14 } }),
  bandage: d('bandage', 'Fiber Bandage', 'food', 'Wrap wounds to recover health.', { food: { hunger: 0, health: 30 } }),
  stone_axe: d('stone_axe', 'Stone Axe', 'tool', 'Fells trees quickly.', { tool: { kind: 'axe', tier: 1, durability: 110, damage: 4, swing: 0.42 } }),
  stone_pickaxe: d('stone_pickaxe', 'Stone Pickaxe', 'tool', 'Breaks rock, stone and crystal.', { tool: { kind: 'pickaxe', tier: 1, durability: 110, damage: 3.5, swing: 0.44 } }),
  stone_shovel: d('stone_shovel', 'Stone Shovel', 'tool', 'Digs soil fast. Reshape the land.', { tool: { kind: 'shovel', tier: 1, durability: 120, damage: 3, swing: 0.38 } }),
  stone_spear: d('stone_spear', 'Stone Spear', 'tool', 'Reach and bite against beasts.', { tool: { kind: 'weapon', tier: 1, durability: 90, damage: 8, swing: 0.5 } }),
  crystal_pickaxe: d('crystal_pickaxe', 'Crystal Pickaxe', 'tool', 'Cuts through stone like clay.', { tool: { kind: 'pickaxe', tier: 2, durability: 300, damage: 5, swing: 0.34 } }),
  crystal_axe: d('crystal_axe', 'Crystal Axe', 'tool', 'A single swing splits trunks.', { tool: { kind: 'axe', tier: 2, durability: 300, damage: 6, swing: 0.34 } }),
  crystal_blade: d('crystal_blade', 'Crystal Blade', 'tool', 'A glowing edge that fears no night.', { tool: { kind: 'weapon', tier: 2, durability: 260, damage: 13, swing: 0.4 } }),
  bow: d('bow', 'Hunting Bow', 'tool', 'Hold to draw, release to loose an arrow. Needs arrows.', { tool: { kind: 'bow', tier: 1, durability: 140, damage: 14, swing: 0.25 } }),
  arrow: d('arrow', 'Flint Arrow', 'material', 'Ammunition for the bow. Recover arrows where they land.'),
  torch: d('torch', 'Torch', 'build', 'Hold for light, or place to ward the dark.', { place: 'torch' }),
  campfire: d('campfire', 'Campfire', 'build', 'Cooks food, keeps night creatures away and marks your respawn.', { place: 'campfire' }),
  workbench: d('workbench', 'Workbench', 'build', 'Unlocks advanced tools and building parts.', { place: 'workbench' }),
  lamp: d('lamp', 'Crystal Lamp', 'build', 'A steady glow that wards off the Hollow.', { place: 'lamp' }),
  stone_block: d('stone_block', 'Rounded Stone Block', 'build', 'A smooth, stackable masonry block.', { place: 'stone_block' }),
  foundation: d('foundation', 'Stone Foundation', 'build', 'A level 2×2 m base for any build.', { place: 'foundation' }),
  wood_floor: d('wood_floor', 'Wood Floor', 'build', 'A 2×2 m plank floor or ceiling.', { place: 'wood_floor' }),
  wood_wall: d('wood_wall', 'Wood Wall', 'build', 'Snaps to foundation and floor edges.', { place: 'wood_wall' }),
  wood_ramp: d('wood_ramp', 'Wood Ramp', 'build', 'A gentle slope up to the next level — or a roof.', { place: 'wood_ramp' }),
  wood_pillar: d('wood_pillar', 'Wood Pillar', 'build', 'A sturdy post for corners and porches.', { place: 'wood_pillar' }),
  wood_door: d('wood_door', 'Wood Door', 'build', 'Snaps into a wall edge. Right-click to open or close.', { place: 'wood_door' }),
  wood_roof: d('wood_roof', 'Shingle Roof', 'build', 'A sloped 2×2 m roof. Sits on wall tops; press R to turn the slope. Shelter doubles Rested.', { place: 'wood_roof' }),
  wood_window: d('wood_window', 'Window Wall', 'build', 'A wall with a paned window. Snaps to edges like a wall; lets light and views in.', { place: 'wood_window' }),
  half_wall: d('half_wall', 'Half Wall', 'build', 'A waist-high 1.2 m wall for porches, railings and stacking.', { place: 'half_wall' }),
  gable_wall: d('gable_wall', 'Gable Wall', 'build', 'A triangular wall that closes the end under a sloped roof. Sits on wall tops; press R to flip.', { place: 'gable_wall' }),
  ridge_cap: d('ridge_cap', 'Ridge Cap', 'build', 'A capping beam that seals the peak where two roof slopes meet. Aim at a roof top edge.', { place: 'ridge_cap' }),
  roof_corner: d('roof_corner', 'Roof Corner', 'build', 'A hip corner that slopes two ways to wrap a roof around a corner. Press R to turn it.', { place: 'roof_corner' }),
  storage_chest: d('storage_chest', 'Storage Chest', 'build', 'Holds 18 stacks. Right-click to open. Breaking it spills the contents into your pack.', { place: 'storage_chest' }),
}

export type Recipe = { id: string; out: ItemId; n: number; cost: [ItemId, number][]; station?: Station }

export const RECIPES: Recipe[] = [
  { id: 'planks', out: 'planks', n: 3, cost: [['wood', 1]] },
  { id: 'stone_axe', out: 'stone_axe', n: 1, cost: [['wood', 2], ['stone', 3], ['fiber', 2]] },
  { id: 'stone_pickaxe', out: 'stone_pickaxe', n: 1, cost: [['wood', 2], ['stone', 3], ['fiber', 2]] },
  { id: 'stone_shovel', out: 'stone_shovel', n: 1, cost: [['wood', 2], ['stone', 2], ['fiber', 1]] },
  { id: 'workbench', out: 'workbench', n: 1, cost: [['planks', 6], ['stone', 2]] },
  { id: 'campfire', out: 'campfire', n: 1, cost: [['wood', 4], ['stone', 5]] },
  { id: 'torch', out: 'torch', n: 3, cost: [['wood', 1], ['fiber', 1]] },
  { id: 'bandage', out: 'bandage', n: 1, cost: [['fiber', 4]] },
  { id: 'stone_block', out: 'stone_block', n: 1, cost: [['stone', 1]] },
  { id: 'foundation', out: 'foundation', n: 1, cost: [['stone', 6]], station: 'workbench' },
  { id: 'wood_floor', out: 'wood_floor', n: 1, cost: [['planks', 4]], station: 'workbench' },
  { id: 'wood_wall', out: 'wood_wall', n: 1, cost: [['planks', 5]], station: 'workbench' },
  { id: 'wood_ramp', out: 'wood_ramp', n: 1, cost: [['planks', 5]], station: 'workbench' },
  { id: 'wood_pillar', out: 'wood_pillar', n: 1, cost: [['planks', 2]], station: 'workbench' },
  { id: 'wood_door', out: 'wood_door', n: 1, cost: [['planks', 6], ['stone', 1]], station: 'workbench' },
  { id: 'wood_roof', out: 'wood_roof', n: 1, cost: [['planks', 4], ['fiber', 2]], station: 'workbench' },
  { id: 'wood_window', out: 'wood_window', n: 1, cost: [['planks', 5], ['crystal', 1]], station: 'workbench' },
  { id: 'half_wall', out: 'half_wall', n: 1, cost: [['planks', 3]], station: 'workbench' },
  { id: 'gable_wall', out: 'gable_wall', n: 1, cost: [['planks', 3]], station: 'workbench' },
  { id: 'ridge_cap', out: 'ridge_cap', n: 2, cost: [['planks', 2], ['fiber', 1]], station: 'workbench' },
  { id: 'roof_corner', out: 'roof_corner', n: 1, cost: [['planks', 4], ['fiber', 2]], station: 'workbench' },
  { id: 'storage_chest', out: 'storage_chest', n: 1, cost: [['planks', 8], ['stone', 2]], station: 'workbench' },
  { id: 'stone_spear', out: 'stone_spear', n: 1, cost: [['wood', 3], ['stone', 2], ['fiber', 3]], station: 'workbench' },
  { id: 'bow', out: 'bow', n: 1, cost: [['wood', 6], ['fiber', 4]], station: 'workbench' },
  { id: 'arrow', out: 'arrow', n: 8, cost: [['wood', 2], ['stone', 1], ['fiber', 1]], station: 'workbench' },
  { id: 'lamp', out: 'lamp', n: 1, cost: [['crystal', 1], ['stone', 3]], station: 'workbench' },
  { id: 'crystal_pickaxe', out: 'crystal_pickaxe', n: 1, cost: [['planks', 2], ['crystal', 4], ['fiber', 2]], station: 'workbench' },
  { id: 'crystal_axe', out: 'crystal_axe', n: 1, cost: [['planks', 2], ['crystal', 3], ['fiber', 2]], station: 'workbench' },
  { id: 'crystal_blade', out: 'crystal_blade', n: 1, cost: [['planks', 1], ['crystal', 5], ['fiber', 2]], station: 'workbench' },
  { id: 'cooked_meat', out: 'cooked_meat', n: 1, cost: [['raw_meat', 1]], station: 'campfire' },
  { id: 'skewer', out: 'skewer', n: 1, cost: [['raw_meat', 1], ['berries', 3]], station: 'campfire' },
]

export const STATION_NAMES: Record<Station, string> = { workbench: 'Workbench', campfire: 'Campfire' }

// ─── Icons ────────────────────────────────────────────────────────────────
const T1 = '#9b958a'
const T1D = '#6d685f'
const T2 = '#79e0d2'
const T2D = '#3b9e98'
const HANDLE = '#8a5a35'

function tool(kind: ToolKind, tier: 1 | 2): string {
  const c = tier === 1 ? T1 : T2
  const cd = tier === 1 ? T1D : T2D
  const handle = `<path d="M5 20 17 8" stroke="${HANDLE}" stroke-width="2.6" stroke-linecap="round"/><path d="M5.6 19.4 8 17" stroke="#5c3a21" stroke-width="2.8" stroke-linecap="round"/>`
  switch (kind) {
    case 'axe':
      return `${handle}<path d="M14.5 4.2c2.8-.4 5.6 1.2 6.4 4.3-1.9.2-3.2 1-4.4 2.4l-3.5-3.5c1-1.1 1.4-2 1.5-3.2Z" fill="${c}"/><path d="M13 7.4l3.5 3.5-1.2 1.2-3.5-3.5Z" fill="${cd}"/>`
    case 'pickaxe':
      return `${handle}<path d="M6.5 6.8C10 2.9 16.2 2.4 21 5.2c-4.5-.6-8.2.6-11 3.3Z" fill="${c}"/><path d="M15.5 4.3c2.9 1.3 4.6 4.1 4.3 7.4-1-2.6-2.5-4.4-5.3-5.6Z" fill="${cd}"/>`
    case 'shovel':
      return `<path d="M4 20 14 10" stroke="${HANDLE}" stroke-width="2.6" stroke-linecap="round"/><path d="M13 5.8c2.6-2.6 6-2.9 7.6-1.4s1.2 5-1.4 7.6l-3 1.5-4.8-4.8Z" fill="${c}"/><path d="M12.8 9.3l2 2-1.4 1.4-2-2Z" fill="${cd}"/>`
    case 'weapon':
      return tier === 1
        ? `<path d="M3.5 20.5 17 7" stroke="${HANDLE}" stroke-width="2.2" stroke-linecap="round"/><path d="M15.3 5.2 21 3l-2.2 5.7-2.2.4Z" fill="${c}"/><path d="M13.8 8.6l2.6-.8-.9 2.6Z" fill="#c9b27a"/>`
        : `<path d="M13 11 20.6 3.4l-.5 3.6L14.5 12.6Z" fill="${c}"/><path d="M13 11l7.6-7.6.2 1.2-7.1 7.1Z" fill="#cffff8"/><path d="M9.5 11.2l3.3 3.3" stroke="#c9b27a" stroke-width="2.2" stroke-linecap="round"/><path d="M4.5 19.5l6.2-6.2" stroke="${HANDLE}" stroke-width="2.4" stroke-linecap="round"/>`
    default:
      return handle
  }
}

const ICONS: Partial<Record<ItemId, string>> = {
  wood: '<rect x="2.5" y="8" width="16" height="9" rx="4.5" fill="#8a5a35"/><path d="M5 10.5h8M6 14.5h7" stroke="#6b4327" stroke-width="1.1" stroke-linecap="round"/><ellipse cx="18.5" cy="12.5" rx="3.3" ry="4.5" fill="#d8b27a"/><ellipse cx="18.5" cy="12.5" rx="1.6" ry="2.3" fill="none" stroke="#a87a48" stroke-width="1"/>',
  stone: '<path d="M3.5 16.4c-.6-4.3 2.2-8.7 7.2-9.6 4.6-.9 9.3 1.5 9.9 6.2.5 3.7-2.2 5.9-8.6 6-5.4.1-8.1-.3-8.5-2.6Z" fill="#8d887c"/><path d="M7 10.5c1.6-1.6 3.9-2.2 6-1.8" stroke="#b9b4a8" stroke-width="1.4" stroke-linecap="round" fill="none"/>',
  fiber: '<path d="M8 21c0-6-2.5-10-5-14M12 21c0-7 .5-12 2-17M16 21c0-5 2.5-9 5-11" stroke="#a9b45a" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M10 21c-.5-5-1.5-8-3-11" stroke="#7f8a3e" stroke-width="1.6" stroke-linecap="round" fill="none"/>',
  crystal: '<path d="M12 2.5 17.5 9 12 21.5 6.5 9Z" fill="#6fd3c9"/><path d="M12 2.5 17.5 9H6.5Z" fill="#b8fff4"/><path d="M12 9v12.5L6.5 9Z" fill="#3b9e98"/><path d="M4 13.5 7 12l1.8 5.5Z" fill="#8f7ae0"/>',
  soil: '<path d="M2.5 18.5c1-5 4.7-8.5 9.5-8.5s8.5 3.5 9.5 8.5Z" fill="#7a5a3a"/><circle cx="9" cy="15" r="1" fill="#5c412a"/><circle cx="14.5" cy="13.8" r=".9" fill="#5c412a"/><path d="M11 10.2c.3-2 1.4-3.3 3-3.8" stroke="#8fa05a" stroke-width="1.6" stroke-linecap="round" fill="none"/>',
  planks: '<rect x="3" y="5" width="18" height="4" rx="1.3" fill="#c79b62"/><rect x="3" y="10" width="18" height="4" rx="1.3" fill="#b3864f"/><rect x="3" y="15" width="18" height="4" rx="1.3" fill="#c79b62"/><path d="M7 7h5M10 12h6M6 17h4" stroke="#8f6538" stroke-width=".9" stroke-linecap="round"/>',
  berries: '<path d="M12 8c1-3 3.5-4.6 6.5-4.5-.6 3-2.8 4.8-6.5 4.5Z" fill="#6f8a3a"/><circle cx="8.5" cy="13" r="3.6" fill="#b3344a"/><circle cx="15" cy="12.5" r="3.4" fill="#c8455a"/><circle cx="11.8" cy="17.6" r="3.5" fill="#9e2b40"/><circle cx="7.6" cy="12" r="1" fill="#f3a3ae"/><circle cx="14.2" cy="11.5" r=".9" fill="#f3a3ae"/>',
  raw_meat: '<path d="M14.5 3.5c4 0 6.5 3 6 6.7-.6 4.2-5.2 6.5-8.8 5.3l-4.4 4.4a2 2 0 1 1-2.8-2.8l4.4-4.4c-1.2-3.6 1.3-9.2 5.6-9.2Z" fill="#d9707a"/><path d="M13 7.5c1.5-1.3 3.6-1.4 5-.3" stroke="#f2b7bb" stroke-width="1.4" stroke-linecap="round" fill="none"/><circle cx="5.2" cy="19.2" r="1.7" fill="#efe6d2"/>',
  cooked_meat: '<path d="M14.5 3.5c4 0 6.5 3 6 6.7-.6 4.2-5.2 6.5-8.8 5.3l-4.4 4.4a2 2 0 1 1-2.8-2.8l4.4-4.4c-1.2-3.6 1.3-9.2 5.6-9.2Z" fill="#94522d"/><path d="M13 7.5c1.5-1.3 3.6-1.4 5-.3" stroke="#d08a4f" stroke-width="1.4" stroke-linecap="round" fill="none"/><circle cx="5.2" cy="19.2" r="1.7" fill="#efe6d2"/>',
  skewer: '<path d="M3 21 21 3" stroke="#c9a46a" stroke-width="1.5" stroke-linecap="round"/><rect x="6.5" y="12.5" width="5" height="5" rx="2" transform="rotate(-45 9 15)" fill="#94522d"/><circle cx="13" cy="11" r="2.3" fill="#b3344a"/><rect x="13.5" y="5.5" width="5" height="5" rx="2" transform="rotate(-45 16 8)" fill="#94522d"/>',
  bandage: '<rect x="3.5" y="7" width="17" height="10" rx="5" fill="#efe6d2"/><path d="M12 9.5v5M9.5 12h5" stroke="#c8553d" stroke-width="2" stroke-linecap="round"/><path d="M17 7.4c1.8 1.1 2.7 2.7 2.7 4.6" stroke="#c9bfa8" stroke-width="1.2" fill="none"/>',
  stone_axe: tool('axe', 1),
  stone_pickaxe: tool('pickaxe', 1),
  stone_shovel: tool('shovel', 1),
  stone_spear: tool('weapon', 1),
  crystal_pickaxe: tool('pickaxe', 2),
  crystal_axe: tool('axe', 2),
  crystal_blade: tool('weapon', 2),
  torch: '<path d="M9 21.5 13.5 10" stroke="#8a5a35" stroke-width="2.4" stroke-linecap="round"/><path d="M12.6 10.6 14.5 8" stroke="#c9b27a" stroke-width="3" stroke-linecap="round"/><path d="M15.2 1.8c2.6 2.2 3.4 4.6 1.8 6.6-1.3 1.6-3.7 1.3-4.3-.7-.5-1.8 1-2.7 2.5-5.9Z" fill="#f0a23a"/><path d="M15.2 4.8c1 1 1.3 2.1.6 3-.6.7-1.6.5-1.8-.3-.2-.8.5-1.3 1.2-2.7Z" fill="#ffe29a"/>',
  campfire: '<path d="M3 20.5 20 16M4 16l17 4.5" stroke="#8a5a35" stroke-width="2.6" stroke-linecap="round"/><path d="M12 3c3.4 3 4.8 6.2 3.2 9.4-1.2 2.5-5.2 2.5-6.4 0C7.5 9.8 9.2 7.4 12 3Z" fill="#f0a23a"/><path d="M12 8c1.6 1.4 2.2 2.8 1.4 4.2-.6 1-2.2 1-2.8 0-.7-1.3 0-2.6 1.4-4.2Z" fill="#ffe29a"/>',
  workbench: '<rect x="2.5" y="8" width="19" height="3.4" rx="1.4" fill="#c79b62"/><path d="M5 11.4V20M19 11.4V20M5 16h14" stroke="#8a5a35" stroke-width="2.2" stroke-linecap="round"/><path d="M13.5 8V5.5l4 -1.6" stroke="#9b958a" stroke-width="1.8" stroke-linecap="round" fill="none"/>',
  lamp: '<path d="M7 20.5h10l-1.5-4h-7Z" fill="#8d887c"/><path d="M12 3.5 15.5 9 12 16 8.5 9Z" fill="#79e0d2"/><path d="M12 3.5 15.5 9H8.5Z" fill="#cffff8"/><circle cx="12" cy="10" r="7" fill="#79e0d2" opacity=".16"/>',
  stone_block: '<path d="M12 2.8 20.5 7.3v9.4L12 21.2 3.5 16.7V7.3Z" fill="#8d887c"/><path d="M12 2.8 20.5 7.3 12 11.8 3.5 7.3Z" fill="#b1ac9f"/><path d="M12 11.8v9.4l8.5-4.5V7.3Z" fill="#716c62"/>',
  foundation: '<path d="M12 5.5 22 10v4.2L12 18.8 2 14.2V10Z" fill="#7e796e"/><path d="M12 5.5 22 10 12 14.5 2 10Z" fill="#aaa497"/><path d="M7 7.7l10 4.6M17 7.7 7 12.3" stroke="#8d887c" stroke-width=".8"/>',
  wood_floor: '<path d="M12 6.5 22 11v1.6L12 17.2 2 12.6V11Z" fill="#9a7045"/><path d="M12 6.5 22 11 12 15.6 2 11Z" fill="#c79b62"/><path d="M5.4 9.5l10 4.6M8.7 8l10 4.6" stroke="#a37848" stroke-width=".8"/>',
  wood_wall: '<path d="M4 5.5 14 3v16L4 21.5Z" fill="#c79b62"/><path d="M14 3l5 2v16l-5-2Z" fill="#8f6538"/><path d="M7.3 4.7v16.1M10.6 3.9v16.1" stroke="#a37848" stroke-width=".9"/>',
  wood_ramp: '<path d="M2.5 19.5 21.5 19.5 21.5 7Z" fill="#9a7045"/><path d="M2.5 19.5 21.5 7l-2.8-1.4L2.5 17.2Z" fill="#c79b62"/><path d="M8 15.7 7 14.2M13 12.4l-1-1.5M18 9.1 17 7.6" stroke="#8f6538" stroke-width=".9"/>',
  wood_pillar: '<rect x="8.5" y="3" width="7" height="18" rx="2" fill="#b3864f"/><rect x="7" y="2" width="10" height="3" rx="1.2" fill="#8f6538"/><rect x="7" y="19" width="10" height="3" rx="1.2" fill="#8f6538"/><path d="M11 6v11" stroke="#9a7045" stroke-width=".9"/>',
}

/** Painted icon (public/assets/icons/<id>.webp) with the legacy SVG as an instant fallback. */
export function itemIcon(id: ItemId): string {
  return `<img class="icon-img" src="./assets/icons/${id}.webp" alt="" draggable="false" decoding="async">`
}
export function svgIcon(id: ItemId): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[id] ?? ''}</svg>`
}

export const CATEGORY_NAMES: Record<ItemCat, string> = { material: 'Materials', tool: 'Tools', food: 'Food & Care', build: 'Building' }
