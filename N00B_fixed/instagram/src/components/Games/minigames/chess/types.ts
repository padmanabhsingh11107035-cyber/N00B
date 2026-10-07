export type PieceColor = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export type GameMode = 'local_2p' | 'vs_ai' | 'online';
export type AIDifficulty = 'easy' | 'medium' | 'hard';

export type GameStatus =
  | 'idle'
  | 'in_progress'
  | 'checkmate'
  | 'stalemate'
  | 'draw'
  | 'resigned'
  | 'timeout';

export interface TimeControlPreset {
  id: string;
  label: string;
  initialSeconds: number; // 0 for no timer
  incrementSeconds: number;
}

export const TIME_PRESETS: TimeControlPreset[] = [
  { id: 'no_timer', label: 'No Timer', initialSeconds: 0, incrementSeconds: 0 },
  { id: '1+0', label: '1 + 0', initialSeconds: 60, incrementSeconds: 0 },
  { id: '3+0', label: '3 + 0', initialSeconds: 180, incrementSeconds: 0 },
  { id: '3+2', label: '3 + 2', initialSeconds: 180, incrementSeconds: 2 },
  { id: '5+0', label: '5 + 0', initialSeconds: 300, incrementSeconds: 0 },
  { id: '5+3', label: '5 + 3', initialSeconds: 300, incrementSeconds: 3 },
  { id: '10+0', label: '10 + 0', initialSeconds: 600, incrementSeconds: 0 },
  { id: '10+5', label: '10 + 5', initialSeconds: 600, incrementSeconds: 5 },
  { id: '15+10', label: '15 + 10', initialSeconds: 900, incrementSeconds: 10 },
];

export interface PlayerInfo {
  id: string;
  username: string;
  profilePicture?: string;
}

export interface MoveRecord {
  san: string;
  from: string;
  to: string;
  color: PieceColor;
  piece: PieceType;
  captured?: PieceType;
  promotion?: PieceType;
  fenAfter: string;
  timestamp: number;
}

export interface ChessGameState {
  board: (PieceInfo | null)[][];
  currentPlayer: PieceColor;
  moveHistory: MoveRecord[];
  whitePlayer: PlayerInfo;
  blackPlayer: PlayerInfo;
  whiteTime: number; // in milliseconds
  blackTime: number; // in milliseconds
  gameStatus: GameStatus;
  winner: PieceColor | 'draw' | null;
  drawReason?: string;
  selectedSquare: string | null;
  legalMoves: { from: string; to: string; promotion?: string }[];
}

export interface PieceInfo {
  type: PieceType;
  color: PieceColor;
}

export type BoardPaletteId =
  | 'midnight'
  | 'forest'
  | 'classic_wood'
  | 'noob_neon'
  | 'ocean'
  | 'cyber';

export type PieceStyleId = 'classic' | 'modern' | 'minimal' | 'neon' | 'wood';

export interface BoardPalette {
  id: BoardPaletteId;
  name: string;
  lightSquare: string;
  darkSquare: string;
  highlightLastMove: string;
  highlightSelected: string;
  highlightCheck: string;
  labelColorLight: string;
  labelColorDark: string;
}

export interface PieceStyle {
  id: PieceStyleId;
  name: string;
}

export interface ChessGameProps {
  userId?: string;
  username?: string;
  profilePicture?: string;
  onBack?: () => void;
  onChallengeFriend?: (userId?: string) => void;
  onShareResult?: (result: { winner: string; reason: string; movesCount: number }) => void;
}
