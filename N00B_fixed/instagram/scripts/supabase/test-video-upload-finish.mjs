// The video upload must never sit at "100%" without an end, and "Add to Reels" must reuse the one file. Checks the source of the upload screen and the edit screen.
import fs from 'node:fs';

let passed = 0;
let failed = 0;
const check = (cond, label) => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label}`); } };

const up = fs.readFileSync('src/components/Videos/UploadVideoModal.tsx', 'utf8');
const edit = fs.readFileSync('src/components/Videos/EditVideoDetailsModal.tsx', 'utf8');
const api = fs.readFileSync('src/services/supabaseApi.ts', 'utf8');

console.log('\n1. Nothing after the file is sent can wait for ever');
check(/const withTimeout = /.test(up), 'there is a timeout helper');
check(/withTimeout\(captureVideoFrame\(videoFile\)/.test(up), 'the cover picture capture gives up after a few seconds');
check(/const frameJob/.test(up) && up.indexOf('const frameJob') < up.indexOf("await uploadMediaFile(videoFile, 'videos'"), 'the cover picture is taken while the video goes up, not after it');
check(/withTimeout\(uploadMediaFile\(thumbnailToUpload/.test(up), 'a cover that can not be sent in time is left out, the video is still posted');
check(/withTimeout\(\s*createLongVideo\(/.test(up), 'saving the video has a time limit with a clear message');
check(/video\.onloadedmetadata = seek/.test(up) && /video\.load\(\)/.test(up), 'the frame grab also works when the phone reports only the metadata (iPhone)');
check(/setProgress\(\{ stage: 'uploading', fraction: 1 \}\)/.test(up), 'the screen says "Finishing up" while the last steps run');

console.log('\n2. Add to Reels uses the same file (no copy)');
check(/data-testid="upload-add-to-reels"/.test(up) && /durationSeconds <= REEL_MAX_SECONDS/.test(up), 'the upload screen offers it only for a video of up to 70 seconds');
check(/addLongVideoToReels\(video\.id\)/.test(up), 'after posting, the video id is sent (no file is sent again)');
check(/data-testid="edit-add-to-reels"/.test(edit) && /fetchLongVideoReelId/.test(edit), 'an existing video can be added from Edit video, and shows when it already is');
check(/rpc<any>\('add_long_video_to_reels', \{ p_video: videoId \}\)/.test(api), 'the app calls the server function with only the video id');
check(!/add_long_video_to_reels[\s\S]{0,300}uploadMediaFile/.test(api), 'no upload happens in that call');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
