import React, { useState } from 'react';
import {
  Bot,
  Sparkles,
  Smartphone,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { BotDifficulty, GameMode } from '../types';
import { soundEffects } from '../audio/soundEffects';

interface ModeSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMode: (mode: GameMode, options?: { playerCount?: number; difficulty?: BotDifficulty }) => void;
}

export const ModeSelectModal: React.FC<ModeSelectModalProps> = ({
  isOpen,
  onClose,
  onSelectMode,
}) => {
  const [selectedBotDifficulty, setSelectedBotDifficulty] = useState<BotDifficulty>('medium');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl max-h-[92vh] bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-950 border border-indigo-500/40 rounded-3xl p-5 md:p-6 shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🎲</span>
              <h2 className="text-xl md:text-2xl font-black text-white tracking-wide">
                SELECT GAME MODE
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Choose your match type and play immediately
            </p>
          </div>
          <button
            onClick={() => {
              soundEffects.playButtonClick();
              onClose();
            }}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 6 Required Core Game Modes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          {/* 1. LOCAL 2 PLAYER */}
          <div
            onClick={() => {
              soundEffects.playButtonClick();
              onSelectMode('local_pass_play', { playerCount: 2 });
            }}
            className="p-4 rounded-2xl bg-gradient-to-br from-indigo-950/80 to-slate-900 border border-indigo-500/30 hover:border-indigo-400 hover:scale-[1.02] transition-all cursor-pointer group flex items-start gap-3 shadow-lg"
          >
            <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 group-hover:scale-110 transition-transform">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="font-black text-white text-sm">1. LOCAL 2 PLAYER</span>
                <span className="text-[10px] bg-indigo-500/30 text-indigo-300 px-1.5 py-0.2 rounded font-bold">
                  2P
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Pass-and-play duel on this device. Red vs Green.
              </p>
            </div>
          </div>

          {/* 2. LOCAL 3 PLAYER */}
          <div
            onClick={() => {
              soundEffects.playButtonClick();
              onSelectMode('local_pass_play', { playerCount: 3 });
            }}
            className="p-4 rounded-2xl bg-gradient-to-br from-indigo-950/80 to-slate-900 border border-indigo-500/30 hover:border-indigo-400 hover:scale-[1.02] transition-all cursor-pointer group flex items-start gap-3 shadow-lg"
          >
            <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 group-hover:scale-110 transition-transform">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="font-black text-white text-sm">2. LOCAL 3 PLAYER</span>
                <span className="text-[10px] bg-indigo-500/30 text-indigo-300 px-1.5 py-0.2 rounded font-bold">
                  3P
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Pass-and-play match for 3 players. Red, Green, Yellow.
              </p>
            </div>
          </div>

          {/* 3. LOCAL 4 PLAYER */}
          <div
            onClick={() => {
              soundEffects.playButtonClick();
              onSelectMode('local_pass_play', { playerCount: 4 });
            }}
            className="p-4 rounded-2xl bg-gradient-to-br from-indigo-950/80 to-slate-900 border border-indigo-500/30 hover:border-indigo-400 hover:scale-[1.02] transition-all cursor-pointer group flex items-start gap-3 shadow-lg"
          >
            <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 group-hover:scale-110 transition-transform">
              <Users className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="font-black text-white text-sm">3. LOCAL 4 PLAYER</span>
                <span className="text-[10px] bg-indigo-500/30 text-indigo-300 px-1.5 py-0.2 rounded font-bold">
                  4P
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Full 4-player pass-and-play. Red, Green, Yellow, Blue.
              </p>
            </div>
          </div>

          {/* 4. VS COMPUTER */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-950/60 to-slate-900 border border-emerald-500/40 hover:border-emerald-400 transition-all shadow-lg flex flex-col justify-between">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400">
                <Bot className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-black text-white text-sm">4. VS COMPUTER</span>
                  <span className="text-[10px] bg-emerald-500/30 text-emerald-300 px-1.5 py-0.2 rounded font-bold">
                    SOLO AI
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 mb-2">
                  Solo practice against 3 algorithmic AI bots.
                </p>

                {/* AI Difficulty Selector */}
                <div className="flex gap-1.5 mb-2.5">
                  {(['easy', 'medium', 'hard'] as BotDifficulty[]).map((diff) => (
                    <button
                      key={diff}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        soundEffects.playButtonClick();
                        setSelectedBotDifficulty(diff);
                      }}
                      className={`flex-1 py-1 text-[10px] font-black rounded-lg uppercase transition-all cursor-pointer ${
                        selectedBotDifficulty === diff
                          ? 'bg-emerald-500 text-slate-950 shadow-md'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {diff}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => {
                    soundEffects.playButtonClick();
                    onSelectMode('vs_computer', { difficulty: selectedBotDifficulty, playerCount: 4 });
                  }}
                  className="w-full py-1.5 text-xs font-black text-center bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow cursor-pointer transition-all"
                >
                  PLAY VS {selectedBotDifficulty.toUpperCase()} AI
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
