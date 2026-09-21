// Tests the database side of end-to-end encrypted chats (migration 15): the public-key directory (a private key can never be stored),
// which chats can be locked, sending / editing / quoting locked messages, that notifications and the server never see the text, that
// plain messages still work exactly as before, that moderators can still delete a locked message, and the passphrase backup — on a REAL
// Postgres (PGlite) holding the real backup, as real signed-in people including every way someone might overstep.
//
// Usage: node scripts/supabase/test-e2ee-db.mjs [backup-folder]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadBackup, buildImportPlan } from './transform.mjs';
import { runImport } from './run-import.mjs';
import { createTestDb, makePgAdapter, asUser, asAnon } from './pg-test-env.mjs';

const backupsRoot = 'backups';
const dir = process.argv.slice(2).find((x) => !x.startsWith('--')) || path.join(backupsRoot, fs.readdirSync(backupsRoot).filter((d) => fs.existsSync(path.join(backupsRoot, d, 'users.json'))).sort().pop());
const raw = loadBackup(dir);
const C = await import(pathToFileURL(path.resolve('src/e2ee/crypto.ts')).href);

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
const admin = profByLegacy[adminRaw.id].id;
const [ann, bob, cy, dee] = pool.slice(0, 4).map((u) => profByLegacy[u.id].id);
const rpc = async (uid, fn, ...args) => asUser(db, uid, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);
const sql = (uid, q, params = []) => asUser(db, uid, async () => (await db.query(q, params)).rows);
const n = async (q, params = []) => (await db.query(q, params)).rows[0].n;

// devices: two for Ann, one each for Bob and Cy; Dee has none yet
const A1 = await C.generateDeviceKey('Ann phone'), A2 = await C.generateDeviceKey('Ann laptop'), B1 = await C.generateDeviceKey('Bob'), C1 = await C.generateDeviceKey('Cy');
const reg = (uid, k) => rpc(uid, 'register_chat_key', k.kid, k.publicJwk, k.label);

section('1. Registering a device key');
let r = await reg(ann, A1);
check(r.success && r.keys.length === 1 && r.keys[0].kid === A1.kid && r.keys[0].active === true && r.hasBackup === false, 'a device registers its public key');
r = await reg(ann, A1);
check(r.keys.length === 1, 'registering the same key again changes nothing');
await reg(ann, A2); await reg(bob, B1); await reg(cy, C1);
check((await rpc(ann, 'my_chat_keys')).keys.length === 2, 'a second device can be added');
await expectFail(() => rpc(ann, 'register_chat_key', A1.kid, A1.privateJwk, 'oops'), /not a valid public key/, 'a PRIVATE key is refused (the server never accepts one)');
await expectFail(() => rpc(ann, 'register_chat_key', 'zzzz', A1.publicJwk, ''), /not a valid key id/, 'a bad key id is refused');
await expectFail(() => rpc(ann, 'register_chat_key', '0123456789abcdef', { kty: 'EC', crv: 'P-384', x: A1.publicJwk.x, y: A1.publicJwk.y }, ''), /not a valid public key/, 'a key on another curve is refused');
await expectFail(() => rpc(ann, 'register_chat_key', '0123456789abcdef', { ...A1.publicJwk, extra: 'x' }, ''), /not a valid public key/, 'a key with extra fields is refused');
await expectFail(() => rpc(ann, 'register_chat_key', '0123456789abcdef', '"text"', ''), /not a valid public key/, 'something that is not a key at all is refused');
await expectFail(() => rpc(ann, 'register_chat_key', A1.kid, B1.publicJwk, ''), /already used by a different key/, 'a key id can not be reused for a different key');
const many = [];
for (let i = 0; i < 9; i++) many.push(await C.generateDeviceKey('d' + i));
for (const k of many) await reg(dee, k);
const deeKeys = (await rpc(dee, 'my_chat_keys')).keys;
check(deeKeys.length === 9 && deeKeys.filter((k) => k.active).length === 8 && deeKeys.find((k) => k.kid === many[0].kid).active === false, 'at most 8 devices are active: the oldest is switched off');
await rpc(dee, 'remove_chat_key', many[8].kid);
check((await rpc(dee, 'my_chat_keys')).keys.filter((k) => k.active).length === 7, 'a device can be switched off (a lost phone)');
await db.query('delete from chat_keys where user_id = $1', [dee]);
await expectFail(() => sql(ann, 'select * from chat_keys'), /permission denied/, 'nobody can read or write the key table directly');
await expectFail(() => sql(ann, 'insert into chat_keys (user_id, kid, public_key) values ($1, $2, $3)', [ann, 'aaaaaaaaaaaaaaaa', A1.publicJwk]), /permission denied/, '...not even for themselves');
await expectFail(() => asAnon(db, () => db.query(`select public.register_chat_key('0123456789abcdef', '{}'::jsonb, '')`)), /permission denied/, 'a visitor who is not logged in can not register a key');
const bobsKeys = await rpc(ann, 'chat_keys_of', bob);
check(bobsKeys.length === 1 && bobsKeys[0].kid === B1.kid && bobsKeys[0].key.x === B1.publicJwk.x && !('d' in bobsKeys[0].key), 'anybody signed in can look up a person\'s PUBLIC keys');

section('2. Which chats can be locked');
const dm = (await sql(ann, `select public.create_chat(array[$1::uuid], false, null, null, null) as r`, [bob]))[0].r.chat;
let mk = await rpc(ann, 'chat_member_keys', dm.id);
check(mk.encryptable === true && mk.members.length === 2 && mk.members.find((m) => m.userId === ann).keys.length === 2 && mk.missing.length === 0, 'a direct chat where both have keys can be locked, for all their devices');
const dmMissing = (await sql(ann, `select public.create_chat(array[$1::uuid], false, null, null, null) as r`, [dee]))[0].r.chat;
mk = await rpc(ann, 'chat_member_keys', dmMissing.id);
check(mk.encryptable === false && mk.reason === 'missing' && mk.missing.includes(dee), 'a chat where somebody has no key yet is not lockable (it keeps working as before)');
await expectFail(() => rpc(cy, 'chat_member_keys', dm.id), /not a participant/, 'somebody outside the chat can not ask for its members\' keys');
const lounge = (await db.query('select id from chats where is_global_default')).rows[0].id;
check((await rpc(ann, 'chat_member_keys', lounge)).encryptable === false && (await rpc(ann, 'chat_member_keys', lounge)).reason === 'public', 'the public Global Lounge is never locked');
const grp = (await sql(ann, `select public.create_chat(array[$1::uuid, $2::uuid], true, 'Locked group', null, null) as r`, [bob, cy]))[0].r.chat;
mk = await rpc(ann, 'chat_member_keys', grp.id);
check(mk.encryptable === true && mk.isGroup === true && mk.members.length === 3, 'a private group where everybody has a key can be locked');

section('3. Sending locked messages');
const seal = (text, sender, chatId, ...recips) => C.seal(text, { chatId, sender, recipients: recips.map((k) => ({ kid: k.kid, publicJwk: k.publicJwk })) });
const env1 = await seal('This is a secret 🤫', A1, dm.id, A1, A2, B1);
const sent = await rpc(ann, 'send_message', dm.id, { e2ee: env1 });
check(sent.success && sent.message.text === '' && sent.message.e2ee.ct === env1.ct && sent.message.mediaUrl === null && sent.message.senderUsername.length > 0, 'a locked message is stored and returned locked, with no text, picture or track');
const stored = (await db.query('select text, media_url, e2ee::text as e from messages where id = $1', [sent.message.id])).rows[0];
check(stored.text === '' && !stored.e.includes('secret') && stored.media_url === null, 'the stored row has no readable text anywhere');
const listed = (await rpc(bob, 'chat_messages', dm.id)).messages.find((m) => m.id === sent.message.id);
check(listed && listed.e2ee.skid === A1.kid && listed.text === '', 'the other person receives the locked envelope');
const seen = await C.open(listed.e2ee, { chatId: dm.id, ring: [B1], senderPublic: async (kid) => (kid === A1.kid ? A1.publicJwk : null) });
check(seen === 'This is a secret 🤫', 'and opens it with their own key (the whole trip works)');
const note = (await db.query(`select message as text, title from notifications where target_user_id = $1 order by created_at desc limit 1`, [bob])).rows[0];
check(note && /🔒 New message/.test(note.text) && !/secret/.test(note.text) && !note.text.includes(env1.ct.slice(0, 12)), 'the notification only says a locked message arrived (no text, no ciphertext)');
const lastMessage = (await rpc(bob, 'my_chats')).find((c) => c.id === dm.id).lastMessage;
check(lastMessage.e2ee && lastMessage.text === '', 'the chat list carries the locked last message too');
check(await n('select count(*)::int n from messages where chat_id = $1 and e2ee is not null', [dm.id]) === 1, '(exactly one locked message so far)');

section('4. Refusing bad locked messages');
const bad = async (env, p = {}, who = ann, chat = dm.id) => rpc(who, 'send_message', chat, { e2ee: env, ...p });
await expectFail(() => bad({ ...env1, v: 2 }), /not a valid encrypted message/, 'a wrong version is refused');
await expectFail(() => bad({ ...env1, keys: {} }), /not a valid encrypted message/, 'a message locked for nobody is refused');
await expectFail(() => bad({ ...env1, keys: [] }), /not a valid encrypted message/, '...or with the keys in the wrong shape');
await expectFail(() => bad({ ...env1, ct: '' }), /not a valid encrypted message/, 'an empty locked text is refused');
await expectFail(() => bad({ ...env1, epk: 'x' }), /not a valid encrypted message/, 'a missing throw-away key is refused');
await expectFail(() => bad({ ...env1, skid: B1.kid }), /not a valid encrypted message/, 'a message claiming to come from somebody else\'s key is refused');
await expectFail(() => bad({ ...env1, skid: '0123456789abcdef' }), /not a valid encrypted message/, '...or from a key that does not exist');
await expectFail(() => bad({ ...env1, ct: 'A'.repeat(70000) }), /not a valid encrypted message/, 'an enormous message is refused');
await expectFail(() => bad('not an object'), /(not a valid encrypted message|Message cannot be empty)/, 'a locked message that is not an object is refused');
await expectFail(() => bad(env1, { gameInvite: { game: 'x' } }), /not a valid encrypted message/, 'a locked message can not also carry a game invite');
await expectFail(() => bad(env1, {}, ann, lounge), /can not be end-to-end encrypted/, 'the public Global Lounge does not take locked messages');
await expectFail(() => bad(env1, {}, cy, dm.id), /not a participant/, 'somebody outside the chat can not post');
const withText = await bad(env1, { text: 'sneaky plain text', mediaUrl: 'posts/x.png' });
check(withText.message.text === '' && withText.message.mediaUrl === null, 'plain text or a picture sent WITH a locked message is dropped, never stored');
check(await n('select count(*)::int n from messages where chat_id = $1 and text ilike $2', [dm.id, '%sneaky%']) === 0, '(nothing readable slipped in)');

section('5. Plain messages still work exactly as before');
const plain = await rpc(bob, 'send_message', dm.id, { text: 'hello, plain' });
check(plain.message.text === 'hello, plain' && plain.message.e2ee === null, 'an ordinary message is stored readable, as always');
const plainNote = (await db.query(`select message as text from notifications where target_user_id = $1 order by created_at desc limit 1`, [ann])).rows[0];
check(/hello, plain/.test(plainNote.text), 'and its notification still shows the text');
await expectFail(() => rpc(bob, 'send_message', dm.id, { text: '   ' }), /cannot be empty/, 'an empty message is still refused');
const inLounge = await rpc(ann, 'send_message', lounge, { text: 'hi lounge' }).catch((e) => e);
check(inLounge instanceof Error ? /Only admins/.test(inLounge.message) : inLounge.message.text === 'hi lounge', 'the Global Lounge behaves as before');
const q = await rpc(bob, 'send_message', dm.id, { text: 'replying', replyTo: { messageId: sent.message.id } });
check(q.message.replyTo.messageId === sent.message.id && q.message.replyTo.textPreview === '', 'quoting a locked message shows no text from the server');
const q2 = await rpc(ann, 'send_message', dm.id, { text: 'replying to plain', replyTo: { messageId: plain.message.id } });
check(q2.message.replyTo.textPreview === 'hello, plain', 'quoting a plain message still shows its text');

section('6. Editing');
await expectFail(() => rpc(ann, 'edit_message', dm.id, sent.message.id, 'new plain text'), /end-to-end encrypted/, 'a locked message can not be overwritten with readable text');
const env2 = await seal('This is the edited secret', A1, dm.id, A1, A2, B1);
const edited = await rpc(ann, 'edit_message_e2ee', dm.id, sent.message.id, env2);
check(edited.message.e2ee.ct === env2.ct && edited.message.isEdited === true && edited.message.text === '', 'a locked message can be replaced by another locked message');
const bobsEnv = await seal('x', B1, dm.id, A1, B1);
await expectFail(() => rpc(bob, 'edit_message_e2ee', dm.id, sent.message.id, bobsEnv), /only edit your own/, 'only the sender can edit');
await expectFail(() => rpc(ann, 'edit_message_e2ee', dm.id, plain.message.id, env2), /only edit your own|not an encrypted one/, 'a plain message can not be turned into a locked one this way');
await expectFail(() => rpc(ann, 'edit_message_e2ee', dm.id, sent.message.id, { ...env2, skid: B1.kid }), /not a valid encrypted message/, 'an edit claiming to be from somebody else\'s key is refused');
const plainEdit = await rpc(bob, 'edit_message', dm.id, plain.message.id, 'hello, plain (edited)');
check(plainEdit.message.text === 'hello, plain (edited)', 'editing a plain message still works');

section('7. Moderation without reading');
const gone = await rpc(admin, 'admin_delete_message', sent.message.id);
check(gone.success && await n('select count(*)::int n from messages where id = $1', [sent.message.id]) === 0, 'the administrator can still delete a locked message (without being able to read it)');
const own = await rpc(ann, 'send_message', dm.id, { e2ee: await seal('mine', A1, dm.id, A1, A2, B1) });
const del = await sql(ann, 'delete from messages where id = $1 returning id', [own.message.id]);
check(del.length === 1, 'and the sender can delete their own locked message');

section('8. Group chats');
const genv = await seal('group secret', A2, grp.id, A1, A2, B1, C1);
const gsent = await rpc(ann, 'send_message', grp.id, { e2ee: genv });
check(gsent.success && (await rpc(cy, 'chat_messages', grp.id)).messages.some((m) => m.id === gsent.message.id && m.e2ee), 'a locked group message reaches every member');
check(await n(`select count(*)::int n from notifications where target_user_id = $1 and message like '%group secret%'`, [bob]) === 0, '(groups never notify with text)');

section('9. The passphrase backup');
const backup = await C.makeBackup([A1, A2], 'correct horse battery staple', 100000);
const same = (a, b) => !!a && !!b && JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());  // (the database may list the fields in another order)
r = await rpc(ann, 'save_chat_key_backup', backup);
check(r.success && r.hasBackup === true && r.backupAt, 'a locked backup of the keys can be saved');
check(same((await rpc(ann, 'get_chat_key_backup')).backup, backup), 'and read back by its owner');
check((await rpc(bob, 'get_chat_key_backup')).backup === null && (await rpc(bob, 'my_chat_keys')).hasBackup === false, 'nobody else can read it (Bob has none)');
for (const [what, blob] of [['a wrong version', { ...backup, v: 2 }], ['a missing salt', { ...backup, salt: '' }], ['too few rounds', { ...backup, iterations: 1000 }], ['far too many rounds', { ...backup, iterations: 900000000 }], ['text instead of a backup', '"nope"'], ['an enormous one', { ...backup, ct: 'A'.repeat(250000) }]]) {
  await expectFail(() => rpc(ann, 'save_chat_key_backup', blob), /not a valid key backup/, `${what} is refused`);
}
check(same((await rpc(ann, 'get_chat_key_backup')).backup, backup), '(the good backup is still there after those attempts)');
await expectFail(() => sql(bob, 'select * from chat_key_backups'), /permission denied/, 'the backup table can not be read directly');
r = await rpc(ann, 'delete_chat_key_backup');
check(r.hasBackup === false && (await rpc(ann, 'get_chat_key_backup')).backup === null, 'a backup can be deleted');

console.log(`\n${passed} passed, ${failed} failed`);
await db.close?.();
process.exitCode = failed ? 1 : 0;
