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
const OWN = 'nooob.xyz';

section('1. Which clicks open in NOOB');
check(shouldOpenInApp({ href: 'https://example.com/shop', button: 0 }, OWN) === true, 'an ordinary click on a link to another website');
check(shouldOpenInApp({ href: 'http://example.com' }, OWN) === true, 'a plain http link too');
check(shouldOpenInApp({ href: 'https://www.nooob.xyz/' }, OWN) === false && shouldOpenInApp({ href: 'https://nooob.xyz/?pro=plus' }, 'www.nooob.xyz') === false && shouldOpenInApp({ href: 'https://www.nooob.xyz/x' }, 'n00b.example.workers.dev') === false, 'the NOOB address itself (with or without www) is never shown inside the in-app browser (its pages forbid it: it came out as an empty white page)');
check(isFrameBlocked('https://nooob.xyz/x') && isFrameBlocked('https://www.nooob.xyz') && !isFrameBlocked('https://ai.nooob.xyz') && shouldOpenInApp({ href: 'https://ai.nooob.xyz/' }, OWN) === true, 'if NOOB itself ever got there, it shows the Open in browser card (not a blank page); NOOB AI keeps working');
check(shouldOpenInApp({ href: 'https://nooob.xyz/?post=1' }, OWN) === false && shouldOpenInApp({ href: 'https://NOOOB.xyz/' }, OWN) === false && shouldOpenInApp({ href: 'https://noob.xyz/x' }, OWN) === true, 'links inside NOOB itself are left alone (any capital letters), a look-alike address is another website');
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
