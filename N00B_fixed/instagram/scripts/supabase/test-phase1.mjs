// Tests for supabase phase 1 (sign-up, profiles, follows, posts, likes, comments, notifications)
// against a REAL Postgres (PGlite) holding the real backup, exercising every function as real
// signed-in users — including the attacks that must fail.
//
// Usage: node scripts/supabase/test-phase1.mjs [backup-folder]
import fs from 'node:fs';
import path from 'node:path';
import { loadBackup, buildImportPlan } from './transform.mjs';
import { runImport } from './run-import.mjs';
import { createTestDb, makePgAdapter, asUser, asAnon } from './pg-test-env.mjs';

const backupsRoot = 'backups';
const dir = process.argv.slice(2).find((a) => !a.startsWith('--')) || path.join(backupsRoot, fs.readdirSync(backupsRoot).filter((d) => fs.existsSync(path.join(backupsRoot, d, 'users.json'))).sort().pop());
const raw = loadBackup(dir);

let passed = 0;
let failed = 0;
const check = (cond, label, detail = '') => {
  if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); }
};
const expectFail = async (fn, pattern, label) => {
  try { await fn(); check(false, label, '(expected an error, but it succeeded)'); }
  catch (e) { check(pattern.test(e.message), label, `(got: ${e.message})`); }
};
const section = (t) => console.log(`\n${t}`);

const plan = buildImportPlan(raw, {});
const db = await createTestDb();
const adapter = makePgAdapter(db);
await runImport(plan, adapter, { log: () => {} });

// ---- people, picked by role (never by name)
const profByLegacy = Object.fromEntries((await db.query('select * from profiles')).rows.map((p) => [p.legacy_id, p]));
const idOf = (u) => profByLegacy[u.id].id;
const adminRaw = raw.users.find((u) => u.isAdmin);
const publicRaw = raw.users.filter((u) => u.accountType !== 'private' && !u.isAdmin);
const privateRaw = raw.users.filter((u) => u.accountType === 'private');
const postCount = (u) => raw.posts.filter((p) => p.userId === u.id).length;
const authorRaw = [...publicRaw].sort((a, b) => postCount(b) - postCount(a))[0];
const [aRaw, bRaw, cRaw] = publicRaw.filter((u) => u !== authorRaw && !authorRaw.followingIds.includes(u.id) && !u.followingIds.includes(authorRaw.id)).slice(0, 3);
const admin = idOf(adminRaw), author = idOf(authorRaw), a = idOf(aRaw), b = idOf(bRaw), c = idOf(cRaw);
const priv = idOf(privateRaw[0]), priv2 = idOf(privateRaw[1]);

const call = (uid, sql, params = []) => asUser(db, uid, async () => (await db.query(sql, params)).rows);
const rpc = async (uid, fn, ...args) => (await call(uid, `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args))[0].r;
const n = async (sql, params = []) => (await db.query(sql, params)).rows[0].n;
const points = async (id) => Number((await db.query('select noob_points p from profiles where id = $1', [id])).rows[0].p);
const j = (v) => JSON.stringify(v);

// =====================================================================================
section('1. Sign-up');
const good = { firstName: 'Test', lastName: 'Person', username: 'Brand_New.User', email: 'new@example.com', mobileNumber: '9000000000', dateOfBirth: '2005-05-05', password: 'secret123', bio: 'hello', agreedToTerms: true };
const chk = (o) => asAnon(db, async () => (await db.query('select public.check_signup($1::jsonb) r', [j(o)])).rows[0].r);
check((await chk(good)).ok === true, 'a valid sign-up passes the pre-check');
check((await chk({ ...good, firstName: '' })).error === 'Please enter your name', 'missing name is refused with the old message');
check((await chk({ ...good, bio: '  ' })).error.startsWith('Bio is compulsory'), 'bio is compulsory');
check((await chk({ ...good, agreedToTerms: false })).error.includes('agree'), 'terms must be accepted');
check((await chk({ ...good, dateOfBirth: new Date(Date.now() - 10 * 365.25 * 864e5).toISOString().slice(0, 10) })).error.includes('at least 13'), 'under-13s are refused');
check((await chk({ ...good, dateOfBirth: '1930-01-01' })).error.includes('82'), 'over-82 is refused');
check((await chk({ ...good, username: authorRaw.username.toUpperCase() })).error.startsWith('User ID is already taken'), 'a taken username (any capitalisation) is refused');
check((await chk({ ...good, username: '!!!' })).error.includes('invalid characters'), 'a username with only illegal characters is refused');
{
  const victim = (await db.query('select p.id, pp.email from profiles p join profile_private pp on pp.user_id = p.id where not p.is_admin limit 1')).rows[0];
  await db.query('update profiles set is_suspended = true where id = $1', [victim.id]);
  const r = await chk({ ...good, email: victim.email });
  check(r.suspended === true, 'a suspended person can NOT sign up again with the same email');
  await db.query('update profiles set is_suspended = false where id = $1', [victim.id]);
}
// GoTrue creates the login account; the trigger must build the profile
const newAuthId = (await db.query(`select gen_random_uuid() id`)).rows[0].id;
await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)`, [newAuthId, `${newAuthId}@users.nooob.xyz`, j({ username: 'Brand_New.User', first_name: 'Test', last_name: 'Person', email: 'New@Example.com', mobile_number: '9000000000', date_of_birth: '2005-05-05', bio: 'hello', account_type: 'business', agreed_to_terms: true })]);
const created = (await db.query('select * from profiles where id = $1', [newAuthId])).rows[0];
check(created && created.username === 'brand_new.user' && created.display_name === 'Test Person' && created.account_type === 'business' && created.is_business, 'the profile is created automatically (username cleaned, name built, business flag set)');
check((await n('select count(*)::int n from profile_private where user_id = $1 and email = $2', [newAuthId, 'new@example.com'])) === 1, 'private details are stored privately (email lower-cased)');
check((await n('select count(*)::int n from follows where follower_id = $1 and followee_id = $2', [newAuthId, admin])) === 1, 'a new account automatically follows the official NOOB account');
check((await n('select count(*)::int n from profiles where legacy_id is null')) === 1, 'imported accounts (with a legacy id) do NOT trigger a second profile');
check((await asAnon(db, async () => (await db.query('select public.resolve_login_email($1) e', ['BRAND_NEW.user'])).rows[0].e)) === `${newAuthId}@users.nooob.xyz`, 'login by username finds the new account\'s real login address');
check((await asAnon(db, async () => (await db.query('select public.resolve_login_email($1) e', ['new@example.com'])).rows[0].e)) === `${newAuthId}@users.nooob.xyz`, 'login by email finds it too');
const newbie = newAuthId;

// =====================================================================================
section('2. Profile');
const me = await rpc(a, 'get_my_user');
check(me.id === a && me.email === raw.users.find((u) => u.id === aRaw.id).email && Array.isArray(me.followingIds) && Array.isArray(me.blockedUserIds) && Array.isArray(me.followRequests) && Array.isArray(me.pendingSentRequests) && Array.isArray(me.noobTransactions), 'my own record has contact details, follow lists and wallet history');
check(me.password === undefined && me.ipAddress === undefined, 'passwords and IP addresses are never sent');
const pubView = (await rpc(b, 'search_users', aRaw.username))[0];
check(pubView && pubView.id === a && pubView.email === undefined && pubView.mobileNumber === undefined && pubView.dateOfBirth === undefined && pubView.followRequests === undefined, 'other people see NO email / phone / birthday / requests');
check((await rpc(b, 'search_users', '')).length === raw.users.length + 1, 'searching with no text lists everyone');
check((await rpc(b, 'search_users', 'zzzz-no-such-person')).length === 0, 'searching for nobody returns nothing');
const upd = await rpc(a, 'update_my_profile', { bio: 'a new bio', website: 'https://example.com', city: 'Mumbai', interests: ['art', 'code'] });
check(upd.bio === 'a new bio' && upd.website === 'https://example.com' && upd.interests.join() === 'art,code', 'editing bio / website / interests works');
const before = await points(a);
await rpc(a, 'update_my_profile', { noobPoints: 999999999, isAdmin: true, isVerified: true, proTier: 'ultimate', followersCount: 5000 });
check((await points(a)) === before && (await n('select count(*)::int n from profiles where id = $1 and (is_admin or is_verified or pro_tier is not null)', [a])) === 0, 'points, admin, verified and Pro can NOT be set through a profile edit');
await expectFail(() => rpc(a, 'update_my_profile', { username: authorRaw.username }), /already taken/, 'taking someone else\'s username is refused');
await expectFail(() => rpc(a, 'update_my_profile', { dateOfBirth: '2020-01-01' }), /at least 13/, 'setting a birthday under 13 is refused');
await expectFail(() => rpc(a, 'update_my_profile', { email: 'not-an-email' }), /valid email/, 'an invalid email is refused');
check((await rpc(a, 'update_my_profile', { username: 'Renamed.User' })).username === 'renamed.user', 'renaming works (cleaned, lower-case)');
await expectFail(() => asAnon(db, () => db.query('select public.get_my_user()')), /permission denied/, 'a logged-out visitor can NOT read anyone\'s record');

// =====================================================================================
section('3. Follows');
// start from a clean slate between the people used below (real data may already link them)
{ const ids = [a, b, c, priv, priv2, author].map((x) => `'${x}'`).join(','); await db.query(`delete from follows where follower_id in (${ids}) or followee_id in (${ids})`); await db.query(`delete from follow_requests where requester_id in (${ids}) or target_id in (${ids})`); await db.query(`delete from notifications where actor_id in (${ids}) and type in ('new_follower','follow_request_received','follow_request_accepted')`); }
await expectFail(() => rpc(a, 'toggle_follow', a), /can't follow yourself/, 'you can not follow yourself');
let f = await rpc(a, 'toggle_follow', b);
check(f.isFollowing === true && f.followersCount === (await n('select followers_count n from profiles where id = $1', [b])), 'following a public account works');
check((await n(`select count(*)::int n from notifications where type = 'new_follower' and target_user_id = $1 and actor_id = $2`, [b, a])) === 1, '...and notifies them');
f = await rpc(a, 'toggle_follow', b);
check(f.isFollowing === false, 'tapping again unfollows');
f = await rpc(a, 'toggle_follow', priv);
check(f.isFollowing === false && f.isFollowRequested === true, 'a private account gets a follow REQUEST, not a follow');
check((await n(`select count(*)::int n from notifications where type = 'follow_request_received' and target_user_id = $1 and actor_id = $2 and action_status = 'pending'`, [priv, a])) === 1, '...with a pending Accept/Decline notification');
f = await rpc(a, 'toggle_follow', priv);
check(f.isFollowRequested === false && (await n(`select count(*)::int n from notifications where type = 'follow_request_received' and target_user_id = $1 and actor_id = $2`, [priv, a])) === 0, 'tapping again cancels the request and removes its notification');
await rpc(a, 'toggle_follow', priv);
await rpc(b, 'toggle_follow', priv);
const accepted = await rpc(priv, 'accept_follow_request', a);
check((await n('select count(*)::int n from follows where follower_id = $1 and followee_id = $2', [a, priv])) === 1 && accepted.followRequests.length === 1 && accepted.followRequests[0].userId === b, 'accepting a request creates the follow and leaves the other request pending');
check((await n(`select count(*)::int n from notifications where type = 'follow_request_accepted' and target_user_id = $1`, [a])) === 1 && (await n(`select count(*)::int n from notifications where type = 'follow_request_received' and actor_id = $1 and target_user_id = $2 and action_status = 'accepted'`, [a, priv])) === 1, '...notifies the requester and marks the original notification accepted');
const declined = await rpc(priv, 'decline_follow_request', b);
check(declined.followRequests.length === 0 && (await n(`select count(*)::int n from follows where follower_id = $1 and followee_id = $2`, [b, priv])) === 0, 'declining removes the request without following');
await expectFail(() => rpc(priv, 'accept_follow_request', c), /No pending request/, 'accepting a request that does not exist is refused');
await expectFail(() => call(a, `insert into follows (follower_id, followee_id) values ($1, $2)`, [a, c]), /permission denied/, 'following by writing to the table directly is not allowed');
await db.query('insert into blocks (blocker_id, blocked_id) values ($1, $2)', [c, a]);
await expectFail(() => rpc(a, 'toggle_follow', c), /can't follow this account/, 'a blocked person can not follow the blocker');
await db.query('delete from blocks where blocker_id = $1', [c]);

// =====================================================================================
section('4. Publishing posts');
const slides = [{ mediaUrl: 'posts/test-1.jpg', objectKey: 'posts/test-1.jpg', mediaType: 'image', caption: 'first' }, { id: 'slide_not_a_uuid', mediaUrl: 'posts/test-2.jpg', mediaType: 'image' }];
const pointsBefore = await points(newbie);
const post1 = await rpc(newbie, 'create_post', slides, 'Hello world', 'travel', ['hi', 'there'], null, null);
check(post1.userId === newbie && post1.caption === 'Hello world' && post1.category === 'travel' && post1.slides.length === 2 && post1.slides[0].mediaUrl === 'posts/test-1.jpg' && post1.slides[1].id.length === 36, 'a post is created with its pictures in order (odd slide ids are replaced)');
check((await points(newbie)) === pointsBefore + 25 && (await n(`select count(*)::int n from noob_transactions where user_id = $1 and reason = 'Published a post' and amount = 25`, [newbie])) === 1, 'publishing earns 25 points and writes a wallet entry');
check((await n('select posts_count n from profiles where id = $1', [newbie])) === 1, 'the author\'s post counter went up');
try { await rpc(newbie, 'create_post', slides, 'second', 'tech', [], null, null); check(false, 'a second post within 24 hours is refused'); }
catch (e) { check(/one post or reel per day/.test(e.message) && /^\d{4}-\d\d-\d\dT/.test(e.detail || ''), 'a second post within 24 hours is refused, with the time it unlocks', `(${e.message} / ${e.detail})`); }
await db.query(`update profiles set pro_tier = 'starter' where id = $1`, [newbie]);
check((await rpc(newbie, 'create_post', slides, 'pro post', 'tech', [], null, null)).caption === 'pro post', 'a Pro account has no daily limit');
await expectFail(() => rpc(newbie, 'create_post', [], 'x', 'tech', [], null, null), /at least one picture/, 'a post with no pictures is refused');
await expectFail(() => asAnon(db, () => db.query(`select public.create_post('[]'::jsonb)`)), /permission denied/, 'a logged-out visitor can not publish');
await expectFail(() => call(a, `insert into posts (user_id, caption) values ($1, 'sneaky')`, [a]), /permission denied/, 'publishing by writing to the table directly is not allowed (no free bypass of the limit)');
const pid = post1.id;

// =====================================================================================
section('5. Feed, likes, saves');
const feed = await rpc(b, 'feed_posts');
check(Array.isArray(feed) && feed.length >= raw.posts.length && feed.every((p, i) => i === 0 || new Date(feed[i - 1].createdAt) >= new Date(p.createdAt)), 'the feed lists posts newest first');
check(feed.every((p) => p.username && 'userAvatar' in p && Array.isArray(p.slides) && 'isLiked' in p && 'isSaved' in p && 'likesCount' in p), 'every post carries author, slides, and my like/save state');
const likeBefore = (await n('select likes_count n from posts where id = $1', [pid]));
const l1 = await rpc(b, 'toggle_post_like', pid);
check(l1.isLiked === true && l1.likesCount === likeBefore + 1, 'liking works and returns the new count');
check((await n(`select count(*)::int n from notifications where type = 'post_like' and target_user_id = $1 and actor_id = $2 and post_id = $3`, [newbie, b, pid])) === 1, '...and notifies the author');
check((await rpc(b, 'feed_posts')).find((p) => p.id === pid).isLiked === true, 'the feed now shows it as liked by me');
check((await rpc(b, 'liked_posts')).some((p) => p.id === pid), 'it appears in my liked posts');
const l2 = await rpc(b, 'toggle_post_like', pid);
check(l2.isLiked === false && l2.likesCount === likeBefore, 'unliking lowers it');
await rpc(newbie, 'toggle_post_like', pid);
check((await n(`select count(*)::int n from notifications where type = 'post_like' and target_user_id = $1 and actor_id = $1`, [newbie])) === 0, 'liking your own post does not notify you');
check((await rpc(a, 'toggle_post_save', pid)).isSaved === true && (await rpc(a, 'saved_posts')).some((p) => p.id === pid), 'saving works and lists it under saved posts');
const likers = await rpc(newbie, 'post_likers', pid);
check(likers.users.length === 1 && likers.users[0].id === newbie && likers.users[0].email === undefined, 'the likers list shows public profile cards only');
// old rule: a private author is visible to accounts THEY follow (and to their followers)
await db.query('insert into posts (id, user_id, caption) values ($1, $2, $3)', ['00000000-0000-4000-8000-0000000000bb', priv2, 'private post']);
const sees = async (uid) => (await rpc(uid, 'feed_posts')).some((p) => p.id === '00000000-0000-4000-8000-0000000000bb');
check(!(await sees(c)), 'a stranger does not see a private account\'s post');
await db.query('insert into follows (follower_id, followee_id) values ($1, $2)', [priv2, c]); // the private account follows c
check(await sees(c), 'someone the private account follows CAN see it (same as the old app)');
await db.query('delete from follows where follower_id = $1', [priv2]);

// =====================================================================================
section('6. Owner controls');
await expectFail(() => rpc(b, 'toggle_post_flag', pid, 'archive'), /only modify your own/, 'a stranger can not archive someone else\'s post');
check((await rpc(newbie, 'toggle_post_flag', pid, 'comments')).isCommentsDisabled === true, 'the owner can switch comments off');
await expectFail(() => rpc(b, 'add_comment', pid, 'hi'), /turned off/, 'nobody can comment while they are off');
await rpc(newbie, 'toggle_post_flag', pid, 'comments');
check((await rpc(newbie, 'toggle_post_flag', pid, 'like_count')).isLikeCountHidden === true, 'the owner can hide the like count');
check((await rpc(newbie, 'toggle_post_flag', pid, 'archive')).isArchived === true, 'the owner can archive a post');
check(!(await rpc(b, 'feed_posts')).some((p) => p.id === pid), 'an archived post disappears from everyone else\'s feed');
check((await rpc(newbie, 'archived_posts')).some((p) => p.id === pid), 'but the owner still finds it under archived');
await rpc(admin, 'toggle_post_flag', pid, 'archive');
check((await rpc(b, 'feed_posts')).some((p) => p.id === pid), 'the admin can also toggle it (restored)');
await expectFail(() => rpc(b, 'delete_post_slide', pid, post1.slides[0].id), /only remove media from your own/, 'a stranger can not remove a picture');
await rpc(newbie, 'delete_post_slide', pid, post1.slides[0].id);
await expectFail(() => rpc(newbie, 'delete_post_slide', pid, post1.slides[1].id), /only picture/, 'the last picture can not be removed (delete the post instead)');
check((await rpc(newbie, 'feed_posts')).find((p) => p.id === pid).slides.length === 1, 'removing a picture keeps the post with one left');

// =====================================================================================
section('7. Comments');
const pts = await points(b);
const cm = await rpc(b, 'add_comment', pid, '  nice one!  ');
check(cm.comment.text === 'nice one!' && cm.comment.username && cm.comment.userId === b, 'a comment is created (trimmed) with its author card');
check((await points(b)) === pts + 5, 'commenting earns 5 points');
check((await n(`select count(*)::int n from notifications where type = 'post_comment' and target_user_id = $1 and post_id = $2`, [newbie, pid])) === 1, '...and notifies the post\'s author');
check((await n('select comments_count n from posts where id = $1', [pid])) === 1, 'the comment counter went up');
await expectFail(() => rpc(b, 'add_comment', pid, '   '), /cannot be empty/, 'an empty comment is refused');
check((await rpc(a, 'post_comments', pid)).comments.length === 1, 'anyone who can see the post can read its comments');
await expectFail(() => rpc(b, 'toggle_pin_comment', cm.comment.id), /Only the (post )?owner/, 'the commenter can not pin their own comment');
check((await rpc(newbie, 'toggle_pin_comment', cm.comment.id)).isPinned === true, 'the post owner can pin a comment');
await expectFail(() => call(a, 'delete from comments where id = $1 returning id', [cm.comment.id]).then((r) => { if (!r.length) throw new Error('nothing deleted'); }), /nothing deleted/, 'a stranger can not delete someone else\'s comment');
await call(newbie, 'delete from comments where id = $1', [cm.comment.id]);
check((await n('select comments_count n from posts where id = $1', [pid])) === 0, 'the post owner can delete a comment and the counter goes back down');

// =====================================================================================
section('8. Views');
await rpc(b, 'record_post_view', pid);
await rpc(b, 'record_post_view', pid);
await rpc(newbie, 'record_post_view', pid);
check((await rpc(newbie, 'post_viewers', pid)).users.length === 1, 'views count once per person, and never the owner themselves');
await expectFail(() => rpc(b, 'post_viewers', pid), /Only the post owner/, 'only the owner can see who viewed');

// =====================================================================================
section('9. Notifications');
const notes = (await rpc(newbie, 'my_notifications')).notifications;
check(notes.length >= 2 && notes.every((x) => 'isRead' in x && x.senderUsername !== undefined || x.actorId === null), 'my notifications carry sender name and read state');
check(notes.some((x) => x.type === 'post_like') && notes.some((x) => x.type === 'post_comment'), 'they include the like and the comment');
check(notes.every((x) => x.isRead === false), 'all start unread');
await rpc(newbie, 'mark_notifications_read');
check((await rpc(newbie, 'my_notifications')).notifications.every((x) => x.isRead === true), 'mark-as-read sticks');
check((await rpc(b, 'my_notifications')).notifications.every((x) => x.targetUserId === b || x.targetUserId === 'all'), 'nobody sees anyone else\'s notifications');
await rpc(newbie, 'clear_notifications');
check((await rpc(newbie, 'my_notifications')).notifications.length === 0, 'clearing hides them all');
check((await rpc(b, 'my_notifications')).notifications.some((x) => x.targetUserId === 'all') === (raw.notifications.some((x) => x.targetUserId === 'all')), 'clearing is per person: broadcasts stay visible to everyone else');
await expectFail(() => asAnon(db, () => db.query('select public.my_notifications()')), /permission denied/, 'logged-out visitors can not read notifications');

// =====================================================================================
section('10. Security of the helpers');
await expectFail(() => call(a, `select public.award_points($1, 999999999, 'gift')`, [a]), /permission denied/, 'a user can NOT call the points helper to give themselves points');
await expectFail(() => call(a, `select public.notify_user($1, 'system', $2, 'forged')`, [b, admin]), /permission denied/, 'a user can NOT forge a notification from someone else');
await expectFail(() => asAnon(db, () => db.query('select public.toggle_follow($1)', [b])), /permission denied/, 'a logged-out visitor can not follow');
check((await asAnon(db, async () => (await db.query(`select public.username_taken('zzz-free-name') t`)).rows[0].t)) === false, 'the username availability check works logged-out');

// =====================================================================================
section('11. Deleting an account');
await db.query(`update auth.users set encrypted_password = extensions.crypt('correct horse', extensions.gen_salt('bf')) where id = $1`, [c]);
await expectFail(() => rpc(c, 'delete_my_account', 'wrong'), /Incorrect password/, 'a wrong password does not delete the account');
await expectFail(() => rpc(admin, 'delete_my_account', 'anything'), /Incorrect password|cannot be deleted/, 'the main admin account can not be deleted');
const cPosts = await n('select count(*)::int n from posts where user_id = $1', [c]);
const del = await rpc(c, 'delete_my_account', 'correct horse');
check(del.success === true && (await n('select count(*)::int n from profiles where id = $1', [c])) === 0 && (await n('select count(*)::int n from auth.users where id = $1', [c])) === 0, 'with the right password the account and its login are gone');
check((await n('select count(*)::int n from follows where follower_id = $1 or followee_id = $1', [c])) === 0 && (await n('select count(*)::int n from posts where user_id = $1', [c])) === 0, '...along with its follows and posts');

// =====================================================================================
section('12. Media storage and the inline-image guard');
const run = (uid, sql, params = []) => asUser(db, uid, () => db.query(sql, params));
check((await n(`select count(*)::int n from storage.buckets where id = 'media' and public and file_size_limit = 52428800`)) === 1, 'a public "media" bucket exists with the 50 MB limit');
await run(a, `insert into storage.objects (bucket_id, name, owner_id) values ('media', 'posts/t1.jpg', $1)`, [a]);
check((await n(`select count(*)::int n from storage.objects where name = 'posts/t1.jpg'`)) === 1, 'a signed-in user can upload into a known folder');
await expectFail(() => run(a, `insert into storage.objects (bucket_id, name, owner_id) values ('media', 'secret/x.jpg', $1)`, [a]), /row-level security/, 'uploading into an unknown folder is refused');
await expectFail(() => run(a, `insert into storage.objects (bucket_id, name, owner_id) values ('other-bucket', 'posts/x.jpg', $1)`, [a]), /row-level security/, 'uploading into any other bucket is refused');
await expectFail(() => asAnon(db, () => db.query(`insert into storage.objects (bucket_id, name) values ('media', 'posts/anon.jpg')`)), /row-level security|permission denied/, 'a logged-out visitor can NOT upload');
check((await asAnon(db, async () => (await db.query('select count(*)::int n from storage.objects')).rows[0].n)) === 0, 'a logged-out visitor can not list the bucket\'s files');
check((await run(b, 'select count(*)::int n from storage.objects')).rows[0].n === 0 && (await run(a, 'select count(*)::int n from storage.objects')).rows[0].n === 1, 'a signed-in user can list only their OWN files, never other people\'s');
check((await run(b, `delete from storage.objects where name = 'posts/t1.jpg'`)).affectedRows === 0, 'you can NOT delete someone else\'s file');
check((await run(a, `delete from storage.objects where name = 'posts/t1.jpg'`)).affectedRows === 1, 'you CAN delete your own file');
await run(a, `insert into storage.objects (bucket_id, name, owner_id) values ('media', 'posts/t2.jpg', $1)`, [a]);
check((await run(admin, `delete from storage.objects where name = 'posts/t2.jpg'`)).affectedRows === 1, 'the admin can remove any file (moderation)');

const big = 'data:image/jpeg;base64,' + 'A'.repeat(40000);
await expectFail(() => run(a, 'update profiles set avatar = $1 where id = $2', [big, a]), /too large/, 'a huge inline profile photo is refused (the original bandwidth bug can not come back)');
await expectFail(() => rpc(a, 'create_post', [{ mediaUrl: big, mediaType: 'image' }], 'x', 'tech', [], null, null), /too large/, 'a huge inline picture in a post is refused');
check((await run(a, 'update profiles set avatar = $1 where id = $2', ['avatars/normal-key.jpg', a])).affectedRows === 1, 'a normal file key is accepted');
check((await run(a, 'update profiles set avatar = $1 where id = $2', ['data:image/png;base64,iVBORw0KGgo=', a])).affectedRows === 1, 'a tiny inline image is still fine');
await expectFail(() => db.query(`insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'big@users.nooob.xyz', $1::jsonb)`, [j({ username: 'bigphoto', avatar: big })]), /too large/, 'a sign-up carrying a huge inline photo is refused');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
