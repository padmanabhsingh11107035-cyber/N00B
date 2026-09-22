// Tests the app side of end-to-end encrypted chats — the real service (src/e2ee/service.ts + messages.ts + keyring.ts) talking to the real
// database rules (migration 15, on PGlite holding the real backup) as real people with several devices: registering keys, locking and
// opening messages, GIF links, replies, edits, translating, new devices and the passphrase backup, removing a device, key-change notices,
// and — most of all — every way locking can fail (it must never quietly send a readable message instead) and every way the server or an
// outsider could tamper with a message (it must show as locked, never as somebody else's words).
//
// Usage: node scripts/supabase/test-e2ee-service.mjs [backup-folder]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadBackup, buildImportPlan } from './transform.mjs';
import { runImport } from './run-import.mjs';
import { createTestDb, makePgAdapter, asUser } from './pg-test-env.mjs';

const backupsRoot = 'backups';
const dir = process.argv.slice(2).find((x) => !x.startsWith('--')) || path.join(backupsRoot, fs.readdirSync(backupsRoot).filter((d) => fs.existsSync(path.join(backupsRoot, d, 'users.json'))).sort().pop());
const raw = loadBackup(dir);
const load = (p) => import(pathToFileURL(path.resolve(p)).href);
const C = await load('src/e2ee/crypto.ts');
const E = await load('src/e2ee/service.ts');
const K = await load('src/e2ee/keyring.ts');
const M = await load('src/e2ee/messages.ts');

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const expectFail = async (fn, pattern, label) => {
  try { await fn(); check(false, label, '(expected an error, but it succeeded)'); }
  catch (e) { check(pattern.test(e.message), label, `(got: ${e.message})`); }
};
const section = (t) => console.log(`\n${t}`);

const db = await createTestDb();
await runImport(buildImportPlan(raw, {}), makePgAdapter(db), { log: () => {} });
const profByLegacy = Object.fromEntries((await db.query('select * from profiles')).rows.map((p) => [p.legacy_id, p]));
const adminRaw = raw.users.find((u) => u.isAdmin);
const pool = raw.users.filter((u) => !u.isAdmin && (u.password || '').length > 0);
const [ann, bob, cy, dee] = pool.slice(0, 4).map((u) => profByLegacy[u.id].id);
const nameOf = Object.fromEntries((await db.query('select id, username from profiles')).rows.map((r) => [r.id, r.username]));

// ------------------------------------------------------------------------------------------------ a "device": a person's phone or laptop
const baseRpc = (uid) => async (fn, args = {}) => {
  const vals = Object.values(args);
  return asUser(db, uid, async () => (await db.query(`select public.${fn}(${vals.map((_, i) => `$${i + 1}`).join(', ')}) as r`, vals)).rows[0].r);
};
// opts.hook(fn, args): may throw (a network failure) or return { result } to replace the answer
const device = (uid, opts = {}) => {
  const store = opts.store || K.memoryKeyStore();
  const calls = [];
  const seen = new Map();
  const base = baseRpc(uid);
  const rpc = async (fn, args = {}) => {
    calls.push(fn);
    if (opts.hook) { const h = await opts.hook(fn, args); if (h && 'result' in h) return h.result; }
    const res = await base(fn, args);
    return opts.after ? opts.after(fn, res) : res;
  };
  const svc = E.createE2ee({ rpc, userId: async () => uid, storeFor: () => store, seen: { get: (k) => seen.get(k) ?? null, set: (k, v) => seen.set(k, v) }, deviceLabel: () => opts.label || 'Test device' });
  return { uid, store, calls, seen, rpc, svc, msgs: M.bindMessages(svc) };
};
const count = (d, fn) => d.calls.filter((c) => c === fn).length;
// what the app does to send / to list (the same calls supabaseApi.ts makes)
const send = async (d, chatId, input) => {
  const lockedPayload = await d.msgs.prepareSend(chatId, input);
  const p = lockedPayload ?? { text: input.text || '', mediaUrl: input.storedMedia, mediaType: input.mediaType, replyTo: input.replyToId ? { messageId: input.replyToId } : undefined };
  const res = await d.rpc('send_message', { p_chat: chatId, p });
  return { wasLocked: !!lockedPayload, message: (await d.msgs.unlockMessages(chatId, [res.message]))[0], raw: res.message };
};
const list = async (d, chatId) => d.msgs.unlockMessages(chatId, (await d.rpc('chat_messages', { p_chat: chatId })).messages);
const stored = async (id) => (await db.query('select text, media_url, e2ee::text as e from messages where id = $1', [id])).rows[0];

const annPhone = device(ann, { label: 'Ann phone' });
const annLaptop = device(ann, { label: 'Ann laptop' });
const bobD = device(bob, { label: 'Bob' });
const cyD = device(cy, { label: 'Cy' });
const deeD = device(dee, { label: 'Dee' });

section('1. A device sets itself up');
const [r1, r2, r3] = await Promise.all([annPhone.svc.ensure(ann), annPhone.svc.ensure(ann), annPhone.svc.ensure(ann)]);
check(r1.ok && r2.ok && r3.ok, 'a device makes its key and registers the public half');
const ring1 = await annPhone.store.load();
check(ring1.keys.length === 1 && ring1.current === ring1.keys[0].kid && count(annPhone, 'register_chat_key') === 1, 'three calls at once make ONE key, registered once');
const serverKeys = (await baseRpc(ann)('my_chat_keys')).keys;
check(serverKeys.length === 1 && serverKeys[0].kid === ring1.current && serverKeys[0].label === 'Ann phone', 'the server holds the key\'s id and label');
check(!/"d"/.test(JSON.stringify((await db.query('select public_key from chat_keys where user_id = $1', [ann])).rows)), 'and never a private key');
await annPhone.svc.ensure(ann);
check(count(annPhone, 'register_chat_key') === 1, 'asking again does not ask the server again');
await annLaptop.svc.ensure(ann); await bobD.svc.ensure(bob); await cyD.svc.ensure(cy);
check((await baseRpc(ann)('my_chat_keys')).keys.length === 2, 'a second device is a second key');

const brokenStore = { load: async () => { throw new Error('disk error'); }, save: async () => { throw new Error('should not be called'); } };
const brokenDevice = device(ann, { store: brokenStore });
const rb = await brokenDevice.svc.ensure(ann);
check(!rb.ok && rb.reason === 'blocked' && count(brokenDevice, 'register_chat_key') === 0, 'a key store that can not be read makes NO key and registers nothing');
let saves = 0;
const readOnly = device(ann, { store: { load: async () => K.emptyRing(), save: async () => { saves++; throw new Error('quota'); } } });
const rro = await readOnly.svc.ensure(ann);
check(!rro.ok && rro.reason === 'blocked' && count(readOnly, 'register_chat_key') === 0, 'a key that can not be SAVED is never registered (it would be lost)');
const oldStyle = device(ann, { hook: async (fn) => { const e = new Error('Could not find the function public.register_chat_key(p_kid, p_key, p_label) in the schema cache'); e.code = 'PGRST202'; if (fn === 'register_chat_key') throw e; } });
const ro = await oldStyle.svc.ensure(ann);
check(!ro.ok && ro.reason === 'off', 'before the database update, encryption is simply "off" (nothing breaks)');

section('2. A direct chat: locking, opening, the server sees nothing');
const dm = (await asUser(db, ann, async () => (await db.query(`select public.create_chat(array[$1::uuid], false, null, null, null) as r`, [bob])).rows[0].r)).chat;
const info = await annPhone.svc.chatCrypto(dm.id);
check(info.encryptable && info.reason === 'ok' && info.members.length === 2 && !info.isGroup && info.mustLock === false, 'a chat where everybody has a key can be locked');
const infoBob = await bobD.svc.chatCrypto(dm.id);
check(info.peer.code === infoBob.peer.code && /^(\d{5} ){11}\d{5}$/.test(info.peer.code) && !info.peer.changed && !infoBob.peer.changed, 'both people see the same security code, and no change notice the first time');
const s1 = await send(annPhone, dm.id, { text: 'Meet at 7, this is a secret 🤫' });
check(s1.wasLocked && s1.message.text === 'Meet at 7, this is a secret 🤫' && s1.message.encrypted === true && !s1.message.locked && !('e2ee' in s1.message), 'a message is locked when sent, and comes back readable for the sender');
const row = await stored(s1.message.id);
check(row.text === '' && row.media_url === null && !row.e.includes('secret') && !row.e.includes('Meet at'), 'the server stores no readable text');
const bobsView = await list(bobD, dm.id);
const got = bobsView.find((m) => m.id === s1.message.id);
check(got && got.text === 'Meet at 7, this is a secret 🤫' && got.encrypted && !got.locked && got.senderId === ann, 'the other person opens it');
const laptopView = (await list(annLaptop, dm.id)).find((m) => m.id === s1.message.id);
check(laptopView && laptopView.text === 'Meet at 7, this is a secret 🤫', 'the sender\'s OTHER device opens it too');
const bobReply = await send(bobD, dm.id, { text: 'On my way', replyToId: s1.message.id });
check(bobReply.wasLocked && bobReply.message.replyTo.messageId === s1.message.id && bobReply.message.replyTo.textPreview.startsWith('Meet at 7'), 'a reply to a locked message shows the quote (written on the device, not by the server)');
check(bobReply.raw.replyTo.textPreview === '', '...while the server itself wrote no text for it');
const long = 'x'.repeat(4000) + ' — ünïcödé 日本語 🎉';
const sLong = await send(annPhone, dm.id, { text: long });
check(sLong.message.text === long, 'long text with any language and emoji comes back exactly');
const gif = await send(bobD, dm.id, { storedMedia: 'https://media.giphy.com/media/abc/giphy.gif', mediaType: 'image' });
const gifRow = await stored(gif.message.id);
check(gif.wasLocked && gif.message.mediaUrl === 'https://media.giphy.com/media/abc/giphy.gif' && gif.message.text === '' && gifRow.media_url === null && !gifRow.e.includes('giphy'), 'a GIF / sticker link is locked too (the server does not learn which GIF)');
const gifSeen = (await list(annPhone, dm.id)).find((m) => m.id === gif.message.id);
check(gifSeen && gifSeen.mediaUrl === 'https://media.giphy.com/media/abc/giphy.gif' && gifSeen.mediaType === 'image', 'and the other side sees the GIF');
const photo = await send(annPhone, dm.id, { text: 'look', storedMedia: 'posts/photo-1.jpg', mediaType: 'image' });
check(!photo.wasLocked && photo.message.mediaUrl === 'posts/photo-1.jpg' && photo.message.text === 'look' && !photo.message.encrypted, 'an uploaded photo goes as before (photos are not locked yet, and the app says so)');
const voice = await send(annPhone, dm.id, { text: '', storedMedia: 'posts/voice.webm', mediaType: 'audio', audioDuration: '0:07' });
check(!voice.wasLocked, 'a voice note goes as before');
const track = await send(annPhone, dm.id, { text: 'listen', sharedTrack: { title: 'T', artist: 'A' } });
check(!track.wasLocked, 'a shared music track goes as before');
await expectFail(() => send(annPhone, dm.id, { text: '   ' }), /cannot be empty/, 'an empty message is refused before anything is sent');
const note = (await db.query(`select message as text from notifications where target_user_id = $1 and type = 'new_message' order by created_at desc, id desc limit 5`, [bob])).rows.map((r) => r.text);
check(note.some((t) => /🔒 New message/.test(t)) && !note.some((t) => /secret|On my way/.test(t)), 'notifications say only that a message arrived');
const last = (await annPhone.rpc('my_chats')).find((c) => c.id === dm.id);
const lastOpened = await annPhone.msgs.unlockOne(dm.id, last.lastMessage);
check(!lastOpened.e2ee && typeof lastOpened.text === 'string', 'the chat list\'s last message is opened too');

section('3. Editing and translating a locked message');
check(annPhone.svc.payloadOf(s1.message.id)?.t === 'Meet at 7, this is a secret 🤫', 'the text of an opened message is known on the device (for translating: only then is it sent, once, to the translator)');
check(bobD.svc.payloadOf('00000000-0000-0000-0000-000000000000') === null, '...and unknown for anything not opened here');
const envEdit = await annPhone.msgs.prepareEdit(dm.id, s1.message.id, 'Meet at 8 instead');
const edited = await annPhone.rpc('edit_message_e2ee', { p_chat: dm.id, p_message: s1.message.id, p_e2ee: envEdit });
const editedOpened = (await annPhone.msgs.unlockMessages(dm.id, [edited.message]))[0];
check(editedOpened.text === 'Meet at 8 instead' && editedOpened.isEdited === true, 'an edit locks the new text again');
check((await list(bobD, dm.id)).find((m) => m.id === s1.message.id).text === 'Meet at 8 instead', 'and the other person sees the edited text');
await expectFail(() => annPhone.rpc('edit_message', { p_chat: dm.id, p_message: s1.message.id, p_text: 'plain overwrite' }), /end-to-end encrypted/, 'a readable edit can never overwrite a locked message');
const envGif = await bobD.msgs.prepareEdit(dm.id, gif.message.id, 'now with words');
const gifEdited = (await bobD.msgs.unlockMessages(dm.id, [(await bobD.rpc('edit_message_e2ee', { p_chat: dm.id, p_message: gif.message.id, p_e2ee: envGif })).message]))[0];
check(gifEdited.text === 'now with words' && gifEdited.mediaUrl === 'https://media.giphy.com/media/abc/giphy.gif', 'editing a message with a GIF keeps the GIF');
await expectFail(() => annPhone.msgs.prepareEdit(dm.id, s1.message.id, '  '), /cannot be empty/, 'an edit to nothing is refused');

section('4. A direct chat with somebody who has no key yet: blocked, never sent readable');
const dmMissing = (await asUser(db, cy, async () => (await db.query(`select public.create_chat(array[$1::uuid], false, null, null, null) as r`, [dee])).rows[0].r)).chat;
const im = await cyD.svc.chatCrypto(dmMissing.id);
check(!im.encryptable && im.reason === 'missing' && im.missing.includes(nameOf[dee]) && im.mustLock === true, 'somebody with no key yet: not locked, and the app knows who, and it must not be sent unlocked');
await expectFail(() => send(cyD, dmMissing.id, { text: 'plain for now' }), /waiting for the other person/, 'a direct chat refuses to send readable — it waits instead of degrading to plain text');
check((await db.query('select count(*)::int as n from messages where chat_id = $1', [dmMissing.id])).rows[0].n === 0, 'and nothing at all was stored for it');
await deeD.svc.ensure(dee);
const im2 = await cyD.svc.chatCrypto(dmMissing.id, true);
check(im2.encryptable && im2.reason === 'ok' && im2.mustLock === false, 'once they have a key, the chat becomes locked and sendable');
const nowLocked = await send(cyD, dmMissing.id, { text: 'now it can go' });
check(nowLocked.wasLocked && nowLocked.message.text === 'now it can go', 'and the message that was blocked a moment ago now sends locked');
const lounge = (await db.query('select id from chats where is_global_default')).rows[0].id;
const il = await annPhone.svc.chatCrypto(lounge);
check(!il.encryptable && il.reason === 'public' && il.mustLock === false && (await annPhone.msgs.prepareSend(lounge, { text: 'hi all' })) === null, 'the public Global Lounge is never locked');

section('5. Locking can fail: the message must fail, never go out readable');
const cyPublic = (await cyD.store.load()).keys[0].publicJwk;
const rotten = device(ann, { store: annPhone.store, after: (fn, res) => {
  if (fn !== 'chat_member_keys') return res;
  const swapped = JSON.parse(JSON.stringify(res));
  const b = swapped.members.find((m) => m.userId === bob);
  b.keys[0].key = { ...b.keys[0].key, x: cyPublic.x }; // a key that does not match the id it is listed under
  return swapped;
} });
await expectFail(() => send(rotten, dm.id, { text: 'never readable' }), /does not match its id|Could not lock/, 'a public key that does not match its id (a lying server) stops the message');
check((await db.query(`select count(*)::int n from messages where text = 'never readable'`)).rows[0].n === 0, '(and nothing readable was stored)');
const offline = device(ann, { store: annPhone.store, hook: async (fn) => { if (fn === 'chat_member_keys') throw new Error('Failed to fetch'); } });
await expectFail(() => send(offline, dm.id, { text: 'nor this' }), /Could not check this chat/, 'if the app can not ask who the chat is locked for, the message fails (it does not guess "not locked")');
const blockedDev = device(ann, { store: brokenStore });
await expectFail(() => send(blockedDev, dm.id, { text: 'nor this either' }), /can not keep chat keys/, 'a device whose key store is unusable can not send private messages readable');
check((await blockedDev.msgs.prepareSend(lounge, { text: 'public is fine' })) === null, '...but can still post in the public Lounge');
const beforeUpgrade = device(ann, { hook: async (fn) => { const e = new Error('Could not find the function public.' + fn + ' in the schema cache'); e.code = 'PGRST202'; throw e; } });
check((await beforeUpgrade.msgs.prepareSend(dm.id, { text: 'old server' })) === null, 'before the database update everything is sent as before');
check((await beforeUpgrade.msgs.unlockMessages(dm.id, [{ id: 'a', senderId: ann, text: 'plain old' }]))[0].text === 'plain old', '...and plain messages are shown untouched');

section('6. Somebody tampers with a locked message');
const fresh = () => device(bob, { store: bobD.store });
const target = s1.message.id;
const envNow = JSON.parse((await stored(target)).e);
const flip = (s) => (s[0] === 'A' ? 'B' : 'A') + s.slice(1);
await db.query('update messages set e2ee = $1::jsonb where id = $2', [JSON.stringify({ ...envNow, ct: flip(envNow.ct) }), target]);
let v = (await list(fresh(), dm.id)).find((m) => m.id === target);
check(v.locked === 'damaged' && v.text === '' && v.encrypted, 'a changed message shows as locked (damaged), never as different words');
await db.query('update messages set e2ee = $1::jsonb where id = $2', [JSON.stringify(envNow), target]);
v = (await list(fresh(), dm.id)).find((m) => m.id === target);
check(!v.locked && v.text === 'Meet at 8 instead', '(the original opens again)');
await db.query('update messages set sender_id = $1 where id = $2', [bob, target]);
v = (await list(fresh(), dm.id)).find((m) => m.id === target);
check(v.locked === 'unverified-sender' && v.text === '', 'a message moved to somebody else\'s name is NOT shown (the sender\'s key does not belong to them)');
await db.query('update messages set sender_id = $1 where id = $2', [ann, target]);
const grp = (await asUser(db, ann, async () => (await db.query(`select public.create_chat(array[$1::uuid, $2::uuid], true, 'Trio', null, null) as r`, [bob, cy])).rows[0].r)).chat;
const replay = (await db.query(`insert into messages (chat_id, sender_id, text, e2ee) values ($1, $2, '', $3::jsonb) returning id`, [grp.id, ann, JSON.stringify(envNow)])).rows[0].id;
v = (await list(fresh(), grp.id)).find((m) => m.id === replay);
check(v.locked === 'damaged', 'a message copied into another chat does not open there');
const wrongDevice = (await list(device(cy, { store: cyD.store }), dm.id).catch(() => 'refused'));
check(wrongDevice === 'refused' || (Array.isArray(wrongDevice) && wrongDevice.length === 0), 'a person outside the chat gets nothing to open');
await db.query('delete from messages where id = $1', [replay]);
const junk = await bobD.msgs.unlockOne(dm.id, { id: 'j1', senderId: ann, text: '', e2ee: { v: 1, junk: true } });
check(junk.locked === 'damaged' && junk.text === '', 'a nonsense envelope shows as locked');

// The app keeps ONE long-lived device instance for the whole session (exactly what bobD is here), so its "already opened" cache must not
// let a message that is moved to a different sender's name keep showing under its old, correctly-opened result.
check((await list(bobD, dm.id)).find((m) => m.id === target)?.text === 'Meet at 8 instead', '(bobD has this message cached from opening it earlier, correctly, from Ann)');
await db.query('update messages set sender_id = $1 where id = $2', [bob, target]);
const restamped = (await list(bobD, dm.id)).find((m) => m.id === target);
check(restamped.locked === 'unverified-sender' && restamped.text === '', 'moving that SAME message to a different sender is caught even on a device that already had it cached');
await db.query('update messages set sender_id = $1 where id = $2', [ann, target]);
check((await list(bobD, dm.id)).find((m) => m.id === target)?.text === 'Meet at 8 instead', '(moving it back reopens it normally)');

section('7. A new device, and the passphrase backup');
const annNew = device(ann, { label: 'Ann new phone' });
await annNew.svc.ensure(ann);
const oldOnNew = (await list(annNew, dm.id)).find((m) => m.id === s1.message.id);
check(oldOnNew.locked === 'no-key' && oldOnNew.text === '' && oldOnNew.encrypted, 'a new device can NOT read older messages (they were not locked for it)');
const newMsg = await send(bobD, dm.id, { text: 'after the new phone joined' });
check((await list(annNew, dm.id)).find((m) => m.id === newMsg.message.id).text === 'after the new phone joined', 'but it reads everything sent after it joined');
await expectFail(() => annPhone.svc.saveBackup('short'), /at least 10/, 'a weak backup passphrase is refused');
await expectFail(() => annNew.svc.restoreBackup('whatever passphrase'), /no key backup/, 'restoring when no backup exists says so');
await annPhone.svc.saveBackup('correct horse battery staple');
const st = await annPhone.svc.status();
check(st.available && st.hasBackup && st.backupAt && st.devices.length >= 3 && st.devices.filter((d) => d.thisDevice).length === 1, 'the settings see the devices and the backup');
const blob = (await db.query('select blob::text b from chat_key_backups where user_id = $1', [ann])).rows[0].b;
check(!blob.includes('"d"') && !blob.includes(ring1.keys[0].privateJwk.d) && !blob.includes('correct horse'), 'the stored backup contains neither a readable private key nor the passphrase');
await expectFail(() => annNew.svc.restoreBackup('wrong passphrase!!'), /Wrong passphrase/, 'a wrong passphrase restores nothing');
check((await list(annNew, dm.id)).find((m) => m.id === s1.message.id).locked === 'no-key', '(and older messages stay locked)');
const added = await annNew.svc.restoreBackup('correct horse battery staple');
check(added === 1, 'the right passphrase brings the old key onto the new device');
const nowOpen = (await list(annNew, dm.id)).find((m) => m.id === s1.message.id);
check(nowOpen.text === 'Meet at 8 instead' && !nowOpen.locked, 'and now the older messages open on it');
check((await annNew.store.load()).current === (await annNew.store.load()).keys.find((k) => k.label === 'Ann new phone').kid, 'the restored keys never replace the device\'s own key');
await annPhone.svc.deleteBackup();
check(!(await annPhone.svc.status()).hasBackup, 'the backup can be deleted');

section('8. Removing a device, and keys that change');
const laptopKid = (await annLaptop.store.load()).current;
await expectFail(async () => annPhone.svc.removeDevice((await annPhone.store.load()).current), /this device/, 'a device can not switch itself off');
await annPhone.svc.removeDevice(laptopKid);
const afterRemove = await bobD.svc.chatCrypto(dm.id, true);
check(!afterRemove.members.find((m) => m.userId === ann).keys.some((k) => k.kid === laptopKid), 'a switched-off device is no longer a recipient');
const m3 = await send(bobD, dm.id, { text: 'after removal' });
check((await list(annLaptop, dm.id)).find((m) => m.id === m3.message.id).locked === 'no-key' && (await list(annPhone, dm.id)).find((m) => m.id === m3.message.id).text === 'after removal', 'so new messages stay closed to it and open on the others');
const before = (await annPhone.svc.chatCrypto(dm.id, true)).peer;
const B2 = device(bob, { label: 'Bob tablet' });
await B2.svc.ensure(bob);
const changed = (await annPhone.svc.chatCrypto(dm.id, true)).peer;
check(before.changed === false && changed.changed === true && changed.code !== before.code, 'when a person gets a new device, the other side is told (their security code changed)');
await annPhone.svc.acknowledge(changed.userId, changed.fingerprint);
check((await annPhone.svc.chatCrypto(dm.id, true)).peer.changed === false, 'and the notice goes away once acknowledged');

section('9. Speed and limits');
const many = [];
for (let i = 0; i < 12; i++) many.push((await send(annPhone, dm.id, { text: 'bulk ' + i })).message.id);
const reader = device(bob, { store: bobD.store });
const t0 = Date.now();
const all = await list(reader, dm.id);
check(all.filter((m) => many.includes(m.id)).every((m) => m.text.startsWith('bulk')), 'a whole conversation opens in one go');
check(count(reader, 'chat_keys_of') === 1, 'twelve messages from one person cost ONE lookup of their keys');
const t1 = Date.now();
await list(reader, dm.id);
check(count(reader, 'chat_keys_of') === 1 && Date.now() - t1 <= Math.max(200, (t1 - t0)), 'opening again (the app refreshes every second or two) reuses what it already opened');
check(reader.svc._peek().opened >= 12, '(and remembers it)');

section('10. The key store on a device');
const k1 = await C.generateDeviceKey('one'), k2 = await C.generateDeviceKey('two');
const merged = K.mergeRings({ v: 1, current: k1.kid, keys: [k1] }, { v: 1, current: k2.kid, keys: [k2] });
check(merged.keys.length === 2 && merged.current === k1.kid, 'two copies of a key ring become one with every key (and the first copy decides which key is this device\'s own)');
check(K.mergeRings({ v: 1, current: null, keys: [k1] }, { v: 1, current: k1.kid, keys: [k1] }).current === k1.kid && K.mergeRings({ v: 1, current: null, keys: [k1] }, { v: 1, current: null, keys: [] }).keys.length === 1, 'a key is never lost by merging with an empty or older copy');
const dirty = K.cleanRing({ v: 1, current: 'ffffffffffffffff', keys: [k1, { kid: 'nope' }, { ...k2, privateJwk: { d: 5 } }, null, 'x'] });
check(dirty.keys.length === 1 && dirty.keys[0].kid === k1.kid && dirty.current === null, 'damaged entries are dropped, and a "current" key that is not in the ring is forgotten');
check(K.cleanRing(null).keys.length === 0 && K.cleanRing('garbage').current === null, 'a missing or nonsense ring is simply empty');
const mem = K.memoryKeyStore();
await mem.save({ v: 1, current: k1.kid, keys: [k1] });
const back = await mem.load();
back.keys.length = 0;
check((await mem.load()).keys.length === 1, 'what is loaded is a copy (changing it does not change the store)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
