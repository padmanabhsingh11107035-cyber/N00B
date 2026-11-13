// Turnstile on sign-up: the server check (the function's own small verifyTurnstile, cut out of the source and run with a fake fetch), the page code and the headers.
// Without the secret nothing changes; with it a missing/wrong token is refused; a Cloudflare outage lets the request through (fail open, logged). Usage: node scripts/supabase/test-turnstile.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

const fn = read('supabase/functions/recover-account/index.ts');
const comp = read('src/components/Auth/TurnstileBox.tsx');
const auth = read('src/components/Auth/AuthView.tsx');
const oauth = read('src/components/Auth/CompleteOAuthProfile.tsx');
const api = read('src/services/supabaseApi.ts');
const headers = read('public/_headers');

section('1. The server check, run for real with a fake Cloudflare');
const m = fn.match(/\/\/ TURNSTILE-BEGIN[\s\S]*?\/\/ TURNSTILE-END/);
check(!!m, 'the check is one self-contained block in the function');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-test-'));
const file = path.join(tmp, 'verify.ts');
fs.writeFileSync(file, m[0] + '\nexport { verifyTurnstile };\n');
const { verifyTurnstile } = await import(pathToFileURL(file).href);
const warns = [];
const warn = (x) => warns.push(x);
let calls = [];
const cf = (answer, status = 200) => async (url, init) => { calls.push({ url, body: String(init.body) }); return { ok: status === 200, status, json: async () => answer }; };
const boom = async () => { throw new Error('network down'); };

calls = [];
check((await verifyTurnstile('', undefined, '1.2.3.4', boom, warn)).ok === true && calls.length === 0, 'no secret: always passes and Cloudflare is never asked (behaviour exactly as before)');
check((await verifyTurnstile('S', undefined, '1.2.3.4', cf({ success: true }), warn)).ok === false && calls.length === 0, 'secret set, no token: refused without asking Cloudflare');
check((await verifyTurnstile('S', '   ', '1.2.3.4', cf({ success: true }), warn)).ok === false, 'secret set, blank token: refused');
check((await verifyTurnstile('S', 'x'.repeat(3000), '1.2.3.4', cf({ success: true }), warn)).ok === false, 'secret set, absurdly long token: refused');
calls = [];
check((await verifyTurnstile('SECRET1', 'TOKEN1', '9.9.9.9', cf({ success: true }), warn)).ok === true, 'secret set, valid token: passes');
const sent = new URLSearchParams(calls[0]?.body || '');
check(calls[0]?.url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify' && sent.get('secret') === 'SECRET1' && sent.get('response') === 'TOKEN1' && sent.get('remoteip') === '9.9.9.9', 'it posts secret, response and the caller address to siteverify');
calls = [];
await verifyTurnstile('S', 'T', 'unknown', cf({ success: true }), warn);
check(!new URLSearchParams(calls[0].body).has('remoteip'), 'an unknown address is not sent');
check((await verifyTurnstile('S', 'T', '1.1.1.1', cf({ success: false, 'error-codes': ['invalid-input-response'] }), warn)).ok === false, 'a wrong token is refused');
check((await verifyTurnstile('S', 'T', '1.1.1.1', cf({ success: false, 'error-codes': ['timeout-or-duplicate'] }), warn)).ok === false, 'a reused or old token is refused');
warns.length = 0;
check((await verifyTurnstile('SECRETX', 'TOKENX', '1.1.1.1', boom, warn)).ok === true && warns.length === 1, 'Cloudflare unreachable: fail open, one warning');
check((await verifyTurnstile('SECRETX', 'TOKENX', '1.1.1.1', cf({}, 500), warn)).ok === true, 'Cloudflare answers HTTP 500: fail open');
check((await verifyTurnstile('SECRETX', 'TOKENX', '1.1.1.1', cf({ success: false, 'error-codes': ['invalid-input-secret'] }), warn)).ok === true, 'a wrong secret on our side never locks everyone out (fail open)');
check(warns.length === 3 && warns.every((w) => w.startsWith('turnstile:') && !w.includes('SECRETX') && !w.includes('TOKENX')), 'warnings never contain the token or the secret');
fs.rmSync(tmp, { recursive: true, force: true });

section('2. The function is wired the safe way');
check(/body\?\.action === 'signup-otp-request'[\s\S]{0,900}verifyTurnstile\(\(Deno\.env\.get\('TURNSTILE_SECRET_KEY'\) \|\| ''\)\.trim\(\), body\?\.turnstileToken, ip,/.test(fn), 'signup-otp-request checks the token with the secret from the environment and the trusted address');
const reqStart = fn.indexOf("body?.action === 'signup-otp-request'");
const reqBody = fn.slice(reqStart, fn.indexOf("body?.action === 'signup-otp-verify'"));
check(reqBody.indexOf('verifyTurnstile') > 0 && reqBody.indexOf('verifyTurnstile') < reqBody.indexOf('checkEmailReachable') && reqBody.indexOf('verifyTurnstile') < reqBody.indexOf("rpc('signup_otp_request'"), 'it is checked before anything is looked up or any allowance is spent');
const loginStart = fn.indexOf("body?.action === 'otp-request'");
check(loginStart > 0 && !/verifyTurnstile/.test(fn.slice(loginStart, fn.indexOf("body?.action === 'otp-verify'"))), 'log-in code requests are NOT behind the check');
check(!/console\.\w+\([^)]*(turnstileToken|TURNSTILE_SECRET_KEY)/.test(fn), 'the token and secret are never logged');
check(/code: 'captcha_failed'/.test(fn), 'a refusal has a friendly message and a code');

section('3. The page');
check(/VITE_TURNSTILE_SITE_KEY as string \| undefined\) \|\| ''\)\.trim\(\)/.test(comp) && /if \(!turnstileEnabled\) return null;/.test(comp), 'no site key = the component renders nothing');
check(/if \(!turnstileEnabled\) return;/.test(comp) && comp.includes('challenges.cloudflare.com/turnstile/v0/api.js'), 'the script is only loaded when a key exists');
check(/role="group" aria-label="Security check"/.test(comp) && /role="alert"/.test(comp) && /Try again/.test(comp), 'it is labelled for screen readers and shows a retry on load failure');
check(/blocker = turnstileEnabled && !token && !failed/.test(comp), 'with no key, or when the widget failed to load, the request is never held back by the page');
check(/requestSignupOtp\(email\.trim\(\), turnstile\.token\)/.test(auth) && (auth.match(/turnstile\.consume\(\)/g) || []).length === 2 && (auth.match(/<TurnstileBox /g) || []).length === 2, 'sign-up form and Resend send a token and ask for a new one after each use');
check(/requestSignupOtp\(email, turnstile\.token\)/.test(oauth) && (oauth.match(/turnstile\.consume\(\)/g) || []).length === 2 && (oauth.match(/<TurnstileBox /g) || []).length === 2, 'the Google sign-up last step does the same');
check(/turnstileToken\?: string/.test(api) && /\.\.\.\(turnstileToken \? \{ turnstileToken \} : \{\}\)/.test(api), 'the API call sends the token only when there is one');
const li = auth.indexOf('const handleLoginSubmit');
check(li > 0 && !/turnstile/i.test(auth.slice(li, li + 3000)), 'the log-in handler does not mention the check');

section('4. Headers');
const lines = headers.split(/\r?\n/);
const rules = lines.filter((l) => /^\/\S*/.test(l)).length;
let rule = '', mainCsp = '';
for (const l of lines) { if (/^\S/.test(l) && !l.startsWith('#')) rule = l.trim(); if (rule === '/*' && /Content-Security-Policy:/.test(l)) mainCsp = l; }
check(!!mainCsp && /script-src[^;]*https:\/\/challenges\.cloudflare\.com/.test(mainCsp) && /frame-src https:;/.test(mainCsp), 'the main page rule allows the Turnstile script and frames');
check(rules <= 100, `still within the 100-rule limit (${rules})`);
check((headers.match(/challenges\.cloudflare\.com/g) || []).length === 1, 'only the one rule was extended');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
