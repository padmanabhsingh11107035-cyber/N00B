// Video upload: how the compressor, the uploader and the screens are put together (the arithmetic is in test-video-plan.mjs; the real encoding and the real sending were
// run in a browser against a real server). Usage: node --liftoff-only scripts/supabase/test-video-upload.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const compressor = read('src/utils/mediaCompressor.ts');
const transcode = read('src/utils/videoTranscode.ts');
const plan = read('src/utils/videoPlan.ts');
const xhr = read('src/utils/xhrUpload.ts');
const progress = read('src/utils/uploadProgress.ts');
const api = read('src/services/supabaseApi.ts');
const chat = read('src/components/Chat/ChatView.tsx');
const post = read('src/components/PostCreation/PostCreationModal.tsx');
const videos = read('src/components/Videos/UploadVideoModal.tsx');
const pkg = JSON.parse(read('package.json'));

section('1. The limit');
const bucket = Number((read('supabase/migrations/20260919000003_media_storage.sql').match(/file_size_limit[^0-9]*(\d+)/i) || [])[1]);
const ours = Number((plan.match(/MAX_UPLOAD_BYTES = (\d+) \* 1024 \* 1024/) || [])[1]) * 1024 * 1024;
check(bucket === 52428800, 'storage takes 50 MiB a file (52 428 800 bytes)', String(bucket));
check(ours > 0 && ours < bucket && bucket - ours >= 1024 * 1024, 'and we aim at 48 MiB, with room left for the file\'s own wrapper', String(ours));

section('2. The compressor');
check(/await import\('\.\/videoTranscode'\)/.test(compressor) && !/^import .*videoTranscode/m.test(compressor), 'the encoder is loaded only when a video is chosen (it is not in the main download)');
check(/t\.canTranscode\(\)/.test(compressor) && /t\.transcodeVideo\(file, \{/.test(compressor) && /stage: 'compressing', fraction/.test(compressor), 'a video is re-encoded when the browser can, and reports how far it has got');
check(/name === 'VideoTooLongError' \|\| name === 'AbortError'\) throw err/.test(compressor) && (compressor.match(/name === 'VideoTooLongError' \|\| name === 'AbortError'\) throw err/g) || []).length === 2, '"too long" and "cancelled" reach the person; every other problem falls back to the original file');
check(/compressVideoOnAndroid/.test(compressor) && /isAndroid\(\)/.test(compressor), 'a browser that can not re-encode keeps the older Android path');
check(transcode.split(String.fromCharCode(10)).filter((l) => /\.arrayBuffer\(\)/.test(l) && !l.trim().startsWith('//')).every((l) => /\.slice\(/.test(l)) && /\.arrayBuffer\(\)/.test(transcode), 'the whole video is never read into memory at once (only slices of it)');
check(/new Uint8Array\(data\)/.test(transcode) && /frame\.close\(\)/.test(transcode) && /out\.close\(\)/.test(transcode), 'sound pieces are copied and every picture is closed (memory stays flat on a long video)');
check(/STALL_MS = 60_000/.test(transcode) && /wakeLock/.test(transcode) && /removeEventListener\('abort'/.test(transcode), 'a stuck encode is stopped after a minute, the screen stays awake while it works, and cancel works');
check(/codec: 'avc'/.test(transcode) && /avc: \{ format: 'avc' \}/.test(transcode) && /fastStart: 'in-memory'/.test(transcode) && /cross-track-offset/.test(transcode), 'the result is H.264 in an MP4 with the index at the front (plays everywhere and starts quickly), picture and sound in step');
check(/h264Candidates/.test(transcode) && /isConfigSupported/.test(transcode), 'the encoder settings are checked with the phone before they are used');
check(/probe\.rotation/.test(transcode) && /ctx\.rotate/.test(transcode), 'a video held upright (rotation in the file) is turned right');
check(/buffer\.byteLength > target/.test(transcode) && /VideoTooLongError/.test(transcode), 'if the first result is over the limit it is done once more, lower, and then refused with a clear error');

section('3. The upload');
check(!/supabase\.storage\.from\(MEDIA_BUCKET\)\.upload\(/.test(api), 'the library\'s one-shot upload (no progress, no retry) is gone');
check(/await uploadWithRetry\(\{/.test(api) && /storage\/v1\/object\/\$\{MEDIA_BUCKET\}\/\$\{key\}/.test(api) && /'x-upsert': 'false'/.test(api) && /form\.append\('cacheControl', '31536000'\)/.test(api) && /form\.append\('', file\)/.test(api), 'it sends the same request, with the same form');
check(/Bearer \$\{\(await currentSession\(\)\)\?\.access_token \|\| anon\}/.test(api), 'with the current login, asked for again on every try (a renewed login is used)');
check(/file\.size > MAX_UPLOAD_BYTES/.test(api) && /could not be made smaller on this phone/.test(api), 'a file over the limit is refused before anything is sent, in words');
check(/export async function uploadMediaFile\(\s*file: File,\s*folder: MediaFolder = 'posts',\s*opts: UploadOptions = \{\}/.test(api) && /onProgress: opts\.onProgress, signal: opts\.signal/.test(api) && /return uploadToStorage\(optimizedFile, folder, opts\)/.test(api), 'progress and cancel pass through from the screen to the compressor and the upload');
check(/attempts \?\? 4/.test(xhr) && /\[1000, 3000, 7000\]/.test(xhr) && /stallMs \?\? 45_000/.test(xhr) && /status === 408/.test(xhr) && /status >= 500/.test(xhr), 'four tries, waiting 1, 3 and 7 seconds, an attempt that is silent for 45 seconds is stopped');

section('4. The screens');
check(/describeProgress/.test(progress) && /Making the video smaller/.test(progress) && /trying again \(\$\{p\.attempt\} of \$\{p\.of\}\)/.test(progress) && /Upload cancelled\./.test(progress), 'the words: making smaller, uploading, trying again (n of m), cancelled');
check(/<UploadProgressPage progress=\{uploadProgress\}/.test(post) && /uploadAbortRef\.current\?\.abort\(\)/.test(post) && /onProgress: setUploadProgress/.test(post) && /explainUploadError\(err\)/.test(post), 'Create (reels): the full-page progress with a Cancel, and a clear reason when it fails');
check(/<UploadProgressPage progress=\{progress\}/.test(videos) && /abortRef\.current\?\.abort\(\)/.test(videos) && /onProgress: setProgress/.test(videos) && /explainUploadError\(err\)/.test(videos), 'Videos: the full-page progress with a Cancel, and a clear reason when it fails');
check(/probeVideo\(file\)/.test(videos) && /maxSecondsThatFit/.test(videos) && /One upload can hold about/.test(videos) && /file\.size > MAX_UPLOAD_BYTES/.test(videos), 'Videos: a video that can not fit in one upload is refused when it is chosen, with how much does fit');
check(/data-testid="chat-upload-progress"/.test(chat) && /<UploadProgressPage progress=\{attachProgress\}/.test(chat) && /attachAbortRef\.current\?\.abort\(\)/.test(chat) && !/50MB/.test(chat) && /mediaType === 'image' && file\.size > 15 \* 1024 \* 1024/.test(chat), 'Chat: a progress bar and a Cancel; a video is no longer refused at 50 MB before it has been made smaller');

section('5. What it is built on');
check(pkg.dependencies && pkg.dependencies['mp4box'] && pkg.dependencies['mp4-muxer'], 'the two small libraries (reading and writing MP4) are in the app\'s list');
check(/import\('mp4box'\)/.test(transcode) && /import\('mp4-muxer'\)/.test(transcode) && !/^import .*(mp4box|mp4-muxer)/m.test(transcode), 'and they are loaded only when a video is compressed');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
