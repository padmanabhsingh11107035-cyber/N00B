// Siegecraft (a 3D catapult game on the Games page): it is on the page, served from this site with nothing in it that names where it came from, "Made by NOOB developers" is on its screens and in its page,
// its files are fetched in advance so Play never waits, it always plays sideways, and its source is in the repository. Usage: node --liftoff-only scripts/supabase/test-siegecraft.mjs
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
const GAME = 'public/games/siegecraft';
const SRC = '../siegecraft';
const types = read('src/components/Games/types.ts');

section('1. On the Games page');
const entry = types.slice(types.indexOf("id: 'siegecraft'"), types.indexOf("id: 'coil_rush'"));
check(/title: 'Siegecraft'/.test(entry) && /embedUrl: '\/games\/siegecraft\/'/.test(entry), 'a card for Siegecraft that opens /games/siegecraft/');
check(/ownSound: true/.test(entry) && /embedLazy: true/.test(entry) && /isNew: true/.test(entry), 'its own sound stops the arcade loop, its frame is made when Play is pressed, and it is marked NEW');
check(/pointsReward: 0/.test(entry) && /Play for fun/.test(entry), 'it is for fun (no points are paid)');
const posters = [...entry.matchAll(/'(\/game-posters\/siegecraft\/[^']+)'/g)].map((m) => m[1]);
check(posters.length >= 3 && posters.every((p) => fs.existsSync('public' + p)), `${posters.length} posters, every one is a real file`);
check(types.indexOf("id: 'siegecraft'") > 0 && types.indexOf("id: 'siegecraft'") < types.indexOf("id: 'coil_rush'"), 'it is the first card (newest first)');
check(/Made by NOOB developers/.test(entry), 'the card says it is made by NOOB developers');
check(!NAME.test(entry) && !/made with|made on/i.test(entry), 'and does not say where the game was made');
check(/embedControls: '[^']*mouse wheel[^']*phone[^']*'/.test(entry), 'the game\'s page has its own controls line (the default one is for another kind of game)');

section('2. No late loading: the files are fetched in advance');
const modal = read('src/components/Games/GamePlayModal.tsx'), view = read('src/components/Games/GamesView.tsx');
const hosted = read('src/utils/hostedGameWarmup.ts'), warm = read('src/utils/siegecraftWarmup.ts');
check(/warmHostedGame\(game\.id\)/.test(modal) && /id === 'siegecraft'/.test(hosted) && /warmSiegecraftFiles\('race'\)/.test(hosted), 'when the game\'s own page opens, its files are fetched');
check(/warmSiegecraftFilesWhenIdle\(\)/.test(view) && /requestIdleCallback/.test(warm), 'while the Games page is open and the browser is idle, they are fetched too');
check(/warm\.json/.test(warm) && /dataSaver/.test(warm) && /2g/.test(warm) && /BASE = '\/games\/siegecraft\/'/.test(warm), 'from a list the build writes; nothing on a data saver or 2G');
check(/lazy=\{game\.embedLazy\}/.test(modal) && /\(visible \|\| !lazy\) && <iframe/.test(read('src/components/Games/minigames/HostedGameFrame.tsx')), 'the frame is made when Play is pressed (the files are already in the browser by then)');
const plan = JSON.parse(read(path.join(GAME, 'warm.json')));
check(plan.shell.length >= 9, `the list has ${plan.shell.length} files`);
check([...plan.shell, ...plan.race].every((f) => fs.existsSync(path.join(GAME, f))), 'every file on the list exists');
check(['physics', 'game', 'renderer', 'stone-projectile'].every((k) => plan.shell.some((f) => new RegExp(`^build/${k}-[^/]*\\.(js|glb)$`).test(f))) && plan.shell.some((f) => /\.css$/.test(f)) && plan.shell.some((f) => /Sora-VF/.test(f)) && plan.shell.some((f) => /Figtree-VF/.test(f)) && plan.shell.includes('logo.png'), 'it holds the game, physics, renderer, style, stone model, both interface fonts and the logo');
check(!plan.shell.some((f) => /NotoSansSC/.test(f)), 'but not the big Chinese font (it is fetched only when Chinese is shown)');
const mb = (list) => list.reduce((n, f) => n + fs.statSync(path.join(GAME, f)).size, 0) / 1048576;
check(mb(plan.shell) < 7, `${mb(plan.shell).toFixed(1)} MB in all (about 3 MB over the wire)`);
const html = read(path.join(GAME, 'index.html'));
check(/<script type="module" crossorigin src="\.\/build\/index-[^"]+\.js"><\/script>/.test(html) && !/<script(?![^>]*\bsrc=)/.test(html), 'the page names its main script at once, and has no script written into it (the policy forbids that)');
// the warm-up module itself, run against a stand-in for fetch
globalThis.window = globalThis; Object.defineProperty(globalThis, 'navigator', { value: { connection: {} }, configurable: true });
const asked = [];
globalThis.fetch = async (url) => { asked.push(String(url)); return { ok: true, json: async () => plan, arrayBuffer: async () => new ArrayBuffer(1) }; };
const W = await import(pathToFileURL(path.resolve('src/utils/siegecraftWarmup.ts')).href);
await W.warmSiegecraftFiles('race');
check(asked.includes('/games/siegecraft/warm.json') && asked.includes('/games/siegecraft/') && plan.shell.every((f) => asked.includes('/games/siegecraft/' + f)), 'it fetches the page and every file on the list');
const before = asked.length; await W.warmSiegecraftFiles('race');
check(asked.length === before, 'and nothing is fetched twice');

section('3. The game files are served from this site');
for (const f of ['index.html', 'warm.json', 'logo.png', 'fonts/Sora-VF.subset.woff2', 'fonts/Figtree-VF.subset.woff2', 'fonts/NotoSansSC-VF.subset.woff2', 'fonts/Sora-OFL.txt', 'fonts/Figtree-OFL.txt', 'fonts/NotoSansSC-OFL.txt']) check(fs.existsSync(path.join(GAME, f)), f);
const js = html.match(/src="\.\/build\/([^"]+\.js)"/)?.[1], css = html.match(/href="\.\/build\/([^"]+\.css)"/)?.[1];
check(js && fs.existsSync(path.join(GAME, 'build', js)) && css && fs.existsSync(path.join(GAME, 'build', css)), 'the page names a script and a style that exist (fingerprinted, in build/)');
const glb = fs.readdirSync(path.join(GAME, 'build')).find((f) => /^stone-projectile-.*\.glb$/.test(f));
check(glb && fs.readFileSync(path.join(GAME, 'build', glb)).subarray(0, 4).toString('latin1') === 'glTF', 'the stone model is a real model file of the build');
const files = walk(GAME);
check(files.length >= 12 && files.every((f) => fs.statSync(f).size < 20 * 1024 * 1024), `${files.length} files, none over 20 MB (the host's limit is 25 MB)`);
const logo = fs.readFileSync(path.join(GAME, 'logo.png'));
check(logo.subarray(1, 4).toString('latin1') === 'PNG' && logo.readUInt32BE(16) === 192 && logo.readUInt32BE(20) === 192 && logo.length < 120 * 1024, 'the logo is a small (192 px) picture, not the 2.7 MB original');

section('4. Nothing in it says where it came from, and it says who made it');
const bad = [];
for (const f of [...files, ...walk(SRC), 'src/utils/siegecraftWarmup.ts', 'src/utils/hostedGameWarmup.ts', 'scripts/supabase/test-siegecraft.mjs', 'src/components/Games/types.ts', 'public/_headers']) {
  if (NAME.test(fs.readFileSync(f).toString('latin1')) || NAME.test(f)) bad.push(f);
}
check(bad.length === 0, 'no served file, no source file, no file name and no code of the app names the maker platform', bad.slice(0, 3).join(', '));
check(!/https?:\/\//.test(html), 'the page links to no other website');
const builtJs = files.filter((f) => f.endsWith('.js')).map(read).join('\n'), builtCss = read(path.join(GAME, 'build', css));
const urls = [...(builtJs + builtCss).matchAll(/https?:\/\/[^\s"'`)<>\\]+/g)].map((m) => m[0]).filter((u) => !/^http:\/\/www\.w3\.org\/|^https:\/\/jcgt\.org\//.test(u));
check(urls.length === 0, 'no address in the scripts or style except the XML name spaces and one paper named in the 3D library', urls.slice(0, 3).join(' '));
const glbBuf = fs.readFileSync(path.join(GAME, 'build', glb)), glbJson = JSON.parse(glbBuf.subarray(20, 20 + glbBuf.readUInt32LE(12)).toString('utf8'));
check(Object.keys(glbJson.asset).join() === 'version' && !/https?:|[0-9a-f]{8}-[0-9a-f]{4}-|"extras"/i.test(JSON.stringify(glbJson)), 'the stone model carries no web address, no program name and no id in its description (only the data and plain names)');
check(Buffer.compare(glbBuf, fs.readFileSync(path.join(SRC, 'src/assets/stone-projectile.glb'))) === 0, 'and the model in the repository is the one that is served');
check(!/<meta[^>]+(og:|twitter:)/.test(html) && /<title>Siegecraft · Made by NOOB developers<\/title>/.test(html), 'a plain title that says who made it, no share information naming anyone else');
check(/<meta name="author" content="NOOB developers"/.test(html) && /<meta name="description" content="[^"]*Made by NOOB developers[^"]*"/.test(html) && /<meta name="application-name" content="Siegecraft"/.test(html), 'the author and description tags say NOOB developers');
check(!/\/[a-z]+-storage\/|registerGameTuning|game-tuning|preview-parent|\beval\s*\(|new Function\s*\(/.test(builtJs), 'no storage address of another host, no tuning hook, no eval in the scripts');
const en = JSON.parse(read(path.join(SRC, 'src/i18n/en.json'))), zh = JSON.parse(read(path.join(SRC, 'src/i18n/zh-CN.json')));
check(en['credits.maker'] === 'Made by NOOB developers' && /NOOB/.test(zh['credits.maker']) && !('credits.source' in en) && !('credits.source' in zh), 'the credit is in both languages, and the old "source game" credit is gone');
check(JSON.stringify(Object.keys(en).sort()) === JSON.stringify(Object.keys(zh).sort()), 'both languages have the same texts');
check(builtJs.includes('Made by NOOB developers'), 'and it is in the built game');
const ui = read(path.join(SRC, 'src/ui/ui.ts'));
check((ui.match(/class="made-by">\$\{t\('credits\.maker'\)\}/g) || []).length === 2 && /<b>\$\{t\('credits\.maker'\)\}<\/b>/.test(ui), 'the credit shows on the loading screen, the title screen and in Settings');
check(/\.title \.made-by/.test(builtCss) && /\.boot \.made-by/.test(builtCss), 'and the built style places it');
check(/SAVE_KEY = 'noob\.siegecraft\.save'/.test(read(path.join(SRC, 'src/engine/save.ts'))) && builtJs.includes('noob.siegecraft.save') && !builtJs.includes('siege.save'), 'the save has a name of its own (this site holds the saves of every game)');
const sources = walk(SRC).filter((f) => /\.(ts|mjs|js|css|html|json|md)$/.test(f));
const secrets = sources.filter((f) => /(AKIA[0-9A-Z]{12}|ghp_[A-Za-z0-9]{20}|sk-[A-Za-z0-9]{20}|BEGIN [A-Z ]*PRIVATE KEY|api[_-]?key\s*[:=]\s*['"][^'"]{8})/i.test(read(f)));
check(secrets.length === 0, 'no key, token or password in the source', secrets.join(', '));

section('5. The big Chinese font is only fetched for Chinese');
const cssSrc = read(path.join(SRC, 'src/styles/main.css'));
check(/unicode-range: U\+2E80-2FDF/.test(cssSrc) && /unicode-range:\s*U\+2e80-2fdf/i.test(builtCss), 'its @font-face lists only Chinese letters, so Latin text never asks for it');
check(!/\.hint-icon::after[^}]*Noto Sans SC/.test(cssSrc) && /\.seg\[data-locale="zh-CN"\] \{ font-family: system-ui/.test(cssSrc), 'the hint icons and the two-letter language button do not use it');

section('6. Headers: the game may be framed by this site only, and may load only its own files');
const headers = read('public/_headers');
const block = headers.slice(headers.indexOf('/games/siegecraft/*'), headers.indexOf('/games/siegecraft/index.html'));
check(/X-Frame-Options: SAMEORIGIN/.test(block) && /frame-ancestors 'self'/.test(block), 'only this site can show it in a frame');
check(/script-src 'self' 'wasm-unsafe-eval';/.test(block) && !/[^-]unsafe-eval/.test(block.replace(/wasm-unsafe-eval/g, '')) && /connect-src 'self' blob: data:/.test(block) && /object-src 'none'/.test(block) && /default-src 'self'/.test(block), 'its own scripts only (plus WebAssembly, which the physics engine is), no eval, no network, no plug-ins');
check(/\/games\/siegecraft\/build\/\*\n  Cache-Control: public, max-age=31536000, immutable/.test(headers) && /\/games\/siegecraft\/index\.html\n  Cache-Control: no-cache/.test(headers) && /\/games\/siegecraft\/warm\.json\n  Cache-Control: no-cache/.test(headers) && /\/games\/siegecraft\/fonts\/\*\n  Cache-Control: public, max-age=604800/.test(headers) && /\/games\/siegecraft\/logo\.png\n  Cache-Control: public, max-age=604800/.test(headers), 'the scripts and the model are kept for ever, the page and the file list are asked for again every time');
check(/WebAssembly/.test(builtJs), 'the policy above needs WebAssembly, and the game does use it (so the line is not there for nothing)');

section('7. Always sideways');
const frame = read('src/components/Games/minigames/HostedGameFrame.tsx');
check(/rotate\(90deg\)/.test(frame) && /pointer: coarse/.test(frame) && /requestFullscreen/.test(frame) && !/embedPortrait: true/.test(entry), 'inside NOOB a phone or tablet goes full screen at Play, and an upright phone sees the game turned on its side');
check(/name="screen-orientation" content="landscape"/.test(html) && /viewport-fit=cover/.test(html), 'the page itself asks for landscape and the whole screen');
const main = read(path.join(SRC, 'src/main.ts'));
check(/requestFullscreen/.test(main) && /lock\?\.call\(screen\.orientation, 'landscape'\)/.test(main) && /window\.self !== window\.top/.test(main) && /pointer: coarse/.test(main), 'opened on its own on a phone, the first touch asks for full screen held sideways');
check(/class="rotate"/.test(ui) && /@media \(orientation: portrait\) and \(pointer: coarse\)/.test(cssSrc) && en['rotate.title'] && zh['rotate.title'], 'the game\'s own "Rotate your device" card shows while a phone is upright, in both languages');

section('8. The source is in the repository');
for (const f of ['NOOB-EMBED.md', 'package.json', 'pnpm-lock.yaml', 'vite.config.ts', 'tsconfig.json', 'index.html', 'src/main.ts', 'src/game/config.ts', 'src/game/game.ts', 'src/game/sim.ts', 'src/game/levels.ts', 'src/assets/stone-projectile.glb', 'public/logo.png', 'public/fonts/Sora-OFL.txt', 'public/fonts/Figtree-OFL.txt', 'public/fonts/NotoSansSC-OFL.txt', 'scripts/make-warm.mjs', 'tests/game.test.ts', 'tests/i18n.test.ts', 'tests/save.test.ts', 'tests/engine.test.ts']) check(fs.existsSync(path.join(SRC, f)), f);
check(!fs.existsSync(path.join(SRC, 'node_modules')) && !fs.existsSync(path.join(SRC, 'dist')) && !fs.existsSync(path.join(SRC, 'scripts/smoke.mjs')) && !fs.existsSync(path.join(SRC, 'src/game/tuning.ts')), 'no installed packages, build output, browser script or tuning panel in the repository');
const pkg = JSON.parse(read(path.join(SRC, 'package.json')));
check(pkg.dependencies?.three && pkg.dependencies?.['@dimforge/rapier3d-compat'] && /vite/.test(Object.keys(pkg.devDependencies).join()) && !pkg.devDependencies.playwright && !NAME.test(JSON.stringify(pkg)), 'a clean package file (three, rapier, vite, vitest, typescript; no browser-driver)');
const vite = read(path.join(SRC, 'vite.config.ts'));
check(/entryFileNames: 'build\/\[name\]-\[hash\]\.js'/.test(vite) && /base: '\.\/'/.test(vite) && !/allowedHosts/.test(vite) && !/plugins:/.test(vite), 'the build puts fingerprinted scripts in build/ and uses relative addresses, with no extra plug-in');
check(/test-siegecraft\.mjs/.test(read('package.json')), 'this test is part of the test chain');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
