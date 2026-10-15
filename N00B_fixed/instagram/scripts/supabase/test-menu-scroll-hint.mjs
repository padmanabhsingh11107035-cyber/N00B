// The "Scroll for more" doodle at the bottom of the three-line menu on Home: it shows only while the list is cut off, goes away at the end, is a real button that scrolls the list,
// is drawn in the app's black-and-white doodle look (and reads in Light mode too), and respects reduced motion. Usage: node scripts/supabase/test-menu-scroll-hint.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const hint = read('src/components/Feed/ScrollMoreHint.tsx');
const feed = read('src/components/Feed/FeedView.tsx');
const anon = read('src/components/Anonymous/AnonymousMessagesPage.tsx');
const css = read('src/index.css');

section('1. When it shows');
check(/scrollHeight - el\.scrollTop - el\.clientHeight > 24/.test(hint), 'it shows while more than a little (24px) of the list is hidden below, and not when everything fits or the end is in view');
check(/addEventListener\('scroll', soon/.test(hint) && /addEventListener\('resize', soon/.test(hint) && /new MutationObserver\(soon\)/.test(hint), 'it is measured again when the list scrolls, the window changes size, and buttons are added or removed');
check(/window\.setTimeout\(measure, 350\)/.test(hint), 'it is measured again once the panel has slid in');
check(/if \(!active\) \{ setMore\(false\); return; \}/.test(hint) && /removeEventListener\('scroll', soon\)/.test(hint) && /mo\?\.disconnect\(\)/.test(hint), 'it is off while the menu is closed and cleans up after itself');

section('2. What it looks like');
check(/<circle cx="10" cy="10" r="8" \/>/.test(hint) && /<path d="M7 8\.2v\.6M13 8\.2v\.6" \/>/.test(hint), 'a hand-drawn smiley in the same line style as the doodle wallpapers (no coloured emoji)');
check(/Scroll for more/.test(hint) && /scroll-more-arrow/.test(hint), 'it says "Scroll for more" and has an arrow that bobs downwards');
check(/bg-noob text-black/.test(hint) && !/bg-zinc-50 text-zinc-950/.test(hint), 'the pill uses the theme accent (white in Dark; Light mode turns it dark with white text)');
check(/bg-gradient-to-t from-zinc-950 via-zinc-950\/85 to-transparent/.test(hint), 'a soft fade at the bottom edge of the list');
check(/@keyframes scroll-more-bob/.test(css) && /\.scroll-more-arrow \{ animation: scroll-more-bob/.test(css) && /prefers-reduced-motion: reduce\) \{ \.scroll-more-arrow \{ animation: none; \}/.test(css), 'the arrow bobs, and stands still for people who ask for less motion');

section('3. How it behaves');
check(/<button\s+type="button"\s+onClick=\{onClick\}\s+aria-label="Scroll down for more features"/.test(hint), 'it is a real button with a name for screen readers');
check(/pointer-events-none absolute inset-x-0 bottom-0/.test(hint) && /pointer-events-auto/.test(hint), 'the fade never blocks the buttons under it; only the pill takes taps');
check(/el\.scrollBy\(\{ top: Math\.max\(160, Math\.round\(el\.clientHeight \* 0\.7\)\), behavior: 'smooth' \}\)/.test(hint), 'pressing it scrolls the list down by most of a screen');

section('4. In the menu');
check(/const menuScroll = useScrollMore\(showNoobMenu\);/.test(feed), 'it follows whether the menu is open');
check(/<div className="relative flex-1 min-h-0">\s*<div ref=\{menuScroll\.ref\} className="space-y-1 h-full overflow-y-auto overscroll-contain/.test(feed), 'the menu list is the thing that is measured, inside a box the hint can sit on');
check(/\{menuScroll\.more && <ScrollMoreHint onClick=\{menuScroll\.scrollDown\} \/>\}/.test(feed), 'it is drawn only while there is more below');
check(/Suggestion Box/.test(feed) && /Anonymous Messages/.test(feed) && /Customer Support/.test(feed), 'every menu entry is still there');

section('5. Light mode');
check(!/bg-zinc-50 text-zinc-950/.test(anon) && !/bg-zinc-50 text-zinc-950/.test(feed), 'no white-on-white / black-on-black pills are left (the Anonymous Messages page uses the same accent classes)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
