// Guest support (customer support for people who are not logged in): the database part (migration 20261029000001) on a real Postgres with every migration applied.
// Usage: node --liftoff-only scripts/supabase/test-guest-support-db.mjs
import fs from 'node:fs';
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);

const db = await createTestDb();
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const mk = async (name, email, extra = '') => {
  const id = (await q('select gen_random_uuid() as id'))[0].id;
  await q(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  await q(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, name]);
  await q(`insert into public.profile_private (user_id, email) values ($1, $2)`, [id, email]);
  if (extra) await q(`update public.profiles set ${extra} where id = $1`, [id]);
  return id;
};
const ana = await mk('ana_guest', 'ana@example.com');
const bo = await mk('bo_guest', 'Bo.Smith@Example.com');
const twin1 = await mk('twin_one', 'twins@example.com');
const twin2 = await mk('twin_two', 'twins@example.com');
const banned = await mk('banned_guest', 'banned@example.com', 'is_suspended = true');
const admin = await mk('noob', 'admin@example.com');

// run a statement as the server's private key (the Edge Function)
const svc = async (sql, args = []) => {
  await db.exec('set role service_role');
  try {
    const parts = args.length === 0 && sql.includes(';') ? sql.split(';').map((x) => x.trim()).filter(Boolean) : [sql];
    let rows = [];
    for (const part of parts) rows = (await db.query(part, args)).rows;
    return rows;
  } finally { await db.exec('reset role'); }
};
const call = async (fn, args) => (await svc(`select public.${fn} as r`, args))[0].r;
const B1 = 'browser-one-aaaaaaaaaaaa', B2 = 'browser-two-bbbbbbbbbbbb', B3 = 'browser-three-cccccccccc';
const counts = async () => ({ profiles: (await q('select count(*)::int n from public.profiles'))[0].n, priv: (await q('select count(*)::int n from public.profile_private'))[0].n, users: (await q('select count(*)::int n from auth.users'))[0].n });
const before = await counts();
const begin = (b, ip, email, issue = 'I cannot log in', kind = 'login') => call('guest_support_begin($1,$2,$3,$4,$5)', [b, ip, email, issue, kind]);

section('1. Nobody but the server can touch any of it');
const tables = ['guest_support_secret', 'guest_support_browsers', 'guest_support_cases'];
for (const t of tables) {
  const anonRead = await asAnon(db, async () => { try { await db.query(`select * from public.${t}`); return 'read'; } catch { return 'denied'; } });
  const userRead = await asUser(db, ana, async () => { try { await db.query(`select * from public.${t}`); return 'read'; } catch { return 'denied'; } });
  const userWrite = await asUser(db, ana, async () => { try { await db.query(`delete from public.${t}`); return 'wrote'; } catch { return 'denied'; } });
  check(anonRead === 'denied' && userRead === 'denied' && userWrite === 'denied', `${t}: a visitor and a signed-in person can neither read nor change it`);
}
const fns = [['guest_support_status($1)', [B1]], ['guest_support_email_check($1,$2,$3)', [B1, '1.1.1.1', 'ana@example.com']], ['guest_support_begin($1,$2,$3,$4,$5)', [B1, '1.1.1.1', 'ana@example.com', 'help me', 'login']],
  ['guest_support_id_check($1,$2,$3,$4,$5)', ['00000000-0000-0000-0000-000000000000', 'x', B1, 'ana_guest', false]], ['guest_support_otp_request($1,$2,$3,$4)', ['00000000-0000-0000-0000-000000000000', 'x', B1, '1.1.1.1']],
  ['guest_support_otp_verify($1,$2,$3,$4,$5)', ['00000000-0000-0000-0000-000000000000', 'x', B1, '1.1.1.1', '123456']], ['guest_support_touch($1,$2,$3)', ['00000000-0000-0000-0000-000000000000', 'x', B1]],
  ['guest_support_close($1,$2,$3)', ['00000000-0000-0000-0000-000000000000', 'x', B1]], ['guest_support_hash($1)', ['x']], ['guest_support_code()', []]];
let open = [];
for (const [fn, args] of fns) {
  const a = await asAnon(db, async () => { try { await db.query(`select public.${fn}`, args); return 'ran'; } catch { return 'denied'; } });
  const u = await asUser(db, ana, async () => { try { await db.query(`select public.${fn}`, args); return 'ran'; } catch { return 'denied'; } });
  if (a !== 'denied' || u !== 'denied') open.push(fn);
}
check(open.length === 0, 'none of the functions can be called with the public key (only with the server key)', open.join(', '));
const adminList = await asUser(db, ana, async () => { try { await db.query('select public.admin_guest_support_cases()'); return 'ran'; } catch { return 'denied'; } });
const adminAnon = await asAnon(db, async () => { try { await db.query('select public.admin_guest_support_cases()'); return 'ran'; } catch { return 'denied'; } });
check(adminList === 'denied' && adminAnon === 'denied', 'the administrator\'s list is refused to everyone else');

section('2. Helpers: browser ids, emails, hashes');
check((await call('guest_support_status($1)', ['short'])).status === 'bad_browser' && (await call('guest_support_status($1)', ['has spaces in it here ok'])).status === 'bad_browser', 'a browser id that is too short or has odd characters is refused');
const st0 = await call('guest_support_status($1)', [B1]);
check(st0.status === 'ok' && st0.uses === 0 && st0.remaining === 3 && st0.limit === 3, 'a new browser has all 3 uses left');
check((await call('guest_support_clean_email($1)', ['  Ana@Example.COM  '])) === 'ana@example.com' && (await call('guest_support_clean_email($1)', ['not an email'])) === null && (await call('guest_support_clean_email($1)', ['a@b'])) === null && (await call('guest_support_clean_email($1)', [`${'a'.repeat(250)}@x.com`])) === null, 'an email is trimmed and lower-cased; nonsense is refused');
const code6 = await Promise.all(Array.from({ length: 200 }, () => call('guest_support_code()', [])));
check(code6.every((c) => /^\d{6}$/.test(c)) && new Set(code6).size > 150, 'codes are always 6 digits and vary');
check((await call('guest_support_hash($1)', ['x'])) === (await call('guest_support_hash($1)', ['x'])) && (await call('guest_support_hash($1)', ['x'])) !== (await call('guest_support_hash($1)', ['y'])) && !(await call('guest_support_hash($1)', ['x'])).includes('x'), 'hashes are steady, different for different texts, and salted (a plain sha256 is not what is stored)');

section('3. "Is there an account with this email?" (and how often it can be asked)');
check((await call('guest_support_email_check($1,$2,$3)', [B1, '9.9.9.1', 'nonsense'])).status === 'invalid_email', 'a typo is not an email');
check((await call('guest_support_email_check($1,$2,$3)', [B1, '9.9.9.1', 'nobody@example.com'])).status === 'no_account', 'an email nobody uses: no account found');
const f1 = await call('guest_support_email_check($1,$2,$3)', [B1, '9.9.9.1', ' ANA@example.com ']);
check(f1.status === 'found' && f1.many === false && f1.suspended === false && Object.keys(f1).sort().join() === 'many,status,suspended', 'a known email (any capitals or spaces) is found, and the answer says nothing else about the account');
check((await call('guest_support_email_check($1,$2,$3)', [B1, '9.9.9.1', 'bo.smith@example.com'])).status === 'found', 'the email on file with capitals is found with small letters');
const f2 = await call('guest_support_email_check($1,$2,$3)', [B1, '9.9.9.1', 'twins@example.com']);
check(f2.status === 'found' && f2.many === true, 'an email used by two accounts says so');
const f3 = await call('guest_support_email_check($1,$2,$3)', [B1, '9.9.9.1', 'banned@example.com']);
check(f3.status === 'found' && f3.suspended === true, 'an email of a suspended account says so');
await svc(`delete from public.ui_translation_usage`);
let last = null;
for (let i = 0; i < 12; i++) last = await call('guest_support_email_check($1,$2,$3)', [B3, `8.8.8.${i}`, 'nobody@example.com']);
check(last.status === 'rate_limited', 'one browser can ask only 10 times an hour (then it must wait)');
await svc(`delete from public.ui_translation_usage`);
for (let i = 0; i < 40; i++) last = await call('guest_support_email_check($1,$2,$3)', [`ip-browser-${String(i).padStart(14, 'x')}`, '7.7.7.7', 'nobody@example.com']);
check(last.status === 'no_account' && (await call('guest_support_email_check($1,$2,$3)', ['ip-browser-another-one-xxxx', '7.7.7.7', 'nobody@example.com'])).status === 'rate_limited', 'one network can ask only 40 times an hour, whatever browsers it uses');
await svc(`delete from public.ui_translation_usage`);

section('4. Starting a chat spends one of the browser\'s 3 uses');
check((await begin('x', '1.1.1.1', 'ana@example.com')).status === 'bad_browser', 'a bad browser id can not start a chat');
check((await begin(B1, '1.1.1.1', 'nonsense')).status === 'invalid_email', 'a bad email can not start a chat');
check((await begin(B1, '1.1.1.1', 'ana@example.com', 'hi')).status === 'invalid_issue' && (await begin(B1, '1.1.1.1', 'ana@example.com', 'x'.repeat(1501))).status === 'invalid_issue', 'a problem must be 3 to 1500 characters');
check((await call('guest_support_status($1)', [B1])).uses === 0, 'a refused start spends nothing');
const c1 = await begin(B1, '1.1.1.1', 'Ana@Example.com', '  I cannot log in  ', 'login');
check(c1.status === 'ok' && /^[0-9a-f]{8}-/.test(c1.caseId) && /^[0-9a-f]{64}$/.test(c1.caseKey) && c1.remaining === 2 && c1.accountFound === true && c1.many === false, 'a chat starts: an id, a 64-character key, 2 uses left');
const row = (await svc('select * from public.guest_support_cases where id = $1', [c1.caseId]))[0];
check(row.email === 'ana@example.com' && row.issue === 'I cannot log in' && row.user_id === ana && row.status === 'open' && row.id_state === 'none' && row.key_hash !== c1.caseKey && !JSON.stringify(row).includes(c1.caseKey) && !JSON.stringify(row).includes(B1) && !JSON.stringify(row).includes('1.1.1.1'), 'stored: the email and problem, the account it belongs to, and only HASHES of the key, the browser and the network');
const c2 = await begin(B1, '1.1.1.1', 'nobody@example.com', 'I want to sign up', 'signup');
check(c2.status === 'ok' && c2.accountFound === false && c2.remaining === 1, 'an email without an account can still start a chat (for help that needs no account)');
const c3 = await begin(B1, '1.1.1.1', 'twins@example.com', 'two accounts', 'login');
check(c3.status === 'ok' && c3.many === true && c3.remaining === 0, 'the third use');
const c4 = await begin(B1, '1.1.1.1', 'ana@example.com');
check(c4.status === 'limit_reached' && (await call('guest_support_status($1)', [B1])).status === 'limit_reached' && (await call('guest_support_status($1)', [B1])).uses === 3, 'a fourth chat from the same browser is refused: only 3 uses');
check((await call('guest_support_email_check($1,$2,$3)', [B1, '1.1.1.1', 'ana@example.com'])).status === 'limit_reached', 'and so is looking up an email');
check((await q('select count(*)::int n from public.guest_support_cases'))[0].n === 3, 'the refused chat made no case');
await svc('delete from public.ui_translation_usage');
let ipLast = null;
for (let i = 0; i < 12; i++) ipLast = await begin(`net-browser-${String(i).padStart(10, 'x')}`, '5.5.5.5', 'ana@example.com');
check(ipLast.status === 'ok' && (await begin('net-browser-extra-xxxxxxxx', '5.5.5.5', 'ana@example.com')).status === 'rate_limited', 'one network can start only 12 chats a day (clearing the browser\'s memory does not get around it)');
check((await call('guest_support_status($1)', ['net-browser-extra-xxxxxxxx'])).uses === 0, 'and a chat refused for the network spends no use of the browser');
await svc('delete from public.ui_translation_usage');

section('5. A case works only with its own key, from its own browser, while it is open');
const nul = '00000000-0000-0000-0000-000000000000';
check((await call('guest_support_touch($1,$2,$3)', [c1.caseId, 'wrong-key', B1])).status === 'bad_case', 'a wrong key opens nothing');
check((await call('guest_support_touch($1,$2,$3)', [c1.caseId, c1.caseKey, B2])).status === 'bad_case', 'the right key from another browser opens nothing');
check((await call('guest_support_touch($1,$2,$3)', [nul, c1.caseKey, B1])).status === 'bad_case', 'an unknown case opens nothing');
const t1 = await call('guest_support_touch($1,$2,$3)', [c1.caseId, c1.caseKey, B1]);
check(t1.status === 'ok' && t1.issue === 'I cannot log in' && t1.kind === 'login' && t1.hasAccount === true && !JSON.stringify(t1).includes('ana@') && !JSON.stringify(t1).includes(ana), 'the helper gets the problem, never the email or the account id');
await svc(`update public.guest_support_cases set messages = 39 where id = $1`, [c1.caseId]);
check((await call('guest_support_touch($1,$2,$3)', [c1.caseId, c1.caseKey, B1])).status === 'ok' && (await call('guest_support_touch($1,$2,$3)', [c1.caseId, c1.caseKey, B1])).status === 'limit', 'a chat has at most 40 messages');
await svc(`update public.guest_support_cases set created_at = now() - interval '25 hours' where id = $1`, [c2.caseId]);
check((await call('guest_support_touch($1,$2,$3)', [c2.caseId, c2.caseKey, B1])).status === 'bad_case', 'a chat older than 24 hours is closed to its key');

section('6. The User ID step');
check((await call('guest_support_id_check($1,$2,$3,$4,$5)', [c1.caseId, 'bad', B1, 'ana_guest', false])).status === 'bad_case', 'needs the case key');
check((await call('guest_support_id_check($1,$2,$3,$4,$5)', [c1.caseId, c1.caseKey, B1, '   ', false])).status === 'invalid_id', 'an empty ID is refused');
const m1 = await call('guest_support_id_check($1,$2,$3,$4,$5)', [c1.caseId, c1.caseKey, B1, 'someone_else', false]);
check(m1.status === 'mismatch' && Object.keys(m1).join() === 'status' && (await svc('select id_state from public.guest_support_cases where id = $1', [c1.caseId]))[0].id_state === 'mismatch', 'a wrong ID says "mismatch" and nothing about the real one');
const o0 = await call('guest_support_otp_request($1,$2,$3,$4)', [c1.caseId, c1.caseKey, B1, '1.1.1.1']);
check(o0.status === 'id_required', 'no code can be sent while the ID does not match');
const m2 = await call('guest_support_id_check($1,$2,$3,$4,$5)', [c1.caseId, c1.caseKey, B1, ' @ANA_Guest ', false]);
check(m2.status === 'match' && (await svc('select id_state, claimed_id from public.guest_support_cases where id = $1', [c1.caseId]))[0].id_state === 'matched', 'the right ID (with @ and capitals) matches');
check((await call('guest_support_id_check($1,$2,$3,$4,$5)', [c3.caseId, c3.caseKey, B1, '', true])).status === 'need_id', 'two accounts share the email: "I forgot my ID" is not enough');
const m3 = await call('guest_support_id_check($1,$2,$3,$4,$5)', [c3.caseId, c3.caseKey, B1, 'twin_two', false]);
check(m3.status === 'match' && (await svc('select user_id from public.guest_support_cases where id = $1', [c3.caseId]))[0].user_id === twin2, 'the ID picks the right one of the two accounts');
const m4 = await call('guest_support_id_check($1,$2,$3,$4,$5)', [c3.caseId, c3.caseKey, B1, 'ana_guest', false]);
check(m4.status === 'mismatch', 'the ID of an account with ANOTHER email does not match');
const cNo = await begin(B2, '2.2.2.2', 'nobody@example.com', 'help', 'other');
check((await call('guest_support_id_check($1,$2,$3,$4,$5)', [cNo.caseId, cNo.caseKey, B2, '', true])).status === 'no_account' && (await call('guest_support_otp_request($1,$2,$3,$4)', [cNo.caseId, cNo.caseKey, B2, '2.2.2.2'])).status === 'no_account', 'with no account there is nothing to find and no code to send');
const cB = await begin(B2, '2.2.2.2', 'bo.smith@example.com', 'forgot my id', 'forgot_id');
for (let i = 0; i < 6; i++) await call('guest_support_id_check($1,$2,$3,$4,$5)', [cB.caseId, cB.caseKey, B2, `wrong${i}`, false]);
check((await call('guest_support_id_check($1,$2,$3,$4,$5)', [cB.caseId, cB.caseKey, B2, 'bo_guest', false])).status === 'rate_limited', 'after 6 wrong IDs the chat stops checking (no guessing the ID)');
const cB2 = await begin(B2, '2.2.2.2', 'bo.smith@example.com', 'forgot my id again', 'forgot_id');
check((await call('guest_support_id_check($1,$2,$3,$4,$5)', [cB2.caseId, cB2.caseKey, B2, '', true])).status === 'forgot', '"I forgot my ID" is accepted when the email has one account');

section('7. The emailed code');
await svc('delete from public.recovery_otps; delete from public.recovery_attempts;');
const r1 = await call('guest_support_otp_request($1,$2,$3,$4)', [c1.caseId, c1.caseKey, B1, '1.1.1.1']);
check(r1.status === 'ok' && /^\d{6}$/.test(r1.code) && r1.userId === ana && r1.email === 'ana@example.com' && r1.username === 'ana_guest' && r1.sendsLeft === 2, 'a matched case gets a 6-digit code and the address on file to send it to');
const stored = (await svc('select code_hash, attempts, expires_at > now() as live, expires_at < now() + interval \'11 minutes\' as soon from public.recovery_otps where user_id = $1', [ana]))[0];
check(stored.live && stored.soon && stored.attempts === 0 && !stored.code_hash.includes(r1.code) && stored.code_hash.length === 64, 'only a salted hash of the code is stored, valid for 10 minutes');
const r2 = await call('guest_support_otp_request($1,$2,$3,$4)', [c1.caseId, c1.caseKey, B1, '1.1.1.1']);
check(r2.status === 'cooldown' && r2.seconds >= 1 && r2.seconds <= 45, 'a second code right away waits (45 seconds)');
check((await call('guest_support_otp_verify($1,$2,$3,$4,$5)', [c1.caseId, c1.caseKey, B1, '1.1.1.1', ''])).status === 'missing' && (await call('guest_support_otp_verify($1,$2,$3,$4,$5)', [c1.caseId, c1.caseKey, B1, '1.1.1.1', '12ab'])).status === 'bad_format', 'an empty or not-6-digits code is told so without using a try');
check((await svc('select attempts from public.recovery_otps where user_id = $1', [ana]))[0].attempts === 0, '(no try was used)');
const wrong = r1.code === '000000' ? '111111' : '000000';
for (let i = 1; i <= 4; i++) {
  const w = await call('guest_support_otp_verify($1,$2,$3,$4,$5)', [c1.caseId, c1.caseKey, B1, '1.1.1.1', wrong]);
  check(w.status === 'mismatch', `wrong code ${i} of 5`);
}
const w5 = await call('guest_support_otp_verify($1,$2,$3,$4,$5)', [c1.caseId, c1.caseKey, B1, '1.1.1.1', wrong]);
check(w5.status === 'too_many_attempts' && (await svc('select count(*)::int n from public.recovery_otps where user_id = $1', [ana]))[0].n === 0, 'the 5th wrong code throws the code away');
const afterGone = await call('guest_support_otp_verify($1,$2,$3,$4,$5)', [c1.caseId, c1.caseKey, B1, '1.1.1.1', r1.code]);
check(afterGone.status === 'expired', 'even the right code is useless once thrown away');
await svc(`update public.recovery_otps set created_at = created_at - interval '2 minutes'`);
await svc('delete from public.recovery_attempts');
const r3 = await call('guest_support_otp_request($1,$2,$3,$4)', [c1.caseId, c1.caseKey, B1, '1.1.1.1']);
check(r3.status === 'ok' && r3.sendsLeft === 1, 'a new code can be asked for');
await svc(`update public.recovery_otps set expires_at = now() - interval '1 second'`);
check((await call('guest_support_otp_verify($1,$2,$3,$4,$5)', [c1.caseId, c1.caseKey, B1, '1.1.1.1', r3.code])).status === 'expired', 'a code older than 10 minutes is refused');
await svc(`delete from public.recovery_otps; delete from public.recovery_attempts;`);
const r4 = await call('guest_support_otp_request($1,$2,$3,$4)', [c1.caseId, c1.caseKey, B1, '1.1.1.1']);
check(r4.status === 'ok' && r4.sendsLeft === 0, 'the third and last code of this chat');
await svc(`update public.recovery_otps set created_at = created_at - interval '2 minutes'`);
check((await call('guest_support_otp_request($1,$2,$3,$4)', [c1.caseId, c1.caseKey, B1, '1.1.1.1'])).status === 'case_limit', 'a chat can ask for only 3 codes');
const okv = await call('guest_support_otp_verify($1,$2,$3,$4,$5)', [c1.caseId, c1.caseKey, B1, '1.1.1.1', ` ${r4.code} `]);
check(okv.status === 'ok' && okv.userId === ana, 'the right code names the account to sign in (the server then makes the one-time sign-in token)');
check((await svc('select count(*)::int n from public.recovery_otps where user_id = $1', [ana]))[0].n === 0 && (await svc('select status from public.guest_support_cases where id = $1', [c1.caseId]))[0].status === 'signed_in', 'the code is used up and the chat is marked signed in');
check((await call('guest_support_otp_verify($1,$2,$3,$4,$5)', [c1.caseId, c1.caseKey, B1, '1.1.1.1', r4.code])).status === 'bad_case' && (await call('guest_support_touch($1,$2,$3)', [c1.caseId, c1.caseKey, B1])).status === 'bad_case', 'a finished chat can not be used again, not even with its key');

section('8. The same guess limits as "forgot password", shared');
await svc('delete from public.recovery_otps; delete from public.recovery_attempts; delete from public.ui_translation_usage;');
const cC = await begin('guess-browser-aaaaaaaaaaa', '3.3.3.3', 'ana@example.com', 'guessing', 'login');
await call('guest_support_id_check($1,$2,$3,$4,$5)', [cC.caseId, cC.caseKey, 'guess-browser-aaaaaaaaaaa', 'ana_guest', false]);
await call('guest_support_otp_request($1,$2,$3,$4)', [cC.caseId, cC.caseKey, 'guess-browser-aaaaaaaaaaa', '3.3.3.3']);
await svc(`insert into public.recovery_attempts (ip, username, ok) select '4.4.4.' || g, 'ana_guest', false from generate_series(1, 8) g`);
check((await call('guest_support_otp_verify($1,$2,$3,$4,$5)', [cC.caseId, cC.caseKey, 'guess-browser-aaaaaaaaaaa', '3.3.3.3', '123456'])).status === 'rate_limited', 'eight wrong tries from anywhere in the last hour (the login page\'s "forgot password" counts too) lock the account\'s code checks for everyone');
await svc('delete from public.recovery_attempts');
await svc(`update public.guest_support_cases set otp_fails = 8 where id = $1`, [cC.caseId]);
check((await call('guest_support_otp_verify($1,$2,$3,$4,$5)', [cC.caseId, cC.caseKey, 'guess-browser-aaaaaaaaaaa', '3.3.3.3', '123456'])).status === 'case_locked', 'a chat with 8 wrong codes is locked');
await svc('delete from public.recovery_otps; delete from public.recovery_attempts;');
const viaLogin = (await call('recovery_otp_request($1,$2)', ['9.9.9.9', 'ana_guest']));
check(viaLogin.status === 'ok' && /^\d{6}$/.test(viaLogin.code), 'the login page\'s own "forgot password" code still works exactly as before');
const cD = await begin('guess-browser-bbbbbbbbbbb', '3.3.3.4', 'ana@example.com', 'again', 'login');
await call('guest_support_id_check($1,$2,$3,$4,$5)', [cD.caseId, cD.caseKey, 'guess-browser-bbbbbbbbbbb', 'ana_guest', false]);
check((await call('guest_support_otp_request($1,$2,$3,$4)', [cD.caseId, cD.caseKey, 'guess-browser-bbbbbbbbbbb', '3.3.3.4'])).status === 'cooldown', 'and the chat shares its 45-second wait with it (one inbox, one pace)');

section('9. Suspended accounts, and the network\'s code allowance');
const cS = await begin('susp-browser-aaaaaaaaaaaa', '6.6.6.6', 'banned@example.com', 'my account', 'suspended');
await call('guest_support_id_check($1,$2,$3,$4,$5)', [cS.caseId, cS.caseKey, 'susp-browser-aaaaaaaaaaaa', '', true]);
check((await call('guest_support_otp_request($1,$2,$3,$4)', [cS.caseId, cS.caseKey, 'susp-browser-aaaaaaaaaaaa', '6.6.6.6'])).status === 'suspended', 'a suspended account is sent no code');
await svc('delete from public.recovery_otps; delete from public.recovery_attempts; delete from public.ui_translation_usage;');
let lastO = null;
for (let i = 0; i < 12; i++) {
  const b = `net-otp-browser-${String(i).padStart(8, 'x')}`;
  const cc = await begin(b, '1.2.3.4', 'ana@example.com', 'codes', 'login');
  await call('guest_support_id_check($1,$2,$3,$4,$5)', [cc.caseId, cc.caseKey, b, 'ana_guest', false]);
  lastO = await call('guest_support_otp_request($1,$2,$3,$4)', [cc.caseId, cc.caseKey, b, '1.2.3.4']);
  await svc(`update public.recovery_otps set created_at = created_at - interval '2 hours'`);
  if (lastO.status === 'rate_limited') break;
}
check(lastO.status === 'rate_limited', 'one network can ask for only 10 codes an hour');

section('10. Closing, and the administrator\'s list');
await svc('delete from public.ui_translation_usage');
const cE = await begin('close-browser-aaaaaaaaaa', '1.9.9.9', 'ana@example.com', 'bye', 'other');
check((await call('guest_support_close($1,$2,$3)', [cE.caseId, 'nope', 'close-browser-aaaaaaaaaa'])).status === 'bad_case', 'closing needs the key too');
check((await call('guest_support_close($1,$2,$3)', [cE.caseId, cE.caseKey, 'close-browser-aaaaaaaaaa'])).status === 'ok' && (await call('guest_support_touch($1,$2,$3)', [cE.caseId, cE.caseKey, 'close-browser-aaaaaaaaaa'])).status === 'bad_case' && (await call('guest_support_status($1)', ['close-browser-aaaaaaaaaa'])).uses === 1, 'a closed chat is closed, and its use stays spent');
const list = await asUser(db, admin, async () => (await db.query('select public.admin_guest_support_cases() as r')).rows[0].r);
check(Array.isArray(list) && list.length >= 5 && list[0].email && list[0].issue && 'accountFound' in list[0] && !JSON.stringify(list).includes('key_hash') && !JSON.stringify(list).includes('browser'), 'the administrator sees each chat: email, problem, account found, codes sent (never keys or browser ids)');
const closed = await asUser(db, admin, async () => (await db.query('select public.admin_guest_support_cases($1) as r', ['closed'])).rows[0].r);
check(closed.length >= 1 && closed.every((x) => x.status === 'closed'), 'and can filter by status');
check((await asUser(db, admin, async () => (await db.query('select public.admin_guest_support_close($1) as r', [list[0].id])).rows[0].r)).success === true, 'and close a chat');

section('11. Nothing that was there is touched');
const after = await counts();
check(after.profiles === before.profiles && after.priv === before.priv && after.users === before.users, 'no account, profile or private record was added, changed or removed by any of this');
const sql = fs.readFileSync('supabase/migrations/20261029000001_guest_support.sql', 'utf8').replace(/--.*$/gm, '');
check(!/\bdrop\s+(table|function|policy|column|schema)\b/i.test(sql) && !/\btruncate\b/i.test(sql) && !/\bdelete\s+from\s+public\.(profiles|profile_private|posts|messages|reels|stories)\b/i.test(sql) && !/\balter\s+table\s+public\.(profiles|profile_private)\b/i.test(sql), 'the migration drops nothing, truncates nothing and never alters an existing table');
check((await q(`select count(*)::int n from pg_policies where tablename like 'guest_support%'`))[0].n === 0, 'no policy opens any of the new tables (row security stays on with none)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
