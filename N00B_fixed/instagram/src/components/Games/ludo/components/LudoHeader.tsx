import React, { useState } from 'react';
import { ArrowLeft, BookOpen, Flag, RefreshCw, Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react';
import { soundEffects } from '../audio/soundEffects';

interface LudoHeaderProps {
  roomId: string;
  gameMode: string;
  matchDurationSeconds: number;
  isReconnecting: boolean;
  onExit: () => void;
  onOpenRules: () => void;
}

export const LudoHeader: React.FC<LudoHeaderProps> = ({
  roomId,
  gameMode,
  matchDurationSeconds,
  isReconnecting,
  onExit,
  onOpenRules,
}) => {
  const [isMuted, setIsMuted] = useState(() => soundEffects.getIsMuted());
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const handleToggleSound = () => {
    const nextMuted = soundEffects.toggleMute();
    setIsMuted(nextMuted);
  };

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full flex flex-col gap-1.5 select-none">
      {/* Reconnect Banner */}
      {isReconnecting && (
        <div className="w-full bg-amber-500/20 border border-amber-400/40 text-amber-200 text-xs font-bold py-1.5 px-3 rounded-xl flex items-center justify-center gap-2 animate-pulse">
          <WifiOff className="w-3.5 h-3.5" />
          <span>Connection lost — reconnecting to match...</span>
        </div>
      )}

      {/* Main Bar */}
      <div className="flex items-center justify-between px-2 py-1.5 md:px-4 md:py-2 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-md">
        {/* Left: Back & Room Info */}
        <div className="flex items-center gap-2 md:gap-3">
          <button
            onClick={() => {
              soundEffects.playButtonClick();
              setShowExitConfirm(true);
            }}
            className="p-1.5 md:p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
            aria-label="Exit Game"
          >
            <ArrowLeft className="w-4 h-4 md:w-5 md:h-5" />
          </button>

          <div className="text-left">
            <span className="text-[10px] md:text-xs font-bold text-slate-400 capitalize block">
              {gameMode.replace('_', ' ')}
            </span>
            <span className="text-xs md:text-sm font-black text-white font-mono">
              #{roomId.slice(-6).toUpperCase()}
            </span>
          </div>
        </div>

        {/* Center: Match Clock */}
        <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-slate-950/80 border border-slate-800 text-xs md:text-sm font-mono font-black text-amber-300">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span>{formatTimer(matchDurationSeconds)}</span>
        </div>

        {/* Right: Audio, Rules, Forfeit */}
        <div className="flex items-center gap-1.5 md:gap-2">
          <button
            onClick={handleToggleSound}
            className={`p-1.5 md:p-2 rounded-xl border transition-all cursor-pointer ${
              isMuted
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
            aria-label={isMuted ? 'Unmute Sound' : 'Mute Sound'}
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4 md:w-5 md:h-5" />
            ) : (
              <Volume2 className="w-4 h-4 md:w-5 md:h-5" />
            )}
          </button>

          <button
            onClick={() => {
              soundEffects.playButtonClick();
              onOpenRules();
            }}
            className="p-1.5 md:p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all cursor-pointer"
            aria-label="Rules"
          >
            <BookOpen className="w-4 h-4 md:w-5 md:h-5" />
          </button>

          <button
            onClick={() => {
              soundEffects.playButtonClick();
              setShowExitConfirm(true);
            }}
            className="p-1.5 md:p-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 transition-all cursor-pointer"
            aria-label="Forfeit"
          >
            <Flag className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        </div>
      </div>

      {/* Exit Confirmation Modal */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-rose-500/40 rounded-3xl p-5 text-center shadow-2xl">
            <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
              <Flag className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-black text-white">Leave Match?</h3>
            <p className="text-xs text-slate-400 my-2">
              Leaving the current game will forfeit your tokens and count as a loss.
            </p>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <button
                onClick={() => setShowExitConfirm(false)}
                className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
              >
                Keep Playing
              </button>
              <button
                onClick={() => {
                  setShowExitConfirm(false);
                  onExit();
                }}
                className="py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs shadow-lg"
              >
                Leave Match
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
