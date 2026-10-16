// The reels page is laid out like Roblox's Moments, and the reels move WITH the finger: while it drags, the next reel is already there under it,
// so nobody is thrown onto the next reel without seeing it coming.
//
// Usage: node --liftoff-only scripts/supabase/test-reels-pager.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

const view = read('src/components/Reels/ReelsView.tsx');
const audio = read('src/utils/reelAudio.ts');

section('1. The reels follow the finger');
check(/const SLOT_GAP = 4;/.test(view) && /translateY\(calc\(-100% - \$\{SLOT_GAP\}px\)\)/.test(view) && /translateY\(calc\(100% \+ \$\{SLOT_GAP\}px\)\)/.test(view), 'the reel before and the reel after sit one screen away on a track, with a hair of gap so no sliver shows at rest');
check(/renderCard\(localReels\[currentIndex - 1\], false\)/.test(view) && /renderCard\(currentReel, true\)/.test(view) && /renderCard\(nextReel, false\)/.test(view), 'all three are drawn (before / this / after): the next reel is really there under the finger');
check(/el\.addEventListener\('touchmove', onMove, \{ passive: false \}\)/.test(view) && /e\.preventDefault\(\);\s*\n\s*const now = performance\.now\(\);/.test(view), 'a real (non-passive) touchmove moves the track and stops the page from scrolling by itself');
check(/track\.style\.transform = `translate3d\(0, \$\{y\}px, 0\)`;/.test(view), 'the track moves by exactly how far the finger moved');
check(/Math\.abs\(dx\) > Math\.abs\(dy\)/.test(view), 'a sideways move is not taken for a swipe');
check(/\(y > 0 && L\.currentIndex === 0\) \|\| \(y < 0 && !L\.localReels\[L\.currentIndex \+ 1\]\)\) y \*= 0\.25/.test(view), 'where there is no reel (before the first), the page only gives a little');
check(/Math\.abs\(dy\) > h \* 0\.22/.test(view) && /Math\.abs\(speed\) > 0\.45/.test(view), 'letting go far enough, or with a flick, goes on to that reel; letting go early slides back');
check(/else L\.snapBack\(\)/.test(view) && /const snapBack = \(\) => \{/.test(view), 'a short drag slides back');
check(/flushSync\(\(\) => setCurrentIndex\(target\)\);\s*\n\s*track\.style\.transition = 'none';\s*\n\s*track\.style\.transform = 'translate3d\(0, 0, 0\)';/.test(view), 'after the slide the new reel is put in the middle and the track goes back to rest in the same moment (no flash)');
check(/addEventListener\('touchcancel', onCancel/.test(view), 'an interrupted touch slides back');

section('2. Taps, buttons, wheel and keys still work');
check(/if \(onVideo && !onControl\) \{\s*\n\s*e\.preventDefault\(\);\s*\n\s*L\.handleTap\(\);/.test(view), 'a tap on the picture pauses / plays (twice: likes), handled at touchend');
check(/onControl = !!target\?\.closest\('button, a, input, textarea'\)/.test(view), 'a tap on a button is left to the button');
check(/const handleWheel = \(e: React\.WheelEvent\) => \{\s*\n\s*if \(anyModalOpen \|\| Date\.now\(\) < wheelLockRef\.current\) return;/.test(view) && /onWheel=\{handleWheel\}/.test(view), 'the mouse wheel steps one reel at a time (with a short lock so one scroll is one step)');
check(/navKey\(e\)/.test(view) && /slideTo\(1\)/.test(view) && /slideTo\(-1\)/.test(view), 'the arrow / W / S keys slide too');
check(/live\.current\.slideTo\(1\), 2500/.test(view), 'a broken video moves on by sliding');
check(/const anyModalOpen = showComments \|\| showReelOptionsMenu \|\| showLikesViewsSheet;/.test(view) && /live\.current\.anyModalOpen/.test(view), 'nothing moves while the comments / likes / menu are open');

section('3. The list never ends');
check(/currentIndex < localReels\.length - 2\) return;/.test(view) && /return \[\.\.\.prev, \.\.\.pass\];/.test(view) && /pass\[0\]\.id === prev\[prev\.length - 1\]\.id/.test(view), 'a little before the last reel the set is added again in a fresh order, never starting with the reel just shown');
check(!/handleNextReel|handlePrevReel|navigateWithCooldown/.test(view), 'the old jump-to-the-next-reel functions are gone');

section('4. The layout (as in Roblox\'s Moments)');
check(/text-\[26px\] leading-none font-bold tracking-tight text-white">Reels</.test(view) && /data-testid="reel-sound-button"/.test(view), 'big bold "Reels" title with the sound button on the right');
check(/bg-\[#0f0f11\]/.test(view) && /media-dark/.test(view), 'the same near-black page colour');
check(/data-reel-tap className="relative flex-1 min-h-0/.test(view) && /object-contain object-bottom/.test(audio), 'the picture is as wide as the screen, whole, and sits right above the writing (a wide video leaves room above it)');
check(/data-testid="reel-actions"/.test(view) && /absolute right-3\.5 bottom-3/.test(view), 'like / comment / share / save are plain icons on the picture\'s bottom right edge');
check(/text-\[16px\] font-bold text-white truncate/.test(view) && /w-\[34px\] h-\[34px\] rounded-full/.test(view), 'round picture and bold name');
check(/No likes yet/.test(view) && /'like' : 'likes'/.test(view) && /-space-x-1\.5/.test(view), 'the likes row: stacked reaction emoji and "73 likes"');
check(/data-testid=\{isCur \? 'reel-progress' : undefined\}/.test(view) && /bg-\[#bcbcc8\]/.test(view) && /progressRef\.current\.style\.width/.test(view), 'a thin progress bar fills as the video plays');
check(/bg-\[#335fff\] text-white/.test(view) && /h-\[42px\] px-5 rounded-lg/.test(view) && /data-testid=\{isCur \? 'reel-sound-bar' : undefined\}/.test(view), 'the bottom bar: cover, sound name and artist, and a blue Follow button');
check(/likeCountHiddenFor\(reel\.isLikeCountHidden/.test(view), 'hidden like counts stay hidden');
check(/Copy link/.test(view) && /MoreVertical/.test(view), 'the three dots on the card open the reel menu (copy link for everyone, more for the owner / admin)');

section('5. Sound, song and the one shared video are untouched');
check(/getReelPlayer\(\)/.test(view) && /host\.appendChild\(video\)/.test(view) && /<div ref=\{playerHostRef\}/.test(view), 'one shared video element, put in the middle slot');
check(/\}, \[playing, currentReel\?\.id\]\);/.test(view) && /playReel\(video, soundWantedRef\.current\)/.test(view), 'play / pause / sound logic is the same');
check(!/'touchstart'/.test(view.split('Swipe (touch)')[0]), 'the sound unlock still only comes from a real tap');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
