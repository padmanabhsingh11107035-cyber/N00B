import React, { useEffect, useRef, useState } from 'react';
import { Bot, User as UserIcon, Dices } from 'lucide-react';

interface LudoGameProps {
  onGameOver: (result: 'win' | 'tie' | 'loss', finalScore: number) => void;
  // 'bot' (default): obviously just you vs bots — no per-slot toggle shown.
  // 'pass_play': multiple humans sharing this device — slots default to
  // human and can be toggled to bot for a mixed group.
  entryMode?: 'bot' | 'pass_play';
  initialPlayerCount?: number;
}

// Classic Ludo palette — blue / green / yellow / red corners, matching the
// real board rather than the app's neon theme (per request: board gets
// colors, app chrome stays as-is).
const PLAYER_COLORS = ['#2563eb', '#16a34a', '#eab308', '#dc2626'];
const ARM_LENGTH = 8; // shared-path cells per player, kept short for quick mobile games
const HOME_STRETCH = 4;
const TOKENS_PER_PLAYER = 4;
const MAX_PLAYERS = 4;

export const LudoGame: React.FC<LudoGameProps> = ({ onGameOver, entryMode = 'bot', initialPlayerCount }) => {
  const [phase, setPhase] = useState<'setup' | 'playing'>('setup');
  const [numPlayers, setNumPlayers] = useState(Math.min(initialPlayerCount || MAX_PLAYERS, MAX_PLAYERS));
  const [playerTypes, setPlayerTypes] = useState<('human' | 'bot')[]>(() => {
    const n = Math.min(initialPlayerCount || MAX_PLAYERS, MAX_PLAYERS);
    return Array.from({ length: n }, (_, i) => (i === 0 ? 'human' : entryMode === 'pass_play' ? 'human' : 'bot'));
  });
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
      while (next.length < n) next.push(entryMode === 'pass_play' ? 'human' : 'bot');
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
          {[2, 3, 4].map((n) => (
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
              ) : entryMode === 'bot' ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 flex items-center gap-1">
                  <Bot className="w-3 h-3" /> Bot
                </span>
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

  // --- Board rendering: classic square Ludo layout — 4 colored corner
  // yards, a square path ring, colored home lanes, and a 4-wedge center
  // home, instead of the previous abstract radial ring. ---
  const size = 320;
  const center = size / 2;
  const ringHalf = 118;
  const yardOffset = 152;
  const homeStretchOuterT = 0.72; // fraction of the way from ring toward center where the lane starts
  const homeStretchInnerT = 0.2; // fraction of the way from ring toward center where the lane ends
  const hubRadius = 42;

  const cellArc = (8 * ringHalf) / pathLength;
  const cellSize = Math.max(7, Math.min(15, cellArc * 0.8));

  // Walks the perimeter of a square of half-size `half` centered on `center`,
  // starting at the top-left corner and going clockwise. t is a fraction [0,1).
  const squarePos = (t: number, half: number) => {
    const perim = 8 * half;
    let d = ((t % 1) + 1) % 1;
    d *= perim;
    if (d < 2 * half) return { x: center - half + d, y: center - half };
    d -= 2 * half;
    if (d < 2 * half) return { x: center + half, y: center - half + d };
    d -= 2 * half;
    if (d < 2 * half) return { x: center + half - d, y: center + half };
    d -= 2 * half;
    return { x: center - half, y: center + half - d };
  };

  const cellPos = (index: number) => squarePos(index / pathLength, ringHalf);
  // Angular direction (from board center) toward each player's yard/hub
  // wedge. Perimeter fraction and angular fraction aren't the same for a
  // square, so this is computed directly to land on actual corners when
  // numPlayers === 4 (players evenly split the 4 corners), and evenly
  // spaced directions otherwise.
  const entryAngleOf = (playerIdx: number) =>
    -Math.PI / 2 - Math.PI / numPlayers + playerIdx * ((2 * Math.PI) / numPlayers);

  const yardSlotOffsets: [number, number][] = [
    [-11, 4],
    [11, 4],
    [-11, 22],
    [11, 22]
  ];

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

      <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[320px]">
        {/* Board backdrop */}
        <rect
          x={center - yardOffset - 28}
          y={center - yardOffset - 28}
          width={(yardOffset + 28) * 2}
          height={(yardOffset + 28) * 2}
          rx="18"
          fill="#f8fafc"
          stroke="#cbd5e1"
          strokeWidth="2"
        />

        {/* Center hub: pie wedge per player, pointing down each player's home lane */}
        {Array.from({ length: numPlayers }).map((_, p) => {
          const angle = entryAngleOf(p);
          const half = Math.PI / numPlayers;
          const x1 = center + hubRadius * Math.cos(angle - half);
          const y1 = center + hubRadius * Math.sin(angle - half);
          const x2 = center + hubRadius * Math.cos(angle + half);
          const y2 = center + hubRadius * Math.sin(angle + half);
          return (
            <path
              key={p}
              d={`M ${center} ${center} L ${x1} ${y1} A ${hubRadius} ${hubRadius} 0 0 1 ${x2} ${y2} Z`}
              fill={PLAYER_COLORS[p]}
              stroke="#f8fafc"
              strokeWidth="2"
            />
          );
        })}
        <circle cx={center} cy={center} r={hubRadius * 0.42} fill="#1c1c1f" stroke="#3f3f46" strokeWidth="1" />
        <text x={center} y={center + 3} fontSize="8.5" fill="#fff" textAnchor="middle" fontWeight="900">
          HOME
        </text>

        {/* Home stretch lane: a strip of colored squares per player, ring to hub */}
        {Array.from({ length: numPlayers }).map((_, p) => {
          const entry = cellPos(p * ARM_LENGTH);
          return (
            <g key={p}>
              {Array.from({ length: HOME_STRETCH }).map((_, s) => {
                const t = homeStretchOuterT - (s / (HOME_STRETCH - 1)) * (homeStretchOuterT - homeStretchInnerT);
                const x = entry.x + (center - entry.x) * (1 - t);
                const y = entry.y + (center - entry.y) * (1 - t);
                return (
                  <rect
                    key={s}
                    x={x - cellSize / 2}
                    y={y - cellSize / 2}
                    width={cellSize}
                    height={cellSize}
                    rx="1.5"
                    fill={PLAYER_COLORS[p]}
                    stroke="#f8fafc"
                    strokeWidth="0.75"
                  />
                );
              })}
            </g>
          );
        })}

        {/* Shared ring path: checkered squares, gold star tile marks each player's safe entry cell */}
        {Array.from({ length: pathLength }).map((_, i) => {
          const { x, y } = cellPos(i);
          const isSafe = i % ARM_LENGTH === 0;
          const checker = Math.floor(i / 2) % 2 === 0;
          return (
            <rect
              key={i}
              x={x - cellSize / 2}
              y={y - cellSize / 2}
              width={cellSize}
              height={cellSize}
              rx="1.5"
              fill={isSafe ? '#fbbf24' : checker ? '#e2e8f0' : '#ffffff'}
              stroke="#cbd5e1"
              strokeWidth="0.6"
            />
          );
        })}

        {/* Yard panels: colored rounded-square base holding a 2x2 grid of token slots */}
        {Array.from({ length: numPlayers }).map((_, p) => {
          const angle = entryAngleOf(p);
          const yx = center + yardOffset * Math.cos(angle);
          const yy = center + yardOffset * Math.sin(angle);
          return (
            <g key={p}>
              <rect
                x={yx - 30}
                y={yy - 30}
                width="60"
                height="60"
                rx="12"
                fill={PLAYER_COLORS[p]}
                fillOpacity="0.18"
                stroke={PLAYER_COLORS[p]}
                strokeWidth={currentPlayer === p && winner === null ? 3 : 1.5}
              />
              <text x={yx} y={yy - 16} fontSize="8" fill={PLAYER_COLORS[p]} textAnchor="middle" fontWeight="900">
                {p === 0 ? 'YOU' : `P${p + 1}`}
              </text>
              {yardSlotOffsets.map(([dx, dy], slotIdx) => {
                const hasToken = tokens[p]?.[slotIdx] === 0;
                return (
                  <circle
                    key={slotIdx}
                    cx={yx + dx}
                    cy={yy + dy}
                    r="6.5"
                    fill={hasToken ? PLAYER_COLORS[p] : '#ffffff'}
                    stroke={PLAYER_COLORS[p]}
                    strokeWidth={hasToken ? 1.4 : 1}
                    strokeOpacity={hasToken ? 1 : 0.5}
                  />
                );
              })}
            </g>
          );
        })}

        {/* Tokens currently on the shared ring or home stretch */}
        {tokens.map((toks, p) =>
          toks.map((progress, t) => {
            if (progress === 0 || progress === finishProgress) return null; // shown via yard slot / home counter
            let x: number;
            let y: number;
            if (progress <= pathLength) {
              ({ x, y } = cellPos(absoluteCell(p, progress)));
            } else {
              const entry = cellPos(p * ARM_LENGTH);
              const stretchT =
                homeStretchOuterT -
                ((progress - pathLength - 1) / (HOME_STRETCH - 1)) * (homeStretchOuterT - homeStretchInnerT);
              x = entry.x + (center - entry.x) * (1 - stretchT);
              y = entry.y + (center - entry.y) * (1 - stretchT);
            }
            return (
              <g key={`${p}-${t}`}>
                <circle cx={x} cy={y} r="7.5" fill={PLAYER_COLORS[p]} stroke="#1c1c1f" strokeWidth="1.3" />
                <circle cx={x - 2} cy={y - 2} r="2.2" fill="#ffffff" fillOpacity="0.65" />
              </g>
            );
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
