// Mounted once, app-wide (in App.tsx) so an incoming call reaches someone no matter which tab or
// screen they're currently on — the actual call itself (audio/video, mic/camera) only starts once
// they accept, at which point they join the same call:<chatId> mesh the caller is already in.
import { useCallback, useEffect, useRef, useState } from 'react';
import { listenForRings, sendRing, type RingEvent } from '../../services/ringSignaling';
import type { User } from '../../types';

export function useIncomingCalls(me: User | null) {
  const [incoming, setIncoming] = useState<RingEvent | null>(null);
  const incomingRef = useRef<RingEvent | null>(null);
  incomingRef.current = incoming;

  useEffect(() => {
    if (!me) return;
    const stop = listenForRings(me.id, (e) => {
      if (e.type === 'incoming') {
        setIncoming(e);
      } else if (e.type === 'cancelled') {
        // The caller hung up before this ring was answered — only clear it if it's still the same one.
        const cur = incomingRef.current;
        if (cur && cur.chatId === e.chatId && cur.from.id === e.from.id) setIncoming(null);
      }
    });
    return stop;
  }, [me?.id]);

  const decline = useCallback(() => {
    const cur = incomingRef.current;
    if (!cur || !me) return;
    setIncoming(null);
    void sendRing(cur.from.id, {
      type: 'declined',
      chatId: cur.chatId,
      chatName: cur.chatName,
      isGroup: cur.isGroup,
      from: { id: me.id, username: me.username, displayName: me.displayName, avatar: me.avatar }
    }).catch(() => undefined);
  }, [me]);

  // Called once the accept flow has handed the chat off to the real call screen — separate from
  // decline so accepting never also fires a "declined" ring back at the caller.
  const clearAfterAccept = useCallback(() => setIncoming(null), []);

  return { incoming, decline, clearAfterAccept };
}
