// The saved Home feed (stale-while-revalidate): expiry, versions, per-account isolation, clearing, limits, corrupt data, blocked authors, fallbacks.
// Usage: node --liftoff-only scripts/supabase/test-feed-cache.mjs
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const C = await import(pathToFileURL(path.resolve('src/utils/feedCache.ts')).href);
const H = 3600 * 1000;
const posts = (n, by = 'u2') => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, userId: by, caption: `post ${i}` }));
const stories = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, userId: 'u3', ...extra }));
const T0 = 1_800_000_000_000;

console.log('\n1. Round trip and age');
let cache = C.createFeedCache(C.memoryStore());
await cache.write('u1', posts(5), stories(3), T0);
let r = await cache.read('u1', { now: T0 + 1000 });
check(r && r.posts.length === 5 && r.stories.length === 3 && r.posts[0].caption === 'post 0', 'what was written comes back');
r = await cache.read('u1', { now: T0 + 23 * H });
check(r !== null, 'still shown at 23 hours');
r = await cache.read('u1', { now: T0 + 25 * H });
check(r === null, 'ignored after 24 hours');
cache = C.createFeedCache(C.memoryStore());
await cache.write('u1', posts(2), [], T0);
check((await cache.read('u1', { now: T0 - 5000 })) === null, 'a snapshot from the future (clock changed) is ignored');

console.log('\n2. Version mismatch and corrupt data');
const store = C.memoryStore();
cache = C.createFeedCache(store);
await store.set('feed:u1', JSON.stringify({ v: 99, userId: 'u1', savedAt: T0, posts: posts(2), stories: [] }));
check((await cache.read('u1', { now: T0 })) === null, 'another version is ignored');
await new Promise((res) => setTimeout(res, 5));
check((await store.get('feed:u1')) === undefined, '... and removed');
for (const bad of ['not json', '{"v":1}', 'null', '[]', JSON.stringify({ v: 1, userId: 'u1', savedAt: 'x', posts: [], stories: [] }), JSON.stringify({ v: 1, userId: 'u1', savedAt: T0, posts: 'x', stories: [] })]) {
  await store.set('feed:u1', bad);
  check((await cache.read('u1', { now: T0 })) === null, `corrupt entry ignored: ${bad.slice(0, 24)}`);
}

console.log('\n3. One account never sees another account\'s feed');
cache = C.createFeedCache(C.memoryStore());
await cache.write('alice', posts(3), stories(2), T0);
check((await cache.read('bob', { now: T0 })) === null, 'another account reads nothing');
const st2 = C.memoryStore();
cache = C.createFeedCache(st2);
await st2.set('feed:bob', JSON.stringify({ v: 1, userId: 'alice', savedAt: T0, posts: posts(2), stories: [] }));
check((await cache.read('bob', { now: T0 })) === null, 'a snapshot filed under the wrong key but made for another account is refused');
await cache.write('alice', posts(2), [], T0);
await cache.write('bob', posts(1), [], T0);
check((await st2.keys()).filter((k) => k.startsWith('feed:')).join() === 'feed:bob', 'writing a new account keeps only that account\'s snapshot');

console.log('\n4. Clearing');
cache = C.createFeedCache(C.memoryStore());
await cache.write('alice', posts(3), [], T0);
await cache.clear();
check((await cache.read('alice', { now: T0 })) === null, 'log out clears everything');
const st3 = C.memoryStore();
cache = C.createFeedCache(st3);
await st3.set('other:key', 'keep');
await cache.write('alice', posts(1), [], T0);
await cache.clear();
check((await st3.get('other:key')) === 'keep', 'clearing touches only feed entries');
await cache.write('alice', posts(1), [], T0);
await cache.clear('alice');
check((await cache.read('alice', { now: T0 })) === null, 'clear(one account) works');

console.log('\n5. Size limits');
cache = C.createFeedCache(C.memoryStore());
await cache.write('u1', posts(80), stories(60), T0);
r = await cache.read('u1', { now: T0 });
check(r.posts.length === 30 && r.stories.length === 20, 'at most 30 posts and 20 stories');
check(r.posts[0].id === 'p0' && r.posts[29].id === 'p29', 'the first (newest on screen) ones are kept');
const fat = Array.from({ length: 30 }, (_, i) => ({ id: `f${i}`, userId: 'u2', blob: 'x'.repeat(200_000) }));
await cache.write('u1', fat, stories(20), T0);
r = await cache.read('u1', { now: T0 });
check(r === null || JSON.stringify(r).length <= C.FEED_CACHE_MAX_CHARS + 1000, 'an oversized snapshot is shortened, never stored whole', String(r && JSON.stringify(r).length));
await cache.write('u1', [], [], T0);
check((await cache.read('u1', { now: T0 })).posts.length === 0, 'an empty snapshot is allowed');
await cache.write('u1', null, undefined, T0);
check(true, 'bad input to write does not throw');

console.log('\n6. Blocked authors and expired stories are dropped when read');
cache = C.createFeedCache(C.memoryStore());
const mixed = [{ id: 'a', userId: 'good' }, { id: 'b', userId: 'blocked1' }, { id: 'c', userId: 'good' }];
const mixedStories = [{ id: 's1', userId: 'good', expiresAt: new Date(T0 + H).toISOString() }, { id: 's2', userId: 'blocked1' }, { id: 's3', userId: 'good', expiresAt: new Date(T0 - H).toISOString() }];
await cache.write('u1', mixed, mixedStories, T0 - 2 * H);
r = await cache.read('u1', { now: T0, blockedIds: ['blocked1'] });
check(r.posts.map((p) => p.id).join() === 'a,c', 'posts of a blocked author are not shown');
check(r.stories.map((s) => s.id).join() === 's1', 'stories of a blocked author or already expired are not shown');
r = await cache.read('u1', { now: T0 });
check(r.posts.length === 3, 'nobody blocked: all posts');

console.log('\n7. IndexedDB trouble falls back to memory');
const broken = { get: async () => { throw new Error('boom'); }, set: async () => { throw new Error('boom'); }, delete: async () => { throw new Error('boom'); }, keys: async () => { throw new Error('boom'); } };
cache = C.createFeedCache(broken);
await cache.write('u1', posts(3), [], T0);
r = await cache.read('u1', { now: T0 });
check(r && r.posts.length === 3, 'a failing store: the memory copy still works');
await cache.clear();
check((await cache.read('u1', { now: T0 })) === null, 'and clearing works');
cache = C.createFeedCache(null);
await cache.write('u1', posts(1), [], T0);
check((await cache.read('u1', { now: T0 })).posts.length === 1, 'no IndexedDB at all: memory only');
check((await cache.read('', { now: T0 })) === null, 'no account id: nothing');

console.log('\n8. Wiring in the app');
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const app = read('src/App.tsx');
const api = read('src/services/supabaseApi.ts');
check(/feedCache\(\)\.read<Post, Story>\(earlyUser\.id, \{ blockedIds: earlyUser\.blockedUserIds \}\)/.test(app), 'App reads only the signed-in account\'s snapshot and filters blocked authors');
check(/window\.scrollY > window\.innerHeight/.test(app) && /pList\.length === 0/.test(app), 'App keeps what is on screen when scrolled far or when the refresh came back empty');
check(/feedCache\(\)\.write\(user\.id/.test(app), 'App saves the fresh feed');
check(/!loading && !initialLoadFailed && !currentUser\) clearFeedCache\(\)/.test(app), 'App clears the cache when nobody is signed in');
check(/clearFeedCache\(\); \/\/ the saved Home feed/.test(api), 'logoutUser clears the cache');
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
