// Mounted once, app-wide (in App.tsx), so the bottom-nav badge stays correct no matter which tab
// is open — ChatView itself only exists while the Chat tab is the active one, so a subscription
// living inside it (as this used to, sort of: the bottom-nav count was never actually wired to real
// data at all, just a piece of state nothing ever incremented) would drop the moment you left chat.
//
// The number shown is the count of CONVERSATIONS with at least one unread message, not the count of
// unread messages — sending someone 2 messages should show 1, two different people messaging should
// show 2, matching ChatView's own "Unread" filter tab, which already counts it exactly this way.
import { useEffect, useState } from 'react';
import { fetchChats, subscribeToChatChanges } from '../../services/api';
import type { User } from '../../types';

// Same "genuine user chat" filter ChatView's own loadChats applies, so the two never disagree.
function isRealChat(c: any): boolean {
  return !c.isAi && c.id !== 'c_ai_assistant' && !c.participants?.some((p: any) => p.isAi);
}

export function useUnreadChatCount(me: User | null): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!me) {
      setCount(0);
      return;
    }
    let alive = true;

    const refresh = async () => {
      const chats = await fetchChats();
      if (!alive) return;
      setCount(chats.filter(isRealChat).filter((c) => (c.unreadCount || 0) > 0).length);
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
