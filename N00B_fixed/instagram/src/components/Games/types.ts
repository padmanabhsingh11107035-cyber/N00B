export type GameCategory = 'all' | 'arcade' | 'puzzle' | 'reflex' | 'brain' | 'social';

export interface MiniGameMeta {
  id: string;
  title: string;
  category: 'arcade' | 'puzzle' | 'reflex' | 'brain' | 'social';
  description: string;
  bannerBg: string;
  badgeColor: string;
  pointsReward: number; // 10,000,000 on win, 5,000,000 on tie, 0 on loss
  difficulty: 'Easy' | 'Medium' | 'Hard';
  players: '1v1 Online' | 'vs Bot' | 'Solo / Friend' | 'Solo';
  iconType: string;
  tags: string[];
  // Pictures of the game's own (portrait posters, shown instead of the cartoon banner on the game's card and page).
  posters?: string[];
  isNew?: boolean;
  // For a game that pays for something other than a win (Helix Fall: every level cleared): what the reward is for, e.g. 'per level'.
  rewardNote?: string;
  // A game that is a page of its own (shown in a frame): its address on this site.
  embedUrl?: string;
  // The game brings its own music and sounds, so the Games page's arcade loop is stopped while it is open.
  ownSound?: boolean;
  // A big hosted game: its frame is only created when Play is pressed (its files are fetched quietly beforehand), instead of being kept out of sight from the moment its page opens.
  embedLazy?: boolean;
  // A hosted game made to be held upright (a puzzle): it is not turned on its side on a phone. Its page is small, so the page of the game says so, and gives its own controls line.
  embedPortrait?: boolean;
  embedControls?: string;
}

// Every entry here has its own dedicated gameplay implementation in
// GamePlayModal — no two of these play the same way. A much longer list
// used to exist, but most of it silently routed to one shared generic
// "tap the orb" placeholder under different names/themes, which is why
// games felt repeated. Add a new entry here only alongside a real,
// distinct component wired up in GamePlayModal.
export const ALL_50_MINI_GAMES: MiniGameMeta[] = [
  // --- NEW: COIL RUSH (a 3D worm arena on its own page, /games/coil-rush/, shown in a frame — see minigames/HostedGameFrame and utils/coilRushWarmup) ---
  {
    id: 'coil_rush',
    title: 'Coil Rush',
    category: 'arcade',
    description: 'Steer a glowing cosmic worm, grow by eating energy and swallow planets, stars and comets for permanent powers. Dodge asteroids, energy gates and gravity wells, outgrow the AI worms and take the crown, in free-for-all or 6 v 6 team battles. It works with a mouse, a finger or a gamepad, and your best length is kept on your device.',
    bannerBg: 'from-[#2a1060] to-[#07061a]',
    badgeColor: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30',
    pointsReward: 0,
    rewardNote: 'Play for fun',
    difficulty: 'Medium',
    players: 'Solo',
    iconType: 'coilrush',
    tags: ['3D', 'Worm arena', 'Powers'],
    isNew: true,
    ownSound: true,
    embedLazy: true,
    embedPortrait: true,
    embedControls: 'Mouse to steer, hold click or Space to boost. On a phone: left thumb steers, right thumb boosts. It has its own music and sounds; no NOOBs for this one, it is just for fun.',
    embedUrl: '/games/coil-rush/',
    posters: [
      '/game-posters/coil-rush/01-cover.webp',
      '/game-posters/coil-rush/02-match.webp',
      '/game-posters/coil-rush/03-skins.webp'
    ]
  },

  // --- NEW: THE ROGUE: SHADOWFALL (a dark-fantasy 3D roguelite on its own page, /games/the-rogue/, shown in a frame — see minigames/HostedGameFrame and utils/rogueWarmup) ---
  {
    id: 'the_rogue_shadowfall',
    title: 'The Rogue: Shadowfall',
    category: 'arcade',
    description: 'A dark-fantasy 3D roguelite. Forge a four-slot, seven-element spell build at the Sigil Forge, choose relics that transform your spells, then Descend through warden-sealed depths or survive the endless Crucible arena. On a phone it plays sideways with two on-screen sticks and buttons.',
    bannerBg: 'from-[#2b1a4d] to-[#120a1f]',
    badgeColor: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
    pointsReward: 0,
    rewardNote: 'Play for fun',
    difficulty: 'Hard',
    players: 'Solo',
    iconType: 'rogue',
    tags: ['3D', 'Roguelite', 'Spells'],
    isNew: true,
    ownSound: true,
    embedLazy: true,
    embedUrl: '/games/the-rogue/',
    posters: [
      '/game-posters/the-rogue/01-cover.webp',
      '/game-posters/the-rogue/04-title.webp',
      '/game-posters/the-rogue/03-forge.webp',
      '/game-posters/the-rogue/02-run.webp'
    ]
  },

  // --- NEW: COLOR SORT (a pouring puzzle on its own page, /games/color-sort/, shown in a frame; the source is the page itself, public/games/color-sort, and the solver that checked its levels is in color-sort/) ---
  {
    id: 'color_sort',
    title: 'Color Sort',
    category: 'puzzle',
    description: 'Pour the colours from bottle to bottle, with the big tube to help, until every bottle holds just one colour. 30 levels, from a handful of bottles to a full board of 24, and every one can be won. Undo as often as you like.',
    bannerBg: 'from-[#2e86ee] to-[#1b1838]',
    badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    pointsReward: 0,
    rewardNote: 'Play for fun',
    difficulty: 'Medium',
    players: 'Solo',
    iconType: 'colorsort',
    tags: ['Puzzle', 'Pouring', 'Relaxing'],
    isNew: true,
    ownSound: true,
    embedPortrait: true,
    embedControls: 'Tap a bottle, then tap where its colour should go. Undo and Restart are at the top. It has its own sounds (the speaker button turns them off); no NOOBs for this one, it is just for fun.',
    embedUrl: '/games/color-sort/',
    posters: [
      '/game-posters/color-sort/01-cover.webp',
      '/game-posters/color-sort/02-pour.webp',
      '/game-posters/color-sort/03-small.webp'
    ]
  },

  // --- NEW: CRITTER KART (a 3D item kart racer on its own page, /games/critterkart/, shown in a frame — see minigames/HostedGameFrame and utils/critterWarmup) ---
  {
    id: 'critter_kart',
    title: 'Critter Kart',
    category: 'arcade',
    description: 'Pick one of six critter drivers and race five rivals over three laps of Frosting Loop Valley. Drift for boosts, grab candy gift boxes for items (a bubble shield, a pepper jet, sticky taffy, a homing bee) and use the caramel shortcut. It always plays sideways: on a phone it goes full screen with a steering slider, a brake, a drift and an item button; on a computer use the keyboard or a gamepad.',
    bannerBg: 'from-[#2b7fd6] to-[#1b1838]',
    badgeColor: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
    pointsReward: 0,
    rewardNote: 'Play for fun',
    difficulty: 'Easy',
    players: 'Solo',
    iconType: 'critterkart',
    tags: ['3D', 'Kart racing', 'Items'],
    isNew: true,
    ownSound: true,
    embedLazy: true,
    embedUrl: '/games/critterkart/',
    posters: [
      '/game-posters/critterkart/01-cover.webp',
      '/game-posters/critterkart/02-driver.webp'
    ]
  },

  // --- NEW: CANYON RUSH CIRCUIT (a 3D racing game on its own page, /games/canyon-rush/, shown in a frame — see minigames/HostedGameFrame and utils/canyonWarmup) ---
  {
    id: 'canyon_rush_circuit',
    title: 'Canyon Rush Circuit',
    category: 'arcade',
    description: 'Drift, boost and jump through a sunlit 3D canyon. Race AI rivals for three laps, or take a friend on in split-screen. Every car is equal, only your line matters. Paint your own car in Car Forge and shape your own circuits in Track Lab. On a phone it plays sideways with an on-screen steering pad.',
    bannerBg: 'from-[#5b2410] to-[#1b1030]',
    badgeColor: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    pointsReward: 0,
    rewardNote: 'Play for fun',
    difficulty: 'Medium',
    players: 'Solo',
    iconType: 'canyon',
    tags: ['3D', 'Racing', 'Track Lab'],
    isNew: true,
    ownSound: true,
    embedLazy: true,
    embedUrl: '/games/canyon-rush/',
    posters: [
      '/game-posters/canyon-rush/01-cover.webp',
      '/game-posters/canyon-rush/02-race.webp',
      '/game-posters/canyon-rush/03-garage.webp'
    ]
  },

  // --- NEW: HELIX FALL (a real 3D game, runs in its own frame — see minigames/HelixFallGame) ---
  {
    id: 'helix_fall',
    title: 'Helix Fall',
    category: 'arcade',
    description: 'Rotate the tower, find the gaps and drop the glowing orb down. Every 90 floors is a level worth 50,000,000 NOOBs, and levels never end. You have one shield per level.',
    bannerBg: 'from-[#2a2552] to-[#1b1838]',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    pointsReward: 50_000_000,
    rewardNote: 'per level',
    difficulty: 'Easy',
    players: 'Solo',
    iconType: 'helix',
    tags: ['3D', 'Endless Levels', 'Daily Tower'],
    isNew: true,
    ownSound: true,
    posters: [
      '/game-posters/helix-fall/01-hero-drop.webp',
      '/game-posters/helix-fall/02-one-input.webp',
      '/game-posters/helix-fall/03-daily-tower.webp',
      '/game-posters/helix-fall/04-rotate-dodge-drop.webp',
      '/game-posters/helix-fall/05-beat-your-best.webp',
      '/game-posters/helix-fall/06-chinese.webp',
      '/game-posters/helix-fall/07-last-floor.webp'
    ]
  },

  // --- NEW: UNDERHALL: AFTER CURFEW (a 3D dungeon game on its own page, /games/underhall/, shown in a frame — see minigames/HostedGameFrame) ---
  {
    id: 'underhall_after_curfew',
    title: 'Underhall: After Curfew',
    category: 'arcade',
    description: 'A superhero school dungeon in 3D. Fight through two seeded floors under the academy, rescue classmates, pick your powers and take down The Proctor and The Librarian. On a phone it plays sideways with an on-screen joystick and buttons.',
    bannerBg: 'from-[#1b1838] to-[#0d0b22]',
    badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    pointsReward: 0,
    rewardNote: 'Play for fun',
    difficulty: 'Medium',
    players: 'Solo',
    iconType: 'underhall',
    tags: ['3D', 'Roguelike', 'Boss Fights'],
    isNew: true,
    ownSound: true,
    embedLazy: true,
    embedUrl: '/games/underhall/',
    posters: [
      '/game-posters/underhall/01-cover.webp',
      '/game-posters/underhall/02-campus.webp',
      '/game-posters/underhall/03-hall-of-origins.webp',
      '/game-posters/underhall/04-training-gym.webp'
    ]
  },

  // --- NEW: NEON ALLEY: LAST CALL (lives on its own page, /games/neon-alley/, shown in a frame — see minigames/HostedGameFrame and worker/index.js) ---
  {
    id: 'neon_alley',
    title: 'Neon Alley: Last Call',
    category: 'arcade',
    description: 'A neon pixel-art street brawler. Chain combos, grab street weapons, fight through two stages and take down the rooftop boss.',
    bannerBg: 'from-[#4a044e] to-[#0f0720]',
    badgeColor: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30',
    pointsReward: 0,
    rewardNote: 'Play for fun',
    difficulty: 'Medium',
    players: 'Solo',
    iconType: 'neon',
    tags: ['Beat-em-up', 'Pixel Art', 'Combos'],
    isNew: true,
    ownSound: true,
    embedUrl: '/games/neon-alley/',
    posters: [
      '/game-posters/neon-alley/01-cover.webp',
      '/game-posters/neon-alley/02-keyart.webp',
      '/game-posters/neon-alley/03-street.webp',
      '/game-posters/neon-alley/04-garage.webp',
      '/game-posters/neon-alley/05-rooftop.webp'
    ]
  },

  // --- BOARD GAME CLASSICS (shown first) ---
  {
    id: 'ludo_classic',
    title: 'Ludo',
    category: 'social',
    description: 'Roll the dice, race your 4 tokens home, and send opponents back to start. Classic 2-4 player board.',
    bannerBg: 'from-[#7c2d12] to-[#1c0a03]',
    badgeColor: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    pointsReward: 10_000_000,
    difficulty: 'Easy',
    players: 'Solo / Friend',
    iconType: 'ludo',
    tags: ['Classic', 'Dice', '2-4 Players']
  },
  {
    id: 'snakes_ladders',
    title: 'Snakes & Ladders',
    category: 'social',
    description: 'Climb ladders, dodge snakes, and race to square 100 first. 2-8 players on one board.',
    bannerBg: 'from-[#14532d] to-[#052e16]',
    badgeColor: 'bg-green-500/20 text-green-300 border-green-500/30',
    pointsReward: 10_000_000,
    difficulty: 'Easy',
    players: 'Solo / Friend',
    iconType: 'snakes_ladders',
    tags: ['Classic', 'Dice', '2-8 Players']
  },
  {
    id: 'monopoly_noob',
    title: 'Monopoly',
    category: 'social',
    description: 'Buy properties, collect rent, dodge bankruptcy. The classic property trading game, 2-4 players.',
    bannerBg: 'from-[#1e3a8a] to-[#020617]',
    badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    pointsReward: 10_000_000,
    difficulty: 'Hard',
    players: 'Solo / Friend',
    iconType: 'monopoly',
    tags: ['Classic', 'Strategy', '2-4 Players']
  },
  {
    id: 'chess_blitz',
    title: 'Chess Blitz 3-Min',
    category: 'brain',
    description: 'High-stakes chess vs a genuinely strong bot: win for +50,000,000 NOOBs, but lose vs the bot and your entire balance resets to 0. Play a friend instead for no risk.',
    bannerBg: 'from-[#27272a] to-[#09090b]',
    badgeColor: 'bg-zinc-400/20 text-zinc-200 border-zinc-400/30',
    pointsReward: 50_000_000,
    difficulty: 'Hard',
    players: 'vs Bot',
    iconType: 'chess',
    tags: ['Chess', 'High Stakes', 'Grandmaster']
  },

  // --- ARCADE ---
  {
    id: 'cyber_snake',
    title: 'Cyber Snake',
    category: 'arcade',
    description: 'Slither through neon gridlines, collect glowing orbs, and grow your tail.',
    bannerBg: 'from-[#0e4429] to-[#072415]',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    pointsReward: 10_000_000,
    difficulty: 'Medium',
    players: '1v1 Online',
    iconType: 'snake',
    tags: ['Retro', 'Arcade', 'Reflex']
  },
  {
    id: 'bubble_blitz',
    title: 'Bubble Pop Blitz',
    category: 'arcade',
    description: 'Aim and pop matching colored bubbles before the ceiling drops.',
    bannerBg: 'from-[#0369a1] to-[#082f49]',
    badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    pointsReward: 10_000_000,
    difficulty: 'Easy',
    players: '1v1 Online',
    iconType: 'bubble',
    tags: ['Aim', 'Colors', 'Match']
  },

  // --- PUZZLE & MATCH ---
  {
    id: 'tictactoe',
    title: 'Tic Tac Toe Pro',
    category: 'puzzle',
    description: 'Challenge a bot or friend in the legendary 3x3 strategic grid battle.',
    bannerBg: 'from-[#1e1e38] to-[#121224]',
    badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    pointsReward: 10_000_000,
    difficulty: 'Easy',
    players: '1v1 Online',
    iconType: 'tictactoe',
    tags: ['Classic', 'Strategy', 'Quick']
  },
  {
    id: 'memory_match',
    title: 'Memory Card Match',
    category: 'puzzle',
    description: 'Flip and pair the matching cards before time runs out.',
    bannerBg: 'from-[#78350f] to-[#290e02]',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    pointsReward: 10_000_000,
    difficulty: 'Easy',
    players: '1v1 Online',
    iconType: 'cards',
    tags: ['Memory', 'Cards', 'Focus']
  },

  // --- REFLEX & ACTION ---
  {
    id: 'rps',
    title: 'Rock Paper Scissors',
    category: 'reflex',
    description: 'Best of 3 rounds! Test your luck and reaction in the classic hand duel.',
    bannerBg: 'from-[#2e4c60] to-[#1a2d3b]',
    badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    pointsReward: 10_000_000,
    difficulty: 'Easy',
    players: '1v1 Online',
    iconType: 'rps',
    tags: ['Luck', 'Classic', 'Fast']
  },
  {
    id: 'reaction_tap',
    title: 'Reaction Timer Blitz',
    category: 'reflex',
    description: 'Tap immediately when the light turns green. Milliseconds matter!',
    bannerBg: 'from-[#9f1239] to-[#4c0519]',
    badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    pointsReward: 10_000_000,
    difficulty: 'Medium',
    players: '1v1 Online',
    iconType: 'stopwatch',
    tags: ['Reaction', 'Milliseconds', 'Speed']
  },

  // --- BRAIN & STRATEGY ---
  {
    id: 'speed_math',
    title: 'Speed Math Sprint',
    category: 'brain',
    description: 'Solve arithmetic equations in 30 high-octane seconds.',
    bannerBg: 'from-[#1b3d54] to-[#0e212e]',
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    pointsReward: 10_000_000,
    difficulty: 'Medium',
    players: '1v1 Online',
    iconType: 'calculator',
    tags: ['Math', 'Timer', 'Brain']
  }
];
