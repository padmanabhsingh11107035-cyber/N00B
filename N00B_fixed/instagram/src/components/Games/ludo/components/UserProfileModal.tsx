import React, { useState } from 'react';
import {
  Award,
  CheckCircle,
  Coins,
  Flame,
  History,
  Shield,
  Sparkles,
  Trophy,
  User,
  X,
} from 'lucide-react';
import { soundEffects } from '../audio/soundEffects';
import { ludoStorage, UserProfile } from '../services/ludoStorage';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  onProfileUpdated: (updated: UserProfile) => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  profile,
  onProfileUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'stats' | 'achievements' | 'history'>('stats');
  const [achievements, setAchievements] = useState(() => ludoStorage.getAchievements());
  const matchHistory = ludoStorage.getMatchHistory();

  if (!isOpen) return null;

  const winRate =
    profile.stats.gamesPlayed > 0
      ? Math.round((profile.stats.gamesWon / profile.stats.gamesPlayed) * 100)
      : 0;

  const handleClaimAchievement = (achId: string) => {
    soundEffects.playButtonClick();
    const success = ludoStorage.claimAchievementReward(achId);
    if (success) {
      soundEffects.playHomeReached();
      setAchievements(ludoStorage.getAchievements());
      onProfileUpdated(ludoStorage.getProfile());
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-xl max-h-[90vh] bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-950 border border-indigo-500/40 rounded-3xl p-5 md:p-6 shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-indigo-400" />
            <h2 className="text-xl font-black text-white">LUDO PROFILE</h2>
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

        {/* User Card Overview */}
        <div className="my-4 p-4 rounded-2xl bg-gradient-to-r from-indigo-900/40 to-purple-900/40 border border-indigo-500/30 flex items-center gap-4">
          <div className="relative">
            <img
              src={profile.avatar}
              alt={profile.username}
              className="w-16 h-16 rounded-2xl object-cover border-2 border-indigo-400 shadow-xl"
            />
            <span className="absolute -bottom-2 -right-2 px-1.5 py-0.5 rounded-md bg-amber-400 text-slate-950 text-[10px] font-black shadow">
              Lv.{profile.level}
            </span>
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-black text-white">{profile.username}</h3>
            </div>

            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                <Coins className="w-4 h-4" />
                <span>{profile.coins.toLocaleString()} Coins</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-300">
                <Sparkles className="w-4 h-4" />
                <span>{profile.xp.toLocaleString()} XP</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-3 gap-2 my-4 p-1 rounded-2xl bg-slate-950 border border-slate-800">
          {(
            [
              { id: 'stats', label: 'Career Stats' },
              { id: 'achievements', label: 'Achievements' },
              { id: 'history', label: 'History' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                soundEffects.playButtonClick();
                setActiveTab(tab.id);
              }}
              className={`py-2 text-xs font-black rounded-xl transition-all cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab 1: Stats */}
        {activeTab === 'stats' && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2.5">
              <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 text-center">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">
                  Win Rate
                </span>
                <span className="text-xl font-black text-emerald-400 mt-1 block">
                  {winRate}%
                </span>
                <span className="text-[10px] text-slate-500">
                  {profile.stats.gamesWon}/{profile.stats.gamesPlayed} Matches
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 text-center">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">
                  Best Streak
                </span>
                <span className="text-xl font-black text-amber-400 mt-1 block flex items-center justify-center gap-1">
                  <Flame className="w-4 h-4" />
                  {profile.stats.bestWinStreak}
                </span>
                <span className="text-[10px] text-slate-500">
                  Current: {profile.stats.currentWinStreak}
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 text-center">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">
                  Tokens Captured
                </span>
                <span className="text-xl font-black text-red-400 mt-1 block">
                  {profile.stats.tokensCaptured}
                </span>
                <span className="text-[10px] text-slate-500">
                  {profile.stats.tokensHome} tokens home
                </span>
              </div>
            </div>

            {/* Mode breakdown breakdown */}
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
              <span className="text-xs font-black text-slate-300 uppercase tracking-wider block mb-3">
                Victories By Game Mode
              </span>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between p-2 rounded-xl bg-slate-950/70 border border-slate-800">
                  <span className="text-slate-400">Classic Ludo</span>
                  <span className="font-extrabold text-white">
                    {profile.stats.classicWins} Wins
                  </span>
                </div>
                <div className="flex justify-between p-2 rounded-xl bg-slate-950/70 border border-slate-800">
                  <span className="text-slate-400">Quick Ludo</span>
                  <span className="font-extrabold text-white">
                    {profile.stats.quickWins} Wins
                  </span>
                </div>
                <div className="flex justify-between p-2 rounded-xl bg-slate-950/70 border border-slate-800">
                  <span className="text-slate-400">Team Up 2v2</span>
                  <span className="font-extrabold text-white">
                    {profile.stats.teamWins} Wins
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Achievements */}
        {activeTab === 'achievements' && (
          <div className="space-y-2.5">
            {achievements.map((ach) => (
              <div
                key={ach.id}
                className={`p-3 rounded-2xl border flex items-center justify-between transition-all ${
                  ach.unlocked
                    ? 'bg-indigo-950/40 border-indigo-500/40'
                    : 'bg-slate-900/60 border-slate-800/80 opacity-70'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="text-2xl">{ach.icon}</div>
                  <div>
                    <span className="text-xs font-black text-white block">
                      {ach.title}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {ach.description}
                    </span>
                  </div>
                </div>

                <div>
                  {ach.claimed ? (
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-black flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> CLAIMED
                    </span>
                  ) : ach.unlocked ? (
                    <button
                      onClick={() => handleClaimAchievement(ach.id)}
                      className="px-3 py-1 rounded-xl text-xs font-black bg-amber-400 hover:bg-amber-300 text-slate-950 transition-all shadow cursor-pointer animate-pulse"
                    >
                      CLAIM
                    </button>
                  ) : (
                    <span className="text-xs font-bold text-slate-500">
                      {ach.progress}/{ach.maxProgress}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 3: History */}
        {activeTab === 'history' && (
          <div className="space-y-2">
            {matchHistory.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                No matches played yet. Roll the dice to begin your journey!
              </div>
            ) : (
              matchHistory.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 rounded-2xl bg-slate-900/80 border border-slate-800 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-black text-xs uppercase px-1.5 py-0.2 rounded ${
                          item.result === 'won'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {item.result.toUpperCase()}
                      </span>
                      <span className="font-extrabold text-white capitalize">
                        {item.mode.replace('_', ' ')}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      {item.date} • Rank #{item.rank}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="font-bold text-amber-300 text-xs block">
                      +{item.coinsEarned} Coins
                    </span>
                    <span className="text-[10px] text-indigo-300 font-semibold">
                      +{item.xpEarned} XP
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
