// Tests the "recover-account" Edge Function's own logic (both the existing security-question path and the new emailed
// one-time-code path) with stand-ins for Supabase and Resend, so every branch is exercised without needing the Deno
// runtime, a real project or a real email.
//
// Usage: node scripts/supabase/test-recover-account-function.mjs
import fs from 'node:fs';
import path from 'node:path';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);

// ---- build a runnable copy of the function next to a stand-in for the Supabase library
const tmp = path.join('scripts', 'supabase', '_recover-fn-test');
fs.mkdirSync(tmp, { recursive: true });
fs.writeFileSync(path.join(tmp, 'stub-supabase.mjs'), `
export function createClient(url, key, opts) {
  return {
    auth: {
      getUser: async (token) => globalThis.__fake.getUser(token),
      admin: {
        getUserById: async (id) => globalThis.__fake.getUserById(id),
        createUser: async (opts) => globalThis.__fake.createUser(opts),
        generateLink: async (opts) => globalThis.__fake.generateLink(opts)
      }
    },
    rpc: async (fn, args) => globalThis.__fake.rpc(fn, args),
    from: (table) => {
      const f = { table, eq: {} };
      const q = { select: () => q, eq: (k, v) => { f.eq[k] = v; return q; }, maybeSingle: async () => globalThis.__fake.select(f), insert: async (row) => globalThis.__fake.insert(table, row), update: (row) => ({ eq: async (k, v) => { globalThis.__fake.updates.push([table, row, k, v]); return { error: null }; } }) };
      return q;
    }
  };
}
`);
const src = fs.readFileSync(path.join('supabase', 'functions', 'recover-account', 'index.ts'), 'utf8').replace("'npm:@supabase/supabase-js@2'", "'./stub-supabase.mjs'");
fs.writeFileSync(path.join(tmp, 'fn.ts'), src);

let handler = null;
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc' };
globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { handler = h; } };
await import(new URL(`file:///${path.resolve(tmp, 'fn.ts').replace(/\\/g, '/')}`).href);

// ---- fakes
let rpcCalls = [];
let dbPlan = {};
let tables = {};
globalThis.__fake = {
  updates: [],
  rpc: async (fn, args) => { rpcCalls.push({ fn, args }); return dbPlan[fn] ? dbPlan[fn](args) : { data: null, error: { message: 'unknown rpc ' + fn } }; },
  getUserById: async (id) => (id === 'u-ok' ? { data: { user: { email: `${id}@users.nooob.xyz` } }, error: null } : { data: { user: null }, error: { message: 'not found' } }),
  createUser: async (opts) => { events.push(['createUser', opts.email]); return globalThis.__fake.createUserAnswer(opts); },
  createUserAnswer: async () => ({ data: { user: { id: 'u-ok' } }, error: null }),
  insert: async (table, row) => { events.push(['insert', table, row.auth_email]); return globalThis.__fake.insertAnswer(table, row); },
  insertAnswer: async () => ({ error: null }),
  generateLink: async (opts) => (opts.type === 'magiclink' ? { data: { properties: { hashed_token: 'th-' + opts.email } }, error: null } : { data: null, error: { message: 'bad type' } }),
  getUser: async (token) => (tables.tokens?.[token] ? { data: { user: { id: tables.tokens[token] } } } : { data: { user: null } }),
  select: (f) => {
    const rows = tables[f.table] || [];
    const row = rows.find((r) => Object.entries(f.eq).every(([k, v]) => r[k] === v));
    return { data: row || null, error: null };
  }
};
let resendCalls = [];
let events = [];
let dnsAsked = [];
globalThis.__dns = null;   // (name, type) => the DNS answer, or throw for "the DNS service is down"
globalThis.fetch = async (url, init = {}) => {
  if (String(url).startsWith('https://cloudflare-dns.com/dns-query')) {
    const u = new URL(String(url));
    dnsAsked.push([u.searchParams.get('name'), u.searchParams.get('type')]);
    const answer = globalThis.__dns ? globalThis.__dns(u.searchParams.get('name'), u.searchParams.get('type')) : { Status: 0, Answer: [{ type: 15, data: '10 mx.example.com.' }] };
    return { ok: true, status: 200, json: async () => answer };
  }
  if (String(url) === 'https://api.resend.com/emails') {
    resendCalls.push(JSON.parse(init.body));
    return globalThis.__resend ? globalThis.__resend() : { ok: true, status: 200, text: async () => '' };
  }
  throw new Error('unexpected fetch ' + url);
};

const reset = () => { rpcCalls = []; dbPlan = {}; resendCalls = []; globalThis.__resend = null; tables = {}; events = []; dnsAsked = []; globalThis.__dns = null; globalThis.__fake.createUserAnswer = async () => ({ data: { user: { id: 'u-ok' } }, error: null }); globalThis.__fake.insertAnswer = async () => ({ error: null }); };
const req = (body, headers = {}) => new Request('https://x.supabase.co/functions/v1/recover-account', {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body)
});
const call = async (body, headers = {}) => {
  const res = await handler(req(body, headers));
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
};

// ================================================================= existing security-question path (unchanged)
section('1. The existing security-question recovery is unchanged');
reset();
dbPlan.recovery_check = () => ({ data: { status: 'ok', userId: 'u-ok' }, error: null });
let r = await call({ username: 'ana', mobileNumber: '9000000000', dateOfBirth: '2000-01-01', email: 'a@b.c' });
check(r.status === 200 && r.json.success && r.json.tokenHash === 'th-u-ok@users.nooob.xyz', 'a verified account gets a one-time sign-in token');
check(rpcCalls[0].fn === 'recovery_check' && rpcCalls[0].args.p_username === 'ana', 'the database check is asked, with the four details');
for (const [status, code, pattern] of [
  ['rate_limited', 429, /Too many attempts/], ['missing_username', 400, /Username is required/], ['not_found', 404, /No account found/],
  ['missing', 400, /mobile number, date of birth/], ['mismatch', 401, /do not match/]
]) {
  reset(); dbPlan.recovery_check = () => ({ data: { status }, error: null });
  r = await call({ username: 'x' });
  check(r.status === code && pattern.test(r.json.error), `status "${status}" becomes a ${code}`);
}
reset(); dbPlan.recovery_check = () => ({ data: { status: 'suspended', reason: 'spamming' }, error: null });
r = await call({ username: 'x' });
check(r.status === 403 && /suspended/.test(r.json.error) && /spamming/.test(r.json.error), 'a suspended account\'s reason is passed along');
reset(); dbPlan.recovery_check = () => ({ data: null, error: { message: 'db down' } });
r = await call({ username: 'x' });
check(r.status === 500 && /unavailable/.test(r.json.error), 'a database error becomes a polite "unavailable"');
reset(); dbPlan.recovery_check = () => ({ data: { status: 'ok', userId: 'u-missing' }, error: null });
r = await call({ username: 'x' });
check(r.status === 500 && /unavailable/.test(r.json.error), 'a verified account whose auth record can not be found still fails politely (never a raw error)');

// ================================================================= emailed one-time code
section('2. Asking for an emailed code');
reset();
dbPlan.recovery_otp_request = () => ({ data: { status: 'ok', userId: 'u-ok', email: 'padma.singh@example.com', code: '482913' }, error: null });
env.RESEND_API_KEY = 'rk_test_key';
r = await call({ action: 'otp-request', username: 'padma' });
check(r.status === 200 && r.json.success && r.json.maskedEmail === 'p••••@e••••.com', 'a code is "sent" and only a masked email comes back to the browser');
check(resendCalls.length === 1 && resendCalls[0].to[0] === 'padma.singh@example.com' && resendCalls[0].subject.includes('482913') && resendCalls[0].html.includes('482913'), 'the real email and the real code go to Resend, never to the browser');
check(!JSON.stringify(r.json).includes('482913'), 'the code itself never appears in the answer sent to the browser');
check(!JSON.stringify(r.json).toLowerCase().includes('rk_test_key'), 'the Resend key never appears in the answer either');
delete env.RESEND_API_KEY;
reset(); dbPlan.recovery_otp_request = () => ({ data: { status: 'ok', userId: 'u-ok', email: 'a@b.c', code: '111111' }, error: null });
r = await call({ action: 'otp-request', username: 'padma' });
check(r.status === 503 && r.json.notConfigured === true && resendCalls.length === 0 && rpcCalls.length === 0, 'without a Resend key, the app is told plainly, and NOTHING is generated or stored in the database — the account\'s limited send allowance is not wasted on a code that could never be emailed');
env.RESEND_API_KEY = 'rk_test_key';
for (const [status, code, pattern] of [
  ['rate_limited', 429, /Too many attempts/], ['cooldown', 429, /just sent/], ['missing_username', 400, /Username is required/],
  ['not_found', 404, /No account found/], ['suspended', 403, /suspended/], ['no_email', 404, /no email on file/]
]) {
  reset(); dbPlan.recovery_otp_request = () => ({ data: { status }, error: null });
  r = await call({ action: 'otp-request', username: 'x' });
  check(r.status === code && pattern.test(r.json.error) && resendCalls.length === 0, `status "${status}" becomes a ${code} (and nothing is emailed)`);
}
reset(); dbPlan.recovery_otp_request = () => ({ data: { status: 'ok', userId: 'u-ok', email: 'a@b.c', code: '222222' }, error: null });
globalThis.__resend = () => ({ ok: false, status: 422, text: async () => 'bad address' });
r = await call({ action: 'otp-request', username: 'x' });
check(r.status === 502 && /unavailable/.test(r.json.error), 'if the email provider refuses, a polite "unavailable" is shown (no email details leak)');

section('3. Checking an emailed code');
reset(); dbPlan.recovery_otp_verify = () => ({ data: { status: 'ok', userId: 'u-ok' }, error: null });
r = await call({ action: 'otp-verify', username: 'padma', code: '482913' });
check(r.status === 200 && r.json.success && r.json.tokenHash === 'th-u-ok@users.nooob.xyz', 'the right code signs the account in, the same one-time-token way as the security questions');
check(rpcCalls[0].fn === 'recovery_otp_verify' && rpcCalls[0].args.p_code === '482913', 'the typed code is sent to the database check as-is');
for (const [status, code, pattern] of [
  ['rate_limited', 429, /Too many attempts/], ['missing_username', 400, /Username is required/], ['missing', 400, /enter the code/],
  ['not_found', 404, /No account found/], ['suspended', 403, /suspended/], ['expired', 401, /expired or was already used/],
  ['too_many_attempts', 401, /Too many wrong codes/], ['mismatch', 401, /not right/]
]) {
  reset(); dbPlan.recovery_otp_verify = () => ({ data: { status }, error: null });
  r = await call({ action: 'otp-verify', username: 'x', code: '000000' });
  check(r.status === code && pattern.test(r.json.error), `status "${status}" becomes a ${code}`);
}
reset(); dbPlan.recovery_otp_verify = () => ({ data: null, error: { message: 'db down' } });
r = await call({ action: 'otp-verify', username: 'x', code: '000000' });
check(r.status === 500 && /unavailable/.test(r.json.error), 'a database error becomes a polite "unavailable"');

section('4. The welcome email, right after signing up');
reset();
env.RESEND_API_KEY = 'rk_test_key';
tables.tokens = { 'fresh-session-token': 'u-new' };
tables.profiles = [{ id: 'u-new', username: 'newbie', display_name: 'New Bie' }];
tables.profile_private = [{ user_id: 'u-new', email: 'newbie@example.com' }];
r = await call({ action: 'welcome' }, { authorization: 'Bearer fresh-session-token' });
check(r.status === 200 && r.json.success === true && r.json.sent === true, 'a brand-new account gets a welcome email');
check(resendCalls.length === 1 && resendCalls[0].to[0] === 'newbie@example.com' && /Welcome to NOOB/.test(resendCalls[0].subject) && resendCalls[0].html.includes('newbie') && resendCalls[0].html.includes('New Bie'), 'it goes to their real email and greets them by name and @handle');
reset(); env.RESEND_API_KEY = 'rk_test_key';
r = await call({ action: 'welcome' });
check(r.status === 200 && r.json.sent === false && resendCalls.length === 0, 'no session token: no email, but still a normal answer (never fails the signup)');
tables.tokens = { 'fresh-session-token': 'u-new' };
r = await call({ action: 'welcome' }, { authorization: 'Bearer wrong-token' });
check(r.json.sent === false && resendCalls.length === 0, 'an unrecognised token: the same, quietly nothing');
tables.profiles = [{ id: 'u-new', username: 'newbie', display_name: 'New Bie' }];
tables.profile_private = [];
r = await call({ action: 'welcome' }, { authorization: 'Bearer fresh-session-token' });
check(r.json.sent === false && resendCalls.length === 0, 'no email on file for the account: nothing to send, still a normal answer');
delete env.RESEND_API_KEY;
tables.profile_private = [{ user_id: 'u-new', email: 'newbie@example.com' }];
r = await call({ action: 'welcome' }, { authorization: 'Bearer fresh-session-token' });
check(r.json.success === true && r.json.sent === false && resendCalls.length === 0, 'emailing not switched on yet: still succeeds quietly (never blocks signup)');
env.RESEND_API_KEY = 'rk_test_key';
const nameWithHtml = { id: 'u-new', username: 'newbie', display_name: '<script>alert(1)</script>' };
tables.profiles = [nameWithHtml];
r = await call({ action: 'welcome' }, { authorization: 'Bearer fresh-session-token' });
check(!resendCalls.at(-1).html.includes('<script>'), 'a display name is never dropped into the email HTML unescaped');
delete env.RESEND_API_KEY;

// ================================================================= sign-up: an address a code can not reach, and the ticket
section('4a. Sign-up: "email not found" before a code is made, and the ticket before the login');
env.RESEND_API_KEY = 'rk_test_key';
const okRpc = () => { dbPlan.signup_otp_request = () => ({ data: { status: 'ok', code: '654321' }, error: null }); };
reset(); okRpc();
r = await call({ action: 'signup-otp-request', email: 'ana@gmial.com' });
check(r.status === 422 && r.json.code === 'email_not_found' && /Did you mean ana@gmail\.com/.test(r.json.error) && rpcCalls.length === 0 && resendCalls.length === 0, 'a typing slip of a big provider (gmial.com) is "email not found", the right address is suggested, no code is made and nothing is emailed');
reset(); okRpc();
r = await call({ action: 'signup-otp-request', email: 'x@mailinator.com' });
check(r.status === 422 && /Temporary email addresses/.test(r.json.error) && rpcCalls.length === 0 && resendCalls.length === 0, 'a throw-away mailbox service is refused before anything is spent');
reset(); okRpc();
globalThis.__dns = () => ({ Status: 3 });
r = await call({ action: 'signup-otp-request', email: 'ana@no-such-domain-xyz.com' });
check(r.status === 422 && /email address was not found/i.test(r.json.error) && rpcCalls.length === 0 && resendCalls.length === 0 && dnsAsked.some(([, t]) => t === 'MX'), 'a domain that does not exist: "email not found, enter a correct one"');
reset(); okRpc();
globalThis.__dns = (n, t) => (t === 'MX' ? { Status: 0, Answer: [{ type: 15, data: '0 .' }] } : { Status: 0 });
r = await call({ action: 'signup-otp-request', email: 'ana@takes-no-mail.com' });
check(r.status === 422 && rpcCalls.length === 0, 'a domain whose mail record says "no mail here" (MX 0 .) and that has no address record is refused too');
reset(); okRpc();
globalThis.__dns = (n, t) => (t === 'MX' ? { Status: 0 } : t === 'A' ? { Status: 0, Answer: [{ type: 1, data: '1.2.3.4' }] } : { Status: 0 });
r = await call({ action: 'signup-otp-request', email: 'ana@old-style-domain.com' });
check(r.status === 200 && r.json.success, 'a domain with no MX but an address record can still take mail (the old rule): allowed');
reset(); okRpc();
r = await call({ action: 'signup-otp-request', email: 'ana@example.com' });
check(r.status === 200 && r.json.success && rpcCalls[0].fn === 'signup_otp_request' && resendCalls.length === 1 && resendCalls[0].to[0] === 'ana@example.com' && !JSON.stringify(r.json).includes('654321'), 'a good address: the code is made and emailed, and never shown to the browser');
reset(); okRpc();
globalThis.__dns = () => { throw new Error('dns down'); };
r = await call({ action: 'signup-otp-request', email: 'ana@example.com' });
check(r.status === 200 && r.json.success, 'if the DNS service itself can not be asked, a real person is never blocked for it');
reset(); okRpc();
globalThis.__resend = () => ({ ok: false, status: 422, text: async () => 'invalid to' });
r = await call({ action: 'signup-otp-request', email: 'ana@example.com' });
check(r.status === 422 && r.json.code === 'email_not_found' && /not found/i.test(r.json.error), "the email provider saying the address itself is invalid (422) is shown as 'email not found'");
reset(); okRpc();
globalThis.__resend = () => ({ ok: false, status: 500, text: async () => 'boom' });
r = await call({ action: 'signup-otp-request', email: 'ana@example.com' });
check(r.status === 502 && /unavailable/.test(r.json.error), "a provider failure on our side stays a polite 'unavailable' (not 'email not found')");
reset();
r = await call({ action: 'signup-otp-request', email: 'not-an-email' });
check(r.status === 400 || r.status === 500 || r.json.error, 'a text that is not even an address goes to the database check as before (its own message)');

const signupBody = { action: 'signup-otp-verify', email: 'ana@example.com', code: '654321', signup: { username: 'ana', password: 'pw-123456', email: 'ana@example.com', firstName: 'Ana' } };
const okVerify = () => { dbPlan.signup_otp_verify = () => ({ data: { status: 'ok' }, error: null }); dbPlan.check_signup = () => ({ data: { ok: true }, error: null }); };
reset(); okVerify();
r = await call(signupBody);
const ev = events.map((e) => e[0] + ':' + e[1] + ':' + (e[2] || ''));
check(r.status === 200 && r.json.success && r.json.tokenHash, 'the right code makes the account and hands back a one-time sign-in token');
check(events.length === 2 && events[0][0] === 'insert' && events[0][1] === 'signup_tickets' && events[1][0] === 'createUser' && events[0][2] === events[1][1] && /^[0-9a-f-]{36}@users\.nooob\.xyz$/.test(events[1][1]), 'the ticket (the private login address) is written down FIRST, and the very same address is then used to create the login', ev.join(' | '));
reset(); okVerify();
globalThis.__fake.insertAnswer = async () => ({ error: { message: 'relation "signup_tickets" does not exist' } });
r = await call(signupBody);
check(r.status === 200 && r.json.success && events.some((e) => e[0] === 'createUser'), 'before the migration has been run the ticket can not be written: signing up still works (the rule is not on either)');
reset(); okVerify();
let attempts = 0;
globalThis.__fake.createUserAnswer = async () => (++attempts === 1 ? { data: null, error: { message: 'Database error creating new user' } } : { data: { user: { id: 'u-ok' } }, error: null });
r = await call(signupBody);
const creates = events.filter((e) => e[0] === 'createUser').map((e) => e[1]);
const inserts = events.filter((e) => e[0] === 'insert').map((e) => e[2]);
check(r.status === 200 && creates.length === 2 && creates[0] !== creates[1] && inserts.length === 2 && inserts[0] === creates[0] && inserts[1] === creates[1], 'the one retry after a transient database error gets a NEW login address and its own new ticket');
reset(); okVerify();
dbPlan.signup_otp_verify = () => ({ data: { status: 'mismatch' }, error: null });
r = await call(signupBody);
check(r.status === 401 && events.length === 0, 'a wrong code: no ticket, no login');
reset(); okVerify();
dbPlan.check_signup = () => ({ data: { ok: false, error: 'User ID is already taken.' }, error: null });
r = await call(signupBody);
check(r.status === 400 && events.length === 0, 'a form that does not pass the checks: no ticket, no login');
delete env.RESEND_API_KEY;

section('4b. Odds and ends');
const badReq = new Request('https://x.supabase.co/functions/v1/recover-account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not valid json' });
const badRes = await handler(badReq);
check(badRes.status === 400, 'invalid JSON is refused');
const res = await handler(new Request('https://x.supabase.co/functions/v1/recover-account', { method: 'GET' }));
check(res.status === 405, 'a GET request is refused');
const opt = await handler(new Request('https://x.supabase.co/functions/v1/recover-account', { method: 'OPTIONS' }));
check(opt.status === 200 && opt.headers.get('access-control-allow-origin') === '*', 'a CORS preflight is answered');

section('4c. Guest support: the help chat on the login page');
env.RESEND_API_KEY = 're_test';
const secrets = [];   // every answer is kept, to prove that no code and no address ever leaves in one
const gcall = async (body, headers = {}) => { const out = await call({ browser: 'browser-aaaaaaaaaaaaaaaa', ...body }, headers); secrets.push(JSON.stringify(out.json)); return out; };
reset(); globalThis.__fake.updates = [];
dbPlan.guest_support_status = () => ({ data: { status: 'ok', uses: 1, remaining: 2, limit: 3 }, error: null });
r = await gcall({ action: 'guest-support-status' });
check(r.status === 200 && r.json.remaining === 2 && rpcCalls[0].fn === 'guest_support_status' && rpcCalls[0].args.p_browser === 'browser-aaaaaaaaaaaaaaaa', 'asks the database how many uses the browser has left');

reset();
dbPlan.guest_support_email_check = () => ({ data: { status: 'found', many: false, suspended: false }, error: null });
r = await gcall({ action: 'guest-support-email', email: ' Ana.Smith@Example.com ' }, { 'cf-connecting-ip': '5.6.7.8', 'x-forwarded-for': '1.1.1.1' });
check(r.status === 200 && r.json.status === 'found' && /^a•+@e•*@?/.test('') === false && r.json.maskedEmail && !r.json.maskedEmail.includes('Smith') && !r.json.maskedEmail.toLowerCase().includes('ana.smith') && r.json.maskedEmail.endsWith('.com'), 'a found email is answered with the address mostly hidden');
check(rpcCalls[0].args.p_ip === '5.6.7.8' && rpcCalls[0].args.p_email === ' Ana.Smith@Example.com ', 'the network address is Cloudflare\'s own header (a visitor can not write it); the database cleans the email itself');
reset(); dbPlan.guest_support_email_check = () => ({ data: { status: 'found' }, error: null });
await gcall({ action: 'guest-support-email', email: 'a@b.com' }, { 'x-forwarded-for': '9.9.9.9, 8.8.8.8' });
check(rpcCalls[0].args.p_ip === '9.9.9.9', 'without it, the first forwarded address is used');
for (const status of ['no_account', 'invalid_email', 'rate_limited', 'limit_reached', 'bad_browser']) {
  reset(); dbPlan.guest_support_email_check = () => ({ data: { status }, error: null });
  r = await gcall({ action: 'guest-support-email', email: 'x@y.com' });
  check(r.status === 200 && r.json.status === status && !('maskedEmail' in r.json), `"${status}" is passed on as it is (no address is shown)`);
}
reset(); dbPlan.guest_support_email_check = () => ({ data: null, error: { message: 'db down' } });
r = await gcall({ action: 'guest-support-email', email: 'x@y.com' });
check(r.status === 500 && r.json.status === 'unavailable' && !/db down/.test(JSON.stringify(r.json)), 'a database error is a polite "unavailable" without technical details');

reset();
dbPlan.guest_support_begin = (a) => ({ data: { status: 'ok', caseId: 'case-1', caseKey: 'k'.repeat(64), remaining: 2, accountFound: true, many: false }, error: null });
r = await gcall({ action: 'guest-support-begin', email: 'ana@example.com', issue: 'x'.repeat(5000), kind: 'login' });
check(r.status === 200 && r.json.caseId === 'case-1' && r.json.caseKey === 'k'.repeat(64) && r.json.remaining === 2 && r.json.maskedEmail && rpcCalls[0].args.p_issue.length === 2000, 'starting a chat hands back the chat id and its key once (the problem is cut at 2000 letters)');
reset(); dbPlan.guest_support_begin = () => ({ data: { status: 'limit_reached' }, error: null });
r = await gcall({ action: 'guest-support-begin', email: 'ana@example.com', issue: 'help me', kind: 'login' });
check(r.json.status === 'limit_reached' && !('caseKey' in r.json), 'a browser with no uses left gets no key');

reset(); dbPlan.guest_support_id_check = () => ({ data: { status: 'match' }, error: null });
await gcall({ action: 'guest-support-id', caseId: 'c', caseKey: 'k', username: '@ana', forgot: 'true' });
check(rpcCalls[0].args.p_forgot === false && rpcCalls[0].args.p_username === '@ana' && rpcCalls[0].args.p_case === 'c' && rpcCalls[0].args.p_browser === 'browser-aaaaaaaaaaaaaaaa', '"I forgot my ID" counts only when it is exactly true');
await gcall({ action: 'guest-support-id', caseId: 'c', caseKey: 'k', forgot: true });
check(rpcCalls[1].args.p_forgot === true, '... and does when it is');

section('4d. Guest support: the emailed code');
reset(); delete env.RESEND_API_KEY;
dbPlan.guest_support_otp_request = () => ({ data: { status: 'ok' }, error: null });
r = await gcall({ action: 'guest-support-otp-request', caseId: 'c', caseKey: 'k' });
check(r.status === 200 && r.json.status === 'not_configured' && rpcCalls.length === 0 && resendCalls.length === 0, 'if emailing is not switched on, nothing is asked of the database and no allowance is spent');
env.RESEND_API_KEY = 're_test';
reset();
dbPlan.guest_support_otp_request = () => ({ data: { status: 'ok', userId: 'u-ok', email: 'ana@example.com', username: 'ana_guest', code: '482913', sendsLeft: 2 }, error: null });
r = await gcall({ action: 'guest-support-otp-request', caseId: 'c', caseKey: 'k' });
const mail = resendCalls[0];
check(r.status === 200 && r.json.status === 'sent' && r.json.sendsLeft === 2 && r.json.maskedEmail && Object.keys(r.json).sort().join() === 'maskedEmail,sendsLeft,status', 'the answer says only "sent", the hidden address and the codes left');
check(resendCalls.length === 1 && mail.to[0] === 'ana@example.com' && /482913/.test(mail.text) && /482913/.test(mail.html) && /@ana_guest/.test(mail.text) && /10 minutes/.test(mail.text) && /help chat on the login page/.test(mail.text), 'the code goes by email to the address ON FILE only (with the User ID, for someone who forgot it)');
check(!JSON.stringify(r.json).includes('482913') && !JSON.stringify(r.json).includes('ana@example.com') && !JSON.stringify(r.json).includes('u-ok') && !JSON.stringify(r.json).includes('ana_guest'), 'and the code, the address, the account id and the User ID are not in the answer');
reset(); dbPlan.guest_support_otp_request = () => ({ data: { status: 'cooldown', seconds: 31 }, error: null });
r = await gcall({ action: 'guest-support-otp-request', caseId: 'c', caseKey: 'k' });
check(r.json.status === 'cooldown' && r.json.seconds === 31 && resendCalls.length === 0, 'the wait is passed on, nothing is sent');
for (const status of ['id_required', 'no_account', 'need_id', 'suspended', 'rate_limited', 'case_limit', 'bad_case']) {
  reset(); dbPlan.guest_support_otp_request = () => ({ data: { status }, error: null });
  r = await gcall({ action: 'guest-support-otp-request', caseId: 'c', caseKey: 'k' });
  check(r.json.status === status && resendCalls.length === 0, `"${status}": no email is sent`);
}
reset(); globalThis.__resend = () => ({ ok: false, status: 500, text: async () => 'boom' });
dbPlan.guest_support_otp_request = () => ({ data: { status: 'ok', userId: 'u-ok', email: 'ana@example.com', username: 'ana_guest', code: '111222', sendsLeft: 1 }, error: null });
r = await gcall({ action: 'guest-support-otp-request', caseId: 'c', caseKey: 'k' });
check(r.json.status === 'send_failed' && !JSON.stringify(r.json).includes('111222'), 'if the email can not be sent, the person is told (and the code is still not in the answer)');

reset(); globalThis.__fake.updates = [];
dbPlan.guest_support_otp_verify = () => ({ data: { status: 'ok', userId: 'u-ok' }, error: null });
r = await gcall({ action: 'guest-support-otp-verify', caseId: 'c', caseKey: 'k', code: ' 123456 ' });
check(r.status === 200 && r.json.status === 'ok' && r.json.tokenHash === 'th-u-ok@users.nooob.xyz' && Object.keys(r.json).sort().join() === 'status,tokenHash' && rpcCalls[0].args.p_code === ' 123456 ', 'the right code gives a one-time sign-in token (the same kind as every other emailed-code login)');
for (const status of ['mismatch', 'expired', 'too_many_attempts', 'rate_limited', 'case_locked', 'bad_format', 'missing', 'suspended', 'bad_case', 'id_required']) {
  reset(); dbPlan.guest_support_otp_verify = () => ({ data: { status, userId: 'u-ok' }, error: null });
  r = await gcall({ action: 'guest-support-otp-verify', caseId: 'c', caseKey: 'k', code: '000000' });
  check(r.status === 200 && r.json.status === status && !('tokenHash' in r.json), `"${status}": no token is made`);
}
reset(); globalThis.__fake.updates = [];
dbPlan.guest_support_otp_verify = () => ({ data: { status: 'ok', userId: 'u-missing' }, error: null });
r = await gcall({ action: 'guest-support-otp-verify', caseId: 'case-77', caseKey: 'k', code: '123456' });
check(r.json.status === 'token_failed' && !('tokenHash' in r.json) && globalThis.__fake.updates.length === 1 && globalThis.__fake.updates[0][0] === 'guest_support_cases' && globalThis.__fake.updates[0][1].status === 'open' && globalThis.__fake.updates[0][3] === 'case-77', 'if the right code could not be turned into a sign-in, the chat is opened again so a new code can be asked for');

reset(); dbPlan.guest_support_close = () => ({ data: { status: 'ok' }, error: null });
r = await gcall({ action: 'guest-support-close', caseId: 'c', caseKey: 'k' });
check(r.json.status === 'ok' && rpcCalls[0].fn === 'guest_support_close', 'a chat can be ended');
r = await gcall({ action: 'guest-support-nonsense' });
check(r.status === 400 && r.json.status === 'unknown_action', 'an unknown guest action is refused');
check(secrets.every((x) => !/482913|111222|ana@example\.com|ana\.smith@example/i.test(x)), 'across all of this, no code and no whole email address was ever in any answer');
check(!/serviceKey|service_role|SUPABASE_SERVICE/i.test(secrets.join('')), 'and no key of the server');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
