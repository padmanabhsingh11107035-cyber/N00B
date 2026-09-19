// Tests push notifications from end to end:
//   * the database side (push_claim / push_forget) on a REAL Postgres (PGlite) holding the real backup: who gets a push,
//     who does not (the person who caused it, suspended accounts, muted chats), and that nothing is ever pushed twice
//   * the Edge Function's "push" action, run for real against that database, delivering to a stand-in push service.
//     What it delivers is DECRYPTED with an independent implementation (http_ece, the library the old server used)
//     and the VAPID signature is verified with Node's own crypto — so a mistake in the encryption would be caught here.
//
// Usage: node scripts/supabase/test-push.mjs [backup-folder]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { loadBackup, buildImportPlan } from './transform.mjs';
import { runImport } from './run-import.mjs';
import { createTestDb, makePgAdapter, asUser, asAnon } from './pg-test-env.mjs';

const require = createRequire(import.meta.url);
const ece = require('http_ece');

const backupsRoot = 'backups';
const backupDirs = fs.readdirSync(backupsRoot).filter((d) => fs.existsSync(path.join(backupsRoot, d, 'users.json'))).sort();
const dir = process.argv.slice(2).find((x) => !x.startsWith('--')) || path.join(backupsRoot, backupDirs[backupDirs.length - 1]);
const raw = loadBackup(dir);

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const expectFail = async (fn, pattern, label) => {
  try { await fn(); check(false, label, '(expected an error, but it succeeded)'); }
  catch (e) { check(pattern.test(e.message), label, `(got: ${e.message})`); }
};
const section = (t) => console.log(`\n${t}`);
const b64u = (buf) => Buffer.from(buf).toString('base64url');

// ------------------------------------------------------------------ database
const db = await createTestDb();
await runImport(buildImportPlan(raw, {}), makePgAdapter(db), { log: () => {} });
const profByLegacy = Object.fromEntries((await db.query('select * from profiles')).rows.map((p) => [p.legacy_id, p]));
const idOf = (u) => profByLegacy[u.id].id;
const adminRaw = raw.users.find((u) => u.isAdmin);
const pool = raw.users.filter((u) => !u.isAdmin && (u.password || '').length > 0).slice(0, 14).map(idOf);
const admin = idOf(adminRaw);
const LOUNGE = (await db.query('select id from chats where is_global_default')).rows[0].id;
const SECRET = (await db.query(`select value from internal_config where key = 'push_secret'`)).rows[0].value;
const REAL_PUBLIC = (await db.query(`select value from internal_config where key = 'vapid_public_key'`)).rows[0].value;

const asService = async (fn) => { await db.exec('set role service_role'); try { return await fn(); } finally { await db.exec('reset role'); } };
const claim = (secret, id) => asService(async () => (await db.query('select public.push_claim($1, $2) as r', [secret, id])).rows[0].r);
const forget = (secret, dead) => asService(async () => (await db.query('select public.push_forget($1, $2) as r', [secret, JSON.stringify(dead)])).rows[0].r);
const n = async (sql, params = []) => (await db.query(sql, params)).rows[0].n;
const newNotif = async ({ target = null, actor = null, type = 'test', title = null, message = 'hello', chat = null } = {}) =>
  (await db.query('insert into notifications (target_user_id, actor_id, type, title, message, chat_id) values ($1, $2, $3, $4, $5, $6) returning id', [target, actor, type, title, message, chat])).rows[0].id;
const mkSub = (host = 'fcm.googleapis.com') => {
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return { ecdh, auth, sub: { endpoint: `https://${host}/fcm/send/${crypto.randomBytes(8).toString('hex')}`, keys: { p256dh: b64u(ecdh.getPublicKey()), auth: b64u(auth) } } };
};
const subscribe = (uid, k) => db.query(`insert into push_subscriptions (user_id, subscription) values ($1, $2) on conflict (user_id) do update set subscription = excluded.subscription`, [uid, JSON.stringify(k.sub)]);
await db.query('delete from push_subscriptions');   // the import carries over people who turned notifications on in the old app; these tests use their own
const subs = new Map();
for (const uid of [...pool, admin]) { const k = mkSub(); subs.set(uid, k); await subscribe(uid, k); }
const recipientIds = (r) => r.recipients.map((x) => x.userId).sort();

section('1. The push key you already have is a real, matching key pair');
const realPub = Buffer.from(REAL_PUBLIC, 'base64url');
check(realPub.length === 65 && realPub[0] === 4, 'the public key stored in the database is a valid P-256 point');
const keyFile = backupDirs.map((d) => path.join(backupsRoot, d, 'vapidKeys.json')).filter((f) => fs.existsSync(f)).pop();
if (keyFile) {
  const kp = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  const e = crypto.createECDH('prime256v1'); e.setPrivateKey(Buffer.from(kp.privateKey, 'base64url'));
  check(e.getPublicKey().equals(realPub) && kp.publicKey === REAL_PUBLIC, 'and it matches your saved private key (so notifications signed with the private key will be accepted)');
} else console.log('  (no saved vapidKeys.json found — skipped the matching-key check)');
// for the rest of the test, use a fresh key pair so no real key is involved
const vk = crypto.createECDH('prime256v1'); vk.generateKeys();
const VAPID_PUB = b64u(vk.getPublicKey()), VAPID_PRIV = b64u(vk.getPrivateKey());
await db.query(`update internal_config set value = $1 where key = 'vapid_public_key'`, [VAPID_PUB]);

section('2. Only the function can use it');
const probe = await newNotif({ target: pool[0], actor: admin });
await expectFail(() => claim('wrong-password', probe), /Unauthorized/, 'a wrong private password is refused');
await expectFail(() => claim(null, probe), /Unauthorized/, 'no password is refused');
check((await n('select count(*)::int n from notifications where id = $1 and push_sent_at is null', [probe])) === 1, 'and a refused attempt does not mark the notification as pushed');
await expectFail(() => asAnon(db, () => db.query('select public.push_claim($1, $2)', [SECRET, probe])), /permission denied/, 'a logged-out visitor can not call it, even knowing the password');
await expectFail(() => asUser(db, pool[1], () => db.query('select public.push_claim($1, $2)', [SECRET, probe])), /permission denied/, 'a signed-in member can not call it');
await expectFail(() => asUser(db, pool[1], () => db.query('select public.push_forget($1, $2)', [SECRET, '[]'])), /permission denied/, '...nor push_forget');
await expectFail(() => forget('wrong-password', []), /Unauthorized/, 'push_forget also needs the password');
await expectFail(() => asUser(db, pool[1], () => db.query(`select * from internal_config`)), /permission denied/, 'the private password itself is unreadable to members');

section('3. Who gets a push');
let r = await claim(SECRET, probe);
check(r.claimed === true && recipientIds(r).join() === [pool[0]].join(), 'a personal notification goes to that person only');
check(r.publicKey === VAPID_PUB, 'the public key is handed over with it');
check(r.title === '@' + (await db.query('select username from profiles where id = $1', [admin])).rows[0].username && r.body === 'hello', 'the title is the name of who caused it; the body is the notification text');
r = await claim(SECRET, probe);
check(r.claimed === false && !r.recipients, 'the same notification is never pushed twice');
check((await n('select count(*)::int n from notifications where id = $1 and push_sent_at is not null', [probe])) === 1, '(it is marked as pushed)');
r = await claim(SECRET, '00000000-0000-0000-0000-00000000dead');
check(r.claimed === false, 'an unknown notification id is ignored');
r = await claim(SECRET, await newNotif({ target: pool[2], actor: admin, title: 'Big news', message: '   ' }));
check(r.title === 'Big news' && r.body === 'You have a new notification.', 'a notification with its own title uses it; an empty text gets a friendly default');
r = await claim(SECRET, await newNotif({ target: pool[2], actor: null, message: 'x'.repeat(500), title: 'T'.repeat(300) }));
check(r.title.length === 100 && r.body.length === 160, 'a very long title/text is shortened (100 / 160 characters)');
r = await claim(SECRET, await newNotif({ target: pool[2], actor: null, message: 'no actor' }));
check(r.title === 'NOOB', 'a notification from the system is titled NOOB');
r = await claim(SECRET, await newNotif({ target: pool[3], actor: pool[3] }));
check(r.claimed === true && r.recipients.length === 0, 'you are never pushed about your own action');
await db.query('delete from push_subscriptions where user_id = $1', [pool[4]]);
r = await claim(SECRET, await newNotif({ target: pool[4], actor: admin }));
check(r.claimed === true && r.recipients.length === 0, 'someone who never turned notifications on gets nothing (the in-app notification still exists)');
await subscribe(pool[4], subs.get(pool[4]));
await db.query('update profiles set is_suspended = true where id = $1', [pool[5]]);
r = await claim(SECRET, await newNotif({ target: pool[5], actor: admin }));
check(r.recipients.length === 0, 'a suspended account gets nothing');
await db.query(`insert into chat_members (chat_id, user_id, is_muted) values ($1, $2, true) on conflict (chat_id, user_id) do update set is_muted = true`, [LOUNGE, pool[6]]);
r = await claim(SECRET, await newNotif({ target: pool[6], actor: admin, chat: LOUNGE, type: 'new_message' }));
check(r.recipients.length === 0, 'a message in a chat the person muted gets nothing');
await db.query(`insert into chat_members (chat_id, user_id, is_muted) values ($1, $2, false) on conflict (chat_id, user_id) do update set is_muted = false`, [LOUNGE, pool[7]]);
r = await claim(SECRET, await newNotif({ target: pool[7], actor: admin, chat: LOUNGE, type: 'new_message' }));
check(r.recipients.length === 1, 'the same chat, not muted, is delivered');
r = await claim(SECRET, await newNotif({ target: pool[6], actor: admin }));
check(r.recipients.length === 1, 'muting a chat does not stop other kinds of notifications');
await db.query('update profiles set is_suspended = true where id = $1', [pool[8]]);
r = await claim(SECRET, await newNotif({ target: null, actor: admin, type: 'admin_broadcast', title: 'Hello everyone', message: 'Server update' }));
const expectBroadcast = [...pool.filter((u) => u !== pool[5] && u !== pool[8])].sort();
check(recipientIds(r).join() === expectBroadcast.join(), `a broadcast goes to every subscribed person except the sender and suspended accounts (${r.recipients.length})`);

section('4. Cleaning up dead push addresses');
const k9 = mkSub(); await subscribe(pool[9], k9);
const fresh = mkSub();
check((await forget(SECRET, [{ userId: pool[9], endpoint: 'https://fcm.googleapis.com/some/other' }])) === 0, 'an address that does not match is left alone');
await subscribe(pool[9], fresh);   // the person re-subscribed a moment ago
check((await forget(SECRET, [{ userId: pool[9], endpoint: k9.sub.endpoint }])) === 0 && (await n('select count(*)::int n from push_subscriptions where user_id = $1', [pool[9]])) === 1, 'the OLD address being reported dead does not remove the NEW subscription');
check((await forget(SECRET, [{ userId: pool[9], endpoint: fresh.sub.endpoint }])) === 1 && (await n('select count(*)::int n from push_subscriptions where user_id = $1', [pool[9]])) === 0, 'the exact dead address is removed');
check((await forget(SECRET, null)) === 0 && (await forget(SECRET, [])) === 0 && (await forget(SECRET, {})) === 0, 'garbage input removes nothing and does not fail');
await subscribe(pool[9], fresh); subs.set(pool[9], fresh);

section('5. The function: setup');
const tmp = path.join('scripts', 'supabase', '_push-fn-test');
fs.mkdirSync(tmp, { recursive: true });
fs.writeFileSync(path.join(tmp, 'stub-supabase.mjs'), `
export function createClient(url, key, opts) {
  return { auth: { getUser: async () => ({ data: { user: null }, error: { message: 'no' } }) }, rpc: async (fn, args) => globalThis.__rpc(fn, args), from: () => { throw new Error('unexpected table access'); } };
}
`);
fs.writeFileSync(path.join(tmp, 'ai.ts'), fs.readFileSync(path.join('supabase', 'functions', 'ai', 'index.ts'), 'utf8').replace("'npm:@supabase/supabase-js@2'", "'./stub-supabase.mjs'"));
let handler = null;
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc', SUPABASE_ANON_KEY: 'anon', VAPID_PRIVATE_KEY: VAPID_PRIV, GROQ_API_KEY: 'gk' };
globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { handler = h; } };
await import(new URL(`file:///${path.resolve(tmp, 'ai.ts').replace(/\\/g, '/')}`).href);

// the function talks to the real database above (as the service role)
globalThis.__rpcOverride = null;
globalThis.__rpc = async (fn, args) => {
  if (globalThis.__rpcOverride) return globalThis.__rpcOverride(fn, args);
  try {
    return await asService(async () => {
      const vals = Object.values(args).map((v) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v));
      const res = await db.query(`select public.${fn}(${vals.map((_, i) => `$${i + 1}`).join(', ')}) as r`, vals);
      return { data: res.rows[0].r, error: null };
    });
  } catch (e) { return { data: null, error: { message: e.message } }; }
};
// the browsers' push services (stand-in)
const pushCalls = []; let inflight = 0, maxInflight = 0;
globalThis.__pushStatus = () => 201;
globalThis.fetch = async (url, init = {}) => {
  const hdr = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  pushCalls.push({ url: String(url), headers: hdr, body: Buffer.from(init.body || []) });
  inflight++; maxInflight = Math.max(maxInflight, inflight);
  await new Promise((res) => setTimeout(res, 8));
  inflight--;
  const st = globalThis.__pushStatus(String(url));
  if (st === 'throw') throw new Error('network down');
  return { status: st, ok: st < 300, text: async () => 'push service said no' };
};
const call = async (body, headers = {}) => {
  const h = new Headers({ 'content-type': 'application/json', 'x-forwarded-for': '9.9.9.9', ...headers });
  const res = await handler(new Request('http://fn.local/', { method: 'POST', headers: h, body: JSON.stringify(body) }));
  return { status: res.status, json: await res.json().catch(() => null) };
};
const push = (id, secret = SECRET) => call({ action: 'push', notificationId: id }, secret === null ? {} : { 'x-noob-push': secret });
const open = (body, k) => JSON.parse(ece.decrypt(body, { version: 'aes128gcm', privateKey: k.ecdh, authSecret: b64u(k.auth) }).toString('utf8'));
const vapidInfo = (authz) => {
  const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(authz || '');
  if (!m) return null;
  const [, h, c, s, k] = m;
  const pub = Buffer.from(VAPID_PUB, 'base64url');
  const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: 'jwk' });
  const now = Date.now() / 1000, hd = JSON.parse(Buffer.from(h, 'base64url')), cl = JSON.parse(Buffer.from(c, 'base64url'));
  return { valid: crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')), alg: hd.alg, typ: hd.typ, aud: cl.aud, sub: cl.sub, expOk: cl.exp > now + 3600 && cl.exp < now + 86400, k };
};
const reset = () => { pushCalls.length = 0; maxInflight = 0; globalThis.__pushStatus = () => 201; globalThis.__rpcOverride = null; env.VAPID_PRIVATE_KEY = VAPID_PRIV; };

section('6. The function: delivering and decrypting');
reset();
await db.query('delete from push_subscriptions');
for (const uid of [...pool, admin]) await subscribe(uid, subs.get(uid));
await db.query('update profiles set is_suspended = false');
const adminName = (await db.query('select username from profiles where id = $1', [admin])).rows[0].username;
const id1 = await newNotif({ target: pool[0], actor: admin, message: '🎉 नमस्ते, this is a test — with emoji & Hindi' });
const r1 = await push(id1);
check(r1.status === 200 && r1.json.success && r1.json.sent === 1 && r1.json.failed === 0 && r1.json.gone === 0, 'a personal notification is delivered to one browser', JSON.stringify(r1));
const c1 = pushCalls[0];
check(c1.url === subs.get(pool[0]).sub.endpoint, 'it was sent to that person\'s own push address');
check(c1.headers['content-encoding'] === 'aes128gcm' && c1.headers.ttl === '86400' && c1.headers['content-type'] === 'application/octet-stream', 'with the standard push headers');
let msg = null; try { msg = open(c1.body, subs.get(pool[0])); } catch (e) { msg = { error: e.message }; }
check(msg && msg.title === '@' + adminName && msg.body === '🎉 नमस्ते, this is a test — with emoji & Hindi' && msg.url === '/', 'the browser can decrypt it (checked with an independent implementation) and reads the right message', JSON.stringify(msg));
let wrong = null; try { wrong = open(c1.body, subs.get(pool[1])); } catch { wrong = 'cannot read'; }
check(wrong === 'cannot read', 'and nobody else can decrypt it');
const v = vapidInfo(c1.headers.authorization);
check(v && v.valid && v.alg === 'ES256' && v.typ === 'JWT' && v.aud === 'https://fcm.googleapis.com' && /^mailto:/.test(v.sub) && v.expOk && v.k === VAPID_PUB, 'the VAPID signature verifies against the public key, names the right push service, and expires within a day', JSON.stringify(v));
check(c1.body.length === 21 + 65 + Buffer.byteLength(JSON.stringify(msg)) + 1 + 16 && c1.body.readUInt32BE(16) === 4096 && c1.body[20] === 65, 'the message body has the exact size and header the standard requires');
check((await n('select count(*)::int n from notifications where id = $1 and push_sent_at is not null', [id1])) === 1, 'the notification is marked as pushed');
pushCalls.length = 0;
const again = await push(id1);
check(again.status === 200 && again.json.sent === 0 && pushCalls.length === 0, 'asking again for the same notification sends nothing', JSON.stringify(again));

section('7. The function: broadcasts and limits');
reset();
const idB = await newNotif({ target: null, actor: admin, type: 'admin_broadcast', title: 'For everyone', message: 'Maintenance tonight' });
const rB = await push(idB);
check(rB.json.sent === pool.length && pushCalls.length === pool.length, `a broadcast reaches all ${pool.length} other subscribed people, not the sender`, JSON.stringify(rB.json));
check(!pushCalls.some((c) => c.url === subs.get(admin).sub.endpoint), '(the sender did not get their own broadcast)');
check(new Set(pushCalls.map((c) => c.body.subarray(0, 16).toString('hex'))).size === pool.length && new Set(pushCalls.map((c) => c.body.subarray(21, 86).toString('hex'))).size === pool.length, 'every copy is encrypted with its own random salt and fresh key');
check(pool.every((uid) => { const c = pushCalls.find((x) => x.url === subs.get(uid).sub.endpoint); try { return open(c.body, subs.get(uid)).title === 'For everyone'; } catch { return false; } }), 'and every person can read their own copy');
check(maxInflight >= 2 && maxInflight <= 10, `they are sent a few at a time, never more than 10 at once (max ${maxInflight})`);
let ok = true; for (let i = 0; i < 40; i++) { const x = await push(id1); if (x.status !== 200) ok = false; }
check(ok, 'the per-person request limit does not get in the way of pushes (40 in a row)');
let allDenied = true; for (let i = 0; i < 40; i++) { const x = await push(id1, 'guess-' + i); if (x.status !== 401) allDenied = false; }
check(allDenied, 'wrong passwords are always refused (401)');

section('8. The function: bad requests and set-up problems');
reset();
const idC = await newNotif({ target: pool[0], actor: admin });
check((await push(idC, null)).status === 400, 'a request without the password header is rejected');
check((await push('not-a-uuid')).status === 400 && (await call({ action: 'push' }, { 'x-noob-push': SECRET })).status === 400, 'a bad or missing notification id is rejected');
const denied = await push(idC, 'wrong');
check(denied.status === 401 && pushCalls.length === 0 && (await n('select count(*)::int n from notifications where id = $1 and push_sent_at is null', [idC])) === 1, 'a wrong password is refused and nothing is sent or marked');
env.VAPID_PRIVATE_KEY = '';
const noKey = await push(idC);
check(noKey.status === 503 && pushCalls.length === 0 && (await n('select count(*)::int n from notifications where id = $1 and push_sent_at is null', [idC])) === 1, 'without the private key secret, it says so and does NOT mark the notification as pushed (so nothing is lost)');
env.VAPID_PRIVATE_KEY = 'this-is-not-a-key';
const badKey = await push(idC);
check(badKey.status === 500 && pushCalls.length === 0 && (await n('select count(*)::int n from push_subscriptions')) === pool.length + 1, 'a malformed private key gives a clear error and removes no one\'s subscription');
reset();
globalThis.__rpcOverride = async () => ({ data: null, error: { message: 'connection lost' } });
check((await push(idC)).status === 500, 'a database problem is reported as a failure');
reset();
globalThis.__rpcOverride = async (fn) => (fn === 'push_claim' ? { data: { claimed: true, title: 'x', body: 'y', publicKey: VAPID_PUB, recipients: null }, error: null } : { data: 0, error: null });
check((await push(idC)).json.sent === 0, 'an answer with no recipients list is handled');
reset();

section('9. The function: what the push services answer');
const one = async (status, uid = pool[0]) => { reset(); globalThis.__pushStatus = () => status; return push(await newNotif({ target: uid, actor: admin })); };
let x = await one(201);  check(x.json.sent === 1, 'a normal delivery (201)');
x = await one(200);      check(x.json.sent === 1, '...or 200/202 both count as delivered');
x = await one(410);      check(x.json.gone === 1 && (await n('select count(*)::int n from push_subscriptions where user_id = $1', [pool[0]])) === 0, '410 Gone: the dead subscription is removed');
await subscribe(pool[0], subs.get(pool[0]));
x = await one(404);      check(x.json.gone === 1 && (await n('select count(*)::int n from push_subscriptions where user_id = $1', [pool[0]])) === 0, '404: removed too');
await subscribe(pool[0], subs.get(pool[0]));
for (const st of [500, 503, 429, 401, 403]) {
  x = await one(st);
  check(x.json.failed === 1 && x.json.gone === 0 && (await n('select count(*)::int n from push_subscriptions where user_id = $1', [pool[0]])) === 1, `${st}: not delivered, but the subscription is kept for next time`);
}
x = await one('throw'); check(x.status === 200 && x.json.failed === 1 && (await n('select count(*)::int n from push_subscriptions where user_id = $1', [pool[0]])) === 1, 'a push service that can not be reached is a soft failure (kept)');
reset();
globalThis.__pushStatus = (u) => (u === subs.get(pool[1]).sub.endpoint ? 410 : u === subs.get(pool[2]).sub.endpoint ? 500 : 201);
x = await push(await newNotif({ target: null, actor: admin }));
check(x.json.sent === pool.length - 2 && x.json.gone === 1 && x.json.failed === 1, 'in a broadcast each person is judged on their own delivery', JSON.stringify(x.json));
check((await n('select count(*)::int n from push_subscriptions where user_id = $1', [pool[1]])) === 0 && (await n('select count(*)::int n from push_subscriptions where user_id = $1', [pool[2]])) === 1, '...only the dead one is removed');
await subscribe(pool[1], subs.get(pool[1]));

section('10. The function: it only ever contacts real push services');
const tryAddress = async (endpoint, label, shouldSend, deleted = false) => {
  reset();
  const k = mkSub(); k.sub.endpoint = endpoint;
  await subscribe(pool[10], k);
  const res = await push(await newNotif({ target: pool[10], actor: admin }));
  const kept = (await n('select count(*)::int n from push_subscriptions where user_id = $1', [pool[10]])) === 1;
  check(res.status === 200 && (shouldSend ? pushCalls.length === 1 && res.json.sent === 1 : pushCalls.length === 0 && res.json.sent === 0) && (deleted ? !kept : kept), label, JSON.stringify(res.json));
};
await tryAddress('https://fcm.googleapis.com/fcm/send/abc', 'Chrome / Edge / Android (fcm.googleapis.com) is used', true);
await tryAddress('https://updates.push.services.mozilla.com/wpush/v2/abc', 'Firefox is used', true);
await tryAddress('https://web.push.apple.com/abc', 'Safari / iPhone is used', true);
await tryAddress('https://wns2-par02p.notify.windows.com/w/?token=abc', 'Windows push is used', true);
await tryAddress('http://fcm.googleapis.com/fcm/send/abc', 'a plain http address is never used', false);
await tryAddress('https://169.254.169.254/latest/meta-data', 'an internal address is never called', false);
await tryAddress('https://127.0.0.1/', 'localhost is never called', false);
await tryAddress('https://evil.example.com/fcm.googleapis.com', 'a look-alike path on another site is never called', false);
await tryAddress('https://fcm.googleapis.com.evil.example.com/x', 'a look-alike host name is never called', false);
await tryAddress('https://user:pw@fcm.googleapis.com/x', 'an address with a login inside it is never called', false);
await tryAddress('https://fcm.googleapis.com:8443/x', 'an unusual port is never called', false);
await tryAddress('not a web address', 'nonsense is never called', false);
{ // broken keys are unusable -> removed
  reset();
  const k = mkSub(); k.sub.keys.p256dh = 'AAAA';
  await subscribe(pool[10], k);
  const res = await push(await newNotif({ target: pool[10], actor: admin }));
  check(pushCalls.length === 0 && res.json.gone === 1 && (await n('select count(*)::int n from push_subscriptions where user_id = $1', [pool[10]])) === 0, 'a subscription with broken keys is unusable and is cleaned up');
  const k2 = mkSub(); k2.sub.keys.p256dh = '***not base64***';
  await subscribe(pool[10], k2);
  const res2 = await push(await newNotif({ target: pool[10], actor: admin }));
  check(res2.json.gone === 1, '...including keys that are not even encoded text');
}

section('11. The other jobs of the function still work');
reset();
const support = await call({ action: 'translate', chatId: 'x', messageId: 'y' });
check(support.status === 401, 'translation still asks for a login (the push door did not open anything else)');
const noPush = await call({ action: 'push', notificationId: id1 }, { 'x-noob-push': SECRET });
check(noPush.status === 200, 'and a valid push request is answered normally');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
