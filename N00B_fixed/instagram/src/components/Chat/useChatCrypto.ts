import { useEffect, useState } from 'react';
import { e2ee } from '../../services/api';
import type { ChatCrypto } from '../../e2ee/service.ts';

// Whether the open chat is end-to-end encrypted (and its security code), kept fresh while the chat is open.
// `tick` lets the caller ask for a fresh look (for example after restoring a key backup).
export function useChatCrypto(chatId: string | undefined, tick = 0): ChatCrypto | null {
  const [info, setInfo] = useState<ChatCrypto | null>(null);
  useEffect(() => {
    setInfo(null);
    if (!chatId) return;
    let alive = true;
    const look = (force: boolean) => {
      e2ee.chatCrypto(chatId, force).then((i) => { if (alive) setInfo(i); }).catch(() => { /* keeps what it last knew */ });
    };
    look(true);
    const timer = setInterval(() => look(true), 45000);
    return () => { alive = false; clearInterval(timer); };
  }, [chatId, tick]);
  return info;
}
