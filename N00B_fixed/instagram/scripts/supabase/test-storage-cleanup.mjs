// Tests migration 20261016000005: nothing may sit on the server using space for no reason. A replaced profile picture, a deleted post, an expired story and a finished Daily NOOB
// day all put their OLD files in a deletion queue; the queue is only emptied for files that nothing uses any more; files left behind long ago are found by a scan and queued.
// On a REAL Postgres (PGlite) with every migration applied.
//
// Usage: node scripts/supabase/test-storage-cleanup.mjs
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const expectFail = async (fn, pattern, label) => {
  try { await fn(); check(false, label, '(expected an error, but it succeeded)'); }
  catch (e) { check(pattern.test(e.message), label, `(got: ${e.message})`); }
};
const section = (t) => console.log(`\n${t}`);

const db = await createTestDb();
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const mkUser = async (name, patch = {}) => {
  const id = (await q(`select gen_random_uuid() as id`))[0].id;
  await q(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  if (!(await q(`select 1 from public.profiles where id = $1`, [id])).length) await q(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, name]);
  for (const [col, val] of Object.entries(patch)) await q(`update public.profiles set ${col} = $2 where id = $1`, [id, val]);
  return id;
};
const call = (uid, sql, params = []) => asUser(db, uid, async () => (await db.query(sql, params)).rows);
const rpc = async (uid, fn, ...args) => (await call(uid, `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args))[0].r;
const trash = async () => (await q(`select key, reason, delete_after > now() as waiting, extract(epoch from (delete_after - now())) as secs from public.media_trash order by key`));
const inTrash = async (key) => (await q(`select 1 from public.media_trash where key = $1`, [key])).length === 1;
const dueNow = () => q(`update public.media_trash set delete_after = now() - interval '1 minute'`);
const secret = (await q(`select value from public.internal_config where key = 'push_secret'`))[0].value;
const take = async (limit = 100, s = secret) => (await q(`select public.media_purge_take($1, $2) as r`, [s, limit]))[0].r;

const admin = await mkUser('boss', { is_admin: true });
const ann = await mkUser('ann');
const bob = await mkUser('bob');

section('1. Which values count as one of our files');
const key = async (v) => (await q(`select public.media_key_of($1) as k`, [v]))[0].k;
check(await key('avatars/1760-abc.jpg') === 'avatars/1760-abc.jpg', 'a plain name');
check(await key('/media/avatars/1760-abc.jpg') === 'avatars/1760-abc.jpg', 'the form the app stores: /media/...');
check(await key('https://noobsocials.com/media/posts/p1.jpg?x=1') === 'posts/p1.jpg', 'a full address of the site, query dropped');
check(await key('https://abc.supabase.co/storage/v1/object/public/media/reels/r.mp4') === 'reels/r.mp4', 'a full storage address');
check(await key('/noob-logo.svg.jpeg') === null && await key('/live-avatars/aurora.svg') === null, 'built-in pictures are not files in the bucket');
check(await key('https://images.unsplash.com/photo-1.jpg') === null && await key('data:image/png;base64,AAA') === null && await key('pending:123') === null && await key('') === null && await key(null) === null, 'outside links, base64, unfinished uploads and nothing are not files');
check(await key('weird/../../etc/passwd') === null && await key('secrets/a.jpg') === null && await key('avatars/a/b.jpg') === null, 'unknown folders, extra levels and path tricks are never accepted');

section('2. A replaced profile picture goes to the queue (1 hour), the new one does not');
await q(`update public.profiles set avatar = '/media/avatars/old1.jpg' where id = $1`, [ann]);
check((await trash()).length === 0, 'the first picture ever (replacing the built-in one) queues nothing');
await q(`update public.profiles set avatar = '/media/avatars/new1.jpg' where id = $1`, [ann]);
let t = await trash();
check(t.length === 1 && t[0].key === 'avatars/old1.jpg' && t[0].reason === 'profiles.avatar', 'the old picture is queued', JSON.stringify(t));
check(t[0].secs > 3000 && t[0].secs <= 3600, 'to be removed in about an hour', String(t[0].secs));
await q(`update public.profiles set avatar = '/media/avatars/new1.jpg', bio = 'hi' where id = $1`, [ann]);
check((await trash()).length === 1, 'saving the profile with the same picture queues nothing');
await q(`update public.profiles set avatar = 'https://lh3.googleusercontent.com/a/x' where id = $1`, [bob]);
await q(`update public.profiles set avatar = '/media/avatars/bob1.jpg' where id = $1`, [bob]);
await q(`update public.profiles set avatar = 'https://lh3.googleusercontent.com/a/y' where id = $1`, [bob]);
check((await trash()).length === 2 && await inTrash('avatars/bob1.jpg'), 'going back to an outside picture queues the file that was replaced');
await q(`update public.profiles set live_avatar_video_url = '/media/avatars/live1.mp4' where id = $1`, [ann]);
await q(`update public.profiles set live_avatar_video_url = null where id = $1`, [ann]);
check(await inTrash('avatars/live1.mp4'), 'a removed live picture is queued too');

section('3. Deleted posts, stories, reels and accounts');
const post = (await q(`insert into public.posts (user_id, caption) values ($1, 'p') returning id`, [ann]))[0].id;
await q(`insert into public.post_slides (post_id, position, media_url, media_type) values ($1, 0, '/media/posts/gone.jpg', 'image'), ($1, 1, '/media/posts/gone2.jpg', 'image')`, [post]);
await q(`delete from public.posts where id = $1`, [post]);
check(await inTrash('posts/gone.jpg') && await inTrash('posts/gone2.jpg'), 'deleting a post queues every picture of it');
check(Math.round((await trash()).find((x) => x.key === 'posts/gone.jpg').secs / 3600) === 24, '... to be removed in 24 hours');
const story = (await q(`insert into public.stories (user_id, media_url) values ($1, '/media/stories/s1.jpg') returning id`, [ann]))[0].id;
await q(`delete from public.stories where id = $1`, [story]);
check(await inTrash('stories/s1.jpg'), 'a story that is removed queues its file (stories are kept as highlights, so nothing removes them by time)');
const reel = (await q(`insert into public.reels (user_id, video_url, thumbnail_url) values ($1, '/media/reels/r1.mp4', '/media/reels/r1.jpg') returning id`, [ann]))[0].id;
await q(`delete from public.reels where id = $1`, [reel]);
check(await inTrash('reels/r1.mp4') && await inTrash('reels/r1.jpg'), 'a deleted reel queues its video and its cover');
const gone = await mkUser('gone', { avatar: '/media/avatars/gone-avatar.jpg' });
await q(`delete from public.profiles where id = $1`, [gone]);
check(await inTrash('avatars/gone-avatar.jpg'), 'a deleted account\'s picture is queued');

section('4. The queue is emptied only for files nothing uses, and only when due');
await q(`delete from public.media_trash`);
for (const k of ['avatars/free1.jpg', 'avatars/shared.jpg', 'avatars/inpost.jpg']) await q(`insert into public.media_trash (key, reason, delete_after) values ($1, 'test', now() + interval '1 hour')`, [k]);
await expectFail(() => take(100, 'wrong'), /Unauthorized/, 'a wrong private password is refused');
await expectFail(() => take(100, ''), /Unauthorized/, 'an empty one too');
await expectFail(async () => (await asAnon(db, async () => db.query(`select public.media_purge_take($1, 10)`, [secret]))), /permission denied/i, 'a signed-out visitor cannot call it at all');
await expectFail(() => call(ann, `select public.media_purge_take($1, 10)`, [secret]), /permission denied/i, 'neither can an ordinary member');
check((await take()).length === 0, 'nothing is handed out before its time');
await dueNow();
await q(`update public.profiles set avatar = '/media/avatars/shared.jpg' where id = $1`, [bob]);       // still in use as someone's picture
const p2 = (await q(`insert into public.posts (user_id, caption) values ($1, 'p2') returning id`, [ann]))[0].id;
await q(`insert into public.post_slides (post_id, position, media_url, media_type) values ($1, 0, 'https://noobsocials.com/media/avatars/inpost.jpg', 'image')`, [p2]);   // in use in another shape
const got = await take();
check(got.length === 1 && got[0] === 'avatars/free1.jpg', 'only the unused file is handed out', JSON.stringify(got));
check(!(await inTrash('avatars/shared.jpg')) && !(await inTrash('avatars/inpost.jpg')), 'files that something still points to are kept and their requests dropped');
const attempts = async (k) => (await q(`select attempts from public.media_trash where key = $1`, [k]))[0]?.attempts;
check(await attempts('avatars/free1.jpg') === 1, 'handing out counts an attempt');
await q(`select public.media_purge_done($1, $2::text[], 'storage said no')`, [secret, ['avatars/free1.jpg']]);
check(await inTrash('avatars/free1.jpg') && (await q(`select last_error from public.media_trash where key = 'avatars/free1.jpg'`))[0].last_error === 'storage said no', 'a failed removal stays queued, with the reason');
check((await take()).length === 1, '... and is offered again');
await q(`select public.media_purge_done($1, $2::text[])`, [secret, ['avatars/free1.jpg']]);
check(!(await inTrash('avatars/free1.jpg')), 'a successful removal clears it from the queue');
for (let i = 0; i < 9; i++) { await q(`insert into public.media_trash (key, reason, delete_after) values ('avatars/stuck.jpg', 't', now() - interval '1 minute') on conflict (key) do nothing`); await take(); }
check((await q(`select attempts from public.media_trash where key = 'avatars/stuck.jpg'`))[0].attempts === 8 && (await take()).length === 0, 'a file that fails 8 times is left alone (listed as failed for the admin)');
await q(`delete from public.media_trash`);

section('5. The switch, and the admin\'s own "remove now"');
await q(`insert into public.media_trash (key, reason, delete_after) values ('avatars/sw1.jpg', 't', now() - interval '1 minute')`);
await rpc(admin, 'admin_set_media_cleanup', false);
check((await take()).length === 0, 'with automatic cleanup switched off the server hands out nothing');
const mine = await rpc(admin, 'admin_media_purge_take', 50);
check(mine.length === 1 && mine[0] === 'avatars/sw1.jpg', 'the admin\'s own "remove now" still works');
await rpc(admin, 'admin_media_purge_done', mine);
check(!(await inTrash('avatars/sw1.jpg')), '... and clears what it removed');
await rpc(admin, 'admin_set_media_cleanup', true);
await expectFail(() => rpc(ann, 'admin_media_purge_take', 5), /Admin only/, 'a member cannot use the admin\'s remove-now');
await expectFail(() => rpc(ann, 'admin_set_media_cleanup', false), /Admin only/, 'a member cannot switch the cleanup off');
await expectFail(() => rpc(ann, 'admin_storage_overview'), /Admin only/, 'a member cannot read the storage overview');
await expectFail(() => rpc(ann, 'admin_media_scan', 3), /Admin only/, 'a member cannot scan');
await expectFail(() => rpc(ann, 'admin_media_queue_unused', 3, 10), /Admin only/, 'a member cannot queue files');
await expectFail(() => rpc(ann, 'admin_media_trash_cancel'), /Admin only/, 'a member cannot cancel');
await expectFail(() => rpc(ann, 'admin_daily_overview'), /Admin only/, 'a member cannot open the Daily NOOB admin page');
await expectFail(async () => (await asAnon(db, async () => db.query(`select public.admin_storage_overview()`))), /permission denied/i, 'a visitor cannot call any admin function');

section('6. Finding files that were left behind long ago');
await q(`delete from public.posts`);
await q(`update public.profiles set avatar = '/noob-logo.svg.jpeg', live_avatar_video_url = null`);
await q(`delete from public.media_trash`);
const obj = (name, ageDays, size = 1000) => q(`insert into storage.objects (bucket_id, name, created_at, metadata) values ('media', $1, now() - ($2 || ' days')::interval, jsonb_build_object('size', $3::int))`, [name, String(ageDays), size]);
await obj('avatars/used-bare.jpg', 30);
await obj('avatars/used-slash.jpg', 30);
await obj('posts/used-full.jpg', 30);
await obj('music/used-json.mp3', 30);
await obj('avatars/orphan1.jpg', 30, 5000);
await obj('avatars/orphan2.jpg', 10, 7000);
await obj('posts/orphan3.jpg', 5, 2000);
await obj('avatars/fresh.jpg', 1, 900);                   // too new: an upload that has no row yet
await obj('posts/odd name (1).jpg', 30, 400);              // unusual name: never touched
await obj('avatars/queued.jpg', 30, 100);
await q(`update public.profiles set avatar = 'avatars/used-bare.jpg' where id = $1`, [ann]);
await q(`update public.profiles set avatar = '/media/avatars/used-slash.jpg' where id = $1`, [bob]);
const p3 = (await q(`insert into public.posts (user_id, caption, audio_track) values ($1, 'p3', '{"title":"x","audioUrl":"/media/music/used-json.mp3"}'::jsonb) returning id`, [ann]))[0].id;
await q(`insert into public.post_slides (post_id, position, media_url, media_type) values ($1, 0, 'https://abc.supabase.co/storage/v1/object/public/media/posts/used-full.jpg', 'image')`, [p3]);
await q(`insert into public.media_trash (key, reason, delete_after) values ('avatars/queued.jpg', 'x', now() + interval '1 hour')`);
const scan = await rpc(admin, 'admin_media_scan', 3);
check(scan.files === 3 && scan.bytes === 14000, 'the scan finds exactly the three unused, old, normally named files', JSON.stringify(scan));
check(scan.folders.length === 2 && scan.folders.find((f) => f.folder === 'avatars').files === 2 && scan.folders.find((f) => f.folder === 'posts').bytes === 2000, 'grouped by folder with sizes', JSON.stringify(scan.folders));
check(!scan.sample.includes('avatars/used-bare.jpg') && !scan.sample.includes('posts/used-full.jpg') && !scan.sample.includes('music/used-json.mp3'), 'a file used as a bare name, as /media/..., as a full address or inside a json value is never listed');
check((await rpc(admin, 'admin_media_scan', 7)).files === 2, 'a longer minimum age leaves out the newer one');
check((await trash()).length === 1, 'scanning changes nothing');
const queued = await rpc(admin, 'admin_media_queue_unused', 3, 2);
check(queued.queued === 2 && queued.remaining === 1, 'queuing respects the limit', JSON.stringify(queued));
const qd = await trash();
check(qd.filter((x) => x.reason === 'unused file').length === 2 && qd.every((x) => x.waiting), 'the queued ones wait (24 hours) before removal');
check(Math.round(qd.find((x) => x.reason === 'unused file').secs / 3600) === 24, '... exactly 24 hours');
const qd2 = await rpc(admin, 'admin_media_queue_unused', 3, 500);
check(qd2.queued === 1 && qd2.remaining === 0, 'the rest follow on the next click; nothing is queued twice', JSON.stringify(qd2));
await dueNow();
const handed = await take();
check(handed.length === 4 && !handed.includes('avatars/used-bare.jpg'), 'when due, only the unused files are handed out (the used ones never)', JSON.stringify(handed));
await mkUser('late', { avatar: '/media/avatars/orphan1.jpg' });
await q(`insert into public.media_trash (key, reason, delete_after) values ('avatars/orphan1.jpg', 'unused file', now() - interval '1 minute') on conflict (key) do update set delete_after = excluded.delete_after`);
check(!(await take()).includes('avatars/orphan1.jpg'), 'a file that gets used again before its time is saved at the last moment');
const ov = await rpc(admin, 'admin_storage_overview');
check(ov.files === 10 && ov.bytes === 5000 + 7000 + 2000 + 900 + 400 + 100 + 4000, 'the overview counts the bucket', JSON.stringify(ov));
check(ov.cleanupEnabled === true && typeof ov.queue.pending === 'number' && ov.folders.length >= 3, 'and the queue and the switch');
check((await rpc(admin, 'admin_media_trash_cancel')).cancelled >= 1 && (await trash()).length === 0, 'cancel empties the queue');

section('7. Daily NOOB: a finished day is settled, paid and wiped, with its files queued');
await q(`delete from public.media_trash`);
const e1 = await mkUser('e1'), e2 = await mkUser('e2'), e3 = await mkUser('e3'), e4 = await mkUser('e4');
await q(`insert into public.daily_challenge_prompts (prompt) select 'x' where not exists (select 1 from public.daily_challenge_prompts)`);
await q(`insert into public.daily_challenges (challenge_date, prompt_id) values (current_date - 1, (select min(id) from public.daily_challenge_prompts)), (current_date - 2, (select min(id) from public.daily_challenge_prompts)), (current_date, (select min(id) from public.daily_challenge_prompts)) on conflict do nothing`);
const voterPool = [];
for (let i = 0; i < 8; i++) voterPool.push(await mkUser('voter' + i));
const voterAt = {};    // one vote per person per day
const entry = async (date, uid, url, votes) => {
  const id = (await q(`insert into public.daily_challenge_entries (challenge_date, user_id, media_url, media_type) values (current_date + $1::int, $2, $3, 'image') returning id`, [date, uid, url]))[0].id;
  const used = (voterAt[date] ??= 0);
  const voters = voterPool.slice(used, used + votes);
  voterAt[date] = used + votes;
  for (const v of voters) await q(`insert into public.daily_challenge_votes (challenge_date, voter_id, entry_id) values (current_date + $1::int, $2, $3)`, [date, v, id]);
  return id;
};
await entry(-1, e1, '/media/daily/a.jpg', 3);
await entry(-1, e2, '/media/daily/b.jpg', 2);
await entry(-1, e3, '/media/daily/c.jpg', 1);
await entry(-1, e4, '/media/daily/d.jpg', 0);
await entry(0, e1, '/media/daily/today1.jpg', 1);
const points = async (uid) => Number((await q(`select noob_points from public.profiles where id = $1`, [uid]))[0].noob_points);
const before = [await points(e1), await points(e2), await points(e3), await points(e4)];
const ovd = await rpc(admin, 'admin_daily_overview');
check(ovd.date === ovd.today && ovd.entries.length === 1 && ovd.entries[0].username === 'e1' && ovd.entries[0].mediaUrl === '/media/daily/today1.jpg', 'the admin page shows today\'s entries by itself, with everything needed', JSON.stringify(ovd.entries));
check((await points(e1)) - before[0] === 10000 && (await points(e2)) - before[1] === 5000 && (await points(e3)) - before[2] === 2500 && (await points(e4)) === before[3], 'opening it settled yesterday: 10,000 / 5,000 / 2,500 to the top three by votes, nothing to the rest');
check((await q(`select count(*)::int n from public.daily_challenge_entries where challenge_date < current_date`))[0].n === 0 && (await q(`select count(*)::int n from public.daily_challenge_votes where challenge_date < current_date`))[0].n === 0, 'yesterday\'s entries and votes are permanently gone from the database');
check((await trash()).filter((x) => x.reason === 'daily_challenge_entries.media_url').length === 4, 'and all four files (winners and not) are queued for removal from the server');
check((await trash()).every((x) => x.secs <= 600), '... within ten minutes');
check(ovd.filesQueued === 4 || ovd.filesQueued === 0, 'the page reports the queue');
const days = (await rpc(admin, 'admin_daily_overview', new Date().toISOString().slice(0, 10))).days;
check(days.length >= 3 && days.find((d) => d.settled && d.winner === 'e1') && days.find((d) => !d.settled && d.entries === 1), 'the list of recent days shows settled ones with the winner and today as still open', JSON.stringify(days));
await rpc(admin, 'admin_daily_overview');
check((await points(e1)) - before[0] === 10000, 'settling again pays nobody twice');
await q(`insert into public.daily_challenge_settlements (challenge_date, winner_id, winner_votes) values (current_date - 2, null, null) on conflict do nothing`);
await entry(-2, e2, '/media/daily/leftover.jpg', 1);
await rpc(admin, 'admin_daily_overview');
check((await q(`select count(*)::int n from public.daily_challenge_entries where challenge_date = current_date - 2`))[0].n === 0 && await inTrash('daily/leftover.jpg'), 'an entry left over on a day that was already settled is wiped too, and its file queued');
const gdc = await rpc(e4, 'get_daily_challenge');
check(gdc.hasSubmitted === false && Array.isArray(gdc.purgedMediaKeys) && gdc.purgedMediaKeys.length === 0, 'the member-side call still works and no longer hands files to the phone');
const gdc1 = await rpc(e1, 'get_daily_challenge');
check(gdc1.hasSubmitted === true, '... and knows today\'s entry');
const myEntry = (await q(`select id from public.daily_challenge_entries where challenge_date = current_date and user_id = $1`, [e1]))[0].id;
await rpc(e1, 'delete_daily_challenge_entry', myEntry);
check(await inTrash('daily/today1.jpg'), 'deleting your own entry queues its file');

section('8. The app\'s nudge');
await q(`delete from public.internal_config where key = 'media_purge_kicked_at'`);
await rpc(ann, 'poke_media_cleanup');
const kicked = (await q(`select value from public.internal_config where key = 'media_purge_kicked_at'`))[0]?.value;
check(!!kicked, 'any signed-in member\'s app can nudge the cleanup');
await rpc(bob, 'poke_media_cleanup');
check((await q(`select value from public.internal_config where key = 'media_purge_kicked_at'`))[0].value === kicked, 'but only once every ten minutes for the whole app');
await expectFail(async () => (await asAnon(db, async () => db.query(`select public.poke_media_cleanup()`))), /permission denied/i, 'a visitor cannot');
check((await q(`select count(*)::int n from public.media_trash`))[0].n >= 1, 'the queue itself can not be read or changed by members');
await expectFail(() => call(ann, `select * from public.media_trash`), /permission denied/i, 'a member cannot read the queue table directly');
await expectFail(() => call(ann, `insert into public.media_trash (key) values ('avatars/x.jpg')`), /permission denied/i, '... or write to it');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
