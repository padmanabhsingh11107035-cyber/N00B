// Tests the receipt / NOOB Pro warning emails written by the Edge Function (action "event_email"), with stand-ins for Supabase and the
// email service, so every kind of email is built and "sent" without the Deno runtime or a real key.
//
// Usage: node scripts/supabase/test-event-email-function.mjs
import fs from 'node:fs';
import path from 'node:path';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);

const tmp = path.join('scripts', 'supabase', '_event-email-test');
fs.mkdirSync(tmp, { recursive: true });
fs.writeFileSync(path.join(tmp, 'stub-supabase.mjs'), `
export function createClient() {
  return {
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    rpc: async (fn, args) => globalThis.__fake.rpc(fn, args),
    from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null }) }; return q; }
  };
}
`);
const src = fs.readFileSync(path.join('supabase', 'functions', 'dynamic-handler', 'index.ts'), 'utf8').replace("'npm:@supabase/supabase-js@2'", "'./stub-supabase.mjs'");
fs.writeFileSync(path.join(tmp, 'fn.ts'), src);

let handler = null;
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc', SUPABASE_ANON_KEY: 'anon', RESEND_API_KEY: 'rk', SITE_URL: 'https://nooob.xyz' };
globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { handler = h; } };
await import(new URL(`file:///${path.resolve(tmp, 'fn.ts').replace(/\\/g, '/')}`).href);

const SECRET = 'a-very-private-password';
const ID = '11111111-2222-3333-4444-555555555555';
let claim = null, done = [], sent = [], resendOk = true;
globalThis.__fake = {
  rpc: async (fn, args) => {
    if (fn === 'email_claim') {
      if (args.p_secret !== SECRET) return { data: null, error: { message: 'Unauthorized' } };
      return { data: claim, error: null };
    }
    if (fn === 'email_done') { done.push(args); return { data: true, error: null }; }
    return { data: null, error: { message: 'unknown rpc ' + fn } };
  }
};
globalThis.fetch = async (url, init = {}) => {
  if (String(url).startsWith('https://api.resend.com/')) {
    const body = JSON.parse(init.body);
    sent.push({ auth: init.headers.Authorization, body });
    return resendOk ? { ok: true, status: 200, text: async () => '' } : { ok: false, status: 500, text: async () => 'boom' };
  }
  throw new Error('unexpected request ' + url);
};
const send = async (body, headers = {}) => {
  const res = await handler(new Request('http://fn.local/', { method: 'POST', headers: new Headers({ 'content-type': 'application/json', ...headers }), body: JSON.stringify(body) }));
  return { status: res.status, json: await res.json().catch(() => null) };
};
const ask = (headers = { 'x-noob-push': SECRET }) => send({ action: 'event_email', emailId: ID }, headers);
const reset = () => { claim = null; done = []; sent = []; resendOk = true; };
const mail = (kind, payload, extra = {}) => ({ claimed: true, id: ID, kind, payload, email: 'ann@example.com', name: 'Ann', username: 'ann', ...extra });

section('1. Only the database may ask');
reset();
let r = await send({ action: 'event_email', emailId: ID }, {});
check(r.status === 400 && sent.length === 0, 'no password: refused');
r = await send({ action: 'event_email', emailId: 'not-an-id' }, { 'x-noob-push': SECRET });
check(r.status === 400, 'a bad id is refused');
r = await ask({ 'x-noob-push': 'wrong' });
check(r.status === 401 && sent.length === 0, 'a wrong password is refused and nothing is sent');
claim = { claimed: false };
r = await ask();
check(r.json.success && r.json.sent === false && sent.length === 0, 'an email that is already handled sends nothing');
claim = { claimed: false, skipped: true };
r = await ask();
check(r.json.sent === false && /No email address/.test(r.json.note) && sent.length === 0, 'an account without an address is skipped');

section('2. Receipt for a plan the person bought');
reset();
claim = mail('pro_upgraded', {
  planName: 'Pro', tier: 'pro', billing: 'monthly', perks: ['Pro badge on your profile', 'Ad-free browsing'], common: ['Live profile pictures'],
  listPrice: '10,000,000,000', pricePaid: '9,000,000,000', couponCode: 'SAVE10', discountPercent: 10, walletAfter: '41,000,000,000',
  startedAt: '2026-10-11T10:30:00Z', renewsAt: '2026-11-10T10:30:00Z', autoRenew: true, renewalPrice: '10,000,000,000', method: 'wallet'
});
r = await ask();
let m = sent[0]?.body;
check(r.json.sent === true && sent.length === 1 && m.to[0] === 'ann@example.com', 'it is sent to the person\'s address');
check(/NOOB Pro Pro/.test(m.subject) && /NOOB-11111111/.test(m.subject), 'the subject names the plan and carries a receipt number', m.subject);
for (const needle of ['NOOB Pro Pro', 'Monthly (30 days)', '10,000,000,000 points', '9,000,000,000 points', 'SAVE10 (10% off)', '41,000,000,000 points', '11 Oct 2026', '10 Nov 2026', 'Pro badge on your profile', 'Live profile pictures', 'NOOB Points wallet', 'Yes']) {
  check(m.html.includes(needle) && m.text.includes(needle.replace('&amp;', '&')), `the receipt says "${needle}"`);
}
check(done.length === 1 && done[0].p_ok === true && done[0].p_secret === SECRET, 'the database is told it went out');

section('3. A friend paid');
reset();
claim = mail('pro_upgraded', { planName: 'Starter', tier: 'starter', billing: 'monthly', perks: [], common: [], listPrice: '5,000,000,000', pricePaid: '5,000,000,000', walletAfter: '0', startedAt: '2026-10-11T10:30:00Z', renewsAt: '2026-11-10T10:30:00Z', autoRenew: true, renewalPrice: '5,000,000,000', method: 'friend_topup', paidBy: { username: 'paul', amount: '2,000,000,000' }, ownShare: '3,000,000,000' });
await ask();
m = sent[0].body;
check(m.html.includes('@paul paid 2,000,000,000 points + your own 3,000,000,000 points') && /@paul helped you/.test(m.text), 'the receipt shows who paid and the two parts');
reset();
claim = mail('pro_gift_receipt', { friend: 'rita', planName: 'Starter', billing: 'monthly', amount: '5,000,000,000', planPrice: '5,000,000,000', partial: false, at: '2026-10-11T10:30:00Z', walletAfter: '25,000,000,000' });
await ask();
check(/@rita's NOOB Pro/.test(sent[0].body.subject) && sent[0].body.html.includes('You paid') && sent[0].body.text.includes('full price'), 'the friend who paid gets a receipt too');

section('4. The verification badge');
reset();
claim = mail('verified_badge', { label: 'Monthly verification badge', method: 'points_monthly', permanent: false, pricePaid: '5,000,000,000', walletAfter: '1,000,000,000', at: '2026-10-11T10:30:00Z' });
await ask();
m = sent[0].body;
check(/verification badge is active/.test(m.subject) && m.html.includes('Monthly') && m.html.includes('5,000,000,000 points') && m.html.includes('1,000,000,000 points'), 'badge receipt: type, price and balance');

section('5. "About to end" and "ended" emails open the exact payment page');
reset();
claim = mail('pro_expiring', { planName: 'Starter', tier: 'starter', billing: 'monthly', endsAt: '2026-10-14T10:30:00Z', daysLeft: 3, autoRenew: true, price: '5,000,000,000', balance: '1,000,000,000', shortfall: '4,000,000,000' });
await ask();
m = sent[0].body;
check(/ends in 3 days/.test(m.subject), 'the subject says how long is left', m.subject);
check(m.html.includes('1,000,000,000 points') && m.html.includes('4,000,000,000 points') && m.text.includes('Add 4,000,000,000 more points'), 'it shows the live balance and what is missing');
check(m.html.includes('href="https://nooob.xyz/?pro=starter&amp;billing=monthly"') && m.html.includes('Pay with NOOB Points'), 'the button goes to the payment page of that exact plan');
reset();
claim = mail('pro_expiring', { planName: 'Plus', tier: 'plus', billing: 'yearly', endsAt: '2026-10-12T10:30:00Z', daysLeft: 1, autoRenew: false, price: '99,000,000,000', balance: '0', shortfall: '99,000,000,000' });
await ask();
check(/ends tomorrow/.test(sent[0].body.subject) && /Reload Monthly is turned off/.test(sent[0].body.text) && sent[0].body.text.includes('?pro=plus&billing=yearly'), 'reload off: says so, and links to the yearly Plus plan');
reset();
claim = mail('pro_ended', { planName: 'Elite', tier: 'elite', billing: 'monthly', reason: 'insufficient_points', price: '12,500,000,000', balance: '2,000,000,000', shortfall: '10,500,000,000', endedAt: '2026-10-11T10:30:00Z' });
await ask();
m = sent[0].body;
check(/has ended/.test(m.subject) && m.text.includes('2,000,000,000 points and the renewal costs 12,500,000,000 points (10,500,000,000 points short)'), 'ended: the reason, in words');
check(m.html.includes('?pro=elite&amp;billing=monthly') && m.html.includes('Pay with NOOB Points') && m.html.includes('exact plan'), 'ended: a button straight to that plan\'s payment page');
reset();
claim = mail('pro_ended', { planName: 'Elite', tier: 'elite', billing: 'monthly', reason: 'auto_renew_off', price: '12,500,000,000', balance: '2,000,000,000', shortfall: '10,500,000,000', endedAt: '2026-10-11T10:30:00Z' });
await ask();
check(/Reload Monthly was turned off/.test(sent[0].body.text), 'ended because reloading was off: says that');

section('6. Safety');
reset();
claim = mail('pro_upgraded', { planName: '<script>alert(1)</script>', tier: 'starter', billing: 'monthly', perks: ['<img src=x onerror=alert(1)>'], common: [], listPrice: '1', pricePaid: '1', walletAfter: '0', startedAt: '2026-10-11T10:30:00Z', renewsAt: '2026-11-10T10:30:00Z', autoRenew: true, renewalPrice: '1', method: 'wallet' }, { name: '<b>Evil</b>' });
await ask();
m = sent[0].body;
check(!m.html.includes('<script>') && !m.html.includes('<img src=x') && !m.html.includes('<b>Evil</b>') && m.html.includes('&lt;script&gt;'), 'names and texts are escaped, nothing a person typed can inject HTML');
reset();
resendOk = false;
claim = mail('pro_ended', { planName: 'Elite', tier: 'elite', billing: 'monthly', reason: 'auto_renew_off', price: '1', balance: '0', shortfall: '1', endedAt: '2026-10-11T10:30:00Z' });
r = await ask();
check(r.json.sent === false && done.length === 1 && done[0].p_ok === false && /500/.test(done[0].p_error || ''), 'if the email service fails, the database is told so (it will try again)');
reset();
claim = mail('something_new', {});
r = await ask();
check(r.status === 400 && done.length === 1 && done[0].p_ok === false && sent.length === 0, 'an unknown kind is reported, not sent');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
