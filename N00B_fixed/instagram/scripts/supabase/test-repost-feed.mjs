// Reposts, part 2 (migration 20261112000004): one request for the repost state of a whole screen, the repost count, and the reposts of the
// people you follow in the Home feed ("Reposted by").
//   1. the micro-batcher (collects ids for ~30 ms, one request, shared cache) and the compact count (1.2K);
//   2. the merge of reposts into the feed list (pure function);
//   3. the screens and the API are wired (RepostButton, SharePostSheet, StoryViewerModal, FeedView);
//   4. the SQL file is additive; 5. the SQL on a real Postgres (PGlite) with every migration applied.
// Usage: node --liftoff-only scripts/supabase/test-repost-feed.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const bundle = async (entry, name) => {
  const out = path.resolve(`node_modules/.cache-${name}.mjs`);
  buildSync({ entryPoints: [path.resolve(entry)], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
  return import(pathToFileURL(out).href);
};

section('1. The micro-batcher');
const B = await bundle('src/utils/repostBatcher.ts', 'repostbatcher');
const calls = [];
const fetcher = async (kind, ids) => { calls.push({ kind, ids }); return Object.fromEntries(ids.map((id) => [id, { isReposted: id === 'a', count: id === 'a' ? 3 : 0 }])); };
let bt = B.createRepostBatcher(fetcher, 10);
const [ra, rb0, rc] = await Promise.all([bt.get('post', 'a'), bt.get('post', 'b'), bt.get('post', 'a')]);
check(calls.length === 1 && same(calls[0].ids, ['a', 'b']), 'three questions in the same moment are ONE request, each id once', JSON.stringify(calls));
check(ra.isReposted && ra.count === 3 && !rb0.isReposted && rc.count === 3, 'every caller gets its own answer (also the repeated id)');
await bt.get('post', 'a');
check(calls.length === 1, 'a second question for a known id comes from the cache (no request)');
await Promise.all([bt.get('reel', 'r1'), bt.get('post', 'c')]);
check(calls.length === 3 && calls.some((c) => c.kind === 'reel') && calls.some((c) => c.kind === 'post' && same(c.ids, ['c'])), 'posts and reels go in separate requests');
bt.set('post', 'a', { isReposted: false, count: 2 });
check((await bt.get('post', 'a')).count === 2 && calls.length === 3, 'after a toggle the new answer is remembered');
bt.invalidate('post', 'a');
await bt.get('post', 'a');
check(calls.length === 4, 'an invalidated id is asked again');
calls.length = 0; bt = B.createRepostBatcher(fetcher, 5);
const many = Array.from({ length: 230 }, (_, i) => `id${i}`);
await Promise.all(many.map((id) => bt.get('post', id)));
check(calls.length === 3 && calls.every((c) => c.ids.length <= 100) && calls.reduce((n, c) => n + c.ids.length, 0) === 230, '230 ids are split into requests of at most 100');
const failing = B.createRepostBatcher(async () => { throw new Error('offline'); }, 5);
const fs0 = await failing.get('post', 'x');
check(fs0.isReposted === false && fs0.count === 0, 'if the request fails the card shows "not reposted", no crash');
const stale = B.createRepostBatcher(async (k, ids) => { await new Promise((r) => setTimeout(r, 30)); return { [ids[0]]: { isReposted: false, count: 1 } }; }, 1);
const pr = stale.get('post', 'z'); await new Promise((r) => setTimeout(r, 10)); stale.set('post', 'z', { isReposted: true, count: 5 }); await pr;
check((await stale.get('post', 'z')).count === 5, 'a late old answer does not overwrite a newer toggle');
const fc = B.formatCompactCount;
check(fc(0) === '0' && fc(999) === '999' && fc(1000) === '1K' && fc(1200) === '1.2K' && fc(15300) === '15K' && fc(999999) === '1M' && fc(2500000) === '2.5M' && fc(-3) === '0', 'compact count: 999, 1K, 1.2K, 15K, 1M, 2.5M');

section('2. Merging reposts into the feed list (pure)');
const M = await bundle('src/utils/repostFeed.ts', 'repostfeed');
const P = (id) => ({ id, userId: 'u' + id });
const who = (id) => ({ id, username: id, displayName: id.toUpperCase(), avatar: '' });
const rp = (item, by, at, kind = 'post') => ({ kind, repostedAt: at, reposter: who(by), item });
const list = [P('p1'), P('p2'), P('p3')];
const frozen = JSON.stringify(list);
let m = M.mergeFeedReposts(list, [rp(P('p2'), 'ann', '2026-11-10T10:00:00Z')]);
check(same(m.posts.map((p) => p.id), ['p1', 'p2', 'p3']) && m.repostedBy.p2.id === 'ann' && m.added.length === 0, 'original already in the feed: no second card, only the "Reposted by" line');
m = M.mergeFeedReposts(list, [rp(P('n1'), 'ann', '2026-11-10T10:00:00Z'), rp(P('n2'), 'bob', '2026-11-11T10:00:00Z')]);
check(same(m.posts.map((p) => p.id), ['n2', 'n1', 'p1', 'p2', 'p3']) && same(m.added, ['n2', 'n1']), 'new originals go on top, newest repost first; the existing order is untouched');
m = M.mergeFeedReposts(list, [rp(P('n1'), 'ann', '2026-11-10T10:00:00Z'), rp(P('n1'), 'bob', '2026-11-11T10:00:00Z')]);
check(m.posts.filter((p) => p.id === 'n1').length === 1 && m.repostedBy.n1.id === 'bob', 'the same original reposted twice: one card, the most recent reposter');
m = M.mergeFeedReposts(list, [rp(P('r1'), 'ann', '2026-11-10T10:00:00Z', 'reel')]);
check(m.posts.length === 3 && Object.keys(m.repostedBy).length === 0, 'reels never enter the post list');
m = M.mergeFeedReposts(list, [rp(P('n1'), 'me', '2026-11-10T10:00:00Z'), rp(P('n2'), 'ann', '2026-11-10T10:00:00Z')], { ownUserId: 'me' });
check(same(m.posts.map((p) => p.id), ['n2', 'p1', 'p2', 'p3']), 'your own reposts are skipped');
m = M.mergeFeedReposts(list, [rp(P('n1'), 'ann', '2026-11-10T10:00:00Z'), rp(P('p1'), 'ann', '2026-11-10T11:00:00Z')], { isHidden: (item) => item.id === 'n1' || item.id === 'p1' });
check(same(m.posts.map((p) => p.id), ['p1', 'p2', 'p3']) && !m.repostedBy.p1, 'muted / hidden items are dropped (isHidden)');
check(JSON.stringify(list) === frozen && same(M.mergeFeedReposts(list, []).posts, list), 'the incoming list is not changed; no reposts = same list');

section('3. The screens and the API are wired');
const rbSrc = read('src/components/Common/RepostButton.tsx');
check(/repostStates\.get\(kind, id\)/.test(rbSrc) && !/fetchRepostState\b/.test(rbSrc), 'RepostButton asks the batcher, not one request per card');
check(/formatCompactCount\(count\)/.test(rbSrc) && /count > 0/.test(rbSrc) && /data-testid="repost-count"/.test(rbSrc), 'RepostButton shows the compact count only when > 0');
check(/shown \|\| \(on \? 'Reposted' : 'Repost'\)/.test(rbSrc), 'reels rail: count instead of the word Repost when > 0');
check(/setCount\(Math\.max\(0, wasCount \+ \(was \? -1 : 1\)\)\)/.test(rbSrc) && /setCount\(res\.count\)/.test(rbSrc) && /setCount\(wasCount\)/.test(rbSrc), 'count changes at once, then the server number; goes back on an error');
check(/repostStates\.set\(kind, id/.test(rbSrc), 'a toggle updates the shared cache');
const sheet = read('src/components/Common/SharePostSheet.tsx');
check(/repostStates\.get\(/.test(sheet) && !/fetchRepostState\b/.test(sheet) && /repostStates\.set\(/.test(sheet), 'SharePostSheet uses the batcher and updates the cache');
const sv = read('src/components/Stories/StoryViewerModal.tsx');
check(/repostStates\.get\('story'/.test(sv) && !/fetchRepostState\b/.test(sv) && /repostStates\.set\('story'/.test(sv), 'the story viewer uses the batcher');
const apiSrc = read('src/services/supabaseApi.ts');
check(/'repost_states'/.test(apiSrc) && /'feed_reposts'/.test(apiSrc) && /fetchRepostStates/.test(read('src/services/api.ts')) && /fetchFeedReposts/.test(read('src/services/api.ts')), 'API calls repost_states and feed_reposts and api.ts re-exports them');
const fv = read('src/components/Feed/FeedView.tsx');
check(/activeFeedFilter !== 'following' \|\| isRefreshing/.test(fv) && /fetchFeedReposts\(20\)/.test(fv), 'FeedView loads feed reposts only for the Following tab (again after a refresh)');
check(/if \(activeFeedFilter === 'following' && feedReposts\.length > 0\)/.test(fv) && /mergeFeedReposts<Post>\(filteredPosts/.test(fv), 'the merge runs after the existing filters, Following only, on the filtered list');
check(/data-testid="reposted-by-card"/.test(fv) && /Reposted by/.test(fv) && /data-testid="reposted-by-name"/.test(fv) && /openReposter\(by\)/.test(fv), 'the "Reposted by" line opens the profile');
check(/isPostMuted\(item\.userId\) \|\| isPostMuted\(rp\.id\)/.test(fv) && /hiddenAdIds\.includes\(item\.id\)/.test(fv), 'muted accounts and hidden posts stay out');
check(/repostOnlyIds\.has\(id\) \? likeRepostOnly\(id\)/.test(fv) && /repostOnlyIds\.has\(id\) \? void saveRepostOnly\(id\)/.test(fv), 'heart and bookmark work on a card that is only there because of a repost');
check(/filteredPosts\.length === 0 \?/.test(fv) && /paginatedPosts = filteredPosts\.slice\(0, visibleCount\)/.test(fv), 'the empty state and paging still work on the merged list');

section('4. The SQL file');
const sql = read('supabase/migrations/20261112000004_repost_batch_feed.sql');
const code = sql.replace(/--.*$/gm, '');
check(!/\bfeed_posts\b/.test(code), 'the migration does not touch feed_posts');
check(!/\bdrop\s+(table|column|function|index|policy)\b/i.test(code) && !/\balter\s+table\b/i.test(code) && !/\bdelete\s+from\b/i.test(code) && !/\bupdate\s+public\./i.test(code) && !/\binsert\s+into\b/i.test(code) && !/\btruncate\b/i.test(code), 'additive only: no drop, alter, delete, update or insert');
check(same([...code.matchAll(/create or replace function public\.(\w+)/g)].map((x) => x[1]), ['repost_states', 'feed_reposts']), 'two new functions only');
check([...code.matchAll(/security definer set search_path = public/g)].length === 2, 'both are security definer with search_path = public');
check(/revoke all on function public\.repost_states\(text, uuid\[\]\) from public, anon/.test(code) && /grant execute on function public\.feed_reposts\(integer\) to authenticated/.test(code) && !/to anon/.test(code), 'authenticated only');

section('5. The SQL on a real Postgres (every migration applied)');
const { createTestDb, asUser, asAnon } = await import('./pg-test-env.mjs');
const db = await createTestDb();
const mkUser = async (name) => {
  const id = (await db.query('select gen_random_uuid() as id')).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, extensions.crypt('secret pass', extensions.gen_salt('bf')))`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query('select 1 from public.profiles where id = $1', [id])).rows.length) await db.query('insert into public.profiles (id, username, display_name) values ($1, $2, $2)', [id, name]);
  return id;
};
const me = await mkUser('me'), ann = await mkUser('ann'), bob = await mkUser('bob'), cy = await mkUser('cy'), priv = await mkUser('priv'), blk = await mkUser('blk'), nof = await mkUser('nof'), sus = await mkUser('sus');
await db.query(`update public.profiles set account_type = 'private' where id = $1`, [priv]);
await db.query(`update public.profiles set is_suspended = true where id = $1`, [sus]);
await db.query('insert into public.blocks (blocker_id, blocked_id) values ($1, $2)', [blk, me]);
for (const f of [ann, bob, cy, sus]) await db.query('insert into public.follows (follower_id, followee_id) values ($1, $2)', [me, f]);
const mkPost = async (uid, caption, extra = {}) => (await db.query(
  `insert into public.posts (user_id, caption, is_archived, scheduled_for) values ($1, $2, $3, $4) returning id`, [uid, caption, extra.archived || false, extra.scheduled || null])).rows[0].id;
const mkReel = async (uid) => (await db.query(`insert into public.reels (user_id, video_url, caption) values ($1, 'reels/x.mp4', 'r') returning id`, [uid])).rows[0].id;
const rep = (uid, kind, id, at = null) => db.query(`insert into public.reposts (user_id, kind, content_id, created_at) values ($1, $2, $3, coalesce($4::timestamptz, now()))`, [uid, kind, id, at]);
const ago = (h) => new Date(Date.now() - h * 3600000).toISOString();
const call = async (uid, q, args = []) => asUser(db, uid, async () => (await db.query(q, args)).rows[0]?.r);
const fail = async (uid, q, args = []) => { try { await call(uid, q, args); return ''; } catch (e) { return e.message; } };

const pA = await mkPost(nof, 'by a stranger, reposted by ann and bob');
const pB = await mkPost(nof, 'by a stranger, reposted by cy');
const pMine = await mkPost(me, 'my own post that ann reposted');
const pArch = await mkPost(nof, 'archived'); await db.query('update public.posts set is_archived = true where id = $1', [pArch]);
const pFut = await mkPost(nof, 'scheduled later', { scheduled: new Date(Date.now() + 86400000).toISOString() });
const pPriv = await mkPost(priv, 'private account');
const pBlk = await mkPost(blk, 'blocked me');
const pOld = await mkPost(nof, 'reposted long ago');
const pSusReposter = await mkPost(nof, 'reposted by suspended');
const pNotFollowedReposter = await mkPost(nof, 'reposted by somebody I do not follow');
const rPub = await mkReel(nof);
await rep(ann, 'post', pA, ago(5)); await rep(bob, 'post', pA, ago(2));           // bob is more recent
await rep(cy, 'post', pB, ago(1));
await rep(ann, 'post', pMine, ago(1)); await rep(ann, 'post', pArch, ago(1)); await rep(ann, 'post', pFut, ago(1));
await rep(ann, 'post', pPriv, ago(1)); await rep(ann, 'post', pBlk, ago(1));
await rep(ann, 'post', pOld, 24 * 40);
await rep(sus, 'post', pSusReposter, ago(1));
await rep(nof, 'post', pNotFollowedReposter, ago(1));
await rep(me, 'post', pB, ago(1));                                                   // my own repost
await rep(ann, 'reel', rPub, ago(3));
await rep(ann, 'story', (await db.query(`select gen_random_uuid() as id`)).rows[0].id, ago(1));

const feed = await call(me, `select public.feed_reposts() as r`);
const key = (r) => `${r.kind}:${r.item.id}`;
check(same(feed.map(key).sort(), [`post:${pA}`, `post:${pB}`, `reel:${rPub}`].sort()), 'only visible originals reposted by people I follow (own post, archived, scheduled, private, blocked, old, suspended reposter, unfollowed reposter, story: all left out)', JSON.stringify(feed.map(key)));
check(same(feed.map(key), [`post:${pB}`, `post:${pA}`, `reel:${rPub}`]), 'newest repost first');
const fa = feed.find((r) => r.item.id === pA);
check(fa.reposter.username === 'bob' && feed.filter((r) => r.item.id === pA).length === 1, 'two followed people reposted it: one row, the most recent reposter (bob)');
check(fa.kind === 'post' && Array.isArray(fa.item.slides) && 'likesCount' in fa.item && fa.reposter.id === bob && 'displayName' in fa.reposter && 'avatar' in fa.reposter && !!fa.repostedAt, 'row shape: kind, repostedAt, reposter{id,username,displayName,avatar}, item (post_json)');
const reelRow = feed.find((r) => r.kind === 'reel');
check(reelRow.item.id === rPub, 'reels come back as reel_json');
check(same((await call(me, `select public.feed_reposts(1) as r`)).map(key), [`post:${pB}`]), 'p_limit is respected');
check((await call(me, `select public.feed_reposts(0) as r`)).length === 1 && (await call(me, `select public.feed_reposts(9999) as r`)).length === 3, 'the limit is kept between 1 and 50');
await db.query('delete from public.follows where follower_id = $1 and followee_id = $2', [me, bob]);
check((await call(me, `select public.feed_reposts() as r`)).find((r) => r.item.id === pA).reposter.username === 'ann', 'unfollow bob: ann (still followed) is the reposter shown');
check((await call(nof, `select public.feed_reposts() as r`)).length === 0, 'somebody who follows nobody gets an empty list');
check(/Not authenticated|permission denied/.test(await (async () => { try { await asAnon(db, async () => db.query(`select public.feed_reposts()`)); return ''; } catch (e) { return e.message; } })()), 'signed out: refused');
const before = (await db.query('select count(*)::int as n from public.reposts')).rows[0].n;
await call(me, `select public.feed_reposts() as r`);
check((await db.query('select count(*)::int as n from public.reposts')).rows[0].n === before, 'reading the feed changes nothing');

const st = await call(me, `select public.repost_states('post', $1::uuid[]) as r`, [[pA, pB, pMine]]);
check(st[pA].count === 2 && st[pA].isReposted === false && st[pB].count === 2 && st[pB].isReposted === true && st[pMine].count === 1, 'repost_states: count and "did I" for each id in one call', JSON.stringify(st));
check(same(Object.keys(await call(me, `select public.repost_states('post', $1::uuid[]) as r`, [[pA, pA, pA]])), [pA]), 'repeated ids are answered once');
const unknown = (await db.query('select gen_random_uuid() as id')).rows[0].id;
check((await call(me, `select public.repost_states('post', $1::uuid[]) as r`, [[unknown]]))[unknown].count === 0, 'an unknown id is 0 / not reposted');
check(same(await call(me, `select public.repost_states('post', '{}'::uuid[]) as r`), {}), 'empty list = empty answer');
const ids150 = Array.from({ length: 150 }, () => crypto.randomUUID());
check(Object.keys(await call(me, `select public.repost_states('post', $1::uuid[]) as r`, [ids150])).length === 100, 'at most 100 ids are read');
check(/Unknown kind/.test(await fail(me, `select public.repost_states('video', $1::uuid[]) as r`, [[pA]])), 'unknown kind refused');
const single = await call(me, `select public.repost_state('post', $1) as r`, [pA]);
check(single.count === st[pA].count && single.isReposted === st[pA].isReposted, 'agrees with the old single repost_state');
const rs = await call(me, `select public.repost_states('reel', $1::uuid[]) as r`, [[rPub]]);
check(rs[rPub].count === 1, 'reels counted too');
check(/Not authenticated|permission denied/.test(await (async () => { try { await asAnon(db, async () => db.query(`select public.repost_states('post', '{}'::uuid[])`)); return ''; } catch (e) { return e.message; } })()), 'repost_states signed out: refused');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
