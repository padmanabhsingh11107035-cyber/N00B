// Looking at a reel / post / video / profile WITHOUT an account (a link opened in a browser): only public accounts, only what the page shows, one view per visitor, robots not counted.
// On a REAL Postgres (PGlite) with every migration applied.
// Usage: node --liftoff-only scripts/supabase/test-public-content-db.mjs
import fs from 'node:fs';
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const db = await createTestDb();
const mkUser = async (name, extra = '') => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, name]);
  await db.query(`update public.profiles set pro_tier = 'pro' where id = $1`, [id]);   // Pro: no daily limit on posting
  if (extra) await db.query(extra, [id]);
  return id;
};
const rpc = async (uid, sql, args = []) => asUser(db, uid, async () => (await db.query(sql, args)).rows[0]?.r);
const anon = async (sql, args = []) => asAnon(db, async () => (await db.query(sql, args)).rows[0]?.r);
const setHeaders = (h) => db.exec(`select set_config('request.headers', '${JSON.stringify(h)}', false)`);
const views = async (table, id) => Number((await db.query(`select views_count from public.${table} where id = $1`, [id])).rows[0].views_count);

const ann = await mkUser('ann', `update public.profiles set bio = 'hello there' where id = $1`);
const pat = await mkUser('pat');
const sus = await mkUser('sus');
const post = async (u) => (await rpc(u, `select public.create_post($1::jsonb, 'a caption') as r`, [JSON.stringify([{ objectKey: 'posts/a.jpg', mediaType: 'image' }, { objectKey: 'posts/b.jpg', mediaType: 'image' }])])).id;
const reel = async (u) => (await rpc(u, `select public.create_reel('reels/a.mp4', '', 'reel caption') as r`)).id;
const video = async (u) => (await rpc(u, `select public.create_long_video('videos/a.mp4', null, 'vid title', 'vid description', 60) as r`)).video.id;

const pPost = await post(ann), pReel = await reel(ann), pVideo = await video(ann);
const privPost = await post(pat), privReel = await reel(pat), privVideo = await video(pat);
const susReel = await reel(sus);
await db.query(`update public.profiles set account_type = 'private' where id = $1`, [pat]);   // closed afterwards (a closed or suspended account cannot publish)
await db.query(`update public.profiles set is_suspended = true where id = $1`, [sus]);

section('1. What a visitor without an account can see');
let r = await anon(`select public.public_reel($1) as r`, [pReel]);
check(r && r.kind === 'reel' && r.username === 'ann' && r.videoUrl === 'reels/a.mp4' && r.caption === 'reel caption' && r.viewsCount === 0, 'a public account\'s reel: the video, caption, who made it and the counts', JSON.stringify(r));
r = await anon(`select public.public_video($1) as r`, [pVideo]);
check(r && r.kind === 'video' && r.title === 'vid title' && r.description === 'vid description' && r.durationSeconds === 60, 'a public account\'s video');
r = await anon(`select public.public_post($1) as r`, [pPost]);
check(r && r.kind === 'post' && r.caption === 'a caption' && r.slides.length === 2 && r.slides[0].mediaUrl === 'posts/a.jpg' && r.slides[1].mediaUrl === 'posts/b.jpg', 'a public account\'s post, with all its pictures in order');
r = await anon(`select public.public_profile('Ann') as r`);
check(r && r.username === 'ann' && r.bio === 'hello there' && r.isPrivate === false && r.posts.length === 1 && r.posts[0].mediaUrl === 'posts/a.jpg', 'a public profile (any letter case): the header and the latest pictures');
const all = JSON.stringify([await anon(`select public.public_reel($1) as r`, [pReel]), await anon(`select public.public_post($1) as r`, [pPost]), await anon(`select public.public_profile('ann') as r`)]);
check(!/email|password|noob_points|privacy_settings|phone|legacy/i.test(all), 'nothing private is handed over (no email, points, settings)');

section('2. What stays closed');
check(await anon(`select public.public_reel($1) as r`, [privReel]) === null, 'a private account\'s reel');
check(await anon(`select public.public_video($1) as r`, [privVideo]) === null, 'a private account\'s video');
check(await anon(`select public.public_post($1) as r`, [privPost]) === null, 'a private account\'s post');
check(await anon(`select public.public_reel($1) as r`, [susReel]) === null, 'a suspended account\'s reel');
r = await anon(`select public.public_profile('pat') as r`);
check(r && r.isPrivate === true && r.posts.length === 0 && r.username === 'pat', 'a private profile shows only its header, never its pictures');
check(await anon(`select public.public_profile('sus') as r`) === null, 'a suspended profile is not shown');
check(await anon(`select public.public_reel(gen_random_uuid()) as r`) === null && await anon(`select public.public_profile('nobody_here') as r`) === null, 'an address that leads nowhere answers nothing');
check(await anon(`select public.public_profile('a b; drop table profiles') as r`) === null && await anon(`select public.public_profile('') as r`) === null, 'a made-up name is refused');
await db.query(`update public.posts set is_archived = true where id = $1`, [pPost]);
check(await anon(`select public.public_post($1) as r`, [pPost]) === null, 'an archived post is not shown');
await db.query(`update public.posts set is_archived = false, scheduled_for = now() + interval '1 day' where id = $1`, [pPost]);
check(await anon(`select public.public_post($1) as r`, [pPost]) === null, 'nor one that is not published yet');
await db.query(`update public.posts set scheduled_for = null where id = $1`, [pPost]);
check((await anon(`select public.public_profile('ann') as r`)).posts.length === 1, '(and it is back once it is published)');
check(await (async () => { try { await asAnon(db, async () => db.query(`select * from public.public_content_views`)); return false; } catch (e) { return /permission denied/i.test(e.message); } })(), 'the table of views stays closed to everyone');
check(await (async () => { try { await asAnon(db, async () => db.query(`select public.public_account_ok($1)`, [ann])); return false; } catch (e) { return /permission denied/i.test(e.message); } })(), 'so does the helper that decides who is public');

section('3. One view per visitor');
await setHeaders({ 'user-agent': 'Mozilla/5.0 (iPhone)', 'cf-connecting-ip': '1.1.1.1' });
r = await anon(`select public.record_public_view('reel', $1, 'visitor-aaaa-1111') as r`, [pReel]);
check(r.success && r.counted === true && r.viewsCount === 1 && await views('reels', pReel) === 1, 'the first look counts one view');
r = await anon(`select public.record_public_view('reel', $1, 'visitor-aaaa-1111') as r`, [pReel]);
check(r.success && r.counted === false && r.viewsCount === 1, 'the same visitor again (a replay, a reload) counts nothing');
r = await anon(`select public.record_public_view('reel', $1, 'visitor-bbbb-2222') as r`, [pReel]);
check(r.counted === false && await views('reels', pReel) === 1, 'a new visitor id from the same network address does not raise it either');
await setHeaders({ 'user-agent': 'Mozilla/5.0 (Android)', 'cf-connecting-ip': '2.2.2.2' });
r = await anon(`select public.record_public_view('reel', $1, 'visitor-cccc-3333') as r`, [pReel]);
check(r.counted === true && r.viewsCount === 2, 'another person on another network is a second view');
await setHeaders({ 'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)', 'cf-connecting-ip': '3.3.3.3' });
r = await anon(`select public.record_public_view('reel', $1, 'visitor-dddd-4444') as r`, [pReel]);
check(r.success && r.counted === false && await views('reels', pReel) === 2, 'a robot (a search engine, a link preview) is never counted');
await setHeaders({ 'user-agent': 'Mozilla/5.0 (X11)', 'cf-connecting-ip': '4.4.4.4' });
r = await anon(`select public.record_public_view('video', $1, 'visitor-eeee-5555') as r`, [pVideo]);
check(r.counted === true && await views('long_videos', pVideo) === 1, 'videos are counted the same way');
check((await anon(`select public.record_public_view('reel', $1, 'x') as r`, [pReel])).success === false && (await anon(`select public.record_public_view('post', $1, 'visitor-ffff-6666') as r`, [pPost])).success === false, 'a made-up visitor id or a kind that has no counter is refused');
check((await anon(`select public.record_public_view('reel', $1, 'visitor-gggg-7777') as r`, [privReel])).success === false && await views('reels', privReel) === 0, 'a private reel cannot be counted from outside');
await setHeaders({ 'user-agent': 'Mozilla/5.0 (Windows)', 'cf-connecting-ip': '5.5.5.5' });
r = await rpc(ann, `select public.record_reel_view($1) as r`, [pReel]);
check(r.success && r.viewsCount === 3, 'a logged-in person still counts once, on top of the visitors');
r = await rpc(ann, `select public.record_reel_view($1) as r`, [pReel]);
check(r.viewsCount === 3, 'and not again when she replays it');
check((await rpc(ann, `select public.public_reel($1) as r`, [pReel]))?.id === pReel, 'logged-in people can use the same functions');

section('4. The migration');
const sql = fs.readFileSync('supabase/migrations/20261020000005_public_content.sql', 'utf8');
await db.exec(sql); await db.exec(sql);
check(true, 'running it again changes nothing');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
