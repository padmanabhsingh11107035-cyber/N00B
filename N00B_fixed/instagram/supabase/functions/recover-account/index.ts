// NOOB — Edge Function "recover-account". Despite the name, this now also handles the welcome email
// and signup email verification — every auth-adjacent email the app sends, in one place.
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
// (action: "signup-otp-request" / "signup-otp-verify") the same idea, but BEFORE an account exists: a 6-digit code emailed to
// whatever address was just typed into the sign-up form, checked against signup_otp_request/verify. Once the code is right,
// signup-otp-verify ALSO creates the account itself server-side (check_signup, then admin.createUser()) and hands back a sign-in
// token, the same way password recovery does — one round trip instead of the app making a second one to call signupUser() itself.
// The database (check_signup / handle_new_user) still refuses to create any account at all unless that specific email was verified
// in the last 30 minutes, so this can't be bypassed by calling auth.signUp() directly either.
//
// (actions: "oauth-existing-accounts" / "oauth-login-existing") "Continue with Google" for someone who already has a NOOB account
// made with that email: signs them straight into it, no new account and no code to type.
// (action: "oauth-complete-signup") "Sign in with Google": that OAuth redirect already made a real,
// logged-in auth.users row with no NOOB profile on it yet — this proves the email the same way
// (signup_otp_verify, same as above) and then writes the profile itself (complete_oauth_profile),
// using the CALLER's OWN bearer token to know which already-authenticated account is asking, instead
// of creating a new one.
//
// (action: "welcome") sends the "Welcome to NOOB" email right after a brand new account's own first session exists.
//
// (action: "delete-account") runs delete_my_account as the caller (their own bearer token) and, once it succeeds, emails a
// deletion receipt to the address that was on the account — grabbed from the RPC's own return value before the row is gone.
//
// Deploy with "Verify JWT" switched OFF (a logged-out visitor calls this; the database checks are the gate).
// The keys it uses (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY) are provided to every Edge Function automatically.
// Secret this function also needs for every emailed code (optional — without it, otp-request/signup-otp-request answer "not
// configured", the login one falling back to the security-question check, signup itself becoming unavailable): RESEND_API_KEY.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Supabase provides both keys automatically — under the classic name, or (on newer projects) inside a list.
function envKey(classic: string, listName: string): string {
  const direct = Deno.env.get(classic);
  if (direct) return direct;
  try {
    const keys = JSON.parse(Deno.env.get(listName) || '{}');
    return keys.default || (Object.values(keys)[0] as string) || '';
  } catch {
    return '';
  }
}
const serviceKey = () => envKey('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS');
const publicKey = () => envKey('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEYS');

// Turns a verified account id into a one-time sign-in token, the same way for both recovery paths.
async function issueSignInToken(admin: ReturnType<typeof createClient>, userId: string) {
  const { data: found, error: userErr } = await admin.auth.admin.getUserById(userId);
  if (userErr || !found?.user?.email) return null;
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: found.user.email });
  const tokenHash = link?.properties?.hashed_token;
  return linkErr || !tokenHash ? null : tokenHash;
}

// "Continue with Google" for someone who ALREADY has a NOOB account. The Google sign-in itself created a brand-new, empty login
// (no NOOB profile); the person's real account is a different login, found by the email address on it. This reads who the caller
// is from their own Google session (its bearer token) and only trusts an email address the provider has confirmed.
async function oauthCaller(admin: ReturnType<typeof createClient>, req: Request) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  const user = data?.user;
  if (!user) return null;
  const providers: string[] = Array.isArray(user.app_metadata?.providers)
    ? user.app_metadata.providers
    : [String(user.app_metadata?.provider || '')];
  const email = String(user.email || '').trim().toLowerCase();
  const trusted = providers.some((x) => x === 'google' || x === 'apple') && !!user.email_confirmed_at && email.includes('@');
  return { id: user.id, email, trusted };
}

// The NOOB accounts that were made with this (provider-confirmed) email, other than the caller's own empty Google login.
// A real email may be on more than one NOOB account (that is allowed), so this can be a list.
async function accountsForEmail(admin: ReturnType<typeof createClient>, email: string, exceptId: string) {
  const { data: rows } = await admin.from('profile_private').select('user_id').in('email', [email, email.toUpperCase()]);
  const ids = Array.from(new Set((rows || []).map((r: any) => String(r.user_id)).filter((id: string) => id && id !== exceptId)));
  if (ids.length === 0) return [];
  const { data: profiles } = await admin.from('profiles').select('id, username, display_name, avatar, is_suspended').in('id', ids);
  return (profiles || []).map((p: any) => ({
    id: String(p.id),
    username: String(p.username || ''),
    displayName: String(p.display_name || p.username || ''),
    avatar: String(p.avatar || ''),
    suspended: !!p.is_suspended
  }));
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

const sendSignupOtpEmail = (email: string, code: string) =>
  sendEmail(
    email,
    `${code} is your NOOB signup code`,
    `Your NOOB signup verification code is ${code}. Enter it in the app to finish creating your account. It expires in 10 minutes. If you did not try to create a NOOB account, you can ignore this email.`,
    `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#111">
      <p style="font-size:15px">Your NOOB signup verification code is:</p>
      <p style="font-size:32px;font-weight:800;letter-spacing:6px;margin:12px 0">${code}</p>
      <p style="font-size:13px;color:#555">Enter it in the app to finish creating your account. It expires in 10 minutes. If you did not try to create a NOOB account, you can ignore this email.</p>
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

const sendAccountDeletedEmail = (email: string, name: string, username: string) =>
  sendEmail(
    email,
    'Your NOOB account has been deleted',
    `Hi ${name},\n\nThis confirms that your NOOB account (@${username}) and everything in it — posts, reels, messages, followers — have been permanently deleted, just now.\n\nIf you didn't do this yourself, someone else had access to your account. There's nothing to undo (deletion is permanent), but change any reused password elsewhere right away.\n\n— The NOOB team`,
    `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#111">
      <p style="font-size:16px;font-weight:800;margin:0 0 12px">Your NOOB account has been deleted</p>
      <p style="font-size:14px;line-height:1.6">Hi ${escapeHtml(name)}, this confirms that your account <strong>@${escapeHtml(username)}</strong> and everything in it — posts, reels, messages, followers — have been permanently deleted, just now.</p>
      <p style="font-size:13px;color:#555;line-height:1.6">If you didn't do this yourself, someone else had access to your account. There's nothing to undo (deletion is permanent), but change any reused password elsewhere right away.</p>
      <p style="font-size:14px;line-height:1.6">— The NOOB team</p>
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

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, serviceKey(), {
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

  // -------------------------------------------------------------- account deletion confirmation
  // Runs delete_my_account as the caller (their own bearer token, not the admin key — the RPC's own
  // password check is the real gate either way) so it can grab the email/username the RPC returns
  // BEFORE the row is gone, then email a "this just happened" receipt to the address that was on the
  // account. The email never blocks the deletion result the app gets back.
  if (body?.action === 'delete-account') {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return json({ error: 'Please log in.' }, 401);
    const asUser = createClient(url, publicKey(), {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: result, error } = await asUser.rpc('delete_my_account', { p_password: String(body?.password ?? '') });
    if (error) return json({ error: error.message || 'Could not delete the account.' }, 400);
    if (!result?.success) return json({ error: result?.error || 'Could not delete the account.' }, 400);
    if (result.email) void sendAccountDeletedEmail(result.email, result.displayName || result.username || 'there', result.username || '');
    return json({ success: true, message: result.message });
  }

  // -------------------------------------------------------------- signup email verification
  // Called BEFORE an account exists, so there is no username/suspension to check yet — only whether
  // the email itself looks real and isn't already on another account. check_signup / handle_new_user
  // are what actually refuse to create the account without this having succeeded.
  if (body?.action === 'signup-otp-request') {
    const key = (Deno.env.get('RESEND_API_KEY') || '').trim();
    if (!key) return json({ error: 'Sign-ups are temporarily unavailable. Please try again later.', notConfigured: true }, 503);
    const { data: check, error } = await admin.rpc('signup_otp_request', { p_ip: ip, p_email: String(body?.email ?? '') });
    if (error || !check) return json(unavailable, 500);
    switch (check.status) {
      case 'invalid_email': return json({ error: 'Please enter a valid email address.' }, 400);
      case 'rate_limited': return json({ error: 'Too many attempts. Please try again later.' }, 429);
      case 'cooldown': return json({ error: 'A code was just sent. Please wait a moment before asking for another.' }, 429);
      case 'already_registered': return json({ error: 'An account already exists with this email address.' }, 409);
      case 'ok': break;
      default: return json(unavailable, 500);
    }
    const sent = await sendSignupOtpEmail(String(body.email), String(check.code));
    if (!sent) return json(unavailable, 502);
    return json({ success: true });
  }

  if (body?.action === 'signup-otp-verify') {
    const { data: check, error } = await admin.rpc('signup_otp_verify', {
      p_ip: ip, p_email: String(body?.email ?? ''), p_code: String(body?.code ?? '')
    });
    if (error || !check) return json(unavailable, 500);
    switch (check.status) {
      case 'missing_email': return json({ error: 'Email is required.', stage: 'code' }, 400);
      case 'missing': return json({ error: 'Please enter the code from your email.', stage: 'code' }, 400);
      case 'rate_limited': return json({ error: 'Too many attempts. Please try again later.', stage: 'code' }, 429);
      case 'expired': return json({ error: 'That code has expired or was already used. Please ask for a new one.', stage: 'code' }, 401);
      case 'too_many_attempts': return json({ error: 'Too many wrong codes. Please ask for a new one.', stage: 'code' }, 401);
      case 'mismatch': return json({ error: 'That code is not right. Please check your email and try again.', stage: 'code' }, 401);
      case 'ok': break;
      default: return json(unavailable, 500);
    }

    // The code is right. If the rest of the sign-up form came along with it (the normal case —
    // see verifySignupOtp), create the account right here instead of making the app do a second
    // full request just to find out the code was right: same check_signup pre-flight, then the
    // account itself, both server-side in one go.
    const p = body?.signup;
    if (!p) return json({ success: true });

    const { data: precheck } = await admin.rpc('check_signup', { p });
    if (!precheck?.ok) {
      return json({ error: precheck?.error || 'Could not create the account.', suspended: precheck?.suspended, message: precheck?.message, stage: 'form' }, 400);
    }

    const metadata = {
      username: p.username, display_name: p.displayName, first_name: p.firstName, last_name: p.lastName,
      email: p.email, country_code: p.countryCode, mobile_number: p.mobileNumber, date_of_birth: p.dateOfBirth,
      gender: p.gender, avatar: p.avatar, bio: p.bio, account_type: p.accountType,
      business_category: p.businessCategory, business_email: p.businessEmail, business_phone: p.businessPhone,
      business_address: p.businessAddress, agreed_to_terms: p.agreedToTerms, language: p.language
    };
    // Login addresses are private, random ones: the person's real email lives in their private
    // profile (so one email can be used on many accounts) — same as the client-side auth.signUp()
    // this replaces. email_confirm is set because this is a server-side admin creation, not the
    // normal signup flow Supabase's own "Confirm email" setting was written to gate.
    const createOnce = () => admin.auth.admin.createUser({
      email: `${crypto.randomUUID()}@users.nooob.xyz`, password: String(p.password ?? ''),
      email_confirm: true, user_metadata: metadata
    });
    let { data: created, error: createErr } = await createOnce();
    // Same reasoning as the client's old retry: a generic "Database error" wraps ANY failure inside
    // the sign-up trigger, most often a transient hiccup rather than a real conflict (check_signup,
    // just above, already confirmed the username was free a moment ago).
    if (createErr && !/password/i.test(createErr.message || '') && /database error/i.test(createErr.message || '')) {
      ({ data: created, error: createErr } = await createOnce());
    }
    if (createErr || !created?.user) {
      const msg = createErr && /password/i.test(createErr.message || '')
        ? createErr.message
        : 'Something went wrong creating your account. Please try again in a moment.';
      return json({ error: msg, stage: 'form' }, 400);
    }

    const tokenHash = await issueSignInToken(admin, created.user.id);
    if (!tokenHash) return json(unavailable, 500);
    return json({ success: true, tokenHash });
  }

  // -------------------------------------------------------------- finishing a Google (etc.) sign-in
  // The caller already has a real session here — Supabase's own OAuth redirect created it the moment
  // they tapped "Continue with Google" — so unlike signup-otp-verify there is no new auth.users row to
  // create and no sign-in token to hand back: this proves the email the same way every other signup
  // does (signup_otp_verify, unchanged) and then writes the profile row for the account the caller is
  // already logged in as (complete_oauth_profile, service-role only, see its migration).
  if (body?.action === 'oauth-complete-signup') {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return json({ error: 'Please sign in again.' }, 401);
    const { data: authData } = await admin.auth.getUser(token);
    const userId = authData?.user?.id;
    if (!userId) return json({ error: 'Please sign in again.' }, 401);

    const p = body?.signup;
    const email = String(p?.email || authData.user.email || '');
    const { data: check, error } = await admin.rpc('signup_otp_verify', {
      p_ip: ip, p_email: email, p_code: String(body?.code ?? '')
    });
    if (error || !check) return json(unavailable, 500);
    switch (check.status) {
      case 'missing_email': return json({ error: 'Email is required.', stage: 'code' }, 400);
      case 'missing': return json({ error: 'Please enter the code from your email.', stage: 'code' }, 400);
      case 'rate_limited': return json({ error: 'Too many attempts. Please try again later.', stage: 'code' }, 429);
      case 'expired': return json({ error: 'That code has expired or was already used. Please ask for a new one.', stage: 'code' }, 401);
      case 'too_many_attempts': return json({ error: 'Too many wrong codes. Please ask for a new one.', stage: 'code' }, 401);
      case 'mismatch': return json({ error: 'That code is not right. Please check your email and try again.', stage: 'code' }, 401);
      case 'ok': break;
      default: return json(unavailable, 500);
    }
    if (!p) return json({ success: true });

    const { data: result, error: completeErr } = await admin.rpc('complete_oauth_profile', { p_user_id: userId, p: { ...p, email } });
    if (completeErr) return json({ error: 'Something went wrong creating your account. Please try again in a moment.', stage: 'form' }, 400);
    if (!result?.success) {
      return json({ error: result?.error || 'Could not create the account.', suspended: result?.suspended, message: result?.message, stage: 'form' }, 400);
    }
    return json({ success: true });
  }

  // -------------------------------------------------------------- Google (etc.) sign-in for an existing NOOB account
  // Step 1: which NOOB accounts belong to the email address Google just confirmed? (none -> the app shows the sign-up form instead)
  if (body?.action === 'oauth-existing-accounts') {
    const who = await oauthCaller(admin, req);
    if (!who) return json({ error: 'Please sign in again.' }, 401);
    if (!who.trusted) return json({ success: true, accounts: [] });
    const accounts = await accountsForEmail(admin, who.email, who.id);
    return json({ success: true, accounts });
  }

  // Step 2: log in as the chosen one of them. Google has already proved the person owns the email, and the NOOB account's own email
  // was proved with a code when it was made, so this hands back the same one-time sign-in token the emailed-code login does.
  if (body?.action === 'oauth-login-existing') {
    const who = await oauthCaller(admin, req);
    if (!who) return json({ error: 'Please sign in again.' }, 401);
    if (!who.trusted) return json({ error: 'Google could not confirm your email address.' }, 403);
    const accounts = await accountsForEmail(admin, who.email, who.id);
    const chosen = accounts.find((a: any) => a.id === String(body?.accountId || ''));
    if (!chosen) return json({ error: 'That account is not linked to your Google email.' }, 403);
    if (chosen.suspended) return json({ error: 'This account has been suspended by NOOB Administrator.' }, 403);
    const tokenHash = await issueSignInToken(admin, chosen.id);
    if (!tokenHash) return json(unavailable, 500);
    return json({ success: true, tokenHash });
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
