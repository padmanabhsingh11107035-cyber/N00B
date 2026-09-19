// NOOB — Edge Function "recover-account".
//
// "Forgot password": the person proves three details (mobile number, date of birth, email on file). The check
// itself (and its guess limits) lives in the database function recovery_check. Only when that says "ok" does this
// function create a one-time sign-in token for that account — the app then exchanges it for a normal session.
//
// Deploy with "Verify JWT" switched OFF (a logged-out visitor calls this; the database check is the gate).
// The keys it uses (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are provided to every Edge Function automatically.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Supabase provides the service key automatically — under the classic name, or (on newer projects) inside the
// SUPABASE_SECRET_KEYS list.
function serviceKey(): string {
  const classic = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (classic) return classic;
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
    return keys.default || (Object.values(keys)[0] as string) || '';
  } catch {
    return '';
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey(), {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || (req.headers.get('cf-connecting-ip') ?? 'unknown');

  const { data: check, error } = await admin.rpc('recovery_check', {
    p_ip: ip,
    p_username: String(body?.username ?? ''),
    p_mobile: String(body?.mobileNumber ?? ''),
    p_dob: String(body?.dateOfBirth ?? ''),
    p_email: String(body?.email ?? '')
  });
  if (error || !check) return json({ error: 'Recovery is unavailable right now. Please try again later.' }, 500);

  switch (check.status) {
    case 'rate_limited':
      return json({ error: 'Too many attempts. Please try again later.' }, 429);
    case 'missing_username':
      return json({ error: 'Username is required.' }, 400);
    case 'not_found':
      return json({ error: 'No account found with that username.' }, 404);
    case 'missing':
      return json({ error: 'Please enter your mobile number, date of birth, and email.' }, 400);
    case 'suspended':
      return json({ error: `This account has been suspended by NOOB Administrator.${check.reason ? ' Reason: ' + check.reason : ''}` }, 403);
    case 'mismatch':
      return json({ error: 'The details you entered do not match our records. Please double-check and try again.' }, 401);
    case 'ok':
      break;
    default:
      return json({ error: 'Recovery is unavailable right now. Please try again later.' }, 500);
  }

  // Verified: make a one-time sign-in token for exactly that account (no e-mail is sent).
  const { data: found, error: userErr } = await admin.auth.admin.getUserById(check.userId);
  if (userErr || !found?.user?.email) return json({ error: 'Recovery is unavailable right now. Please try again later.' }, 500);
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: found.user.email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkErr || !tokenHash) return json({ error: 'Recovery is unavailable right now. Please try again later.' }, 500);

  return json({ success: true, tokenHash });
});
