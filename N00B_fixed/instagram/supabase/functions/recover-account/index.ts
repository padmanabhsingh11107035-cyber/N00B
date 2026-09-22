// NOOB — Edge Function "recover-account".
//
// Two ways in when a password is forgotten:
//   1. (default, unchanged) the person proves three details (mobile number, date of birth, email on file). The check itself (and its
//      guess limits) lives in the database function recovery_check.
//   2. (action: "otp-request" / "otp-verify") a 6-digit code is emailed to the address already on file, and typing it back in proves
//      it is them. The code itself is made, hashed and checked entirely in the database (recovery_otp_request / recovery_otp_verify);
//      this function's only extra job is to actually send the email, through Resend.
// Either way, once the database says "ok" this function creates a one-time sign-in token for that account — the app then exchanges
// it for a normal session. No password is ever seen or set here.
//
// Deploy with "Verify JWT" switched OFF (a logged-out visitor calls this; the database checks are the gate).
// The keys it uses (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are provided to every Edge Function automatically.
// Secret this function also needs for the emailed code (optional — without it, "otp-request" simply answers "not configured" and the
// app falls back to the security-question check): RESEND_API_KEY (a free Resend.com API key).
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

// Turns a verified account id into a one-time sign-in token, the same way for both recovery paths.
async function issueSignInToken(admin: ReturnType<typeof createClient>, userId: string) {
  const { data: found, error: userErr } = await admin.auth.admin.getUserById(userId);
  if (userErr || !found?.user?.email) return null;
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: found.user.email });
  const tokenHash = link?.properties?.hashed_token;
  return linkErr || !tokenHash ? null : tokenHash;
}

// j***@g***.com — enough for the person to recognise their own address without showing it whole on screen.
function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!name || !domain) return '•••';
  const maskPart = (s: string) => (s.length <= 1 ? s : s[0] + '•'.repeat(Math.min(s.length - 1, 4)));
  const dot = domain.lastIndexOf('.');
  const domainName = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : '';
  return `${maskPart(name)}@${maskPart(domainName)}${tld}`;
}

// Shared by every email this function sends. `false` (never thrown) whenever it can't be sent — a missing secret, Resend refusing it,
// or the network being down — so a caller can decide for itself whether that failure should stop anything else.
async function sendEmail(to: string, subject: string, text: string, html: string): Promise<boolean> {
  const key = (Deno.env.get('RESEND_API_KEY') || '').trim();
  if (!key) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: (Deno.env.get('RECOVERY_EMAIL_FROM') || 'NOOB <no-reply@nooob.xyz>').trim(), to: [to], subject, text, html }),
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) console.warn(`Resend: ${res.status} ${await res.text().catch(() => '')}`.slice(0, 300));
    return res.ok;
  } catch (err: any) {
    console.warn('Resend error:', err?.message || err);
    return false;
  }
}

const sendOtpEmail = (email: string, code: string) =>
  sendEmail(
    email,
    `${code} is your NOOB login code`,
    `Your NOOB login code is ${code}. It expires in 10 minutes. If you did not ask for this, you can ignore this email — nothing changes until the code is used.`,
    `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#111">
      <p style="font-size:15px">Your NOOB login code is:</p>
      <p style="font-size:32px;font-weight:800;letter-spacing:6px;margin:12px 0">${code}</p>
      <p style="font-size:13px;color:#555">It expires in 10 minutes and can be used once. If you did not ask for this, you can ignore this email — nothing changes until the code is used.</p>
    </div>`
  );

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const sendWelcomeEmail = (email: string, name: string, username: string) =>
  sendEmail(
    email,
    'Welcome to NOOB! 🎉',
    `Hey ${name}!\n\nWelcome to NOOB — your account @${username} is ready. Share posts and reels, chat with end-to-end encryption, join mini-games, and more.\n\nGlad you're here.\n— The NOOB team`,
    `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#111">
      <p style="font-size:20px;font-weight:800;margin:0 0 12px">Welcome to NOOB, ${escapeHtml(name)}! 🎉</p>
      <p style="font-size:14px;line-height:1.6">Your account <strong>@${escapeHtml(username)}</strong> is ready to go. Share posts and reels, chat with end-to-end encryption, play mini-games, and connect with the community.</p>
      <p style="font-size:14px;line-height:1.6">Glad you're here.<br/>— The NOOB team</p>
    </div>`
  );

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
  const unavailable = { error: 'Recovery is unavailable right now. Please try again later.' };

  // -------------------------------------------------------------- welcome email, right after signing up
  // Called by the app with the BRAND NEW account's own fresh session token — never blocks or fails the signup itself either way,
  // so this is deliberately forgiving: no key configured, no email on file, or Resend refusing it all just mean no email goes out.
  if (body?.action === 'welcome') {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return json({ success: true, sent: false });
    const { data: authData } = await admin.auth.getUser(token);
    const userId = authData?.user?.id;
    if (!userId) return json({ success: true, sent: false });
    const [{ data: prof }, { data: priv }] = await Promise.all([
      admin.from('profiles').select('username, display_name').eq('id', userId).maybeSingle(),
      admin.from('profile_private').select('email').eq('user_id', userId).maybeSingle()
    ]);
    if (!prof?.username || !priv?.email) return json({ success: true, sent: false });
    const sent = await sendWelcomeEmail(priv.email, prof.display_name || prof.username, prof.username);
    return json({ success: true, sent });
  }

  // -------------------------------------------------------------- emailed one-time code
  if (body?.action === 'otp-request') {
    // Checked BEFORE touching the database: if emailing is not switched on, nothing is generated or stored — the person's
    // 3-per-hour allowance and cooldown are not spent on a code that could never be sent to them anyway.
    const key = (Deno.env.get('RESEND_API_KEY') || '').trim();
    if (!key) return json({ error: 'Emailing a code is not switched on yet. Please use the questions instead.', notConfigured: true }, 503);
    const { data: check, error } = await admin.rpc('recovery_otp_request', { p_ip: ip, p_username: String(body?.username ?? '') });
    if (error || !check) return json(unavailable, 500);
    switch (check.status) {
      case 'rate_limited': return json({ error: 'Too many attempts. Please try again later.' }, 429);
      case 'cooldown': return json({ error: 'A code was just sent. Please wait a moment before asking for another.' }, 429);
      case 'missing_username': return json({ error: 'Username is required.' }, 400);
      case 'not_found': return json({ error: 'No account found with that username.' }, 404);
      case 'suspended': return json({ error: 'This account has been suspended by NOOB Administrator.' }, 403);
      case 'no_email': return json({ error: 'This account has no email on file. Please use the questions instead.' }, 404);
      case 'ok': break;
      default: return json(unavailable, 500);
    }
    const sent = await sendOtpEmail(String(check.email), String(check.code));
    if (!sent) return json(unavailable, 502);
    return json({ success: true, maskedEmail: maskEmail(String(check.email)) });
  }

  if (body?.action === 'otp-verify') {
    const { data: check, error } = await admin.rpc('recovery_otp_verify', {
      p_ip: ip, p_username: String(body?.username ?? ''), p_code: String(body?.code ?? '')
    });
    if (error || !check) return json(unavailable, 500);
    switch (check.status) {
      case 'rate_limited': return json({ error: 'Too many attempts. Please try again later.' }, 429);
      case 'missing_username': return json({ error: 'Username is required.' }, 400);
      case 'missing': return json({ error: 'Please enter the code from your email.' }, 400);
      case 'not_found': return json({ error: 'No account found with that username.' }, 404);
      case 'suspended': return json({ error: 'This account has been suspended by NOOB Administrator.' }, 403);
      case 'expired': return json({ error: 'That code has expired or was already used. Please ask for a new one.' }, 401);
      case 'too_many_attempts': return json({ error: 'Too many wrong codes. Please ask for a new one.' }, 401);
      case 'mismatch': return json({ error: 'That code is not right. Please check your email and try again.' }, 401);
      case 'ok': break;
      default: return json(unavailable, 500);
    }
    const tokenHash = await issueSignInToken(admin, String(check.userId));
    if (!tokenHash) return json(unavailable, 500);
    return json({ success: true, tokenHash });
  }

  // -------------------------------------------------------------- the existing security-question check (unchanged)
  const { data: check, error } = await admin.rpc('recovery_check', {
    p_ip: ip,
    p_username: String(body?.username ?? ''),
    p_mobile: String(body?.mobileNumber ?? ''),
    p_dob: String(body?.dateOfBirth ?? ''),
    p_email: String(body?.email ?? '')
  });
  if (error || !check) return json(unavailable, 500);

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
      return json(unavailable, 500);
  }

  // Verified: make a one-time sign-in token for exactly that account (no e-mail is sent).
  const tokenHash = await issueSignInToken(admin, check.userId);
  if (!tokenHash) return json(unavailable, 500);
  return json({ success: true, tokenHash });
});
