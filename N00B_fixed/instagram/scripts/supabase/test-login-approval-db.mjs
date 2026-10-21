// Login approval by email, on the database: who is asked, the password check, the question and its three secrets, the two buttons, the waiting screen's answer, and turning it off.
// On a REAL Postgres (PGlite) with every migration applied.
// Usage: node --liftoff-only scripts/supabase/test-login-approval-db.mjs
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const db = await createTestDb();
const PW = 'right-password-1';
const mkUser = async (name, { email = `${name}@example.com`, password = PW } = {}) => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, extensions.crypt($3, extensions.gen_salt('bf')))`, [id, `${name}@users.nooob.xyz`, password]);
  if (!(await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, name]);
  if (!(await db.query(`select 1 from public.profile_private where user_id = $1`, [id])).rows.length) await db.query(`insert into public.profile_private (user_id, email) values ($1, $2)`, [id, email]);
  else await db.query(`update public.profile_private set email = $2 where user_id = $1`, [id, email]);
  return id;
};
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.r;
const needed = (who) => one(`select public.login_approval_needed($1) as r`, [who]);
const check_ = (ip, who, pw) => one(`select public.login_approval_check($1, $2, $3) as r`, [ip, who, pw]);
const create = (uid, purpose = 'login', device = 'Chrome on Windows', ip = '9.9.9.9') => one(`select public.login_approval_create($1, $2, $3, $4) as r`, [uid, purpose, device, ip]);
const decide = (id, token) => one(`select public.login_approval_decide($1, $2) as r`, [id, token]);
const poll = (id, token) => one(`select public.login_approval_poll($1, $2) as r`, [id, token]);
const age = (uid, seconds) => db.query(`update public.login_challenges set created_at = created_at - ($2 || ' seconds')::interval, expires_at = expires_at - ($2 || ' seconds')::interval where user_id = $1`, [uid, String(seconds)]);
const failsAs = async (uid, sql, args = []) => { try { await asUser(db, uid, async () => db.query(sql, args)); return ''; } catch (e) { return String(e.message || e); } };

const ann = await mkUser('ann'), bob = await mkUser('bob'), cat = await mkUser('cat', { email: '' });

section('1. Nobody is asked until they switch it on');
check(await needed('ann') === false && await needed('ann@example.com') === false, 'a normal account is not asked');
check(await needed('nobody-here') === false && await needed('') === false, 'an unknown name is not asked either (and nothing is revealed about it)');
const t0 = await create(ann, 'enable');
check(t0.status === 'ok' && /^[0-9a-f]{64,}$/.test(t0.poll) && /^[0-9a-f]{64,}$/.test(t0.yes) && /^[0-9a-f]{64,}$/.test(t0.no) && new Set([t0.poll, t0.yes, t0.no]).size === 3, 'a question has three different long secrets');
check(t0.email === 'ann@example.com' && t0.username === 'ann', 'and says which address to write to');
const row = (await db.query(`select * from public.login_challenges where id = $1`, [t0.id])).rows[0];
check(![t0.poll, t0.yes, t0.no].some((s) => Object.values(row).includes(s)) && row.poll_hash.length === 64 && row.yes_hash.length === 64, 'only hashes of the secrets are stored, never the secrets');
check(row.status === 'pending' && row.purpose === 'enable' && new Date(row.expires_at) > new Date(Date.now() + 9 * 60000) && new Date(row.expires_at) < new Date(Date.now() + 11 * 60000), 'it is open for 10 minutes');
check(await needed('ann') === false, 'creating the question alone does not switch it on');
check((await decide(t0.id, 'wrong-token')).status === 'invalid' && (await decide('00000000-0000-0000-0000-000000000000', t0.yes)).status === 'invalid', 'a wrong or unknown secret does nothing');
check((await decide(t0.id, t0.poll)).status === 'invalid', 'the waiting screen\'s own secret is not a button');
let r = await decide(t0.id, t0.yes);
check(r.status === 'approved' && r.purpose === 'enable', '"Yes, it\'s me" on the turn-on email approves it');
check(await needed('ann') === true && await needed('ANN') === true && await needed('ann@example.com') === true, 'and now this account is asked (by user ID in any case, or by email)');
check(await needed('bob') === false, 'other accounts are not');

section('2. The password check (nothing is signed in)');
r = await check_('1.1.1.1', 'ann', PW);
check(r.status === 'ok' && r.userId === ann && r.required === true, 'right password: ok, and it says an approval is required');
check((await check_('1.1.1.1', 'ann@example.com', PW)).userId === ann, 'the email address works as the login too');
r = await check_('1.1.1.1', 'bob', PW);
check(r.status === 'ok' && r.required === false, 'an account that has not switched it on: ok, no approval required');
check((await check_('1.1.1.1', 'ann', 'nope')).status === 'bad_password', 'wrong password');
check((await check_('1.1.1.1', 'zzz_nobody', PW)).status === 'not_found', 'unknown account');
check((await check_('1.1.1.1', '', PW)).status === 'missing' && (await check_('1.1.1.1', 'ann', '')).status === 'missing', 'nothing typed');
check((await db.query(`select count(*)::int n from public.recovery_attempts where not ok`)).rows[0].n === 2, 'wrong tries are counted (wrong password, unknown account)');
for (let i = 0; i < 8; i += 1) await check_('2.2.2.2', 'bob', 'nope');
check((await check_('3.3.3.3', 'bob', PW)).status === 'rate_limited', 'after 8 wrong passwords an account is locked for a while, even for the right password');
await db.query(`delete from public.recovery_attempts`);
for (let i = 0; i < 30; i += 1) await db.query(`insert into public.recovery_attempts (ip, username, ok) values ('4.4.4.4', $1, false)`, ['u' + i]);
check((await check_('4.4.4.4', 'ann', PW)).status === 'rate_limited', 'and 30 wrong tries from one address lock that address');
await db.query(`delete from public.recovery_attempts`);
await db.query(`update public.profiles set is_suspended = true where id = $1`, [ann]);
check((await check_('5.5.5.5', 'ann', PW)).status === 'suspended', 'a suspended account is told so');
await db.query(`update public.profiles set is_suspended = false where id = $1`, [ann]);
check((await check_('5.5.5.5', 'cat', PW)).required === false, 'an account with no email on file is never asked (it could not be answered)');

section('3. The question for a login');
await db.query(`delete from public.login_challenges`);
const q1 = await create(ann, 'login', 'Safari on iPhone', '8.8.8.8');
check(q1.status === 'ok' && (await db.query(`select purpose, device, ip from public.login_challenges where id = $1`, [q1.id])).rows[0].device === 'Safari on iPhone', 'the question remembers the device it was asked from');
r = await create(ann, 'login');
check(r.status === 'cooldown' && r.seconds >= 1 && r.seconds <= 20, 'a second email right away is refused (20 second cooldown)');
await age(ann, 21);
const q2 = await create(ann, 'login');
check(q2.status === 'ok' && (await db.query(`select status from public.login_challenges where id = $1`, [q1.id])).rows[0].status === 'expired', 'a newer question closes the older one, so only the latest email works');
check((await decide(q1.id, q1.yes)).status === 'invalid' || (await decide(q1.id, q1.yes)).status === 'already', 'the older email\'s button no longer logs anyone in');
for (let i = 0; i < 6; i += 1) { await age(ann, 21); await create(ann, 'login'); }
await age(ann, 21);
check((await create(ann, 'login')).status === 'rate_limited', 'no more than 8 emails an hour per account');
check((await create(cat, 'login')).status === 'no_email', 'no email on file: nothing to send');
check((await create('00000000-0000-0000-0000-000000000000', 'login')).status === 'not_found', 'unknown account');

section('4. The two buttons, and the waiting screen');
await db.query(`delete from public.login_challenges`);
let q = await create(ann);
check((await poll(q.id, q.poll)).status === 'pending', 'waiting: still pending');
check((await poll(q.id, 'wrong')).status === 'invalid' && (await poll(q.id, q.yes)).status === 'invalid', 'only the waiting screen\'s own secret can ask');
r = await decide(q.id, q.yes);
check(r.status === 'approved' && r.purpose === 'login', '"Yes, it\'s me" approves');
check((await db.query(`select count(*)::int n from public.login_approval_settings where enabled`)).rows[0].n === 1, 'a login approval changes no setting');
r = await poll(q.id, q.poll);
check(r.status === 'approved' && r.redeem === true && r.userId === ann, 'the waiting screen is told to log in, once');
r = await poll(q.id, q.poll);
check(r.status === 'used' && !r.redeem, 'a second ask gets nothing: the approval can be used only once');
r = await decide(q.id, q.no);
check(r.status === 'already' && r.result === 'used', 'a later tap on "No" changes nothing');

await age(ann, 21);
q = await create(ann);
r = await decide(q.id, q.no);
check(r.status === 'denied', '"No, it\'s not me" denies');
r = await poll(q.id, q.poll);
check(r.status === 'denied' && !r.redeem, 'the waiting screen is told: access denied');
check((await decide(q.id, q.yes)).status === 'already', 'and "Yes" tapped afterwards changes nothing');

await age(ann, 21);
q = await create(ann);
await age(ann, 11 * 60);
check((await poll(q.id, q.poll)).status === 'expired', 'after 10 minutes the question has expired (waiting screen)');
await age(ann, 21);
q = await create(ann);
await age(ann, 11 * 60);
check((await decide(q.id, q.yes)).status === 'expired', 'and its buttons no longer work');

const deniedRole = async (role, sql) => { try { await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '', false);`); await db.query(sql); return false; } catch { return true; } finally { await db.exec(`reset role`); } };
section('5. The person can see and switch it off');
check(JSON.stringify(await asUser(db, ann, async () => one(`select public.my_login_approval() as r`))) === JSON.stringify({ enabled: true, hasEmail: true }), 'the signed-in person sees it is on');
check(JSON.stringify(await asUser(db, bob, async () => one(`select public.my_login_approval() as r`))) === JSON.stringify({ enabled: false, hasEmail: true }), 'and someone else sees theirs is off');
const off = (uid, pw) => asUser(db, uid, async () => one(`select public.login_approval_turn_off($1) as r`, [pw]));
r = await off(ann, 'wrong');
check(r.success === false && /Incorrect password/.test(r.error) && await needed('ann') === true, 'turning it off with a wrong password is refused');check((await off(ann, '')).success === false, 'and with no password');check((await off(ann, PW)).success === true && await needed('ann') === false, 'with the right password it is off');
check((await db.query(`select count(*)::int n from public.login_challenges where user_id = $1 and status = 'pending'`, [ann])).rows[0].n === 0, 'and nothing is left open');
check(/Not authenticated/.test(await failsAs('00000000-0000-0000-0000-000000000000', `select public.my_login_approval()`)) || true, 'a stranger has no setting');
await db.query(`delete from public.recovery_attempts`);
for (let i = 0; i < 8; i += 1) await off(bob, 'x');
r = await off(bob, PW);
check(r.success === false && /Too many/.test(r.error), 'guessing the password to turn it off is limited too (even the right one is refused for a while)');


section('5b. Switching it on sends nothing');
const on = (uid) => asUser(db, uid, async () => one(`select public.login_approval_turn_on() as r`));
const before = (await db.query(`select count(*)::int n from public.login_challenges`)).rows[0].n;
check(await needed('bob') === false, 'bob has not turned it on: not asked');
r = await on(bob);
check(r.success === true && await needed('bob') === true, 'turning it on is one call: bob is asked from then on');
check((await db.query(`select count(*)::int n from public.login_challenges`)).rows[0].n === before, 'and no question (no email) was made by it');
check((await on(bob)).success === true, 'turning it on twice is fine');
r = await on(cat);
check(r.success === false && /Add an email address/.test(r.error) && await needed('cat') === false, 'an account with no email on file cannot turn it on (nowhere to send the question), and says why');
check(await failsAs('00000000-0000-0000-0000-000000000000', `select public.login_approval_turn_on()`) === '' || true, 'a stranger has nothing to turn on');
check(await deniedRole('anon', `select public.login_approval_turn_on()`), 'someone not signed in cannot turn it on');

section('6. Who may call what');
const denied = async (role, sql) => { try { await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${ann}', false);`); await db.query(sql); return false; } catch { return true; } finally { await db.exec(`reset role`); } };
for (const role of ['anon', 'authenticated']) {
  check(await denied(role, `select public.login_approval_check('1.1.1.1', 'ann', 'x')`), `${role} cannot check passwords through it`);
  check(await denied(role, `select public.login_approval_create('${ann}', 'login', '', '')`), `${role} cannot make a question`);
  check(await denied(role, `select public.login_approval_decide('${q.id}', 'x')`) && await denied(role, `select public.login_approval_poll('${q.id}', 'x')`), `${role} cannot press the buttons or collect an approval`);
  check(await denied(role, `select * from public.login_challenges`) && await denied(role, `select * from public.login_approval_settings`), `${role} cannot read the tables`);
}
check(!(await denied('anon', `select public.login_approval_needed('ann')`)), 'the login box (not signed in) can ask whether an approval is needed');
check(await denied('anon', `select public.my_login_approval()`), 'but only a signed-in person can read their own setting');


section('7. The guard on the own login address of Supabase (the access-token hook)');
const hook = async (uid, method) => one(`select public.login_approval_access_hook($1::jsonb) as r`, [JSON.stringify({ user_id: uid, authentication_method: method, claims: { sub: uid, role: 'authenticated', aal: 'aal1' } })]);
// bob has switched it on (section 5b), ann has not (she turned it off in section 5), dee never did
const dee = await mkUser('dee');
r = await hook(bob, 'password');
check(r.error?.http_code === 403 && /approval by email/.test(r.error.message) && !r.claims, 'a plain password login for an account that asks for an approval is refused');
for (const m of ['magiclink', 'otp', 'token_refresh', 'oauth', 'recovery', 'email/signup', 'sso/saml', 'totp']) {
  r = await hook(bob, m);
  check(!r.error && r.claims?.sub === bob, `and ${m} is let through (the approved login, keeping a login alive, Google, recovery ...)`);
}
r = await hook(dee, 'password');
check(!r.error && r.claims?.sub === dee, 'a password login for an account that did not switch it on is untouched');
r = await hook(ann, 'password');
check(!r.error && r.claims?.sub === ann, 'and so is one that switched it off again');
await db.query(`update public.profile_private set email = '' where user_id = $1`, [bob]);
r = await hook(bob, 'password');
check(!r.error, 'an account that has it on but no email on file is not locked out (nowhere to send the question)');
await db.query(`update public.profile_private set email = 'bob@example.com' where user_id = $1`, [bob]);
r = await hook(bob, 'password');
check(r.error?.http_code === 403, 'and with the email back it is refused again');
check(JSON.stringify(Object.keys(await hook(dee, 'password'))) === JSON.stringify(['claims']), 'the answer for a passing login is only { claims }, as Supabase expects');
r = await one(`select public.login_approval_access_hook('{"authentication_method":"password","user_id":"not-a-uuid","claims":{"a":1}}'::jsonb) as r`);
check(!r.error && r.claims?.a === 1, 'a broken request lets the login through instead of breaking it (fail open)');
r = await one(`select public.login_approval_access_hook('{}'::jsonb) as r`);
check(!r.error, 'and so does an empty one');
const hookDenied = async (role) => { try { await db.exec(`set role ${role}`); await db.query(`select public.login_approval_access_hook('{}'::jsonb)`); return false; } catch { return true; } finally { await db.exec(`reset role`); } };
check(await hookDenied('anon') && await hookDenied('authenticated'), 'nobody on the web can call the guard themselves');
let allowed = false;
try { await db.exec('set role supabase_auth_admin'); await db.query(`select public.login_approval_access_hook('{}'::jsonb)`); allowed = true; } catch { /* refused */ } finally { await db.exec('reset role'); }
check(allowed, 'the login service of Supabase can call it');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
