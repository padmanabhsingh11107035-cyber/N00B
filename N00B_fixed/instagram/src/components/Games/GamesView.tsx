import React, { useState, useEffect, useRef } from 'react';
import {
  Gamepad2,
  Trophy,
  Play,
  Search,
  Zap,
  Flame,
  Award,
  Sparkles,
  Users,
  Bot,
  UserPlus,
  Radio,
  Star,
  CheckCircle2,
  Crown,
  MoreVertical,
  Info,
  ShieldAlert,
  HelpCircle
} from 'lucide-react';
import { MiniGameMeta, ALL_50_MINI_GAMES, GameCategory } from './types';
import { GameBannerArtwork } from './GameIcons';
import { GamePlayModal } from './GamePlayModal';
import { User, GameLeaderboardEntry } from '../../types';
import { fetchGameLeaderboard } from '../../services/api';

interface GamesViewProps {
  currentUser: User;
  allUsers: User[];
  onUserUpdated?: (user: User) => void;
}

// Formats noob points: if exceeding 1000, shows 1k, 1.1k, 1.2k, etc.
export const formatNoobPoints = (points: number): string => {
  if (points === undefined || points === null) return '0';
  if (points >= 1000000) {
    const val = (points / 1000000).toFixed(1);
    return val.endsWith('.0') ? `${Math.floor(points / 1000000)}M` : `${val}M`;
  }
  if (points >= 1000) {
    const val = (points / 1000).toFixed(1);
    return val.endsWith('.0') ? `${Math.floor(points / 1000)}k` : `${val}k`;
  }
  return points.toString();
};

// Fallback default leaderboard entries with top 10 users
const DEFAULT_LEADERBOARD = [
  {
    rank: 1,
    userId: 'u_alex',
    username: 'alex_cyber',
    displayName: 'Alex Rivers',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80',
    noobPoints: 2450,
    gamesWon: 24,
    gamesPlayed: 32,
    isVerified: true
  },
  {
    rank: 2,
    userId: 'u_kenji',
    username: 'pixel_samurai',
    displayName: 'Kenji Sato',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80',
    noobPoints: 1980,
    gamesWon: 19,
    gamesPlayed: 28,
    isVerified: true
  },
  {
    rank: 3,
    userId: 'u_zara',
    username: 'neon_rider',
    displayName: 'Zara Vance',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=300&auto=format&fit=crop&q=80',
    noobPoints: 1720,
    gamesWon: 16,
    gamesPlayed: 25,
    isVerified: false
  },
  {
    rank: 4,
    userId: 'u_riku',
    username: 'shadow_ninja',
    displayName: 'Riku Tanaka',
    avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=300&auto=format&fit=crop&q=80',
    noobPoints: 1400,
    gamesWon: 14,
    gamesPlayed: 20,
    isVerified: false
  },
  {
    rank: 5,
    userId: 'u_elena',
    username: 'cosmic_gamer',
    displayName: 'Elena Rostova',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300&auto=format&fit=crop&q=80',
    noobPoints: 1250,
    gamesWon: 12,
    gamesPlayed: 18,
    isVerified: true
  },
  {
    rank: 6,
    userId: 'u_marcus',
    username: 'marcus_dev',
    displayName: 'Marcus Vance',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&auto=format&fit=crop&q=80',
    noobPoints: 1120,
    gamesWon: 11,
    gamesPlayed: 16,
    isVerified: true
  },
  {
    rank: 7,
    userId: 'u_maya',
    username: 'maya_ai',
    displayName: 'Maya Lin',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=300&auto=format&fit=crop&q=80',
    noobPoints: 1050,
    gamesWon: 10,
    gamesPlayed: 15,
    isVerified: false
  },
  {
    rank: 8,
    userId: 'u_david',
    username: 'david_crypto',
    displayName: 'David K.',
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=300&auto=format&fit=crop&q=80',
    noobPoints: 950,
    gamesWon: 9,
    gamesPlayed: 14,
    isVerified: false
  },
  {
    rank: 9,
    userId: 'u_sophia',
    username: 'sophia_code',
    displayName: 'Sophia Perez',
    avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=300&auto=format&fit=crop&q=80',
    noobPoints: 880,
    gamesWon: 8,
    gamesPlayed: 13,
    isVerified: true
  },
  {
    rank: 10,
    userId: 'u_kai',
    username: 'kai_synth',
    displayName: 'Kai Sterling',
    avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=300&auto=format&fit=crop&q=80',
    noobPoints: 790,
    gamesWon: 7,
    gamesPlayed: 11,
    isVerified: false
  }
];

export const GamesView: React.FC<GamesViewProps> = ({
  currentUser,
  allUsers,
  onUserUpdated
}) => {
  const [activeTab, setActiveTab] = useState<'games' | 'leaderboard'>('games');
  const [selectedCategory, setSelectedCategory] = useState<GameCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGameForPlay, setSelectedGameForPlay] = useState<MiniGameMeta | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Outside click listener for the 3-dot dropdown menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  // Leaderboard state with immediate non-empty defaults
  const [leaderboard, setLeaderboard] = useState<any[]>(() => {
    const list = [...DEFAULT_LEADERBOARD];
    if (currentUser && !list.some(u => u.username === currentUser.username)) {
      list.push({
        rank: list.length + 1,
        userId: currentUser.id,
        username: currentUser.username,
        displayName: currentUser.displayName || currentUser.username,
        avatar: currentUser.avatar,
        noobPoints: currentUser.noobPoints ?? 0,
        gamesWon: currentUser.gamesWonCount || 0,
        gamesPlayed: currentUser.gamesPlayedCount || 0,
        isVerified: !!currentUser.isVerified
      });
    }
    return list.sort((a, b) => (b.noobPoints || 0) - (a.noobPoints || 0)).map((item, idx) => ({ ...item, rank: idx + 1 }));
  });
  const [userPoints, setUserPoints] = useState<number>(currentUser?.noobPoints ?? 0);
  const [userRank, setUserRank] = useState<number>(1);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(false);

  useEffect(() => {
    loadLeaderboardData();
  }, [activeTab]);

  const loadLeaderboardData = async () => {
    try {
      setIsLoadingLeaderboard(true);
      const data = await fetchGameLeaderboard();
      if (data && data.leaderboard && data.leaderboard.length > 0) {
        setLeaderboard(data.leaderboard);
        setUserPoints(data.currentUserPoints ?? (currentUser?.noobPoints ?? 0));
        setUserRank(data.currentUserRank || 1);
      } else {
        // Build robust list with current user included
        const list = [...DEFAULT_LEADERBOARD];
        if (currentUser && !list.some(u => u.username === currentUser.username)) {
          list.push({
            rank: list.length + 1,
            userId: currentUser.id,
            username: currentUser.username,
            displayName: currentUser.displayName || currentUser.username,
            avatar: currentUser.avatar,
            noobPoints: currentUser.noobPoints ?? 0,
            gamesWon: currentUser.gamesWonCount || 0,
            gamesPlayed: currentUser.gamesPlayedCount || 0,
            isVerified: !!currentUser.isVerified
          });
        }
        const sorted = list
          .sort((a, b) => (b.noobPoints || 0) - (a.noobPoints || 0))
          .map((p, idx) => ({ ...p, rank: idx + 1 }));
        setLeaderboard(sorted);
      }
    } catch (err) {
      console.error('Failed to load leaderboard:', err);
    } finally {
      setIsLoadingLeaderboard(false);
    }
  };

  const handlePointsUpdated = (earned: number, totalPoints: number) => {
    setUserPoints(totalPoints);
    if (onUserUpdated && currentUser) {
      onUserUpdated({
        ...currentUser,
        noobPoints: totalPoints,
        gamesPlayedCount: (currentUser.gamesPlayedCount || 0) + 1,
        gamesWonCount: earned === 100 ? (currentUser.gamesWonCount || 0) + 1 : currentUser.gamesWonCount
      });
    }
    loadLeaderboardData();
  };

  const filteredGames = ALL_50_MINI_GAMES.filter((g) => {
    const matchesCategory = selectedCategory === 'all' || g.category === selectedCategory;
    const matchesSearch =
      g.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="w-full max-w-4xl mx-auto px-4 pb-24 pt-2">
      {/* Top Header & Points Stat Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 p-4 rounded-3xl bg-zinc-950 border border-zinc-800/80 shadow-2xl">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-[#00FF66] flex items-center justify-center shadow-[0_0_20px_rgba(0,255,102,0.3)]">
            <Gamepad2 className="w-6 h-6 text-black stroke-[2.5]" />
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-white tracking-tight lowercase">
              noob arena
            </h1>
            {/* 3-Dot Button on the right side of 'noob arena' written */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowMenu((prev) => !prev)}
                aria-label="Arena information"
                className="w-8 h-8 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white flex items-center justify-center transition-all cursor-pointer"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {showMenu && (
                <>
                  <div className="fixed inset-0 z-30 bg-black/40" onClick={() => setShowMenu(false)} />
                  {/* Anchored to the viewport (not the tiny 3-dot button) so it
                      can never overflow off-screen regardless of where the
                      button sits in the header or how narrow the screen is. */}
                  <div className="fixed left-4 right-4 top-24 mx-auto max-w-sm z-40 p-4 rounded-3xl bg-zinc-950 border border-zinc-800 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 text-left">
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-zinc-800/80">
                    <Info className="w-4 h-4 text-[#00FF66]" />
                    <h3 className="text-xs font-black text-white uppercase tracking-wider">
                      Arena Info &amp; Rules
                    </h3>
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div className="bg-zinc-900/90 p-2.5 rounded-2xl border border-zinc-800">
                      <span className="text-[11px] font-bold text-zinc-400 block mb-1">
                        Scoring System
                      </span>
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-300">🏆 Victory:</span>
                          <span className="text-[#00FF66] font-black">+100 NOOBs</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-300">🤝 Draw / Tie:</span>
                          <span className="text-blue-400 font-black">+50 NOOBs</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-300">💥 Loss / Defeat:</span>
                          <span className="text-zinc-500 font-bold">0 NOOBs</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-zinc-900/90 p-2.5 rounded-2xl border border-zinc-800">
                      <span className="text-[11px] font-bold text-zinc-400 block mb-1">
                        Game Modes
                      </span>
                      <ul className="text-[11px] text-zinc-300 space-y-1 list-disc list-inside">
                        <li>Quick match with active online players</li>
                        <li>Instant practice matches against AI Bot</li>
                        <li>Direct invites to chat with friends</li>
                      </ul>
                    </div>
                  </div>
                </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Current Points Badge & Actions */}
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 rounded-2xl bg-zinc-900 border border-[#00FF66]/30 flex items-center gap-2.5 shadow-lg">
            <div className="w-7 h-7 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center font-bold text-xs">
              ⚡
            </div>
            <div>
              <span className="text-[10px] text-zinc-400 block font-medium">Balance</span>
              <span className="text-sm font-black text-white flex items-center gap-1">
                {formatNoobPoints(userPoints)} <span className="text-[#00FF66] text-xs font-extrabold">noobs</span>
              </span>
            </div>
          </div>

          <button
            onClick={() => setActiveTab(activeTab === 'games' ? 'leaderboard' : 'games')}
            className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-md ${
              activeTab === 'leaderboard'
                ? 'bg-amber-500 text-black shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                : 'bg-zinc-900 text-amber-400 border border-amber-500/40 hover:bg-zinc-800'
            }`}
          >
            <Trophy className="w-4 h-4" />
            <span>{activeTab === 'leaderboard' ? 'View Games' : 'Leaderboard'}</span>
          </button>
        </div>
      </div>

      {activeTab === 'games' ? (
        <>
          {/* Search & Category Filter Pills */}
          <div className="space-y-3 mb-6">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search mini-games (e.g. Snake, Tic Tac Toe, Rock Paper Scissors, Math)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl pl-10 pr-4 py-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#00FF66] transition-colors shadow-inner"
              />
            </div>

            {/* Category tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              {(
                [
                  { key: 'all', label: 'All Games' },
                  { key: 'arcade', label: '🕹️ Arcade' },
                  { key: 'puzzle', label: '🧩 Puzzle & Match' },
                  { key: 'reflex', label: '⚡ Reflex & Action' },
                  { key: 'brain', label: '🧠 Brain & Strategy' },
                  { key: 'social', label: '🎉 Social & Party' }
                ] as { key: GameCategory; label: string }[]
              ).map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => setSelectedCategory(cat.key)}
                  className={`px-3.5 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    selectedCategory === cat.key
                      ? 'bg-[#00FF66] text-black shadow-[0_0_15px_rgba(0,255,102,0.25)]'
                      : 'bg-zinc-900/80 text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-800'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Games Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredGames.map((game, idx) => (
              <div
                key={game.id}
                className="bg-zinc-950 border border-zinc-800/90 hover:border-zinc-700 rounded-3xl overflow-hidden shadow-lg transition-all duration-300 hover:shadow-[0_0_20px_rgba(0,0,0,0.5)] flex flex-col group"
              >
                {/* Custom Unique Vector Artwork */}
                <div className="relative overflow-hidden cursor-pointer" onClick={() => setSelectedGameForPlay(game)}>
                  <GameBannerArtwork id={game.id} className="w-full h-36 group-hover:scale-105 transition-transform duration-500" />
                  
                  {/* Game Number Badge */}
                  <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[10px] font-mono font-black text-white border border-white/10">
                    #{idx + 1}
                  </span>

                  {/* Mode Player Indicator */}
                  <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[10px] font-semibold text-[#00FF66] border border-[#00FF66]/30">
                    {game.players}
                  </span>
                </div>

                {/* Card Info */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <h3 className="text-sm font-bold text-white group-hover:text-[#00FF66] transition-colors line-clamp-1">
                        {game.title}
                      </h3>
                      <span className="text-[10px] font-extrabold text-amber-400 shrink-0">
                        +100 NOOBs
                      </span>
                    </div>

                    <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                      {game.description}
                    </p>
                  </div>

                  {/* Tags & Play Button */}
                  <div className="pt-2 border-t border-zinc-900 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      {game.tags.slice(0, 2).map((t, i) => (
                        <span key={i} className="text-[9px] px-2 py-0.5 rounded-full bg-zinc-900 text-zinc-400 border border-zinc-800">
                          {t}
                        </span>
                      ))}
                    </div>

                    <button
                      onClick={() => setSelectedGameForPlay(game)}
                      className="px-3.5 py-1.5 rounded-xl bg-[#00FF66] hover:bg-[#00FF66]/90 text-black text-xs font-extrabold flex items-center gap-1 shadow-sm transition-transform active:scale-95 cursor-pointer shrink-0"
                    >
                      <Play className="w-3 h-3 fill-black" />
                      <span>Play</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filteredGames.length === 0 && (
            <div className="text-center py-16 bg-zinc-950 rounded-3xl border border-zinc-800">
              <p className="text-zinc-400 text-sm">No games found matching "{searchQuery}".</p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                }}
                className="mt-3 px-4 py-2 rounded-xl bg-zinc-900 text-xs font-bold text-[#00FF66] hover:bg-zinc-800 cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          )}
        </>
      ) : (
        /* GLOBAL NOOBS LEADERBOARD TAB */
        <div className="space-y-6">
          {/* Top 3 Podium */}
          {leaderboard.length >= 3 && (
            <div className="grid grid-cols-3 gap-2 sm:gap-4 items-end pt-4 pb-2 max-w-xl mx-auto">
              {/* Rank 2 */}
              <div className="flex flex-col items-center bg-zinc-950 p-3 sm:p-4 rounded-3xl border border-zinc-800">
                <div className="relative mb-2">
                  <img
                    src={leaderboard[1]?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
                    alt={leaderboard[1]?.username}
                    className="w-12 h-12 sm:w-16 sm:h-16 rounded-full object-cover border-2 border-slate-300 shadow-lg"
                    referrerPolicy="no-referrer"
                  />
                  <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-slate-300 text-zinc-900 font-black text-xs flex items-center justify-center shadow">
                    2
                  </span>
                </div>
                <span className="text-xs font-bold text-white text-center truncate max-w-full">
                  {leaderboard[1]?.displayName || leaderboard[1]?.username}
                </span>
                <span className="text-xs font-extrabold text-[#00FF66] mt-0.5">
                  {formatNoobPoints(leaderboard[1]?.noobPoints || 0)} <span className="text-[9px]">noobs</span>
                </span>
              </div>

              {/* Rank 1 (Tallest) */}
              <div className="flex flex-col items-center bg-gradient-to-b from-amber-500/10 to-zinc-950 p-4 sm:p-5 rounded-3xl border-2 border-amber-400 shadow-[0_0_30px_rgba(251,191,36,0.15)] relative -top-3">
                <Crown className="w-6 h-6 text-amber-400 mb-1 animate-bounce" />
                <div className="relative mb-2">
                  <img
                    src={leaderboard[0]?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
                    alt={leaderboard[0]?.username}
                    className="w-14 h-14 sm:w-20 sm:h-20 rounded-full object-cover border-2 border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.5)]"
                    referrerPolicy="no-referrer"
                  />
                  <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-amber-400 text-black font-black text-xs flex items-center justify-center shadow">
                    1
                  </span>
                </div>
                <span className="text-xs sm:text-sm font-black text-white text-center truncate max-w-full">
                  {leaderboard[0]?.displayName || leaderboard[0]?.username}
                </span>
                <span className="text-sm font-black text-amber-300 mt-0.5">
                  {formatNoobPoints(leaderboard[0]?.noobPoints || 0)} <span className="text-[10px]">noobs</span>
                </span>
              </div>

              {/* Rank 3 */}
              <div className="flex flex-col items-center bg-zinc-950 p-3 sm:p-4 rounded-3xl border border-zinc-800">
                <div className="relative mb-2">
                  <img
                    src={leaderboard[2]?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
                    alt={leaderboard[2]?.username}
                    className="w-12 h-12 sm:w-16 sm:h-16 rounded-full object-cover border-2 border-amber-700 shadow-lg"
                    referrerPolicy="no-referrer"
                  />
                  <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-amber-700 text-white font-black text-xs flex items-center justify-center shadow">
                    3
                  </span>
                </div>
                <span className="text-xs font-bold text-white text-center truncate max-w-full">
                  {leaderboard[2]?.displayName || leaderboard[2]?.username}
                </span>
                <span className="text-xs font-extrabold text-[#00FF66] mt-0.5">
                  {formatNoobPoints(leaderboard[2]?.noobPoints || 0)} <span className="text-[9px]">noobs</span>
                </span>
              </div>
            </div>
          )}

          {/* Real-Time Global Leaderboard of Top 10 Users Ranked by total noobPoints */}
          <div className="p-4 sm:p-5 rounded-3xl bg-zinc-950 border border-zinc-800/90 shadow-2xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-400 flex items-center justify-center text-black shadow-[0_0_15px_rgba(245,158,11,0.3)]">
                  <Trophy className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white flex items-center gap-2">
                    Real-Time Global Leaderboard
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#00FF66]/20 text-[#00FF66] font-bold border border-[#00FF66]/30">
                      Top 10 Legends
                    </span>
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Live global rankings by accumulated noobPoints
                  </p>
                </div>
              </div>
            </div>

            {/* Top 10 Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {leaderboard.slice(0, 10).map((player, idx) => {
                const isMe = player.username === currentUser.username;
                return (
                  <div
                    key={player.userId || player.username || idx}
                    className={`p-3 rounded-2xl border transition-all flex flex-col items-center text-center relative ${
                      isMe
                        ? 'bg-[#00FF66]/10 border-[#00FF66]/40 shadow-md shadow-[#00FF66]/10'
                        : idx === 0
                        ? 'bg-gradient-to-b from-amber-500/15 to-zinc-900 border-amber-400/50 shadow-md shadow-amber-500/10'
                        : idx === 1
                        ? 'bg-zinc-900/80 border-slate-400/30'
                        : idx === 2
                        ? 'bg-zinc-900/80 border-amber-700/30'
                        : 'bg-zinc-900/50 border-zinc-800/80 hover:border-zinc-700'
                    }`}
                  >
                    <span
                      className={`absolute top-2 left-2 text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center font-mono ${
                        idx === 0
                          ? 'bg-amber-400 text-black shadow-sm font-black'
                          : idx === 1
                          ? 'bg-slate-300 text-black'
                          : idx === 2
                          ? 'bg-amber-700 text-white'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      #{idx + 1}
                    </span>

                    <div className="relative mt-2 mb-2">
                      <img
                        src={player.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}
                        alt={player.username}
                        className="w-10 h-10 rounded-full object-cover ring-2 ring-zinc-800"
                        referrerPolicy="no-referrer"
                      />
                      {idx === 0 && (
                        <Crown className="w-4 h-4 text-amber-400 absolute -top-3 right-0 animate-bounce" />
                      )}
                    </div>

                    <span className="text-xs font-bold text-white truncate max-w-full block">
                      {player.displayName || player.username}
                    </span>
                    <span className="text-[10px] text-zinc-400 truncate max-w-full block">
                      @{player.username}
                    </span>

                    <div className="mt-2 px-2.5 py-0.5 rounded-full bg-black/60 border border-zinc-800 text-[11px] font-black text-[#00FF66] flex items-center gap-1">
                      <span>{formatNoobPoints(player.noobPoints || 0)}</span>
                      <span className="text-[9px] text-zinc-400">pts</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Full Rankings List (Top 10 only) */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-4 shadow-xl space-y-2">
            <h2 className="text-sm font-bold text-zinc-300 px-2 mb-2">Top 10 Leaderboard Rankings</h2>

            {leaderboard.slice(0, 10).map((player, idx) => (
              <div
                key={player.userId || player.username || idx}
                className={`p-3 rounded-2xl flex items-center justify-between gap-3 transition-colors ${
                  player.username === currentUser.username
                    ? 'bg-[#00FF66]/10 border border-[#00FF66]/30'
                    : 'bg-zinc-900/60 border border-zinc-800/80 hover:bg-zinc-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-6 text-center font-mono font-bold text-xs ${
                    idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-slate-300' : idx === 2 ? 'text-amber-700' : 'text-zinc-500'
                  }`}>
                    #{idx + 1}
                  </span>

                  <img
                    src={player.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
                    alt={player.username}
                    className="w-9 h-9 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />

                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-white">
                        {player.displayName || player.username}
                      </span>
                      {player.username === currentUser.username && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#00FF66]/20 text-[#00FF66] font-bold">
                          YOU
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-zinc-400">
                      @{player.username} • {player.gamesWon || 0} Wins
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs font-black text-[#00FF66] block">
                    {formatNoobPoints(player.noobPoints || 0)} <span className="text-[9px]">noobs</span>
                  </span>
                  <span className="text-[9px] text-zinc-500 block">Score</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Interactive Game Play Modal */}
      {selectedGameForPlay && (
        <GamePlayModal
          game={selectedGameForPlay}
          currentUser={currentUser}
          allUsers={allUsers}
          onClose={() => setSelectedGameForPlay(null)}
          onPointsUpdated={handlePointsUpdated}
        />
      )}
    </div>
  );
};
