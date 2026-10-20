// 10,000,000 points for content and 1,000,000 for a comment (announced by the official NOOB account, taken back when deleted, but never because something ELSE was deleted),
// one person = one view of a reel, and the three kinds of "installed" platform. On a REAL Postgres (PGlite) with every migration applied.
// Usage: node --liftoff-only scripts/supabase/test-points-views-db.mjs
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
  await db.query(`update public.profiles set pro_tier = 'pro', noob_points = 0 where id = $1`, [id]).catch(() => undefined);
  if (extra) await db.query(extra, [id]);
  return id;
};
const rpc = async (uid, sql, args = []) => asUser(db, uid, async () => (await db.query(sql, args)).rows[0]?.r);
const points = async (u) => Number((await db.query(`select noob_points from public.profiles where id = $1`, [u])).rows[0].noob_points);
const ledger = async (u) => (await db.query(`select amount::bigint::text as amount, reason from public.noob_transactions where user_id = $1 order by created_at, id`, [u])).rows.map((r) => ({ amount: Number(r.amount), reason: r.reason }));
const notes = async (u, type) => (await db.query(`select n.type, n.title, n.message, n.actor_id from public.notifications n where n.target_user_id = $1 and n.type = $2 order by n.created_at, n.id`, [u, type])).rows;
const post = async (u) => (await rpc(u, `select public.create_post($1::jsonb, 'hello') as r`, [JSON.stringify([{ objectKey: 'posts/a.jpg', mediaType: 'image' }])])).id;
const reel = async (u) => (await rpc(u, `select public.create_reel('reels/a.mp4', '', 'reel') as r`)).id;
const video = async (u) => (await rpc(u, `select public.create_long_video('videos/a.mp4', null, 'vid', '', 60) as r`)).video.id;
const del = (u, table, id) => asUser(db, u, async () => db.query(`delete from public.${table} where id = $1`, [id]));

const noob = await mkUser('noob', `update public.profiles set is_admin = true where id = $1`);
const ann = await mkUser('ann'), bob = await mkUser('bob'), cat = await mkUser('cat'), dan = await mkUser('dan');

section('1. Publishing: 10,000,000 points, from the official NOOB account');
const p1 = await post(ann);
check(await points(ann) === 10000000, 'a post gives 10,000,000 points');
let n = await notes(ann, 'points_earned');
check(n.length === 1 && /You received 10,000,000 NOOB Points for publishing a post/.test(n[0].message) && n[0].actor_id === noob, 'told in a notification that comes from the NOOB account (so it shows the official logo)', JSON.stringify(n));
const r1 = await reel(bob);
check(await points(bob) === 10000000, 'a reel gives 10,000,000');
const v1 = await video(cat);
check(await points(cat) === 10000000, 'a video gives 10,000,000');
check((await db.query(`select views_count from public.reels where id = $1`, [r1])).rows[0].views_count === 0, 'a new reel starts with 0 views (the maker\'s own is not pre-counted)');
await del(ann, 'posts', p1);
check(await points(ann) === 0, 'deleting the post takes the 10,000,000 back');
n = await notes(ann, 'points_removed');
check(n.length === 1 && n[0].actor_id === noob && /10,000,000/.test(n[0].message), 'and tells her, from the NOOB account');

section('2. Commenting: 1,000,000 points');
const p2 = await post(dan);                        // dan: 10,000,000
const c1 = (await rpc(ann, `select public.add_comment($1, 'nice one') as r`, [p2])).comment.id;
check(await points(ann) === 1000000, 'a comment on a post gives 1,000,000');
check((await notes(ann, 'points_earned')).some((x) => /1,000,000 NOOB Points for commenting on a post/.test(x.message)), 'and a notification says so');
const rc = (await rpc(ann, `select public.add_reel_comment($1, 'cool') as r`, [r1])).comment.id;
const vc = (await rpc(ann, `select public.add_long_video_comment($1, 'long one') as r`, [v1])).comment.id;
check(await points(ann) === 3000000, 'comments on a reel and a video give 1,000,000 each too');
let l = await ledger(ann);
check(l.map((x) => x.reason).join('|').includes('Posted a comment') && l.map((x) => x.reason).join('|').includes('Commented on a reel') && l.map((x) => x.reason).join('|').includes('Commented on a video'), 'the history names each one');
await del(ann, 'comments', c1);
check(await points(ann) === 2000000, 'deleting her own comment takes its 1,000,000 back');
l = await ledger(ann);
check(/you deleted the comment you earned them for/.test(l[l.length - 1].reason) && l[l.length - 1].amount === -1000000, 'with the reason in the history', JSON.stringify(l[l.length - 1]));
check((await notes(ann, 'points_removed')).length === 2 && /You deleted your comment/.test((await notes(ann, 'points_removed'))[1].message), 'and a notification (her second: the first was for the post)');

section('3. Only her own deletion counts, not a cascade');
const parent = (await rpc(bob, `select public.add_comment($1, 'parent') as r`, [p2])).comment.id;
const reply = (await rpc(cat, `select public.add_comment($1, 'a reply', $2) as r`, [p2, parent])).comment.id;
const catBefore = await points(cat), bobBefore = await points(bob);
await del(bob, 'comments', parent);               // bob deletes his comment: cat's reply goes with it
check(await points(cat) === catBefore, 'her reply disappeared with the comment it answered: cat keeps her points');
check(await points(bob) === bobBefore - 1000000, 'bob loses the 1,000,000 of the comment he deleted');
const eve = await mkUser('eve');
await rpc(eve, `select public.add_comment($1, 'eve says hi') as r`, [p2]);
const eveBefore = await points(eve);
await del(dan, 'posts', p2);                       // dan deletes his post: eve's comment goes with it
check(await points(eve) === eveBefore, 'a comment that went because the post was deleted costs the writer nothing');
check(await points(dan) === 0, '(dan, who deleted his post, loses its 10,000,000)');
const fay = await mkUser('fay');
const p3 = await post(eve);
await rpc(fay, `select public.add_comment($1, 'fay here') as r`, [p3]);
await db.query(`delete from auth.users where id = $1`, [fay]).then(() => check(true, 'deleting a whole account that has commented works'), (e) => check(false, 'deleting a whole account that has commented works', e.message));
const gus = await mkUser('gus');
await rpc(gus, `select public.add_comment($1, 'gus here') as r`, [p3]);
const gusC = (await db.query(`select id from public.comments where user_id = $1`, [gus])).rows[0].id;
await db.exec(`select set_config('request.jwt.claim.sub', '${noob}', false)`);
await db.query(`delete from public.comments where id = $1`, [gusC]);
await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);
check(await points(gus) === 0, 'a comment removed by an admin takes its points back as well');
check(/the comment you earned them for was removed/.test((await ledger(gus)).pop().reason), 'saying it was removed, not deleted by him');

section('4. Spent points');
const hal = await mkUser('hal');
const hc = (await rpc(hal, `select public.add_comment($1, 'hal here') as r`, [p3])).comment.id;
await db.query(`update public.profiles set noob_points = 400000 where id = $1`, [hal]);
await del(hal, 'comments', hc);
check(await points(hal) === 0 && /400,000 of 1,000,000 could be taken/.test((await ledger(hal)).pop().reason), 'only what is left is taken, and the line says how much');

section('5. One person = one view of a reel');
const rr = await reel(ann);
const views = async () => Number((await db.query(`select views_count from public.reels where id = $1`, [rr])).rows[0].views_count);
await rpc(bob, `select public.record_reel_view($1) as r`, [rr]);
await rpc(bob, `select public.record_reel_view($1) as r`, [rr]);
await rpc(bob, `select public.record_reel_view($1) as r`, [rr]);
check(await views() === 1, 'the same person watching three times is one view');
await rpc(cat, `select public.record_reel_view($1) as r`, [rr]);
check(await views() === 2, 'a second person makes two');
const res = await rpc(cat, `select public.record_reel_view($1) as r`, [rr]);
check(res.viewsCount === 2 && await views() === 2, 'the answer carries the right number');
await db.query(`update public.reels set views_count = 170 where id = $1`, [rr]);
const sql = fs.readFileSync('supabase/migrations/20261020000001_points_views_ticks.sql', 'utf8');
await db.exec(sql);
check(await views() === 2, 'the migration puts an inflated counter right (170 -> the 2 who really watched)');
await db.exec(sql);
check(await views() === 2, 'and running it again changes nothing');

section('6. The platform behind the tick');
const ida = await mkUser('ida');
for (const p of ['app', 'pwa', 'web']) {
  await rpc(ida, `select public.touch_last_seen($1) as r`, [p]);
  check((await db.query(`select last_seen_platform p from public.profile_private where user_id = $1`, [ida])).rows[0].p === p, `"${p}" is recorded`);
}
await rpc(ida, `select public.touch_last_seen('toaster') as r`);
check((await db.query(`select last_seen_platform p from public.profile_private where user_id = $1`, [ida])).rows[0].p === 'web', 'anything else is ignored');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
