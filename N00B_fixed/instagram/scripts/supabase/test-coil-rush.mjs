// Coil Rush (a 3D worm arena on the Games page): it is on the page, served from this site with nothing in it that names where it came from, its files are fetched in advance so Play never
// waits, it works upright on a phone and with a mouse, and its source is in the repository. Usage: node scripts/supabase/test-coil-rush.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(dir, e.name))) : [path.join(dir, e.name)]));

// the platform's name is put together here so that this file does not contain it either
const NAME = new RegExp(['ma', 'nus'].join(''), 'i');
const GAME = 'public/games/coil-rush';
const SRC = '../coil-rush';
const types = read('src/components/Games/types.ts');

section('1. On the Games page');
const entry = types.slice(types.indexOf("id: 'coil_rush'"), types.indexOf("id: 'the_rogue_shadowfall'"));
check(/title: 'Coil Rush'/.test(entry) && /embedUrl: '\/games\/coil-rush\/'/.test(entry), 'a card for Coil Rush that opens /games/coil-rush/');
check(/ownSound: true/.test(entry) && /embedLazy: true/.test(entry) && /isNew: true/.test(entry), 'its own sound stops the arcade loop, its frame is made when Play is pressed, and it is marked NEW');
check(/embedPortrait: true/.test(entry), 'it is held upright on a phone (it is not turned on its side)');
check(/pointsReward: 0/.test(entry) && /Play for fun/.test(entry), 'it is for fun (no points are paid)');
check(/left thumb steers, right thumb boosts/.test(entry) && /Mouse to steer/.test(entry), 'the card says how to play with a mouse and with a finger');
const posters = [...entry.matchAll(/'(\/game-posters\/coil-rush\/[^']+)'/g)].map((m) => m[1]);
check(posters.length === 3 && posters.every((p) => fs.existsSync('public' + p) && fs.statSync('public' + p).size > 5000), `${posters.length} posters, every one is a real picture`);
check(types.indexOf("id: 'coil_rush'") > 0 && types.indexOf("id: 'coil_rush'") < types.indexOf("id: 'the_rogue_shadowfall'"), 'it is the first card (newest first)');
check(!NAME.test(entry) && !/made with|made on/i.test(entry), 'the card does not say where the game was made');
const modal = read('src/components/Games/GamePlayModal.tsx'), view = read('src/components/Games/GamesView.tsx');
check(/game\.embedPortrait && !game\.embedLazy \?/.test(modal), 'the page of the game does not call a big upright game "a small game"');

section('2. No late loading: the files are fetched in advance');
const hosted = read('src/utils/hostedGameWarmup.ts'), warm = read('src/utils/coilRushWarmup.ts');
check(/warmHostedGame\(game\.id\)/.test(modal) && /coil_rush/.test(hosted) && /warmCoilRushFiles\('race'\)/.test(hosted), "when the game's own page opens, its files are fetched");
check(/warmCoilRushFiles/.test(hosted) && /requestIdleCallback/.test(warm), 'the quiet fetch waits for the browser to be idle');
check(/warm\.json/.test(warm) && /dataSaver/.test(warm) && /2g/.test(warm) && /BASE = '\/games\/coil-rush\/'/.test(warm), 'from a list the build writes; nothing on a data saver or 2G');
check(/lazy=\{game\.embedLazy\}/.test(modal) && /\(visible \|\| !lazy\) && <iframe/.test(read('src/components/Games/minigames/HostedGameFrame.tsx')), 'the frame is made when Play is pressed (the files are already in the browser by then)');
const plan = JSON.parse(read(path.join(GAME, 'warm.json')));
check(plan.shell.length >= 15 && plan.race.length >= 20, `the list has ${plan.shell.length} files to start and ${plan.race.length} for the first match`);
check([...plan.shell, ...plan.race].every((f) => fs.existsSync(path.join(GAME, f))), 'every file on the list exists');
check(plan.shell.some((f) => /^build\/game-.*\.js$/.test(f)) && plan.shell.some((f) => /^build\/renderer-.*\.js$/.test(f)) && plan.shell.some((f) => /^build\/three\.core-.*\.js$/.test(f)) && plan.shell.some((f) => /\.css$/.test(f)) && plan.shell.some((f) => /Sora-VF/.test(f)) && plan.shell.some((f) => /Figtree-VF/.test(f)), 'it holds the scripts, the style and both fonts');
check(!plan.shell.concat(plan.race).some((f) => /bgm-/.test(f)), 'the music (about 5 MB) is not on the list: the game streams it by itself');
const mb = (list) => list.reduce((n, f) => n + fs.statSync(path.join(GAME, f)).size, 0) / 1048576;
check(mb(plan.shell) < 2 && mb(plan.race) < 4, `${mb(plan.shell).toFixed(1)} MB to start, ${mb(plan.race).toFixed(1)} MB for the first match`);
const html = read(path.join(GAME, 'index.html'));
check(/<link rel="modulepreload" crossorigin href="\.\/build\/index-[^"]+\.js">/.test(html), 'the page tells the browser about the main script at once');
// the warm-up module itself, run against a stand-in for fetch
globalThis.window = globalThis; Object.defineProperty(globalThis, 'navigator', { value: { connection: {} }, configurable: true });
const asked = [];
globalThis.fetch = async (url) => { asked.push(String(url)); return { ok: true, json: async () => plan, arrayBuffer: async () => new ArrayBuffer(1) }; };
const W = await import(pathToFileURL(path.resolve('src/utils/coilRushWarmup.ts')).href);
await W.warmCoilRushFiles('race');
check(asked.includes('/games/coil-rush/warm.json') && asked.includes('/games/coil-rush/') && [...plan.shell, ...plan.race].every((f) => asked.includes('/games/coil-rush/' + f)), 'it fetches the page and every file on the list');
const before = asked.length; await W.warmCoilRushFiles('race');
check(asked.length === before, 'and nothing is fetched twice');

section('3. Everything the game asks for is served from this site');
for (const f of ['index.html', 'warm.json', 'favicon.svg', 'assets/fonts/Sora-VF.subset.woff2', 'assets/fonts/Figtree-VF.subset.woff2', 'fonts/Sora-OFL.txt', 'fonts/Figtree-OFL.txt', 'fonts/NotoSansSC-OFL.txt', 'assets/models/nebula-asteroid-512.glb']) check(fs.existsSync(path.join(GAME, f)), f);
const js = html.match(/src="\.\/build\/([^"]+\.js)"/)?.[1] || html.match(/src="\.\/(build\/[^"]+\.js)"/)?.[1];
const css = html.match(/href="\.\/build\/([^"]+\.css)"/)?.[1];
check(js && css && fs.existsSync(path.join(GAME, 'build', js.replace(/^build\//, ''))) && fs.existsSync(path.join(GAME, 'build', css)), 'the page names a script and a style that exist (fingerprinted, in build/)');
const assetsSrc = read(path.join(SRC, 'src/engine/assets.ts'));
const wanted = [...assetsSrc.matchAll(/mediaUrl\('([^']+)'\)/g)].map((m) => `assets/media/${m[1]}`);
check(wanted.length >= 45 && wanted.every((f) => fs.existsSync(path.join(GAME, f))), `all ${wanted.length} pictures and sounds the game asks for are there`);
const files = walk(GAME);
check(files.length >= 60 && files.every((f) => fs.statSync(f).size < 20 * 1024 * 1024), `${files.length} files, none over 20 MB (the host's limit is 25 MB)`);
check(!files.some((f) => /\.(zip|map|lock)$/.test(f) && !/package-lock/.test(f)) && !fs.existsSync(path.join(GAME, 'assets.lock.json')), 'no archive, no source map, no asset registry among them');

section('4. Nothing in it says where it came from, and nothing is sent anywhere');
const bad = [];
for (const f of [...files, ...walk(SRC), 'src/utils/coilRushWarmup.ts', 'src/utils/hostedGameWarmup.ts', 'scripts/supabase/test-coil-rush.mjs', 'src/components/Games/types.ts', 'public/_headers']) {
  if (NAME.test(fs.readFileSync(f).toString('latin1'))) bad.push(f);
}
check(bad.length === 0, 'no served file (page, scripts, pictures, sounds, model, fonts), no source file and no code of the app names the maker platform', bad.slice(0, 3).join(', '));
check(!/https?:\/\/(?!www\.w3\.org|noobsocials\.com)/.test(html), 'the page links to no other website');
check(!/<meta[^>]+(og:|twitter:)/.test(html) && /<title>[^<]*Coil Rush[^<]*<\/title>/.test(html), 'a plain title and description, no share information naming anyone else');
const builtJs = files.filter((f) => f.endsWith('.js')).map(read).join('\n');
check(!/https?:\/\/(?!www\.w3\.org|threejs\.org|github\.com|rapier\.rs|mrdoob|dimforge|registry\.khronos|jcgt\.org)[a-z0-9.-]+\.[a-z]{2,}/i.test(builtJs.replace(/\/\*[\s\S]*?\*\//g, '')), 'the scripts contain no address of another website that they could call');
check(!/sendBeacon|XMLHttpRequest|new WebSocket|EventSource/.test(builtJs.replace(/\/\/.*$/gm, '')), 'no beacon, no socket, no request object: the game only reads its own files with fetch');
const online = read(path.join(SRC, 'src/ui/online.ts'));
check(/Offline mode/.test(online) && !/fetch\(|XMLHttpRequest/.test(online), 'the online score part is an empty stand-in (records stay on the device)');
const sources = walk(SRC).filter((f) => /\.(ts|mjs|js|css|html|json|md)$/.test(f));
const secrets = sources.filter((f) => !/package-lock/.test(f) && /(AKIA[0-9A-Z]{12}|ghp_[A-Za-z0-9]{20}|sk-[A-Za-z0-9]{20}|BEGIN [A-Z ]*PRIVATE KEY|api[_-]?key\s*[:=]\s*['"][^'"]{8})/i.test(read(f)));
check(secrets.length === 0, 'no key, token or password in the source', secrets.join(', '));

section('5. Headers: the game may be framed by this site only, and may load only its own files');
const headers = read('public/_headers');
const block = headers.slice(headers.indexOf('/games/coil-rush/*'), headers.indexOf('/games/coil-rush/index.html'));
check(/X-Frame-Options: SAMEORIGIN/.test(block) && /frame-ancestors 'self'/.test(block), 'only this site can show it in a frame');
check(/script-src 'self';/.test(block) && !/unsafe-eval/.test(block) && /connect-src 'self' blob: data:/.test(block) && /object-src 'none'/.test(block), 'its own scripts only (no eval, not even WebAssembly), no network, no plug-ins');
check(/\/games\/coil-rush\/build\/\*\n  Cache-Control: public, max-age=31536000, immutable/.test(headers) && /\/games\/coil-rush\/index\.html\n  Cache-Control: no-cache/.test(headers) && /\/games\/coil-rush\/warm\.json\n  Cache-Control: no-cache/.test(headers) && /\/games\/coil-rush\/assets\/\*\n  Cache-Control: public, max-age=86400/.test(headers), 'the scripts are kept for ever, the page and the file list are asked for again every time, the pictures and sounds for a day');
check(!/WebAssembly/.test(builtJs) && !files.some((f) => f.endsWith('.wasm')), 'and the game really has no WebAssembly in it (so nothing is allowed that is not needed)');

section('6. Upright on a phone, mouse on a computer');
const frame = read('src/components/Games/minigames/HostedGameFrame.tsx');
check(/rotated = full && upright && !portrait/.test(frame), 'inside NOOB an upright phone is not turned on its side for a game that asks to stay upright');
check(/viewport-fit=cover/.test(html) && /user-scalable=no/.test(html), 'the page uses the whole screen and does not zoom');
const i18n = read(path.join(SRC, 'src/i18n/en.json'));
check(/Left thumb steers/.test(i18n) && /Mouse to steer/.test(i18n), "the game's own hints say the same: mouse, or left thumb to steer and right thumb to boost");

section('7. The source is in the repository');
for (const f of ['NOOB-EMBED.md', 'README.md', 'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json', 'index.html', 'src/main.ts', 'src/game/config.ts', 'src/game/sim.ts', 'src/engine/assets.ts', 'src/engine/fonts.ts', 'scripts/make-warm.mjs', 'tests/rules.test.ts', 'tests/i18n.test.ts', 'tests/assets.test.mjs']) check(fs.existsSync(path.join(SRC, f)), f);
check(!fs.existsSync(path.join(SRC, 'node_modules')) && !fs.existsSync(path.join(SRC, 'dist')) && !fs.existsSync(path.join(SRC, 'assets.lock.json')) && !fs.existsSync(path.join(SRC, ['scripts/', 'ma', 'nus', '-tuning'].join(''))), 'no installed packages, build output or tool files in the repository');
const pkg = JSON.parse(read(path.join(SRC, 'package.json')));
check(pkg.dependencies?.three && !pkg.dependencies?.['@dimforge/rapier3d-compat'] && /vite/.test(Object.keys(pkg.devDependencies).join()) && !pkg.devDependencies.playwright && !NAME.test(JSON.stringify(pkg)), 'a clean package file (three, vite, vitest, typescript; no browser-driver, no unused physics engine)');
const vite = read(path.join(SRC, 'vite.config.ts'));
check(/entryFileNames: 'build\/\[name\]-\[hash\]\.js'/.test(vite) && /base: '\.\/'/.test(vite) && !/allowedHosts/.test(vite), 'the build puts fingerprinted scripts in build/ and uses relative addresses');
check(/\.\/assets\/media\//.test(assetsSrc) && !/assets\.lock/.test(assetsSrc), 'the game reads its pictures and sounds from ./assets/ next to the page');
const main = read(path.join(SRC, 'src/main.ts'));
check(!/registerGameTuning|scripts\//.test(main), 'the start of the game has no development hook of the tool it was made with');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
