// Tests which link clicks open inside NOOB (the in-app browser with "NOOB" in its top bar) and which sites are known to refuse being shown
// inside another site. Pure logic (src/utils/inAppBrowser.ts): no browser needed.
//
// Usage: node scripts/supabase/test-in-app-browser.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const M = await import(pathToFileURL(path.resolve('src/utils/inAppBrowser.ts')).href);
const { shouldOpenInApp, isFrameBlocked, hostOf, openInApp, closeInApp } = M;
const OWN = 'noobsocials.com';

section('1. Which clicks open in NOOB');
check(shouldOpenInApp({ href: 'https://example.com/shop', button: 0 }, OWN) === true, 'an ordinary click on a link to another website');
check(shouldOpenInApp({ href: 'http://example.com' }, OWN) === true, 'a plain http link too');
check(shouldOpenInApp({ href: 'https://www.noobsocials.com/' }, OWN) === false && shouldOpenInApp({ href: 'https://noobsocials.com/?pro=plus' }, 'www.noobsocials.com') === false && shouldOpenInApp({ href: 'https://www.noobsocials.com/x' }, 'n00b.example.workers.dev') === false, 'the NOOB address itself (with or without www) is never shown inside the in-app browser (its pages forbid it: it came out as an empty white page)');
check(isFrameBlocked('https://noobsocials.com/x') && isFrameBlocked('https://www.noobsocials.com') && !isFrameBlocked('https://ai.noobsocials.com') && shouldOpenInApp({ href: 'https://ai.noobsocials.com/' }, OWN) === true, 'if NOOB itself ever got there, it shows the Open in browser card (not a blank page); NOOB AI keeps working');
check(shouldOpenInApp({ href: 'https://noobsocials.com/?post=1' }, OWN) === false && shouldOpenInApp({ href: 'https://NOOBSOCIALS.com/' }, OWN) === false && shouldOpenInApp({ href: 'https://noobsocial.com/x' }, OWN) === true && shouldOpenInApp({ href: 'https://nooob.xyz/x' }, OWN) === true, 'links inside NOOB itself are left alone (any capital letters), a look-alike address is another website');
for (const [name, href] of [['mailto', 'mailto:a@b.co'], ['tel', 'tel:+911234567890'], ['sms', 'sms:123'], ['UPI', 'upi://pay?pa=a@b'], ['javascript', 'javascript:alert(1)'], ['data', 'data:text/html,hi'], ['blob', 'blob:https://nooob.xyz/abc']]) {
  check(shouldOpenInApp({ href }, OWN) === false, `${name}: links are never touched`);
}
check(!shouldOpenInApp({ href: 'https://example.com', ctrlKey: true }, OWN) && !shouldOpenInApp({ href: 'https://example.com', metaKey: true }, OWN) && !shouldOpenInApp({ href: 'https://example.com', shiftKey: true }, OWN) && !shouldOpenInApp({ href: 'https://example.com', button: 1 }, OWN), 'Ctrl / Cmd / Shift click and middle click keep their normal meaning');
check(!shouldOpenInApp({ href: 'https://example.com/a.pdf', hasDownload: true }, OWN), 'download links download');
check(!shouldOpenInApp({ href: 'https://example.com', noInApp: true }, OWN), 'a link marked data-no-inapp opens the usual way');
check(!shouldOpenInApp({}, OWN) && !shouldOpenInApp({ href: '' }, OWN) && !shouldOpenInApp({ href: 'not a url' }, OWN), 'no link / an odd one: no crash, nothing opens');

section('2. Sites that refuse to be shown inside another site');
check(hostOf('https://www.Instagram.com/ann') === 'instagram.com' && hostOf('nonsense') === '', 'the address is read, "www." dropped');
for (const u of ['https://www.instagram.com/ann', 'https://m.facebook.com/x', 'https://github.com/a', 'https://youtu.be/abc', 'https://docs.google.com/d/1', 'https://x.com/a']) check(isFrameBlocked(u), `${u}: known to refuse`);
for (const u of ['https://example.com', 'https://my-shop.in/products', 'https://notgoogle.com', 'https://google.com.evil.example']) check(!isFrameBlocked(u), `${u}: tried inside NOOB`);

section('3. The open page');
let seen = 'unset';
openInApp('https://example.com/a'); closeInApp();
check(true, 'open and close do not crash');

section('5. The new .com is NOOB too');
check(shouldOpenInApp({ href: 'https://noobsocials.com/?profile=ann' }, 'www.noobsocials.com') === false && shouldOpenInApp({ href: 'https://www.noobsocials.com/' }, 'noobsocials.com') === false && shouldOpenInApp({ href: 'https://nooob.xyz/?post=1' }, 'noobsocials.com') === true, 'a link to NOOB opens the normal way; the retired nooob.xyz is just another website'); 
check(isFrameBlocked('https://noobsocials.com/x') && isFrameBlocked('https://www.noobsocials.com') && !isFrameBlocked('https://example.com'), 'and neither address is ever shown inside the in-app browser');
check(shouldOpenInApp({ href: 'https://noobsocials.com.evil.io/' }, 'noobsocials.com') === true && shouldOpenInApp({ href: 'https://evilnoobsocials.com/' }, 'noobsocials.com') === true, 'look-alike addresses are other sites');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
