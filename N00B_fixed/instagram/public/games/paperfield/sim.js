// Paperfield: the game rules, in one file that runs in two places (no browser or server calls in here):
//   * on the server (worker/paperfield.js, a Cloudflare Durable Object): ONE big shared lobby; real players and bots live in the same world;
//   * in the browser, when the server cannot be reached: the same world with only bots (offline mode), so the game always opens.
// Players steer freely (they turn smoothly, so every path is a curve). Outside your own land you leave a trail; coming back into your land claims
// everything the loop encloses (the trail is a polygon that is filled into the land). Anyone who touches a trail cuts its owner (the owner is out);
// touching your own trail ends you too. The land is kept as a fine grid of half-unit cells; the screen draws smooth outlines around it.

export const UNITS = 260;            // the field is UNITS x UNITS (a player's head is about 1 unit wide)
export const CELL = 0.5;             // one land cell in units
export const GW = 520;               // grid size in cells (UNITS / CELL)
export const GH = 520;
export const TICK_MS = 60;
export const MAX_IDS = 250;          // player ids are 1..250 (0 = nobody)
export const SKINS = 100;
export const SPEED = 7.2;            // units per second
export const TURN = 4.4;             // radians per second
const START_R = 2.7;                 // the first land is a disc of this radius (units)
const TWO_PI = Math.PI * 2;

const BOT_NAMES = ['Nova', 'Pixel', 'Zigzag', 'Echo', 'Mango', 'Blaze', 'Comet', 'Turbo', 'Pepper', 'Jelly', 'Ninja', 'Panda', 'Rocket', 'Sunny', 'Tiger', 'Waffle', 'Bolt', 'Cookie', 'Dash', 'Frosty',
  'Gizmo', 'Hawk', 'Ivy', 'Jinx', 'Koala', 'Lucky', 'Milo', 'Noodle', 'Otter', 'Pogo', 'Quill', 'Ranger', 'Sparky', 'Taco', 'Unicorn', 'Viper', 'Wizard', 'Yeti', 'Zephyr', 'Biscuit',
  'Cosmo', 'Dino', 'Ember', 'Fuzzy', 'Gadget', 'Happy', 'Jazz', 'Kiwi', 'Lemon', 'Mochi', 'Nacho', 'Orbit', 'Peach', 'Rumble', 'Sushi', 'Toast', 'Vortex', 'Wasabi', 'Zorro', 'Aqua',
  'Bubbles', 'Cyber', 'Daisy', 'Falcon', 'Ghost', 'Hunter', 'Indigo', 'Joker', 'King', 'Luna', 'Maverick', 'Neo', 'Omega', 'Phantom', 'Queen', 'Raven', 'Shadow', 'Thunder', 'Ultra', 'Vega',
  'Wolf', 'Xeno', 'Yoshi', 'Zen', 'Aarav', 'Riya', 'Kabir', 'Meera', 'Arjun', 'Diya', 'Rohan', 'Isha', 'Veer', 'Anaya', 'Dev', 'Tara', 'Karan', 'Sia', 'Neel', 'Pari', 'Om', 'Mira', 'Yash', 'Kavya'];

/** a small seeded random generator, so a world can be replayed */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const wrapAngle = (a) => { a = (a + Math.PI) % TWO_PI; if (a < 0) a += TWO_PI; return a - Math.PI; };

/** a flat list of [index, length, value] runs of the cells in `idx` (consecutive cells with the same value are one run) */
function runsOf(arr, idx) {
  if (!idx.length) return [];
  const a = Int32Array.from(idx).sort();
  const out = [];
  let start = -1, len = 0, val = -1, last = -2;
  for (let i = 0; i < a.length; i++) {
    const c = a[i];
    if (c === last) continue;
    last = c;
    const v = arr[c];
    if (len && c === start + len && v === val) { len++; continue; }
    if (len) out.push(start, len, val);
    start = c; len = 1; val = v;
  }
  if (len) out.push(start, len, val);
  return out;
}

/** the whole array as [value, length, value, length ...] */
function rle(arr) {
  const out = [];
  let v = arr[0], n = 1;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] === v) n++;
    else { out.push(v, n); v = arr[i]; n = 1; }
  }
  out.push(v, n);
  return out;
}

export class World {
  /** @param {{seed?: number, targetPop?: number, minBots?: number}} [opts] */
  constructor(opts = {}) {
    this.own = new Uint8Array(GW * GH);          // who owns each land cell (0: nobody)
    this.trl = new Uint8Array(GW * GH);          // whose trail is on each cell (0: none): only for touching tests
    this.tage = new Uint16Array(GW * GH);        // how far along its owner's trail that cell is (so a player's own fresh trail is not "touched")
    this.counts = new Int32Array(MAX_IDS + 1);   // land cells per player
    this.players = new Map();
    this.tick = 0;
    this.rng = mulberry32(opts.seed != null ? opts.seed : (Date.now() ^ 0x5bd1e995) >>> 0);
    this.targetPop = opts.targetPop || 80;       // humans + bots together
    this.minBots = opts.minBots != null ? opts.minBots : 40;
    this.dirtyOwn = [];
    this.ev = { j: [], l: [], k: [], d: [] };
    this.usedNames = new Set();
  }

  // ------------------------------------------------------------------ players
  freeId() {
    for (let i = 1; i <= MAX_IDS; i++) if (!this.players.has(i)) return i;
    return 0;
  }
  humans() { let n = 0; for (const p of this.players.values()) if (p.human) n++; return n; }
  bots() { let n = 0; for (const p of this.players.values()) if (!p.human) n++; return n; }

  unusedSkin() {
    const used = new Set();
    for (const p of this.players.values()) used.add(p.skin);
    const free = [];
    for (let s = 0; s < SKINS; s++) if (!used.has(s)) free.push(s);
    return free.length ? free[Math.floor(this.rng() * free.length)] : Math.floor(this.rng() * SKINS);
  }

  botName() {
    for (let t = 0; t < 30; t++) {
      const n = BOT_NAMES[Math.floor(this.rng() * BOT_NAMES.length)] + (this.rng() < 0.35 ? String(1 + Math.floor(this.rng() * 99)) : '');
      if (!this.usedNames.has(n)) return n;
    }
    return BOT_NAMES[Math.floor(this.rng() * BOT_NAMES.length)] + Math.floor(this.rng() * 1000);
  }

  /** a free disc of land to start on (nobody's land or trail around it), away from the walls */
  spawnPoint() {
    const R = START_R + 2.5;
    for (let t = 0; t < 300; t++) {
      const x = R + 3 + this.rng() * (UNITS - 2 * R - 6), y = R + 3 + this.rng() * (UNITS - 2 * R - 6);
      let ok = true;
      const i0 = Math.floor((x - R) / CELL), i1 = Math.ceil((x + R) / CELL), j0 = Math.floor((y - R) / CELL), j1 = Math.ceil((y + R) / CELL);
      for (let j = j0; j <= j1 && ok; j += 2) for (let i = i0; i <= i1; i += 2) if (this.own[j * GW + i] || this.trl[j * GW + i]) { ok = false; break; }
      if (ok) return [x, y];
    }
    return [R + 3 + this.rng() * (UNITS - 2 * R - 6), R + 3 + this.rng() * (UNITS - 2 * R - 6)];
  }

  /** a new player (a person or a bot) appears on a fresh disc of land. Returns its id, or 0 if the lobby is full. */
  addPlayer({ name, skin, human }) {
    const id = this.freeId();
    if (!id) return 0;
    const p = { id, name: String(name || 'Player').slice(0, 16), skin: ((skin | 0) % SKINS + SKINS) % SKINS, human: !!human, alive: false, x: 0, y: 0, ang: 0, tang: 0,
      trail: [], tpts: 0, kills: 0, peak: 0, born: 0, killedBy: 0, respawnAt: 0, bot: null, ax: 0, ay: 0 };
    if (!p.human) { p.bot = { aggr: 0.15 + this.rng() * 0.7, reach: 5 + this.rng() * 9, legs: [], mode: 'home', rest: 0, left: 0, wob: 0 }; this.usedNames.add(p.name); }
    this.players.set(id, p);
    this.respawn(id);
    return id;
  }

  /** put an existing (dead or new) player on a fresh disc of land */
  respawn(id, name, skin) {
    const p = this.players.get(id);
    if (!p) return;
    if (name != null) p.name = String(name).slice(0, 16) || p.name;
    if (skin != null) p.skin = ((skin | 0) % SKINS + SKINS) % SKINS;
    if (p.human) {
      // a person's look is theirs: a bot that wears the same skin gets another one
      for (const q of this.players.values()) if (!q.human && q.skin === p.skin) { q.skin = this.unusedSkin(); this.ev.j.push([q.id, q.name, q.skin, 0]); }
    }
    const [sx, sy] = this.spawnPoint();
    p.x = sx; p.y = sy;
    p.ang = p.tang = Math.atan2(UNITS / 2 - sy, UNITS / 2 - sx);   // look toward the middle of the field
    p.trail = []; p.tpts = 0; p.alive = true; p.kills = 0; p.peak = 0; p.born = this.tick; p.killedBy = 0;
    p.ax = sx; p.ay = sy;
    p.prot = p.human ? this.tick + 100 : 0;
    if (p.bot) { p.bot.legs = []; p.bot.mode = 'home'; p.bot.rest = 10 + Math.floor(this.rng() * 30); }
    const r2 = START_R * START_R;
    const i0 = Math.floor((sx - START_R) / CELL), i1 = Math.ceil((sx + START_R) / CELL), j0 = Math.floor((sy - START_R) / CELL), j1 = Math.ceil((sy + START_R) / CELL);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = (i + 0.5) * CELL - sx, dy = (j + 0.5) * CELL - sy;
      if (dx * dx + dy * dy <= r2) this.setOwner(j * GW + i, id);
    }
    this.ev.j.push([id, p.name, p.skin, p.human ? 1 : 0]);
  }

  /** a player leaves for good (closed the page, or a bot taken out of the lobby) */
  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    if (p.alive) this.clearPlayer(p);
    if (p.bot) this.usedNames.delete(p.name);
    this.players.delete(id);
    this.ev.l.push(id);
  }

  setOwner(c, id) {
    const prev = this.own[c];
    if (prev === id) return;
    if (prev) this.counts[prev]--;
    this.own[c] = id;
    if (id) this.counts[id]++;
    this.dirtyOwn.push(c);
  }

  cellOf(x, y) {
    const i = Math.floor(x / CELL), j = Math.floor(y / CELL);
    return (i < 0 || j < 0 || i >= GW || j >= GH) ? -1 : j * GW + i;
  }

  /** the trail of a player is wiped from the touching grid */
  eraseTrail(p) {
    const t = p.trail, id = p.id;
    for (let k = 0; k < t.length; k += 2) {
      const ci = Math.floor(t[k] / CELL), cj = Math.floor(t[k + 1] / CELL);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const i = ci + di, j = cj + dj;
        if (i >= 0 && j >= 0 && i < GW && j < GH && this.trl[j * GW + i] === id) this.trl[j * GW + i] = 0;
      }
    }
    p.trail = []; p.tpts = 0;
  }

  /** take away a player's land and trail */
  clearPlayer(p) {
    const id = p.id;
    this.eraseTrail(p);
    if (this.counts[id] > 0) {
      const own = this.own;
      for (let c = 0; c < own.length; c++) if (own[c] === id) { own[c] = 0; this.dirtyOwn.push(c); }
    }
    this.counts[id] = 0;
    p.alive = false;
  }

  /** a player is out; `by` is the id of the one who cut the trail (0: a wall, or their own trail) */
  kill(p, by) {
    if (!p.alive) return;
    if (by && p.prot > this.tick) return;   // a person who just arrived cannot be cut for a few seconds (walls and their own trail still count)
    p.killedBy = by | 0;
    this.clearPlayer(p);
    this.ev.d.push(p.id);
    const k = by ? this.players.get(by) : null;
    if (k && k.alive) { k.kills++; this.ev.k.push([by, p.id]); } else this.ev.k.push([0, p.id]);
    if (!p.human) p.respawnAt = this.tick + 25 + Math.floor(this.rng() * 60);
  }

  /** a person steers: the direction they want to go (the head turns toward it at its own speed) */
  steer(id, a) {
    const p = this.players.get(id);
    if (!p || !p.alive || typeof a !== 'number' || !isFinite(a)) return;
    p.tang = wrapAngle(a);
  }

  // ------------------------------------------------------------------ one tick
  step() {
    this.tick++;
    const dt = TICK_MS / 1000;
    // bots come back after a pause; the number of bots follows the number of people
    for (const p of this.players.values()) if (!p.human && !p.alive && this.tick >= p.respawnAt) this.respawn(p.id);
    if (this.tick % 30 === 0) this.balanceBots();

    const own = this.own;
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      if (p.bot) this.think(p, dt);
      // turn toward the wanted direction, then move
      const d = wrapAngle(p.tang - p.ang), m = TURN * dt;
      p.ang = wrapAngle(p.ang + (d > m ? m : d < -m ? -m : d));
      const px = p.x, py = p.y;
      const nx = px + Math.cos(p.ang) * SPEED * dt, ny = py + Math.sin(p.ang) * SPEED * dt;
      if (nx < 0.2 || ny < 0.2 || nx > UNITS - 0.2 || ny > UNITS - 0.2) { this.kill(p, 0); continue; }   // a wall
      const c = this.cellOf(nx, ny);
      const t = this.trl[c];
      if (t) {
        if (t === p.id) { if (p.tpts - this.tage[c] > 14) { this.kill(p, 0); continue; } }   // ran into your own trail
        else { const v = this.players.get(t); if (v) this.kill(v, p.id); }                   // cut someone's trail
      }
      p.x = nx; p.y = ny;
      if (own[c] === p.id) {
        if (p.tpts > 0) this.capture(p);
        p.ax = nx; p.ay = ny;
      } else {
        const tr = p.trail;
        if (!tr.length) { tr.push(px, py); }
        const lx = tr[tr.length - 2], ly = tr[tr.length - 1];
        if ((nx - lx) * (nx - lx) + (ny - ly) * (ny - ly) > 0.09) {
          tr.push(nx, ny); p.tpts++;
          const ci = Math.floor(nx / CELL), cj = Math.floor(ny / CELL);
          for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            const i = ci + di, j = cj + dj;
            if (i < 0 || j < 0 || i >= GW || j >= GH) continue;
            const cc = j * GW + i;
            if (this.trl[cc]) continue;   // a cell keeps the first (older) mark: a head must not 'refresh' the cells it is about to enter
            this.trl[cc] = p.id; this.tage[cc] = p.tpts;
          }
          if (p.tpts > 6000) this.kill(p, 0);
        }
      }
      const n = this.counts[p.id];
      if (n > p.peak) p.peak = n;
    }
  }

  /** keep about targetPop players: bots fill what people leave free */
  balanceBots() {
    const humans = this.humans();
    const want = Math.max(this.minBots, this.targetPop - humans);
    let bots = this.bots();
    while (bots < want) { if (!this.addPlayer({ name: this.botName(), skin: this.unusedSkin(), human: false })) break; bots++; }
    if (bots > want) {
      const list = [...this.players.values()].filter((p) => !p.human).sort((a, b) => (a.alive ? 1 : 0) - (b.alive ? 1 : 0) || this.counts[a.id] - this.counts[b.id]);
      for (let i = 0; i < bots - want && i < list.length; i++) this.removePlayer(list[i].id);
    }
  }

  /** the loop is closed: the trail (and the way back to the land) is a polygon, and everything inside it becomes the player's land */
  capture(p) {
    const id = p.id;
    const pts = p.trail.slice();
    pts.push(p.x, p.y);
    const n = pts.length / 2;
    let miny = 1e9, maxy = -1e9;
    for (let k = 1; k < pts.length; k += 2) { if (pts[k] < miny) miny = pts[k]; if (pts[k] > maxy) maxy = pts[k]; }
    const j0 = Math.max(0, Math.ceil(miny / CELL - 0.5)), j1 = Math.min(GH - 1, Math.floor(maxy / CELL - 0.5));
    const rows = new Map();
    for (let k = 0; k < n; k++) {
      const a = k, b = (k + 1) % n;
      const x1 = pts[a * 2], y1 = pts[a * 2 + 1], x2 = pts[b * 2], y2 = pts[b * 2 + 1];
      if (y1 === y2) continue;
      const lo = Math.min(y1, y2), hi = Math.max(y1, y2);
      const ja = Math.max(j0, Math.ceil(lo / CELL - 0.5)), jb = Math.min(j1, Math.floor(hi / CELL - 0.5));
      for (let j = ja; j <= jb; j++) {
        const yc = (j + 0.5) * CELL;
        if (!((y1 <= yc && y2 > yc) || (y2 <= yc && y1 > yc))) continue;
        const x = x1 + (yc - y1) * (x2 - x1) / (y2 - y1);
        let r = rows.get(j); if (!r) { r = []; rows.set(j, r); }
        r.push(x);
      }
    }
    for (const [j, xs] of rows) {
      xs.sort((a, b) => a - b);
      for (let q = 0; q + 1 < xs.length; q += 2) {
        const ia = Math.max(0, Math.ceil(xs[q] / CELL - 0.5)), ib = Math.min(GW - 1, Math.floor(xs[q + 1] / CELL - 0.5));
        for (let i = ia; i <= ib; i++) this.setOwner(j * GW + i, id);
      }
    }
    // the cells under the trail itself become land too (so the edge is not a hair-thin gap)
    const t = p.trail;
    for (let k = 0; k < t.length; k += 2) {
      const ci = Math.floor(t[k] / CELL), cj = Math.floor(t[k + 1] / CELL);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const i = ci + di, j = cj + dj;
        if (i >= 0 && j >= 0 && i < GW && j < GH) this.setOwner(j * GW + i, id);
      }
    }
    this.eraseTrail(p);
  }

  // ------------------------------------------------------------------ bots
  /** is the cell at (x, y) free of walls and of my own fresh trail? */
  free(p, x, y) {
    if (x < 1 || y < 1 || x > UNITS - 1 || y > UNITS - 1) return false;
    const c = this.cellOf(x, y);
    return !(this.trl[c] === p.id && p.tpts - this.tage[c] > 6);
  }

  think(p, dt) {
    const b = p.bot, rng = this.rng, own = this.own;
    const c = this.cellOf(p.x, p.y);
    const home = c >= 0 && own[c] === p.id;
    // the walls: turn toward the middle early
    if (p.x < 6 || p.y < 6 || p.x > UNITS - 6 || p.y > UNITS - 6) {
      p.tang = Math.atan2(UNITS / 2 - p.y, UNITS / 2 - p.x);
      if (!home && b.mode === 'out') { b.mode = 'back'; b.legs = []; }
      return;
    }
    // never into my own trail: look ahead on both sides
    const probe = (a, d) => this.free(p, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
    if (!probe(p.ang, 2.2) || !probe(p.ang, 4.4)) {
      const l = probe(p.ang - 0.8, 2.6), r = probe(p.ang + 0.8, 2.6);
      if (l || r) { p.tang = p.ang + (l && (!r || rng() < 0.5) ? -1.1 : 1.1); b.legs = []; if (!home) b.mode = 'back'; return; }
    }
    // a trail of somebody else close by is a chance
    const prey = (this.tick + p.id) % 4 === 0 && p.tpts < 90 ? this.nearTrail(p, b.reach + 3) : null;
    if (prey && rng() < b.aggr * 0.5 + 0.15 && (home || b.mode === 'hunt' || b.mode === 'out')) {
      b.mode = home ? 'out' : b.mode;
      p.tang = Math.atan2(prey[1] - p.y, prey[0] - p.x);
      b.legs = []; b.left = 0.8;
      return;
    }
    if (home && p.tpts === 0 && b.mode !== 'out') {
      // at home: rest a little (drift about), then go out for a loop (bigger loops for bolder bots)
      b.mode = 'home';
      if (b.rest > 0) { b.rest--; p.tang = p.ang + (rng() - 0.5) * 0.9; if (this.free(p, p.x + Math.cos(p.ang) * 3, p.y + Math.sin(p.ang) * 3) === false) p.tang = Math.atan2(p.ay - p.y, p.ax - p.x) + 1.2; return; }
      const a = rng() * TWO_PI, out = 5 + rng() * b.reach, side = 4 + rng() * (b.reach + 3);
      const turn = rng() < 0.5 ? 1 : -1;
      p.tang = a;
      b.legs = [{ a: a + turn * 1.45, len: side }, { a: a + turn * 2.9, len: out + 2 }];
      b.left = out; b.mode = 'out'; b.rest = 8 + Math.floor(rng() * 70);
      return;
    }
    if (b.mode === 'out') {
      if (!home) b.left -= SPEED * dt;
      if (b.left <= 0) {
        if (b.legs.length && p.tpts < 160 + b.reach * 8) { const l = b.legs.shift(); p.tang = l.a; b.left = l.len; }
        else b.mode = 'back';
      }
      return;
    }
    if (b.mode === 'back' || b.mode === 'hunt') {
      if (home && p.tpts === 0) { b.mode = 'home'; return; }
      p.tang = Math.atan2(p.ay - p.y, p.ax - p.x);
      // arrive in a curve, not on a line: aim a little past the anchor
      return;
    }
    b.mode = home ? 'home' : 'back';
  }

  /** the nearest cell of someone else's trail within r units: [x, y] or null */
  nearTrail(p, r) {
    let best = null, bd = r * r;
    const ci = Math.floor(p.x / CELL), cj = Math.floor(p.y / CELL), n = Math.ceil(r / CELL);
    for (let j = Math.max(0, cj - n); j <= Math.min(GH - 1, cj + n); j += 2) {
      for (let i = Math.max(0, ci - n); i <= Math.min(GW - 1, ci + n); i += 2) {
        const t = this.trl[j * GW + i];
        if (t && t !== p.id) {
          const x = (i + 0.5) * CELL, y = (j + 0.5) * CELL, d = (x - p.x) * (x - p.x) + (y - p.y) * (y - p.y);
          if (d < bd) { bd = d; best = [x, y]; }
        }
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ what is sent
  /** the changes of this tick (and clears them). Positions are in tenths of a unit, angles in hundredths of a radian. */
  flush() {
    const p = [];
    for (const q of this.players.values()) if (q.alive) p.push([q.id, Math.round(q.x * 10), Math.round(q.y * 10), Math.round(wrapAngle(q.ang) * 100)]);
    const msg = { t: 'tick', n: this.tick, p, own: runsOf(this.own, this.dirtyOwn), ev: this.ev };
    this.dirtyOwn = []; this.ev = { j: [], l: [], k: [], d: [] };
    return msg;
  }

  /** the whole world, for somebody who just arrived */
  snapshot() {
    const players = [];
    for (const q of this.players.values()) {
      const trail = [];
      for (let k = 0; k < q.trail.length; k++) trail.push(Math.round(q.trail[k] * 10));
      players.push([q.id, q.name, q.skin, q.human ? 1 : 0, q.alive ? 1 : 0, Math.round(q.x * 10), Math.round(q.y * 10), Math.round(wrapAngle(q.ang) * 100), trail]);
    }
    return { t: 'init', gw: GW, gh: GH, units: UNITS, cell: CELL, tick: this.tick, tickMs: TICK_MS, own: rle(this.own), players, humans: this.humans(), bots: this.bots() };
  }

  /** the end-of-game numbers of a person who is out */
  report(id) {
    const p = this.players.get(id);
    if (!p) return null;
    const killer = this.players.get(p.killedBy);
    return { t: 'dead', by: killer ? killer.name : '', kills: p.kills, peak: p.peak, secs: Math.round((this.tick - p.born) * TICK_MS / 1000) };
  }
}
