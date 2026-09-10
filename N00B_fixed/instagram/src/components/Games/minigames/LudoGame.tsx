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

// Classic Ludo palette — red / green / yellow / blue corners, matching the
// real board rather than the app's neon theme (per request: board gets
// colors, app chrome stays as-is). Order matches the fixed board quadrants
// below: Red = top-left, Green = top-right, Yellow = bottom-right, Blue =
// bottom-left, same as a real Ludo board regardless of player count.
const PLAYER_COLORS = ['#dc2626', '#16a34a', '#eab308', '#2563eb'];
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

  // --- Board rendering: real 15x15-grid classic Ludo layout — 4 big
  // colored corner yards each holding a 2x2 dot grid, a tiled cross-shaped
  // path ring with star-marked start cells, straight colored home-stretch
  // lanes, and a 4-triangle diamond hub, matching a real Ludo board instead
  // of an abstract ring. Player order/colors are fixed to real quadrants
  // (Red TL, Green TR, Yellow BR, Blue BL) regardless of numPlayers, so 2-3
  // player games still sit on real corners rather than re-splitting evenly.
  const size = 340;
  const center = size / 2;
  const half = 150; // distance from board center to its outer edge
  const armHalf = half * 0.2; // half-width of each 3-cell-wide arm (= 1.5 of the 15x15 grid's cells)
  const cellPx = (half - armHalf) / 6; // one grid cell in px (each yard/arm is 6 cells deep)

  // 12-vertex outline of the plus/cross shape, clockwise, starting at the
  // point where Red's own arm meets the outer edge (see below).
  const crossVertices: [number, number][] = [
    [-half, -armHalf], [-armHalf, -armHalf], [-armHalf, -half],
    [armHalf, -half], [armHalf, -armHalf], [half, -armHalf],
    [half, armHalf], [armHalf, armHalf], [armHalf, half],
    [-armHalf, half], [-armHalf, armHalf], [-half, armHalf]
  ];
  const crossDist: number[] = [];
  {
    let total = 0;
    for (let i = 0; i < crossVertices.length; i++) {
      const [x1, y1] = crossVertices[i];
      const [x2, y2] = crossVertices[(i + 1) % crossVertices.length];
      total += Math.hypot(x2 - x1, y2 - y1);
      crossDist.push(total);
    }
  }
  const crossTotal = crossDist[crossDist.length - 1];

  // Continuous position along the 12-vertex outline for t in [0,1). At
  // t = p/4 this lands exactly on the corner where player p's own arm meets
  // the board edge — t=0 Red, 0.25 Green, 0.5 Yellow, 0.75 Blue — and moving
  // forward from there always heads toward the hub first, matching a real
  // board's clockwise flow.
  const crossPos = (t: number) => {
    const target = (((t % 1) + 1) % 1) * crossTotal;
    for (let i = 0; i < crossVertices.length; i++) {
      const segStart = i === 0 ? 0 : crossDist[i - 1];
      const segEnd = crossDist[i];
      if (target <= segEnd || i === crossVertices.length - 1) {
        const segLen = segEnd - segStart || 1;
        const localT = (target - segStart) / segLen;
        const [x1, y1] = crossVertices[i];
        const [x2, y2] = crossVertices[(i + 1) % crossVertices.length];
        return { x: center + x1 + (x2 - x1) * localT, y: center + y1 + (y2 - y1) * localT };
      }
    }
    return { x: center, y: center };
  };

  const cellPos = (index: number) => crossPos(index / pathLength);

  // Fixed quadrant per player index, independent of numPlayers.
  const YARD_SIGN: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  // Outward direction (away from hub) along each player's own home-stretch arm.
  const HOME_AXIS: [number, number][] = [[-1, 0], [0, -1], [1, 0], [0, 1]];

  const yardCenter = (p: number) => {
    const [sx, sy] = YARD_SIGN[p];
    const mid = (half + armHalf) / 2;
    return { x: center + sx * mid, y: center + sy * mid };
  };

  // s=0 is the cell closest to the shared ring, s=HOME_STRETCH-1 is closest
  // to the hub — matching increasing token progress toward home.
  const homeStretchPos = (p: number, s: number) => {
    const [ax, ay] = HOME_AXIS[p];
    const outerDist = half - cellPx * 1.5;
    const innerDist = armHalf - cellPx * 0.3;
    const dist = outerDist + (innerDist - outerDist) * (s / (HOME_STRETCH - 1));
    return { x: center + ax * dist, y: center + ay * dist };
  };

  const yardSlotOffsets: [number, number][] = [
    [-cellPx * 1.1, -cellPx * 1.1],
    [cellPx * 1.1, -cellPx * 1.1],
    [-cellPx * 1.1, cellPx * 1.1],
    [cellPx * 1.1, cellPx * 1.1]
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

      <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[340px]">
        {/* Board backdrop */}
        <rect
          x={center - half - 10}
          y={center - half - 10}
          width={(half + 10) * 2}
          height={(half + 10) * 2}
          rx="16"
          fill="#f8fafc"
          stroke="#cbd5e1"
          strokeWidth="2"
        />

        {/* 4 big colored corner yards, each with a white inset panel + 2x2 dot grid */}
        {[0, 1, 2, 3].map((p) => {
          const [sx, sy] = YARD_SIGN[p];
          const yardSize = half - armHalf;
          const x0 = center + (sx < 0 ? -half : armHalf);
          const y0 = center + (sy < 0 ? -half : armHalf);
          const yc = yardCenter(p);
          const panelSize = yardSize * 0.66;
          const isActive = p < numPlayers;
          return (
            <g key={p} opacity={isActive ? 1 : 0.3}>
              <rect x={x0} y={y0} width={yardSize} height={yardSize} fill={PLAYER_COLORS[p]} />
              <rect
                x={yc.x - panelSize / 2}
                y={yc.y - panelSize / 2}
                width={panelSize}
                height={panelSize}
                rx={panelSize * 0.16}
                fill="#ffffff"
              />
              {yardSlotOffsets.map(([dx, dy], slotIdx) => {
                const hasToken = isActive && tokens[p]?.[slotIdx] === 0;
                return (
                  <circle
                    key={slotIdx}
                    cx={yc.x + dx}
                    cy={yc.y + dy}
                    r={cellPx * 0.6}
                    fill={hasToken ? PLAYER_COLORS[p] : 'none'}
                    stroke={PLAYER_COLORS[p]}
                    strokeWidth={hasToken ? cellPx * 0.16 : cellPx * 0.24}
                  />
                );
              })}
            </g>
          );
        })}

        {/* Cross-shaped path ring: tiled squares, each player's start cell shown
            in their color with a star, like a real board's marked entry tile */}
        {Array.from({ length: pathLength }).map((_, i) => {
          const { x, y } = cellPos(i);
          const startPlayer = [0, 1, 2, 3]
            .filter((p) => p < numPlayers)
            .find((p) => p * ARM_LENGTH === i);
          const checker = Math.floor(i / 2) % 2 === 0;
          return (
            <g key={i}>
              <rect
                x={x - (cellPx * 0.92) / 2}
                y={y - (cellPx * 0.92) / 2}
                width={cellPx * 0.92}
                height={cellPx * 0.92}
                fill={startPlayer !== undefined ? PLAYER_COLORS[startPlayer] : checker ? '#e2e8f0' : '#ffffff'}
                stroke="#cbd5e1"
                strokeWidth="0.6"
              />
              {startPlayer !== undefined && (
                <text x={x} y={y + cellPx * 0.22} fontSize={cellPx * 0.7} textAnchor="middle" fill="#fff">
                  ★
                </text>
              )}
            </g>
          );
        })}

        {/* Home-stretch lanes: a straight run of colored squares from the ring to the hub */}
        {[0, 1, 2, 3].map((p) => (
          <g key={p} opacity={p < numPlayers ? 1 : 0.3}>
            {Array.from({ length: HOME_STRETCH }).map((_, s) => {
              const pos = homeStretchPos(p, s);
              return (
                <rect
                  key={s}
                  x={pos.x - (cellPx * 0.92) / 2}
                  y={pos.y - (cellPx * 0.92) / 2}
                  width={cellPx * 0.92}
                  height={cellPx * 0.92}
                  fill={PLAYER_COLORS[p]}
                  stroke="#f8fafc"
                  strokeWidth="0.75"
                />
              );
            })}
          </g>
        ))}

        {/* Center hub: a diamond of 4 triangles meeting at the middle, each
            colored to the player whose home stretch enters from that side */}
        {(() => {
          const corners: [number, number][] = [
            [center - armHalf, center - armHalf],
            [center + armHalf, center - armHalf],
            [center + armHalf, center + armHalf],
            [center - armHalf, center + armHalf]
          ];
          // Red points left, Green points up, Yellow points right, Blue points
          // down — matching HOME_AXIS above.
          const triCornerPairs: [[number, number], [number, number]][] = [
            [corners[0], corners[3]],
            [corners[0], corners[1]],
            [corners[1], corners[2]],
            [corners[3], corners[2]]
          ];
          return triCornerPairs.map(([a, b], p) => (
            <path
              key={p}
              d={`M ${center} ${center} L ${a[0]} ${a[1]} L ${b[0]} ${b[1]} Z`}
              fill={PLAYER_COLORS[p]}
              stroke="#f8fafc"
              strokeWidth="1.5"
              opacity={p < numPlayers ? 1 : 0.3}
            />
          ));
        })()}

        {/* Tokens currently on the shared ring or home stretch (yard tokens
            already show as filled dots in the yard panel above) */}
        {tokens.map((toks, p) =>
          toks.map((progress, t) => {
            if (progress === 0 || progress === finishProgress) return null;
            const pos =
              progress <= pathLength
                ? cellPos(absoluteCell(p, progress))
                : homeStretchPos(p, progress - pathLength - 1);
            return (
              <g key={`${p}-${t}`}>
                <circle cx={pos.x} cy={pos.y} r={cellPx * 0.4} fill={PLAYER_COLORS[p]} stroke="#1c1c1f" strokeWidth="1.2" />
                <circle cx={pos.x - cellPx * 0.12} cy={pos.y - cellPx * 0.12} r={cellPx * 0.12} fill="#ffffff" fillOpacity="0.65" />
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
