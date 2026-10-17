// Tests migration 20261018000003: what happened before a person arrived is not shown to them (notifications before their account was made; chat
// messages before they joined that chat), while everyone who was already here keeps everything. On a REAL Postgres (PGlite) with every migration applied.
//
// Usage: node scripts/supabase/test-history-starts-at-join.mjs
import fs from 'node:fs';
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);

const db = await createTestDb();
const mkUser = async (name, patch = {}) => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  const has = (await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length;
  if (!has) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, name]);
  for (const [col, val] of Object.entries(patch)) await db.query(`update public.profiles set ${col} = $2 where id = $1`, [id, val]);
  return id;
};
const rpc = async (uid, fn, ...args) => asUser(db, uid, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);
const texts = (res) => (res.messages || []).map((m) => m.text);
const startsAt = (await db.query(`select starts_at from public.history_rules`)).rows[0].starts_at;
const at = (secondsFromNow) => new Date(Date.now() + secondsFromNow * 1000).toISOString();
const beforeRule = new Date(new Date(startsAt).getTime() - 86400000).toISOString();   // a day before the rule began

// people: "veteran" was here before the rule began, "newbie" made their account after it
const veteran = await mkUser('veteran');
await db.query(`update public.profiles set created_at = $2 where id = $1`, [veteran, beforeRule]);
const newbie = await mkUser('newbie');
await db.query(`update public.profiles set created_at = $2 where id = $1`, [newbie, at(0)]);
const friend = await mkUser('friend');
await db.query(`update public.profiles set created_at = $2 where id = $1`, [friend, beforeRule]);

const say = (chat, sender, text, when) => db.query(`insert into public.messages (chat_id, sender_id, text, created_at) values ($1, $2, $3, $4)`, [chat, sender, text, when]);

section('1. The rule starts when the migration is run, and only once');
check(startsAt instanceof Date || typeof startsAt === 'string', 'the start time is recorded');
const sql = fs.readFileSync('supabase/migrations/20261018000003_history_starts_at_join.sql', 'utf8');
await db.exec(sql);
const again = (await db.query(`select starts_at from public.history_rules`)).rows[0].starts_at;
check(String(again) === String(startsAt), 'running the migration again does not move the start time (nobody who was here is ever cut off later)');
check((await db.query(`select count(*)::int n from public.history_rules`)).rows[0].n === 1, 'one row only');

section('2. Notifications: a new person does not see the ones from before they joined');
await db.query(`insert into public.notifications (target_user_id, type, title, message, created_at) values (null, 'admin_broadcast', 'Old news', 'sent last week', $1)`, [at(-3600)]);
await db.query(`insert into public.notifications (target_user_id, type, title, message, created_at) values (null, 'admin_broadcast', 'Fresh news', 'sent after they joined', $1)`, [at(5)]);
await db.query(`insert into public.notifications (target_user_id, type, title, message, created_at) values ($1, 'admin_direct', 'Hello you', 'personal', $2)`, [newbie, at(6)]);
let veteranN = (await rpc(veteran, 'my_notifications')).notifications.map((n) => n.title);
let newbieN = (await rpc(newbie, 'my_notifications')).notifications.map((n) => n.title);
check(veteranN.includes('Old news') && veteranN.includes('Fresh news'), 'a person who was already here still sees everything', veteranN.join('|'));
check(!newbieN.includes('Old news'), 'a new person does not see the notification from before they joined', newbieN.join('|'));
check(newbieN.includes('Fresh news') && newbieN.includes('Hello you'), 'but sees the ones that came after (broadcast and personal)', newbieN.join('|'));

section('3. The Global Lounge counts from the day the account was made');
const lounge = (await db.query(`select id from public.chats where is_global_default`)).rows[0].id;
await say(lounge, veteran, 'lounge: before newbie', at(-3600));
await say(lounge, veteran, 'lounge: after newbie', at(10));
check(texts(await rpc(veteran, 'chat_messages', lounge)).join('|') === 'lounge: before newbie|lounge: after newbie', 'the veteran reads the whole lounge');
check(texts(await rpc(newbie, 'chat_messages', lounge)).join('|') === 'lounge: after newbie', 'the new person reads only what came after they joined NOOB', texts(await rpc(newbie, 'chat_messages', lounge)).join('|'));
check(texts(await rpc(newbie, 'chat_messages', lounge, 300, at(-7200))).join('|') === 'lounge: after newbie', 'a refresh that asks for "everything changed since long ago" does not leak it either');

section('4. A group counts from the day the person joined it');
const g = (await db.query(`insert into public.chats (is_group, name) values (true, 'crew') returning id`)).rows[0].id;
await db.query(`insert into public.chat_members (chat_id, user_id, joined_at) values ($1, $2, $3), ($1, $4, $3)`, [g, veteran, beforeRule, friend]);
await say(g, veteran, 'group: early', at(-7200));
await say(g, friend, 'group: also early', at(-3600));
await db.query(`insert into public.chat_members (chat_id, user_id, joined_at) values ($1, $2, $3)`, [g, newbie, at(0)]);   // added to the group "now"
await say(g, veteran, 'group: welcome', at(20));
await say(g, friend, 'group: later', at(30));
check(texts(await rpc(veteran, 'chat_messages', g)).length === 4, 'the people who were already in the group read all four messages');
check(texts(await rpc(newbie, 'chat_messages', g)).join('|') === 'group: welcome|group: later', 'the person added now reads only the two after they joined', texts(await rpc(newbie, 'chat_messages', g)).join('|'));
check(texts(await rpc(newbie, 'chat_messages', g, 1)).join('|') === 'group: later', 'the message limit still works');

section('5. An old membership is never cut, even if the rows say it began later than the messages');
// (accounts imported from the old system have a join date of the import day, which is later than their old messages)
const oldGroup = (await db.query(`insert into public.chats (is_group, name) values (true, 'imported') returning id`)).rows[0].id;
await db.query(`insert into public.chat_members (chat_id, user_id, joined_at) values ($1, $2, $3)`, [oldGroup, friend, beforeRule]);
await say(oldGroup, friend, 'imported: from two days before', new Date(new Date(startsAt).getTime() - 2 * 86400000).toISOString());
check(texts(await rpc(friend, 'chat_messages', oldGroup)).join('|') === 'imported: from two days before', 'a member from before the rule still reads messages older than their join date');

section('6. The chat list and the unread numbers agree');
const list = await rpc(newbie, 'my_chats');
const gl = list.find((c) => c.id === g);
check(gl && gl.lastMessage && gl.lastMessage.text === 'group: later', 'the last-message line is a message the person may see');
check(gl && gl.unreadCount === 2, 'only the two messages after they joined count as unread', String(gl && gl.unreadCount));
const loungeRow = list.find((c) => c.id === lounge);
check(loungeRow && loungeRow.unreadCount === 1, 'the Lounge counts one unread for the new person (the veteran has two)', String(loungeRow && loungeRow.unreadCount));
const flist = await rpc(friend, 'my_chats');
check(flist.find((c) => c.id === lounge).unreadCount === 2, 'a person who was already here has both Lounge messages unread', String(flist.find((c) => c.id === lounge).unreadCount));
const sum = await rpc(newbie, 'my_unread_chat_summary');
const sumVet = await rpc(friend, 'my_unread_chat_summary');
check(sum.unreadMessages === list.filter((c) => !c.isAi).reduce((s, c) => s + c.unreadCount, 0), 'the bottom-bar badge equals the sum over the list', JSON.stringify(sum));
check(sumVet.unreadMessages >= 4, 'a person who was already here still counts every message they have not read', JSON.stringify(sumVet));

section('7. Only the people who may');
let denied = false;
try { await asAnon(db, async () => db.query(`select public.history_start($1, $2)`, [g, newbie])); } catch (e) { denied = /permission denied/.test(e.message); }
check(denied, 'someone not signed in can not ask');
denied = false;
try { await asUser(db, newbie, async () => db.query(`select * from public.history_rules`)); } catch (e) { denied = /permission denied/.test(e.message); }
check(denied, 'nobody can read or change the rule table from the app');
const outsider = await mkUser('outsider');
let blocked = false;
try { await rpc(outsider, 'chat_messages', g); } catch (e) { blocked = /not a participant/.test(e.message); }
check(blocked, 'a person who is not in the group still can not open it');
check((await db.query(`select count(*)::int n from public.messages where chat_id = $1`, [g])).rows[0].n === 4, 'nothing was deleted: all four messages are still in the database');
check((await db.query(`select count(*)::int n from public.notifications`)).rows[0].n >= 3, 'and all notifications too');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
