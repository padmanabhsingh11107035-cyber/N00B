// Every link NOOB gives out (a post, a reel, a video, a profile QR code, a live link, a Live Lounge invitation, a game challenge, a meeting invitation, a copied chat link) carries
// NOOB's own address, noobsocials.com: never nooob.xyz (the old address, which shows only the "new home" card) and never the phone's internal address that the Android app
// runs on when it starts from files on the phone (https://localhost), which no one else could open. They were built from window.location.origin; they now use siteOrigin().
// Checked live on 2026-10-23: nooob.xyz makes no data request at all (only the card), noobsocials.com runs the app and its sign-in.
// Usage: node scripts/supabase/test-share-link-address.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const load = (p) => import(pathToFileURL(path.resolve(p)).href);

section('1. Outside a browser, and inside the Android app, the address is noobsocials.com');
const { siteOrigin } = await load('src/utils/siteUrl.ts');
const { contentUrl } = await load('src/utils/routes.ts');
const { messageCopyText } = await load('src/utils/clipboard.ts');
const { joinUrl } = await load('src/utils/meetingCalendar.ts');
check(siteOrigin() === 'https://noobsocials.com', 'no window: noobsocials.com', siteOrigin());
check(contentUrl('reel', 'abc') === 'https://noobsocials.com/reel/abc', 'a reel link');
check(contentUrl('post', 'p1') === 'https://noobsocials.com/p/p1' && contentUrl('profile', 'ann') === 'https://noobsocials.com/u/ann', 'a post and a profile link', contentUrl('post', 'p1') + ' ' + contentUrl('profile', 'ann'));
check(messageCopyText({ text: '', sharedPostId: 'abc', sharedPostType: 'post' }) === 'https://noobsocials.com/?post=abc', 'a copied chat link');
check(joinUrl({ meetingCode: 'ABC123' }) === 'https://noobsocials.com/?liveLounge=ABC123', 'a meeting invitation');
globalThis.window = { Capacitor: { isNativePlatform: () => true }, location: { hostname: 'localhost', origin: 'https://localhost', pathname: '/index.html' } };
check(siteOrigin() === 'https://noobsocials.com' && contentUrl('reel', 'abc') === 'https://noobsocials.com/reel/abc', 'inside the Android app (which runs on https://localhost) the links still name noobsocials.com', siteOrigin());
check(messageCopyText({ text: '', sharedPostId: 'abc', sharedPostType: 'reel' }) === 'https://noobsocials.com/?reel=abc' && joinUrl({ meetingCode: 'X1', passcode: 'p' }) === 'https://noobsocials.com/?liveLounge=X1&pwd=p', 'a copied chat link and an invitation in the app');
globalThis.window = { location: { hostname: 'noobsocials.com', origin: 'https://noobsocials.com', pathname: '/' } };
check(siteOrigin() === 'https://noobsocials.com', 'on the website itself it is the same address');
delete globalThis.window;

section('2. No link is built from the page address any more');
const files = {
  'src/components/Profile/ProfileQrModal.tsx': /\$\{siteOrigin\(\)\}\/\?profile=/,
  'src/components/Videos/HomeVideoFeedView.tsx': /\$\{siteOrigin\(\)\}\/\?live=/,
  'src/components/LiveStream/LiveLoungeRoomView.tsx': /\$\{siteOrigin\(\)\}\/\?liveLounge=/,
  'src/components/Games/GamePlayModal.tsx': /\$\{siteOrigin\(\)\}\/\?playGame=/,
  'src/components/Modals/AdminControlModal.tsx': /const baseUrl = `\$\{siteOrigin\(\)\}\/`;/,
  'src/components/LiveStream/LiveStreamView.tsx': /\{siteOrigin\(\)\}<\/span>, and go live/,
};
for (const [f, re] of Object.entries(files)) {
  const s = read(f);
  check(re.test(s) && /import \{ siteOrigin \} from '\.\.\/\.\.\/utils\/siteUrl'/.test(s) && !/window\.location\.origin/.test(s.replace(/\/\/.*$/gm, '')), path.basename(f) + ' uses siteOrigin()');
}
for (const f of ['src/utils/routes.ts', 'src/utils/clipboard.ts', 'src/utils/meetingCalendar.ts']) {
  const s = read(f);
  check(/siteOrigin\(\)/.test(s) && !/window\.location\.origin/.test(s) && !/'https:\/\/nooob\.xyz'/.test(s), path.basename(f) + ' no longer falls back to the old address');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
