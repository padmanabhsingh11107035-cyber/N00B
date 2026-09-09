import React, { useEffect, useRef, useState } from 'react';
import { Bot, User as UserIcon, Dices } from 'lucide-react';

interface LudoGameProps {
  onGameOver: (result: 'win' | 'tie' | 'loss', finalScore: number) => void;
}

const PLAYER_COLORS = ['#00FF66', '#ec4899', '#38bdf8', '#f59e0b', '#a78bfa', '#f43f5e', '#2dd4bf', '#fb923c'];
const ARM_LENGTH = 8; // shared-path cells per player, kept short for quick mobile games
const HOME_STRETCH = 4;
const TOKENS_PER_PLAYER = 4;

export const LudoGame: React.FC<LudoGameProps> = ({ onGameOver }) => {
  const [phase, setPhase] = useState<'setup' | 'playing'>('setup');
  const [numPlayers, setNumPlayers] = useState(4);
  const [playerTypes, setPlayerTypes] = useState<('human' | 'bot')[]>(['human', 'bot', 'bot', 'bot']);
  // tokens[player][tokenIndex] = progress. 0 = in yard.
  const [tokens, setTokens] = useState<number[][]>([]);
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [diceValue, setDiceValue] = useState<number | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [winner, setWinner] = useState<number | null>(null);
  const [log, setLog] = useState('');
  const hasReported = useRef(false);

  const pathLength = numPlayers * ARM_LENGTH;
  const finishProgress = pathLength + HOME_STRETCH + 1;

  const updatePlayerCount = (n: number) => {
    setNumPlayers(n);
    setPlayerTypes((prev) => {
      const next = [...prev];
      while (next.length < n) next.push('bot');
      return next.slice(0, n).map((t, i) => (i === 0 ? 'human' : t));
    });
  };

  const startGame = () => {
    setTokens(Array.from({ length: numPlayers }, () => Array(TOKENS_PER_PLAYER).fill(0)));
    setCurrentPlayer(0);
    setWinner(null);
    setLog('Player 1, roll to get a token out (need a 6)!');
    hasReported.current = false;
    setPhase('playing');
  };

  // Absolute cell on the shared ring for a given player's token progress
  const absoluteCell = (playerIdx: number, progress: number) => {
    const entry = playerIdx * ARM_LENGTH;
    return (entry + progress - 1 + pathLength) % pathLength;
  };

  const moveToken = (playerIdx: number, tokenIdx: number, roll: number) => {
    setTokens((prev) => {
      const next = prev.map((arr) => [...arr]);
      const current = next[playerIdx][tokenIdx];
      let target = current === 0 ? (roll === 6 ? 1 : 0) : current + roll;
      if (target > finishProgress) return prev; // overshoot, illegal move
      next[playerIdx][tokenIdx] = target;

      // Capture check: only while on the shared ring (not yard, not home stretch)
      if (target > 0 && target <= pathLength) {
        const cell = absoluteCell(playerIdx, target);
        const isSafeCell = Array.from({ length: numPlayers }).some((_, p) => p * ARM_LENGTH === cell);
        if (!isSafeCell) {
          for (let p = 0; p < next.length; p++) {
            if (p === playerIdx) continue;
            for (let t = 0; t < next[p].length; t++) {
              const otherProgress = next[p][t];
              if (otherProgress > 0 && otherProgress <= pathLength && absoluteCell(p, otherProgress) === cell) {
                next[p][t] = 0;
              }
            }
          }
        }
      }
      return next;
    });
  };

  // Pick a movable token automatically: prefer advancing the furthest token,
  // otherwise bring a new one out on a 6.
  const pickMovableToken = (playerIdx: number, roll: number): number | null => {
    const arr = tokens[playerIdx];
    const onBoard = arr
      .map((p, i) => ({ i, p }))
      .filter(({ p }) => p > 0 && p + roll <= finishProgress)
      .sort((a, b) => b.p - a.p);
    if (onBoard.length > 0) return onBoard[0].i;
    if (roll === 6) {
      const inYard = arr.findIndex((p) => p === 0);
      if (inYard !== -1) return inYard;
    }
    return null;
  };

  const rollDice = () => {
    if (isRolling || winner !== null) return;
    setIsRolling(true);
    setTimeout(() => {
      const roll = Math.floor(Math.random() * 6) + 1;
      setDiceValue(roll);
      const tokenIdx = pickMovableToken(currentPlayer, roll);
      if (tokenIdx === null) {
        setLog(`Player ${currentPlayer + 1} rolled ${roll} — no valid move.`);
      } else {
        moveToken(currentPlayer, tokenIdx, roll);
        setLog(`Player ${currentPlayer + 1} rolled ${roll} and advanced a token.`);
      }
      setIsRolling(false);
    }, 500);
  };

  // Runs once per roll (whether or not it moved a token) to check for a win
  // and advance the turn. Keyed on diceValue rather than tokens, since a
  // "no valid move" roll leaves tokens unchanged but must still pass the turn.
  useEffect(() => {
    if (phase !== 'playing' || diceValue === null || isRolling || tokens.length === 0) return;
    const allHome = tokens[currentPlayer]?.every((p) => p === finishProgress);
    if (allHome && winner === null) {
      setWinner(currentPlayer);
      return;
    }
    const rolledSix = diceValue === 6;
    const timer = setTimeout(() => {
      setDiceValue(null);
      if (!rolledSix) {
        setCurrentPlayer((prev) => (prev + 1) % numPlayers);
      }
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diceValue]);

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

  // --- Board rendering: radial track that scales with player count ---
  const size = 300;
  const center = size / 2;
  const ringRadius = 105;
  const yardRadius = 135;
  const homeStretchOuter = 90;
  const homeStretchInner = 35;

  const cellPos = (index: number, radius: number) => {
    const angle = (index / pathLength) * 2 * Math.PI - Math.PI / 2;
    return { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) };
  };

  const entryAngleOf = (playerIdx: number) => (playerIdx * ARM_LENGTH / pathLength) * 2 * Math.PI - Math.PI / 2;

  return (
    <div className="w-full flex flex-col items-center gap-3 p-2">
      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        {tokens.map((toks, i) => (
          <div
            key={i}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 border ${
              currentPlayer === i && winner === null ? 'border-white' : 'border-transparent opacity-60'
            }`}
            style={{ backgroundColor: `${PLAYER_COLORS[i]}22`, color: PLAYER_COLORS[i] }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PLAYER_COLORS[i] }} />
            {i === 0 ? 'You' : `P${i + 1}`}: {toks.filter((p) => p === finishProgress).length}/4 home
          </div>
        ))}
      </div>

      <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[300px]">
        {/* Shared ring cells */}
        {Array.from({ length: pathLength }).map((_, i) => {
          const { x, y } = cellPos(i, ringRadius);
          const isSafe = i % ARM_LENGTH === 0;
          return <circle key={i} cx={x} cy={y} r={isSafe ? 6 : 4} fill={isSafe ? '#fbbf2455' : '#27272a'} stroke="#3f3f46" strokeWidth="0.5" />;
        })}

        {/* Home stretch spokes + yard markers per player */}
        {Array.from({ length: numPlayers }).map((_, p) => {
          const angle = entryAngleOf(p);
          const yx = center + yardRadius * Math.cos(angle);
          const yy = center + yardRadius * Math.sin(angle);
          return (
            <g key={p}>
              <line
                x1={center + homeStretchOuter * Math.cos(angle)}
                y1={center + homeStretchOuter * Math.sin(angle)}
                x2={center + homeStretchInner * Math.cos(angle)}
                y2={center + homeStretchInner * Math.sin(angle)}
                stroke={PLAYER_COLORS[p]}
                strokeWidth="4"
                strokeOpacity="0.25"
              />
              <circle cx={yx} cy={yy} r="14" fill={`${PLAYER_COLORS[p]}22`} stroke={PLAYER_COLORS[p]} strokeWidth="1.5" />
              <text x={yx} y={yy + 3} fontSize="8" fill={PLAYER_COLORS[p]} textAnchor="middle" fontWeight="bold">
                {p === 0 ? 'YOU' : `P${p + 1}`}
              </text>
            </g>
          );
        })}

        {/* Center home */}
        <circle cx={center} cy={center} r={homeStretchInner - 5} fill="#000" stroke="#3f3f46" />
        <text x={center} y={center + 3} fontSize="9" fill="#00FF66" textAnchor="middle" fontWeight="bold">
          HOME
        </text>

        {/* Tokens */}
        {tokens.map((toks, p) =>
          toks.map((progress, t) => {
            if (progress === 0) {
              const angle = entryAngleOf(p) + (t - 1.5) * 0.15;
              const x = center + (yardRadius + 10) * Math.cos(angle);
              const y = center + (yardRadius + 10) * Math.sin(angle);
              return <circle key={`${p}-${t}`} cx={x} cy={y} r="5" fill={PLAYER_COLORS[p]} stroke="#000" strokeWidth="1" />;
            }
            if (progress === finishProgress) return null; // shown via home counter only
            if (progress <= pathLength) {
              const { x, y } = cellPos(absoluteCell(p, progress), ringRadius);
              return <circle key={`${p}-${t}`} cx={x} cy={y} r="6" fill={PLAYER_COLORS[p]} stroke="#000" strokeWidth="1.2" />;
            }
            // On home stretch: interpolate between outer and inner radius
            const stretchProgress = (progress - pathLength) / (HOME_STRETCH + 1);
            const radius = homeStretchOuter - stretchProgress * (homeStretchOuter - homeStretchInner);
            const angle = entryAngleOf(p);
            const x = center + radius * Math.cos(angle);
            const y = center + radius * Math.sin(angle);
            return <circle key={`${p}-${t}`} cx={x} cy={y} r="6" fill={PLAYER_COLORS[p]} stroke="#fff" strokeWidth="1" />;
          })
        )}
      </svg>

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
            ? `Rolled ${diceValue}${diceValue === 6 ? ' — roll again!' : ''}`
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
