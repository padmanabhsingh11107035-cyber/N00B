// The chat list / message list copy kept in localStorage so a chat opens instantly (the fresh copy from the server replaces it a moment later).
//
// PRIVACY RULE: a message that was locked end-to-end (encrypted: true) is NEVER saved readable. Its words, picture link, quoted text, shared
// post/track and above all the attachment's file key (`sealed`) stay in memory only. What is saved is a bare placeholder (id, sender, time, status) that the
// screen draws as a locked bubble until the real, opened message arrives from the server a moment later. Plain messages (Lounge, AI, support) are saved as before.
// Everything saved here is also wiped when the person logs out (wipeChatCaches).

const KEEP = ['id', 'chatId', 'senderId', 'senderUsername', 'senderDisplayName', 'createdAt', 'status', 'scheduledAt', 'isPinned', 'isEdited'] as const;

export function cacheSafeMessage<T extends Record<string, any>>(m: T): T {
  if (!m || typeof m !== 'object' || !m.encrypted) return m;
  const out: Record<string, any> = {};
  for (const k of KEEP) if (m[k] !== undefined) out[k] = m[k];
  out.text = '';
  out.encrypted = true;
  out.locked = 'no-key';
  return out as T;
}

export function cacheSafeMessages<T extends Record<string, any>>(list: T[]): T[] {
  return Array.isArray(list) ? list.map(cacheSafeMessage) : list;
}

export function cacheSafeChats<T extends Record<string, any>>(chats: T[]): T[] {
  if (!Array.isArray(chats)) return chats;
  return chats.map((c) => (c && c.lastMessage ? { ...c, lastMessage: cacheSafeMessage(c.lastMessage) } : c));
}

export const CHAT_CACHE_PREFIXES = ['noob_msgs_cache_', 'noob_chats_cache_'] as const;

/** Removes every saved chat list / message list (all accounts on this browser). Never throws. Does not touch the chat key ring. */
export function wipeChatCaches(storage: Pick<Storage, 'length' | 'key' | 'removeItem'> | undefined = typeof localStorage !== 'undefined' ? localStorage : undefined): number {
  if (!storage) return 0;
  let removed = 0;
  try {
    const names: string[] = [];
    for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k && CHAT_CACHE_PREFIXES.some((p) => k.startsWith(p))) names.push(k); }
    for (const k of names) { try { storage.removeItem(k); removed++; } catch { /* ignore */ } }
  } catch { /* storage unavailable */ }
  return removed;
}
