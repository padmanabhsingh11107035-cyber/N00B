import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Chess, Square } from 'chess.js';
import { Bot, User as UserIcon, Users, Crown } from 'lucide-react';

interface ChessGameProps {
  onGameOver: (result: 'win' | 'tie' | 'loss', finalScore: number) => void;
  // false = Pass and Play: both sides are human, alternating on this device.
  vsBot?: boolean;
}

// Unicode's "white" chess characters (U+2654-2659) are drawn as hollow
// outline glyphs by convention — meant to be black ink on white paper, not
// an actually-solid piece. Using them for the white side renders as a thin
// outline no matter what CSS color is applied. Both sides use the "black"
// (solid-filled) code points instead, and the actual piece color is done
// entirely via CSS fill/stroke below, so both render as clean solid pieces.
const PIECE_UNICODE: Record<string, string> = {
  wp: '♟', wn: '♞', wb: '♝', wr: '♜', wq: '♛', wk: '♚',
  bp: '♟', bn: '♞', bb: '♝', br: '♜', bq: '♛', bk: '♚'
};

const PIECE_VALUES: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

const BOT_DEPTH = 3;
const MATE_SCORE = 100000;

function evaluateBoard(chess: Chess): number {
  if (chess.isCheckmate()) {
    // Side to move is checkmated — bad for that side.
    return chess.turn() === 'w' ? -MATE_SCORE : MATE_SCORE;
  }
  if (chess.isDraw() || chess.isStalemate() || chess.isThreefoldRepetition() || chess.isInsufficientMaterial()) {
    return 0;
  }
  let score = 0;
  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq) continue;
      const value = PIECE_VALUES[sq.type];
      score += sq.color === 'w' ? value : -value;
    }
  }
  return score;
}

function negamax(chess: Chess, depth: number, alpha: number, beta: number, color: 1 | -1): number {
  if (depth === 0 || chess.isGameOver()) {
    return color * evaluateBoard(chess);
  }
  const moves = chess.moves();
  let best = -Infinity;
  for (const move of moves) {
    chess.move(move);
    const score = -negamax(chess, depth - 1, -beta, -alpha, color === 1 ? -1 : 1);
    chess.undo();
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Picks the strongest move it can find via depth-limited negamax + alpha-beta.
// No randomness/weakening here on purpose — chess is meant to stay very hard.
function findBestMove(chess: Chess): string {
  const moves = shuffle(chess.moves());
  const color = chess.turn() === 'w' ? 1 : -1;
  let bestMove = moves[0];
  let bestValue = -Infinity;
  for (const move of moves) {
    chess.move(move);
    const value = -negamax(chess, BOT_DEPTH - 1, -Infinity, Infinity, color === 1 ? -1 : 1);
    chess.undo();
    if (value > bestValue) {
      bestValue = value;
      bestMove = move;
    }
  }
  return bestMove;
}

export const ChessGame: React.FC<ChessGameProps> = ({ onGameOver, vsBot = true }) => {
  const chessRef = useRef(new Chess());
  const [, forceRender] = useState(0);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [isBotThinking, setIsBotThinking] = useState(false);
  const [gameOverText, setGameOverText] = useState<string | null>(null);
  const hasReportedResult = useRef(false);

  const chess = chessRef.current;
  const rerender = () => forceRender((n) => n + 1);

  const legalDestinations = useMemo(() => {
    if (!selectedSquare) return [];
    return chess.moves({ square: selectedSquare, verbose: true }).map((m) => m.to);
  }, [selectedSquare, chess]);

  const reportGameOver = (turnLabel: string) => {
    if (hasReportedResult.current) return;
    hasReportedResult.current = true;

    if (chess.isCheckmate()) {
      // The side whose turn it is has been checkmated.
      const winnerIsWhite = chess.turn() === 'b';
      if (!vsBot) {
        setGameOverText(`Checkmate! ${winnerIsWhite ? 'Player 1 (White)' : 'Player 2 (Black)'} wins!`);
        setTimeout(() => onGameOver('win', 100), 1200);
      } else if (winnerIsWhite) {
        setGameOverText('Checkmate! You win!');
        setTimeout(() => onGameOver('win', 50000000), 1200);
      } else {
        setGameOverText('Checkmate! The bot wins.');
        setTimeout(() => onGameOver('loss', 0), 1200);
      }
    } else {
      setGameOverText("It's a draw.");
      setTimeout(() => onGameOver('tie', vsBot ? 50 : 100), 1200);
    }
  };

  const makeBotMove = () => {
    setIsBotThinking(true);
    setTimeout(() => {
      const move = findBestMove(chess);
      chess.move(move);
      rerender();
      setIsBotThinking(false);
      if (chess.isGameOver()) {
        reportGameOver('bot');
      }
    }, 300);
  };

  const handleSquareClick = (square: Square) => {
    if (gameOverText || isBotThinking) return;
    if (vsBot && chess.turn() === 'b') return; // bot's turn

    const piece = chess.get(square);

    if (selectedSquare) {
      if (legalDestinations.includes(square)) {
        chess.move({ from: selectedSquare, to: square, promotion: 'q' });
        setSelectedSquare(null);
        rerender();

        if (chess.isGameOver()) {
          reportGameOver('player');
          return;
        }
        if (vsBot) {
          makeBotMove();
        }
        return;
      }
      // Clicking another own piece re-selects instead of moving
      if (piece && piece.color === chess.turn()) {
        setSelectedSquare(square);
      } else {
        setSelectedSquare(null);
      }
      return;
    }

    if (piece && piece.color === chess.turn()) {
      setSelectedSquare(square);
    }
  };

  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const ranks = [8, 7, 6, 5, 4, 3, 2, 1];

  const turnLabel = vsBot
    ? chess.turn() === 'w'
      ? 'Your move (White)'
      : 'Bot is thinking...'
    : `Player ${chess.turn() === 'w' ? '1' : '2'}'s move (${chess.turn() === 'w' ? 'White' : 'Black'})`;

  return (
    <div className="flex flex-col items-center justify-center p-3 w-full max-w-sm mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between w-full mb-3 px-3 py-2 bg-zinc-900 rounded-xl border border-zinc-800">
        <div className={`flex items-center gap-1.5 text-xs font-bold ${chess.turn() === 'w' ? 'text-[#00FF66]' : 'text-zinc-500'}`}>
          <UserIcon className="w-3.5 h-3.5" />
          <span>{vsBot ? 'You' : 'Player 1'} (White)</span>
        </div>
        <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">VS</span>
        <div className={`flex items-center gap-1.5 text-xs font-bold ${chess.turn() === 'b' ? 'text-pink-400' : 'text-zinc-500'}`}>
          {vsBot ? <Bot className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
          <span>{vsBot ? 'Grandmaster Bot' : 'Player 2'} (Black)</span>
        </div>
      </div>

      {vsBot && (
        <div className="w-full mb-3 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-bold text-center flex items-center justify-center gap-1.5">
          <Crown className="w-3.5 h-3.5" /> Win: +50,000,000 NOOBs &nbsp;•&nbsp; Lose: your balance resets to 0
        </div>
      )}

      {/* Board */}
      <div className="grid grid-cols-8 border-2 border-zinc-800 rounded-lg overflow-hidden shadow-xl w-full aspect-square max-w-[340px]">
        {ranks.map((rank) =>
          files.map((file) => {
            const square = `${file}${rank}` as Square;
            const piece = chess.get(square);
            const isDark = (files.indexOf(file) + rank) % 2 === 0;
            const isSelected = selectedSquare === square;
            const isLegalTarget = legalDestinations.includes(square);
            const key = PIECE_UNICODE[piece ? `${piece.color}${piece.type}` : ''];

            return (
              <button
                key={square}
                onClick={() => handleSquareClick(square)}
                className={`relative flex items-center justify-center aspect-square text-3xl sm:text-4xl cursor-pointer ${
                  isDark ? 'bg-black' : 'bg-white'
                } ${isSelected ? 'ring-2 ring-inset ring-[#00FF66]' : ''}`}
              >
                {piece && (
                  // A piece needs to read clearly on BOTH a black and a white
                  // square, so its own color alone isn't enough contrast — a
                  // black piece would vanish entirely on a black square
                  // without a light outline (and likewise white-on-white).
                  <span
                    style={{
                      fontFamily: '"Noto Sans Symbols 2", sans-serif',
                      WebkitTextStroke: piece.color === 'w' ? '1.5px black' : '1.5px white',
                      color: piece.color === 'w' ? '#ffffff' : '#000000'
                    }}
                  >
                    {key}
                  </span>
                )}
                {isLegalTarget && (
                  <span className={`absolute w-3 h-3 rounded-full ${piece ? 'ring-2 ring-[#00FF66] w-full h-full rounded-none' : 'bg-[#00FF66]/70'}`} />
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Status */}
      <div className="mt-4 text-center min-h-[24px]">
        {gameOverText ? (
          <p className="text-sm font-black text-white animate-bounce">{gameOverText}</p>
        ) : (
          <p className="text-xs text-zinc-400">
            {chess.inCheck() ? '⚠️ Check! ' : ''}
            {turnLabel}
          </p>
        )}
      </div>
    </div>
  );
};
