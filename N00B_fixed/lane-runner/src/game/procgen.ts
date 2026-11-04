/**
 * Procedural sector generation. A run is an infinite road cut into sectors of SECTOR_LEN metres;
 * every sector is a list of encounter chunks placed by a weighted grammar under a threat budget.
 * Pure and deterministic for a (seed, sector) pair — unit tested.
 */
import { gateIsGood,
  type Arch, type BossSpec, type GateOp, type Rng, type Affix,
  AFFIXES, SECTOR_LEN, TUTORIAL_LEN, densityScale, eliteChance, hordeMix, irange, makeBoss, makeRng, pick, range, weighted, type LurkerArch,
} from './rules'

export const ROAD_HALF = 6.2
export const ARENA_LEN = 120
export type TrapKind = 'saw' | 'spikes' | 'flame' | 'laser' | 'crusher' | 'mines' | 'toxic' | 'airstrike'
export type Formation = 'flood' | 'wedge' | 'pincer' | 'stream'

export interface GateSpec { x: number; w: number; op: GateOp; shoot?: { perPoint: number; cap: number } }
export type Chunk =
  | { kind: 'gates'; d: number; gates: GateSpec[] }
  | { kind: 'horde'; d: number; count: number; mix: Partial<Record<Arch, number>>; formation: Formation; depth: number; elite: number }
  | { kind: 'ambush'; d: number; count: number; mix: Partial<Record<Arch, number>> }
  /** Lurkers perched on rooftops / clinging to facades, leaping down as the squad passes. */
  | { kind: 'rooftop'; d: number; archs: LurkerArch[] }
  /** Lurkers tunnelling under the road, surfacing ahead of the squad. */
  | { kind: 'burrow'; d: number; archs: LurkerArch[] }
  | { kind: 'trap'; d: number; trap: TrapKind; x: number; w: number; phase: number; period: number; len: number }
  | { kind: 'barrels'; d: number; spots: { x: number; dz: number }[] }
  | { kind: 'barricade'; d: number; hp: number; escort: number }
  | { kind: 'turret'; d: number; x: number; hp: number }
  | { kind: 'supply'; d: number; x: number; loot: 'weapon' | 'grenade' | 'medkit' | 'coins'; hp: number }
  | { kind: 'rescue'; d: number; x: number; n: number; hp: number }
  | { kind: 'elite'; d: number; arch: Arch; affix: Affix; escort: number }
  | { kind: 'hint'; d: number; text: string; key: string }
  | { kind: 'boss'; d: number; spec: BossSpec }

export interface Sector { index: number; start: number; end: number; theme: number; chunks: Chunk[]; boss: BossSpec }

export const THEME_COUNT = 5
export const themeFor = (sector: number) => sector % THEME_COUNT

/** Trap unlocks per sector: early sectors teach, later ones combine. */
export function trapPool(sector: number): Partial<Record<TrapKind, number>> {
  const w: Partial<Record<TrapKind, number>> = { spikes: 3, saw: 3, toxic: 1.6 }
  if (sector >= 1) { w.flame = 3; w.mines = 2.4 }
  if (sector >= 2) { w.laser = 3; w.crusher = 2.6 }
  if (sector >= 3) { w.airstrike = 2.2 }
  return w
}

function gateOps(rng: Rng, sector: number, good: boolean, allowWeapon: boolean): GateOp {
  const s = sector
  if (good) {
    const k = weighted<'add' | 'mul' | 'weapon' | 'rate' | 'heal' | 'gamble'>(rng, {
      add: 5, mul: 1.3, weapon: allowWeapon ? 1.6 : 0, rate: 1.4, heal: 0.8, gamble: s >= 1 ? 0.8 : 0,
    })
    switch (k) {
      case 'add': return { kind: 'add', n: irange(rng, 3, 7 + s * 4) }
      case 'mul': return { kind: 'mul', n: rng() < 0.05 + s * 0.02 ? 3 : 2 }
      case 'weapon': return { kind: 'weapon', n: 1 }
      case 'rate': return { kind: 'rate', pct: pick(rng, [15, 20, 25]) }
      case 'heal': return { kind: 'heal', n: irange(rng, 6, 12 + s * 4) }
      case 'gamble': return { kind: 'gamble' }
    }
  }
  const k = weighted<'sub' | 'div' | 'rate' | 'weapon'>(rng, { sub: 5, div: s >= 1 ? 1.6 : 0.5, rate: 1.2, weapon: s >= 2 ? 0.6 : 0 })
  switch (k) {
    case 'sub': return { kind: 'sub', n: irange(rng, 3, 6 + s * 5) }
    case 'div': return { kind: 'div', n: 2 }
    case 'rate': return { kind: 'rate', pct: -pick(rng, [15, 20, 30]) }
    case 'weapon': return { kind: 'weapon', n: -1 }
  }
}

/** A gate row always offers at least one good option; bad options get more common with threat. */
export function makeGateRow(rng: Rng, sector: number, d: number, allowWeapon: boolean): Chunk {
  const three = sector >= 2 && rng() < 0.3
  const n = three ? 3 : 2
  const badChance = Math.min(0.55, 0.22 + sector * 0.08)
  const goodIdx = Math.floor(rng() * n)
  const w = (ROAD_HALF * 2) / n
  const gates: GateSpec[] = []
  let weaponUsed = false
  for (let i = 0; i < n; i++) {
    const good = i === goodIdx || rng() > badChance
    const op = gateOps(rng, sector, good, allowWeapon && !weaponUsed)
    if (op.kind === 'weapon' && op.n > 0) weaponUsed = true
    gates.push({ x: -ROAD_HALF + w * (i + 0.5), w: w - 0.35, op })
  }
  // Fairness: a row always has at least one clearly good option (a gamble alone is not one).
  if (!gates.some(g => gateIsGood(g.op))) gates[goodIdx].op = { kind: 'add', n: 3 + sector * 2 + irange(rng, 0, 4) }
  return { kind: 'gates', d, gates }
}

function makeShootGate(rng: Rng, sector: number, d: number): Chunk {
  // One shootable +N gate beside a fixed option, so aiming at it is a real decision.
  const left = rng() < 0.5
  const w = ROAD_HALF - 0.2
  const shoot: GateSpec = { x: left ? -ROAD_HALF / 2 : ROAD_HALF / 2, w, op: { kind: 'add', n: 1 }, shoot: { perPoint: 40 * Math.pow(1.5, sector), cap: 30 + sector * 15 } }
  const other: GateSpec = { x: left ? ROAD_HALF / 2 : -ROAD_HALF / 2, w, op: gateOps(rng, sector, rng() < 0.5, false) }
  return { kind: 'gates', d, gates: [shoot, other] }
}

function makeHorde(rng: Rng, sector: number, d: number, scale = 1): Chunk {
  const dens = densityScale(sector + 0.5)
  const count = Math.round((16 + irange(rng, 0, 10)) * dens * scale)
  return {
    kind: 'horde', d, count, mix: hordeMix(sector),
    formation: pick(rng, sector === 0 ? ['flood', 'wedge'] as const : ['flood', 'wedge', 'pincer', 'stream'] as const),
    depth: range(rng, 10, 22), elite: eliteChance(sector + 0.5),
  }
}

function makeTrap(rng: Rng, sector: number, d: number, forced?: TrapKind): Chunk {
  const trap = forced ?? weighted(rng, trapPool(sector))
  // Traps cover a part of the road; there is always a safe line or a safe timing window.
  switch (trap) {
    case 'saw': return { kind: 'trap', d, trap, x: 0, w: ROAD_HALF * 2, phase: rng(), period: range(rng, 2.8, 3.8), len: 1.4 }
    case 'spikes': { const w = range(rng, 5, 8); const x = (rng() < 0.5 ? -1 : 1) * (ROAD_HALF - w / 2); return { kind: 'trap', d, trap, x, w, phase: rng(), period: 2.4, len: 3 } }
    case 'flame': return { kind: 'trap', d, trap, x: 0, w: ROAD_HALF * 2, phase: rng(), period: 2.6, len: 2.4 }
    case 'laser': return { kind: 'trap', d, trap, x: 0, w: ROAD_HALF * 2, phase: rng(), period: range(rng, 3, 4), len: 0.4 }
    case 'crusher': return { kind: 'trap', d, trap, x: rng() < 0.5 ? -1 : 1, w: ROAD_HALF, phase: rng(), period: 3.2, len: 3.2 }
    case 'mines': return { kind: 'trap', d, trap, x: 0, w: ROAD_HALF * 2, phase: rng(), period: 1, len: range(rng, 14, 22) }
    case 'toxic': { const w = range(rng, 4.5, 7); const x = range(rng, -ROAD_HALF + w / 2, ROAD_HALF - w / 2); return { kind: 'trap', d, trap, x, w, phase: 0, period: 1, len: range(rng, 8, 14) } }
    case 'airstrike': return { kind: 'trap', d, trap, x: 0, w: ROAD_HALF * 2, phase: 0, period: 1.6, len: 40 }
  }
}

type Slot = 'horde' | 'trap' | 'ambush' | 'barricade' | 'turret' | 'supply' | 'rescue' | 'elite' | 'barrels' | 'combo' | 'rooftop' | 'burrow'
const HEAVY: Slot[] = ['horde', 'ambush', 'barricade', 'turret', 'elite', 'combo', 'rooftop', 'burrow']
/** Rooftop pack: Leapers from sector 0, Quillers mixed in from sector 1. */
export function rooftopPack(rng: Rng, index: number): LurkerArch[] {
  const n = Math.min(8, (index === 0 ? 2 : 3 + index) + irange(rng, 0, 1))
  return Array.from({ length: n }, () => (index >= 1 && rng() < 0.4 ? 'quiller' : 'leaper'))
}
/** Burrowers: Gulpers from sector 1, Howlers from sector 2; up to 3 at once deep into a run. */
export function burrowPack(rng: Rng, index: number): LurkerArch[] {
  const n = index >= 3 ? irange(rng, 2, 3) : index >= 2 ? irange(rng, 1, 2) : 1
  const out: LurkerArch[] = Array.from({ length: n }, () => (index >= 2 && rng() < 0.45 ? 'howler' : 'gulper'))
  if (index >= 2 && !out.includes('howler') && rng() < 0.5) out[0] = 'howler'
  return out
}

export function generateSector(seed: number, index: number): Sector {
  const rng = makeRng((seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0)
  const start = index * SECTOR_LEN
  const end = start + SECTOR_LEN
  const arenaStart = end - ARENA_LEN
  const chunks: Chunk[] = []
  let d = start + 30
  let weaponBudget = index === 0 ? 1 : 2

  if (index === 0) {
    // Guided opening: every mechanic introduced once, honestly, in the first ~240 m.
    chunks.push({ kind: 'hint', d: 6, text: 'Drag or use A / D to steer your squad', key: 'steer' })
    chunks.push({ kind: 'gates', d: 38, gates: [
      { x: -ROAD_HALF / 2, w: ROAD_HALF - 0.2, op: { kind: 'add', n: 4 } },
      { x: ROAD_HALF / 2, w: ROAD_HALF - 0.2, op: { kind: 'mul', n: 2 } },
    ] })
    chunks.push({ kind: 'hint', d: 44, text: 'Blue gates help. Red gates hurt. Choose your lane', key: 'gates' })
    chunks.push({ kind: 'hint', d: 68, text: 'Your squad fires automatically. Line up with the horde', key: 'fire' })
    chunks.push({ kind: 'horde', d: 92, count: 14, mix: { walker: 1, walker2: 0.6 }, formation: 'flood', depth: 10, elite: 0 })
    chunks.push({ kind: 'hint', d: 128, text: 'Shoot the gold gate to raise its value', key: 'shoot' })
    chunks.push(makeShootGate(rng, 0, 150))
    chunks.push({ kind: 'hint', d: 168, text: 'Traps kill soldiers. Watch the warning lights', key: 'traps' })
    chunks.push(makeTrap(rng, 0, 190, 'spikes'))
    chunks.push({ kind: 'gates', d: 214, gates: [
      { x: -ROAD_HALF / 2, w: ROAD_HALF - 0.2, op: { kind: 'weapon', n: 1 } },
      { x: ROAD_HALF / 2, w: ROAD_HALF - 0.2, op: { kind: 'sub', n: 3 } },
    ] })
    weaponBudget = 0
    chunks.push(makeHorde(rng, 0, 242, 1.1))
    d = TUTORIAL_LEN + 30
    // First Lurker contact right after the tutorial: a small Leaper pack on the rooftops.
    chunks.push({ kind: 'hint', d: d - 8, text: 'Something is moving on the rooftops. Watch for red rings', key: 'rooftop' })
    chunks.push({ kind: 'rooftop', d: d + 10, archs: ['leaper', 'leaper'] })
    d += 44
  } else if (index === 1) {
    chunks.push({ kind: 'hint', d: d + 20, text: 'The road is shaking. Burrowers surface inside red rings', key: 'burrow' })
    chunks.push({ kind: 'burrow', d: d + 36, archs: ['gulper'] })
    d += 70
  } else if (index === 2) {
    chunks.push({ kind: 'hint', d: d + 20, text: 'Howler! Shoot its glowing sac or leave its lane', key: 'howler' })
    chunks.push({ kind: 'burrow', d: d + 36, archs: ['howler'] })
    d += 76
  }

  let sinceGate = 0
  let lastSlot: Slot = 'supply'
  while (d < arenaStart - 40) {
    // Gate rows every ~55–75 m keep choices coming (about every 6–8 s).
    if (sinceGate >= 1 && (sinceGate >= 2 || rng() < 0.5)) {
      const r = rng()
      chunks.push(r < 0.22 ? makeShootGate(rng, index, d) : makeGateRow(rng, index, d, weaponBudget > 0))
      const last = chunks[chunks.length - 1]
      if (last.kind === 'gates' && last.gates.some(g => g.op.kind === 'weapon' && g.op.n > 0)) weaponBudget--
      sinceGate = 0
      d += range(rng, 26, 34)
      continue
    }
    const heavyLast = HEAVY.includes(lastSlot)
    const w: Partial<Record<Slot, number>> = {
      horde: 4.2, trap: 2.6, barrels: 0.9, supply: heavyLast ? 1.6 : 0.6, rescue: heavyLast ? 1.0 : 0.4,
      ambush: index >= 1 ? 1.1 : 0, barricade: index >= 1 ? 0.8 : 0.4, turret: index >= 1 ? 0.8 : 0,
      elite: index >= 1 ? 0.8 : 0, combo: index >= 2 ? 1.2 : 0,
      rooftop: index === 0 ? 0.8 : 1.3, burrow: index >= 1 ? Math.min(1.6, 0.9 + 0.15 * index) : 0,
    }
    if (heavyLast) for (const k of HEAVY) w[k] = (w[k] ?? 0) * 0.45
    const slot = weighted(rng, w)
    lastSlot = slot
    sinceGate++
    switch (slot) {
      case 'horde': chunks.push(makeHorde(rng, index, d)); d += range(rng, 34, 44); break
      case 'combo': chunks.push(makeHorde(rng, index, d, 0.8)); chunks.push(makeTrap(rng, index, d + 14)); d += 46; break
      case 'trap': chunks.push(makeTrap(rng, index, d)); d += range(rng, 26, 34); break
      case 'rooftop': chunks.push({ kind: 'rooftop', d, archs: rooftopPack(rng, index) }); d += 40; break
      case 'burrow': chunks.push({ kind: 'burrow', d, archs: burrowPack(rng, index) }); if (rng() < 0.5) chunks.push(makeHorde(rng, index, d + 16, 0.5)); d += 44; break
      case 'ambush': chunks.push({ kind: 'ambush', d, count: Math.round(10 * densityScale(index)), mix: { runner: 3, walker: 2, crawler: index >= 1 ? 1 : 0 } }); d += 30; break
      case 'barrels': {
        const spots = Array.from({ length: irange(rng, 3, 5) }, () => ({ x: range(rng, -ROAD_HALF + 1, ROAD_HALF - 1), dz: range(rng, 0, 10) }))
        chunks.push({ kind: 'barrels', d, spots })
        chunks.push(makeHorde(rng, index, d + 6, 0.6))
        d += 30
        break
      }
      case 'barricade': chunks.push({ kind: 'barricade', d, hp: Math.round(900 * Math.pow(1.6, index)), escort: Math.round(8 * densityScale(index)) }); d += 34; break
      case 'turret': chunks.push({ kind: 'turret', d, x: (rng() < 0.5 ? -1 : 1) * (ROAD_HALF - 1.2), hp: Math.round(500 * Math.pow(1.5, index)) }); d += 26; break
      case 'supply': {
        const loot = weighted<'weapon' | 'grenade' | 'medkit' | 'coins'>(rng, { weapon: weaponBudget > 0 ? 1.2 : 0, grenade: 2, medkit: 1.6, coins: 1.6 })
        if (loot === 'weapon') weaponBudget--
        chunks.push({ kind: 'supply', d, x: range(rng, -ROAD_HALF + 1.5, ROAD_HALF - 1.5), loot, hp: Math.round(260 * Math.pow(1.45, index)) })
        d += 22
        break
      }
      case 'rescue': chunks.push({ kind: 'rescue', d, x: range(rng, -ROAD_HALF + 1.6, ROAD_HALF - 1.6), n: irange(rng, 3, 6 + index * 2), hp: Math.round(200 * Math.pow(1.45, index)) }); d += 22; break
      case 'elite': {
        const arch = pick(rng, ['brute', 'runner', 'walker', 'retcher', 'riot'] as Arch[])
        chunks.push({ kind: 'elite', d, arch: index < 2 && (arch === 'riot') ? 'brute' : arch, affix: pick(rng, AFFIXES), escort: Math.round(10 * densityScale(index)) })
        d += 34
        break
      }
    }
  }
  // Final gate row before the arena, then the boss.
  chunks.push(makeGateRow(rng, index, arenaStart - 30, false))
  const boss = makeBoss(rng, index)
  chunks.push({ kind: 'boss', d: arenaStart + 20, spec: boss })
  chunks.sort((a, b) => a.d - b.d)
  return { index, start, end, theme: themeFor(index), chunks, boss }
}
