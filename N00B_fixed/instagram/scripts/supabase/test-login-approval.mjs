// Login approval by email ("Is this you?" with two buttons): the pieces around the database: the email function, the app's calls, the waiting screen, the page the email buttons open,
// the switch in Settings and in the profile's three-dots menu, and the safety rules (nothing is signed in before the answer, one answer only, no secret in a server log).
// The database half is tested in test-login-approval-db.mjs.
// Usage: node scripts/supabase/test-login-approval.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

const fn = read('supabase/functions/recover-account/index.ts');
const api = read('src/services/supabaseApi.ts');
const apiIndex = read('src/services/api.ts');
const auth = read('src/components/Auth/AuthView.tsx');
const wait = read('src/components/Auth/LoginApprovalWait.tsx');
const page = read('src/components/Auth/LoginApprovalPage.tsx');
const row = read('src/components/Settings/LoginApprovalRow.tsx');
const registry = read('src/components/Settings/registry.ts');
const hub = read('src/components/Settings/SettingsHub.tsx');
const account = read('src/components/Settings/pages/account.tsx');
const main = read('src/main.tsx');
const routes = read('src/utils/routes.ts');
const headers = read('public/_headers');
const sql = read('supabase/migrations/20261022000001_login_approval.sql');

section('1. The email function');
for (const a of ['login-approval-start', 'login-approval-status', 'login-approval-decide', 'login-approval-enable']) check(fn.includes(`body?.action === '${a}'`), `action ${a}`);
const start = fn.slice(fn.indexOf("body?.action === 'login-approval-start'"), fn.indexOf("body?.action === 'login-approval-status'"));
check(/login_approval_check/.test(start) && !/signInWithPassword|generateLink|issueSignInToken/.test(start), 'starting only checks the password: nothing is signed in and no sign-in token is made before the answer');
check(/if \(!check\.required\) return json\(\{ success: true, required: false \}\)/.test(start), 'an account that has not switched it on is told "not required" (the app then logs in the ordinary way)');
const status = fn.slice(fn.indexOf("body?.action === 'login-approval-status'"), fn.indexOf("body?.action === 'login-approval-decide'"));
check(/res\.status === 'approved' && res\.redeem/.test(status) && /issueSignInToken/.test(status), 'the sign-in token is made only for an approved question, once (the database says redeem only the first time)');
check(/is_suspended/.test(status), 'and never for an account suspended in the meantime');
const enable = fn.slice(fn.indexOf("body?.action === 'login-approval-enable'"), fn.indexOf("body?.action === 'otp-request'"));
check(/auth\.getUser\(token\)/.test(enable) && /startApproval\(admin, userId, 'enable'/.test(enable), 'turning it on needs a signed-in person and sends the question to that account');
check(/#c=\$\{id\}&t=\$\{secret\}&a=\$\{answer\}/.test(fn) && /\$\{SITE_URL\}\/login-approval#/.test(fn), 'the buttons open the app\'s /login-approval page, with the secret after the # (never in a server log)');
check(/Yes, it&#8217;s me/.test(fn) && /No, it&#8217;s not me/.test(fn), 'the email has exactly the two buttons: "Yes, it\'s me" and "No, it\'s not me"');
check(!/\bcode\b[^\n]*approv|approv[^\n]*\bOTP\b/i.test(fn.slice(fn.indexOf('const sendApprovalEmail'), fn.indexOf('async function startApproval'))), 'no code is sent or asked for');
check(/'Is this you logging in to NOOB\?'/.test(fn) && /IP address/.test(fn) && /Device:/.test(fn), 'the email says who is asking (device, time, address) so the owner can tell');
check(/case 'cooldown'/.test(fn) && /case 'rate_limited'/.test(fn), 'sending is limited (a cooldown and an hourly cap), so an inbox can not be spammed');
check(/RESEND_API_KEY/.test(start) && /notConfigured: true/.test(start), 'without the email key it answers "cannot be sent" instead of pretending');

section('2. The app\'s calls');
for (const f of ['startLoginApproval', 'checkLoginApproval', 'fetchMyLoginApproval', 'startEnableLoginApproval', 'checkEnableLoginApproval', 'turnOffLoginApproval', 'answerLoginApproval']) check(new RegExp(`export async function ${f}\\b`).test(api) && new RegExp(`\\b${f},`).test(apiIndex), `${f} is there and exported`);
const login = api.slice(api.indexOf('export async function loginUser'), api.indexOf('// ----------------------------------------------------------------------------- "Switch account"'));
check(/loginNeedsApproval\(identifier\)/.test(login) && login.indexOf('loginNeedsApproval') < login.indexOf('signInWithPassword'), 'the login asks "does this account want an approval?" BEFORE it signs in with the password');
check(/return \{ success: false, approval: started\.ticket \}/.test(login) && /return \{ success: false, error: started\.error \}/.test(login), 'when it does, nothing is signed in: the app gets a ticket to wait with (or the error)');
check(/catch \{ return false; \}/.test(api.slice(api.indexOf('async function loginNeedsApproval'), api.indexOf('async function approvalFailure'))), 'if that question can not be asked (no network, not installed yet), the ordinary login goes ahead exactly as before');
const check_ = api.slice(api.indexOf('export async function checkLoginApproval'), api.indexOf('// Settings: is it on'));
check(/verifyOtp\(\{ token_hash: data\.tokenHash/.test(check_) && /startChatKeys\(mapUser\(user\), password\)/.test(check_), 'an approval signs this device in and unlocks the chats with the typed password, like a normal login');
check(/isSuspended/.test(check_) && /signOut\(\{ scope: 'local' \}\)/.test(check_), 'a suspended account is signed out again at once');
check(/status === 'denied'/.test(check_), 'a denial comes back as "denied"');
check(/loginNeedsApproval\(username\)\) return \{ success: false, error: 'This account asks for an approval by email/.test(api), 'adding the account as a linked profile with the password alone is refused when it asks for an approval');
check(/rpc<any>\('login_approval_turn_off', \{ p_password: password \}\)/.test(api), 'turning it off sends the password');

section('3. The login screen');
check(/<LoginApprovalWait/.test(auth) && /else if \(res\.approval\)/.test(auth) && /device: getDeviceLabel\(\)/.test(auth), 'the login screen waits on the new screen when the server asks for an approval');
check(/onApproved=\{\(user\) => \{ setApproval\(null\); void proceedAfterAuth\(user\); \}\}/.test(auth), 'an approval goes through the same steps as any login (one device at a time)');
check(/checkLoginApproval\(ticket, password\)/.test(wait) && /POLL_MS = 2000/.test(wait) && /visibilitychange/.test(wait), 'it asks every 2 seconds, and at once when the tab comes back');
check(/Access denied/.test(wait) && /data-testid="approval-denied"/.test(wait) && /No, it&rsquo;s not me/.test(wait.replace(/“No, it&rsquo;s not me”/, 'No, it&rsquo;s not me')), '"No" shows "Access denied"');
check(/Yes, it&rsquo;s me/.test(wait) && /Logging you in…/.test(wait), '"Yes" logs in straight away');
check(/startLoginApproval\(\{ identifier, password, device \}\)/.test(wait) && /RESEND_AFTER_MS = 20000/.test(wait), 'the email can be sent again after 20 seconds');
check(/expiresAt/.test(wait) && /phase === 'expired'/.test(wait), 'and the wait ends when the question runs out');

section('4. The page the email buttons open');
check(/new URLSearchParams\(window\.location\.hash/.test(page) && /replaceState\(null, '', window\.location\.pathname\)/.test(page), 'it reads the secret from the # and takes it off the address after use');
check(/navigator as Navigator & \{ webdriver\?: boolean \}\)\.webdriver === true/.test(page) && /document\.visibilityState === 'visible'/.test(page), 'a hidden or automated browser (an email scanner) does not press the button by itself');
check(/answerLoginApproval\(link\.id, link\.token\)/.test(page) && /data-testid="approval-answer"/.test(page), 'the tap is sent by the page (a plain visit decides nothing) and a button is there as a backup');
for (const t of ['Access denied', 'Approved', 'Already answered', 'This request ran out']) check(page.includes(t), `it says "${t}" when that is the case`);
check(/noindex, nofollow/.test(page), 'search engines are told to stay away');
check(/approvalPage/.test(main) && /cleanPath\(window\.location\.pathname\) === '\/login-approval'/.test(main) && /<LoginApprovalPage \/>/.test(main), 'only that page is shown at /login-approval (the app is not started)');
check(/clean === '\/login-approval'/.test(routes), 'and the address is a known page, not "page not found"');
check(/\/login-approval\n  ! Referrer-Policy\n  Referrer-Policy: no-referrer\n  Cache-Control: no-store/.test(headers), 'it is never cached and never sent on as a referrer');

section('5. The switch: Settings and the three-dots menu');
check(/id: 'login-approval', section: 'Login'[^\n]*toggle: 'login-approval'/.test(registry), 'a row in the three-dots menu');
const ids = [...registry.matchAll(/\{ id: '([a-z-]+)', section: 'Login'/g)].map((m) => m[1]);
check(ids.join() === 'add-profile,login-approval,logout', 'in the last section, just above Log out', ids.join());
check(/r\.toggle === 'login-approval' \? <LoginApprovalRow/.test(hub), 'the hub draws it as a switch');
check(/<LoginApprovalRow \/>/.test(account), 'and it is under "Password and security" of Your NOOB account too');
check(/two factor|2fa/i.test(registry), 'the search finds it as "2fa" or "two factor"');
check(/startEnableLoginApproval\(getDeviceLabel\(\)\)/.test(row) && /checkEnableLoginApproval\(ticket\)/.test(row), 'turning it on sends the email and waits for "Yes"');
check(/Add an email address to your account first/.test(row), 'an account without an email is told why it cannot');
check(/turnOffLoginApproval\(password\)/.test(row) && /autoComplete="current-password"/.test(row), 'turning it off asks for the password');
check(/disabled=\{info === null \|\| info === 'unavailable'\}/.test(row), 'the switch is disabled until the server says where it stands (and when it is not available)');

section('6. Safety');
check(/enable row level security/.test(sql) && /revoke all on public\.login_challenges from anon, authenticated/.test(sql) && /revoke all on public\.login_approval_settings from anon, authenticated/.test(sql), 'both tables are closed to the app (only the server function reads them)');
check(!/drop |delete from public\.(profiles|profile_private|posts|messages)|alter table public\.(profiles|profile_private)/i.test(sql), 'the migration only adds: nothing existing is dropped or changed');
check(/only a SHA-256|only their SHA-256 hashes are stored/.test(sql) || /login_approval_hash/.test(sql), 'only hashes of the secrets are stored');
check(/Nobody is asked|OPT-IN/.test(sql), 'it is opt-in: nobody is asked unless they switched it on');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
