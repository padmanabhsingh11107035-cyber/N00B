import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { BurgerLoading } from '../Common/BurgerLoading';
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
  HelpCircle,
  Music,
  VolumeX,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { MiniGameMeta, ALL_50_MINI_GAMES, GameCategory } from './types';
import { GameBannerArtwork } from './GameIcons';
import { warmHelixFilesWhenIdle } from '../../utils/helixWarmup';
import { warmUnderhallFilesWhenIdle } from '../../utils/underhallWarmup';
import { warmCanyonFilesWhenIdle } from '../../utils/canyonWarmup';
import { warmCritterFilesWhenIdle } from '../../utils/critterWarmup';
import { warmSiegecraftFilesWhenIdle } from '../../utils/siegecraftWarmup';
import { warmRogueFilesWhenIdle } from '../../utils/rogueWarmup';
// Lazy-loaded: ~1700 lines nobody needs until they actually open a game — shares the same chunk as
// App.tsx's own dynamic import() of this component.
const GamePlayModal = React.lazy(() => import('./GamePlayModal').then((m) => ({ default: m.GamePlayModal })));
import { User, GameLeaderboardEntry } from '../../types';
import { fetchGameLeaderboard } from '../../services/api';
import { formatNoobPoints } from '../../utils/formatPoints';
import { useResumeState } from '../../utils/useResumeState';
import { setResumePage, clearResumePageIf, clearGameSnapshot } from '../../utils/pageResume';
import { startGameMusic, stopGameMusic, isGameMusicOn, setGameMusicOn } from '../../utils/gameMusic';

interface GamesViewProps {
  currentUser: User;
  allUsers: User[];
  onUserUpdated?: (user: User) => void;
  onNavigateToUserProfile?: (user: User) => void;
  /** laptop / computer: the page is full screen, and this button takes the person back to the page they came from */
  onBack?: () => void;
}

export const GamesView: React.FC<GamesViewProps> = ({
  currentUser,
  allUsers,
  onUserUpdated,
  onNavigateToUserProfile,
  onBack
}) => {
  // The Games page is remembered while it is open: closing / refreshing the app brings the person back to this page, to the game
  // they were playing, with that game's progress (see utils/pageResume.ts and each game). Closing the page forgets all of it.
  const uid = currentUser.id;
  useLayoutEffect(() => {
    setResumePage(uid, 'games');
    return () => clearResumePageIf(uid, 'games');
  }, [uid]);
  // Helix Fall's files (about 0.7 MB) are fetched quietly while the Games page is open, so the game starts at once when Play is pressed.
  useEffect(() => { warmHelixFilesWhenIdle(); warmUnderhallFilesWhenIdle(); warmCanyonFilesWhenIdle(); warmCritterFilesWhenIdle(); warmSiegecraftFilesWhenIdle(); warmRogueFilesWhenIdle(); }, []);
  const [activeTab, setActiveTab] = useResumeState<'games' | 'leaderboard'>(uid, 'games', 'tab', 'games');
  const [selectedCategory, setSelectedCategory] = useResumeState<GameCategory>(uid, 'games', 'category', 'all');
  const [searchQuery, setSearchQuery] = useResumeState(uid, 'games', 'search', '');
  const [savedGameId, setSavedGameId] = useResumeState<string | null>(uid, 'games', 'gameId', null);
  const [selectedGameForPlay, setSelectedGameForPlay] = useState<MiniGameMeta | null>(() => ALL_50_MINI_GAMES.find((g) => g.id === savedGameId) ?? null);
  useEffect(() => { setSavedGameId(selectedGameForPlay?.id ?? null); }, [selectedGameForPlay?.id]);
  const closeGame = () => {
    if (selectedGameForPlay) {
      clearGameSnapshot(uid, selectedGameForPlay.id);
      clearGameSnapshot(uid, `modal:${selectedGameForPlay.id}`);
    }
    setSelectedGameForPlay(null);
  };

  // Music for the whole Games page: starts when the page opens, keeps playing during a game, stops when the page closes.
  const [musicOn, setMusicOn] = useState(isGameMusicOn());
  // The exception: a game that brings its own music and sounds (Helix Fall, Neon Alley) must not have the arcade loop over it. The loop stops while such a game is open
  // and comes back when it is closed (the person's own on/off choice is not touched).
  const quietGame = !!selectedGameForPlay?.ownSound;
  useEffect(() => {
    if (quietGame) { stopGameMusic(); return undefined; }
    startGameMusic();
    return () => stopGameMusic();
  }, [quietGame]);
  const [showMenu, setShowMenu] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
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

  const CATEGORIES: { key: GameCategory; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'arcade', label: 'Arcade' },
    { key: 'puzzle', label: 'Puzzle & Match' },
    { key: 'reflex', label: 'Reflex & Action' },
    { key: 'brain', label: 'Brain & Strategy' },
    { key: 'social', label: 'Social & Party' }
  ];
  const searching = searchQuery.trim() !== '' || selectedCategory !== 'all';
  // The home page of the games: rows of tiles, like a store shelf. Searching or picking a category shows the matches as one grid.
  const shelves: { id: string; title: string; games: MiniGameMeta[] }[] = [
    { id: 'new', title: 'New games', games: ALL_50_MINI_GAMES.filter((g) => g.isNew) },
    ...CATEGORIES.filter((c) => c.key !== 'all').map((c) => ({ id: c.key, title: c.label, games: ALL_50_MINI_GAMES.filter((g) => g.category === c.key) }))
  ].filter((s) => s.games.length > 0);

  // our own big games (the ones with a picture of their own): "the hottest"
  const hot = ALL_50_MINI_GAMES.filter((g) => g.embedUrl && g.posters && g.posters.length > 0).slice(0, 8);
  // everybody who has played at least one game, the most played first
  const players = allUsers.filter((u) => u.id !== currentUser.id && (u.gamesPlayedCount || 0) >= 1).sort((a, b) => (b.gamesPlayedCount || 0) - (a.gamesPlayedCount || 0));

  const tile = (game: MiniGameMeta, wide = false) => (
    <button
      key={game.id}
      type="button"
      onClick={() => setSelectedGameForPlay(game)}
      className={`rbx-tile group text-left shrink-0 cursor-pointer ${wide ? 'w-full' : 'w-[138px] sm:w-[160px] lg:w-[176px]'}`}
      data-testid={`game-tile-${game.id}`}
    >
      <div className="relative aspect-square overflow-hidden rounded-xl bg-[#232527] ring-1 ring-white/5 transition-transform duration-200 group-hover:scale-[1.03]">
        {game.posters && game.posters[0] ? (
          <img src={game.posters[0]} alt="" loading="lazy" decoding="async" draggable={false} className="w-full h-full object-cover object-top" />
        ) : (
          <GameBannerArtwork id={game.id} className="w-full h-full" />
        )}
        {game.isNew && <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-[#00b06f] text-[10px] font-extrabold text-white">NEW</span>}
        <span className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="w-11 h-11 rounded-full bg-white/95 flex items-center justify-center"><Play className="w-5 h-5 text-black fill-black ml-0.5" /></span>
        </span>
      </div>
      <p className="mt-2 text-[13px] font-bold text-white leading-snug line-clamp-2">{game.title}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#bdbebe] truncate">
        <Users className="w-3 h-3 shrink-0" />
        <span className="truncate">{game.players}</span>
        <span className="text-[#6f7072]">·</span>
        <span className="truncate">{game.rewardNote || (game.pointsReward > 0 ? 'Earn NOOBs' : 'For fun')}</span>
      </p>
    </button>
  );

  return (
    <div className="rbx w-full min-h-screen bg-[#121316] text-white md:px-8 lg:px-12 px-4 pb-28 md:pb-12" data-testid="games-page">
      {/* Top bar: back (laptop / computer), search in the middle, points and the small buttons on the right */}
      <header className="sticky top-0 z-30 -mx-4 md:-mx-8 lg:-mx-12 px-4 md:px-8 lg:px-12 py-3 bg-[#121316] flex items-center gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            data-testid="games-back"
            className="hidden md:inline-flex items-center gap-1.5 h-10 pl-2.5 pr-4 rounded-full bg-[#232527] hover:bg-[#2f3133] text-sm font-bold text-white cursor-pointer shrink-0 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            Back
          </button>
        )}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="text-[22px] leading-none font-black italic tracking-tight">NOOB</span>
          <span className="px-2 h-5 rounded-md bg-[#232527] text-[10px] font-extrabold tracking-wider inline-flex items-center">GAMES</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setShowSearch((v) => !v)} aria-label="Search games" className="w-10 h-10 rounded-full bg-[#232527] hover:bg-[#2f3133] flex items-center justify-center cursor-pointer transition-colors"><Search className="w-4 h-4" /></button>
          <span className="hidden sm:inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full bg-[#232527] text-sm font-bold" title="Your NOOBs">
            <span className="w-4 h-4 rounded-full bg-amber-400 inline-block" />
            {formatNoobPoints(userPoints)}
          </span>
          <button
            onClick={() => { const next = !musicOn; setMusicOn(next); setGameMusicOn(next); }}
            aria-label={musicOn ? 'Turn game music off' : 'Turn game music on'}
            title={musicOn ? 'Game music is on (tap to turn off)' : 'Game music is off (tap to turn on)'}
            className="w-10 h-10 rounded-full bg-[#232527] hover:bg-[#2f3133] flex items-center justify-center cursor-pointer transition-colors"
          >
            {musicOn ? <Music className="w-4 h-4 text-white" /> : <VolumeX className="w-4 h-4 text-[#8d8e90]" />}
          </button>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu((prev) => !prev)}
              aria-label="Arena information"
              className="w-10 h-10 rounded-full bg-[#232527] hover:bg-[#2f3133] flex items-center justify-center cursor-pointer transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-30 bg-black/50" onClick={() => setShowMenu(false)} />
                <div className="fixed left-4 right-4 top-20 mx-auto max-w-sm z-40 p-4 rounded-2xl bg-[#232527] shadow-2xl text-left">
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/10">
                    <Info className="w-4 h-4 text-white" />
                    <h3 className="text-xs font-black text-white uppercase tracking-wider">Arena Info &amp; Rules</h3>
                  </div>
                  <div className="space-y-2.5 text-xs">
                    <div className="bg-[#121316] p-2.5 rounded-xl">
                      <span className="text-[11px] font-bold text-[#bdbebe] block mb-1">Scoring System</span>
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center justify-between"><span className="text-zinc-300">🏆 Victory:</span><span className="text-white font-black">+10M NOOBs</span></div>
                        <div className="flex items-center justify-between"><span className="text-zinc-300">🤝 Draw / Tie:</span><span className="text-blue-400 font-black">+5M NOOBs</span></div>
                        <div className="flex items-center justify-between"><span className="text-zinc-300">💥 Loss / Defeat:</span><span className="text-zinc-500 font-bold">0 NOOBs</span></div>
                      </div>
                    </div>
                    <div className="bg-[#121316] p-2.5 rounded-xl">
                      <span className="text-[11px] font-bold text-[#bdbebe] block mb-1">Game Modes</span>
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
      </header>

      {(showSearch || searchQuery) && (
        <div className="relative mb-2">
          <Search className="w-4 h-4 text-[#bdbebe] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input autoFocus type="text" placeholder="Search games" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full h-10 bg-[#232527] rounded-full pl-10 pr-4 text-sm text-white placeholder-[#8d8e90] focus:outline-none focus:ring-2 focus:ring-white/30" />
        </div>
      )}

      {/* For You / Charts */}
      <div className="flex items-center gap-6 mb-4 border-b border-white/10">
        <button onClick={() => setActiveTab('games')} className={`pb-2.5 text-[15px] font-bold cursor-pointer border-b-2 transition-colors ${activeTab === 'games' ? 'text-white border-white' : 'text-[#8d8e90] border-transparent hover:text-white'}`}>For You</button>
        <button onClick={() => setActiveTab('leaderboard')} className={`pb-2.5 text-[15px] font-bold cursor-pointer border-b-2 transition-colors ${activeTab === 'leaderboard' ? 'text-white border-white' : 'text-[#8d8e90] border-transparent hover:text-white'}`}>Charts</button>
      </div>

      {activeTab === 'games' ? (
        <>
          {/* People who have played at least one game (their picture, then their name and how many games) */}
          {!searching && (
            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4 -mx-4 px-4 md:mx-0 md:px-0" data-testid="games-players">
              {[{ ...currentUser, __me: true } as any, ...players].map((u: any) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => { if (!u.__me && onNavigateToUserProfile) onNavigateToUserProfile(u); }}
                  className="shrink-0 w-[72px] text-center cursor-pointer"
                >
                  <span className="relative block w-[64px] h-[64px] mx-auto rounded-full overflow-hidden bg-[#232527] ring-1 ring-white/10">
                    <img src={u.avatar || '/noob-logo-circle.png'} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                  </span>
                  <span className="block mt-1.5 text-[12px] font-semibold text-white truncate">{u.__me ? 'You' : (u.displayName || u.username)}</span>
                  <span className="block text-[11px] text-[#8d8e90] truncate">{(u.gamesPlayedCount || 0).toLocaleString()} {(u.gamesPlayedCount || 0) === 1 ? 'game' : 'games'}</span>
                </button>
              ))}
            </div>
          )}

          {/* The hottest games: our own big games, wide pictures */}
          {!searching && hot.length > 0 && (
            <section className="mt-1 mb-6" data-testid="games-hottest">
              <h2 className="text-[22px] leading-tight font-extrabold">The hottest games</h2>
              <p className="text-[13px] text-[#bdbebe] mb-3">What's trending today on NOOB</p>
              <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 snap-x">
                {hot.map((g) => (
                  <button key={g.id} type="button" onClick={() => setSelectedGameForPlay(g)} className="group shrink-0 snap-start text-left cursor-pointer w-[86%] sm:w-[420px] lg:w-[520px]">
                    <span className="block aspect-video overflow-hidden rounded-2xl bg-[#232527] ring-1 ring-white/5">
                      <img src={g.posters![0]} alt="" loading="lazy" decoding="async" draggable={false} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                    </span>
                    <span className="block mt-2 text-[15px] font-bold truncate">{g.title}</span>
                    <span className="block text-[12px] text-[#bdbebe] line-clamp-1">{g.description}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Category chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-3 no-scrollbar">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setSelectedCategory(cat.key)}
                className={`h-8 px-3.5 rounded-full text-[13px] font-bold whitespace-nowrap cursor-pointer transition-colors ${selectedCategory === cat.key ? 'bg-white text-black' : 'bg-[#232527] text-white hover:bg-[#2f3133]'}`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {searching ? (
            <>
              <h2 className="text-xl font-extrabold mt-3 mb-3">{searchQuery.trim() ? `Results for “${searchQuery.trim()}”` : CATEGORIES.find((c) => c.key === selectedCategory)?.label}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-x-3 gap-y-5">
                {filteredGames.map((g) => tile(g, true))}
              </div>
              {filteredGames.length === 0 && (
                <div className="text-center py-16">
                  <p className="text-[#bdbebe] text-sm">No games found matching "{searchQuery}".</p>
                  <button onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }} className="mt-3 h-9 px-4 rounded-full bg-white text-black text-sm font-bold cursor-pointer">Reset filters</button>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-7 mt-2">
              {shelves.map((s) => (
                <section key={s.id} data-testid={`games-shelf-${s.id}`}>
                  <button type="button" onClick={() => { if (s.id !== 'new') setSelectedCategory(s.id as GameCategory); }} className="flex items-center gap-1 mb-3 cursor-pointer">
                    <h2 className="text-xl font-extrabold">{s.title}</h2>
                    {s.id !== 'new' && <ChevronRight className="w-5 h-5 text-[#bdbebe]" />}
                  </button>
                  <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 -mx-3 px-3 md:mx-0 md:px-0 snap-x">
                    {s.games.map((g) => tile(g))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      ) : (
        /* GLOBAL NOOBS LEADERBOARD TAB */
        <div className="max-w-3xl">
          <h2 className="text-xl font-extrabold mb-3">Top 10</h2>
          <div className="space-y-2">
            {isLoadingLeaderboard && leaderboard.length === 0 ? (
              <div className="py-10 flex flex-col items-center justify-center gap-2 text-[#bdbebe]">
                <Radio className="w-6 h-6 animate-pulse" />
                <span className="text-xs">Loading rankings...</span>
              </div>
            ) : leaderboardError && leaderboard.length === 0 ? (
              <div className="py-10 flex flex-col items-center justify-center gap-2 text-center px-4">
                <ShieldAlert className="w-6 h-6 text-amber-400" />
                <span className="text-xs text-[#bdbebe]">Couldn't load the leaderboard right now.</span>
                <button onClick={loadLeaderboardData} className="mt-1 text-xs text-white underline cursor-pointer font-semibold">Try again</button>
              </div>
            ) : leaderboard.length === 0 ? (
              <div className="py-10 flex flex-col items-center justify-center gap-1.5 text-center px-4">
                <Trophy className="w-6 h-6 text-[#6f7072]" />
                <span className="text-xs text-[#bdbebe]">No rankings yet — be the first to play!</span>
              </div>
            ) : (
              leaderboard.slice(0, 10).map((player, idx) => {
                const fullUser = allUsers.find((u) => (player.userId && u.id === player.userId) || u.username === player.username);
                return (
                  <div
                    key={player.userId || player.username || idx}
                    onClick={() => { if (fullUser && onNavigateToUserProfile) onNavigateToUserProfile(fullUser); }}
                    className={`p-3 rounded-xl flex items-center justify-between gap-3 transition-colors ${fullUser && onNavigateToUserProfile ? 'cursor-pointer' : ''} ${player.username === currentUser.username ? 'bg-[#2f3133]' : 'bg-[#232527] hover:bg-[#2a2c2e]'}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`w-7 shrink-0 text-center font-extrabold text-sm ${idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-slate-300' : idx === 2 ? 'text-amber-600' : 'text-[#8d8e90]'}`}>{idx + 1}</span>
                      <img
                        src={player.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
                        alt={player.username}
                        className="w-10 h-10 rounded-full object-cover shrink-0"
                        referrerPolicy="no-referrer"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sm font-bold text-white truncate">{player.displayName || player.username}</span>
                          {player.username === currentUser.username && <span className="text-[10px] px-1.5 rounded bg-white text-black font-bold shrink-0">YOU</span>}
                        </div>
                        <span className="text-[11px] text-[#bdbebe] block truncate">@{player.username} • {player.gamesWon || 0} Wins</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <span className="text-sm font-black text-white block">{formatNoobPoints(player.noobPoints || 0)}</span>
                      <span className="text-[10px] text-[#8d8e90] block">NOOBs</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Interactive Game Play Modal */}
      {selectedGameForPlay && (
        <React.Suspense fallback={<BurgerLoading />}>
          <GamePlayModal
            game={selectedGameForPlay}
            currentUser={currentUser}
            allUsers={allUsers}
            onClose={closeGame}
            onPointsUpdated={handlePointsUpdated}
          />
        </React.Suspense>
      )}
    </div>
  );
};
