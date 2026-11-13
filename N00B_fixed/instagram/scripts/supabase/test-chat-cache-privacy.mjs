// Locked chat messages must never be saved readable in localStorage, and the saved chat lists are wiped at logout.
// Usage: node --liftoff-only scripts/supabase/test-chat-cache-privacy.mjs
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const C = await import(pathToFileURL(path.resolve('src/utils/chatCache.ts')).href);

const secret = { k: 'FILEKEYSECRET', iv: 'x' };
const locked = { id: 'm1', chatId: 'c1', senderId: 'u1', senderUsername: 'ann', createdAt: '2026-11-13T10:00:00Z', status: 'sent', encrypted: true, text: 'MY SECRET WORDS', mediaUrl: 'chat/a.sealed', mediaType: 'image', sealed: { key: 'chat/a.sealed', desc: secret }, replyTo: { messageId: 'm0', textPreview: 'QUOTED SECRET' }, sharedTrack: { title: 'T' } };
const plain = { id: 'm2', chatId: 'lounge', senderId: 'u2', createdAt: '2026-11-13T10:01:00Z', text: 'hello lounge' };

console.log('\n1. Locked messages are not saved readable');
const saved = JSON.stringify(C.cacheSafeMessages([locked, plain]));
check(!/SECRET|FILEKEYSECRET|a\.sealed|QUOTED/.test(saved), 'no text, quote, file name or file key of a locked message is in the saved copy');
const back = JSON.parse(saved);
check(back[0].id === 'm1' && back[0].senderId === 'u1' && back[0].locked === 'no-key' && back[0].encrypted === true && back[0].text === '', 'a locked message stays as a placeholder (id, sender, time) so the list still draws');
check(back[1].text === 'hello lounge', 'a plain (unlocked-chat) message is saved as before');
check(locked.text === 'MY SECRET WORDS' && locked.sealed.desc === secret, 'the in-memory message is not changed');

console.log('\n2. Chat list');
const chats = JSON.stringify(C.cacheSafeChats([{ id: 'c1', lastMessage: locked, unreadCount: 2 }, { id: 'c2' }]));
check(!/SECRET|a\.sealed/.test(chats) && JSON.parse(chats)[0].unreadCount === 2 && JSON.parse(chats)[1].id === 'c2', 'last-message previews of locked chats are stripped; the rest is kept');
check(C.cacheSafeMessages(null) === null, 'bad input does not throw');

console.log('\n3. Wipe at logout');
const mem = new Map([['noob_msgs_cache_u1_c1', '1'], ['noob_chats_cache_u1', '1'], ['noob_msgs_cache_u2_c9', '1'], ['noob_e2ee_ring_v1_u1', 'KEYRING'], ['noob_chat_themes', '{}']]);
const storage = { get length() { return mem.size; }, key: (i) => [...mem.keys()][i] ?? null, removeItem: (k) => { mem.delete(k); } };
const n = C.wipeChatCaches(storage);
check(n === 3 && ![...mem.keys()].some((k) => /^noob_(msgs|chats)_cache_/.test(k)), 'every saved chat list / message list (any account) is removed');
check(mem.has('noob_e2ee_ring_v1_u1') && mem.has('noob_chat_themes'), 'the key ring and other settings are left alone');
check(C.wipeChatCaches(undefined) === 0 && C.wipeChatCaches({ get length() { throw new Error('x'); }, key: () => null, removeItem() {} }) === 0, 'unavailable storage does not throw');

console.log('\n4. Wiring');
const api = fs.readFileSync('src/services/supabaseApi.ts', 'utf8');
const logout = api.slice(api.indexOf('export async function logoutUser'), api.indexOf('selfEndingLogin = false; }, 5000)'));
check(/wipeChatCaches\(\)/.test(logout), 'logoutUser wipes the chat caches');
const view = fs.readFileSync('src/components/Chat/ChatView.tsx', 'utf8');
const writes = view.split('\n').filter((l) => /safeLocalStorageSet\(/.test(l) && /CACHE_KEY_(MSGS|CHATS)/.test(l));
check(writes.length > 0 && writes.every((l) => /cacheSafe(Messages|Chats)\(/.test(l)), `all ${writes.length} cache writes in ChatView go through the sanitiser`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
