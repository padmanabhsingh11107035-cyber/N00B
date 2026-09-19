// Tests for supabase phase 2a (stories, highlights, reels, music, stickers, collections) on a REAL
// Postgres (PGlite) holding the real backup, as real signed-in users — including the attacks that must fail.
//
// Usage: node scripts/supabase/test-phase2.mjs [backup-folder]
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

// ---- people, picked by role
const profByLegacy = Object.fromEntries((await db.query('select * from profiles')).rows.map((p) => [p.legacy_id, p]));
const idOf = (u) => profByLegacy[u.id].id;
const adminRaw = raw.users.find((u) => u.isAdmin);
const publicRaw = raw.users.filter((u) => u.accountType !== 'private' && !u.isAdmin);
const privateRaw = raw.users.filter((u) => u.accountType === 'private');
const [aRaw, bRaw, cRaw, dRaw] = publicRaw.filter((u) => (u.password || '').length > 0);
const admin = idOf(adminRaw), a = idOf(aRaw), b = idOf(bRaw), c = idOf(cRaw), d = idOf(dRaw), priv = idOf(privateRaw[0]);

const call = (uid, sql, params = []) => asUser(db, uid, async () => (await db.query(sql, params)).rows);
const run = (uid, sql, params = []) => asUser(db, uid, () => db.query(sql, params));
const rpc = async (uid, fn, ...args) => (await call(uid, `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args))[0].r;
const n = async (sql, params = []) => (await db.query(sql, params)).rows[0].n;
const points = async (id) => Number((await db.query('select noob_points p from profiles where id = $1', [id])).rows[0].p);
const clean = async () => { // start from a clean social graph between the people used below
  const ids = [a, b, c, d, priv].map((x) => `'${x}'`).join(',');
  await db.query(`delete from follows where follower_id in (${ids}) or followee_id in (${ids})`);
  await db.query(`delete from blocks where blocker_id in (${ids}) or blocked_id in (${ids})`);
};
await clean();
// some real accounts are Pro or posted recently — start everyone on the free tier with a clean posting/wallet history
{ const ids = [a, b, c, d, priv].map((x) => `'${x}'`).join(','); await db.query(`update profiles set pro_tier = null, extra = extra - 'lastContentPostAt' where id in (${ids})`); await db.query(`delete from noob_transactions where user_id in (${ids}) and reason in ('Published a reel', 'Commented on a reel')`); }

// =====================================================================================
section('1. Stories');
const st = await rpc(a, 'create_story', 'stories/s1.jpg', 'image', [{ type: 'poll', data: { q: 'hi' }, x: 10, y: 20 }], false);
check(st.userId === a && st.mediaUrl === 'stories/s1.jpg' && st.isViewed === false && Array.isArray(st.comments) && st.comments.length === 0 && st.stickers.length === 1, 'a story is created with its stickers');
check(Math.abs(new Date(st.expiresAt) - new Date(st.createdAt) - 24 * 3600e3) < 5000, 'it expires 24 hours after it was made');
check(st.username && 'userAvatar' in st && 'isVerified' in st, 'it carries the author\'s card');
await expectFail(() => rpc(a, 'create_story', '', 'image', [], false), /needs a picture or video/, 'a story needs media');
await expectFail(() => asAnon(db, () => db.query(`select public.create_story('x')`)), /permission denied/, 'a logged-out visitor can not post a story');
check((await rpc(b, 'active_stories')).some((s) => s.id === st.id), 'other people see an active story');
// private accounts
const pst = await rpc(priv, 'create_story', 'stories/p1.jpg');
check(!(await rpc(c, 'active_stories')).some((s) => s.id === pst.id), 'a stranger can NOT see a private account\'s story');
check((await rpc(priv, 'active_stories')).some((s) => s.id === pst.id), 'the private account sees its own');
await db.query('insert into follows (follower_id, followee_id) values ($1, $2)', [c, priv]);
check((await rpc(c, 'active_stories')).some((s) => s.id === pst.id), 'an approved follower can see it');
await db.query('delete from follows where follower_id = $1', [c]);
// views
check((await rpc(b, 'record_story_view', st.id)).viewsCount === 1 && (await rpc(b, 'record_story_view', st.id)).viewsCount === 1, 'a view counts once per person');
await rpc(a, 'record_story_view', st.id);
check((await rpc(a, 'story_viewers', st.id)).users.length === 1, 'the owner\'s own view is not counted, and they see the viewer list');
await expectFail(() => rpc(b, 'story_viewers', st.id), /Only the story owner/, 'only the owner can see who viewed');
check((await rpc(b, 'active_stories')).find((s) => s.id === st.id).isViewed === true, 'a story you watched shows as viewed');
check((await rpc(a, 'active_stories')).find((s) => s.id === st.id).viewedBy.length === 1 && (await rpc(c, 'active_stories')).find((s) => s.id === st.id).viewedBy.length === 0, 'the viewer ids are shown to the owner only');
// comments
const sc = await rpc(b, 'add_story_comment', st.id, 'x'.repeat(600));
check(sc.comment.text.length === 500 && sc.comment.username, 'a story comment is capped at 500 characters');
await expectFail(() => rpc(b, 'add_story_comment', st.id, '  '), /cannot be empty/, 'an empty story comment is refused');
check((await rpc(c, 'active_stories')).find((s) => s.id === st.id).comments.length === 1, 'story comments come with the story');
await expectFail(() => rpc(c, 'add_story_comment', pst.id, 'hi'), /cannot view this story/, 'you can not comment on a private account\'s story');
// expiry
await db.query(`update stories set expires_at = now() - interval '2 hours' where id = $1`, [st.id]);
check(!(await rpc(b, 'active_stories')).some((s) => s.id === st.id), 'an expired story disappears');
await expectFail(() => rpc(b, 'add_story_comment', st.id, 'late'), /not found or has expired/, 'you can not comment on an expired story');
await expectFail(() => call(a, 'select public.cleanup_expired_stories()'), /permission denied/, 'the cleanup job can not be run from a browser');
check((await db.query('select public.cleanup_expired_stories() n')).rows[0].n === 1 && (await n('select count(*)::int n from stories where id = $1', [st.id])) === 0, 'the cleanup job removes stories a while after expiry');
// delete
const st2 = await rpc(a, 'create_story', 'stories/s2.jpg');
check((await run(b, 'delete from stories where id = $1', [st2.id])).affectedRows === 0, 'a stranger can NOT delete your story');
check((await run(a, 'delete from stories where id = $1', [st2.id])).affectedRows === 1, 'you can delete your own story');
const st3 = await rpc(a, 'create_story', 'stories/s3.jpg');
check((await run(admin, 'delete from stories where id = $1', [st3.id])).affectedRows === 1, 'the admin can delete any story');
// highlights
const hl = await rpc(a, 'create_highlight', 'Trip', 'stories/cover.jpg', [st3.id]);
check(hl.highlight.title === 'Trip' && (await rpc(a, 'my_highlights')).length === 1 && (await rpc(b, 'my_highlights')).length === 0, 'highlights are yours alone');
await expectFail(() => rpc(a, 'create_highlight', ' ', '', []), /needs a title/, 'a highlight needs a title');

// =====================================================================================
section('2. Reels');
const reel = await rpc(b, 'create_reel', 'reels/r1.mp4', 'reels/r1.jpg', 'my reel', null, ['fun'], 'memes');
check(reel.userId === b && reel.videoUrl === 'reels/r1.mp4' && reel.viewsCount === 1 && reel.durationSeconds === 15 && reel.category === 'memes', 'a reel is created');
check(reel.audioTrack.title === 'Original Sound' && reel.audioTrack.artist === reel.username, 'a reel without music gets "Original Sound" by its author');
const bBefore = await points(b);
check((await n(`select count(*)::int n from noob_transactions where user_id = $1 and reason = 'Published a reel' and amount = 25`, [b])) === 1, 'publishing a reel writes a 25-point wallet entry');
await expectFail(() => rpc(b, 'create_reel', 'reels/r2.mp4'), /one post or reel per day/, 'a second reel the same day is refused');
await expectFail(() => rpc(b, 'create_post', [{ mediaUrl: 'posts/x.jpg' }], 'x', 'tech', [], null, null), /one post or reel per day/, 'the daily limit is shared between posts and reels');
await db.query(`update profiles set pro_tier = 'starter' where id = $1`, [b]);
check((await rpc(b, 'create_reel', 'reels/r2.mp4')).videoUrl === 'reels/r2.mp4', 'Pro accounts have no daily limit');
await db.query(`update profiles set pro_tier = null where id = $1`, [b]);
await expectFail(() => rpc(b, 'create_reel', ' '), /needs a video/, 'a reel needs a video');
await expectFail(() => run(b, `insert into reels (user_id, video_url) values ($1, 'x')`, [b]), /permission denied/, 'publishing by writing to the table directly is not allowed');
check((await rpc(a, 'feed_reels')).some((r) => r.id === reel.id && r.isFollowing === false && r.isLiked === false), 'reels appear in everyone\'s feed');
const preel = await rpc(priv, 'create_reel', 'reels/priv.mp4');
check(!(await rpc(c, 'feed_reels')).some((r) => r.id === preel.id), 'a stranger can NOT see a private account\'s reel');
// likes
const l1 = await rpc(a, 'toggle_reel_like', reel.id);
check(l1.isLiked === true && l1.likesCount === 1, 'liking a reel works');
check((await n(`select count(*)::int n from notifications where type = 'post_like' and reel_id = $1 and target_user_id = $2 and message = 'liked your reel.'`, [reel.id, b])) === 1, '...and notifies the reel\'s author');
check((await rpc(a, 'feed_reels')).find((r) => r.id === reel.id).isLiked === true, 'the feed shows my like');
check((await rpc(b, 'reel_likers', reel.id)).users.length === 1, 'the likers list works');
check((await rpc(a, 'toggle_reel_like', reel.id)).likesCount === 0, 'unliking lowers it');
await rpc(b, 'toggle_reel_like', reel.id);
check((await n(`select count(*)::int n from notifications where type = 'post_like' and reel_id = $1 and actor_id = $2`, [reel.id, b])) === 0, 'liking your own reel does not notify you');
check((await rpc(a, 'toggle_reel_save', reel.id)).isSaved === true && (await rpc(a, 'toggle_reel_save', reel.id)).savesCount === 0, 'saving and unsaving a reel works');
// views & history
const v1 = await rpc(a, 'record_reel_view', reel.id);
const v2 = await rpc(a, 'record_reel_view', reel.id);
check(v2.viewsCount === v1.viewsCount + 1, 'every watch adds to the view counter');
check((await rpc(b, 'reel_viewers', reel.id)).users.length === 1, 'but the viewer list shows each person once');
await expectFail(() => rpc(a, 'reel_viewers', reel.id), /Only the reel owner/, 'only the owner can see who viewed');
const reel3 = await rpc(c, 'create_reel', 'reels/c1.mp4');
await rpc(a, 'record_reel_view', reel3.id);
await rpc(a, 'record_reel_view', reel.id);
const hist = await rpc(a, 'reel_history');
check(hist.length === 2 && hist[0].id === reel.id && hist[1].id === reel3.id, 'my watch history lists what I watched, most recent first (re-watching moves it to the top)');
check((await rpc(d, 'reel_history')).length === 0, 'watch history is private to each person (the old server shared one list)');
await expectFail(() => rpc(c, 'record_reel_view', preel.id), /cannot view this reel/, 'you can not watch a private account\'s reel');
// comments
const aPts = await points(a);
const rc = await rpc(a, 'add_reel_comment', reel.id, 'love it');
check(rc.comment.text === 'love it' && rc.comment.postId === reel.id && rc.comment.reelId === reel.id, 'a reel comment is created (postId carries the reel id, as before)');
check((await points(a)) === aPts + 5 && (await n(`select count(*)::int n from noob_transactions where user_id = $1 and reason = 'Commented on a reel'`, [a])) === 1, 'commenting on a reel earns 5 points');
check((await n(`select count(*)::int n from notifications where type = 'post_comment' and reel_id = $1 and target_user_id = $2`, [reel.id, b])) === 1, '...and notifies the author');
check((await rpc(c, 'reel_comments', reel.id)).comments.length === 1 && (await n('select comments_count n from reels where id = $1', [reel.id])) === 1, 'reel comments load and are counted');
await expectFail(() => rpc(a, 'toggle_pin_comment', rc.comment.id), /Only the owner/, 'the commenter can not pin their own comment');
check((await rpc(b, 'toggle_pin_comment', rc.comment.id)).isPinned === true, 'the reel\'s owner can pin a comment');
check((await run(c, 'delete from comments where id = $1', [rc.comment.id])).affectedRows === 0, 'a stranger can not delete the comment');
check((await run(b, 'delete from comments where id = $1', [rc.comment.id])).affectedRows === 1 && (await n('select comments_count n from reels where id = $1', [reel.id])) === 0, 'the reel\'s owner can delete it, and the counter drops');
// delete
check((await run(c, 'delete from reels where id = $1', [reel.id])).affectedRows === 0, 'a stranger can NOT delete your reel');
check((await run(b, 'delete from reels where id = $1', [reel.id])).affectedRows === 1, 'you can delete your own reel');
check((await run(admin, 'delete from reels where id = $1', [reel3.id])).affectedRows === 1, 'the admin can delete any reel');

// =====================================================================================
section('3. Music');
const trk = await rpc(a, 'upload_music_track', { title: '  My Song  ', audioUrl: 'music/a.mp3', genre: 'Rock' });
check(trk.track.title === 'My Song' && trk.track.uploaderId === a && trk.track.genre === 'Rock' && trk.track.duration === '3:00' && trk.track.artist && trk.track.coverUrl.startsWith('http'), 'a track is uploaded with sensible defaults');
await expectFail(() => rpc(a, 'upload_music_track', { title: '', audioUrl: 'x' }), /title and audio/, 'a track needs a title and audio');
check((await rpc(b, 'list_music_tracks')).length === 1, 'everyone sees the track list');
check((await rpc(b, 'toggle_music_like', trk.track.id)).likesCount === 1 && (await rpc(b, 'list_music_tracks'))[0].isLiked === true, 'liking a track works and shows on the list');
check((await rpc(b, 'toggle_music_like', trk.track.id)).likesCount === 0, 'unliking lowers it');
await expectFail(() => rpc(b, 'rename_music_track', trk.track.id, 'Hijacked'), /Only the publisher/, 'only the uploader can rename a track');
check((await rpc(a, 'rename_music_track', trk.track.id, 'Renamed')).track.title === 'Renamed', 'the uploader can rename it');
check((await run(b, 'delete from music_tracks where id = $1', [trk.track.id])).affectedRows === 0 && (await run(a, 'delete from music_tracks where id = $1', [trk.track.id])).affectedRows === 1, 'only the uploader can delete it');

// =====================================================================================
section('4. Stickers and collections');
const stk = await rpc(a, 'add_sticker', 'stickers/one.png', '  Cool  ');
check(stk.sticker.title === 'Cool' && (await rpc(a, 'my_stickers')).length === 1 && (await rpc(a, 'my_stickers'))[0].url === 'stickers/one.png', 'a sticker is added to my gallery');
check((await rpc(b, 'my_stickers')).length === 0, 'nobody else can see my stickers');
check((await run(b, 'delete from custom_stickers where id = $1', [stk.sticker.id])).affectedRows === 0 && (await run(a, 'delete from custom_stickers where id = $1', [stk.sticker.id])).affectedRows === 1, 'only the owner can delete a sticker');
await expectFail(() => rpc(a, 'add_sticker', ' '), /No uploaded sticker/, 'a sticker needs an uploaded file');

const anyPost = (await db.query('select id from posts limit 1')).rows[0].id;
const col = await rpc(a, 'create_collection', 'Faves', null);
check(col.collection.name === 'Faves' && col.collection.postsCount === 0 && col.collection.coverUrl.startsWith('http'), 'a collection is created (with a default cover)');
const added = await rpc(a, 'add_post_to_collection', col.collection.id, anyPost);
await rpc(a, 'add_post_to_collection', col.collection.id, anyPost);
check(added.collection.postsCount === 1 && (await rpc(a, 'my_collections'))[0].postIds[0] === anyPost && (await rpc(a, 'my_collections')).length === 1, 'adding a post works, and adding it twice is harmless');
check((await rpc(b, 'my_collections')).length === 0, 'collections are private to their owner (the old server shared one list)');
await expectFail(() => rpc(b, 'add_post_to_collection', col.collection.id, anyPost), /Collection not found/, 'you can not add to someone else\'s collection');
check((await rpc(a, 'create_collection', '  ', null)).collection.name === 'New Collection', 'an unnamed collection is called "New Collection"');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
