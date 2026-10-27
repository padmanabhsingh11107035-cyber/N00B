// The website is plain files (see wrangler.jsonc). Two kinds of request come here first:
//   1. the two big files of Neon Alley (too large for a website file, 25 MB each at most): they live in this repository's "game-data" release and are handed out from the website's own address
//      (their names carry a fingerprint, so they never change);
//   2. every picture, video and song of the app, at  /m/<key>  (the key of the file in the "media" bucket of Supabase Storage). See serveMedia() below for why this exists.
//      The older address  /media/<key>  (what app versions from before the cache still ask for: an Android app that was not updated, a tab left open for days) is the same thing.
// Every other address is served straight from the files, as before.
const RELEASE = 'https://github.com/padmanabhsingh11107035-cyber/N00B/releases/download/game-data/';

/** address under /games/neon-alley/data/  ->  file in the release (the version is part of the name, so a changed file is a new address) */
const FILES = {
  // the engine, kept compressed (9 MB instead of 40 MB); the browser unpacks it by itself
  'engine-br.5b0faa32.wasm': { file: 'na-engine-5b0faa32.br', type: 'application/wasm', encoding: 'br' },
  // the game's pictures, music and scripts
  'data.e7565660.pck': { file: 'na-data-e7565660.pck', type: 'application/octet-stream' },
};

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------- media
// Supabase's Free plan allows 5 GB a month of "Cached Egress" (every byte its storage hands out), and NOOB used 11.6 GB with only 0.3 GB of files: the same files were fetched
// from Supabase again and again. Pictures are fetched whole, so a cache keeps them; but a browser loads a VIDEO or a SONG in pieces (Range requests), and a cache that only
// remembers whole files never saves a piece: every play went back to Supabase, the 45 MB reels worst of all.
// Here the Worker keeps the WHOLE file in its data centre's cache (the Cache API: one copy per data centre, the same for every request there), answers pieces from it, and when a
// piece is asked for before the file is cached it answers that piece from Supabase at once (the person waits for nothing) and fetches the whole file once in the background.
// After that, Supabase is not asked again for that file from that data centre until the copy is 30 days old.
const SUPABASE = 'https://abffssydapumuhwgzeck.supabase.co';
const BUCKET = 'media';
const CACHE_ORIGIN = 'https://noobsocials.com';   // one cache address per file, whichever site address the request came on
const KEEP_SECONDS = 30 * 24 * 3600;              // how long the data centre keeps a file (a file the owner deleted is gone from here within this time)
const MAX_CACHED_BYTES = 60 * 1024 * 1024;        // bigger files are passed through and not kept (the bucket's own limit is 50 MB)
const LOCK_SECONDS = 300;                         // while one request is filling the cache with a file, others do not start the same download
const inFlight = new Set();

const MEDIA_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
  'Cache-Control': 'public, max-age=31536000, immutable',
  'X-Content-Type-Options': 'nosniff',
  // a file opened on its own (an uploaded picture that is really a web page, an SVG with a script in it) can run nothing here
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  'Cross-Origin-Resource-Policy': 'cross-origin',
};

/** "/m/posts/123-abc.jpg" (or the older "/media/posts/123-abc.jpg") -> "posts/123-abc.jpg"; null when it is not a plain file key (nothing with .., empty parts, control characters or backslashes) */
export function mediaKey(pathname) {
  const skip = pathname.startsWith('/m/') ? 3 : pathname.startsWith('/media/') ? 7 : 0;
  if (!skip) return null;
  let parts;
  try { parts = pathname.slice(skip).split('/').map((p) => decodeURIComponent(p)); } catch { return null; }
  if (parts.length === 0 || parts.length > 8) return null;
  for (const p of parts) {
    if (p === '' || p === '.' || p === '..' || p.length > 200 || /[\u0000-\u001f\\]/.test(p) || p.includes('/')) return null;
  }
  const key = parts.join('/');
  return key.length > 400 ? null : key;
}

const upstreamUrl = (key) => `${SUPABASE}/storage/v1/object/public/${BUCKET}/${key.split('/').map(encodeURIComponent).join('/')}`;
const cacheUrl = (key) => `${CACHE_ORIGIN}/m/${key.split('/').map(encodeURIComponent).join('/')}`;

/** the headers a person gets: the file's own (type, size, place, date) plus ours */
function outHeaders(from, cache) {
  const h = new Headers(MEDIA_HEADERS);
  for (const name of ['Content-Type', 'Content-Length', 'Content-Range', 'ETag', 'Last-Modified']) {
    const v = from.get(name);
    if (v) h.set(name, v);
  }
  h.set('Accept-Ranges', 'bytes');
  h.set('X-Media-Cache', cache);
  return h;
}

/** a copy of a whole file in the form the cache keeps it */
function storable(up) {
  const h = new Headers();
  for (const name of ['Content-Type', 'Content-Length', 'ETag', 'Last-Modified']) {
    const v = up.headers.get(name);
    if (v && !(name === 'Content-Length' && up.headers.get('Content-Encoding'))) h.set(name, v);
  }
  h.set('Accept-Ranges', 'bytes');
  h.set('Cache-Control', `public, max-age=${KEEP_SECONDS}`);
  return new Response(up.body, { status: 200, headers: h });
}

/** the right to download a whole file (only one request at a time does it for a file): true when this request has it, and must call inFlight.delete(key) when it is done */
async function claim(cache, key) {
  const lock = new Request(`${CACHE_ORIGIN}/m-lock/${encodeURIComponent(key)}`);
  if (inFlight.has(key)) return false;
  inFlight.add(key);   // before anything is awaited, so two requests at the same moment cannot both start
  try {
    if (await cache.match(lock)) { inFlight.delete(key); return false; }   // another data-centre process is already doing it
    await cache.put(lock, new Response('1', { headers: { 'Cache-Control': `public, max-age=${LOCK_SECONDS}` } }));
    return true;
  } catch { inFlight.delete(key); return false; }
}

/** download the whole file once and keep it (only one request at a time does this for a file) */
async function fill(cache, key) {
  if (!(await claim(cache, key))) return;
  try {
    const up = await fetch(upstreamUrl(key));
    const length = Number(up.headers.get('Content-Length') || 0);
    if (up.status !== 200 || !up.body || !length || length > MAX_CACHED_BYTES) { await up.body?.cancel(); return; }
    await cache.put(new Request(cacheUrl(key)), storable(up));
  } catch { /* the next request tries again when the lock has run out */ }
  finally { inFlight.delete(key); }
}

/**
 * GET / HEAD /m/<key>.
 * @param {Request} request @param {{ waitUntil: (p: Promise<unknown>) => void }} ctx
 */
export async function serveMedia(request, ctx, cacheStorage = globalThis.caches) {
  const url = new URL(request.url);
  const key = mediaKey(url.pathname);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...MEDIA_HEADERS, 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Allow-Headers': 'Range, If-None-Match, If-Modified-Since', 'Cache-Control': 'public, max-age=86400' } });
  if (!key || (request.method !== 'GET' && request.method !== 'HEAD')) return new Response('Not found', { status: key ? 405 : 404, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

  const cache = cacheStorage.default;
  const range = request.headers.get('Range');
  const keyRequest = new Request(cacheUrl(key), range ? { headers: { Range: range } } : undefined);

  // 1. kept already: answered from the cache (a piece, when a piece is asked for)
  const hit = await cache.match(keyRequest);
  if (hit && (!range || hit.status === 206)) {
    return new Response(request.method === 'HEAD' ? null : hit.body, { status: hit.status, headers: outHeaders(hit.headers, 'HIT') });
  }
  if (hit && range && hit.status === 200) {
    // the cache gave the whole file for a piece: not wanted here, hand the piece from Supabase and keep the file as it is
    await hit.body?.cancel();
    const piece = await fetch(upstreamUrl(key), { headers: { Range: range } });
    return new Response(request.method === 'HEAD' ? null : piece.body, { status: piece.status, headers: outHeaders(piece.headers, 'HIT-PIECE-FROM-SOURCE') });
  }

  // 2. not kept yet
  if (request.method === 'HEAD') {
    const head = await fetch(upstreamUrl(key), { method: 'HEAD' });
    return new Response(null, { status: head.status, headers: head.ok ? outHeaders(head.headers, 'MISS') : { 'Cache-Control': 'no-store' } });
  }
  if (range && /^bytes=0-$/.test(range.trim()) && await claim(cache, key)) {
    // "from the start to the end" (what a video or a song asks first): the whole file is fetched ONCE, handed over as it arrives and kept, instead of the piece from Supabase plus a second download of the same bytes
    let kept = false;
    try {
      const up = await fetch(upstreamUrl(key));
      if (!up.ok) { await up.body?.cancel(); return new Response('Not found', { status: up.status === 404 || up.status === 400 ? 404 : 502, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } }); }
      const length = Number(up.headers.get('Content-Length') || 0);
      if (!up.body || !length || length > MAX_CACHED_BYTES || up.headers.get('Content-Encoding')) {
        return new Response(up.body, { status: 200, headers: outHeaders(up.headers, 'BYPASS') });
      }
      const [toPerson, toCache] = up.body.tee();
      kept = true;
      ctx.waitUntil(cache.put(new Request(cacheUrl(key)), storable(new Response(toCache, { status: 200, headers: up.headers }))).catch(() => undefined).finally(() => inFlight.delete(key)));
      const h = outHeaders(up.headers, 'MISS');
      h.set('Content-Range', `bytes 0-${length - 1}/${length}`);
      return new Response(toPerson, { status: 206, headers: h });
    } finally { if (!kept) inFlight.delete(key); }
  }
  if (range) {
    // a piece before the file is kept: the piece at once, the whole file in the background
    const piece = await fetch(upstreamUrl(key), { headers: { Range: range } });
    if (!piece.ok) { await piece.body?.cancel(); return new Response('Not found', { status: piece.status === 416 ? 416 : 404, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } }); }
    ctx.waitUntil(fill(cache, key));
    return new Response(piece.body, { status: piece.status, headers: outHeaders(piece.headers, 'MISS-FILLING') });
  }
  const up = await fetch(upstreamUrl(key));
  if (!up.ok) { await up.body?.cancel(); return new Response('Not found', { status: up.status === 404 || up.status === 400 ? 404 : 502, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } }); }
  const length = Number(up.headers.get('Content-Length') || 0);
  if (!up.body || !length || length > MAX_CACHED_BYTES || up.headers.get('Content-Encoding')) {
    return new Response(up.body, { status: 200, headers: outHeaders(up.headers, 'BYPASS') });   // too big to keep, or of unknown size: handed over as it is
  }
  const [toPerson, toCache] = up.body.tee();
  ctx.waitUntil(cache.put(new Request(cacheUrl(key)), storable(new Response(toCache, { status: 200, headers: up.headers }))).catch(() => undefined));
  return new Response(toPerson, { status: 200, headers: outHeaders(up.headers, 'MISS') });
}

export default {
  /** @param {Request} request @param {{ ASSETS: { fetch: (r: Request) => Promise<Response> } }} env @param {{ waitUntil: (p: Promise<unknown>) => void }} ctx */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/m/') || url.pathname.startsWith('/media/')) return serveMedia(request, ctx);
    // The approximate place of the connection (city, region, country), as Cloudflare works it out from the internet address: told only to the person who asks, about their own
    // connection, never stored here, never sent to anyone else (the Terms and the Privacy Policy say so). The app saves it on the person's account.
    if (url.pathname === '/__geo' && (request.method === 'GET' || request.method === 'HEAD')) {
      const cf = request.cf || {};
      return new Response(JSON.stringify({ city: cf.city || '', region: cf.region || '', country: cf.country || '' }), {
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' }
      });
    }

    const name = url.pathname.startsWith('/games/neon-alley/data/') ? url.pathname.slice('/games/neon-alley/data/'.length) : '';
    const entry = Object.prototype.hasOwnProperty.call(FILES, name) ? FILES[name] : null;
    if (!entry || (request.method !== 'GET' && request.method !== 'HEAD')) return env.ASSETS.fetch(request);

    // streamed straight through (the release's own address is a short-lived redirect). The browser keeps the file for a year: the address changes when the file does.
    const upstream = await fetch(RELEASE + entry.file);
    if (!upstream.ok) return new Response('Game file unavailable', { status: 502, headers: { 'Cache-Control': 'no-store' } });
    const headers = new Headers({
      'Content-Type': entry.type,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    // the file is already compressed: it is handed over as it is (without "manual" the runtime would compress it a second time)
    if (entry.encoding) headers.set('Content-Encoding', entry.encoding);
    const length = upstream.headers.get('Content-Length');
    if (length) headers.set('Content-Length', length);
    return new Response(request.method === 'HEAD' ? null : upstream.body, { status: 200, headers, encodeBody: entry.encoding ? 'manual' : 'automatic' });
  },
};
