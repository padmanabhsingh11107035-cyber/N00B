import React, { useEffect, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { User } from '../../types';
import { fetchChats, sendMessage } from '../../services/api';
import { AvatarMedia } from '../Common/AvatarMedia';
import { friendsFromChats, topFriends, type Friend } from '../../utils/shareTargets';

// Four faces at the top of the Reels page (the people you talk to most recently, like Instagram's row of friends): a tap sends the reel that is on the screen to that person, in their chat.
// Each face shows a tick once it has been sent, for that reel; on the next reel it is ready again.
export const ReelFriendsStrip: React.FC<{ currentUser: User; reelId: string | null | undefined }> = ({ currentUser, reelId }) => {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [sent, setSent] = useState<Record<string, boolean>>({});   // `${reelId}:${chatId}` -> true
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [said, setSaid] = useState('');
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetchChats().then((chats) => { if (alive) setFriends(topFriends(friendsFromChats(chats, currentUser.id), 4)); }).catch(() => undefined);
    return () => { alive = false; };
  }, [currentUser.id]);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  if (!reelId || friends.length === 0) return null;

  const say = (text: string) => {
    setSaid(text);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSaid(''), 2200);
  };

  const sendTo = async (f: Friend) => {
    const key = `${reelId}:${f.chatId}`;
    if (busy || sent[key]) return;
    setBusy(key);
    setFailed(null);
    try {
      await sendMessage(f.chatId, { sharedPostId: reelId, sharedPostType: 'reel' });
      setSent((s) => ({ ...s, [key]: true }));
      say(`Sent to ${f.user.displayName || f.user.username}`);
    } catch {
      setFailed(key);
      say('Could not send. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex items-center gap-1.5 shrink-0" data-testid="reel-friends">
      {friends.map((f) => {
        const key = `${reelId}:${f.chatId}`;
        const done = !!sent[key];
        const name = f.user.displayName || f.user.username;
        return (
          <button
            key={f.chatId}
            type="button"
            onClick={() => void sendTo(f)}
            disabled={busy !== null && busy !== key}
            className="relative cursor-pointer rounded-full disabled:opacity-60"
            title={done ? `Sent to ${name}` : `Send this reel to ${name}`}
            aria-label={done ? `Sent to ${name}` : `Send this reel to ${name}`}
            data-testid="reel-friend"
            data-sent={done ? 'true' : undefined}
          >
            <AvatarMedia src={f.user.avatar} alt={f.user.username} className={`w-8 h-8 rounded-full object-cover border ${failed === key ? 'border-red-400' : done ? 'border-noob' : 'border-white/30'}`} />
            {(done || busy === key) && (
              <span className="absolute inset-0 rounded-full bg-black/55 flex items-center justify-center text-white">
                {busy === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-4 h-4 text-noob" />}
              </span>
            )}
          </button>
        );
      })}
      <span className="sr-only" role="status" aria-live="polite">{said}</span>
      {said && <span className="absolute right-3 top-full mt-1 z-40 px-2.5 py-1 rounded-full bg-black/80 border border-white/15 text-[11px] font-semibold text-white pointer-events-none" data-testid="reel-friend-note">{said}</span>}
    </div>
  );
};
