import React, { useState } from 'react';
import {
  X,
  Trophy,
  Award,
  Sparkles,
  TrendingUp,
  ShieldCheck,
  Gamepad2,
  Share2,
  Coins,
  Star,
  Flame,
  CheckCircle2,
  Lock,
  ChevronRight,
  Info
} from 'lucide-react';
import { User } from '../../types';
import { formatNoobPoints } from '../../utils/formatPoints';
import confetti from 'canvas-confetti';

interface AccountsStatisticsModalProps {
  currentUser: User;
  onClose: () => void;
  onUserUpdated?: (user: User) => void;
}

interface BadgeItem {
  id: string;
  name: string;
  category: 'points' | 'gaming' | 'community' | 'creator';
  icon: string;
  description: string;
  requiredPoints?: number;
  requiredGames?: number;
  isUnlocked: boolean;
  unlockedDate?: string;
  rarity: 'Common' | 'Rare' | 'Epic' | 'Legendary';
}

export const AccountsStatisticsModal: React.FC<AccountsStatisticsModalProps> = ({
  currentUser,
  onClose,
  onUserUpdated
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'badges' | 'history'>('overview');
  const exactPoints = currentUser.noobPoints ?? 150;
  const gamesWon = currentUser.gamesWonCount ?? 0;
  const gamesPlayed = currentUser.gamesPlayedCount ?? 0;
  const postsCount = currentUser.postsCount ?? 0;

  // Calculate Badges
  const badges: BadgeItem[] = [
    {
      id: 'b_welcome',
      name: 'NOOB Pioneer',
      category: 'community',
      icon: '🌱',
      description: 'Joined the official NOOB social network & completed onboarding',
      isUnlocked: true,
      unlockedDate: 'Day 1',
      rarity: 'Common'
    },
    {
      id: 'b_bronze',
      name: 'Rising Star',
      category: 'points',
      icon: '🥉',
      description: 'Accumulated over 100 total NOOB Points',
      requiredPoints: 100,
      isUnlocked: exactPoints >= 100,
      unlockedDate: exactPoints >= 100 ? 'Unlocked' : undefined,
      rarity: 'Common'
    },
    {
      id: 'b_silver',
      name: 'Arcade Ace',
      category: 'points',
      icon: '🥈',
      description: 'Accumulated over 500 total NOOB Points across the platform',
      requiredPoints: 500,
      isUnlocked: exactPoints >= 500,
      unlockedDate: exactPoints >= 500 ? 'Unlocked' : undefined,
      rarity: 'Rare'
    },
    {
      id: 'b_gold',
      name: 'Cyber Champion',
      category: 'points',
      icon: '👑',
      description: 'Reached the prestigious 1k (1,000+) NOOB Points threshold',
      requiredPoints: 1000,
      isUnlocked: exactPoints >= 1000,
      unlockedDate: exactPoints >= 1000 ? 'Unlocked' : undefined,
      rarity: 'Epic'
    },
    {
      id: 'b_diamond',
      name: 'Grand Legend',
      category: 'points',
      icon: '💎',
      description: 'Amassed an astounding 2,500+ NOOB Points in the global standings',
      requiredPoints: 2500,
      isUnlocked: exactPoints >= 2500,
      unlockedDate: exactPoints >= 2500 ? 'Unlocked' : undefined,
      rarity: 'Legendary'
    },
    {
      id: 'b_gamer',
      name: 'Arena Master',
      category: 'gaming',
      icon: '🕹️',
      description: 'Competed in 5 or more multiplayer mini-game challenges',
      requiredGames: 5,
      isUnlocked: gamesPlayed >= 5,
      unlockedDate: gamesPlayed >= 5 ? 'Unlocked' : undefined,
      rarity: 'Rare'
    },
    {
      id: 'b_winner',
      name: 'Victory Royale',
      category: 'gaming',
      icon: '🏆',
      description: 'Won 3 or more high-stakes PvP arena matches',
      isUnlocked: gamesWon >= 3,
      unlockedDate: gamesWon >= 3 ? 'Unlocked' : undefined,
      rarity: 'Epic'
    },
    {
      id: 'b_creator',
      name: 'Creative Spark',
      category: 'creator',
      icon: '🎨',
      description: 'Published your first community post or reel',
      isUnlocked: postsCount >= 1,
      unlockedDate: postsCount >= 1 ? 'Unlocked' : undefined,
      rarity: 'Common'
    },
    {
      id: 'b_verified',
      name: 'Trust Anchor',
      category: 'community',
      icon: '🛡️',
      description: 'Verified creator or active community contributor',
      isUnlocked: !!currentUser.isVerified,
      unlockedDate: currentUser.isVerified ? 'Active' : undefined,
      rarity: 'Epic'
    }
  ];

  const unlockedBadgesCount = badges.filter((b) => b.isUnlocked).length;

  const handleCelebrateBadge = (badge: BadgeItem) => {
    if (badge.isUnlocked) {
      confetti({ particleCount: 30, spread: 60, origin: { y: 0.6 } });
    }
  };

  return (
    <div
      id="accounts-statistics-modal"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
    >
      <div className="w-full max-w-xl bg-zinc-950 border border-zinc-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500/20 to-yellow-400/30 border border-yellow-500/40 flex items-center justify-center text-yellow-400 shadow-sm">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Wallet
              </h2>
              <p className="text-[11px] text-zinc-400">
                Detailed points management, milestones &amp; participation badges
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1.5 rounded-full hover:bg-zinc-900 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Hero Points Card */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-yellow-500/10 via-amber-600/5 to-zinc-900 border border-yellow-500/30 p-5 shadow-lg">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-yellow-400 flex items-center gap-1.5">
                <Coins className="w-4 h-4" /> Accumulated noobPoints
              </span>
              <div className="flex items-baseline gap-2.5 mt-1">
                <span className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                  {formatNoobPoints(exactPoints)}
                </span>
                <span className="text-xs font-semibold text-zinc-400">
                  ({exactPoints.toLocaleString()} exact pts)
                </span>
              </div>
              <p className="text-xs text-zinc-300 mt-1">
                Level status:{' '}
                <span className="font-bold text-yellow-300">
                  {exactPoints >= 2500
                    ? 'Grand Legend Tier'
                    : exactPoints >= 1000
                    ? 'Cyber Champion Tier'
                    : exactPoints >= 500
                    ? 'Arcade Ace Tier'
                    : 'Pioneer Gamer Tier'}
                </span>
              </p>
            </div>

            <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-right shrink-0">
              <span className="text-[10px] text-zinc-400 uppercase font-bold block">Badges Earned</span>
              <span className="text-xl font-extrabold text-[#00FF66]">
                {unlockedBadgesCount} / {badges.length}
              </span>
            </div>
          </div>

          {/* Progress Bar towards next milestone */}
          <div className="mt-4 pt-3 border-t border-yellow-500/20">
            <div className="flex justify-between text-[11px] text-zinc-400 font-medium mb-1.5">
              <span>Next Milestone Target</span>
              <span className="text-white font-bold">
                {exactPoints < 500 ? '500 pts (Arcade Ace)' : exactPoints < 1000 ? '1,000 pts (Champion)' : '2,500 pts (Legend)'}
              </span>
            </div>
            <div className="w-full bg-zinc-800/80 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-yellow-400 to-[#00FF66] h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, Math.round((exactPoints / (exactPoints < 500 ? 500 : exactPoints < 1000 ? 1000 : 2500)) * 100))}%`
                }}
              />
            </div>
          </div>
        </div>

        {/* Sub-tab Navigation */}
        <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
          <button
            onClick={() => setActiveSubTab('overview')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'overview'
                ? 'bg-white text-black shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            📊 Activity &amp; Overview
          </button>
          <button
            onClick={() => setActiveSubTab('badges')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'badges'
                ? 'bg-white text-black shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            Badges Showcase ({unlockedBadgesCount})
          </button>
          <button
            onClick={() => setActiveSubTab('history')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'history'
                ? 'bg-white text-black shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            💳 Transactions
          </button>
        </div>

        {/* Tab 1: Overview */}
        {activeSubTab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-3">
                <span className="text-[10px] font-bold text-zinc-400 uppercase block">Gaming Won</span>
                <span className="text-xl font-black text-white block mt-1">{gamesWon}</span>
                <span className="text-[10px] text-[#00FF66] font-semibold mt-0.5 block">+50 pts / win</span>
              </div>
              <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-3">
                <span className="text-[10px] font-bold text-zinc-400 uppercase block">Matches Played</span>
                <span className="text-xl font-black text-white block mt-1">{gamesPlayed}</span>
                <span className="text-[10px] text-purple-400 font-semibold mt-0.5 block">+10 pts / game</span>
              </div>
              <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-3">
                <span className="text-[10px] font-bold text-zinc-400 uppercase block">Posts &amp; Reels</span>
                <span className="text-xl font-black text-white block mt-1">{postsCount}</span>
                <span className="text-[10px] text-cyan-400 font-semibold mt-0.5 block">+25 pts / post</span>
              </div>
              <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-3">
                <span className="text-[10px] font-bold text-zinc-400 uppercase block">Followers</span>
                <span className="text-xl font-black text-white block mt-1">{currentUser.followersCount || 0}</span>
                <span className="text-[10px] text-amber-400 font-semibold mt-0.5 block">Active Reach</span>
              </div>
            </div>

            {/* Quick Summary Banner */}
            <div className="p-3.5 bg-zinc-900/40 border border-white/5 rounded-2xl flex items-center gap-3">
              <Info className="w-5 h-5 text-[#00FF66] shrink-0" />
              <div className="text-xs text-zinc-300">
                <p className="font-semibold text-white">Real-Time Sync</p>
                <p className="text-[11px] text-zinc-400">
                  Your accumulated points update immediately whenever you win arcade challenges, share creative posts, or engage with fellow community members.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Badges Showcase */}
        {activeSubTab === 'badges' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {badges.map((b) => (
                <div
                  key={b.id}
                  onClick={() => handleCelebrateBadge(b)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                    b.isUnlocked
                      ? 'bg-zinc-900/80 border-zinc-700 hover:border-[#00FF66]/60 hover:shadow-md'
                      : 'bg-zinc-950/60 border-zinc-900 opacity-60'
                  }`}
                >
                  <div
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl shrink-0 border ${
                      b.isUnlocked
                        ? 'bg-zinc-800 border-zinc-700 shadow-sm'
                        : 'bg-zinc-900 border-zinc-800 grayscale'
                    }`}
                  >
                    {b.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <h4 className="text-xs font-bold text-white truncate">{b.name}</h4>
                      {b.isUnlocked ? (
                        <span className="text-[9px] font-extrabold text-[#00FF66] bg-[#00FF66]/10 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Unlocked
                        </span>
                      ) : (
                        <span className="text-[9px] font-semibold text-zinc-500 flex items-center gap-0.5">
                          <Lock className="w-2.5 h-2.5" /> Locked
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug line-clamp-2">
                      {b.description}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 text-[9px] text-zinc-500 font-semibold">
                      <span className="capitalize">{b.category}</span>
                      <span>•</span>
                      <span className={b.rarity === 'Legendary' ? 'text-amber-400' : b.rarity === 'Epic' ? 'text-purple-400' : 'text-zinc-400'}>
                        {b.rarity}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Earning Rules */}
        {activeSubTab === 'history' && (
          <div className="space-y-3">
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 space-y-1">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5 mb-2">
                <Coins className="w-4 h-4 text-amber-400" /> Recent Transactions
              </h4>
              {(!currentUser.noobTransactions || currentUser.noobTransactions.length === 0) ? (
                <p className="text-xs text-zinc-500 py-2">
                  No transactions yet — play a game, publish a post, or comment to start earning.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {currentUser.noobTransactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between py-1.5 border-b border-zinc-800/60 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="text-xs text-zinc-200 truncate">{tx.reason}</p>
                        <p className="text-[10px] text-zinc-500">
                          {new Date(tx.timestamp).toLocaleString()}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-bold shrink-0 pl-2 ${
                          tx.amount >= 0 ? 'text-[#00FF66]' : 'text-rose-400'
                        }`}
                      >
                        {tx.amount >= 0 ? '+' : ''}
                        {tx.amount.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-orange-400" /> How to accumulate noobPoints
              </h4>
              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
                  <span className="text-zinc-300">🎮 Win PvP / Mini-Game Matches</span>
                  <span className="font-bold text-[#00FF66]">+50 to +200 pts</span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
                  <span className="text-zinc-300">📸 Publish Image Post or Reel</span>
                  <span className="font-bold text-[#00FF66]">+25 pts</span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
                  <span className="text-zinc-300">💬 Comments &amp; High-Engagement Reactions</span>
                  <span className="font-bold text-[#00FF66]">+5 pts</span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
                  <span className="text-zinc-300">🏆 Top 10 Global Leaderboard Finish</span>
                  <span className="font-bold text-amber-400">+500 pts Bonus</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-300">🛡️ Responsible Reporting &amp; Safety Compliance</span>
                  <span className="font-bold text-cyan-400">+50 pts</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-2 border-t border-zinc-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-white text-black font-bold text-xs hover:bg-zinc-200 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
