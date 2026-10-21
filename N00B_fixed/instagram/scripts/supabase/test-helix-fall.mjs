// Helix Fall (the 3D tower game on the Games page): that it is in the list with its posters, that the game's files are in place, that the frame is allowed by the site's
// security rules (and nothing else is), and that a finished run is paid and ranked like every other game's.
//
// Usage: node scripts/supabase/test-helix-fall.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

section('1. The game is in the list, with its posters');
const types = read('src/components/Games/types.ts');
check(/id: 'helix_fall'[\s\S]{0,700}pointsReward: 10_000_000/.test(types), 'it is listed and pays the same 10,000,000 as every other win');
const posters = [...types.matchAll(/'(\/game-posters\/helix-fall\/[^']+)'/g)].map((m) => m[1]);
check(posters.length === 7, 'seven posters are listed', String(posters.length));
check(posters.every((p) => fs.existsSync(`public${p}`)), 'every listed poster file exists');
check(posters.every((p) => fs.statSync(`public${p}`).size < 200 * 1024), 'each poster is web-sized (under 200 KB)');

section('2. The game\'s files');
const dir = 'public/games/helix-fall';
const html = fs.existsSync(`${dir}/index.html`) ? read(`${dir}/index.html`) : '';
check(/src="\.\/assets\/index-[^"]+\.js"/.test(html) && /href="\.\/assets\/index-[^"]+\.css"/.test(html), 'its page uses relative addresses (works below /games/helix-fall/)');
const refs = [...html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)].map((m) => m[1]);
check(refs.length >= 4 && refs.every((r) => fs.existsSync(`${dir}/${r}`)), 'every file its page names is there');
const js = fs.readdirSync(`${dir}/assets`).filter((f) => f.endsWith('.js')).map((f) => read(`${dir}/assets/${f}`)).join('');
check(/helixfall:run-end/.test(js) && /totalFloors/.test(js), 'the built game tells the page around it how each run ended');
check(!/https?:\/\/(?!www\.w3\.org|jcgt\.org)/.test(js), 'the game talks to no other website');
check(/helixfall:\$\{|helixfall:ready/.test(js) && fs.existsSync(`${dir}/embed-probe.js`) && /embed-probe\.js/.test(html), 'it says when it is on screen, and a small first script reports it when the game cannot start');
check(fs.existsSync(`${dir}/ASSET_PROVENANCE.md`) && fs.existsSync(`${dir}/fonts/Sora-OFL.txt`), 'its credits and font licences travel with it');

section('3. The site\'s security rules');
const headers = read('public/_headers');
const block = (headers.match(/\/games\/helix-fall\/\*\n((?:  .+\n)+)/) || [])[1] || '';
check(/! X-Frame-Options/.test(block) && /X-Frame-Options: SAMEORIGIN/.test(block), 'the game may be framed, by this site only');
check(/! Content-Security-Policy/.test(block) && /frame-ancestors 'self'/.test(block) && /'wasm-unsafe-eval'/.test(block), 'it has its own rule: its physics engine may run, no one else may frame it');
check(!/connect-src[^;]*https:/.test(block) && !/unsafe-eval'(?!.*wasm)/.test(block.replace(/'wasm-unsafe-eval'/g, '')), 'that rule stays closed: no network, no script evaluation');
check(/^  X-Frame-Options: DENY/m.test(headers) && /frame-ancestors 'none'/.test(headers), 'the rest of the site is still never framed');

section('4. Paying and ranking a run');
const modal = read('src/components/Games/GamePlayModal.tsx');
const game = read('src/components/Games/minigames/HelixFallGame.tsx');
check(/recordGameMatch\(game\.id, game\.title, result, 'Solo', false\)/.test(modal), 'a finished run goes through the same server function as every other game (record_match)');
check(/onPointsUpdated\(res\.earnedPoints, res\.totalNoobPoints, result === 'win'\)/.test(modal), 'the balance and the Global Leaderboard are updated from the server\'s answer');
check(/e\.origin !== window\.location\.origin \|\| e\.source !== frameRef\.current\?\.contentWindow/.test(game), 'only the game\'s own frame can report a run');
check(/run\.outcome === 'won' \? 'win' : 'loss'/.test(game), 'reaching the base is a win, falling is a loss');
check(/helix_fall: \[preloadHelix\]/.test(modal) && /'helix_fall'\s*\]\.includes\(game\.id\)/.test(modal), 'its file is fetched when the window opens, and the generic engine is not used for it');

check(/phase === 'loading'/.test(game) && /Loading Helix Fall/.test(game) && /phase === 'stuck'/.test(game) && /Try again/.test(game), 'the window shows a loading screen (never a blank frame) and, when the game cannot start, what went wrong with a Try again button');
check(/import\.meta\.env\.DEV \? '\/games\/helix-fall\/index\.html\?embed=1' : '\/games\/helix-fall\/\?embed=1'/.test(game), 'on the real site the game is opened at its final address (no redirect inside the frame)');

section('5. The posters are shown');
const car = read('src/components/Games/GamePosterCarousel.tsx');
check(/game\.posters/.test(car) && /'howto', 'rewards', 'leaderboard'/.test(car), 'a game with posters shows them, then the cards that are true for it');
check(!/pass.?and.?play/i.test((car.match(/posterSlides[\s\S]{0,900}/) || [''])[0]), 'no "Pass and Play" card for a solo game');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
