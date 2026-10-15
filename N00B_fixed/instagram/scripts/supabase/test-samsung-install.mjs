// "Unsafe app blocked" on Samsung Internet: its own installer builds NOOB for an old Android, so Google Play Protect blocks it. On Samsung Internet the Install button
// opens Chrome instead (src/utils/pwaInstall.ts). Usage: node scripts/supabase/test-samsung-install.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const P = await import(pathToFileURL(path.resolve('src/utils/pwaInstall.ts')).href);

section('1. Who is on Samsung Internet');
const samsung = 'Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36';
const chrome = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const desktop = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0';
check(P.isSamsungInternet(samsung) === true, 'Samsung Internet on Android: yes');
check(P.isSamsungInternet(chrome) === false && P.isSamsungInternet(iphone) === false && P.isSamsungInternet(desktop) === false && P.isSamsungInternet('') === false, 'Chrome, iPhone and PC browsers: no (they install the normal way)');

section('2. The Chrome link');
const u = P.chromeInstallUrl('https://noobsocials.com/?x=1#h');
check(u === 'intent://noobsocials.com/?x=1&install=1#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent('https://noobsocials.com/?x=1&install=1#h') + ';end', 'opens the same page in Chrome, asking it to point at its own Install button', u);
check(P.chromeInstallUrl('https://noobsocials.com/').startsWith('intent://noobsocials.com/?install=1#Intent;scheme=https;package=com.android.chrome;'), 'the plain home page works too');
check(/S\.browser_fallback_url=https%3A%2F%2Fnoobsocials\.com%2F%3Finstall%3D1;end$/.test(P.chromeInstallUrl('https://noobsocials.com/')), 'if Chrome is not on the phone the page just stays where it is');
check(P.chromeInstallUrl('not an address') === 'not an address', 'a broken address is left alone');
check(/Google Play Protect/.test(P.SAMSUNG_INSTALL_HINT) && /Chrome/.test(P.SAMSUNG_INSTALL_HINT), 'the person is told why, and what to do if Chrome does not open');

section('3. Where it applies');
const auth = read('src/components/Auth/AuthView.tsx');
const prof = read('src/components/Profile/InstallAndPermissionsPage.tsx');
check(/if \(onSamsung\) \{[\s\S]{0,200}window\.location\.href = chromeInstallUrl\(window\.location\.href\);/.test(auth) && /Opens Chrome to install/.test(auth), 'the Install button on the login screen opens Chrome on Samsung Internet (and says so)');
check(/if \(isSamsungInternet\(\)\) \{[\s\S]{0,260}window\.location\.href = chromeInstallUrl\(window\.location\.href\);/.test(prof), 'and so does the Install button in Profile');
check(!/promptInstall\(\)[\s\S]{0,40}isSamsungInternet/.test(prof) && prof.indexOf('isSamsungInternet()') < prof.indexOf('await promptInstall()'), 'Samsung Internet never reaches the browser\'s own install prompt');

section('4. Staying up to date');
const dep = read('../../.github/dependabot.yml');
check(/package-ecosystem: "npm"/.test(dep) && /package-ecosystem: "gradle"/.test(dep) && /package-ecosystem: "github-actions"/.test(dep) && (dep.match(/interval: "weekly"/g) || []).length === 3, 'Dependabot checks the web app, the Android app and the build tools every week');
const vars = read('android/variables.gradle');
check(/targetSdkVersion = (3[5-9]|[4-9]\d)/.test(vars) && /compileSdkVersion = (3[5-9]|[4-9]\d)/.test(vars), 'the Android app is built for a current version of Android (target 35 or newer)', vars.match(/targetSdkVersion = \d+/)?.[0]);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
