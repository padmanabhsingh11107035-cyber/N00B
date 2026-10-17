// The pictures of a post follow the finger: the next (or previous) picture is already there beside the one shown, sliding in while the finger
// drags, instead of switching only when the finger lifts. Usage: node scripts/supabase/test-post-carousel-pager.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const card = read('src/components/Feed/PostCard.tsx');

section('1. The pictures sit side by side on a track that moves with the finger');
check(/const slideWindow = hasSlides\s*\n\s*\? \[shownIndex - 1, shownIndex, shownIndex \+ 1\]\.filter/.test(card), 'the picture shown and the ones before and after it are drawn (nothing else is in the page)');
check(/<div ref=\{trackRef\} className="absolute inset-0 will-change-transform">/.test(card) && /translate3d\(\$\{\(idx - shownIndex\) \* 100\}%, 0, 0\)/.test(card), 'each picture is placed one box-width from the next on a track');
check(/<div key=\{slide\.id\} className="absolute inset-0 overflow-hidden"/.test(card), 'pictures are kept by their id: after a slide nothing is drawn again (no flash)');
check(/track\.style\.transform = `translate3d\(\$\{px\}px, 0, 0\)`;/.test(card) && /moveTrack\(nothingThere \? dx \* 0\.25 : dx, 0\)/.test(card), 'the track moves by exactly how far the finger moved (a little give before the first / after the last)');
check(/Math\.abs\(dx\) < 8 && Math\.abs\(dy\) < 8/.test(card) && /d\.horizontal = Math\.abs\(dx\) > Math\.abs\(dy\)/.test(card) && /touchAction: 'pan-y'/.test(card), 'sideways claims the gesture, up and down is left to the page\'s own scrolling');
check(/Math\.abs\(dx\) > d\.width \* 0\.22/.test(card) && /Math\.abs\(speed\) > 0\.45/.test(card) && /performance\.now\(\) - d\.lastT > 80 \? 0 : d\.speed/.test(card), 'far enough (22 %) or a flick goes on; a finger that rested before lifting is not a flick');
check(/flushSync\(\(\) => setCurrentSlideIndex\(target\)\);\s*\n\s*moveTrack\(0, 0\);/.test(card), 'after the slide the new picture is put in the middle and the track back at rest in the same moment');
check(/onTouchCancel=\{post\.slides && post\.slides\.length > 1 \? handleCarouselTouchCancel : undefined\}/.test(card), 'an interrupted touch slides back');
check(/e\.stopPropagation\(\);\s*\n\s*const now = performance\.now\(\);/.test(card), 'a sideways drag still does not reach the feed\'s pull-to-refresh');

section('2. What belongs to a picture travels with it');
check(/const renderSlide = \(slide: PostSlide, isCur: boolean\) =>/.test(card) && /slide\.stickers\?\.map\(\(sticker, idx\)/.test(card) && !/currentSlide\.stickers/.test(card), 'text / sticker / mention layers are drawn with their own picture, so they slide in with it');
check(/ref=\{isCur \? slideImgRef : undefined\}/.test(card) && /if \(isCur && img\.naturalWidth/.test(card), 'the shape of the box still follows the picture that is shown');
check(/<video\s+key="live"/.test(card) && /<video key="peek"[^>]*muted playsInline preload="metadata"/.test(card), 'only the shown video plays (with its controls); a neighbour video is just a still, and starts properly once it is the shown one');

section('3. Keys and the rest of the post card are as before');
check(/if \(dir === 'right'\) slideByRef\.current\(1\);\s*\n\s*else if \(dir === 'left'\) slideByRef\.current\(-1\);/.test(card), 'the A / D and arrow keys slide too');
check(/\{currentSlideIndex \+ 1\}\/\{post\.slides\.length\}/.test(card) && /idx === currentSlideIndex \? 'w-4 bg-noob'/.test(card), 'the 1/3 badge and the dots still show the picture in the middle');
check(/onDoubleClick=\{handleDoubleTap\}/.test(card) && /onDeleteSlide\(post\.id, currentSlide\.id\)/.test(card), 'double-tap to like and "remove this picture" are untouched');
check(/post\.slides\.forEach\(\(slide\) => \{\s*\n\s*if \(slide\.mediaUrl && slide\.mediaType !== 'video'\)/.test(card), 'every picture is still fetched ahead when the post comes into view, so the one that slides in is already there');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
