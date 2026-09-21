// Live check of END-TO-END ENCRYPTED CHATS on a real Supabase project (after migration 15 is installed), through the PUBLIC API only
// (publishable key) — exactly what the website does — using the app's own encryption code (src/e2ee). It creates TWO brand-new throwaway
// accounts (Ann on two devices, Bob on one), locks and opens messages between them, checks that what the SERVER stores contains no
// readable text, that tampering shows as locked, that outsiders and visitors get nothing, that the passphrase backup works, and deletes
// both accounts (and everything they made) at the end. Real accounts are never touched.
//
//   $env:SUPABASE_URL = "https://<ref>.supabase.co"
//   $env:SUPABASE_PUBLISHABLE_KEY = "sb_publishable_..."
//   node scripts/live-check-e2ee.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY first.'); process.exit(1); }
const load = (p) => import(pathToFileURL(path.resolve(p)).href);
const C = await load('src/e2ee/crypto.ts');
const E = await load('src/e2ee/service.ts');
const K = await load('src/e2ee/keyring.ts');
const M = await load('src/e2ee/messages.ts');

let passed = 0, failed = 0;
const check = (ok, label, detail = '') => { if (ok) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const fresh = () => createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const rpcOf = (c) => async (fn, args = {}) => { const { data, error } = await c.rpc(fn, args); if (error) throw Object.assign(new Error(error.message), { code: error.code }); return data; };
const fails = async (fn, re) => { try { await fn(); return false; } catch (e) { return re.test(`${e.message} ${e.code}`); } };

const stamp = Date.now().toString(36);
const PW = 'Test-pass-1234';
async function makeUser(tag) {
  const c = fresh();
  const username = `e2e${tag}_${stamp}`;
  const { data, error } = await c.auth.signUp({
    email: `${crypto.randomUUID()}@users.nooob.xyz`, password: PW,
    options: { data: { username, first_name: 'Live', last_name: tag, email: `e2e${tag}@example.com`, mobile_number: '9000000012', date_of_birth: '2005-05-05', bio: 'automated check', agreed_to_terms: true } }
  });
  if (error || !data.session) throw new Error(`sign-up failed: ${error?.message || 'no session (is "Confirm email" still on?)'}`);
  return { c, id: data.user.id, username };
}
// one "device": the app's own service, with its own key store, talking to the real project as this person
const device = (u, label) => {
  const rpc = rpcOf(u.c);
  const svc = E.createE2ee({ rpc, userId: async () => u.id, storeFor: () => store, seen: { get: (k) => seenMap.get(k) ?? null, set: (k, v) => seenMap.set(k, v) }, deviceLabel: () => label });
  const store = K.memoryKeyStore();
  const seenMap = new Map();
  return { u, rpc, svc, store, msgs: M.bindMessages(svc) };
};
const send = async (d, chatId, input) => {
  const lockedPayload = await d.msgs.prepareSend(chatId, input);
  const p = lockedPayload ?? { text: input.text || '', mediaUrl: input.storedMedia, mediaType: input.mediaType };
  const res = await d.rpc('send_message', { p_chat: chatId, p });
  return { wasLocked: !!lockedPayload, message: (await d.msgs.unlockMessages(chatId, [res.message]))[0], raw: res.message };
};
const list = async (d, chatId) => d.msgs.unlockMessages(chatId, (await d.rpc('chat_messages', { p_chat: chatId })).messages);

const A = await makeUser('a');
const B = await makeUser('b');
try {
  const a1 = device(A, 'Ann phone'), a2 = device(A, 'Ann laptop'), b1 = device(B, 'Bob phone');

  section('Devices and keys');
  const ready = await Promise.all([a1.svc.ensure(A.id), a2.svc.ensure(A.id), b1.svc.ensure(B.id)]);
  check(ready.every((r) => r.ok), 'every device makes a key and registers its public half');
  const mine = await a1.rpc('my_chat_keys');
  check(mine.keys.length === 2 && mine.keys.every((k) => k.active) && !mine.hasBackup, 'the server lists two devices for Ann');
  const stolen = await A.c.from('chat_keys').select('*');
  check(!!stolen.error && /permission denied/i.test(stolen.error.message), 'the key table itself is not readable from a browser');
  check(await fails(async () => a1.rpc('register_chat_key', { p_kid: '0123456789abcdef', p_key: (await a1.store.load()).keys[0].privateJwk, p_label: 'x' }), /not a valid public key/), 'a PRIVATE key is refused by the server');
  const visitor = fresh();
  check(await fails(() => rpcOf(visitor)('register_chat_key', { p_kid: '0123456789abcdef', p_key: {}, p_label: '' }), /permission denied/), 'a visitor who is not logged in can not register a key');
  check(await fails(() => rpcOf(visitor)('chat_keys_of', { p_user: A.id }), /permission denied/), '...or look up anybody\'s keys');

  section('A locked chat');
  const chat = (await a1.rpc('create_chat', { p_participant_ids: [B.id], p_is_group: false })).chat;
  const ia = await a1.svc.chatCrypto(chat.id), ib = await b1.svc.chatCrypto(chat.id);
  check(ia.encryptable && ib.encryptable && ia.peer.code === ib.peer.code, 'the chat can be locked, and both people see the same security code');
  const secret = 'Live secret ✔ ' + stamp;
  const s1 = await send(a1, chat.id, { text: secret });
  check(s1.wasLocked && s1.message.text === secret && !s1.message.locked, 'Ann sends a locked message');
  const bobSees = (await list(b1, chat.id)).find((m) => m.id === s1.message.id);
  check(bobSees && bobSees.text === secret && bobSees.encrypted, 'Bob opens it');
  const laptopSees = (await list(a2, chat.id)).find((m) => m.id === s1.message.id);
  check(laptopSees && laptopSees.text === secret, 'Ann\'s other device opens it too');
  const rowCheck = await A.c.from('messages').select('text, media_url, e2ee').eq('id', s1.message.id).single();
  check(!rowCheck.error && rowCheck.data.text === '' && rowCheck.data.media_url === null && !JSON.stringify(rowCheck.data.e2ee).includes(stamp), 'the row stored on the SERVER has no readable text');
  const gif = await send(b1, chat.id, { storedMedia: 'https://media.giphy.com/media/live/giphy.gif', mediaType: 'image' });
  check(gif.wasLocked && (await list(a1, chat.id)).find((m) => m.id === gif.message.id)?.mediaUrl === 'https://media.giphy.com/media/live/giphy.gif', 'a GIF is locked and opens on the other side');
  const reply = await send(b1, chat.id, { text: 'replying', replyToId: s1.message.id });
  check(reply.message.replyTo?.textPreview?.startsWith('Live secret'), 'a reply to a locked message shows its quote (made on the device)');
  const plainPhoto = await send(a1, chat.id, { text: 'photo', storedMedia: 'posts/none.jpg', mediaType: 'image' });
  check(!plainPhoto.wasLocked && plainPhoto.message.text === 'photo', 'a photo still goes as before');
  const env = await a1.msgs.prepareEdit(chat.id, s1.message.id, 'Edited ' + stamp);
  const ed = await a1.rpc('edit_message_e2ee', { p_chat: chat.id, p_message: s1.message.id, p_e2ee: env });
  check((await a1.msgs.unlockMessages(chat.id, [ed.message]))[0].text === 'Edited ' + stamp && (await list(b1, chat.id)).find((m) => m.id === s1.message.id).text === 'Edited ' + stamp, 'an edit is locked again');
  check(await fails(() => a1.rpc('edit_message', { p_chat: chat.id, p_message: s1.message.id, p_text: 'plain overwrite' }), /end-to-end encrypted/), 'a readable edit can not overwrite a locked message');
  const note = await B.c.from('notifications').select('message').eq('target_user_id', B.id).eq('type', 'new_message').order('created_at', { ascending: false }).limit(3);
  check(!note.error && !(note.data || []).some((n) => n.message.includes(stamp) || n.message.includes('replying')) && (note.data || []).some((n) => /🔒 New message/.test(n.message)), 'the notification only says that a message arrived');

  section('Who can not read it');
  const outsider = fresh();
  check(!(await outsider.from('messages').select('id').eq('id', s1.message.id)).data?.length, 'a visitor can not read the message row');
  const lounge = (await A.c.rpc('my_chats')).data.find((c) => c.isGlobalDefault || c.is_global_default);
  if (lounge) check((await a1.svc.chatCrypto(lounge.id)).reason === 'public', 'the public Global Lounge is never locked');

  section('Tampering');
  const fresh2 = E.createE2ee({ rpc: rpcOf(B.c), userId: async () => B.id, storeFor: () => b1.store, seen: { get: () => null, set: () => {} } });
  const msgsFresh = M.bindMessages(fresh2);
  const raw = (await rpcOf(B.c)('chat_messages', { p_chat: chat.id })).messages.find((m) => m.id === s1.message.id);
  const flipped = { ...raw, e2ee: { ...raw.e2ee, ct: (raw.e2ee.ct[0] === 'A' ? 'B' : 'A') + raw.e2ee.ct.slice(1) } };
  const shown = await msgsFresh.unlockOne(chat.id, flipped);
  check(shown.locked === 'damaged' && shown.text === '', 'a changed message shows as locked, never as different words');
  const moved = await msgsFresh.unlockOne(chat.id, { ...raw, senderId: B.id });
  check(moved.locked === 'unverified-sender' && moved.text === '', 'a message moved into somebody else\'s name is not shown');

  section('A new device and the backup');
  const a3 = device(A, 'Ann new phone');
  await a3.svc.ensure(A.id);
  check((await list(a3, chat.id)).find((m) => m.id === s1.message.id).locked === 'no-key', 'a new device can not read older messages');
  await a1.svc.saveBackup('a long live test passphrase');
  const blob = (await A.c.rpc('get_chat_key_backup')).data.backup;
  check(!!blob && !JSON.stringify(blob).includes((await a1.store.load()).keys[0].privateJwk.d), 'the stored backup holds no readable private key');
  check(await fails(() => a3.svc.restoreBackup('the wrong passphrase!'), /Wrong passphrase/), 'a wrong passphrase restores nothing');
  await a3.svc.restoreBackup('a long live test passphrase');
  check((await list(a3, chat.id)).find((m) => m.id === s1.message.id).text === 'Edited ' + stamp, 'the right passphrase opens the older messages on the new device');
  await a1.svc.deleteBackup();
  check(!(await a1.svc.status()).hasBackup, 'the backup can be deleted');
} finally {
  for (const u of [A, B]) {
    const who = await u.c.rpc('get_my_user');
    if (who.data?.username === u.username) {
      const del = await u.c.rpc('delete_my_account', { p_password: PW });
      console.log(`\nthrowaway account ${u.username} ${del.error ? 'NOT deleted: ' + del.error.message : 'deleted'}`);
    } else console.log(`\nnot deleting ${u.username}: the signed-in account is not the throwaway`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
