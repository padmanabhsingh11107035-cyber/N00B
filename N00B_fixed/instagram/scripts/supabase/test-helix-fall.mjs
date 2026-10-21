// Helix Fall (the 3D tower game on the Games page): that it is in the list with its posters, that the game's files are in place and small, that the frame is allowed by the
// site's security rules (and nothing else is), that every level cleared is paid and a player's best score is what the board keeps, and that the window never shows a blank frame.
// (The database side is test-helix-fall-db.mjs.)
//
// Usage: node scripts/supabase/test-helix-fall.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

section('1. The game is in the list, with its posters');
const types = read('src/components/Games/types.ts');
check(/id: 'helix_fall'[\s\S]{0,900}pointsReward: 50_000_000[\s\S]{0,60}rewardNote: 'per level'/.test(types), 'it is listed and pays 50,000,000 per level');
const posters = [...types.matchAll(/'(\/game-posters\/helix-fall\/[^']+)'/g)].map((m) => m[1]);
check(posters.length === 7, 'seven posters are listed', String(posters.length));
check(posters.every((p) => fs.existsSync(`public${p}`)), 'every listed poster file exists');
check(posters.every((p) => fs.statSync(`public${p}`).size < 200 * 1024), 'each poster is web-sized (under 200 KB)');

section('2. The game\'s files: small, so it starts fast');
const dir = 'public/games/helix-fall';
const html = fs.existsSync(`${dir}/index.html`) ? read(`${dir}/index.html`) : '';
check(/src="\.\/assets\/index-[^"]+\.js"/.test(html) && /href="\.\/assets\/index-[^"]+\.css"/.test(html), 'its page uses relative addresses (works below /games/helix-fall/)');
const refs = [...html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)].map((m) => m[1]);
check(refs.length >= 4 && refs.every((r) => fs.existsSync(`${dir}/${r}`)), 'every file its page names is there');
const assets = fs.readdirSync(`${dir}/assets`);
const js = assets.filter((f) => f.endsWith('.js')).map((f) => read(`${dir}/assets/${f}`)).join('');
const size = (re) => assets.filter((f) => re.test(f)).reduce((n, f) => n + fs.statSync(`${dir}/assets/${f}`).size, 0);
check(assets.filter((f) => f.endsWith('.js')).length === 1 && size(/\.js$/) < 900 * 1024, 'one script, under 900 KB (the physics engine, four fifths of the old download, is gone)', String(size(/\.js$/)));
check(!/rapier|WebAssembly/i.test(js), 'nothing in it needs WebAssembly any more');
check(size(/\.glb$/) < 600 * 1024, 'the ball\'s model is under 600 KB', String(size(/\.glb$/)));
check(/helixfall:run-end/.test(js) && /helixfall:level/.test(js) && /helixfall:board-request/.test(js), 'the built game reports levels and runs and asks for the leaderboard');
check(!/https?:\/\/(?!www\.w3\.org|jcgt\.org)/.test(js), 'the game talks to no other website');
check(/helixfall:\$\{|helixfall:ready/.test(js) && fs.existsSync(`${dir}/embed-probe.js`) && /embed-probe\.js/.test(html), 'it says when it is on screen, and a small first script reports it when the game cannot start');
check(fs.existsSync(`${dir}/ASSET_PROVENANCE.md`) && fs.existsSync(`${dir}/fonts/Sora-OFL.txt`), 'its credits and font licences travel with it');

section('3. The site\'s security rules');
const headers = read('public/_headers');
const block = (headers.match(/\/games\/helix-fall\/\*\n((?:  .+\n)+)/) || [])[1] || '';
check(/! X-Frame-Options/.test(block) && /X-Frame-Options: SAMEORIGIN/.test(block), 'the game may be framed, by this site only');
check(/! Content-Security-Policy/.test(block) && /frame-ancestors 'self'/.test(block), 'it has its own rule, and no one else may frame it');
check(!/connect-src[^;]*https:/.test(block) && !/unsafe-eval/.test(block), 'that rule stays closed: no network, no script evaluation');
check(/^  X-Frame-Options: DENY/m.test(headers) && /frame-ancestors 'none'/.test(headers), 'the rest of the site is still never framed');

section('4. Paying levels and keeping the best score');
const modal = read('src/components/Games/GamePlayModal.tsx');
const game = read('src/components/Games/minigames/HelixFallGame.tsx');
const api = read('src/services/supabaseApi.ts');
check(/rpc<any>\('helix_level_complete', \{ p_level: level \}\)/.test(api) && /rpc<any>\('helix_submit_run'/.test(api) && /rpc<any>\('helix_leaderboard'/.test(api), 'the three server functions are called by name');
check(/helixLevelComplete\(level\)/.test(modal) && /onPointsUpdated\(res\.earnedPoints, res\.totalNoobPoints, true\)/.test(modal), 'a cleared level pays at once and the balance and the Global Leaderboard follow the server\'s answer');
check(/helixSubmitRun\(\{ score: run\.score, floors: run\.floors, level: run\.level, daily: run\.kind === 'daily' \}\)/.test(modal), 'a finished run is sent as it is; only a Daily Tower run can set the best score (the server decides)');
check(/e\.origin !== window\.location\.origin \|\| e\.source !== frameRef\.current\?\.contentWindow/.test(game), 'only the game\'s own frame can report a level or a run');
check(/case 'helixfall:level'/.test(game) && /queueRef\.current = queueRef\.current\.then/.test(game), 'levels are paid one after the other, never at the same time');
check(/case 'helixfall:board-request'/.test(game) && /loadBoard\(period\)/.test(game) && /helixfall:board/.test(game), 'the game\'s leaderboard is NOOB\'s (one best score per player)');
check(/encodeURIComponent\(userName/.test(game), 'the player\'s NOOB name goes into the game');
check(/helix_fall: \[preloadHelix\]/.test(modal) && /'helix_fall'\s*\]\.includes\(game\.id\)/.test(modal), 'its file is fetched when the window opens, and the generic engine is not used for it');
const warm = read('src/utils/helixWarmup.ts');
check(/saveData/.test(warm) && /requestIdleCallback/.test(warm) && /warmHelixFilesWhenIdle\(\)/.test(read('src/components/Games/GamesView.tsx')), 'its files are fetched quietly while the Games page is open (not on a data saver)');

section('5. Never a blank frame');
check(/phase === 'loading'/.test(game) && /Loading Helix Fall/.test(game) && /phase === 'stuck'/.test(game) && /Try again/.test(game), 'the window shows a loading screen and, when the game cannot start, what went wrong with a Try again button');
check(/import\.meta\.env\.DEV \? '\/games\/helix-fall\/index\.html' : '\/games\/helix-fall\/'/.test(game), 'on the real site the game is opened at its final address (no redirect inside the frame)');

section('6. The posters are shown');
const car = read('src/components/Games/GamePosterCarousel.tsx');
check(/game\.posters/.test(car) && /'howto', 'rewards', 'leaderboard'/.test(car), 'a game with posters shows them, then the cards that are true for it');
check(!/pass.?and.?play/i.test((car.match(/posterSlides[\s\S]{0,900}/) || [''])[0]), 'no "Pass and Play" card for a solo game');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
