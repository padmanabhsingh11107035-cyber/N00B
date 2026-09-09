import React, { useEffect, useRef, useState } from 'react';
import { Bot, User as UserIcon, Dices } from 'lucide-react';

interface SnakesAndLaddersGameProps {
  onGameOver: (result: 'win' | 'tie' | 'loss', finalScore: number) => void;
}

const PLAYER_COLORS = ['#00FF66', '#ec4899', '#38bdf8', '#f59e0b', '#a78bfa', '#f43f5e', '#2dd4bf', '#fb923c'];

// Classic-style snakes (head -> tail) and ladders (bottom -> top).
const SNAKES: Record<number, number> = { 98: 78, 95: 56, 93: 73, 87: 24, 64: 60, 62: 19, 56: 53, 49: 11, 47: 26, 16: 6 };
const LADDERS: Record<number, number> = { 2: 38, 7: 14, 8: 31, 15: 26, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 78: 98 };

// Boustrophedon numbering for a 10x10 board, row 0 = bottom.
function getGridCellNumber(row: number, col: number): number {
  const rowFromBottom = 9 - row;
  const isEvenRow = rowFromBottom % 2 === 0;
  const colInRow = isEvenRow ? col : 9 - col;
  return rowFromBottom * 10 + colInRow + 1;
}

export const SnakesAndLaddersGame: React.FC<SnakesAndLaddersGameProps> = ({ onGameOver }) => {
  const [phase, setPhase] = useState<'setup' | 'playing'>('setup');
  const [numPlayers, setNumPlayers] = useState(2);
  const [playerTypes, setPlayerTypes] = useState<('human' | 'bot')[]>(['human', 'bot']);
  const [positions, setPositions] = useState<number[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [diceValue, setDiceValue] = useState<number | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [winner, setWinner] = useState<number | null>(null);
  const [log, setLog] = useState<string>('');
  const hasReported = useRef(false);

  const updatePlayerCount = (n: number) => {
    setNumPlayers(n);
    setPlayerTypes((prev) => {
      const next = [...prev];
      while (next.length < n) next.push('bot');
      return next.slice(0, n).map((t, i) => (i === 0 ? 'human' : t));
    });
  };

  const startGame = () => {
    setPositions(Array(numPlayers).fill(0));
    setCurrentPlayer(0);
    setWinner(null);
    setLog('Player 1, roll the dice!');
    hasReported.current = false;
    setPhase('playing');
  };

  const rollDice = () => {
    if (isRolling || winner !== null) return;
    setIsRolling(true);
    setTimeout(() => {
      const roll = Math.floor(Math.random() * 6) + 1;
      setDiceValue(roll);

      setPositions((prev) => {
        const next = [...prev];
        let landing = next[currentPlayer] + roll;
        if (landing > 100) {
          setLog(`Player ${currentPlayer + 1} rolled ${roll} — needs the exact number, stays put.`);
          landing = next[currentPlayer];
        } else {
          let msg = `Player ${currentPlayer + 1} rolled ${roll}, moved to ${landing}.`;
          if (SNAKES[landing]) {
            msg += ` 🐍 Bitten! Slides down to ${SNAKES[landing]}.`;
            landing = SNAKES[landing];
          } else if (LADDERS[landing]) {
            msg += ` 🪜 Ladder! Climbs up to ${LADDERS[landing]}.`;
            landing = LADDERS[landing];
          }
          setLog(msg);
        }
        next[currentPlayer] = landing;
        return next;
      });

      setIsRolling(false);
    }, 500);
  };

  // Resolve win / advance turn after a dice roll lands
  useEffect(() => {
    if (phase !== 'playing' || diceValue === null || isRolling) return;
    const pos = positions[currentPlayer];
    if (pos >= 100 && winner === null) {
      setWinner(currentPlayer);
      return;
    }
    const timer = setTimeout(() => {
      setDiceValue(null);
      setCurrentPlayer((prev) => (prev + 1) % numPlayers);
    }, 900);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions]);

  // Auto-roll for bot turns
  useEffect(() => {
    if (phase !== 'playing' || winner !== null) return;
    if (playerTypes[currentPlayer] === 'bot' && diceValue === null && !isRolling) {
      const timer = setTimeout(() => rollDice(), 700);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlayer, phase, winner]);

  useEffect(() => {
    if (winner !== null && !hasReported.current) {
      hasReported.current = true;
      const userWon = winner === 0;
      setTimeout(() => onGameOver(userWon ? 'win' : 'loss', userWon ? 100 : 0), 1200);
    }
  }, [winner, onGameOver]);

  if (phase === 'setup') {
    return (
      <div className="w-full flex flex-col items-center gap-4 p-3">
        <span className="text-xs font-black text-white uppercase tracking-wider">How many players?</span>
        <div className="flex items-center gap-2 flex-wrap justify-center">
          {[2, 3, 4, 5, 6, 7, 8].map((n) => (
            <button
              key={n}
              onClick={() => updatePlayerCount(n)}
              className={`w-9 h-9 rounded-xl font-bold text-sm cursor-pointer transition-all ${
                numPlayers === n ? 'bg-[#00FF66] text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        <div className="w-full space-y-1.5">
          {playerTypes.map((type, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800">
              <span className="text-xs font-bold flex items-center gap-1.5" style={{ color: PLAYER_COLORS[i] }}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PLAYER_COLORS[i] }} />
                {i === 0 ? 'You' : `Player ${i + 1}`}
              </span>
              {i === 0 ? (
                <span className="text-[10px] text-zinc-500 font-semibold">Human</span>
              ) : (
                <button
                  onClick={() =>
                    setPlayerTypes((prev) => prev.map((t, idx) => (idx === i ? (t === 'bot' ? 'human' : 'bot') : t)))
                  }
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-800 hover:bg-zinc-700 cursor-pointer flex items-center gap-1"
                >
                  {type === 'bot' ? <Bot className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
                  {type === 'bot' ? 'Bot' : 'Pass & Play'}
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={startGame}
          className="w-full py-2.5 rounded-2xl bg-[#00FF66] text-black font-bold text-xs cursor-pointer hover:bg-[#00FF66]/90"
        >
          Start Game
        </button>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center gap-3 p-2">
      {/* Player chips */}
      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        {positions.map((pos, i) => (
          <div
            key={i}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 border ${
              currentPlayer === i && winner === null ? 'border-white' : 'border-transparent opacity-60'
            }`}
            style={{ backgroundColor: `${PLAYER_COLORS[i]}22`, color: PLAYER_COLORS[i] }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PLAYER_COLORS[i] }} />
            {i === 0 ? 'You' : `P${i + 1}`}: {pos}
          </div>
        ))}
      </div>

      {/* Board */}
      <div className="grid grid-cols-10 gap-0.5 w-full max-w-[300px] aspect-square bg-zinc-950 p-1.5 rounded-xl border border-zinc-800">
        {Array.from({ length: 10 }).map((_, row) =>
          Array.from({ length: 10 }).map((_, col) => {
            const num = getGridCellNumber(row, col);
            const tokensHere = positions.map((p, i) => (p === num ? i : -1)).filter((i) => i !== -1);
            const isSnake = !!SNAKES[num];
            const isLadder = !!LADDERS[num];
            return (
              <div
                key={`${row}-${col}`}
                className={`relative flex items-center justify-center text-[7px] font-bold rounded-sm ${
                  isSnake ? 'bg-rose-900/60 text-rose-300' : isLadder ? 'bg-emerald-900/60 text-emerald-300' : 'bg-zinc-800/80 text-zinc-500'
                }`}
              >
                {num}
                {tokensHere.length > 0 && (
                  <div className="absolute inset-0 flex items-center justify-center gap-0.5 flex-wrap">
                    {tokensHere.map((i) => (
                      <span key={i} className="w-2 h-2 rounded-full border border-black" style={{ backgroundColor: PLAYER_COLORS[i] }} />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <p className="text-[10px] text-zinc-400 text-center min-h-[14px]">{log}</p>

      {winner === null ? (
        <button
          onClick={rollDice}
          disabled={isRolling || playerTypes[currentPlayer] === 'bot'}
          className="px-6 py-2.5 rounded-2xl bg-[#00FF66] text-black font-bold text-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Dices className="w-4 h-4" />
          {playerTypes[currentPlayer] === 'bot'
            ? `Player ${currentPlayer + 1} is rolling...`
            : diceValue !== null
            ? `Rolled ${diceValue}`
            : 'Roll Dice'}
        </button>
      ) : (
        <p className="text-sm font-black text-white animate-bounce">
          {winner === 0 ? '🎉 You Win!' : `Player ${winner + 1} Wins!`}
        </p>
      )}
    </div>
  );
};
