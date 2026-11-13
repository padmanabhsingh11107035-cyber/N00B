// Tests migration 20261114000005: the admin Content tab pages through EVERYTHING (posts, reels, videos, stories, instants) with a keyset cursor and a real total.
// On a REAL Postgres (PGlite) with every migration applied, plus a static check that the panel is wired to it.
// Usage: node --liftoff-only scripts/supabase/test-admin-content-paging.mjs
import fs from 'node:fs';
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const expectFail = async (fn, pattern, label) => { try { await fn(); check(false, label, '(expected an error)'); } catch (e) { check(pattern.test(e.message), label, `(got: ${e.message})`); } };
const section = (t) => console.log(`\n${t}`);
const db = await createTestDb();
const mkUser = async (name, patch = {}) => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, name]);
  for (const [col, val] of Object.entries(patch)) await db.query(`update public.profiles set ${col} = $2 where id = $1`, [id, val]);
  return id;
};
const rpc = async (uid, fn, ...args) => (await asUser(db, uid, async () => db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args))).rows[0].r;

const admin = await mkUser('noob', { is_admin: true });
const ann = await mkUser('ann');
const priv = await mkUser('priv_ann', { account_type: 'private' });
const susp = await mkUser('susp', { is_suspended: true });

// 130 posts: 3 share one timestamp (ties), some from a private and a suspended account, one archived
await db.query(`insert into public.posts (user_id, caption, created_at)
  select case when n % 10 = 0 then $2::uuid when n % 13 = 0 then $3::uuid else $1::uuid end, 'p' || n, now() - (n || ' minutes')::interval from generate_series(1, 127) n`, [ann, priv, susp]);
const tie = (await db.query(`select now() - interval '10 days' as t`)).rows[0].t;
await db.query(`insert into public.posts (user_id, caption, created_at) values ($1, 'tie1', $2), ($1, 'tie2', $2), ($1, 'tie3', $2)`, [ann, tie]);
await db.query(`update public.posts set is_archived = true where caption = 'p5'`).catch(() => undefined);
for (let n = 0; n < 7; n++) await db.query(`insert into public.reels (user_id, video_url, caption, created_at) values ($1, 'reels/r${n}.mp4', 'r${n}', now() - interval '${n} hours')`, [priv]);
for (let n = 0; n < 3; n++) await db.query(`insert into public.long_videos (user_id, video_url, title, duration_seconds, created_at) values ($1, 'videos/v${n}.mp4', 'v${n}', 60, now() - interval '${n} hours')`, [priv]);
for (let n = 0; n < 4; n++) await db.query(`insert into public.stories (user_id, media_url, media_type, created_at) values ($1, 'stories/s${n}.jpg', 'image', now() - interval '${n} days')`, [susp]).catch(async () => {
  await db.query(`insert into public.stories (user_id, media_url, created_at) values ($1, 'stories/s${n}.jpg', now() - interval '${n} days')`, [susp]);
});
const i1 = (await db.query(`insert into public.instants (user_id, media_url, caption, audience) values ($1, 'instants/one.jpg', 'hi', 'friends') returning id`, [ann])).rows[0].id;
await db.query(`insert into public.instant_recipients (instant_id, user_id) values ($1, $2)`, [i1, priv]);

section('1. Who may call it');
await expectFail(() => rpc(ann, 'admin_content_page', 'posts'), /Access denied/, 'an ordinary member is refused');
await expectFail(() => rpc(priv, 'admin_content_page', 'instants'), /Access denied/, 'even someone who received an instant is refused');
let denied = false;
try { await asAnon(db, async () => db.query(`select public.admin_content_page('posts')`)); } catch (e) { denied = /permission denied/.test(e.message); }
check(denied, 'someone not signed in is refused');
await expectFail(() => rpc(admin, 'admin_content_page', 'nonsense'), /Unknown content type/, 'an unknown kind is refused');

section('2. Posts: everything, in pages, nothing skipped or repeated');
const totalPosts = Number((await db.query(`select count(*) n from public.posts`)).rows[0].n);
let page = await rpc(admin, 'admin_content_page', 'posts', 40);
check(page.success && page.total === totalPosts && totalPosts === 130, 'the real total is reported', `${page.total}/${totalPosts}`);
check(page.items.length === 40 && page.hasMore === true && page.nextAt && page.nextId, 'first page: 40 rows, more to come, with a cursor');
const ids = page.items.map((p) => p.id);
let guard = 0;
while (page.hasMore && guard++ < 10) { page = await rpc(admin, 'admin_content_page', 'posts', 40, page.nextAt, page.nextId); ids.push(...page.items.map((p) => p.id)); }
check(ids.length === totalPosts && new Set(ids).size === totalPosts, 'walking the pages returns all 130 posts exactly once (ties on one timestamp included)', `${ids.length} / unique ${new Set(ids).size}`);
check(page.hasMore === false && page.nextAt === null, 'the last page says there is no more');
const dbOrder = (await db.query(`select id from public.posts order by created_at desc, id desc`)).rows.map((r) => r.id);
check(JSON.stringify(ids) === JSON.stringify(dbOrder), 'newest first, ties broken by id');
const everyone = new Set((await db.query(`select id from public.posts where user_id = any($1::uuid[])`, [[priv, susp]])).rows.map((r) => r.id));
check(ids.filter((x) => everyone.has(x)).length === everyone.size && everyone.size > 0, 'includes posts of private and suspended accounts (the admin sees all, as the old browser did)');
check(ids.includes((await db.query(`select id from public.posts where caption = 'p5'`)).rows[0].id), 'includes archived posts');

section('3. Tie cursor and clamping');
const t1 = await rpc(admin, 'admin_content_page', 'posts', 5, tie, '00000000-0000-0000-0000-000000000000');
check(t1.items.every((p) => !/^tie/.test(p.caption)), 'a cursor with the all-zero id at the tie time skips the tied rows (only smaller ids / older rows follow)');
const t2 = await rpc(admin, 'admin_content_page', 'posts', 5, tie, 'ffffffff-ffff-ffff-ffff-ffffffffffff');
check(t2.items.length === 3 && t2.items.every((p) => /^tie/.test(p.caption)), 'a cursor with the highest id at the tie time returns exactly the 3 tied rows');
check((await rpc(admin, 'admin_content_page', 'posts', 100000)).items.length === 100, 'limit is clamped to 100');
check((await rpc(admin, 'admin_content_page', 'posts', 0)).items.length === 1, 'limit is clamped to at least 1');
check((await rpc(admin, 'admin_content_page', 'posts')).items.length === 60, 'default page is 60');
const beyond = await rpc(admin, 'admin_content_page', 'posts', 10, '1999-01-01T00:00:00Z', null);
check(beyond.items.length === 0 && beyond.hasMore === false && beyond.total === 130, 'a cursor past the end gives an empty page with the total');

section('4. Reels, videos, stories, instants');
let r = await rpc(admin, 'admin_content_page', 'reels', 3);
check(r.total === 7 && r.items.length === 3 && r.hasMore, 'reels: total 7, pages of 3');
let rr = await rpc(admin, 'admin_content_page', 'reels', 5, r.nextAt, r.nextId);
check(rr.items.length === 4 && rr.hasMore === false && rr.nextAt === null, 'reels: the rest, no more');
r = await rpc(admin, 'admin_content_page', 'videos', 2);
check(r.total === 3 && r.items.length === 2 && r.hasMore && (await rpc(admin, 'admin_content_page', 'videos', 2, r.nextAt, r.nextId)).items.length === 1, 'videos page');
r = await rpc(admin, 'admin_content_page', 'stories', 3);
check(r.total === 4 && r.items.length === 3 && r.hasMore && (await rpc(admin, 'admin_content_page', 'stories', 3, r.nextAt, r.nextId)).items.length === 1, 'stories (of a suspended account) page');
r = await rpc(admin, 'admin_content_page', 'instants', 10);
check(r.total === 1 && r.items[0].username === 'ann' && r.items[0].sentTo === 1 && r.items[0].mediaType === 'image' && r.hasMore === false, 'instants carry owner, count sent, type');

section('5. The old functions and normal users are unchanged');
check((await rpc(admin, 'admin_content_feed', 'posts', 10)).items.length === 10, 'admin_content_feed still works');
check((await rpc(ann, 'feed_posts_page', 30)).length <= 30, 'normal feed paging still answers for a member');

section('6. The panel is wired to it');
const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const modal = read('src/components/Modals/AdminControlModal.tsx'), api = read('src/services/supabaseApi.ts');
check(/admin_content_page/.test(api) && /p_before_at/.test(api) && /p_before_id/.test(api), 'the service calls admin_content_page with the cursor');
check(/fetchAdminContentPage\(type, null\)/.test(modal) && !/fetchAdminContentFeed/.test(modal), 'the panel loads the first page through it (no 60/200 cap)');
check(/loadMoreContent/.test(modal) && /Load more/.test(modal) && /IntersectionObserver/.test(modal), 'Load more button and automatic loading at the end of the list');
check(/admin-content-count/.test(modal) && /contentTotal/.test(modal), 'the total count is shown');
check(/contentRequest\.current/.test(modal), 'a slow answer for another kind can not land on the wrong list');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
