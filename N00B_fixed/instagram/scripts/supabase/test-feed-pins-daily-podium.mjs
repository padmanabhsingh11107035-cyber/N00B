// Tests migration 20261011000002: the admin's pins on the Feed page, and the Daily NOOB podium (1st / 2nd / 3rd),
// on a REAL Postgres (PGlite) with every migration applied.
//
// Usage: node scripts/supabase/test-feed-pins-daily-podium.mjs
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const expectFail = async (fn, pattern, label) => {
  try { await fn(); check(false, label, '(expected an error, but it succeeded)'); }
  catch (e) { check(pattern.test(e.message), label, `(got: ${e.message})`); }
};
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
const call = (uid, sql, params = []) => asUser(db, uid, async () => (await db.query(sql, params)).rows);
const rpc = async (uid, fn, ...args) => (await call(uid, `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args))[0].r;

const admin = await mkUser('boss', { is_admin: true });
const author = await mkUser('author');
const priv = await mkUser('priv_author', { account_type: 'private' });
const viewer = await mkUser('viewer');

const post = (await db.query(`insert into public.posts (user_id, caption) values ($1, 'hello') returning id`, [author])).rows[0].id;
await db.query(`insert into public.post_slides (post_id, position, media_url, media_type) values ($1, 0, 'posts/x.jpg', 'image')`, [post]);
const privPost = (await db.query(`insert into public.posts (user_id, caption) values ($1, 'secret') returning id`, [priv])).rows[0].id;
await db.query(`insert into public.post_slides (post_id, position, media_url, media_type) values ($1, 0, 'posts/y.jpg', 'image')`, [privPost]);
const reel = (await db.query(`insert into public.reels (user_id, video_url) values ($1, 'reels/r.mp4') returning id`, [author])).rows[0].id;
const video = (await db.query(`insert into public.long_videos (user_id, video_url, duration_seconds) values ($1, 'videos/v.mp4', 60) returning id`, [author])).rows[0].id;

section('1. Only the admin can pin');
await expectFail(() => rpc(viewer, 'admin_set_feed_pin', 'post', post, true), /Only the NOOB admin/, 'an ordinary member cannot pin');
await expectFail(() => rpc(author, 'admin_set_feed_pin', 'post', post, true), /Only the NOOB admin/, 'not even the author can');
await expectFail(() => rpc(admin, 'admin_set_feed_pin', 'sticker', post, true), /Unknown kind/, 'an unknown kind is refused');
await expectFail(() => rpc(admin, 'admin_set_feed_pin', 'post', '00000000-0000-4000-8000-000000000001', true), /not found/, 'something that does not exist is refused');

section('2. Pinning a post, a reel and a video');
check((await rpc(admin, 'admin_set_feed_pin', 'post', post, true)).pinned === true, 'the admin pins a post');
await rpc(admin, 'admin_set_feed_pin', 'reel', reel, true);
await rpc(admin, 'admin_set_feed_pin', 'video', video, true);
const pins = await rpc(viewer, 'pinned_feed_items');
check(pins.length === 3, 'everyone sees the three pins', String(pins.length));
check(pins.find((p) => p.kind === 'post')?.post?.caption === 'hello' && !!pins.find((p) => p.kind === 'reel')?.reel?.videoUrl && pins.find((p) => p.kind === 'video')?.video?.durationSeconds === 60, 'each pin carries the item itself');
check(pins[0].kind === 'video', 'the newest pin is first', pins.map((p) => p.kind).join());
await rpc(admin, 'admin_set_feed_pin', 'post', post, true);
check((await rpc(viewer, 'pinned_feed_items')).length === 3, 'pinning the same thing twice does not duplicate it');
check((await rpc(admin, 'admin_set_feed_pin', 'reel', reel, false)).pinned === false, 'unpin works');
check((await rpc(viewer, 'pinned_feed_items')).every((p) => p.kind !== 'reel'), 'the unpinned reel is gone from the list');

section('3. Privacy still applies');
await rpc(admin, 'admin_set_feed_pin', 'post', privPost, true);
check((await rpc(admin, 'pinned_feed_items')).some((p) => p.itemId === privPost), 'the admin sees a private account\'s pinned post');
check(!(await rpc(viewer, 'pinned_feed_items')).some((p) => p.itemId === privPost), 'someone who may not see that account does not');
await db.query(`update public.posts set is_archived = true where id = $1`, [post]);
check(!(await rpc(viewer, 'pinned_feed_items')).some((p) => p.itemId === post), 'an archived post drops out of the pins');
await db.query(`update public.posts set is_archived = false where id = $1`, [post]);

section('4. At most five pins');
for (let i = 0; i < 3; i++) {
  const p = (await db.query(`insert into public.posts (user_id, caption) values ($1, $2) returning id`, [author, 'extra ' + i])).rows[0].id;
  await db.query(`insert into public.post_slides (post_id, position, media_url, media_type) values ($1, 0, 'posts/z.jpg', 'image')`, [p]);
  try { await rpc(admin, 'admin_set_feed_pin', 'post', p, true); } catch { /* the cap */ }
}
check(Number((await db.query(`select count(*) n from public.pinned_feed_items`)).rows[0].n) === 5, 'never more than five at once');
let denied = false;
try { await asAnon(db, async () => db.query(`select public.pinned_feed_items()`)); } catch (e) { denied = /permission denied/.test(e.message); }
check(denied, 'someone not signed in cannot read the pins');

// ------------------------------------------------------------------------------------------------- Daily NOOB podium
section('5. Daily NOOB remembers the whole podium');
const a = await mkUser('dn_a'), b = await mkUser('dn_b'), c = await mkUser('dn_c'), d = await mkUser('dn_d');
const day = (n) => (new Date(Date.now() - n * 86400000)).toISOString().slice(0, 10);
const prompt = (await db.query(`select id from public.daily_challenge_prompts order by id limit 1`)).rows[0].id;
for (const n of [3, 5]) await db.query(`insert into public.daily_challenges (challenge_date, prompt_id) values ($1, $2)`, [day(n), prompt]);
const entry = (dd, u, votes, minsAgo) => db.query(`insert into public.daily_challenge_entries (challenge_date, user_id, media_url, media_type, votes_count, created_at) values ($1, $2, $3, 'image', $4, now() - ($5 || ' minutes')::interval)`, [dd, u, `daily/${u}.jpg`, votes, String(minsAgo)]);

// the day 3 days ago is settled by votes
await entry(day(3), a, 5, 30); await entry(day(3), b, 9, 20); await entry(day(3), c, 2, 10); await entry(day(3), d, 0, 5);
// the day 5 days ago is hand-picked by the admin (entered now, before anything settles it)
await entry(day(5), a, 1, 30); await entry(day(5), b, 8, 20); await entry(day(5), c, 3, 10);
await expectFail(() => rpc(viewer, 'admin_assign_daily_challenge_winners', day(5), a, b, c), /Admin only/, 'only an admin can hand-pick winners');
await expectFail(() => rpc(admin, 'admin_assign_daily_challenge_winners', day(5), a, a, null), /same person/, 'one person cannot take two places');
await expectFail(() => rpc(admin, 'admin_assign_daily_challenge_winners', day(5), a, b, d), /didn't enter/, 'someone who did not enter cannot win');
const res = await rpc(admin, 'admin_assign_daily_challenge_winners', day(5), a, c, b);
check(res.success, 'the admin makes a the winner, c second and b third');
const s2 = (await db.query(`select * from public.daily_challenge_settlements where challenge_date = $1`, [day(5)])).rows[0];
check(s2.winner_id === a && s2.second_id === c && s2.third_id === b && s2.second_votes === 3 && s2.third_votes === 8, 'the hand-picked podium is remembered');
await expectFail(() => rpc(admin, 'admin_assign_daily_challenge_winners', day(5), a, null, null), /already been settled/, 'a day can only be settled once');

await db.query(`select public.settle_past_daily_challenges()`);
const s1 = (await db.query(`select * from public.daily_challenge_settlements where challenge_date = $1`, [day(3)])).rows[0];
check(s1.winner_id === b && s1.winner_votes === 9, '1st place by votes');
check(s1.second_id === a && s1.second_votes === 5 && s1.third_id === c && s1.third_votes === 2, '2nd and 3rd are written down too (the one with no votes gets nothing)');
check(Number((await db.query(`select noob_points from public.profiles where id = $1`, [b])).rows[0].noob_points) >= 10000, 'points were paid as before');

section('6. The Hall of Fame shows the podium');
const champs = await rpc(viewer, 'fetch_daily_champions', 10);
const dayRow = champs.find((x) => x.challengeDate === day(3));
check(champs.length === 2 && dayRow && dayRow.userId === b, 'one row per day, with the winner as before', JSON.stringify(champs.map((x) => x.challengeDate)));
check(dayRow && dayRow.podium.map((p) => `${p.rank}:${p.username}`).join() === '1:dn_b,2:dn_a,3:dn_c', 'the podium lists 1st, 2nd and 3rd', JSON.stringify(dayRow?.podium));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
