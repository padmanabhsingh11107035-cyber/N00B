import React, { useState } from 'react';
import { DiceRollStatus, PlayerColor } from '../types';
import { soundEffects } from '../audio/soundEffects';

interface LudoDiceProps {
  value: number | null;
  status: DiceRollStatus;
  isMyTurn: boolean;
  currentColor: PlayerColor;
  turnTimeRemaining: number;
  maxTurnTime: number;
  onRoll: () => void;
  disabled?: boolean;
}

export const LudoDice: React.FC<LudoDiceProps> = ({
  value,
  status,
  isMyTurn,
  currentColor,
  turnTimeRemaining,
  maxTurnTime,
  onRoll,
  disabled = false,
}) => {
  const [isRollingAnimation, setIsRollingAnimation] = useState(false);

  const handleRollClick = () => {
    if (disabled || !isMyTurn || status !== 'waiting_roll') return;

    soundEffects.playDiceRoll();
    setIsRollingAnimation(true);
    setTimeout(() => {
      setIsRollingAnimation(false);
      onRoll();
    }, 450);
  };

  const timerPercent = Math.max(0, Math.min(100, (turnTimeRemaining / maxTurnTime) * 100));

  const colorThemes: Record<PlayerColor, { ring: string; glow: string; badge: string }> = {
    red: { ring: '#ef4444', glow: 'rgba(239, 68, 68, 0.4)', badge: 'bg-red-500' },
    green: { ring: '#22c55e', glow: 'rgba(34, 197, 94, 0.4)', badge: 'bg-emerald-500' },
    yellow: { ring: '#eab308', glow: 'rgba(234, 179, 8, 0.4)', badge: 'bg-amber-500' },
    blue: { ring: '#3b82f6', glow: 'rgba(59, 130, 246, 0.4)', badge: 'bg-blue-500' },
    purple: { ring: '#a855f7', glow: 'rgba(168, 85, 247, 0.4)', badge: 'bg-purple-500' },
    orange: { ring: '#f97316', glow: 'rgba(249, 115, 22, 0.4)', badge: 'bg-orange-500' },
  };

  const activeColorTheme = colorThemes[currentColor] || colorThemes.red;

  // Dice dots layout renderer
  const renderDiceDots = (num: number) => {
    const dotClasses = 'w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-slate-900 shadow-inner';
    switch (num) {
      case 1:
        return (
          <div className="flex items-center justify-center w-full h-full">
            <div className={`${dotClasses} !w-3 !h-3 md:!w-3.5 md:!h-3.5 !bg-red-500 shadow-red-300 shadow`} />
          </div>
        );
      case 2:
        return (
          <div className="flex justify-between w-full h-full p-1.5">
            <div className={dotClasses} />
            <div className={`${dotClasses} self-end`} />
          </div>
        );
      case 3:
        return (
          <div className="flex justify-between w-full h-full p-1.5">
            <div className={dotClasses} />
            <div className={`${dotClasses} self-center`} />
            <div className={`${dotClasses} self-end`} />
          </div>
        );
      case 4:
        return (
          <div className="grid grid-cols-2 gap-1.5 w-full h-full p-1.5">
            <div className={dotClasses} />
            <div className={`${dotClasses} justify-self-end`} />
            <div className={`${dotClasses} self-end`} />
            <div className={`${dotClasses} self-end justify-self-end`} />
          </div>
        );
      case 5:
        return (
          <div className="relative w-full h-full p-1.5">
            <div className="absolute top-1.5 left-1.5"><div className={dotClasses} /></div>
            <div className="absolute top-1.5 right-1.5"><div className={dotClasses} /></div>
            <div className="absolute inset-0 flex items-center justify-center"><div className={dotClasses} /></div>
            <div className="absolute bottom-1.5 left-1.5"><div className={dotClasses} /></div>
            <div className="absolute bottom-1.5 right-1.5"><div className={dotClasses} /></div>
          </div>
        );
      case 6:
        return (
          <div className="grid grid-cols-2 grid-rows-3 gap-1 w-full h-full p-1.5">
            <div className={dotClasses} />
            <div className={`${dotClasses} justify-self-end`} />
            <div className={dotClasses} />
            <div className={`${dotClasses} justify-self-end`} />
            <div className={dotClasses} />
            <div className={`${dotClasses} justify-self-end`} />
          </div>
        );
      default:
        return (
          <div className="flex items-center justify-center w-full h-full text-slate-400 font-bold text-sm">
            ?
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col items-center select-none shrink-0">
      <div className="relative flex items-center justify-center">
        {/* SVG Circular Countdown Timer */}
        <svg className="w-14 h-14 sm:w-16 sm:h-16 md:w-18 md:h-18 -rotate-90 transform" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="44"
            className="stroke-slate-800"
            strokeWidth="6"
            fill="transparent"
          />
          <circle
            cx="50"
            cy="50"
            r="44"
            stroke={activeColorTheme.ring}
            strokeWidth="6"
            fill="transparent"
            strokeDasharray={276}
            strokeDashoffset={276 - (276 * timerPercent) / 100}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.8s linear' }}
          />
        </svg>

        {/* Interactive 3D Dice Box */}
        <button
          onClick={handleRollClick}
          disabled={!isMyTurn || status !== 'waiting_roll' || disabled}
          aria-label="Roll Dice"
          className={`absolute w-10 h-10 sm:w-11 sm:h-11 md:w-13 md:h-13 rounded-lg md:rounded-xl bg-gradient-to-br from-white via-slate-100 to-slate-200 shadow-xl border-2 border-white/80 flex items-center justify-center cursor-pointer transition-all duration-200 active:scale-95 ${
            isMyTurn && status === 'waiting_roll'
              ? 'ring-3 md:ring-4 ring-offset-2 ring-offset-slate-950 animate-pulse hover:scale-105'
              : 'opacity-90'
          } ${
            isRollingAnimation ? 'rotate-[360deg] scale-110' : ''
          }`}
          style={{
            boxShadow:
              isMyTurn && status === 'waiting_roll'
                ? `0 0 18px ${activeColorTheme.glow}`
                : '0 4px 12px rgba(0,0,0,0.4)',
          }}
        >
          {isRollingAnimation ? (
            <div className="text-xl animate-spin">🎲</div>
          ) : (
            renderDiceDots(value ?? 6)
          )}
        </button>
      </div>

      {/* Turn & Status Label */}
      <div className="mt-1 flex flex-col items-center">
        {isMyTurn ? (
          status === 'waiting_roll' ? (
            <button
              onClick={handleRollClick}
              className={`px-2.5 py-0.5 rounded-full text-[10px] md:text-xs font-black text-white uppercase tracking-wider ${activeColorTheme.badge} shadow-md animate-bounce`}
            >
              TAP TO ROLL
            </button>
          ) : status === 'waiting_move' ? (
            <span className="px-2 py-0.5 rounded-full text-[9px] md:text-[10px] font-bold text-amber-300 bg-amber-950/80 border border-amber-500/40 animate-pulse whitespace-nowrap">
              Pick Token
            </span>
          ) : (
            <span className="text-[9px] text-slate-400 font-semibold">Moving...</span>
          )
        ) : (
          <span className="text-[9px] md:text-[10px] text-slate-400 font-medium whitespace-nowrap">
            <span className="capitalize font-bold text-slate-200">{currentColor}</span>'s turn
          </span>
        )}
      </div>
    </div>
  );
};
