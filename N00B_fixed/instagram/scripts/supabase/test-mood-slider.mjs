// The full-screen Mood slider. Usage: node --liftoff-only scripts/supabase/test-mood-slider.mjs
import fs from 'node:fs';
import { moodStops, moodAt, nearestMood, SLIDER_ORDER } from '../../src/utils/moodSlider.ts';
import { MOODS } from '../../src/utils/moods.ts';

let passed = 0, failed = 0;
const check = (cond, label) => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

console.log('1. The moods on the slider');
check(SLIDER_ORDER.length === 8 && SLIDER_ORDER.every((id) => MOODS.some((m) => m.id === id)) && moodStops.length === 8, 'eight moods, all of them moods the database accepts');
check(nearestMood(0) === 0 && nearestMood(1) === 7 && nearestMood(0.5) === 4 && nearestMood(-3) === 0 && nearestMood(9) === 7, 'the nearest mood, never outside the ruler');
check(moodAt(0).color === 'rgb(212,13,13)' && moodAt(5 / 7).color === 'rgb(34,242,60)', 'red at the low end, green for happy');
const mid = moodAt(0.5 / 7);
check(mid.eyeH > moodStops[0].eyeH && mid.eyeH < moodStops[1].eyeH, 'between two moods the face is a blend of both');

console.log('\n2. The page');
const page = read('src/components/Fun/MoodPage.tsx');
const hub = read('src/components/Fun/FunHub.tsx');
check(/setMyMood\(\{ mood, note: kept\.current\.note, visibility: kept\.current\.visibility, expireHours: kept\.current\.expireHours \}\)/.test(page), 'letting go saves the mood with the same visibility and note as before');
check(/if \(!currentUser\) \{ onLogin\?\.\(\); return; \}/.test(page) && /if \(mood === savedMood\.current\) return;/.test(page), 'a visitor is asked to log in, and an unchanged mood is not saved again');
check(/active\.id === 'mood'/.test(hub) && /onBack=\{onBack\}/.test(hub), 'the hub shows Mood as one full screen with its own way back');
check(fs.existsSync('src/components/Fun/MoodClassic.tsx'), 'the old page (note, lists, who can see it) is kept');
check(!/localStorage|sessionStorage/.test(page), 'nothing is kept in the browser');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
