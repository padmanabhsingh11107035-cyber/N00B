// Mounted once, app-wide (in App.tsx), so the bottom-nav badge stays correct no matter which tab
// is open — ChatView itself only exists while the Chat tab is the active one, so a subscription
// living inside it (as this used to, sort of: the bottom-nav count was never actually wired to real
// data at all, just a piece of state nothing ever incremented) would drop the moment you left chat.
//
// The number shown is the count of CONVERSATIONS with at least one unread message, not the count of
// unread messages — sending someone 2 messages should show 1, two different people messaging should
// show 2, matching ChatView's own "Unread" filter tab, which already counts it exactly this way.
import { useEffect, useRef, useState } from 'react';
import { fetchChats, subscribeToChatChanges } from '../../services/api';
import type { User } from '../../types';

// Same "genuine user chat" filter ChatView's own loadChats applies, so the two never disagree.
function isRealChat(c: any): boolean {
  return !c.isAi && c.id !== 'c_ai_assistant' && !c.participants?.some((p: any) => p.isAi);
}

// onIncoming (optional) is called when the total number of unread messages goes UP after the first load, i.e. a new message arrived.
export function useUnreadChatCount(me: User | null, onIncoming?: () => void): number {
  const [count, setCount] = useState(0);
  const onIncomingRef = useRef(onIncoming);
  onIncomingRef.current = onIncoming;

  useEffect(() => {
    if (!me) {
      setCount(0);
      return;
    }
    let alive = true;
    let lastTotal: number | null = null;

    const refresh = async () => {
      const chats = await fetchChats();
      if (!alive) return;
      const real = chats.filter(isRealChat);
      setCount(real.filter((c) => (c.unreadCount || 0) > 0).length);
      const total = real.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
      if (lastTotal !== null && total > lastTotal) onIncomingRef.current?.();
      lastTotal = total;
    };

    refresh();
    const unsubscribe = subscribeToChatChanges(refresh);
    const interval = setInterval(refresh, 30000);

    return () => {
      alive = false;
      unsubscribe();
      clearInterval(interval);
    };
  }, [me?.id]);

  return count;
}
