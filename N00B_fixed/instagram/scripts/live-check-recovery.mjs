// Live check of account recovery (the "recover-account" Edge Function + database check) on a real project,
// through the PUBLIC API only. One brand-new throwaway account proves its identity, is signed in by the recovery
// flow, and is deleted at the end (only after confirming it is signed in as that throwaway).
//
//   $env:SUPABASE_URL = "https://<ref>.supabase.co"
//   $env:SUPABASE_PUBLISHABLE_KEY = "sb_publishable_..."
//   node scripts/live-check-recovery.mjs
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY first.'); process.exit(1); }
let passed = 0, failed = 0;
const check = (ok, label, detail = '') => { if (ok) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const fresh = () => createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const rpc = async (c, fn, args = {}) => { const { data, error } = await c.rpc(fn, args); if (error) throw new Error(`${fn}: ${error.message}`); return data; };

const stamp = Date.now().toString(36);
const PW = 'Test-pass-1234';
const username = `l4r_${stamp}`;
const details = { username, mobileNumber: '+91 90000 00010', dateOfBirth: '2005-05-05', email: `Rec.${stamp}@Example.com` };

// what the app does: ask the function; on failure read the message it sent back
async function recover(c, body) {
  const { data, error } = await c.functions.invoke('recover-account', { body });
  if (error) {
    let msg = ''; let status = null;
    try { status = error.context.status; msg = (await error.context.json()).error; } catch { msg = error.message; }
    return { ok: false, status, msg };
  }
  return { ok: true, data };
}

const maker = fresh();
const { data: su, error: suErr } = await maker.auth.signUp({
  email: `${crypto.randomUUID()}@users.nooob.xyz`, password: PW,
  options: { data: { username, first_name: 'Rec', last_name: 'Check', email: details.email, mobile_number: '9000000010', date_of_birth: '2005-05-05', bio: 'recovery check', agreed_to_terms: true } }
});
if (suErr || !su.session) { console.error('sign-up failed:', suErr?.message); process.exit(1); }
let recovered = null;
try {
  await maker.auth.signOut();
  console.log('\nRecovery through the deployed function');
  const anon = fresh();

  const bad1 = await recover(anon, { ...details, email: 'someone.else@example.com' });
  check(!bad1.ok && bad1.status === 401 && /do not match/.test(bad1.msg), 'a wrong email is refused with the generic "do not match" answer', JSON.stringify(bad1));
  const bad2 = await recover(anon, { ...details, mobileNumber: '1234567890' });
  check(!bad2.ok && bad2.status === 401 && bad2.msg === bad1.msg, 'a wrong mobile number gets the very same answer (no hint which detail was wrong)');
  const bad3 = await recover(anon, { ...details, dateOfBirth: '1990-01-01' });
  check(!bad3.ok && bad3.status === 401 && bad3.msg === bad1.msg, 'a wrong date of birth too');
  const nf = await recover(anon, { ...details, username: `nobody_${stamp}` });
  check(!nf.ok && nf.status === 404 && /No account found/.test(nf.msg), 'an unknown username is reported');
  const miss = await recover(anon, { ...details, email: '' });
  check(!miss.ok && miss.status === 400 && /mobile number, date of birth, and email/.test(miss.msg), 'a missing detail is reported');
  check(!(await recover(anon, { ...details, username: '' })).ok, 'a missing username is refused');

  const good = await recover(anon, { ...details, username: ` ${username.toUpperCase()} `, email: ` ${details.email.toLowerCase()} `, mobileNumber: '9000000010', dateOfBirth: '2005-05-05T00:00:00.000Z' });
  check(good.ok && typeof good.data.tokenHash === 'string' && good.data.tokenHash.length > 10, 'the right details (capitals, spaces and formats do not matter) give a one-time sign-in token');
  if (good.ok) {
    const { data: session, error: vErr } = await anon.auth.verifyOtp({ token_hash: good.data.tokenHash, type: 'magiclink' });
    check(!vErr && !!session?.session, 'the token becomes a real signed-in session', vErr?.message);
    const me = await rpc(anon, 'get_my_user');
    check(me.username === username, 'and it is exactly that account');
    recovered = anon;
    const again = await fresh().auth.verifyOtp({ token_hash: good.data.tokenHash, type: 'magiclink' });
    check(!!again.error, 'the token can not be used a second time');
  }

  // guess limit: 8 wrong tries an hour per username
  const limiter = fresh();
  let last = null;
  for (let i = 0; i < 8; i++) last = await recover(limiter, { ...details, dateOfBirth: `199${i}-01-01` });
  const blocked = await recover(limiter, details);
  check(!blocked.ok && blocked.status === 429 && /Too many attempts/.test(blocked.msg), 'after 8 wrong guesses even the right answer is refused for an hour', JSON.stringify(blocked));

  // nothing readable by a browser
  check(!!(await fresh().from('recovery_attempts').select('*').limit(1)).error, 'a logged-out visitor can not read the attempts list');
  check(!!(await fresh().rpc('recovery_check', { p_ip: '1', p_username: username, p_mobile: '9000000010', p_dob: '2005-05-05', p_email: details.email })).error, 'a browser can not call the database check directly (it would skip the guess limit)');
} catch (err) {
  failed++; console.log(`  FAIL unexpected error: ${err.message}`);
} finally {
  try {
    const c = recovered || fresh();
    if (!recovered) await c.auth.signInWithPassword({ email: await rpc(c, 'resolve_login_email', { identifier: username }), password: PW });
    const me = await rpc(c, 'get_my_user');
    if (me.username === username) console.log('  cleanup:', (await c.rpc('delete_my_account', { p_password: PW })).error ? 'FAILED to delete the throwaway' : 'throwaway account deleted');
    else console.log(`  note: not deleting — signed in as ${me.username}`);
  } catch (e) { console.log('  note: cleanup problem:', e.message); }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(process.exitCode), 500);
