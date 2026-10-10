import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Award, Coins, Flame, Share2, Sparkles, Trophy, X } from 'lucide-react';
import { GameMode, Player, PlayerColor } from '../types';
import { soundEffects } from '../audio/soundEffects';
import { VictoryConfetti } from './VictoryConfetti';

interface GameResultModalProps {
  winnerColor: PlayerColor | null;
  winningTeam?: 1 | 2;
  rankings: PlayerColor[];
  players: Player[];
  mode: GameMode;
  userPlayer: Player;
  rewards: { xpEarned: number; coinsEarned: number };
  durationSeconds: number;
  onContinue: () => void;
}

export const GameResultModal: React.FC<GameResultModalProps> = ({
  winnerColor,
  winningTeam,
  players,
  mode,
  userPlayer,
  rewards,
  durationSeconds,
  onContinue,
}) => {
  const isWinner =
    mode === 'team_2v2'
      ? userPlayer.team === winningTeam
      : userPlayer.color === winnerColor;

  useEffect(() => {
    if (isWinner) {
      soundEffects.playVictory();
      // Fire confetti burst
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
        setTimeout(() => {
          confetti({
            particleCount: 50,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
          });
          confetti({
            particleCount: 50,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
          });
        }, 350);
      } catch {}
    }
  }, [isWinner]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  };

  const sortedPlayers = [...players].sort((a, b) => {
    if (a.hasFinished && b.hasFinished) {
      return (a.finishRank || 99) - (b.finishRank || 99);
    }
    if (a.hasFinished) return -1;
    if (b.hasFinished) return 1;
    return b.tokensHome - a.tokensHome;
  });

  return (
    <>
      {isWinner && <VictoryConfetti winnerName={userPlayer.name} />}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-300">
        <div className="relative w-full max-w-md bg-gradient-to-b from-slate-900 to-indigo-950 border border-indigo-500/40 rounded-3xl p-6 shadow-2xl overflow-hidden">
        {/* Glow ambient background */}
        <div
          className={`absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full blur-3xl opacity-30 ${
            isWinner ? 'bg-amber-400' : 'bg-indigo-500'
          }`}
        />

        {/* Top Header & Trophy */}
        <div className="relative flex flex-col items-center text-center">
          <div
            className={`w-20 h-20 rounded-3xl flex items-center justify-center shadow-xl mb-3 border-2 ${
              isWinner
                ? 'bg-gradient-to-br from-amber-400 to-yellow-600 border-amber-300 shadow-amber-500/30'
                : 'bg-gradient-to-br from-slate-800 to-indigo-900 border-indigo-400/30'
            }`}
          >
            {isWinner ? (
              <Trophy className="w-10 h-10 text-white animate-bounce" />
            ) : (
              <Award className="w-10 h-10 text-indigo-300" />
            )}
          </div>

          <h2 className="text-2xl md:text-3xl font-black text-white tracking-wide">
            {isWinner ? 'VICTORY!' : 'MATCH COMPLETED'}
          </h2>
          <p className="text-xs md:text-sm font-semibold text-slate-300 mt-1">
            {isWinner
              ? 'You conquered the board!'
              : 'Great match! Keep climbing the ranks.'}
          </p>
        </div>

        {/* Reward Cards */}
        <div className="grid grid-cols-2 gap-3 my-5">
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-800/80 border border-indigo-500/30">
            <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
              <Coins className="w-5 h-5" />
            </div>
            <div className="text-left">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Coins Won
              </span>
              <span className="text-lg font-black text-amber-300">
                +{rewards.coinsEarned}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-800/80 border border-indigo-500/30">
            <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="text-left">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                NOOB XP
              </span>
              <span className="text-lg font-black text-indigo-300">
                +{rewards.xpEarned}
              </span>
            </div>
          </div>
        </div>

        {/* Ranking List */}
        <div className="bg-slate-950/60 rounded-2xl p-3 border border-slate-800/80 mb-5">
          <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">
            <span>Player</span>
            <div className="flex gap-4">
              <span>Home</span>
              <span>Kills</span>
            </div>
          </div>

          <div className="space-y-1.5">
            {sortedPlayers.map((p, idx) => (
              <div
                key={p.id}
                className={`flex items-center justify-between p-2 rounded-xl text-xs ${
                  p.id === userPlayer.id
                    ? 'bg-indigo-600/30 border border-indigo-500/40'
                    : 'bg-slate-900/60'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`font-black text-xs w-4 ${
                      idx === 0
                        ? 'text-amber-400'
                        : idx === 1
                        ? 'text-slate-300'
                        : idx === 2
                        ? 'text-amber-600'
                        : 'text-slate-500'
                    }`}
                  >
                    #{idx + 1}
                  </span>
                  <img
                    src={p.avatar}
                    alt={p.name}
                    className="w-6 h-6 rounded-full object-cover"
                  />
                  <span className="font-extrabold text-white truncate max-w-[120px]">
                    {p.name} {p.id === userPlayer.id && '(You)'}
                  </span>
                </div>

                <div className="flex items-center gap-6 font-bold text-slate-300 text-xs">
                  <span className="text-amber-400">{p.tokensHome}/4</span>
                  <span className="text-red-400">{p.capturedCount || 0}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 pt-2 border-t border-slate-800/80 flex justify-between items-center text-[11px] text-slate-400">
            <span>Duration: {formatDuration(durationSeconds)}</span>
            <span className="capitalize font-semibold text-slate-300">
              Mode: {mode.replace('_', ' ')}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <button
          onClick={() => {
            soundEffects.playButtonClick();
            onContinue();
          }}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-extrabold text-sm shadow-lg shadow-indigo-500/25 transition-all active:scale-95 cursor-pointer"
        >
          <span>CONTINUE</span>
        </button>
      </div>
    </div>
    </>
  );
};
