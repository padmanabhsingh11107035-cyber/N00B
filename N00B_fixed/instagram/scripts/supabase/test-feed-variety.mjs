// Home feed variety: a different weighted-random order on every open/refresh, recently seen posts very unlikely to be early.
// Usage: node scripts/supabase/test-feed-variety.mjs   (seeded rng, no network)
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const bundle = async (entry, name) => {
  const out = path.resolve(`node_modules/.cache-${name}.mjs`);
  buildSync({ entryPoints: [path.resolve(entry)], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
  return import(pathToFileURL(out).href);
};
const S = await bundle('src/utils/seenContent.ts', 'variety-seen');
const P = await bundle('src/utils/feedPaging.ts', 'variety-paging');
const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const noDup = (ids) => new Set(ids).size === ids.length;

const ME = 'me', NOW = Date.parse('2026-11-13T12:00:00Z'), N = 200;
const mk = (n, { own = 0 } = {}) => Array.from({ length: n }, (_, i) => ({
  id: `p${i}`, userId: i < own ? ME : `a${i % 40}`, createdAt: new Date(NOW - (i + 1) * 3600e3 * 2).toISOString()   // p0 newest, 2 h apart
}));
const posts = mk(N);
const top = (o, n) => o.slice(0, n).map((p) => p.id).join();

console.log('\n1. Different seeds, different orders');
{
  let differ = 0;
  for (let s = 0; s < 50; s++) {
    const a = top(S.weightedFeedOrder(posts, { userId: ME, seenList: [], now: NOW, rng: mulberry(s) }), 10);
    const b = top(S.weightedFeedOrder(posts, { userId: ME, seenList: [], now: NOW, rng: mulberry(s + 1000) }), 10);
    if (a !== b) differ++;
  }
  check(differ >= 48, `top-10 differs between two openings in ${differ}/50 pairs`);
  const o1 = top(S.weightedFeedOrder(posts, { userId: ME, seenList: [], now: NOW, rng: mulberry(7) }), 200);
  const o2 = top(S.weightedFeedOrder(posts, { userId: ME, seenList: [], now: NOW, rng: mulberry(7) }), 200);
  check(o1 === o2, 'same seed gives the same answer (pure)');
}

console.log('\n2. Recently seen posts almost never early');
{
  const seenList = posts.slice(0, 30).map((p) => p.id).reverse();   // oldest first; p0 is the most recently seen
  const rank = new Map(seenList.map((id, i) => [id, seenList.length - 1 - i]));
  let seenIn10 = 0, unseenIn10 = 0, slots = 0, rank0in10 = 0, ord = [];
  for (let s = 0; s < 500; s++) {
    const o = S.weightedFeedOrder(posts, { userId: ME, seenList, now: NOW, rng: mulberry(s) });
    ord = o;
    for (const p of o.slice(0, 10)) { slots++; if (rank.has(p.id)) seenIn10++; else unseenIn10++; if (rank.get(p.id) === 0) rank0in10++; }
  }
  console.log(`       measured: recently-seen share of first 10 slots ${(100 * seenIn10 / slots).toFixed(2)}%, unseen ${(100 * unseenIn10 / slots).toFixed(2)}%, the single most recent seen post is in the top 10 in ${(100 * rank0in10 / 500).toFixed(2)}% of openings`);
  check(seenIn10 / slots < 0.05, 'recently seen (rank<30) fill < 5% of the first 10 slots');
  check(unseenIn10 / slots > 0.75, 'unseen posts fill > 75% of the first 10 slots');
  check(noDup(ord.map((p) => p.id)) && ord.length === N, 'no duplicate, nothing lost');
}

console.log('\n3. Someone who has seen everything: least recently seen come first');
{
  const seenList = posts.map((p) => p.id).reverse();   // p0 seen last, p199 seen first
  let leastFirst = 0, posOld = 0, posNew = 0;
  const runs = 300;
  for (let s = 0; s < runs; s++) {
    const o = S.weightedFeedOrder(posts, { userId: ME, seenList, now: NOW, rng: mulberry(s) });
    const pos = new Map(o.map((p, i) => [p.id, i]));
    let a = 0, b = 0;
    for (let i = 0; i < 20; i++) { a += pos.get(`p${N - 1 - i}`); b += pos.get(`p${i}`); }
    posOld += a / 20; posNew += b / 20;
    if (a < b) leastFirst++;
  }
  console.log(`       measured: average slot of the 20 least recently seen ${(posOld / runs).toFixed(1)}, of the 20 most recently seen ${(posNew / runs).toFixed(1)}`);
  check(posOld < posNew && leastFirst / runs > 0.95, `20 least recently seen come before the 20 most recent in ${leastFirst}/${runs} openings`);
  const a = top(S.weightedFeedOrder(posts, { userId: ME, seenList, now: NOW, rng: mulberry(1) }), 15);
  const b = top(S.weightedFeedOrder(posts, { userId: ME, seenList, now: NOW, rng: mulberry(2) }), 15);
  check(a !== b, 'still a different order each time');
}

console.log('\n4. Spread: no author runs while others remain');
{
  const mixed = Array.from({ length: 120 }, (_, i) => ({ id: `m${i}`, userId: i < 30 ? 'big' : `a${i % 25}`, createdAt: new Date(NOW - i * 3600e3).toISOString() }));
  let bad = 0;
  for (let s = 0; s < 100; s++) {
    const o = S.weightedFeedOrder(mixed, { userId: ME, seenList: [], now: NOW, rng: mulberry(s) });
    for (let i = 1; i < 60; i++) if (o[i].userId === o[i - 1].userId) bad++;
  }
  check(bad === 0, `no two neighbours by the same author in the first 60 slots (${bad} violations)`);
}

console.log('\n5. Frozen while scrolling: a new post never reorders existing ids');
{
  store.clear();
  const base = S.weightedFeedOrder(posts, { userId: ME, seenList: [], now: NOW, rng: mulberry(3) }).map((p) => p.id);
  const fresh = { id: 'new1', userId: 'zz', createdAt: new Date(NOW).toISOString() };
  const merged = S.mergeIntoOrder(base, [...posts, fresh], ME, 'posts');
  check(merged[0] === 'new1' && noDup(merged) && merged.length === N + 1, 'the new unseen post goes on top, no duplicate');
  check(JSON.stringify(merged.slice(1)) === JSON.stringify(base), 'every existing id keeps its place');
  const gone = S.mergeIntoOrder(base, posts.slice(1), ME, 'posts');
  check(JSON.stringify(gone) === JSON.stringify(base.filter((id) => id !== 'p0')), 'a removed post just leaves; the rest keep their order');
}

console.log('\n6. Paging: later pages append after what is on screen, same weights');
{
  store.clear();
  const seenList = posts.slice(0, 60).map((p) => p.id).reverse();
  store.set(`noob_seen_posts:${ME}`, JSON.stringify(seenList));
  const first = posts.slice(0, 40), rest = posts.slice(40);
  let order = S.orderUnseenFirst(first, ME, 'posts', mulberry(5)).map((p) => p.id);
  const onScreen = [...order];
  let loaded = [...first], pagesOk = true;
  const appended = new Set();
  for (let k = 0; k < 5; k++) {
    const page = rest.slice(k * 30, k * 30 + 30);
    loaded = [...loaded, ...page]; page.forEach((p) => appended.add(p.id));
    const before = [...order];
    order = P.mergeIntoOrderPaged(order, loaded, ME, 'posts', appended, S.getSeenSet(ME, 'posts'), mulberry(10 + k));
    pagesOk &&= JSON.stringify(order.slice(0, before.length)) === JSON.stringify(before) && noDup(order) && order.length === loaded.length;
  }
  check(pagesOk, 'every page is appended after the existing order, once each');
  check(JSON.stringify(order.slice(0, 40)) === JSON.stringify(onScreen), 'the first screen never moved');
  // first appended page = posts 40..69: p40..p59 seen, p60..p69 unseen -> unseen should lead on average
  const seg = order.slice(40, 70).map((id) => Number(id.slice(1)));
  const slotsU = seg.map((n, i) => (n >= 60 ? i : -1)).filter((i) => i >= 0);
  const avgU = slotsU.reduce((a, b) => a + b, 0) / (slotsU.length || 1);
  check(slotsU.length === 10 && avgU < 14.5, `unseen posts of the page sit in the front half (average slot ${avgU.toFixed(1)} of 30)`);
}

console.log('\n7. Own posts rarely at the top');
{
  const withOwn = mk(100, { own: 10 });
  let ownIn5 = 0, slots = 0;
  for (let s = 0; s < 500; s++) {
    for (const p of S.weightedFeedOrder(withOwn, { userId: ME, seenList: [], now: NOW, rng: mulberry(s) }).slice(0, 5)) { slots++; if (p.userId === ME) ownIn5++; }
  }
  console.log(`       measured: own posts fill ${(100 * ownIn5 / slots).toFixed(2)}% of the first 5 slots (10 of 100 posts are own)`);
  check(ownIn5 / slots < 0.03, 'own posts fill < 3% of the first 5 slots');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
