import React, { useState } from 'react';
import { CheckCircle2, ChevronRight, Coins, Flame, Sparkles, Target, Trophy, X } from 'lucide-react';
import { Mission } from '../types';
import { soundEffects } from '../audio/soundEffects';
import { ludoStorage, UserProfile } from '../services/ludoStorage';

interface DailyMissionsProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  onProfileUpdated?: (profile: UserProfile) => void;
}

export const DailyMissions: React.FC<DailyMissionsProps> = ({
  isOpen,
  onClose,
  profile,
  onProfileUpdated,
}) => {
  const [missions, setMissions] = useState<Mission[]>(() => ludoStorage.getMissions());
  const [justClaimedId, setJustClaimedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleClaim = (missionId: string) => {
    soundEffects.playButtonClick();
    const success = ludoStorage.claimMissionReward(missionId);
    if (success) {
      soundEffects.playHomeReached();
      setJustClaimedId(missionId);
      const updatedMissions = ludoStorage.getMissions();
      setMissions(updatedMissions);
      const updatedProfile = ludoStorage.getProfile();
      onProfileUpdated?.(updatedProfile);
      setTimeout(() => setJustClaimedId(null), 1200);
    }
  };

  const completedCount = missions.filter((m) => m.completed).length;
  const claimedCount = missions.filter((m) => m.claimed).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg max-h-[92vh] bg-gradient-to-b from-zinc-900 via-zinc-950 to-zinc-950 border border-amber-500/30 rounded-3xl p-5 md:p-6 shadow-2xl overflow-y-auto">
        {/* Ambient Top Glow */}
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-72 h-36 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="relative flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/20 font-black">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg md:text-xl font-black text-white tracking-wide">
                  DAILY MISSIONS
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-extrabold border border-amber-500/30">
                  RESET IN 14H
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                Complete quests to earn bonus Coins and NOOB XP
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              soundEffects.playButtonClick();
              onClose();
            }}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Overview Stats Bar */}
        <div className="my-4 p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-slate-300">Daily Quest Progress</span>
          </div>
          <span className="text-xs font-black text-amber-400">
            {completedCount}/{missions.length} Ready ({claimedCount} Claimed)
          </span>
        </div>

        {/* Missions List */}
        <div className="space-y-3">
          {missions.map((mission) => {
            const percent = Math.min(100, Math.round((mission.progress / mission.target) * 100));
            const isReadyToClaim = mission.completed && !mission.claimed;

            return (
              <div
                key={mission.id}
                className={`relative p-3.5 md:p-4 rounded-2xl border transition-all duration-300 ${
                  mission.claimed
                    ? 'bg-slate-950/40 border-slate-800/50 opacity-70'
                    : isReadyToClaim
                    ? 'bg-gradient-to-r from-amber-950/30 via-slate-900/90 to-slate-900 border-amber-500/50 shadow-lg shadow-amber-500/5'
                    : 'bg-slate-900/70 border-slate-800/80'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-extrabold text-sm text-white">{mission.title}</h3>
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded font-black tracking-wider bg-slate-800 text-slate-400">
                        {mission.type}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300/80 mt-0.5">{mission.description}</p>
                  </div>

                  {/* Action Button or Done Badge */}
                  <div className="shrink-0">
                    {mission.claimed ? (
                      <div className="flex items-center gap-1 text-[11px] font-black text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2.5 py-1 rounded-xl">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        CLAIMED
                      </div>
                    ) : isReadyToClaim ? (
                      <button
                        onClick={() => handleClaim(mission.id)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-black bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-slate-950 shadow-lg shadow-amber-500/20 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 ${
                          justClaimedId === mission.id ? 'scale-105 ring-2 ring-amber-300' : ''
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5 fill-current" />
                        CLAIM
                      </button>
                    ) : (
                      <span className="text-xs font-black text-slate-400 px-2 py-1 rounded-lg bg-slate-800/60">
                        {mission.progress}/{mission.target}
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress Track */}
                <div className="w-full h-2 rounded-full bg-slate-800/80 overflow-hidden relative my-2">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      mission.completed
                        ? 'bg-gradient-to-r from-amber-400 to-emerald-400'
                        : 'bg-gradient-to-r from-indigo-500 to-amber-500'
                    }`}
                    style={{ width: `${percent}%` }}
                  />
                </div>

                {/* Rewards and Percentage row */}
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-slate-400">{percent}% Completed</span>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-amber-300">
                      <Coins className="w-3.5 h-3.5" />
                      +{mission.rewardCoins}
                    </span>
                    <span className="flex items-center gap-1 text-indigo-300">
                      <Sparkles className="w-3.5 h-3.5" />
                      +{mission.rewardXp} XP
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
