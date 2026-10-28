// Guest support (the help chat on the login page, for people who are not logged in): the words and rules of the chat (guestSupportLogic.ts), how the browser is recognised, what is kept while
// the tab is open, and that the screen, the API layer and the two edge functions are wired the way the rules need. The database rules have their own test (test-guest-support-db.mjs) and the
// functions theirs (test-recover-account-function.mjs, test-ai-function.mjs). Nothing here needs a browser. Usage: node scripts/supabase/test-guest-support.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

const G = await import('../../src/components/Support/guestSupportLogic.ts');

section('1. Emails');
check(['ana@gmail.com', 'a.b+c@sub.example.co.in', " ana@gmail.com "].every(G.isEmail), 'normal addresses are emails');
check(['', 'ana', 'ana@', '@gmail.com', 'ana@gmail', 'ana @gmail.com', 'a@b@c.com', 'x'.repeat(250) + '@a.co'].every((x) => !G.isEmail(x)), 'things that are not emails are not');
check(G.findEmail('my email is Ana.Smith@Gmail.com please help') === 'ana.smith@gmail.com' && G.findEmail('no address here') === null && G.findEmail('') === null, 'an address inside a sentence is found (and lower-cased)');
const m1 = G.maskEmail('ana.smith@gmail.com');
check(m1 === 'a••••@g••••.com' && !m1.includes('smith') && !m1.includes('gmail') && m1.endsWith('.com'), 'a masked address shows only the first letters and the ending', m1);
check(G.maskEmail('a@b.in') === 'a@b.in' && G.maskEmail('nonsense') === '•••' && G.maskEmail('') === '•••', 'short or odd input never breaks it');

section('2. What a typed message means');
const code = ['send me otp', 'Send me the OTP please', 'otp bhejo', 'email me a code', 'mail me the login code', 'send code', 'I want a verification code', 'one time code please', 'code mail karo', 'otp', 'please send the code to my mail', 'give me a pin'];
check(code.every((t) => G.intentOf(t) === 'code'), 'asking for the emailed code is understood (English and Hinglish)', code.filter((t) => G.intentOf(t) !== 'code').join(' | '));
const forgot = ['I forgot my ID', 'i forgot my user id', 'forgot userid', 'I dont remember my username', "don't know my id", 'id yaad nahi', 'bhool gaya user id', 'I lost my user ID'];
check(forgot.every((t) => G.intentOf(t) === 'forgot_id'), 'saying the ID is forgotten is understood', forgot.filter((t) => G.intentOf(t) !== 'forgot_id').join(' | '));
const none = ['hello', 'how do I post a reel', 'what is NOOB', 'my account is locked', 'I cannot log in', 'the code of conduct', 'who made this', 'my id is ana_guest', 'password reset', ''];
check(none.every((t) => G.intentOf(t) === 'none'), 'ordinary questions are not mistaken for either', none.filter((t) => G.intentOf(t) !== 'none').join(' | '));
check(G.intentOf('I forgot my ID and send me an otp') === 'forgot_id', 'the forgotten ID comes first when both are said');

section('3. What may leave the screen');
check(G.redact('my email is ana.smith@gmail.com ok') === 'my email is a••••@g••••.com ok', 'a whole address in a message is hidden');
check(G.redact('code 482913 and phone 9876543210') === 'code •••••• and phone ••••••', 'a code or a phone number in a message is hidden');
check(G.redact('I have 3 chats and 12 posts') === 'I have 3 chats and 12 posts' && G.redact('') === '', 'ordinary numbers and words stay');
const codes = { '482913': '482913', '482 913': '482913', '482-913': '482913', 'my code is 482913': '482913', 'otp: 482913': '482913', 'The login code is 482 913.': '482913', 'code 482913': '482913' };
check(Object.entries(codes).every(([t, c]) => G.codeFromText(t) === c), 'a code typed as a message is found', Object.entries(codes).filter(([t, c]) => G.codeFromText(t) !== c).map(([t]) => t).join(' | '));
check(['', '12345', '1234567', '123456789', 'call 482913', 'I have 482913 problems', 'hello', '48291a'].every((t) => G.codeFromText(t) === null), 'but not other numbers or sentences');
check(G.hideId('ana_guest') === '@an•••' && G.hideId('@Ana') === '@An•••' && G.hideId('') === '@•••', 'a typed ID is shown back with most of it hidden');

section('4. The words for every answer of the server');
const emailStatuses = ['found', 'no_account', 'invalid_email', 'rate_limited', 'limit_reached', 'unavailable', 'something_new'];
check(emailStatuses.every((s) => G.emailAnswer(s, { masked: 'a•••@g•••.com', typed: 'x@y.com' }).text.length > 10), 'every email answer has words (even one nobody planned)');
check(/x@y\.com/.test(G.emailAnswer('no_account', { typed: 'x@y.com' }).text) && /could not find any NOOB account/.test(G.emailAnswer('no_account', { typed: 'x@y.com' }).text) && !G.emailAnswer('no_account', {}).ok, '"no account with this email" is said and asks for the email again');
check(/User ID/.test(G.emailAnswer('found', { masked: 'm', many: true }).text) && !/User ID/.test(G.emailAnswer('found', { masked: 'm', many: false }).text), 'several accounts on one email: the ID is announced');
check(/suspended/.test(G.emailAnswer('found', { masked: 'm', suspended: true }).text), 'a suspended account is told so');
check(G.beginAnswer('ok').ok && ['limit_reached', 'rate_limited', 'invalid_issue', 'invalid_email', 'unavailable'].every((s) => !G.beginAnswer(s).ok && G.beginAnswer(s).text.length > 10), 'starting a chat: one yes, every other answer has words');
check(new RegExp(`${G.GUEST_USES} times`).test(G.BLOCKED_TEXT) && G.GUEST_USES === 3, 'the used-up text says 3 times');
check(['match', 'forgot'].every((s) => G.idAnswer(s, 'a•••@g•••.com').ok && /a•••@g•••\.com/.test(G.idAnswer(s, 'a•••@g•••.com').text)) && ['mismatch', 'invalid_id', 'need_id', 'no_account', 'rate_limited', 'bad_case', 'unavailable'].every((s) => !G.idAnswer(s, 'm').ok), 'ID answers: two yes (naming the hidden address), the rest no');
const reqStatuses = ['cooldown', 'rate_limited', 'case_limit', 'id_required', 'need_id', 'no_account', 'suspended', 'not_configured', 'send_failed', 'bad_case', 'unavailable'];
check(reqStatuses.every((s) => !G.codeRequestAnswer(s, 31).ok && G.codeRequestAnswer(s, 31).text.length > 10) && /31 seconds/.test(G.codeRequestAnswer('cooldown', 31).text), 'every "no code" answer has words (the wait in seconds too)');
const chkStatuses = ['mismatch', 'bad_format', 'missing', 'expired', 'too_many_attempts', 'case_locked', 'rate_limited', 'suspended', 'token_failed', 'bad_case', 'id_required', 'unavailable'];
check(chkStatuses.every((s) => G.codeCheckAnswer(s).text.length > 10), 'every wrong-code answer has words');
check(!G.codeCheckAnswer('mismatch').fatal && !G.codeCheckAnswer('bad_format').fatal && ['expired', 'too_many_attempts', 'case_locked', 'rate_limited', 'suspended', 'token_failed'].every((s) => G.codeCheckAnswer(s).fatal), 'a wrong digit can be tried again; a dead code is a new-code matter');
check(/6-digit/.test(G.codeSentText('a•••@g•••.com', 2)) && /last code/.test(G.codeSentText('m', 0)) && !/last code/.test(G.codeSentText('m', 2)), 'the "code sent" text names the hidden address and the last code');
const allText = [G.greeting(3), G.greeting(1), G.BLOCKED_TEXT, G.UNAVAILABLE_TEXT, G.idPrompt(true), G.idPrompt(false), ...emailStatuses.map((s) => G.emailAnswer(s).text), ...chkStatuses.map((s) => G.codeCheckAnswer(s).text), ...reqStatuses.map((s) => G.codeRequestAnswer(s).text)].join('\n');
check(!/[A-Za-z0-9._-]+@[A-Za-z0-9-]+\.[a-z]{2,}/i.test(allText.replace(/name@gmail\.com/g, '')), 'no fixed text contains a real address');
check(/3 times|\*\*1\*\* guest help chat /.test(G.greeting(3) + G.greeting(1)) && /\*\*2\*\* guest help chats/.test(G.greeting(2)), 'the greeting says how many uses are left (chat / chats)');
check(G.ISSUES.length === 6 && G.ISSUES.filter((i) => i.text).length === 5 && new Set(G.ISSUES.map((i) => i.kind)).size === 6 && G.ISSUES.every((i) => i.text.length <= 100), 'six problems to pick from (the last one is "something else", in the person\'s own words)');

section('5. When may a code be offered');
const ca = (o) => G.codeAllowed({ accountFound: true, many: false, idState: 'none', ...o });
check(!G.codeAllowed({ accountFound: false, many: false, idState: 'matched' }).ok && G.codeAllowed({ accountFound: false, many: false, idState: 'matched' }).why === 'no_account', 'no account: never');
check(ca({ idState: 'matched' }).ok && ca({ idState: 'forgot' }).ok, 'one account: the right ID, or "I forgot", is enough');
check(!ca({}).ok && ca({}).why === 'id_required' && !ca({ idState: 'mismatch' }).ok, 'one account, the ID step not done (or wrong): not yet');
check(ca({ many: true, idState: 'matched' }).ok && !ca({ many: true, idState: 'forgot' }).ok && ca({ many: true, idState: 'forgot' }).why === 'need_id' && ca({ many: true }).why === 'need_id', 'several accounts on one email: only the right ID will do');
check(!ca({ idState: 'matched', suspended: true }).ok && ca({ idState: 'matched', suspended: true }).why === 'suspended', 'a suspended account: never');

section('6. How the browser is recognised');
const mk = (local, cookie, random = 'r'.repeat(20)) => {
  const s = { local, cookie, writes: [], cwrites: [], random: () => random };
  return { s, store: { getItem: () => s.local, setItem: (_k, v) => { s.local = v; s.writes.push(v); }, cookie: { read: () => s.cookie, write: (_n, v) => { s.cookie = v; s.cwrites.push(v); } }, random: s.random } };
};
const A = 'a'.repeat(24), B = 'b'.repeat(24);
let t = mk(null, null);
check(G.browserIdFrom(t.store) === 'r'.repeat(20) && t.s.local === 'r'.repeat(20) && t.s.cookie === 'r'.repeat(20), 'a new browser gets a random id, kept in both places');
t = mk(A, null);
check(G.browserIdFrom(t.store) === A && t.s.cookie === A && t.s.writes.length === 0, 'the page storage is cleared of nothing: the cookie is filled from it');
t = mk(null, B);
check(G.browserIdFrom(t.store) === B && t.s.local === B, 'clearing only the page storage does not make a new browser (the cookie brings it back)');
t = mk(A, B);
check(G.browserIdFrom(t.store) === A && t.s.cookie === A, 'if the two differ, the storage wins and the cookie is made the same');
t = mk('bad id!', '<script>');
check(G.browserIdFrom(t.store) === 'r'.repeat(20), 'a damaged or foreign value is thrown away');
const blocked = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); }, cookie: { read: () => { throw new Error('no'); }, write: () => { throw new Error('no'); } }, random: () => 'q'.repeat(18) };
check(G.browserIdFrom(blocked) === 'q'.repeat(18), 'with storage and cookies both blocked it still answers (a per-visit id; the network limits still hold)');
check(/^[A-Za-z0-9_-]{16,80}$/.test(G.browserIdFrom(mk(null, null, 'f47ac10b-58cc-4372-a567-0e02b2c3d479').store)), 'a UUID is an accepted id');

section('7. What is kept while the tab is open');
const base = { v: 1, savedAt: 1_000_000, caseId: 'c1', caseKey: 'k'.repeat(64), masked: 'a•••@g•••.com', step: 'chat', accountFound: true, many: false, suspended: false, idState: 'matched', remaining: 2, codeSentAt: null, sendsLeft: 3,
  messages: [{ id: 'm1', from: 'bot', text: 'hi', time: '1:00 PM' }, { id: 'm2', from: 'user', text: 'a•••@g•••.com', time: '1:01 PM' }] };
const now = 1_000_000 + 60_000;
const ok = G.loadSaved(JSON.stringify(base), now);
check(ok && ok.caseId === 'c1' && ok.messages.length === 2 && ok.idState === 'matched', 'a chat saved a minute ago comes back');
check(G.loadSaved(JSON.stringify(base), 1_000_000 + 25 * 3600 * 1000) === null && G.loadSaved(JSON.stringify(base), 1_000_000 - 3 * 60_000) === null, 'a chat older than 24 hours (or from the future) does not');
check([null, '', 'not json', '{}', JSON.stringify({ ...base, v: 2 }), JSON.stringify({ ...base, caseKey: '' }), JSON.stringify({ ...base, caseId: 5 }), JSON.stringify({ ...base, messages: 'x' }), JSON.stringify({ ...base, savedAt: 'x' })].every((r) => G.loadSaved(r, now) === null), 'damaged or foreign saves are ignored');
const dirty = G.loadSaved(JSON.stringify({ ...base, messages: [{ from: 'bot', text: 'ok' }, { from: 'root', text: 'x' }, null, { from: 'user', text: 7 }, ...Array.from({ length: 90 }, (_, i) => ({ id: `n${i}`, from: 'user', text: `t${i}`, time: '' }))] }), now);
check(dirty && dirty.messages.length === 60 && dirty.messages.every((m) => m.from === 'bot' || m.from === 'user'), 'bad messages are dropped and at most 60 are kept');
check(!Object.keys(base).some((k) => /email$|^email|code$|^code|otp|password/i.test(k) && k !== 'codeSentAt'), 'the saved shape has no field for the email, the code or a password');

section('8. The screen and the wiring');
const screen = read('src/components/Support/GuestSupport.tsx');
const auth = read('src/components/Auth/AuthView.tsx');
const api = read('src/services/api.ts');
const sapi = read('src/services/supabaseApi.ts');
const css = read('src/components/Support/guestSupport.css');
const feats = read('src/utils/features.ts');
check(/const GuestSupport = React\.lazy\(\(\) => import\('\.\.\/Support\/GuestSupport'\)/.test(auth) && /<React\.Suspense fallback=/.test(auth) && /<GuestSupport onClose=\{\(\) => setGuestHelpOpen\(false\)\}/.test(auth), 'the login page loads the chat only when it is opened');
check(/data-testid="guest-help-button"/.test(auth) && /\/noob-support-character\.png/.test(auth.slice(auth.indexOf('guest-help-button') - 400, auth.indexOf('guest-help-button') + 900)), 'the login page has the support character as a button');
check(/\(s\.disabledFeatures \?\? \[\]\)\.includes\('support'\)/.test(auth) && /guestHelpOn && !guestHelpOpen && !deviceConflict/.test(auth), 'the button is hidden while the administrator has the Support page switched off');
check(/key: 'support'/.test(feats), 'and that switch exists (Admin > Pages)');
check(/onLoggedIn=\{\(u\) => \{ setGuestHelpOpen\(false\); void proceedAfterAuth\(u\); \}\}/.test(auth), 'a correct code goes through the same device check as every other login');
check(['guestSupportStatus', 'guestSupportCheckEmail', 'guestSupportBegin', 'guestSupportCheckId', 'guestSupportRequestCode', 'guestSupportVerifyCode', 'guestSupportClose', 'askGuestSupportAssistant'].every((f) => new RegExp(`\\b${f}\\b`).test(api) && new RegExp(`export (async )?(function|const) ${f}\\b`).test(sapi)), 'the screen reaches the server only through the API layer (all 8 calls exported)');
check(!/from '\.\.\/\.\.\/services\/supabase'|supabase\.(from|rpc|auth|functions)/.test(screen), 'the screen itself never talks to the database');
check(!/dangerouslySetInnerHTML|innerHTML/.test(screen), 'nothing the person or the helper writes is shown as html');
check(!/localStorage/.test(screen) && (screen.match(/sessionStorage\.(setItem|removeItem|getItem)/g) || []).length === 4, 'the screen keeps one thing in the tab (the chat) and nothing in the browser for good');
const saveBlock = screen.slice(screen.indexOf('const save: SavedChat'), screen.indexOf('} catch { /* storage full'));
check(saveBlock.length > 200 && !/\bemail\b(?!')/.test(saveBlock) && /messages: msgs\.slice\(-60\)\.map\(\(m\) => \(\{ id: m\.id, from: m\.from, text: m\.text, time: m\.time \}\)\)/.test(saveBlock) && !/codeIn|shown/.test(saveBlock), 'what is saved has no email, no typed code and not what the person typed (only the hidden text)');
check(/askGuestSupportAssistant\(redact\(text\), history, \{ \.\.\.chatCase, browser: browser\.current \}\)/.test(screen) && /msgs\.slice\(-6\)\.map\(\(m\) => \(\{ sender: m\.from, text: m\.text \}\)\)/.test(screen) && !/askGuestSupportAssistant\([^)]*\b(email|codeIn)\b/.test(screen), 'the helper\'s AI gets the message with addresses and numbers hidden, the last 6 hidden messages, and never the email or the code');
check(/guestSupportBegin\(browser\.current, email, issue, kind\)/.test(screen) && /const issue = redact\(typed\)/.test(screen), 'the problem is sent with addresses and numbers hidden');
check(/hear\(maskEmail\(typed\), typed\)/.test(screen) && /hear\(hideId\(t\)/.test(screen) && /hear\('••••••'\)/.test(screen), 'the typed email, ID and code are shown to the person but kept only hidden');
check(/maxLength=\{6\}/.test(screen) && /autoComplete="one-time-code"/.test(screen) && /inputMode="numeric"/.test(screen) && /codeIn\.length === 6\) void verifyCode\(codeIn\)/.test(screen), 'the code box takes 6 digits, offers the phone\'s "code from email" suggestion, and logs in by itself when all 6 are typed');
check(/verifying\.current/.test(screen) && /disabled=\{codeIn\.length !== 6 \|\| busy\}/.test(screen), 'one try at a time (no double sends)');
check(/wait > 0 \|\| busy/.test(screen) && /COOLDOWN_MS = 45000/.test(screen), 'a new code can be asked for after 45 seconds');
check(/PANEL_CLOSING/.test(screen) && /'case_locked', 'bad_case', 'suspended', 'rate_limited'/.test(screen), 'when nothing more can be done, the code box closes');
check(/window\.setTimeout\(\(\) => onLoggedIn\(res\.user as User\), 700\)/.test(screen) && /done\.current = true/.test(screen), 'after the right code the chat is forgotten and the person is logged in');
check(/setConfirmEnd\(true\)/.test(screen) && /guestSupportClose\(browser\.current, chatCase\)/.test(screen), 'ending a chat needs a second tap, then the server closes it');
check(/otp\.sentAt \? codeFromText\(text\) : null/.test(screen) && /verifyCode\(typedCode, true\)/.test(screen), 'a code typed into the chat works too (but only once one was sent)');
check(/setStep\('id'\)/.test(screen) && /idOverride \?\? idState/.test(screen) && /forgotId\(undefined, true\)\) await requestCode\('forgot'\)/.test(screen), 'asking for a code before the ID step is done leads to the ID step, or counts as "I forgot"');
check(/I don&apos;t have an account yet/.test(screen) && /typedBad && /.test(screen), 'after "no account with this email", the person can still ask for help without an account');
check(['.gs-dock', '.gs-actions', '.gs-field input', '.gs-otp', '.gs-code', '.gs-error', '.gs-row', '.gs-blocked'].every((c) => css.includes(c)), 'the styles of every new part exist');
check(/import '\.\/supportDesk\.css'/.test(screen) && /import '\.\/guestSupport\.css'/.test(screen), 'it uses the support desk look');

section('9. The two functions and the database');
const rec = read('supabase/functions/recover-account/index.ts');
const dyn = read('supabase/functions/dynamic-handler/index.ts');
const mig = read('supabase/migrations/20261029000001_guest_support.sql');
check(['guest-support-status', 'guest-support-email', 'guest-support-begin', 'guest-support-id', 'guest-support-otp-request', 'guest-support-otp-verify', 'guest-support-close'].every((a) => rec.includes(`'${a}'`)), 'the sign-in function answers all 7 guest actions');
check(/req\.headers\.get\('cf-connecting-ip'\)/.test(rec), 'the network address is read from the header Cloudflare writes (a visitor can not make it up)');
check(/guest_support_touch/.test(dyn) && /THIS PERSON IS A GUEST/.test(dyn) && /Please start the chat from the Help button on the login page\./.test(dyn), 'the AI function answers a logged-out person only inside an open guest chat');
const names = [...new Set([...mig.matchAll(/create or replace function public\.(guest_support_[a-z_]+)\(/g)].map((m) => m[1]))];
const revoked = (mig.match(/revoke execute on function\s+([\s\S]*?)\s+from public, anon, authenticated;/) || [])[1] || '';
const granted = (mig.match(/grant execute on function\s+([\s\S]*?)\s+to service_role;/) || [])[1] || '';
check(names.length === 13 && names.every((n) => revoked.includes(`public.${n}(`) && granted.includes(`public.${n}(`)), 'all 13 guest database functions are closed to the public and open to the server only', names.filter((n) => !revoked.includes(`public.${n}(`) || !granted.includes(`public.${n}(`)).join(','));
check(/revoke all on public\.guest_support_secret from public, anon, authenticated/.test(mig) && /revoke all on public\.guest_support_browsers from public, anon, authenticated/.test(mig) && /revoke all on public\.guest_support_cases from public, anon, authenticated/.test(mig) && (mig.match(/enable row level security/g) || []).length === 3, 'the 3 new tables are closed to everyone but the server (and have row security on)');
const deletes = [...mig.matchAll(/delete from ([a-z_.]+)/gi)].map((m) => m[1]);
check(deletes.every((d) => d === 'public.recovery_otps') && !/\bdrop (table|column)\b|\btruncate\b|\balter table[^;]*\bdrop\b/i.test(mig), 'the migration touches no user data: the only delete is of old one-time codes (like every emailed-code login), nothing is dropped', deletes.join(','));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
