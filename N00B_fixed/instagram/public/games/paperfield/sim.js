// Paperfield: the game rules, in one file that runs in two places (no browser or server calls in here):
//   * on the server (worker/paperfield.js, a Cloudflare Durable Object): ONE big shared lobby; real players and bots live in the same world;
//   * in the browser, when the server cannot be reached: the same world with only bots (offline mode), so the game always opens.
// The world is a grid. Every player moves one cell per tick. Outside your own land you leave a trail; closing the trail back onto your land
// claims everything the loop encloses. Anyone who touches a trail cuts its owner (the owner is out); touching your own trail ends you too.

export const W = 300;
export const H = 300;
export const TICK_MS = 170;
export const MAX_IDS = 250;          // player ids are 1..250 (0 = nobody)
export const SKINS = 100;
const DX = [0, 1, 0, -1];            // 0 up, 1 right, 2 down, 3 left
const DY = [-1, 0, 1, 0];
const START_R = 2;                   // the first land is a (2*R+1) square: 5 x 5

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
    this.w = W; this.h = H;
    this.own = new Uint8Array(W * H);
    this.trl = new Uint8Array(W * H);
    this.counts = new Int32Array(MAX_IDS + 1);
    this.players = new Map();
    this.tick = 0;
    this.rng = mulberry32(opts.seed != null ? opts.seed : (Date.now() ^ 0x5bd1e995) >>> 0);
    this.targetPop = opts.targetPop || 80;     // humans + bots together
    this.minBots = opts.minBots != null ? opts.minBots : 40;
    this.dirtyOwn = []; this.dirtyTrl = [];
    this.ev = { j: [], l: [], k: [], d: [] };
    this.stamp = new Int32Array(W * H); this.stampN = 0; this.stack = new Int32Array(W * H);
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

  /** a free square of land to start on (nobody's land or trail around it), away from the walls */
  spawnPoint() {
    const R = START_R + 2;
    for (let t = 0; t < 300; t++) {
      const x = R + 1 + Math.floor(this.rng() * (W - 2 * R - 2));
      const y = R + 1 + Math.floor(this.rng() * (H - 2 * R - 2));
      let ok = true;
      for (let yy = y - R; yy <= y + R && ok; yy++) {
        const row = yy * W;
        for (let xx = x - R; xx <= x + R; xx++) if (this.own[row + xx] || this.trl[row + xx]) { ok = false; break; }
      }
      if (ok) return [x, y];
    }
    return [R + 1 + Math.floor(this.rng() * (W - 2 * R - 2)), R + 1 + Math.floor(this.rng() * (H - 2 * R - 2))];
  }

  /** a new player (a person or a bot) appears on a fresh square of land. Returns its id, or 0 if the lobby is full. */
  addPlayer({ name, skin, human }) {
    const id = this.freeId();
    if (!id) return 0;
    const p = { id, name: String(name || 'Player').slice(0, 16), skin: ((skin | 0) % SKINS + SKINS) % SKINS, human: !!human, alive: false, x: 0, y: 0, dir: 1, queue: [], trail: [],
      kills: 0, peak: 0, born: 0, killedBy: 0, respawnAt: 0, bot: null, anchor: 0 };
    if (!p.human) { p.bot = { aggr: 0.15 + this.rng() * 0.7, reach: 4 + Math.floor(this.rng() * 9), legs: [], mode: 'home', wob: this.rng() }; this.usedNames.add(p.name); }
    this.players.set(id, p);
    this.respawn(id);
    return id;
  }

  /** put an existing (dead or new) player on a fresh square */
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
    // look toward the middle of the map
    p.dir = Math.abs(W / 2 - sx) > Math.abs(H / 2 - sy) ? (sx < W / 2 ? 1 : 3) : (sy < H / 2 ? 2 : 0);
    p.queue = []; p.trail = []; p.alive = true; p.kills = 0; p.peak = 0; p.born = this.tick; p.killedBy = 0;
    p.anchor = sy * W + sx;
    if (p.bot) { p.bot.legs = []; p.bot.mode = 'home'; }
    for (let yy = sy - START_R; yy <= sy + START_R; yy++) {
      for (let xx = sx - START_R; xx <= sx + START_R; xx++) this.setOwner(yy * W + xx, id);
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

  /** take away a player's land and trail */
  clearPlayer(p) {
    const id = p.id;
    for (const c of p.trail) { if (this.trl[c] === id) { this.trl[c] = 0; this.dirtyTrl.push(c); } }
    p.trail = [];
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
    p.killedBy = by | 0;
    this.clearPlayer(p);
    this.ev.d.push(p.id);
    if (by) { const k = this.players.get(by); if (k && k.alive) { k.kills++; this.ev.k.push([by, p.id]); } else this.ev.k.push([0, p.id]); }
    else this.ev.k.push([0, p.id]);
    if (!p.human) p.respawnAt = this.tick + 18 + Math.floor(this.rng() * 30);
  }

  /** a person asks to turn (the turns wait in a short line, one is used each tick) */
  turn(id, d) {
    const p = this.players.get(id);
    if (!p || !p.alive || !(d >= 0 && d <= 3)) return;
    const ref = p.queue.length ? p.queue[p.queue.length - 1] : p.dir;
    if (d === ref || d === ((ref + 2) & 3) || p.queue.length >= 3) return;
    p.queue.push(d);
  }

  // ------------------------------------------------------------------ one tick
  step() {
    this.tick++;
    // bots come back after a pause; the number of bots follows the number of people
    for (const p of this.players.values()) if (!p.human && !p.alive && this.tick >= p.respawnAt) this.respawn(p.id);
    if (this.tick % 20 === 0) this.balanceBots();

    const movers = [];
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      if (p.bot) this.think(p);
      if (p.queue.length) { const d = p.queue.shift(); if (d !== ((p.dir + 2) & 3)) p.dir = d; }
      const nx = p.x + DX[p.dir], ny = p.y + DY[p.dir];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) { this.kill(p, 0); continue; }   // a wall
      p.nx = nx; p.ny = ny;
      movers.push(p);
    }

    // two heads meeting: the one with more land survives (both go if equal)
    const target = new Map();
    for (const p of movers) {
      const key = p.ny * W + p.nx;
      const other = target.get(key);
      if (other) { this.headOn(p, other); } else target.set(key, p);
    }
    for (const p of movers) {   // heads that swap places also meet
      if (!p.alive) continue;
      for (const q of movers) {
        if (q === p || !q.alive) continue;
        if (q.nx === p.x && q.ny === p.y && p.nx === q.x && p.ny === q.y) this.headOn(p, q);
      }
    }

    for (const p of movers) {
      if (!p.alive) continue;
      const c = p.ny * W + p.nx;
      const t = this.trl[c];
      if (t) {
        if (t === p.id) { this.kill(p, 0); continue; }                  // ran into your own trail
        const v = this.players.get(t);
        if (v) this.kill(v, p.id);                                      // cut someone's trail
      }
      p.x = p.nx; p.y = p.ny;
      if (this.own[c] === p.id) {
        if (p.trail.length) this.capture(p);
        p.anchor = c;
      } else {
        this.trl[c] = p.id; this.dirtyTrl.push(c); p.trail.push(c);
      }
      const n = this.counts[p.id];
      if (n > p.peak) p.peak = n;
    }
  }

  headOn(a, b) {
    const ca = this.counts[a.id], cb = this.counts[b.id];
    if (ca > cb) this.kill(b, a.id);
    else if (cb > ca) this.kill(a, b.id);
    else { this.kill(a, b.id); this.kill(b, a.id); }
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

  /** the loop is closed: everything it encloses becomes the player's land */
  capture(p) {
    const id = p.id, own = this.own, trl = this.trl;
    const T = p.trail;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (const c of T) {
      const x = c % W, y = (c / W) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    // the box around the trail, one cell wider: what the flood from its edge reaches is outside; the rest is enclosed
    const ex0 = Math.max(0, x0 - 1), ey0 = Math.max(0, y0 - 1), ex1 = Math.min(W - 1, x1 + 1), ey1 = Math.min(H - 1, y1 + 1);
    const stamp = this.stamp, stack = this.stack;
    const sn = ++this.stampN;
    let sp = 0;
    const blocked = (c) => trl[c] === id || own[c] === id;
    const seed = (x, y) => { const c = y * W + x; if (stamp[c] !== sn && !blocked(c)) { stamp[c] = sn; stack[sp++] = c; } };
    if (x0 - 1 >= 0) for (let y = ey0; y <= ey1; y++) seed(ex0, y);
    if (x1 + 1 < W) for (let y = ey0; y <= ey1; y++) seed(ex1, y);
    if (y0 - 1 >= 0) for (let x = ex0; x <= ex1; x++) seed(x, ey0);
    if (y1 + 1 < H) for (let x = ex0; x <= ex1; x++) seed(x, ey1);
    while (sp) {
      const c = stack[--sp];
      const x = c % W, y = (c / W) | 0;
      if (x > ex0) { const n = c - 1; if (stamp[n] !== sn && !blocked(n)) { stamp[n] = sn; stack[sp++] = n; } }
      if (x < ex1) { const n = c + 1; if (stamp[n] !== sn && !blocked(n)) { stamp[n] = sn; stack[sp++] = n; } }
      if (y > ey0) { const n = c - W; if (stamp[n] !== sn && !blocked(n)) { stamp[n] = sn; stack[sp++] = n; } }
      if (y < ey1) { const n = c + W; if (stamp[n] !== sn && !blocked(n)) { stamp[n] = sn; stack[sp++] = n; } }
    }
    for (let y = ey0; y <= ey1; y++) {
      for (let x = ex0; x <= ex1; x++) {
        const c = y * W + x;
        if (stamp[c] !== sn && own[c] !== id) this.setOwner(c, id);
      }
    }
    for (const c of T) { if (trl[c] === id) { trl[c] = 0; this.dirtyTrl.push(c); } }
    p.trail = [];
  }

  // ------------------------------------------------------------------ bots
  safe(p, x, y) {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    return this.trl[y * W + x] !== p.id;
  }

  /** is the cell ahead (n steps) free of walls and of my own trail? */
  clear(p, dir, n) {
    for (let i = 1; i <= n; i++) if (!this.safe(p, p.x + DX[dir] * i, p.y + DY[dir] * i)) return false;
    return true;
  }

  think(p) {
    const b = p.bot, rng = this.rng, own = this.own;
    const here = p.y * W + p.x;
    const home = own[here] === p.id;
    const want = (d) => { if (d !== ((p.dir + 2) & 3)) p.queue[0] = d; };
    const turnsFor = [p.dir, (p.dir + 1) & 3, (p.dir + 3) & 3];

    if (home && !p.trail.length && !(b.mode === 'out' && ((b.cur && b.cur[1] > 0) || b.legs.length))) {
      // at home: sometimes go out for a loop (bigger loops for bolder bots), sometimes rest in the land
      b.mode = 'home';
      if (p.queue.length) return;
      if (rng() < 0.1 && this.counts[p.id] > 30) { want(turnsFor[1 + ((rng() * 2) | 0)]); return; }
      // a trail of somebody else close by is a chance
      const prey = this.nearTrail(p, 9);
      let d;
      if (prey && rng() < b.aggr + 0.2) d = this.towards(p, prey % W, (prey / W) | 0);
      else d = (p.dir + (rng() < 0.5 ? 1 : 3) + (rng() < 0.25 ? 1 : 0)) & 3;
      if (!this.clear(p, d, 2)) { for (const t of [0, 1, 2, 3]) if (this.clear(p, t, 3)) { d = t; break; } }
      // walk to the edge of the land first (the loop is measured from there)
      let k = 0;
      while (k < 60 && p.x + DX[d] * (k + 1) >= 0 && p.x + DX[d] * (k + 1) < W && p.y + DY[d] * (k + 1) >= 0 && p.y + DY[d] * (k + 1) < H
        && own[(p.y + DY[d] * (k + 1)) * W + p.x + DX[d] * (k + 1)] === p.id) k++;
      const a = 3 + ((rng() * b.reach) | 0), s = 3 + ((rng() * (b.reach + 2)) | 0);
      const side = (d + (rng() < 0.5 ? 1 : 3)) & 3;
      b.legs = [[side, s], [(d + 2) & 3, a + 1 + k]];
      b.cur = [d, a + k];
      b.mode = 'out';
      b.cur[1]--; want(d);
      return;
    }

    // outside the land: the loop is a rectangle (out, across, back), or a straight run at a trail that was spotted
    let d = p.dir;
    const long = p.trail.length > 38 + b.reach * 2;
    if (!home || b.mode === 'out') {
      if (b.mode === 'out' && !long) {
        if (b.cur && b.cur[1] > 0) { d = b.cur[0]; b.cur[1]--; }
        else if (b.legs.length) { b.cur = b.legs.shift(); d = b.cur[0]; b.cur[1]--; }
        else b.mode = 'back';
        if (b.mode === 'out' && p.trail.length < 20 && rng() < b.aggr * 0.35) {
          const prey = this.nearTrail(p, 6);
          if (prey) d = this.towards(p, prey % W, (prey / W) | 0);
        }
      } else b.mode = 'back';
      if (b.mode === 'back') d = this.towards(p, p.anchor % W, (p.anchor / W) | 0);
    }
    // never into a wall or my own trail: look two cells ahead, then take any free way (back toward home first)
    if (!this.clear(p, d, 1) || (!this.clear(p, d, 2) && rng() < 0.7)) {
      const back = this.towards(p, p.anchor % W, (p.anchor / W) | 0);
      const order = [back, ...turnsFor.filter((t) => t !== back)];
      let found = -1;
      for (const t of order) if (t !== ((p.dir + 2) & 3) && this.clear(p, t, 2)) { found = t; break; }
      if (found < 0) for (const t of order) if (t !== ((p.dir + 2) & 3) && this.clear(p, t, 1)) { found = t; break; }
      if (found >= 0) { d = found; b.legs = []; b.cur = null; b.mode = 'back'; }
    }
    want(d);
  }

  /** the direction that closes the larger gap to (x, y), without turning back on itself */
  towards(p, x, y) {
    const dx = x - p.x, dy = y - p.y;
    const horiz = dx > 0 ? 1 : 3, vert = dy > 0 ? 2 : 0;
    const pref = Math.abs(dx) >= Math.abs(dy) ? [horiz, vert] : [vert, horiz];
    for (const d of pref) {
      if ((dx === 0 && (d === 1 || d === 3)) || (dy === 0 && (d === 0 || d === 2))) continue;
      if (d !== ((p.dir + 2) & 3) && this.clear(p, d, 1)) return d;
    }
    return p.dir;
  }

  /** the nearest cell of someone else's trail within r cells (or 0) */
  nearTrail(p, r) {
    let best = 0, bd = 1e9;
    const x0 = Math.max(0, p.x - r), x1 = Math.min(W - 1, p.x + r), y0 = Math.max(0, p.y - r), y1 = Math.min(H - 1, p.y + r);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = this.trl[y * W + x];
        if (t && t !== p.id) { const d = Math.abs(x - p.x) + Math.abs(y - p.y); if (d < bd) { bd = d; best = y * W + x; } }
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ what is sent
  /** the changes of this tick (and clears them) */
  flush() {
    const p = [];
    for (const q of this.players.values()) if (q.alive) p.push([q.id, q.x, q.y, q.dir]);
    const msg = { t: 'tick', n: this.tick, p, own: runsOf(this.own, this.dirtyOwn), trl: runsOf(this.trl, this.dirtyTrl), ev: this.ev };
    this.dirtyOwn = []; this.dirtyTrl = []; this.ev = { j: [], l: [], k: [], d: [] };
    return msg;
  }

  /** the whole world, for somebody who just arrived */
  snapshot() {
    const players = [];
    for (const q of this.players.values()) players.push([q.id, q.name, q.skin, q.human ? 1 : 0, q.alive ? 1 : 0, q.x, q.y, q.dir]);
    return { t: 'init', w: W, h: H, tick: this.tick, tickMs: TICK_MS, own: rle(this.own), trl: rle(this.trl), players, humans: this.humans(), bots: this.bots() };
  }

  /** the end-of-game numbers of a person who is out */
  report(id) {
    const p = this.players.get(id);
    if (!p) return null;
    const killer = this.players.get(p.killedBy);
    return { t: 'dead', by: killer ? killer.name : '', kills: p.kills, peak: p.peak, secs: Math.round((this.tick - p.born) * TICK_MS / 1000) };
  }
}
