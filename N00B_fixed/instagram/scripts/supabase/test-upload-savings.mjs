// How new uploads are made smaller: sizes, formats, what is left alone, video cap. Usage: node --liftoff-only scripts/supabase/test-upload-savings.mjs
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const U = await import(pathToFileURL(path.resolve('src/utils/uploadSavings.ts')).href);
const V = await import(pathToFileURL(path.resolve('src/utils/videoPlan.ts')).href);
const KB = 1024, MB = 1024 * 1024;

console.log('\n1. Biggest side per place (Media quality setting respected, High is not capped)');
check(U.effectiveMaxSide('avatars', 640) === 512, 'avatar normal 640 -> 512');
check(U.effectiveMaxSide('avatars', 1024) === 1024, 'avatar High 1024 stays');
check(U.effectiveMaxSide('stories', 1440) === 1280 && U.effectiveMaxSide('chat', 1440) === 1280, 'story and chat 1440 -> 1280');
check(U.effectiveMaxSide('posts', 1440) === 1440, 'post normal stays 1440 (setting is below the 1600 cap)');
check(U.effectiveMaxSide('posts', 2160) === 2160, 'post High 2160 stays');
check(U.effectiveMaxSide('posts', 1080) === 1080 && U.effectiveMaxSide('chat', 1080) === 1080, 'data saver 1080 stays');
check(U.effectiveMaxSide('covers', 1440) === 1440, 'cover 1440');
check(U.effectiveMaxSide('unknown-folder', NaN) === 1440, 'bad setting falls back to 1440');

console.log('\n2. Fitting a size');
let f = U.fitWithin(4000, 3000, 1280);
check(f.width === 1280 && f.height === 960 && f.scaled, '4000x3000 -> 1280x960');
f = U.fitWithin(3000, 4000, 1280);
check(f.width === 960 && f.height === 1280, 'portrait keeps its shape');
f = U.fitWithin(800, 600, 1280);
check(f.width === 800 && f.height === 600 && !f.scaled, 'never upscaled');
f = U.fitWithin(10000, 3, 1280);
check(f.width === 1280 && f.height >= 1, 'a thin strip never becomes 0 pixels');

console.log('\n3. What is left alone before decoding');
check(U.shouldSkipImage({ type: 'image/gif', size: 5 * MB }), 'GIF untouched');
check(U.shouldSkipImage({ type: 'image/svg+xml', size: 5 * MB }), 'SVG untouched');
check(U.shouldSkipImage({ type: 'image/webp', size: 5 * MB, animated: true }), 'animated WebP untouched');
check(!U.shouldSkipImage({ type: 'image/webp', size: 5 * MB, animated: false }), 'static big WebP may be shrunk');
check(U.shouldSkipImage({ type: 'image/jpeg', size: 50 * KB }), 'tiny JPEG untouched');
check(!U.shouldSkipImage({ type: 'image/jpeg', size: 3 * MB }), 'big JPEG processed');
check(!U.shouldSkipImage({ type: 'image/heic', size: 20 * KB }), 'HEIC is always converted, even small');
check(U.shouldSkipImage({ type: 'video/mp4', size: 3 * MB }), 'not an image: untouched');

console.log('\n4. Format decision');
let p = U.planImage({ type: 'image/jpeg', width: 4000, height: 3000, maxSide: 1280, supportsWebp: true });
check(p.outType === 'image/webp' && p.scaled && p.width === 1280, 'JPEG -> WebP when the browser can write it');
p = U.planImage({ type: 'image/jpeg', width: 4000, height: 3000, maxSide: 1280, supportsWebp: false });
check(p.outType === 'image/jpeg', 'JPEG stays JPEG when WebP cannot be written');
p = U.planImage({ type: 'image/heic', width: 4000, height: 3000, maxSide: 1280, supportsWebp: true });
check(p.outType === 'image/jpeg' && p.heic, 'HEIC -> JPEG always');
p = U.planImage({ type: 'image/png', width: 1000, height: 1000, maxSide: 1280, supportsWebp: true });
check(p.needsAlphaCheck, 'PNG is checked for see-through pixels');
p = U.planImage({ type: 'image/jpeg', width: 1000, height: 1000, maxSide: 1280, supportsWebp: true });
check(!p.needsAlphaCheck, 'JPEG has no alpha check');

console.log('\n5. Keep the original unless the new one is really smaller');
check(U.useReencoded({ origSize: 3 * MB, newSize: 400 * KB, scaled: true, heic: false }), 'resized and smaller: use it');
check(!U.useReencoded({ origSize: 300 * KB, newSize: 310 * KB, scaled: true, heic: false }), 'resized but bigger: keep original');
check(!U.useReencoded({ origSize: 300 * KB, newSize: 290 * KB, scaled: false, heic: false }), 'same size, saves only 3 %: keep original (no needless quality loss)');
check(U.useReencoded({ origSize: 300 * KB, newSize: 200 * KB, scaled: false, heic: false }), 'same size, saves a third: use it');
check(U.useReencoded({ origSize: 300 * KB, newSize: 900 * KB, scaled: false, heic: true }), 'HEIC: always use the JPEG');
check(!U.useReencoded({ origSize: 300 * KB, newSize: 0, scaled: true, heic: false }), 'empty result: never');

console.log('\n6. Reading file headers');
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
const webp = (flags) => { const b = new Uint8Array(32); b.set(ascii('RIFF'), 0); b.set(ascii('WEBP'), 8); b.set(ascii('VP8X'), 12); b[20] = flags; return b; };
check(U.isAnimatedWebp(webp(0x02)), 'animated WebP found');
check(!U.isAnimatedWebp(webp(0x10)), 'still WebP not flagged');
check(!U.isAnimatedWebp(new Uint8Array(5)), 'short / garbage header is not animated');
const png = (type) => { const b = new Uint8Array(33); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); b[25] = type; return b; };
check(U.pngMayHaveAlpha(png(6)) && U.pngMayHaveAlpha(png(4)) && U.pngMayHaveAlpha(png(3)), 'RGBA / grey+alpha / palette PNG may be see-through');
check(!U.pngMayHaveAlpha(png(2)) && !U.pngMayHaveAlpha(png(0)), 'RGB / grey PNG cannot be');
check(U.pngMayHaveAlpha(new Uint8Array(3)), 'unreadable header: be careful (assume it may)');

console.log('\n7. Plain-language saved text');
check(U.describeSaved(5 * MB, 2.6 * MB) === 'Saved 2.4 MB', '2.4 MB');
check(U.describeSaved(900 * KB, 260 * KB) === 'Saved 640 KB', '640 KB');
check(U.describeSaved(100 * KB, 90 * KB) === '' && U.describeSaved(1 * MB, 2 * MB) === '', 'nothing worth saying: empty');

console.log('\n8. Videos: at most 720p for posts, stories and chat');
check(U.videoMaxStep('chat') === 720 && U.videoMaxStep('stories') === 720 && U.videoMaxStep('reels') === 720 && U.videoMaxStep('posts') === 720, '720 for posts/stories/chat/reels');
check(U.videoMaxStep('videos') === undefined, 'long videos keep the full ladder');
const base = { durationSec: 30, width: 1920, height: 1080, fps: 30, audioBytes: 30 * 16000, sourceBytes: 200 * MB, sourceVideoBps: 20_000_000 };
const open = V.planEncoding(base);
const capped = V.planEncoding({ ...base, maxStep: 720 });
check(Math.min(open.width, open.height) === 1080, 'without a cap a 30 s 1080p clip stays 1080');
check(capped.transcode && Math.min(capped.width, capped.height) === 720 && capped.width === 1280, 'with the cap it becomes 1280x720', `${capped.width}x${capped.height}`);
check(capped.videoBps < open.videoBps && capped.estimatedBytes < open.estimatedBytes, 'and the file is smaller');
const small = V.planEncoding({ ...base, width: 640, height: 360, maxStep: 720 });
check(Math.min(small.width, small.height) <= 360, 'a 360p video is never scaled up');
const longCap = V.planEncoding({ ...base, durationSec: 600, audioBytes: 600 * 16000, maxStep: 720 });
check(longCap.fits && longCap.estimatedBytes <= V.MAX_UPLOAD_BYTES, 'a long video with the cap still fits the limit');
const tiny = V.planEncoding({ ...base, sourceBytes: 3 * MB, maxStep: 720 });
check(!tiny.transcode, 'an already small file is still sent as it is');

console.log('\n9. Wiring');
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const api = read('src/services/supabaseApi.ts');
const mc = read('src/utils/mediaCompressor.ts');
check(/mediaSettingsFor\(folder\)/.test(api) && /maxStep: videoMaxStep\(folder\)/.test(api), 'uploadMediaFile applies per-folder sizes and the video cap');
check(/shouldSkipImage/.test(mc) && /planImage/.test(mc) && /useReencoded/.test(mc), 'compressImage uses the tested rules');
check(/hasSeeThroughPixels/.test(mc), 'see-through PNG/WebP are never flattened');
check(/skipCompress: true/.test(read('src/components/Profile/ProfileCover.tsx')), 'cover (already a baked 1440 JPEG) is the only direct skip');
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
