// The phone on the sign-in page is a small working demo of the app: seven screens (home feed, reels, chat, games, live room, Daily NOOB, AI study) that take turns by CSS alone.
// It is decoration only, shown from 640px wide, and calm for people who ask for less motion. (Tried in a real browser too: every screen drawn and checked one by one, and the
// round of screens observed changing on the page.)
// Usage: node scripts/supabase/test-login-phone-demo.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const demo = read('src/components/Auth/LoginPhoneDemo.tsx');
const auth = read('src/components/Auth/AuthView.tsx');
const css = read('src/index.css');

section('1. What it shows');
const screens = (demo.match(/<Screen n=\{(\d)\}>/g) || []);
check(screens.length === 7 && [0, 1, 2, 3, 4, 5, 6].every((n) => demo.includes(`<Screen n={${n}}>`)), 'seven screens, each with its own turn');
for (const [label, re] of [['the home feed with stories', /NOOB<\/span>[\s\S]{0,1200}maya/], ['reels', />Reels<\/div>/], ['a chat', /wanna play ludo\?/], ['the games', />Games<\/span>[\s\S]{0,200}50\+/], ['a live voice room', /NOOB Rooms/], ['Daily NOOB', /Daily NOOB[\s\S]{0,2500}\+10,000 points!/], ['the AI study helper', /NOOB Study[\s\S]{0,900}study plan/]]) check(re.test(demo), label);
const captions = demo.match(/const CAPTIONS = \[([^\]]*)\]/)[1].split(',').length;
check(captions === 7 && /Play 50\+ games/.test(demo) && /Study with AI/.test(demo), 'a hand-written caption under the phone for each screen');
check(/Ludo[\s\S]{0,400}Chess[\s\S]{0,700}Snakes[\s\S]{0,700}Tic-Tac-Toe/.test(demo), 'the games screen shows real games of the app');

section('2. Moved by CSS alone, one round of 23.8 seconds');
check(!/useEffect|useState|setInterval|setTimeout|requestAnimationFrame/.test(demo), 'no timers and no state: the browser does it all');
check(/@keyframes demo-screen/.test(css) && /animation: demo-screen 23\.8s linear infinite both; animation-delay: calc\(var\(--i\) \* 3\.4s\)/.test(css), 'each screen has its turn every 3.4 seconds (7 x 3.4 = 23.8)');
check(/13\.5% \{ opacity: 1; transform: none; \} 16\.5% \{ opacity: 0/.test(css), 'and fades over to the next');
for (const k of ['demo-pop', 'demo-grow', 'demo-dtap', 'demo-like', 'demo-dot', 'demo-ring', 'demo-eq']) check(new RegExp('@keyframes ' + k + '\\b').test(css), `the little movement "${k}" exists`);
check(/\.demo-at \{[^}]*animation-delay: calc\(var\(--i\) \* 3\.4s \+ var\(--d, 0s\)\)/.test(css), 'things inside a screen (messages, ticks, the heart) start when their screen does');

section('3. Calm and decoration only');
check(/aria-hidden="true" data-testid="phone-demo"/.test(demo) && /pointer-events-none select-none/.test(demo), 'hidden from screen readers and never catches a tap');
check(/prefers-reduced-motion: reduce\) \{[\s\S]*?\.demo-screen:first-child \{ opacity: 1; \}[\s\S]*?\.demo-at, \.demo-dot, \.demo-ring, \.demo-ring-dot, \.demo-eq \{ animation: none; \}/.test(css), 'people who ask for less motion see the first screen, still');
check(/hidden sm:block absolute/.test(demo) && /z-\[2\]/.test(demo), 'shown from 640px wide, above the other doodles');
check(/w-28 xl:w-44/.test(demo) && /w-\[160px\] h-\[284px\] origin-top-left scale-\[\.6\] xl:scale-100/.test(demo), 'drawn on one sheet that is scaled to the phone: smaller on tablets, full size on wide screens');

section('4. On the sign-in page');
check(/import \{ LoginPhoneDemo \} from '\.\/LoginPhoneDemo';/.test(auth) && /<LoginMoreDoodles \/>[\s\S]{0,200}<LoginPhoneDemo \/>/.test(auth), 'mounted on the sign-in page');
check(!/phone mockup with a "story" preview/.test(auth), 'the old still phone is gone (the new one takes its place)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
