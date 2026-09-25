import React, { useEffect, useState } from 'react';
import { X, Send, Loader2, CheckCircle2, Check } from 'lucide-react';
import { User } from '../../types';
import { fetchChats, sendMessage } from '../../services/api';

interface ShareToChatModalProps {
  currentUser: User;
  targetUser: User;
  onClose: () => void;
}

const MAX_RECIPIENTS = 5;

// "Friends" here means people there's already a direct chat with — the app has no separate friends
// graph, and this is the same list the Chat tab itself shows, so nothing new to explain.
export const ShareToChatModal: React.FC<ShareToChatModalProps> = ({ currentUser, targetUser, onClose }) => {
  const [friends, setFriends] = useState<{ chatId: string; user: User }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchChats().then((chats) => {
      if (!alive) return;
      const dms = chats
        .filter((c) => !c.isGroup && !c.isAi && !c.isGlobalDefault)
        .map((c) => ({ chatId: c.id, user: c.participants.find((p) => p.id !== currentUser.id) }))
        .filter((x): x is { chatId: string; user: User } => !!x.user && x.user.id !== targetUser.id);
      setFriends(dms);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [currentUser.id, targetUser.id]);

  const toggle = (chatId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(chatId)) next.delete(chatId);
      else if (next.size < MAX_RECIPIENTS) next.add(chatId);
      return next;
    });
  };

  const handleSend = async () => {
    if (selected.size === 0) return;
    setSending(true);
    await Promise.all(
      Array.from(selected).map((chatId: string) => sendMessage(chatId, { sharedProfileUserId: targetUser.id }).catch(() => undefined))
    );
    setSending(false);
    setDone(true);
  };

  return (
    <div className="fixed inset-0 z-[95] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-sm bg-zinc-950 border border-cyan-500/30 rounded-3xl shadow-2xl max-h-[80vh] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-sm font-bold text-white">Send Profile</h2>
            <p className="text-[11px] text-zinc-400">
              @{targetUser.username} · pick up to {MAX_RECIPIENTS}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-zinc-900 text-zinc-400 hover:text-white cursor-pointer">
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {done ? (
          <div className="p-8 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-[#00FF66] mx-auto" />
            <h3 className="text-sm font-bold text-white">Sent!</h3>
            <p className="text-xs text-zinc-400">@{targetUser.username}'s profile is in their chat now.</p>
            <button onClick={onClose} className="mt-2 px-5 py-2.5 bg-[#00FF66] text-black text-xs font-bold rounded-xl cursor-pointer hover:opacity-90">
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="py-12 text-center">
                  <Loader2 className="w-6 h-6 animate-spin text-cyan-400 mx-auto mb-2" />
                  <p className="text-xs text-zinc-400">Loading your chats...</p>
                </div>
              ) : friends.length === 0 ? (
                <div className="py-12 text-center text-zinc-500 text-xs px-6">
                  No direct chats yet — start a conversation with someone first.
                </div>
              ) : (
                <div className="divide-y divide-zinc-900">
                  {friends.map(({ chatId, user }) => {
                    const isSelected = selected.has(chatId);
                    const disabled = !isSelected && selected.size >= MAX_RECIPIENTS;
                    return (
                      <button
                        key={chatId}
                        onClick={() => toggle(chatId)}
                        disabled={disabled}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-900/60 transition-colors"
                      >
                        <img
                          src={user.avatar || '/noob-logo.svg.jpeg'}
                          alt={user.username}
                          className="w-10 h-10 rounded-full object-cover border border-zinc-800 shrink-0"
                          referrerPolicy="no-referrer"
                        />
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-bold text-white block truncate" translate="no">
                            {user.displayName || user.username}
                          </span>
                          <span className="text-[11px] text-zinc-500 truncate block" translate="no">@{user.username}</span>
                        </div>
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            isSelected ? 'bg-[#00FF66] border-[#00FF66]' : 'border-zinc-700'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 text-black" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {friends.length > 0 && (
              <div className="p-3 border-t border-zinc-800 shrink-0">
                <button
                  onClick={handleSend}
                  disabled={selected.size === 0 || sending}
                  className="w-full py-3 bg-[#00FF66] hover:opacity-90 disabled:opacity-40 text-black text-xs font-bold rounded-2xl cursor-pointer transition-opacity flex items-center justify-center gap-2"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {sending ? 'Sending…' : `Send${selected.size > 0 ? ` (${selected.size})` : ''}`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
