import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Eye, Search, Heart } from 'lucide-react';
import './likesSheet.css';
import { User } from '../../types';
import { predictFollowToggle } from '../../utils/followPredict';
import { VerifiedBadge } from './VerifiedBadge';
import { useSheetDrag } from '../../utils/sheetDrag';
import { SheetGrip, CLOSE_X_CLASS } from './SheetGrip';

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
  // At least one of these must be given. When both are given (the owner looking at their own post or
  // reel), the sheet is titled "Likes and views" and lists everyone who viewed it, with the people who
  // liked it first and a heart next to them. With only one given, it shows that single list.
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
  // With only one given, that one is what's shown (with both, the two lists are merged below).
  const activeSource = hasBoth ? likes : initialTab === 'views' ? views || likes : likes || views;

  const [users, setUsers] = useState<User[]>([]);
  // Who liked it (shown first, with a heart).
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // Per-user optimistic follow state, seeded from what the list came back with.
  const [followState, setFollowState] = useState<Record<string, { isFollowing: boolean; isFollowRequested?: boolean }>>({});
  const [followBusy, setFollowBusy] = useState<string | null>(null);

  const drag = useSheetDrag(onClose);   // drag the grey bar or the title down to close

  useEffect(() => {
    if (!activeSource) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        let res: { users?: User[]; error?: string };
        let liked = new Set<string>();
        if (hasBoth) {
          // Everyone who viewed it, the people who liked it first. If the viewers can't be loaded,
          // the likes are still shown.
          const [likeRes, viewRes] = await Promise.all([likes!.fetchUsers(), views!.fetchUsers().catch(() => ({ users: undefined }))]);
          if (!likeRes.users) res = likeRes;
          else {
            liked = new Set(likeRes.users.map((u) => u.id));
            res = { users: [...likeRes.users, ...(viewRes.users || []).filter((u) => !liked.has(u.id))] };
          }
        } else {
          res = await activeSource.fetchUsers();
          if (activeSource === likes && res.users) liked = new Set(res.users.map((u) => u.id));
        }
        if (cancelled) return;
        if (res.users) {
          setUsers(res.users);
          setLikedIds(liked);
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
    // The button changes at once to what the tap will most likely turn into (a private account: Requested); corrected below from the real result.
    const guess = predictFollowToggle({ isFollowing: !!prev?.isFollowing, isFollowRequested: !!prev?.isFollowRequested }, u);
    setFollowState((s) => ({ ...s, [u.id]: guess }));
    try {
      const res = await onToggleFollowUser(u.id);
      if (res && res.success === false) setFollowState((s) => ({ ...s, [u.id]: prev || { isFollowing: false } }));
      else if (res) setFollowState((s) => ({ ...s, [u.id]: { isFollowing: res.isFollowing, isFollowRequested: res.isFollowRequested } }));
    } catch {
      setFollowState((s) => ({ ...s, [u.id]: prev || { isFollowing: false } }));
    } finally {
      setFollowBusy(null);
    }
  };

  // Portalled straight to document.body: PostCard/ReelsView/StoryViewerModal
  // all render this inside ancestors that use backdrop-blur/filter classes,
  // and per spec a `filter`/`backdrop-filter` on ANY ancestor becomes the
  // containing block for `position: fixed` descendants — without the
  // portal this "fullscreen" sheet gets trapped inside that ancestor's own
  // (much smaller) box instead of covering the viewport.
  return createPortal(
    <div className="lv-layer" role="dialog" aria-modal="true" aria-label={hasBoth ? 'Likes and views' : activeSource?.label}>
      <div ref={drag.backdropRef} className="lv-back" onClick={onClose} aria-hidden="true" />
      <div ref={drag.sheetRef} className="lv-sheet" data-testid="likes-sheet">
        {/* the grey bar and the title (drag down to close) */}
        <SheetGrip drag={drag} alwaysBar barClassName="bg-transparent" className="relative">
          <div className="lv-bar" aria-hidden="true"><span /></div>
          <div className="lv-head">
            <h3>{hasBoth ? 'Likes and views' : activeSource?.label}</h3>
            <button onClick={onClose} aria-label="Close" className={`lv-x ${CLOSE_X_CLASS}`}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </SheetGrip>

        {/* the number of views, and who may see the likes (only when both are shown) */}
        {hasBoth && typeof viewsCount === 'number' && (
          <div className="lv-stat">
            <b><Eye className="w-5 h-5" />{Intl.NumberFormat('en', { notation: 'compact' }).format(viewsCount)}</b>
            <p>
              Only {ownerUsername ? `@${ownerUsername}` : 'the owner'} can see the total number of likes on this{' '}
              {likes?.label?.toLowerCase().includes('reel') ? 'reel' : 'post'}.
            </p>
          </div>
        )}

        {!loading && !error && (
          <div className="lv-search">
            <label>
              <Search />
              <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search" />
            </label>
          </div>
        )}

        <div className="lv-list">
          {loading ? (
            <div className="lv-load"><Loader2 className="w-6 h-6 animate-spin" /><span>Loading...</span></div>
          ) : error ? (
            <div className="lv-empty">{error}</div>
          ) : filteredUsers.length === 0 ? (
            <div className="lv-empty">{query ? 'No matches.' : 'No one yet.'}</div>
          ) : (
            filteredUsers.map((u) => {
              const fs = followState[u.id];
              const isSelf = currentUserId && u.id === currentUserId;
              return (
                <div key={u.id} className="lv-row">
                  <button onClick={() => onNavigateToUser?.(u)} className="lv-who">
                    <span className="lv-ava">
                      <img src={u.avatar || '/noob-logo.svg.jpeg'} alt="" referrerPolicy="no-referrer" />
                      {hasBoth && likedIds.has(u.id) && <span className="lv-heart" aria-label="Liked"><Heart /></span>}
                    </span>
                    <span className="lv-id">
                      <span className="u"><span translate="no">{u.username}</span>{u.isVerified && <VerifiedBadge size="xs" />}</span>
                      {u.displayName && <span className="n">{u.displayName}</span>}
                    </span>
                  </button>
                  {onToggleFollowUser && !isSelf && (
                    <button onClick={() => handleFollowClick(u)} disabled={followBusy === u.id} className={`lv-btn ${fs?.isFollowing || fs?.isFollowRequested ? 'is-on' : ''}`}>
                      {followBusy === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : fs?.isFollowing ? 'Noobed' : fs?.isFollowRequested ? 'Requested' : 'Noob'}
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
