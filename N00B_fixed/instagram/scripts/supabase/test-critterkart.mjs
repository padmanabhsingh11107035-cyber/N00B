// Critter Kart (a 3D item kart racer on the Games page): it is on the page, served from this site with nothing in it that names where it came from and no online score service, its files are fetched in
// advance so Play never waits, it always plays sideways, and its source is in the repository. Usage: node scripts/supabase/test-critterkart.mjs
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
const GAME = 'public/games/critterkart';
const SRC = '../critterkart';
const types = read('src/components/Games/types.ts');

section('1. On the Games page');
const entry = types.slice(types.indexOf("id: 'critter_kart'"), types.indexOf("id: 'canyon_rush_circuit'"));
check(/title: 'Critter Kart'/.test(entry) && /embedUrl: '\/games\/critterkart\/'/.test(entry), 'a card for Critter Kart that opens /games/critterkart/');
check(/ownSound: true/.test(entry) && /embedLazy: true/.test(entry) && /isNew: true/.test(entry), 'its own sound stops the arcade loop, its frame is made when Play is pressed, and it is marked NEW');
check(/pointsReward: 0/.test(entry) && /Play for fun/.test(entry), 'it is for fun (no points are paid)');
const posters = [...entry.matchAll(/'(\/game-posters\/critterkart\/[^']+)'/g)].map((m) => m[1]);
check(posters.length >= 2 && posters.every((p) => fs.existsSync('public' + p)), `${posters.length} posters, every one is a real file`);
check(types.indexOf("id: 'critter_kart'") < types.indexOf("id: 'canyon_rush_circuit'") && types.indexOf("id: 'critter_kart'") > 0, 'it is the first card (newest first)');
check(!NAME.test(entry) && !/made with|made on/i.test(entry), 'the card does not say where the game was made');

section('2. No late loading: the files are fetched in advance');
const modal = read('src/components/Games/GamePlayModal.tsx'), view = read('src/components/Games/GamesView.tsx');
const hosted = read('src/utils/hostedGameWarmup.ts'), warm = read('src/utils/critterWarmup.ts');
check(/warmHostedGame\(game\.id\)/.test(modal) && /critter_kart/.test(hosted) && /warmCritterFiles\('race'\)/.test(hosted), 'when the game\'s own page opens, its files are fetched');
check(/warmCritterFilesWhenIdle\(\)/.test(view) && /requestIdleCallback/.test(warm), 'while the Games page is open and the browser is idle, they are fetched too');
check(/warm\.json/.test(warm) && /dataSaver/.test(warm) && /2g/.test(warm) && /BASE = '\/games\/critterkart\/'/.test(warm), 'from a list the build writes; nothing on a data saver or 2G');
check(/lazy=\{game\.embedLazy\}/.test(modal) && /\(visible \|\| !lazy\) && <iframe/.test(read('src/components/Games/minigames/HostedGameFrame.tsx')), 'the frame is made when Play is pressed (the files are already in the browser by then)');
const plan = JSON.parse(read(path.join(GAME, 'warm.json')));
check(plan.shell.length >= 8, `the list has ${plan.shell.length} files`);
check([...plan.shell, ...plan.race].every((f) => fs.existsSync(path.join(GAME, f))), 'every file on the list exists');
check(plan.shell.some((f) => /^build\/physics-.*\.js$/.test(f)) && plan.shell.some((f) => /^build\/game-.*\.js$/.test(f)) && plan.shell.some((f) => /^build\/renderer-.*\.js$/.test(f)) && plan.shell.some((f) => /\.css$/.test(f)) && plan.shell.some((f) => /Sora-VF/.test(f)) && plan.shell.some((f) => /Figtree-VF/.test(f)), 'it holds the game, physics, renderer, style and both interface fonts');
const mb = (list) => list.reduce((n, f) => n + fs.statSync(path.join(GAME, f)).size, 0) / 1048576;
check(mb(plan.shell) < 6, `${mb(plan.shell).toFixed(1)} MB in all (about 2 MB over the wire)`);
const html = read(path.join(GAME, 'index.html'));
check(/<link rel="modulepreload" crossorigin href="\.\/build\/index-[^"]+\.js">/.test(html), 'the page tells the browser about the main script at once');
// the warm-up module itself, run against a stand-in for fetch
globalThis.window = globalThis; Object.defineProperty(globalThis, 'navigator', { value: { connection: {} }, configurable: true });
const asked = [];
globalThis.fetch = async (url) => { asked.push(String(url)); return { ok: true, json: async () => plan, arrayBuffer: async () => new ArrayBuffer(1) }; };
const W = await import(pathToFileURL(path.resolve('src/utils/critterWarmup.ts')).href);
await W.warmCritterFiles('race');
check(asked.includes('/games/critterkart/warm.json') && asked.includes('/games/critterkart/') && plan.shell.every((f) => asked.includes('/games/critterkart/' + f)), 'it fetches the page and every file on the list');
const before = asked.length; await W.warmCritterFiles('race');
check(asked.length === before, 'and nothing is fetched twice');

section('3. The game files are served from this site');
for (const f of ['index.html', 'warm.json', 'favicon.svg', 'fonts/Sora-VF.subset.woff2', 'fonts/Figtree-VF.subset.woff2', 'fonts/Sora-OFL.txt', 'fonts/Figtree-OFL.txt', 'fonts/NotoSansSC-OFL.txt']) check(fs.existsSync(path.join(GAME, f)), f);
const js = html.match(/src="\.\/build\/([^"]+\.js)"/)?.[1], css = html.match(/href="\.\/build\/([^"]+\.css)"/)?.[1];
check(js && fs.existsSync(path.join(GAME, 'build', js)) && css && fs.existsSync(path.join(GAME, 'build', css)), 'the page names a script and a style that exist (fingerprinted, in build/)');
const files = walk(GAME);
check(files.length >= 12 && files.every((f) => fs.statSync(f).size < 20 * 1024 * 1024), `${files.length} files, none over 20 MB (the host's limit is 25 MB)`);

section('4. Nothing in it says where it came from, and there is no online score service');
const bad = [];
for (const f of [...files, ...walk(SRC), 'src/utils/critterWarmup.ts', 'src/utils/hostedGameWarmup.ts', 'scripts/supabase/test-critterkart.mjs', 'src/components/Games/types.ts', 'public/_headers']) {
  if (NAME.test(fs.readFileSync(f).toString('latin1'))) bad.push(f);
}
check(bad.length === 0, 'no served file, no source file and no code of the app names the maker platform', bad.slice(0, 3).join(', '));
check(!/https?:\/\/(?!www\.w3\.org|noobsocials\.com)/.test(html), 'the page links to no other website');
check(!/<meta[^>]+(og:|twitter:)/.test(html) && /<title>[^<]*Critter Kart[^<]*<\/title>/.test(html), 'a plain title and description, no share information naming anyone else');
const builtJs = files.filter((f) => f.endsWith('.js')).map(read).join('\n');
check(!/api\/leaderboards|createLeaderboardClient|ensureGuest|X-Guest-Token/.test(builtJs) && !fs.existsSync(path.join(SRC, 'leaderboard.js')) && !fs.existsSync(path.join(SRC, 'server')), 'the online leaderboard client and its server are gone (the on-device leaderboard stays)');
check(!/res-online|results\.online/.test(builtJs + read(path.join(GAME, 'build', css))), 'and so is the "online result" line on the results screen');
const sources = walk(SRC).filter((f) => /\.(ts|mjs|js|css|html|json|md)$/.test(f));
const secrets = sources.filter((f) => /(AKIA[0-9A-Z]{12}|ghp_[A-Za-z0-9]{20}|sk-[A-Za-z0-9]{20}|BEGIN [A-Z ]*PRIVATE KEY|api[_-]?key\s*[:=]\s*['"][^'"]{8})/i.test(read(f)));
check(secrets.length === 0, 'no key, token or password in the source', secrets.join(', '));

section('5. Headers: the game may be framed by this site only, and may load only its own files');
const headers = read('public/_headers');
const block = headers.slice(headers.indexOf('/games/critterkart/*'), headers.indexOf('/games/critterkart/index.html'));
check(/X-Frame-Options: SAMEORIGIN/.test(block) && /frame-ancestors 'self'/.test(block), 'only this site can show it in a frame');
check(/script-src 'self' 'wasm-unsafe-eval';/.test(block) && !/[^-]unsafe-eval/.test(block.replace(/wasm-unsafe-eval/g, '')) && /connect-src 'self' blob: data:/.test(block) && /object-src 'none'/.test(block), 'its own scripts only (plus WebAssembly, which the physics engine is), no eval, no network, no plug-ins');
check(/\/games\/critterkart\/build\/\*\n  Cache-Control: public, max-age=31536000, immutable/.test(headers) && /\/games\/critterkart\/index\.html\n  Cache-Control: no-cache/.test(headers) && /\/games\/critterkart\/warm\.json\n  Cache-Control: no-cache/.test(headers) && /\/games\/critterkart\/fonts\/\*\n  Cache-Control: public, max-age=604800/.test(headers), 'the scripts are kept for ever, the page and the file list are asked for again every time');
check(/WebAssembly/.test(builtJs), 'the policy above needs WebAssembly, and the game does use it (so the line is not there for nothing)');

section('6. Always sideways');
const frame = read('src/components/Games/minigames/HostedGameFrame.tsx');
check(/rotate\(90deg\)/.test(frame) && /pointer: coarse/.test(frame) && /requestFullscreen/.test(frame), 'inside NOOB a phone or tablet goes full screen at Play, and an upright phone sees the game turned on its side');
check(/name="screen-orientation" content="landscape"/.test(html) && /viewport-fit=cover/.test(html), 'the page itself asks for landscape and the whole screen');
const main = read(path.join(SRC, 'src/main.ts'));
check(/requestFullscreen/.test(main) && /lock\?\.call\(screen\.orientation, 'landscape'\)/.test(main) && /window\.self !== window\.top/.test(main) && /pointer: coarse/.test(main), 'opened on its own on a phone, the first touch asks for full screen held sideways');
const ui = read(path.join(SRC, 'src/ui/ui.ts')), css2 = read(path.join(SRC, 'src/styles/main.css'));
check(/class="rotate"/.test(ui) && /@media \(orientation: portrait\) and \(pointer: coarse\)/.test(css2), 'the game\'s own "Rotate your device" card shows while a phone is upright');

section('7. The source is in the repository');
for (const f of ['NOOB-EMBED.md', 'package.json', 'pnpm-lock.yaml', 'vite.config.ts', 'tsconfig.json', 'index.html', 'src/main.ts', 'src/game/config.ts', 'src/game/game.ts', 'src/engine/kart.ts', 'scripts/make-warm.mjs', 'tests/rules.test.ts', 'tests/i18n.test.ts']) check(fs.existsSync(path.join(SRC, f)), f);
check(!fs.existsSync(path.join(SRC, 'node_modules')) && !fs.existsSync(path.join(SRC, 'dist')), 'no installed packages or build output in the repository');
const pkg = JSON.parse(read(path.join(SRC, 'package.json')));
check(pkg.dependencies?.three && pkg.dependencies?.['@dimforge/rapier3d-compat'] && /vite/.test(Object.keys(pkg.devDependencies).join()) && !pkg.devDependencies.playwright && !NAME.test(JSON.stringify(pkg)), 'a clean package file (three, rapier, vite, vitest, typescript; no browser-driver)');
const vite = read(path.join(SRC, 'vite.config.ts'));
check(/entryFileNames: 'build\/\[name\]-\[hash\]\.js'/.test(vite) && /base: '\.\/'/.test(vite) && !/allowedHosts/.test(vite), 'the build puts fingerprinted scripts in build/ and uses relative addresses');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
