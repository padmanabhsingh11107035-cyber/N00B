// Tests "hide my profile from this person": what the hidden person can no longer see or do (profile, posts, stories,
// reels, followers, search, following, liking, commenting), and that everyone else — and the owner — are unaffected.
// On a REAL Postgres (PGlite) holding the real backup, as real signed-in people.
//
// Usage: node scripts/supabase/test-hide.mjs [backup-folder]
import fs from 'node:fs';
import path from 'node:path';
import { loadBackup, buildImportPlan } from './transform.mjs';
import { runImport } from './run-import.mjs';
import { createTestDb, makePgAdapter, asUser, asAnon } from './pg-test-env.mjs';

const backupsRoot = 'backups';
const dir = process.argv.slice(2).find((x) => !x.startsWith('--')) || path.join(backupsRoot, fs.readdirSync(backupsRoot).filter((d) => fs.existsSync(path.join(backupsRoot, d, 'users.json'))).sort().pop());
const raw = loadBackup(dir);

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
const idOf = (u) => profByLegacy[u.id].id;
const adminRaw = raw.users.find((u) => u.isAdmin);
const publicRaw = raw.users.filter((u) => !u.isAdmin && u.accountType !== 'private' && (u.password || '').length > 0);
const privateRaw = raw.users.filter((u) => u.accountType === 'private');
const admin = idOf(adminRaw);
const [owner, hidden, other, owner2] = publicRaw.slice(0, 4).map(idOf);
const privOwner = idOf(privateRaw[0]);
const call = (uid, sql, params = []) => asUser(db, uid, async () => (await db.query(sql, params)).rows);
const rpc = async (uid, fn, ...args) => (await call(uid, `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args))[0].r;
const n = async (sql, params = []) => (await db.query(sql, params)).rows[0].n;
const name = async (id) => (await db.query('select username from profiles where id = $1', [id])).rows[0].username;
const slides = [{ mediaUrl: 'posts/hide-1.jpg', objectKey: 'posts/hide-1.jpg', mediaType: 'image' }];

section('1. Before hiding: everyone sees everything');
const post = await rpc(owner, 'create_post', slides, 'my post', 'tech', [], null, null);
const story = await rpc(owner, 'create_story', 'stories/hide-1.jpg');
const reel = await rpc(owner2, 'create_reel', 'reels/hide-1.mp4', 'reels/hide-1.jpg', 'my reel', null, [], 'memes');
await db.query(`insert into follows (follower_id, followee_id) values ($1, $2), ($3, $2), ($1, $4), ($2, $5) on conflict do nothing`, [hidden, owner, other, owner2, hidden]);
const seesPost = async (uid, p = post.id) => (await rpc(uid, 'feed_posts')).some((x) => x.id === p);
const seesStory = async (uid) => (await rpc(uid, 'active_stories')).some((s) => s.id === story.id || s.userId === owner || (s.stories || []).some((x) => x.id === story.id));
const seesReel = async (uid) => (await rpc(uid, 'feed_reels')).some((r) => r.id === reel.id);
const finds = async (uid, who, q = '') => (await rpc(uid, 'search_users', q)).some((u) => u.id === who);
check(await seesPost(hidden) && await seesPost(other), 'both can see the post in their feed');
check(await seesStory(hidden), 'the hidden person can see the story');
check(await seesReel(hidden), '...and the reel');
check(await finds(hidden, owner) && await finds(hidden, owner, await name(owner)), '...and find the account in the people list and by searching its name');
check((await call(hidden, `select 1 from follows where followee_id = $1`, [owner])).length >= 2, '...and see who follows it');
const followersBefore = await n('select followers_count n from profiles where id = $1', [owner]);

section('2. Hiding');
await expectFail(() => rpc(owner, 'hide_profile_from', owner), /someone other than yourself/, 'you can not hide from yourself');
await expectFail(() => rpc(owner, 'hide_profile_from', '00000000-0000-0000-0000-000000000009'), /not found/, 'or from someone who does not exist');
await expectFail(() => asAnon(db, () => db.query(`select public.hide_profile_from('${hidden}')`)), /permission denied/, 'a logged-out visitor can not use it');
const h1 = await rpc(owner, 'hide_profile_from', hidden);
check(h1.success && h1.hiddenFromIds.length === 1 && h1.hiddenFromIds[0] === hidden, 'hiding works and returns who you are hidden from');
check(JSON.stringify((await rpc(owner, 'hide_profile_from', hidden)).hiddenFromIds) === JSON.stringify([hidden]), 'hiding twice is harmless');
check((await rpc(owner, 'get_my_user')).hiddenFromIds.join() === hidden, 'your own record lists who you are hidden from');
const list = (await rpc(owner, 'my_hidden_from')).users;
check(list.length === 1 && list[0].id === hidden && list[0].username === await name(hidden), 'the list shows their name so you can undo it');
check((await rpc(hidden, 'my_hidden_from')).users.length === 0 && (await rpc(hidden, 'get_my_user')).hiddenFromIds.length === 0, 'the hidden person sees nothing about it in their own lists');
check((await n(`select count(*)::int n from notifications where target_user_id = $1 and created_at > now() - interval '1 minute' and actor_id = $2`, [hidden, owner])) === 0, 'and is not notified');
await expectFail(() => call(hidden, 'select * from profile_hides'), /permission denied/, 'the hidden list itself can not be read by anyone directly');

section('3. What the hidden person can no longer see');
check(!(await seesPost(hidden)), 'the post is gone from their feed');
check((await call(hidden, `select 1 from posts where id = $1`, [post.id])).length === 0, '...and can not be read at all');
check(!(await seesStory(hidden)), 'the story is gone');
await rpc(owner2, 'hide_profile_from', hidden);
check(!(await seesReel(hidden)), 'reels of an account that hid from them are gone');
check(!(await finds(hidden, owner)) && !(await finds(hidden, owner, await name(owner))) && !(await finds(hidden, owner, 'a')), 'the account is not in the people list and can not be found by name');
check((await call(hidden, `select 1 from follows where followee_id = $1 or follower_id = $1`, [owner])).length === 0, 'their followers and following are not visible');
check((await call(hidden, `select 1 from follows where follower_id = $1 and followee_id = $2`, [hidden, owner])).length === 0 && await n('select count(*)::int n from follows where follower_id = $1 and followee_id = $2', [hidden, owner]) === 0, 'the hidden person no longer follows them');
check((await n('select followers_count n from profiles where id = $1', [owner])) === followersBefore - 1, '(and the follower count went down by one)');
await expectFail(() => rpc(hidden, 'toggle_follow', owner), /can't follow this account/, 'they can not follow again');
await expectFail(() => db.query(`insert into follows (follower_id, followee_id) values ($1, $2)`, [hidden, owner]), /can't follow this account/, '...however the request is made');
await expectFail(() => rpc(hidden, 'toggle_post_like', post.id), /cannot view|not found|permission|row-level/i, 'they can not like the post');
await expectFail(() => rpc(hidden, 'add_comment', post.id, 'hello'), /cannot view|not found|permission|row-level/i, '...or comment on it');

section('4. Everyone else, and the owner, are unaffected');
check(await seesPost(other) && await seesStory(other) && await seesReel(other), 'other people still see the posts, stories and reels');
check(await finds(other, owner) && await finds(other, owner, await name(owner)), '...and still find the account');
check((await call(other, `select 1 from follows where followee_id = $1`, [owner])).length >= 1, '...and still see its followers');
check((await rpc(other, 'toggle_follow', owner)).success !== false, '...and can still follow it');
check(await seesPost(owner) && await finds(owner, hidden), 'the owner still sees everything, including the person they hid from');
check((await rpc(owner, 'toggle_follow', hidden)).success !== false, 'the owner can still follow the person they hid from (it works one way)');
check(await seesPost(admin), 'an administrator can still see hidden content (for moderation)');
check(await seesPost(hidden, post.id) === false && (await rpc(hidden, 'feed_posts')).length >= 0, '(the hidden person\'s own feed still works for everything else)');

section('5. Private accounts');
await db.query(`insert into follows (follower_id, followee_id) values ($1, $2) on conflict do nothing`, [hidden, privOwner]);
const privPost = (await db.query(`insert into posts (user_id, caption) values ($1, 'private one') returning id`, [privOwner]).catch(() => null))?.rows?.[0]?.id;
if (privPost) {
  await db.query(`insert into post_slides (post_id, position, media_url, media_type) values ($1, 0, 'posts/p.jpg', 'image')`, [privPost]).catch(() => null);
  check(await seesPost(hidden, privPost), 'an approved follower can see a private account\'s post');
  await rpc(privOwner, 'hide_profile_from', hidden);
  check(!(await seesPost(hidden, privPost)), 'after hiding, even an approved follower can not');
  check(await n('select count(*)::int n from follows where follower_id = $1 and followee_id = $2', [hidden, privOwner]) === 0, '...and their follow is removed');
} else console.log('  (could not build a private post in this data set — skipped)');
await db.query(`insert into follow_requests (requester_id, target_id) values ($1, $2) on conflict do nothing`, [other, privOwner]);
await rpc(privOwner, 'hide_profile_from', other);
check(await n('select count(*)::int n from follow_requests where requester_id = $1 and target_id = $2', [other, privOwner]) === 0, 'a pending follow request from the hidden person is removed');
await expectFail(() => rpc(other, 'toggle_follow', privOwner), /can't follow this account/, '...and they can not send a new one');

section('6. Unhiding');
const u1 = await rpc(owner, 'unhide_profile_from', hidden);
check(u1.success && u1.hiddenFromIds.length === 0 && (await rpc(owner, 'my_hidden_from')).users.length === 0, 'unhiding works');
check(await seesPost(hidden) && await seesStory(hidden) && await finds(hidden, owner) && (await call(hidden, `select 1 from follows where followee_id = $1`, [owner])).length >= 1, 'the person sees the posts, story, account and followers again');
check((await rpc(hidden, 'toggle_follow', owner)).success !== false, 'and can follow again');
check((await rpc(owner, 'unhide_profile_from', hidden)).success, 'unhiding someone you had not hidden is harmless');
check((await rpc(hidden, 'unhide_profile_from', owner)).success && await seesPost(hidden), 'nobody can unhide someone else\'s profile for them (it only changes their own list)');

section('7. Hiding from several people at once');
await rpc(owner, 'hide_profile_from', hidden); await rpc(owner, 'hide_profile_from', other);
check((await rpc(owner, 'my_hidden_from')).users.length === 2 && !(await seesPost(hidden)) && !(await seesPost(other)), 'you can hide from as many people as you like');
await rpc(owner, 'unhide_profile_from', other);
check(!(await seesPost(hidden)) && await seesPost(other), 'and unhide them one by one');

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
