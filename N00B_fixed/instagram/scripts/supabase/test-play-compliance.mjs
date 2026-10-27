// Google Play and password-safety fixes of 2026-10-27. Usage: node --liftoff-only scripts/supabase/test-play-compliance.mjs
import fs from 'node:fs';
import { breachCount, sha1Hex } from '../../src/utils/pwnedPassword.ts';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8');

section('1. Leaked-password warnings');
check((await sha1Hex('password')) === '5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8', 'the fingerprint of a password is worked out the standard way');
let asked = '';
const list = async (u, init) => { asked = String(u) + '|' + JSON.stringify(init.headers); return { ok: true, text: async () => '1E4C9B93F3F0682250B6CF8331B7EE68FD8:3861493\r\n00000000000000000000000000000000000:0' }; };
check((await breachCount('password', list)) === 3861493, 'a password that is in the breach list is found');
check(asked.startsWith('https://api.pwnedpasswords.com/range/5BAA6|') && !asked.includes('1E4C9B93F3F0') && /Add-Padding/.test(asked), 'only the first 5 characters of the fingerprint are sent, padded');
check((await breachCount('x9#Kq!veryUnlikelyPassw0rd', list)) === 0, 'a password that is not in the list passes');
check((await breachCount('password', async () => { throw new Error('offline'); })) === 0 && (await breachCount('password', async () => ({ ok: false, text: async () => '' }))) === 0 && (await breachCount('')) === 0, 'when the check can not be made (offline, list down, empty) the password is accepted: it never stops anybody');
const auth = read('src/components/Auth/AuthView.tsx'), acct = read('src/components/Settings/pages/account.tsx'), headers = read('public/_headers');
check(/breachCount\(password\)\) > 0[\s\S]{0,160}BREACHED_PASSWORD_MESSAGE/.test(auth) && /breachCount\(next\)\) > 0/.test(acct), 'sign-up and change password refuse a leaked password, with a clear sentence');
check(/autoComplete="username"/.test(auth) && /autoComplete="current-password"/.test(auth) && /autoComplete="new-password"/.test(auth), 'the log-in and sign-up fields tell the browser which is the user ID, the current password and a new password');
check(/connect-src 'self' https:\/\/api\.pwnedpasswords\.com /.test(headers), 'the site may ask the breach list (one named address, never "anywhere")');

section('2. Google Play: no self-updating app, no cloud backup of private data');
const wf = read('../../.github/workflows/android-build.yml'), plug = read('android-overrides/AppUpdaterPlugin.java'), nu = read('src/services/nativeUpdate.ts');
check(/bundleRelease/.test(wf) && /REQUEST_INSTALL_PACKAGES" \/>##/.test(wf) && /The Play bundle must not ask to install apps/.test(wf), 'the bundle for Google Play is built without the permission to install apps, and the build stops if it is there');
check(wf.indexOf('REQUEST_INSTALL_PACKAGES" />##') > wf.indexOf('Build signed release AAB'), '...and that is done only for the Play bundle (the file people download from the website keeps its updater)');
check(/allowBackup="false"/.test(wf), 'no cloud backup of the app\'s private data (chat keys, saved logins)');
check(/installedFromPlay\(\)/.test(plug) && /"com\.android\.vending"\.equals\(source\)/.test(plug) && /out\.put\("fromPlay", installedFromPlay\(\)\)/.test(plug), 'the app knows whether it was installed from Google Play');
check(/if \(i\.fromPlay\) return \{ supported: false, canInstall: false/.test(nu), 'a copy from Google Play never looks for, offers or installs an app file');

section('3. India: complaints and rights, and what is collected');
for (const f of ['src/components/Legal/PrivacyPolicy.tsx', 'src/components/Legal/TermsAndConditions.tsx', 'public/privacy.html', 'public/terms.html']) {
  const t = read(f);
  check(/Contact, complaints and your rights/.test(t) && /within 24 hours/.test(t) && /15 days/.test(t) && /delete your account/.test(t) && /Data Protection Board/.test(t) && /13 and over/.test(t), `${f}: how to complain, the answer times, deleting data, the Data Protection Board, the minimum age`);
}
const doc = read('docs/GOOGLE-PLAY-CHECKLIST.md');
check(/Grievance Officer/.test(doc) && /Data safety/.test(doc) && /Play Billing/.test(doc) && /DPDP/.test(doc), 'the Google Play checklist says what is done and what only the owner can do');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
