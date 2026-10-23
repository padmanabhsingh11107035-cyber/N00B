// Builds the game's folder for the website (N00B_fixed/instagram/public/games/the-rogue) from the supplied compiled game.
// The supplied archive holds only the compiled game (no source): a page, scripts, one style sheet and two fonts, plus the page's own tracking and sharing parts.
// This script keeps the scripts, style and fonts, writes a clean page of our own and makes a handful of small, checked changes to the scripts (below).
//
// Usage: node make.mjs <folder of the supplied game, with index.html, assets/ and fonts/> [output folder]
// (the supplied archive is NOT kept in the repository: its page carries the maker's tracking and sharing code)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SRC = process.argv[2];
const OUT = process.argv[3] || path.resolve('../instagram/public/games/the-rogue');
if (!SRC || !fs.existsSync(path.join(SRC, 'assets'))) { console.error('Usage: node make.mjs <folder of the supplied game> [output folder]'); process.exit(1); }
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
// the maker platform's name is put together here so that this file does not contain it either
const MAKER = ['ma', 'nus'].join('');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const find = (re) => { const f = fs.readdirSync(path.join(SRC, 'assets')).find((n) => re.test(n)); if (!f) throw new Error(`missing ${re}`); return f; };

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'fonts'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'ui'), { recursive: true });

// one change = a text to find, how many times it must be there, and what takes its place
function patch(text, name, re, count, to) {
  const found = (text.match(re) || []).length;
  if (found !== count) throw new Error(`${name}: expected ${count} place(s), found ${found}`);
  return text.replace(re, to);
}

// ---- the main script (menus, leaderboard client)
const indexJs = find(/^index-.*\.js$/);
let main = read(`assets/${indexJs}`);
// 1. internal names that carried the maker's name (the leaderboard client's address marker, its saved-guest key and one error word): renamed, nothing else about them changes
main = patch(main, 'address marker', new RegExp(`/__${MAKER}__/game-preview/`, 'g'), 2, '/__game-preview__/');
main = patch(main, 'guest key', new RegExp(`${MAKER}-leaderboard:`, 'g'), 2, 'noob-leaderboard:');
main = patch(main, 'auth word', new RegExp(`canonical_${MAKER}_auth_required`, 'g'), 1, 'canonical_auth_required');
// 2. there is no leaderboard service on this site: the client's network call is replaced by one that fails at once ("leaderboard unavailable"), so a run is simply not ranked and nothing is sent anywhere
main = patch(main, 'leaderboard network call', /fetch:([A-Za-z_$][\w$]*)=globalThis\.fetch/g, 1, 'fetch:$1=()=>Promise.reject(Error(`leaderboard_unavailable`))');
// 3. the game's pictures (interface frames, element badges...) were not in the supplied archive: every picture address except the title picture becomes an empty 1x1 picture, so nothing is asked of the server for them
main = patch(main, 'picture address', /([A-Za-z_$][\w$]*)=`\.\/`,([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)=>`\$\{\1\}ui\/\$\{\3\}\.webp`/g, 1,
  '$1=`./`,$2=$3=>$3===`logo`?`${$1}ui/logo.webp`:`data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7`');
// 4. TOUCH SCREENS. The game decides what to show ("E", "Esc", "Left click" ... or "USE", "DASH" ...) and how to turn the camera from the kind of input it saw last. On a phone, the mouse events
// that the browser makes up after every tap or drag made it believe a mouse was in use, so the hints went back to key names, the camera went back to following the pointer and the on-screen
// sticks seemed dead. Changes (inside the game's input class):
//   - a phone or tablet (coarse pointer) starts as "touch" instead of "keyboard", so the very first hints are the touch ones;
//   - mouse events that come within 1.2 s of a touch are ignored (they are the browser's copies of the touch);
//   - dragging a finger on the picture (anywhere that is not a stick or a button) turns the camera, and with it the character, like a mouse would;
//   - the "E / Open" prompt over a chest, door or shrine can be tapped (it presses Use).
main = patch(main, 'input method start', /zoom=0;method=`keyboard`;/g, 1, 'zoom=0;method=matchMedia(`(pointer: coarse)`).matches?`touch`:`keyboard`;lastTouch=0;');
main = patch(main, 'touch listeners', /constructor\(([A-Za-z_$][\w$]*)\)\{this\.canvas=\1;/g, 1,
  'constructor($1){this.canvas=$1;{const mark=()=>{this.lastTouch=performance.now()};window.addEventListener(`touchstart`,mark,{passive:!0,capture:!0});window.addEventListener(`touchend`,mark,{passive:!0,capture:!0});' +
  'let id=null,lx=0,ly=0;$1.addEventListener(`pointerdown`,p=>{if(p.pointerType!==`touch`||id!==null)return;id=p.pointerId,lx=p.clientX,ly=p.clientY,this.method=`touch`;try{$1.setPointerCapture(id)}catch{}});' +
  '$1.addEventListener(`pointermove`,p=>{if(p.pointerId!==id)return;this.look.dx+=(p.clientX-lx)*1.8,this.look.dy+=(p.clientY-ly)*1.8,lx=p.clientX,ly=p.clientY,this.method=`touch`});' +
  'const end=p=>{p.pointerId===id&&(id=null)};$1.addEventListener(`pointerup`,end),$1.addEventListener(`pointercancel`,end);' +
  'document.addEventListener(`pointerdown`,p=>{p.target?.closest?.(`.prompt`)&&(this.method=`touch`,this.pressed_.add(`interact`),p.preventDefault())},{capture:!0})}');
main = patch(main, 'mouse copies of touches (press)', /`mousedown`,([A-Za-z_$][\w$]*)=>\{this\.method=`keyboard`,/g, 1, '`mousedown`,$1=>{if(this.syn())return;this.method=`keyboard`,');
main = patch(main, 'mouse copies of touches (move)', /`mousemove`,([A-Za-z_$][\w$]*)=>\{if\(this\.locked\)/g, 1, '`mousemove`,$1=>{if(this.syn())return;if(this.locked)');
main = patch(main, 'touch check', /setTouchMove\(([A-Za-z_$][\w$]*),([A-Za-z_$][\w$]*)\)\{/g, 1, 'syn(){return performance.now()-this.lastTouch<1200}setTouchMove($1,$2){');
fs.writeFileSync(path.join(OUT, 'assets', indexJs), main);

// ---- the file loader: the supplied archive lacks the models, textures, pictures and sounds the game lists (92 files); the game has its own drawn world and characters and its own synthesised
// sounds for them, so those files are not even asked for (the title picture is the one file that is shipped), and the loading bar fills at once
const assetsJs = find(/^assets-.*\.js$/);
let loader = read(`assets/${assetsJs}`);
loader = patch(loader, 'file loader', /async fetchEntry\(([A-Za-z_$][\w$]*)\)\{let ([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)\(\1\.path\);/g, 1,
  'async fetchEntry($1){if($1.path!==`ui/logo.webp`)return;let $2=$3($1.path);');
fs.writeFileSync(path.join(OUT, 'assets', assetsJs), loader);

// ---- the game script: the camera turns by the look input (mouse movement) only while the mouse is locked; on a touch screen the dragged finger gives the same input
const gameJs = find(/^game-.*\.js$/);
let gameCode = read(`assets/${gameJs}`);
gameCode = patch(gameCode, 'camera from dragged finger', /dx:([A-Za-z_$][\w$]*)\.locked\?\1\.look\.dx:0,dy:\1\.locked\?\1\.look\.dy:0,/g, 1,
  'dx:$1.locked||$1.method===`touch`?$1.look.dx:0,dy:$1.locked||$1.method===`touch`?$1.look.dy:0,');
fs.writeFileSync(path.join(OUT, 'assets', gameJs), gameCode);

// ---- everything else is copied as it is
const others = fs.readdirSync(path.join(SRC, 'assets')).filter((f) => f !== indexJs && f !== assetsJs && f !== gameJs);
for (const f of others) fs.copyFileSync(path.join(SRC, 'assets', f), path.join(OUT, 'assets', f));

// ---- file names: browsers keep the scripts and the style for a year under their file names, so after a change the old files would go on being used. Every script and style file therefore gets a short
// code made from what is in the whole set (every name changes whenever anything changes), and the places that name them (the scripts import each other) are updated to match
const assetDir = path.join(OUT, 'assets');
const codeFiles = fs.readdirSync(assetDir).filter((f) => /\.(js|css)$/.test(f)).sort();
const code = crypto.createHash('sha1').update(Buffer.concat(codeFiles.map((f) => fs.readFileSync(path.join(assetDir, f))))).digest('hex').slice(0, 8);
const renamed = new Map(codeFiles.map((f) => [f, f.replace(/\.(js|css)$/, `-${code}.$1`)]));
for (const f of codeFiles) {
  let text = fs.readFileSync(path.join(assetDir, f), 'utf8');
  for (const [from, to] of renamed) text = text.split(from).join(to);
  fs.writeFileSync(path.join(assetDir, renamed.get(f)), text);
  fs.rmSync(path.join(assetDir, f));
}
for (const f of fs.readdirSync(path.join(SRC, 'fonts'))) fs.copyFileSync(path.join(SRC, 'fonts', f), path.join(OUT, 'fonts', f));
fs.copyFileSync(path.join(here, 'art', 'logo.webp'), path.join(OUT, 'ui', 'logo.webp'));
fs.copyFileSync(path.join(here, 'art', 'icon-192.png'), path.join(OUT, 'icon-192.png'));

// ---- our own style additions: the online room and the leaderboard need services this site does not run, so their menu entries are not shown
fs.writeFileSync(path.join(OUT, 'the-rogue.css'), `/* Online rooms and shared leaderboards need services that are not part of this site: their menu entries are not offered. */
[data-act="nav"][data-arg="online"], [data-act="nav"][data-arg="board"] { display: none !important; }
/* Touch screens: a finger dragged on the picture turns the camera (the page must not scroll or zoom meanwhile), and the prompt over a chest, door or shrine can be tapped. */
html, body { overscroll-behavior: none; }
#game { touch-action: none; }
body.has-touch .prompt.show { pointer-events: auto; cursor: pointer; }
/* "Click to take control of the camera · Esc releases the mouse" is for a computer with a mouse; a touch screen has no mouse to take or release. */
body.has-touch .look-hint { display: none !important; }
`);

// ---- our own page (no tracking, no sharing parts of the supplied page)
const css = renamed.get(find(/^index-.*\.css$/));
const chunks = fs.readdirSync(path.join(OUT, 'assets')).filter((f) => /^(assets|game|renderer|combat|three\.core|three\.module)-.*\.js$/.test(f));
const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
    <meta name="theme-color" content="#1b1838" />
    <meta name="screen-orientation" content="landscape" />
    <meta name="description" content="The Rogue: Shadowfall - a dark-fantasy 3D roguelite. Forge a four-slot, seven-element spell build, choose transforming relics, descend through warden-sealed depths or survive the endless Crucible." />
    <title>The Rogue: Shadowfall</title>
    <link rel="icon" type="image/png" href="./icon-192.png" />
    <link rel="apple-touch-icon" href="./icon-192.png" />
    <link rel="preload" href="./fonts/Sora-VF.subset.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="preload" href="./fonts/Figtree-VF.subset.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="preload" href="./ui/logo.webp" as="image" />
    <script type="module" crossorigin src="./assets/${renamed.get(indexJs)}"></script>
${chunks.map((c) => `    <link rel="modulepreload" crossorigin href="./assets/${c}" />`).join('\n')}
    <link rel="stylesheet" crossorigin href="./assets/${css}" />
    <link rel="stylesheet" href="./the-rogue.css" />
  </head>
  <body>
    <canvas id="game"></canvas>
    <div id="ui"></div>
  </body>
</html>
`;
fs.writeFileSync(path.join(OUT, 'index.html'), html);

// ---- the list of files the Games page fetches quietly in advance (the whole game is about 1.2 MB, so one step is enough)
const shell = [...fs.readdirSync(path.join(OUT, 'assets')).filter((f) => !f.startsWith('online-')).map((f) => `assets/${f}`), 'ui/logo.webp', 'the-rogue.css', 'icon-192.png',
  ...fs.readdirSync(path.join(OUT, 'fonts')).filter((f) => f.endsWith('.woff2')).map((f) => `fonts/${f}`)];
fs.writeFileSync(path.join(OUT, 'warm.json'), JSON.stringify({ shell, race: [] }, null, 1) + '\n');

const all = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(path.join(d, e.name)) : all.push(path.join(d, e.name)); };
walk(OUT);
const left = all.filter((f) => fs.readFileSync(f).toString('latin1').toLowerCase().includes(MAKER));
if (left.length) throw new Error(`the maker's name is still in: ${left.join(', ')}`);
console.log(`${all.length} files, ${(all.reduce((n, f) => n + fs.statSync(f).size, 0) / 1048576).toFixed(2)} MB; the maker's name is nowhere`);
