// The arithmetic behind the video compressor: how big the picture is, how many bits it gets, and when a video is left alone or is too long for one file.
// Usage: node --liftoff-only scripts/supabase/test-video-plan.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const P = await import(pathToFileURL(path.resolve('src/utils/videoPlan.ts')).href);
const MB = 1024 * 1024;
const phone = (over = {}) => ({ durationSec: 600, width: 1920, height: 1080, fps: 30, audioBytes: 600 * 16000, sourceBytes: 1500 * MB, sourceVideoBps: 20_000_000, ...over });
const fmt = (p) => `${p.width}x${p.height}@${p.fps} ${(p.videoBps / 1e6).toFixed(2)}Mbps bpp ${p.bpp.toFixed(3)} ~${(p.estimatedBytes / MB).toFixed(1)}MB`;

section('1. A 10-minute phone video (the one that failed to upload)');
const ten = P.planEncoding(phone());
console.log('       ' + fmt(ten));
check(ten.transcode && ten.fits, 'it is compressed and it fits');
check(ten.estimatedBytes <= P.MAX_UPLOAD_BYTES, 'the finished file is under the limit', String(ten.estimatedBytes));
check(Math.min(ten.width, ten.height) <= 540 && Math.min(ten.width, ten.height) >= 360, 'the picture steps down to a size where every pixel still gets enough bits', fmt(ten));
check(ten.bpp >= P.BPP_LOWEST, 'at least the "acceptable" bits per pixel', String(ten.bpp));
check(ten.width % 2 === 0 && ten.height % 2 === 0, 'the sizes are even numbers (H.264 needs that)');

section('2. A 70-second reel keeps its full size');
const reel = P.planEncoding(phone({ durationSec: 70, width: 1080, height: 1920, audioBytes: 70 * 16000, sourceBytes: 170 * MB }));
console.log('       ' + fmt(reel));
check(reel.transcode && Math.min(reel.width, reel.height) === 1080, 'a short video stays 1080 pixels wide');
check(reel.bpp >= P.BPP_GOOD && reel.estimatedBytes <= P.MAX_UPLOAD_BYTES, 'with plenty of bits, and under the limit', fmt(reel));
check(reel.width === 1080 && reel.height === 1920, 'portrait stays portrait', `${reel.width}x${reel.height}`);

section('3. A short clip is not made worse than it needs to be');
const clip = P.planEncoding(phone({ durationSec: 20, audioBytes: 20 * 16000, sourceBytes: 45 * MB, sourceVideoBps: 18_000_000 }));
console.log('       ' + fmt(clip));
check(clip.transcode && Math.min(clip.width, clip.height) === 1080, 'a 20 second 1080p clip stays 1080p');
check(Math.abs(clip.bpp - P.BPP_COMFORT) < 0.002 || clip.videoBps <= 18_000_000 * 0.85 + 1, 'and gets the comfortable bitrate, not the whole 48 MB');

section('4. Left alone');
check(!P.planEncoding(phone({ sourceBytes: 4 * MB, durationSec: 10 })).transcode && P.planEncoding(phone({ sourceBytes: 4 * MB, durationSec: 10 })).reason === 'small', 'a file under 6 MB is sent as it is');
const light = P.planEncoding({ durationSec: 60, width: 1280, height: 720, fps: 30, audioBytes: 60 * 16000, sourceBytes: 20 * MB, sourceVideoBps: 2_000_000 });
check(!light.transcode && light.reason === 'light', 'a video that is already efficient and under the limit is sent as it is', JSON.stringify(light));

section('5. Too long for one file');
const max = P.maxSecondsThatFit(128000);
console.log(`       longest that fits: ${max} s (${(max / 60).toFixed(1)} min) at 128 kbps sound`);
check(max >= 15 * 60 && max <= 40 * 60, 'about 15-40 minutes fit in one 48 MB file', String(max));
const tooLong = P.planEncoding(phone({ durationSec: 3600, audioBytes: 3600 * 16000, sourceBytes: 9000 * MB }));
check(tooLong.fits === false && tooLong.reason === 'too-long', 'an hour does not fit');
const justFits = P.planEncoding(phone({ durationSec: max - 30, audioBytes: (max - 30) * 16000, sourceBytes: 4000 * MB }));
check(justFits.fits && justFits.estimatedBytes <= P.MAX_UPLOAD_BYTES, 'just under that limit still fits', fmt(justFits));
check(P.describeSeconds(45) === '45 seconds' && P.describeSeconds(600) === '10 minutes' && P.describeSeconds(7200) === '2 hours', 'lengths are written the way a person says them', [P.describeSeconds(45), P.describeSeconds(600), P.describeSeconds(7200)].join(' | '));

section('6. Other shapes');
const uhd = P.planEncoding(phone({ width: 3840, height: 2160, fps: 60, durationSec: 30, audioBytes: 30 * 16000, sourceBytes: 600 * MB, sourceVideoBps: 100_000_000 }));
check(Math.min(uhd.width, uhd.height) === 1080 && uhd.fps === 30, '4K 60 fps becomes 1080p 30 fps', fmt(uhd));
const small = P.planEncoding(phone({ width: 640, height: 360, durationSec: 900, audioBytes: 900 * 16000, sourceBytes: 200 * MB, sourceVideoBps: 1_800_000 }));
check(small.width <= 640 && small.height <= 360, 'a small video is never scaled up', fmt(small));
check(P.targetFps(59.94) === 30 && P.targetFps(24) === 24 && P.targetFps(10) === 15 && P.targetFps(NaN) === 30 && P.targetFps(30, true) === 24, 'frame rates: 60 -> 30, 24 stays, never below 15, unknown -> 30, tight -> 24');
check(P.sizeForStep(1920, 1080, 720).width === 1280 && P.sizeForStep(1080, 1920, 720).height === 1280 && P.sizeForStep(1000, 1000, 2000).width === 1000, 'scaling keeps the shape and turns the shorter side into the step');

section('7. Sweep: every length from 5 s to the limit fits, with even sizes');
let bad = '';
for (let d = 5; d <= max - 20; d += 37) {
  for (const [w, h, br] of [[1920, 1080, 17e6], [1080, 1920, 17e6], [3840, 2160, 60e6], [1280, 720, 6e6]]) {
    const p = P.planEncoding({ durationSec: d, width: w, height: h, fps: 30, audioBytes: d * 16000, sourceBytes: (br * d) / 8, sourceVideoBps: br });
    if (!p.fits) { bad = `does not fit: ${d}s ${w}x${h}`; break; }
    if (p.transcode && (p.estimatedBytes > P.MAX_UPLOAD_BYTES * 1.001 || p.width % 2 || p.height % 2 || p.videoBps < 80000)) { bad = `${d}s ${w}x${h}: ${fmt(p)}`; break; }
  }
  if (bad) break;
}
check(!bad, 'about 30 lengths x 4 kinds of video', bad);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
