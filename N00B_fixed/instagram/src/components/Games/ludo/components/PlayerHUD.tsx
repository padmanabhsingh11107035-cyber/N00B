import React from 'react';
import { Player, PlayerColor } from '../types';
import { initialAvatar } from '../avatars';

interface PlayerHUDProps {
  player: Player;
  isCurrentTurn: boolean;
  isLocalUser: boolean;
  activeEmote?: string;
  targetTokensHome: number;
}

export const PlayerHUD: React.FC<PlayerHUDProps> = ({
  player,
  isCurrentTurn,
  isLocalUser,
  activeEmote,
  targetTokensHome,
}) => {
  const colorBorders: Record<PlayerColor, string> = {
    red: 'border-red-500 shadow-red-500/20',
    green: 'border-emerald-500 shadow-emerald-500/20',
    yellow: 'border-amber-500 shadow-amber-500/20',
    blue: 'border-blue-500 shadow-blue-500/20',
    purple: 'border-purple-500 shadow-purple-500/20',
    orange: 'border-orange-500 shadow-orange-500/20',
  };

  const colorTags: Record<PlayerColor, string> = {
    red: 'bg-red-500/20 text-red-400 border-red-500/30',
    green: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    yellow: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    purple: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    orange: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  };

  return (
    <div className="relative flex flex-col items-center shrink-0">
      {/* Floating Animated Emote Bubble */}
      {activeEmote && (
        <div className="absolute -top-9 z-50 bg-slate-900/95 text-white text-[11px] md:text-xs font-black px-2.5 py-1 rounded-xl border border-indigo-400/50 shadow-2xl animate-bounce backdrop-blur-md flex items-center gap-1 whitespace-nowrap">
          <span>{activeEmote}</span>
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 border-r border-b border-indigo-400/50 rotate-45" />
        </div>
      )}

      {/* Main HUD Card */}
      <div
        className={`relative flex items-center gap-1 md:gap-1.5 p-1 md:p-1.5 rounded-xl md:rounded-2xl border transition-all duration-300 bg-slate-900/90 backdrop-blur-md shadow-md max-w-[125px] sm:max-w-[145px] md:max-w-[165px] min-w-0 ${
          isCurrentTurn
            ? `${colorBorders[player.color]} ring-2 ring-offset-1 ring-offset-slate-950 scale-102 z-30`
            : 'border-slate-800 opacity-90'
        }`}
      >
        {/* Avatar with Turn Ring */}
        <div className="relative shrink-0">
          <img
            src={player.avatar || initialAvatar(player.name, player.color)}
            alt={player.name}
            className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full object-cover border border-white/20"
          />
          {/* Color Indicator Badge */}
          <span
            className="absolute -bottom-0.5 -right-0.5 w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full border border-slate-900 shadow"
            style={{
              backgroundColor:
                player.color === 'red'
                  ? '#ef4444'
                  : player.color === 'green'
                  ? '#10b981'
                  : player.color === 'yellow'
                  ? '#eab308'
                  : player.color === 'blue'
                  ? '#3b82f6'
                  : player.color === 'purple'
                  ? '#a855f7'
                  : '#f97316',
            }}
          />
        </div>

        {/* Player Info */}
        <div className="flex flex-col text-left min-w-0 overflow-hidden">
          <div className="flex items-center gap-0.5 sm:gap-1 min-w-0">
            <span className="text-[10px] sm:text-[11px] md:text-xs font-black text-white truncate">
              {player.name}
            </span>
            {isLocalUser && (
              <span className="text-[7px] sm:text-[8px] px-0.5 sm:px-1 py-0.2 bg-indigo-500/30 text-indigo-300 rounded font-bold shrink-0">
                YOU
              </span>
            )}
          </div>

          <div className="flex items-center gap-0.5 sm:gap-1 mt-0.5 min-w-0">
            <span className={`text-[7px] sm:text-[8px] md:text-[9px] font-bold px-1 py-0.2 rounded border ${colorTags[player.color]} shrink-0 truncate`}>
              {player.isBot ? `BOT ${player.botDifficulty?.[0].toUpperCase() || ''}` : `Lv.${player.level}`}
            </span>
            {player.team && (
              <span className="text-[7px] sm:text-[8px] font-black text-indigo-300 bg-indigo-950 px-0.5 sm:px-1 rounded shrink-0">
                T{player.team}
              </span>
            )}
          </div>

          {/* Tokens Home Progress Dots */}
          <div className="flex items-center gap-0.5 mt-0.5">
            {Array.from({ length: targetTokensHome }).map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full border transition-colors ${
                  i < player.tokensHome
                    ? 'bg-amber-400 border-amber-300 shadow-sm shadow-amber-300'
                    : 'bg-slate-800 border-slate-700'
                }`}
                title={`Token ${i + 1} Home`}
              />
            ))}
            <span className="text-[8px] font-semibold text-slate-400 ml-0.5">
              {player.tokensHome}/{targetTokensHome}
            </span>
          </div>
        </div>

        {/* Finishing Crown / Rank Badge */}
        {player.hasFinished && (
          <div className="ml-0.5 flex items-center justify-center bg-amber-500/20 border border-amber-400/40 rounded-lg px-1 py-0.2 shrink-0">
            <span className="text-[9px] sm:text-[10px] font-black text-amber-300">
              #{player.finishRank || 1}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
