import React, { useState } from 'react';
import { Calendar, CheckCircle, Coins, Gift, Sparkles, Target, X } from 'lucide-react';
import { Mission } from '../types';
import { soundEffects } from '../audio/soundEffects';
import { ludoStorage, UserProfile } from '../services/ludoStorage';

interface DailyRewardsModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  onProfileUpdated: (updated: UserProfile) => void;
}

export const DailyRewardsModal: React.FC<DailyRewardsModalProps> = ({
  isOpen,
  onClose,
  profile,
  onProfileUpdated,
}) => {
  const [missions, setMissions] = useState<Mission[]>(() => ludoStorage.getMissions());
  const [dailyClaimSuccess, setDailyClaimSuccess] = useState(false);

  if (!isOpen) return null;

  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const canClaimDaily = now - profile.lastDailyClaimTimestamp >= oneDayMs;

  const handleClaimDaily = () => {
    soundEffects.playButtonClick();
    const result = ludoStorage.claimDailyReward();
    if (result.claimed) {
      soundEffects.playHomeReached();
      setDailyClaimSuccess(true);
      onProfileUpdated(ludoStorage.getProfile());
    }
  };

  const handleClaimMission = (missionId: string) => {
    soundEffects.playButtonClick();
    const success = ludoStorage.claimMissionReward(missionId);
    if (success) {
      soundEffects.playHomeReached();
      setMissions(ludoStorage.getMissions());
      onProfileUpdated(ludoStorage.getProfile());
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-lg max-h-[90vh] bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-950 border border-indigo-500/40 rounded-3xl p-5 md:p-6 shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Gift className="w-5 h-5 text-amber-400" />
            <h2 className="text-xl font-black text-white">REWARDS & MISSIONS</h2>
          </div>
          <button
            onClick={() => {
              soundEffects.playButtonClick();
              onClose();
            }}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Daily Login Banner */}
        <div className="my-4 p-4 rounded-2xl bg-gradient-to-r from-amber-500/20 via-indigo-500/20 to-purple-500/20 border border-amber-500/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-300">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <span className="text-sm font-black text-white block">
                Daily Check-In Reward
              </span>
              <span className="text-xs text-amber-300 font-bold">
                +200 Coins & +100 XP
              </span>
            </div>
          </div>

          <button
            onClick={handleClaimDaily}
            disabled={!canClaimDaily}
            className={`px-4 py-2 rounded-xl text-xs font-black shadow-lg transition-all cursor-pointer ${
              canClaimDaily
                ? 'bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 hover:scale-105 active:scale-95'
                : 'bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed opacity-60'
            }`}
          >
            {canClaimDaily ? 'CLAIM' : 'CLAIMED'}
          </button>
        </div>

        {/* Mission Progress List */}
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-black uppercase text-indigo-300 tracking-wider">
            <Target className="w-4 h-4" />
            Active Missions
          </div>

          {missions.map((mission) => {
            const percent = Math.min(100, (mission.progress / mission.target) * 100);

            return (
              <div
                key={mission.id}
                className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-white text-xs">
                        {mission.title}
                      </span>
                      <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded font-bold uppercase">
                        {mission.type}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {mission.description}
                    </p>
                  </div>

                  {mission.claimed ? (
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-black flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> DONE
                    </span>
                  ) : mission.completed ? (
                    <button
                      onClick={() => handleClaimMission(mission.id)}
                      className="px-3 py-1 rounded-xl text-xs font-black bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-all shadow cursor-pointer animate-pulse"
                    >
                      CLAIM
                    </button>
                  ) : (
                    <span className="text-xs font-black text-slate-400">
                      {mission.progress}/{mission.target}
                    </span>
                  )}
                </div>

                {/* Progress bar */}
                <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-300"
                    style={{ width: `${percent}%` }}
                  />
                </div>

                {/* Reward pill */}
                <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400">
                  <span className="flex items-center gap-1 text-amber-300">
                    <Coins className="w-3 h-3" /> +{mission.rewardCoins}
                  </span>
                  <span className="flex items-center gap-1 text-indigo-300">
                    <Sparkles className="w-3 h-3" /> +{mission.rewardXp} XP
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
