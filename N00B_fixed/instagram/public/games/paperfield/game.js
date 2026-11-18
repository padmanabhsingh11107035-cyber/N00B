// Paperfield: the game's screen (drawing, controls, menu). The rules are sim.js: on the server in the big shared lobby, or right here (only bots) when the server is out of reach.
import { World, TICK_MS, W as SW, H as SH, SKINS } from './sim.js';
import { SKIN_LIST, drawPattern, drawHead, roundRect } from './skins.js';

const $ = (id) => document.getElementById(id);
const canvas = $('c'), ctx = canvas.getContext('2d');
const mini = $('mini'), mctx = mini.getContext('2d');
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage refused */ } } };

// ---------------------------------------------------------------------------------------------------------------- state
const S = {
  w: SW, h: SH, own: new Uint8Array(SW * SH), trl: new Uint8Array(SW * SH), counts: new Int32Array(256), skinOf: new Uint8Array(256),
  pl: new Map(), you: 0, tickMs: TICK_MS, lastTick: 0, mode: 'menu', online: false, humans: 0, bots: 0, q: [], total: SW * SH,
  cam: { x: SW / 2, y: SH / 2 }, shake: 0, skin: Math.min(99, Math.max(0, parseInt(store.get('paperfield_skin', String((Math.random() * 100) | 0)), 10) || 0)),
  parts: [], sound: store.get('paperfield_sound', '1') !== '0', lastScore: 0, deadTimer: 0,
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
const sfx = { claim: () => { beep(520, 0.12, 'triangle', 0.07, 780); setTimeout(() => beep(780, 0.14, 'triangle', 0.06, 1040), 90); }, kill: () => beep(260, 0.2, 'square', 0.05, 120), die: () => beep(300, 0.5, 'sawtooth', 0.06, 70), turn: () => beep(900, 0.03, 'sine', 0.015) };
$('snd').textContent = S.sound ? '🔊' : '🔇';
$('snd').addEventListener('click', () => { S.sound = !S.sound; store.set('paperfield_sound', S.sound ? '1' : '0'); $('snd').textContent = S.sound ? '🔊' : '🔇'; });

// ---------------------------------------------------------------------------------------------------------------- skins screen
function paintSkin(c, skin) {
  const g = c.getContext('2d'), n = 54, cs = 18;
  c.width = c.height = n * 2; g.scale(2, 2);
  g.fillStyle = '#eef1f5'; g.fillRect(0, 0, n, n);
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
    g.fillStyle = skin.base; g.fillRect(x * cs, y * cs, cs + 0.5, cs + 0.5);
    drawPattern(g, skin, x, y, cs, x * cs, y * cs);
    if (y === 2) { g.fillStyle = skin.dark; g.fillRect(x * cs, y * cs + cs * 0.84, cs + 0.5, cs * 0.16); }
  }
  g.fillStyle = skin.light; g.fillRect(0, 0, cs * 3, cs * 0.5);
  drawHead(g, skin, cs * 1.05, cs * 0.55, cs * 0.9, 1);
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
    b.addEventListener('click', () => { chooseSkin(skin.id); });
    grid.appendChild(b);
  }
  markSkin();
}
function markSkin() { for (const b of $('skinGrid').children) b.classList.toggle('on', Number(b.dataset.i) === S.skin); }
function chooseSkin(i) {
  S.skin = i; store.set('paperfield_skin', String(i)); markSkin(); showSkin();
}
function showSkin() { const k = SKIN_LIST[S.skin]; $('skinSw').style.background = k.base; $('skinName').textContent = k.name; $('meSw').style.background = k.base; }
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

function onInit(m) {
  decodeRle(m.own, S.own); decodeRle(m.trl, S.trl);
  S.counts.fill(0);
  for (let i = 0; i < S.own.length; i++) S.counts[S.own[i]]++;
  S.counts[0] = 0;
  S.pl.clear();
  S.tickMs = m.tickMs || TICK_MS;
  for (const [id, name, skin, human, alive, x, y, dir] of m.players) {
    S.pl.set(id, { id, name, skin, human: !!human, alive: !!alive, x0: x, y0: y, x1: x, y1: y, dir });
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
  for (let i = 0; i < m.trl.length; i += 3) S.trl.fill(m.trl[i + 2], m.trl[i], m.trl[i] + m.trl[i + 1]);
  S.counts[0] = 0;
  const ev = m.ev || {};
  for (const [id, name, skin, human] of ev.j || []) {
    const p = S.pl.get(id);
    if (p) { p.name = name; p.skin = skin; p.human = !!human; p.alive = true; p.fresh = true; } else S.pl.set(id, { id, name, skin, human: !!human, alive: true, x0: 0, y0: 0, x1: 0, y1: 0, dir: 1, fresh: true });
    S.skinOf[id] = skin;
  }
  const seen = new Set();
  for (const [id, x, y, d] of m.p) {
    let p = S.pl.get(id);
    if (!p) { p = { id, name: 'Player', skin: id % SKINS, human: false, alive: true, x0: x, y0: y, x1: x, y1: y, dir: d }; S.pl.set(id, p); }
    seen.add(id);
    if (p.fresh || !p.alive || Math.abs(x - p.x1) + Math.abs(y - p.y1) > 2) { p.x0 = x; p.y0 = y; } else { p.x0 = p.x1; p.y0 = p.y1; }
    p.x1 = x; p.y1 = y; p.dir = d; p.alive = true; p.fresh = false;
  }
  for (const p of S.pl.values()) if (!seen.has(p.id)) p.alive = false;
  for (const [killer, victim] of ev.k || []) {
    const v = S.pl.get(victim), k = S.pl.get(killer);
    if (!v) continue;
    burst(v, 14);
    if (victim === S.you) sfx.die();
    else if (killer === S.you) { sfx.kill(); feed(`You eliminated ${v.name}`); }
    else if (v.human || (k && k.human)) feed(`${k ? k.name : 'The wall'} eliminated ${v.name}`);
  }
  for (const id of ev.l || []) S.pl.delete(id);
  if (m.hu != null) S.humans = m.hu;
  S.lastTick = now;
  if (S.q.length) S.q.shift();
  // my own land grew: a small sound
  if (S.you && S.mode === 'playing') {
    const mine = S.counts[S.you];
    if (mine > S.lastScore + 6) sfx.claim();
    S.lastScore = mine;
  }
}

function handle(m) {
  if (m.t === 'init') onInit(m);
  else if (m.t === 'tick') onTick(m);
  else if (m.t === 'you') { S.you = m.id; S.lastScore = 0; S.q = []; startPlaying(); }
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
    } else if (m.t === 'dir' && this.you) w.turn(this.you, m.d | 0);
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
function readyUi() {
  $('play').disabled = false; $('play').textContent = S.mode === 'menu' ? 'Play' : 'Play again';
  setStatus();
}
function lost() {
  // the connection dropped in the middle of a game
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
  S.cam.x = (S.pl.get(S.you) || { x1: S.cam.x }).x1; S.cam.y = (S.pl.get(S.you) || { y1: S.cam.y }).y1;
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

// ---------------------------------------------------------------------------------------------------------------- controls
function sendDir(d) {
  if (S.mode !== 'playing' || !S.you) return;
  const me = S.pl.get(S.you);
  if (!me || !me.alive) return;
  const ref = S.q.length ? S.q[S.q.length - 1] : me.dir;
  if (d === ref || d === ((ref + 2) & 3) || S.q.length >= 3) return;
  S.q.push(d);
  net.send({ t: 'dir', d });
  sfx.turn();
}
const KEYS = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
window.addEventListener('keydown', (e) => {
  if (e.target === nameInput) return;
  if (e.code in KEYS) { e.preventDefault(); sendDir(KEYS[e.code]); }
  else if ((e.code === 'Enter' || e.code === 'Space') && !$('menu').hidden && !$('play').disabled) { e.preventDefault(); play(); }
  else if ((e.code === 'Enter' || e.code === 'Space') && !$('dead').hidden) { e.preventDefault(); play(); }
});
let swipe = null;
canvas.addEventListener('pointerdown', (e) => { swipe = { x: e.clientX, y: e.clientY, id: e.pointerId }; try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } });
canvas.addEventListener('pointermove', (e) => {
  if (!swipe || e.pointerId !== swipe.id) return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  if (Math.abs(dx) < 14 && Math.abs(dy) < 14) return;
  sendDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
  swipe.x = e.clientX; swipe.y = e.clientY;
});
const endSwipe = () => { swipe = null; };
canvas.addEventListener('pointerup', endSwipe); canvas.addEventListener('pointercancel', endSwipe);
document.addEventListener('touchmove', (e) => { if (e.target === canvas) e.preventDefault(); }, { passive: false });

// ---------------------------------------------------------------------------------------------------------------- small effects
function burst(p, n) {
  const k = SKIN_LIST[p.skin] || SKIN_LIST[0];
  for (let i = 0; i < n; i++) S.parts.push({ x: p.x1, y: p.y1, vx: (Math.random() - 0.5) * 9, vy: (Math.random() - 0.5) * 9, life: 1, c: i % 2 ? k.base : k.light });
  if (S.parts.length > 400) S.parts.splice(0, S.parts.length - 400);
}
function feed(text) {
  const box = $('feed'), d = document.createElement('div');
  d.textContent = text; box.appendChild(d);
  while (box.children.length > 3) box.removeChild(box.firstChild);
  setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 3500);
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

function drawWorld(now, dt) {
  const f = Math.min(1, (now - S.lastTick) / S.tickMs);
  const rpos = (p) => [p.x0 + (p.x1 - p.x0) * f, p.y0 + (p.y1 - p.y0) * f];
  // who the camera follows: me, or (in the menu) the biggest player
  let focus = S.you ? S.pl.get(S.you) : null;
  if (!focus || !focus.alive) { if (S.mode !== 'dead') focus = (S.mode === 'menu' || !focus) ? leaders().find((p) => p.alive) : focus; }
  if (focus && (focus.alive || S.mode === 'dead')) {
    const [fx, fy] = rpos(focus);
    const k = 1 - Math.pow(0.0008, dt);
    S.cam.x += (fx - S.cam.x) * k; S.cam.y += (fy - S.cam.y) * k;
  }
  const mine = S.you && S.mode !== 'menu' ? S.counts[S.you] : 0;
  const viewCells = S.mode === 'menu' ? 28 : 19 + Math.min(14, Math.sqrt(mine) * 0.33);
  const targetScale = Math.min(cw, ch) / viewCells;
  if (!camScale) camScale = targetScale; else camScale += (targetScale - camScale) * (1 - Math.pow(0.02, dt));
  const cs = camScale;
  const ox = cw / 2 - S.cam.x * cs, oy = ch / 2 - S.cam.y * cs;   // map cell (x, y) is at (ox + x*cs, oy + y*cs)

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#1e2433'; ctx.fillRect(0, 0, cw, ch);
  // the field
  ctx.fillStyle = '#eef1f5';
  ctx.fillRect(ox, oy, S.w * cs, S.h * cs);
  const x0 = Math.max(0, Math.floor(-ox / cs) - 1), x1 = Math.min(S.w - 1, Math.ceil((cw - ox) / cs) + 1);
  const y0 = Math.max(0, Math.floor(-oy / cs) - 1), y1 = Math.min(S.h - 1, Math.ceil((ch - oy) / cs) + 1);
  ctx.strokeStyle = '#e0e5ec'; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = x0; x <= x1 + 1; x++) { const sx = Math.round(ox + x * cs) + 0.5; ctx.moveTo(sx, Math.max(oy, 0)); ctx.lineTo(sx, Math.min(oy + S.h * cs, ch)); }
  for (let y = y0; y <= y1 + 1; y++) { const sy = Math.round(oy + y * cs) + 0.5; ctx.moveTo(Math.max(ox, 0), sy); ctx.lineTo(Math.min(ox + S.w * cs, cw), sy); }
  ctx.stroke();

  // land and trails
  const own = S.own, trl = S.trl, W = S.w, H = S.h;
  const cell = cs + 0.8;
  for (let y = y0; y <= y1; y++) {
    const sy = oy + y * cs;
    for (let x = x0; x <= x1; x++) {
      const c = y * W + x;
      const o = own[c];
      if (o) {
        const k = SKIN_LIST[S.skinOf[o]];
        const sx = ox + x * cs;
        ctx.fillStyle = k.base; ctx.fillRect(sx, sy, cell, cell);
        if (k.pat) drawPattern(ctx, k, x, y, cs, sx, sy);
        if (y + 1 >= H || own[c + W] !== o) { ctx.fillStyle = k.dark; ctx.fillRect(sx, sy + cs * 0.82, cell, cs * 0.18 + 0.8); }
        if (y === 0 || own[c - W] !== o) { ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(sx, sy, cell, cs * 0.08); }
      }
      const t = trl[c];
      if (t) {
        const k = SKIN_LIST[S.skinOf[t]];
        const sx = ox + x * cs;
        ctx.fillStyle = k.light; ctx.fillRect(sx, sy, cell, cell);
        if (k.pat) drawPattern(ctx, k, x, y, cs, sx, sy, 0.4);
      }
    }
  }
  // the edge of the field
  ctx.strokeStyle = '#0f1420'; ctx.lineWidth = 4;
  ctx.strokeRect(ox - 2, oy - 2, S.w * cs + 4, S.h * cs + 4);

  // heads and names (the lower ones in front)
  const vis = [];
  for (const p of S.pl.values()) {
    if (!p.alive) continue;
    const [px, py] = rpos(p);
    if (px < x0 - 2 || px > x1 + 2 || py < y0 - 2 || py > y1 + 2) continue;
    vis.push([p, px, py]);
  }
  vis.sort((a, b) => a[2] - b[2]);
  for (const [p, px, py] of vis) {
    const k = SKIN_LIST[p.skin] || SKIN_LIST[0];
    const sx = ox + px * cs, sy = oy + py * cs;
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    ctx.beginPath(); ctx.ellipse(sx + cs / 2, sy + cs * 0.98, cs * 0.46, cs * 0.16, 0, 0, 6.2832); ctx.fill();
    const s = cs * 1.02;
    drawHead(ctx, k, sx - (s - cs) / 2, sy - (s - cs) / 2 - cs * 0.08, s, p.dir);
    ctx.font = `800 ${Math.max(11, cs * 0.5)}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const label = p.id === S.you && S.mode !== 'menu' ? p.name : p.name;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,24,36,.75)'; ctx.strokeText(label, sx + cs / 2, sy - cs * 0.28);
    ctx.fillStyle = p.id === S.you && S.mode !== 'menu' ? '#fff3a8' : '#fff'; ctx.fillText(label, sx + cs / 2, sy - cs * 0.28);
  }
  // sparks
  for (let i = S.parts.length - 1; i >= 0; i--) {
    const q = S.parts[i];
    q.life -= dt * 1.6;
    if (q.life <= 0) { S.parts.splice(i, 1); continue; }
    q.x += q.vx * dt; q.y += q.vy * dt;
    ctx.globalAlpha = Math.max(0, q.life); ctx.fillStyle = q.c;
    const s = cs * 0.34 * q.life + 2;
    ctx.fillRect(ox + (q.x + 0.5) * cs - s / 2, oy + (q.y + 0.5) * cs - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
}

let lastHud = 0, lastMini = 0;
function updateHud(now) {
  if (S.mode === 'menu') { if (now - lastHud > 1500) { lastHud = now; setStatus(); } return; }
  if (now - lastHud > 250) {
    lastHud = now;
    const list = leaders();
    const me = S.you;
    $('meScore').textContent = pct(S.counts[me] || 0);
    const rank = list.findIndex((p) => p.id === me) + 1;
    const mp = S.pl.get(me);
    $('meInfo').textContent = rank ? `#${rank} of ${list.length}` + (mp && mp.kills ? '' : '') : '';
    const top = list.slice(0, 6), best = Math.max(1, S.counts[(top[0] || {}).id] || 1);
    const box = $('board');
    box.textContent = '';
    const addRow = (p, place) => {
      const r = document.createElement('div'); r.className = 'r' + (p.id === me ? ' me' : '');
      const u = document.createElement('u'); u.style.width = Math.max(4, (S.counts[p.id] / best) * 100) + '%'; u.style.background = SKIN_LIST[p.skin].base;
      const em = document.createElement('em'); em.textContent = `${place}. ${p.name}`;
      const s = document.createElement('s'); s.textContent = pct(S.counts[p.id]);
      r.appendChild(u); r.appendChild(em); r.appendChild(s); box.appendChild(r);
    };
    top.forEach((p, i) => addRow(p, i + 1));
    if (rank > 6 && mp) addRow(mp, rank);
  }
  if (now - lastMini > 600) { lastMini = now; drawMini(); }
}
let miniImg = null;
function drawMini() {
  const n = 96, step = S.w / n;
  if (!miniImg) miniImg = mctx.createImageData(n, n);
  const d = miniImg.data;
  const rgb = [];
  for (const k of SKIN_LIST) { const v = parseInt(k.base.slice(1), 16); rgb.push([(v >> 16) & 255, (v >> 8) & 255, v & 255]); }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const o = S.own[((y * step) | 0) * S.w + ((x * step) | 0)];
    const i = (y * n + x) * 4;
    if (o) { const c = rgb[S.skinOf[o]]; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; }
    else { d[i] = 238; d[i + 1] = 241; d[i + 2] = 245; d[i + 3] = 150; }
  }
  mctx.putImageData(miniImg, 0, 0);
  const me = S.pl.get(S.you);
  if (me && me.alive) { mctx.fillStyle = '#fff'; mctx.strokeStyle = '#111'; mctx.lineWidth = 2; mctx.beginPath(); mctx.arc(me.x1 / step, me.y1 / step, 4, 0, 6.2832); mctx.fill(); mctx.stroke(); }
}

let prev = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - prev) / 1000);
  prev = now;
  try { drawWorld(now, dt); updateHud(now); } catch (e) { console.error(e); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// a timer as well: a hidden tab or a slow device still keeps the picture current
setInterval(() => { if (document.hidden) return; }, 1000);

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
    for (let i = 0; i < 520; i++) { w.step(); w.flush(); }
    handle(w.snapshot());
    if (m[1] === 'play') {
      S.skin = 9; showSkin();
      nameInput.value = 'You'; play();
      const moves = { 3: 2, 9: 3, 15: 0, 21: 1 };
      for (let i = 0; i < 30; i++) { if (moves[i] != null) net.send({ t: 'dir', d: moves[i] }); net.tick(); }
    } else if (m[1] === 'skins') openSkins();
  }, 100);
})();
