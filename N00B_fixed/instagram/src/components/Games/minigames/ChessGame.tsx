import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Chess, Square } from 'chess.js';
import { Bot, User as UserIcon, Users, Crown } from 'lucide-react';

interface ChessGameProps {
  onGameOver: (result: 'win' | 'tie' | 'loss', finalScore: number) => void;
  // false = Pass and Play: both sides are human, alternating on this device.
  vsBot?: boolean;
}

// Hand-drawn piece silhouettes, one small set of SVG primitives per piece
// type (viewBox "0 0 45 45"), shared by both colors — actual color is
// applied purely via fill/stroke on the wrapping <g> where these render.
// Font-based Unicode chess glyphs varied wildly in clarity across
// browsers/OSes, and some (the knight especially) barely read as their
// piece at a glance — these real shapes read clearly and consistently
// everywhere, and were checked visually before being wired in here.
const PIECE_SVG: Record<string, React.ReactNode> = {
  p: (
    <>
      <circle cx="22.5" cy="12" r="6.5" />
      <path d="M17 21 L28 21 L32.5 34 L12.5 34 Z" />
      <rect x="10" y="34" width="25" height="5" rx="1.5" />
    </>
  ),
  r: (
    <>
      <path d="M9 36 L9 15 L12 15 L12 10 L17 10 L17 13 L21 13 L21 10 L24 10 L24 13 L28 13 L28 10 L33 10 L33 15 L36 15 L36 36 Z" />
      <rect x="9" y="36" width="27" height="4" rx="1" />
    </>
  ),
  b: (
    <>
      <circle cx="22.5" cy="8" r="2.5" />
      <path d="M22.5 12 C15 16 13 24 15 30 C11 32 10 34 10 36 L35 36 C35 34 34 32 30 30 C32 24 30 16 22.5 12 Z" />
      <ellipse cx="22.5" cy="21" rx="7" ry="1.6" transform="rotate(-25 22.5 21)" />
      <rect x="9" y="36" width="27" height="4" rx="1" />
    </>
  ),
  n: (
    <>
      <path d="M11 36 L11 29 C9.5 27 8 25 5 22 L10 19 C10.5 16.5 11 13 14 9 L16 4 L20 9 C24 10 27 12.5 29 16 C31.5 19 32.5 22 32 24 C34 25.5 35 28 35 32 L35 36 Z" />
      {/* Eye/mouth must read as the OPPOSITE of the piece's own color no
          matter which color the piece is — currentColor here picks up the
          `color` set on the wrapping <g> at render time, independent of the
          body's fill/stroke above. */}
      <circle cx="13" cy="17" r="1.4" fill="currentColor" stroke="none" />
      <path d="M6.5 23 L9 24.5" fill="none" stroke="currentColor" strokeWidth={1} />
    </>
  ),
  q: (
    <>
      <circle cx="9" cy="10" r="2.3" /><circle cx="17" cy="7" r="2.3" /><circle cx="22.5" cy="6" r="2.3" /><circle cx="28" cy="7" r="2.3" /><circle cx="36" cy="10" r="2.3" />
      <path d="M9 12 L36 12 L33 26 C34 28 34.5 30 34 32 C32 34 30 30 22.5 30 C15 30 13 34 11 32 C10.5 30 11 28 12 26 Z" />
      <path d="M11 32 L34 32 L34 36 L11 36 Z" />
      <rect x="9" y="36" width="27" height="4" rx="1" />
    </>
  ),
  k: (
    <>
      <path d="M22.5 4 L22.5 12 M18.5 8 L26.5 8" fill="none" strokeWidth={2.5} />
      <path d="M12 16 L33 16 L30 28 C32 30 32.5 32 32 34 C29 36 27 32 22.5 32 C18 32 16 36 13 34 C12.5 32 13 30 15 28 Z" />
      <path d="M11 34 L34 34 L34 36 L11 36 Z" />
      <rect x="9" y="36" width="27" height="4" rx="1" />
    </>
  )
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

            return (
              <button
                key={square}
                onClick={() => handleSquareClick(square)}
                className={`relative flex items-center justify-center aspect-square cursor-pointer ${
                  isDark ? 'bg-black' : 'bg-white'
                } ${isSelected ? 'ring-2 ring-inset ring-[#00FF66]' : ''}`}
              >
                {piece && (
                  // A piece needs to read clearly on BOTH a black and a white
                  // square, so its own color alone isn't enough contrast — a
                  // black piece would vanish entirely on a black square
                  // without a light outline (and likewise white-on-white).
                  <svg
                    viewBox="0 0 45 45"
                    className="w-[75%] h-[75%]"
                    style={{
                      fill: piece.color === 'w' ? '#ffffff' : '#101010',
                      stroke: piece.color === 'w' ? '#000000' : '#ffffff',
                      strokeWidth: 1.5,
                      strokeLinejoin: 'round'
                    }}
                  >
                    {/* `color` here only feeds the knight's eye/mouth via
                        currentColor — it never touches the body's own
                        fill/stroke, which come from the <svg> above. */}
                    <g style={{ color: piece.color === 'w' ? '#000000' : '#ffffff' }}>
                      {PIECE_SVG[piece.type]}
                    </g>
                  </svg>
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
