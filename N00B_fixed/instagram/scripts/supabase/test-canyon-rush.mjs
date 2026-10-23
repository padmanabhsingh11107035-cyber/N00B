// Canyon Rush Circuit (a 3D racing game on the Games page): it is on the page, served from this site with nothing in it that names where it came from, its files are fetched in advance so Play
// never waits, it fills a phone or tablet sideways, and its source is in the repository. Usage: node scripts/supabase/test-canyon-rush.mjs
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
const GAME = 'public/games/canyon-rush';
const SRC = '../canyon-rush';
const types = read('src/components/Games/types.ts');

section('1. On the Games page');
const entry = types.slice(types.indexOf("id: 'canyon_rush_circuit'"), types.indexOf("id: 'helix_fall'"));
check(/title: 'Canyon Rush Circuit'/.test(entry) && /embedUrl: '\/games\/canyon-rush\/'/.test(entry), 'a card for Canyon Rush Circuit that opens /games/canyon-rush/');
check(/ownSound: true/.test(entry) && /embedLazy: true/.test(entry) && /isNew: true/.test(entry), 'its own sound stops the arcade loop, its frame is made when Play is pressed, and it is marked NEW');
check(/pointsReward: 0/.test(entry) && /Play for fun/.test(entry), 'it is for fun (no points are paid)');
const posters = [...entry.matchAll(/'(\/game-posters\/canyon-rush\/[^']+)'/g)].map((m) => m[1]);
check(posters.length >= 3 && posters.every((p) => fs.existsSync('public' + p)), `${posters.length} posters, every one is a real file`);
check(types.indexOf("id: 'canyon_rush_circuit'") < types.indexOf("id: 'helix_fall'"), 'it is the first card (newest first)');

section('2. No late loading: the files are fetched in advance');
const modal = read('src/components/Games/GamePlayModal.tsx'), view = read('src/components/Games/GamesView.tsx');
const hosted = read('src/utils/hostedGameWarmup.ts'), warm = read('src/utils/canyonWarmup.ts');
check(/warmHostedGame\(game\.id\)/.test(modal) && /canyon_rush_circuit/.test(hosted) && /warmCanyonFiles\('race'\)/.test(hosted), 'when the game\'s own page opens, the title screen AND the first race\'s files are fetched');
check(/warmCanyonFilesWhenIdle\(\)/.test(view) && /requestIdleCallback/.test(warm), 'while the Games page is open and the browser is idle, the title-screen files are fetched');
check(/warm\.json/.test(warm) && /dataSaver/.test(warm) && /2g/.test(warm) && /pullAll\(p\.shell\)/.test(warm) && /pullAll\(p\.race\)/.test(warm), 'two steps from a list the build writes; nothing on a data saver or 2G');
check(/lazy=\{game\.embedLazy\}/.test(modal) && /\(visible \|\| !lazy\) && <iframe/.test(read('src/components/Games/minigames/HostedGameFrame.tsx')), 'the frame is made when Play is pressed (the files are already in the browser by then)');
const plan = JSON.parse(read(path.join(GAME, 'warm.json')));
check(plan.shell.length >= 8 && plan.race.length >= 40, `the list has ${plan.shell.length} files for the title screen and ${plan.race.length} for the first race`);
check([...plan.shell, ...plan.race].every((f) => fs.existsSync(path.join(GAME, f))), 'every file on the list exists');
check(plan.race.some((f) => /models\/mesa\.glb/.test(f)) && plan.race.some((f) => /tex\/asphalt_diff/.test(f)) && plan.race.some((f) => /audio\/m-race/.test(f)) && plan.shell.some((f) => /m-title/.test(f)) && plan.shell.some((f) => /^build\/bootstrap-.*\.js$/.test(f)), 'it covers the cars, the road, the race music, the title music and the main script');
const mb = (list) => list.reduce((n, f) => n + fs.statSync(path.join(GAME, f)).size, 0) / 1048576;
check(mb(plan.shell) < 3 && mb(plan.race) < 12, `${mb(plan.shell).toFixed(1)} MB for the title screen, ${mb(plan.race).toFixed(1)} MB for the first race`);
const html = read(path.join(GAME, 'index.html'));
check(/<link rel="modulepreload" crossorigin href="\.\/build\/bootstrap-[^"]+\.js">/.test(html), 'the page tells the browser about the main script at once, so it downloads next to the first script, not after it');
// the warm-up module itself, run against a stand-in for fetch
globalThis.window = globalThis; Object.defineProperty(globalThis, 'navigator', { value: { connection: {} }, configurable: true });
const asked = [];
globalThis.fetch = async (url) => { asked.push(String(url)); return { ok: true, json: async () => plan, arrayBuffer: async () => new ArrayBuffer(1) }; };
const W = await import(pathToFileURL(path.resolve('src/utils/canyonWarmup.ts')).href);
await W.warmCanyonFiles('shell');
check(asked.includes('/games/canyon-rush/warm.json') && asked.includes('/games/canyon-rush/') && plan.shell.every((f) => asked.includes('/games/canyon-rush/' + f)) && !asked.some((u) => /models\//.test(u)), 'the first step fetches the page and the title-screen files only');
await W.warmCanyonFiles('race');
check(plan.race.every((f) => asked.includes('/games/canyon-rush/' + f)), 'the second step fetches every file of the first race');
const before = asked.length; await W.warmCanyonFiles('race');
check(asked.length === before, 'and nothing is fetched twice');

section('3. The game files are served from this site');
for (const f of ['index.html', 'warm.json', 'assets/ui/canyon-rush-mark.png', 'assets/ui/logo.webp', 'fonts/Sora-VF.subset.woff2', 'fonts/Figtree-VF.subset.woff2', 'fonts/Sora-OFL.txt', 'fonts/Figtree-OFL.txt', 'assets/models/mesa.glb', 'assets/audio/m-title.mp3']) check(fs.existsSync(path.join(GAME, f)), f);
const js = html.match(/src="\.\/build\/([^"]+\.js)"/)?.[1], css = html.match(/href="\.\/build\/([^"]+\.css)"/)?.[1];
check(js && fs.existsSync(path.join(GAME, 'build', js)) && css && fs.existsSync(path.join(GAME, 'build', css)), 'the page names a script and a style that exist (fingerprinted, in build/)');
const files = walk(GAME);
check(files.length > 60 && files.every((f) => fs.statSync(f).size < 20 * 1024 * 1024), `${files.length} files, none over 20 MB (the host's limit is 25 MB)`);
check(!files.some((f) => /\.(wasm)$/.test(f)) && !/WebAssembly/.test(files.filter((f) => f.endsWith('.js')).map(read).join('')), 'no WebAssembly (so the strict page policy below is enough)');

section('4. Nothing in it says where it came from');
const bad = [];
for (const f of [...files, ...walk(SRC), 'src/utils/canyonWarmup.ts', 'src/utils/hostedGameWarmup.ts', 'scripts/supabase/test-canyon-rush.mjs', 'src/components/Games/types.ts', 'public/_headers']) {
  if (NAME.test(fs.readFileSync(f).toString('latin1'))) bad.push(f);
}
check(bad.length === 0, 'no served file, no source file and no code of the app names the maker platform', bad.slice(0, 3).join(', '));
check(!/https?:\/\/(?!www\.w3\.org|noobsocials\.com)/.test(html), 'the page links to no other website');
check(!/<meta[^>]+(og:|twitter:)/.test(html) && /<title>Canyon Rush Circuit<\/title>/.test(html), 'a plain title and description, no share information naming anyone else');
const sources = walk(SRC).filter((f) => /\.(ts|mjs|js|css|html|json|md)$/.test(f));
const secrets = sources.filter((f) => /(AKIA[0-9A-Z]{12}|ghp_[A-Za-z0-9]{20}|sk-[A-Za-z0-9]{20}|BEGIN [A-Z ]*PRIVATE KEY|api[_-]?key\s*[:=]\s*['"][^'"]{8})/i.test(read(f)));
check(secrets.length === 0, 'no key, token or password in the source', secrets.join(', '));

section('5. Headers: the game may be framed by this site only, and may load only its own files');
const headers = read('public/_headers');
const block = headers.slice(headers.indexOf('/games/canyon-rush/*'), headers.indexOf('/games/canyon-rush/index.html'));
check(/X-Frame-Options: SAMEORIGIN/.test(block) && /frame-ancestors 'self'/.test(block), 'only this site can show it in a frame');
check(/script-src 'self';/.test(block) && !/unsafe-eval|wasm-unsafe-eval/.test(block) && /connect-src 'self' blob: data:/.test(block) && /object-src 'none'/.test(block), 'its own scripts only, no eval, no network, no plug-ins');
check(/\/games\/canyon-rush\/build\/\*\n  Cache-Control: public, max-age=31536000, immutable/.test(headers) && /\/games\/canyon-rush\/index\.html\n  Cache-Control: no-cache/.test(headers) && /\/games\/canyon-rush\/warm\.json\n  Cache-Control: no-cache/.test(headers) && /\/games\/canyon-rush\/assets\/\*\n  Cache-Control: public, max-age=86400/.test(headers), 'its fingerprinted files are kept for ever, the page and the list are always checked, models and sounds are kept a day');

section('6. Always sideways');
const frame = read('src/components/Games/minigames/HostedGameFrame.tsx');
check(/rotate\(90deg\)/.test(frame) && /pointer: coarse/.test(frame) && /requestFullscreen/.test(frame) && /lock\?\.\('landscape'\)|lock\?: \(o: string\)/.test(frame), 'inside NOOB a phone or tablet goes full screen at Play, the screen is locked sideways where the phone allows it, and an upright phone gets the game turned sideways');
check(/name="screen-orientation" content="landscape"/.test(html) && /viewport-fit=cover/.test(html), 'the page itself asks for landscape and the whole screen');
const touch = read(path.join(SRC, 'src/ui/touch.ts'));
check(/orientation-gate/.test(touch) && /window\.innerHeight > window\.innerWidth/.test(touch) && /orientation\.lock\?\.\('landscape'\)/.test(touch), 'opened on its own, an upright phone pauses the race and is asked to turn sideways (steering pad and GO / REV buttons are on the screen)');
const templates = read(path.join(SRC, 'src/ui/templates.ts'));
check(!/id: 'online'/.test(templates) && /id: 'solo'/.test(templates) && /id: 'lab'/.test(templates), 'Solo Race and Track Lab are offered; Multiplayer is not (NOOB runs no room service for it)');

section('7. The source is in the repository');
for (const f of ['NOOB-EMBED.md', 'package.json', 'pnpm-lock.yaml', 'vite.config.ts', 'tsconfig.json', 'index.html', 'src/main.ts', 'src/game/config.ts', 'src/game/tuning.ts', 'src/game/bootstrap.ts', 'scripts/make-warm.mjs', 'tests/sim.test.ts']) check(fs.existsSync(path.join(SRC, f)), f);
check(!fs.existsSync(path.join(SRC, 'node_modules')) && !fs.existsSync(path.join(SRC, 'dist')), 'no installed packages or build output in the repository');
const pkg = JSON.parse(read(path.join(SRC, 'package.json')));
check(pkg.dependencies?.three && /vite/.test(Object.keys(pkg.devDependencies).join()) && !NAME.test(JSON.stringify(pkg)), 'a clean package file (three, vite, vitest, typescript)');
const vite = read(path.join(SRC, 'vite.config.ts'));
check(/entryFileNames: 'build\/\[name\]-\[hash\]\.js'/.test(vite) && /base: '\.\/'/.test(vite), 'the build puts fingerprinted scripts in build/ and uses relative addresses');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
