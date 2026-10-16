// Reels start faster: the next reel's video is fetched whole, ahead of time, and played from memory when it is reached
// (src/utils/reelPrefetch.ts, wired into src/components/Reels/ReelsView.tsx).
//
// Usage: node --liftoff-only scripts/supabase/test-reel-prefetch.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// a pretend network: each address answers as told; an aborted request fails like a real one
const answers = new Map();
const calls = [];
globalThis.fetch = (url, opts = {}) => {
  calls.push(url);
  const a = answers.get(url) || { ok: true, size: 1000 };
  return new Promise((resolve, reject) => {
    const done = () => resolve({
      ok: a.ok,
      headers: { get: (h) => (h.toLowerCase() === 'content-length' && a.length !== undefined ? String(a.length) : null) },
      blob: async () => new Blob([new Uint8Array(a.size)], a.type === undefined ? {} : { type: a.type })
    });
    opts.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    setTimeout(done, a.delay ?? 5);
  });
};
const made = [];
const revoked = [];
URL.createObjectURL = (blob) => { const u = `blob:test/${made.length}`; made.push({ u, blob }); return u; };
URL.revokeObjectURL = (u) => { revoked.push(u); };

const P = await import(pathToFileURL(path.resolve('src/utils/reelPrefetch.ts')).href);

section('1. Fetching ahead');
check(P.prefetchedReel('/a.mp4') === null && P.prefetchedReel(undefined) === null, 'nothing is ready before it was fetched');
P.prefetchReel('/a.mp4');
P.prefetchReel('/a.mp4');
check(calls.length === 1, 'the same reel is not fetched twice');
check(P.prefetchedReel('/a.mp4') === null, 'it is not ready until the whole file has arrived');
await sleep(40);
check(P.prefetchedReel('/a.mp4') === 'blob:test/0', 'once it has arrived it is played from memory (a blob: address)');
check(made[0].blob.type === 'video/mp4', 'a file that came with no type is given a video type (some phones refuse to play it otherwise)');
P.prefetchReel('/a.mp4');
check(calls.length === 1, 'a reel that is already in memory is not fetched again');
answers.set('/m.mov', { ok: true, size: 500, type: '' });
P.prefetchReel('/m.mov'); await sleep(40);
check(made[made.length - 1].blob.type === 'video/quicktime', '.mov files are marked as QuickTime');
answers.set('/w.webm?x=1', { ok: true, size: 500, type: 'video/webm' });
P.prefetchReel('/w.webm?x=1'); await sleep(40);
check(made[made.length - 1].blob.type === 'video/webm', 'a file that already has a type keeps it');
P.clearReelPrefetch();

section('2. Anything that goes wrong is silent');
answers.set('/big.mp4', { ok: true, size: 100, length: P.MAX_BYTES + 1 });
P.prefetchReel('/big.mp4'); await sleep(40);
check(P.prefetchedReel('/big.mp4') === null, 'a file larger than the limit is left to stream as it plays');
answers.set('/gone.mp4', { ok: false, size: 0 });
P.prefetchReel('/gone.mp4'); await sleep(40);
check(P.prefetchedReel('/gone.mp4') === null, 'a refused / missing file is not "ready"');
answers.set('/gone.mp4', { ok: true, size: 100 });
const before = calls.length;
P.prefetchReel('/gone.mp4'); await sleep(40);
check(calls.length === before + 1 && P.prefetchedReel('/gone.mp4') !== null, 'and may be tried again later');
answers.set('/empty.mp4', { ok: true, size: 0 });
P.prefetchReel('/empty.mp4'); await sleep(40);
check(P.prefetchedReel('/empty.mp4') === null, 'an empty file is not "ready"');
const n = calls.length;
P.prefetchReel('blob:x/1'); P.prefetchReel('data:video/mp4;base64,AAAA'); P.prefetchReel(''); P.prefetchReel(null);
check(calls.length === n, 'addresses that are already in memory, and empty ones, are ignored');
P.clearReelPrefetch();

section('3. Memory is kept small');
made.length = 0; revoked.length = 0;
P.markReelInUse('/r1.mp4');
for (const k of ['/r1.mp4', '/r2.mp4', '/r3.mp4', '/r4.mp4']) { P.prefetchReel(k); await sleep(25); }
await sleep(30);
check(P.prefetchedReel('/r1.mp4') !== null, 'the reel that is playing is never taken out of memory');
check(P.prefetchedReel('/r2.mp4') === null && revoked.length === 1, 'when more than three are held, the oldest other one is given back (and its memory freed)');
check(P.prefetchedReel('/r3.mp4') !== null && P.prefetchedReel('/r4.mp4') !== null, 'the newest ones stay');
P.clearReelPrefetch();
check(P.prefetchedReel('/r1.mp4') === null && P.prefetchedReel('/r4.mp4') === null && revoked.length === 4, 'closing the reels page gives everything back');

section('4. A fetch that is still running can be stopped');
answers.set('/slow.mp4', { ok: true, size: 100, delay: 60 });
P.prefetchReel('/slow.mp4');
P.cancelReelPrefetch('/slow.mp4');
await sleep(100);
check(P.prefetchedReel('/slow.mp4') === null, 'a reel that is reached while still being fetched is streamed instead (the two would only compete)');
P.cancelReelPrefetch('/never-started.mp4');
P.cancelReelPrefetch(undefined);
check(true, 'stopping something that never started is harmless');
P.clearReelPrefetch();

section('5. The reels page uses it');
const view = read('src/components/Reels/ReelsView.tsx');
check(/setTimeout\(\(\) => setNextWarm\(true\), 1200\)/.test(view), 'the next reel starts to be fetched once the person has stayed on this one for a moment');
check(/if \(!nextWarm \|\| !connectionOk \|\| !nextReel\?\.videoUrl\) return;/.test(view) && /connectionOk = !connection \|\| \(!connection\.saveData && connection\.effectiveType !== '2g' && connection\.effectiveType !== 'slow-2g'\)/.test(view), 'never on Data Saver or a 2G connection');
check(/if \(!fastConnection && !currentLoaded\) return;\s*\/\/ on a slower connection the reel being watched gets the line first\s*\n\s*prefetchReel\(nextReel\.videoUrl\);/.test(view), 'on a slower connection (3G) only once the reel being watched has been downloaded in full');
check(/video\.buffered\.end\(video\.buffered\.length - 1\) >= video\.duration - 0\.3/.test(view) && /addEventListener\('progress', checkLoaded\)/.test(view), 'the reel being watched is known to be fully downloaded from the video\'s own events');
check(/video\.src = prefetchedReel\(currentReel\.videoUrl\) \|\| currentReel\.videoUrl;/.test(view) && /cancelReelPrefetch\(currentReel\.videoUrl\);\s*\n\s*markReelInUse\(currentReel\.videoUrl\);/.test(view), 'a reel fetched ahead plays from memory, otherwise from its normal address');
check(/startsWith\('blob:'\) && videoUrlRef\.current\) \{[\s\S]{0,260}video\.src = videoUrlRef\.current;/.test(view), 'if the copy in memory cannot be played, the reel plays from its normal address');
check(/releaseReelPlayer\(\);\s*\n\s*clearReelPrefetch\(\);/.test(view), 'leaving the reels gives the memory back');
check(!/preload=\{nextPreload\}/.test(view) && !/key=\{`preload/.test(view), 'the hidden preload videos (which did nothing on an iPhone, and doubled the download elsewhere) are gone');
check(/preloadStoryPictures\(\[1, 2, 3\]\.map\(\(n\) => localReels\[currentIndex \+ n\]\?\.thumbnailUrl\)/.test(view), 'the pictures of the next reels are fetched at once, so they are there under the finger');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
