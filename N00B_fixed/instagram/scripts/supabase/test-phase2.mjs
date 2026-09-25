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
// expiry — a highlight is meant to stay likeable/commentable forever (it's the same row the
// highlight snapshot points back to for live data), so expiring a story only drops it from the
// live 24h tray; it does NOT block new interaction on it or get swept up by cleanup anymore.
await db.query(`update stories set expires_at = now() - interval '2 hours' where id = $1`, [st.id]);
check(!(await rpc(b, 'active_stories')).some((s) => s.id === st.id), 'an expired story disappears from the live tray');
check((await rpc(b, 'add_story_comment', st.id, 'late')).success === true, 'you CAN still comment on an expired story (its highlight keeps this forever)');
check((await rpc(b, 'toggle_story_like', st.id)).isLiked === true, 'and you can still like it');
check((await rpc(b, 'toggle_story_like', st.id)).isLiked === false, '(toggling again un-likes it, same as always)');
await rpc(b, 'toggle_story_like', st.id);
const byIdForOwner = await rpc(a, 'story_by_id', st.id);
check(byIdForOwner.id === st.id && byIdForOwner.comments.length === 2 && byIdForOwner.likesCount === 1, 'story_by_id returns full live data (comments/likes) for an expired story, to the owner');
await expectFail(() => rpc(c, 'story_by_id', pst.id), /cannot see this story/, 'story_by_id still enforces can_view_author — a stranger can not read a private account\'s story this way either');
await expectFail(() => call(a, 'select public.cleanup_expired_stories()'), /permission denied/, 'the cleanup job can not be run from a browser');
check((await db.query('select public.cleanup_expired_stories() n')).rows[0].n === 0 && (await n('select count(*)::int n from stories where id = $1', [st.id])) === 1, 'the cleanup job no longer removes anything — expired stories, and everything liked/said about them, are kept for their highlight');
// delete (now goes through delete_story() — a direct `delete from stories` is refused outright)
await expectFail(() => run(b, 'delete from stories where id = $1', [st.id]), /permission denied/, 'a direct delete on stories is refused for everyone, not just strangers');
const st2 = await rpc(a, 'create_story', 'stories/s2.jpg');
await expectFail(() => rpc(b, 'delete_story', st2.id), /only delete your own/, 'a stranger can NOT delete your story');
check((await rpc(a, 'delete_story', st2.id)).success === true, 'you can delete your own story');
const st3 = await rpc(a, 'create_story', 'stories/s3.jpg');
check((await rpc(admin, 'delete_story', st3.id)).success === true, 'the admin can delete any story');

// =====================================================================================
section('1b. Highlights (auto-saved per day — "story and highlight are the same thing" redesign)');
// `st` expired above but is no longer deleted by cleanup; its snapshot was created back when it
// was originally posted regardless, and must still be sitting in the highlight either way.
const aHl = await rpc(a, 'my_highlights');
check(aHl.length === 1, 'today\'s stories all land in one highlight, not one each');
check(aHl[0].items.some((it) => it.id === st.id), 'a highlight keeps a story\'s content once the story itself expires out of the live tray');
check(!aHl[0].items.some((it) => it.id === st2.id), 'deleting a story also removes it from the highlight');
check(aHl[0].title.length > 0 && aHl[0].dayKey, 'the highlight is titled and keyed by day automatically');
check((await rpc(b, 'my_highlights')).length === 0, 'my_highlights only ever returns your own');
check((await rpc(b, 'highlights_for_user', a)).length === 1, 'someone else can see your highlights (this never worked before this redesign)');
await expectFail(() => rpc(a, 'create_highlight', 'Trip', 'stories/cover.jpg', [st3.id]), /permission denied/, 'the old manual create-highlight path is retired');

// deleting the LAST remaining story of a day must remove the now-empty highlight entirely,
// not leave a title/cover behind with nothing in it
const cSolo = await rpc(c, 'create_story', 'stories/solo.jpg');
check((await rpc(c, 'my_highlights')).length === 1, 'a highlight exists while it has a story in it');
await rpc(c, 'delete_story', cSolo.id);
check((await rpc(c, 'my_highlights')).length === 0, 'and disappears once its only story is deleted');

// private accounts: highlight visibility follows the same can_view_author rule stories already use
const pst2 = await rpc(priv, 'create_story', 'stories/p2.jpg');
check((await rpc(c, 'highlights_for_user', priv)).length === 0, 'a stranger can NOT see a private account\'s highlights');
await db.query('insert into follows (follower_id, followee_id) values ($1, $2)', [c, priv]);
check((await rpc(c, 'highlights_for_user', priv)).length === 1, 'an approved follower can see them');
await db.query('delete from follows where follower_id = $1', [c]);
await rpc(priv, 'delete_story', pst2.id);

// a poll turns into a second page, and it must play right AFTER the main photo, not before —
// even though (as CreateStoryModal does) the poll page is actually posted to the server first.
const pollPage = await rpc(d, 'create_story', 'stories/poll-bg.png', 'image', [{ type: 'poll', data: { question: 'well?', options: ['Yes 🔥', 'No 👎'] }, x: 50, y: 50 }], false);
const mainPhoto = await rpc(d, 'create_story', 'stories/poll-main.jpg');
const dHl = (await rpc(d, 'my_highlights'))[0];
check(dHl.items[0].id === mainPhoto.id && dHl.items[1].id === pollPage.id, 'the main photo plays before its poll page inside the highlight');
check(dHl.coverUrl === 'stories/poll-main.jpg', 'a poll page is never chosen as the highlight cover icon');
check(dHl.isManual === false, 'an auto (from-story) highlight is flagged as not manual');

// archiving the SAME story a second time (a retried post, or a migration backfill step running
// twice — exactly what actually happened in production on 23 Sep) must never duplicate it
await db.query('select public.archive_story_to_highlight(s) from public.stories s where s.id = $1', [mainPhoto.id]);
const dHlAfterRearchive = (await rpc(d, 'my_highlights')).find((h) => h.id === dHl.id);
check(dHlAfterRearchive.items.length === 2 && dHlAfterRearchive.items.filter((it) => it.id === mainPhoto.id).length === 1, 'archiving the same story twice does not duplicate it in the highlight');

// the one-time repair also fixes a highlight some earlier bug already left duplicated
await db.query(`update public.highlights set items = items || (items -> 0) where id = $1`, [dHl.id]);
check((await rpc(d, 'my_highlights')).find((h) => h.id === dHl.id).items.length === 3, '(setup) a highlight with a manually-forced duplicate now has 3 items');
await db.query(`
  update public.highlights h set items = (
    select coalesce(jsonb_agg(picked.elem order by (picked.elem ->> 'createdAt')::timestamptz desc), '[]'::jsonb)
    from (select distinct on (elem ->> 'id') elem from jsonb_array_elements(h.items) elem) picked
  ) where id = $1`, [dHl.id]);
const dHlRepaired = (await rpc(d, 'my_highlights')).find((h) => h.id === dHl.id);
check(dHlRepaired.items.length === 2, 'the repair collapses the duplicate back down to one copy per story');

// =====================================================================================
section('1c. Manual highlights (created directly from the profile, never touching a story)');
await expectFail(() => rpc(b, 'create_manual_highlight', 'My Trip', []), /at least one photo/, 'needs at least one item');
const mh = await rpc(b, 'create_manual_highlight', 'My Trip', [{ mediaUrl: 'stories/manual1.jpg', mediaType: 'image' }, { mediaUrl: 'stories/manual2.jpg', mediaType: 'image' }]);
check(mh.success === true && mh.highlightId, 'a manual highlight is created without posting any story');
check((await rpc(a, 'active_stories')).length === 0 || !(await rpc(a, 'active_stories')).some((s) => s.mediaUrl === 'stories/manual1.jpg'), 'its media never appears as a story');
let bHl = (await rpc(b, 'my_highlights')).find((h) => h.id === mh.highlightId);
check(bHl.title === 'My Trip' && bHl.items.length === 2 && bHl.coverUrl === 'stories/manual1.jpg' && bHl.isManual === true, 'it has the given name, both items, and the first item as cover');

// a title left blank falls back to a date label instead of being empty
const mh2 = await rpc(b, 'create_manual_highlight', '   ', [{ mediaUrl: 'stories/manual3.jpg', mediaType: 'image' }]);
check((await rpc(b, 'my_highlights')).find((h) => h.id === mh2.highlightId).title.length > 0, 'a blank name falls back to an automatic label, never blank');

// rename, add, remove — manual only
await expectFail(() => rpc(a, 'rename_highlight', mh.highlightId, 'Stolen'), /your own highlights/, 'a stranger can not rename your highlight');
check((await rpc(b, 'rename_highlight', mh.highlightId, 'Renamed Trip')).success === true, 'the owner can rename a manual highlight');
check((await rpc(b, 'add_to_highlight', mh.highlightId, [{ mediaUrl: 'stories/manual4.jpg', mediaType: 'image' }])).success === true, 'the owner can add more to a manual highlight');
bHl = (await rpc(b, 'my_highlights')).find((h) => h.id === mh.highlightId);
check(bHl.title === 'Renamed Trip' && bHl.items.length === 3, 'the rename and the added item both stuck');
const removedId = bHl.items[0].id;
check((await rpc(b, 'remove_highlight_item', mh.highlightId, removedId)).success === true, 'the owner can remove one item');
bHl = (await rpc(b, 'my_highlights')).find((h) => h.id === mh.highlightId);
check(bHl.items.length === 2 && !bHl.items.some((it) => it.id === removedId), 'that item is gone, the rest remain');

// removing the last item deletes the whole highlight
for (const it of [...bHl.items]) await rpc(b, 'remove_highlight_item', mh.highlightId, it.id);
check(!(await rpc(b, 'my_highlights')).some((h) => h.id === mh.highlightId), 'removing the last item deletes the manual highlight itself');

// an automatic (from-story) highlight can now be renamed, added to, and have an item removed
// directly, same as a manual one (otherwise there was no working way to edit one of these at all,
// which is exactly what looked like a broken upload button).
check((await rpc(d, 'rename_highlight', dHl.id, 'Renamed Auto')).success === true, 'an automatic highlight can now be renamed too');
check((await rpc(d, 'my_highlights')).find((h) => h.id === dHl.id).title === 'Renamed Auto', '...and the rename stuck');
check((await rpc(d, 'add_to_highlight', dHl.id, [{ mediaUrl: 'stories/extra-on-auto.jpg', mediaType: 'image' }])).success === true, 'it can be added to directly too');
check((await rpc(d, 'my_highlights')).find((h) => h.id === dHl.id).items.length === 3, '...and the new item is really there');
check((await rpc(d, 'remove_highlight_item', dHl.id, mainPhoto.id)).success === true, 'and an item can be removed from it directly now too');
check(!(await rpc(d, 'my_highlights')).find((h) => h.id === dHl.id).items.some((it) => it.id === mainPhoto.id), '...and it is really gone');
await expectFail(() => rpc(b, 'add_to_highlight', dHl.id, [{ mediaUrl: 'x.jpg', mediaType: 'image' }]), /your own highlights/, 'a stranger still can not add to someone else\'s highlight');

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
// replies (same flattened-to-one-level threading as post comments, sharing the same comments table)
{
  const rTop = await rpc(a, 'add_reel_comment', reel.id, 'top-level on a reel');
  const rReply = await rpc(c, 'add_reel_comment', reel.id, 'replying on a reel', rTop.comment.id);
  check(rReply.comment.parentId === rTop.comment.id && rReply.comment.replyToUsername === rTop.comment.username, 'a reel comment reply carries its parent and who it replies to');
  const rReplyToReply = await rpc(d, 'add_reel_comment', reel.id, 'reply to the reply', rReply.comment.id);
  check(rReplyToReply.comment.parentId === rTop.comment.id, 'replying to a reel-comment reply flattens onto the top-level comment');
  await run(b, 'delete from comments where id = any($1::uuid[])', [[rTop.comment.id, rReply.comment.id, rReplyToReply.comment.id]]);
  check((await n('select comments_count n from reels where id = $1', [reel.id])) === 0, 'cleanup: reel comment counter is back to 0');
}
// comments-off / hide-like-count (the same owner controls posts already have)
await expectFail(() => rpc(a, 'toggle_reel_flag', reel.id, 'comments'), /only modify your own reels/, 'a stranger can not turn off comments on someone else\'s reel');
check((await rpc(b, 'toggle_reel_flag', reel.id, 'comments')).isCommentsDisabled === true, 'the owner can turn comments off');
check((await rpc(a, 'feed_reels')).find((r) => r.id === reel.id).isCommentsDisabled === true, '...and the feed reflects it');
await expectFail(() => rpc(a, 'add_reel_comment', reel.id, 'sneaking in'), /Comments are turned off/, 'nobody can comment while it is off, not even via the normal path');
await expectFail(() => run(a, `insert into comments (reel_id, user_id, text) values ($1, $2, 'x')`, [reel.id, a]), /permission denied|new row violates/, '...nor by writing to the table directly');
check((await rpc(b, 'toggle_reel_flag', reel.id, 'comments')).isCommentsDisabled === false, 'and the owner can turn them back on');
check((await rpc(a, 'add_reel_comment', reel.id, 'now it works')).comment.text === 'now it works', 'commenting works again once they are');
check((await rpc(b, 'toggle_reel_flag', reel.id, 'like_count')).isLikeCountHidden === true, 'the owner can hide the like count');
check((await rpc(a, 'feed_reels')).find((r) => r.id === reel.id).isLikeCountHidden === true, '...and the feed reflects that too');
check((await rpc(admin, 'toggle_reel_flag', reel.id, 'comments')).isCommentsDisabled === true, 'an admin can moderate someone else\'s reel settings too');
await expectFail(() => rpc(b, 'toggle_reel_flag', reel.id, 'nonsense'), /Unknown reel setting/, 'an unknown flag name is refused');
await rpc(b, 'toggle_reel_flag', reel.id, 'comments'); // leave comments back on for the deletion checks below
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

// =====================================================================================
section('5. "Followed by" (mutual followers)');
await clean();
// a follows b and c; c also follows b. d follows b too, but a does NOT follow d.
await rpc(a, 'toggle_follow', b);
await rpc(a, 'toggle_follow', c);
await rpc(c, 'toggle_follow', b);
await rpc(d, 'toggle_follow', b);
{
  const mutual = await rpc(a, 'mutual_followers', b);
  check(Array.isArray(mutual) && mutual.length === 1 && mutual[0].id === c, 'viewing b from a shows c (a follows c, c follows b)');
  check(!mutual.some((m) => m.id === d), 'd is not shown even though d follows b too — a does not follow d');
}
{
  const mutualForC = await rpc(a, 'mutual_followers', c);
  check(Array.isArray(mutualForC) && mutualForC.length === 0, 'viewing c from a shows nobody (a follows c directly, but nobody a follows also follows c)');
}
{
  // b follows nobody a follows, and this only looks at who I (a) follow — not who follows me.
  await rpc(b, 'toggle_follow', a); // b now follows a — a's FOLLOWERS gained b, but that must not count
  const mutual = await rpc(a, 'mutual_followers', b);
  check(mutual.length === 1 && mutual[0].id === c, 'a follower of mine following the target does not count — only accounts I follow do');
}
await clean();

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
