// NOOB's own face check ("remember the account owner"): the maths, the saved data, and where it is used. Usage: node --liftoff-only scripts/supabase/test-face-id.mjs
import fs from 'node:fs';
const m = await import('../../src/face/faceMatch.ts');
let passed = 0, failed = 0;
const check = (c, l) => { if (c) { passed++; console.log(`  ok   ${l}`); } else { failed++; console.log(`  FAIL ${l}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split('\r').join('');
let seed = 7; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
const face = (base, noise) => base.map((v) => v + (rnd() - 0.5) * noise);
const owner = Array.from({ length: 128 }, () => (rnd() - 0.5) * 0.5);
const stranger = Array.from({ length: 128 }, () => (rnd() - 0.5) * 0.5);

console.log('\n1. Who is the owner');
check(m.distance([0, 0], [3, 4]) === 5 && m.distance([1], [1, 2]) === Infinity, 'distance: the usual straight-line distance; different lengths never match');
const saved = [face(owner, 0.04), face(owner, 0.04), face(owner, 0.04)];
check(m.isMatch(face(owner, 0.04), saved), 'the owner (a new look at the same face) is recognised');
check(!m.isMatch(stranger, saved), 'a different face is refused');
check(!m.isMatch(owner, []), 'with no saved face nothing matches');
check(m.MATCH_THRESHOLD < 0.6, 'the line is stricter than the model\'s usual 0.6, because this guards an account');

console.log('\n2. Saving the face');
check(m.samplesAgree([face(owner, 0.04), face(owner, 0.04), face(owner, 0.04)]), 'steady looks of one face are accepted');
check(!m.samplesAgree([face(owner, 0.04), stranger]) && !m.samplesAgree([owner]), 'two different people, or a single look, are refused');
check(m.isDescriptor(m.roundDescriptor(owner)) && !m.isDescriptor([1, 2, 3]) && !m.isDescriptor(owner.slice(0, 127)), 'only a real 128-number face is accepted when it is read back');

console.log('\n3. A photo must not pass');
const open = (c) => Array.from({ length: 6 }, (_, i) => ({ x: [0, 1, 2, 3, 2, 1][i], y: [0, c, c, 0, -c, -c][i] }));
check(m.eyeAspect(open(0.6)) > 0.3 && m.eyeAspect(open(0.05)) < 0.1, 'eyes wide open and closed give clearly different numbers');
const b = new m.BlinkDetector();
[0.3, 0.3, 0.3].forEach((e) => b.push(e));
check(!b.blinked, 'eyes that stay open (a photo) are not a blink');
[0.12, 0.1, 0.3].forEach((e) => b.push(e));
check(b.blinked, 'open, closed, open again is a blink');
const b2 = new m.BlinkDetector(); [0.1, 0.1, 0.3].forEach((e) => b2.push(e));
check(!b2.blinked, 'closed from the start and then open is not counted (it must have been seen open first)');
const run = new m.MatchRun(); const seq = [true, true, false, true, true, true].map((x) => run.push(x));
check(seq.join() === 'false,false,false,false,false,true', 'three matching looks in a row are needed; a miss starts again');

console.log('\n4. Where it is used, and what stays on the phone');
const id = read('src/face/faceId.ts'), gate = read('src/components/Common/AppLockGate.tsx'), lock = read('src/components/Settings/pages/lock.tsx'), send = read('src/components/Profile/SendPointsPage.tsx'), sheet = read('src/components/Common/FaceCheckSheet.tsx');
check(/localStorage\.setItem\(keyOf\(userId\)/.test(id) && !/fetch\(|supabase|rpc\(/.test(id + sheet), 'the saved face is in this phone\'s storage only; nothing in the face code talks to a server');
check(/new BlinkDetector\(\)/.test(id) && /new MatchRun\(\)/.test(id) && /isMatch\(look\.descriptor, cfg\.descriptors\)/.test(id), 'checking needs a match three times in a row and a blink');
check(/app-lock-own-face/.test(gate) && /mode="verify"/.test(gate) && /markUnlocked\(\)/.test(gate), 'the lock screen (the whole app, or a chosen page) has a camera button that unlocks when the owner is recognised');
check(/face-enroll/.test(lock) && /forgetFace\(user\.id\)/.test(lock) && /face-money/.test(lock), 'Settings > App lock can save the face, try it, replace it, switch the uses on and off, and delete it');
check(/loadFace\(currentUser\.id\)\?\.money/.test(send) && /mode="verify"/.test(send), 'sending NOOB Points can ask for the owner\'s face first (when switched on)');
check(/the phone.s Face ID still works|keep the phone.s Face ID lock on too/.test(lock), 'the page says plainly that this is a convenience on top of the phone\'s own lock');
for (const f of ['face-api.esm.js', 'face_recognition_model.bin', 'tiny_face_detector_model.bin', 'face_landmark_68_tiny_model.bin', 'LICENSE-face-api.txt']) if (!fs.existsSync('public/face/' + f)) { check(false, 'missing public/face/' + f); }
check(read('public/_headers').includes('/face/*') && read('wrangler.jsonc').includes('"!/face/*"'), 'the model files are cached for a week and served straight from the host');
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
