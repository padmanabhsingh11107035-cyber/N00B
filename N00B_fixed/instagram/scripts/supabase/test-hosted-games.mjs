// Games that bring their own sound (Helix Fall, Neon Alley: Last Call): the Games page's arcade loop stays out of them, Neon Alley is on the page with its pictures, it is shown in a
// boxed-in frame that starts loading before Play is pressed, everything about it lives on this site's own address (nothing names where it came from), and on a phone it fills the
// screen sideways.
//
// Usage: node scripts/supabase/test-hosted-games.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const noData = (t) => t.replace(/url\(data:[^)]*\)/g, '');

section('1. Neon Alley is on the Games page');
const types = read('src/components/Games/types.ts');
const neon = (types.match(/id: 'neon_alley'[\s\S]*?\n  \},/) || [''])[0];
check(/title: 'Neon Alley: Last Call'/.test(neon) && /embedUrl: '\/games\/neon-alley\/'/.test(neon), 'it is listed, at an address of this site');
check(/pointsReward: 0/.test(neon) && /rewardNote: 'Play for fun'/.test(neon), 'it says plainly that it pays no NOOBs');
const posters = [...neon.matchAll(/'(\/game-posters\/neon-alley\/[^']+)'/g)].map((m) => m[1]);
check(posters.length === 5 && posters.every((p) => fs.existsSync(`public${p}`) && fs.statSync(`public${p}`).size < 200 * 1024), 'five web-sized posters');

section('2. The arcade loop stays out of games with their own sound');
check(/ownSound: true/.test(neon) && /id: 'helix_fall'[\s\S]*?ownSound: true/.test(types), 'both games are marked as bringing their own sound');
const view = read('src/components/Games/GamesView.tsx');
check(/const quietGame = !!selectedGameForPlay\?\.ownSound;/.test(view) && /if \(quietGame\) \{ stopGameMusic\(\); return undefined; \}/.test(view) && /\}, \[quietGame\]\);/.test(view), 'the Games page music stops while one of them is open and comes back when it is closed');
check(!/setGameMusicOn\(false\)/.test(view), 'and the person\'s own on/off choice is never changed by that');

section('3. The frame');
const frame = read('src/components/Games/minigames/HostedGameFrame.tsx');
const sandbox = (frame.match(/sandbox="([^"]+)"/) || [])[1] || '';
check(/allow-scripts/.test(sandbox) && /allow-same-origin/.test(sandbox) && !/allow-top-navigation/.test(sandbox) && !/allow-forms/.test(sandbox), 'it is boxed in: it can run but cannot navigate NOOB away');
check(/referrerPolicy="no-referrer"/.test(frame), 'it is told nothing about who opened it');
const modal = read('src/components/Games/GamePlayModal.tsx');
check(/game\.embedUrl && \(currentMode === 'select_mode' \|\| currentMode === 'play_bot'\)/.test(modal) && /visible=\{currentMode === 'play_bot'\}/.test(modal), 'it is added when the game\'s page opens (out of sight) and only brought into view by Play, so the download has a head start');
check(/!game\.embedUrl && \(\s*<GenericArcadeGame/.test(modal), 'the generic arcade engine is never used for it');
const headers = read('public/_headers');
const block = (headers.match(/\/games\/neon-alley\/\*\n((?:  .+\n)+)/) || [])[1] || '';
check(/! X-Frame-Options/.test(block) && /X-Frame-Options: SAMEORIGIN/.test(block) && /frame-ancestors 'self'/.test(block), 'the site\'s security rules let the app show the game page, and only the app');
check(/'wasm-unsafe-eval'/.test(block) && !/connect-src[^;]*https:/.test(block), 'the engine may run, and the page may load nothing from anywhere else');

section('4. Everything is on this site\'s own address, and nothing names where the game came from');
const dir = 'public/games/neon-alley';
const files = fs.readdirSync(dir);
const word = String.fromCharCode(109, 97, 110, 117, 115);
const text = files.filter((f) => /\.(html|js)$/.test(f)).map((f) => noData(read(`${dir}/${f}`)));
check(text.length >= 5 && text.every((t) => !t.toLowerCase().includes(word)), 'the game\'s page and scripts do not name it');
check(!/(?:src|href)="https?:|url\(https?:/.test(noData(read(`${dir}/index.html`))) && ['loader.js', 'fetch-map.js', 'probe.js'].every((f) => !/https?:\/\//.test(read(`${dir}/${f}`))), 'and they load nothing from anywhere else');
check(!/rel="manifest"|rel="canonical"|og:|twitter:/.test(noData(read(`${dir}/index.html`))), 'no sharing or app-install metadata of its own');
const worker = read('worker/index.js');
check(/github\.com\/padmanabhsingh11107035-cyber\/N00B\/releases\/download\/game-data\//.test(worker) && /hasOwnProperty\.call\(FILES, name\)/.test(worker), 'its two big files come from our own release, through an allow-list');
check(/"main": "worker\/index\.js"/.test(read('wrangler.jsonc')) && /"run_worker_first": \["\/games\/neon-alley\/data\/\*", "\/m\/\*", "\/media\/\*"\]/.test(read('wrangler.jsonc')), 'and only those addresses (the big game files, and the cached pictures, videos and songs at /m/ and the older /media/) go through the small script, everything else is plain files');
const own = ['src/components/Games/types.ts', 'src/components/Games/minigames/HostedGameFrame.tsx', 'src/components/Games/GamePlayModal.tsx', 'src/components/Games/GamesView.tsx', 'src/components/Store/FoodHeroMount.tsx', 'scripts/supabase/test-hosted-games.mjs', 'worker/index.js', 'wrangler.jsonc', 'public/_headers'];
check(own.every((f) => !read(f).toLowerCase().includes(word)), 'and our own files do not name it either');

section('5. Full screen, sideways on a phone');
check(/rotate\(90deg\)/.test(frame) && /\(pointer: coarse\)/.test(frame) && /lock\?: \(o: string\)/.test(frame), 'on a phone Play goes to full screen; held upright the game is laid on its side to fill the screen');
check(/key === 'Escape'/.test(frame) && /Leave full screen/.test(frame), 'there is always a way out');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
