import React, { useState } from 'react';
import { ArrowLeft, Search, UserPlus, UserCheck } from 'lucide-react';
import { User } from '../../types';
import { VerifiedBadge } from '../Common/VerifiedBadge';

interface FollowListPageProps {
  currentUser: User;
  targetUser: User;
  allUsers: User[];
  initialTab: 'followers' | 'following';
  onClose: () => void;
  onToggleFollowUser?: (userId: string) => void;
  onNavigateToUserProfile?: (user: User) => void;
}

export const FollowListPage: React.FC<FollowListPageProps> = ({
  currentUser,
  targetUser,
  allUsers,
  initialTab,
  onClose,
  onToggleFollowUser,
  onNavigateToUserProfile
}) => {
  const [tab, setTab] = useState<'followers' | 'following'>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);

  const followersList = allUsers.filter(
    (u) => u.id !== targetUser.id && u.followingIds?.includes(targetUser.id)
  );
  const followingList = (targetUser.followingIds || [])
    .map((id) => allUsers.find((u) => u.id === id))
    .filter((u): u is User => !!u);

  const list = tab === 'followers' ? followersList : followingList;
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
                  ? 'text-white border-[#00FF66]'
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
                          : 'bg-[#00FF66] text-black hover:bg-emerald-400'
                      }`}
                    >
                      {isFollowingRow ? <UserCheck className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                      {pendingId === u.id ? '...' : isFollowingRow ? 'Following' : 'Follow'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
