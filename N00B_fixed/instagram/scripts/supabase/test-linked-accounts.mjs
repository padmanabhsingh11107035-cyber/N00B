// Tests migration 20261014000012: (1) the verified badge price, kept in one place and charged exactly as the app shows it (500 million for good, 50 million a month);
// (2) "Switch account" listing the person's OTHER accounts (same email or same mobile number), showing only public details, never someone else's.
// On a REAL Postgres (PGlite) with every migration applied.
//
// Usage: node scripts/supabase/test-linked-accounts.mjs
import fs from 'node:fs';
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const expectFail = async (fn, pattern, label) => {
  try { await fn(); check(false, label, '(expected an error, but it succeeded)'); }
  catch (e) { check(pattern.test(e.message), label, `(got: ${e.message})`); }
};
const section = (t) => console.log(`\n${t}`);

const db = await createTestDb();
const mkUser = async (name, { email, mobile, country = '+91 (IN)', suspended = false, points = 0 } = {}) => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, extensions.crypt('pw123456', extensions.gen_salt('bf')))`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, name]);
  await db.query(`update public.profiles set is_suspended = $2, noob_points = $3 where id = $1`, [id, suspended, points]);
  await db.query(`insert into public.profile_private (user_id, email, country_code, mobile_number) values ($1, $2, $3, $4) on conflict (user_id) do update set email = $2, country_code = $3, mobile_number = $4`, [id, email ?? null, country, mobile ?? null]);
  return id;
};
const rpc = (uid, fn, ...args) => asUser(db, uid, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);
const names = (rows) => rows.map((r) => r.username).sort().join();

section('1. The price lives in one place');
check((await db.query(`select public.verify_badge_price('points_permanent')::text p, public.verify_badge_price('points_monthly')::text m, public.verify_badge_price('x') n`)).rows[0].p === '500000000', 'the permanent badge is 500,000,000 points (500 million)');
{
  const r = (await db.query(`select public.verify_badge_price('points_monthly')::text m, public.verify_badge_price('x') n`)).rows[0];
  check(r.m === '50000000' && r.n === null, 'the monthly badge is 50,000,000 points (50 million); anything else has no price');
}
const poor = await mkUser('poor', { points: 40_000_000 });
const mid = await mkUser('mid', { points: 60_000_000 });
const rich = await mkUser('rich', { points: 600_000_000 });
const prices = await rpc(poor, 'verify_badge_prices');
check(prices.permanent === 500000000 && prices.monthly === 50000000, 'the screen can ask the database for the two prices', JSON.stringify(prices));
await expectFail(() => rpc(poor, 'verify_account', 'pw123456', 'points_monthly'), /You have 40,000,000, but 50,000,000 points are required for monthly verification/, '40 million is not enough for the monthly badge');
await expectFail(() => rpc(mid, 'verify_account', 'pw123456', 'points_permanent'), /You have 60,000,000, but 500,000,000 points are required for permanent verification/, '60 million is not enough for the permanent badge');
const vm = await rpc(mid, 'verify_account', 'pw123456', 'points_monthly');
check(vm.success && vm.user.isVerified && vm.user.noobPoints === 10_000_000, 'the monthly badge takes exactly 50 million');
const vp = await rpc(rich, 'verify_account', 'pw123456', 'points_permanent');
check(vp.success && vp.user.isVerified && vp.user.noobPoints === 100_000_000, 'the permanent badge takes exactly 500 million');
await expectFail(() => asAnon(db, async () => db.query(`select public.verify_badge_prices()`)), /permission|denied|not authenticated/i, 'a visitor who is not signed in can not call it');

section('2. The app and the database agree');
const ui = fs.readFileSync('src/utils/verifyPrice.ts', 'utf8');
check(/permanent: 500_000_000/.test(ui) && /monthly: 50_000_000/.test(ui), 'the app uses the same two numbers');
const modal = fs.readFileSync('src/components/Profile/GetVerifiedModal.tsx', 'utf8').split(String.fromCharCode(13)).join('');
check(!/100M|10_000_000_000_000|5_000_000_000|50,000 NOOB|50k/.test(modal), 'no old number is left on the verify screens');
check(/shortPoints\(POINTS_PRICE\.points_perm\)\} NOOB Points \(Permanent\)/.test(modal) && /shortPoints\(POINTS_PRICE\.points_month\)\} NOOB Points \/ Month/.test(modal), 'the plan cards say 500M permanent and 50M a month');
check(/\$\{shortPoints\(POINTS_PRICE\.points_perm\)\} Permanent Points Plan/.test(modal) && /\$\{shortPoints\(POINTS_PRICE\.points_month\)\} Monthly Points Plan/.test(modal) && /POINTS_PRICE\[selectedOption\]\.toLocaleString\(\)/.test(modal), 'and the payment page shows the same numbers');
const handler = fs.readFileSync('supabase/functions/dynamic-handler/index.ts', 'utf8');
check(/monthly badge 50,000,000 points[^)]*permanent badge 500,000,000 points/.test(handler) && !/10,000,000,000,000 points/.test(handler), 'the support assistant quotes the same prices');

section('3. Switch account: the person\'s other accounts');
const me = await mkUser('padmanabh', { email: 'Pad@Example.com', mobile: '9876543210' });
const sameEmail = await mkUser('pad_email', { email: 'pad@example.com ', mobile: '1111111111' });
const sameMobile = await mkUser('pad_phone', { email: 'other@example.com', mobile: '+91 98765-43210', country: '+91 (IN)' });
const both = await mkUser('pad_both', { email: 'pad@example.com', mobile: '98765 43210' });
const stranger = await mkUser('stranger', { email: 'stranger@example.com', mobile: '5555555555' });
const gone = await mkUser('pad_banned', { email: 'pad@example.com', mobile: '9876543210', suspended: true });
const list = await rpc(me, 'my_linked_accounts');
check(names(list) === 'pad_both,pad_email,pad_phone', 'the same email OR the same mobile number (any spacing or +91) is listed', names(list));
check(!list.some((a) => a.id === me), 'the account itself is not in its own list');
check(!list.some((a) => a.id === stranger) && !list.some((a) => a.id === gone), 'a stranger and a suspended account are not listed');
check(Object.keys(list[0]).sort().join() === 'avatar,displayName,id,isVerified,username', 'only public details are returned (no email, no number)', Object.keys(list[0]).join());
const other = await rpc(sameEmail, 'my_linked_accounts');
check(names(other) === 'pad_both,padmanabh', 'from another account the list is its own direct matches (same email or number as THAT account), not a chain through a third one', names(other));
check((await rpc(stranger, 'my_linked_accounts')).length === 0, 'someone with no other account sees nothing');
const nothing = await mkUser('nothing', { email: '', mobile: '' });
const twin = await mkUser('twin', { email: '', mobile: '' });
check((await rpc(nothing, 'my_linked_accounts')).length === 0, 'an empty email or number never links two accounts together');
const shortNo = await mkUser('short_a', { email: 'a1@example.com', mobile: '123' });
await mkUser('short_b', { email: 'b1@example.com', mobile: '123' });
check((await rpc(shortNo, 'my_linked_accounts')).length === 0, 'a mobile number that is too short is not used to link accounts');
await expectFail(() => asAnon(db, async () => db.query(`select public.my_linked_accounts()`)), /permission|denied|not authenticated|log in/i, 'a visitor who is not signed in gets nothing');

section('4. The Switch account screen');
const sw = fs.readFileSync('src/components/Modals/SwitchAccountModal.tsx', 'utf8').split(String.fromCharCode(13)).join('');
check(/fetchLinkedAccounts\(\)/.test(sw) && /data-testid="linked-accounts"/.test(sw) && /Your other accounts/.test(sw), 'it lists the other accounts');
check(/linked\.filter\(\(l\) => !accounts\.some\(\(a\) => a\.id === l\.id\)\)/.test(sw), 'only the ones this device does not have yet need a password; the saved ones switch straight away');
check(/type="password"/.test(sw) && /signInLinkedAccount\(acct\.username, password\)/.test(sw) && /tabSessions\.switchTo\(res\.id\)/.test(sw), 'the password is asked once, then the tab switches to the account');
const api = fs.readFileSync('src/services/supabaseApi.ts', 'utf8').split(String.fromCharCode(13)).join('');
const fn = api.slice(api.indexOf('export async function signInLinkedAccount'), api.indexOf('export async function verifyUsernameExists'));
check(/createIsolatedClient\(\)/.test(fn) && /tabSessions\.write\(JSON\.stringify\(session\)\)/.test(fn), 'the sign-in uses a separate client, so the account in this tab is untouched, and the login is saved for good');
check(!/localStorage|setItem\([^)]*password/.test(fn), 'the password itself is never stored');
check(/keys\.ensure\(session\.user\.id, password\)/.test(fn), 'chat keys are picked up with the password, like a normal login');
const tabs = fs.readFileSync('src/services/tabSessions.ts', 'utf8');
check(/if \(!mine \|\| !hasSlot\(mine\) \|\| mine === id\) bind\(id\);/.test(tabs), 'saving the new login does not move this tab away from its account');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
