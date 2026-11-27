// "Most viewed" on Home: the database function that hands out view numbers (migration 20261127000001) on a REAL Postgres (PGlite) with every migration applied, and how Home sorts with it.
// Usage: node --liftoff-only scripts/supabase/test-post-view-counts.mjs
import fs from 'node:fs';
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';
import * as F from '../../src/utils/homeFilter.ts';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

section('1. The database');
const sql = read('supabase/migrations/20261127000001_post_view_counts.sql');
check(/revoke all on function public\.post_view_counts\(uuid\[\]\) from public, anon/.test(sql) && /grant execute on function public\.post_view_counts\(uuid\[\]\) to authenticated/.test(sql) && /\[1:200\]/.test(sql) && !/(insert|update|delete) /i.test(sql.replace(/--.*$/gm, '')), 'a logged-in person only; 200 posts at most; it writes nothing');
const db = await createTestDb();
const mk = async (name) => {
  const id = (await db.query('select gen_random_uuid() as id')).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password, raw_user_meta_data) values ($1, $2, 'x', $3::jsonb)`, [id, `${name}@users.nooob.xyz`, JSON.stringify({ legacy_id: `u_${name}` })]);
  await db.query(`insert into public.profiles (id, username, display_name, avatar) values ($1, $2, $2, 'avatars/test.jpg')`, [id, name]);
  return id;
};
const raw = async (q, a = []) => (await db.query(q, a)).rows;
const counts = (uid, ids) => asUser(db, uid, async () => (await db.query('select public.post_view_counts($1::uuid[]) as r', [ids])).rows[0].r);
const owner = await mk('pv_owner'), a = await mk('pv_a'), b = await mk('pv_b'), c = await mk('pv_c'), blocked = await mk('pv_blocked');
const post = async (uid) => (await raw(`insert into public.posts (user_id, caption) values ($1, 'x') returning id`, [uid]))[0].id;
const p1 = await post(owner), p2 = await post(owner), p3 = await post(owner);
for (const u of [a, b, c]) await raw('insert into public.post_views (post_id, user_id) values ($1, $2)', [p1, u]);
await raw('insert into public.post_views (post_id, user_id) values ($1, $2)', [p2, a]);
const r = await counts(a, [p1, p2, p3]);
check(r[p1] === 3 && r[p2] === 1 && r[p3] === 0, 'it counts the different people who viewed each post (3, 1, 0)', JSON.stringify(r));
check(Object.keys(await counts(a, [])).length === 0 && Object.keys(await counts(a, ['00000000-0000-0000-0000-000000000000'])).length === 0, 'no posts, or posts that do not exist: an empty answer');
check(!JSON.stringify(r).includes(a) && !JSON.stringify(r).includes(b), 'only numbers: nothing about who viewed');
await raw('insert into public.blocks (blocker_id, blocked_id) values ($1, $2)', [owner, blocked]);
check(Object.keys(await counts(blocked, [p1])).length === 0, 'a person the author blocked gets nothing for that author\'s posts');
let denied = '';
try { await asAnon(db, () => db.query('select public.post_view_counts($1::uuid[])', [[p1]])); } catch (e) { denied = String(e.message || e); }
check(/permission denied/i.test(denied), 'a visitor without an account can not ask', denied);
const many = Array.from({ length: 250 }, () => p1);
check(Object.keys(await counts(a, many)).length === 1, 'a long list is cut to 200 and still answers');

section('2. Home sorts by it');
const mkp = (id, i) => ({ id, userId: 'u', username: 'u', userAvatar: '', isVerified: false, caption: '', createdAt: new Date(Date.now() - i * 1000).toISOString(), slides: [{ id: 's', mediaUrl: 'x', mediaType: 'image' }], likesCount: 0, commentsCount: 0, sharesCount: 0, savesCount: 0, isLiked: false, isSaved: false, isDisliked: false, hashtags: [] });
const posts = [mkp('a', 0), mkp('b', 1), mkp('c', 2), mkp('d', 3)];
const ctx = { userId: 'me', following: new Set(), seen: new Set(), now: Date.now(), views: { b: 9, c: 9, d: 2 } };
check(F.SORT_OPTIONS.some((o) => o.id === 'viewed' && o.label === 'Most viewed') && F.readFilter({ sort: 'viewed' }).sort === 'viewed', '"Most viewed" is a choice and is remembered');
check(F.applyHomeFilter(posts, { ...F.EMPTY_FILTER, sort: 'viewed' }, ctx).map((p) => p.id).join() === 'b,c,d,a', 'most viewed first; equal ones keep the feed order; posts with no number last');
check(F.applyHomeFilter(posts, { ...F.EMPTY_FILTER, sort: 'viewed' }, { ...ctx, views: undefined }).map((p) => p.id).join() === 'a,b,c,d', 'until the numbers arrive the order stays as it is');
const feed = read('src/components/Feed/FeedView.tsx'), api = read('src/services/supabaseApi.ts');
check(/post_view_counts/.test(api) && /fetchPostViewCounts/.test(feed) && /homeFilter\.sort !== 'viewed'/.test(feed) && /views: viewCounts/.test(feed), 'Home asks for the numbers only when "Most viewed" is chosen, once per post');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
