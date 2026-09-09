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

  // Leaderboard state — starts empty; only ever populated with real data
  // from the server, never placeholder/demo people.
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [userPoints, setUserPoints] = useState<number>(currentUser?.noobPoints ?? 0);
  const [userRank, setUserRank] = useState<number>(1);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState(false);

  useEffect(() => {
    loadLeaderboardData();
  }, [activeTab]);

  const loadLeaderboardData = async () => {
    try {
      setIsLoadingLeaderboard(true);
      setLeaderboardError(false);
      const data = await fetchGameLeaderboard();
      if (data && Array.isArray(data.leaderboard)) {
        setLeaderboard(data.leaderboard);
        setUserPoints(data.currentUserPoints ?? (currentUser?.noobPoints ?? 0));
        setUserRank(data.currentUserRank || 1);
      } else {
        setLeaderboardError(true);
      }
    } catch (err) {
      console.error('Failed to load leaderboard:', err);
      setLeaderboardError(true);
    } finally {
      setIsLoadingLeaderboard(false);
    }
  };

  const handlePointsUpdated = (_earned: number, totalPoints: number, won?: boolean) => {
    setUserPoints(totalPoints);
    if (onUserUpdated && currentUser) {
      onUserUpdated({
        ...currentUser,
        noobPoints: totalPoints,
        gamesPlayedCount: (currentUser.gamesPlayedCount || 0) + 1,
        gamesWonCount: won ? (currentUser.gamesWonCount || 0) + 1 : currentUser.gamesWonCount
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
                        +{game.pointsReward.toLocaleString()} NOOBs
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
          {/* Full Rankings List (Top 10 only) */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-4 shadow-xl space-y-2">
            <h2 className="text-sm font-bold text-zinc-300 px-2 mb-2">Top 10 Leaderboard Rankings</h2>

            {isLoadingLeaderboard && leaderboard.length === 0 ? (
              <div className="py-10 flex flex-col items-center justify-center gap-2 text-zinc-500">
                <Radio className="w-6 h-6 animate-pulse text-[#00FF66]" />
                <span className="text-xs">Loading rankings...</span>
              </div>
            ) : leaderboardError && leaderboard.length === 0 ? (
              <div className="py-10 flex flex-col items-center justify-center gap-2 text-center px-4">
                <ShieldAlert className="w-6 h-6 text-amber-400" />
                <span className="text-xs text-zinc-400">Couldn't load the leaderboard right now.</span>
                <button
                  onClick={loadLeaderboardData}
                  className="mt-1 text-xs text-[#00FF66] hover:underline cursor-pointer font-semibold"
                >
                  Try again
                </button>
              </div>
            ) : leaderboard.length === 0 ? (
              <div className="py-10 flex flex-col items-center justify-center gap-1.5 text-center px-4">
                <Trophy className="w-6 h-6 text-zinc-600" />
                <span className="text-xs text-zinc-400">No rankings yet — be the first to play!</span>
              </div>
            ) : (
              leaderboard.slice(0, 10).map((player, idx) => (
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
              ))
            )}
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
