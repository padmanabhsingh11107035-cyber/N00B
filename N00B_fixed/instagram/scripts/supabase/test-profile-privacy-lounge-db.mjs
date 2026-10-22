// Migration 20261022000005: (1) other people can no longer read when somebody's NOOB Pro renews, how they pay or which shop items they bought, while the person themselves still
// gets all of it and every screen that lists people keeps working; (2) the Live Lounge tables can be read again (their rules used to loop: "infinite recursion detected in policy").
// On a REAL Postgres (PGlite): the database is built up to the migration before this one (to show the problem), then the migration is applied. Usage: node --liftoff-only scripts/supabase/test-profile-privacy-lounge-db.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createTestDb, asUser, MIGRATIONS_DIR } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const MIG = '20261022000005_profile_privacy_and_lounge_rls.sql';
const db = await createTestDb({ upTo: '20261022000004_security_hardening.sql' });
const mkUser = async (name) => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, extensions.crypt('secret pass', extensions.gen_salt('bf')))`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length) await db.query(`insert into public.profiles (id, username, display_name, bio) values ($1, $2, $3, 'hello')`, [id, name, name]);
  await db.query(`insert into public.profile_private (user_id, email) values ($1, $2) on conflict (user_id) do nothing`, [id, `${name}@example.com`]);
  return id;
};
const ann = await mkUser('ann'), bob = await mkUser('bob'), cat = await mkUser('cat'), dan = await mkUser('dan');
const as = (uid, sql, args = []) => asUser(db, uid, async () => (await db.query(sql, args)).rows);
const fails = async (uid, sql, args = []) => { try { await as(uid, sql, args); return null; } catch (e) { return e.message; } };

// a room hosted by ann: bob is admitted, cat is waiting, dan is not in it
const room = (await db.query(`insert into public.live_lounge_rooms (host_id, title, room_code, channel_name) values ($1, 'Team', 'ABC123', 'chan-abc') returning id`, [ann])).rows[0].id;
await db.query(`insert into public.live_lounge_room_participants (room_id, user_id, role, status) values ($1, $2, 'host', 'admitted'), ($1, $3, 'participant', 'admitted'), ($1, $4, 'participant', 'waiting')`, [room, ann, bob, cat]);
await db.query(`insert into public.live_lounge_room_chat (room_id, sender_id, text) values ($1, $2, 'hello room')`, [room, ann]);
// what Pro and the shop keep about ann
await db.query(`update public.profiles set pro_tier = 'pro', pro_billing = 'yearly', pro_auto_renew = true, pro_renews_at = now() + interval '300 days', purchased_item_ids = '{"item-1","item-2"}' where id = $1`, [ann]);
const post = (await db.query(`insert into public.posts (user_id, caption) values ($1, 'a post') returning id`, [ann])).rows[0].id;
await db.query(`insert into public.post_likes (post_id, user_id) values ($1, $2)`, [post, bob]);

section('1. Before the migration (the problem)');
check(/infinite recursion/i.test(await fails(ann, `select * from public.live_lounge_rooms`) || ''), 'Live Lounge: reading the rooms fails with "infinite recursion"');
check(/infinite recursion/i.test(await fails(bob, `select * from public.live_lounge_room_participants`) || ''), 'and the participants');
check((await as(bob, `select pro_renews_at, purchased_item_ids from public.profiles where id = $1`, [ann]))[0].purchased_item_ids.length === 2, 'Profiles: bob can read ann\'s Pro renewal date and shop purchases');

await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, MIG), 'utf8'));

section('2. Live Lounge after the migration');
check((await as(ann, `select id from public.live_lounge_rooms`)).length === 1, 'the host sees their room');
check((await as(bob, `select id from public.live_lounge_rooms`)).length === 1 && (await as(cat, `select id from public.live_lounge_rooms`)).length === 1, 'an admitted person and a person waiting in the room see the room');
check((await as(dan, `select id from public.live_lounge_rooms`)).length === 0, 'somebody who is not in it sees nothing (a room stays private)');
check((await as(ann, `select user_id from public.live_lounge_room_participants`)).length === 3, 'the host sees everyone who joined');
const bobRows = await as(bob, `select user_id from public.live_lounge_room_participants`);
check(bobRows.length === 1 && bobRows[0].user_id === bob, 'a participant sees only their own row');
check((await as(dan, `select user_id from public.live_lounge_room_participants`)).length === 0, 'an outsider sees no participants');
check((await as(ann, `select id from public.live_lounge_room_chat`)).length === 1 && (await as(bob, `select id from public.live_lounge_room_chat`)).length === 1, 'the host and an admitted person read the room chat');
check((await as(cat, `select id from public.live_lounge_room_chat`)).length === 0 && (await as(dan, `select id from public.live_lounge_room_chat`)).length === 0, 'a person still waiting, and an outsider, do not');
check((await db.query(`select has_function_privilege('anon', 'public.lounge_is_host(uuid)', 'execute') a, has_function_privilege('authenticated', 'public.lounge_is_host(uuid)', 'execute') b`)).rows[0].a === false, 'and are closed to visitors who are not logged in');

section('3. Profile privacy after the migration');
for (const col of ['pro_billing', 'pro_auto_renew', 'pro_renews_at', 'purchased_item_ids']) {
  check(/permission denied/i.test(await fails(bob, `select ${col} from public.profiles where id = $1`, [ann]) || ''), `another person cannot read ${col}`);
}
check(/permission denied/i.test(await fails(bob, `select * from public.profiles`) || ''), '"select *" on profiles is refused (the app always asks for named columns)');
const open = (await as(bob, `select id, username, display_name, avatar, bio, account_type, is_verified, is_admin, is_suspended, noob_points, pro_tier, followers_count, created_at from public.profiles where id = $1`, [ann]))[0];
check(open && open.username === 'ann' && open.pro_tier === 'pro' && open.bio === 'hello', 'every other column is still readable (name, photo, bio, badge, Pro level, counts)');
check((await db.query(`select count(*)::int n from information_schema.columns where table_schema='public' and table_name='profiles' and not has_column_privilege('authenticated', 'public.profiles', column_name, 'select')`)).rows[0].n === 4, 'exactly those four columns are closed');
const mine = (await as(ann, `select public.get_my_user() as u`))[0].u;
check(mine && mine.username === 'ann' && mine.proBilling === 'yearly' && mine.proAutoRenew === true && !!mine.proRenewsAt && mine.purchasedItemIds.length === 2 && mine.email === 'ann@example.com', 'the person themselves still gets all of it, with their private details (get_my_user)');
check((await as(bob, `select public.get_my_user() as u`))[0].u.username === 'bob', 'and each person gets their own record, nobody else\'s');
const seen = (await as(bob, `select public.user_by_id($1) as u`, [ann]))[0].u;
check(seen && seen.username === 'ann' && !('proRenewsAt' in seen) && !('purchasedItemIds' in seen) && !('proBilling' in seen), 'what bob is shown of ann (user_by_id) has none of it');
const people = (await as(bob, `select public.search_users('') as u`))[0].u;
check(Array.isArray(people) && people.length === 4 && people.every((p) => !('proRenewsAt' in p)), 'the people list (search_users) still works and lists everyone');
check((await as(bob, `select public.search_users('ann') as u`))[0].u.length === 1, 'searching by name still works');
const likers = (await as(ann, `select public.post_likers($1) as u`, [post]))[0].u;
check(likers.users.length === 1 && likers.users[0].username === 'bob' && likers.users[0].isFollowing === false, 'the list of people who liked a post still works');
check((await as(bob, `update public.profiles set bio = 'new bio' where id = $1 returning bio`, [bob]))[0].bio === 'new bio', 'a person can still change their own profile');
check((await db.query(`select pro_renews_at is not null as p, purchased_item_ids is not null as i from public.profiles where id = $1`, [ann])).rows[0].p, 'nothing was lost: the data is all still there');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
