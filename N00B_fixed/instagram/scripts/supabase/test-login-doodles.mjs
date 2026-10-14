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
check(sizes.length === pictures && sizes.every((w) => w >= 100 && w <= 220), 'every picture is big (100 to 220 px wide) but never huge', sizes.join());
const spots = [...big.matchAll(/x: '(\d+)%', y: '(\d+)%'/g)].map((m) => [Number(m[1]), Number(m[2])]);
check(spots.every(([x, y]) => x >= 2 && x <= 90 && y >= 0 && y <= 60), 'all of them are in the upper part of the page, around the logo and the sides of the card');
check(spots.every(([x]) => !(x > 40 && x < 60)), 'none is placed over the logo and the sign-in card in the middle');

section('4. On the page');
check(/<LoginDoodles \/>\s*\n\s*<LoginBigDoodles \/>/.test(auth) && /import \{ LoginBigDoodles \}/.test(auth), 'the sign-in page shows the big pictures right after the small doodles');
check(!/\(\?<[=!]/.test(small + big), 'no regex look-behind (older iPhones refuse to load a page that has one)');

section('5. The third layer: more things to look at, nothing on top of the page\'s own callouts');
const more = read('src/components/Auth/LoginMoreDoodles.tsx');
check(/aria-hidden="true"/.test(more) && /pointer-events-none select-none/.test(more) && /hidden xl:block/.test(more), 'it is decoration only and appears only from 1280px wide, like the big pictures');
const artKinds = [...more.matchAll(/^  (\w+): <>/gm)].map((m) => m[1]);
const spotKinds = [...more.matchAll(/\{ a: '(\w+)', x: '/g)].map((m) => m[1]);
check(artKinds.length >= 21 && new Set(artKinds).size === artKinds.length, artKinds.length + ' different drawings (food, things to wear and play with, little characters, study things, sky and weather)');
check(spotKinds.length >= 30 && spotKinds.every((k) => artKinds.includes(k)), spotKinds.length + ' places, and every one uses a drawing that exists');
const words = [...more.matchAll(/\{ t: '([^']+)', x: '/g)].map((m) => m[1]);
check(words.length >= 8 && words.includes('level up!') && words.includes('daily quiz') && words.includes('no cap ♡'), words.length + ' hand-written words about what NOOB is for');
check(/<LoginBigDoodles \/>\s*\n\s*<LoginMoreDoodles \/>/.test(auth) && /import \{ LoginMoreDoodles \}/.test(auth), 'the sign-in page shows it after the big pictures');
// the page's own callouts (polaroid, phone, "Good Vibes Only", the three badges, "Real People", "Post / Reels"), as the part of the page they take, in percent
const CALLOUTS = [[5, 6, 10.5, 14], [5, 14, 13.5, 18.5], [3, 30, 9, 47], [85, 6, 94, 19], [89.5, 34, 94, 47], [4, 77, 12, 83], [87, 74, 95, 80]];
const boxes = [];
for (const m of more.matchAll(/\{ a: '\w+', x: '([\d.]+)%', y: '([\d.]+)%', w: (\d+)/g)) boxes.push([Number(m[1]), Number(m[2]), Number(m[1]) + (Number(m[3]) / 1913) * 100, Number(m[2]) + (Number(m[3]) / 1290) * 100, 'more']);
for (const m of big.matchAll(/\{ x: '([\d.]+)%', y: '([\d.]+)%', w: (\d+), r: [-\d]+, c: '[^']+', d: [\d.]+, vb: '0 0 (\d+) (\d+)'/g)) boxes.push([Number(m[1]), Number(m[2]), Number(m[1]) + (Number(m[3]) / 1913) * 100, Number(m[2]) + ((Number(m[3]) * Number(m[5])) / Number(m[4]) / 1290) * 100, 'big']);
const hit = boxes.filter(([x0, y0, x1, y1]) => CALLOUTS.some(([a, b, c, d]) => x0 < c && x1 > a && y0 < d && y1 > b));
check(boxes.length >= 35 && hit.length === 0, 'none of the ' + boxes.length + ' pictures sits on top of the page\'s own callouts', JSON.stringify(hit));
const inside = boxes.filter(([x0, y0, x1, y1]) => x0 < 0 || y0 < 0 || x1 > 100 || y1 > 100);
check(inside.length === 0, 'and all of them are inside the page', JSON.stringify(inside));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
