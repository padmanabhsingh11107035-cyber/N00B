// Color Sort (a pouring puzzle on the Games page): the card, the rules (full bottles are capped and locked), the 40 levels (every one is won by the solver here, so none can be stuck, and every colour is exactly 4 units), the ranking messages, the page's files, the headers and the portrait frame.
// Usage: node scripts/supabase/test-color-sort.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(dir, e.name))) : [path.join(dir, e.name)]));
const NAME = new RegExp(['ma', 'nus'].join(''), 'i');   // the maker platform's name is put together here so that this file does not contain it

const GAME = 'public/games/color-sort';
const SRC = '../color-sort';
const types = read('src/components/Games/types.ts');

section('1. On the Games page');
const entry = types.slice(types.indexOf("id: 'color_sort'"), types.indexOf("id: 'critter_kart'"));
check(/title: 'Color Sort'/.test(entry) && /embedUrl: '\/games\/color-sort\/'/.test(entry), 'a card for Color Sort that opens /games/color-sort/');
check(/category: 'puzzle'/.test(entry) && /pointsReward: 0/.test(entry) && /Play for fun/.test(entry) && /ownSound: true/.test(entry) && /isNew: true/.test(entry), 'a puzzle for fun (no points), with its own sounds, marked NEW');
check(/embedPortrait: true/.test(entry) && !/embedLazy/.test(entry), 'it is held upright, and its small page loads at once (not when Play is pressed)');
const posters = [...entry.matchAll(/'(\/game-posters\/color-sort\/[^']+)'/g)].map((m) => m[1]);
check(posters.length === 3 && posters.every((p) => fs.existsSync('public' + p)), `${posters.length} posters, every one is a real file`);
check(types.indexOf("id: 'color_sort'") > 0 && types.indexOf("id: 'color_sort'") < types.indexOf("id: 'critter_kart'"), 'it is the first card (newest first)');
check(!NAME.test(entry) && !/made with/i.test(entry), 'the card does not say where the game was made');

section('2. The frame keeps it upright');
const frame = read('src/components/Games/minigames/HostedGameFrame.tsx'), modal = read('src/components/Games/GamePlayModal.tsx');
check(/portrait\?: boolean/.test(frame) && /const rotated = full && upright && !portrait;/.test(frame), 'a portrait game is never turned on its side');
check(/portrait \? undefined : /.test(frame) && /lock\?\.\('landscape'\)/.test(frame), 'and the screen is not locked sideways for it (the other hosted games still are)');
check(/portrait=\{game\.embedPortrait\}/.test(modal) && /game\.embedControls \?\?/.test(modal), 'the play window passes it on and shows the game\'s own controls line');

section('3. The rules (rules.js, run as the page runs it)');
const rulesSandbox = {}; vm.createContext(rulesSandbox); rulesSandbox.globalThis = rulesSandbox;
vm.runInContext(read(path.join(GAME, 'rules.js')), rulesSandbox);
const R = rulesSandbox.ColorSortRules;
const S = (...bottles) => R.fromLevel(bottles);
check(R.BOTTLE_CAP === 4 && R.capOf === undefined && R.TUBE_CAP === undefined, 'every bottle holds 4 units and there is no big tube any more');
{
  const s = S('0012', '00', '');   // bottle 0 = 0012, 1 = 00, 2 = empty
  check(R.canPour(s, 0, 2) && R.amount(s, 0, 2) === 1, 'the top colour can go into an empty bottle');
  const p = R.pour(s, 0, 2);
  check(JSON.stringify(p[2]) === '[2]' && JSON.stringify(p[0]) === '[0,0,1]' && JSON.stringify(s[0]) === '[0,0,1,2]' && JSON.stringify(s[2]) === '[]', 'a pour makes a new position and leaves the old one as it was');
  check(!R.canPour(s, 0, 1) && R.amount(s, 0, 1) === 0, 'a different colour on top of the target: not allowed');
  check(!R.canPour(s, 0, 0) && !R.canPour(s, 2, 0), 'not into itself, nothing from an empty bottle');
}
{
  const s = S('0011', '21', '');
  check(R.amount(s, 0, 1) === 2 && JSON.stringify(R.pour(s, 0, 1)[1]) === '[2,1,1,1]', 'onto the same colour: the run of it moves together, as much as fits');
  const u = S('0333', '33');
  check(R.amount(u, 0, 1) === 2 && JSON.stringify(R.pour(u, 0, 1)[1]) === '[3,3,3,3]' && JSON.stringify(R.pour(u, 0, 1)[0]) === '[0,3]', 'only what fits goes in; the rest stays where it was');
}
{
  const c = S('1111', '1', '0', '');
  check(R.isCapped(c[0]) && !R.isCapped(c[1]) && !R.isCapped(S('1112')[0]) && !R.isCapped([]), 'a bottle full of one colour is capped; a part-filled or mixed one is not');
  check(R.amount(c, 0, 3) === 0 && !R.canPour(c, 0, 2), 'a capped bottle can not be poured out of (not even into an empty bottle)');
  check(R.amount(c, 1, 0) === 0 && !R.canPour(c, 1, 0), 'and nothing can be poured into it');
  check(R.cappedCount(c) === 1 && R.cappedCount(S('1111', '2222', '0')) === 2, 'the capped bottles are counted');
}
{
  check(!R.isSolved(S('0000', '33', '')) && R.isSolved(S('0000', '3333', '', '')) && !R.isSolved(S('0012', '3333', '')) && R.isSolved([[], []]), 'won means every bottle that holds anything is capped (a half bottle of one colour is not enough)');
  check(R.hasMoves(S('0012', '')) && !R.hasMoves([[0], [1, 2, 3, 1], [2, 3, 1, 2]]) && !R.hasMoves(S('0000', '1111')), 'a position with no pour left is noticed (capped bottles never offer one)');
}

section('4. The 40 levels');
const levelSandbox = { window: {} }; vm.createContext(levelSandbox);
vm.runInContext(read(path.join(GAME, 'levels.js')), levelSandbox);
const levels = levelSandbox.window.COLOR_SORT_LEVELS;
check(Array.isArray(levels) && levels.length === 40, 'there are 40 levels');
const counts = (l) => { const n = {}; for (const b of l) for (const ch of b) n[ch] = (n[ch] || 0) + 1; return n; };
check(levels.every((l) => Object.values(counts(l)).every((n) => n === 4)), 'every colour in every level is exactly 4 units (so each one can fill a bottle)');
check(levels.every((l) => l.every((b) => b === '' || b.length === 4)), 'every bottle is full or empty at the start');
check(levels.every((l) => { const colours = Object.keys(counts(l)).length, empties = l.filter((b) => !b).length; return l.length === colours + empties && (empties === 1 || empties === 2); }), 'one bottle per colour plus one or two empty ones');
check(levels.every((l) => Object.keys(counts(l)).every((ch) => ch.charCodeAt(0) >= 48 && ch.charCodeAt(0) < 48 + 16)), 'at most 16 colours');
check(levels[0].length === 5 && Math.max(...levels.map((l) => l.length)) === 16, 'they start with 3 colours and grow up to 14 colours (16 bottles)');
check(levels.every((l) => !l.some((b) => b && R.isCapped(R.fromLevel([b])[0]))), 'no bottle is finished before the first pour');
check(levels.every((l) => !R.isSolved(R.fromLevel(l))), 'no level starts solved');
const { solve, replay } = await import(pathToFileURL(path.resolve(SRC, 'solver.mjs')).href);
let unsolved = [], longest = 0, shortest = 999;
levels.forEach((l, i) => {
  const s = R.fromLevel(l);
  const moves = solve(s, 60000, 8000);
  if (!moves || !replay(s, moves)) unsolved.push(i + 1); else { longest = Math.max(longest, moves.length); shortest = Math.min(shortest, moves.length); }
});
check(unsolved.length === 0, `the solver wins every level, with the capping rules (shortest ${shortest} pours, longest ${longest})`, 'not solved: ' + unsolved.join(','));
check(shortest >= 5, 'none of them is solved in a few pours');

section('5. The page and its files');
const html = read(path.join(GAME, 'index.html')), css = read(path.join(GAME, 'game.css')), js = read(path.join(GAME, 'game.js'));
for (const f of ['index.html', 'game.css', 'game.js', 'rules.js', 'levels.js']) check(fs.existsSync(path.join(GAME, f)), f);
check(/<script src="\.\/rules\.js\?v=2"><\/script>\s*<script src="\.\/levels\.js\?v=2"><\/script>\s*<script src="\.\/game\.js\?v=2"><\/script>/.test(html) && /href="\.\/game\.css\?v=2"/.test(html), 'the page loads the rules, the levels, then the game (with a version number)');
check(!/<script>[^<]/.test(html) && !/\son[a-z]+=/.test(html), 'no script is written inside the page (the security policy does not allow it)');
check(/background: #fff;/.test(css) && /theme-color" content="#ffffff"/.test(html), 'a white page');
check(/<title>Color Sort<\/title>/.test(html) && !/og:|twitter:/.test(html), 'a plain title, no share information');
check(/window\.ColorSortRules/.test(js) && /pointerdown/.test(js) && /prefers-reduced-motion/.test(js) && /window\.setTimeout\(finish, ms \+ 250\)/.test(js), 'the game uses the rules, answers a touch at once, respects reduced motion and always finishes an animation');
check(/noob_colorsort_level2/.test(js) && /function read\(key\) \{ try/.test(js) && /function write\(key, value\) \{ try/.test(js), 'saved things (level, sound) never break the game if storage is blocked');
check(!/fetch\(|XMLHttpRequest|WebSocket|sendBeacon|window\.top|eval\(|new Function/.test(js + read(path.join(GAME, 'rules.js'))), 'it talks to no server and runs no made-up code');
check(/postMessage\(msg, window\.location\.origin\)/.test(js) && (js.match(/postMessage\(/g) || []).length === 1 && /e\.source !== window\.parent \|\| e\.origin !== window\.location\.origin/.test(js), 'its one message goes only to its own page on this site, and it only listens to that page');
check(!/innerHTML/.test(js.slice(js.indexOf('ranking: the page around'))) && /textContent = String\(r\.displayName/.test(js) && /sameSiteImage/.test(js), 'names on the board are put in as plain text, and pictures only if they come from this site');
check(!/https?:\/\/(?!www\.w3\.org)/.test(html + js + css), 'it links to no other website');
const total = fs.readdirSync(GAME).reduce((n, f) => n + fs.statSync(path.join(GAME, f)).size, 0);
check(total < 90 * 1024, `all of it is ${Math.round(total / 1024)} KB: nothing big to wait for`);

section('6. Nothing says where it came from');
const bad = [];
for (const f of [...walk(GAME), ...walk(SRC), 'scripts/supabase/test-color-sort.mjs', 'src/components/Games/types.ts', 'public/_headers']) if (NAME.test(fs.readFileSync(f).toString('latin1'))) bad.push(f);
check(bad.length === 0, 'no served file, no source file and no code of the app names the maker platform', bad.join(', '));
check(!/magic sort/i.test(html + js + css + entry + read(path.join(SRC, 'README.md'))), 'it does not borrow the name of the game it was modelled on');

section('7. Headers');
const headers = read('public/_headers');
const block = headers.slice(headers.indexOf('/games/color-sort/*'), headers.indexOf('/games/color-sort/index.html'));
check(/X-Frame-Options: SAMEORIGIN/.test(block) && /frame-ancestors 'self'/.test(block), 'only this site can show it in a frame');
check(/script-src 'self';/.test(block) && !/unsafe-eval|wasm/.test(block) && /connect-src 'self';/.test(block) && /object-src 'none'/.test(block), 'its own scripts only, no eval, no WebAssembly, no network, no plug-ins');
check(/\/games\/color-sort\/index\.html\n  Cache-Control: no-cache/.test(headers) && ['game.js', 'rules.js', 'levels.js', 'game.css'].every((f) => new RegExp('/games/color-sort/' + f.replace('.', '\\.') + '\\n  Cache-Control: public, max-age=31536000, immutable').test(headers)), 'the page is asked for again every time, the versioned files are kept for a year');

section('8. The tools are in the repository');
for (const f of ['solver.mjs', 'generate-levels.mjs', 'README.md']) check(fs.existsSync(path.join(SRC, f)), 'color-sort/' + f);
check(/node generate-levels\.mjs/.test(read(path.join(SRC, 'README.md'))), 'with the way to make the levels again');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
