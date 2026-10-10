export type PlayerColor = 'red' | 'blue' | 'yellow' | 'green' | 'purple' | 'orange';

export type TokenStatus = 'yard' | 'track' | 'home_path' | 'home';

export interface TokenState {
  id: number; // 0, 1, 2, 3
  color: PlayerColor;
  status: TokenStatus;
  position: number; // 0..51 on track, 0..5 on home path, or -1 in yard, 6 = home center
  stepCount: number; // total steps taken from start (0 when in yard, 1 when on start, 56 = home reached)
  isSafe: boolean;
}

export type GameMode =
  | 'quick'
  | 'classic'
  | 'five_player'
  | 'six_player'
  | 'team_2v2'
  | 'vs_computer'
  | 'local_pass_play'
  | 'private_room'
  | 'online_random'
  | 'tournament';

export type BotDifficulty = 'easy' | 'medium' | 'hard';

export interface Player {
  id: string;
  name: string;
  avatar: string;
  color: PlayerColor;
  team?: 1 | 2; // For team_2v2
  isBot: boolean;
  botDifficulty?: BotDifficulty;
  isConnected: boolean;
  level: number;
  xp: number;
  tokens: TokenState[];
  hasFinished: boolean;
  finishRank?: number;
  consecutiveSixes: number;
  tokensHome: number;
  capturedCount: number;
}

export type DiceRollStatus = 'waiting_roll' | 'rolling' | 'waiting_move' | 'moving';

export interface MoveRecord {
  playerId: string;
  color: PlayerColor;
  diceValue: number;
  tokenId: number;
  fromStatus: TokenStatus;
  fromPos: number;
  toStatus: TokenStatus;
  toPos: number;
  capturedColor?: PlayerColor;
  capturedTokenId?: number;
  timestamp: number;
}

export interface LudoGameState {
  gameId: string;
  roomId: string;
  mode: GameMode;
  targetTokensHome: number; // 4 in classic, 2 in quick
  playerCount: number;
  players: Player[];
  currentTurnColor: PlayerColor;
  turnTimeout: number; // in seconds, e.g. 15
  turnTimeRemaining: number;
  diceValue: number | null;
  diceRollStatus: DiceRollStatus;
  legalTokenIds: number[];
  status: 'waiting' | 'in_progress' | 'completed' | 'paused';
  winner: PlayerColor | null;
  winningTeam?: 1 | 2;
  rankings: PlayerColor[];
  scores: Record<string, number>;
  moveHistory: MoveRecord[];
  turnCount: number;
  lastActiveTimestamp: number;
  createdAt: number;
  updatedAt: number;
}

export interface EmoteMessage {
  id: string;
  playerId: string;
  color: PlayerColor;
  senderName: string;
  textOrEmoji: string;
  timestamp: number;
}

export interface ThemeConfig {
  id: string;
  name: string;
  price: number;
  unlocked: boolean;
  bgGradient: string;
  boardBg: string;
  cellBorder: string;
  yardBg: Record<PlayerColor, string>;
  trackCellBg: string;
  safeCellBg: string;
  starColor: string;
  homeTriangle: Record<PlayerColor, string>;
  diceBg: string;
  tokenGlow: Record<PlayerColor, string>;
}

export interface DiceSkin {
  id: string;
  name: string;
  price: number;
  unlocked: boolean;
  primaryColor: string;
  dotColor: string;
  edgeGlow: string;
}

export interface TokenSkin {
  id: string;
  name: string;
  price: number;
  unlocked: boolean;
  style: 'classic' | 'neon_orb' | 'crystal' | 'royal_pawn' | 'cyber_drone';
}

export interface UserStats {
  gamesPlayed: number;
  gamesWon: number;
  classicWins: number;
  quickWins: number;
  teamWins: number;
  tournamentWins: number;
  tokensCaptured: number;
  tokensHome: number;
  bestWinStreak: number;
  currentWinStreak: number;
  totalXp: number;
  coins: number;
  level: number;
}

export interface MatchHistoryItem {
  id: string;
  mode: GameMode;
  date: string;
  durationSeconds: number;
  players: { name: string; color: PlayerColor; rank?: number }[];
  result: 'won' | 'lost';
  rank: number;
  xpEarned: number;
  coinsEarned: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  progress: number;
  maxProgress: number;
  unlocked: boolean;
  rewardCoins: number;
  rewardXp: number;
  claimed: boolean;
}

export interface Mission {
  id: string;
  title: string;
  description: string;
  type: 'daily' | 'weekly';
  progress: number;
  target: number;
  completed: boolean;
  rewardCoins: number;
  rewardXp: number;
  claimed: boolean;
}

export interface TournamentMatch {
  id: string;
  round: 'quarters' | 'semis' | 'final';
  roundName: string;
  playerIds: string[];
  winnerId?: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface TournamentData {
  id: string;
  title: string;
  entryFee: number;
  prizePool: number;
  currentRound: 'quarters' | 'semis' | 'final';
  matches: TournamentMatch[];
  isUserEliminated: boolean;
  isUserWinner: boolean;
}
