// The website is plain files (see wrangler.jsonc). Two kinds of request come here first:
//   1. the two big files of Neon Alley (too large for a website file, 25 MB each at most): they live in this repository's "game-data" release and are handed out from the website's own address
//      (their names carry a fingerprint, so they never change);
//   2. every picture, video and song of the app, at  /m/<key>  (the key of the file in the "media" bucket of Supabase Storage). See serveMedia() below for why this exists.
//      The older address  /media/<key>  (what app versions from before the cache still ask for: an Android app that was not updated, a tab left open for days) is the same thing.
// Every other address is served straight from the files, as before.
import { botGate } from './botGate.js';
import { routeFor } from './gamesSite.js';   // the separate games address: its games hub and its 404s (see gamesSite.js)
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
const KEEP_SECONDS = 90 * 24 * 3600;              // how long the data centre keeps a file (a file the owner deleted is gone from here within this time). Every refill is a whole file from Supabase, so: long
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

/** every time Supabase Storage is asked for a file: one line in the Worker's logs (Cloudflare > Workers > n00b > Logs), so the files that really cost Supabase traffic can be seen */
function logOrigin(why, key, bytes) {
  try { console.log(JSON.stringify({ origin: why, key, bytes: Number(bytes) || 0 })); } catch { /* a log line is never a reason to fail */ }
}

/** "bytes=a-b" / "bytes=a-" / "bytes=-n" for a file of `total` bytes -> the first and last byte wanted, or null when it is not a single plain range */
export function parseRange(range, total) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(range || '').trim());
  if (!m || (m[1] === '' && m[2] === '') || !(total > 0)) return null;
  let start, end;
  if (m[1] === '') { start = Math.max(0, total - Number(m[2])); end = total - 1; }
  else { start = Number(m[1]); end = m[2] === '' ? total - 1 : Math.min(Number(m[2]), total - 1); }
  return start <= end && start < total ? { start, end } : null;
}

/** only the bytes start..end (inclusive) of a stream, passed on as they arrive */
function sliceBody(body, start, end) {
  let pos = 0;
  return body.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      const from = pos, to = pos + chunk.byteLength;
      pos = to;
      if (to <= start) return;
      if (from > end) { controller.terminate(); return; }
      controller.enqueue(chunk.subarray(Math.max(0, start - from), Math.min(chunk.byteLength, end + 1 - from)));
    }
  }));
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
    logOrigin('fill', key, length);
    await cache.put(new Request(cacheUrl(key)), storable(up));
  } catch { /* the next request tries again when the lock has run out */ }
  finally { inFlight.delete(key); }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------- private chat media
// A file under chat/ is private to the chat that has it. Locked attachments (chat/<name>.sealed) are random-looking bytes only the chat can open, so they stay as they are (public, cached).
// Every other chat file is handed out only when the database says "yes": the Worker calls  can_read_chat_media(key)  with the CALLER'S OWN sign-in token (so the database knows who
// asks; the Worker holds no secret and no service key at all) and only then streams the file. The answer is remembered for a minute in this Worker instance (a video asks for many
// pieces). CHAT_MEDIA_GATE (a Worker variable): "off" = as before, "log" (the default) = the check is only written down in the logs, the file is served as before, "on" = enforced.
const CHAT_MEMO_SECONDS = 60, CHAT_MEMO_NO_SECONDS = 15, CHAT_MEMO_MAX = 500;
const chatMemo = new Map();   // sha-256 of the token + key -> { allowed, until }

/** is this key a plain chat file (the ones that are private)? */
export function isGatedChatKey(key) { return typeof key === 'string' && key.startsWith('chat/') && !key.endsWith('.sealed'); }
/** "off" | "log" | "on"; anything else (or nothing) is "log". Using the private bucket needs the gate, so it switches the gate on. */
export function gateMode(env) {
  if (env && env.CHAT_MEDIA_PRIVATE_BUCKET === 'on') return 'on';
  const v = String((env && env.CHAT_MEDIA_GATE) || 'log').toLowerCase();
  return v === 'off' || v === 'on' ? v : 'log';
}
/** the sign-in token of a request ("Authorization: Bearer <jwt>"), or '' */
export function bearerToken(request) {
  const m = /^Bearer\s+([A-Za-z0-9._~+/=-]{20,4096})$/i.exec(request.headers.get('Authorization') || '');
  return m ? m[1] : '';
}
async function sha256Hex(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const refusal = (status) => new Response(status === 401 ? 'Unauthorized' : status === 404 ? 'Not found' : 'Unavailable', {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Origin': '*', Vary: 'Authorization' }
});

/** asks the database: 'yes' | 'no' | 'auth' (the token is not a signed-in person's) | 'error' (could not be asked: never a reason to open the file) */
export async function chatMediaVerdict(token, apikey, key, fetchImpl = fetch) {
  const memoKey = (await sha256Hex(token)) + '|' + key;
  const now = Date.now();
  const hit = chatMemo.get(memoKey);
  if (hit && hit.until > now) return hit.allowed ? 'yes' : 'no';
  let res;
  try {
    res = await fetchImpl(`${SUPABASE}/rest/v1/rpc/can_read_chat_media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, apikey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_key: key })
    });
  } catch { return 'error'; }
  if (res.status === 401 || res.status === 403) { await res.body?.cancel(); return 'auth'; }
  if (!res.ok) { await res.body?.cancel(); return 'error'; }
  let allowed;
  try { allowed = (await res.json()) === true; } catch { return 'error'; }
  if (chatMemo.size >= CHAT_MEMO_MAX) chatMemo.delete(chatMemo.keys().next().value);
  chatMemo.set(memoKey, { allowed, until: now + (allowed ? CHAT_MEMO_SECONDS : CHAT_MEMO_NO_SECONDS) * 1000 });
  return allowed ? 'yes' : 'no';
}
/** for tests */
export function clearChatMemo() { chatMemo.clear(); }

/** log mode: write down what the answer would have been (never the token) */
async function logGate(request, key, env) {
  try {
    const token = bearerToken(request), apikey = request.headers.get('apikey') || (env && env.SUPABASE_PUBLISHABLE_KEY) || '';
    const verdict = token && apikey ? await chatMediaVerdict(token, apikey, key) : 'no-token';
    console.log(JSON.stringify({ chatGate: 'log', verdict, key }));
  } catch { /* a log line is never a reason to fail */ }
}

const privateUpstream = (key) => `${SUPABASE}/storage/v1/object/authenticated/chatmedia/${key.split('/').map(encodeURIComponent).join('/')}`;

async function serveChatMedia(request, key, env) {
  const token = bearerToken(request);
  const apikey = request.headers.get('apikey') || (env && env.SUPABASE_PUBLISHABLE_KEY) || '';
  if (!token || !apikey) return refusal(401);
  const verdict = await chatMediaVerdict(token, apikey, key);
  if (verdict === 'auth') return refusal(401);
  if (verdict === 'error') return refusal(503);
  if (verdict === 'no') return refusal(404);   // the same answer as a file that does not exist

  const range = request.headers.get('Range');
  const method = request.method === 'HEAD' ? 'HEAD' : 'GET';
  let up = null;
  if (env && env.CHAT_MEDIA_PRIVATE_BUCKET === 'on') {
    // the private bucket first (with the caller's own token: the bucket's rule asks the same question again), the old public bucket for files that were not moved yet
    const r = await fetch(privateUpstream(key), { method, headers: { Authorization: `Bearer ${token}`, apikey, ...(range ? { Range: range } : {}) } });
    if (r.status === 200 || r.status === 206 || r.status === 416) up = r; else await r.body?.cancel();
  }
  if (!up) {
    // (the public bucket is only asked AFTER the check above; its address is public anyway, so the data centre may keep the bytes for a day to spare Supabase: nobody can reach them without the check)
    up = await fetch(upstreamUrl(key), { method, headers: range ? { Range: range } : {}, cf: { cacheEverything: true, cacheTtl: 86400 } });
  }
  if (up.status === 404 || up.status === 400) { await up.body?.cancel(); return refusal(404); }
  if (!(up.status === 200 || up.status === 206 || up.status === 416)) { await up.body?.cancel(); return refusal(502); }
  logOrigin('chat', key, up.headers.get('Content-Length'));
  const h = new Headers({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
    'Cache-Control': 'private, no-store',
    Vary: 'Authorization',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': MEDIA_HEADERS['Content-Security-Policy'],
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Accept-Ranges': 'bytes',
    'X-Media-Cache': 'PRIVATE'
  });
  for (const name of ['Content-Type', 'Content-Length', 'Content-Range', 'ETag', 'Last-Modified']) { const v = up.headers.get(name); if (v) h.set(name, v); }
  return new Response(method === 'HEAD' ? null : up.body, { status: up.status, headers: h });
}

/**
 * GET / HEAD /m/<key>.
 * @param {Request} request @param {{ waitUntil: (p: Promise<unknown>) => void }} ctx
 */
export async function serveMedia(request, ctx, cacheStorage = globalThis.caches, env = {}) {
  const url = new URL(request.url);
  const key = mediaKey(url.pathname);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...MEDIA_HEADERS, 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Allow-Headers': 'Range, If-None-Match, If-Modified-Since, Authorization, apikey', 'Cache-Control': 'public, max-age=86400' } });
  if (!key || (request.method !== 'GET' && request.method !== 'HEAD')) return new Response('Not found', { status: key ? 405 : 404, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

  // Pictures, videos and voice notes of CHATS are private to the chat (docs/PRIVATE-CHAT-MEDIA.md): they never come from the shared cache below, only after the database says the
  // person asking is in that chat.
  if (isGatedChatKey(key)) {
    const mode = gateMode(env);
    if (mode === 'on') return serveChatMedia(request, key, env);
    if (mode === 'log') { const job = logGate(request, key, env); if (ctx && ctx.waitUntil) ctx.waitUntil(job); else await job; }   // only written down; the file is served exactly as before
  }

  const cache = cacheStorage.default;
  const range = request.headers.get('Range');
  const keyRequest = new Request(cacheUrl(key), range ? { headers: { Range: range } } : undefined);

  // 1. kept already: answered from the cache (a piece, when a piece is asked for)
  const hit = await cache.match(keyRequest);
  if (hit && (!range || hit.status === 206)) {
    return new Response(request.method === 'HEAD' ? null : hit.body, { status: hit.status, headers: outHeaders(hit.headers, 'HIT') });
  }
  if (hit && range && hit.status === 200) {
    // the cache gave the whole file for a piece: the piece is cut out of it here (Supabase is never asked for something the cache already has)
    const total = Number(hit.headers.get('Content-Length') || 0);
    const want = parseRange(range, total);
    if (want && hit.body) {
      const h = outHeaders(hit.headers, 'HIT-SLICED');
      h.set('Content-Range', `bytes ${want.start}-${want.end}/${total}`);
      h.set('Content-Length', String(want.end - want.start + 1));
      return new Response(request.method === 'HEAD' ? null : sliceBody(hit.body, want.start, want.end), { status: 206, headers: h });
    }
    await hit.body?.cancel();
    const piece = await fetch(upstreamUrl(key), { headers: { Range: range } });
    logOrigin('piece', key, piece.headers.get('Content-Length'));
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
      logOrigin('whole-from-start', key, up.headers.get('Content-Length'));
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
    logOrigin('piece', key, piece.headers.get('Content-Length'));
    if (!piece.ok) { await piece.body?.cancel(); return new Response('Not found', { status: piece.status === 416 ? 416 : 404, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } }); }
    ctx.waitUntil(fill(cache, key));
    return new Response(piece.body, { status: piece.status, headers: outHeaders(piece.headers, 'MISS-FILLING') });
  }
  const up = await fetch(upstreamUrl(key));
  logOrigin('whole', key, up.headers.get('Content-Length'));
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
    // www.noobsocials.com is only a second name for the same site: a permanent redirect to the address without www, path and query kept (first of all, before anything else is looked at).
    // Only reading requests are redirected; every other address (the games address, /__geo, /m/ ...) is untouched.
    if (url.hostname === 'www.noobsocials.com' && (request.method === 'GET' || request.method === 'HEAD')) {
      return new Response(null, { status: 301, headers: { Location: 'https://noobsocials.com' + url.pathname + url.search, 'Cache-Control': 'public, max-age=3600' } });
    }
    // The separate games address (docs/GAMES-ORIGIN.md): a public games site. "/" is the games hub (plain files, no sign-in), /games/* are the games; everything else is a 404, so nothing of the app
    // (and no sign-in) can ever exist on it. On the app's address the hub's folder is a 404 too (worker/gamesSite.js).
    const route = routeFor(url.hostname, url.pathname);
    if (route.kind === 'notfound') {
      return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    if (route.kind === 'hub') {
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' } });
      return env.ASSETS.fetch(new Request(new URL(route.asset, url.origin), request));
    }
    const refused = botGate(request);   // AI programs read only the legal and information pages (worker/botGate.js)
    if (refused) return refused;
    if (url.pathname.startsWith('/m/') || url.pathname.startsWith('/media/')) return serveMedia(request, ctx, globalThis.caches, env);
    // The approximate place of the connection (city, region, country), as Cloudflare works it out from the internet address: told only to the person who asks, about their own
    // connection, never stored here, never sent to anyone else (the Terms and the Privacy Policy say so). The app saves it on the person's account.
    if (url.pathname === '/__geo' && (request.method === 'GET' || request.method === 'HEAD')) {
      const cf = request.cf || {};
      // latitude / longitude: the connection's approximate position as Cloudflare works it out from the internet address (usually the city, never a GPS reading); null when unknown
      const coord = (v, max) => { const n = Number.parseFloat(v); return Number.isFinite(n) && Math.abs(n) <= max ? Math.round(n * 1000) / 1000 : null; };
      return new Response(JSON.stringify({ city: cf.city || '', region: cf.region || '', country: cf.country || '', latitude: coord(cf.latitude, 90), longitude: coord(cf.longitude, 180) }), {
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
