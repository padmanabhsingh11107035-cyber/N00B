// Paperfield: the game's screen (drawing, controls, menu). The rules are sim.js: on the server in the big shared lobby, or right here (only bots) when the server is out of reach.
// The land is a fine grid, but it is drawn as smooth outlines (marching squares over a softened copy of each player's land), and heads and trails move freely, so everything is curved.
import { World, TICK_MS, GW, GH, UNITS, CELL, SKINS } from './sim.js';
import { SKIN_LIST, patternTile, drawHead, roundRect } from './skins.js';

const $ = (id) => document.getElementById(id);
const canvas = $('c'), ctx = canvas.getContext('2d');
const mini = $('mini'), mctx = mini.getContext('2d');
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage refused */ } } };

// ---------------------------------------------------------------------------------------------------------------- state
const S = {
  own: new Uint8Array(GW * GH), counts: new Int32Array(256), skinOf: new Uint8Array(256), ver: 0,
  pl: new Map(), you: 0, tickMs: TICK_MS, lastTick: 0, mode: 'menu', online: false, humans: 0, bots: 0, total: GW * GH,
  cam: { x: UNITS / 2, y: UNITS / 2 }, skin: Math.min(99, Math.max(0, parseInt(store.get('paperfield_skin', String((Math.random() * 100) | 0)), 10) || 0)),
  parts: [], pops: [], sound: store.get('paperfield_sound', '1') !== '0', lastScore: 0, deadTimer: 0, kills: 0, want: 0, sentAt: 0, sentAng: 99,
};
let net = null;
const nameInput = $('name');
nameInput.value = store.get('paperfield_name', '');
{ const m = /[#&]noob-name=([^&]+)/.exec(location.hash); if (m && !nameInput.value) { try { nameInput.value = decodeURIComponent(m[1]).replace(/[<>]/g, '').slice(0, 16); } catch (e) { /* bad text: keep it empty */ } } }

// ---------------------------------------------------------------------------------------------------------------- sound (small and simple; off with the speaker button)
let ac = null;
function beep(freq, dur, type, vol, slide) {
  if (!S.sound) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    if (slide) o.frequency.linearRampToValueAtTime(slide, ac.currentTime + dur);
    g.gain.value = vol || 0.06; g.gain.linearRampToValueAtTime(0, ac.currentTime + dur);
    o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + dur);
  } catch (e) { /* no sound */ }
}
const sfx = { claim: () => { beep(520, 0.12, 'triangle', 0.07, 780); setTimeout(() => beep(780, 0.14, 'triangle', 0.06, 1040), 90); }, kill: () => beep(260, 0.2, 'square', 0.05, 120), die: () => beep(300, 0.5, 'sawtooth', 0.06, 70) };
$('snd').textContent = S.sound ? '🔊' : '🔇';
$('snd').addEventListener('click', () => { S.sound = !S.sound; store.set('paperfield_sound', S.sound ? '1' : '0'); $('snd').textContent = S.sound ? '🔊' : '🔇'; });

// ---------------------------------------------------------------------------------------------------------------- skins screen
function paintSkin(c, skin) {
  const n = 54;
  c.width = c.height = n * 2;
  const g = c.getContext('2d');
  g.scale(2, 2);
  g.fillStyle = '#e6f7ef'; g.fillRect(0, 0, n, n);
  const blob = () => { roundRect(g, 3, 8, n - 6, n - 10, 16); };
  g.fillStyle = skin.dark; g.save(); g.translate(0, 3); blob(); g.fill(); g.restore();
  g.fillStyle = skin.base; blob(); g.fill();
  const tile = patternTile(skin);
  if (tile) { g.save(); blob(); g.clip(); const pt = g.createPattern(tile, 'repeat'); try { pt.setTransform(new DOMMatrix().scale(0.42)); } catch (e) { /* no pattern transform */ } g.fillStyle = pt; g.fillRect(0, 0, n, n); g.restore(); }
  drawHead(g, skin, n / 2, n / 2 + 1, 11, 0.3);
}
function buildSkins() {
  const grid = $('skinGrid');
  grid.textContent = '';
  for (const skin of SKIN_LIST) {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.i = String(skin.id);
    const c = document.createElement('canvas');
    b.appendChild(c); b.appendChild(document.createTextNode(skin.name));
    paintSkin(c, skin);
    b.addEventListener('click', () => chooseSkin(skin.id));
    grid.appendChild(b);
  }
  markSkin();
}
function markSkin() { for (const b of $('skinGrid').children) b.classList.toggle('on', Number(b.dataset.i) === S.skin); }
function chooseSkin(i) { S.skin = i; store.set('paperfield_skin', String(i)); markSkin(); showSkin(); }
function showSkin() { const k = SKIN_LIST[S.skin]; $('skinSw').style.background = k.base; $('skinName').textContent = k.name; }
function openSkins() { if (!$('skinGrid').children.length) buildSkins(); $('skins').hidden = false; const on = $('skinGrid').querySelector('.on'); if (on) on.scrollIntoView({ block: 'center' }); }
$('skinBtn').addEventListener('click', openSkins);
$('deadSkins').addEventListener('click', openSkins);
$('skinsClose').addEventListener('click', () => { $('skins').hidden = true; });
showSkin();

// ---------------------------------------------------------------------------------------------------------------- the lobby (server, or offline)
function decodeRle(arr, into) {
  let p = 0;
  for (let i = 0; i < arr.length; i += 2) { const v = arr[i], n = arr[i + 1]; into.fill(v, p, p + n); p += n; }
}
const mkPlayer = (id, name, skin, human, alive, x, y, a, trail) => ({ id, name, skin, human: !!human, alive: !!alive, x0: x, y0: y, x1: x, y1: y, a0: a, a1: a, trail: trail || [], inside: true, fresh: true });

function onInit(m) {
  decodeRle(m.own, S.own);
  S.counts.fill(0);
  for (let i = 0; i < S.own.length; i++) S.counts[S.own[i]]++;
  S.counts[0] = 0;
  S.ver++;
  S.pl.clear();
  S.tickMs = m.tickMs || TICK_MS;
  for (const [id, name, skin, human, alive, x, y, a, trail] of m.players) {
    const p = mkPlayer(id, name, skin, human, alive, x / 10, y / 10, a / 100, (trail || []).map((v) => v / 10));
    p.inside = !p.trail.length;
    S.pl.set(id, p);
    S.skinOf[id] = skin;
  }
  S.humans = m.humans || 0; S.bots = m.bots || 0;
  S.lastTick = performance.now();
  setStatus();
}

function onTick(m) {
  const now = performance.now();
  for (let i = 0; i < m.own.length; i += 3) {
    const s = m.own[i], n = m.own[i + 1], v = m.own[i + 2];
    for (let c = s; c < s + n; c++) { const o = S.own[c]; if (o !== v) { S.counts[o]--; S.counts[v]++; S.own[c] = v; } }
  }
  if (m.own.length) S.ver++;
  S.counts[0] = 0;
  const ev = m.ev || {};
  for (const [id, name, skin, human] of ev.j || []) {
    const p = S.pl.get(id);
    if (p) { p.name = name; p.skin = skin; p.human = !!human; p.alive = true; p.fresh = true; p.trail = []; } else S.pl.set(id, mkPlayer(id, name, skin, human, true, 0, 0, 0));
    S.skinOf[id] = skin;
  }
  const seen = new Set();
  for (const [id, X, Y, A] of m.p) {
    const x = X / 10, y = Y / 10, a = A / 100;
    let p = S.pl.get(id);
    if (!p) { p = mkPlayer(id, 'Player', id % SKINS, false, true, x, y, a); S.pl.set(id, p); }
    seen.add(id);
    if (p.fresh || !p.alive || Math.abs(x - p.x1) + Math.abs(y - p.y1) > 4) { p.x0 = x; p.y0 = y; p.a0 = a; p.trail = []; p.inside = true; } else { p.x0 = p.x1; p.y0 = p.y1; p.a0 = p.a1; }
    // the trail: points of the way outside the land (the same rule as the server's)
    const c = Math.floor(y / CELL) * GW + Math.floor(x / CELL);
    const inLand = c >= 0 && c < S.own.length && S.own[c] === id;
    if (inLand) { p.trail.length = 0; p.inside = true; }
    else {
      const t = p.trail;
      if (!t.length) t.push(p.x0, p.y0);
      const lx = t[t.length - 2], ly = t[t.length - 1];
      if ((x - lx) * (x - lx) + (y - ly) * (y - ly) > 0.09) t.push(x, y);
      p.inside = false;
    }
    p.x1 = x; p.y1 = y; p.a1 = a; p.alive = true; p.fresh = false;
  }
  for (const p of S.pl.values()) if (!seen.has(p.id)) { if (p.alive) p.trail = []; p.alive = false; }
  for (const [killer, victim] of ev.k || []) {
    const v = S.pl.get(victim), k = S.pl.get(killer);
    if (!v) continue;
    burst(v, 18);
    v.trail = [];
    if (victim === S.you) sfx.die();
    else if (killer === S.you) { S.kills++; sfx.kill(); feed(`You eliminated ${v.name}`); }
    else if (v.human || (k && k.human)) feed(`${k ? k.name : 'The wall'} eliminated ${v.name}`);
  }
  for (const id of ev.l || []) S.pl.delete(id);
  if (m.hu != null) S.humans = m.hu;
  S.lastTick = now;
  // my own land grew: a cheer
  if (S.you && S.mode === 'playing') {
    const mine = S.counts[S.you], gain = mine - S.lastScore;
    if (gain > 160) {
      sfx.claim();
      const me = S.pl.get(S.you);
      S.pops.push({ text: gain > 2400 ? 'AMAZING!' : gain > 800 ? 'GREAT!' : 'NICE!', t: now, x: me ? me.x1 : 0, y: me ? me.y1 : 0 });
    }
    S.lastScore = mine;
  }
}

function handle(m) {
  if (m.t === 'init') onInit(m);
  else if (m.t === 'tick') onTick(m);
  else if (m.t === 'you') { S.you = m.id; S.lastScore = 0; S.kills = 0; S.sentAng = 99; S.spawnAt = performance.now(); startPlaying(); }
  else if (m.t === 'dead') onDead(m);
  else if (m.t === 'full') { setStatus('The lobby is full right now. Try again in a moment.'); $('play').disabled = false; $('play').textContent = 'Play'; }
}

/** the real lobby on the server */
class OnlineLobby {
  constructor(onReady, onFail) {
    this.ready = false; this.closed = false;
    const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/paperfield';
    let ws;
    try { ws = new WebSocket(url); } catch (e) { onFail(); return; }
    this.ws = ws;
    const timer = setTimeout(() => { if (!this.ready) { this.closed = true; try { ws.close(); } catch (e) { /* ignore */ } onFail(); } }, 6000);
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch (x) { return; }
      if (m.t === 'init' && !this.ready) { this.ready = true; clearTimeout(timer); handle(m); onReady(); return; }
      handle(m);
    };
    ws.onclose = ws.onerror = () => {
      clearTimeout(timer);
      if (this.closed) return;
      this.closed = true;
      if (!this.ready) onFail(); else lost();
    };
  }
  send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  stop() { this.closed = true; try { this.ws.close(); } catch (e) { /* ignore */ } }
}

/** the same world, in this page, with bots only (when the server cannot be reached) */
class OfflineLobby {
  constructor(onReady) {
    this.world = new World({ targetPop: 60, minBots: 60 });
    this.world.balanceBots();
    this.you = 0;
    handle(this.world.snapshot());
    this.timer = setInterval(() => this.tick(), TICK_MS);
    setTimeout(onReady, 0);
  }
  tick() {
    const w = this.world;
    w.step();
    const m = w.flush();
    m.hu = w.humans();
    handle(m);
    if (this.you && m.ev.d.includes(this.you)) { const r = w.report(this.you); if (r) handle(r); }
  }
  send(m) {
    const w = this.world;
    if (m.t === 'join') {
      const name = String(m.name || 'Player').slice(0, 16);
      if (this.you && w.players.has(this.you)) { if (!w.players.get(this.you).alive) w.respawn(this.you, name, m.skin); }
      else this.you = w.addPlayer({ name, skin: m.skin | 0, human: true });
      handle({ t: 'you', id: this.you });
    } else if (m.t === 'ang' && this.you) w.steer(this.you, m.a / 100);
  }
  stop() { clearInterval(this.timer); }
}

function connect() {
  if (net) net.stop();
  S.online = false;
  setStatus('Connecting to the big lobby…');
  $('play').disabled = true; $('play').textContent = 'Connecting…';
  net = new OnlineLobby(() => { S.online = true; readyUi(); }, () => {
    net = new OfflineLobby(() => { S.online = false; readyUi(); });
  });
}
function readyUi() { $('play').disabled = false; $('play').textContent = S.mode === 'menu' ? 'Play' : 'Play again'; setStatus(); }
function lost() {
  S.mode = 'menu'; S.you = 0;
  $('dead').hidden = true; $('hud').hidden = true; $('menu').hidden = false;
  setStatus('The connection was lost. Press Play to join again.');
  connect();
}
function setStatus(text) {
  const el = $('status');
  if (text) { el.textContent = text; return; }
  if (S.online) { const people = Math.max(0, S.humans), bots = Math.max(0, S.pl.size - people); el.textContent = `Big lobby: ${people} ${people === 1 ? 'player' : 'players'} + ${bots} bots online`; }
  else el.textContent = 'Offline lobby: you against bots (no connection to the big lobby)';
}

// ---------------------------------------------------------------------------------------------------------------- menu, game over
function startPlaying() {
  S.mode = 'playing';
  $('menu').hidden = true; $('dead').hidden = true; $('hud').hidden = false;
  const me = S.pl.get(S.you);
  if (me) { S.cam.x = me.x1; S.cam.y = me.y1; S.want = me.a1; }
  clearTimeout(S.deadTimer);
}
function play() {
  if (!net) return;
  const name = nameInput.value.trim().replace(/[<>]/g, '').slice(0, 16);
  store.set('paperfield_name', name);
  beep(1, 0.001); // wakes the sound on the first tap
  net.send({ t: 'join', name: name || 'Player', skin: S.skin });
}
function pct(n) { const v = (n / S.total) * 100; return (v >= 10 ? v.toFixed(1) : v.toFixed(2)) + '%'; }
function onDead(m) {
  if (S.mode !== 'playing') return;
  S.mode = 'dead';
  clearTimeout(S.deadTimer);
  S.deadTimer = setTimeout(() => {
    $('deadBy').textContent = m.by ? `Eliminated by ${m.by}` : 'You hit a wall or your own trail';
    $('dPeak').textContent = pct(m.peak); $('dKills').textContent = String(m.kills); $('dTime').textContent = m.secs >= 60 ? `${Math.floor(m.secs / 60)}m ${m.secs % 60}s` : `${m.secs}s`;
    $('dead').hidden = false; $('hud').hidden = true;
  }, 900);
}
$('play').addEventListener('click', play);
$('again').addEventListener('click', () => { $('again').blur(); play(); });
$('deadMenu').addEventListener('click', () => { S.mode = 'menu'; $('dead').hidden = true; $('menu').hidden = false; $('play').textContent = 'Play'; setStatus(); });
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') play(); e.stopPropagation(); });

// ---------------------------------------------------------------------------------------------------------------- controls: drag anywhere (like a stick) or the arrow keys; the head turns smoothly toward where you point
function steer(a, force) {
  if (S.mode !== 'playing' || !S.you) return;
  S.want = a;
  const now = performance.now();
  let d = Math.abs(a - S.sentAng); if (d > Math.PI) d = 2 * Math.PI - d;
  if (!force && (d < 0.05 || now - S.sentAt < 40)) return;
  S.sentAt = now; S.sentAng = a;
  net.send({ t: 'ang', a: Math.round(a * 100) });
}
const down = new Set();
const KEYS = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowRight: [1, 0], KeyD: [1, 0], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0] };
function keyDir() {
  let x = 0, y = 0;
  for (const k of down) { x += KEYS[k][0]; y += KEYS[k][1]; }
  if (x || y) steer(Math.atan2(y, x), true);
}
window.addEventListener('keydown', (e) => {
  if (e.target === nameInput) return;
  if (e.code in KEYS) { e.preventDefault(); down.add(e.code); keyDir(); }
  else if ((e.code === 'Enter' || e.code === 'Space') && !$('menu').hidden && !$('play').disabled) { e.preventDefault(); play(); }
  else if ((e.code === 'Enter' || e.code === 'Space') && !$('dead').hidden) { e.preventDefault(); play(); }
});
window.addEventListener('keyup', (e) => { if (e.code in KEYS) { down.delete(e.code); keyDir(); } });
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } });
canvas.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  const len = Math.hypot(dx, dy);
  if (len < 9) return;
  steer(Math.atan2(dy, dx));
  // the stick follows the finger when it goes far, so a turn-around is always a short move
  if (len > 64) { drag.x = e.clientX - (dx / len) * 64; drag.y = e.clientY - (dy / len) * 64; }
});
const endDrag = () => { drag = null; };
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
document.addEventListener('touchmove', (e) => { if (e.target === canvas) e.preventDefault(); }, { passive: false });

// ---------------------------------------------------------------------------------------------------------------- small effects
function burst(p, n) {
  const k = SKIN_LIST[p.skin] || SKIN_LIST[0];
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.2832, v = 2 + Math.random() * 7; S.parts.push({ x: p.x1, y: p.y1, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, c: i % 2 ? k.base : k.light }); }
  if (S.parts.length > 400) S.parts.splice(0, S.parts.length - 400);
}
function feed(text) {
  const box = $('feed'), d = document.createElement('div');
  d.textContent = text; box.appendChild(d);
  while (box.children.length > 3) box.removeChild(box.firstChild);
  setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 3500);
}

// ---------------------------------------------------------------------------------------------------------------- smooth land: an outline around each player's land (marching squares over a softened copy)
let territory = null;   // { ver, x0, y0, w, h, list: [{ id, path, bx0, by0, bx1, by1 }] } in grid cells
function buildTerritory(wx0, wy0, ww, wh) {
  const own = S.own, W2 = ww + 2, H2 = wh + 2;
  const masks = new Map();
  for (let j = 0; j < wh; j++) {
    const gy = wy0 + j;
    if (gy < 0 || gy >= GH) continue;
    const row = gy * GW;
    for (let i = 0; i < ww; i++) {
      const gx = wx0 + i;
      if (gx < 0 || gx >= GW) continue;
      const o = own[row + gx];
      if (!o) continue;
      let m = masks.get(o);
      if (!m) { m = { id: o, f: new Float32Array(W2 * H2), i0: i, i1: i, j0: j, j1: j }; masks.set(o, m); }
      m.f[(j + 1) * W2 + i + 1] = 1;
      if (i < m.i0) m.i0 = i; if (i > m.i1) m.i1 = i; if (j < m.j0) m.j0 = j; if (j > m.j1) m.j1 = j;
    }
  }
  const list = [];
  for (const m of masks.values()) {
    const f = m.f;
    const g = new Float32Array(f.length);
    // soften only around the land's own box (plus a border of two cells)
    const a0 = Math.max(0, m.i0 - 1), a1 = Math.min(W2 - 1, m.i1 + 3), b0 = Math.max(0, m.j0 - 1), b1 = Math.min(H2 - 1, m.j1 + 3);
    for (let j = b0; j <= b1; j++) {
      for (let i = a0; i <= a1; i++) {
        const k = j * W2 + i;
        const il = i > 0 ? -1 : 0, ir = i < W2 - 1 ? 1 : 0, ju = j > 0 ? -W2 : 0, jd = j < H2 - 1 ? W2 : 0;
        g[k] = (4 * f[k] + 2 * (f[k + il] + f[k + ir] + f[k + ju] + f[k + jd]) + f[k + il + ju] + f[k + ir + ju] + f[k + il + jd] + f[k + ir + jd]) / 16;
      }
    }
    const path = contour(g, W2, H2, a0, Math.min(W2 - 2, a1), b0, Math.min(H2 - 2, b1), wx0, wy0);
    list.push({ id: m.id, path, bx0: wx0 + m.i0, by0: wy0 + m.j0, bx1: wx0 + m.i1 + 1, by1: wy0 + m.j1 + 1 });
  }
  return { ver: S.ver, x0: wx0, y0: wy0, w: ww, h: wh, list };
}

// the line segments of a square, by its corner pattern (a = top left 1, b = top right 2, c = bottom right 4, d = bottom left 8); edges: 0 top, 1 right, 2 bottom, 3 left
const SEG = [[], [[3, 0]], [[0, 1]], [[3, 1]], [[1, 2]], null, [[0, 2]], [[3, 2]], [[3, 2]], [[0, 2]], null, [[1, 2]], [[3, 1]], [[0, 1]], [[3, 0]], []];
function contour(g, W2, H2, i0, i1, j0, j1, wx0, wy0) {
  const pts = new Map(), adj = new Map();
  const edgeKey = (i, j, e) => (e === 0 ? 2 * (j * W2 + i) : e === 2 ? 2 * ((j + 1) * W2 + i) : e === 3 ? 2 * (j * W2 + i) + 1 : 2 * (j * W2 + i + 1) + 1);
  const point = (i, j, e, k) => {
    if (pts.has(k)) return;
    let ax, ay, bx, by;
    if (e === 0) { ax = i; ay = j; bx = i + 1; by = j; } else if (e === 1) { ax = i + 1; ay = j; bx = i + 1; by = j + 1; } else if (e === 2) { ax = i; ay = j + 1; bx = i + 1; by = j + 1; } else { ax = i; ay = j; bx = i; by = j + 1; }
    const va = g[ay * W2 + ax], vb = g[by * W2 + bx];
    const t = vb === va ? 0.5 : (0.5 - va) / (vb - va);
    pts.set(k, [wx0 + (ax + (bx - ax) * t) - 0.5, wy0 + (ay + (by - ay) * t) - 0.5]);
  };
  const link = (a, b) => { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); };
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const a = g[j * W2 + i], b = g[j * W2 + i + 1], c = g[(j + 1) * W2 + i + 1], d = g[(j + 1) * W2 + i];
      const cs = (a >= 0.5 ? 1 : 0) | (b >= 0.5 ? 2 : 0) | (c >= 0.5 ? 4 : 0) | (d >= 0.5 ? 8 : 0);
      if (cs === 0 || cs === 15) continue;
      let segs = SEG[cs];
      if (!segs) {
        const mid = (a + b + c + d) / 4 >= 0.5;
        if (cs === 5) segs = mid ? [[0, 1], [3, 2]] : [[3, 0], [1, 2]];
        else segs = mid ? [[3, 0], [1, 2]] : [[0, 1], [3, 2]];
      }
      for (const [e1, e2] of segs) {
        const k1 = edgeKey(i, j, e1), k2 = edgeKey(i, j, e2);
        point(i, j, e1, k1); point(i, j, e2, k2); link(k1, k2);
      }
    }
  }
  const path = new Path2D();
  const seen = new Set();
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let prev = -1, cur = start;
    for (let guard = 0; guard < 400000; guard++) {
      seen.add(cur); loop.push(pts.get(cur));
      const nb = adj.get(cur);
      let nxt = -1;
      for (const q of nb) if (q !== prev && !seen.has(q)) { nxt = q; break; }
      if (nxt === -1) break;
      prev = cur; cur = nxt;
    }
    const n = loop.length;
    if (n < 3) continue;
    // a smooth closed curve through the middles of the segments
    const m0 = mid(loop[n - 1], loop[0]);
    path.moveTo(m0[0], m0[1]);
    for (let k = 0; k < n; k++) { const mm = mid(loop[k], loop[(k + 1) % n]); path.quadraticCurveTo(loop[k][0], loop[k][1], mm[0], mm[1]); }
    path.closePath();
  }
  return path;
}

// ---------------------------------------------------------------------------------------------------------------- drawing
let cw = 0, ch = 0, dpr = 1;
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cw = window.innerWidth; ch = window.innerHeight;
  canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
}
window.addEventListener('resize', resize);
resize();

let camScale = 0;
function leaders() {
  const arr = [];
  for (const p of S.pl.values()) if (p.alive || S.counts[p.id] > 0) arr.push(p);
  arr.sort((a, b) => S.counts[b.id] - S.counts[a.id]);
  return arr;
}
const angLerp = (a, b, f) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * f; };

function drawWorld(now, dt) {
  const f = Math.min(1, (now - S.lastTick) / S.tickMs);
  const rpos = (p) => [p.x0 + (p.x1 - p.x0) * f, p.y0 + (p.y1 - p.y0) * f];
  let focus = S.you ? S.pl.get(S.you) : null;
  if (S.mode === 'menu' || !focus) focus = leaders().find((p) => p.alive);
  if (focus && (focus.alive || S.mode === 'dead')) {
    const [fx, fy] = rpos(focus);
    const k = 1 - Math.pow(0.002, dt);
    S.cam.x += (fx - S.cam.x) * k; S.cam.y += (fy - S.cam.y) * k;
  }
  const mine = S.you && S.mode !== 'menu' ? S.counts[S.you] : 0;
  const viewUnits = S.mode === 'menu' ? 26 : 15 + Math.min(15, Math.sqrt(mine) * 0.13);
  const target = Math.min(cw, ch) / viewUnits;
  if (!camScale) camScale = target; else camScale += (target - camScale) * (1 - Math.pow(0.03, dt));
  const cs = camScale;                                  // pixels per unit
  const ox = cw / 2 - S.cam.x * cs, oy = ch / 2 - S.cam.y * cs;   // field (0, 0) on the screen

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#21404a'; ctx.fillRect(0, 0, cw, ch);
  ctx.fillStyle = '#e6f7ef'; ctx.fillRect(ox, oy, UNITS * cs, UNITS * cs);
  // a very soft texture so movement is easy to see on the empty field
  ctx.strokeStyle = 'rgba(40,120,100,.07)'; ctx.lineWidth = 1; ctx.beginPath();
  const step = 4 * cs, fx0 = Math.max(0, ox), fx1 = Math.min(cw, ox + UNITS * cs), fy0 = Math.max(0, oy), fy1 = Math.min(ch, oy + UNITS * cs);
  for (let x = ox + Math.ceil((fx0 - ox) / step) * step; x <= fx1; x += step) { ctx.moveTo(Math.round(x) + 0.5, fy0); ctx.lineTo(Math.round(x) + 0.5, fy1); }
  for (let y = oy + Math.ceil((fy0 - oy) / step) * step; y <= fy1; y += step) { ctx.moveTo(fx0, Math.round(y) + 0.5); ctx.lineTo(fx1, Math.round(y) + 0.5); }
  ctx.stroke();

  // land: smooth outlines, rebuilt when the land changed or the view left the prepared area
  const cellPx = cs * CELL;
  const vx0 = Math.floor(-ox / cellPx), vx1 = Math.ceil((cw - ox) / cellPx), vy0 = Math.floor(-oy / cellPx), vy1 = Math.ceil((ch - oy) / cellPx);
  const T = territory;
  if (!T || T.ver !== S.ver || vx0 < T.x0 + 3 || vy0 < T.y0 + 3 || vx1 > T.x0 + T.w - 3 || vy1 > T.y0 + T.h - 3) {
    const px = 18;
    territory = buildTerritory(vx0 - px, vy0 - px, vx1 - vx0 + 2 * px, vy1 - vy0 + 2 * px);
  }
  const lip = 0.34 / CELL;   // the 3D edge, in cells
  ctx.save();
  ctx.translate(ox, oy); ctx.scale(cellPx, cellPx);
  for (const t of territory.list) {
    if (t.bx1 < vx0 - 2 || t.bx0 > vx1 + 2 || t.by1 < vy0 - 2 || t.by0 > vy1 + 2) continue;
    const k = SKIN_LIST[S.skinOf[t.id]];
    ctx.save(); ctx.translate(0, lip); ctx.fillStyle = k.dark; ctx.fill(t.path, 'evenodd'); ctx.restore();
    ctx.fillStyle = k.base; ctx.fill(t.path, 'evenodd');
    const tile = patternTile(k);
    if (tile) {
      ctx.save(); ctx.clip(t.path, 'evenodd');
      const pt = ctx.createPattern(tile, 'repeat');
      try { pt.setTransform(new DOMMatrix().scale(4 / 64)); } catch (e) { /* no pattern transform */ }
      ctx.fillStyle = pt; ctx.fillRect(Math.max(vx0, t.bx0) - 2, Math.max(vy0, t.by0) - 2, Math.min(vx1, t.bx1) - Math.max(vx0, t.bx0) + 4, Math.min(vy1, t.by1) - Math.max(vy0, t.by0) + 4);
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 0.16; ctx.stroke(t.path);
  }
  ctx.restore();
  // the edge of the field
  ctx.strokeStyle = '#0d2128'; ctx.lineWidth = 6;
  ctx.strokeRect(ox - 3, oy - 3, UNITS * cs + 6, UNITS * cs + 6);

  // trails (smooth lines that end at the head)
  const vis = [];
  const x0 = vx0 * CELL - 3, x1 = vx1 * CELL + 3, y0 = vy0 * CELL - 3, y1 = vy1 * CELL + 3;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const p of S.pl.values()) {
    if (!p.alive) continue;
    const [px, py] = rpos(p);
    const k = SKIN_LIST[p.skin] || SKIN_LIST[0];
    const t = p.trail;
    if (t.length >= 2 && !p.inside) {
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        ctx.moveTo(ox + t[0] * cs, oy + t[1] * cs);
        for (let q = 2; q < t.length; q += 2) ctx.lineTo(ox + t[q] * cs, oy + t[q + 1] * cs);
        ctx.lineTo(ox + px * cs, oy + py * cs);
        ctx.lineWidth = (pass ? 0.7 : 0.9) * cs; ctx.strokeStyle = pass ? k.light : k.dark; ctx.globalAlpha = pass ? 0.95 : 0.35;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (px >= x0 && px <= x1 && py >= y0 && py <= y1) vis.push([p, px, py, angLerp(p.a0, p.a1, f)]);
  }
  // heads and names (the lower ones in front)
  vis.sort((a, b) => a[2] - b[2]);
  for (const [p, px, py, ang] of vis) {
    const k = SKIN_LIST[p.skin] || SKIN_LIST[0];
    const sx = ox + px * cs, sy = oy + py * cs, r = cs * 0.62;
    ctx.fillStyle = 'rgba(0,0,0,.2)';
    ctx.beginPath(); ctx.ellipse(sx, sy + r * 0.95, r * 0.95, r * 0.35, 0, 0, 6.2832); ctx.fill();
    if (p.id === S.you && S.mode === 'playing' && now - S.spawnAt < 6000) {   // the short shield of a new player
      ctx.strokeStyle = `rgba(255,255,255,${0.45 + 0.35 * Math.sin(now / 120)})`; ctx.lineWidth = Math.max(2, cs * 0.14);
      ctx.beginPath(); ctx.arc(sx, sy, r * 1.55, 0, 6.2832); ctx.stroke();
    }
    drawHead(ctx, k, sx, sy, r, ang);
    ctx.font = `800 ${Math.max(11, cs * 0.55)}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,36,44,.8)'; ctx.strokeText(p.name, sx, sy - r * 1.35);
    ctx.fillStyle = p.id === S.you && S.mode !== 'menu' ? '#fff3a8' : '#fff'; ctx.fillText(p.name, sx, sy - r * 1.35);
  }
  // sparks
  for (let i = S.parts.length - 1; i >= 0; i--) {
    const q = S.parts[i];
    q.life -= dt * 1.5;
    if (q.life <= 0) { S.parts.splice(i, 1); continue; }
    q.x += q.vx * dt; q.y += q.vy * dt;
    ctx.globalAlpha = Math.max(0, q.life); ctx.fillStyle = q.c;
    ctx.beginPath(); ctx.arc(ox + q.x * cs, oy + q.y * cs, cs * 0.22 * q.life + 1.5, 0, 6.2832); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // "NICE!" and the like
  for (let i = S.pops.length - 1; i >= 0; i--) {
    const q = S.pops[i], age = (now - q.t) / 1100;
    if (age >= 1) { S.pops.splice(i, 1); continue; }
    const sx = ox + q.x * cs, sy = oy + q.y * cs - cs * (1.8 + age * 2.4);
    ctx.globalAlpha = Math.min(1, (1 - age) * 2);
    ctx.font = `900 ${cs * (1.1 + Math.sin(Math.min(1, age * 4) * 3.14) * 0.35)}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.lineWidth = 5; ctx.strokeStyle = '#3b3b9a'; ctx.strokeText(q.text, sx, sy);
    ctx.fillStyle = '#fff'; ctx.fillText(q.text, sx, sy);
  }
  ctx.globalAlpha = 1;
}

let lastHud = 0, lastMini = 0;
function updateHud(now) {
  if (S.mode === 'menu') { if (now - lastHud > 1500) { lastHud = now; setStatus(); } return; }
  if (now - lastHud > 200) {
    lastHud = now;
    const list = leaders();
    const me = S.you;
    const mc = S.counts[me] || 0;
    const mp = (mc / S.total) * 100;
    $('meScore').textContent = (mp >= 10 ? mp.toFixed(0) : mp.toFixed(1)) + '%';
    $('barFill').style.width = Math.max(4, Math.min(100, mp * 2.2)) + '%';
    $('barFill').style.background = SKIN_LIST[S.skin].base;
    $('kills').textContent = String(S.kills);
    const rank = list.findIndex((p) => p.id === me) + 1;
    const top = list.slice(0, 5), best = Math.max(1, S.counts[(top[0] || {}).id] || 1);
    const box = $('board');
    box.textContent = '';
    const addRow = (p, place) => {
      const r = document.createElement('div'); r.className = 'r' + (p.id === me ? ' me' : '');
      const k = SKIN_LIST[p.skin];
      const ic = document.createElement('i'); ic.style.background = k.base; ic.style.boxShadow = `inset 0 -5px 0 ${k.dark}`; ic.textContent = String(place);
      const bar = document.createElement('div'); bar.className = 'b'; bar.style.background = k.base; bar.style.width = (34 + (S.counts[p.id] / best) * 66) + '%';
      const nm = document.createElement('small'); nm.textContent = p.name;
      const s = document.createElement('b'); s.textContent = pct(S.counts[p.id]);
      bar.appendChild(nm); bar.appendChild(s);
      r.appendChild(ic); r.appendChild(bar); box.appendChild(r);
    };
    top.forEach((p, i) => addRow(p, i + 1));
    const mpl = S.pl.get(me);
    if (rank > 5 && mpl) addRow(mpl, rank);
  }
  if (now - lastMini > 500) { lastMini = now; drawMini(); }
}
let miniImg = null;
function drawMini() {
  const n = 96, step = GW / n;
  if (!miniImg) miniImg = mctx.createImageData(n, n);
  const d = miniImg.data;
  const rgb = [];
  for (const k of SKIN_LIST) { const v = parseInt(k.base.slice(1), 16); rgb.push([(v >> 16) & 255, (v >> 8) & 255, v & 255]); }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const o = S.own[((y * step) | 0) * GW + ((x * step) | 0)];
    const i = (y * n + x) * 4;
    if (o) { const c = rgb[S.skinOf[o]]; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; }
    else { d[i] = 238; d[i + 1] = 250; d[i + 2] = 245; d[i + 3] = 170; }
  }
  mctx.putImageData(miniImg, 0, 0);
  const me = S.pl.get(S.you);
  if (me && me.alive) { mctx.fillStyle = '#fff'; mctx.strokeStyle = '#111'; mctx.lineWidth = 2; mctx.beginPath(); mctx.arc(me.x1 / UNITS * n, me.y1 / UNITS * n, 4, 0, 6.2832); mctx.fill(); mctx.stroke(); }
}

let prev = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - prev) / 1000);
  prev = now;
  try { drawWorld(now, dt); updateHud(now); } catch (e) { console.error(e); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

connect();
window.__paperfield = { S, handle, connect, get net() { return net; } };

// Poster mode: a link ending in #poster=menu, #poster=play or #poster=skins prepares the offline world for the store pictures on the Games page (nothing else uses it).
(function () {
  const m = /#poster=(\w+)/.exec(location.hash);
  if (!m) return;
  const wait = setInterval(() => {
    if (!net || !net.world) return;
    clearInterval(wait);
    const w = net.world;
    for (let i = 0; i < 900; i++) { w.step(); w.flush(); }
    handle(w.snapshot());
    if (m[1] === 'play') {
      S.skin = 9; showSkin();
      nameInput.value = 'You'; play();
      const plan = [[0, 18], [1.6, 20], [3.14, 26], [-1.55, 34], [0, 12]];
      for (const [a, n] of plan) { net.send({ t: 'ang', a: Math.round(a * 100) }); for (let i = 0; i < n; i++) net.tick(); }
    } else if (m[1] === 'skins') openSkins();
  }, 100);
})();
