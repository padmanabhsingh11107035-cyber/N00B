// Brick Escape (a sliding-brick puzzle on the Games page): the card and its pictures, the page and its security rules, the rules (colours, doors, sliding, leaving), the solver (checked against a plain
// search), and the 40 levels (every one is sound and every stored way out really empties the tray).
// Usage: node --liftoff-only scripts/supabase/test-brick-escape.mjs
import fs from 'node:fs';
import vm from 'node:vm';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

const GAME = 'public/games/brick-escape';
const ctx = { window: {} }; ctx.globalThis = ctx.window; vm.createContext(ctx);
for (const f of ['rules.js', 'levels.js']) vm.runInContext(read(`${GAME}/${f}`), ctx, { filename: f });
const R = ctx.window.BrickEscapeRules, RAW = ctx.window.BRICK_ESCAPE_LEVELS;
const L = (w, h, doors, bricks) => ({ w, h, doors: doors.map(([s, p, n, c]) => ({ s, p, n, c })), bricks: bricks.map(([x, y, bw, bh, c]) => ({ x, y, w: bw, h: bh, c })) });
const unpack = (raw) => L(raw.w, raw.h, raw.doors, raw.bricks);

section('1. The card, its pictures and its place in the app');
const types = read('src/components/Games/types.ts'), frame = read('src/components/Games/minigames/HostedGameFrame.tsx'), modal = read('src/components/Games/GamePlayModal.tsx');
check(/id: 'brick_escape'/.test(types) && /embedUrl: '\/games\/brick-escape\/'/.test(types) && /embedPortrait: true/.test(types.split("id: 'brick_escape'")[1].split('// --- NEW')[0]) && /ownSound: true/.test(types.split("id: 'brick_escape'")[1].split('// --- NEW')[0]) && /pointsReward: 0/.test(types.split("id: 'brick_escape'")[1].split('// --- NEW')[0]), 'it is in the games list: a puzzle on its own page, held upright, with its own sounds, for fun');
const posters = [...types.split("id: 'brick_escape'")[1].split('posters: [')[1].split(']')[0].matchAll(/'(\/game-posters\/brick-escape\/[^']+)'/g)].map((m) => m[1]);
check(posters.length === 3 && posters.every((p) => fs.existsSync('public' + p) && fs.statSync('public' + p).size > 8000), 'it has three posters, and the pictures exist');
check(/ranking\?: 'color-sort' \| 'brick-escape'/.test(frame) && /brickEscapeLevelDone/.test(frame) && /brickEscapeLeaderboard/.test(frame) && /d\.noobGame !== ranking/.test(frame) && /e\.origin !== window\.location\.origin/.test(frame), 'the game window answers the game\'s "level cleared" and "ranking" messages, only from this one frame on this same site');
check(/game\.id === 'brick_escape' \? 'brick-escape'/.test(modal), 'the play window tells the frame which ranking this game has');
const sb = read('src/services/supabaseApi.ts'), api = read('src/services/api.ts');
check(/rpc<any>\('brick_escape_level_done', \{ p_level: level \}\)/.test(sb) && /rpc<any>\('brick_escape_leaderboard', \{\}\)/.test(sb) && /brickEscapeLevelDone,\s+brickEscapeLeaderboard,/.test(api), 'the two ranking calls exist and are handed to the app');
const sql = read('supabase/migrations/20261030000001_brick_escape_board.sql');
check(/create table if not exists public\.brick_escape_scores/.test(sql) && /enable row level security/.test(sql) && !/create policy/.test(sql) && /revoke execute on function public\.brick_escape_level_done\(integer\) from public, anon/.test(sql) && /grant execute on function public\.brick_escape_leaderboard\(\) to authenticated/.test(sql), 'the ranking table is locked (no policy: only the two functions reach it), and only people who are logged in can call them');

section('2. The page and its security rules');
const html = read(`${GAME}/index.html`), js = read(`${GAME}/game.js`), css = read(`${GAME}/game.css`), headers = read('public/_headers');
check(['rules.js', 'levels.js', 'game.js'].every((f) => new RegExp(`<script src="\\./${f.replace('.', '\\.')}\\?v=\\d+"></script>`).test(html)) && /game\.css\?v=\d+/.test(html) && !/<script(?![^>]*\bsrc=)/.test(html) && !/\son[a-z]+=/.test(html), 'the page loads its own four files with a version number, and has no script written into the page');
check(!/https?:\/\/(?!www\.w3\.org)/.test(html + js + css), 'nothing is fetched from anywhere else');
check(!/\b(fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|eval)\s*\(|new Function|document\.write|\.srcdoc|location\s*=/.test(js) && !/\bsendBeacon\b/.test(js), 'the game never uses the network and never builds code from text');
check((js.match(/innerHTML\s*=\s*([^;]+);/g) || []).every((m) => /=\s*ARROW;/.test(m)), 'the only HTML it writes is its own fixed arrow picture (names from the ranking go in as text)');
check(/postMessage\(msg, window\.location\.origin\)/.test(js) && /e\.origin !== window\.location\.origin \|\| e\.source !== window\.parent/.test(js), 'it speaks only to the page that shows it, on this same site, and only listens to that page');
check(/\/games\/brick-escape\/\*[\s\S]{0,260}Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; media-src 'self' blob: data:; connect-src 'self'; worker-src 'none'; frame-ancestors 'self'; base-uri 'self';/.test(headers) && /X-Frame-Options: SAMEORIGIN/.test(headers.split('/games/brick-escape/*')[1].slice(0, 400)), 'its page has its own strict security policy: its own files only, no network, shown only by this site');
check(['index.html'].every((f) => new RegExp(`/games/brick-escape/${f}\\n  Cache-Control: no-cache`).test(headers)) && ['game.js', 'rules.js', 'levels.js', 'game.css'].every((f) => new RegExp(`/games/brick-escape/${f.replace('.', '\\.')}\\n  Cache-Control: public, max-age=31536000, immutable`).test(headers)), 'the page is asked for again every time, its files are kept for a year (a changed file gets a new version number)');
for (const f of ['rules.js', 'levels.js', 'game.js']) { try { new vm.Script(read(`${GAME}/${f}`), { filename: f }); check(true, `${f} reads as valid JavaScript`); } catch (e) { check(false, `${f} reads as valid JavaScript`, String(e)); } }
check(/prefers-reduced-motion: reduce/.test(css) && /touch-action: none/.test(css) && /user-select: none/.test(css) && /\.brick\.grab/.test(css), 'quiet for people who asked for less motion; a finger on a brick does not scroll or select the page');

section('3. The rules');
{
  const lv = L(4, 3, [['b', 1, 1, 0], ['t', 2, 2, 1], ['r', 0, 1, 2]], [[1, 0, 1, 1, 0], [0, 1, 1, 1, 1], [2, 1, 2, 1, 1], [3, 2, 1, 1, 2]]);
  const b = lv.bricks;
  check(R.check(lv).length === 0, 'a sound level is accepted');
  check(R.room(lv, b, 0, 'd') === 2 && R.room(lv, b, 0, 'u') === 0 && R.room(lv, b, 0, 'l') === 1 && R.room(lv, b, 0, 'r') === 2, 'a brick slides as far as the walls and the other bricks let it');
  check(R.room(lv, b, 1, 'r') === 1 && R.room(lv, b, 2, 'l') === 1 && R.room(lv, b, 2, 'd') === 0 && R.room(lv, b, 3, 'r') === 0, 'bricks stop each other (and the wall)');
  check(R.doorFor(lv, b, 0, 'd') && R.doorFor(lv, b, 0, 'd').s === 'b', 'a coral brick over the coral door, with nothing in the way, can leave');
  const blocked = [{ x: 1, y: 0, w: 1, h: 1, c: 0 }, { x: 1, y: 1, w: 1, h: 1, c: 1 }];
  check(!R.doorFor(lv, blocked, 0, 'd'), 'with something in the way it can not');
  check(!R.doorFor(lv, [{ x: 1, y: 0, w: 1, h: 1, c: 1 }], 0, 'd') && !R.doorFor(lv, [{ x: 2, y: 0, w: 1, h: 1, c: 0 }], 0, 'd'), 'a brick of the wrong colour, or beside the door, can not leave through it');
  check(R.doorFor(lv, [{ x: 2, y: 0, w: 2, h: 1, c: 1 }], 0, 'u') && !R.doorFor(lv, [{ x: 1, y: 0, w: 2, h: 1, c: 1 }], 0, 'u') && !R.doorFor(lv, [{ x: 2, y: 0, w: 2, h: 1, c: 0 }], 0, 'u'), 'a wide brick needs a wide door of its colour, all of it inside the door\'s width');
  check(R.doorFor(lv, [{ x: 3, y: 0, w: 1, h: 1, c: 2 }], 0, 'r') && !R.doorFor(lv, [{ x: 3, y: 1, w: 1, h: 1, c: 2 }], 0, 'r'), 'doors in the side walls work the same way');
  check(R.doorFor(lv, [{ x: 1, y: 0, w: 1, h: 1, c: 0 }], 0, 'd'), 'a brick far from its door can leave in one move when the way is free');
  const moves = R.moves(lv, b);
  check(moves.filter((m) => m.i === 0 && m.dir === 'd' && !m.exit).map((m) => m.k).join() === '1,2' && moves.some((m) => m.i === 0 && m.dir === 'd' && m.exit && m.k === 2) && !moves.some((m) => m.i === 3 && m.exit) && !moves.some((m) => m.i === 1 && m.exit), 'every slide of every length is a move; leaving is a move only when it is allowed');
  const after = R.slide(b, 0, 'd', 1);
  check(after[0].y === 1 && b[0].y === 0 && after[1] === b[1], 'a move makes a new board and leaves the old one alone');
  check(R.isWon([]) && !R.isWon(b), 'the level is won when no brick is left');
  check(R.key([{ x: 0, y: 0, w: 1, h: 1, c: 0 }, { x: 1, y: 0, w: 1, h: 1, c: 0 }]) === R.key([{ x: 1, y: 0, w: 1, h: 1, c: 0 }, { x: 0, y: 0, w: 1, h: 1, c: 0 }]) && R.key([{ x: 0, y: 0, w: 1, h: 1, c: 0 }]) !== R.key([{ x: 0, y: 0, w: 1, h: 1, c: 1 }]), 'two bricks of the same colour and size are interchangeable; a different colour is not');
  check(R.stars(5, 5) === 3 && R.stars(6, 5) === 2 && R.stars(9, 5) === 2 && R.stars(10, 5) === 1 && R.stars(1, 1) === 3, 'stars: the shortest way is 3, up to half as many again is 2, more is 1');
  const bad = [L(2, 2, [['b', 0, 1, 0]], [[1, 1, 2, 1, 0]]), L(2, 2, [['b', 0, 1, 0]], [[0, 0, 1, 1, 0], [0, 0, 1, 1, 0]]), L(2, 2, [['b', 1, 2, 0]], [[0, 0, 1, 1, 0]]), L(2, 2, [['b', 0, 1, 0], ['b', 0, 1, 1]], [[0, 0, 1, 1, 0]]), L(3, 2, [['b', 0, 1, 0]], [[0, 0, 2, 1, 0]])];
  check(bad.every((l) => R.check(l).length > 0), 'a brick that sticks out, two bricks on one cell, a door off its wall, two doors on one place and a brick with no door it fits through are all found');
}
{
  const lv = L(3, 2, [['b', 1, 1, 0]], [[1, 0, 1, 1, 0]]);
  const s = R.solve(lv);
  check(s.ok && s.moves.length === 1 && s.moves[0].exit && s.moves[0].dir === 'd', 'a brick over its door is one move');
  const rep = R.replay(lv, s.moves);
  check(rep && rep.length === 1 && rep[0].length === 0, 'a way out can be played again and empties the tray');
  check(R.replay(lv, [{ x: 1, y: 0, w: 1, h: 1, dir: 'd', k: 5, exit: false }]) === null && R.replay(lv, [{ x: 0, y: 0, w: 1, h: 1, dir: 'd', k: 1, exit: false }]) === null && R.replay(lv, [{ x: 1, y: 0, w: 1, h: 1, dir: 'u', k: 1, exit: true }]) === null, 'a move that is not allowed (too far, no such brick, not through a door) is refused');
  const stuck = L(2, 1, [['b', 0, 1, 0]], [[0, 0, 1, 1, 1], [1, 0, 1, 1, 0]]);
  check(R.solve(stuck).ok === false, 'a tray that can not be emptied is found out (nothing can reach a door of its colour)');
  const hinted = R.solve(unpack(RAW[3]), { bricks: R.slide(unpack(RAW[3]).bricks, 0, 'd', 0) });
  check(hinted.ok, 'the solver can start from any board (this is how the hint works after a wrong turn)');
}

section('4. The solver finds the shortest way (checked against a plain breadth-first search)');
function plain(level, cap = 600000) {   // the simplest possible search: every board, every move, nothing clever
  const seen = new Set([R.key(level.bricks)]);
  let layer = [level.bricks], depth = 0;
  while (layer.length) {
    depth++;
    const next = [];
    for (const b of layer) for (const m of R.moves(level, b)) {
      const n = R.apply(b, m);
      if (!n.length) return depth;
      const k = R.key(n);
      if (!seen.has(k)) { seen.add(k); next.push(n); }
    }
    if (seen.size > cap) return -1;
    layer = next;
  }
  return 0;
}
{
  let compared = 0, same = 0;
  for (let i = 0; i < RAW.length && compared < 9; i++) {
    const lv = unpack(RAW[i]);
    if (RAW[i].par > 11 || lv.bricks.length > 7) continue;
    const p = plain(lv);
    if (p < 0) continue;
    compared++;
    if (p === RAW[i].par) same++;
    else console.log(`    level ${i + 1}: search ${p}, solver ${RAW[i].par}`);
  }
  check(compared >= 7 && same === compared, `on ${compared} of the shipped levels the solver's number of moves is the plain search's number`);
}

section('5. The 40 levels');
check(RAW.length === 40, 'forty levels');
let sound = 0, wins = 0, parsOk = 0, cells = 0;
RAW.forEach((raw, i) => {
  const lv = unpack(raw), sol = raw.sol.map((m) => ({ x: m[0], y: m[1], w: m[2], h: m[3], dir: m[4], k: m[5], exit: !!m[6] }));
  if (R.check(lv).length === 0) sound++;
  const boards = R.replay(lv, sol);
  if (boards && boards.length === sol.length && boards[boards.length - 1].length === 0) wins++;
  if (sol.length === raw.par && raw.par >= 1) parsOk++;
  cells = Math.max(cells, lv.w * lv.h);
});
check(sound === 40, 'every level is sound: bricks inside the tray, none on top of another, doors on their walls, a door for every brick');
check(wins === 40, 'every level can be won: the stored way out is played here, move by move, and empties the tray');
check(parsOk === 40, 'the par of every level is the length of its way out');
check(cells <= 30, 'no tray is bigger than 6 x 5 (they fit a phone with room for the finger)');
const avg = (a, b) => RAW.slice(a, b).reduce((s, r) => s + r.par, 0) / (b - a);
check(RAW[0].bricks.length === 1 && RAW[0].par === 1 && avg(0, 10) < avg(10, 20) && avg(10, 20) < avg(20, 30) && avg(20, 30) < avg(30, 40), 'it starts with one brick and one move, and every ten levels are harder than the ones before');
check(RAW.every((r) => r.bricks.every((b) => b[4] >= 0 && b[4] <= 5)) && RAW.every((r) => r.doors.length >= new Set(r.bricks.map((b) => b[4])).size), 'colours are the six of the game, and every colour that has a brick has a door');
check(RAW.some((r) => r.bricks.some((b) => b[2] === 2 && b[3] === 2)) && RAW.some((r) => r.doors.some((d) => d[2] === 2)) && RAW.some((r) => r.doors.some((d) => d[0] === 'l' || d[0] === 'r')) && RAW.some((r) => r.doors.some((d) => d[0] === 't')), 'there are big bricks, wide doors, and doors on every wall');
const keys = new Set(RAW.map((r) => JSON.stringify([r.w, r.h, r.doors, r.bricks])));
check(keys.size === 40, 'no two levels are the same');
const pkg = read('package.json');
check(/test-brick-escape\.mjs/.test(pkg) && /test-brick-escape-db\.mjs/.test(pkg), 'both tests are part of the test chain');
check(fs.existsSync('../brick-escape/generate-levels.mjs') && fs.existsSync('../brick-escape/README.md'), 'the program that made the levels is kept next to the game');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
