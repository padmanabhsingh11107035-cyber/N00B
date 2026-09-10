import React, { useEffect, useState } from 'react';
import { X, Contact, Users, UserPlus, UserCheck, Loader2, Sparkles } from 'lucide-react';
import { User } from '../../types';
import { findFriendsFromContacts } from '../../services/contactSync';
import { VerifiedBadge } from '../Common/VerifiedBadge';

interface FindFriendsModalProps {
  currentUser: User;
  registeredUsers: User[];
  onClose: () => void;
  onToggleFollowUser: (userId: string) => void;
}

export const FindFriendsModal: React.FC<FindFriendsModalProps> = ({
  currentUser,
  registeredUsers,
  onClose,
  onToggleFollowUser
}) => {
  const [loading, setLoading] = useState(true);
  const [matchedFromContacts, setMatchedFromContacts] = useState(false);
  const [suggestions, setSuggestions] = useState<User[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const matches = await findFriendsFromContacts();
      if (cancelled) return;

      if (matches.length > 0) {
        setMatchedFromContacts(true);
        setSuggestions(matches);
      } else {
        // Fall back to a normal shuffled sample of registered accounts
        const pool = registeredUsers.filter((u) => u.id !== currentUser.id && !u.isFollowing);
        setMatchedFromContacts(false);
        setSuggestions([...pool].sort(() => Math.random() - 0.5).slice(0, 5));
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFollow = (user: User) => {
    // Optimistic local flip for instant feedback — the parent's handler
    // (shared with ExploreView/ProfileView) owns the actual API call and
    // syncs the app-wide user/follower state.
    setSuggestions((prev) =>
      prev.map((u) =>
        u.id === user.id
          ? { ...u, isFollowing: !u.isFollowing, followersCount: (u.followersCount || 0) + (u.isFollowing ? -1 : 1) }
          : u
      )
    );
    onToggleFollowUser(user.id);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#00FF66]/15 border border-[#00FF66]/30 flex items-center justify-center">
              <Contact className="w-4.5 h-4.5 text-[#00FF66]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Find Friends</h2>
              <p className="text-[11px] text-zinc-400">People you might know on NOOB</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1.5 rounded-full hover:bg-zinc-900 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 min-h-0">
          {loading ? (
            <div className="py-12 text-center flex flex-col items-center gap-3">
              <Loader2 className="w-7 h-7 text-[#00FF66] animate-spin" />
              <p className="text-xs text-zinc-400">Looking for friends from your contacts...</p>
            </div>
          ) : (
            <>
              {matchedFromContacts ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#00FF66]/10 border border-[#00FF66]/30 text-[11px] font-semibold text-[#00FF66]">
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span>We found {suggestions.length} friend{suggestions.length === 1 ? '' : 's'} from your contacts!</span>
                </div>
              ) : suggestions.length > 0 ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-[11px] font-semibold text-zinc-400">
                  <Users className="w-3.5 h-3.5 shrink-0" />
                  <span>No contact matches yet — here are some people you might like.</span>
                </div>
              ) : null}

              {suggestions.length === 0 ? (
                <div className="py-10 text-center">
                  <Users className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                  <p className="text-xs text-zinc-500">No suggestions right now — check back later.</p>
                </div>
              ) : (
                suggestions.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center gap-3 p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800/80"
                  >
                    <img
                      src={user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80'}
                      alt={user.username}
                      className="w-11 h-11 rounded-2xl object-cover border border-white/10 shrink-0"
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-xs font-bold text-white truncate">
                          {user.displayName || user.username}
                        </span>
                        {user.isVerified && <VerifiedBadge size="sm" />}
                      </div>
                      <span className="text-[11px] text-zinc-500 truncate block">@{user.username}</span>
                    </div>
                    <button
                      onClick={() => handleFollow(user)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0 transition-all ${
                        user.isFollowing
                          ? 'bg-zinc-800 text-zinc-300 border border-white/10'
                          : 'bg-[#00FF66] text-black shadow-[0_0_12px_rgba(0,255,102,0.25)]'
                      }`}
                    >
                      {user.isFollowing ? (
                        <>
                          <UserCheck className="w-3.5 h-3.5" /> Following
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-3.5 h-3.5" /> Follow
                        </>
                      )}
                    </button>
                  </div>
                ))
              )}
            </>
          )}
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-zinc-300 cursor-pointer shrink-0"
        >
          Done
        </button>
      </div>
    </div>
  );
};
