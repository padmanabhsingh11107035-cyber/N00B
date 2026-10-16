// Tests the Edge Function's "purge_media" action (removes the stored files the database no longer needs), with stand-ins for Supabase and its storage, so it runs without
// the Deno runtime or a real project. The database side is tested on a real Postgres in test-storage-cleanup.mjs.
//
// Usage: node scripts/supabase/test-purge-media-function.mjs
import fs from 'node:fs';
import path from 'node:path';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);

const tmp = path.join('scripts', 'supabase', '_purge-media-test');
fs.mkdirSync(tmp, { recursive: true });
fs.writeFileSync(path.join(tmp, 'stub-supabase.mjs'), `
export function createClient() {
  return {
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    rpc: async (fn, args) => globalThis.__fake.rpc(fn, args),
    storage: { from: (bucket) => ({ remove: async (keys) => globalThis.__fake.remove(bucket, keys) }) },
    from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null }) }; return q; }
  };
}
`);
const src = fs.readFileSync(path.join('supabase', 'functions', 'dynamic-handler', 'index.ts'), 'utf8').replace("'npm:@supabase/supabase-js@2'", "'./stub-supabase.mjs'");
fs.writeFileSync(path.join(tmp, 'fn.ts'), src);

let handler = null;
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc', SUPABASE_ANON_KEY: 'anon' };
globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { handler = h; } };
await import(new URL(`file:///${path.resolve(tmp, 'fn.ts').replace(/\\/g, '/')}`).href);

const SECRET = 'a-very-private-password';
let batches = [], taken = [], done = [], removed = [], removeError = null, takeError = null;
globalThis.__fake = {
  rpc: async (fn, args) => {
    if (fn === 'media_purge_take') {
      if (args.p_secret !== SECRET) return { data: null, error: { message: 'Unauthorized' } };
      if (takeError) return { data: null, error: { message: takeError } };
      taken.push(args.p_limit);
      return { data: batches.shift() ?? [], error: null };
    }
    if (fn === 'media_purge_done') { done.push(args); return { data: null, error: null }; }
    return { data: null, error: { message: 'unknown rpc ' + fn } };
  },
  remove: async (bucket, keys) => { removed.push({ bucket, keys }); return { data: null, error: removeError ? { message: removeError } : null }; }
};
const send = async (body, headers = {}) => {
  const res = await handler(new Request('http://fn.local/', { method: 'POST', headers: new Headers({ 'content-type': 'application/json', ...headers }), body: JSON.stringify(body) }));
  return { status: res.status, json: await res.json().catch(() => null) };
};
const ask = (headers = { 'x-noob-push': SECRET }) => send({ action: 'purge_media' }, headers);
const reset = () => { batches = []; taken = []; done = []; removed = []; removeError = null; takeError = null; };
const keys = (n, p = 'a') => Array.from({ length: n }, (_, i) => `avatars/${p}${i}.jpg`);

section('1. Only the database may ask');
reset();
let r = await send({ action: 'purge_media' }, {});
check(r.status === 400 && removed.length === 0, 'no password: refused');
r = await ask({ 'x-noob-push': 'wrong' });
check(r.status === 401 && removed.length === 0, 'a wrong password is refused and nothing is removed');

section('2. It removes what the database hands out, and tells the database');
reset();
batches = [keys(3)];
r = await ask();
check(r.status === 200 && r.json.success === true && r.json.removed === 3, 'three files removed', JSON.stringify(r.json));
check(removed.length === 1 && removed[0].bucket === 'media' && removed[0].keys.join() === keys(3).join(), 'through the storage API, in the media bucket');
check(done.length === 1 && done[0].p_secret === SECRET && done[0].p_error === null && done[0].p_keys.join() === keys(3).join(), 'and the database is told they are gone');
check(taken.length === 1 && taken[0] === 100, 'asking for 100 at a time');

section('3. Several rounds, but never an endless loop');
reset();
batches = [keys(100, 'a'), keys(100, 'b'), keys(40, 'c')];
r = await ask();
check(r.json.removed === 240 && removed.length === 3 && taken.length === 3, 'a full batch is followed by another until one comes back short', JSON.stringify(r.json));
reset();
batches = Array.from({ length: 20 }, (_, i) => keys(100, 'r' + i));
r = await ask();
check(removed.length === 5 && r.json.removed === 500, 'at most 5 rounds per call (the next call, or the next ten minutes, carries on)');
reset();
r = await ask();
check(r.json.success === true && r.json.removed === 0 && removed.length === 0 && done.length === 0, 'nothing due: nothing removed, nothing reported');

section('4. Failures');
reset();
batches = [keys(2)];
removeError = 'storage is down';
r = await ask();
check(r.json.success === false && done.length === 1 && /storage is down/.test(done[0].p_error), 'a failed removal is reported to the database (it stays queued and is tried again)');
check(removed.length === 1, '... and the function stops instead of hammering storage');
reset();
takeError = 'database is busy';
r = await ask();
check(r.status === 500 && removed.length === 0, 'if the database cannot answer, nothing is removed');
reset();
batches = [['avatars/ok.jpg', '', null, 42, 'posts/p.jpg']];
r = await ask();
check(removed[0].keys.join() === 'avatars/ok.jpg,posts/p.jpg', 'anything that is not a file name is ignored');

section('5. It is wired in');
const code = fs.readFileSync(path.join('supabase', 'functions', 'dynamic-handler', 'index.ts'), 'utf8');
check(/if \(body\?\.action === 'purge_media'\) return await handlePurgeMedia\(req, admin\);/.test(code), 'the action is routed before any login check (like push and event_email)');
check(code.indexOf("body?.action === 'purge_media'") < code.indexOf("const token =(req.headers.get('authorization')"), 'and before the person is looked up');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
