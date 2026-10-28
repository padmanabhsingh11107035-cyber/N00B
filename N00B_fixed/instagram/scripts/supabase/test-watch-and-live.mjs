// Watching and going live: the screen stays awake on reels / videos / a live; the line under a reel can be dragged to move through the video;
// a host can step out of the live (it keeps going) and "You are live" with a "Turn off live" button shows on the Create sheet and in a bar; going live
// never waits for ever on a spinner. Usage: node --liftoff-only scripts/supabase/test-watch-and-live.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const awake = read('src/utils/screenAwake.ts');
const reels = read('src/components/Reels/ReelsView.tsx');
const videos = read('src/components/Videos/HomeVideoFeedView.tsx');
const live = read('src/components/LiveStream/LiveStreamView.tsx');
const app = read('src/App.tsx');
const chooser = read('src/components/PostCreation/CreateChooser.tsx');

section('1. The screen stays on');
check(/navigator as any\)\.wakeLock/.test(awake) && /wl\.request\('screen'\)/.test(awake), 'it asks the phone for a screen wake lock');
check(/document\.addEventListener\('visibilitychange'/.test(awake) && /if \(document\.visibilityState === 'visible'\) void acquire\(\);/.test(awake), 'and asks again when the page comes back (the phone takes it away while the page is hidden)');
check(/captureStream/.test(awake) && /video\.srcObject/.test(awake), 'where there is no wake lock, a tiny silent moving video keeps it awake');
check(/holders\+\+/.test(awake) && /holders = Math\.max\(0, holders - 1\);/.test(awake), 'several screens can ask at once; it lets go when the last one is gone');
check(/useScreenAwake\(!pageHidden\)/.test(reels), 'reels keep the screen awake');
check(/useScreenAwake\(!!openVideo\)/.test(videos), 'an open video does too');
check(/useScreenAwake\(phase === 'live'\)/.test(live), 'and a live stream (host and viewers)');

section('2. Dragging the line under a reel');
check(/data-reel-seek/.test(reels) && /role="slider"/.test(reels) && /touch-none/.test(reels), 'the line has a tall touch area that the page does not scroll');
check(/onPointerDown=\{isCur \? beginSeek : undefined\}/.test(reels) && /onPointerMove=\{isCur \? moveSeek : undefined\}/.test(reels) && /onPointerUp=\{isCur \? endSeek : undefined\}/.test(reels) && /onPointerCancel=\{isCur \? endSeek : undefined\}/.test(reels), 'a finger, a mouse or a pen can press, drag and let go');
check(/video\.currentTime = ratio \* video\.duration;/.test(reels) && /Math\.min\(1, Math\.max\(0, \(clientX - r\.left\)/.test(reels), 'the video moves to the place under the finger (held between the start and the end)');
check(/video\.pause\(\);\s*\n\s*seekTo\(e\.clientX, e\.currentTarget\);/.test(reels) && /if \(video && seekWasPlayingRef\.current\) void video\.play\(\)/.test(reels), 'it rests while dragging and carries on from there when let go');
check(/if \(target\?\.closest\('\[data-reel-seek\]'\)\) \{/.test(reels), 'dragging the line is never taken for a swipe to the next reel');
check(/\{fmtTime\(seekTime\)\} \/ \{fmtTime\(videoRef\.current\?\.duration \|\| 0\)\}/.test(reels), 'while dragging, the time is shown (0:23 / 1:05)');

section('3. Live: step out without ending it');
check(/minimized\?: boolean;/.test(live) && /style=\{minimized \? \{ display: 'none' \} : undefined\}/.test(live) && /data-testid="live-minimize"/.test(live), 'the host has a minimize button; the screen hides but stays alive');
check(/onStateChange\?: \(phase: Phase, streamId\?: string\) => void;/.test(live) && /onStateChange\?\.\(phase, streamId\)/.test(live), 'the app is told when the live is on, and its id');
check(/const hostIsLive = showGoLiveHost && liveInfo\.phase === 'live';/.test(app) && /data-testid="live-bar"/.test(app) && /Turn off live/.test(app), 'a bar says "You are live" with Return and Turn off live while it is minimized');
check(/await endLiveStream\(liveInfo\.id\)/.test(app) && /closeHostLive\(\);/.test(app), '"Turn off live" ends it for everyone, then lets go of the camera');
check(/live=\{hostIsLive \? \{ onReturn:/.test(app) && /data-testid="create-live-now"/.test(chooser) && /data-testid="create-live-off"/.test(chooser) && /r\.kind (?:!==|===) 'live'/.test(chooser), 'the Create sheet shows "You are live", Return to live and Turn off live (and no second "Live" row)');
check(/if \(hostIsLive\) \{ setLiveMinimized\(false\); return; \}/.test(app), 'tapping Live while live goes back to the live instead of starting another');

section('4. Going live never waits for ever');
check(!/^import AgoraRTC/m.test(live) && /const loadAgora = \(\) => import\('agora-rtc-sdk-ng'\)/.test(live) && /void loadAgora\(\)\.catch/.test(live), 'the 1.6 MB video SDK loads in the background, so the setup screen opens at once');
check(/within\(startLiveStream\(title\), 20000/.test(live) && /within\(joinLiveStream\(id\), 20000/.test(live) && /within\(loadAgora\(\), 30000/.test(live), 'starting, joining and loading each have a time limit and say what went wrong');
check(/data-testid="live-connecting"/.test(live) && /\{status \|\| 'Connecting…'\}/.test(live) && (live.match(/handleCloseTap\(\)/g) || []).length >= 2, 'the "Connecting" screen says what it is doing and has a Cancel button');
check(/remoteVideoRef\.current\?\.play\(videoRef\.current, \{ fit: 'cover' \}\)/.test(live) && /localTracksRef\.current\?\.\[1\]/.test(live), 'the picture is put on the screen once the live screen exists (it used to be skipped while the spinner was showing)');
check(/void import\('\.\/components\/LiveStream\/LiveStreamView'\)/.test(app), 'the live screen\'s file is fetched while the Create sheet is open');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
