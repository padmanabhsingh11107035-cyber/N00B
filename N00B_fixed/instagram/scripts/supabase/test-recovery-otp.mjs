// Tests for the emailed-OTP account recovery (migration 16) on a real Postgres holding the real backup. This is a SECOND way in,
// alongside the existing security-question check (test-recovery.mjs) — that one is untouched; this only tests the new code path.
// Usage: node scripts/supabase/test-recovery-otp.mjs [backup-folder]
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

const person = (await db.query(`select p.id, p.username, pp.email
  from profiles p join profile_private pp on pp.user_id = p.id
  where coalesce(pp.email, '') <> '' and not p.is_suspended limit 1`)).rows[0];
const noEmailPerson = (await db.query(`select p.id, p.username from profiles p join profile_private pp on pp.user_id = p.id
  where coalesce(pp.email, '') = '' and not p.is_suspended limit 1`)).rows[0];
const request = async (ip, user) => (await db.query('select public.recovery_otp_request($1,$2) r', [ip, user])).rows[0].r;
const verify = async (ip, user, code) => (await db.query('select public.recovery_otp_verify($1,$2,$3) r', [ip, user, code])).rows[0].r;
const reset = () => db.query('delete from recovery_attempts');
const resetCodes = () => db.query('delete from recovery_otps');

section('1. Asking for a code');
await reset(); await resetCodes();
let r = await request('1.1.1.1', person.username);
check(r.status === 'ok' && r.userId === person.id && r.email === person.email && /^\d{6}$/.test(r.code), 'the right account gets a fresh 6-digit code and its own email back');
const stored = (await db.query('select code_hash, attempts, expires_at > now() as live from recovery_otps where user_id = $1', [person.id])).rows[0];
check(stored.live && stored.attempts === 0 && stored.code_hash !== r.code && !stored.code_hash.includes(r.code), 'only a HASH is stored — never the code itself');
check((await request('1.1.1.1', ` ${person.username.toUpperCase()} `)).status === 'cooldown', 'capital letters and spaces around the username still find the same account (and the cooldown below applies to it)');
check((await request('2.2.2.2', 'zzz_no_such_user')).status === 'not_found', 'an unknown username is reported');
check((await request('2.2.2.2', '   ')).status === 'missing_username', 'no username is reported');
if (noEmailPerson) check((await request('2.2.2.2', noEmailPerson.username)).status === 'no_email', 'an account with no email on file is told so (and gets no code)');

section('2. An inbox can not be spammed');
await resetCodes(); await reset();
await request('3.3.3.3', person.username);
check((await request('3.3.3.3', person.username)).status === 'cooldown', 'a second code right away is refused (cooldown)');
await db.query(`update recovery_otps set created_at = now() - interval '46 seconds' where user_id = $1`, [person.id]);
r = await request('3.3.3.3', person.username);
check(r.status === 'ok', 'after the cooldown, a new code can be sent');
await db.query(`update recovery_otps set created_at = now() - interval '46 seconds' where user_id = $1`, [person.id]);
check((await request('3.3.3.3', person.username)).status === 'ok', 'a third code within the hour is still fine');
await db.query(`update recovery_otps set created_at = now() - interval '46 seconds' where user_id = $1`, [person.id]);
check((await request('3.3.3.3', person.username)).status === 'rate_limited', 'a fourth code within the hour is refused, even after its own cooldown has passed');
await db.query(`update recovery_otps set created_at = created_at - interval '61 minutes'`);
check((await request('3.3.3.3', person.username)).status === 'ok', 'an hour after the first of those, sending works again');

section('3. Suspended accounts, and rate limits shared with the security-question check');
await resetCodes(); await reset();
await db.query('update profiles set is_suspended = true where id = $1', [person.id]);
check((await request('4.4.4.4', person.username)).status === 'suspended', 'a suspended account is not sent a code');
check((await verify('4.4.4.4', person.username, '000000')).status === 'suspended', 'nor can a code be checked for it');
await db.query('update profiles set is_suspended = false where id = $1', [person.id]);
for (let i = 0; i < 8; i++) await verify('9.9.9.9', person.username, '000000');
check((await request('9.9.9.9', person.username)).status === 'rate_limited', 'eight wrong verify attempts for a username also block asking for a new code (one shared guess budget)');
await db.query(`update recovery_attempts set created_at = now() - interval '61 minutes'`);

section('4. Checking a code');
await resetCodes(); await reset();
r = await request('5.5.5.5', person.username);
const code = r.code;
const wrong = code === '111111' ? '222222' : '111111';
const w = await verify('5.5.5.5', person.username, ` ${wrong} `);
check(w.status === 'mismatch', 'a wrong code (with stray spaces trimmed off) is refused');
check((await db.query('select attempts from recovery_otps where user_id = $1', [person.id])).rows[0].attempts === 1, 'the wrong try is counted');
const ok = await verify('5.5.5.5', person.username, code);
check(ok.status === 'ok' && ok.userId === person.id, 'the right code is accepted');
check((await db.query('select count(*)::int n from recovery_otps where user_id = $1', [person.id])).rows[0].n === 0, 'and it can not be used twice (it is thrown away right away)');
check((await verify('5.5.5.5', person.username, code)).status === 'expired', 'trying the same code again finds nothing to check it against');

section('5. Five wrong tries, and expiry');
await resetCodes(); await reset();
r = await request('6.6.6.6', person.username);
for (let i = 0; i < 4; i++) check((await verify('6.6.6.6', person.username, 'zzzzzz')).status === 'mismatch', `wrong try ${i + 1} of 5 is just a mismatch`);
check((await verify('6.6.6.6', person.username, 'zzzzzz')).status === 'too_many_attempts', 'the 5th wrong try throws the code away');
check((await verify('6.6.6.6', person.username, r.code)).status === 'expired', 'even the real code no longer works after that');
await resetCodes(); await reset();
r = await request('6.6.6.6', person.username);
await db.query(`update recovery_otps set expires_at = now() - interval '1 second' where user_id = $1`, [person.id]);
check((await verify('6.6.6.6', person.username, r.code)).status === 'expired', 'a code past its 10 minutes no longer works, even if it is the right one');

section('6. A new code cancels an older, still-live one');
await resetCodes(); await reset();
const first = await request('7.7.7.7', person.username);
await db.query(`update recovery_otps set created_at = now() - interval '46 seconds' where user_id = $1`, [person.id]);
const second = await request('7.7.7.7', person.username);
check(first.code !== second.code, '(different code, extremely likely)');
check((await verify('7.7.7.7', person.username, first.code)).status !== 'ok', 'the OLD code no longer works once a new one exists');
check((await verify('7.7.7.7', person.username, second.code)).status === 'ok', 'but the new one does');

section('7. Missing input, and who may call any of this');
check((await verify('8.8.8.8', '  ', '123456')).status === 'missing_username', 'no username is reported when verifying too');
check((await verify('8.8.8.8', person.username, '   ')).status === 'missing', 'no code is reported');
for (const [label, run] of [
  ['a signed-in user', () => asUser(db, person.id, () => db.query(`select public.recovery_otp_request('1', 'x')`))],
  ['a logged-out visitor', () => asAnon(db, () => db.query(`select public.recovery_otp_request('1', 'x')`))]
]) {
  try { await run(); check(false, `${label} can not ask for a code`, '(it succeeded)'); } catch (e) { check(/permission denied/.test(e.message), `${label} can not ask for a code`, e.message); }
}
for (const [label, run] of [
  ['a signed-in user', () => asUser(db, person.id, () => db.query(`select public.recovery_otp_verify('1', 'x', '000000')`))],
  ['a logged-out visitor', () => asAnon(db, () => db.query(`select public.recovery_otp_verify('1', 'x', '000000')`))]
]) {
  try { await run(); check(false, `${label} can not check a code`, '(it succeeded)'); } catch (e) { check(/permission denied/.test(e.message), `${label} can not check a code`, e.message); }
}
for (const [label, run] of [
  ['a signed-in user', () => asUser(db, person.id, () => db.query('select * from recovery_otps'))],
  ['a logged-out visitor', () => asAnon(db, () => db.query('select * from recovery_otps'))]
]) {
  try { await run(); check(false, `${label} can not read the codes table`, '(it succeeded)'); } catch (e) { check(/permission denied/.test(e.message), `${label} can not read the codes table`, e.message); }
}
await db.query('set role service_role');
try {
  check((await db.query(`select public.recovery_otp_request('1', 'x_none') r`)).rows[0].r.status === 'not_found', 'the Edge Function (service key) can ask for a code');
  check((await db.query(`select public.recovery_otp_verify('1', 'x_none', '000000') r`)).rows[0].r.status === 'not_found', '...and check one');
} finally { await db.query('reset role'); }

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
