// Videos as posts on Home (2026-11-16): up to 3 minutes, one shared player that starts by itself with sound as a post fills the screen, a Photos / Video choice when creating,
// and a bobbing arrow on the scrolling strips of a laptop.
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8').split(String.fromCharCode(13)).join('');
let passed = 0, failed = 0;
const check = (ok, name) => { if (ok) { passed++; console.log('  ok   ' + name); } else { failed++; console.log('  FAIL ' + name); } };
const dur = read('src/utils/videoDuration.ts'), modal = read('src/components/PostCreation/PostCreationModal.tsx'), fv = read('src/utils/feedVideo.ts'), slot = read('src/components/Feed/FeedVideoSlot.tsx'), card = read('src/components/Feed/PostCard.tsx'), css = read('src/components/Feed/feedVideo.css'), hint = read('src/components/Feed/ScrollMoreHint.tsx'), app = read('src/App.tsx');
check(/POST_VIDEO_MAX_SECONDS = 180;/.test(dur), 'a video in a post can be 3 minutes at most (180 seconds)');
check(/creationType === 'post' && forceType !== 'video'/.test(modal) && /length > POST_VIDEO_MAX_SECONDS/.test(modal) && /uploadMediaFile\(postVideoFile, 'posts'/.test(modal) && /mediaType: 'video'/.test(modal), 'on the Post tab a video becomes the post: its length is checked on the phone before it is uploaded, and it is a video slide');
check(/data-testid="create-pick-photos"/.test(modal) && /data-testid="create-pick-video"/.test(modal) && /up to 3 minutes/.test(modal), 'the first step offers Photos and Video as two clear choices');
check(/A post is either pictures or one video/.test(modal) && /slides\[0\]\?\.mediaType !== 'video'/.test(modal), 'a post is pictures or one video, never both; the picture editor is not shown for a video');
check(/getSoundPreference\(\)/.test(fv) && /playReel\(v, want\)/.test(fv) && /waitForTap\(\)/.test(fv) && /export function armFeedVideo/.test(fv), 'sound is on unless the person turned it off; if the browser refuses it plays silently and the next tap switches the sound on');
check(/export const START_RATIO = 0\.6;/.test(fv) && /export const KEEP_RATIO = 0\.35;/.test(fv) && /bestRatio - currentRatio < 0\.25/.test(fv), 'one video plays at a time: the one that fills the screen most, with some stickiness');
check(/document\.createElement\('video'\)/.test(fv) && (fv.match(/document\.createElement\('video'\)/g) || []).length === 1, 'ONE shared player for all video posts (so a phone keeps its permission for sound)');
check(/<FeedVideoSlot/.test(card) && !/controls\s*\n?\s*loop/.test(card.slice(card.indexOf('renderSlide'), card.indexOf('renderSlide') + 2500)), 'the post card uses the new video slot (no plain video with its own controls and muted autoplay)');
check(/shouldAutoplayVideo\(devicePrefs\)/.test(card) && /autoplay=\{videoMayAutoplay\}/.test(card), 'the autoplay setting (always / Wi-Fi / never) is still obeyed');
check(/data-testid="feed-video-sound"/.test(slot) && /data-testid="feed-video-tap-for-sound"/.test(slot) && /fv-fill/.test(slot) && /aria-label=\{playing \? 'Pause the video' : 'Play the video'\}/.test(slot), 'a tap pauses / plays, a speaker button, "Tap for sound", a progress line');
check(/@media \(prefers-reduced-motion: reduce\) \{ \.fv-play, \.fv-needs-tap/.test(css) && /\.feed-video-el \{ position: absolute; inset: 0;/.test(css), 'the player fills its box; still when the phone asks for less motion');
check(/export const HintedScroll/.test(hint) && /compact \?/.test(hint) && /themed/.test(hint), 'a scroll hint that also works in a narrow strip and on a white panel');
check(/<HintedScroll[^>]*testId="desktop-side-menu-scroll"[^>]*compact=\{!sideExtended\}/.test(app) && /<HintedScroll[^>]*testId="desktop-people-scroll"/.test(app), 'the laptop menu strip and the members list show the bobbing arrow while there is more below');
check(/data-testid="feed-video-scrub"/.test(slot) && /role="slider"/.test(slot) && /onPointerMove=/.test(slot) && /requestAnimationFrame/.test(slot) && /ArrowRight/.test(slot) && /\.fv-scrub \{ position: absolute; left: 0; right: 0; bottom: 0; height: 22px;[^}]*touch-action: none/.test(css) && /\.fv-time \{/.test(css), 'the progress line can be dragged or pressed to go to any moment (the time shows above it), and arrow keys skip 5 seconds');
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
