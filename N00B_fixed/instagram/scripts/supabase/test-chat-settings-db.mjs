// Migration 20261018000005 on a REAL Postgres (PGlite) with every migration applied: the new chat settings are saved and checked, last seen is shown only when
// both sides allow it and only about people one is connected to, and "who can add me to groups" is kept.
// Usage: node --liftoff-only scripts/supabase/test-chat-settings-db.mjs
import { createTestDb, asUser } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const db = await createTestDb();
const mkUser = async (name) => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, name]);
  return id;
};
const rpc = async (uid, fn, ...args) => asUser(db, uid, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);
// "who is signed in" without giving up the right to write: what the server's own functions do (they run as the app's owner, and still see who asked)
const asClaim = async (uid, fn) => { await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false)`); try { return await fn(); } finally { await db.exec(`select set_config('request.jwt.claim.sub', '', false)`); } };
const fails = async (fn, pattern) => { try { await fn(); return false; } catch (e) { return pattern.test(e.message); } };

const ann = await mkUser('ann'), raj = await mkUser('raj'), eve = await mkUser('eve'), zed = await mkUser('zed');
const ago = (mins) => new Date(Date.now() - mins * 60000).toISOString();
for (const [u, m] of [[ann, 5], [raj, 90], [eve, 600], [zed, 3000]]) await db.query(`insert into public.profile_private (user_id, last_seen_at) values ($1, $2) on conflict (user_id) do update set last_seen_at = excluded.last_seen_at`, [u, ago(m)]);
const follow = (a, b) => db.query(`insert into public.follows (follower_id, followee_id) values ($1, $2) on conflict do nothing`, [a, b]);
const dm = async (a, b) => { const c = (await db.query(`insert into public.chats (is_group) values (false) returning id`)).rows[0].id; await db.query(`insert into public.chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`, [c, a, b]); return c; };
await dm(ann, raj);            // ann and raj share a chat
await follow(ann, eve);        // ann follows eve

section('1. The settings');
let s = (await rpc(ann, 'my_settings')).settings;
check(s['chat.lastSeen'] === 'everyone' && s['chat.typing'] === true && s['chat.fontSize'] === 'medium' && s['chat.autoLoad'] === 'always' && s['chat.wallpaper'] === 'doodle', 'every person starts with the same sensible choices');
const chatKeys = Object.keys(s).filter((k) => k.startsWith('chat.'));
check(chatKeys.length === 16, 'sixteen new chat settings', String(chatKeys.length));
check((await rpc(ann, 'set_my_settings', { 'chat.fontSize': 'large', 'chat.compactList': true, 'chat.timeFormat': '24h', 'chat.autoLoad': 'wifi' })).settings['chat.fontSize'] === 'large', 'they are saved');
check(await fails(() => rpc(ann, 'set_my_settings', { 'chat.fontSize': 'huge' }), /not allowed/), 'a choice that does not exist is refused');
check(await fails(() => rpc(ann, 'set_my_settings', { 'chat.typing': 'yes' }), /not valid/), 'and so is the wrong kind of value');
check(await fails(() => rpc(ann, 'set_my_settings', { 'chat.nope': true }), /not a setting/), 'and a setting that is not on the list');
await rpc(ann, 'set_my_settings', { 'chat.fontSize': 'medium', 'chat.compactList': false, 'chat.timeFormat': '12h', 'chat.autoLoad': 'always' });
check((await rpc(ann, 'my_settings')).settings['msg.readReceipts'] === true && (await rpc(ann, 'my_settings')).settings['notif.quiet'].on === false, 'the older settings are all still there');

section('2. Last seen');
const seenOf = (list, id) => (list.find((x) => x.userId === id) || {}).lastSeenAt;
let r = await rpc(ann, 'chat_last_seen', [raj, eve, zed]);
check(!!seenOf(r, raj) && !!seenOf(r, eve), 'ann sees when raj (a chat together) and eve (she follows) were last seen');
check(seenOf(r, zed) === null && r.some((x) => x.userId === zed), 'but nothing about zed, a stranger');
await rpc(raj, 'set_my_settings', { 'chat.lastSeen': 'nobody' });
r = await rpc(ann, 'chat_last_seen', [raj]);
check(seenOf(r, raj) === null, 'raj hides his last seen: ann does not get it');
await rpc(raj, 'set_my_settings', { 'chat.lastSeen': 'contacts' });
r = await rpc(ann, 'chat_last_seen', [raj]);
check(seenOf(r, raj) === null, '"contacts only": ann shares a chat with raj but does not follow him, so no');
await follow(ann, raj);
r = await rpc(ann, 'chat_last_seen', [raj]);
check(!!seenOf(r, raj), 'once ann follows him, she does');
await rpc(raj, 'set_my_settings', { 'chat.lastSeen': 'everyone' });
await rpc(ann, 'set_my_settings', { 'chat.lastSeen': 'nobody' });
r = await rpc(ann, 'chat_last_seen', [raj, eve]);
check(seenOf(r, raj) === null && seenOf(r, eve) === null, 'ann hides hers: she does not see anybody\'s either');
await rpc(ann, 'set_my_settings', { 'chat.lastSeen': 'everyone' });
check((await rpc(ann, 'chat_last_seen', [ann])).length === 0, 'asking about yourself gives nothing');
check((await rpc(ann, 'chat_last_seen', null)).length === 0, 'asking about nobody gives nothing');
let denied = false;
try { await db.exec(`set role anon`); await db.query(`select public.chat_last_seen($1)`, [[raj]]); } catch (e) { denied = /permission denied/.test(e.message); } finally { await db.exec(`reset role`); }
check(denied, 'someone who is not signed in can not ask');

section('3. Who can add me to a group');
const group = async (adder, members) => {
  const c = (await db.query(`insert into public.chats (is_group, name) values (true, 'g') returning id`)).rows[0].id;
  await db.query(`insert into public.chat_members (chat_id, user_id) values ($1, $2)`, [c, adder]);
  for (const m of members) await asClaim(adder, async () => db.query(`insert into public.chat_members (chat_id, user_id) values ($1, $2)`, [c, m]));
  return (await db.query(`select user_id from public.chat_members where chat_id = $1`, [c])).rows.map((x) => x.user_id);
};
let inGroup = await group(ann, [raj, eve, zed]);
check([raj, eve, zed].every((u) => inGroup.includes(u)), 'by default anyone can be added');
await rpc(zed, 'set_my_settings', { 'chat.groupAdds': 'nobody' });
await rpc(eve, 'set_my_settings', { 'chat.groupAdds': 'contacts' });
inGroup = await group(ann, [raj, eve, zed]);
check(inGroup.includes(raj) && inGroup.includes(eve) && !inGroup.includes(zed), 'zed (nobody) is left out; eve (contacts) is in because ann follows her; the others are added');
await db.query(`delete from public.follows where follower_id = $1 and followee_id = $2`, [ann, eve]);
inGroup = await group(ann, [eve]);
check(!inGroup.includes(eve), 'eve (contacts) is left out once ann is not connected to her');
const own = (await db.query(`insert into public.chats (is_group, name) values (true, 'zed own') returning id`)).rows[0].id;
await asClaim(zed, async () => db.query(`insert into public.chat_members (chat_id, user_id) values ($1, $2)`, [own, zed]));
check((await db.query(`select 1 from public.chat_members where chat_id = $1 and user_id = $2`, [own, zed])).rows.length === 1, 'zed can always make or join a group himself');
const lounge = (await db.query(`select id from public.chats where is_global_default`)).rows[0].id;
await asClaim(ann, async () => db.query(`insert into public.chat_members (chat_id, user_id) values ($1, $2) on conflict do nothing`, [lounge, zed]));
check((await db.query(`select 1 from public.chat_members where chat_id = $1 and user_id = $2`, [lounge, zed])).rows.length === 1, 'the Global Lounge is for everyone, whatever this says');
const dm2 = (await db.query(`insert into public.chats (is_group) values (false) returning id`)).rows[0].id;
await asClaim(ann, async () => db.query(`insert into public.chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`, [dm2, ann, zed]));
check((await db.query(`select count(*)::int n from public.chat_members where chat_id = $1`, [dm2])).rows[0].n === 2, 'a one-to-one chat is not a group (who can message me covers it)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
