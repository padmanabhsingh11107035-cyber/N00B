// The birthday box: when it opens (utils/birthdayPopup.ts), the tune (utils/birthdaySong.ts), and how App.tsx wires it. Usage: node --liftoff-only scripts/supabase/test-birthday-popup.mjs
import fs from 'node:fs';
import * as B from '../../src/utils/birthdayPopup.ts';
import * as S from '../../src/utils/birthdaySong.ts';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

const day = (y, m, d, h = 10) => new Date(y, m - 1, d, h, 0, 0);

section('1. Is it the birthday?');
check(B.isBirthdayToday('2008-11-27', day(2026, 11, 27)) && !B.isBirthdayToday('2008-11-27', day(2026, 11, 28)) && !B.isBirthdayToday('2008-11-27', day(2026, 10, 27)), 'the month and the day decide, not the year');
check(!B.isBirthdayToday('', day(2026, 11, 27)) && !B.isBirthdayToday(null, day(2026, 11, 27)) && !B.isBirthdayToday('garbage', day(2026, 11, 27)) && !B.isBirthdayToday('2008-13-40', day(2026, 11, 27)), 'no date, a broken date or an impossible date is never a birthday');
check(B.isBirthdayToday('2004-02-29', day(2028, 2, 29)) && !B.isBirthdayToday('2004-02-29', day(2028, 2, 28)) && B.isBirthdayToday('2004-02-29', day(2027, 2, 28)) && !B.isBirthdayToday('2004-02-29', day(2027, 3, 1)), '29 February is celebrated on 28 February in years without a 29th');
check(B.ageToday('2008-11-27', day(2026, 11, 27)) === 18 && B.ageToday('1500-01-01', day(2026, 1, 1)) === null && B.ageToday('', day(2026, 1, 1)) === null, 'the age they turn (or nothing when the year is not real)');

section('2. When the box opens');
const card = { type: 'birthday_wish', createdAt: day(2026, 11, 27, 9).toISOString(), scratchCardId: 'c1' };
const now = day(2026, 11, 27, 12);
check(JSON.stringify(B.pickBirthdayPopup({ dob: '2008-11-27', notifications: [card], now, shownKey: null })) === JSON.stringify({ key: 'card-c1', cardId: 'c1' }), 'with today\'s card from the database the box opens with the scratch card');
check(B.pickBirthdayPopup({ dob: '2008-11-27', notifications: [card], now, shownKey: 'card-c1' }) === null, 'and only once on this device');
check(B.pickBirthdayPopup({ dob: '2008-11-27', notifications: [{ ...card, createdAt: day(2026, 11, 26, 9).toISOString() }], now: day(2026, 11, 28), shownKey: null }) === null, 'yesterday\'s card does not open it today');
check(JSON.stringify(B.pickBirthdayPopup({ dob: '2008-11-27', notifications: [], now, shownKey: null })) === JSON.stringify({ key: 'year-2026' }), 'with no card yet (the hourly job has not run) the date alone opens the box, without a card');
check(B.pickBirthdayPopup({ dob: '2008-11-27', notifications: [], now, shownKey: 'year-2026' }) === null, 'and only once a year');
check(B.pickBirthdayPopup({ dob: '2008-11-27', notifications: [card], now, shownKey: 'year-2026' }) === null && B.pickBirthdayPopup({ dob: '2008-11-27', notifications: [], now, shownKey: 'card-c1' }) === null, 'a box shown by the date is not shown again when the card arrives later, and the other way round');
check(B.pickBirthdayPopup({ dob: '2008-05-01', notifications: [], now, shownKey: null }) === null && B.pickBirthdayPopup({ dob: null, notifications: [{ type: 'like', createdAt: now.toISOString() }], now, shownKey: null }) === null, 'any other day, or other notifications: nothing opens');
check(JSON.stringify(B.pickBirthdayPopup({ dob: null, notifications: [{ type: 'birthday_wish', createdAt: now.toISOString(), data: { scratchCardId: 'c9' } }], now, shownKey: null })) === JSON.stringify({ key: 'card-c9', cardId: 'c9' }), 'the card id can also sit in the notification\'s data');
check(B.pickBirthdayPopup({ dob: null, notifications: [{ type: 'birthday_wish', createdAt: 'nonsense', scratchCardId: 'c1' }], now, shownKey: null }) === null, 'a notification with a broken time is ignored');

section('3. The wish');
check(B.wishFor(2026, 18).startsWith('Happy 18th birthday!') && B.wishFor(2026, 21).startsWith('Happy 21st') && B.wishFor(2026, 22).startsWith('Happy 22nd') && B.wishFor(2026, 23).startsWith('Happy 23rd') && B.wishFor(2026, 11).startsWith('Happy 11th') && B.wishFor(2026, 12).startsWith('Happy 12th') && !/^Happy \d/.test(B.wishFor(2026, null)), 'the age is written the way people say it (1st, 2nd, 3rd, 11th ...) and left out when unknown');
check(new Set([2026, 2027, 2028, 2029].map((y) => B.wishFor(y, null))).size === 4 && B.WISHES.every((w) => w.length > 60 && w.length < 200), 'four different warm wishes, one a year');

section('4. The tune');
check(S.HAPPY_BIRTHDAY.length === 25 && S.tuneBeats() === 24, 'the traditional melody: 25 notes in 4 lines of 3/4 time (24 beats)', `${S.HAPPY_BIRTHDAY.length} notes, ${S.tuneBeats()} beats`);
check(S.HAPPY_BIRTHDAY.slice(0, 6).map((n) => n.midi).join() === '67,67,69,67,72,71' && S.HAPPY_BIRTHDAY.slice(6, 12).map((n) => n.midi).join() === '67,67,69,67,74,72' && S.HAPPY_BIRTHDAY.slice(12, 19).map((n) => n.midi).join() === '67,67,79,76,72,71,69' && S.HAPPY_BIRTHDAY.slice(19).map((n) => n.midi).join() === '77,77,76,72,74,72', 'the notes of the four lines (G G A G C B / G G A G D C / G G G E C B A / F F E C D C)');
check(Math.abs(S.midiToHz(69) - 440) < 1e-9 && Math.abs(S.midiToHz(60) - 261.6256) < 0.001 && Math.abs(S.midiToHz(81) - 880) < 1e-9, 'note numbers become the right pitch (A is 440 Hz)');

section('5. How App.tsx uses it');
const app = read('src/App.tsx'), pop = read('src/components/Modals/BirthdayPopup.tsx'), css = read('src/components/Modals/birthday.css'), song = read('src/utils/birthdaySong.ts');
check(/pickBirthdayPopup\(\{ dob: currentUser\.dateOfBirth/.test(app) && /writeShown\(uid, pick\.key\)/.test(app) && /<BirthdayPopup/.test(app) && /onScratch=\{\(id\) => setActiveScratchCardId\(id\)\}/.test(app), 'the app decides with the person\'s birthday and the card, remembers it, and the "scratch" button opens the existing scratch card');
check(/startBirthdaySong\(\)/.test(pop) && /stopBirthdaySong\(\)/.test(pop) && /setBirthdayMuted/.test(pop) && /aria-pressed/.test(pop) && /Escape/.test(pop), 'the tune plays while the box is open, stops when it closes, and has a sound switch (and Escape closes it)');
check(/confetti\(/.test(pop) && /data-testid="birthday-scratch"/.test(pop) && /Happy Birthday!/.test(pop) && /Thank you/.test(pop), 'a confetti burst, the title, the scratch card button and "Thank you"');
check(/prefers-reduced-motion: reduce/.test(css) && /\.bd-card \{[^}]*max-height: 100%/.test(css) && /overflow: hidden auto/.test(css), 'quiet for people who asked for less motion, and a small screen can scroll the box instead of cutting it');
check(/AudioContext/.test(song) && /pointerdown/.test(song) && !/https?:\/\//.test(song) && !/new Audio\(/.test(song), 'the tune is made by the phone (no sound file, nothing downloaded) and waits for the first touch when the browser needs one');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
