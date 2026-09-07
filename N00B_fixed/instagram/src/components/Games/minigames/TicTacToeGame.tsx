import React, { useState } from 'react';
import { RefreshCw, Bot, User as UserIcon } from 'lucide-react';

interface TicTacToeGameProps {
  onGameOver: (result: 'win' | 'tie' | 'loss', finalScore: number) => void;
  opponentName?: string;
}

export const TicTacToeGame: React.FC<TicTacToeGameProps> = ({
  onGameOver,
  opponentName = 'AI Bot'
}) => {
  const [board, setBoard] = useState<(string | null)[]>(Array(9).fill(null));
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [winner, setWinner] = useState<string | null>(null);
  const [winningLine, setWinningLine] = useState<number[] | null>(null);

  const checkWinner = (b: (string | null)[]) => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ];

    for (const [x, y, z] of lines) {
      if (b[x] && b[x] === b[y] && b[x] === b[z]) {
        return { winner: b[x], line: [x, y, z] };
      }
    }

    if (b.every((cell) => cell !== null)) {
      return { winner: 'Tie', line: null };
    }

    return null;
  };

  const handleCellClick = (index: number) => {
    if (board[index] || !isPlayerTurn || winner) return;

    const newBoard = [...board];
    newBoard[index] = 'X';

    const winResult = checkWinner(newBoard);
    if (winResult) {
      setBoard(newBoard);
      setWinner(winResult.winner);
      setWinningLine(winResult.line);
      setTimeout(() => {
        onGameOver(winResult.winner === 'X' ? 'win' : 'tie', 100);
      }, 700);
      return;
    }

    setBoard(newBoard);
    setIsPlayerTurn(false);

    // Bot move
    setTimeout(() => {
      const emptyIndices = newBoard.map((v, i) => (v === null ? i : null)).filter((v) => v !== null) as number[];
      if (emptyIndices.length > 0) {
        // Smart move or random
        const botIndex = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
        newBoard[botIndex] = 'O';

        const botWinResult = checkWinner(newBoard);
        setBoard(newBoard);
        setIsPlayerTurn(true);

        if (botWinResult) {
          setWinner(botWinResult.winner);
          setWinningLine(botWinResult.line);
          setTimeout(() => {
            onGameOver(botWinResult.winner === 'O' ? 'loss' : 'tie', 50);
          }, 700);
        }
      }
    }, 400);
  };

  return (
    <div className="flex flex-col items-center justify-center p-3 w-full max-w-sm mx-auto">
      {/* Player Turn Indicator */}
      <div className="flex items-center justify-between w-full mb-4 px-3 py-2 bg-zinc-900 rounded-xl border border-zinc-800">
        <div className={`flex items-center gap-1.5 text-xs font-bold ${isPlayerTurn ? 'text-[#00FF66]' : 'text-zinc-500'}`}>
          <UserIcon className="w-3.5 h-3.5" />
          <span>You (X)</span>
        </div>
        <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">VS</span>
        <div className={`flex items-center gap-1.5 text-xs font-bold ${!isPlayerTurn ? 'text-pink-400' : 'text-zinc-500'}`}>
          <Bot className="w-3.5 h-3.5" />
          <span>{opponentName} (O)</span>
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
              disabled={!!cell || !isPlayerTurn || !!winner}
              className={`rounded-xl flex items-center justify-center font-black text-3xl transition-all cursor-pointer ${
                cell === 'X'
                  ? isWinningCell
                    ? 'bg-[#00FF66] text-black shadow-[0_0_15px_#00FF66]'
                    : 'bg-zinc-900 text-[#00FF66] border border-[#00FF66]/30'
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
            {winner === 'X' ? '🎉 You Won!' : winner === 'O' ? '🤖 Bot Won!' : '🤝 It\'s a Tie!'}
          </p>
        ) : (
          <p className="text-xs text-zinc-400">
            {isPlayerTurn ? '👉 Your turn to place an X' : `⏳ ${opponentName} is thinking...`}
          </p>
        )}
      </div>
    </div>
  );
};
