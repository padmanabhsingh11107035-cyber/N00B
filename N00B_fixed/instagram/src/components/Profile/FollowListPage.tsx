import React, { useState } from 'react';
import { ArrowLeft, Search, UserPlus, UserCheck, UserMinus, MoreVertical, Ban, Flag, EyeOff, User as UserIcon, X } from 'lucide-react';
import { User } from '../../types';
import { VerifiedBadge } from '../Common/VerifiedBadge';
import { blockUser, unblockUser, hideProfileFrom, unhideProfileFrom, submitSafetyReport } from '../../services/api';

interface FollowListPageProps {
  currentUser: User;
  targetUser: User;
  allUsers: User[];
  initialTab: 'followers' | 'following';
  onClose: () => void;
  onToggleFollowUser?: (userId: string) => void;
  onRemoveFollower?: (followerId: string) => void | Promise<{ success: boolean; followersCount?: number; error?: string } | undefined>;
  onNavigateToUserProfile?: (user: User) => void;
}

export const FollowListPage: React.FC<FollowListPageProps> = ({
  currentUser,
  targetUser,
  allUsers,
  initialTab,
  onClose,
  onToggleFollowUser,
  onRemoveFollower,
  onNavigateToUserProfile
}) => {
  const [tab, setTab] = useState<'followers' | 'following'>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  // the three-dots menu of one row (block, remove, hide my profile, report...)
  const [menuUser, setMenuUser] = useState<User | null>(null);
  const [menuBusy, setMenuBusy] = useState(false);
  const [menuNote, setMenuNote] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(() => new Set(currentUser.blockedUserIds || []));
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set(currentUser.hiddenFromIds || []));
  const closeMenu = () => { setMenuUser(null); setMenuNote(null); setReporting(false); setMenuBusy(false); };
  const REPORT_REASONS = ['Cyber Bullying & Harassment', 'Spam or fake account', 'Pretending to be someone else', 'Inappropriate content', 'Something else'];
  const doBlock = async (u: User) => {
    setMenuBusy(true);
    try {
      if (blockedIds.has(u.id)) { await unblockUser(u.id); setBlockedIds((p) => { const n = new Set(p); n.delete(u.id); return n; }); setMenuNote('Unblocked.'); }
      else { await blockUser(u.id); setBlockedIds((p) => new Set(p).add(u.id)); setRemovedIds((p) => new Set(p).add(u.id)); closeMenu(); return; }
    } catch { setMenuNote('Could not do that. Please try again.'); }
    setMenuBusy(false);
  };
  const doHide = async (u: User) => {
    setMenuBusy(true);
    try {
      const was = hiddenIds.has(u.id);
      const res = was ? await unhideProfileFrom(u.id) : await hideProfileFrom(u.id);
      if (res.success) { setHiddenIds((p) => { const n = new Set(p); if (was) n.delete(u.id); else n.add(u.id); return n; }); setMenuNote(was ? 'Your profile is visible to them again.' : 'Your profile is now hidden from them.'); }
      else setMenuNote(res.error || 'Could not do that. Please try again.');
    } catch { setMenuNote('Could not do that. Please try again.'); }
    setMenuBusy(false);
  };
  const doReport = async (u: User, reason: string) => {
    setMenuBusy(true);
    try {
      const res = await submitSafetyReport(u.id, reason, '');
      setReporting(false);
      setMenuNote(res && res.success === false ? (res.error || 'Could not send the report.') : 'Thank you. Your report was sent.');
    } catch { setMenuNote('Could not send the report.'); }
    setMenuBusy(false);
  };
  // The NOOB admin's "followers" list is a synthetic everyone-follows-them list, not real rows in
  // `follows` (see the comment below) — there's nothing real to remove, so no Remove button there.
  const isOwnFollowersTab = tab === 'followers' && targetUser.id === currentUser.id && targetUser.id !== 'u_noob_admin';

  // Every registered account auto-follows the NOOB admin account at signup,
  // so its "followers" are, by definition, every other registered user —
  // mirrors the server's getDisplayFollowersCount rather than trusting a
  // followingIds reverse-lookup that's exactly what drifted out of sync in
  // the first place (old test-account deletions inflating the stored
  // count). Every other account's followers list stays the genuine,
  // individually-tracked relationship.
  const followersList =
    targetUser.id === 'u_noob_admin'
      ? allUsers.filter((u) => u.id !== targetUser.id)
      : allUsers.filter((u) => u.id !== targetUser.id && u.followingIds?.includes(targetUser.id));
  const followingList = (targetUser.followingIds || [])
    .map((id) => allUsers.find((u) => u.id === id))
    .filter((u): u is User => !!u);

  const list = (tab === 'followers' ? followersList : followingList).filter((u) => !removedIds.has(u.id));
  const query = searchQuery.trim().toLowerCase();
  const filteredList = query
    ? list.filter(
        (u) =>
          u.username.toLowerCase().includes(query) ||
          u.displayName?.toLowerCase().includes(query)
      )
    : list;

  const handleToggle = async (userId: string) => {
    if (!onToggleFollowUser) return;
    setPendingId(userId);
    try {
      await onToggleFollowUser(userId);
    } finally {
      setPendingId(null);
    }
  };

  const handleRemove = async (followerId: string) => {
    if (!onRemoveFollower || !confirm('Remove this follower?')) return;
    setPendingId(followerId);
    try {
      const res = await onRemoveFollower(followerId);
      if (!res || res.success) setRemovedIds((prev) => new Set(prev).add(followerId));
      else alert(res.error || 'Could not remove this follower.');
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col animate-in fade-in duration-150">
      {/* Header */}
      <div className="shrink-0 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={onClose}
            aria-label="Go back"
            className="p-2 -ml-2 rounded-full hover:bg-zinc-900 text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-white truncate">@{targetUser.username}</h2>
            <p className="text-[10px] text-zinc-500 truncate">
              {(targetUser.followersCount || 0).toLocaleString()} followers · {(targetUser.followingCount || 0).toLocaleString()} following
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center px-2">
          {(['followers', 'following'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide border-b-2 transition-colors cursor-pointer ${
                tab === t
                  ? 'text-white border-noob'
                  : 'text-zinc-500 border-transparent hover:text-zinc-300'
              }`}
            >
              {t === 'followers' ? 'Followers' : 'Following'}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2">
            <Search className="w-4 h-4 text-zinc-500 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${tab}`}
              className="flex-1 bg-transparent text-xs text-white placeholder:text-zinc-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filteredList.length === 0 ? (
          <div className="py-16 text-center text-zinc-500 text-xs px-6">
            {query
              ? 'No one matches your search.'
              : tab === 'followers'
              ? 'No followers yet.'
              : 'Not following anyone yet.'}
          </div>
        ) : (
          <div className="divide-y divide-zinc-900">
            {filteredList.map((u) => {
              const isSelf = u.id === currentUser.id;
              const isFollowingRow = isSelf
                ? false
                : u.isFollowing ?? currentUser.followingIds?.includes(u.id) ?? false;

              return (
                <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                  <button
                    onClick={() => onNavigateToUserProfile?.(u)}
                    className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                  >
                    <img
                      src={u.avatar || '/noob-logo.svg.jpeg'}
                      alt={u.username}
                      className="w-11 h-11 rounded-full object-cover border border-zinc-800 shrink-0"
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-bold text-white truncate">{u.displayName}</span>
                        {u.isVerified && <VerifiedBadge size="xs" />}
                      </div>
                      <span className="text-[11px] text-zinc-500 truncate block">@{u.username}</span>
                    </div>
                  </button>

                  {!isSelf && (
                    <button
                      onClick={() => handleToggle(u.id)}
                      disabled={pendingId === u.id}
                      className={`shrink-0 px-3.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 ${
                        isFollowingRow
                          ? 'bg-zinc-800 text-zinc-200 border border-zinc-700 hover:bg-zinc-700'
                          : 'bg-noob text-black hover:bg-emerald-400'
                      }`}
                    >
                      {isFollowingRow ? <UserCheck className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                      {pendingId === u.id ? '...' : isFollowingRow ? 'Noobed' : 'Noob'}
                    </button>
                  )}

                  {!isSelf && (
                    <button
                      onClick={() => setMenuUser(u)}
                      aria-label={`More options for @${u.username}`}
                      data-testid="follow-row-menu"
                      className="shrink-0 w-9 h-9 -mr-1.5 rounded-full flex items-center justify-center text-zinc-300 hover:bg-zinc-900 active:bg-zinc-800 cursor-pointer transition-colors"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {menuUser && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 animate-in fade-in duration-150" onClick={closeMenu} data-testid="follow-menu">
          <div className="w-full max-w-lg rounded-t-3xl bg-zinc-900 border-t border-zinc-800 pb-[max(1rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-zinc-700" />
            <div className="flex items-center gap-3 px-5 pt-4 pb-3">
              <img src={menuUser.avatar || '/noob-logo.svg.jpeg'} alt="" className="w-11 h-11 rounded-full object-cover border border-zinc-800" referrerPolicy="no-referrer" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white truncate">{menuUser.displayName}</p>
                <p className="text-xs text-zinc-500 truncate">@{menuUser.username}</p>
              </div>
              <button onClick={closeMenu} aria-label="Close" className="w-8 h-8 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            {menuNote && <p className="mx-5 mb-2 rounded-xl bg-zinc-800 px-3 py-2 text-xs text-zinc-200" role="status">{menuNote}</p>}
            {reporting ? (
              <div className="px-2 pb-2">
                <p className="px-3 pb-1 text-xs font-bold text-zinc-400">Why are you reporting @{menuUser.username}?</p>
                {REPORT_REASONS.map((r) => (
                  <button key={r} disabled={menuBusy} onClick={() => void doReport(menuUser, r)} className="w-full text-left px-3 py-3 rounded-xl text-sm text-white hover:bg-zinc-800 disabled:opacity-50 cursor-pointer">{r}</button>
                ))}
                <button onClick={() => setReporting(false)} className="w-full text-left px-3 py-3 rounded-xl text-sm text-zinc-400 cursor-pointer">Back</button>
              </div>
            ) : (
              <div className="px-2 pb-2">
                {[
                  { k: 'view', icon: <UserIcon className="w-5 h-5" />, label: 'View profile', run: () => { const u = menuUser; closeMenu(); onNavigateToUserProfile?.(u); }, show: true, red: false },
                  { k: 'remove', icon: <UserMinus className="w-5 h-5" />, label: 'Remove follower', run: () => { const u = menuUser; closeMenu(); void handleRemove(u.id); }, show: isOwnFollowersTab, red: true },
                  { k: 'hide', icon: <EyeOff className="w-5 h-5" />, label: hiddenIds.has(menuUser.id) ? 'Show my profile to them again' : 'Hide my profile from them', run: () => void doHide(menuUser), show: true, red: false },
                  { k: 'block', icon: <Ban className="w-5 h-5" />, label: blockedIds.has(menuUser.id) ? 'Unblock' : 'Block', run: () => void doBlock(menuUser), show: true, red: true },
                  { k: 'report', icon: <Flag className="w-5 h-5" />, label: 'Report', run: () => setReporting(true), show: true, red: true },
                ].filter((o) => o.show).map((o) => (
                  <button key={o.k} disabled={menuBusy} onClick={o.run} data-testid={`follow-menu-${o.k}`} className={`w-full flex items-center gap-3.5 px-3 py-3.5 rounded-xl text-sm font-semibold hover:bg-zinc-800 active:bg-zinc-800 disabled:opacity-50 cursor-pointer ${o.red ? 'text-red-400' : 'text-white'}`}>
                    {o.icon}<span>{o.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
