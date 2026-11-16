import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { LoadingPage } from '../Common/LoadingPages';
import './gamesZ.css';
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
import { forceStripColour } from '../../utils/statusStrip';

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
  // The page reaches from the very top to the bottom bar: the strip behind the clock / camera takes the page's own colour (dark or light) while the list is on screen,
  // and goes back to normal when a game is open or the page is left.
  const gameOpen = !!selectedGameForPlay;
  useEffect(() => {
    if (gameOpen) return undefined;
    const paint = () => forceStripColour(document.documentElement.getAttribute('data-theme') === 'light' ? '#f4f4f6' : '#0c0c0e');
    paint();
    const mo = new MutationObserver(paint);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { mo.disconnect(); forceStripColour(null); };
  }, [gameOpen]);
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

  const catLabel = (k: string) => CATEGORIES.find((c) => c.key === k)?.label || 'Game';
  // a game without a picture of its own gets a poster drawn by the page: one of six colourways (always the same one for the same game) and the game's initials
  const artOf = (g: MiniGameMeta) => {
    let h = 0;
    for (let i = 0; i < g.id.length; i++) h = (h * 31 + g.id.charCodeAt(i)) >>> 0;
    const words = g.title.replace(/[^A-Za-z0-9 ]/g, ' ').split(' ').filter(Boolean);
    return { c: h % 6, mono: ((words[0]?.[0] || 'N') + (words[1]?.[0] || '')).toUpperCase() };
  };
  const poster = (game: MiniGameMeta, rank?: number) => {
    const art = artOf(game);
    return (
      <span className="gz-poster">
        {game.posters && game.posters[0] ? (
          <img src={game.posters[0]} alt="" loading="lazy" decoding="async" draggable={false} />
        ) : (
          <span className="gz-art" data-c={art.c} data-testid="game-art">
            <span className="gz-mono" aria-hidden="true">{art.mono}</span>
            <span className="gz-art-t line-clamp-2">{game.title}</span>
          </span>
        )}
        {game.isNew && <span className="gz-new">NEW</span>}
        {rank ? <span className="gz-rank">#{rank}</span> : null}
        <span className="gz-cat"><span className="block min-w-0 truncate">{catLabel(game.category)}</span></span>
        <span className="gz-go" aria-hidden="true"><Play className="w-4 h-4 fill-white ml-0.5" /></span>
      </span>
    );
  };

  const tile = (game: MiniGameMeta, wide = false) => (
    <button
      key={game.id}
      type="button"
      onClick={() => setSelectedGameForPlay(game)}
      className={`gz-tile group text-left shrink-0 self-start cursor-pointer ${wide ? 'w-full' : 'w-[214px] sm:w-[236px] lg:w-[262px]'}`}
      data-testid={`game-tile-${game.id}`}
    >
      <span className="gz-card">
        {poster(game)}
        <span className="gz-body block">
          <span className="gz-name block line-clamp-2 min-h-[2.5em]">{game.title}</span>
          <span className="gz-meta">
            <span className="gz-pill"><Users className="w-3 h-3 shrink-0" /><span className="block min-w-0 truncate">{game.players}</span></span>
            <span className="block min-w-0 truncate">{game.rewardNote || (game.pointsReward > 0 ? 'Earn NOOBs' : 'For fun')}</span>
          </span>
        </span>
      </span>
    </button>
  );

  return (
    <div className="gz w-full min-h-screen md:px-8 lg:px-12 px-4 pb-28 md:pb-12" data-testid="games-page">
      {/* Top bar: back (laptop / computer), the name, then search, points and the small buttons on the right */}
      <header className="gz-top sticky top-0 z-30 -mx-4 md:-mx-8 lg:-mx-12 px-4 md:px-8 lg:px-12 py-3 flex items-center gap-2.5">
        {onBack && (
          <button type="button" onClick={onBack} data-testid="games-back" className="gz-ib max-md:!hidden !w-auto px-3 gap-1 text-sm font-bold">
            <ChevronLeft className="w-5 h-5" />
            Back
          </button>
        )}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="gz-word">NOOB</span>
          <span className="gz-tag max-[440px]:!hidden">GAMES</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setShowSearch((v) => !v)} aria-label="Search games" className="gz-ib"><Search className="w-4 h-4" /></button>
          <span className="gz-pts hidden sm:inline-flex" title="Your NOOBs">
            <span className="gz-coin" />
            {formatNoobPoints(userPoints)}
          </span>
          <button
            onClick={() => { const next = !musicOn; setMusicOn(next); setGameMusicOn(next); }}
            aria-label={musicOn ? 'Turn game music off' : 'Turn game music on'}
            title={musicOn ? 'Game music is on (tap to turn off)' : 'Game music is off (tap to turn on)'}
            className="gz-ib"
          >
            {musicOn ? <Music className="w-4 h-4" /> : <VolumeX className="w-4 h-4 opacity-60" />}
          </button>
          <div className="relative" ref={menuRef}>
            <button onClick={() => setShowMenu((prev) => !prev)} aria-label="Arena information" className="gz-ib">
              <MoreVertical className="w-4 h-4" />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-30 bg-black/50" onClick={() => setShowMenu(false)} />
                <div className="gz-pop fixed left-4 right-4 top-20 mx-auto max-w-sm z-40 p-4 text-left">
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b" style={{ borderColor: 'var(--gz-line)' }}>
                    <Info className="w-4 h-4" style={{ color: 'var(--gz-red)' }} />
                    <h3 className="text-xs font-black uppercase tracking-wider">Arena Info &amp; Rules</h3>
                  </div>
                  <div className="space-y-2.5 text-xs">
                    <div className="gz-pop-in">
                      <span className="text-[11px] font-bold block mb-1" style={{ color: 'var(--gz-mute)' }}>Scoring System</span>
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center justify-between gap-2"><span>Victory</span><span className="font-black" style={{ color: 'var(--gz-red)' }}>+10M NOOBs</span></div>
                        <div className="flex items-center justify-between gap-2"><span>Draw / Tie</span><span className="font-black">+5M NOOBs</span></div>
                        <div className="flex items-center justify-between gap-2"><span>Loss / Defeat</span><span className="font-bold" style={{ color: 'var(--gz-dim)' }}>0 NOOBs</span></div>
                      </div>
                    </div>
                    <div className="gz-pop-in">
                      <span className="text-[11px] font-bold block mb-1" style={{ color: 'var(--gz-mute)' }}>Game Modes</span>
                      <ul className="text-[11px] space-y-1 list-disc list-inside">
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
        <div className="relative mb-3">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--gz-red)' }} />
          <input autoFocus type="text" placeholder="Search games" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="gz-search" />
        </div>
      )}

      {/* The welcome card: what the page is, the person's own numbers, and the game to start with */}
      {activeTab === 'games' && !searching && (
        <section className="gz-hero mb-5" data-testid="games-hero">
          <p className="gz-hero-k">NOOB Games</p>
          <h1 className="gz-hero-t">Play. Win.<br />Earn NOOBs.</h1>
          <p className="gz-hero-s">{ALL_50_MINI_GAMES.length} games, one tap away. Every win adds to your NOOBs.</p>
          <div className="gz-hero-row">
            <span className="gz-hero-chip"><span className="gz-coin" /><span className="block min-w-0 truncate">{formatNoobPoints(userPoints)} NOOBs</span></span>
            <span className="gz-hero-chip"><Trophy className="w-3.5 h-3.5 shrink-0" /><span className="block min-w-0 truncate">Rank #{userRank}</span></span>
            {hot[0] && (
              <button type="button" className="gz-hero-cta" onClick={() => setSelectedGameForPlay(hot[0])} data-testid="games-hero-play">
                <Play className="w-3.5 h-3.5 shrink-0 fill-current" /><span className="block min-w-0 truncate">Play {hot[0].title}</span>
              </button>
            )}
          </div>
        </section>
      )}

      {/* For You / Charts */}
      <div className="gz-seg mb-5" role="tablist">
        <button role="tab" aria-selected={activeTab === 'games'} onClick={() => setActiveTab('games')}>For You</button>
        <button role="tab" aria-selected={activeTab === 'leaderboard'} onClick={() => setActiveTab('leaderboard')}>Charts</button>
      </div>

      {activeTab === 'games' ? (
        <>
          {/* People who have played at least one game (their picture, then their name and how many games) */}
          {!searching && (
            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-5 -mx-4 px-4 md:mx-0 md:px-0" data-testid="games-players">
              {[{ ...currentUser, __me: true } as any, ...players].map((u: any) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => { if (!u.__me && onNavigateToUserProfile) onNavigateToUserProfile(u); }}
                  className="shrink-0 w-[72px] text-center cursor-pointer"
                >
                  <span className="gz-ava">
                    <img src={u.avatar || '/noob-logo-circle.png'} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                  </span>
                  <span className="gz-pname block truncate">{u.__me ? 'You' : (u.displayName || u.username)}</span>
                  <span className="gz-pnum block truncate">{(u.gamesPlayedCount || 0).toLocaleString()} {(u.gamesPlayedCount || 0) === 1 ? 'game' : 'games'}</span>
                </button>
              ))}
            </div>
          )}

          {/* The hottest games: our own big games, wide posters with their place */}
          {!searching && hot.length > 0 && (
            <section className="mb-6" data-testid="games-hottest">
              <div className="flex items-center gap-3 mb-1">
                <h2 className="gz-h">The hottest games</h2>
                <span className="gz-rule" />
              </div>
              <p className="gz-sub mb-3">What's trending today on NOOB</p>
              <div className="flex items-start gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 snap-x scroll-pl-4 md:scroll-pl-0 pb-2">
                {hot.map((g, i) => (
                  <button key={g.id} type="button" onClick={() => setSelectedGameForPlay(g)} className="gz-tile group shrink-0 snap-start self-start text-left cursor-pointer w-[84%] sm:w-[420px] lg:w-[500px]">
                    <span className="gz-card">
                      {poster(g, i + 1)}
                      <span className="gz-body block">
                        <span className="gz-name block truncate !text-[15px]">{g.title}</span>
                        <span className="gz-desc block line-clamp-2 min-h-[2.8em]">{g.description}</span>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Category chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-4 no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
            {CATEGORIES.map((cat) => (
              <button key={cat.key} onClick={() => setSelectedCategory(cat.key)} aria-pressed={selectedCategory === cat.key} className="gz-chip">
                {cat.label}
              </button>
            ))}
          </div>

          {searching ? (
            <>
              <h2 className="gz-h mt-1 mb-3 break-words">{searchQuery.trim() ? `Results for “${searchQuery.trim()}”` : CATEGORIES.find((c) => c.key === selectedCategory)?.label}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                {filteredGames.map((g) => tile(g, true))}
              </div>
              {filteredGames.length === 0 && (
                <div className="text-center py-16">
                  <p className="gz-sub !text-sm break-words">No games found matching "{searchQuery}".</p>
                  <button onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }} className="gz-btn mt-3">Reset filters</button>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-7 mt-1">
              {shelves.map((s) => (
                <section key={s.id} data-testid={`games-shelf-${s.id}`}>
                  <button type="button" onClick={() => { if (s.id !== 'new') setSelectedCategory(s.id as GameCategory); }} className="w-full flex items-center gap-3 mb-3 cursor-pointer text-left">
                    <h2 className="gz-h truncate">{s.title}</h2>
                    <span className="gz-rule" />
                    {s.id !== 'new' && <span className="gz-more">See all<ChevronRight className="w-4 h-4" /></span>}
                  </button>
                  <div className="flex items-start gap-3 overflow-x-auto no-scrollbar pb-2 -mx-4 px-4 md:mx-0 md:px-0 snap-x scroll-pl-4 md:scroll-pl-0">
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
          <div className="flex items-center gap-3 mb-3">
            <h2 className="gz-h">Top 10</h2>
            <span className="gz-rule" />
          </div>
          <div className="space-y-2.5">
            {isLoadingLeaderboard && leaderboard.length === 0 ? (
              <div className="py-10 flex flex-col items-center justify-center gap-2 gz-sub">
                <Radio className="w-6 h-6 animate-pulse" />
                <span className="text-xs">Loading rankings...</span>
              </div>
            ) : leaderboardError && leaderboard.length === 0 ? (
              <div className="py-10 flex flex-col items-center justify-center gap-2 text-center px-4">
                <ShieldAlert className="w-6 h-6" style={{ color: 'var(--gz-red)' }} />
                <span className="text-xs gz-sub">Couldn't load the leaderboard right now.</span>
                <button onClick={loadLeaderboardData} className="gz-btn mt-1">Try again</button>
              </div>
            ) : leaderboard.length === 0 ? (
              <div className="py-10 flex flex-col items-center justify-center gap-1.5 text-center px-4">
                <Trophy className="w-6 h-6" style={{ color: 'var(--gz-dim)' }} />
                <span className="text-xs gz-sub">No rankings yet — be the first to play!</span>
              </div>
            ) : (
              leaderboard.slice(0, 10).map((player, idx) => {
                const fullUser = allUsers.find((u) => (player.userId && u.id === player.userId) || u.username === player.username);
                return (
                  <div
                    key={player.userId || player.username || idx}
                    onClick={() => { if (fullUser && onNavigateToUserProfile) onNavigateToUserProfile(fullUser); }}
                    data-me={player.username === currentUser.username ? '1' : undefined}
                    className={`gz-lb ${fullUser && onNavigateToUserProfile ? 'cursor-pointer' : ''}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="gz-medal" data-r={idx + 1}>{idx + 1}</span>
                      <img
                        src={player.avatar || '/noob-logo-circle.png'}
                        alt={player.username}
                        className="w-10 h-10 rounded-full object-cover shrink-0"
                        referrerPolicy="no-referrer"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sm font-bold text-white truncate">{player.displayName || player.username}</span>
                          {player.username === currentUser.username && <span className="gz-you">YOU</span>}
                        </div>
                        <span className="text-[11px] gz-sub block truncate">@{player.username} • {player.gamesWon || 0} Wins</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <span className="gz-lbpts">{formatNoobPoints(player.noobPoints || 0)}</span>
                      <span className="text-[10px] gz-sub block">NOOBs</span>
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
        <React.Suspense fallback={<LoadingPage />}>
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
