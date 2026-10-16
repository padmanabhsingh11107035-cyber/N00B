// Stories appear at once: the picture of a story (and of the next ones, and of the first story of each circle) is fetched ahead of time, the timer waits for the picture instead of
// running over a blank screen, and each story has its OWN picture element so moving to the next person never keeps showing the previous person's picture.
//
// Usage: node --liftoff-only scripts/supabase/test-story-speed.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

section('1. The preloader (run for real, with a pretend browser Image)');
const made = [];
globalThis.Image = class { constructor() { made.push(this); } };
const U = await import(pathToFileURL(path.resolve('src/utils/preloadStoryMedia.ts')).href);
check(!U.isStoryPictureLoaded('/a.jpg') && !U.isStoryPictureLoaded(undefined), 'nothing is "loaded" before it was fetched');
U.preloadStoryPicture('/a.jpg');
check(made.length === 1 && made[0].src === '/a.jpg', 'a picture is fetched');
U.preloadStoryPicture('/a.jpg');
check(made.length === 1, 'the same picture is not fetched twice');
check(!U.isStoryPictureLoaded('/a.jpg'), 'it is not ready until it has arrived');
made[0].onload();
check(U.isStoryPictureLoaded('/a.jpg'), 'it is ready once it has arrived (so the story can start its timer straight away)');
U.preloadStoryPicture('/bad.jpg');
made[1].onerror();
U.preloadStoryPicture('/bad.jpg');
check(made.length === 3 && !U.isStoryPictureLoaded('/bad.jpg'), 'one that failed is not "ready", and may be tried again later');
U.preloadStoryPictures([undefined, null, '', '/c.jpg', '/c.jpg']);
check(made.length === 4, 'several at once: empty ones are skipped, repeats are ignored');
for (let i = 0; i < 70; i++) U.preloadStoryPicture(`/many-${i}.jpg`);
check(made.length === 4 + 70, 'a long list is all fetched');
check(!U.isStoryPictureLoaded('/a.jpg'), 'the list is capped (the oldest are forgotten) so memory does not grow without end');

section('2. The story screen');
const viewer = read('src/components/Stories/StoryViewerModal.tsx');
check(/<img\s+key=\{story\.id\}/.test(viewer), 'each story has its own picture element (the previous person\'s picture is never left showing while the next one comes in)');
check(/onLoad=\{\(\) => setReadyStoryId\(story\.id\)\}/.test(viewer) && /onError=\{\(\) => setReadyStoryId\(story\.id\)\}/.test(viewer), 'it knows when the picture has arrived (or failed, so a broken one does not freeze the story)');
check(/el\.complete && el\.naturalWidth > 0/.test(viewer), 'a picture that was already in the phone counts as arrived at once');
check(/const mediaReady = !!story && \(readyStoryId === story\.id \|\| isStoryPictureLoaded\(story\.mediaUrl\)\);/.test(viewer), 'a picture fetched ahead of time starts the story straight away');
check(/\|\| !story \|\| !mediaReady \|\| showViewersSheet/.test(viewer) && /story, mediaReady, showViewersSheet/.test(viewer), 'the timer only runs once the picture is there');
check(/\{!mediaReady && \(\s*<div[^>]*data-testid="story-loading"[^>]*><BurgerSmall \/><\/div>/.test(viewer), 'until then the burger shows (not a blank screen)');
check(/\{mediaReady && story\.stickers\?\.map\(/.test(viewer), 'the stickers appear together with the picture');
check(/fetchPriority="high"/.test(viewer) && /decoding="async"/.test(viewer), 'the picture of the story on screen is fetched first');
check(/stories\.slice\(currentIndex \+ 1, currentIndex \+ 5\)/.test(viewer) && /stories\[currentIndex - 1\]\?\.mediaUrl/.test(viewer), 'the next four stories (this person\'s, then the next person\'s) and the one before are fetched ahead of time');

section('3. The home page');
const app = read('src/App.tsx');
check(/import\('\.\/components\/Stories\/StoryViewerModal'\)/.test(app) && /setTimeout\(\(\) => \{ void import\(/.test(app), 'the story screen itself is fetched quietly after sign-in, so the first tap does not wait for it');
check(/storyTray\.items\.slice\(0, 10\)\.map\(\(it\) => it\.startIndex\)/.test(app) && /preloadStoryPictures\(starts\.flatMap\(/.test(app), 'the first picture of each of the first circles is fetched quietly (where each person\'s story starts)');
check(/connection\?\.saveData\) return;\s*const list = storyTray\.viewerStories;/.test(app), 'and none of it when the phone is set to save data');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
