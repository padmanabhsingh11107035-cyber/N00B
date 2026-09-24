import React, { useState } from 'react';
import { X, UserPlus, UserCheck } from 'lucide-react';
import { User } from '../../types';
import { VerifiedBadge } from '../Common/VerifiedBadge';
import { type MutualFollower } from '../../services/api';

interface MutualFollowersSheetProps {
  currentUser: User;
  mutuals: MutualFollower[];
  allUsers: User[];
  onClose: () => void;
  onToggleFollowUser?: (userId: string) => void | Promise<any>;
  onNavigateToUserProfile?: (user: User) => void;
}

// Every entry here is, by definition, someone the signed-in account already follows (that's
// how "Followed by ..." mutuals are computed — see fetchMutualFollowers in supabaseApi.ts) —
// so every row starts as "Following" and the button is really just a quick unfollow/refollow.
export const MutualFollowersSheet: React.FC<MutualFollowersSheetProps> = ({
  currentUser,
  mutuals,
  allUsers,
  onClose,
  onToggleFollowUser,
  onNavigateToUserProfile
}) => {
  const [unfollowedIds, setUnfollowedIds] = useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);

  const handleToggle = async (id: string) => {
    if (!onToggleFollowUser || pendingId) return;
    setPendingId(id);
    try {
      await onToggleFollowUser(id);
      setUnfollowedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    } finally {
      setPendingId(null);
    }
  };

  const handleRowClick = (m: MutualFollower) => {
    const full = allUsers.find((u) => u.id === m.id);
    if (full) {
      onClose();
      onNavigateToUserProfile?.(full);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-end justify-center animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-zinc-950 border-t border-zinc-800 rounded-t-3xl h-[70vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-200">
        <div className="shrink-0 flex flex-col items-center pt-2.5 pb-1">
          <div className="w-10 h-1 rounded-full bg-zinc-700" />
        </div>

        <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-zinc-900">
          <h2 className="text-sm font-bold text-white">Followers you know</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 -mr-1.5 rounded-full hover:bg-zinc-900 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {mutuals.length === 0 ? (
            <div className="py-16 text-center text-zinc-500 text-xs px-6">No mutual followers to show.</div>
          ) : (
            <div className="divide-y divide-zinc-900">
              {mutuals.map((m) => {
                const isFollowing = !unfollowedIds.has(m.id);
                const isSelf = m.id === currentUser.id;
                const full = allUsers.find((u) => u.id === m.id);
                return (
                  <div key={m.id} className="flex items-center gap-3 px-5 py-3">
                    <button
                      onClick={() => handleRowClick(m)}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <img
                        src={full?.avatar || m.avatar || '/noob-logo.svg.jpeg'}
                        alt={m.username}
                        referrerPolicy="no-referrer"
                        className="w-11 h-11 rounded-full object-cover border border-zinc-800 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-bold text-white truncate" translate="no">
                            {m.displayName || m.username}
                          </span>
                          {full?.isVerified && <VerifiedBadge size="xs" />}
                        </div>
                        <span className="text-[11px] text-zinc-500 truncate block" translate="no">
                          @{m.username}
                        </span>
                      </div>
                    </button>

                    {!isSelf && (
                      <button
                        onClick={() => handleToggle(m.id)}
                        disabled={pendingId === m.id}
                        className={`shrink-0 px-3.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 ${
                          isFollowing
                            ? 'bg-zinc-800 text-zinc-200 border border-zinc-700 hover:bg-zinc-700'
                            : 'bg-[#00FF66] text-black hover:bg-emerald-400'
                        }`}
                      >
                        {isFollowing ? <UserCheck className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                        {pendingId === m.id ? '...' : isFollowing ? 'Following' : 'Follow'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
