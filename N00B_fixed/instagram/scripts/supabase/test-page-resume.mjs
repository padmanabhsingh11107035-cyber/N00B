// Tests the "come back to the page you were on" memory (src/utils/pageResume.ts) with a stand-in for the phone's storage.
//
// Usage: node scripts/supabase/test-page-resume.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);

const data = new Map();
globalThis.localStorage = { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => { data.set(k, String(v)); }, removeItem: (k) => { data.delete(k); } };
const R = await import(pathToFileURL(path.resolve('src/utils/pageResume.ts')).href);
const H = 60 * 60 * 1000;
const t0 = 1_000_000_000_000;

section('1. Which page was open');
check(R.getResumePage('u1', t0) === null, 'nothing saved to begin with');
R.setResumePage('u1', 'store', t0);
check(R.getResumePage('u1', t0 + H) === 'store', 'the open page is remembered');
check(R.getResumePage('u2', t0 + H) === null, 'another account does not get it');
check(R.getResumePage('u1', t0 + 13 * H) === null, 'after 12 hours it is forgotten');
R.setResumePage('u1', null, t0 + H);
check(R.getResumePage('u1', t0 + H) === null, 'closing the page forgets it');

section('2. Progress inside a page');
R.setResumePage('u1', 'suggestions', t0);
R.writeResumeField('u1', 'suggestions', 'message', 'half typed', t0 + 1000);
R.writeResumeField('u1', 'suggestions', 'category', 'issue', t0 + 2000);
check(R.readResumeField('u1', 'suggestions', 'message', t0 + 3000) === 'half typed' && R.readResumeField('u1', 'suggestions', 'category', t0 + 3000) === 'issue', 'typed text and choices come back');
check(R.readResumeField('u1', 'store', 'message', t0 + 3000) === undefined, 'another page does not see them');
check(R.readResumeField('u2', 'suggestions', 'message', t0 + 3000) === undefined, 'another account does not see them');
R.setResumePage('u1', 'suggestions', t0 + 4000); // the home screen confirms the same page after a refresh
check(R.readResumeField('u1', 'suggestions', 'message', t0 + 5000) === 'half typed', 'confirming the same page after a refresh keeps the progress');
R.setResumePage('u1', 'daily', t0 + 6000);
check(R.readResumeField('u1', 'suggestions', 'message', t0 + 7000) === undefined, 'opening a different page starts clean');
R.writeResumeField('u1', 'store', 'view', 'cart', t0 + 8000);
check(R.readResumeField('u1', 'store', 'view', t0 + 9000) === undefined, 'a page opened from somewhere else leaves nothing behind');
R.setResumePage('u1', 'daily', t0 + 10 * H);
R.setResumePage('u1', 'daily', t0 + 30 * H);
check(R.readResumeField('u1', 'daily', 'x', t0 + 31 * H) === undefined, 'progress older than 12 hours is dropped');

section('3. Live Lounge meeting');
R.saveMeeting('u1', 'room-1', t0);
check(R.readMeeting('u1', t0 + H)?.roomId === 'room-1', 'the meeting is remembered');
check(R.readMeeting('u2', t0 + H) === null, 'another account does not get it');
check(R.readMeeting('u1', t0 + 13 * H) === null, 'forgotten after 12 hours');
R.clearMeeting();
check(R.readMeeting('u1', t0 + H) === null, 'tapping Leave forgets the meeting');

section('4. Reopening the app');
R.forgetFirstAskForTests();
R.setResumePage('u1', 'rooms', t0);
check(R.takeRestorePage('u1', t0 + 1000) === 'rooms', 'the app opens the remembered page');
check(R.takeRestorePage('u1', t0 + 1500) === 'rooms', 'the same screen starting twice in a row gets the same answer');
check(R.takeRestorePage('u1', t0 + 60_000) === null, 'coming back to the home tab later does not pull the person into a page again');
R.forgetFirstAskForTests();
R.setResumePage('u1', 'store', t0);
R.saveMeeting('u1', 'room-9', t0);
check(R.takeRestorePage('u1', t0 + 1000) === 'lounge', 'being in a meeting takes priority: the app opens the Live Lounge');
R.clearResume();
R.forgetFirstAskForTests();
check(R.takeRestorePage('u1', t0 + 2000) === null, 'logging out forgets everything');

section('5. Broken storage');
data.set('noob.resume.v1', '{not json');
check(R.getResumePage('u1', t0) === null, 'damaged saved data is ignored');
data.set('noob.resume.v1', JSON.stringify({ userId: 'u1', page: 'hack', at: t0, fields: {} }));
check(R.getResumePage('u1', t0) === null, 'an unknown page name is ignored');
globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
let ok = true;
try { R.setResumePage('u1', 'store', t0); R.writeResumeField('u1', 'store', 'a', 1, t0); R.getResumePage('u1', t0); R.saveMeeting('u1', 'r', t0); R.readMeeting('u1', t0); R.clearResume(); } catch { ok = false; }
check(ok, 'blocked storage (private window) never breaks the app');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
