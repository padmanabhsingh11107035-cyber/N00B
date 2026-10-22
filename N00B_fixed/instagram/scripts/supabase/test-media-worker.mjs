// The media handler of the website's Worker (worker/index.js, /m/<key>): pictures, videos and songs are kept whole in the data centre's cache, so Supabase Storage (whose
// "Cached Egress" went over the Free plan's 5 GB) is not asked for the same file again and again. Tested here with stand-ins for the cache and for Supabase.
// Usage: node scripts/supabase/test-media-worker.mjs
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);

const W = await import(pathToFileURL(path.resolve('worker/index.js')).href);
const { mediaKey, serveMedia } = W;
const worker = W.default;

// ---- stand-ins: Supabase (a few files) and the cache (keeps whole files, answers pieces like the real one)
const FILES = new Map([
  ['reels/a.mp4', { bytes: new TextEncoder().encode('0123456789abcdefghij'), type: 'video/mp4' }],
  ['posts/pic 1.jpg', { bytes: new TextEncoder().encode('JPEGDATA'), type: 'image/jpeg' }],
]);
let calls = [];
const BIG = 'big/huge.mp4';
const fakeFetch = async (input, init = {}) => {
  const u = new URL(typeof input === 'string' ? input : input.url);
  const method = init.method || 'GET';
  const range = init.headers && (init.headers.Range || init.headers.range);
  const m = /\/storage\/v1\/object\/public\/media\/(.+)$/.exec(u.pathname);
  calls.push({ url: u.pathname, method, range: range || null });
  if (!m) return new Response('no', { status: 400 });
  const key = decodeURIComponent(m[1]).split('/').map((p) => p).join('/');
  if (key === BIG) return new Response(method === 'HEAD' ? null : 'x', { status: 200, headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(70 * 1024 * 1024) } });
  const f = FILES.get(key);
  if (!f) return new Response('{"error":"not_found"}', { status: 404 });
  const base = { 'Content-Type': f.type, ETag: '"abc"', 'Last-Modified': 'Mon, 28 Sep 2026 01:49:05 GMT' };
  if (range) {
    const [s, e] = /bytes=(\d+)-(\d*)/.exec(range).slice(1).map((x) => (x === '' ? undefined : Number(x)));
    const end = e === undefined ? f.bytes.length - 1 : Math.min(e, f.bytes.length - 1);
    const piece = f.bytes.slice(s, end + 1);
    return new Response(method === 'HEAD' ? null : piece, { status: 206, headers: { ...base, 'Content-Length': String(piece.length), 'Content-Range': `bytes ${s}-${end}/${f.bytes.length}` } });
  }
  return new Response(method === 'HEAD' ? null : f.bytes, { status: 200, headers: { ...base, 'Content-Length': String(f.bytes.length) } });
};
globalThis.fetch = fakeFetch;

function makeCache(opts = {}) {
  const store = new Map();
  const cache = {
    puts: 0,
    async put(req, res) {
      const u = typeof req === 'string' ? req : req.url;
      const buf = new Uint8Array(await res.arrayBuffer());
      cache.puts++;
      store.set(u, { buf, status: res.status, headers: [...res.headers.entries()] });
    },
    async match(req) {
      const u = typeof req === 'string' ? req : req.url;
      const e = store.get(u);
      if (!e) return undefined;
      const range = typeof req === 'string' ? null : req.headers.get('Range');
      if (range && e.status === 200 && !opts.noRange) {
        const [s, en] = /bytes=(\d+)-(\d*)/.exec(range).slice(1).map((x) => (x === '' ? undefined : Number(x)));
        const end = en === undefined ? e.buf.length - 1 : Math.min(en, e.buf.length - 1);
        const piece = e.buf.slice(s, end + 1);
        const h = new Headers(e.headers); h.set('Content-Range', `bytes ${s}-${end}/${e.buf.length}`); h.set('Content-Length', String(piece.length));
        return new Response(piece, { status: 206, headers: h });
      }
      return new Response(e.buf, { status: e.status, headers: e.headers });
    },
    has: (u) => store.has(u)
  };
  return { default: cache, raw: cache };
}
const ctxOf = () => { const pending = []; return { waitUntil: (p) => pending.push(p), async done() { await Promise.all(pending); pending.length = 0; } }; };
const get = (p, init) => new Request('https://noobsocials.com' + p, init);
const text = async (r) => new TextDecoder().decode(new Uint8Array(await r.arrayBuffer()));

section('1. Which addresses are files');
check(mediaKey('/m/posts/123-abc.jpg') === 'posts/123-abc.jpg' && mediaKey('/m/avatars/inline-u_1_a.jpg') === 'avatars/inline-u_1_a.jpg', 'a key under /m/ is a file');
check(mediaKey('/m/posts/pic%201.jpg') === 'posts/pic 1.jpg', 'an encoded space is read back');
check(mediaKey('/m/../secret') === null && mediaKey('/m/a/../../b') === null && mediaKey('/m/a/%2e%2e/b') === null && mediaKey('/m/') === null && mediaKey('/m/a//b') === null, 'no climbing out of the folder, no empty parts');
check(mediaKey('/m/a%5Cb') === null && mediaKey('/m/a%00b') === null && mediaKey('/m/a%2Fb') === null && mediaKey('/m/%E0%A4%A') === null, 'no backslashes, no control characters, no hidden slashes, no broken encoding');
check(mediaKey('/media/posts/a.jpg') === null && mediaKey('/other') === null, 'other addresses are not this');

section('2. A whole file: fetched once, then kept');
{
  calls = []; const caches = makeCache(); const ctx = ctxOf();
  const r1 = await serveMedia(get('/m/posts/pic%201.jpg'), ctx, caches); await ctx.done();
  check(r1.status === 200 && (await text(r1)) === 'JPEGDATA' && r1.headers.get('X-Media-Cache') === 'MISS', 'the first request gets the file from Supabase');
  check(caches.raw.puts === 1 && calls.length === 1, 'and the cache keeps a copy (one request to Supabase)');
  const r2 = await serveMedia(get('/m/posts/pic%201.jpg'), ctx, caches); await ctx.done();
  check(r2.status === 200 && (await text(r2)) === 'JPEGDATA' && r2.headers.get('X-Media-Cache') === 'HIT' && calls.length === 1, 'the second is answered from the cache: Supabase is not asked again');
  check(r2.headers.get('Content-Type') === 'image/jpeg' && /immutable/.test(r2.headers.get('Cache-Control')) && r2.headers.get('Access-Control-Allow-Origin') === '*', 'with the file\'s own type, a year of browser caching and open access for the Android app');
  check(r2.headers.get('X-Content-Type-Options') === 'nosniff' && /sandbox/.test(r2.headers.get('Content-Security-Policy')), 'a file opened on its own cannot run anything (nosniff + a sandboxing policy)');
}

section('3. A piece of a video before the file is kept');
{
  calls = []; const caches = makeCache(); const ctx = ctxOf();
  const r = await serveMedia(get('/m/reels/a.mp4', { headers: { Range: 'bytes=2-5' } }), ctx, caches);
  check(r.status === 206 && (await text(r)) === '2345' && r.headers.get('Content-Range') === 'bytes 2-5/20' && r.headers.get('X-Media-Cache') === 'MISS-FILLING', 'the piece is answered at once, from Supabase, with its place in the file');
  await ctx.done();
  check(caches.raw.puts >= 1 && caches.default.has && calls.some((c) => c.range === null && c.method === 'GET'), 'and the whole file is fetched once in the background and kept');
  calls = [];
  const r2 = await serveMedia(get('/m/reels/a.mp4', { headers: { Range: 'bytes=10-13' } }), ctx, caches); await ctx.done();
  check(r2.status === 206 && (await text(r2)) === 'abcd' && r2.headers.get('Content-Range') === 'bytes 10-19/20'.replace('10-19', '10-13') && r2.headers.get('X-Media-Cache') === 'HIT' && calls.length === 0, 'after that every piece comes from the cache and Supabase is not asked at all');
  const r3 = await serveMedia(get('/m/reels/a.mp4', { headers: { Range: 'bytes=0-' } }), ctx, caches);
  check(r3.status === 206 && (await text(r3)) === '0123456789abcdefghij' && r3.headers.get('Content-Range') === 'bytes 0-19/20', 'a browser asking for "from the start to the end" gets all of it as a piece');
}
{
  // two players ask for pieces at the same moment: the whole file is downloaded once, not twice
  calls = []; const caches = makeCache(); const ctx = ctxOf();
  await Promise.all([
    serveMedia(get('/m/reels/a.mp4', { headers: { Range: 'bytes=0-3' } }), ctx, caches),
    serveMedia(get('/m/reels/a.mp4', { headers: { Range: 'bytes=4-7' } }), ctx, caches)
  ]);
  await ctx.done();
  check(calls.filter((c) => c.range === null && c.method === 'GET').length === 1, 'two pieces asked at the same time start only one download of the whole file');
}

section('4. If the cache cannot answer pieces');
{
  calls = []; const caches = makeCache({ noRange: true }); const ctx = ctxOf();
  await serveMedia(get('/m/reels/a.mp4'), ctx, caches); await ctx.done();
  calls = [];
  const r = await serveMedia(get('/m/reels/a.mp4', { headers: { Range: 'bytes=3-6' } }), ctx, caches);
  check(r.status === 206 && (await text(r)) === '3456' && calls.length === 1 && calls[0].range === 'bytes=3-6', 'the piece is taken from Supabase instead (never a wrong answer)');
}

section('5. Things that are not kept, and things that do not exist');
{
  calls = []; const caches = makeCache(); const ctx = ctxOf();
  const r = await serveMedia(get('/m/' + BIG), ctx, caches); await ctx.done();
  check(r.status === 200 && r.headers.get('X-Media-Cache') === 'BYPASS' && caches.raw.puts === 0, 'a file over 60 MB is handed over and not kept');
  const n = await serveMedia(get('/m/posts/nothing.jpg'), ctx, caches);
  check(n.status === 404 && n.headers.get('Cache-Control') === 'no-store', 'a file that is not there is a 404 that nobody keeps');
  const bad = await serveMedia(get('/m/../x'), ctx, caches);
  check(bad.status === 404 && calls.every((c) => !c.url.includes('..')), 'a bad key never reaches Supabase');
  const post = await serveMedia(get('/m/posts/pic%201.jpg', { method: 'POST', body: 'x' }), ctx, caches);
  check(post.status === 405, 'only GET and HEAD');
  const opt = await serveMedia(get('/m/posts/pic%201.jpg', { method: 'OPTIONS' }), ctx, caches);
  check(opt.status === 204 && opt.headers.get('Access-Control-Allow-Origin') === '*', 'OPTIONS answers the browser\'s question');
  const head = await serveMedia(get('/m/reels/a.mp4', { method: 'HEAD' }), ctx, caches);
  check(head.status === 200 && head.headers.get('Content-Length') === '20' && (await head.arrayBuffer()).byteLength === 0, 'HEAD gives the size and no body');
}

section('6. The Worker sends only /m/ here');
{
  const env = { ASSETS: { fetch: async () => new Response('the app') } };
  globalThis.caches = makeCache();
  const ctx = ctxOf();
  const app = await worker.fetch(get('/profile'), env, ctx);
  check((await text(app)) === 'the app', 'every other address is the app, as before');
  const media = await worker.fetch(get('/m/posts/pic%201.jpg'), env, ctx); await ctx.done();
  check(media.status === 200 && (await text(media)) === 'JPEGDATA', 'a /m/ address is a file');
  const na = await worker.fetch(get('/games/neon-alley/data/unknown.bin'), env, ctx);
  check((await text(na)) === 'the app', 'the Neon Alley rule is unchanged');
}

section('7. Wiring');
const wr = fs.readFileSync('wrangler.jsonc', 'utf8');
check(/"run_worker_first": \["\/games\/neon-alley\/data\/\*", "\/m\/\*"\]/.test(wr), 'the Worker runs first for /m/*');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
