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
    auth: { admin: {
      getUserById: async (id) => globalThis.__fake.getUserById(id),
      generateLink: async (opts) => globalThis.__fake.generateLink(opts)
    } },
    rpc: async (fn, args) => globalThis.__fake.rpc(fn, args)
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
globalThis.__fake = {
  rpc: async (fn, args) => { rpcCalls.push({ fn, args }); return dbPlan[fn] ? dbPlan[fn](args) : { data: null, error: { message: 'unknown rpc ' + fn } }; },
  getUserById: async (id) => (id === 'u-ok' ? { data: { user: { email: `${id}@users.nooob.xyz` } }, error: null } : { data: { user: null }, error: { message: 'not found' } }),
  generateLink: async (opts) => (opts.type === 'magiclink' ? { data: { properties: { hashed_token: 'th-' + opts.email } }, error: null } : { data: null, error: { message: 'bad type' } })
};
let resendCalls = [];
globalThis.fetch = async (url, init = {}) => {
  if (String(url) === 'https://api.resend.com/emails') {
    resendCalls.push(JSON.parse(init.body));
    return globalThis.__resend ? globalThis.__resend() : { ok: true, status: 200, text: async () => '' };
  }
  throw new Error('unexpected fetch ' + url);
};

const reset = () => { rpcCalls = []; dbPlan = {}; resendCalls = []; globalThis.__resend = null; };
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
check(r.status === 503 && r.json.notConfigured === true && resendCalls.length === 0, 'without a Resend key, the app is told plainly (and nothing is "sent")');
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

section('4. Odds and ends');
const badReq = new Request('https://x.supabase.co/functions/v1/recover-account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not valid json' });
const badRes = await handler(badReq);
check(badRes.status === 400, 'invalid JSON is refused');
const res = await handler(new Request('https://x.supabase.co/functions/v1/recover-account', { method: 'GET' }));
check(res.status === 405, 'a GET request is refused');
const opt = await handler(new Request('https://x.supabase.co/functions/v1/recover-account', { method: 'OPTIONS' }));
check(opt.status === 200 && opt.headers.get('access-control-allow-origin') === '*', 'a CORS preflight is answered');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
