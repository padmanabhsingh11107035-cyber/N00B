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
  // A score game with a ranking (public.game_score_rules): its id there. The game sends its score and asks for the board through utils (public/games/_shared/noob-score.js).
  scoreGame?: string;
}

// Every entry here has its own dedicated gameplay implementation in
// GamePlayModal — no two of these play the same way. A much longer list
// used to exist, but most of it silently routed to one shared generic
// "tap the orb" placeholder under different names/themes, which is why
// games felt repeated. Add a new entry here only alongside a real,
// distinct component wired up in GamePlayModal.
export const ALL_50_MINI_GAMES: MiniGameMeta[] = [
  // --- NEW: NOOB RUN 3D (a 3D endless runner on its own page, /games/noob-run-3d/, shown in a frame; ranking: the shared score board, scoreGame; source in noob-run-3d/) ---
  {
    id: 'noob_run_3d',
    title: 'NOOB Run 3D',
    category: 'arcade',
    description: 'A 3D endless runner: dash through three railway lanes, dodge trains, jump and slide, collect coins and grab power-ups while an inspector and his dog chase you. Missions, skins, weather and a real ranking of every runner best score. Made by NOOB developers.',
    bannerBg: 'from-[#ffb300] to-[#0b1020]',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    pointsReward: 0,
    rewardNote: 'Play for fun',
    difficulty: 'Medium',
    players: 'Solo',
    iconType: 'noobrun',
    tags: ['3D', 'Runner', 'Ranking'],
    isNew: true,
    ownSound: true,
    embedPortrait: true,
    scoreGame: 'noob_run_3d',
    embedControls: 'Swipe left or right to change lane, up to jump, down to slide (or the arrow keys). Missions, skins and the ranking are in the menu. It has its own music and sounds; no NOOBs for this one, it is just for fun.',
    embedUrl: '/games/noob-run-3d/',
    posters: [
      '/game-posters/noob-run-3d/01-cover.webp',
      '/game-posters/noob-run-3d/02-play.webp',
      '/game-posters/noob-run-3d/03-more.webp'
    ]
  },

  // --- NEW: FLAPPY BIRD 20 (a tap-to-flap game with 20 levels on its own page, /games/flappy20/, shown in a frame; ranking: the shared score board, scoreGame) ---
  {
    id: 'flappy20',
    title: 'Flappy Bird 20',
    category: 'reflex',
    description: 'Tap to flap and fly through the pipes. 20 levels: reach the target score of each level to unlock the next one, and climb the ranking, where your best scores of all levels are added up. Made by NOOB developers.',
    bannerBg: 'from-[#4fb7d6] to-[#1a1a2e]',
    badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    pointsReward: 0,
    rewardNote: 'Play for fun',
    difficulty: 'Medium',
    players: 'Solo',
    iconType: 'flappy20',
    tags: ['Tap', 'Levels', 'Ranking'],
    isNew: true,
    ownSound: true,
    embedPortrait: true,
    scoreGame: 'flappy20',
    embedControls: 'Tap the screen (or press Space) to flap, and fly through the gaps. Reach the target score to unlock the next level. The trophy button (top right) shows the ranking. It has its own sounds; no NOOBs for this one, it is just for fun.',
    embedUrl: '/games/flappy20/',
    posters: [
      '/game-posters/flappy20/01-cover.webp',
      '/game-posters/flappy20/02-play.webp',
      '/game-posters/flappy20/03-more.webp'
    ]
  },

  // --- NEW: ROYAL LUDO (the classic race home for 2 to 4 players with computer opponents, on its own page, /games/royal-ludo/, shown in a frame; source in royal-ludo/) ---
  {
    id: 'royal_ludo',
    title: 'Royal Ludo',
    category: 'puzzle',
    description: 'The classic race home for 2 to 4 players: roll a six to leave the yard, capture rivals, use the safe star tiles and reach home with an exact roll. Play with friends on one screen or against computer players (relaxed, balanced or strategic), Classic with 4 tokens or Quick with 2. It fits your phone on one screen, with nothing to scroll. Made by NOOB developers.',
    bannerBg: 'from-[#3a3f66] to-[#0d111a]',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    pointsReward: 0,
    rewardNote: 'Play for fun',
    difficulty: 'Easy',
    players: 'Solo / Friend',
    iconType: 'royalludo',
    tags: ['Board', 'Ludo', '2-4 players'],
    isNew: true,
    ownSound: true,
    embedPortrait: true,
    embedControls: 'Tap Roll the dice, then tap a glowing token. A six lets a token out of the yard. On a computer: Space rolls and 1 to 4 choose a token. The buttons at the top turn the sound, the light theme and full screen on and off. It has its own sounds; no NOOBs for this one, it is just for fun.',
    embedUrl: '/games/royal-ludo/',
    posters: [
      '/game-posters/royal-ludo/01-cover.webp',
      '/game-posters/royal-ludo/02-play.webp',
      '/game-posters/royal-ludo/03-more.webp'
    ]
  },

  // --- NEW: NOCTA (the UNO-style card game for 2 to 10 players, pass and play or against computer players, on its own page, /games/nocta-uno/, shown in a frame; source in nocta-uno/) ---
  {
    id: 'nocta_uno',
    title: 'Nocta',
    category: 'puzzle',
    description: 'A premium UNO-style card game for 2 to 10 players: match colour or number, use Skip, Reverse, Draw Two and the wild cards, stack draws, shout NOCTA on your last card and be the first to empty your hand. Play against up to nine computer players or pass the phone around a table. Made by NOOB developers.',
    bannerBg: 'from-[#1d2a5c] to-[#0a0c13]',
    badgeColor: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
    pointsReward: 0,
    rewardNote: 'Play for fun',
    difficulty: 'Easy',
    players: 'Solo / Friend',
    iconType: 'noctauno',
    tags: ['Cards', 'UNO', '2-10 players'],
    isNew: true,
    ownSound: true,
    embedPortrait: true,
    embedControls: 'Tap Solo or Pass and play, set the players, then Start. Tap a glowing card from your hand to play it, or the draw pile to draw. Tap the NOCTA button on your last card. It has its own sounds; no NOOBs for this one, it is just for fun.',
    embedUrl: '/games/nocta-uno/',
    posters: [
      '/game-posters/nocta-uno/01-cover.webp',
      '/game-posters/nocta-uno/02-play.webp',
      '/game-posters/nocta-uno/03-more.webp'
    ]
  },

  // --- NEW: NOOB GAMES HUB (a dashboard of quick 1 to 4 player games on one screen, /games/noobgames-hub/, shown in a frame; source in noobgames-hub/) ---
  {
    id: 'noobgames_hub',
    title: 'NOOB Party Pack',
    category: 'arcade',
    description: 'A pack of quick games for 1 to 4 players on one screen: pick how many are playing, pick a game and go. Play against the computer or hand the phone around, and collect trophies for every win. Made by NOOB developers.',
    bannerBg: 'from-[#1E293B] to-[#0b1020]',
    badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    pointsReward: 0,
    rewardNote: 'Play for fun',
    difficulty: 'Easy',
    players: 'Solo / Friend',
    iconType: 'partypack',
    tags: ['Party', 'Mini-games', '1-4 players'],
    isNew: true,
    ownSound: true,
    embedPortrait: true,
    embedControls: 'Tap 1, 2, 3 or 4 players, then tap a game. Each player has their own buttons on the screen, and on a computer their own keys. The trophy at the top counts your wins; tap the cog to reset it. It has its own sounds; no NOOBs for this one, it is just for fun.',
    embedUrl: '/games/noobgames-hub/',
    posters: [
      '/game-posters/noobgames-hub/01-cover.webp',
      '/game-posters/noobgames-hub/02-play.webp',
      '/game-posters/noobgames-hub/03-more.webp'
    ]
  },

  // --- NEW: STRIKE BOWL (a five-frame 3D bowling game with real pin physics, on its own page, /games/strikebowl/, shown in a frame; source in strikebowl/) ---
  {
    id: 'strikebowl',
    title: 'Strike Bowl',
    category: 'arcade',
    description: 'A five-frame 3D bowling challenge with real pin physics: line up the ball, hold to power up, drag sideways to hook it and knock them all down. 150 is the best possible score. Your best runs are kept on your device. Made by NOOB developers.',
    bannerBg: 'from-[#3b1d6e] to-[#120828]',
    badgeColor: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30',
    pointsReward: 0,
    rewardNote: 'Play for fun',
    difficulty: 'Medium',
    players: 'Solo',
    iconType: 'strikebowl',
    tags: ['Bowling', '3D', 'Physics'],
    isNew: true,
    ownSound: true,
    embedPortrait: true,
    embedControls: 'Tap the arrows to move the ball sideways, hold the big HOLD button to power up and let go to bowl; drag sideways while holding to hook the ball. On a computer: A and D move, the mouse aims, hold click or Space to power up. It has its own sounds; no NOOBs for this one, it is just for fun.',
    embedUrl: '/games/strikebowl/',
    posters: [
      '/game-posters/strikebowl/01-cover.webp',
      '/game-posters/strikebowl/02-play.webp',
      '/game-posters/strikebowl/03-more.webp'
    ]
  },

  // --- NEW: LANE RUNNER: ENDLESS (on its own page, /games/lane-runner/, shown in a frame; source in lane-runner/) ---
  {
    id: 'lane_runner',
    title: 'Lane Runner: Endless',
    category: 'arcade',
    description: 'An endless 3D run-and-gun horde game: lead a squad of real soldiers down a ruined city, steer through gates that add, multiply or arm your squad, dodge eight kinds of traps, melt zombie hordes with automatic fire, pick perks and beat a new boss at the end of every sector. The Daily Run gives everyone the same city. Made by NOOB developers.',
    bannerBg: 'from-[#1a2230] to-[#07080b]',
    badgeColor: 'bg-red-500/20 text-red-300 border-red-500/30',
    pointsReward: 0,
    rewardNote: 'Play for fun',
    difficulty: 'Medium',
    players: 'Solo',
    iconType: 'lanerunner',
    tags: ['Shooter', 'Runner', '3D'],
    isNew: true,
    ownSound: true,
    embedPortrait: true,
    embedControls: 'Drag left and right to steer your squad through the gates; your soldiers shoot by themselves. Tap the pause button to stop. On a computer: A and D or the arrow keys steer. It has its own sounds; no NOOBs for this one, it is just for fun.',
    embedUrl: '/games/lane-runner/',
    posters: [
      '/game-posters/lane-runner/01-cover.webp',
      '/game-posters/lane-runner/02-play.webp',
      '/game-posters/lane-runner/03-more.webp'
    ]
  },

  // --- NEW: FROSTLINE ZERO (on its own page, /games/frostzero/, shown in a frame; source in frostzero/) ---
  {
    id: 'frostzero',
    title: 'Frostline Zero',
    category: 'arcade',
    description: 'An avalanche run down a frozen mountain: the avalanche is behind you and the abyss below, so carve, jump and dash through the crystal gallery, dodge the red crystals, reach the checkpoints and ride to the finish as fast as you can. One hit and you are back at the last checkpoint. Your best times are kept on your device. Made by NOOB developers.',
    bannerBg: 'from-[#1b3b5c] to-[#08111c]',
    badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    pointsReward: 0,
    rewardNote: 'Play for fun',
    difficulty: 'Medium',
    players: 'Solo',
    iconType: 'frostzero',
    tags: ['Racing', '3D', 'Snow'],
    isNew: true,
    ownSound: true,
    embedControls: 'Steer left and right to dodge the red crystals; jump and dash with the on-screen buttons. On a computer: A and D or the arrow keys steer, Space jumps, Shift sprints, F dashes, P pauses. It has its own sounds; no NOOBs for this one, it is just for fun.',
    embedUrl: '/games/frostzero/',
    posters: [
      '/game-posters/frostzero/01-cover.webp',
      '/game-posters/frostzero/02-play.webp',
      '/game-posters/frostzero/03-more.webp'
    ]
  },

  // --- NEW: FARBOUND: RUINS BEYOND (on its own page, /games/farbound/, shown in a frame; source in farbound/) ---
  {
    id: 'farbound',
    title: 'Farbound: Ruins Beyond',
    category: 'arcade',
    description: 'A small, quiet 3D exploration adventure above the clouds: wander a hill, meet a fox and an old guardian, and uncover ten star memories as the world slowly wakes up. No timers, no enemies, just a story to walk through. Your progress is kept on your device. Made by NOOB developers.',
    bannerBg: 'from-[#2c4a52] to-[#0f1f24]',
    badgeColor: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
    pointsReward: 0,
    rewardNote: 'Play for fun',
    difficulty: 'Easy',
    players: 'Solo',
    iconType: 'farbound',
    tags: ['Adventure', 'Story', 'Exploration'],
    isNew: true,
    ownSound: true,
    embedControls: 'Touch: use the on-screen stick to walk and the buttons to jump and listen. On a computer: WASD walks, drag the mouse to look, Shift walks faster, Space jumps and E listens or talks; Esc pauses. It has its own sounds; no NOOBs for this one, it is just for fun.',
    embedUrl: '/games/farbound/',
    posters: [
      '/game-posters/farbound/01-cover.webp',
      '/game-posters/farbound/02-play.webp',
      '/game-posters/farbound/03-more.webp'
    ]
  },

  // --- NEW: APEX DRIFT (on its own page, /games/apexdrift/, shown in a frame; source in apexdrift/) ---
  {
    id: 'apexdrift',
    title: 'Apex Drift',
    category: 'arcade',
    description: 'A 60-second 3D arcade drift score attack: chain controlled slides, build a multiplier and bank as many points as you can before the clock ends. Clip the rings for bonus points, but crash or spin and the chain is lost. A new set of weather, time of day and clip positions every day, and your best runs are kept on your device. Made by NOOB developers.',
    bannerBg: 'from-[#3a2a5c] to-[#0d0a18]',
    badgeColor: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    pointsReward: 0,
    rewardNote: 'Play for fun',
    difficulty: 'Medium',
    players: 'Solo',
    iconType: 'apexdrift',
    tags: ['Racing', 'Drift', '3D'],
    isNew: true,
    ownSound: true,
    embedControls: 'Touch: on-screen buttons and wheel for throttle, brake, steering and handbrake. On a computer: W or Up throttles, S or Down brakes, A and D or Left and Right steer, Space is the handbrake, R resets, Enter starts. It has its own sounds; no NOOBs for this one, it is just for fun.',
    embedUrl: '/games/apexdrift/',
    posters: [
      '/game-posters/apexdrift/01-cover.webp',
      '/game-posters/apexdrift/02-play.webp',
      '/game-posters/apexdrift/03-more.webp'
    ]
  },

  // --- NEW: SIEGECRAFT (a 3D catapult-and-castles physics game on its own page, /games/siegecraft/, shown in a frame — see minigames/HostedGameFrame and utils/siegecraftWarmup; the source is in siegecraft/) ---
  {
    id: 'siegecraft',
    title: 'Siegecraft',
    category: 'arcade',
    description: 'Wind back the catapult, find the angle and bring two castles down: a wooden fort and a bluestone keep, built from hundreds of pieces that really fall. Red powder barrels chain the blast, every big hit plays out in slow motion, and the fewer stones you use the more stars you win. Made by NOOB developers. On a phone it plays sideways, and your best scores are kept on your device.',
    bannerBg: 'from-[#6b3fa0] to-[#1b1838]',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    pointsReward: 0,
    rewardNote: 'Play for fun',
    difficulty: 'Medium',
    players: 'Solo',
    iconType: 'siegecraft',
    tags: ['3D', 'Physics', 'Castles'],
    isNew: true,
    ownSound: true,
    embedLazy: true,
    embedControls: 'Drag down and let go to fire, drag sideways to turn, the mouse wheel (or W and S) sets the angle, V or Survey looks around the castle. On a phone: drag to aim and charge, the little stick sets the angle. It has its own music and sounds; no NOOBs for this one, it is just for fun.',
    embedUrl: '/games/siegecraft/',
    posters: [
      '/game-posters/siegecraft/01-cover.webp',
      '/game-posters/siegecraft/02-aim.webp',
      '/game-posters/siegecraft/03-impact.webp',
      '/game-posters/siegecraft/04-keep.webp'
    ]
  },

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
    description: 'Pour the colours from bottle to bottle until each colour fills a bottle of its own: a full bottle gets a cap and is finished. 40 levels, from 3 colours to 14, and every one can be won. Undo as often as you like, and climb the ranking: the highest level cleared by every player.',
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
    embedControls: 'Tap a bottle, then tap where its colour should go. A bottle full of one colour is capped and can not be used again; cap them all to clear the level. Undo, Restart and the Ranking (trophy) are at the top. It has its own sounds (the speaker button turns them off); no NOOBs for this one, it is just for fun.',
    embedUrl: '/games/color-sort/',
    posters: [
      '/game-posters/color-sort/01-cover.webp',
      '/game-posters/color-sort/02-pour.webp',
      '/game-posters/color-sort/03-small.webp'
    ]
  },

  // --- NEW: BRICK ESCAPE (a sliding-brick puzzle on its own page, /games/brick-escape/, shown in a frame; the source is the page itself, public/games/brick-escape, and the solver that made and checked its levels is in brick-escape/) ---
  {
    id: 'brick_escape',
    title: 'Brick Escape',
    category: 'puzzle',
    description: 'A tray full of studded bricks, with doors in its walls. Slide the bricks out of the way and out through the door of their own colour until the tray is empty. 40 levels, from one brick to a packed tray with big bricks and wide doors, and every one can be won. Win up to 3 stars (the fewer moves the better), ask for a hint, undo as often as you like, and climb the ranking: the highest level each player has cleared.',
    bannerBg: 'from-[#7a66ff] to-[#14113d]',
    badgeColor: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
    pointsReward: 0,
    rewardNote: 'Play for fun',
    difficulty: 'Medium',
    players: 'Solo',
    iconType: 'brickescape',
    tags: ['Puzzle', 'Sliding', 'Bricks'],
    isNew: true,
    ownSound: true,
    embedPortrait: true,
    embedControls: 'Drag a brick to slide it, or flick it to send it all the way. Tap a brick to see which ways it can go. Slide a brick into the door of its colour to send it out; clear the tray to win. Hint, Undo, Restart, Sound and the Ranking (trophy) are at the top; tap Level to pick any level you have reached. It has its own sounds (the speaker button).',
    embedUrl: '/games/brick-escape/',
    posters: [
      '/game-posters/brick-escape/01-cover.webp',
      '/game-posters/brick-escape/02-slide.webp',
      '/game-posters/brick-escape/03-doors.webp'
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
