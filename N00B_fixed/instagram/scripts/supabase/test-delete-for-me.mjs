// Tests migration 20261014000013: "Delete for me" in chat. A person removes a message (their own or somebody else's) from THEIR view only; the message stays for everyone else.
// On a REAL Postgres (PGlite) with every migration applied, plus the screen's own wiring.
//
// Usage: node scripts/supabase/test-delete-for-me.mjs
import fs from 'node:fs';
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const expectFail = async (fn, pattern, label) => {
  try { await fn(); check(false, label, '(expected an error, but it succeeded)'); }
  catch (e) { check(pattern.test(e.message), label, `(got: ${e.message})`); }
};
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

const db = await createTestDb();
const mkUser = async (name) => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, name]);
  return id;
};
const rpc = (uid, fn, ...args) => asUser(db, uid, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);
const msgs = async (uid, chat, after = null) => (await rpc(uid, 'chat_messages', chat, 300, after));

const ann = await mkUser('ann');
const raj = await mkUser('raj');
const eve = await mkUser('eve');
const chat = (await db.query(`insert into public.chats (is_group, creator_id) values (false, $1) returning id`, [ann])).rows[0].id;
await db.query(`insert into public.chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`, [chat, ann, raj]);
const say = async (sender, text, at) => (await db.query(`insert into public.messages (chat_id, sender_id, text, created_at) values ($1, $2, $3, now() - ($4 || ' seconds')::interval) returning id`, [chat, sender, text, String(at)])).rows[0].id;
const m1 = await say(ann, 'hello raj', 50);
const m2 = await say(raj, 'hi ann', 40);
const m3 = await say(ann, 'how are you', 30);
const m4 = await say(raj, 'fine, thanks', 20);

section('1. Before: both see everything');
check((await msgs(ann, chat)).messages.length === 4 && (await msgs(raj, chat)).messages.length === 4, 'both people see all four messages');

section('2. Delete for me: a message is gone from MY view only');
check((await rpc(raj, 'hide_message_for_me', m1)).success === true, 'raj deletes ann\'s message for himself');
const rajSees = (await msgs(raj, chat)).messages.map((m) => m.text);
const annSees = (await msgs(ann, chat)).messages.map((m) => m.text);
check(rajSees.join('|') === 'hi ann|how are you|fine, thanks', 'raj no longer sees it', rajSees.join('|'));
check(annSees.join('|') === 'hello raj|hi ann|how are you|fine, thanks', 'ann (the sender) still sees it, and everything else', annSees.join('|'));
check((await db.query(`select count(*)::int n from public.messages where id = $1`, [m1])).rows[0].n === 1, 'the message itself is not deleted');
check((await rpc(ann, 'hide_message_for_me', m4)).success === true && (await msgs(ann, chat)).messages.length === 3, 'ann can remove a message from raj for herself too');
check((await rpc(raj, 'hide_message_for_me', m2)).success === true && (await msgs(raj, chat)).messages.map((m) => m.text).join('|') === 'how are you|fine, thanks', 'and one of his own, for himself');
check((await msgs(ann, chat)).messages.some((m) => m.text === 'hi ann'), 'ann still sees raj\'s own message that raj removed for himself');
check((await rpc(raj, 'hide_message_for_me', m1)).success === true && (await db.query(`select count(*)::int n from public.message_hides where user_id = $1 and message_id = $2`, [raj, m1])).rows[0].n === 1, 'deleting the same message twice is harmless');

section('3. The chat list');
const rajList = (await rpc(raj, 'my_chats')).find((c) => c.id === chat);
const annList = (await rpc(ann, 'my_chats')).find((c) => c.id === chat);
check(rajList.lastMessage.text === 'fine, thanks' && annList.lastMessage.text === 'how are you', 'the preview line is the latest message YOU can still see', `${rajList.lastMessage?.text} / ${annList.lastMessage?.text}`);
await db.query(`update public.chat_members set last_read_at = now() - interval '1 hour' where chat_id = $1`, [chat]);
await db.query(`delete from public.message_hides where user_id = $1`, [raj]);
const before = (await rpc(raj, 'my_chats')).find((c) => c.id === chat).unreadCount;
await rpc(raj, 'hide_message_for_me', m3);
await db.query(`update public.chat_members set last_read_at = now() - interval '1 hour' where chat_id = $1`, [chat]);
const after = (await rpc(raj, 'my_chats')).find((c) => c.id === chat).unreadCount;
check(before - after === 1, 'a message you deleted for yourself is not counted as unread', `${before} -> ${after}`);
await rpc(raj, 'hide_message_for_me', m1); await rpc(raj, 'hide_message_for_me', m2);
for (const id of [m3, m4]) await rpc(raj, 'hide_message_for_me', id);
check((await rpc(raj, 'my_chats')).find((c) => c.id === chat).lastMessage === null, 'when you have deleted every message, the preview is empty (the chat itself stays)');

section('4. A second device finds out');
await db.query(`delete from public.message_hides where user_id = $1`, [raj]);
const since = new Date(Date.now() - 5000).toISOString();
await rpc(raj, 'hide_message_for_me', m3);
const delta = await msgs(raj, chat, since);
check(delta.hiddenIds.includes(m3) && !delta.messages.some((m) => m.id === m3), 'a refresh after the removal lists it in hiddenIds and does not send it again', JSON.stringify(delta.hiddenIds));
check((await msgs(raj, chat, new Date(Date.now() + 3_600_000).toISOString())).hiddenIds.length === 0, 'and a refresh from a later moment has nothing to remove');
await db.query(`update public.messages set text = 'how are you today?' where id = $1`, [m3]);
check(!(await msgs(raj, chat, since)).messages.some((m) => m.id === m3), 'an edit by the sender does not bring the deleted message back');
check((await msgs(ann, chat, since)).messages.some((m) => m.id === m3), 'but ann, who did not delete it, gets the edit');

section('5. Who may do it');
await expectFail(() => rpc(eve, 'hide_message_for_me', m1), /not a participant/i, 'someone who is not in the chat can not touch it');
await expectFail(() => rpc(raj, 'hide_message_for_me', '00000000-0000-0000-0000-000000000000'), /Message not found/, 'a message that does not exist is refused');
await expectFail(() => asAnon(db, async () => db.query(`select public.hide_message_for_me($1)`, [m1])), /permission|denied|log in|not authenticated/i, 'a visitor who is not signed in can not');
await expectFail(() => asUser(db, raj, async () => db.query(`insert into public.message_hides (user_id, message_id, chat_id) values ($1, $2, $3)`, [raj, m4, chat])), /permission|denied|row-level/i, 'the table can not be written to directly');
const own = await asUser(db, raj, async () => (await db.query(`select user_id from public.message_hides`)).rows);
check(own.every((r) => r.user_id === raj), 'and a person can only ever read their own rows');
const lounge = (await db.query(`insert into public.chats (is_group, is_global_default, name) values (true, true, 'Lounge') returning id`)).rows[0].id;
const lm = (await db.query(`insert into public.messages (chat_id, sender_id, text) values ($1, $2, 'public hello') returning id`, [lounge, ann])).rows[0].id;
check((await rpc(eve, 'hide_message_for_me', lm)).success === true && !(await msgs(eve, lounge)).messages.some((m) => m.id === lm) && (await msgs(ann, lounge)).messages.some((m) => m.id === lm), 'in the public Lounge, anyone can hide a message for themselves too');
await db.query(`delete from public.messages where id = $1`, [m4]);
check((await db.query(`select count(*)::int n from public.message_hides where message_id = $1`, [m4])).rows[0].n === 0, 'when a message is deleted for everyone, the private notes about it go too');

section('6. The chat screen');
const view = read('src/components/Chat/ChatView.tsx');
check(/Delete for me/.test(view) && /handleDeleteForMe\(activeMessageMenu\.message\.id\)/.test(view), 'the message menu has "Delete for me"');
const menu = view.slice(view.indexOf('{activeMessageMenu && ('), view.indexOf('{/* Bottom Message Input Bar */}'));
const forMe = menu.indexOf('Delete for me');
const forAll = menu.indexOf('Delete for everyone');
check(forMe > -1 && forAll > forMe, 'it is offered on every message, before "Delete for everyone"');
const forMeBlock = menu.slice(menu.lastIndexOf('<button', forMe), forMe);
check(!/senderId/.test(forMeBlock.split('</button>').pop()), 'and it does not depend on who sent the message');
check(/hiddenIds/.test(view) && /hideMessageForMe/.test(view), 'the screen drops messages another device removed, and calls the database');
const api = read('src/services/supabaseApi.ts');
check(/export async function hideMessageForMe\(messageId: string\)/.test(api) && /rpc<\{ success: boolean \}>\('hide_message_for_me'/.test(api) && /export async function fetchMessageUpdates/.test(api), 'the app has the two calls');
check(/table: 'message_hides'/.test(api) && /chat-hides-/.test(api), 'a removal on one device refreshes the others straight away (on its own channel, so a database without the new table can not break chat updates)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
