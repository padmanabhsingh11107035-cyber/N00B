import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  Users,
  UserCheck,
  UserPlus,
  MessageSquare,
  Sparkles,
  Heart,
  MessageCircle,
  X,
  Smile,
  Globe,
  Film,
  Layers,
  CheckCircle2,
  Share2,
  Lock,
  Briefcase,
  Clock,
  Mail,
  Phone,
  Shuffle,
  RefreshCw,
  ArrowDown,
  Handshake,
  User as UserIcon,
  Loader2,
  Play
} from 'lucide-react';
import { Post, Reel, User } from '../../types';
import { fetchUsersStrict, peekUsersDirectory, subscribeToOnlinePresence, type PresenceEntry } from '../../services/api';
import { mergePeople, realPeople, shufflePeople } from '../../utils/peopleList';
import { predictFollowToggle, predictFollowersCount } from '../../utils/followPredict';
import { getContactsPermissionState, findFriendsFromContacts } from '../../services/contactSync';
import { VerifiedBadge } from '../Common/VerifiedBadge';
import { PostThumbnailMedia } from '../Common/PostThumbnailMedia';
import { JoinUsModal } from './JoinUsModal';
import { LazyVideo } from '../Common/LazyVideo';
import { buildIndex, searchIndex, popularity } from '../../utils/searchEngine';
import { coverBackground } from '../Profile/ProfileCover';
import './explore.css';

// Once someone taps "Not now", don't ask again on this device — re-showing it every visit would be
// exactly the kind of nagging that makes people distrust a permission prompt.
const CONTACTS_PROMPT_DISMISSED_KEY = 'noob_contacts_prompt_dismissed_v1';

interface ToggleFollowResult {
  success: boolean;
  isFollowing: boolean;
  isFollowRequested?: boolean;
  followersCount: number;
  message?: string;
}

interface ExploreViewProps {
  currentUser?: User | null;
  posts: Post[];
  reels: Reel[];
  onSelectPost: (post: Post) => void;
  onSelectReel: (reel: Reel) => void;
  onStartChat?: (user: User) => void;
  onNavigateToUserProfile?: (user: User) => void;
  // Owns the actual follow/unfollow API call and syncs app-wide user state —
  // ExploreView must not call the API itself, only reflect the result here.
  onToggleFollowUser?: (userId: string) => Promise<ToggleFollowResult | void>;
  // The admin's "share this link" ?join=team deep link (App.tsx) resolves here — opens the Join Us
  // modal automatically once this view has actually mounted.
  autoOpenJoinTeam?: boolean;
  onAutoOpenJoinTeamHandled?: () => void;
  // Admin Control Panel → Platform: "join the NOOB team" applications open?
  joinTeamOpen?: boolean;
  // A Story hashtag sticker's tap-through arrives here — prefills the search and jumps to the
  // Posts tab, mirroring autoOpenJoinTeam's "arrive with a pending action" pattern above.
  initialSearchQuery?: string;
  onInitialSearchQueryHandled?: () => void;
}

const CATEGORIES = ['All', 'Humor', 'Gaming', 'Music', 'Art & Design', 'Vibes', 'Tech', 'Lifestyle'];
const ITEMS_PER_PAGE = 6;

export const ExploreView: React.FC<ExploreViewProps> = ({
  currentUser,
  posts,
  reels,
  onSelectPost,
  onSelectReel,
  onStartChat,
  onNavigateToUserProfile,
  onToggleFollowUser,
  autoOpenJoinTeam,
  onAutoOpenJoinTeamHandled,
  joinTeamOpen = true,
  initialSearchQuery,
  onInitialSearchQueryHandled
}) => {
  const [activeTab, setActiveTab] = useState<'users' | 'posts' | 'reels'>('users');
  const [onlinePresence, setOnlinePresence] = useState<Record<string, PresenceEntry[]>>({});
  useEffect(() => subscribeToOnlinePresence(setOnlinePresence), []);
  const isUserOnline = (userId: string) => !!onlinePresence[userId]?.length;
  const [searchQuery, setSearchQuery] = useState('');
  const [showJoinUsModal, setShowJoinUsModal] = useState(false);

  useEffect(() => {
    if (!autoOpenJoinTeam) return;
    setShowJoinUsModal(true);
    onAutoOpenJoinTeamHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenJoinTeam]);

  useEffect(() => {
    if (!initialSearchQuery) return;
    setSearchQuery(initialSearchQuery);
    setActiveTab('posts');
    onInitialSearchQueryHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSearchQuery]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  // People already known from an earlier visit (or from start-up) are shown at once and brought up to date in the background; the spinner is only for a first-ever load.
  const [usersList, setUsersList] = useState<User[]>(() => {
    const known = peekUsersDirectory(currentUser?.id);
    return known ? shufflePeople(realPeople(known.list)) : [];
  });
  const [loadingUsers, setLoadingUsers] = useState(usersList.length === 0);
  const [usersFailed, setUsersFailed] = useState(false);
  const usersRequest = useRef(0);
  const usersShown = useRef(usersList);
  usersShown.current = usersList;
  const usersAreEveryone = useRef(usersList.length > 0);   // the list on screen is the full list, not the answer to a typed search
  const [followLoadingId, setFollowLoadingId] = useState<string | null>(null);

  // "Find friends from your contacts" — real, native contact access exists only inside the actual
  // Android app (there is no meaningful equivalent for a website, on any browser, including on an
  // iPhone); getContactsPermissionState() already resolves to 'unsupported' everywhere else, so the
  // banner below simply never appears there.
  const [contactsPromptState, setContactsPromptState] = useState<'checking' | 'ask' | 'hidden'>('checking');
  const [contactMatches, setContactMatches] = useState<User[]>([]);
  const [loadingContactMatches, setLoadingContactMatches] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const state = await getContactsPermissionState();
      if (!alive) return;
      if (state === 'granted') {
        setContactsPromptState('hidden');
        setLoadingContactMatches(true);
        const matches = await findFriendsFromContacts();
        if (alive) {
          setContactMatches(matches);
          setLoadingContactMatches(false);
        }
      } else if (state === 'prompt' && localStorage.getItem(CONTACTS_PROMPT_DISMISSED_KEY) !== '1') {
        setContactsPromptState('ask');
      } else {
        setContactsPromptState('hidden');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const handleAllowContactsAccess = async () => {
    setContactsPromptState('hidden');
    setLoadingContactMatches(true);
    try {
      const matches = await findFriendsFromContacts();
      setContactMatches(matches);
    } finally {
      setLoadingContactMatches(false);
    }
  };

  const handleDismissContactsPrompt = () => {
    try {
      localStorage.setItem(CONTACTS_PROMPT_DISMISSED_KEY, '1');
    } catch {
      // private browsing or storage disabled — the prompt just reappears next visit, harmless
    }
    setContactsPromptState('hidden');
  };

  // Pagination & Infinite Scroll
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);

  // Explore keeps the order it was opened with (only the Home page refreshes (pull down there): no other page has a refresh button, a pull-down refresh or a timer that reloads it).
  const [shuffledPosts, setShuffledPosts] = useState<Post[]>(posts);
  const [shuffledReels, setShuffledReels] = useState<Reel[]>(reels);

  // Sync shuffled items when props update
  useEffect(() => {
    setShuffledPosts(posts);
  }, [posts]);

  useEffect(() => {
    setShuffledReels(reels);
  }, [reels]);

  // Load the registered people (without NOOB's own AI account). Only the newest request may change the screen; a failure never shows "nobody is here" - it keeps what is
  // on screen, or offers Retry when there is nothing yet.
  const loadUsers = async (query?: string) => {
    const id = ++usersRequest.current;
    const haveSome = usersShown.current.length > 0;
    if (!haveSome || query) setLoadingUsers(true);
    setUsersFailed(false);
    try {
      const res = realPeople(await fetchUsersStrict(query));
      if (id !== usersRequest.current) return;
      setUsersList(haveSome && !query && usersAreEveryone.current ? mergePeople(usersShown.current, res) : shufflePeople(res));
      usersAreEveryone.current = !query;
    } catch (err) {
      if (id !== usersRequest.current) return;
      console.error('Error fetching registered users:', err);
      setUsersFailed(true);
    } finally {
      if (id === usersRequest.current) setLoadingUsers(false);
    }
  };

  // A typed search waits for a short pause in typing; an empty search (the full list) loads at once.
  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE);
    if (!searchQuery.trim()) { void loadUsers(''); return; }
    const t = window.setTimeout(() => { void loadUsers(searchQuery); }, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // Back online, or back on this tab, after a failed or empty load: try again by itself.
  useEffect(() => {
    const retry = () => {
      if (document.visibilityState === 'hidden') return;
      if (usersShown.current.length === 0) void loadUsers(searchQuery);
    };
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', retry);
    return () => { window.removeEventListener('online', retry); document.removeEventListener('visibilitychange', retry); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // Handle follow / follow-request toggle — the actual API call lives in
  // onToggleFollowUser (App.tsx), which also syncs app-wide user state;
  // this just reflects the result back into this view's own local list.
  const handleToggleFollow = async (userId: string) => {
    // The button changes AT ONCE to what the tap will most likely turn into (utils/followPredict.ts); the answer from the server is put in when it
    // comes, and if the follow failed the old state comes back.
    const person = [...usersList, ...contactMatches].find((u) => u.id === userId);
    const before = { isFollowing: !!person?.isFollowing, isFollowRequested: !!person?.isFollowRequested };
    const show = (st: { isFollowing: boolean; isFollowRequested: boolean }, followers?: number) => {
      const patch = (u: User) => (u.id === userId ? { ...u, isFollowing: st.isFollowing, isFollowRequested: st.isFollowRequested, ...(followers !== undefined ? { followersCount: followers } : {}) } : u);
      setUsersList((prev) => prev.map(patch));
      setContactMatches((prev) => prev.map(patch));
    };
    if (person) {
      const guess = predictFollowToggle(before, person);
      show(guess, predictFollowersCount(person.followersCount, before, guess));
    }
    try {
      setFollowLoadingId(userId);
      const res = await onToggleFollowUser?.(userId);
      if (res && res.success) show({ isFollowing: !!res.isFollowing, isFollowRequested: !!res.isFollowRequested }, res.followersCount);
      else if (person) show(before, person.followersCount);
    } catch (err) {
      console.error('Follow error:', err);
      if (person) show(before, person.followersCount);
    } finally {
      setFollowLoadingId(null);
    }
  };

  // Search works like a search engine, not like "the caption must contain exactly this": every word on its own, typing mistakes and word endings
  // forgiven, related words found (music ~ songs), best match first (see utils/searchEngine.ts).
  const searchWords = searchQuery.trim();
  const postRanked = useMemo(() => {
    if (!searchWords) return null;
    const index = buildIndex<Post>(shuffledPosts.map((p) => ({
      item: p,
      boost: popularity({ views: 0, likes: p.likesCount, comments: p.commentsCount, createdAt: p.createdAt }),
      fields: [{ text: p.caption || '', weight: 5 }, { text: (p.hashtags || []).join(' '), weight: 4 }, { text: p.username || '', weight: 3 }, { text: p.category || '', weight: 2 }]
    })));
    return searchIndex<Post>(searchWords, index).map((h) => h.item);
  }, [shuffledPosts, searchWords]);
  const reelRanked = useMemo(() => {
    if (!searchWords) return null;
    const index = buildIndex<Reel>(shuffledReels.map((r) => ({
      item: r,
      boost: popularity({ views: r.viewsCount, likes: r.likesCount, comments: r.commentsCount, createdAt: r.createdAt }),
      fields: [{ text: r.caption || '', weight: 5 }, { text: r.audioTrackTitle || r.audioTrack?.title || '', weight: 4 }, { text: r.username || '', weight: 3 }]
    })));
    return searchIndex<Reel>(searchWords, index).map((h) => h.item);
  }, [shuffledReels, searchWords]);

  // Filter posts
  const filteredPosts = (postRanked ?? shuffledPosts).filter((p) => {
    const matchesCategory =
      selectedCategory === 'All' ||
      p.category?.toLowerCase() === selectedCategory.toLowerCase() ||
      (p.hashtags && p.hashtags.some((h) => h.toLowerCase().includes(selectedCategory.toLowerCase())));

    return matchesCategory;
  });

  // Filter reels
  const filteredReels = reelRanked ?? shuffledReels;

  // Active items count for pagination depending on tab
  const totalItemsCount =
    activeTab === 'users'
      ? usersList.length
      : activeTab === 'posts'
      ? filteredPosts.length
      : filteredReels.length;

  const hasMore = visibleCount < totalItemsCount;

  // IntersectionObserver for Infinite Scrolling
  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel || !hasMore || isLoadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          setIsLoadingMore(true);
          setTimeout(() => {
            setVisibleCount((prev) => prev + ITEMS_PER_PAGE);
            setIsLoadingMore(false);
          }, 300);
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, totalItemsCount, visibleCount, activeTab]);

  const paginatedUsers = usersList.slice(0, visibleCount);
  const paginatedPosts = filteredPosts.slice(0, visibleCount);
  const paginatedReels = filteredReels.slice(0, visibleCount);

  return (
    <div
      id="explore-view-container"
      className="w-full max-w-4xl mx-auto px-3 sm:px-4 pt-3 pb-24 space-y-5 select-none relative"
    >
      {/* "Find friends from your contacts" — ask once, then show any matches right here at the top */}
      {contactsPromptState === 'ask' && (
        <div className="p-4 rounded-3xl bg-zinc-950 border border-noob/30 shadow-lg flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-noob/15 border border-noob/30 flex items-center justify-center shrink-0">
            <Phone className="w-5 h-5 text-noob" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-white">Find friends from your contacts</h3>
            <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
              See which of your phone contacts are already on NOOB, right here at the top of Explore. Your contacts are only ever used to find matches — never stored or shown to anyone else.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={handleAllowContactsAccess}
                className="px-3.5 py-1.5 rounded-xl bg-noob hover:bg-noob/90 text-black text-xs font-black cursor-pointer transition-colors"
              >
                Allow
              </button>
              <button
                onClick={handleDismissContactsPrompt}
                className="px-3.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-bold cursor-pointer transition-colors border border-zinc-800"
              >
                Not Now
              </button>
            </div>
          </div>
          <button onClick={handleDismissContactsPrompt} className="text-zinc-500 hover:text-white cursor-pointer shrink-0" title="Dismiss">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {(loadingContactMatches || contactMatches.length > 0) && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 px-1">
            <Phone className="w-3.5 h-3.5 text-noob" /> From Your Contacts
          </h3>
          {loadingContactMatches ? (
            <div className="flex items-center gap-2 text-xs text-zinc-500 px-1 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking your contacts…
            </div>
          ) : (
            <div className="flex items-center gap-3 overflow-x-auto pb-1 scrollbar-none">
              {contactMatches.map((user) => (
                <div
                  key={user.id}
                  className="ex-contact min-w-0"
                >
                  <img loading="lazy" decoding="async"
                    onClick={() => onNavigateToUserProfile?.(user)}
                    src={user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
                    alt={user.username}
                    className="w-14 h-14 rounded-full object-cover cursor-pointer"
                    referrerPolicy="no-referrer"
                  />
                  <span
                    onClick={() => onNavigateToUserProfile?.(user)}
                    className="ex-name block truncate w-full cursor-pointer" style={{ fontSize: 13.5 }}
                  >
                    {user.displayName || user.username}
                  </span>
                  {user.id !== currentUser?.id && (
                    <button
                      onClick={() => handleToggleFollow(user.id)}
                      disabled={followLoadingId === user.id}
                      className={`ex-btn w-full justify-center cursor-pointer disabled:opacity-50 ${user.isFollowing || user.isFollowRequested ? 'ex-quiet' : 'ex-primary'}`}
                      style={{ height: 32, fontSize: 12.5 }}
                    >
                      {user.isFollowing ? 'Noobed' : user.isFollowRequested ? 'Requested' : 'Noob'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* the title and one search field */}
      <div className="pt-1">
        <h1 className="ex-title">Explore</h1>
        <p className="ex-sub">People, pictures and reels, all in one place</p>
      </div>
      <div className="flex items-center gap-2 w-full">
        <div className="ex-search flex-1">
          <Search className="ex-ico w-[18px] h-[18px]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search anything"
            aria-label="Search people, handles, bios, posts and reels"
            enterKeyHint="search"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="ex-clear cursor-pointer" aria-label="Clear search">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Apply to join the NOOB team (hidden while applications are closed) */}
        {joinTeamOpen && (
          <button
            onClick={() => setShowJoinUsModal(true)}
            className="ex-icon-btn shrink-0 cursor-pointer"
            style={{ width: 50, height: 50, borderRadius: 18 }}
            title="Join the NOOB team"
            aria-label="Join the NOOB team"
          >
            <Handshake className="w-[18px] h-[18px]" />
          </button>
        )}
      </div>

      {showJoinUsModal && <JoinUsModal closed={!joinTeamOpen} onClose={() => setShowJoinUsModal(false)} />}

      {/* the three tabs always fit the width of the screen, whatever the text size, and the row never slides sideways under a finger */}
      <div data-testid="explore-tabs">
        <div className="ex-seg w-full" role="tablist">
          {([
            { id: 'posts', label: 'Posts', Icon: Layers },
            { id: 'users', label: 'People', Icon: Users },
            { id: 'reels', label: 'Reels', Icon: Film }
          ] as const).map(({ id, label, Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => {
                setActiveTab(id);
                setVisibleCount(ITEMS_PER_PAGE);
              }}
              className={`cursor-pointer ${activeTab === id ? 'ex-on' : ''}`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="block truncate">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ================= TAB 1: PEOPLE ================= */}
      {activeTab === 'users' && (
        <div className="space-y-3">
          {loadingUsers ? (
            <div className="ex-empty flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p className="text-sm">Finding people...</p>
            </div>
          ) : usersList.length === 0 && usersFailed ? (
            <div className="ex-empty">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <h3>Could not load people</h3>
              <p className="text-sm mt-1">Check your connection and try again.</p>
              <button onClick={() => { void loadUsers(searchQuery); }} className="ex-btn ex-primary mt-4 cursor-pointer">Try again</button>
            </div>
          ) : usersList.length === 0 ? (
            <div className="ex-empty">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <h3>No one found</h3>
              <p className="text-sm mt-1">Try another search word.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {paginatedUsers.map((user) => {
                const isMe = user.id === currentUser?.id || user.username === currentUser?.username;
                const isBusiness = user.accountType === 'business' || user.isBusiness;
                const isPrivate = user.accountType === 'private';
                const compact = (n?: number) => Intl.NumberFormat('en', { notation: 'compact' }).format(n || 0);

                return (
                  <div key={user.id} className="ex-user">
                    <div className="ex-user-cover" style={coverBackground(user)} onClick={() => onNavigateToUserProfile?.(user)} />
                    <div className="ex-user-body">
                      <div className="ex-user-top">
                        <div onClick={() => onNavigateToUserProfile?.(user)} className="ex-user-av" title={`View @${user.username}'s profile`}>
                          <img loading="lazy" decoding="async"
                            src={user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
                            alt={user.username}
                            referrerPolicy="no-referrer"
                          />
                          {isUserOnline(user.id) && <span className="ex-online" />}
                        </div>

                        {!isMe ? (
                          <div className="flex items-center gap-2 shrink-0">
                            {onStartChat && (
                              <button onClick={() => onStartChat(user)} className="ex-icon-btn cursor-pointer" title={`Message @${user.username}`} aria-label={`Message @${user.username}`}>
                                <MessageSquare className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handleToggleFollow(user.id)}
                              disabled={followLoadingId === user.id}
                              className={`ex-btn cursor-pointer disabled:opacity-50 group/fbtn ${user.isFollowing || user.isFollowRequested ? 'ex-quiet' : 'ex-primary'}`}
                            >
                              {user.isFollowing ? (
                                <>
                                  <UserCheck className="w-4 h-4 group-hover/fbtn:hidden" />
                                  <X className="w-4 h-4 hidden group-hover/fbtn:inline text-red-400" />
                                  <span className="group-hover/fbtn:hidden">Noobed</span>
                                  <span className="hidden group-hover/fbtn:inline text-red-400">Unnoob</span>
                                </>
                              ) : user.isFollowRequested ? (
                                <>
                                  <Clock className="w-4 h-4" />
                                  <span>Requested</span>
                                </>
                              ) : isPrivate ? (
                                <>
                                  <Lock className="w-4 h-4" />
                                  <span>Request</span>
                                </>
                              ) : (
                                <>
                                  <UserPlus className="w-4 h-4" />
                                  <span>Noob</span>
                                </>
                              )}
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => onNavigateToUserProfile?.(user)} className="ex-btn ex-quiet cursor-pointer shrink-0">
                            <UserIcon className="w-4 h-4" />
                            <span>My Profile</span>
                          </button>
                        )}
                      </div>

                      <div className="mt-3 flex items-center gap-1.5 flex-wrap min-w-0">
                        <h4 onClick={() => onNavigateToUserProfile?.(user)} className="ex-name truncate cursor-pointer" title={`View @${user.username}'s profile`}>
                          {user.displayName || user.username}
                        </h4>
                        {user.isVerified && <VerifiedBadge size="sm" />}
                        {isMe && <span className="ex-tag">You</span>}
                        {isBusiness ? (
                          <span className="ex-tag"><Briefcase className="w-3 h-3" /> Business</span>
                        ) : isPrivate ? (
                          <span className="ex-tag"><Lock className="w-3 h-3" /> Private</span>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        <button type="button" onClick={() => onNavigateToUserProfile?.(user)} className="ex-handle cursor-pointer hover:underline">
                          @{user.username}
                        </button>
                        {user.countryCode && <span className="ex-handle opacity-70 font-mono text-[11px]">{user.countryCode}</span>}
                        {user.businessCategory && isBusiness && <span className="ex-handle">· {user.businessCategory}</span>}
                      </div>

                      <p className="ex-bio">{user.bio || 'Connecting on NOOB!'}</p>

                      <div className="ex-stats">
                        <span><strong>{compact(user.followersCount)}</strong>followers</span>
                        <span><strong>{compact(user.followingCount)}</strong>following</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================= TAB 2: POSTS ================= */}
      {activeTab === 'posts' && (
        <div className="space-y-4">
          <div className="ex-chips">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  setSelectedCategory(cat);
                  setVisibleCount(ITEMS_PER_PAGE);
                }}
                className={`ex-chip cursor-pointer ${selectedCategory === cat ? 'ex-on' : ''}`}
              >
                {cat}
              </button>
            ))}
          </div>

          {paginatedPosts.length === 0 ? (
            <div className="ex-empty">
              <Sparkles className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <h3>Nothing here yet</h3>
              <p className="text-sm mt-1">Try another topic or search word.</p>
            </div>
          ) : (
            <div className="ex-mosaic">
              {paginatedPosts.map((post, i) => (
                <div key={post.id} onClick={() => onSelectPost(post)} className="ex-tile" data-big={i % 9 === 0 ? '1' : undefined}>
                  <PostThumbnailMedia
                    src={post.slides?.[0]?.mediaUrl}
                    filter={post.slides?.[0]?.filter}
                    mediaType={post.slides?.[0]?.mediaType}
                    alt={post.caption}
                    className="w-full h-full object-cover"
                  />
                  {(post.slides?.length || 0) > 1 ? (
                    <span className="ex-badge" aria-label="Several pictures"><Layers className="w-3.5 h-3.5" /></span>
                  ) : post.slides?.[0]?.mediaType === 'video' ? (
                    <span className="ex-badge" aria-label="Video"><Play className="w-3.5 h-3.5 fill-white" /></span>
                  ) : null}
                  <div className="ex-over">
                    <span className="flex items-center gap-1"><Heart className="w-4 h-4 fill-white" /> {post.likesCount}</span>
                    <span className="flex items-center gap-1"><MessageCircle className="w-4 h-4 fill-white" /> {post.commentsCount}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================= TAB 3: REELS ================= */}
      {activeTab === 'reels' && (
        paginatedReels.length === 0 ? (
          <div className="ex-empty">
            <Film className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <h3>No reels found</h3>
            <p className="text-sm mt-1">Try another search word.</p>
          </div>
        ) : (
          <div className="ex-reels">
            {paginatedReels.map((reel) => (
              <div key={reel.id} onClick={() => onSelectReel(reel)} className="ex-reel">
                {reel.thumbnailUrl ? (
                  <img loading="lazy" decoding="async" src={reel.thumbnailUrl} alt={reel.caption} className="w-full h-full object-cover" />
                ) : (
                  // Older reels uploaded before thumbnails were captured on publish have no thumbnailUrl at all: the video's own first frame is still the ACTUAL reel.
                  <LazyVideo src={reel.videoUrl} muted playsInline className="w-full h-full object-cover" />
                )}
                <span className="ex-views"><Play className="w-3 h-3 fill-white" /> {Intl.NumberFormat('en', { notation: 'compact' }).format(reel.viewsCount || 0)}</span>
                <div className="ex-by">
                  {reel.userAvatar && <img src={reel.userAvatar} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />}
                  <span>@{reel.username}</span>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Infinite Scroll Load More Sentinel */}
      <div ref={loadMoreSentinelRef} className="w-full py-4 flex items-center justify-center">
        {isLoadingMore ? (
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Loader2 className="w-4 h-4 text-noob animate-spin" />
            <span>Loading more Explore items...</span>
          </div>
        ) : hasMore ? (
          <div className="h-4" />
        ) : totalItemsCount > ITEMS_PER_PAGE ? (
          <div className="text-center py-2 text-[11px] text-zinc-500 font-medium">
            ✓ End of Explore
          </div>
        ) : null}
      </div>
    </div>
  );
};
