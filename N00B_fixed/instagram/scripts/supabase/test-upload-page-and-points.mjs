// (1) The full-screen upload page: one bar that fills from left to right over both steps, what it says, how long is left, and where it is used.
// (2) Points for a post / reel / video as the app shows them (the database side is test-content-points-db.mjs).
// Usage: node --liftoff-only scripts/supabase/test-upload-page-and-points.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const B = await import(pathToFileURL(path.resolve('src/utils/uploadBar.ts')).href);
const page = read('src/components/Common/UploadProgressPage.tsx');
const post = read('src/components/PostCreation/PostCreationModal.tsx');
const videos = read('src/components/Videos/UploadVideoModal.tsx');
const chat = read('src/components/Chat/ChatView.tsx');

section('1. The bar');
const c = (f) => ({ stage: 'compressing', fraction: f });
const u = (f) => ({ stage: 'uploading', fraction: f });
check(B.overallFraction(c(0), true) === 0 && B.overallFraction(c(1), true) === B.COMPRESS_SHARE, 'making the video smaller fills the first part of the bar');
check(B.overallFraction(u(0), true) === B.COMPRESS_SHARE && B.overallFraction(u(1), true) === 1, 'sending fills the rest, up to the end');
check(B.overallFraction(u(0.5), false) === 0.5, 'a video that needs no making-smaller (or a photo) is the whole bar');
const seq = [c(0), c(0.3), c(0.7), c(1), u(0), u(0.4), u(1)].map((p) => B.overallFraction(p, true));
check(seq.every((v, i, a) => i === 0 || v >= a[i - 1]) && seq[0] === 0 && seq[seq.length - 1] === 1, 'over a whole upload the bar only ever goes forward, from 0 to the end', JSON.stringify(seq));
check(B.overallFraction({ stage: 'uploading', fraction: 7 }, false) === 1 && B.overallFraction({ stage: 'uploading', fraction: -3 }, false) === 0 && B.overallFraction({ stage: 'uploading', fraction: NaN }, false) === 0, 'nonsense numbers cannot push it out of the bar');
check(B.secondsLeft(0.01, 1) === null && B.secondsLeft(0.5, 2) === null && B.secondsLeft(1, 30) === null, 'no time is promised before there is enough to go on, or at the end');
check(B.secondsLeft(0.5, 20) === 20 && B.secondsLeft(0.25, 10) === 30, 'time left follows the speed so far');
check(B.leftText(null) === '' && B.leftText(4) === 'a few seconds left' && B.leftText(42) === 'about 40 seconds left' && B.leftText(300) === 'about 5 minutes left', 'and is said in plain words', [B.leftText(4), B.leftText(42), B.leftText(300)].join(' | '));

section('2. What it says');
let h = B.headline(u(0), false);
check(h.title === 'Getting your video ready' && h.steps === 1, 'at the very start: getting the video ready');
h = B.headline(c(0.2), true);
check(h.title === 'Making your video smaller' && h.step === 1 && h.steps === 2 && /stays sharp/.test(h.sub), 'step 1 of 2: making it smaller, and that the picture stays sharp');
h = B.headline(u(0.4), true);
check(h.title === 'Uploading your video' && h.step === 2 && h.steps === 2, 'step 2 of 2: uploading');
check(B.headline(u(0.4), false).steps === 1, 'a video that was not made smaller has one step');
h = B.headline(u(1), true);
check(h.title === 'Finishing up', 'at 100 %: finishing up');
h = B.headline({ stage: 'retrying', fraction: 0, attempt: 2, of: 4, reason: 'the connection dropped' }, true);
check(h.tone === 'retry' && /Trying again \(2 of 4\) - the connection dropped/.test(h.sub), 'when the connection drops it says so and that it is trying again');

section('3. The page');
check(/createPortal\(/.test(page) && /document\.body/.test(page) && /fixed inset-0 z-\[140\] bg-black/.test(page), 'it covers the whole screen, whatever it is opened from');
check(/role="progressbar"/.test(page) && /aria-valuenow=\{pct\}/.test(page) && /style=\{\{ width: `\$\{pct\}%` \}\}/.test(page) && /transition-\[width\]/.test(page), 'the bar is a real progress bar whose fill grows from the left by the percentage');
check(/high\.current = shown/.test(page) && /Math\.max\(high\.current, overallFraction/.test(page), 'it never moves backwards, even when a try is repeated');
check(/\{pct\}%/.test(page) && /data-testid="upload-percent"/.test(page) && /leftText\(secondsLeft\(/.test(page), 'it shows the percentage and about how long is left');
check(/Making it smaller/.test(page) && /Uploading<\/span>|Uploading\s*$/m.test(page) && /data-testid="upload-steps"/.test(page), 'it shows the two steps, the one in progress turning, the finished one ticked');
check(/onCancel && \(/.test(page) && /Cancel upload/.test(page), 'and a Cancel');

section('4. Where it is used');
check(/<UploadProgressPage progress=\{uploadProgress\} onCancel=\{\(\) => uploadAbortRef\.current\?\.abort\(\)\} \/>/.test(post) && /onProgress: setUploadProgress/.test(post) && /setUploadProgress\(null\)/.test(post), 'Create (reels): the page, with Cancel, while the video is made smaller and sent');
check(/<UploadProgressPage progress=\{progress\} onCancel=\{\(\) => abortRef\.current\?\.abort\(\)\} \/>/.test(videos) && /onProgress: setProgress/.test(videos), 'Videos: the same page');
check(/attachIsVideo && <UploadProgressPage progress=\{attachProgress\}/.test(chat) && /!attachIsVideo && \(/.test(chat) && /setAttachIsVideo\(mediaType === 'video'\)/.test(chat), 'Chat: a video gets the page, a photo keeps the small strip');
check(!/Making the video smaller\.\.\./.test(post + videos), 'the old one-line "Making the video smaller..." text is gone from the Create and Videos screens');

section('5. Points: what the app shows');
const types = read('src/types.ts');
check(/\| 'points_earned'/.test(types) && /\| 'points_removed'/.test(types), 'two new kinds of notification: points received, points taken back');
const modal = read('src/components/Modals/NotificationsModal.tsx');
check(/case 'points_earned':\s*\n\s*return <Coins className="w-3\.5 h-3\.5 text-noob" \/>;/.test(modal) && /case 'points_removed':\s*\n\s*return <Coins className="w-3\.5 h-3\.5 text-rose-400" \/>;/.test(modal), 'each has its own coin (green for received, red for taken back)');
const stats = read('src/components/Profile/AccountsStatisticsModal.tsx');
check(/break-words" data-testid="points-reason">\{tx\.reason\}/.test(stats) && !/truncate">\{tx\.reason\}/.test(stats), 'the points history shows the whole reason (it used to be cut off)');
check(/tx\.amount > 0 \? '\+' : ''/.test(stats) && /text-zinc-500/.test(stats), 'and a line that moved nothing shows 0, not +0');
const sql = read('supabase/migrations/20261019000001_points_for_content.sql');
check(/when 'points_earned' then 'notif\.points' when 'points_removed' then 'notif\.points'/.test(sql), 'both follow the "points" notification switch');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
