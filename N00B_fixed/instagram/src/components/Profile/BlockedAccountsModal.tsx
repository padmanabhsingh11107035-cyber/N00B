import React, { useState } from 'react';
import { X, ShieldAlert, UserX, Check, Search, AlertTriangle, UserCheck } from 'lucide-react';
import { User } from '../../types';
import { blockUser, unblockUser } from '../../services/api';

interface BlockedAccountsModalProps {
  currentUser: User;
  allUsers?: User[];
  onClose: () => void;
  onUserUpdated?: (user: User) => void;
}

export const BlockedAccountsModal: React.FC<BlockedAccountsModalProps> = ({
  currentUser,
  allUsers = [],
  onClose,
  onUserUpdated
}) => {
  const [blockedIds, setBlockedIds] = useState<string[]>(currentUser.blockedUserIds || []);
  const [searchQuery, setSearchQuery] = useState('');
  const [manualUsername, setManualUsername] = useState('');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const blockedUsersList = allUsers.filter((u) => blockedIds.includes(u.id));

  const handleUnblock = async (userId: string) => {
    setLoadingId(userId);
    try {
      const res = await unblockUser(userId);
      const newBlocked = res.blockedUserIds || blockedIds.filter((id) => id !== userId);
      setBlockedIds(newBlocked);
      if (onUserUpdated) {
        onUserUpdated({ ...currentUser, blockedUserIds: newBlocked });
      }
      setStatusMessage('User unblocked successfully.');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error(err);
      setStatusMessage('Failed to unblock user.');
    } finally {
      setLoadingId(null);
    }
  };

  const handleBlockManual = async () => {
    if (!manualUsername.trim()) return;
    const clean = manualUsername.trim().replace(/^@/, '').toLowerCase();
    const target = allUsers.find((u) => u.username.toLowerCase() === clean);
    const targetId = target ? target.id : `u_${clean}`;

    setLoadingId(targetId);
    try {
      const res = await blockUser(targetId);
      const newBlocked = res.blockedUserIds || [...blockedIds, targetId];
      setBlockedIds(newBlocked);
      setManualUsername('');
      if (onUserUpdated) {
        onUserUpdated({ ...currentUser, blockedUserIds: newBlocked });
      }
      setStatusMessage(`@${clean} has been blocked.`);
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error(err);
      setStatusMessage('Failed to block user.');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div
      id="blocked-accounts-modal"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
    >
      <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-5 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400">
              <UserX className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Blocked Accounts
              </h2>
              <p className="text-[11px] text-zinc-400">
                Manage accounts you have restricted or blocked
              </p>
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

        {/* Status toast message */}
        {statusMessage && (
          <div className="p-2.5 rounded-xl bg-zinc-900 border border-[#00FF66]/40 text-[#00FF66] text-xs font-semibold flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Block someone new input */}
        <div className="space-y-1.5">
          <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
            Block a user by @username
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="e.g. toxic_spammer"
              value={manualUsername}
              onChange={(e) => setManualUsername(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleBlockManual();
              }}
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
            />
            <button
              onClick={handleBlockManual}
              disabled={!manualUsername.trim() || !!loadingId}
              className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold transition-all cursor-pointer"
            >
              Block
            </button>
          </div>
        </div>

        {/* Blocked Accounts List */}
        <div className="flex-1 overflow-y-auto space-y-2 min-h-[150px] pr-1">
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-2">
            Currently Blocked ({blockedIds.length})
          </span>

          {blockedIds.length === 0 ? (
            <div className="py-8 text-center text-zinc-500 text-xs flex flex-col items-center justify-center space-y-2">
              <UserCheck className="w-8 h-8 text-zinc-600" />
              <p>You have not blocked any users yet.</p>
            </div>
          ) : (
            blockedIds.map((userId) => {
              const matchedUser = allUsers.find((u) => u.id === userId);
              const username = matchedUser ? matchedUser.username : userId.replace(/^u_/, '');
              const displayName = matchedUser ? matchedUser.displayName : username;
              const avatar = matchedUser?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80';

              return (
                <div
                  key={userId}
                  className="flex items-center justify-between p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800/80"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={avatar}
                      alt={username}
                      className="w-9 h-9 rounded-full object-cover border border-zinc-700"
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-white block truncate">
                        {displayName}
                      </span>
                      <span className="text-[10px] text-zinc-400 block truncate">
                        @{username}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleUnblock(userId)}
                    disabled={loadingId === userId}
                    className="px-3 py-1.5 rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-zinc-200 transition-colors cursor-pointer shrink-0"
                  >
                    {loadingId === userId ? 'Unblocking...' : 'Unblock'}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Safety Note */}
        <div className="p-3 bg-red-950/20 border border-red-900/40 rounded-2xl flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-zinc-400 leading-snug">
            Blocked accounts cannot view your profile, posts, or message you. Their comments and mentions are automatically hidden.
          </p>
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-zinc-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-white text-black font-bold text-xs hover:bg-zinc-200 transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
