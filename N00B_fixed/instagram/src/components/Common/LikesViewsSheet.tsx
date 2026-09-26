import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Eye, Search, UserPlus, UserCheck, Clock } from 'lucide-react';
import { User } from '../../types';
import { VerifiedBadge } from './VerifiedBadge';

interface ListSource {
  label: string; // e.g. "Likes" / "Views" / "Seen By"
  fetchUsers: () => Promise<{ users?: User[]; error?: string }>;
}

interface ToggleFollowResult {
  success: boolean;
  isFollowing: boolean;
  isFollowRequested?: boolean;
}

interface LikesViewsSheetProps {
  // At least one of these must be given. When both are given, the sheet shows a fixed
  // "Likes and views" title with the view count as a headline stat, and the likes list below
  // (matching Instagram's real reel-insights layout — views are a count, not a browsable list).
  // With only one given, it just shows that single list under its own label.
  likes?: ListSource;
  views?: ListSource;
  // The raw view count to show as the headline stat — separate from views.fetchUsers's list
  // length, since a view count (autoplay loops included) is usually much higher than the number
  // of real accounts a "seen by" list could ever show.
  viewsCount?: number;
  // Whose content this is — used only for the "Only @x can see the total number of likes" note.
  ownerUsername?: string;
  initialTab?: 'likes' | 'views';
  currentUserId?: string;
  onClose: () => void;
  onNavigateToUser?: (user: User) => void;
  onToggleFollowUser?: (userId: string) => Promise<ToggleFollowResult | void>;
}

// How far down the sheet must be dragged (from its own drag handle/header,
// not the scrollable list below) before releasing counts as "dismiss" —
// short of that it springs back open.
const DRAG_DISMISS_THRESHOLD = 90;

// Shared bottom sheet for "who liked this" / "who viewed this" on a post, reel, or story — fixed
// at 70% of the viewport height, drag-to-dismiss from the handle/header (the list itself scrolls
// normally), matching the same slide-up entrance as the Comments sheet.
export const LikesViewsSheet: React.FC<LikesViewsSheetProps> = ({
  likes,
  views,
  viewsCount,
  ownerUsername,
  initialTab,
  currentUserId,
  onClose,
  onNavigateToUser,
  onToggleFollowUser
}) => {
  const hasBoth = !!likes && !!views;
  // With both given, the browsable list is always the likes list (views is summary-only, above).
  // With only one given, that one is what's shown.
  const activeSource = hasBoth ? likes : initialTab === 'views' ? views || likes : likes || views;
  const listLabel = hasBoth ? 'Liked by' : activeSource?.label || 'Liked by';

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // Per-user optimistic follow state, seeded from what the list came back with.
  const [followState, setFollowState] = useState<Record<string, { isFollowing: boolean; isFollowRequested?: boolean }>>({});
  const [followBusy, setFollowBusy] = useState<string | null>(null);

  const [dragY, setDragY] = useState(0);
  const [hasDraggedOnce, setHasDraggedOnce] = useState(false);
  const draggingRef = useRef(false);
  const dragStartYRef = useRef(0);

  useEffect(() => {
    if (!activeSource) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await activeSource.fetchUsers();
        if (cancelled) return;
        if (res.users) {
          setUsers(res.users);
          setFollowState(
            Object.fromEntries(res.users.map((u) => [u.id, { isFollowing: !!u.isFollowing, isFollowRequested: !!u.isFollowRequested }]))
          );
        } else {
          setError(res.error || 'Could not load this list.');
        }
      } catch (err) {
        if (!cancelled) setError('Could not load this list.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.username.toLowerCase().includes(q) || (u.displayName || '').toLowerCase().includes(q));
  }, [users, query]);

  const handleFollowClick = async (u: User) => {
    if (!onToggleFollowUser || followBusy) return;
    setFollowBusy(u.id);
    const prev = followState[u.id];
    // Optimistic flip so the tap feels instant; corrected below from the real result.
    setFollowState((s) => ({ ...s, [u.id]: { isFollowing: !prev?.isFollowing, isFollowRequested: false } }));
    try {
      const res = await onToggleFollowUser(u.id);
      if (res) setFollowState((s) => ({ ...s, [u.id]: { isFollowing: res.isFollowing, isFollowRequested: res.isFollowRequested } }));
    } catch {
      setFollowState((s) => ({ ...s, [u.id]: prev || { isFollowing: false } }));
    } finally {
      setFollowBusy(null);
    }
  };

  const handleDragStart = (e: React.TouchEvent) => {
    draggingRef.current = true;
    dragStartYRef.current = e.touches[0].clientY;
    setHasDraggedOnce(true);
  };

  const handleDragMove = (e: React.TouchEvent) => {
    if (!draggingRef.current) return;
    const delta = e.touches[0].clientY - dragStartYRef.current;
    if (delta > 0) setDragY(delta);
  };

  const handleDragEnd = () => {
    draggingRef.current = false;
    if (dragY > DRAG_DISMISS_THRESHOLD) {
      onClose();
    } else {
      setDragY(0);
    }
  };

  // Portalled straight to document.body: PostCard/ReelsView/StoryViewerModal
  // all render this inside ancestors that use backdrop-blur/filter classes,
  // and per spec a `filter`/`backdrop-filter` on ANY ancestor becomes the
  // containing block for `position: fixed` descendants — without the
  // portal this "fullscreen" sheet gets trapped inside that ancestor's own
  // (much smaller) box instead of covering the viewport.
  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={hasDraggedOnce ? { transform: `translateY(${dragY}px)` } : undefined}
        className={`w-full max-w-lg bg-[#0e0e0e] border border-neutral-800 sm:rounded-2xl rounded-t-2xl h-[70vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200 ${
          hasDraggedOnce && !draggingRef.current ? 'transition-transform' : ''
        }`}
      >
        {/* Drag handle */}
        <div
          onTouchStart={handleDragStart}
          onTouchMove={handleDragMove}
          onTouchEnd={handleDragEnd}
          className="pt-2.5 pb-1 flex justify-center cursor-grab active:cursor-grabbing shrink-0 touch-none"
        >
          <div className="w-10 h-1.5 rounded-full bg-neutral-700" />
        </div>

        {/* Header */}
        <div
          onTouchStart={handleDragStart}
          onTouchMove={handleDragMove}
          onTouchEnd={handleDragEnd}
          className="flex items-center justify-between px-4 pb-3 shrink-0"
        >
          <h3 className="text-sm font-bold text-white tracking-tight">
            {hasBoth ? 'Likes and views' : activeSource?.label}
            {!hasBoth && !loading && !error && <span className="text-xs text-gray-400 font-normal"> ({users.length})</span>}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-neutral-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* View-count headline stat + privacy note (only when both likes & views are given) */}
        {hasBoth && typeof viewsCount === 'number' && (
          <div className="px-4 pb-4 border-b border-neutral-800 shrink-0 text-center">
            <div className="flex items-center justify-center gap-2 text-2xl font-black text-white">
              <Eye className="w-5 h-5 text-zinc-300" />
              {Intl.NumberFormat('en', { notation: 'compact' }).format(viewsCount)}
            </div>
            <p className="text-xs text-zinc-500 mt-1.5 max-w-xs mx-auto leading-relaxed">
              Only {ownerUsername ? `@${ownerUsername}` : 'the owner'} can see the total number of likes on this{' '}
              {likes?.label?.toLowerCase().includes('reel') ? 'reel' : 'post'}.
            </p>
          </div>
        )}

        {/* "Liked by" section header (only needed when it'd say something the title above
            doesn't already say — the single-list title already names the list). + search */}
        {!loading && !error && (
          <div className="px-4 pt-3 pb-2 shrink-0 space-y-2.5">
            {hasBoth && <h4 className="text-sm font-bold text-white">{listLabel}</h4>}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className="w-full bg-zinc-900 text-xs text-white pl-8 pr-3 py-2.5 rounded-xl border border-zinc-800 outline-none focus:border-zinc-600 placeholder:text-zinc-500"
              />
            </div>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-14 flex flex-col items-center justify-center gap-2 text-zinc-500">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-xs">Loading...</span>
            </div>
          ) : error ? (
            <div className="py-14 text-center text-xs text-zinc-500 px-6">{error}</div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-14 text-center text-xs text-zinc-500 px-6">{query ? 'No matches.' : 'No one yet.'}</div>
          ) : (
            filteredUsers.map((u) => {
              const fs = followState[u.id];
              const isSelf = currentUserId && u.id === currentUserId;
              return (
                <div key={u.id} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors">
                  <button
                    onClick={() => onNavigateToUser?.(u)}
                    className="flex-1 min-w-0 flex items-center gap-3 text-left cursor-pointer"
                  >
                    <img
                      src={u.avatar || '/noob-logo.svg.jpeg'}
                      alt={u.username}
                      className="w-11 h-11 rounded-full object-cover border border-zinc-800 shrink-0"
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-bold text-white truncate" translate="no">{u.username}</span>
                        {u.isVerified && <VerifiedBadge size="xs" />}
                      </div>
                      {u.displayName && <span className="text-[11px] text-zinc-500 truncate block">{u.displayName}</span>}
                    </div>
                  </button>
                  {onToggleFollowUser && !isSelf && (
                    <button
                      onClick={() => handleFollowClick(u)}
                      disabled={followBusy === u.id}
                      className={`shrink-0 px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-60 ${
                        fs?.isFollowing
                          ? 'bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700'
                          : fs?.isFollowRequested
                          ? 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                          : 'bg-[#0095F6] text-white hover:bg-[#1877c9]'
                      }`}
                    >
                      {followBusy === u.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : fs?.isFollowing ? (
                        <UserCheck className="w-3.5 h-3.5" />
                      ) : fs?.isFollowRequested ? (
                        <Clock className="w-3.5 h-3.5" />
                      ) : (
                        <UserPlus className="w-3.5 h-3.5" />
                      )}
                      {fs?.isFollowing ? 'Following' : fs?.isFollowRequested ? 'Requested' : 'Follow'}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
