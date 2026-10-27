// Tests what NOOB does when the host switches the database service off ("Service for this project is restricted ... exceed_cached_egress_quota", HTTP 402 on every request):
//   1. the notice is recognised (and nothing else is mistaken for it)
//   2. the wrapped fetch turns it into a temporary 503, tells the app, and tells it again when the service is back
//   3. the REAL login library, against a fake server that answers 402: WITHOUT the wrapper the saved login is deleted (the bug: everybody was signed out), WITH it the login stays
//   4. the probe that decides when the maintenance page can go away
//   5. the pieces in the app: the maintenance page over everything, the "page not found" card for a "Continue with ..." button that cannot start, and no raw error text
// No database or browser needed.
//
// Usage: node scripts/supabase/test-service-restricted.mjs
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { looksRestricted, makeServiceAwareFetch, probeService, isServiceDown, reportServiceDown, reportServiceUp, subscribeServiceDown } from '../../src/services/serviceHealth.ts';
import { makePatientFetch } from '../../src/services/authFetch.ts';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8');

const NOTICE = 'Service for this project is restricted due to the following violations: exceed_cached_egress_quota. The project owner must upgrade their plan or remove spend caps to restore service.';
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const restricted = () => json(402, { message: NOTICE });

section('1. Recognising the notice');
check(looksRestricted(402, NOTICE), "the host's own 402 notice is recognised");
check(looksRestricted(402, '{"message":"exceed_egress_quota"}') && looksRestricted(403, NOTICE) && looksRestricted(503, NOTICE), 'whatever status the gateway uses (402, 403, 5xx), with the notice in it');
check(!looksRestricted(402, '{"message":"payment needed for this order"}'), 'a 402 of something else is not the notice');
check(!looksRestricted(200, NOTICE) && !looksRestricted(404, NOTICE) && !looksRestricted(400, NOTICE), 'a good answer, or a plain 400/404, is never taken for it');
check(!looksRestricted(401, '{"message":"JWT expired"}') && !looksRestricted(500, ''), 'an expired token or an empty server error is not it either');

section('2. The wrapped fetch');
let downs = 0, ups = 0;
const aware = (base) => makeServiceAwareFetch(base, () => downs++, () => ups++);
let res = await aware(async () => restricted())('https://x.supabase.co/rest/v1/profiles');
check(res.status === 503 && (await res.json()).code === 'service_restricted' && downs === 1, 'a restricted answer becomes a 503 and the app is told once');
check(!(await (await aware(async () => restricted())('https://x.supabase.co/x')).text()).includes('Service for this project'), "the host's own words never reach a screen");
downs = 0;
res = await aware(async () => json(200, { ok: 1 }))('https://x.supabase.co/rest/v1/profiles');
check(res.status === 200 && (await res.json()).ok === 1 && ups === 1, 'a good answer is passed on untouched and tells the app the service is there');
res = await aware(async () => json(400, { message: 'bad request' }))('https://x.supabase.co/x');
check(res.status === 400 && downs === 0, 'an ordinary error is passed on untouched and does not count as "down"');
res = await aware(async () => new Response('<html>oops</html>', { status: 502, headers: { 'content-type': 'text/html' } }))('https://x.supabase.co/x');
check(res.status === 502 && downs === 0, 'an HTML error page from something in between is not taken for the notice');
let threw = false;
try { await aware(async () => { throw new TypeError('Failed to fetch'); })('https://x.supabase.co/x'); } catch { threw = true; }
check(threw, 'a lost connection still throws as before (the library already treats it as temporary)');
res = await makeServiceAwareFetch(async () => restricted(), () => { throw new Error('broken listener'); })('https://x.supabase.co/x');
check(res.status === 503, 'a broken listener can not break a request');

section('3. The real login library against a fake server that answers 402');
const KEY = 'test-auth';
const now = () => Math.floor(Date.now() / 1000);
const stored = (expiresAt) => JSON.stringify({ access_token: 'old.access.token', refresh_token: 'old-refresh', token_type: 'bearer', expires_in: 3600, expires_at: expiresAt, user: { id: 'u1', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } });
const newSession = { access_token: 'new.access.token', refresh_token: 'new-refresh', token_type: 'bearer', expires_in: 3600, expires_at: now() + 3600, user: { id: 'u1', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };
async function scenario({ plan, wrapped }) {
  const memory = new Map([[KEY, stored(now() - 30)]]);
  let renewals = 0, down = 0;
  const server = async (input) => {
    if (!String(input).includes('grant_type=refresh_token')) return new Response('{}', { status: 404 });
    const answer = plan[Math.min(renewals++, plan.length - 1)];
    return answer === 'restricted' ? restricted() : json(200, newSession);
  };
  const client = createClient('https://x.supabase.co', 'anon', {
    global: { fetch: wrapped ? makePatientFetch(makeServiceAwareFetch(server, () => down++)) : server },
    auth: { storageKey: KEY, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, storage: { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v), removeItem: (k) => memory.delete(k) } }
  });
  const quiet = console.error;
  console.error = () => {};
  const { data, error } = await client.auth.getSession();
  const out = { session: data.session, error, kept: memory.has(KEY), renewals, down };
  await client.auth.stopAutoRefresh();
  await new Promise((r) => setTimeout(r, 100));
  console.error = quiet;
  return out;
}
let s = await scenario({ plan: ['restricted'], wrapped: false });
check(s.session === null && s.kept === false, 'WITHOUT the wrapper: the first renewal during a restriction deletes the saved login (the bug: everybody was signed out)');
s = await scenario({ plan: ['restricted', 'restricted', 'ok'], wrapped: true });
check(s.session?.access_token === 'new.access.token' && s.kept && s.renewals === 3 && s.down >= 2, 'WITH it: the restriction is waited out, the renewal then succeeds and the person never left');
console.log('  (a restriction that does not end: about 25 seconds, the library keeps trying)');
s = await scenario({ plan: ['restricted'], wrapped: true });
check(s.kept === true, 'a restriction that never ends does NOT delete the saved login');
check(s.session === null && !!s.error && s.renewals > 1, '...the check reports an error ("can not tell"), so the app signs nobody out');

section('4. The check that ends the maintenance page');
const probeWith = (fetchImpl) => probeService({ url: 'https://x.supabase.co', key: 'k', fetchImpl, timeoutMs: 500 });
check((await probeWith(async () => json(200, { name: 'GoTrue' }))) === 'up', 'a healthy answer: up');
check((await probeWith(async () => restricted())) === 'restricted', 'the notice: restricted');
check((await probeWith(async () => { throw new TypeError('Failed to fetch'); })) === 'unreachable', 'no connection: unreachable');
check((await probeWith(async () => new Response('bad gateway', { status: 502 }))) === 'unreachable', 'a bad gateway: unreachable');
check((await probeService({ url: '', key: '' })) === 'unreachable', 'not configured: unreachable (never "up")');
let asked;
await probeWith(async (u, init) => { asked = { u: String(u), init }; return json(200, {}); });
check(asked.u === 'https://x.supabase.co/auth/v1/health' && asked.init.headers.apikey === 'k' && asked.init.cache === 'no-store', 'it asks one tiny public question, never from a cache, with no login of anybody');
const log = [];
const off = subscribeServiceDown(() => log.push(isServiceDown()));
reportServiceDown(); reportServiceDown(); reportServiceUp(); reportServiceUp(); off(); reportServiceDown(); reportServiceUp();
check(JSON.stringify(log) === '[true,false]', 'the "down" flag tells its listeners once per change, and stops when they leave');

section('5. In the app');
const main = read('src/main.tsx');
const gate = read('src/components/Common/ServiceGate.tsx');
const page = read('src/components/Common/SystemPage.tsx');
const supa = read('src/services/supabase.ts');
const api = read('src/services/supabaseApi.ts');
const social = read('src/components/Auth/SocialLoginButtons.tsx');
check(/<App \/>[\s\S]*<ServiceGate \/>/.test(main), 'the maintenance page is drawn over the whole app (signed in or not, the administrator too)');
check(/kind="maintenance"/.test(gate) && /probeService\(\)/.test(gate) && /reportServiceUp\(\)/.test(gate) && !/logout|signOut|setCurrentUser/i.test(gate), 'it checks by itself, goes away when the service answers, and never touches the login');
check(/maintenance: \{[\s\S]*under maintenance[\s\S]*still signed in/.test(page), 'its words: under maintenance, and "you are still signed in"');
check(/makePatientFetch\(\s*makeServiceAwareFetch\(/.test(supa), 'every request of the app goes through the wrapper (so no renewal can delete a login because of it)');
check((api.match(/probeService\(\)\) !== 'up'\) return \{ success: false, unavailable: true/g) || []).length === 2, 'both "Continue with ..." starters check the service BEFORE leaving for Google');
check(/res\.unavailable\) \{ setUnavailable\(true\)/.test(social) && /<SystemPage kind="not-found" onClose/.test(social), 'a button that cannot start shows the "page not found" card (not the host\'s text, not a red error)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
