// The black "NOOB has a new home" card shown on the old address (src/components/Common/MovedNotice.tsx), and the files that make sure a new version always
// reaches people (cache headers, version.json). Usage: node scripts/supabase/test-moved-notice.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const notice = read('src/components/Common/MovedNotice.tsx');
const S = await import(pathToFileURL(path.resolve('src/utils/siteUrl.ts')).href + '?x=' + Math.random());

section('1. Who sees it');
check(S.isOtherNoobHost('nooob.xyz') && S.isOtherNoobHost('www.nooob.xyz') && S.isOtherNoobHost('NOOOB.XYZ'), 'nooob.xyz (and www.) is the old address');
check(!S.isOtherNoobHost('noobsocials.com') && !S.isOtherNoobHost('www.noobsocials.com'), 'noobsocials.com is not');
check(!S.isOtherNoobHost('ai.nooob.xyz') && !S.isOtherNoobHost('coaching.nooob.xyz') && !S.isOtherNoobHost('localhost') && !S.isOtherNoobHost('example.com') && !S.isOtherNoobHost('nooob.xyz.evil.io') && !S.isOtherNoobHost(''), 'NOOB AI, NOOB STUDY, test addresses and other websites are not');
check(/movedNoticeApplies\(isOnOtherNoobAddress\(\), window\.location\.hostname, window\.location\.search\)/.test(notice), 'it is shown when the page is on the old address');
const fnSrc = /export function movedNoticeApplies[\s\S]*?\n}\n/.exec(notice)[0].replace(/: boolean/g, '').replace(/: string/g, '');
const applies = new Function(fnSrc.replace('export function movedNoticeApplies', 'return function movedNoticeApplies'))();
check(applies(true, 'nooob.xyz', '') === true, 'old address: shown');
check(applies(false, 'noobsocials.com', '') === false && applies(false, 'noobsocials.com', '?show=moved') === false, 'new address: never, even with the preview word');
check(applies(false, 'localhost', '') === false && applies(false, 'localhost', '?show=moved') === true, 'on a developer\'s own computer it shows only when asked (?show=moved)');

section('2. What it says and does');
check(/>NOOB<\/p>/.test(notice) && /We have a new home/.test(notice) && /We have changed our domain/.test(notice) && /all your data has been shifted there exactly as it was/.test(notice), 'NOOB at the top, a new-home heading, the domain-change message and the data message');
check(/href=\{MAIN_SITE\}/.test(notice) && /\{host\}/.test(notice), 'it shows the new address as a link');
check(/window\.location\.assign\(installAddress\(\)\)/.test(notice) && /Install NOOB from/.test(notice), 'the Install button opens the new address ready to install');
check(/backgroundColor: '#000000'/.test(notice) && /rounded-\[30px\]/.test(notice) && /border-dashed/.test(notice) && (notice.match(/<Doodle /g) || []).length >= 8, 'a curved, fully black card with white doodles and a dashed stitch');
check(!/Not now/.test(notice) && !/<button type="button" onClick=\{close\}/.test(notice) && !/setOpen/.test(notice), 'there is no close button: nobody can dismiss it');
const bypassSrc = /export function bypassRequested[\s\S]*?\n}\n/.exec(notice)[0].replace(/: boolean/g, '').replace(/: string/g, '');
const bypass = new Function(bypassSrc.replace('export function bypassRequested', 'return function bypassRequested'))();
check(bypass('?old=1', false) === true && bypass('', true) === true && bypass('', false) === false && bypass('?old=2', false) === false && bypass('?x=1', false) === false, 'only the support link ?old=1 (kept for that visit) gets past it, nothing else does');
check(/<MovedNotice \/>/.test(read('src/main.tsx')), 'it is mounted over the whole app');

section('3. Updates always reach people');
const headers = read('public/_headers');
check(/\/version\.json\s*\n\s*Cache-Control: no-store/.test(headers) && /\/index\.html\s*\n\s*Cache-Control: no-cache/.test(headers) && /\/sw\.js\s*\n\s*Cache-Control: no-cache/.test(headers), 'the page, version.json and the service worker are never cached');
const vite = read('vite.config.ts');
check(/writeFileSync\(path\.resolve\(outDir, 'version\.json'\), JSON\.stringify\(\{ buildId \}\)\)/.test(vite) && /__BUILD_ID__: JSON\.stringify\(buildId\)/.test(vite), 'every build writes version.json with the same id it bakes into the app');
const app = read('src/App.tsx');
check(/useUpdateAvailable\(\)/.test(app) && (app.match(/<UpdateAvailableBanner \/>/g) || []).length >= 6, 'every screen of the app shows the update banner');
check(/shouldAutoApplyUpdate\(/.test(read('src/utils/appVersion.ts')), 'and updates itself when reopened after being away (see test-app-update)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
