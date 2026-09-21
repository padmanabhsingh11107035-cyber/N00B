// Tests the turning of a product's pictures: which picture comes next (looping back to the first after the last), and when it should
// keep turning (not for one picture, not while nobody sees it, not for people who asked for less movement).
// Pure logic (src/components/Store/carousel.ts): no browser needed. (What it looks like is checked in the browser.)
//
// Usage: node scripts/supabase/test-carousel.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const C = await import(pathToFileURL(path.resolve('src/components/Store/carousel.ts')).href);

section('1. The loop');
check(C.nextIndex(0, 4) === 1 && C.nextIndex(2, 4) === 3, 'each turn shows the next picture');
check(C.nextIndex(3, 4) === 0, 'after the last picture it starts again from the first');
let i = 0; const seen = [];
for (let k = 0; k < 9; k++) { seen.push(i); i = C.nextIndex(i, 4); }
check(seen.join() === '0,1,2,3,0,1,2,3,0', 'it goes round and round: 0,1,2,3,0,1,2,3,0');
check(C.nextIndex(0, 1) === 0 && C.nextIndex(0, 0) === 0, 'one picture (or none) just stays');
check(C.prevIndex(0, 4) === 3 && C.prevIndex(2, 4) === 1 && C.prevIndex(0, 1) === 0, 'going back from the first shows the last');
check(C.ROTATE_MS >= 1500 && C.ROTATE_MS <= 4000, 'each picture stays for a comfortable couple of seconds');

section('2. When it keeps turning');
const base = { count: 3, tabHidden: false, offscreen: false, reducedMotion: false, holding: false };
check(C.shouldRotate(base) === true, 'a product with several pictures, in view: it turns');
check(C.shouldRotate({ ...base, count: 1 }) === false && C.shouldRotate({ ...base, count: 0 }) === false, 'one picture (or none): nothing to turn');
check(C.shouldRotate({ ...base, tabHidden: true }) === false, 'the tab is in the background: it stops (saves battery and data)');
check(C.shouldRotate({ ...base, offscreen: true }) === false, 'the card is scrolled out of view: it stops');
check(C.shouldRotate({ ...base, reducedMotion: true }) === false, 'for people who asked their device for less movement: it does not turn by itself');
check(C.shouldRotate({ ...base, holding: true }) === false, 'while someone is holding on to one picture: it waits');

section('3. Not all cards at the same instant');
check(C.firstDelay(2200, 0) === 2200 && C.firstDelay(2200, 1) === 3100, 'the first turn waits the base time plus up to under a second');
check(C.firstDelay(2200, 0.5) === 2650 && C.firstDelay(2200, -5) === 2200 && C.firstDelay(2200, 9) === 3100, 'a silly random value is kept in range');
const delays = new Set(Array.from({ length: 20 }, (_, k) => C.firstDelay(2200, k / 20)));
check(delays.size > 10, 'twenty cards get many different starting waits, so a shelf does not flip in step');

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
