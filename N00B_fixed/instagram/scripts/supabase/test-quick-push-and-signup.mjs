// Turning notifications on, and entering the sign-up code, must feel instant: "Turn on" closes the prompt at once and finishes in the background (also after being offline),
// and the code check waits only for what the app needs to show itself. (Both were also run in a real browser against a deliberately slow pretend server.)
// Usage: node --liftoff-only scripts/supabase/test-quick-push-and-signup.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const prompt = read('src/components/Common/PushNotificationPrompt.tsx');
const app = read('src/App.tsx');
const auth = read('src/components/Auth/AuthView.tsx');
const api = read('src/services/supabaseApi.ts');
const R = await import(pathToFileURL(path.resolve('src/utils/pushRetry.ts')).href);

section('1. The helpers');
check(R.nextDelay(0) === 5000 && R.nextDelay(3) === 120000 && R.nextDelay(4) === null && R.nextDelay(-1) === null, 'new tries come after 5 s, 15 s, 45 s, 2 min, then only when the phone is online / the app is opened again');
check(R.isRetryableFailure({ name: 'TimeoutError' }) && R.isRetryableFailure(new Error('network')) && !R.isRetryableFailure({ name: 'NotAllowedError' }) && !R.isRetryableFailure({ name: 'NotSupportedError' }), 'a lost connection or a time-out is tried again; a refusal is not');
let slow = '';
try { await R.withTimeout(new Promise(() => undefined), 30, 'Subscribing'); } catch (e) { slow = `${e.name}: ${e.message}`; }
check(/^TimeoutError: Subscribing took longer than/.test(slow), 'a step that never answers ends with a time-out instead of hanging', slow);
check(await R.withTimeout(Promise.resolve(7), 50, 'x') === 7, 'a step that answers in time is passed through');
let rejected = '';
try { await R.withTimeout(Promise.reject(new Error('boom')), 50, 'x'); } catch (e) { rejected = e.message; }
check(rejected === 'boom', 'and so is its own error');
const store = new Map();
const fake = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
R.writePending(true, fake);
check(R.readPending(fake) === true && store.get(R.PENDING_KEY) === '1', 'the "finish this later" note is written');
R.writePending(false, fake);
check(R.readPending(fake) === false, 'and cleared');
check(R.readPending({ getItem() { throw new Error('private mode'); } }) === false, 'a browser that refuses storage does not break it');

section('2. Notifications: "Turn on" closes the prompt at once');
check(/const handleEnable = \(\) => \{\s*startEnablingPush\(\);\s*dismiss\(\);\s*\};/.test(prompt) && !/handleEnable = async/.test(prompt), 'the tap starts the job and closes the prompt in the same moment; nothing is waited for');
check(!/Enabling…/.test(prompt) && !/disabled=\{loading\}/.test(prompt) && !/useState/.test(prompt), 'there is no "Enabling…" state that could stay on the screen');
const start = prompt.slice(prompt.indexOf('export function startEnablingPush'), prompt.indexOf('export function resumePendingPush'));
check(/try \{ asked = Promise\.resolve\(Notification\.requestPermission\(\)\); \}/.test(start) && start.indexOf('requestPermission') < start.indexOf('.then('), "the browser's own question is asked inside the tap itself, before anything else (an iPhone refuses it otherwise)");
check(/writePending\(true\);[^\n]*\n\s*setupAttempt = 0;\s*\n\s*return runPendingSetup\(\);/.test(start), 'the job is written down first, so a closed app or an offline phone does not lose it');
check(/useEffect\(\(\) => \{ warmPushSetup\(\); \}, \[\]\)/.test(prompt) && /async function loadVapidKey/.test(prompt) && /cachedVapidKey/.test(prompt), 'the key and the notification helper are got ready while the person reads the question');
const sub = prompt.slice(prompt.indexOf('async function subscribeThisDevice'), prompt.indexOf('export async function enablePushNotifications'));
check((sub.match(/withTimeout\(/g) || []).length >= 6, 'every step that talks to the network has a time limit', String((sub.match(/withTimeout\(/g) || []).length));
check(/found\.failed \? \{ status: 'error', reason: 'save', retryable: true \} : \{ status: 'error', reason: 'not-set-up' \}/.test(sub), '"no connection" is tried again later; "the server has no key" is not');
check(/enablePushNotifications[\s\S]*return await subscribeThisDevice\(\)/.test(prompt), 'the switch in Install and Permissions uses the same, faster steps');
const run = prompt.slice(prompt.indexOf('async function runPendingSetup'), prompt.indexOf('function listenForRetries'));
check(/navigator\.onLine === false\) return;/.test(run) && /Notification\.permission !== 'granted'\) \{ writePending\(false\)/.test(run) && /nextDelay\(setupAttempt\+\+\)/.test(run), 'offline: it waits; permission taken back: it stops; otherwise it tries again on the schedule');
check(/addEventListener\('online'/.test(prompt) && /visibilitychange/.test(prompt), 'it also starts again when the phone is back online and when the app is opened');
check(/resumePendingPush\(\);/.test(app) && /resumePendingPush \} from '\.\/components\/Common\/PushNotificationPrompt'/.test(app), 'when the app starts for a signed-in person, an unfinished "turn on" is finished');
check(/setTimeout\(\(\) => setShowPushPrompt\(true\), 1500\)/.test(app), 'the question appears 1.5 seconds after login instead of 4');
check(/fetchVapidKeyResult/.test(read('src/services/api.ts')) && /export async function fetchVapidKeyResult/.test(api), 'the key lookup can tell "no connection" from "no key"');

section('3. Sign-up code: the person is let in as soon as the app can be shown');
const verify = api.slice(api.indexOf('export async function verifySignupOtp'), api.indexOf('// Shared by signupUser and verifySignupOtp'));
check(!/await uploadPendingSignupAvatar/.test(verify) && /void uploadPendingSignupAvatar\(pendingKey\)\.then/.test(verify), 'the profile photo is saved in the background, not waited for');
check(/const user = await rpc<any>\('get_my_user'\);/.test(verify) && (verify.match(/await /g) || []).length <= 6, 'only the profile is read before the person goes in');
check(/shown\.avatar = preview/.test(verify) && /pendingAvatarPreview/.test(api) && /noob:own-avatar/.test(api), 'meanwhile the photo shows from the phone\'s own copy, and the app is told when the saved one is ready');
check(/App|window\.addEventListener\('noob:own-avatar'/.test(app) && /u\.id === d\.userId \? \{ \.\.\.u, avatar: d\.avatar \}/.test(app), 'the app swaps in the saved photo when it is announced');
check(/attempt >= 3\) throw err/.test(api), 'saving the photo to the profile is tried three times (it runs unattended now)');
check(!/await proceedAfterAuth\(res\.user\)[\s\S]{0,80}else if \(res\.suspended\)/.test(auth) && /void checkAndRegisterDevice\(getDeviceId\(\), getDeviceLabel\(\)\);\s*\n\s*onAuthSuccess\(res\.user\);/.test(auth), 'a brand-new account goes straight in; this device is noted in the background');
check(/v\.length === 6 && !signupOtpLoading\) window\.setTimeout\(\(\) => otpFormRef\.current\?\.requestSubmit\(\), 0\)/.test(auth), 'the code is sent by itself as soon as the sixth digit is in');
check(/setTimeout\(\(\) => setSignupOtpSlow\(true\), 7000\)/.test(auth) && /data-testid="otp-slow-note"/.test(auth) && /window\.clearTimeout\(slowTimer\)/.test(auth), 'if it takes more than 7 seconds the screen says the connection looks slow instead of looking frozen');
check(/Creating your account…/.test(auth) && !/signupOtpLoading \? 'Verifying…'/.test(auth), 'and the button says what is happening');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
