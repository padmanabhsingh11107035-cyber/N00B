// Color Sort (a pouring puzzle on the Games page): the card, the rules, the 30 levels (every one is won by the solver here, so none can be stuck), the page's files, the headers and the portrait frame.
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
const S = (...bottles) => R.fromLevel(bottles);   // container 0 is the tube
check(R.BOTTLE_CAP === 4 && R.TUBE_CAP === 10 && R.capOf(0) === 10 && R.capOf(3) === 4, 'a bottle holds 4 units, the big tube 10');
{
  const s = S('0012', '00', '');   // 0 = the tube, 1 = 0012, 2 = 00, 3 = an empty bottle
  check(R.canPour(s, 1, 3) && R.amount(s, 1, 3) === 1, 'the top colour can go into an empty bottle');
  const p = R.pour(s, 1, 3);
  check(JSON.stringify(p[3]) === '[2]' && JSON.stringify(p[1]) === '[0,0,1]' && JSON.stringify(s[1]) === '[0,0,1,2]' && JSON.stringify(s[3]) === '[]', 'a pour makes a new position and leaves the old one as it was');
  check(!R.canPour(s, 1, 2) && R.amount(s, 1, 2) === 0, 'a different colour on top of the target: not allowed');
  check(!R.canPour(s, 1, 1) && !R.canPour(s, 3, 1), 'not into itself, nothing from an empty container');
  check(R.canPour(s, 1, 0) && R.canPour(s, 2, 0), 'the empty tube takes anything');
}
{
  const s = S('0011', '21');
  check(R.amount(s, 1, 2) === 2 && JSON.stringify(R.pour(s, 1, 2)[2]) === '[2,1,1,1]' && JSON.stringify(R.pour(s, 1, 2)[1]) === '[0,0]', 'onto the same colour: the whole run of it moves together');
  const t = S('111', '001');
  check(R.amount(t, 1, 2) === 1 && JSON.stringify(R.pour(t, 1, 2)[2]) === '[0,0,1,1]' && JSON.stringify(R.pour(t, 1, 2)[1]) === '[1,1]', 'only what fits goes in; the rest stays where it was');
  const full = S('1111', '1');
  check(R.amount(full, 2, 1) === 0 && !R.canPour(full, 2, 1), 'a full bottle takes nothing');
}
{
  const big = [[0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0]];   // a tube with 9 units and a bottle with 3 of the same colour
  check(R.amount(big, 1, 0) === 1 && R.pour(big, 1, 0)[0].length === 10 && R.pour(big, 1, 0)[1].length === 2, 'the tube takes up to 10 units');
}
{
  check(!R.isSolved(S('0012', '3')) && R.isSolved(S('0000', '33', '')) && R.isSolved([[2, 2, 2], [], [1]]) && !R.isSolved([[2, 1], [], [1]]), 'solved means no container holds two colours (the tube counts too)');
  check(R.hasMoves(S('0012', '')) && !R.hasMoves([[0], [1, 2, 3, 1], [2, 3, 1, 2]]), 'a position with no pour left is noticed');
}

section('4. The 30 levels');
const levelSandbox = { window: {} }; vm.createContext(levelSandbox);
vm.runInContext(read(path.join(GAME, 'levels.js')), levelSandbox);
const levels = levelSandbox.window.COLOR_SORT_LEVELS;
check(Array.isArray(levels) && levels.length === 30, 'there are 30 levels');
check(levels.every((l) => l.every((b) => /^[0-5]{0,4}$/.test(b))), 'every bottle is up to four units of the six colours');
check(levels.every((l) => l.filter((b) => b.length).every((b) => b.length === 4)), 'every bottle that has liquid in it is full (like the game this was modelled on)');
const sizes = levels.map((l) => l.length);
check(sizes[0] <= 6 && Math.max(...sizes) <= 24 && levels.some((l) => l.length === 24), 'they start small and grow up to the full board of 24 bottles');
check(sizes.slice(0, 12).join() === '6,8,8,10,12,12,14,16,18,20,22,24', 'the first twelve grow one step at a time', sizes.slice(0, 12).join());
check(levels.every((l) => !R.isSolved(R.fromLevel(l))), 'no level starts solved');
const { solve, replay } = await import(pathToFileURL(path.resolve(SRC, 'solver.mjs')).href);
let unsolved = [], longest = 0, shortest = 999;
levels.forEach((l, i) => {
  const s = R.fromLevel(l);
  const moves = solve(s, 60000, 8000);
  if (!moves || !replay(s, moves)) unsolved.push(i + 1); else { longest = Math.max(longest, moves.length); shortest = Math.min(shortest, moves.length); }
});
check(unsolved.length === 0, `the solver wins every level (shortest ${shortest} pours, longest ${longest})`, 'not solved: ' + unsolved.join(','));
check(shortest >= 10, 'none of them is solved in a few pours');

section('5. The page and its files');
const html = read(path.join(GAME, 'index.html')), css = read(path.join(GAME, 'game.css')), js = read(path.join(GAME, 'game.js'));
for (const f of ['index.html', 'game.css', 'game.js', 'rules.js', 'levels.js']) check(fs.existsSync(path.join(GAME, f)), f);
check(/<script src="\.\/rules\.js\?v=1"><\/script>\s*<script src="\.\/levels\.js\?v=1"><\/script>\s*<script src="\.\/game\.js\?v=1"><\/script>/.test(html) && /href="\.\/game\.css\?v=1"/.test(html), 'the page loads the rules, the levels, then the game (with a version number)');
check(!/<script>[^<]/.test(html) && !/\son[a-z]+=/.test(html), 'no script is written inside the page (the security policy does not allow it)');
check(/background: #fff;/.test(css) && /theme-color" content="#ffffff"/.test(html), 'a white page');
check(/<title>Color Sort<\/title>/.test(html) && !/og:|twitter:/.test(html), 'a plain title, no share information');
check(/window\.ColorSortRules/.test(js) && /pointerdown/.test(js) && /prefers-reduced-motion/.test(js) && /window\.setTimeout\(finish, ms \+ 250\)/.test(js), 'the game uses the rules, answers a touch at once, respects reduced motion and always finishes an animation');
check(/function read\(key\) \{ try/.test(js) && /function write\(key, value\) \{ try/.test(js), 'saved things (level, sound) never break the game if storage is blocked');
check(!/fetch\(|XMLHttpRequest|WebSocket|sendBeacon|postMessage|window\.top|window\.parent|eval\(|new Function/.test(js + read(path.join(GAME, 'rules.js'))), 'it talks to no server, to nobody outside, and runs no made-up code');
check(!/https?:\/\/(?!www\.w3\.org)/.test(html + js + css), 'it links to no other website');
const total = fs.readdirSync(GAME).reduce((n, f) => n + fs.statSync(path.join(GAME, f)).size, 0);
check(total < 80 * 1024, `all of it is ${Math.round(total / 1024)} KB: nothing big to wait for`);

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
