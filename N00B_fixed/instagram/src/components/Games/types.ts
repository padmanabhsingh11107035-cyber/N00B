export type GameCategory = 'all' | 'arcade' | 'puzzle' | 'reflex' | 'brain' | 'social';

export interface MiniGameMeta {
  id: string;
  title: string;
  category: 'arcade' | 'puzzle' | 'reflex' | 'brain' | 'social';
  description: string;
  bannerBg: string;
  badgeColor: string;
  pointsReward: number; // 100 on win, 50 on tie, 0 on loss
  difficulty: 'Easy' | 'Medium' | 'Hard';
  players: '1v1 Online' | 'vs Bot' | 'Solo / Friend' | 'Solo';
  iconType: string;
  tags: string[];
}

// Every entry here has its own dedicated gameplay implementation in
// GamePlayModal — no two of these play the same way. A much longer list
// used to exist, but most of it silently routed to one shared generic
// "tap the orb" placeholder under different names/themes, which is why
// games felt repeated. Add a new entry here only alongside a real,
// distinct component wired up in GamePlayModal.
export const ALL_50_MINI_GAMES: MiniGameMeta[] = [
  // --- BOARD GAME CLASSICS (shown first) ---
  {
    id: 'ludo_classic',
    title: 'Ludo',
    category: 'social',
    description: 'Roll the dice, race your 4 tokens home, and send opponents back to start. Classic 2-4 player board.',
    bannerBg: 'from-[#7c2d12] to-[#1c0a03]',
    badgeColor: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    pointsReward: 100,
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
    pointsReward: 100,
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
    pointsReward: 100,
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
    pointsReward: 50000000,
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
    pointsReward: 100,
    difficulty: 'Medium',
    players: '1v1 Online',
    iconType: 'snake',
    tags: ['Retro', 'Arcade', 'Reflex']
  },
  {
    id: 'cyber_drone',
    title: 'Cyber Drone Dash',
    category: 'arcade',
    description: 'Fly a neon drone through electric laser barriers without crashing.',
    bannerBg: 'from-[#1e3a5f] to-[#0c192e]',
    badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    pointsReward: 100,
    difficulty: 'Medium',
    players: '1v1 Online',
    iconType: 'drone',
    tags: ['Flappy', 'Physics', 'Action']
  },
  {
    id: 'brick_breaker',
    title: 'Neon Brick Smasher',
    category: 'arcade',
    description: 'Launch energetic lasers and smash all falling cosmic blocks.',
    bannerBg: 'from-[#4a1c5e] to-[#2d123b]',
    badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    pointsReward: 100,
    difficulty: 'Easy',
    players: 'vs Bot',
    iconType: 'bricks',
    tags: ['Breakout', 'Retro', 'Classic']
  },
  {
    id: 'bubble_blitz',
    title: 'Bubble Pop Blitz',
    category: 'arcade',
    description: 'Aim and pop matching colored bubbles before the ceiling drops.',
    bannerBg: 'from-[#0369a1] to-[#082f49]',
    badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    pointsReward: 100,
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
    pointsReward: 100,
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
    pointsReward: 100,
    difficulty: 'Easy',
    players: '1v1 Online',
    iconType: 'cards',
    tags: ['Memory', 'Cards', 'Focus']
  },
  {
    id: 'wordle_quest',
    title: '5-Letter Wordle',
    category: 'puzzle',
    description: 'Guess the secret 5-letter word in 6 tries with color clues.',
    bannerBg: 'from-[#14532d] to-[#052e16]',
    badgeColor: 'bg-green-600/20 text-green-300 border-green-500/30',
    pointsReward: 100,
    difficulty: 'Medium',
    players: '1v1 Online',
    iconType: 'wordle',
    tags: ['Wordle', 'Vocab', 'Puzzle']
  },

  // --- REFLEX & ACTION ---
  {
    id: 'rps',
    title: 'Rock Paper Scissors',
    category: 'reflex',
    description: 'Best of 3 rounds! Test your luck and reaction in the classic hand duel.',
    bannerBg: 'from-[#2e4c60] to-[#1a2d3b]',
    badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    pointsReward: 100,
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
    pointsReward: 100,
    difficulty: 'Medium',
    players: '1v1 Online',
    iconType: 'stopwatch',
    tags: ['Reaction', 'Milliseconds', 'Speed']
  },
  {
    id: 'subway_run',
    title: 'NOOB Rail Runner',
    category: 'arcade',
    description: 'Dodge oncoming trains, jump barriers, and slide under low bridges on an endless Indian railway track. Earn 10 NOOB Points for every second you survive.',
    bannerBg: 'from-[#b45309] to-[#1c1917]',
    badgeColor: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    pointsReward: 10,
    difficulty: 'Medium',
    players: 'Solo',
    iconType: 'train_runner',
    tags: ['Endless', 'Runner', 'Solo']
  },

  // --- BRAIN & STRATEGY ---
  {
    id: 'scribble',
    title: 'Scribble & Guess',
    category: 'brain',
    description: 'Draw, sketch, and guess the secret word against the clock with friends.',
    bannerBg: 'from-[#4a1c5e] to-[#2d123b]',
    badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    pointsReward: 100,
    difficulty: 'Easy',
    players: '1v1 Online',
    iconType: 'pencil',
    tags: ['Drawing', 'Creative', 'Words']
  },
  {
    id: 'speed_math',
    title: 'Speed Math Sprint',
    category: 'brain',
    description: 'Solve arithmetic equations in 30 high-octane seconds.',
    bannerBg: 'from-[#1b3d54] to-[#0e212e]',
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    pointsReward: 100,
    difficulty: 'Medium',
    players: '1v1 Online',
    iconType: 'calculator',
    tags: ['Math', 'Timer', 'Brain']
  }
];
