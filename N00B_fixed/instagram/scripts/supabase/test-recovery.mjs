// Tests for the account-recovery check (migration 7) on a real Postgres holding the real backup.
// Usage: node scripts/supabase/test-recovery.mjs [backup-folder]
import fs from 'node:fs';
import path from 'node:path';
import { loadBackup, buildImportPlan } from './transform.mjs';
import { runImport } from './run-import.mjs';
import { createTestDb, makePgAdapter, asUser, asAnon } from './pg-test-env.mjs';

const backupsRoot = 'backups';
const dir = process.argv.slice(2).find((x) => !x.startsWith('--')) || path.join(backupsRoot, fs.readdirSync(backupsRoot).filter((d) => fs.existsSync(path.join(backupsRoot, d, 'users.json'))).sort().pop());
const raw = loadBackup(dir);
let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);

const db = await createTestDb();
await runImport(buildImportPlan(raw, {}), makePgAdapter(db), { log: () => {} });

const person = (await db.query(`select p.id, p.username, pp.email, pp.mobile_number, pp.date_of_birth::text dob
  from profiles p join profile_private pp on pp.user_id = p.id
  where coalesce(pp.email, '') <> '' and coalesce(pp.mobile_number, '') <> '' and pp.date_of_birth is not null and not p.is_suspended limit 1`)).rows[0];
const phoneDigits = person.mobile_number.replace(/\D/g, '');
const call = async (ip, user, mobile, dob, email) => (await db.query('select public.recovery_check($1,$2,$3,$4,$5) r', [ip, user, mobile, dob, email])).rows[0].r;
const good = () => call('1.1.1.1', person.username, phoneDigits, person.dob, person.email);
const reset = () => db.query('delete from recovery_attempts');

section('1. Proving who you are');
let r = await good();
check(r.status === 'ok' && r.userId === person.id, 'the right username, mobile, date of birth and email are accepted');
check((await call('1.1.1.1', ` ${person.username.toUpperCase()} `, phoneDigits, person.dob, `  ${person.email.toUpperCase()} `)).status === 'ok', 'capital letters and spaces around the username and email do not matter');
check((await call('1.1.1.1', person.username, `+91 (${phoneDigits.slice(-10, -5)}) ${phoneDigits.slice(-5)}`, person.dob, person.email)).status === 'ok', 'the mobile number can be typed with spaces, brackets or a country code');
check((await call('1.1.1.1', person.username, phoneDigits, person.dob + 'T00:00:00.000Z', person.email)).status === 'ok', 'a full timestamp for the date of birth is fine');
for (const [label, args] of [
  ['a wrong email', [person.username, phoneDigits, person.dob, 'nobody@example.com']],
  ['a wrong mobile number', [person.username, '1234567890', person.dob, person.email]],
  ['a wrong date of birth', [person.username, phoneDigits, '1990-01-01', person.email]],
  ['a date that is not a date', [person.username, phoneDigits, 'yesterday-ish', person.email]]
]) {
  const x = await call('2.2.2.2', ...args);
  check(x.status === 'mismatch' && Object.keys(x).length === 1, `${label} gets the same generic "no match" answer (never says which detail was wrong)`);
}
check((await call('3.3.3.3', 'zzz_no_such_user', '1', '2000-01-01', 'a@b.c')).status === 'not_found', 'an unknown username is reported');
check((await call('3.3.3.3', '   ', '1', '2000-01-01', 'a@b.c')).status === 'missing_username', 'no username is reported');
check((await call('3.3.3.3', person.username, '', person.dob, person.email)).status === 'missing' && (await call('3.3.3.3', person.username, phoneDigits, '', person.email)).status === 'missing' && (await call('3.3.3.3', person.username, phoneDigits, person.dob, '  ')).status === 'missing', 'a missing detail is reported');
check((await call('3.3.3.3', person.username, '0000000000', person.dob, person.email)).status === 'mismatch', 'a phone number that only shares zeros does not match');

section('2. Suspended accounts');
await db.query('update profiles set is_suspended = true where id = $1', [person.id]);
await db.query(`update profile_private set suspended_reason = 'spamming' where user_id = $1`, [person.id]);
const sus = await good();
check(sus.status === 'suspended' && sus.reason === 'spamming', 'a suspended account can not recover access; the reason is passed along');
await db.query('update profiles set is_suspended = false where id = $1', [person.id]);

section('3. Guessing is limited');
await reset();
for (let i = 0; i < 8; i++) await call('9.9.9.9', person.username, phoneDigits, '1990-01-01', person.email);
check((await good()).status === 'rate_limited', 'after 8 wrong tries for one username, even the right answer is refused for an hour');
check((await call('8.8.8.8', 'other_user_x', '1', '2000-01-01', 'a@b.c')).status === 'not_found', 'other usernames are not affected');
await db.query(`update recovery_attempts set created_at = now() - interval '61 minutes'`);
check((await good()).status === 'ok', 'an hour later it works again');
await reset();
for (let i = 0; i < 30; i++) await call('7.7.7.7', 'nobody_' + i, '1', '2000-01-01', 'a@b.c');
check((await call('7.7.7.7', person.username, phoneDigits, person.dob, person.email)).status === 'rate_limited', 'one device/network making 30 wrong guesses is blocked (whatever usernames it tries)');
check((await call('6.6.6.6', person.username, phoneDigits, person.dob, person.email)).status === 'ok', '...but another device is not');
await reset();
for (let i = 0; i < 20; i++) await good();
check((await good()).status === 'ok', 'successful recoveries do not count against you');
await db.query(`insert into recovery_attempts (ip, username, created_at) values ('x', 'old', now() - interval '3 days')`);
await call('1.1.1.1', 'x_x_x', '1', '2000-01-01', 'a@b.c');
check((await db.query(`select count(*)::int n from recovery_attempts where username = 'old'`)).rows[0].n === 0, 'old attempts are cleaned up');

section('4. Who can call it');
for (const [label, run] of [
  ['a signed-in user', () => asUser(db, person.id, () => db.query(`select public.recovery_check('1', 'x', '1', '2000-01-01', 'a@b.c')`))],
  ['a logged-out visitor', () => asAnon(db, () => db.query(`select public.recovery_check('1', 'x', '1', '2000-01-01', 'a@b.c')`))]
]) {
  try { await run(); check(false, `${label} can not call the recovery check`, '(it succeeded)'); } catch (e) { check(/permission denied/.test(e.message), `${label} can not call the recovery check`, e.message); }
}
for (const [label, run] of [
  ['a signed-in user', () => asUser(db, person.id, () => db.query('select * from recovery_attempts'))],
  ['a logged-out visitor', () => asAnon(db, () => db.query('select * from recovery_attempts'))]
]) {
  try { await run(); check(false, `${label} can not read the attempts list`, '(it succeeded)'); } catch (e) { check(/permission denied/.test(e.message), `${label} can not read the attempts list`, e.message); }
}
await db.query('set role service_role');
try { check((await db.query(`select public.recovery_check('1', 'x_none', '1', '2000-01-01', 'a@b.c') r`)).rows[0].r.status === 'not_found', 'the Edge Function (service key) can call it'); }
finally { await db.query('reset role'); }

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
