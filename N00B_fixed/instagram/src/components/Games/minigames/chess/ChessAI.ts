import { Chess, Square, Move } from 'chess.js';
import { AIDifficulty, PieceColor } from './types';

// Standard piece weights in centipawns
const PIECE_VALS: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

// Piece Square Tables (PST) for positional awareness
const PAWN_PST = [
  0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5,  5, 10, 25, 25, 10,  5,  5,
  0,  0,  0, 20, 20,  0,  0,  0,
  5, -5,-10,  0,  0,-10, -5,  5,
  5, 10, 10,-20,-20, 10, 10,  5,
  0,  0,  0,  0,  0,  0,  0,  0,
];

const KNIGHT_PST = [
 -50,-40,-30,-30,-30,-30,-40,-50,
 -40,-20,  0,  0,  0,  0,-20,-40,
 -30,  0, 10, 15, 15, 10,  0,-30,
 -30,  5, 15, 20, 20, 15,  5,-30,
 -30,  0, 15, 20, 20, 15,  0,-30,
 -30,  5, 10, 15, 15, 10,  5,-30,
 -40,-20,  0,  5,  5,  0,-20,-40,
 -50,-40,-30,-30,-30,-30,-40,-50,
];

function getSquareIndex(square: Square, color: PieceColor): number {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = parseInt(square[1], 10) - 1;
  return color === 'w' ? (7 - rank) * 8 + file : rank * 8 + file;
}

function evaluateBoard(chess: Chess): number {
  if (chess.isCheckmate()) {
    return chess.turn() === 'w' ? -999999 : 999999;
  }
  if (chess.isDraw() || chess.isStalemate()) {
    return 0;
  }

  let score = 0;
  const board = chess.board();

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;

      const square = `${String.fromCharCode('a'.charCodeAt(0) + c)}${8 - r}` as Square;
      const baseVal = PIECE_VALS[piece.type] || 0;
      let posVal = 0;

      if (piece.type === 'p') {
        posVal = PAWN_PST[getSquareIndex(square, piece.color as PieceColor)];
      } else if (piece.type === 'n') {
        posVal = KNIGHT_PST[getSquareIndex(square, piece.color as PieceColor)];
      }

      const total = baseVal + posVal;
      score += piece.color === 'w' ? total : -total;
    }
  }

  return score;
}

function minimax(
  chess: Chess,
  depth: number,
  alpha: number,
  beta: number,
  isMaximizing: boolean
): number {
  if (depth === 0 || chess.isGameOver()) {
    return evaluateBoard(chess);
  }

  const moves = chess.moves({ verbose: true });
  moves.sort((a, b) => {
    const valA = a.captured ? PIECE_VALS[a.captured] || 0 : 0;
    const valB = b.captured ? PIECE_VALS[b.captured] || 0 : 0;
    return valB - valA;
  });

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      chess.move(move);
      const evalScore = minimax(chess, depth - 1, alpha, beta, false);
      chess.undo();
      maxEval = Math.max(maxEval, evalScore);
      alpha = Math.max(alpha, evalScore);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      chess.move(move);
      const evalScore = minimax(chess, depth - 1, alpha, beta, true);
      chess.undo();
      minEval = Math.min(minEval, evalScore);
      beta = Math.min(beta, evalScore);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

export function computeAiMove(fen: string, difficulty: AIDifficulty): Move | null {
  const chess = new Chess(fen);
  const legalMoves = chess.moves({ verbose: true });
  if (legalMoves.length === 0) return null;

  const aiColor = chess.turn() as PieceColor;
  const isMaximizing = aiColor === 'w';

  // 1. Easy: Depth 1 material evaluator + intentional 35% casual moves
  if (difficulty === 'easy') {
    if (Math.random() < 0.35) {
      return legalMoves[Math.floor(Math.random() * legalMoves.length)];
    }
    let bestScore = isMaximizing ? -Infinity : Infinity;
    let candidates: Move[] = [];

    for (const move of legalMoves) {
      chess.move(move);
      const score = evaluateBoard(chess);
      chess.undo();

      if (isMaximizing) {
        if (score > bestScore) {
          bestScore = score;
          candidates = [move];
        } else if (score === bestScore) {
          candidates.push(move);
        }
      } else {
        if (score < bestScore) {
          bestScore = score;
          candidates = [move];
        } else if (score === bestScore) {
          candidates.push(move);
        }
      }
    }
    return candidates[Math.floor(Math.random() * candidates.length)] || legalMoves[0];
  }

  // 2. Medium: Depth 2 minimax with PST
  if (difficulty === 'medium') {
    let bestScore = isMaximizing ? -Infinity : Infinity;
    let candidates: Move[] = [];

    for (const move of legalMoves) {
      chess.move(move);
      const score = minimax(chess, 1, -Infinity, Infinity, !isMaximizing);
      chess.undo();

      if (isMaximizing) {
        if (score > bestScore) {
          bestScore = score;
          candidates = [move];
        } else if (Math.abs(score - bestScore) < 20) {
          candidates.push(move);
        }
      } else {
        if (score < bestScore) {
          bestScore = score;
          candidates = [move];
        } else if (Math.abs(score - bestScore) < 20) {
          candidates.push(move);
        }
      }
    }
    return candidates[Math.floor(Math.random() * candidates.length)] || legalMoves[0];
  }

  // 3. Hard: Depth 3 Minimax with Alpha-Beta Pruning
  let bestScore = isMaximizing ? -Infinity : Infinity;
  let bestMove: Move = legalMoves[0];

  legalMoves.sort((a, b) => {
    const valA = a.captured ? PIECE_VALS[a.captured] || 0 : 0;
    const valB = b.captured ? PIECE_VALS[b.captured] || 0 : 0;
    return valB - valA;
  });

  for (const move of legalMoves) {
    chess.move(move);
    const score = minimax(chess, 2, -Infinity, Infinity, !isMaximizing);
    chess.undo();

    if (isMaximizing) {
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    } else {
      if (score < bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }
  }

  return bestMove;
}
