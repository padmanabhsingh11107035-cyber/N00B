// Makes the levels of Brick Escape: boards are built BACKWARDS (bricks are put in through their doors and shuffled with legal slides), so every level can be won; then the solver finds
// the shortest way (the "par") and the level is kept only when that way is the right length. Writes instagram/public/games/brick-escape/levels.js.
//   node generate-levels.mjs            (a few minutes; the result does not change between runs: the random numbers are seeded)
//   node generate-levels.mjs 12 20      (only levels 12 to 20, printed, nothing written: to try the settings)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../instagram/public/games/brick-escape/rules.js';

const R = globalThis.BrickEscapeRules;
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../instagram/public/games/brick-escape/levels.js');
const COUNT = 40;

function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// The first levels are made by hand: they teach one thing each (colours match doors, something may be in the way, a big brick needs a wide door, a full tray).
// colours: 0 coral, 1 cream, 2 sun, 3 sky, 4 mint, 5 violet. doors: [side, cell, width, colour]; bricks: [x, y, w, h, colour]
const HAND = [
  { w: 3, h: 2, doors: [['b', 1, 1, 0]], bricks: [[1, 0, 1, 1, 0]] },
  { w: 3, h: 3, doors: [['b', 0, 1, 0], ['t', 2, 1, 1]], bricks: [[0, 1, 1, 1, 0], [2, 1, 1, 1, 1]] },
  { w: 3, h: 3, doors: [['b', 1, 1, 0], ['l', 2, 1, 1]], bricks: [[1, 0, 1, 1, 0], [1, 1, 1, 1, 1], [0, 2, 1, 1, 1]] }
];

/** the settings of a made level (4 to 40): bigger trays, more colours, big bricks and longer ways out as the number goes up (par: the fewest moves the solver finds) */
const TIERS = [
  { from: 5, w: 4, h: 3, colors: 2, wide: 0, doorsPerColor: 2, bricks: [4, 9], bars: false },
  { from: 11, w: 5, h: 4, colors: 3, wide: 1, doorsPerColor: 2, bricks: [8, 15], bars: true },
  { from: 21, w: 5, h: 5, colors: 4, wide: 1, doorsPerColor: 2, bricks: [10, 19], bars: true },
  { from: 31, w: 6, h: 5, colors: 5, wide: 2, doorsPerColor: 2, bricks: [12, 22], bars: true }
];
function spec(n) {
  const goal = Math.round(3 + (n - 5) * 26 / 35);
  if (n === 4) return { n, w: 4, h: 3, colors: 3, wide: 1, doorsPerColor: 1, bricks: 5, lo: 5, hi: 8, goal: 7, bars: false };   // the first big brick: it needs a wide door of its colour
  let ti = 0;
  TIERS.forEach((t, k) => { if (n >= t.from) ti = k; });
  const t = TIERS[ti], next = TIERS[ti + 1] ? TIERS[ti + 1].from : 41, at = (n - t.from) / Math.max(1, next - t.from - 1);
  return { n, w: t.w, h: t.h, colors: t.colors, wide: t.wide, doorsPerColor: t.doorsPerColor, bricks: Math.round(t.bricks[0] + at * (t.bricks[1] - t.bricks[0])), lo: Math.max(2, goal - 2), hi: goal + 5, goal, bars: t.bars };
}

function makeDoors(rnd, s) {
  const doors = [], used = new Set();
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  for (let c = 0; c < s.colors; c++) {
    const wideColor = c >= s.colors - s.wide;
    const count = c === 0 ? 1 : s.doorsPerColor;
    for (let j = 0; j < count; j++) {
      for (let tries = 0; tries < 80; tries++) {
        const side = pick(['t', 'b', 'l', 'r', 'b', 't']);
        const len = side === 't' || side === 'b' ? s.w : s.h, n = wideColor && j === 0 ? 2 : 1;
        if (n > len) continue;
        const p = Math.floor(rnd() * (len - n + 1));
        let ok = true;
        for (let k = 0; k < n; k++) if (used.has(side + (p + k))) ok = false;
        if (!ok) continue;
        for (let k = 0; k < n; k++) used.add(side + (p + k));
        doors.push({ s: side, p, n, c });
        break;
      }
    }
  }
  return doors;
}

function shapesFor(s, wide) {
  const list = [{ w: 1, h: 1 }, { w: 1, h: 1 }, { w: 1, h: 1 }];
  if (s.bars) list.push({ w: 1, h: 2 }, { w: 2, h: 1 });
  if (wide) list.push({ w: 2, h: 2 }, { w: 2, h: 1 }, { w: 1, h: 2 });
  return list;
}

function build(s, seed) {
  const rnd = rng(seed), pickOf = (list) => list[Math.floor(rnd() * list.length)];
  const level = { w: s.w, h: s.h, doors: makeDoors(rnd, s), bricks: [] };
  for (let c = 0; c < s.colors; c++) if (!level.doors.some((d) => d.c === c)) return null;
  const doorWide = (c) => level.doors.some((d) => d.c === c && d.n >= 2);
  let bricks = [];
  const area = s.w * s.h;
  const occupied = () => bricks.reduce((a, b) => a + b.w * b.h, 0);
  const shuffle = (times) => {
    for (let t = 0; t < times; t++) {
      if (!bricks.length) return;
      const i = Math.floor(rnd() * bricks.length), dirs = R.DIRS.filter((d) => R.room(level, bricks, i, d) > 0);
      if (!dirs.length) continue;
      const dir = pickOf(dirs), r = R.room(level, bricks, i, dir);
      bricks = R.slide(bricks, i, dir, 1 + Math.floor(rnd() * r));
    }
  };
  const insert = (c) => {
    const ds = level.doors.filter((d) => d.c === c), d = pickOf(ds);
    const fits = shapesFor(s, doorWide(c)).filter((sh) => (d.s === 't' || d.s === 'b' ? sh.w <= d.n : sh.h <= d.n));
    if (!fits.length) return false;
    const sh = pickOf(fits);
    let x, y;
    if (d.s === 't' || d.s === 'b') { x = d.p + Math.floor(rnd() * (d.n - sh.w + 1)); y = d.s === 't' ? 0 : s.h - sh.h; }
    else { y = d.p + Math.floor(rnd() * (d.n - sh.h + 1)); x = d.s === 'l' ? 0 : s.w - sh.w; }
    if (x < 0 || y < 0 || x + sh.w > s.w || y + sh.h > s.h) return false;
    const g = R.grid(level, bricks);
    for (let yy = y; yy < y + sh.h; yy++) for (let xx = x; xx < x + sh.w; xx++) if (g[yy * s.w + xx] !== -1) return false;
    bricks = bricks.concat([{ x, y, w: sh.w, h: sh.h, c }]);
    return true;
  };
  let colorTurn = 0;
  for (let tries = 0; tries < 3000 && bricks.length < s.bricks && area - occupied() > 2; tries++) {
    const c = rnd() < 0.55 ? colorTurn++ % s.colors : Math.floor(rnd() * s.colors);
    if (insert(c)) shuffle(2 + Math.floor(rnd() * 5)); else shuffle(3);
  }
  shuffle(40 + Math.floor(rnd() * 30));
  if (bricks.length < 4) return null;
  for (let c = 0; c < s.colors; c++) if (!bricks.some((b) => b.c === c)) return null;
  level.bricks = bricks;
  return level;
}

const pack = (l, sol) => ({
  w: l.w, h: l.h,
  doors: l.doors.map((d) => [d.s, d.p, d.n, d.c]),
  bricks: l.bricks.map((b) => [b.x, b.y, b.w, b.h, b.c]),
  par: sol.moves.length,
  sol: sol.moves.map((m) => [m.x, m.y, m.w, m.h, m.dir, m.k, m.exit ? 1 : 0])
});

if (process.env.PROBE) {   // what do made boards look like for this level number? (node: PROBE=1 node generate-levels.mjs 8)
  const n = Number(process.argv[2]), sp = spec(n);
  console.log(JSON.stringify(sp));
  for (let seed = n * 1000; seed < n * 1000 + 14; seed++) {
    const level = build(sp, seed);
    if (!level) { console.log(seed, 'no board'); continue; }
    const t0 = Date.now(), sol = R.solve(level, { cap: 200000, ms: 3000 });
    console.log(seed, level.bricks.length + ' bricks', 'doors ' + level.doors.length, sol.ok ? 'par ' + sol.moves.length : (sol.capped ? 'capped' : 'unsolvable?!'), sol.states + ' states', (Date.now() - t0) + ' ms');
  }
  process.exit(0);
}
const from = Number(process.argv[2] || 1), to = Number(process.argv[3] || COUNT), dry = process.argv.length > 2;
const out = [], seen = new Set();
for (let n = 1; n <= COUNT; n++) {
  if (n < from || n > to) { out.push(null); continue; }
  const started = Date.now();
  let kept = null, tried = 0;
  if (n <= HAND.length) {
    const h = HAND[n - 1];
    const level = { w: h.w, h: h.h, doors: h.doors.map(([s, p, k, c]) => ({ s, p, n: k, c })), bricks: h.bricks.map(([x, y, w, hh, c]) => ({ x, y, w, h: hh, c })) };
    const problems = R.check(level);
    const sol = problems.length ? null : R.solve(level, { cap: 3000000 });
    if (!sol || !sol.ok) throw new Error(`hand level ${n} is not sound: ${problems.join('; ') || (sol && sol.capped ? 'too big to solve' : 'can not be won')}`);
    kept = pack(level, sol); tried = 1;
  } else {
    const s0 = spec(n), until = Date.now() + (n < 10 ? 5000 : 15000);
    let best = null;
    for (let seed = n * 1000; seed < n * 1000 + 800 && !kept; seed++) {
      tried++;
      if (Date.now() > until && best) break;
      const s = tried % 50 === 49 && s0.bricks > 4 ? { ...s0, bricks: s0.bricks - 1 } : s0;   // a board nobody can solve in time gets one brick fewer now and then
      const level = build(s, seed);
      if (!level || R.check(level).length) continue;
      const key = R.key(level.bricks) + level.doors.map((d) => d.s + d.p + d.n + d.c).join('');
      if (seen.has(key)) continue;
      const sol = R.solve(level, { cap: 300000, ms: 2500 });
      if (!sol.ok) continue;
      const par = sol.moves.length;
      if (par >= s0.lo && par <= s0.hi) { seen.add(key); kept = pack(level, sol); }
      else if (!best || Math.abs(par - s0.goal) < Math.abs(best.sol.moves.length - s0.goal)) best = { level, sol, key };
    }
    if (!kept && best) { seen.add(best.key); kept = pack(best.level, best.sol); }
    if (!kept) throw new Error(`level ${n}: nothing found in ${tried} tries (${JSON.stringify(s)})`);
  }
  out.push(kept);
  console.log(`level ${String(n).padStart(2)}: ${kept.w}x${kept.h}, ${kept.bricks.length} bricks, ${new Set(kept.bricks.map((b) => b[4])).size} colours, par ${kept.par} (${tried} tries, ${((Date.now() - started) / 1000).toFixed(1)} s)`);
}
if (!dry) {
  const text = '// Generated by brick-escape/generate-levels.mjs (instagram/public/games/brick-escape/levels.js): every level was won by the solver before it was kept; par = the fewest moves.\n'
    + '// doors: [side, cell, width, colour]  bricks: [x, y, w, h, colour]  sol: [x, y, w, h, direction, cells, leaves]\n'
    + 'window.BRICK_ESCAPE_LEVELS=' + JSON.stringify(out).replace(/\],\[/g, '],\n  [').replace(/^\[/, '[\n  ').replace(/\]$/, '\n]') + ';\n';
  fs.writeFileSync(OUT, text);
  console.log('written', OUT, text.length, 'bytes');
}
