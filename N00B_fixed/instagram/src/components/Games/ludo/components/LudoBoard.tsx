import React, { useCallback, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import {
  Player,
  PlayerColor,
  ThemeConfig,
  TokenSkin,
  TokenState,
} from '../types';
import { soundEffects } from '../audio/soundEffects';
import {
  COLOR_START_INDEX_4P,
  getTokenScreenCoord,
  HOME_PATHS_4P,
  SAFE_TRACK_INDEXES_4P,
  TRACK_COORDINATES_4P,
  YARD_SLOTS_4P,
} from '../engine/boardCoordinates';

/**
 * Custom audio hook to trigger sound effects (move, capture, dice roll, win)
 * and manage HUD sound mute state.
 */
export function useAudio() {
  const [isMuted, setIsMuted] = useState<boolean>(() => soundEffects.getIsMuted());

  const toggleMute = useCallback(() => {
    const nextMuted = soundEffects.toggleMute();
    setIsMuted(nextMuted);
    return nextMuted;
  }, []);

  const playMove = useCallback(() => soundEffects.playTokenStep(), []);
  const playCapture = useCallback(() => soundEffects.playCapture(), []);
  const playDiceRoll = useCallback(() => soundEffects.playDiceRoll(), []);
  const playWin = useCallback(() => soundEffects.playVictory(), []);
  const playSafe = useCallback(() => soundEffects.playSafeSquare(), []);
  const playHome = useCallback(() => soundEffects.playHomeReached(), []);
  const playClick = useCallback(() => soundEffects.playButtonClick(), []);

  return {
    isMuted,
    toggleMute,
    playMove,
    playCapture,
    playDiceRoll,
    playWin,
    playSafe,
    playHome,
    playClick,
  };
}

export interface LudoBoardProps {
  players: Player[];
  currentTurnColor: PlayerColor;
  legalTokenIds: number[];
  diceRollStatus: string;
  theme: ThemeConfig;
  tokenSkin: TokenSkin;
  onSelectToken: (tokenId: number) => void;
  isMyTurn: boolean;
  myColor: PlayerColor;
  showMuteButton?: boolean;
}

export const LudoBoard: React.FC<LudoBoardProps> = ({
  players,
  currentTurnColor,
  legalTokenIds,
  theme,
  onSelectToken,
  isMyTurn,
  myColor,
  showMuteButton = true,
}) => {
  const audio = useAudio();

  // Map of tokens by cell coordinate to handle stacking
  const tokensOnBoard: { token: TokenState; player: Player; coord: { x: number; y: number } }[] = [];

  players.forEach((player) => {
    player.tokens.forEach((token) => {
      const coord = getTokenScreenCoord(token);
      tokensOnBoard.push({ token, player, coord });
    });
  });

  // Group tokens that share approximately the same coordinate
  const coordinateGroups = new Map<string, typeof tokensOnBoard>();
  tokensOnBoard.forEach((item) => {
    const key = `${item.coord.x.toFixed(1)},${item.coord.y.toFixed(1)}`;
    if (!coordinateGroups.has(key)) {
      coordinateGroups.set(key, []);
    }
    coordinateGroups.get(key)!.push(item);
  });

  // Elegant theme-aware color mapping for pawns and badges
  const colorHex: Record<PlayerColor, string> = {
    red: theme.homeTriangle?.red || '#f43f5e',
    green: theme.homeTriangle?.green || '#10b981',
    yellow: theme.homeTriangle?.yellow || '#f59e0b',
    blue: theme.homeTriangle?.blue || '#3b82f6',
    purple: theme.homeTriangle?.purple || '#a855f7',
    orange: theme.homeTriangle?.orange || '#f97316',
  };

  const isLegalForCurrent = (token: TokenState, player: Player) => {
    return isMyTurn && player.color === myColor && legalTokenIds.includes(token.id);
  };

  return (
    <div className="relative w-full aspect-square max-h-[min(65vw,390px)] max-w-[min(92vw,390px)] mx-auto p-1 sm:p-1.5 md:p-2 rounded-2xl md:rounded-3xl bg-slate-900/90 shadow-2xl border-2 border-indigo-950/80 backdrop-blur-md select-none touch-manipulation">
      {/* 15x15 Ludo Board Grid Container */}
      <div
        className="relative w-full h-full rounded-xl md:rounded-2xl overflow-hidden border border-slate-800 shadow-inner"
        style={{ backgroundColor: theme.boardBg }}
      >
        {/* ================= 4 CORNER YARD QUADRANTS ================= */}
        {/* RED YARD (Top-Left: cols 0..5, rows 0..5) */}
        <div
          className="absolute top-0 left-0 w-[40%] h-[40%] p-1.5 md:p-2 flex items-center justify-center border-r border-b border-slate-800"
          style={{ backgroundColor: theme.yardBg.red }}
        >
          <div className="w-full h-full rounded-2xl bg-slate-900/90 border border-red-500/30 shadow-inner flex flex-col items-center justify-center relative p-1 backdrop-blur-md">
            <span className="text-[8.5px] md:text-[9.5px] font-black tracking-widest text-red-400/90 select-none uppercase">
              RED CLUB
            </span>
          </div>
        </div>

        {/* GREEN YARD (Top-Right: cols 9..14, rows 0..5) */}
        <div
          className="absolute top-0 right-0 w-[40%] h-[40%] p-1.5 md:p-2 flex items-center justify-center border-l border-b border-slate-800"
          style={{ backgroundColor: theme.yardBg.green }}
        >
          <div className="w-full h-full rounded-2xl bg-slate-900/90 border border-emerald-500/30 shadow-inner flex flex-col items-center justify-center relative p-1 backdrop-blur-md">
            <span className="text-[8.5px] md:text-[9.5px] font-black tracking-widest text-emerald-400/90 select-none uppercase">
              GREEN CLUB
            </span>
          </div>
        </div>

        {/* BLUE YARD (Bottom-Left: cols 0..5, rows 9..14) */}
        <div
          className="absolute bottom-0 left-0 w-[40%] h-[40%] p-1.5 md:p-2 flex items-center justify-center border-r border-t border-slate-800"
          style={{ backgroundColor: theme.yardBg.blue }}
        >
          <div className="w-full h-full rounded-2xl bg-slate-900/90 border border-blue-500/30 shadow-inner flex flex-col items-center justify-center relative p-1 backdrop-blur-md">
            <span className="text-[8.5px] md:text-[9.5px] font-black tracking-widest text-blue-400/90 select-none uppercase">
              BLUE CLUB
            </span>
          </div>
        </div>

        {/* YELLOW YARD (Bottom-Right: cols 9..14, rows 9..14) */}
        <div
          className="absolute bottom-0 right-0 w-[40%] h-[40%] p-1.5 md:p-2 flex items-center justify-center border-l border-t border-slate-800"
          style={{ backgroundColor: theme.yardBg.yellow }}
        >
          <div className="w-full h-full rounded-2xl bg-slate-900/90 border border-amber-500/30 shadow-inner flex flex-col items-center justify-center relative p-1 backdrop-blur-md">
            <span className="text-[8.5px] md:text-[9.5px] font-black tracking-widest text-amber-400/90 select-none uppercase">
              YELLOW CLUB
            </span>
          </div>
        </div>

        {/* ================= 4 EXACT CIRCULAR BASE PEDESTALS / SOCKETS FOR EACH COLOR ================= */}
        {(['red', 'green', 'yellow', 'blue'] as PlayerColor[]).map((c) => {
          const slots = YARD_SLOTS_4P[c] || [];
          const ringColor = colorHex[c];

          return slots.map((coord, slotIdx) => {
            const slotLeft = ((coord.x + 0.5) / 15) * 100;
            const slotTop = ((coord.y + 0.5) / 15) * 100;

            return (
              <div
                key={`yard-ring-${c}-${slotIdx}`}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border bg-slate-950/70 shadow-inner flex items-center justify-center pointer-events-none transition-all z-10 backdrop-blur-xs"
                style={{
                  left: `${slotLeft}%`,
                  top: `${slotTop}%`,
                  width: '7.4%',
                  height: '7.4%',
                  borderColor: `${ringColor}70`,
                  boxShadow: `inset 0 2px 4px rgba(0,0,0,0.4), 0 0 8px ${ringColor}25`,
                }}
              >
                {/* Concentric colored inner socket recess */}
                <div
                  className="w-[64%] h-[64%] rounded-full border shadow-sm opacity-90"
                  style={{
                    backgroundColor: `${ringColor}20`,
                    borderColor: `${ringColor}90`,
                  }}
                />
              </div>
            );
          });
        })}

        {/* ================= 52 TRACK CELLS ================= */}
        {TRACK_COORDINATES_4P.map((coord, idx) => {
          const isSafe = SAFE_TRACK_INDEXES_4P.has(idx);
          const isRedStart = idx === COLOR_START_INDEX_4P.red;
          const isGreenStart = idx === COLOR_START_INDEX_4P.green;
          const isYellowStart = idx === COLOR_START_INDEX_4P.yellow;
          const isBlueStart = idx === COLOR_START_INDEX_4P.blue;

          let cellBg = theme.trackCellBg;
          if (isRedStart) cellBg = 'rgba(239, 68, 68, 0.4)';
          else if (isGreenStart) cellBg = 'rgba(16, 185, 129, 0.4)';
          else if (isYellowStart) cellBg = 'rgba(234, 179, 8, 0.4)';
          else if (isBlueStart) cellBg = 'rgba(59, 130, 246, 0.4)';
          else if (isSafe) cellBg = theme.safeCellBg;

          return (
            <div
              key={`track-${idx}`}
              className="absolute border border-slate-700/60 flex items-center justify-center transition-colors"
              style={{
                left: `${(coord.x / 15) * 100}%`,
                top: `${(coord.y / 15) * 100}%`,
                width: `${(1 / 15) * 100}%`,
                height: `${(1 / 15) * 100}%`,
                backgroundColor: cellBg,
              }}
            >
              {isSafe && (
                <span
                  className="text-[10px] md:text-xs drop-shadow font-extrabold"
                  style={{ color: theme.starColor }}
                >
                  ★
                </span>
              )}
            </div>
          );
        })}

        {/* ================= 4 HOME PATH CORRIDORS ================= */}
        {/* Red Home Path (Horizontal left to center) */}
        {HOME_PATHS_4P.red.map((coord, idx) => (
          <div
            key={`home-red-${idx}`}
            className="absolute border border-red-700/60 flex items-center justify-center"
            style={{
              left: `${(coord.x / 15) * 100}%`,
              top: `${(coord.y / 15) * 100}%`,
              width: `${(1 / 15) * 100}%`,
              height: `${(1 / 15) * 100}%`,
              backgroundColor: 'rgba(239, 68, 68, 0.7)',
            }}
          >
            <span className="text-[8px] text-white/80 font-bold">{idx + 1}</span>
          </div>
        ))}

        {/* Green Home Path (Vertical top to center) */}
        {HOME_PATHS_4P.green.map((coord, idx) => (
          <div
            key={`home-green-${idx}`}
            className="absolute border border-emerald-700/60 flex items-center justify-center"
            style={{
              left: `${(coord.x / 15) * 100}%`,
              top: `${(coord.y / 15) * 100}%`,
              width: `${(1 / 15) * 100}%`,
              height: `${(1 / 15) * 100}%`,
              backgroundColor: 'rgba(16, 185, 129, 0.7)',
            }}
          >
            <span className="text-[8px] text-white/80 font-bold">{idx + 1}</span>
          </div>
        ))}

        {/* Yellow Home Path (Horizontal right to center) */}
        {HOME_PATHS_4P.yellow.map((coord, idx) => (
          <div
            key={`home-yellow-${idx}`}
            className="absolute border border-amber-700/60 flex items-center justify-center"
            style={{
              left: `${(coord.x / 15) * 100}%`,
              top: `${(coord.y / 15) * 100}%`,
              width: `${(1 / 15) * 100}%`,
              height: `${(1 / 15) * 100}%`,
              backgroundColor: 'rgba(234, 179, 8, 0.7)',
            }}
          >
            <span className="text-[8px] text-white/80 font-bold">{idx + 1}</span>
          </div>
        ))}

        {/* Blue Home Path (Vertical bottom to center) */}
        {HOME_PATHS_4P.blue.map((coord, idx) => (
          <div
            key={`home-blue-${idx}`}
            className="absolute border border-blue-700/60 flex items-center justify-center"
            style={{
              left: `${(coord.x / 15) * 100}%`,
              top: `${(coord.y / 15) * 100}%`,
              width: `${(1 / 15) * 100}%`,
              height: `${(1 / 15) * 100}%`,
              backgroundColor: 'rgba(59, 130, 246, 0.7)',
            }}
          >
            <span className="text-[8px] text-white/80 font-bold">{idx + 1}</span>
          </div>
        ))}

        {/* ================= CENTER VICTORY HOME TRIANGLES ================= */}
        <div className="absolute top-[40%] left-[40%] w-[20%] h-[20%] border-2 border-slate-700 bg-slate-950 overflow-hidden shadow-2xl">
          <svg className="w-full h-full" viewBox="0 0 100 100">
            {/* Top Green Triangle */}
            <polygon points="0,0 100,0 50,50" fill={theme.homeTriangle.green} opacity="0.9" />
            {/* Right Yellow Triangle */}
            <polygon points="100,0 100,100 50,50" fill={theme.homeTriangle.yellow} opacity="0.9" />
            {/* Bottom Blue Triangle */}
            <polygon points="100,100 0,100 50,50" fill={theme.homeTriangle.blue} opacity="0.9" />
            {/* Left Red Triangle */}
            <polygon points="0,100 0,0 50,50" fill={theme.homeTriangle.red} opacity="0.9" />
            {/* Center Crown Emblem */}
            <circle cx="50" cy="50" r="14" fill="#0f172a" stroke="#f59e0b" strokeWidth="2.5" />
            <text x="50" y="55" textAnchor="middle" fontSize="12" fill="#f59e0b" fontWeight="bold">
              👑
            </text>
          </svg>
        </div>

        {/* Optional HUD Audio Mute Toggle Button in corner */}
        {showMuteButton && (
          <button
            onClick={() => {
              audio.playClick();
              audio.toggleMute();
            }}
            aria-label={audio.isMuted ? 'Unmute Audio' : 'Mute Audio'}
            className="absolute top-1.5 right-1.5 z-30 p-1 md:p-1.5 rounded-lg md:rounded-xl bg-slate-950/70 hover:bg-slate-900 border border-slate-700/80 text-slate-300 hover:text-white shadow-lg backdrop-blur-md transition-all active:scale-95 cursor-pointer"
          >
            {audio.isMuted ? (
              <VolumeX className="w-3.5 h-3.5 text-rose-400" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
            )}
          </button>
        )}

        {/* ================= TOKEN PIECES (GOTIS) RENDERER ================= */}
        {Array.from(coordinateGroups.entries()).map(([key, group]) => {
          return group.map((item, stackIndex) => {
            const { token, player, coord } = item;
            const isLegal = isLegalForCurrent(token, player);
            const tokenColor = colorHex[token.color] || '#ef4444';

            // Clean, organized offsets and scaling when multiple tokens share a cell
            const stackCount = group.length;
            let offsetXPercent = 0;
            let offsetYPercent = 0;
            let tokenScale = 1.0;

            if (token.status === 'track' && stackCount > 1) {
              if (stackCount === 2) {
                offsetXPercent = stackIndex === 0 ? -1.3 : 1.3;
                offsetYPercent = 0;
                tokenScale = 0.88;
              } else if (stackCount === 3) {
                if (stackIndex === 0) {
                  offsetXPercent = 0;
                  offsetYPercent = -1.2;
                } else if (stackIndex === 1) {
                  offsetXPercent = -1.2;
                  offsetYPercent = 1.0;
                } else {
                  offsetXPercent = 1.2;
                  offsetYPercent = 1.0;
                }
                tokenScale = 0.8;
              } else {
                offsetXPercent = stackIndex % 2 === 0 ? -1.2 : 1.2;
                offsetYPercent = stackIndex < 2 ? -1.2 : 1.2;
                tokenScale = 0.74;
              }
            } else if (token.status === 'home') {
              // Compact neat scale inside home victory triangle
              tokenScale = 0.9;
            }

            // Exactly center token at ((coord.x + 0.5) / 15) * 100%
            const leftPercent = ((coord.x + 0.5) / 15) * 100;
            const topPercent = ((coord.y + 0.5) / 15) * 100;

            return (
              <button
                key={`tok-${token.color}-${token.id}`}
                onClick={() => {
                  if (isLegal) {
                    audio.playClick();
                    audio.playMove();
                    onSelectToken(token.id);
                  }
                }}
                disabled={!isLegal}
                className={`absolute z-20 flex items-center justify-center transition-transform duration-200 cursor-pointer focus:outline-none ${
                  isLegal
                    ? 'z-40'
                    : 'hover:brightness-110'
                }`}
                style={{
                  left: `calc(${leftPercent}% + ${offsetXPercent}%)`,
                  top: `calc(${topPercent}% + ${offsetYPercent}%)`,
                  width: '5.8%',
                  height: '5.8%',
                  transform: `translate(-50%, -50%) scale(${isLegal ? tokenScale * 1.15 : tokenScale})`,
                }}
                aria-label={`${token.color} goti ${token.id + 1}`}
              >
                {/* Radiant Pulsing Ring for Legal Move */}
                {isLegal && (
                  <span
                    className="absolute inset-[-4px] rounded-full animate-ping opacity-60 pointer-events-none"
                    style={{ backgroundColor: tokenColor }}
                  />
                )}

                {/* 3D Realistic Goti Pawn */}
                <div
                  className={`relative w-full h-full rounded-full border-2 border-white shadow-xl flex items-center justify-center transition-all ${
                    isLegal
                      ? 'ring-3 ring-yellow-400 ring-offset-1 ring-offset-slate-950 shadow-[0_0_12px_rgba(250,204,21,0.9)]'
                      : ''
                  }`}
                  style={{
                    backgroundColor: tokenColor,
                    backgroundImage: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.15) 38%, rgba(0,0,0,0.3) 100%)`,
                    boxShadow: `0 3px 6px rgba(0,0,0,0.5), inset 0 2px 3px rgba(255,255,255,0.8), inset 0 -2px 3px rgba(0,0,0,0.4)`,
                  }}
                >
                  {/* Pawn Top Cap Dome with Goti Number */}
                  <div className="w-[52%] h-[52%] rounded-full bg-white/35 border border-white/70 shadow-sm flex items-center justify-center backdrop-blur-xs">
                    <span className="text-[7.5px] md:text-[8.5px] font-black text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
                      {token.id + 1}
                    </span>
                  </div>

                  {/* Multi-token stack indicator badge */}
                  {stackCount > 1 && stackIndex === stackCount - 1 && token.status === 'track' && (
                    <span className="absolute -top-1.5 -right-1.5 bg-slate-950 text-amber-300 text-[7px] font-black px-1 rounded-full border border-amber-400 shadow">
                      x{stackCount}
                    </span>
                  )}
                </div>
              </button>
            );
          });
        })}
      </div>
    </div>
  );
};
