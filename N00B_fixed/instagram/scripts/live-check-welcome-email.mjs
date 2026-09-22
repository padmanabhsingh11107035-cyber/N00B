// Live check: after signup, the client fires `recover-account` with { action: 'welcome' }.
// This calls the deployed function exactly like src/services/supabaseApi.ts does, then cleans up.
//
//   $env:SUPABASE_URL = "https://<ref>.supabase.co"
//   $env:SUPABASE_PUBLISHABLE_KEY = "sb_publishable_..."
//   node scripts/live-check-welcome-email.mjs
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY first.'); process.exit(1); }
const c = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const stamp = Date.now().toString(36);
const username = `wel_${stamp}`;
const PW = 'Test-pass-1234';

const { data: su, error: suErr } = await c.auth.signUp({
  email: `${crypto.randomUUID()}@users.nooob.xyz`, password: PW,
  // Resend refuses to actually deliver to made-up domains like @example.com (422 "Invalid to field") — its
  // reserved testing address accepts the send and reports success without a real mailbox behind it.
  options: { data: { username, first_name: 'Wel', last_name: 'Check', email: 'delivered@resend.dev', mobile_number: '9000000020', date_of_birth: '2005-05-05', bio: 'welcome-email check', agreed_to_terms: true } }
});
if (suErr || !su.session) { console.error('sign-up failed:', suErr?.message); process.exit(1); }
console.log('  ok   throwaway account created:', username);

let failed = 0;
try {
  const { data, error } = await c.functions.invoke('recover-account', { body: { action: 'welcome' } });
  if (error) {
    let msg = ''; try { msg = (await error.context.json()).error; } catch { msg = error.message; }
    failed++; console.log('  FAIL welcome call errored:', msg);
  } else if (data?.success) {
    console.log(`  ok   welcome call succeeded, sent=${data.sent}`);
    if (data._diag) console.log('  diag:', JSON.stringify(data._diag));
    if (!data.sent) { failed++; console.log('  FAIL sent=false — check RESEND_API_KEY / RECOVERY_EMAIL_FROM secrets are set on the function'); }
  } else {
    failed++; console.log('  FAIL unexpected response:', JSON.stringify(data));
  }
} catch (err) {
  failed++; console.log('  FAIL unexpected error:', err.message);
} finally {
  const del = await c.rpc('delete_my_account', { p_password: PW });
  console.log('  cleanup:', del.error ? `FAILED to delete throwaway: ${del.error.message}` : 'throwaway account deleted');
}
console.log(failed ? `\n${failed} FAILED` : '\nall good');
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(process.exitCode), 500);
