import {
  CLASSMATES, DIR_VEC, DIRS, ENEMIES, FLOOR1_WINGS, LORE, OPPOSITE, TEMPLATES, WINGS,
  type ClassmateId, type Dir, type EnemyType, type HazardType, type TemplateDef, type WingId,
} from './content'
import { hashSeed, mulberry32, type Rng } from './rng'

/**
 * Seeded floor generator (pure: no three.js, fully unit-tested).
 *
 * 1. Pick the floor's wing theme from the seed.
 * 2. Lay out a macro graph: a self-avoiding critical path Entrance → 5 rooms → Boss, with the Exit
 *    reserved behind the boss, then optional branches (heal, shop, rescue, challenge/lore/treasure).
 * 3. Apply pacing: danger ramp, one elite, max two high-danger rooms in a row, guaranteed healing
 *    before the boss (a path rest-stop is forced if no heal branch fits).
 * 4. For every room choose an authored chunk (with rotation) whose door sockets cover its links.
 * 5. Carve tiles, then — only once geometry exists — place enemy waves, hazards, decor and light.
 * 6. Validate connectivity, sockets and pacing. Failed attempts retry with a salted seed; after
 *    MAX_ATTEMPTS the safe authored fallback floor is used.
 */

export const CELL = 15
export const GRID = 6
export const MAP = CELL * GRID
export const TILE = 2
export const PATH_LENGTH = 7
export const MAX_ATTEMPTS = 24
export const MAX_CONSECUTIVE_HIGH = 2

export const T = { Void: 0, Floor: 1, Wall: 2, Cover: 3, Door: 4, Pillar: 5 } as const
export type TileValue = (typeof T)[keyof typeof T]

export type RoomKind = 'entrance' | 'combat' | 'elite' | 'boss' | 'exit' | 'heal' | 'shop' | 'rescue' | 'challenge' | 'lore' | 'treasure'
export type Reward = 'upgrade' | 'credits' | 'heal' | 'power' | 'relic' | 'none'
export type EnemySpawn = { type: EnemyType; tx: number; ty: number; wave: number; elite: boolean }
export type HazardSpawn = { type: HazardType; tx: number; ty: number; axis: 'x' | 'y'; from: number; to: number; phase: number }
export type Link = { dir: Dir; to: number }

export type RoomPlan = {
  id: number
  kind: RoomKind
  cx: number
  cy: number
  /** Interior tile rectangle (walls are the ring just outside it). */
  x0: number
  y0: number
  w: number
  h: number
  links: Link[]
  doors: Dir[]
  /** Position on the critical path, or -1 for branches. */
  pathIndex: number
  /** Path index this room hangs off (itself for path rooms). */
  anchor: number
  template: string
  rotation: number
  danger: number
  waves: number
  reward: Reward
  enemies: EnemySpawn[]
  hazards: HazardSpawn[]
  decor: { tx: number; ty: number }[]
  center: { tx: number; ty: number }
  light: { color: string; intensity: number }
  classmate?: ClassmateId
  lore?: string
}

export type DungeonPlan = {
  seed: number
  /** 1-based floor number. Deeper floors get bigger enemy waves. */
  floor: number
  wing: WingId
  size: number
  tiles: Uint8Array
  rooms: RoomPlan[]
  path: number[]
  entrance: number
  boss: number
  exit: number
  attempts: number
  fallback: boolean
  report: string[]
}

export type GenerateOptions = { wing?: WingId; maxAttempts?: number; floor?: number }

/** Extra enemy budget added to every wave on deeper floors. */
export const FLOOR_WAVE_BONUS = [0, 0, 2]
/** Lore pages that only turn up in The Stacks Below. */
export const DEEP_LORE = new Set(['l9', 'l10', 'l11'])

// ─── Public entry ─────────────────────────────────────────────────────────

export function wingForSeed(seed: number, floor = 1): WingId {
  if (floor >= 2) return 'stacks'
  return FLOOR1_WINGS[hashSeed(seed, 7) % FLOOR1_WINGS.length]
}
/** Floor 2 gets its own seed derived from the run seed, so both floors replay exactly. */
export function floorSeed(runSeed: number, floor: number): number {
  return floor <= 1 ? runSeed : hashSeed(runSeed, 200 + floor)
}

export function generateDungeon(seed: number, opts: GenerateOptions = {}): DungeonPlan {
  const floor = opts.floor ?? 1
  const wing = opts.wing ?? wingForSeed(seed, floor)
  const maxAttempts = opts.maxAttempts ?? MAX_ATTEMPTS
  const report: string[] = []
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const rng = mulberry32(hashSeed(seed, attempt + 1))
    const graph = layoutGraph(rng)
    if (!graph) {
      report.push(`attempt ${attempt + 1}: layout walk got stuck`)
      continue
    }
    const plan = buildPlan(seed, wing, graph, rng, attempt + 1, false, floor)
    if (!plan) {
      report.push(`attempt ${attempt + 1}: no chunk fits the required sockets`)
      continue
    }
    const check = validateDungeon(plan)
    if (check.ok) {
      plan.report = [...report, `attempt ${attempt + 1}: valid (${plan.rooms.length} rooms)`]
      return plan
    }
    report.push(`attempt ${attempt + 1}: rejected — ${check.errors[0]}`)
  }
  const plan = buildPlan(seed, wing, fallbackGraph(), mulberry32(hashSeed(seed, 999)), maxAttempts, true, floor)!
  plan.report = [...report, 'using safe authored fallback floor']
  return plan
}

// ─── Macro graph ──────────────────────────────────────────────────────────

type Node = { id: number; cx: number; cy: number; kind: RoomKind; pathIndex: number; anchor: number; links: Link[]; danger: number }
type Graph = { nodes: Node[]; path: number[]; exit: number }

const key = (x: number, y: number) => `${x},${y}`
const inGrid = (x: number, y: number) => x >= 0 && y >= 0 && x < GRID && y < GRID

function freeNeighbors(occ: Map<string, number>, x: number, y: number): Dir[] {
  return DIRS.filter(d => {
    const nx = x + DIR_VEC[d].x
    const ny = y + DIR_VEC[d].y
    return inGrid(nx, ny) && !occ.has(key(nx, ny))
  })
}

function link(a: Node, b: Node, dir: Dir): void {
  a.links.push({ dir, to: b.id })
  b.links.push({ dir: OPPOSITE[dir], to: a.id })
}

function layoutGraph(rng: Rng): Graph | null {
  const occ = new Map<string, number>()
  const nodes: Node[] = []
  const add = (cx: number, cy: number, kind: RoomKind, pathIndex: number, anchor: number): Node => {
    const n: Node = { id: nodes.length, cx, cy, kind, pathIndex, anchor, links: [], danger: 0 }
    nodes.push(n)
    occ.set(key(cx, cy), n.id)
    return n
  }
  let cur = add(rng.int(0, GRID - 1), rng.int(0, GRID - 1), 'entrance', 0, 0)
  const path = [cur.id]
  let lastDir: Dir | null = null
  for (let i = 1; i < PATH_LENGTH; i += 1) {
    const isBoss = i === PATH_LENGTH - 1
    // Look ahead: keep at least one free cell next to every new room — path rooms need it to
    // continue the walk and the boss needs it for the reserved exit.
    const options = freeNeighbors(occ, cur.cx, cur.cy).filter(d => {
      const nx = cur.cx + DIR_VEC[d].x
      const ny = cur.cy + DIR_VEC[d].y
      occ.set(key(nx, ny), -1)
      const ok = freeNeighbors(occ, nx, ny).length > 0
      occ.delete(key(nx, ny))
      return ok
    })
    if (options.length === 0) return null
    const dir: Dir = lastDir && options.includes(lastDir) && rng.chance(0.4) ? lastDir : rng.pick(options)
    const next = add(cur.cx + DIR_VEC[dir].x, cur.cy + DIR_VEC[dir].y, isBoss ? 'boss' : 'combat', i, i)
    link(cur, next, dir)
    path.push(next.id)
    cur = next
    lastDir = dir
  }
  // Reserve the exit directly behind the boss before any branch can take the space.
  const boss = nodes[path[PATH_LENGTH - 1]]
  const exitDirs = freeNeighbors(occ, boss.cx, boss.cy)
  if (exitDirs.length === 0) return null
  const exitDir = rng.pick(exitDirs)
  const exit = add(boss.cx + DIR_VEC[exitDir].x, boss.cy + DIR_VEC[exitDir].y, 'exit', -1, PATH_LENGTH - 1)
  link(boss, exit, exitDir)

  // Optional branches. Healing is placed first so it has the most room to fit.
  const specials: RoomKind[] = ['heal', 'shop', 'rescue', rng.pick<RoomKind>(['challenge', 'lore', 'treasure']), rng.pick<RoomKind>(['lore', 'treasure', 'rescue'])]
  for (const kind of specials) {
    const anchors = path
      .map(id => nodes[id])
      .filter(n => n.kind !== 'boss' && (n.pathIndex > 0 || kind === 'lore' || kind === 'shop'))
      .filter(n => freeNeighbors(occ, n.cx, n.cy).length > 0)
      // Spread branches out: rooms with fewer links first.
      .sort((a, b) => a.links.length - b.links.length || rng() - 0.5)
    if (anchors.length === 0) continue
    const anchor = rng.chance(0.7) ? anchors[0] : rng.pick(anchors)
    const dir = rng.pick(freeNeighbors(occ, anchor.cx, anchor.cy))
    const branch = add(anchor.cx + DIR_VEC[dir].x, anchor.cy + DIR_VEC[dir].y, kind, -1, anchor.pathIndex)
    link(anchor, branch, dir)
  }

  // Pacing: danger ramp with jitter on path combat rooms.
  const ramp = [0, 1, 1, 2, 2, 3]
  for (const id of path) {
    const n = nodes[id]
    if (n.kind !== 'combat') continue
    const jitter = rng.chance(0.35) ? rng.pick([-1, 1]) : 0
    n.danger = Math.max(1, Math.min(3, ramp[n.pathIndex] + jitter))
    if (n.pathIndex === 1) n.danger = 1
  }
  const eliteAt = rng.int(3, PATH_LENGTH - 2)
  nodes[path[eliteAt]].kind = 'elite'
  nodes[path[eliteAt]].danger = 3
  enforceConsecutiveHigh(path.map(id => nodes[id]))
  // Guarantee: at least one healing opportunity before the boss.
  if (!nodes.some(n => n.kind === 'heal')) {
    const rest = nodes[path[PATH_LENGTH - 2]]
    rest.kind = 'heal'
    rest.danger = 0
  }
  return { nodes, path, exit: exit.id }
}

function enforceConsecutiveHigh(pathNodes: { danger: number; kind: RoomKind }[]): void {
  let run = 0
  for (const n of pathNodes) {
    if (n.danger >= 3) {
      run += 1
      if (run > MAX_CONSECUTIVE_HIGH && n.kind !== 'elite') {
        n.danger = 2
        run = 0
      }
    } else run = 0
  }
}

/** Safe authored floor: a hand-checked layout used if every seeded attempt is rejected. */
function fallbackGraph(): Graph {
  const nodes: Node[] = []
  const add = (cx: number, cy: number, kind: RoomKind, pathIndex: number, anchor: number, danger = 0): Node => {
    const n: Node = { id: nodes.length, cx, cy, kind, pathIndex, anchor, links: [], danger }
    nodes.push(n)
    return n
  }
  const cells: [number, number, RoomKind, number][] = [[0, 1, 'entrance', 0], [1, 1, 'combat', 1], [2, 1, 'combat', 1], [3, 1, 'combat', 2], [4, 1, 'elite', 3], [4, 2, 'combat', 2], [4, 3, 'boss', 0]]
  const path = cells.map(([x, y, k, d], i) => add(x, y, k, i, i, d).id)
  const dirs: Dir[] = ['E', 'E', 'E', 'E', 'S', 'S']
  for (let i = 0; i < path.length - 1; i += 1) link(nodes[path[i]], nodes[path[i + 1]], dirs[i])
  const exit = add(4, 4, 'exit', -1, 6)
  link(nodes[path[6]], exit, 'S')
  link(nodes[path[2]], add(2, 0, 'heal', -1, 2), 'N')
  link(nodes[path[1]], add(1, 2, 'shop', -1, 1), 'S')
  link(nodes[path[3]], add(3, 0, 'rescue', -1, 3), 'N')
  link(nodes[path[5]], add(3, 2, 'lore', -1, 5), 'W')
  return { nodes, path, exit: exit.id }
}

// ─── Chunks, carving and population ──────────────────────────────────────

const ROT: Record<Dir, Dir> = { N: 'E', E: 'S', S: 'W', W: 'N' }

export function rotateRows(rows: string[]): string[] {
  const n = rows.length
  return rows.map((_, r) => Array.from({ length: n }, (_, c) => rows[n - 1 - c][r]).join(''))
}

export function rotatedSockets(sockets: string, times: number): Dir[] {
  return (sockets.split('') as Dir[]).map(d => {
    let out = d
    for (let i = 0; i < times; i += 1) out = ROT[out]
    return out
  })
}

function roleFor(kind: RoomKind): TemplateDef['role'] {
  if (kind === 'combat' || kind === 'elite' || kind === 'challenge') return 'combat'
  if (kind === 'boss') return 'boss'
  if (kind === 'rescue') return 'rescue'
  return 'special'
}

function chooseTemplate(node: Node, wing: WingId, rng: Rng): { t: TemplateDef; rotation: number; rows: string[] } | null {
  const need = node.links.map(l => l.dir)
  const role = roleFor(node.kind)
  const options: { t: TemplateDef; rotation: number; weight: number }[] = []
  for (const t of TEMPLATES) {
    if (t.role !== role) continue
    if ((node.kind === 'elite' || node.kind === 'challenge') && t.rows.length < 11) continue
    for (let rot = 0; rot < 4; rot += 1) {
      const sockets = rotatedSockets(t.sockets, rot)
      if (!need.every(d => sockets.includes(d))) continue
      options.push({ t, rotation: rot, weight: WINGS[wing].favours.includes(t.id) ? 3 : 1 })
    }
  }
  if (options.length === 0) return null
  const total = options.reduce((n, o) => n + o.weight, 0)
  let r = rng() * total
  let chosen = options[options.length - 1]
  for (const o of options) {
    r -= o.weight
    if (r < 0) {
      chosen = o
      break
    }
  }
  let rows = chosen.t.rows
  for (let i = 0; i < chosen.rotation; i += 1) rows = rotateRows(rows)
  return { t: chosen.t, rotation: chosen.rotation, rows }
}

function buildPlan(seed: number, wing: WingId, graph: Graph, rng: Rng, attempts: number, fallback: boolean, floor: number): DungeonPlan | null {
  const tiles = new Uint8Array(MAP * MAP)
  const set = (x: number, y: number, v: TileValue) => {
    if (x >= 0 && y >= 0 && x < MAP && y < MAP) tiles[y * MAP + x] = v
  }
  const get = (x: number, y: number) => (x >= 0 && y >= 0 && x < MAP && y < MAP ? tiles[y * MAP + x] : T.Void)
  const rooms: RoomPlan[] = []
  const layouts: string[][] = []
  for (const node of graph.nodes) {
    const choice = fallback ? fallbackTemplate(node) : chooseTemplate(node, wing, rng)
    if (!choice) return null
    const n = choice.rows.length
    const off = (CELL - n) >> 1
    const x0 = node.cx * CELL + off
    const y0 = node.cy * CELL + off
    layouts.push(choice.rows)
    rooms.push({
      id: node.id, kind: node.kind, cx: node.cx, cy: node.cy, x0, y0, w: n, h: n,
      links: node.links, doors: node.links.map(l => l.dir), pathIndex: node.pathIndex, anchor: node.anchor,
      template: choice.t.id, rotation: choice.rotation, danger: node.danger, waves: 0, reward: 'none',
      enemies: [], hazards: [], decor: [], center: { tx: x0 + (n >> 1), ty: y0 + (n >> 1) },
      light: { color: '#ffffff', intensity: 1 },
    })
  }
  // Carve: walls ring, interior chars, then door sockets + corridors to the cell edge.
  for (const room of rooms) {
    const rows = layouts[room.id]
    for (let y = room.y0 - 1; y <= room.y0 + room.h; y += 1) {
      for (let x = room.x0 - 1; x <= room.x0 + room.w; x += 1) if (get(x, y) === T.Void) set(x, y, T.Wall)
    }
    rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c += 1) {
        const ch = row[c]
        const x = room.x0 + c
        const y = room.y0 + r
        set(x, y, ch === '#' ? T.Pillar : ch === 'c' ? T.Cover : T.Floor)
        if (ch === 'x') room.center = { tx: x, ty: y }
      }
    })
  }
  for (const room of rooms) {
    const mid = room.w >> 1
    const cellX0 = room.cx * CELL
    const cellY0 = room.cy * CELL
    for (const dir of room.doors) {
      for (let k = -1; k <= 1; k += 1) {
        let dx: number, dy: number
        if (dir === 'N' || dir === 'S') {
          dx = room.x0 + mid + k
          dy = dir === 'N' ? room.y0 - 1 : room.y0 + room.h
        } else {
          dy = room.y0 + mid + k
          dx = dir === 'W' ? room.x0 - 1 : room.x0 + room.w
        }
        set(dx, dy, T.Door)
        // Corridor from just outside the door to this cell's edge.
        const v = DIR_VEC[dir]
        let cx = dx + v.x
        let cy = dy + v.y
        while (cx >= cellX0 && cx < cellX0 + CELL && cy >= cellY0 && cy < cellY0 + CELL) {
          set(cx, cy, T.Floor)
          cx += v.x
          cy += v.y
        }
      }
      // Corridor side walls.
      const v = DIR_VEC[dir]
      const side = { x: v.y !== 0 ? 1 : 0, y: v.x !== 0 ? 1 : 0 }
      let dx = dir === 'N' || dir === 'S' ? room.x0 + mid : dir === 'W' ? room.x0 - 1 : room.x0 + room.w
      let dy = dir === 'E' || dir === 'W' ? room.y0 + mid : dir === 'N' ? room.y0 - 1 : room.y0 + room.h
      dx += v.x
      dy += v.y
      while (dx >= cellX0 && dx < cellX0 + CELL && dy >= cellY0 && dy < cellY0 + CELL) {
        for (const s of [-2, 2]) if (get(dx + side.x * s, dy + side.y * s) === T.Void) set(dx + side.x * s, dy + side.y * s, T.Wall)
        dx += v.x
        dy += v.y
      }
    }
  }
  // Population happens only after geometry exists, on the chunk's authored anchors.
  const w = WINGS[wing]
  const usedClassmates = new Set<ClassmateId>()
  const usedLore = new Set<string>()
  for (const room of rooms) {
    const rows = layouts[room.id]
    const anchors = { e: [] as { tx: number; ty: number }[], h: [] as { tx: number; ty: number }[], p: [] as { tx: number; ty: number }[] }
    rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c += 1) {
        const ch = row[c] as 'e' | 'h' | 'p'
        if (ch in anchors) anchors[ch].push({ tx: room.x0 + c, ty: room.y0 + r })
      }
    })
    room.light = { color: rng.pick(w.lights), intensity: 0.85 + rng() * 0.45 }
    room.decor = anchors.p
    populateRoom(room, anchors, wing, rng, get, FLOOR_WAVE_BONUS[floor] ?? 2)
    if (room.kind === 'rescue') {
      const pool = CLASSMATES.filter(c => !usedClassmates.has(c.id))
      room.classmate = rng.pick(pool.length ? pool : CLASSMATES).id
      usedClassmates.add(room.classmate)
    }
    if (room.kind === 'lore') {
      const fresh = LORE.filter(l => !usedLore.has(l.id))
      const deep = fresh.filter(l => DEEP_LORE.has(l.id))
      const pool = floor >= 2 && deep.length ? deep : fresh.filter(l => !DEEP_LORE.has(l.id))
      room.lore = rng.pick(pool.length ? pool : fresh).id
      usedLore.add(room.lore)
    }
  }
  assignRewards(rooms, rng)
  return {
    seed, floor, wing, size: MAP, tiles, rooms, path: graph.path, entrance: graph.path[0], boss: graph.path[PATH_LENGTH - 1],
    exit: graph.exit, attempts, fallback, report: [],
  }
}

function fallbackTemplate(node: Node): { t: TemplateDef; rotation: number; rows: string[] } {
  const id = node.kind === 'boss' ? 'proctor' : node.kind === 'rescue' ? 'rescue' : roleFor(node.kind) === 'combat' ? 'pillars' : 'chamber'
  const t = TEMPLATES.find(x => x.id === id)!
  return { t, rotation: 0, rows: t.rows }
}

const WAVE_BUDGET: Record<number, number> = { 0: 0, 1: 5, 2: 7, 3: 9 }

function populateRoom(
  room: RoomPlan,
  anchors: { e: { tx: number; ty: number }[]; h: { tx: number; ty: number }[] },
  wing: WingId,
  rng: Rng,
  get: (x: number, y: number) => number,
  bonus = 0,
): void {
  const w = WINGS[wing]
  let budgets: number[] = []
  if (room.kind === 'combat') budgets = room.danger >= 2 ? [WAVE_BUDGET[room.danger], WAVE_BUDGET[room.danger] - 1] : [WAVE_BUDGET[room.danger]]
  if (room.kind === 'elite') budgets = [10, 10]
  if (room.kind === 'challenge') budgets = [8, 10, 12]
  if (room.kind === 'rescue') budgets = [6]
  if (room.kind === 'challenge') room.danger = 3
  if (room.kind === 'rescue') room.danger = 1
  budgets = budgets.map(b => b + bonus)
  room.waves = budgets.length
  const spots = rng.shuffle([...anchors.e])
  let spotIndex = 0
  const nextSpot = () => {
    const s = spots[spotIndex % Math.max(1, spots.length)] ?? room.center
    const lap = Math.floor(spotIndex / Math.max(1, spots.length))
    spotIndex += 1
    // Reused anchors fan out slightly so enemies never stack on one point.
    return { tx: s.tx + (lap ? (rng() - 0.5) * 0.9 : 0), ty: s.ty + (lap ? (rng() - 0.5) * 0.9 : 0) }
  }
  budgets.forEach((budget, wave) => {
    let left = budget
    let eliteLeft = room.kind === 'elite' ? 1 : 0
    while (left > 0) {
      const weights: Partial<Record<EnemyType, number>> = {}
      for (const [type, weight] of Object.entries(w.enemies) as [EnemyType, number][]) {
        if (ENEMIES[type].cost > left) continue
        if (type === 'bruiser' && room.danger < 2) continue
        weights[type] = weight
      }
      if (Object.keys(weights).length === 0) break
      const type = rng.weighted(weights)
      const count = type === 'swarm' ? Math.min(3, left) : 1
      for (let i = 0; i < count; i += 1) {
        const s = nextSpot()
        const elite = eliteLeft > 0 && type !== 'swarm'
        if (elite) eliteLeft -= 1
        room.enemies.push({ type, tx: s.tx, ty: s.ty, wave, elite })
      }
      left -= ENEMIES[type].cost * count
    }
  })
  // Hazards on authored anchors, count scaled by danger.
  const hazardCount = room.kind === 'challenge' ? 3 : room.kind === 'rescue' ? 1 : roleFor(room.kind) === 'combat' ? room.danger : 0
  const hs = rng.shuffle([...anchors.h]).slice(0, hazardCount)
  for (const h of hs) {
    const type = rng.weighted(w.hazards)
    const axis: 'x' | 'y' = rng.chance(0.5) ? 'x' : 'y'
    let from = axis === 'x' ? h.tx : h.ty
    let to = from
    if (type === 'laser') {
      const walk = (d: number) => {
        let p = axis === 'x' ? h.tx : h.ty
        for (;;) {
          const nx = axis === 'x' ? p + d : h.tx
          const ny = axis === 'y' ? p + d : h.ty
          if (get(nx, ny) !== T.Floor) return p
          p += d
        }
      }
      from = walk(-1)
      to = walk(1)
    }
    room.hazards.push({ type, tx: h.tx, ty: h.ty, axis, from, to, phase: rng() })
  }
}

function assignRewards(rooms: RoomPlan[], rng: Rng): void {
  const pathCombat = rooms.filter(r => r.kind === 'combat').sort((a, b) => a.pathIndex - b.pathIndex)
  for (const r of pathCombat) r.reward = rng.weighted<Reward>({ upgrade: 55, credits: 20, heal: 15, power: 10 })
  // At least three upgrade choices on the way to the boss.
  let upgrades = pathCombat.filter(r => r.reward === 'upgrade').length
  for (const r of pathCombat) {
    if (upgrades >= 3) break
    if (r.reward !== 'upgrade') {
      r.reward = 'upgrade'
      upgrades += 1
    }
  }
  for (const r of rooms) {
    if (r.kind === 'elite') r.reward = 'upgrade'
    if (r.kind === 'challenge') r.reward = 'relic'
    if (r.kind === 'treasure') r.reward = rng.chance(0.6) ? 'relic' : 'upgrade'
  }
}

// ─── Validation ───────────────────────────────────────────────────────────

export type Validation = { ok: boolean; errors: string[] }

export const walkable = (v: number) => v === T.Floor || v === T.Door

export function roomAt(plan: DungeonPlan, tx: number, ty: number): RoomPlan | undefined {
  return plan.rooms.find(r => tx >= r.x0 && ty >= r.y0 && tx < r.x0 + r.w && ty < r.y0 + r.h)
}

function flood(plan: DungeonPlan, start: { tx: number; ty: number }, blocked?: (x: number, y: number) => boolean): Uint8Array {
  const seen = new Uint8Array(plan.size * plan.size)
  const queue = [start.ty * plan.size + start.tx]
  seen[queue[0]] = 1
  while (queue.length) {
    const i = queue.pop()!
    const x = i % plan.size
    const y = (i / plan.size) | 0
    for (const d of DIRS) {
      const nx = x + DIR_VEC[d].x
      const ny = y + DIR_VEC[d].y
      if (nx < 0 || ny < 0 || nx >= plan.size || ny >= plan.size) continue
      const j = ny * plan.size + nx
      if (seen[j] || !walkable(plan.tiles[j]) || blocked?.(nx, ny)) continue
      seen[j] = 1
      queue.push(j)
    }
  }
  return seen
}

export function validateDungeon(plan: DungeonPlan): Validation {
  const errors: string[] = []
  const at = (tx: number, ty: number) => plan.tiles[Math.round(ty) * plan.size + Math.round(tx)]
  const count = (k: RoomKind) => plan.rooms.filter(r => r.kind === k).length
  if (count('entrance') !== 1) errors.push('needs exactly one entrance')
  if (count('boss') !== 1) errors.push('needs exactly one boss room')
  if (count('exit') !== 1) errors.push('needs exactly one exit')
  const exit = plan.rooms[plan.exit]
  if (!exit || exit.links.length !== 1 || exit.links[0].to !== plan.boss) errors.push('exit must be reached only through the boss room')
  // Sockets: every link is mirrored and backed by a door on both sides.
  for (const r of plan.rooms) {
    for (const l of r.links) {
      const other = plan.rooms[l.to]
      if (!other.links.some(b => b.to === r.id && b.dir === OPPOSITE[l.dir])) errors.push(`link ${r.id}->${other.id} is not mirrored`)
      if (!r.doors.includes(l.dir)) errors.push(`room ${r.id} is missing its ${l.dir} socket`)
    }
  }
  // Connectivity from the entrance.
  const entrance = plan.rooms[plan.entrance]
  const seen = flood(plan, entrance.center)
  const reached = (tx: number, ty: number) => seen[Math.round(ty) * plan.size + Math.round(tx)] === 1
  for (const r of plan.rooms) {
    if (!reached(r.center.tx, r.center.ty)) errors.push(`room ${r.id} (${r.kind}) is unreachable`)
    for (const e of r.enemies) if (walkable(at(e.tx, e.ty)) === false || !reached(e.tx, e.ty)) errors.push(`enemy spawn in room ${r.id} is blocked`)
    for (const h of r.hazards) if (at(h.tx, h.ty) !== T.Floor) errors.push(`hazard in room ${r.id} sits on a solid tile`)
  }
  // Pacing: healing must be reachable without entering the boss arena.
  const boss = plan.rooms[plan.boss]
  const heals = plan.rooms.filter(r => r.kind === 'heal')
  if (heals.length === 0) errors.push('no healing before the boss')
  else {
    const noBoss = flood(plan, entrance.center, (x, y) => x >= boss.x0 - 1 && y >= boss.y0 - 1 && x <= boss.x0 + boss.w && y <= boss.y0 + boss.h)
    if (!heals.some(h => noBoss[h.center.ty * plan.size + h.center.tx])) errors.push('healing is only reachable through the boss')
  }
  let run = 0
  for (const id of plan.path) {
    run = plan.rooms[id].danger >= 3 ? run + 1 : 0
    if (run > MAX_CONSECUTIVE_HIGH) errors.push('too many high-danger rooms in a row')
  }
  if (plan.path.length !== PATH_LENGTH) errors.push('critical path has the wrong length')
  return { ok: errors.length === 0, errors }
}
