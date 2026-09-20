// Tests the "random logout + wrong 'account suspended' message" fix:
//   1. the decision logic (only the database can say "suspended"; hiccups never end a session; two bad answers in a row)
//   2. the token-renewal wrapper (a rate-limited renewal is temporary; a truly invalid login still is not)
//   3. the REAL auth library against a fake server: shows what a failed renewal does to the saved login, with and
//      without the wrapper.
// No database or browser needed.
//
// Usage: node scripts/supabase/test-session.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const load = (p) => import(pathToFileURL(path.resolve(p)).href);

const W = await load('src/utils/sessionWatch.ts');
const { classifySession, stepWatch, initialWatch, SESSION_ENDED_MESSAGE, SESSION_CONFIRMATIONS } = W;
const { makePatientFetch, reasonCode } = await load('src/services/authFetch.ts');
const D = await load('src/services/authDiag.ts');
const { readDiag, recordDiag, explainSessionEnd, REASON } = D;

// ============================================================================================
section('1. What counts as "suspended", "signed out" or "can not tell"');
const facts = (o) => ({ sessionCheckFailed: false, hasSession: true, profileCheckFailed: false, profileFound: true, isSuspended: false, ...o });
check(classifySession(facts({})) === 'valid', 'a saved login and a normal account: valid');
check(classifySession(facts({ isSuspended: true })) === 'suspended', 'the database says suspended: suspended');
check(classifySession(facts({ hasSession: false })) === 'signed-out', 'no saved login in this browser: signed out (NOT suspended)');
check(classifySession(facts({ hasSession: false, isSuspended: true })) === 'signed-out', '...whatever the account row says');
check(classifySession(facts({ sessionCheckFailed: true, hasSession: false })) === 'unknown', 'asking for the login failed (connection, renewal in progress): can not tell');
check(classifySession(facts({ profileCheckFailed: true, profileFound: false })) === 'unknown', 'the account lookup failed: can not tell');
check(classifySession(facts({ profileFound: false })) === 'unknown', 'the account row did not come back (no error): can not tell, never "suspended"');
check(classifySession(facts({ profileFound: false, isSuspended: true })) === 'unknown', '...even if a stale flag says so');
check(!['suspended'].includes(classifySession(facts({ hasSession: false, profileFound: false }))), 'a missing login can never produce a suspension');

section('2. Two bad answers in a row before anything happens');
check(SESSION_CONFIRMATIONS === 2, 'the same bad answer must come back twice');
let w = initialWatch;
let r = stepWatch(w, 'signed-out'); w = r.state;
check(r.end === null, 'first "signed out": nothing happens yet');
r = stepWatch(w, 'signed-out'); w = r.state;
check(r.end === 'signed-out', 'second one in a row: the session ends as "signed out"');
w = initialWatch;
r = stepWatch(w, 'suspended'); w = r.state;
check(r.end === null, 'first "suspended": nothing yet');
r = stepWatch(w, 'suspended');
check(r.end === 'suspended', 'second one in a row: ends as "suspended"');
w = initialWatch;
w = stepWatch(w, 'signed-out').state;
w = stepWatch(w, 'unknown').state;
r = stepWatch(w, 'signed-out');
check(r.end === 'signed-out', 'a check that could not be completed in between changes nothing (the count carries on)');
w = initialWatch;
w = stepWatch(w, 'signed-out').state;
w = stepWatch(w, 'valid').state;
r = stepWatch(w, 'signed-out');
check(r.end === null, 'a good answer in between starts the count again');
w = initialWatch;
w = stepWatch(w, 'signed-out').state;
r = stepWatch(w, 'suspended');
check(r.end === null && r.state.status === 'suspended' && r.state.count === 1, 'a DIFFERENT bad answer starts the count again (one of each is not enough)');
w = initialWatch;
for (let i = 0; i < 20; i++) { r = stepWatch(w, 'unknown'); w = r.state; if (r.end) break; }
check(r.end === null && w === initialWatch, 'no matter how many times the check can not be completed, nobody is logged out');
check(SESSION_ENDED_MESSAGE.suspended.includes('suspended') && !SESSION_ENDED_MESSAGE['signed-out'].toLowerCase().includes('suspended'), 'the "signed out" message does not say the account is suspended');
check(SESSION_ENDED_MESSAGE['signed-out'].includes('Your account is fine') && SESSION_ENDED_MESSAGE['signed-out'].includes('log in again'), '...it says the account is fine and to log in again');

// ============================================================================================
section('3. The renewal wrapper');
const calls = [];
const fake = (status, body = { message: 'x' }) => async (input, init) => { calls.push({ url: String(input), init }); return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'x-test': '1' } }); };
const RENEW = 'https://x.supabase.co/auth/v1/token?grant_type=refresh_token';
const SIGNIN = 'https://x.supabase.co/auth/v1/token?grant_type=password';
let res = await makePatientFetch(fake(429, { code: 'over_request_rate_limit', message: 'slow down' }))(RENEW, { method: 'POST' });
check(res.status === 503 && (await res.json()).code === 'over_request_rate_limit' && res.headers.get('x-test') === '1', 'a rate-limited renewal (429) is relabelled as temporary (503); its message and headers are kept');
res = await makePatientFetch(fake(429))(SIGNIN, { method: 'POST' });
check(res.status === 429, 'a 429 on SIGN-IN is untouched (still "too many attempts")');
for (const status of [200, 400, 401, 403, 404, 422, 500, 503]) {
  res = await makePatientFetch(fake(status))(RENEW, { method: 'POST' });
  check(res.status === status, `a ${status} on renewal is passed through unchanged`);
}
res = await makePatientFetch(fake(429))('https://x.supabase.co/rest/v1/profiles?select=id', {});
check(res.status === 429, 'a 429 from any other request is untouched');
res = await makePatientFetch(fake(429))(new URL(RENEW), { method: 'POST' });
check(res.status === 503, 'works when the address is given as a URL object');
res = await makePatientFetch(fake(429))({ url: RENEW }, { method: 'POST' });
check(res.status === 503, '...or as a Request-like object');
calls.length = 0;
await makePatientFetch(fake(200))(RENEW, { method: 'POST', headers: { a: 'b' }, body: 'grant' });
check(calls.length === 1 && calls[0].init.body === 'grant' && calls[0].init.headers.a === 'b', 'the request itself is passed on exactly as it was');

// ============================================================================================
section('4. The real login library against a fake server');
const KEY = 'test-auth';
const now = () => Math.floor(Date.now() / 1000);
const stored = (expiresAt) => JSON.stringify({ access_token: 'old.access.token', refresh_token: 'old-refresh', token_type: 'bearer', expires_in: 3600, expires_at: expiresAt, user: { id: 'u1', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } });
const newSession = { access_token: 'new.access.token', refresh_token: 'new-refresh', token_type: 'bearer', expires_in: 3600, expires_at: now() + 3600, user: { id: 'u1', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };

// A tiny stand-in for the server: `plan` is the list of answers to give to successive renewal requests (the last one repeats).
async function scenario({ plan, wrapped, expiredSession = true }) {
  const memory = new Map([[KEY, stored(expiredSession ? now() - 30 : now() + 3600)]]);
  let renewals = 0;
  const server = async (input) => {
    const url = String(input);
    if (!url.includes('grant_type=refresh_token')) return new Response('{}', { status: 404 });
    const answer = plan[Math.min(renewals++, plan.length - 1)];
    if (answer.html) return new Response('<html><body>Access denied</body></html>', { status: answer.status, headers: { 'content-type': 'text/html' } });
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { 'content-type': 'application/json' } });
  };
  const client = createClient('https://x.supabase.co', 'anon', {
    global: { fetch: wrapped ? makePatientFetch(server) : server },
    auth: { storageKey: KEY, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, storage: { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v), removeItem: (k) => memory.delete(k) } }
  });
  const t0 = Date.now();
  const quiet = console.error;
  console.error = () => {};   // the library logs the (expected) failures; keep the test output readable
  const { data, error } = await client.auth.getSession();
  const out = { session: data.session, error, kept: memory.has(KEY), renewals, ms: Date.now() - t0, memory };
  await client.auth.stopAutoRefresh();
  await new Promise((r) => setTimeout(r, 100));   // let the library finish logging
  console.error = quiet;
  return out;
}
const TOO_MANY = { status: 429, body: { code: 'over_request_rate_limit', message: 'Request rate limit reached' } };
const ALREADY_USED = { status: 400, body: { code: 'refresh_token_already_used', error_code: 'refresh_token_already_used', message: 'Invalid Refresh Token: Already Used' } };
const OK = { status: 200, body: newSession };
const SERVER_ERROR = { status: 500, body: { message: 'boom' } };

let s = await scenario({ plan: [OK], wrapped: true });
check(s.session?.access_token === 'new.access.token' && s.kept && s.renewals === 1, 'normal case: an expired access token is renewed and the new login is saved');
s = await scenario({ plan: [OK], wrapped: true, expiredSession: false });
check(s.session?.access_token === 'old.access.token' && s.renewals === 0, 'a still-valid login is not even renewed');

s = await scenario({ plan: [TOO_MANY], wrapped: false });
check(s.session === null && s.kept === false, 'WITHOUT the wrapper: one rate-limited renewal deletes the saved login (this is what signed people out)');
s = await scenario({ plan: [TOO_MANY, TOO_MANY, OK], wrapped: true });
check(s.session?.access_token === 'new.access.token' && s.kept && s.renewals === 3, 'WITH the wrapper: the rate limit is waited out, the renewal succeeds and the person stays logged in');
check(s.ms < 5000, `...and it took only ${s.ms} ms`);
s = await scenario({ plan: [SERVER_ERROR, OK], wrapped: false });
check(s.session?.access_token === 'new.access.token' && s.kept, 'a server error (500) never signed anyone out (the library already retries it)');
s = await scenario({ plan: [ALREADY_USED], wrapped: true });
check(s.session === null && s.kept === false, 'a genuinely invalid login (refresh token already used) is still removed: the wrapper does not hide real sign-outs');
s = await scenario({ plan: [{ status: 400, body: { code: 'refresh_token_not_found', message: 'Invalid Refresh Token: Refresh Token Not Found' } }], wrapped: true });
check(s.session === null && s.kept === false, '...and so is a refresh token that was not found');

console.log('  (waiting out a rate limit that does not clear — about 25 seconds, the library keeps trying)');
s = await scenario({ plan: [TOO_MANY], wrapped: true });
check(s.kept === true, 'a rate limit that never clears does NOT delete the saved login');
check(s.session === null && !!s.error, '...the check reports an error (so the app says "can not tell", and does not log anyone out)');
check(classifySession({ sessionCheckFailed: !!s.error, hasSession: false, profileCheckFailed: false, profileFound: false, isSuspended: false }) === 'unknown', '...which the app classifies as "can not tell"');
check(s.renewals > 1, `...after ${s.renewals} attempts`);

// ============================================================================================
section('5. "Switched": another tab signed in as a different account');
check(classifySession(facts({ sessionUserId: 'a', expectedUserId: 'b' })) === 'switched', "the browser's saved login belongs to someone else: switched");
check(classifySession(facts({ sessionUserId: 'a', expectedUserId: 'a' })) === 'valid', 'the same account: fine');
check(classifySession(facts({ sessionUserId: 'a' })) === 'valid' && classifySession(facts({ expectedUserId: 'a' })) === 'valid', 'when either side is not known, nothing is assumed');
check(classifySession(facts({ sessionUserId: 'a', expectedUserId: 'b', profileCheckFailed: true, profileFound: false })) === 'switched', 'switched is decided before any account lookup (a hiccup can not hide it)');
check(classifySession(facts({ hasSession: false, sessionUserId: 'a', expectedUserId: 'b' })) === 'signed-out', 'no saved login at all is still "signed out", not "switched"');
check(stepWatch(initialWatch, 'switched').end === 'switched', 'switched ends this tab on the FIRST check (every moment more is a moment acting as the wrong person)');
check(stepWatch(initialWatch, 'signed-out').end === null && stepWatch(initialWatch, 'suspended').end === null, '...while "signed out" and "suspended" still need two checks in a row');
check(SESSION_ENDED_MESSAGE.switched.includes('different account') && !SESSION_ENDED_MESSAGE.switched.toLowerCase().includes('suspended'), 'the message explains it and does not say "suspended"');

section("6. Error pages and odd answers on renewal are temporary; the login server's own \"no\" is not");
const html = (status) => async () => new Response('<html>blocked</html>', { status, headers: { 'content-type': 'text/html' } });
for (const status of [400, 401, 403, 404, 429, 502]) {
  res = await makePatientFetch(html(status))(RENEW, { method: 'POST' });
  check(res.status === 503, 'an HTML error page (' + status + ') on renewal is treated as temporary');
}
res = await makePatientFetch(fake(400, { error_code: 'refresh_token_not_found', msg: 'x' }))(RENEW, { method: 'POST' });
check(res.status === 400, "the login server's own JSON \"refresh token not found\" is passed through: a real sign-out stays a real sign-out");
res = await makePatientFetch(html(403))(SIGNIN, { method: 'POST' });
check(res.status === 403, 'an HTML page on SIGN-IN is untouched');
const seen = [];
await makePatientFetch(fake(400, { error_code: 'refresh_token_already_used' }), (x) => seen.push(x))(RENEW, { method: 'POST' });
await makePatientFetch(fake(429, { code: 'over_request_rate_limit' }), (x) => seen.push(x))(RENEW, { method: 'POST' });
await makePatientFetch(html(403), (x) => seen.push(x))(RENEW, { method: 'POST' });
await makePatientFetch(fake(200, { ok: 1 }), (x) => seen.push(x))(RENEW, { method: 'POST' });
check(seen.length === 3 && seen[0].code === 'refresh_token_already_used' && seen[0].temporary === false && seen[1].temporary === true && seen[2].temporary === true && seen[2].code === undefined, "the recorder is told what happened (status, the server's reason, temporary or not); successes are not reported");
res = await makePatientFetch(fake(429), () => { throw new Error('recorder broke'); })(RENEW, { method: 'POST' });
check(res.status === 503, 'a broken recorder can not break the login');
check(reasonCode({ error_code: 'session_not_found' }) === 'session_not_found' && reasonCode({ error: 'invalid_grant', error_description: 'Invalid Refresh Token: Already Used' }) === 'refresh_token_already_used' && reasonCode({ msg: 'Invalid Refresh Token: Refresh Token Not Found' }) === 'refresh_token_not_found' && reasonCode('x') === undefined && reasonCode(null) === undefined, "the server's reason is understood in each of the shapes it uses");

s = await scenario({ plan: [{ status: 403, html: true }, { status: 403, html: true }, OK], wrapped: false });
check(s.session === null && s.kept === false, 'WITHOUT the wrapper: one HTML error page on renewal deletes the saved login');
s = await scenario({ plan: [{ status: 403, html: true }, { status: 404, html: true }, OK], wrapped: true });
check(s.session?.access_token === 'new.access.token' && s.kept && s.renewals === 3, 'WITH the wrapper: the error pages are waited out and the person stays logged in');

section('7. Logging out on one device must not log out the others');
async function logoutRequest(options) {
  const urls = [];
  const server = async (input) => { urls.push(String(input)); return new Response('{}', { status: 204 }); };
  const memory = new Map([[KEY, stored(now() + 3600)]]);
  const client = createClient('https://x.supabase.co', 'anon', { global: { fetch: server }, auth: { storageKey: KEY, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, storage: { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v), removeItem: (k) => memory.delete(k) } } });
  await (options ? client.auth.signOut(options) : client.auth.signOut());
  await client.auth.stopAutoRefresh();
  return { url: urls.find((u) => u.includes('/logout')) || '', cleared: !memory.has(KEY) };
}
let lo = await logoutRequest();
check(lo.url.includes('scope=global') && lo.cleared, "the library's DEFAULT signOut() asks the server to end this account's login on EVERY device (this is what signed the laptop out when the phone logged out)");
lo = await logoutRequest({ scope: 'local' });
check(lo.url.includes('scope=local') && !lo.url.includes('scope=global') && lo.cleared, "signOut({ scope: 'local' }) ends only this device's login, and still clears it here");
const api = fs.readFileSync('src/services/supabaseApi.ts', 'utf8');
check(!/auth\.signOut\(\s*\)/.test(api) && (api.match(/auth\.signOut\(\{ scope: 'local' \}\)/g) || []).length >= 2, 'the app never calls the log-out-everywhere form: every signOut in the app is device-only');
const logoutFn = api.slice(api.indexOf('export async function logoutUser'), api.indexOf('export async function deleteMyAccount'));
check(logoutFn.includes("recordDiag({ kind: 'explicit-logout' })") && logoutFn.indexOf('recordDiag') < logoutFn.indexOf('signOut'), 'a deliberate logout is written down BEFORE the sign-out, so other tabs can say why they were signed out');

section('8. The black-box recorder and the reasons it gives');
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m }; };
let st = mem();
check(readDiag(st).length === 0 && readDiag(null).length === 0, 'starts empty; a browser without storage is fine');
recordDiag({ kind: 'signed-in' }, st, 1000); recordDiag({ kind: 'token-refreshed' }, st, 2000); recordDiag({ kind: 'token-refreshed' }, st, 3000);
check(readDiag(st).length === 2 && readDiag(st).filter((x) => x.kind === 'token-refreshed').length === 1 && readDiag(st).find((x) => x.kind === 'token-refreshed').t === 3000, 'the hourly "token refreshed" line keeps only its latest copy (it would push the useful lines out)');
for (let i = 0; i < 60; i++) recordDiag({ kind: 'renewal-delayed', status: 429 }, st, 5000 + i);
check(readDiag(st).length === 25, 'never more than 25 entries');
st.setItem('noob_auth_diag', 'not json{');
check(readDiag(st).length === 0, 'damaged data is ignored, not a crash');
let threw = false;
try { recordDiag({ kind: 'signed-out' }, { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } }, 1); } catch { threw = true; }
check(!threw, 'a blocked storage never throws');
const T = 1_000_000;
const ev = (kind, ago, more = {}) => ({ t: T - ago, kind, ...more });
check(explainSessionEnd([], T) === REASON.unknown, 'nothing recorded: says it could not tell (it does not invent a reason)');
check(explainSessionEnd([ev('renewal-failed', 1000, { status: 400, code: 'session_not_found' })], T) === REASON.endedOnServer, 'server says the session is gone: ended on the server (another device logged out)');
check(explainSessionEnd([ev('renewal-failed', 1000, { status: 400, code: 'refresh_token_already_used' })], T) === REASON.usedTwice, 'refresh token already used: renewed twice at once');
check(explainSessionEnd([ev('renewal-failed', 1000, { status: 400, code: 'refresh_token_not_found' })], T) === REASON.unknownToServer, 'refresh token not found: the server no longer knows it');
check(explainSessionEnd([ev('renewal-failed', 1000, { status: 403 })], T).startsWith(REASON.refused) && explainSessionEnd([ev('renewal-failed', 1000, { status: 403 })], T).includes('403'), 'any other refusal is reported with its status');
check(explainSessionEnd([ev('explicit-logout', 2000), ev('signed-out', 1900)], T) === REASON.otherTabLoggedOut, 'a deliberate logout just before the sign-out: you logged out in another tab or window');
check(explainSessionEnd([ev('signed-out', 1000)], T) === REASON.clearedOrOtherTab, 'signed out with nothing else recorded: another tab, or the browser cleared its saved data');
check(explainSessionEnd([ev('renewal-delayed', 1000, { status: 429 }), ev('signed-out', 900)], T) === REASON.clearedOrOtherTab, 'a temporary problem is never blamed (it was waited out)');
check(explainSessionEnd([ev('renewal-failed', 20 * 60 * 1000, { code: 'session_not_found' }), ev('signed-out', 1000)], T) === REASON.clearedOrOtherTab, 'old entries (over 15 minutes) are not blamed');
check(explainSessionEnd([ev('explicit-logout', 5000), ev('renewal-failed', 1000, { code: 'session_not_found' })], T) === REASON.endedOnServer, 'a server refusal is the more specific reason and wins');

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(process.exitCode), 200);
