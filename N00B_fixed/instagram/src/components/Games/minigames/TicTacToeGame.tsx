import React, { useEffect, useState } from 'react';
import { loadGameSnapshot, saveGameSnapshot, clearGameSnapshot } from '../../../utils/pageResume';
import { Bot, User as UserIcon, Users } from 'lucide-react';

interface TicTacToeGameProps {
  // The signed-in account's id: when given, the game keeps its progress so a refresh / reopened app resumes it (utils/pageResume.ts).
  resumeUserId?: string;
  onGameOver: (result: 'win' | 'tie' | 'loss', finalScore: number) => void;
  opponentName?: string;
  // false = Pass and Play: the second tap on the board is a real human
  // move (O), not an AI response. Defaults to true (vs Bot).
  vsBot?: boolean;
  // How many games this account has played — ramps the bot from "makes
  // mistakes often" toward "plays perfectly" as the player gets more
  // experienced, same idea as ChessGame's difficulty ramp. Defaults to a
  // large number (full strength) so any caller that doesn't pass it keeps
  // today's fixed 15% mistake rate.
  gamesPlayedCount?: number;
  // User-picked strength from the difficulty-select screen. Overrides the
  // experience ramp above when given — easy/hard are blunter than the ramp
  // ever gets, so a player can jump straight to either end.
  difficulty?: 'easy' | 'normal' | 'hard';
}

function imperfectChanceForExperience(gamesPlayedCount: number): number {
  if (gamesPlayedCount < 5) return 0.4;
  if (gamesPlayedCount < 15) return 0.25;
  if (gamesPlayedCount < 30) return 0.15;
  return 0.05;
}

const IMPERFECT_CHANCE_BY_DIFFICULTY: Record<'easy' | 'normal' | 'hard', number> = {
  easy: 0.55,
  normal: 0.2,
  hard: 0
};

type Cell = 'X' | 'O' | null;

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

function checkWinner(b: Cell[]): { winner: 'X' | 'O' | 'Tie'; line: number[] | null } | null {
  for (const [x, y, z] of LINES) {
    if (b[x] && b[x] === b[y] && b[x] === b[z]) {
      return { winner: b[x] as 'X' | 'O', line: [x, y, z] };
    }
  }
  if (b.every((cell) => cell !== null)) {
    return { winner: 'Tie', line: null };
  }
  return null;
}

// Perfect-play minimax for a 9-cell board — trivial search space, solves instantly.
function minimax(board: Cell[], player: 'X' | 'O'): { score: number; index: number } {
  const opponent = player === 'X' ? 'O' : 'X';
  const result = checkWinner(board);
  if (result) {
    if (result.winner === 'Tie') return { score: 0, index: -1 };
    return { score: result.winner === player ? 10 : -10, index: -1 };
  }

  let best = { score: -Infinity, index: -1 };
  for (let i = 0; i < 9; i++) {
    if (board[i]) continue;
    const next = [...board];
    next[i] = player;
    const { score } = minimax(next, opponent);
    const flipped = -score;
    if (flipped > best.score) {
      best = { score: flipped, index: i };
    }
  }
  return best;
}

// Picks the bot's move. `imperfectChance` occasionally swaps the perfect
// move for a random legal one, so the bot is beatable sometimes rather
// than a guaranteed unbeatable wall every single game.
function pickBotMove(board: Cell[], symbol: 'X' | 'O', imperfectChance: number): number {
  const empty = board.map((v, i) => (v === null ? i : -1)).filter((i) => i !== -1);
  if (Math.random() < imperfectChance) {
    return empty[Math.floor(Math.random() * empty.length)];
  }
  const { index } = minimax(board, symbol);
  return index !== -1 ? index : empty[Math.floor(Math.random() * empty.length)];
}

export const TicTacToeGame: React.FC<TicTacToeGameProps> = ({
  onGameOver,
  opponentName = 'AI Bot',
  vsBot = true,
  gamesPlayedCount = 9999,
  difficulty,
  resumeUserId
}) => {
  const imperfectChance = difficulty
    ? IMPERFECT_CHANCE_BY_DIFFICULTY[difficulty]
    : imperfectChanceForExperience(gamesPlayedCount);
  // A refresh / reopened app puts the board back as it was (see utils/pageResume.ts).
  const [snap] = useState(() => loadGameSnapshot<{ board: Cell[]; currentTurn: 'X' | 'O' }>(resumeUserId, 'tictactoe'));
  const [board, setBoard] = useState<Cell[]>(snap?.board ?? Array(9).fill(null));
  const [currentTurn, setCurrentTurn] = useState<'X' | 'O'>(snap?.currentTurn ?? 'X');
  const [winner, setWinner] = useState<'X' | 'O' | 'Tie' | null>(null);
  const [winningLine, setWinningLine] = useState<number[] | null>(null);

  useEffect(() => {
    if (!resumeUserId) return;
    if (winner) clearGameSnapshot(resumeUserId, 'tictactoe');
    else saveGameSnapshot(resumeUserId, 'tictactoe', { board, currentTurn });
  }, [board, currentTurn, winner]);

  // The bot's move after the human's (also used when the app was closed in the middle of the bot's turn).
  const playBotTurn = (fromBoard: Cell[]) => {
    setTimeout(() => {
      const botIndex = pickBotMove(fromBoard, 'O', imperfectChance);
      const afterBot = [...fromBoard];
      afterBot[botIndex] = 'O';
      setBoard(afterBot);

      const botResult = checkWinner(afterBot);
      if (botResult) {
        setWinner(botResult.winner);
        setWinningLine(botResult.line);
        setTimeout(() => {
          onGameOver(botResult.winner === 'Tie' ? 'tie' : 'loss', botResult.winner === 'Tie' ? 50 : 0);
        }, 700);
      } else {
        setCurrentTurn('X');
      }
    }, 450);
  };
  useEffect(() => {
    if (snap && vsBot && snap.currentTurn === 'O' && !winner) playBotTurn(snap.board);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCellClick = (index: number) => {
    if (board[index] || winner) return;
    if (vsBot && currentTurn === 'O') return; // bot's turn, ignore taps

    const newBoard = [...board];
    newBoard[index] = currentTurn;
    setBoard(newBoard);

    const result = checkWinner(newBoard);
    if (result) {
      setWinner(result.winner);
      setWinningLine(result.line);
      setTimeout(() => {
        // X is always "the account" — whether O is the bot or a second
        // human passing the device — so this reports the real result
        // either way. Pass and Play used to always report 'win' here
        // regardless of who actually won; GamePlayModal now also sends
        // this straight to the match result instead of treating it as one
        // round of a two-round relay.
        if (result.winner === 'Tie') {
          onGameOver('tie', 50);
        } else {
          onGameOver(result.winner === 'X' ? 'win' : 'loss', result.winner === 'X' ? 100 : 0);
        }
      }, 700);
      return;
    }

    const nextTurn = currentTurn === 'X' ? 'O' : 'X';
    setCurrentTurn(nextTurn);

    if (vsBot && nextTurn === 'O') playBotTurn(newBoard);
  };

  const opponentLabel = vsBot ? opponentName : 'Player 2';

  return (
    <div className="flex flex-col items-center justify-center p-3 w-full max-w-sm mx-auto">
      {/* Player Turn Indicator */}
      <div className="flex items-center justify-between w-full mb-4 px-3 py-2 bg-zinc-900 rounded-xl border border-zinc-800">
        <div className={`flex items-center gap-1.5 text-xs font-bold ${currentTurn === 'X' ? 'text-noob' : 'text-zinc-500'}`}>
          <UserIcon className="w-3.5 h-3.5" />
          <span>{vsBot ? 'You' : 'Player 1'} (X)</span>
        </div>
        <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">VS</span>
        <div className={`flex items-center gap-1.5 text-xs font-bold ${currentTurn === 'O' ? 'text-pink-400' : 'text-zinc-500'}`}>
          {vsBot ? <Bot className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
          <span>{opponentLabel} (O)</span>
        </div>
      </div>

      {/* 3x3 Grid */}
      <div className="grid grid-cols-3 gap-2.5 p-3 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-xl w-64 h-64 sm:w-72 sm:h-72">
        {board.map((cell, idx) => {
          const isWinningCell = winningLine?.includes(idx);
          return (
            <button
              key={idx}
              onClick={() => handleCellClick(idx)}
              disabled={!!cell || !!winner || (vsBot && currentTurn === 'O')}
              className={`rounded-xl flex items-center justify-center font-black text-3xl transition-all cursor-pointer ${
                cell === 'X'
                  ? isWinningCell
                    ? 'bg-noob text-black shadow-[0_0_15px_#d97757]'
                    : 'bg-zinc-900 text-noob border border-noob/30'
                  : cell === 'O'
                  ? isWinningCell
                    ? 'bg-pink-500 text-white shadow-[0_0_15px_#ec4899]'
                    : 'bg-zinc-900 text-pink-400 border border-pink-500/30'
                  : 'bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800/60 text-zinc-600'
              }`}
            >
              {cell}
            </button>
          );
        })}
      </div>

      {/* Status banner */}
      <div className="mt-4 text-center">
        {winner ? (
          <p className="text-sm font-black text-white animate-bounce">
            {winner === 'Tie'
              ? "🤝 It's a Tie!"
              : vsBot
              ? winner === 'X'
                ? '🎉 You Won!'
                : '🤖 Bot Won!'
              : `🎉 Player ${winner === 'X' ? '1' : '2'} Won!`}
          </p>
        ) : (
          <p className="text-xs text-zinc-400">
            {vsBot
              ? currentTurn === 'X'
                ? '👉 Your turn to place an X'
                : `⏳ ${opponentName} is thinking...`
              : `👉 Player ${currentTurn === 'X' ? '1' : '2'}'s turn to place ${currentTurn === 'X' ? 'an X' : 'an O'}`}
          </p>
        )}
      </div>
    </div>
  );
};
