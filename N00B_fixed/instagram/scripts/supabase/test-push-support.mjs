// Tests "can this phone/browser get notifications, and what should the person do if not?" with real browser
// identification strings (iPhone Safari and Chrome, iPad, Android, Instagram/Facebook in-app browsers, ...).
// Pure logic (src/utils/pushSupport.ts): no database or browser needed.
//
// Usage: node scripts/supabase/test-push-support.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const { checkPushSupport, isIos } = await import(pathToFileURL(path.resolve('src/utils/pushSupport.ts')).href);

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1',
  ipadDesktopMode: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0',
  instagramAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 Instagram 330.0.0.36.109 Android',
  facebookIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/460.0.0.35.108;FBBV/0;FBDV/iPhone14,2;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5]',
  androidWebview: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36',
  whatsapp: 'Mozilla/5.0 (Linux; Android 13; SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 WhatsApp/2.24.10.85',
  desktopChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
};
const ALL = { hasNotification: true, hasServiceWorker: true, hasPushManager: true, secure: true };
const NONE_PUSH = { hasNotification: false, hasServiceWorker: true, hasPushManager: false, secure: true };   // what an iPhone Safari TAB has

section('1. Where notifications work');
for (const [name, ua] of [['Android Chrome', UA.androidChrome], ['Samsung Internet', UA.samsung], ['Firefox on Android', UA.androidFirefox], ['desktop Chrome', UA.desktopChrome]]) {
  check(checkPushSupport({ userAgent: ua, ...ALL }).supported === true, `${name}: supported`);
}
check(checkPushSupport({ userAgent: UA.iphoneSafari, standalone: true, ...ALL }).supported === true, 'iPhone, opened from the Home Screen icon (iOS 16.4+): supported');
check(checkPushSupport({ userAgent: UA.ipadDesktopMode, platform: 'MacIntel', maxTouchPoints: 5, standalone: true, ...ALL }).supported === true, 'iPad in desktop mode, from the Home Screen icon: supported');

section('2. iPhone and iPad in a normal browser tab: tell them to use the Home Screen icon');
for (const [name, env] of [
  ['iPhone Safari tab', { userAgent: UA.iphoneSafari }],
  ['iPhone Chrome tab', { userAgent: UA.iphoneChrome }],
  ['iPad (looks like a Mac)', { userAgent: UA.ipadDesktopMode, platform: 'MacIntel', maxTouchPoints: 5 }]
]) {
  const r = checkPushSupport({ ...env, ...NONE_PUSH, standalone: false });
  check(r.supported === false && r.kind === 'ios-browser' && /Home Screen/.test(r.message) && /Add to Home Screen/.test(r.message), `${name}: told exactly how (Share, Add to Home Screen, open from that icon)`);
}
let r = checkPushSupport({ userAgent: UA.iphoneSafari, standalone: true, ...NONE_PUSH });
check(r.kind === 'ios-old' && /16\.4/.test(r.message), 'iPhone from the Home Screen but without push: told to update to iOS 16.4');
check(checkPushSupport({ userAgent: UA.macSafari, platform: 'MacIntel', maxTouchPoints: 0, ...NONE_PUSH }).kind === 'other', 'a real Mac (no touch screen) is not mistaken for an iPad');
check(isIos({ userAgent: UA.iphoneSafari }) && isIos({ userAgent: UA.ipadDesktopMode, platform: 'MacIntel', maxTouchPoints: 5 }) && !isIos({ userAgent: UA.androidChrome }) && !isIos({ userAgent: UA.desktopChrome, platform: 'Win32', maxTouchPoints: 0 }), 'iPhone/iPad detected, Android and Windows are not');

section('3. In-app browsers: tell them to open the real browser');
for (const [name, ua] of [['Instagram (Android)', UA.instagramAndroid], ['Facebook (iPhone)', UA.facebookIos], ['an Android WebView', UA.androidWebview], ['WhatsApp', UA.whatsapp]]) {
  const rr = checkPushSupport({ userAgent: ua, ...NONE_PUSH, hasServiceWorker: false, standalone: false });
  check(rr.supported === false && rr.kind === 'in-app-browser' && /Open nooob\.xyz in Chrome/.test(rr.message), `${name}: told to open nooob.xyz in Chrome/Safari`);
}
r = checkPushSupport({ userAgent: UA.facebookIos, ...NONE_PUSH, standalone: false });
check(r.kind === 'in-app-browser' && /Add to Home Screen/.test(r.message), 'an in-app browser on iPhone is first told to leave it, and then about the Home Screen (not the other way round)');

section('4. Everything else');
r = checkPushSupport({ userAgent: UA.androidChrome, ...ALL, isNativeApp: true });
check(r.supported === false && r.kind === 'native-app' && /nooob\.xyz/.test(r.message), 'the NOOB app build is told honestly that notifications are not set up there, and where to get them');
r = checkPushSupport({ userAgent: UA.androidChrome, ...ALL, secure: false });
check(r.supported === false && r.kind === 'insecure', 'an insecure page is told to use https');
r = checkPushSupport({ userAgent: UA.desktopChrome, hasNotification: false, hasServiceWorker: false, hasPushManager: false, secure: true });
check(r.supported === false && r.kind === 'other' && /Chrome/.test(r.message), 'an old browser is told which browsers work');
check(checkPushSupport({ userAgent: '', hasNotification: false, hasServiceWorker: false, hasPushManager: false }).supported === false, 'an unknown environment does not crash');
for (const [name, ua] of [['Android Chrome', UA.androidChrome], ['Instagram', UA.instagramAndroid]]) {
  check(checkPushSupport({ userAgent: ua, ...ALL }).supported === true, `${name} with all three features is supported (features decide, not the name)`);
}
const messages = [checkPushSupport({ userAgent: UA.iphoneSafari, ...NONE_PUSH }), checkPushSupport({ userAgent: UA.instagramAndroid, ...NONE_PUSH }), checkPushSupport({ userAgent: UA.desktopChrome, hasNotification: false, hasServiceWorker: false, hasPushManager: false })].map((x) => x.message);
check(messages.every((m) => m.length > 40 && !/undefined|null/.test(m)) && !messages.some((m) => /aren't supported|isn't supported/.test(m)), 'every message is a full sentence of instructions, never just "not supported"');

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
