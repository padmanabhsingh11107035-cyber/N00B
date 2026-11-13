// The private chat media gate of the website's Worker (worker/index.js): /m/chat/<file> is handed out only to a signed-in member of the chat that has it. Tested with stand-ins for
// Supabase (the database question, the two buckets) and for the cache (which must never be touched for a chat file).
// Usage: node scripts/supabase/test-chat-media-worker.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);

const W = await import(pathToFileURL(path.resolve('worker/index.js')).href);
const { serveMedia, clearChatMemo, gateMode, isGatedChatKey } = W;
const worker = W.default;

const MEMBER = 'member.' + 'a'.repeat(30) + '.sig', STRANGER = 'stranger.' + 'b'.repeat(30) + '.sig', EXPIRED = 'expired.' + 'c'.repeat(30) + '.sig', BROKEN = 'broken.' + 'd'.repeat(30) + '.sig';
const APIKEY = 'sb_publishable_test_key';
const KEY = 'chat/1700000000001-aaaaaaa.jpg', PRIVATE_ONLY = 'chat/1700000000002-bbbbbbb.mp4', VIDEO = 'chat/1700000000003-ccccccc.mp4';
const BYTES = new TextEncoder().encode('0123456789abcdefghij');
const PUBLIC_BUCKET = new Map([[KEY, BYTES], [VIDEO, BYTES], ['posts/pic.jpg', BYTES], ['chat/1700000000004-ddddddd.sealed', BYTES]]);
const PRIVATE_BUCKET = new Map([[PRIVATE_ONLY, BYTES]]);

let calls = [];
globalThis.fetch = async (input, init = {}) => {
  const u = new URL(typeof input === 'string' ? input : input.url);
  const headers = new Headers(init.headers || {});
  const method = init.method || 'GET';
  calls.push({ path: u.pathname, method, headers, body: init.body ? String(init.body) : '', cf: init.cf });
  if (u.pathname === '/rest/v1/rpc/can_read_chat_media') {
    const tok = (headers.get('Authorization') || '').replace(/^Bearer /, '');
    if (tok === EXPIRED) return new Response('{"message":"JWT expired"}', { status: 401 });
    if (tok === BROKEN) return new Response('boom', { status: 500 });
    const allowed = tok === MEMBER;
    return new Response(JSON.stringify(allowed), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  const m = /\/storage\/v1\/object\/(public\/media|authenticated\/chatmedia)\/(.+)$/.exec(u.pathname);
  if (!m) return new Response('no', { status: 400 });
  const bucket = m[1] === 'public/media' ? PUBLIC_BUCKET : PRIVATE_BUCKET;
  if (m[1] !== 'public/media' && !headers.get('Authorization')) return new Response('', { status: 400 });
  const bytes = bucket.get(decodeURIComponent(m[2]));
  if (!bytes) return new Response('{"error":"not_found"}', { status: 404 });
  const base = { 'Content-Type': 'image/jpeg', ETag: '"abc"' };
  const range = headers.get('Range');
  if (range) {
    const [s, e] = /bytes=(\d+)-(\d*)/.exec(range).slice(1).map((x) => (x === '' ? undefined : Number(x)));
    const end = e === undefined ? bytes.length - 1 : Math.min(e, bytes.length - 1);
    const piece = bytes.slice(s, end + 1);
    return new Response(method === 'HEAD' ? null : piece, { status: 206, headers: { ...base, 'Content-Length': String(piece.length), 'Content-Range': `bytes ${s}-${end}/${bytes.length}` } });
  }
  return new Response(method === 'HEAD' ? null : bytes, { status: 200, headers: { ...base, 'Content-Length': String(bytes.length) } });
};
const forbiddenCache = { default: new Proxy({}, { get() { throw new Error('the shared cache must not be used for a chat file'); } }) };
const ctx = { pending: [], waitUntil(p) { this.pending.push(p); } };
const req = (key, headers = {}, method = 'GET') => new Request(`https://noobsocials.com/m/${key}`, { method, headers });
const auth = (tok) => ({ Authorization: `Bearer ${tok}`, apikey: APIKEY });
const text = async (r) => new TextDecoder().decode(await r.arrayBuffer());
const on = { CHAT_MEDIA_GATE: 'on' };
const rpcCalls = () => calls.filter((c) => c.path.includes('/rpc/'));
const originCalls = () => calls.filter((c) => c.path.includes('/storage/'));

section('1. The gate is on: who gets a chat file');
let r = await serveMedia(req(KEY), ctx, forbiddenCache, on);
check(r.status === 401 && (await text(r)) === 'Unauthorized' && calls.length === 0, 'no token: 401, no details, the database and the files are not even asked');
calls = [];
r = await serveMedia(req(KEY, { Authorization: `Bearer ${MEMBER}` }), ctx, forbiddenCache, on);
check(r.status === 401 && calls.length === 0, 'a token without the public key header (and none configured): 401');
r = await serveMedia(req(KEY, { Authorization: 'Basic abc', apikey: APIKEY }), ctx, forbiddenCache, on);
check(r.status === 401 && calls.length === 0, 'a header that is not a Bearer token: 401');
r = await serveMedia(req(KEY, auth(EXPIRED)), ctx, forbiddenCache, on);
check(r.status === 401 && originCalls().length === 0, 'an expired / invalid token (the database says 401): 401, file never asked');
clearChatMemo(); calls = [];
r = await serveMedia(req(KEY, auth(STRANGER)), ctx, forbiddenCache, on);
check(r.status === 404 && (await text(r)) === 'Not found' && originCalls().length === 0 && r.headers.get('Cache-Control') === 'no-store', 'a signed-in stranger: 404 (same as a missing file), the file is never fetched');
r = await serveMedia(req('chat/1700000000099-missing.jpg', auth(MEMBER)), ctx, forbiddenCache, on);
check(r.status === 404, 'a member asking for a file that does not exist: 404');
clearChatMemo(); calls = [];
r = await serveMedia(req(KEY, auth(BROKEN)), ctx, forbiddenCache, on);
check(r.status === 503 && originCalls().length === 0, 'if the database can not be asked, the file is NOT handed out (503, fails closed)');
clearChatMemo(); calls = [];
r = await serveMedia(req(KEY, auth(MEMBER)), ctx, forbiddenCache, on);
check(r.status === 200 && (await text(r)) === '0123456789abcdefghij', 'a member gets the file');
check(r.headers.get('Cache-Control') === 'private, no-store' && /Authorization/.test(r.headers.get('Vary') || '') && r.headers.get('X-Content-Type-Options') === 'nosniff', 'private, no-store, Vary: Authorization');
check(!/immutable|public|max-age/.test(r.headers.get('Cache-Control')), 'never an immutable or public cache header');
check(r.headers.get('Content-Type') === 'image/jpeg' && r.headers.get('Accept-Ranges') === 'bytes', 'the type and byte-range support are passed on');

section('2. Pieces of a video, HEAD, and the one-minute memory');
clearChatMemo(); calls = [];
r = await serveMedia(req(VIDEO, { ...auth(MEMBER), Range: 'bytes=5-9' }), ctx, forbiddenCache, on);
check(r.status === 206 && r.headers.get('Content-Range') === 'bytes 5-9/20' && (await text(r)) === '56789', 'a piece is answered as a piece (206, Content-Range)');
const piece2 = await serveMedia(req(VIDEO, { ...auth(MEMBER), Range: 'bytes=10-' }), ctx, forbiddenCache, on);
check(piece2.status === 206 && (await text(piece2)) === 'abcdefghij', 'the next piece too');
check(rpcCalls().length === 1, 'the database was asked once for the whole video, not once per piece');
check(originCalls().every((c) => c.headers.get('Range')) && originCalls().length === 2, 'the pieces were asked from the file store as pieces');
const head = await serveMedia(req(VIDEO, auth(MEMBER), 'HEAD'), ctx, forbiddenCache, on);
check(head.status === 200 && head.headers.get('Content-Length') === '20' && (await text(head)) === '', 'HEAD works and has no body');
check(originCalls().every((c) => !c.headers.get('Authorization')) && originCalls().every((c) => !c.headers.get('apikey')), "the public file store is asked without the person's token");

section('3. The Worker holds no secret');
const sent = rpcCalls()[0];
check(sent.headers.get('Authorization') === `Bearer ${MEMBER}` && sent.headers.get('apikey') === APIKEY && JSON.parse(sent.body).p_key === VIDEO, "the question is asked with the caller's own token, the public key, and just the file name");
const src = fs.readFileSync('worker/index.js', 'utf8');
check(!/service_role|SERVICE_ROLE|SUPABASE_SERVICE/i.test(src), 'the Worker source mentions no service key');
const logs = [];
const origLog = console.log; console.log = (...a) => logs.push(a.join(' '));
clearChatMemo();
await serveMedia(req(KEY, auth(MEMBER)), ctx, forbiddenCache, on);
await serveMedia(req(KEY, auth(STRANGER)), ctx, forbiddenCache, on);
console.log = origLog;
check(logs.length > 0 && !logs.some((l) => l.includes(MEMBER) || l.includes(STRANGER) || l.includes(APIKEY)), 'no token or key is ever written to the logs');

section('4. Everything else is exactly as before');
const plain = (await import(pathToFileURL(path.resolve('worker/index.js')).href));
const cacheHits = [];
const cacheStub = { default: { async match() { return undefined; }, async put(r) { cacheHits.push(r.url || r); } } };
clearChatMemo(); calls = [];
r = await serveMedia(req('posts/pic.jpg'), ctx, cacheStub, on);
check(r.status === 200 && /immutable/.test(r.headers.get('Cache-Control')) && rpcCalls().length === 0 && (await text(r)) === '0123456789abcdefghij', 'a post picture: public, cached, no question asked');
calls = [];
r = await serveMedia(req('chat/1700000000004-ddddddd.sealed'), ctx, cacheStub, on);
check(r.status === 200 && /immutable/.test(r.headers.get('Cache-Control')) && rpcCalls().length === 0, 'a locked chat file (ciphertext) stays public and cached');
check(isGatedChatKey(KEY) && !isGatedChatKey('chat/x.sealed') && !isGatedChatKey('posts/chat/x.jpg') && !isGatedChatKey('chats/x.jpg'), 'only plain chat/ files are gated');
r = await serveMedia(new Request('https://noobsocials.com/m/chat/x.jpg', { method: 'OPTIONS' }), ctx, cacheStub, on);
check(r.status === 204 && /Authorization/.test(r.headers.get('Access-Control-Allow-Headers')) && /apikey/.test(r.headers.get('Access-Control-Allow-Headers')), 'the browser pre-check allows the Authorization and apikey headers');
check(gateMode({}) === 'log' && gateMode({ CHAT_MEDIA_GATE: 'ON' }) === 'on' && gateMode({ CHAT_MEDIA_GATE: 'off' }) === 'off' && gateMode({ CHAT_MEDIA_GATE: 'weird' }) === 'log' && gateMode(undefined) === 'log', 'the switch: off / log / on, anything else is log, default log');

section('5. The grace switch (log / off): nothing breaks for an app that does not send the token yet');
clearChatMemo(); calls = [];
cacheHits.length = 0;
r = await serveMedia(req(KEY), ctx, cacheStub, {});
await Promise.all(ctx.pending);
check(r.status === 200 && (await text(r)) === '0123456789abcdefghij', 'default (log): a request without a token is still served, as before');
check(/immutable/.test(r.headers.get('Cache-Control')), '...through the old public path');
logs.length = 0; console.log = (...a) => logs.push(a.join(' '));
clearChatMemo(); r = await serveMedia(req(KEY, auth(STRANGER)), ctx, cacheStub, { CHAT_MEDIA_GATE: 'log' }); await Promise.all(ctx.pending);
clearChatMemo(); await serveMedia(req(KEY), ctx, cacheStub, { CHAT_MEDIA_GATE: 'log' }); await Promise.all(ctx.pending);
console.log = origLog;
check(r.status === 200, 'log: a stranger is still served...');
check(logs.some((l) => l.includes('"chatGate":"log"') && l.includes('"verdict":"no"')) && logs.some((l) => l.includes('"verdict":"no-token"')), '...but the would-be refusals are written to the logs (no token / not a member)');
calls = [];
r = await serveMedia(req(KEY, auth(STRANGER)), ctx, cacheStub, { CHAT_MEDIA_GATE: 'off' }); await Promise.all(ctx.pending);
check(r.status === 200 && rpcCalls().length === 0, 'off: nothing is asked or logged');

section('6. The private bucket (CHAT_MEDIA_PRIVATE_BUCKET=on)');
const pv = { CHAT_MEDIA_GATE: 'on', CHAT_MEDIA_PRIVATE_BUCKET: 'on' };
clearChatMemo(); calls = [];
r = await serveMedia(req(PRIVATE_ONLY, auth(MEMBER)), ctx, forbiddenCache, pv);
check(r.status === 200 && (await text(r)) === '0123456789abcdefghij' && originCalls().length === 1 && originCalls()[0].path.includes('/authenticated/chatmedia/'), 'a file in the private bucket is read with the caller\'s own token');
check(originCalls()[0].headers.get('Authorization') === `Bearer ${MEMBER}`, "...never with any other key");
clearChatMemo(); calls = [];
r = await serveMedia(req(KEY, auth(MEMBER)), ctx, forbiddenCache, pv);
check(r.status === 200 && originCalls().length === 2 && originCalls()[1].path.includes('/public/media/'), 'a file not moved yet falls back to the old public bucket');
clearChatMemo(); calls = [];
r = await serveMedia(req(PRIVATE_ONLY, auth(STRANGER)), ctx, forbiddenCache, pv);
check(r.status === 404 && originCalls().length === 0, 'a stranger gets nothing from either bucket');
calls = [];
r = await serveMedia(req('posts/pic.jpg'), ctx, cacheStub, pv);
check(r.status === 200 && originCalls().every((c) => c.path.includes('/public/media/')), 'other folders never touch the private bucket');
r = await serveMedia(req(KEY), ctx, forbiddenCache, { CHAT_MEDIA_PRIVATE_BUCKET: 'on' });
check(r.status === 401, 'using the private bucket switches the gate on by itself');

section('7. Through the real entry point');
clearChatMemo(); calls = [];
const assets = { fetch: async () => new Response('app', { status: 200 }) };
r = await worker.fetch(new Request(`https://noobsocials.com/m/${KEY}`, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/120' } }), { ASSETS: assets, CHAT_MEDIA_GATE: 'on' }, ctx);
check(r.status === 401, 'the Worker passes its variables on: with the gate on and no token the answer is 401');
r = await worker.fetch(new Request(`https://noobsocials.com/m/${KEY}`, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/120', ...auth(MEMBER) } }), { ASSETS: assets, CHAT_MEDIA_GATE: 'on' }, ctx);
check(r.status === 200 && r.headers.get('Cache-Control') === 'private, no-store', '...and with a member\'s token it is served privately');
r = await worker.fetch(new Request(`https://noobsocials.com/media/${KEY}`, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/120' } }), { ASSETS: assets, CHAT_MEDIA_GATE: 'on' }, ctx);
check(r.status === 401, 'the older /media/ address is gated the same way');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
