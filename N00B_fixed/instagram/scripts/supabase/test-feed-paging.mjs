// Home feed in pages (build switch VITE_FEED_PAGING, migration 20261114000003_feed_posts_page.sql).
//   1. The pure paging logic (src/utils/feedPaging.ts) against a simulated server of 500 posts from 12 authors with created_at ties: first page, successive pages,
//      pull-to-refresh, a new post arriving, a deep link to a post in a page not loaded yet, in-flight sharing, failures, the end, the caps.
//   2. The switch is OFF by default: static checks of App.tsx / FeedView.tsx / .env files (the old call path is untouched).
//   3. The SQL on a real Postgres (PGlite): same posts and same visibility as feed_posts, keyset paging with ties, limit clamp, grants, safe to run twice.
//   4. Start-up payload numbers (200 posts vs 40, and at 2,000 posts).
// Usage: node --liftoff-only scripts/supabase/test-feed-paging.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';
import { createTestDb, asUser, asAnon, MIGRATIONS_DIR } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const bundle = async (entry, name) => {
  const out = path.resolve(`node_modules/.cache-${name}.mjs`);
  buildSync({ entryPoints: [path.resolve(entry)], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
  return import(pathToFileURL(out).href);
};
const noDup = (ids) => new Set(ids).size === ids.length;

// ---- a tiny localStorage so the "seen" list works in node
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const P = await bundle('src/utils/feedPaging.ts', 'feedpaging');
const S = await bundle('src/utils/seenContent.ts', 'feedpaging-seen');

// ---- a simulated server: rows newest first by (created_at, id), the keyset rule of feed_posts_page
const ME = 'u00';
const authors = Array.from({ length: 12 }, (_, i) => `u${String(i).padStart(2, '0')}`);
const T0 = Date.parse('2026-11-01T00:00:00.000Z');
const makeServer = (n, { ties = 3 } = {}) => {
  const rows = [];
  for (let i = 0; i < n; i++) {
    // three posts share every timestamp (ties), ids are NOT in the same order as authors
    const at = new Date(T0 + (n - Math.floor(i / ties)) * 60000).toISOString();
    rows.push({ id: `p${String((i * 7919) % 100000).padStart(5, '0')}`, userId: authors[(i * 5 + (i >> 2)) % 12], createdAt: at, caption: 'x'.repeat(10) });
  }
  const sorted = () => [...rows].sort(P.compareRows);
  const server = {
    rows, calls: [],
    sorted,
    page(limit, cursor) {
      server.calls.push({ limit, cursor });
      const all = sorted();
      const after = cursor ? all.filter((r) => P.compareRows({ id: cursor.id, createdAt: cursor.at }, r) < 0) : all;
      return after.slice(0, Math.min(Math.max(limit, 1), 100)).map((r) => ({ ...r }));
    },
    add(userId = 'u03') { const r = { id: `pnew${rows.length}`, userId, createdAt: new Date(T0 + (n + 5 + rows.length) * 60000).toISOString(), caption: 'new' }; rows.push(r); return { ...r }; }
  };
  return server;
};
const withSeen = (uid, ids) => { store.set(`noob_seen_posts:${uid}`, JSON.stringify(ids)); };

// ---- the screen: the same moves App.tsx / FeedView.tsx make
const makeScreen = (server, { uid = ME, rand = Math.random, pagerOpts = {} } = {}) => {
  const pager = P.createFeedPager({ fetchPage: async (l, c) => server.page(l, c), ...pagerOpts });
  const sc = { pager, posts: [], appended: new Set(), order: [], uid };
  const seen = () => S.getSeenSet(uid, 'posts');
  const lay = () => { sc.order = P.mergeIntoOrderPaged(sc.order, sc.posts, uid, 'posts', sc.appended, seen(), rand); };
  sc.start = async () => { const rows = await pager.first(); sc.posts = rows; sc.appended = new Set(); sc.order = S.orderUnseenFirst(rows, uid, 'posts').map((p) => p.id); return rows; };
  sc.more = async () => {
    const rows = await pager.more();
    if (!rows) return null;
    const { added } = P.mergePages(sc.posts, rows);
    if (added.length) { sc.posts = P.mergePages(sc.posts, added).posts; added.forEach((p) => sc.appended.add(p.id)); lay(); }
    return added;
  };
  sc.arrive = (post) => { sc.posts = [post, ...sc.posts]; lay(); };      // handleNewPost / deep link: put in front of the list
  sc.all = async () => { for (let i = 0; i < 100; i++) { const a = await sc.more(); if (!a) break; } };
  return sc;
};

// =====================================================================================
section('1. The cursor, merge and caps');
check(JSON.stringify(P.cursorOf({ id: 'a', createdAt: 't' })) === '{"at":"t","id":"a"}' && P.cursorOf(null) === null && P.cursorOf({ id: '', createdAt: 't' }) === null, 'the cursor is the last row\'s time + id (nothing for an empty page)');
{
  const m = P.mergePages([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }, { id: 'c' }, { id: 'd' }]);
  check(JSON.stringify(m.posts.map((p) => p.id)) === '["a","b","c","d"]' && JSON.stringify(m.added.map((p) => p.id)) === '["c","d"]', 'mergePages: new rows go to the END, ids already held (or repeated in the page) are skipped');
  const same = P.mergePages([{ id: 'a' }], [{ id: 'a' }]);
  check(same.added.length === 0 && same.posts.length === 1, 'a page of only known ids changes nothing');
}
const base = { feedLength: 40, visibleCount: 4, unseenCount: 20, loaded: 40, ended: false, inflight: false };
check(!P.shouldLoadMore(base), 'plenty below and enough unseen: no request');
check(P.shouldLoadMore({ ...base, visibleCount: 28 }), 'within 12 posts of the end: ask for more');
check(!P.shouldLoadMore({ ...base, visibleCount: 40, inflight: true }), 'never while a request is on its way');
check(!P.shouldLoadMore({ ...base, visibleCount: 40, ended: true }), 'never after the end');
check(!P.shouldLoadMore({ ...base, visibleCount: 40, loaded: 500 }), 'never past the 500 cap');
check(P.shouldLoadMore({ ...base, unseenCount: 3 }), 'fewer than 8 unseen posts from others: keep fetching');
check(!P.shouldLoadMore({ ...base, unseenCount: 3, loaded: 100 }), '...but only up to 100 posts for that reason (a person who has seen everything does not download everything)');

// =====================================================================================
section('2. 500 posts, 12 authors, ties: the pages never skip or repeat a row');
{
  const server = makeServer(500);
  const truth = server.sorted().map((r) => r.id);
  check(noDup(truth), '(the simulated server has unique ids; ties: ' + (server.rows.length - new Set(server.rows.map((r) => r.createdAt)).size) + ' rows share a timestamp with another)');
  const seenIds = truth.filter((_, i) => i >= 10 && i % 5 !== 0);      // 10 newest unseen, then 1 in 5 unseen
  withSeen(ME, seenIds);
  const sc = makeScreen(server);
  const first = await sc.start();
  check(first.length === 40 && server.calls[0].limit === 40 && server.calls[0].cursor === null, 'the start-up call asks for 40 and has no cursor');
  check(JSON.stringify(first.map((r) => r.id)) === JSON.stringify(truth.slice(0, 40)), 'the first page is the 40 newest rows, newest first');
  const screen40 = [...sc.order];
  check(noDup(screen40) && screen40.length === 40, 'the first 40 are on screen once each');
  let pagesLoaded = 0, prevOrder = screen40;
  let prefixOk = true, dupOk = true, setOk = true, unseenFirstOk = true, spreadOk = true;
  const seen = S.getSeenSet(ME, 'posts');
  let pageCmp = 0, pageEarlier = 0;
  for (let i = 0; i < 30; i++) {
    const added = await sc.more();
    if (!added) break;
    pagesLoaded++;
    prefixOk &&= prevOrder.every((id, k) => sc.order[k] === id);                       // what was ordered never moves
    dupOk &&= noDup(sc.order) && noDup(sc.posts.map((p) => p.id));
    setOk &&= JSON.stringify([...sc.order].sort()) === JSON.stringify(sc.posts.map((p) => p.id).sort());
    const seg = sc.order.slice(prevOrder.length).map((id) => sc.posts.find((p) => p.id === id));
    const freshFlags = seg.map((p) => P.countUnseen([p], ME, seen) === 1);
    // CHANGED (feed variety): inside a page the order is weighted-random, not a strict unseen-first. Unseen posts must still sit EARLIER on average than seen ones.
    const avgPos = (flag) => { const ps = freshFlags.map((f, k) => (f === flag ? k : -1)).filter((k) => k >= 0); return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : null; };
    const aU = avgPos(true), aS = avgPos(false);
    if (aU !== null && aS !== null) { pageCmp++; if (aU < aS) pageEarlier++; }
    const adj = (list) => list.reduce((n, p, k) => n + (k > 0 && list[k - 1].userId === p.userId ? 1 : 0), 0);
    spreadOk &&= adj(seg) <= 3;                       // authors are spread per page (CHANGED from <= 1: a random order leaves a few more same-author neighbours in a page's tail)
    prevOrder = [...sc.order];
  }
  check(pagesLoaded >= 15 && sc.pager.state().loaded === 500, `all ${pagesLoaded} later pages arrived (500 rows, the cap)`, JSON.stringify(sc.pager.state()));
  check(prefixOk, 'the first 40 (and every earlier page) on screen never moved when later pages arrived');
  check(dupOk && setOk, 'no duplicate id in the posts or the order after any page; the order holds exactly the loaded posts');
  check(pageCmp > 5 && pageEarlier / pageCmp > 0.8, `unseen posts sit earlier than seen ones inside most appended pages (${pageEarlier}/${pageCmp})`);
  check(spreadOk, 'spreadAuthors still applies per page');
  check(JSON.stringify([...sc.posts.map((p) => p.id)].sort()) === JSON.stringify([...truth].sort()), 'across all pages not one row was skipped or repeated (ties split across page edges)');
  check(server.calls.slice(1).every((c, k) => c.cursor && c.limit === Math.min(30, 500 - (40 + 30 * k))), 'every later call carries the cursor and asks for 30 (the last one only what the cap allows)');
  const st = sc.pager.state();
  check(!st.ended && (await sc.pager.more()) === null && server.calls.length === 1 + pagesLoaded, 'at the 500 cap nothing more is requested');
}

// =====================================================================================
section('3. The end of the list');
{
  const server = makeServer(95);
  withSeen('u04', []);
  const sc = makeScreen(server, { uid: 'u04' });
  await sc.start();
  const a = await sc.more(), b = await sc.more();
  check(a.length === 30 && b.length === 25 && sc.pager.state().ended, 'a short page (25 of 30) ends the list');
  const calls = server.calls.length;
  check((await sc.pager.more()) === null && server.calls.length === calls, 'after the end no further request is made');
  const exact = makeServer(70);
  const s2 = makeScreen(exact);
  await s2.start(); await s2.more();
  check(!s2.pager.state().ended, 'an exactly full last page is not yet "the end"...');
  const e = await s2.more();
  check(e.length === 0 && s2.pager.state().ended, '...one more (empty) request finds it');
  const tiny = makeServer(12);
  const s3 = makeScreen(tiny);
  await s3.start();
  check(s3.pager.state().ended && (await s3.pager.more()) === null && tiny.calls.length === 1, 'fewer than 40 posts in total: one call, no more');
}

// =====================================================================================
section('4. One request at a time, failures, stale answers');
{
  const server = makeServer(300);
  let release; const gate = new Promise((r) => { release = r; });
  let slow = false;
  const pager = P.createFeedPager({ fetchPage: async (l, c) => { if (slow) await gate; return server.page(l, c); } });
  await pager.first();
  slow = true;
  const p1 = pager.more(), p2 = pager.more();
  check(p1 === p2 && pager.state().inflight, 'two requests for the next page at once share ONE request');
  release();
  const rows = await p1;
  check(server.calls.length === 2, '(the server saw one call for the two requests)');
  check(rows.length === 30 && !pager.state().inflight, 'it completes once');
  // pull-to-refresh while a page is on its way
  let release2; const gate2 = new Promise((r) => { release2 = r; });
  slow = true;
  const gated = P.createFeedPager({ fetchPage: async (l, c) => { if (l === 30) await gate2; return server.page(l, c); } });
  await gated.first();
  const stale = gated.more();
  const again = gated.first();
  release2();
  const [staleRows, freshRows] = [await stale, await again];
  check(staleRows === null, 'a page that was on its way when the list was refreshed is thrown away');
  check(freshRows.length === 40 && gated.state().loaded === 40 && gated.state().cursor.id === server.sorted()[39].id, 'refresh starts again from the newest page with a new cursor');
  check((await gated.more()).length === 30, '...and the next page after a refresh is the one after row 40');
  // a page that is asked for while the first page is still loading
  let release3; const gate3 = new Promise((r) => { release3 = r; });
  const slowFirst = P.createFeedPager({ fetchPage: async (l, c) => { if (!c) await gate3; return server.page(l, c); } });
  const f = slowFirst.first();
  check((await slowFirst.more()) === null, 'no "next page" while the first page is still loading');
  release3(); await f;
  // failures
  let clock = 1000, fail = true, calls = 0;
  const flaky = P.createFeedPager({ fetchPage: async (l, c) => { calls++; if (fail && c) throw new Error('net'); return server.page(l, c); }, now: () => clock, retryAfterMs: 3000 });
  await flaky.first();
  check((await flaky.more()) === null && !flaky.state().ended && flaky.state().loaded === 40, 'a failed page: nothing is added, the list is not "ended", the cursor stays');
  const c0 = calls;
  check((await flaky.more()) === null && calls === c0, 'it is not retried in a loop (3 s pause)');
  clock += 3500; fail = false;
  const ok = await flaky.more();
  check(ok.length === 30 && ok[0].id === server.sorted()[40].id, 'after the pause the same page is fetched (no row lost)');
  let threw = false;
  try { await P.createFeedPager({ fetchPage: async () => { throw new Error('x'); } }).first(); } catch { threw = true; }
  check(threw, 'a failed FIRST page is reported to the caller (App turns it into an empty list, as fetchPosts does)');
}

// =====================================================================================
section('5. Pull-to-refresh, a new post, a deep link');
{
  const server = makeServer(500);
  const truth = server.sorted().map((r) => r.id);
  const V5 = 'u05';
  withSeen(V5, truth.filter((_, i) => i >= 6 && i % 4 !== 0));
  const sc = makeScreen(server, { uid: V5 });
  await sc.start(); await sc.more(); await sc.more();
  check(sc.posts.length === 100 && noDup(sc.order), '100 loaded after two pages');
  const before = [...sc.order];
  // a new post arrives (someone published): App puts it in front
  const nu = server.add('u03');
  sc.arrive(nu);
  check(sc.order[0] === nu.id && JSON.stringify(sc.order.slice(1)) === JSON.stringify(before), 'a new post goes on top; everything else keeps its place');
  const next = await sc.more();
  check(next.length === 30 && !next.some((p) => p.id === nu.id) && noDup(sc.order) && sc.order.length === 131, 'the next page continues after the old cursor (the new post is not fetched twice)');
  // a deep link to a post that is in a page not loaded yet
  const deepId = truth[400];
  const deepRow = server.rows.find((r) => r.id === deepId);
  const orderBeforeDeep = [...sc.order];
  sc.arrive({ ...deepRow });
  check(sc.order.includes(deepId) && noDup(sc.order) && orderBeforeDeep.every((id) => sc.order.includes(id)) && JSON.stringify(sc.order.filter((id) => id !== deepId)) === JSON.stringify(orderBeforeDeep), 'a deep-linked old post is added without moving anything else');
  await sc.all();
  check(noDup(sc.order) && noDup(sc.posts.map((p) => p.id)), 'when its page arrives later it is not added a second time');
  check(sc.posts.length === 501 && sc.order.length === 501 && sc.pager.state().loaded === 500, 'nothing lost: all 500 rows + the new post (' + sc.posts.length + ')');
  // refresh
  const startLoaded = sc.pager.state().loaded;
  const rows = await sc.pager.first();
  sc.posts = rows; sc.appended = new Set();
  sc.order = S.orderUnseenFirst(rows, V5, 'posts').map((p) => p.id);
  check(rows.length === 40 && rows[0].id === nu.id && sc.order.length === 40 && noDup(sc.order) && startLoaded === 500 && sc.pager.state().loaded === 40, 'pull-to-refresh resets to the newest 40 (the new post first) and a fresh cursor');
  const more2 = await sc.more();
  check(more2.length === 30 && more2[0].id === server.sorted()[40].id && noDup(sc.order), '...then paging goes on from row 41 with no repeat');
}

// =====================================================================================
section('6. The "few unseen posts" top-up, as App does it');
{
  const run = async (seenIds, V) => {
    const server = makeServer(500);
    withSeen(V, seenIds(server.sorted().map((r) => r.id)));
    const sc = makeScreen(server, { uid: V });
    const first = await sc.start();
    let all = first, loops = 0;
    for (; loops < 10; loops++) {
      const st = sc.pager.state();
      if (!P.shouldLoadMore({ feedLength: Infinity, visibleCount: 0, unseenCount: P.countUnseen(all, V, S.getSeenSet(V, 'posts')), loaded: st.loaded, ended: st.ended, inflight: st.inflight })) break;
      const added = await sc.more();
      if (!added) break;
      all = [...all, ...added];
    }
    return { loaded: sc.pager.state().loaded, loops, unseen: P.countUnseen(all, V, S.getSeenSet(V, 'posts')) };
  };
  const nothingNew = await run((ids) => ids, 'u06');
  check(nothingNew.loaded === 100 && nothingNew.loops === 2, 'a person who has seen everything: stops at 100 posts (2 extra pages), not 500', JSON.stringify(nothingNew));
  const lots = await run((ids) => ids.slice(60), 'u07');
  check(lots.loaded === 40 && lots.loops === 0, 'enough unseen posts in the first page: no extra page', JSON.stringify(lots));
  const some = await run((ids) => ids.filter((_, i) => !(i < 3) && !(i >= 44 && i < 58)), 'u08');
  check(some.loaded === 70 && some.loops === 1 && some.unseen >= 8, 'unseen posts hiding in the second page are found by the top-up, which then stops', JSON.stringify(some));
}

// =====================================================================================
section('7. The build switch is OFF by default (the old call path is untouched)');
{
  const app = read('src/App.tsx'), feed = read('src/components/Feed/FeedView.tsx'), api = read('src/services/supabaseApi.ts');
  check(/const FEED_PAGING = import\.meta\.env\.VITE_FEED_PAGING === '1';/.test(app), 'App: paging is on ONLY when VITE_FEED_PAGING is exactly "1"');
  check(/const feedPager = useMemo\(\(\) => \(FEED_PAGING \? createFeedPager<Post>\(\{ fetchPage: fetchPostsPage \}\) : null\), \[\]\);/.test(app), 'App: with the switch off there is no pager at all');
  check(/const postsP = feedPager \? feedPager\.first\(\)\.catch\(\(\) => \[\] as Post\[\]\) : fetchPosts\(\);/.test(app), 'App: with the switch off the start-up call is fetchPosts() exactly as before');
  check(/onNeedMorePosts=\{feedPager \?/.test(app) && /appendedPostIds=\{feedPager \?/.test(app), 'App: Home gets the paging props only with a pager');
  check(/if \(feedPager\) setAppendedIds/.test(app) && /if \(feedPager && user\)/.test(app) && /if \(!feedPager \|\| !currentUser\) return;/.test(app) && /if \(!feedPager\) return null;/.test(app), 'App: every paging step is guarded by the pager');
  check(/appended \? mergeIntoOrderPaged\(/.test(feed) && /: mergeIntoOrder\(prev, posts, currentUser\.id, 'posts'\)/.test(feed) && /needMoreRef\.current &&/.test(feed), 'FeedView: without the props it uses mergeIntoOrder and asks for nothing');
  check(/rpc<any\[\]>\('feed_posts'\), syncSeenContent/.test(api), 'fetchPosts still calls the old feed_posts');
  const envFiles = ['.env.example', '.env.local', '.env.production', '.env.development', '.env'].filter((f) => fs.existsSync(f));
  check(envFiles.every((f) => !/^\s*VITE_FEED_PAGING\s*=\s*1/m.test(read(f))), 'no env file in the project turns it on (' + envFiles.join(', ') + ')');
  check(/VITE_FEED_PAGING/.test(read('.env.example')) && /20261114000003/.test(read('.env.example')), '.env.example documents VITE_FEED_PAGING and the SQL it needs');
  const wf = fs.existsSync('../../.github/workflows') ? fs.readdirSync('../../.github/workflows').map((f) => read('../../.github/workflows/' + f)).join('\n') : '';
  check(!/VITE_FEED_PAGING/.test(wf) && !/VITE_FEED_PAGING/.test(read('vite.config.ts')) && !/VITE_FEED_PAGING/.test(read('wrangler.jsonc')), 'no workflow / vite / wrangler config sets it');
}

// =====================================================================================
section('8. The SQL (real Postgres via PGlite, every migration applied)');
const SQLF = '20261114000003_feed_posts_page.sql';
const sql = read(path.join(MIGRATIONS_DIR, SQLF));
{
  const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  check(!/\b(drop|delete|truncate|alter\s+table)\b/i.test(code) && /create or replace function public\.feed_posts_page/.test(code) && /create index if not exists/.test(code), 'the SQL file only adds (create or replace function, create index if not exists)');
  check(!/create or replace function public\.feed_posts\(/.test(code), 'feed_posts itself is not touched');
}
const db = await createTestDb();
const mkUser = async (name, extra = '') => {
  const id = (await db.query('select gen_random_uuid() as id')).rows[0].id;
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query('select 1 from public.profiles where id = $1', [id])).rows.length) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $3)`, [id, name, name]);
  return id;
};
const [me, ann, bob, blockedByMe, blocksMe, suspended, priv, privFollowed, hiddenFromMe] = await Promise.all(['me', 'ann', 'bob', 'blockedbyme', 'blocksme', 'susp', 'priv', 'privfollowed', 'hidesfromme'].map((n) => mkUser(n)));
await db.query(`update public.profiles set is_suspended = true where id = $1`, [suspended]);
await db.query(`update public.profiles set account_type = 'private' where id in ($1, $2)`, [priv, privFollowed]);
await db.query(`insert into public.follows (follower_id, followee_id) values ($1, $2)`, [me, privFollowed]);
await db.query(`insert into public.blocks (blocker_id, blocked_id) values ($1, $2), ($3, $4)`, [me, blockedByMe, blocksMe, me]);
await db.query(`insert into public.profile_hides (owner_id, hidden_from_id) values ($1, $2)`, [hiddenFromMe, me]);
const authorsDb = [ann, bob, ann, bob, blockedByMe, blocksMe, suspended, priv, privFollowed, hiddenFromMe, me];
const T = Date.parse('2026-10-01T00:00:00Z');
const inserted = [];
for (let i = 0; i < 150; i++) {
  const author = authorsDb[i % authorsDb.length];
  const at = new Date(T + Math.floor(i / 4) * 1000).toISOString();       // four posts share every timestamp
  const archived = i % 17 === 0, future = i % 23 === 0;
  const id = (await db.query(`insert into public.posts (user_id, caption, created_at, is_archived, scheduled_for) values ($1, $2, $3, $4, $5) returning id`,
    [author, 'post ' + i, at, archived, future ? new Date(Date.now() + 86400000 * 5).toISOString() : null])).rows[0].id;
  inserted.push({ id, author, at, archived, future });
}
const call = (uid, fn, ...args) => asUser(db, uid, async () => {
  if (fn === 'feed_posts_page') { const a = [args.length > 0 ? args[0] : null, args[1] ?? null, args[2] ?? null]; return (await db.query(args.length ? `select public.feed_posts_page($1::int, $2::timestamptz, $3::uuid) as r` : `select public.feed_posts_page() as r`, args.length ? a : [])).rows[0].r; }
  return (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r;
});
const keyOf = (p) => p.id;
for (const [who, uid] of [['an ordinary member', me], ['another member', ann], ['the author of blocked/hidden posts', blockedByMe]]) {
  const oldFeed = await call(uid, 'feed_posts', 500);
  const full = await call(uid, 'feed_posts_page', 100, null, null);
  // page through with a page size that splits the ties
  const got = []; let cursor = null, pages = 0;
  for (; pages < 100; pages++) {
    const page = cursor ? await call(uid, 'feed_posts_page', 7, cursor.at, cursor.id) : await call(uid, 'feed_posts_page', 7, null, null);
    got.push(...page);
    if (page.length < 7) break;
    cursor = { at: page[page.length - 1].createdAt, id: page[page.length - 1].id };
  }
  const oldIds = oldFeed.map(keyOf);
  check(got.length === oldFeed.length && noDup(got.map(keyOf)) && JSON.stringify([...got.map(keyOf)].sort()) === JSON.stringify([...oldIds].sort()), `${who}: paging 7 at a time returns exactly the posts feed_posts returns (${oldFeed.length}), none twice (${pages + 1} pages, 4-way ties)`);
  const byId = new Map(oldFeed.map((p) => [p.id, JSON.stringify(p)]));
  check(got.every((p) => byId.get(p.id) === JSON.stringify(p)), `${who}: every post's JSON is identical to feed_posts`);
  const sortedOk = got.every((p, i) => i === 0 || (Date.parse(got[i - 1].createdAt) > Date.parse(p.createdAt)) || (Date.parse(got[i - 1].createdAt) === Date.parse(p.createdAt) && got[i - 1].id > p.id));
  check(sortedOk, `${who}: newest first, ties broken by id descending`);
  if (oldFeed.length >= 100) check(full.length === 100, `${who}: a request for 100 gives 100`);
}
{
  const ids = (await call(me, 'feed_posts_page', 100, null, null)).map((p) => p.id);
  const none = (author) => !inserted.some((r) => r.author === author && ids.includes(r.id));
  check(none(blockedByMe) && none(blocksMe), 'posts of people I blocked / who blocked me are not in any page');
  check(none(suspended), 'posts of a suspended account are not in any page');
  check(none(hiddenFromMe), 'posts of someone who hid their profile from me are not in any page');
  check(none(priv), 'a private account\'s posts are hidden from a stranger...');
  check(inserted.some((r) => r.author === privFollowed && ids.includes(r.id)), '...but visible when I follow it');
  check(!inserted.some((r) => (r.archived && r.author !== me) && ids.includes(r.id)), 'other people\'s archived posts are not in any page');
  check(!inserted.some((r) => (r.future && r.author !== me) && ids.includes(r.id)), 'other people\'s scheduled (future) posts are not in any page');
}
{
  const lim = async (n) => (await call(ann, 'feed_posts_page', n, null, null)).length;
  check(await lim(0) === 1 && await lim(-5) === 1 && await lim(1) === 1, 'limit 0 / negative is clamped to 1');
  check(await lim(1000) === 100 && await lim(100) === 100, 'limit 1000 is clamped to 100');
  check((await call(ann, 'feed_posts_page')).length === 30, 'no arguments: the newest 30');
  check((await call(ann, 'feed_posts_page', null, null, null)).length === 30, 'a null limit: 30');
  const top = await call(ann, 'feed_posts_page', 3, null, null);
  const after = await call(ann, 'feed_posts_page', 3, top[2].createdAt, top[2].id);
  check(after.length === 3 && !after.some((p) => top.some((t) => t.id === p.id)), 'rows strictly after the cursor row (the cursor row itself is not repeated)');
  const future = await call(ann, 'feed_posts_page', 5, '2000-01-01T00:00:00Z', '00000000-0000-0000-0000-000000000000');
  check(future.length === 0, 'a cursor older than everything returns an empty page');
  check((await call(ann, 'feed_posts_page', 5, '2999-01-01T00:00:00Z', null)).length === 5, 'a cursor in the far future returns the newest rows');
  const rows = (await db.query(`select p.prosecdef, p.provolatile, p.proconfig::text as cfg from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('feed_posts', 'feed_posts_page') order by p.proname`)).rows;
  check(rows.length === 2 && rows[0].prosecdef === rows[1].prosecdef && rows[0].provolatile === 's' && rows[1].provolatile === 's' && rows[0].cfg === rows[1].cfg, 'same security mode (invoker: row-level security decides), stable, same search_path as feed_posts');
  let refused = false;
  try { await asAnon(db, () => db.query(`select public.feed_posts_page(5, null, null)`)); } catch (e) { refused = /permission denied/i.test(e.message); }
  check(refused, 'a logged-out visitor is refused');
  const idx = (await db.query(`select 1 from pg_indexes where tablename = 'posts' and indexname = 'posts_created_id_idx'`)).rows.length;
  check(idx === 1, 'the (created_at desc, id desc) index exists');
  const grants = (await db.query(`select has_function_privilege('anon', 'public.feed_posts_page(integer, timestamptz, uuid)', 'execute') a, has_function_privilege('authenticated', 'public.feed_posts_page(integer, timestamptz, uuid)', 'execute') b, has_function_privilege('public', 'public.feed_posts_page(integer, timestamptz, uuid)', 'execute') c`)).rows[0];
  check(grants.a === false && grants.b === true, 'execute: authenticated yes, anon no');
  const before = (await call(ann, 'feed_posts_page', 100, null, null)).map((p) => p.id).join();
  await db.exec(sql); await db.exec(sql);
  check((await call(ann, 'feed_posts_page', 100, null, null)).map((p) => p.id).join() === before, 'running the file again (twice) changes nothing');
  const plan = (await db.query(`explain select po.id from public.posts po order by po.created_at desc, po.id desc limit 30`)).rows.map((r) => r['QUERY PLAN']).join('\n');
}

// =====================================================================================
section('9. Start-up payload: 200 posts vs 40 (typical post JSON from the mock data)');
{
  // a post as the server sends it (post_json): author card, 1 slide, caption, hashtags, counters. Measured from the real function output on the test database.
  const sample = (await call(ann, 'feed_posts_page', 30, null, null));
  const perPost = sample.length ? Math.round(JSON.stringify(sample).length / sample.length) : 0;
  const rich = perPost + 600;       // a real post also carries a longer caption, a song, tags, a full avatar address ...
  const fmt = (n) => (n / 1024).toFixed(0) + ' KB';
  console.log(`       measured post JSON from the test database: ~${perPost} bytes each (bare posts); a realistic post is ~${rich} bytes`);
  console.log(`       today (200 posts): ${fmt(200 * rich)}    paged first call (40 posts): ${fmt(40 * rich)}    saving: ${Math.round((1 - 40 / 200) * 100)} %`);
  console.log(`       at 2,000 posts: today the call is still the newest 200 (${fmt(200 * rich)}) but the table behind it grows; paged start-up stays ${fmt(40 * rich)} (constant); one scroll page (30) is ${fmt(30 * rich)}`);
  check(perPost > 0, 'sample measured');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
