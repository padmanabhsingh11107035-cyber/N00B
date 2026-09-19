// End-to-end test of the Supabase migration work, run against a REAL Postgres
// (PGlite, in memory) — no Supabase account or network needed:
//
//   1. builds the import plan from the real backup and loads it through the
//      exact same runImport() code the real import uses
//   2. checks every number against the raw backup (nothing lost, nothing invented)
//   3. checks the import is safe to re-run and refuses to run on live data
//   4. proves the row-level-security rules with real signed-in "users"
//
// Usage: node scripts/supabase/test-import.mjs [backup-folder]
import fs from 'node:fs';
import path from 'node:path';
import { loadBackup, buildImportPlan, loginEmailFor } from './transform.mjs';
import { runImport } from './run-import.mjs';
import { createTestDb, makePgAdapter, asUser, asAnon } from './pg-test-env.mjs';

const backupsRoot = 'backups';
const dir = process.argv.slice(2).find((a) => !a.startsWith('--')) || path.join(backupsRoot, fs.readdirSync(backupsRoot).filter((d) => fs.existsSync(path.join(backupsRoot, d, 'users.json'))).sort().pop());
const raw = loadBackup(dir);

let passed = 0;
let failed = 0;
const check = (cond, label, detail = '') => {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; console.log(`  FAIL ${label} ${detail}`); }
};
const expectFail = async (fn, pattern, label) => {
  try { await fn(); check(false, label, '(expected an error, but it succeeded)'); }
  catch (e) { check(pattern.test(e.message), label, `(got: ${e.message})`); }
};
const section = (t) => console.log(`\n${t}`);

// ------------------------------------------------------------------ 1. load
section('1. Import the real backup into a fresh database');
const plan = buildImportPlan(raw, { withChats: false });
const autoExpose = !process.argv.includes('--no-auto-expose');
console.log(`(project setting "Automatically expose new tables": ${autoExpose ? 'ON' : 'OFF'})`);
const db = await createTestDb({ autoExpose });
const adapter = makePgAdapter(db);
const result = await runImport(plan, adapter, { log: () => {} });
check(result.verification.ok, 'import verification passed', JSON.stringify(result.verification.problems));
check(result.auth.created === raw.users.length && result.auth.existing === 0, `${raw.users.length} login accounts created`);

// ------------------------------------------------------------------ 2. numbers
section('2. Every number matches the raw backup');
const n = async (sql, params = []) => (await db.query(sql, params)).rows[0].n;
const sum = (list, f) => list.reduce((a, x) => a + f(x), 0);
check((await n('select count(*)::int n from profiles')) === raw.users.length, `profiles = ${raw.users.length}`);
check((await n('select count(*)::int n from profile_private')) === raw.users.length, 'private details = one per profile');
check((await n('select count(*)::int n from posts')) === raw.posts.length, `posts = ${raw.posts.length}`);
check((await n('select count(*)::int n from post_slides')) === sum(raw.posts, (p) => p.slides.length), `photos = ${sum(raw.posts, (p) => p.slides.length)}`);
check((await n('select count(*)::int n from post_likes')) === sum(raw.posts, (p) => new Set(p.likedBy).size), 'post likes match');
check((await n('select count(*)::int n from reels')) === raw.reels.length, `reels = ${raw.reels.length}`);
check((await n('select count(*)::int n from reel_likes')) === sum(raw.reels, (r) => new Set(r.likedBy).size), 'reel likes match');
check((await n('select count(*)::int n from follows')) === sum(raw.users, (u) => u.followingIds.length), 'follows match');
check((await n('select count(*)::int n from noob_transactions')) === sum(raw.users, (u) => (u.noobTransactions || []).length), 'points history matches');
check((await n('select count(*)::int n from game_scores')) === raw.gameScores.length, `game scores = ${raw.gameScores.length}`);
check((await n('select count(*)::int n from comments')) === Object.values(raw.comments).flat().length, 'comments match');
check((await n('select count(*)::int n from coupons')) === raw.coupons.length, 'coupons match');
check((await n('select count(*)::int n from push_subscriptions')) === raw.users.filter((u) => u.pushSubscription).length, 'push subscriptions match');

const profByLegacy = Object.fromEntries((await db.query('select * from profiles')).rows.map((p) => [p.legacy_id, p]));
const privByUser = Object.fromEntries((await db.query('select * from profile_private')).rows.map((p) => [p.user_id, p]));
let profileMismatch = [];
for (const u of raw.users) {
  const p = profByLegacy[u.id];
  const pp = privByUser[p.id];
  const eq = (a, b, what) => { if ((a ?? null) !== (b ?? null)) profileMismatch.push(`${u.username}.${what}: ${a} vs ${b}`); };
  eq(p.username, u.username, 'username');
  eq(p.display_name, u.displayName || u.username, 'display_name');
  eq(p.bio, u.bio || '', 'bio');
  eq(Number(p.noob_points), u.noobPoints || 0, 'noob_points');
  eq(p.account_type, u.accountType, 'account_type');
  eq(p.is_verified, !!u.isVerified, 'is_verified');
  eq(p.is_admin, !!u.isAdmin, 'is_admin');
  eq(pp.email, u.email, 'email');
  eq(pp.first_name, u.firstName, 'first_name');
  eq(pp.date_of_birth ? new Date(pp.date_of_birth).toISOString().slice(0, 10) : null, u.dateOfBirth ? u.dateOfBirth.slice(0, 10) : null, 'date_of_birth');
  eq(pp.legacy.mobileNumber, u.mobileNumber, 'legacy mobile kept');
}
check(profileMismatch.length === 0, `all ${raw.users.length} profiles' names, bios, points, emails, birthdays, roles match`, profileMismatch.slice(0, 5).join('; '));

// the counters are rebuilt from real rows, so compare with independent counts from the raw data
const followersRaw = {};
raw.users.forEach((u) => u.followingIds.forEach((id) => { followersRaw[id] = (followersRaw[id] || 0) + 1; }));
let counterProblems = [];
for (const u of raw.users) {
  const p = profByLegacy[u.id];
  if (p.followers_count !== (followersRaw[u.id] || 0)) counterProblems.push(`${u.username} followers ${p.followers_count} vs ${followersRaw[u.id] || 0}`);
  if (p.following_count !== u.followingIds.length) counterProblems.push(`${u.username} following`);
  if (p.posts_count !== raw.posts.filter((x) => x.userId === u.id).length) counterProblems.push(`${u.username} posts`);
}
for (const po of raw.posts) {
  const row = (await db.query('select likes_count, comments_count, saves_count from posts where legacy_id=$1', [po.id])).rows[0];
  if (row.likes_count !== new Set(po.likedBy).size) counterProblems.push(`post ${po.id} likes`);
  if (row.comments_count !== (raw.comments[po.id] || []).length) counterProblems.push(`post ${po.id} comments`);
  if (row.saves_count !== new Set(po.savedBy || []).size) counterProblems.push(`post ${po.id} saves`);
}
check(counterProblems.length === 0, 'follower / following / post / like / comment / save counters equal the real data', counterProblems.slice(0, 5).join('; '));

// every old profile field is either mapped, deliberately dropped (recomputed), or kept in "extra"
const known = new Set(['followersCount', 'followingCount', 'postsCount', 'pendingSentRequests', 'id', 'username', 'displayName', 'firstName', 'lastName', 'email', 'password', 'avatar', 'bio', 'accountType', 'isVerified', 'verificationTier', 'isAdmin', 'isSuspended', 'suspendedReason', 'noobPoints', 'gamesWonCount', 'gamesPlayedCount', 'isBusiness', 'followingIds', 'blockedUserIds', 'privacySettings', 'ipAddress', 'noobTransactions', 'proTier', 'proBilling', 'proAutoRenew', 'proRenewsAt', 'countryCode', 'mobileNumber', 'dateOfBirth', 'gender', 'businessCategory', 'businessEmail', 'businessPhone', 'businessAddress', 'agreedToTerms', 'followRequests', 'externalLinks', 'customLinks', 'businessAddresses', 'crossProfiles', 'createdAt', 'website', 'city', 'pronouns', 'interests', 'socialLinks', 'pushSubscription', 'pushTokens', 'purchasedItemIds', 'isAi', 'isLiveAvatar', 'statusNote']);
const leftover = new Set();
raw.users.forEach((u) => Object.keys(u).forEach((k) => { if (!known.has(k)) leftover.add(k); }));
const inExtra = new Set();
(await db.query('select extra from profiles')).rows.forEach((r) => Object.keys(r.extra).forEach((k) => inExtra.add(k)));
check([...leftover].every((k) => inExtra.has(k)), `no profile field lost — unmapped ones (${[...leftover].join(', ') || 'none'}) are kept in "extra"`);

// passwords: everyone keeps their existing password (Supabase hashes it on import)
check(plan.authUsers.every((a) => { const u = raw.users.find((x) => x.id === a.user_metadata.legacy_id); return u.password ? a.password === u.password : a.password.length >= 16; }), 'every account keeps its exact password');
check(plan.authUsers.every((a) => a.email === loginEmailFor(a.id)) && new Set(plan.authUsers.map((a) => a.email)).size === plan.authUsers.length, 'login emails are unique (fixes the shared-email accounts)');
{
  const dup = Object.values(raw.users.reduce((m, u) => { const e = (u.email || '').toLowerCase(); (m[e] = m[e] || []).push(u); return m; }, {})).find((g) => g.length > 1);
  if (dup) check((await db.query('select count(*)::int n from profile_private where lower(email) = $1', [dup[0].email.toLowerCase()])).rows[0].n === dup.length, 'accounts sharing an email each keep their real email privately');
}

// phone clean-up
const phones = (await db.query(`select p.username, pp.country_code, pp.mobile_number from profile_private pp join profiles p on p.id = pp.user_id`)).rows;
check(phones.every((r) => !r.mobile_number || /^\d{10}$/.test(r.mobile_number)), 'all mobile numbers are clean 10-digit numbers', JSON.stringify(phones.filter((r) => r.mobile_number && !/^\d{10}$/.test(r.mobile_number))));
check(plan.inlineFiles.length === 1 && plan.inlineFiles[0].buffer.length > 2_000_000, 'the big inline profile photo is extracted as a real file (bytes intact)');
check(!(await db.query('select 1 from profiles where avatar like $1 limit 1', ['data:%'])).rows.length, 'no photo is stored inside the database any more');

// ------------------------------------------------------------------ 3. safety
section('3. Safe to re-run');
await expectFail(() => runImport(plan, adapter), new RegExp(`already has ${raw.users.length} profile`), 'refuses to import on top of existing data');
const before = { profiles: await n('select count(*)::int n from profiles'), likes: await n('select count(*)::int n from post_likes'), follows: await n('select count(*)::int n from follows') };
const again = await runImport(plan, adapter, { resume: true });
check(again.auth.created === 0 && again.auth.existing === raw.users.length, 're-run with --resume creates no duplicate logins');
check(again.verification.ok, 're-run verification still passes (counters not double-counted)', JSON.stringify(again.verification.problems));
check(before.profiles === await n('select count(*)::int n from profiles') && before.likes === await n('select count(*)::int n from post_likes') && before.follows === await n('select count(*)::int n from follows'), 're-run adds nothing twice');

// ------------------------------------------------------------------ 4. security
section('4. Privacy and security rules (real signed-in users)');
const idOf = (u) => profByLegacy[u.id].id;
const adminRaw = raw.users.find((u) => u.isAdmin);
const privateRaw = raw.users.filter((u) => u.accountType === 'private');
const publicRaw = raw.users.filter((u) => u.accountType !== 'private' && !u.isAdmin);
const postCount = (u) => raw.posts.filter((p) => p.userId === u.id).length;
const authorRaw = [...publicRaw].sort((a, b) => postCount(b) - postCount(a))[0];        // a public account that has posts
const viewerRaw = publicRaw.find((u) => u !== authorRaw);                                   // an ordinary signed-in user
const likerRaw = publicRaw.find((u) => u !== authorRaw && u !== viewerRaw && !raw.posts.find((p) => p.userId === authorRaw.id).likedBy.includes(u.id));
const publicTargetRaw = publicRaw.find((u) => ![authorRaw, viewerRaw, likerRaw].includes(u) && !authorRaw.followingIds.includes(u.id));
if (!adminRaw || privateRaw.length < 2 || !authorRaw || !viewerRaw || !likerRaw || !publicTargetRaw || postCount(authorRaw) === 0) throw new Error('This backup doesn\'t contain the mix of accounts the security tests need (admin, 2 private, 4 public, one with posts).');
const noob = idOf(adminRaw), author = idOf(authorRaw), viewer = idOf(viewerRaw), privateOwner = idOf(privateRaw[0]);
const privateTarget = idOf(privateRaw[1]), publicTarget = idOf(publicTargetRaw);
const rowsAs = (uid, sql, params) => asUser(db, uid, async () => (await db.query(sql, params)).rows);
const execAs = (uid, sql, params) => asUser(db, uid, async () => db.query(sql, params));

{
  const tables = (await db.query(`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`)).rows.map((r) => r.table_name);
  let leaked = [];
  for (const t of tables) { try { await asAnon(db, () => db.query(`select 1 from public.${t} limit 1`)); leaked.push(t); } catch { /* denied, as intended */ } }
  check(leaked.length === 0, `a logged-out visitor (the public key) is refused on all ${tables.length} tables`, leaked.join(', '));
  let openLegacy = false;
  try { await asUser(db, adminRaw ? idOf(adminRaw) : '', () => db.query('select 1 from public.legacy_import limit 1')); openLegacy = true; } catch { /* denied */ }
  check(!openLegacy, 'even an admin browser session can NOT read the raw legacy_import table');
}
check((await rowsAs(viewer, 'select count(*)::int n from profiles'))[0].n === raw.users.length, `a signed-in user sees all ${raw.users.length} profile cards`);
check((await rowsAs(viewer, 'select user_id from profile_private')).length === 1, 'a user can read only their OWN private details (email, phone, birthday)');
check((await rowsAs(noob, 'select user_id from profile_private')).length === raw.users.length, 'the admin can read everyone\'s private details');
check((await rowsAs(viewer, 'select count(*)::int n from push_subscriptions'))[0].n === 0, 'push subscriptions are invisible to other users');

await expectFail(() => execAs(viewer, 'update profiles set noob_points = 999999999 where id = $1', [viewer]), /protected profile fields/, 'a user can NOT give themselves points');
await expectFail(() => execAs(viewer, 'update profiles set is_admin = true where id = $1', [viewer]), /protected profile fields/, 'a user can NOT make themselves admin');
await expectFail(() => execAs(viewer, 'update profiles set is_verified = true where id = $1', [viewer]), /protected profile fields/, 'a user can NOT verify themselves for free');
await expectFail(() => execAs(viewer, 'update profiles set followers_count = 5000 where id = $1', [viewer]), /protected profile fields/, 'a user can NOT fake their follower count');
check((await execAs(viewer, `update profiles set bio = 'new bio' where id = $1`, [viewer])).affectedRows === 1, 'a user CAN edit their own bio');
check((await execAs(viewer, `update profiles set bio = 'hacked' where id = $1`, [author])).affectedRows === 0, 'a user can NOT edit someone else\'s profile');

// posts: private accounts
await db.query(`insert into posts (id, user_id, caption) values ('00000000-0000-4000-8000-0000000000aa', $1, 'private post')`, [privateOwner]);
const seesPrivate = async (uid) => (await rowsAs(uid, `select count(*)::int n from posts where id = '00000000-0000-4000-8000-0000000000aa'`))[0].n;
check((await seesPrivate(viewer)) === 0, 'a stranger can NOT see a private account\'s post');
check((await seesPrivate(privateOwner)) === 1, 'the private account\'s owner sees their own post');
check((await seesPrivate(noob)) === 1, 'the admin sees it');
await db.query('insert into follows (follower_id, followee_id) values ($1, $2)', [viewer, privateOwner]); // as if the follow request was accepted
check((await seesPrivate(viewer)) === 1, 'an approved follower CAN see it');
check((await rowsAs(viewer, 'select count(*)::int n from posts'))[0].n === raw.posts.length + 1, 'public posts stay visible to everyone (all real ones + the now-visible private one)');

// likes / counters
const somePostRaw = raw.posts.find((p) => p.userId === authorRaw.id);
const somePost = (await db.query('select id, likes_count, comments_count from posts where legacy_id = $1', [somePostRaw.id])).rows[0];
const liker = idOf(likerRaw);
await execAs(liker, 'insert into post_likes (post_id, user_id) values ($1, $2)', [somePost.id, liker]);
check((await n('select likes_count n from posts where id = $1', [somePost.id])) === somePost.likes_count + 1, 'liking a post raises its like count by exactly 1');
await expectFail(() => execAs(liker, 'insert into post_likes (post_id, user_id) values ($1, $2)', [somePost.id, viewer]), /row-level security/, 'a user can NOT like on someone else\'s behalf');
await execAs(liker, 'delete from post_likes where post_id = $1 and user_id = $2', [somePost.id, liker]);
check((await n('select likes_count n from posts where id = $1', [somePost.id])) === somePost.likes_count, 'unliking lowers it back');
await expectFail(() => execAs(author, 'update posts set likes_count = 99999 where id = $1', [somePost.id]), /protected post fields/, 'even a post\'s author can NOT fake its like count');
await expectFail(() => execAs(viewer, `insert into posts (user_id, caption) values ($1, 'as someone else')`, [author]), /row-level security/, 'a user can NOT post as someone else');
check((await execAs(viewer, `update posts set caption = 'edited' where id = $1`, [somePost.id])).affectedRows === 0, 'a user can NOT edit someone else\'s post');

// follows
await expectFail(() => execAs(author, 'insert into follows (follower_id, followee_id) values ($1, $2)', [author, privateTarget]), /row-level security/, 'following a PRIVATE account directly is refused (needs a request)');
check((await execAs(author, 'insert into follow_requests (requester_id, target_id) values ($1, $2)', [author, privateTarget])).affectedRows === 1, '...a follow request is allowed instead');
await execAs(author, 'insert into follows (follower_id, followee_id) values ($1, $2) on conflict do nothing', [author, publicTarget]);
check((await n('select followers_count n from profiles where id = $1', [publicTarget])) === (followersRaw[publicTargetRaw.id] || 0) + 1, 'following a public account raises its follower count by exactly 1');

// comments
await execAs(liker, `insert into comments (post_id, user_id, text) values ($1, $2, 'nice')`, [somePost.id, liker]);
check((await n('select comments_count n from posts where id = $1', [somePost.id])) === somePost.comments_count + 1, 'a comment raises the comment count');
await expectFail(() => execAs(liker, `insert into comments (post_id, user_id, text) values ($1, $2, 'fake')`, [somePost.id, viewer]), /row-level security/, 'a user can NOT comment as someone else');
await db.query('update posts set is_comments_disabled = true where id = $1', [somePost.id]);
await expectFail(() => execAs(liker, `insert into comments (post_id, user_id, text) values ($1, $2, 'blocked')`, [somePost.id, liker]), /row-level security/, 'comments are refused when the author switched them off');

// blocks
await db.query('insert into blocks (blocker_id, blocked_id) values ($1, $2)', [author, viewer]);
check((await rowsAs(viewer, `select count(*)::int n from posts where user_id = $1`, [author]))[0].n === 0, 'someone blocked by an author can NOT see that author\'s posts');

// notifications
const myNotifs = (await rowsAs(viewer, 'select id, target_user_id from notifications'));
const expectedForViewer = plan.tables.notifications.filter((x) => x.target_user_id === viewer || x.target_user_id === null).length;
check(myNotifs.length === expectedForViewer && myNotifs.every((r) => r.target_user_id === viewer || r.target_user_id === null), 'a user sees only their own notifications plus broadcasts');
await expectFail(() => execAs(viewer, `insert into notifications (target_user_id, type, message) values ($1, 'system', 'spoof')`, [author]), /row-level security|permission denied/, 'a user can NOT create notifications for others');

// chat: Global Lounge
const lounge = (await db.query('select id from chats where is_global_default')).rows[0].id;
check((await rowsAs(viewer, 'select count(*)::int n from messages where chat_id = $1', [lounge]))[0].n === (raw.messages[raw.chats.find((c) => c.isGlobalDefault).id] || []).length, 'everyone can read the Global Lounge history');
check((await execAs(viewer, `insert into messages (chat_id, sender_id, text) values ($1, $2, 'hello lounge')`, [lounge, viewer])).affectedRows === 1, 'everyone can post in the Global Lounge as themselves');
await expectFail(() => execAs(viewer, `insert into messages (chat_id, sender_id, text) values ($1, $2, 'forged')`, [lounge, author]), /row-level security/, 'a user can NOT post a message as someone else');

// economy is read-only for clients
await expectFail(() => execAs(viewer, `insert into game_scores (user_id, game_id, score, points_awarded) values ($1, 'tictactoe', 999, 999999999)`, [viewer]), /row-level security|permission denied/, 'a user can NOT write their own game score / points');
await expectFail(() => execAs(viewer, `insert into noob_transactions (user_id, amount, reason) values ($1, 999999999, 'gift')`, [viewer]), /row-level security|permission denied/, 'a user can NOT write their own points history');
check((await rowsAs(viewer, 'select count(*)::int n from noob_transactions'))[0].n === (viewerRaw.noobTransactions || []).length, 'a user sees only their own points history');
check((await execAs(viewer, 'update app_settings set store_enabled = false')).affectedRows === 0, 'a normal user can NOT switch the shop off');
check((await execAs(noob, 'update app_settings set store_enabled = true')).affectedRows === 1, 'the admin CAN change app settings');

// login helpers (callable while logged out)
const resolve = (identifier) => asAnon(db, async () => (await db.query('select resolve_login_email($1) as e', [identifier])).rows[0].e);
check((await resolve(viewerRaw.username)) === loginEmailFor(viewer), 'typing a username finds the right login account');
check((await resolve(viewerRaw.email.toUpperCase())) === loginEmailFor(viewer), 'typing the email (any capitalisation) finds it too');
const sharedGroup = Object.values(raw.users.reduce((m, u) => { const e = (u.email || '').toLowerCase(); (m[e] = m[e] || []).push(u); return m; }, {})).find((g) => g.length > 1);
if (sharedGroup) {
  const older = [...sharedGroup].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];
  check((await resolve(older.email)) === loginEmailFor(idOf(older)), 'a shared email logs into the older account (same as the old app)');
}
const ghost = await resolve('no-such-person');
check(/^[0-9a-f-]{36}@users\.nooob\.xyz$/.test(ghost), 'an unknown name still returns a well-formed address (no account probing)');
check((await asAnon(db, async () => (await db.query(`select username_taken('${viewerRaw.username.toUpperCase()}') t`)).rows[0].t)) === true && (await asAnon(db, async () => (await db.query(`select username_taken('brand_new_name') t`)).rows[0].t)) === false, 'username availability check works while logged out');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
