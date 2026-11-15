// The Games page look (2026-11-14): warm red on clean cards, in dark and in light, edge to edge; every game has a poster (its own picture, or one drawn by the page).
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8').split(String.fromCharCode(13)).join('');
let passed = 0, failed = 0;
const check = (ok, name) => { if (ok) { passed++; console.log('  ok   ' + name); } else { failed++; console.log('  FAIL ' + name); } };
const view = read('src/components/Games/GamesView.tsx'), css = read('src/components/Games/gamesZ.css');
check(/import '\.\/gamesZ\.css';/.test(view) && /className="gz w-full min-h-screen/.test(view) && !/bg-\[#121316\]|bg-\[#232527\]/.test(view), 'the page uses the new look everywhere (no colour of the old grey page left)');
check(/\.gz \{ --gz-bg: #0c0c0e;/.test(css) && /:root\[data-theme="light"\] \.gz \{ --gz-bg: #f4f4f6;/.test(css) && /--gz-red: #e23744/.test(css), 'one set of colours for dark and one for light, the red is the same');
check(/forceStripColour\(document\.documentElement\.getAttribute\('data-theme'\) === 'light' \? '#f4f4f6' : '#0c0c0e'\)/.test(view) && /return \(\) => \{ mo\.disconnect\(\); forceStripColour\(null\); \};/.test(view), 'the strip behind the clock takes the page colour, and is given back when the page is left or a game opens');
check(/data-testid="game-art"/.test(view) && /const artOf = /.test(view) && [0, 1, 2, 3, 4, 5].every((n) => css.includes(`.gz-art[data-c="${n}"]`)), 'a game without a picture gets a drawn poster: six colourways, always the same one for the same game');
check(/max-md:!hidden/.test(view) && /scroll-pl-4/.test(view), 'no Back button on a phone; the rows start at the page margin');
check(/@media \(prefers-reduced-motion: reduce\)/.test(css), 'still when the phone asks for less motion');
// a game's own page (opened from a card)
const modal = read('src/components/Games/GamePlayModal.tsx'), frame = read('src/components/Games/minigames/HostedGameFrame.tsx');
check(/className="gz gp edge-own" data-noob-keep="1"/.test(modal) && /data-testid="game-page-back"/.test(modal) && !/backdrop-blur-md flex items-center justify-center \$\{/.test(modal) && /\.gp \{ position: fixed; inset: 0;/.test(css), 'a game opens as a full page with a back button, not as a small window over a dimmed page');
check((modal.match(/className="gp-opt"/g) || []).length === 4 && !/1\. Play with Available Users/.test(modal) && /className="gp-play"/.test(modal), 'the four ways to play are plain cards and Play is one big button');
check(/data-testid="game-page-art"/.test(modal) && /game\.posters && game\.posters\.length > 0 \? <GamePosterCarousel/.test(modal), 'a game without a picture shows the drawn poster here too, not the old banner');
check(/calc\(100dvh - 148px/.test(frame) && /className="gp-tools"/.test(frame) && /className="gp-load"/.test(frame) && !/pink-/.test(frame), 'a game in its own frame takes the whole page under the bar; no pink left');
check(/:root\[data-theme="light"\] \.gp \{/.test(css) && /--color-noob: #e23744/.test(css), 'every step inside the page uses the page colours, in dark and in light');
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
