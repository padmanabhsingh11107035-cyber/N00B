import React from 'react';
import { PieceColor, PlayerInfo } from './types';
import { formatClockTime } from './chessUtils';

interface ChessClockProps {
  color: PieceColor;
  timeMs: number;
  isActive: boolean;
  hasTimer: boolean;
  player: PlayerInfo;
  isCheck?: boolean;
}

export const ChessClock: React.FC<ChessClockProps> = ({
  color,
  timeMs,
  isActive,
  hasTimer,
  player,
  isCheck = false,
}) => {
  const isLowTime = hasTimer && timeMs < 20000;

  return (
    <div
      className={`flex items-center justify-between px-3 py-2 rounded-xl transition-all border ${
        isActive
          ? 'bg-slate-900/90 border-cyan-500/80 shadow-lg shadow-cyan-950/40 ring-1 ring-cyan-500/40'
          : 'bg-slate-950/70 border-slate-800/80 text-slate-400'
      }`}
    >
      {/* Player identity */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="relative">
          <img
            src={player.profilePicture || '/noob-logo-circle.png'}
            alt={player.username}
            referrerPolicy="no-referrer"
            className="w-8 h-8 rounded-lg bg-slate-800 object-cover border border-slate-700"
          />
          <div
            className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-slate-900 ${
              color === 'w' ? 'bg-white' : 'bg-slate-800'
            }`}
          />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-bold text-white truncate max-w-[120px] sm:max-w-[180px]">
            {player.username}
          </div>
          <div className="text-[10px] text-slate-400 flex items-center gap-1">
            <span>{color === 'w' ? 'White' : 'Black'}</span>
            {isCheck && <span className="text-rose-400 font-bold animate-pulse">CHECK</span>}
          </div>
        </div>
      </div>

      {/* Clock display */}
      {hasTimer ? (
        <div
          className={`px-3 py-1 rounded-lg font-mono text-base font-bold tabular-nums tracking-wider border ${
            isLowTime && isActive
              ? 'bg-rose-950/80 border-rose-500 text-rose-300 animate-pulse'
              : isActive
              ? 'bg-cyan-950/60 border-cyan-500/80 text-cyan-300'
              : 'bg-slate-900/60 border-slate-800 text-slate-400'
          }`}
        >
          {formatClockTime(timeMs)}
        </div>
      ) : (
        <div className="px-2 py-0.5 rounded text-[11px] font-mono text-slate-500">
          No Timer
        </div>
      )}
    </div>
  );
};
