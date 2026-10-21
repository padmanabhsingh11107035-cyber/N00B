/**
 * All authored content in one place: the five dungeon wings, the modular room chunks the
 * generator assembles, enemy stats, upgrade cards, relics, classmates and lore. Pure data — no
 * three.js — so the generator and rules stay unit-testable.
 */

export type Dir = 'N' | 'E' | 'S' | 'W'
export const DIRS: readonly Dir[] = ['N', 'E', 'S', 'W']
export const DIR_VEC: Record<Dir, { x: number; y: number }> = { N: { x: 0, y: -1 }, E: { x: 1, y: 0 }, S: { x: 0, y: 1 }, W: { x: -1, y: 0 } }
export const OPPOSITE: Record<Dir, Dir> = { N: 'S', S: 'N', E: 'W', W: 'E' }

// ─── Wings ────────────────────────────────────────────────────────────────

export type WingId = 'classrooms' | 'labs' | 'trophy' | 'library' | 'gym' | 'stacks'
export type HazardType = 'chalk' | 'acid' | 'spark' | 'laser' | 'tomes' | 'vent'
export type EnemyType = 'swarm' | 'shade' | 'monitor' | 'bruiser'
export type CoverKind = 'desk' | 'bench' | 'case' | 'shelf' | 'mat'

export type WingDef = {
  id: WingId | 'hub'
  name: string
  short: string
  tagline: string
  floorA: string
  floorB: string
  corridor: string
  wall: string
  wallTop: string
  trim: string
  fog: string
  sky: string
  ground: string
  lights: string[]
  cover: CoverKind
  hazards: Partial<Record<HazardType, number>>
  enemies: Partial<Record<EnemyType, number>>
  /** Template ids this wing favours (weighted x3 during selection). */
  favours: string[]
}

export const WINGS: Record<WingId, WingDef> = {
  classrooms: {
    id: 'classrooms', name: 'Corrupted Classrooms', short: 'Classrooms',
    tagline: 'Desks drift. Chalk writes by itself. Class is never dismissed.',
    floorA: '#5b4a7a', floorB: '#4d3f69', corridor: '#3a3052', wall: '#2f2a4a', wallTop: '#6e5fa3', trim: '#ffd35c',
    fog: '#1a1430', sky: '#8f7fd6', ground: '#2a1f3a', lights: ['#ffd35c', '#ff9f5c', '#b58cff'],
    cover: 'desk', hazards: { chalk: 3, tomes: 1 }, enemies: { shade: 3, swarm: 3, monitor: 2, bruiser: 1 },
    favours: ['rows', 'pillars'],
  },
  labs: {
    id: 'labs', name: 'Unstable Science Labs', short: 'Science Labs',
    tagline: 'Every experiment failed at once — and learned to walk.',
    floorA: '#2f5d5a', floorB: '#284f4d', corridor: '#1f3b3d', wall: '#1d2f36', wallTop: '#3fbfa6', trim: '#6dff9e',
    fog: '#0c1f22', sky: '#6fd6c1', ground: '#12272a', lights: ['#6dff9e', '#7ef9ff', '#c8ff5c'],
    cover: 'bench', hazards: { acid: 3, spark: 2 }, enemies: { swarm: 2, monitor: 3, shade: 2, bruiser: 1 },
    favours: ['islands', 'ring'],
  },
  trophy: {
    id: 'trophy', name: 'Trophy-Hall Gauntlet', short: 'Trophy Hall',
    tagline: 'A century of glory, and every trophy wants a rematch.',
    floorA: '#6b4a2e', floorB: '#5c3f27', corridor: '#43301f', wall: '#3a2618', wallTop: '#c98f3a', trim: '#ffcf4d',
    fog: '#1f140c', sky: '#ffcc80', ground: '#2a1a10', lights: ['#ffcf4d', '#ff7a45', '#fff0b3'],
    cover: 'case', hazards: { laser: 3, chalk: 1 }, enemies: { bruiser: 2, shade: 3, monitor: 2, swarm: 1 },
    favours: ['lanes', 'arena'],
  },
  library: {
    id: 'library', name: 'Haunted Library Stacks', short: 'Library',
    tagline: 'Overdue books circle like sharks between the shelves.',
    floorA: '#3d3a5c', floorB: '#35324f', corridor: '#28263d', wall: '#231f33', wallTop: '#7a64c9', trim: '#c58cff',
    fog: '#120f1f', sky: '#a393ff', ground: '#1a1528', lights: ['#c58cff', '#7ea6ff', '#ffd9a8'],
    cover: 'shelf', hazards: { tomes: 3, chalk: 1 }, enemies: { swarm: 3, shade: 3, monitor: 1, bruiser: 1 },
    favours: ['stacks', 'rows'],
  },
  gym: {
    id: 'gym', name: 'Anti-Gravity Gym', short: 'Training Gym',
    tagline: 'Gravity took a personal day. Dodgeballs did not.',
    floorA: '#7a4b3a', floorB: '#6b4133', corridor: '#3f2b2b', wall: '#2c2230', wallTop: '#ff6b8b', trim: '#7ef9ff',
    fog: '#180f1a', sky: '#ff9fb5', ground: '#241624', lights: ['#7ef9ff', '#ff6b8b', '#ffe066'],
    cover: 'mat', hazards: { vent: 3, spark: 1 }, enemies: { bruiser: 2, swarm: 2, shade: 2, monitor: 2 },
    favours: ['arena', 'pillars'],
  },
  stacks: {
    id: 'stacks', name: 'The Stacks Below', short: 'The Stacks',
    tagline: 'Beneath the library, every book ever overdue is still waiting to be returned.',
    floorA: '#243a44', floorB: '#1f323b', corridor: '#172329', wall: '#141c22', wallTop: '#3fd3b0', trim: '#7effd4',
    fog: '#081214', sky: '#7effd4', ground: '#0f191c', lights: ['#7effd4', '#c58cff', '#ffd9a8'],
    cover: 'shelf', hazards: { tomes: 3, laser: 1, chalk: 1 }, enemies: { shade: 3, swarm: 2, monitor: 2, bruiser: 2 },
    favours: ['stacks', 'rows', 'islands'],
  },
}
/** Every wing id (the hub is not a wing). */
export const WING_IDS = Object.keys(WINGS) as WingId[]
/** Floor 1 rolls one of the five academy wings; Floor 2 is always The Stacks Below. */
export const FLOOR1_WINGS: WingId[] = ['classrooms', 'labs', 'trophy', 'library', 'gym']
export const FLOOR_COUNT = 2

// ─── Room templates (modular chunks) ─────────────────────────────────────
// Interior tiles only; the builder adds the outer wall ring and 3-wide door sockets centred on
// each side. '.' floor · '#' pillar · 'c' wing cover prop (solid, blocks shots) · 'e' enemy spawn
// · 'h' hazard anchor · 'p' decor · 'x' room centre / feature.

export type TemplateRole = 'combat' | 'special' | 'boss' | 'rescue'
export type TemplateDef = { id: string; role: TemplateRole; sockets: string; rows: string[] }

export const TEMPLATES: TemplateDef[] = [
  {
    id: 'rows', role: 'combat', sockets: 'NESW', rows: [
      '...........',
      '.e.......e.',
      '..cc.c.cc..',
      '...........',
      '..cc...cc..',
      '.h...x...h.',
      '..cc...cc..',
      '...........',
      '..cc.c.cc..',
      '.e...e...e.',
      '...........',
    ],
  },
  {
    id: 'ring', role: 'combat', sockets: 'NESW', rows: [
      '...........',
      '.e.......e.',
      '.....h.....',
      '...##.##...',
      '...#...#...',
      '.h...x...h.',
      '...#...#...',
      '...##.##...',
      '...........',
      '.e...e...e.',
      '...........',
    ],
  },
  {
    id: 'pillars', role: 'combat', sockets: 'NESW', rows: [
      '...........',
      '.e.......e.',
      '..#..h..#..',
      '...........',
      '....c.c....',
      '.h...x...h.',
      '....c.c....',
      '...........',
      '..#..h..#..',
      '.e...e...e.',
      '...........',
    ],
  },
  {
    id: 'lanes', role: 'combat', sockets: 'NS', rows: [
      '.....e.....',
      '.ccc...ccc.',
      '.e.......e.',
      '.h..ccc..h.',
      '...........',
      '.ccc.x.ccc.',
      '...........',
      '.h..ccc..h.',
      '.e.......e.',
      '.ccc...ccc.',
      '.....e.....',
    ],
  },
  {
    id: 'corner', role: 'combat', sockets: 'NSW', rows: [
      '.......####',
      '.e.....####',
      '.......####',
      '...h...####',
      '.......####',
      '.h...x.....',
      '...........',
      '..c...c..e.',
      '...........',
      '.e...h...e.',
      '...........',
    ],
  },
  {
    id: 'stacks', role: 'combat', sockets: 'NESW', rows: [
      '...........',
      '.cc.ccc.cc.',
      '.e.......e.',
      '.cc.c.c.cc.',
      '.....h.....',
      '.h...x...h.',
      '.....h.....',
      '.cc.c.c.cc.',
      '.e.......e.',
      '.cc.ccc.cc.',
      '...........',
    ],
  },
  {
    id: 'cross', role: 'combat', sockets: 'NESW', rows: [
      '##.....##',
      '#e.....e#',
      '...h.h...',
      '.........',
      '....x....',
      '.........',
      '...c.c...',
      '#e.....e#',
      '##.....##',
    ],
  },
  {
    id: 'islands', role: 'combat', sockets: 'NESW', rows: [
      '.............',
      '.e....e....e.',
      '..cc.....cc..',
      '..c...h...c..',
      '.............',
      '...#.....#...',
      '.h....x....h.',
      '...#.....#...',
      '.............',
      '..c...h...c..',
      '..cc.....cc..',
      '.e....e....e.',
      '.............',
    ],
  },
  {
    id: 'arena', role: 'combat', sockets: 'NESW', rows: [
      '.............',
      '.e.........e.',
      '...h.....h...',
      '.............',
      '.....#.#.....',
      '.............',
      '.e....x....e.',
      '.............',
      '.....#.#.....',
      '.............',
      '...h.....h...',
      '.e.........e.',
      '.............',
    ],
  },
  {
    id: 'chamber', role: 'special', sockets: 'NESW', rows: [
      '.........',
      '.p.....p.',
      '.........',
      '.........',
      '....x....',
      '.........',
      '.........',
      '.p.....p.',
      '.........',
    ],
  },
  {
    id: 'alcove', role: 'special', sockets: 'NESW', rows: [
      '##.....##',
      '#p.....p#',
      '.........',
      '.........',
      '....x....',
      '.........',
      '.........',
      '#p.....p#',
      '##.....##',
    ],
  },
  {
    id: 'rescue', role: 'rescue', sockets: 'NESW', rows: [
      '...........',
      '.e.......e.',
      '...p...p...',
      '...........',
      '...........',
      '.e...x...e.',
      '...........',
      '...........',
      '...p...p...',
      '.e.......e.',
      '...........',
    ],
  },
  {
    id: 'proctor', role: 'boss', sockets: 'NESW', rows: [
      '.............',
      '.p.........p.',
      '.............',
      '...#.....#...',
      '.............',
      '.............',
      '......x......',
      '.............',
      '.............',
      '...#.....#...',
      '.............',
      '.p.........p.',
      '.............',
    ],
  },
]

// ─── Enemies ──────────────────────────────────────────────────────────────

export type EnemyDef = { name: string; hp: number; speed: number; radius: number; damage: number; cost: number; credits: number }
export const ENEMIES: Record<EnemyType, EnemyDef> = {
  swarm: { name: 'Pop Quiz', hp: 16, speed: 6.4, radius: 0.45, damage: 6, cost: 1, credits: 2 },
  shade: { name: 'Detention Shade', hp: 44, speed: 4.3, radius: 0.55, damage: 13, cost: 2, credits: 4 },
  monitor: { name: 'Hall Monitor', hp: 32, speed: 3.6, radius: 0.6, damage: 10, cost: 2, credits: 4 },
  bruiser: { name: 'Mascot Bruiser', hp: 140, speed: 2.6, radius: 1.0, damage: 22, cost: 4, credits: 9 },
}

export type BossId = 'proctor' | 'librarian'
export type BossDef = {
  id: BossId
  name: string
  title: string
  hp: number
  phases: [string, string, string]
  arena: string
  color: string
  defeat: [string, string]
}
export const BOSSES: Record<BossId, BossDef> = {
  proctor: {
    id: 'proctor', name: 'The Proctor', title: 'Keeper of the Final Exam', hp: 1100, phases: ['QUIZ', 'MIDTERMS', 'FINAL EXAM'],
    arena: "The Proctor's Exam Hall", color: '#e8384f', defeat: ['EXAM PASSED!', 'The Proctor is sealed. The portal leads deeper...'],
  },
  librarian: {
    id: 'librarian', name: 'The Librarian', title: 'Warden of the Stacks Below', hp: 1500, phases: ['OVERDUE', 'SILENCE', 'CLOSING TIME'],
    arena: 'The Reading Room at the Bottom', color: '#7effd4', defeat: ['BOOKS CLOSED!', 'The Underhall is quiet. Reach the portal home!'],
  },
}
/** Floor number (1-based) → boss guarding it. */
export const FLOOR_BOSS: BossId[] = ['proctor', 'librarian']
export const BOSS = BOSSES.proctor

// ─── Upgrades (in-run choices) ───────────────────────────────────────────

export type Rarity = 'common' | 'rare' | 'epic'
export type UpgradeId =
  | 'knuckles' | 'splitShot' | 'chain' | 'overcharge' | 'afterimage' | 'vampiric' | 'shield' | 'seismic'
  | 'heart' | 'momentum' | 'surge' | 'glass' | 'nova' | 'critical' | 'bulwark'
export type UpgradeDef = { id: UpgradeId; name: string; desc: string; rarity: Rarity; max: number; icon: string; tag: 'melee' | 'bolt' | 'dash' | 'nova' | 'defense' | 'utility' }

export const UPGRADES: UpgradeDef[] = [
  { id: 'knuckles', name: 'Kinetic Knuckles', desc: 'Melee damage +30%.', rarity: 'common', max: 3, icon: 'fist', tag: 'melee' },
  { id: 'seismic', name: 'Seismic Finisher', desc: 'Your 3rd combo hit erupts in a shockwave around the target.', rarity: 'rare', max: 1, icon: 'quake', tag: 'melee' },
  { id: 'vampiric', name: 'Heroic Resolve', desc: 'Melee hits restore 1 HP.', rarity: 'rare', max: 2, icon: 'heart', tag: 'melee' },
  { id: 'splitShot', name: 'Split Shot', desc: 'Power Bolts fire in a 3-way spread.', rarity: 'rare', max: 1, icon: 'split', tag: 'bolt' },
  { id: 'chain', name: 'Chain Lightning', desc: 'Bolts arc to 2 more enemies (60% damage).', rarity: 'epic', max: 1, icon: 'bolt', tag: 'bolt' },
  { id: 'overcharge', name: 'Overcharge', desc: 'Bolts cost 35% less Power and hit 20% harder.', rarity: 'common', max: 2, icon: 'battery', tag: 'bolt' },
  { id: 'afterimage', name: 'Afterimage Dash', desc: 'Dashing through enemies deals 25 damage.', rarity: 'rare', max: 1, icon: 'dash', tag: 'dash' },
  { id: 'momentum', name: 'Momentum', desc: 'Move speed +12% and dash cooldown -25%.', rarity: 'common', max: 2, icon: 'wing', tag: 'dash' },
  { id: 'nova', name: 'Supernova', desc: 'Nova radius +40%, damage +50% and it stuns longer.', rarity: 'rare', max: 2, icon: 'star', tag: 'nova' },
  { id: 'surge', name: 'Power Surge', desc: 'Gain Power 50% faster.', rarity: 'common', max: 2, icon: 'spark', tag: 'nova' },
  { id: 'shield', name: 'Super Barrier', desc: 'A barrier blocks one hit, recharging every 9s.', rarity: 'epic', max: 1, icon: 'shield', tag: 'defense' },
  { id: 'heart', name: 'Hero Heart', desc: 'Max HP +25 and heal 25.', rarity: 'common', max: 3, icon: 'plus', tag: 'defense' },
  { id: 'bulwark', name: 'Iron Will', desc: 'Take 15% less damage.', rarity: 'rare', max: 2, icon: 'armor', tag: 'defense' },
  { id: 'critical', name: 'Top of the Class', desc: '+15% chance to land a double-damage critical.', rarity: 'rare', max: 2, icon: 'crit', tag: 'utility' },
  { id: 'glass', name: 'Glass Cannon', desc: 'All damage +40%, but Max HP -25.', rarity: 'epic', max: 1, icon: 'skull', tag: 'utility' },
]
export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map(u => [u.id, u])) as Record<UpgradeId, UpgradeDef>

// ─── Relics (rare finds, logged in the Codex) ────────────────────────────

export type RelicId = 'cape' | 'crest' | 'compass' | 'key' | 'hourglass' | 'shard'
export type RelicDef = { id: RelicId; name: string; effect: string; lore: string }
export const RELICS: RelicDef[] = [
  { id: 'cape', name: "Founder's Cape", effect: 'Once per run, get back up at 50% HP.', lore: 'Worn by Headmaster Aurelia on the night she first sealed the Underhall.' },
  { id: 'crest', name: 'Crest of the First Class', effect: 'All damage +20%.', lore: 'Twelve students graduated in 1924. Eleven names are engraved on it. One was scratched out.' },
  { id: 'compass', name: "Captain Valor's Compass", effect: 'Reveals the whole floor map. Crit chance +10%.', lore: 'It never points north. It points toward whoever needs saving.' },
  { id: 'key', name: 'Lucky Locker Key', effect: 'Credits +60%. Vending prices -25%.', lore: 'Opens locker 713, which does not exist on any campus blueprint.' },
  { id: 'hourglass', name: 'Hourglass of Detention', effect: 'Enemies move 15% slower.', lore: 'Confiscated from a time-walker in 1987. The sand still falls upward.' },
  { id: 'shard', name: 'Super Core Shard', effect: 'Regenerate Power 4 per second.', lore: 'A splinter of the seal itself. It hums the school anthem, badly.' },
]
export const RELIC_BY_ID = Object.fromEntries(RELICS.map(r => [r.id, r])) as Record<RelicId, RelicDef>

// ─── Classmates (rescues grant an assist this run and a permanent bonus) ─

export type ClassmateId = 'pixel' | 'rocky' | 'zephyr' | 'mira' | 'tock' | 'blaze'
export type ClassmateDef = { id: ClassmateId; name: string; power: string; assist: string; line: string; color: string }
export const CLASSMATES: ClassmateDef[] = [
  { id: 'pixel', name: 'Pixel Park', power: 'Technopath', assist: 'Bolt damage +20%', line: "The vault's firewall was cracked from the INSIDE. Somebody opened it on purpose.", color: '#7ef9ff' },
  { id: 'rocky', name: 'Rocky Ramos', power: 'Stone Skin', assist: 'Max HP +15', line: 'I was doing push-ups in the gym and the floor just... swallowed me. Rude.', color: '#c98f3a' },
  { id: 'zephyr', name: 'Zephyr Quinn', power: 'Windrunner', assist: 'Move speed +8%', line: "The corridors are shifting. It's like the school is rearranging itself around YOU.", color: '#b8f5ff' },
  { id: 'mira', name: 'Mira Solis', power: 'Sunmender', assist: 'Heal 6 HP after each cleared room', line: "The shadows kept whispering exam questions. I didn't know any of the answers.", color: '#ffd35c' },
  { id: 'tock', name: 'Tock', power: 'Time-Slip', assist: 'Dash cooldown -20%', line: "I've seen this night eleven times already. In every loop, you're the one who comes.", color: '#c58cff' },
  { id: 'blaze', name: 'Blaze Okafor', power: 'Pyrokinetic', assist: 'Melee damage +15%', line: "The Proctor isn't evil. It's grading us. And we are failing.", color: '#ff7a45' },
]
export const CLASSMATE_BY_ID = Object.fromEntries(CLASSMATES.map(c => [c.id, c])) as Record<ClassmateId, ClassmateDef>

// ─── Lore pages (mystery of the Underhall) ───────────────────────────────

export type LorePage = { id: string; title: string; text: string }
export const LORE: LorePage[] = [
  { id: 'l1', title: "Founder's Journal, p. 3", text: 'We did not build Super Academy over the Underhall by accident. A school is a promise that the next generation will be ready. The vault is where we keep what they must be ready for.' },
  { id: 'l2', title: 'Maintenance Log #0413', text: 'Seal pressure dropping 2% per semester. Headmaster says it "feeds on doubt." Requested a budget for more doubt-proof concrete. Denied.' },
  { id: 'l3', title: 'Detention Slip (Unsigned)', text: 'Reason for detention: "Asked what is behind the sub-basement door." Assigned by: THE PROCTOR. Duration: until you pass.' },
  { id: 'l4', title: 'Cafeteria Menu, Week ∞', text: 'Monday: mystery meat. Tuesday: mystery. Wednesday: the mystery is you. Thursday: [page is chewed].' },
  { id: 'l5', title: 'Letter to the Board', text: 'The Proctor was never a monster. It was our first teacher — the entity that tested every founder. We sealed it when we stopped wanting to be tested.' },
  { id: 'l6', title: 'Security Footage Transcript', text: '11:58 PM — curfew. 11:59 PM — a student-shaped figure touches the seal with a keycard. 12:00 AM — all cameras show the same empty classroom.' },
  { id: 'l7', title: 'Torn Report Card', text: 'Subject: Heroics. Grade: INCOMPLETE. Teacher comment: "Shows courage. Needs to return to the Underhall to finish the exam."' },
  { id: 'l8', title: "Headmaster's Memo", text: 'If you are reading this, the seal failed, and one of our students went down after the others. Good. That was always the final exam.' },
  { id: 'l9', title: 'Library Card #0001', text: 'Borrower: The Founders. Item: "Everything We Were Afraid Of." Due: 1952. Status: NEVER RETURNED. The Librarian has been waiting.' },
  { id: 'l10', title: 'Overdue Notice (Final)', text: 'The Stacks Below keep every doubt this school ever shelved. The Proctor only tests you. The Librarian keeps what you failed to learn.' },
  { id: 'l11', title: 'Whispered Marginalia', text: 'The keycard at the seal belonged to a student who wanted to know the truth. The vault did not break. It was opened. Someone had to go and read.' },
]

// ─── Meta progression (Hero Development Board in the hub) ────────────────

export type DevId = 'vitality' | 'training' | 'focus' | 'insight'
export type DevDef = { id: DevId; name: string; desc: (level: number) => string; max: number; cost: (level: number) => number }
export const DEV_BOARD: DevDef[] = [
  { id: 'vitality', name: 'Vitality Drills', desc: l => `Max HP +${l * 10}`, max: 5, cost: l => 12 + l * 10 },
  { id: 'training', name: 'Combat Training', desc: l => `All damage +${l * 6}%`, max: 5, cost: l => 15 + l * 12 },
  { id: 'focus', name: 'Power Focus', desc: l => `Enter every fight with at least ${20 + l * 15} Power`, max: 3, cost: l => 14 + l * 12 },
  { id: 'insight', name: 'Study Hall', desc: l => `${l} reroll${l === 1 ? '' : 's'} per run on upgrade choices`, max: 3, cost: l => 20 + l * 15 },
]
