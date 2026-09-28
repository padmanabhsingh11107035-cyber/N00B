import React, { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { fetchCloseFriends, setCloseFriend } from '../../services/api';
import type { CloseFriend } from '../../services/api';
import { VerifiedBadge } from '../Common/VerifiedBadge';

interface CloseFriendsPickerProps {
  onClose: () => void;
}

// Close Friends is drawn only from Friends — people you follow who follow you back — so there is
// nothing to search here, just a plain toggle list.
export const CloseFriendsPicker: React.FC<CloseFriendsPickerProps> = ({ onClose }) => {
  const [friends, setFriends] = useState<CloseFriend[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    fetchCloseFriends().then((res) => {
      if (res.success) setFriends(res.friends);
      setLoading(false);
    });
  }, []);

  const toggle = async (friend: CloseFriend) => {
    setBusyId(friend.id);
    const res = await setCloseFriend(friend.id, !friend.isCloseFriend);
    if (res.success) setFriends((prev) => prev.map((f) => (f.id === friend.id ? { ...f, isCloseFriend: !f.isCloseFriend } : f)));
    setBusyId(null);
  };

  return (
    <div className="fixed inset-0 z-[85] bg-black/90 flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-md bg-zinc-950 border border-emerald-500/30 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
        <header className="p-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-sm font-bold text-white">Close Friends</h3>
            <p className="text-[11px] text-zinc-400">Only these friends see instants you mark Close Friends.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {loading ? (
            <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-400" /></div>
          ) : friends.length === 0 ? (
            <p className="text-center text-xs text-zinc-500 py-10">
              You have no friends yet — a friend is someone you follow who follows you back.
            </p>
          ) : (
            friends.map((f) => (
              <div key={f.id} className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-zinc-900">
                <div className="flex items-center gap-2.5 min-w-0">
                  <img src={f.avatar || '/noob-logo.svg.jpeg'} alt="" className="w-9 h-9 rounded-full object-cover border border-zinc-700 shrink-0" referrerPolicy="no-referrer" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-bold text-white truncate">{f.displayName || f.username}</span>
                      {f.isVerified && <VerifiedBadge size="xs" />}
                    </div>
                    <span className="text-[11px] text-zinc-500">@{f.username}</span>
                  </div>
                </div>
                <button
                  onClick={() => toggle(f)}
                  disabled={busyId === f.id}
                  className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer border transition-all disabled:opacity-50 ${
                    f.isCloseFriend ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                  }`}
                >
                  {f.isCloseFriend ? 'Close Friend' : 'Add'}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
