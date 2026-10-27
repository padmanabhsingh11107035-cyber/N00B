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
const ACCOUNT = '9b2f6c1e-1111-4222-8333-444455556666';
const mail = (kind, payload, extra = {}) => ({ claimed: true, id: ID, kind, payload, email: 'ann@example.com', name: 'Ann', username: 'ann', userId: ACCOUNT, related: null, ...extra });

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
check(m.html.includes('Paid together with your friend @paul') && m.html.includes('2,000,000,000 points') && m.html.includes('3,000,000,000 points') && m.html.includes('Your own part') && /@paul helped you/.test(m.text), 'the receipt shows who paid and the two parts');
reset();
claim = mail('pro_upgraded', { planName: 'Starter', tier: 'starter', billing: 'monthly', perks: [], common: [], listPrice: '5,000,000,000', pricePaid: '5,000,000,000', walletAfter: '0', startedAt: '2026-10-11T10:30:00Z', renewsAt: '2026-11-10T10:30:00Z', autoRenew: true, renewalPrice: '5,000,000,000', method: 'friend', paidBy: { username: 'paul', amount: '5,000,000,000' } },
  { related: { id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', username: 'paul', name: 'Paul Mehta', requestId: '12345678-9abc-4def-8123-456789abcdef', requestedAt: '2026-10-11T09:00:00Z' } });
await ask();
m = sent[0].body;
for (const needle of ['Paid in full by your friend Paul Mehta (@paul)', 'Paul Mehta (@paul)', '@paul', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', 'REQ-12345678', '11 Oct 2026', 'Paid by a friend']) {
  check(m.html.includes(needle) && (needle === 'Paid by a friend' || m.text.includes(needle)), `a friend paid in full: the receipt says "${needle}"`);
}
check(m.subject.includes('NOOB Pro Starter') && m.html.includes('They paid') && m.html.includes('5,000,000,000 points'), 'and the amount the friend paid');
reset();
claim = mail('pro_gift_receipt', { friend: 'rita', planName: 'Starter', billing: 'monthly', amount: '5,000,000,000', planPrice: '5,000,000,000', partial: false, at: '2026-10-11T10:30:00Z', walletAfter: '25,000,000,000' });
await ask();
check(/@rita's NOOB Pro/.test(sent[0].body.subject) && sent[0].body.html.includes('You paid') && sent[0].body.text.includes('full price'), 'the friend who paid gets a receipt too');
reset();
claim = mail('pro_gift_receipt', { friend: 'rita', planName: 'Starter', billing: 'monthly', amount: '2,000,000,000', planPrice: '5,000,000,000', partial: true, at: '2026-10-11T10:30:00Z', walletAfter: '25,000,000,000' },
  { related: { id: 'ffffffff-0000-4000-8000-111111111111', username: 'rita', name: 'Rita Shah' } });
await ask();
m = sent[0].body;
check(m.html.includes('Rita Shah (@rita)') && m.html.includes('ffffffff-0000-4000-8000-111111111111') && m.html.includes('Their own part') && m.html.includes('3,000,000,000 points') && m.text.includes('the rest from their own wallet'), 'the person who paid sees the friend\'s name, User ID and account ID, and how the price was split');

section('4. The verification badge');
reset();
claim = mail('verified_badge', { label: 'Monthly verification badge', method: 'points_monthly', permanent: false, pricePaid: '5,000,000,000', walletAfter: '1,000,000,000', at: '2026-10-11T10:30:00Z' });
await ask();
m = sent[0].body;
check(/verification badge is active/.test(m.subject) && m.html.includes('Monthly') && m.html.includes('5,000,000,000 points') && m.html.includes('1,000,000,000 points'), 'badge receipt: type, price and balance');

section('4b. Verified by the NOOB team');
reset();
claim = mail('verified_by_admin', { username: 'ann', at: '2026-10-12T10:30:00Z' });
await ask();
m = sent[0].body;
check(/account is now verified/.test(m.subject) && m.html.includes('@ann') && m.html.includes('The NOOB team') && m.text.includes('verified your account @ann'), 'the verified-by-admin e-mail says who and by whom');
check(!/points|price|paid|wallet/i.test(m.text), 'and carries no payment information (it was a gift)');
reset();
claim = mail('verified_by_admin', { username: 'ann', at: '2026-10-12T10:30:00Z', by: { username: 'noob' } }, { related: { id: '00000000-aaaa-4000-8000-000000000abc', username: 'noob', name: 'NOOB' } });
await ask();
m = sent[0].body;
check(m.html.includes('The NOOB team (NOOB, @noob)') && m.html.includes('00000000-aaaa-4000-8000-000000000abc') && m.html.includes('Free: it was given to you'), 'and says which admin account granted it');

section('4c. NOOB Draw: an email for the grand prizes');
reset();
claim = mail('draw_prize', { prize: 'pro', label: 'NOOB Pro Elite', subtitle: '30 days of Pro', tier: 'elite', days: 30, packName: 'Royal Spin', rarity: 'legendary', paid: true, cost: '1,000,000,000', spinNo: 7, walletAfter: '4,000,000,000', previousTier: 'plus', previousEndsAt: '2026-10-20T10:30:00Z', message: 'Your NOOB Pro plan is active until 11 Nov 2026. It does not renew by itself.', endsAt: '2026-11-11T10:30:00Z', at: '2026-10-12T10:30:00Z' });
await ask();
m = sent[0].body;
check(/^Your NOOB Draw prize: NOOB Pro Elite \(30 days of Pro\)$/.test(m.subject) && !/\p{Extended_Pictographic}|✅/u.test(m.subject) && m.html.includes('Royal Spin') && m.html.includes('11 Nov 2026') && m.text.includes('active until 11 Nov 2026'), 'a NOOB Pro prize: the plan, the days, the spin and the end date');
check(m.html.includes('it ends on that date unless you pay again') && m.text.includes('does not renew by itself') && !/total paid|plan price/i.test(m.text), 'it says the plan does not renew by itself, and is a prize, not a receipt');
for (const needle of ['Paid spin', '1,000,000,000 points', '#7', '4,000,000,000 points', 'NOOB Pro Plus, until 20 Oct 2026', 'NOOB Pro Elite', 'Legendary', 'NOOB Draw']) {
  check(m.html.includes(needle) && m.text.includes(needle), `the source of the win is spelled out: "${needle}"`);
}
reset();
claim = mail('draw_prize', { prize: 'pro', label: 'NOOB Pro Starter', subtitle: '7 days of Pro', tier: 'starter', days: 7, packName: 'Rookie Spin', rarity: 'epic', paid: false, cost: '0', spinNo: 1, walletAfter: '10', message: 'Active.', endsAt: '2026-10-19T10:30:00Z', at: '2026-10-12T10:30:00Z' });
await ask();
m = sent[0].body;
check(m.html.includes('Free spin') && m.text.includes('Cost: Free') && m.text.includes('Plan before: No plan'), 'a free spin says free, with no cost, and that there was no plan before');
reset();
claim = mail('draw_prize', { prize: 'verified', label: 'Verified Tick', subtitle: 'The blue tick, forever', packName: 'Galaxy Spin', message: 'The blue verified tick now shows next to your name everywhere in NOOB.', at: '2026-10-12T10:30:00Z' });
await ask();
m = sent[0].body;
check(/NOOB Draw prize: the Verified Tick/.test(m.subject) && m.html.includes('Galaxy Spin') && m.html.includes('For good') && !m.html.includes('Active until'), 'the verified tick: says it is for good, no end date');
check(done.length === 1 && done[0].p_ok === true, 'the database is told it was sent');
reset();

section('5. "About to end" and "ended" emails open the exact payment page');
reset();
claim = mail('pro_expiring', { planName: 'Starter', tier: 'starter', billing: 'monthly', endsAt: '2026-10-14T10:30:00Z', daysLeft: 3, autoRenew: true, price: '5,000,000,000', balance: '1,000,000,000', shortfall: '4,000,000,000' });
await ask();
m = sent[0].body;
check(/ends in 3 days/.test(m.subject), 'the subject says how long is left', m.subject);
check(m.html.includes('1,000,000,000 points') && m.html.includes('4,000,000,000 points') && m.text.includes('Add 4,000,000,000 more points'), 'it shows the live balance and what is missing');
check(m.html.includes('href="https://noobsocials.com/?pro=starter&amp;billing=monthly"') && m.html.includes('Pay with NOOB Points'), 'the button goes to the payment page of that exact plan, on noobsocials.com (the SITE_URL secret here still says nooob.xyz)');
check(!m.html.includes('nooob.xyz') && !m.text.includes('nooob.xyz'), 'the old address never appears in an email, even though the SITE_URL secret still holds it');
check(m.html.includes('data-noob-footer') && m.html.includes('>noobsocials.com</a>') && m.text.endsWith('NOOB · https://noobsocials.com'), 'every email ends with the NOOB · noobsocials.com line (html and plain text)');
reset();
claim = mail('pro_expiring', { planName: 'Plus', tier: 'plus', billing: 'yearly', endsAt: '2026-10-12T10:30:00Z', daysLeft: 1, autoRenew: false, price: '99,000,000,000', balance: '0', shortfall: '99,000,000,000' });
await ask();
check(/ends tomorrow/.test(sent[0].body.subject) && /Reload Yearly is turned off/.test(sent[0].body.text) && sent[0].body.text.includes('?pro=plus&billing=yearly'), 'reload off: says so (Reload Yearly for a yearly plan), and links to the yearly Plus plan');
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

section('5b. Every email carries the account it belongs to');
for (const [kind, payload] of [
  ['pro_upgraded', { planName: 'Pro', tier: 'pro', billing: 'monthly', perks: [], common: [], listPrice: '1', pricePaid: '1', walletAfter: '0', startedAt: '2026-10-11T10:30:00Z', renewsAt: '2026-11-10T10:30:00Z', autoRenew: false, renewalPrice: '1', method: 'wallet' }],
  ['verified_badge', { label: 'x', pricePaid: '1', walletAfter: '0', at: '2026-10-11T10:30:00Z' }],
  ['verified_by_admin', { username: 'ann', at: '2026-10-11T10:30:00Z' }],
  ['draw_prize', { prize: 'verified', label: 'Verified Tick', packName: 'Galaxy Spin', at: '2026-10-11T10:30:00Z' }],
  ['pro_expiring', { planName: 'Plus', tier: 'plus', billing: 'monthly', endsAt: '2026-10-14T10:30:00Z', daysLeft: 3, autoRenew: true, price: '1', balance: '0', shortfall: '1' }],
  ['pro_ended', { planName: 'Plus', tier: 'plus', billing: 'monthly', reason: 'auto_renew_off', price: '1', balance: '0', shortfall: '1', endedAt: '2026-10-11T10:30:00Z' }],
  ['pro_gift_receipt', { friend: 'rita', planName: 'Plus', billing: 'monthly', amount: '1', planPrice: '1', partial: false, at: '2026-10-11T10:30:00Z', walletAfter: '0' }]
]) {
  reset();
  claim = mail(kind, payload);
  await ask();
  m = sent[0]?.body;
  check(m && m.html.includes('Your account') && m.html.includes('@ann') && m.html.includes(ACCOUNT) && m.html.includes('ann@example.com') && m.text.includes(`Account ID: ${ACCOUNT}`) && m.text.includes('Email address: ann@example.com'), `${kind}: name, User ID, account ID and e-mail address are in the e-mail`);
}
reset();
claim = mail('verified_badge', { label: 'x', pricePaid: '1', walletAfter: '0', at: '2026-10-11T10:30:00Z' });
await ask();
m = sent[0].body;
check(m.html.includes('display:none') && m.html.includes('role="presentation"') && m.html.includes('linear-gradient') && /<a href="https:\/\/noobsocials\.com[^"]*"/.test(m.html), 'the HTML is built for e-mail programs: tables, inline styles, a hidden preview line, a button (to noobsocials.com)');
check(!/\n\n\n/.test(m.text) && m.text.endsWith('— The NOOB team\n\nNOOB · https://noobsocials.com'), 'and the plain-text version is tidy, ending with the signature and the site line');

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

// The login-code, sign-up-code, welcome and account-deleted emails come from the other function (recover-account): same rules, same footer, a button in the welcome email.
const rec = fs.readFileSync(path.join('supabase', 'functions', 'recover-account', 'index.ts'), 'utf8');
check(/const SITE_URL = siteForEmails\(Deno\.env\.get\('SITE_URL'\) \|\| ''\);/.test(rec) && /u\.hostname\.toLowerCase\(\)\.replace\(\/\^www\\\.\/, ''\) !== 'nooob\.xyz'/.test(rec), 'recover-account also never uses the old address, whatever the SITE_URL secret says');
check(/const out = withSiteFooter\(html, text\);/.test(rec) && /text: out\.text, html: out\.html/.test(rec), 'and every one of its emails goes out with the NOOB · noobsocials.com line');
check(/Open NOOB: \$\{SITE_URL\}/.test(rec) && /<a href="\$\{SITE_URL\}"[^>]*>Open NOOB<\/a>/.test(rec), 'the welcome email has an Open NOOB button that opens noobsocials.com');
check(!/https:\/\/nooob\.xyz/.test(rec.replace(/no-reply@nooob\.xyz|users\.nooob\.xyz/g, '')) , 'no email address in it points at the old site');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
