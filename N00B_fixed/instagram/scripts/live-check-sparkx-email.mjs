// One-off live check: confirms the SparkX email actions are deployed and behave correctly.
// Creates ONE throwaway account, submits a real SparkX application, triggers the self-service
// "registered" email, and confirms the two admin-only actions correctly reject a non-admin caller
// (rather than crashing) since this script has no real admin credentials to test the happy path.
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY first.'); process.exit(1); }

let passed = 0, failed = 0;
const check = (ok, label, detail = '') => { if (ok) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const c = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const stamp = Date.now().toString(36);
const PW = 'Test-pass-1234';
const { data, error } = await c.auth.signUp({
  email: `${crypto.randomUUID()}@users.nooob.xyz`, password: PW,
  options: { data: { username: `ltse_${stamp}`, first_name: 'Live', last_name: 'Check', email: `ltse@example.com`, mobile_number: '9000000006', date_of_birth: '2005-05-05', bio: 'automated check', agreed_to_terms: true, avatar: 'avatars/test.jpg' } }
});
if (error || !data.session) throw new Error(`sign-up failed: ${error?.message || 'no session'}`);

try {
  const { data: sub, error: subErr } = await c.rpc('submit_sparkx_application', {
    p_full_name: 'Live Check', p_grade: 'Grade 9', p_school: 'Test School', p_contribution: 'testing', p_ai_knowledge: 'testing'
  });
  if (subErr) throw subErr;
  check(sub?.success === true, 'application submitted', JSON.stringify(sub));
  const appId = sub?.application?.id;

  const reg = await c.functions.invoke('dynamic-handler', { body: { action: 'sparkx_registered_email', applicationId: appId } });
  check(!reg.error, 'registered-email action returns 2xx', JSON.stringify(reg.error || reg.data));
  check(reg.data?.success === true, 'registered-email reports success', JSON.stringify(reg.data));
  check(reg.data?.sent === true, 'registered-email actually sent (Resend accepted it)', JSON.stringify(reg.data));

  const review = await c.functions.invoke('dynamic-handler', { body: { action: 'sparkx_review_email', applicationId: appId, status: 'accepted' } });
  check(review.error?.context?.status === 403 || review.data?.error === 'Access denied.', 'non-admin is refused (403), not crashed', JSON.stringify(review.error || review.data));

  const meeting = await c.functions.invoke('dynamic-handler', { body: { action: 'sparkx_meeting_email', applicationIds: [appId], time: 'test', zoomLink: 'https://zoom.us/test' } });
  check(meeting.error?.context?.status === 403 || meeting.data?.error === 'Access denied.', 'non-admin is refused (403), not crashed', JSON.stringify(meeting.error || meeting.data));
} finally {
  try { await c.rpc('delete_my_account', { p_password: PW }); } catch (e) { console.log(`  note: could not delete throwaway account: ${e.message}`); }
}

console.log(`\n${passed} passed, ${failed} failed`);
