// The Rogue: Shadowfall (a dark-fantasy 3D roguelite on the Games page): it is on the page, served from this site with nothing in it that names where it came from or reports anywhere, its
// files are fetched in advance so Play never waits, it asks for no file that is not there, the online and leaderboard parts are not offered, and on a phone it goes sideways.
// Usage: node scripts/supabase/test-the-rogue.mjs
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
const GAME = 'public/games/the-rogue';
const SRC = '../the-rogue';
const types = read('src/components/Games/types.ts');

section('1. On the Games page');
const entry = types.slice(types.indexOf("id: 'the_rogue_shadowfall'"), types.indexOf("id: 'canyon_rush_circuit'"));
check(/title: 'The Rogue: Shadowfall'/.test(entry) && /embedUrl: '\/games\/the-rogue\/'/.test(entry), 'a card for The Rogue: Shadowfall that opens /games/the-rogue/');
check(/ownSound: true/.test(entry) && /embedLazy: true/.test(entry) && /isNew: true/.test(entry) && /pointsReward: 0/.test(entry) && /Play for fun/.test(entry), 'its own sound stops the arcade loop, its frame is made when Play is pressed, NEW, played for fun (no points)');
const posters = [...entry.matchAll(/'(\/game-posters\/the-rogue\/[^']+)'/g)].map((m) => m[1]);
check(posters.length >= 4 && posters.every((p) => fs.existsSync('public' + p)), `${posters.length} posters, every one is a real file`);
check(types.indexOf("id: 'the_rogue_shadowfall'") < types.indexOf("id: 'canyon_rush_circuit'") && types.indexOf("id: 'the_rogue_shadowfall'") < types.indexOf("id: 'helix_fall'"), 'it is the first card (newest first)');

section('2. No late loading');
const hosted = read('src/utils/hostedGameWarmup.ts'), warm = read('src/utils/rogueWarmup.ts'), view = read('src/components/Games/GamesView.tsx');
check(/the_rogue_shadowfall/.test(hosted) && /warmRogueFiles\('race'\)/.test(hosted) && /warmHostedGame\(game\.id\)/.test(read('src/components/Games/GamePlayModal.tsx')), 'when the game\'s own page opens its files are fetched');
check(/warmRogueFilesWhenIdle\(\)/.test(view) && /requestIdleCallback/.test(warm) && /dataSaver/.test(warm) && /\/games\/the-rogue\//.test(warm), 'and while the Games page is open and the browser is idle; nothing on a data saver or 2G');
const plan = JSON.parse(read(path.join(GAME, 'warm.json')));
check(plan.shell.length >= 10 && plan.shell.every((f) => fs.existsSync(path.join(GAME, f))), `the list has ${plan.shell.length} files and every one exists`);
check(plan.shell.some((f) => /assets\/three\.module-/.test(f)) && plan.shell.some((f) => /assets\/game-/.test(f)) && plan.shell.some((f) => /ui\/logo\.webp/.test(f)) && !plan.shell.some((f) => /online-/.test(f)), 'it covers the 3D engine, the game, the title picture, and leaves out the online part');
const mb = plan.shell.reduce((n, f) => n + fs.statSync(path.join(GAME, f)).size, 0) / 1048576;
check(mb < 2, `${mb.toFixed(2)} MB in all`);
const html = read(path.join(GAME, 'index.html'));
const preloaded = [...html.matchAll(/rel="modulepreload"[^>]*href="\.\/assets\/([^"]+)"/g)].map((m) => m[1]);
check(['game-', 'assets-', 'renderer-', 'combat-', 'three.core-', 'three.module-'].every((p) => preloaded.some((f) => f.startsWith(p))), 'the page preloads every script the game loads after the first, so they download side by side');
globalThis.window = globalThis; Object.defineProperty(globalThis, 'navigator', { value: { connection: {} }, configurable: true });
const asked = [];
globalThis.fetch = async (url) => { asked.push(String(url)); return { ok: true, json: async () => plan, arrayBuffer: async () => new ArrayBuffer(1) }; };
const W = await import(pathToFileURL(path.resolve('src/utils/rogueWarmup.ts')).href);
await W.warmRogueFiles('race');
check(asked.includes('/games/the-rogue/warm.json') && plan.shell.every((f) => asked.includes('/games/the-rogue/' + f)), 'the quiet fetch asks for the list and then every file on it');
const before = asked.length; await W.warmRogueFiles('race');
check(asked.length === before, 'and nothing twice');

section('3. The game files are served from this site');
for (const f of ['index.html', 'the-rogue.css', 'icon-192.png', 'ui/logo.webp', 'fonts/Sora-VF.subset.woff2', 'fonts/Figtree-VF.subset.woff2']) check(fs.existsSync(path.join(GAME, f)), f);
const files = walk(GAME);
const js = files.filter((f) => f.endsWith('.js'));
check(js.length === 8 && files.every((f) => fs.statSync(f).size < 5 * 1024 * 1024), `${files.length} files, ${js.length} scripts, none over 5 MB`);
check(!files.some((f) => f.endsWith('.wasm')), 'no WebAssembly file; the only mention of WebAssembly is the decoder of the model reader, which is only used for model files (none are shipped), and the page policy below allows exactly that and nothing else');

section('4. Nothing in it says where it came from, nothing reports anywhere');
const bad = [];
for (const f of [...files, ...walk(SRC), 'src/utils/rogueWarmup.ts', 'src/utils/hostedGameWarmup.ts', 'scripts/supabase/test-the-rogue.mjs', 'src/components/Games/types.ts', 'public/_headers']) {
  if (NAME.test(fs.readFileSync(f).toString('latin1'))) bad.push(f);
}
check(bad.length === 0, 'no served file, no source file and no code of the app names the maker platform', bad.slice(0, 3).join(', '));
check(!/https?:\/\/(?!www\.w3\.org)/.test(html), 'the page links to no other website, loads no analytics or sharing code');
check(!/<meta[^>]+(og:|twitter:)/.test(html) && !/<script(?![^>]*\bsrc="\.\/assets\/)[^>]*>[^<]/.test(html) && /<title>The Rogue: Shadowfall<\/title>/.test(html), 'a plain title and description, no share information, no inline script');
const external = js.map((f) => [f, read(f).match(/https?:\/\/[A-Za-z0-9.-]+/g) || []]).flatMap(([f, m]) => m.filter((u) => !/www\.w3\.org|jcgt\.org|threejs\.org|github\.com/.test(u)).map((u) => `${path.basename(f)}: ${u}`));
check(external.length === 0, 'no script of the game mentions a web address it would call', external.slice(0, 3).join(' | '));
const main = read(path.join(GAME, 'assets', fs.readdirSync(path.join(GAME, 'assets')).find((f) => /^index-.*\.js$/.test(f))));
check(/fetch:([A-Za-z_$][\w$]*)=\(\)=>Promise\.reject\(Error\(`leaderboard_unavailable`\)\)/.test(main) && !/fetch:[A-Za-z_$][\w$]*=globalThis\.fetch/.test(main), 'the leaderboard client cannot reach any server (its network call fails at once, the run is simply not ranked)');
check(/\$\{[A-Za-z_$][\w$]*\}ui\/logo\.webp/.test(main) && /data:image\/gif;base64/.test(main), 'every interface picture except the title picture is an empty one pixel picture, not a request');
const loader = read(path.join(GAME, 'assets', fs.readdirSync(path.join(GAME, 'assets')).find((f) => /^assets-.*\.js$/.test(f))));
check(/async fetchEntry\([A-Za-z_$][\w$]*\)\{if\([A-Za-z_$][\w$]*\.path!==`ui\/logo\.webp`\)return;/.test(loader), 'the loader asks only for the title picture (the other files the game lists are not in the package: its own drawn world and synthesised sounds are used)');
check(/\[data-act="nav"\]\[data-arg="online"\], \[data-act="nav"\]\[data-arg="board"\] \{ display: none !important; \}/.test(read(path.join(GAME, 'the-rogue.css'))), 'the Online and Leaderboards entries of the menu are not shown');

section('5. Headers: the game may be framed by this site only, and may load only its own files');
const headers = read('public/_headers');
const block = headers.slice(headers.indexOf('/games/the-rogue/*'), headers.indexOf('/games/the-rogue/index.html'));
check(/X-Frame-Options: SAMEORIGIN/.test(block) && /frame-ancestors 'self'/.test(block), 'only this site can show it in a frame');
check(/script-src 'self' 'wasm-unsafe-eval';/.test(block) && !/'unsafe-eval'/.test(block) && /connect-src 'self' blob: data:/.test(block) && /object-src 'none'/.test(block), 'its own scripts only, no eval, no network, no plug-ins');
check(/\/games\/the-rogue\/assets\/\*\n  Cache-Control: public, max-age=31536000, immutable/.test(headers) && /\/games\/the-rogue\/index\.html\n  Cache-Control: no-cache/.test(headers) && /\/games\/the-rogue\/warm\.json\n  Cache-Control: no-cache/.test(headers), 'its fingerprinted scripts are kept for ever, the page and the list are always checked');

section('6. Always sideways');
const frame = read('src/components/Games/minigames/HostedGameFrame.tsx');
check(/rotate\(90deg\)/.test(frame) && /pointer: coarse/.test(frame) && /requestFullscreen/.test(frame) && /lock\?\.\('landscape'\)/.test(frame), 'inside NOOB a phone or tablet goes full screen at Play, locked sideways where the phone allows it, and an upright phone gets the game turned sideways');
check(/name="screen-orientation" content="landscape"/.test(html) && /viewport-fit=cover/.test(html), 'the page itself asks for landscape and the whole screen');
check(/className=`touch`/.test(main) && /data-a="ultimate"/.test(main) && /data-a="dash"/.test(main) && /stick-move/.test(main) && /stick-aim/.test(main), 'the game has its own two sticks and buttons for touch screens');

section('6b. Touch screens: hints, camera and prompts');
const game = read(path.join(GAME, 'assets', fs.readdirSync(path.join(GAME, 'assets')).find((f) => /^game-.*\.js$/.test(f))));
check(/method=matchMedia\(`\(pointer: coarse\)`\)\.matches\?`touch`:`keyboard`/.test(main), 'a phone or tablet starts as touch, so the first hints are USE / DASH / SPELL, not E / Space / Esc');
check((main.match(/if\(this\.syn\(\)\)return;/g) || []).length === 2 && /syn\(\)\{return performance\.now\(\)-this\.lastTouch<1200\}/.test(main) && /addEventListener\(`touchstart`,mark/.test(main), 'mouse events made up by the browser within 1.2 s of a touch are ignored (they used to flip the hints back to key names and the camera back to the pointer)');
check(/this\.look\.dx\+=\(p\.clientX-lx\)\*1\.8/.test(main) && /pointerType!==`touch`/.test(main) && /setPointerCapture/.test(main), 'dragging a finger on the picture turns the camera (and the character with it)');
check(/\.locked\|\|[A-Za-z_$][\w$]*\.method===`touch`\?[A-Za-z_$][\w$]*\.look\.dx:0/.test(game) && /\.locked\|\|[A-Za-z_$][\w$]*\.method===`touch`\?[A-Za-z_$][\w$]*\.look\.dy:0/.test(game), 'the camera accepts that input on touch (sideways and up / down)');
check(/closest\?\.\(`\.prompt`\)/.test(main) && /pressed_\.add\(`interact`\)/.test(main), 'the prompt over a chest, door or shrine can be tapped');
const style = read(path.join(GAME, 'the-rogue.css'));
check(/#game \{ touch-action: none; \}/.test(style) && /body\.has-touch \.prompt\.show \{ pointer-events: auto; cursor: pointer; \}/.test(style) && /body\.has-touch \.look-hint \{ display: none !important; \}/.test(style), 'the picture takes the finger (no scrolling or zooming), the prompt can be tapped, and the mouse hint is hidden on touch');

section('7. The way it was made is in the repository');
for (const f of ['NOOB-EMBED.md', 'make.mjs', 'art/logo.webp', 'art/icon-192.png']) check(fs.existsSync(path.join(SRC, f)), f);
const make = read(path.join(SRC, 'make.mjs'));
check(/expected \$\{count\} place\(s\), found \$\{found\}/.test(make) && /the maker's name is still in/.test(make), 'every change is checked, and the script stops if the maker\'s name is left anywhere');
check(!fs.existsSync(path.join(SRC, 'node_modules')) && !fs.readdirSync(SRC).some((f) => f.endsWith('.zip')), 'no installed packages and not the supplied archive (its page carries the maker\'s tracking code)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
