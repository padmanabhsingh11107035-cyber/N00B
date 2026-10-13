// Checks the sign-in page's doodles (src/components/Auth/LoginDoodles.tsx and LoginBigDoodles.tsx): they are decoration only (hidden from screen readers, never
// catch a tap), they are left out where there is no room (phones and small windows), and the big pictures are really there and really on the page.
//
// Usage: node scripts/supabase/test-login-doodles.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

const small = read('src/components/Auth/LoginDoodles.tsx');
const big = read('src/components/Auth/LoginBigDoodles.tsx');
const auth = read('src/components/Auth/AuthView.tsx');

section('1. Decoration only');
check(/aria-hidden="true"/.test(small) && /pointer-events-none select-none/.test(small), 'the small doodles are hidden from screen readers and never catch a tap');
check(/aria-hidden="true"/.test(big) && /pointer-events-none select-none/.test(big), 'so are the big pictures');
check(/z-\[1\]/.test(big) && /z-10/.test(auth), 'they sit behind the sign-in card');

section('2. Only where there is room');
check(/hidden xl:block/.test(big), 'the big pictures appear only from 1280px wide (phones, tablets and small windows are left clean)');
check((small.match(/hidden lg:block/g) || []).length >= 3, 'the extra doodles beside the card appear only from 1024px wide');

section('3. What is drawn');
const pictures = (big.match(/^  \{ x: '/gm) || []).length;
check(pictures >= 9, pictures + ' big pictures: hello bubble, rocket, smiling star, cat, looping arrow, headphones, camera, crown and paper plane');
for (const word of ['hello!', 'come on in!']) check(big.includes(word), `"${word}" is written in the page's own hand-writing`);
check(/className="font-script"/.test(big), 'the words use the same loopy font as the rest of the page');
const sizes = [...big.matchAll(/w: (\d+), r:/g)].map((m) => Number(m[1]));
check(sizes.length === pictures && sizes.every((w) => w >= 120 && w <= 220), 'every picture is big (120 to 220 px wide) but never huge', sizes.join());
const spots = [...big.matchAll(/x: '(\d+)%', y: '(\d+)%'/g)].map((m) => [Number(m[1]), Number(m[2])]);
check(spots.every(([x, y]) => x >= 2 && x <= 90 && y >= 0 && y <= 60), 'all of them are in the upper part of the page, around the logo and the sides of the card');
check(spots.every(([x]) => !(x > 40 && x < 60)), 'none is placed over the logo and the sign-in card in the middle');

section('4. On the page');
check(/<LoginDoodles \/>\s*\n\s*<LoginBigDoodles \/>/.test(auth) && /import \{ LoginBigDoodles \}/.test(auth), 'the sign-in page shows the big pictures right after the small doodles');
check(!/\(\?<[=!]/.test(small + big), 'no regex look-behind (older iPhones refuse to load a page that has one)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
