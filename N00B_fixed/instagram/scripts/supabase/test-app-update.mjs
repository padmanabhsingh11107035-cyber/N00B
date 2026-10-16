// "Update NOOB": ordinary changes reach everybody by themselves (the website, the home-screen app and the Android app, which shows the live website); only when something NATIVE in the
// Android app changes does it need a new app file, and then one button downloads it and opens Android's installer. Checks the rules, the pieces and how they are wired.
// (The installer itself runs on a phone; it is compiled by the Android build and can only be tried there.)
//
// Usage: node scripts/supabase/test-app-update.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

globalThis.window = { location: { href: 'https://noobsocials.com/' } };
const V = await import('../../src/utils/appVersion.ts');
const N = await import('../../src/services/nativeUpdate.ts');

section('1. Which version is newer');
check(V.updateState('1792145495613', '1792146427520') === 'newer', 'a build made later is newer');
check(V.updateState('1792146427520', '1792146427520') === 'newest' && V.updateState('1792146427520', '1792145495613') === 'newest', 'the same build, or an older one on the server, is up to date');
check(V.updateState('', '1792146427520') === 'unknown' && V.updateState('1792146427520', null) === 'unknown' && V.updateState('1792146427520', undefined) === 'unknown', 'when either is not known the page says so, it never guesses');
check(V.updateState('abc', 'abd') === 'newer' && V.updateState('abc', 'abc') === 'newest', 'build names that are not numbers still compare');
check(N.parseNativeBuild('The newest NOOB app. Native build: 42. Built from commit abc1234') === 42 && N.parseNativeBuild('no number here') === null && N.parseNativeBuild(null) === null, 'the app build number is read from the release notes');
check(N.nativeUpdateState(10, 11) === 'newer' && N.nativeUpdateState(11, 11) === 'newest' && N.nativeUpdateState(12, 11) === 'newest' && N.nativeUpdateState(null, 11) === 'unknown' && N.nativeUpdateState(10, null) === 'unknown', 'the app is told to update only when a newer app file really exists');

section('2. The Android app shows the live website, so ordinary changes arrive by themselves');
const cfg = JSON.parse(read('capacitor.config.json'));
check(cfg.server?.url === 'https://noobsocials.com' && cfg.server.androidScheme === 'https', 'the app opens the live website (not a frozen copy inside the app file)');
check(Array.isArray(cfg.server.allowNavigation) && cfg.server.allowNavigation.includes('noobsocials.com') && cfg.server.allowNavigation.includes('nooob.xyz'), 'both of NOOB’s addresses stay inside the app');
check(cfg.server.errorPath === 'native-offline.html' && fs.existsSync('public/native-offline.html') && /No connection/.test(read('public/native-offline.html')) && /noob-icon-192\.png/.test(read('public/native-offline.html')), 'with no connection the app shows a NOOB "No connection" page with a way to try again, not the phone’s error page');
check(/connect-src[^;]*https:\/\/api\.github\.com/.test(read('public/_headers')), 'the website may ask GitHub for the newest app build number');

section('3. The installer inside the app (native)');
const java = read('android-overrides/AppUpdaterPlugin.java');
const main = read('android-overrides/MainActivity.java');
check(/@CapacitorPlugin\(name = "AppUpdater"\)/.test(java) && /registerPlugin\(AppUpdaterPlugin\.class\);\s*super\.onCreate/.test(main), 'the installer is registered before the app starts');
check(/ALLOWED_PREFIX = "https:\/\/github\.com\/padmanabhsingh11107035-cyber\/N00B\/releases\/download\/"/.test(java) && /!address\.startsWith\(ALLOWED_PREFIX\)/.test(java), 'it downloads only from NOOB’s own release page, never from any other address');
check(/MIN_BYTES/.test(java) && /MAX_BYTES/.test(java), 'and only a file of a sensible size');
check(/canRequestPackageInstalls/.test(java) && /ACTION_MANAGE_UNKNOWN_APP_SOURCES/.test(java) && /needsPermission/.test(java), 'the first time it sends the person to the one Android setting that allows it, then asks them to tap Update again');
check(/application\/vnd\.android\.package-archive/.test(java) && /FileProvider\.getUriForFile/.test(java) && /ACTION_VIEW/.test(java), 'it opens Android’s installer, which asks the person to confirm (an app can never install itself silently)');
check(/notifyListeners\("progress"/.test(java), 'it reports the download as it goes');
const wf = read('../../.github/workflows/android-build.yml');
check(/AppUpdaterPlugin\.java/.test(wf) && /REQUEST_INSTALL_PACKAGES/.test(wf) && /grep -q REQUEST_INSTALL_PACKAGES/.test(wf), 'the build adds the installer and the permission Android needs, and stops if the permission did not get in');
check(/debug\.keystore/.test(wf) && fs.existsSync('android-overrides/debug.keystore'), 'every build is signed with the same key, so a new app file installs OVER the old one');
check(/gh release upload android-latest NOOB\.apk native\.json --clobber/.test(wf) && /Native build: \$\{\{ github\.run_number \}\}/.test(wf) && /permissions:\s+contents: write/.test(wf), 'every build publishes the app file, and its build number, where the button looks');
check(/on:[\s\S]*?paths:\s+- 'N00B_fixed\/instagram\/android-overrides\/\*\*'\s+- 'N00B_fixed\/instagram\/capacitor\.config\.json'/.test(wf) && !/- 'N00B_fixed\/instagram\/\*\*'/.test(wf), 'a new app file is built only when something native changes (not for every website change)');
check(/ANDROID_APK_URL = 'https:\/\/github\.com\/padmanabhsingh11107035-cyber\/N00B\/releases\/download\/android-latest\/NOOB\.apk'/.test(read('src/utils/appVersion.ts')), 'the website and the app point at the same app file');

check(/public void getLatest\(/.test(java) && /android-latest\/native\.json/.test(java) && /json\.getLong\("build"\)/.test(java), 'the app looks up the newest build number itself, from a tiny file published next to the app file (no browser rule or request limit in the way)');
check(/native\.json/.test(wf) && /gh release upload android-latest NOOB\.apk native\.json --clobber/.test(wf), 'every build publishes that file too');

section('3b. Updating by itself');
const ctx = { state: 'newer', supported: true, canInstall: true, busy: false, visible: true, editingText: false, mediaPlaying: false, latest: 165, tried: null, now: 1_000_000_000 };
check(N.shouldAutoInstall(ctx) === true, 'a newer app file, Android already allows NOOB to install: it starts by itself');
check(N.shouldAutoInstall({ ...ctx, state: 'newest' }) === false && N.shouldAutoInstall({ ...ctx, state: 'unknown' }) === false, 'nothing starts when the app is the newest or it could not be found out');
check(N.shouldAutoInstall({ ...ctx, canInstall: false }) === false, 'before Android has been told NOOB may install apps, nothing starts by itself: the bar asks once');
check(N.shouldAutoInstall({ ...ctx, supported: false }) === false, 'an app from before the installer existed is never started by itself (it can only download the file)');
check(N.shouldAutoInstall({ ...ctx, editingText: true }) === false && N.shouldAutoInstall({ ...ctx, mediaPlaying: true }) === false && N.shouldAutoInstall({ ...ctx, visible: false }) === false && N.shouldAutoInstall({ ...ctx, busy: true }) === false, 'never while someone is typing, a video or call is playing, the app is behind another, or it is already working');
check(N.shouldAutoInstall({ ...ctx, tried: { build: 165, at: ctx.now - 3600_000 } }) === false, 'after one try for this build (say the person dismissed Android’s screen) it does not start again for 12 hours');
check(N.shouldAutoInstall({ ...ctx, tried: { build: 165, at: ctx.now - N.AUTO_RETRY_MS - 1 } }) === true && N.shouldAutoInstall({ ...ctx, tried: { build: 164, at: ctx.now - 60_000 }, latest: 165 }) === true, 'then it tries again, and a newer build is tried at once');
const bannerSrc = read('src/components/Common/NativeUpdateBanner.tsx');
check(/autoInstallDue\(u\.info, u\.busy\)/.test(bannerSrc) && /saveAutoTried\(u\.info\.latest\)/.test(bannerSrc) && /void u\.install\(\)/.test(bannerSrc), 'the bar that is on screen in the app starts it, and remembers which build it tried');
check(/PackageInstaller\.SessionParams/.test(java) && /USER_ACTION_NOT_REQUIRED/.test(java) && /STATUS_PENDING_USER_ACTION/.test(java) && /notifyListeners\("error"/.test(java), 'the installer asks Android to skip its screen where Android allows that, opens the screen where it does not, and reports a failure');
check(/installWithScreen\(file\)/.test(java) && /catch \(Exception sessionProblem\)/.test(java), 'and falls back to the older install screen if the package installer cannot be used');
check(/UPDATE_PACKAGES_WITHOUT_USER_ACTION/.test(wf) && /grep -q UPDATE_PACKAGES_WITHOUT_USER_ACTION/.test(wf), 'the build adds the permission that lets Android 12 and newer skip the screen, and stops if it did not get in');

section('3c. How people on the website get the Android app');
const P = await import('../../src/utils/androidAppPrompt.ts');
const droid = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36';
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const base = { userAgent: droid, native: false, installed: false, memory: null, now: 1_800_000_000_000 };
check(P.shouldOfferAndroidApp(base) === true, 'an Android phone on the website is offered the app by itself (not hidden in the three dots)');
check(P.shouldOfferAndroidApp({ ...base, userAgent: iphone }) === false && P.shouldOfferAndroidApp({ ...base, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126' }) === false, 'an iPhone or a computer never is (there is no app file for them)');
check(P.shouldOfferAndroidApp({ ...base, native: true }) === false && P.shouldOfferAndroidApp({ ...base, installed: true }) === false, 'nor is someone who already has the app, or has NOOB on the home screen');
check(P.shouldOfferAndroidApp({ ...base, memory: { at: base.now - 3600_000, times: 1 } }) === false, 'after "Not now" it waits');
check(P.shouldOfferAndroidApp({ ...base, memory: { at: base.now - P.PROMPT_REPEAT_MS - 1, times: 1 } }) === true && P.shouldOfferAndroidApp({ ...base, memory: { at: base.now - P.PROMPT_REPEAT_MS - 1, times: P.PROMPT_MAX_TIMES } }) === false, 'two weeks later it asks again, but never more than three times');
check(P.shouldOfferAndroidApp({ ...base, memory: { at: base.now - 365 * 86400_000, times: 1, done: true } }) === false, 'once the file was opened it never comes back');
const promptSrc = read('src/components/Common/AndroidAppPrompt.tsx');
check(/\{currentUser && <AndroidAppPrompt \/>\}/.test(read('src/App.tsx')) && /setTimeout\(\(\) => setShow\(true\), 25000\)/.test(promptSrc) && /window\.open\(ANDROID_APK_URL, '_blank', 'noopener'\)/.test(promptSrc) && /Open the file to install/.test(promptSrc), 'it comes up 25 seconds after sign-in, opens the app file, and says what to do next');
check(/\/android\/i\.test\(navigator\.userAgent\) && !isNativeApp\(\)/.test(read('src/components/Auth/AuthView.tsx')) && /Get the Android app/.test(read('src/components/Auth/AuthView.tsx')) && /data-no-inapp/.test(read('src/components/Auth/AuthView.tsx')), 'the sign-in page also has a "Get the Android app" link for Android phones');

section('4. The button');
const svc = read('src/services/nativeUpdate.ts');
check(/registerPlugin<AppUpdaterPlugin>\('AppUpdater'\)/.test(svc) && /downloadAndInstall\(\{ url: ANDROID_APK_URL \}\)/.test(svc), 'the app calls the installer with the one app file address');
check(/if \(!info\?\.supported\) \{ window\.location\.href = ANDROID_APK_URL; return; \}/.test(svc), 'an app from before the installer existed still gets the file (handed to the phone’s browser)');
check(/'needs-permission'/.test(svc) && /Allow NOOB to install apps/.test(svc) && /Installing the update/.test(svc), 'the person is told what happens next at each step');
const banner = read('src/components/Common/NativeUpdateBanner.tsx');
check(/info\?\.state !== 'newer'\) return null/.test(banner) && /!u\.native/.test(banner) && /onClick=\{\(\) => void u\.install\(\)\}/.test(banner) && /animate-spin/.test(banner), 'in the Android app a bar with an Update button shows only when a newer app file exists, and shows the work at once');
check(/\{currentUser && <NativeUpdateBanner \/>\}/.test(read('src/App.tsx')), 'it is part of the app');
const svc2 = read('src/services/nativeUpdate.ts');
check(/AppUpdater\.getLatest\(\)/.test(svc2) && /if \(!latest\) latest = await fetchLatestNativeBuild\(\)/.test(svc2), 'the app asks itself first and the GitHub release page only if that fails');
const page = read('src/components/Settings/pages/update.tsx');
check(/'update': UpdatePage|update: UpdatePage/.test(read('src/components/Settings/pages/index.tsx')) && /id: 'update'[^\n]*page: 'update'/.test(read('src/components/Settings/registry.ts')), 'Settings and activity has an "Update NOOB" row that opens the page');
check(/Everyday updates/.test(page) && /You never have to update for those|arrive by themselves/.test(page) && /Update the app/.test(page) && /app\.install/.test(page) && /app\.percent/.test(page), 'the page keeps the two apart: everyday updates need nothing; an app file update has one button with a progress bar');
check(/Your app is the newest one: there is no app file to install right now/.test(page) && /On iPhone, iPad and computers there is no app file to install/.test(page) && /Newest app/.test(page) && /build \$\{info\.installed\}/.test(page), 'a page with nothing to install says so plainly (which build you have, which is newest), and iPhone and computers are told there is no app file');
check(/onClick=\{hardReload\}/.test(page) && /Update now/.test(page), 'on the website and the home-screen app "Update now" reloads to the newest version');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
