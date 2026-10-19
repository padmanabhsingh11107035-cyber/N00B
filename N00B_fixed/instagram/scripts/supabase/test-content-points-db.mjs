// Points for a post / reel / video, on a REAL Postgres (PGlite) with every migration applied: the person is told what they received; if they delete it the points are taken back
// with the reason in their points history (and a notification), once only, never below zero, and nothing breaks when a whole account is deleted.
// Usage: node --liftoff-only scripts/supabase/test-content-points-db.mjs
import fs from 'node:fs';
import { createTestDb, asUser } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const db = await createTestDb();
const mkUser = async (name, extra = '') => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, name]);
  await db.query(`update public.profiles set pro_tier = 'pro', noob_points = 0 where id = $1`, [id]).catch(() => undefined);   // no one-a-day limit in the way
  if (extra) await db.query(extra, [id]);
  return id;
};
const rpc = async (uid, sql, args = []) => asUser(db, uid, async () => (await db.query(sql, args)).rows[0]?.r);
const asClaim = async (uid, fn) => { await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false)`); try { return await fn(); } finally { await db.exec(`select set_config('request.jwt.claim.sub', '', false)`); } };
const points = async (u) => Number((await db.query(`select noob_points from public.profiles where id = $1`, [u])).rows[0].noob_points);
const ledger = async (u) => (await db.query(`select amount::bigint::text as amount, reason from public.noob_transactions where user_id = $1 order by created_at, id`, [u])).rows.map((r) => ({ amount: Number(r.amount), reason: r.reason }));
const notes = async (u, type) => (await db.query(`select type, title, message, data from public.notifications where target_user_id = $1 and type = $2 order by created_at, id`, [u, type])).rows;
const makePost = async (u) => (await rpc(u, `select public.create_post($1::jsonb, 'hello') as r`, [JSON.stringify([{ objectKey: 'posts/a.jpg', mediaType: 'image' }])])).id;
const makeReel = async (u) => (await rpc(u, `select public.create_reel('reels/a.mp4', '', 'reel') as r`)).id;
const makeVideo = async (u) => (await rpc(u, `select public.create_long_video('videos/a.mp4', null, 'vid', '', 60) as r`)).video.id;
const ownerDelete = (u, table, id) => asUser(db, u, async () => db.query(`delete from public.${table} where id = $1`, [id]));

const ann = await mkUser('ann'), bob = await mkUser('bob'), cat = await mkUser('cat'), dan = await mkUser('dan'), eve = await mkUser('eve'), root = await mkUser('rootadmin', `update public.profiles set is_admin = true where id = $1`);

section('1. A post: told what was received, then deleted');
const p1 = await makePost(ann);
check(await points(ann) === 25, 'publishing a post gives 25 points');
let n = await notes(ann, 'points_earned');
check(n.length === 1 && /You received 25 NOOB Points for publishing a post\./.test(n[0].message) && /received/i.test(n[0].title), 'and a notification says how many and for what', JSON.stringify(n));
check(n[0] && n[0].data.contentType === 'post' && n[0].data.amount === 25 && n[0].data.contentId === p1, 'the notification carries what it was for');
check((await db.query(`select 1 from public.content_point_awards where content_type = 'post' and content_id = $1 and amount = 25`, [p1])).rows.length === 1, 'the award is remembered against that post');
await ownerDelete(ann, 'posts', p1);
check(await points(ann) === 0, 'deleting the post takes the 25 points back');
let l = await ledger(ann);
check(l.length === 2 && l[1].amount === -25 && /^Points taken back: you deleted the post you earned them for$/.test(l[1].reason), 'the points history says why', JSON.stringify(l));
n = await notes(ann, 'points_removed');
check(n.length === 1 && /You deleted your post, so the 25 NOOB Points you earned for it were taken back\./.test(n[0].message) && /taken back/i.test(n[0].title), 'and a notification says so', JSON.stringify(n));
check((await db.query(`select taken_back_at, taken_back_amount::text from public.content_point_awards where content_id = $1`, [p1])).rows[0].taken_back_amount === '25', 'the award is marked as taken back (once)');

section('2. A reel with the big bonus offer');
await db.query(`insert into public.post_bonus_offers (user_id, amount, created_at, expires_at, claimed_at) values ($1, 12345678, now(), now() + interval '30 minutes', null) on conflict (user_id) do update set amount = 12345678, expires_at = now() + interval '30 minutes', claimed_at = null`, [bob]);
const r1 = await makeReel(bob);
check(await points(bob) === 12345678, 'the bonus amount is what is given');
l = await ledger(bob);
check(l.length === 1 && /Published a reel \(bonus offer\)/.test(l[0].reason), 'the history says it was the bonus offer', JSON.stringify(l));
n = await notes(bob, 'points_earned');
check(n.length === 1 && /12,345,678 NOOB Points for publishing a reel - your bonus offer!/.test(n[0].message) && n[0].data.bonus === true, 'and so does the notification', JSON.stringify(n));
await ownerDelete(bob, 'reels', r1);
check(await points(bob) === 0, 'deleting the reel takes back exactly that amount, not the normal 25');
l = await ledger(bob);
check(l[1].amount === -12345678 && /you deleted the reel you earned them for/.test(l[1].reason), 'with the reason in the history', JSON.stringify(l));
check((await db.query(`select claimed_at is not null as c from public.post_bonus_offers where user_id = $1`, [bob])).rows[0].c, 'the offer stays used: deleting does not make it available again');

section('3. A video; the points were already spent');
const v1 = await makeVideo(cat);
check(await points(cat) === 25, 'uploading a video gives 25 points');
check((await notes(cat, 'points_earned'))[0].message.includes('for uploading a video'), 'the notification says "uploading a video"');
await db.query(`update public.profiles set noob_points = 10 where id = $1`, [cat]);   // she spent 15 of them
await ownerDelete(cat, 'long_videos', v1);
check(await points(cat) === 0, 'only what is left is taken (10), and the balance is not pushed below zero');
l = await ledger(cat);
check(l[l.length - 1].amount === -10 && /10 of 25 could be taken - the rest was already spent/.test(l[l.length - 1].reason), 'the history says how much could be taken', JSON.stringify(l));
n = await notes(cat, 'points_removed');
check(n.length === 1 && /10 of the 25 NOOB Points .* taken back \(the rest was already spent\)/.test(n[0].message), 'and so does the notification', JSON.stringify(n));

section('4. Nothing left at all');
const p2 = await makePost(dan);
await db.query(`update public.profiles set noob_points = 0 where id = $1`, [dan]);
await ownerDelete(dan, 'posts', p2);
l = await ledger(dan);
check(await points(dan) === 0 && l[l.length - 1].amount === 0 && /0 of 25 could be taken/.test(l[l.length - 1].reason), 'an empty wallet gets a history line that explains, and stays at zero', JSON.stringify(l));

section('5. An admin removes it');
const p3 = await makePost(eve);
await asClaim(root, async () => db.query(`delete from public.posts where id = $1`, [p3]));
check(await points(eve) === 0, 'points are taken back when a post is removed by an admin too');
l = await ledger(eve);
check(/the post you earned them for was removed/.test(l[l.length - 1].reason), 'the history says it was removed, not that she deleted it', JSON.stringify(l));
check(/Your post was removed, so the 25 NOOB Points/.test((await notes(eve, 'points_removed'))[0].message), 'and so does the notification');

section('6. Other cases');
const fay = await mkUser('fay');
const p4 = await makePost(fay);
await db.query(`delete from public.profiles where id = $1`, [fay]).then(() => check(true, 'deleting a whole account (with its posts) works and nothing is taken back from it'), (e) => check(false, 'deleting a whole account works', e.message));
const gus = await mkUser('gus');
const old = (await db.query(`insert into public.posts (user_id, caption) values ($1, 'made before this existed') returning id`, [gus])).rows[0].id;
await db.query(`update public.profiles set noob_points = 500 where id = $1`, [gus]);
await ownerDelete(gus, 'posts', old);
check(await points(gus) === 500, 'a post that earned nothing (made before) takes nothing back');
const hal = await mkUser('hal');
await rpc(hal, `select public.set_my_settings('{"notif.points": false}'::jsonb) as r`);
const p5 = await makePost(hal);
check(await points(hal) === 25 && (await notes(hal, 'points_earned')).length === 0, 'with "points" notifications switched off the points still arrive, just no notification');
await ownerDelete(hal, 'posts', p5);
check(await points(hal) === 0 && (await notes(hal, 'points_removed')).length === 0 && (await ledger(hal)).length === 2, 'and they are still taken back, with the history line');
const ida = await mkUser('ida');
const pa = await makePost(ida), pb = await makePost(ida);
check(await points(ida) === 50, 'two posts, 50 points');
await ownerDelete(ida, 'posts', pa);
check(await points(ida) === 25, 'deleting one takes back only its own 25');

section('7. Safe and private');
let denied = 0;
for (const fn of ['claim_post_bonus_or_default(null, 1, \'x\')', 'take_back_content_points()']) {
  try { await asUser(db, ann, async () => db.query(`select public.${fn}`)); } catch (e) { if (/permission denied|must be owner|trigger/i.test(e.message)) denied++; }
}
check(denied === 2, 'nobody can call the points functions directly');
check((await db.query(`select count(*)::int n from pg_proc where proname = 'claim_post_bonus_or_default'`)).rows[0].n === 1, 'there is one points-claiming function (the old three-argument one is gone)');
const sql = fs.readFileSync('supabase/migrations/20261019000001_points_for_content.sql', 'utf8');
await db.exec(sql);
const jo = await mkUser('jo');
await makePost(jo);
check(await points(jo) === 25, 'running the migration twice changes nothing');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
