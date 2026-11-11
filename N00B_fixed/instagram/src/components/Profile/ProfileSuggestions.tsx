import React, { useEffect, useMemo, useState } from 'react';
import { Check, Clock, UserPlus, X } from 'lucide-react';
import type { User } from '../../types';
import { fetchUsersStrict, peekUsersDirectory } from '../../services/api';
import { realPeople } from '../../utils/peopleList';
import { predictFollowToggle } from '../../utils/followPredict';
import { coverBackground } from './ProfileCover';
import './profileExtras.css';

type FollowResult = { success: boolean; isFollowing: boolean; isFollowRequested?: boolean } | void | undefined;

// Under the Ask card on someone else's profile (like Instagram): ten people you may want to follow, each with their own profile colours.
// Not yourself, not this person, not anyone you already follow or blocked; the most followed first.
export const ProfileSuggestions: React.FC<{
  currentUser: User;
  targetUser: User;
  allUsers: User[];
  onToggleFollowUser?: (userId: string) => void | Promise<FollowResult>;
  onOpenProfile?: (user: User) => void;
}> = ({ currentUser, targetUser, allUsers, onToggleFollowUser, onOpenProfile }) => {
  const [pool, setPool] = useState<User[]>(() => peekUsersDirectory(currentUser.id)?.list || allUsers || []);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [state, setState] = useState<Record<string, 'following' | 'requested'>>({});

  // the people list may not be loaded yet (or only partly): ask for it once
  useEffect(() => {
    let alive = true;
    if (pool.length >= 14) return;
    fetchUsersStrict().then((list) => { if (alive && list?.length) setPool(list); }).catch(() => undefined);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const picks = useMemo(() => {
    const following = new Set(currentUser.followingIds || []);
    const blocked = new Set(currentUser.blockedUserIds || []);
    return realPeople(pool)
      .filter((u) => u.id !== currentUser.id && u.id !== targetUser.id && !following.has(u.id) && !blocked.has(u.id) && !gone.has(u.id))
      .sort((a, b) => (b.followersCount || 0) - (a.followersCount || 0))
      .slice(0, 10);
  }, [pool, currentUser.id, currentUser.followingIds, currentUser.blockedUserIds, targetUser.id, gone]);

  if (!picks.length) return null;

  const follow = async (u: User) => {
    if (!onToggleFollowUser || state[u.id]) return;
    const guess = predictFollowToggle({ isFollowing: false, isFollowRequested: false }, u);
    setState((s) => ({ ...s, [u.id]: guess.isFollowing ? 'following' : 'requested' }));
    const undo = () => setState((s) => { const n = { ...s }; delete n[u.id]; return n; });
    try {
      const res = await onToggleFollowUser(u.id);
      if (res && res.success !== false) {
        if (res.isFollowing) setState((s) => ({ ...s, [u.id]: 'following' }));
        else if (res.isFollowRequested) setState((s) => ({ ...s, [u.id]: 'requested' }));
        else undo();
      } else if (res && res.success === false) undo();
    } catch { undo(); }
  };

  return (
    <section className="ps-wrap mt-4" data-testid="profile-suggestions" aria-label="Suggested for you">
      <div className="ps-head"><h3 className="ps-title">Suggested for you</h3></div>
      <div className="ps-row">
        {picks.map((u) => (
          <div key={u.id} className="ps-card" data-testid="profile-suggestion">
            <button type="button" className="ps-x cursor-pointer" aria-label={`Hide ${u.username}`} onClick={() => setGone((g) => new Set(g).add(u.id))}><X className="w-3.5 h-3.5" /></button>
            <div className="ps-cover" style={coverBackground(u)} onClick={() => onOpenProfile?.(u)} />
            <div className="ps-av" onClick={() => onOpenProfile?.(u)}>
              <img loading="lazy" decoding="async" src={u.avatar || '/noob-logo-circle.png'} alt={u.username} referrerPolicy="no-referrer" />
            </div>
            <div className="ps-name" onClick={() => onOpenProfile?.(u)}>{u.displayName || u.username}</div>
            <div className="ps-handle">@{u.username}</div>
            <div className="ps-count">{Intl.NumberFormat('en', { notation: 'compact' }).format(u.followersCount || 0)} followers</div>
            <button type="button" onClick={() => follow(u)} disabled={!!state[u.id]} className={`ps-btn cursor-pointer ${state[u.id] ? 'ps-quiet' : ''}`}>
              {state[u.id] === 'following' ? <><Check className="w-4 h-4" /> Noobed</> : state[u.id] === 'requested' ? <><Clock className="w-4 h-4" /> Requested</> : <><UserPlus className="w-4 h-4" /> {u.accountType === 'private' ? 'Request' : 'Noob'}</>}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
};
