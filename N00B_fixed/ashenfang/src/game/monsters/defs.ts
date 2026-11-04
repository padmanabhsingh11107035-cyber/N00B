/**
 * Monster registry: every quarry's body plan, palette, stats, abilities and vital points. The
 * hunt and the /enemies debug library both read this file, so there is one source of truth.
 *
 * Orientation convention: in game space a monster faces local +Z with +Y up. Each model is
 * built in a "source" orientation (mimicking how an imported asset might have been authored)
 * and `orientation` is the quaternion [x, y, z, w] that corrects it to the game convention.
 * Use /enemies to inspect and adjust it, then paste the copied quaternion here.
 */
export type VitalSlot = 'head' | 'back' | 'tail'
export type AttackId = 'bite' | 'tail' | 'charge' | 'slam' | 'volley' | 'rupture' | 'roar' | 'signature'
export type Part = 'head' | 'neck' | 'body' | 'leg' | 'tail'
export type SourceFacing = '+Z' | '+X' | 'Z-up'
export type HornStyle = 'crown' | 'swept' | 'ram' | 'antler'
export type TailEnd = 'club' | 'blade' | 'hammer'

export type Ability = {
  id: AttackId
  name: string
  description: string
  /** Base damage to the hunter before multipliers (0 = no damage). */
  damage: number
  /** Wind-up (telegraph) in seconds before the attack becomes dangerous. */
  windup: number
  /** Effective reach in metres. */
  range: number
  counter: string
}

export type VitalDef = { slot: VitalSlot; name: string; breakFraction: number; effect: string }

export type BodyPlan = {
  bodyLength: number
  bodyWidth: number
  bodyHeight: number
  hipHeight: number
  neckSegments: number
  neckLength: number
  neckThick: number
  neckRise: number
  headLength: number
  headWidth: number
  headHeight: number
  tailSegments: number
  tailLength: number
  tailThick: number
  tailEnd: TailEnd
  legThick: number
  horns: HornStyle
  hornLength: number
  plates: number
  plateHeight: number
  moss: boolean
  wings: boolean
  shell: boolean
  sourceFacing: SourceFacing
  /** How deep bites and tail sweeps reach (0..1); tuned so every strike grazes the ground. */
  strike: { bite: number; tail: number }
}

export type Palette = {
  hide: string
  hideDark: string
  belly: string
  plate: string
  horn: string
  glow: string
  eye: string
  accent: string
}

export type MonsterStats = {
  hp: number
  walkSpeed: number
  runSpeed: number
  turnRate: number
  damage: number
  aggression: number
  telegraph: number
  rageAt: number
  volleyCount: number
}

export type MonsterDef = {
  id: string
  name: string
  title: string
  description: string
  habitat: string
  threat: number
  stats: MonsterStats
  parts: Record<Part, number>
  abilities: Ability[]
  vitals: VitalDef[]
  plan: BodyPlan
  palette: Palette
  orientation: [number, number, number, number]
}

const S = Math.SQRT1_2

export const MONSTERS: MonsterDef[] = [
  {
    id: 'mossback',
    name: 'Mossback Colossus',
    title: 'The Walking Grove',
    description:
      'An ancient grazing titan whose plated back has grown into a living meadow. Slow to anger, catastrophic once roused — it defends its basin with crushing charges and clouds of explosive spores.',
    habitat: 'Emberwild Basin meadows',
    threat: 3,
    stats: { hp: 6400, walkSpeed: 3.4, runSpeed: 15, turnRate: 1.45, damage: 1, aggression: 1, telegraph: 1, rageAt: 0.5, volleyCount: 7 },
    parts: { head: 1.3, neck: 1.0, body: 0.85, leg: 1.0, tail: 1.1 },
    abilities: [
      { id: 'bite', name: 'Crushing Bite', description: 'Rears its head back, then lunges forward with its jaws.', damage: 24, windup: 0.6, range: 9, counter: 'Dodge sideways as the head snaps down; its face stays low afterwards.' },
      { id: 'tail', name: 'Tail Scythe', description: 'Coils its tail, then spins a full circle, sweeping everything nearby.', damage: 28, windup: 0.75, range: 15, counter: 'Roll through the tail or step inside the spin toward its legs.' },
      { id: 'charge', name: 'Stampede Charge', description: 'Lowers its head, paws the ground and barrels straight through you.', damage: 34, windup: 0.95, range: 40, counter: 'Roll perpendicular. Bait it into a rock spire to stun it.' },
      { id: 'slam', name: 'Rearing Quake', description: 'Rises onto its hind legs and slams down, sending a shockwave outward.', damage: 38, windup: 1.05, range: 13, counter: 'Roll through the ring. Its head is exposed right after the slam.' },
      { id: 'volley', name: 'Spore Barrage', description: 'Its back plates glow, then burst spores that detonate on marked ground.', damage: 22, windup: 1.15, range: 34, counter: 'Leave the glowing circles before they erupt.' },
      { id: 'rupture', name: 'Root Rupture', description: 'Drives its forelegs into the earth and sends a line of ancient roots tearing up through the ground toward you.', damage: 30, windup: 1.0, range: 30, counter: 'Watch the cracking line race out from its feet and roll off it sideways — never along it.' },
      { id: 'signature', name: 'Grove Collapse', description: 'Enraged only. Rears up and pounds the earth three times; rings of ancient roots burst outward in expanding waves, each with a single gap.', damage: 34, windup: 1.8, range: 22, counter: 'Run for the gap in each ring, or roll through a root as it erupts to Spike Vault over the wave.' },
      { id: 'roar', name: 'Primal Roar', description: 'A deafening roar that stuns hunters caught close by.', damage: 0, windup: 0.5, range: 22, counter: 'Dodge just as the roar begins to avoid being stunned.' },
    ],
    vitals: [
      { slot: 'head', name: 'Amber Crest', breakFraction: 0.07, effect: 'Staggers it and weakens its roar.' },
      { slot: 'back', name: 'Heartstone', breakFraction: 0.08, effect: 'Topples it for a long opening.' },
      { slot: 'tail', name: 'Tail Bulb', breakFraction: 0.06, effect: 'Shortens the Tail Scythe.' },
    ],
    plan: {
      bodyLength: 10.5, bodyWidth: 6.4, bodyHeight: 3.0, hipHeight: 7.4,
      neckSegments: 3, neckLength: 5, neckThick: 1.55, neckRise: 0.42,
      headLength: 3.6, headWidth: 2.2, headHeight: 1.8,
      tailSegments: 7, tailLength: 12, tailThick: 1.6, tailEnd: 'club',
      legThick: 1.15, horns: 'antler', hornLength: 2.2, plates: 9, plateHeight: 1.4,
      moss: true, wings: false, shell: false, sourceFacing: '+Z', strike: { bite: 0.51, tail: 0.16 },
    },
    palette: { hide: '#5f5a43', hideDark: '#37362b', belly: '#a89b78', plate: '#6d6452', horn: '#e7dcbf', glow: '#ffae42', eye: '#ffd27a', accent: '#5f9138' },
    orientation: [0, 0, 0, 1],
  },
  {
    id: 'ashwing',
    name: 'Ashwing Drake',
    title: 'Cinder of the Ridge',
    description:
      'A lean, wing-armed predator that nests in the smouldering ridges above the basin. Faster and more aggressive than anything in the valley, it rains embers on prey before closing in.',
    habitat: 'Scorched ridgelines',
    threat: 4,
    stats: { hp: 5400, walkSpeed: 4.2, runSpeed: 18, turnRate: 1.9, damage: 1.05, aggression: 1.25, telegraph: 0.85, rageAt: 0.55, volleyCount: 9 },
    parts: { head: 1.35, neck: 1.1, body: 0.9, leg: 0.9, tail: 1.15 },
    abilities: [
      { id: 'bite', name: 'Searing Bite', description: 'A fast snapping lunge with smouldering jaws.', damage: 26, windup: 0.5, range: 9, counter: 'Its bite comes quickly — dodge on the first head twitch.' },
      { id: 'tail', name: 'Blade Lash', description: 'Whips its bladed tail around in a wide arc.', damage: 30, windup: 0.6, range: 16, counter: 'Roll toward its hind legs, not away.' },
      { id: 'charge', name: 'Lunge Charge', description: 'Drops low and sprints through its target at frightening speed.', damage: 32, windup: 0.75, range: 45, counter: 'Roll late and sideways. Rock spires stop it cold.' },
      { id: 'slam', name: 'Wing Slam', description: 'Rears up on its wing-arms and hammers the ground.', damage: 34, windup: 0.85, range: 12, counter: 'Roll through the shockwave, then punish the lowered head.' },
      { id: 'volley', name: 'Ember Rain', description: 'Flares its back spines and scatters burning embers across the field.', damage: 24, windup: 1.0, range: 36, counter: 'Watch the ground: every marked circle erupts.' },
      { id: 'rupture', name: 'Magma Rift', description: 'Rakes the ground open; a burning fissure races toward you, erupting in obsidian spikes and flame.', damage: 32, windup: 0.9, range: 32, counter: 'The rift follows where you stood. Sidestep late, then punish its lowered head.' },
      { id: 'signature', name: 'Cinder Cataclysm', description: 'Enraged only. Takes to the air and rains a spiral carpet of molten embers around you, then crashes down in a burning shockwave.', damage: 36, windup: 1.8, range: 30, counter: 'Keep moving out of the marked spiral, then roll through the landing ring.' },
      { id: 'roar', name: 'Scorching Roar', description: 'A shrieking roar that rattles hunters nearby.', damage: 0, windup: 0.45, range: 22, counter: 'Time a dodge with the roar.' },
    ],
    vitals: [
      { slot: 'head', name: 'Horn Crown', breakFraction: 0.07, effect: 'Staggers it and weakens its roar.' },
      { slot: 'back', name: 'Ember Heart', breakFraction: 0.08, effect: 'Topples it for a long opening.' },
      { slot: 'tail', name: 'Tail Blade Root', breakFraction: 0.06, effect: 'Shortens the Blade Lash.' },
    ],
    plan: {
      bodyLength: 8.5, bodyWidth: 4.4, bodyHeight: 3.0, hipHeight: 5.2,
      neckSegments: 4, neckLength: 5.6, neckThick: 1.2, neckRise: 0.55,
      headLength: 3.2, headWidth: 1.6, headHeight: 1.4,
      tailSegments: 8, tailLength: 13, tailThick: 1.2, tailEnd: 'blade',
      legThick: 0.9, horns: 'swept', hornLength: 2.6, plates: 12, plateHeight: 0.9,
      moss: false, wings: true, shell: false, sourceFacing: '+X', strike: { bite: 0.67, tail: 0.13 },
    },
    palette: { hide: '#3a3230', hideDark: '#1d1a19', belly: '#7a5440', plate: '#4d3b33', horn: '#dcc9a6', glow: '#ff6a2a', eye: '#ffb35a', accent: '#8a2f1c' },
    // Authored facing +X: rotate −90° about Y so it faces game-forward +Z.
    orientation: [0, -S, 0, S],
  },
  {
    id: 'tidehorn',
    name: 'Tidehorn Behemoth',
    title: 'Keeper of the Falls',
    description:
      'A colossal armoured grazer that wallows beneath the waterfall. It is slow and deliberate, but every blow lands like a landslide and its geysers erupt without mercy.',
    habitat: 'Waterfall shallows',
    threat: 5,
    stats: { hp: 8000, walkSpeed: 3.0, runSpeed: 13, turnRate: 1.15, damage: 1.25, aggression: 0.9, telegraph: 1.12, rageAt: 0.45, volleyCount: 6 },
    parts: { head: 1.15, neck: 0.9, body: 0.75, leg: 1.05, tail: 1.2 },
    abilities: [
      { id: 'bite', name: 'Horn Gore', description: 'Lowers its great horns and gores forward.', damage: 32, windup: 0.7, range: 10, counter: 'Slow but huge — dodge past the horns to its flank.' },
      { id: 'tail', name: 'Tail Hammer', description: 'Swings its hammer-like tail in a crushing arc.', damage: 38, windup: 0.9, range: 14, counter: 'Stay near its front legs when it coils.' },
      { id: 'charge', name: 'Tidal Charge', description: 'An unstoppable rush that flattens anything in its path.', damage: 42, windup: 1.1, range: 38, counter: 'Roll early. Its long wind-up is your warning.' },
      { id: 'slam', name: 'Tidal Quake', description: 'Rears up and crashes down, flooding the ground with a shockwave.', damage: 46, windup: 1.2, range: 16, counter: 'The ring is wide — roll through it, never away.' },
      { id: 'volley', name: 'Geyser Burst', description: 'Pressurised water erupts from marked ground around its prey.', damage: 28, windup: 1.3, range: 32, counter: 'Keep moving: geysers lock onto where you stood.' },
      { id: 'rupture', name: 'Tidal Fissure', description: 'Stamps so hard that twin lines of coral spikes and pressurised water burst along the ground.', damage: 36, windup: 1.1, range: 30, counter: 'Two lines fan out — step between them or roll wide to the flank.' },
      { id: 'signature', name: 'Abyssal Maelstrom', description: 'Enraged only. Twin spiral arms of coral geysers wind inward toward you, ending in a tidal ring that surges out from its body.', damage: 38, windup: 1.8, range: 26, counter: 'Break outward across a spiral arm with a roll or sprint-leap — every geyser can be vaulted.' },
      { id: 'roar', name: 'Abyssal Roar', description: 'A roar deep enough to shake the ground.', damage: 0, windup: 0.55, range: 24, counter: 'Dodge as it lifts its head.' },
    ],
    vitals: [
      { slot: 'head', name: 'Horn Root', breakFraction: 0.07, effect: 'Staggers it and weakens its roar.' },
      { slot: 'back', name: 'Brine Pearl', breakFraction: 0.08, effect: 'Topples it for a long opening.' },
      { slot: 'tail', name: 'Hammer Core', breakFraction: 0.06, effect: 'Shortens the Tail Hammer.' },
    ],
    plan: {
      bodyLength: 12, bodyWidth: 7, bodyHeight: 2.6, hipHeight: 5.4,
      neckSegments: 2, neckLength: 3.4, neckThick: 2.1, neckRise: 0.25,
      headLength: 4.0, headWidth: 2.8, headHeight: 2.2,
      tailSegments: 6, tailLength: 9, tailThick: 2.0, tailEnd: 'hammer',
      legThick: 1.5, horns: 'ram', hornLength: 3.2, plates: 7, plateHeight: 2.0,
      moss: false, wings: false, shell: true, sourceFacing: 'Z-up', strike: { bite: 0.42, tail: 0.23 },
    },
    palette: { hide: '#445361', hideDark: '#232c35', belly: '#93a3a2', plate: '#5a6f80', horn: '#dde2da', glow: '#4fe3d4', eye: '#a4f7ff', accent: '#2f8f95' },
    // Authored Z-up (forward pointing +Y): rotate +90° about X to stand it upright facing +Z.
    orientation: [S, 0, 0, S],
  },
]

export function monsterById(id: string): MonsterDef {
  return MONSTERS.find(m => m.id === id) ?? MONSTERS[0]
}

/** Quaternion [x, y, z, w] that the builder applies to mimic the authored source orientation. */
export function sourceQuaternion(facing: SourceFacing): [number, number, number, number] {
  switch (facing) {
    case '+X':
      return [0, S, 0, S]
    case 'Z-up':
      return [-S, 0, 0, S]
    default:
      return [0, 0, 0, 1]
  }
}

export function abilityOf(def: MonsterDef, id: AttackId): Ability {
  return def.abilities.find(a => a.id === id)!
}

export function vitalOf(def: MonsterDef, slot: VitalSlot): VitalDef {
  return def.vitals.find(v => v.slot === slot)!
}
