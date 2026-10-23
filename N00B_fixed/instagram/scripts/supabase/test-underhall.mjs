// Underhall: After Curfew (a 3D game on the Games page): it is on the page, served from this site with nothing in it that names where it came from, its source is in the repository, and on a
// phone or tablet it plays sideways with an on-screen joystick and buttons. Usage: node scripts/supabase/test-underhall.mjs
import fs from 'node:fs';
import path from 'node:path';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(dir, e.name))) : [path.join(dir, e.name)]));

// the platform's name is put together here so that this file does not contain it either
const NAME = new RegExp(['ma', 'nus'].join(''), 'i');
const GAME = 'public/games/underhall';
const SRC = '../underhall';
const types = read('src/components/Games/types.ts');

section('1. On the Games page');
const entry = types.slice(types.indexOf("id: 'underhall_after_curfew'"), types.indexOf("id: 'neon_alley'"));
check(/title: 'Underhall: After Curfew'/.test(entry) && /embedUrl: '\/games\/underhall\/'/.test(entry), 'a card for Underhall: After Curfew that opens /games/underhall/');
check(/ownSound: true/.test(entry) && /embedLazy: true/.test(entry) && /isNew: true/.test(entry), 'its own sound stops the arcade loop, its frame is made when Play is pressed, and it is marked NEW');
const posters = [...entry.matchAll(/'(\/game-posters\/underhall\/[^']+)'/g)].map((m) => m[1]);
check(posters.length >= 4 && posters.every((p) => fs.existsSync('public' + p)), `${posters.length} posters, every one is a real file`);
check(/lazy=\{game\.embedLazy\}/.test(read('src/components/Games/GamePlayModal.tsx')) && /\(visible \|\| !lazy\) && <iframe/.test(read('src/components/Games/minigames/HostedGameFrame.tsx')), 'the frame is only created when Play is pressed (the big game is not started out of sight)');
check(/warmHostedGame\(game\.id\)/.test(read('src/components/Games/GamePlayModal.tsx')) && /underhall_after_curfew/.test(read('src/utils/hostedGameWarmup.ts')) && /warmUnderhallFiles\(\)/.test(read('src/utils/hostedGameWarmup.ts')) && /warmUnderhallFilesWhenIdle\(\)/.test(read('src/components/Games/GamesView.tsx')), 'its opening files are fetched quietly while the Games page or its own page is open');
const warm = read('src/utils/underhallWarmup.ts');
check(/\/games\/underhall\//.test(warm) && /dataSaver/.test(warm), 'the quiet fetch finds the script and style by reading the page, and skips data saver / 2G');

section('2. The game files are served from this site');
const need = ['index.html', 'underhall-icon.png', 'favicon.png', 'title/campus.webp', 'models/char_male.glb', 'models/char_female.glb', 'models/anims.glb', 'fonts/Bangers-Regular.latin.woff2', 'fonts/Sora-VF.subset.woff2', 'fonts/Figtree-VF.subset.woff2'];
for (const f of need) check(fs.existsSync(path.join(GAME, f)), `${f}`);
const html = read(path.join(GAME, 'index.html'));
const js = html.match(/src="\.\/assets\/([^"]+\.js)"/)?.[1];
const css = html.match(/href="\.\/assets\/([^"]+\.css)"/)?.[1];
check(js && fs.existsSync(path.join(GAME, 'assets', js)) && css && fs.existsSync(path.join(GAME, 'assets', css)), 'the page names a script and a style that exist');
const files = walk(GAME);
check(files.length > 120 && files.every((f) => fs.statSync(f).size < 20 * 1024 * 1024), `${files.length} files, none over 20 MB (the host's limit is 25 MB)`);
check(/<meta property="og:title" content="Underhall: After Curfew"/.test(html) && /og:image" content="https:\/\/noobsocials\.com\/game-posters\/underhall\/01-cover\.webp"/.test(html), 'the share information names the game and a picture on our own address');

section('3. Nothing in it says where it came from');
const bad = [];
for (const f of [...files, ...walk(SRC), 'src/utils/underhallWarmup.ts', 'scripts/supabase/test-underhall.mjs', 'src/components/Games/types.ts', 'public/_headers']) {
  const b = fs.readFileSync(f);
  if (NAME.test(b.toString('latin1'))) bad.push(f);
}
check(bad.length === 0, 'no served file, no source file and no code of the app names the maker platform', bad.slice(0, 3).join(', '));
check(!/https?:\/\/(?!www\.w3\.org|noobsocials\.com)/.test(html), 'the page links to no other website');
const sources = walk(SRC).filter((f) => /\.(ts|mjs|js|css|html|json|md)$/.test(f));
const secrets = sources.filter((f) => /(AKIA[0-9A-Z]{12}|ghp_[A-Za-z0-9]{20}|sk-[A-Za-z0-9]{20}|BEGIN [A-Z ]*PRIVATE KEY|api[_-]?key\s*[:=]\s*['"][^'"]{8})/i.test(read(f)));
check(secrets.length === 0, 'no key, token or password in the source', secrets.join(', '));

section('4. Headers: the game may be framed by this site only, and may load only its own files');
const headers = read('public/_headers');
const block = headers.slice(headers.indexOf('/games/underhall/*'), headers.indexOf('/games/underhall/index.html'));
check(/X-Frame-Options: SAMEORIGIN/.test(block) && /frame-ancestors 'self'/.test(block), 'only this site can show it in a frame');
check(/script-src 'self';/.test(block) && !/unsafe-eval|wasm-unsafe-eval/.test(block) && /connect-src 'self' blob: data:/.test(block) && /object-src 'none'/.test(block), 'its own scripts only, no eval, no network');
check(/\/games\/underhall\/assets\/\*\n  Cache-Control: public, max-age=31536000, immutable/.test(headers) && /\/games\/underhall\/index\.html\n  Cache-Control: no-cache/.test(headers), 'its fingerprinted files are kept, its page is always re-read');

section('5. Phones and tablets: sideways, joystick and buttons on screen');
const ui = read(path.join(SRC, 'vendor/super-dungeon/src/ui/ui.ts'));
const cssAll = read(path.join(SRC, 'vendor/super-dungeon/src/styles/main.css'));
check(/export function isTouchDevice/.test(ui) && /pointer: coarse/.test(ui) && /any-pointer: fine/.test(ui) && /if \(isTouchDevice\(\)\) this\.buildTouch\(\)/.test(ui), 'the on-screen controls are built only on phones and tablets');
check(/'t-stick-zone'/.test(ui) && /'t-knob'/.test(ui) && /DEAD = 0\.1/.test(ui) && /--sx/.test(ui), 'a joystick that opens under the thumb, with a dead zone');
for (const [cls, label] of [['t-attack', 'PUNCH'], ['t-bolt', 'BOLT'], ['t-dash', 'DASH'], ['t-jump', 'JUMP'], ['t-nova', 'NOVA'], ['t-interact', 'USE']]) check(ui.includes(`'${cls}`) && ui.includes(`'${label}'`), `button ${label}`);
check(/'t-run'/.test(ui) && /setTouchButton\('sprint'/.test(ui), 'a RUN switch (every move is on the screen)');
check(/'t-top'/.test(ui) && /'MAP'/.test(ui) && /'II'/.test(ui), 'pause and map');
check(/touchReset/.test(ui) && /lostpointercapture/.test(ui), 'everything is let go when the finger leaves or a menu opens');
check(/--u: clamp\(46px, 15\.5vh, 80px\)/.test(cssAll) && /max-height: 540px/.test(cssAll), 'sizes follow the screen height (short phones too), with a smaller HUD');
check(/#rotate-hint/.test(cssAll) && /orientation: portrait/.test(cssAll) && /id="rotate-hint"/.test(html), 'an upright phone is asked to turn sideways');
const frame = read('src/components/Games/minigames/HostedGameFrame.tsx');
check(/rotate\(90deg\)/.test(frame) && /pointer: coarse/.test(frame) && /requestFullscreen/.test(frame), 'inside NOOB a phone goes full screen and the game is turned sideways for the player');

section('6. The source is in the repository');
for (const f of ['README.md', 'ASSET_ARCHIVE.md', 'package.json', 'pnpm-lock.yaml', 'vite.config.ts', 'tsconfig.json', 'index.html', 'src/main.ts', 'src/game/config.ts', 'src/game/tuning.ts', 'vendor/super-dungeon/src/main.ts', 'vendor/super-dungeon/src/game/game.ts', 'vendor/super-dungeon/src/ui/ui.ts', 'vendor/super-dungeon/tests/dungeon.test.ts', 'vendor/super-dungeon/public/audio', 'vendor/super-dungeon/public/models', 'vendor/super-dungeon/public/fonts/Bangers-OFL.txt', 'assets/share/og.png']) check(fs.existsSync(path.join(SRC, f)), f);
const licences = walk(path.join(SRC, 'vendor/super-dungeon/assets/source')).filter((f) => /License/i.test(f));
check(licences.length >= 3, `${licences.length} licence files of the art are kept`);
check(!fs.existsSync(path.join(SRC, 'node_modules')) && !fs.existsSync(path.join(SRC, 'dist')), 'no installed packages or build output in the repository');
const pkg = JSON.parse(read(path.join(SRC, 'package.json')));
check(pkg.dependencies?.three && /vite/.test(Object.keys(pkg.devDependencies).join()) && !NAME.test(JSON.stringify(pkg)), 'a clean package file (three, vite, vitest, typescript)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
