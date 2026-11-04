/* METRO RUSH — game loop: moving trains, roof running, fair row generator, background traffic, input, HUD. */
'use strict';
(() => {
if (!window.MR || MR.failed) return;
const { $, CONFIG, LANES, scene, camera, renderer, sun, mobile, rnd } = MR;
const PZ = CONFIG.playerZ, D = THREE.MathUtils.damp;
let ROOF, RAMP = CONFIG.rampLen;

// ---------- state
let state = 'loading', rig, lane = 1, prevLane = 1, py = 0, vy = 0, slide = 0, ground = 0, grounded = true;
let speed = CONFIG.startSpeed, distance = 0, coins = 0, best = 0, runBest = 0, score = 0, time = 0, phase = 0;
let shield = 0, magnet = 0, sneakers = 0, doubler = 0, invuln = 0, shake = 0, dieT = 0, nextRowAt = 0, rowN = 0, prevSafe = 1, prevRowD = 0;
let bgTimer = [1, 2.5], camGround = 0, outfit = 'street', streak = 0, streakT = 0, lastLandY = 0, combo = 0;
const trains = [], props = [], pickups = [], bgTrains = [];
try { best = Number(localStorage.getItem('noob.metrorush.best')) || 0; outfit = localStorage.getItem('noob.metrorush.outfit') || 'street'; } catch (e) { }

// ---------- trains (main lanes)
function trainOcc(len, v) { return len * speed / (speed + v); }
function spawnTrain(laneI, { onc, cars, ramp, v, liv, arriveD }) {
  const len = MR.consistLength(cars, ramp);
  const mesh = MR.getConsist(liv, cars, ramp, onc || rnd() < .5, v > 0);
  const k = (speed + v) / speed;
  // near end (local z 0) reaches the player exactly when distance === arriveD
  const z = PZ - (arriveD - distance) * k;
  mesh.position.set(LANES[laneI], 0, z);
  const e = { lane: laneI, z, v, len, onc, ramp, mesh, a: arriveD, b: arriveD + trainOcc(len, v), horn: !onc, coins: [] };
  trains.push(e); return e;
}
function releaseTrain(i) { const e = trains[i]; MR.releaseConsist(e.mesh); for (const c of e.coins) c.dead = true; trains.splice(i, 1); }
// coverage of a lane at a given arrival distance
function laneState(l, Dq) {
  let st = 'free', rampStart = null, items = true;
  for (const t of trains) {
    if (t.lane !== l) continue;
    if (Dq >= t.a - 2 && Dq <= t.b + 2) { if (t.ramp && !t.onc) { st = st === 'block' ? st : 'walk'; rampStart = t.a; } else st = 'block'; }
    if (t.onc && t.z - t.len < CONFIG.spawnZ + 14) items = false; // fast train still behind spawn point would overtake items
    if (!t.onc && Dq > t.a - 6 && Dq < t.b + 6) items = false;
  }
  return { st, rampStart, items };
}
function laneClearAhead(l) {
  for (const t of trains) if (t.lane === l && t.z - t.len < PZ + 2) return false;
  for (const p of props) if (p.lane === l && p.z < PZ + 2) return false;
  for (const p of pickups) if (p.lane === l && !p.parent && p.z < PZ - 4 && p.z > CONFIG.spawnZ - 10) return false;
  return true;
}
function lanesFreeOver(skip, a, b, extra) {
  for (let d = a; d <= b; d += 6) {
    let ok = false;
    for (let l = 0; l < 3; l++) { if (l === skip) continue; const s = laneState(l, d).st; if (s !== 'block' && !(extra && extra.lane === l && d >= extra.a && d <= extra.b)) { ok = true; break; } }
    if (!ok) return false;
  }
  return true;
}

// ---------- props & pickups
function spawnProp(type, l, z) {
  const mesh = MR.templates[type].clone(); mesh.position.set(LANES[l], 0, z); scene.add(mesh);
  props.push({ type, lane: l, z, mesh, passed: false });
}
function spawnPickup(type, l, z, y, parent) {
  const mesh = MR.templates[type].clone(); mesh.position.set(LANES[l], y, z); scene.add(mesh);
  const p = { type, lane: l, z, y, mesh, parent: parent || null, off: parent ? z - parent.z : 0 };
  if (parent) parent.coins.push(p);
  pickups.push(p); return p;
}
function clearAll() {
  for (let i = trains.length - 1; i >= 0; i--) releaseTrain(i);
  for (const p of props) scene.remove(p.mesh); props.length = 0;
  for (const p of pickups) scene.remove(p.mesh); pickups.length = 0;
  for (let i = bgTrains.length - 1; i >= 0; i--) { MR.releaseConsist(bgTrains[i].mesh); bgTrains.splice(i, 1); }
}

// ---------- row generator (every rowGap metres of scroll)
function generateRow(z = CONFIG.spawnZ) {
  rowN++;
  const Dq = distance + (PZ - z), diff = Math.min(1, distance / 2600);
  const S = [0, 1, 2].map(l => laneState(l, Dq));
  // pick safe lane: reachable & passable
  const cand = [];
  for (let l = 0; l < 3; l++) {
    if (Math.abs(l - prevSafe) > 1) continue;
    const s = S[l];
    if (s.st === 'free') cand.push(l);
    else if (s.st === 'walk' && (l === prevSafe || (s.rampStart > prevRowD - 4))) cand.push(l);
  }
  if (!cand.length) for (let l = 0; l < 3; l++) if (S[l].st !== 'block') cand.push(l);
  let safe = cand.includes(prevSafe) && rnd() < .55 ? prevSafe : cand[Math.floor(rnd() * cand.length)];
  if (safe === undefined) safe = prevSafe;
  const busy = new Set();
  const warm = rowN <= 2;
  // safe lane: maybe a walkable ramp train (the signature move)
  if (!warm && S[safe].st === 'free' && S[safe].items && rnd() < .3 + diff * .1) {
    const cars = 2 + Math.floor(rnd() * 3), v = 0, liv = Math.floor(rnd() * 8);
    const len = MR.consistLength(cars, true);
    const arrive = distance + (PZ - z); // start a bit beyond spawn
    const t = spawnTrain(safe, { onc: false, cars, ramp: true, v, liv, arriveD: arrive });
    // coins up the ramp and along the roof
    for (let i = 0; i < 4; i++) { const d = 1.5 + i * 1.8; spawnPickup('coin', safe, t.z - d, ROOF * d / RAMP + .9, t); }
    for (let d = RAMP + 1.5; d < len - 1.5; d += 2.4) spawnPickup('coin', safe, t.z - d, ROOF + .95, t);
    if (rowN % 4 === 0) spawnPickup(pickPower(), safe, t.z - len * .7, ROOF + 1.4, t);
    busy.add(safe);
  } else if (S[safe].st === 'free' && S[safe].items) {
    // coin line, sometimes with a jumpable barrier / duck gate in the safe lane
    const r = rnd();
    if (!warm && r < .22 + diff * .15) { spawnProp('barrier', safe, z); for (let k = 0; k < 6; k++) spawnPickup('coin', safe, z + 6 - k * 2.4, 1.1 + Math.sin(k / 5 * Math.PI) * 2.0); }
    else if (!warm && r < .38 + diff * .2) { spawnProp('gate', safe, z); for (let k = 0; k < 6; k++) spawnPickup('coin', safe, z + 7 - k * 2.4, .7); }
    else for (let k = 0; k < 8; k++) spawnPickup('coin', safe, z + 8 - k * 2.3, 1.1);
    if (rowN % 6 === 3) spawnPickup(pickPower(), safe, z - 12, 1.5);
    busy.add(safe);
  } else if (S[safe].st === 'walk') {
    busy.add(safe);
  }
  // other lanes
  for (let l = 0; l < 3; l++) {
    if (l === safe || S[l].st !== 'free' || !S[l].items) continue;
    if (warm) { if (rowN === 1 && l !== safe) spawnProp(l % 2 ? 'gate' : 'barrier', l, z); continue; }
    const r = rnd();
    if (r < .3 + diff * .14 && laneClearAhead(l)) {
      // oncoming express — headlights, horn, real speed
      const cars = 1 + Math.floor(rnd() * (2 + diff * 3)), v = 8 + rnd() * (6 + diff * 8), liv = Math.floor(rnd() * 8), len = MR.consistLength(cars, false);
      const ex = { lane: l, a: Dq, b: Dq + trainOcc(len, v) };
      if (lanesFreeOver(l, ex.a, ex.b, ex)) { spawnTrain(l, { onc: true, cars, ramp: false, v, liv, arriveD: Dq }); continue; }
    } else if (r < .62) {
      // parked train standing still (no ramp = dodge, ramp = climb onto the roof)
      const ramp = rnd() < .45, cars = 2 + Math.floor(rnd() * 3), v = 0, liv = Math.floor(rnd() * 8);
      const len = MR.consistLength(cars, ramp), arrive = distance + (PZ - z);
      const ex = { lane: l, a: arrive, b: arrive + trainOcc(len, v) };
      if (ramp || lanesFreeOver(l, ex.a, ex.b, ex)) {
        const t = spawnTrain(l, { onc: false, cars, ramp, v, liv, arriveD: arrive });
        if (ramp) for (let d = RAMP + 2; d < len - 2; d += 2.6) spawnPickup('coin', l, t.z - d, ROOF + .95, t);
        continue;
      }
    } else if (r < .8) spawnProp(rnd() < .5 ? 'barrier' : 'gate', l, z);
    else if (r < .9) spawnProp('buffer', l, z);
  }
  prevSafe = safe; prevRowD = Dq;
}
function pickPower() { const r = rnd(); return r < .3 ? 'magnet' : r < .55 ? 'shield' : r < .8 ? 'sneakers' : 'double'; }

// ---------- background traffic on the outer tracks (always moving)
function spawnBg(side) {
  const x = MR.OUTER_X[side], cars = 3 + Math.floor(Math.random() * 4), liv = Math.floor(Math.random() * 8);
  const hasParked = bgTrains.some(b => b.side === side && !b.toward);
  const toward = hasParked ? false : Math.random() < .62;
  if (hasParked && Math.random() < .5) return false;
  const mesh = MR.getConsist(liv, cars, false, toward || Math.random() < .5, toward), len = MR.consistLength(cars, false);
  const v = toward ? 13 + Math.random() * 15 : 0, z = -330;
  mesh.position.set(x, 0, z);
  bgTrains.push({ mesh, z, v, len, side, toward, horn: false });
  return true;
}

// ---------- player
function setOutfit(o) {
  outfit = o; try { localStorage.setItem('noob.metrorush.outfit', o); } catch (e) { }
  if (rig) { scene.remove(rig.player); scene.remove(rig.contact); }
  rig = MR.buildPlayer(o); rig.player.position.x = LANES[lane];
  document.querySelectorAll('[data-outfit]').forEach(b => b.classList.toggle('on', b.dataset.outfit === o));
}
function surfaceAt(x) {
  // returns {h, train} for the highest train surface under the player position
  let h = 0, tr = null;
  for (const t of trains) {
    if (Math.abs(t.mesh.position.x - x) > 1.35) continue;
    const d = t.z - PZ; if (d < 0 || d > t.len) continue;
    let s = ROOF;
    if (t.ramp && d < RAMP) s = ROOF * d / RAMP;
    if (s > h) { h = s; tr = t; }
  }
  return { h, tr };
}
function laneBlockedAt(l) {
  const x = LANES[l];
  for (const t of trains) { if (t.lane !== l) continue; const d = t.z - PZ; if (d > -1 && d < t.len + 1) { let s = ROOF; if (t.ramp && d < RAMP) s = ROOF * d / RAMP; if (py < s - .7) return true; } }
  return false;
}

// ---------- flow
const hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
function syncHUD() {
  setText('score', Math.floor(score).toLocaleString());
  setText('coins', coins.toLocaleString());
  setText('best', Math.floor(Math.max(best, score)).toLocaleString());
  setText('speed', String(Math.round(speed * 3.6)));
  setText('mult', 'x' + mult());
}
function mult() { return 1 + Math.min(9, Math.floor(distance / 400)); }
function start() {
  MR.audio.init(); clearAll();
  state = 'running'; lane = prevLane = 1; py = vy = slide = distance = coins = score = shield = magnet = sneakers = doubler = invuln = shake = 0; ground = 0; grounded = true;
  speed = CONFIG.startSpeed; rowN = 0; prevSafe = 1; prevRowD = 0; nextRowAt = 0; runBest = best; streak = 0;
  rig.player.position.set(0, 0, PZ); rig.player.rotation.set(0, 0, 0); rig.body.rotation.set(0, 0, 0);
  document.body.className = 'playing';
  for (const id of ['home', 'end', 'pause-screen']) $(id).hidden = true;
  $('hud').hidden = false; $('mobile-controls').hidden = !mobile; $('pause').disabled = false;
  // pre-seed rows ahead of the player so the track is never empty
  let lastZ = -40;
  for (let zz = -40; zz >= CONFIG.spawnZ; zz -= CONFIG.rowGap) { generateRow(zz); lastZ = zz; }
  nextRowAt = CONFIG.rowGap - (lastZ - CONFIG.spawnZ);
  for (const s of [0, 1]) { bgTimer[s] = .5 + s * 1.6; }
  syncHUD(); toast('GO GO GO!'); MR.audio.sfx('start'); MR.audio.music(true);
}
function finish() {
  if (state !== 'running' && state !== 'dying' && state !== 'paused') return;
  state = 'over'; MR.audio.music(false);
  const fin = Math.floor(score), rec = fin > runBest; best = Math.max(best, fin);
  try { localStorage.setItem('noob.metrorush.best', best); } catch (e) { }
  $('end-score').textContent = fin.toLocaleString(); $('end-coins').textContent = coins.toLocaleString(); $('end-dist').textContent = Math.floor(distance).toLocaleString() + ' m';
  $('end-tag').textContent = rec ? 'NEW HIGH SCORE!' : 'BUSTED!';
  $('end').classList.toggle('record', rec);
  $('end').hidden = false; $('pause-screen').hidden = true; $('mobile-controls').hidden = true; $('pause').disabled = true;
  $('home-best').textContent = best.toLocaleString();
}
function crash(hitTrain) {
  if (invuln > 0) return;
  if (shield > 0) { shield = 0; invuln = 1.6; shake = .35; toast('SHIELD SAVED YOU!'); MR.audio.sfx('shield'); MR.burst(rig.player.position.clone().setY(py + 1.4), { color: '#59e3ff', count: 26, speed: 7, size: .9 }); return; }
  state = 'dying'; dieT = 1.1; shake = .6; MR.audio.sfx('crash');
  MR.burst(new THREE.Vector3(rig.player.position.x, py + 1.4, PZ - .6), { color: '#ffffff', count: 18, speed: 8, size: 1.2 });
  MR.burst(new THREE.Vector3(rig.player.position.x, py + 1.4, PZ - .6), { color: '#ffd23f', count: 22, speed: 6, size: .7, up: 4 });
  vy = 6;
}
function setPause() {
  if (state === 'running') { state = 'paused'; $('pause-screen').hidden = false; $('mobile-controls').hidden = true; MR.audio.music(false); }
  else if (state === 'paused') { state = 'running'; $('pause-screen').hidden = true; $('mobile-controls').hidden = !mobile; last = performance.now(); MR.audio.music(true); }
}
function menu() {
  state = 'home'; clearAll(); document.body.className = 'home';
  $('home').hidden = false; $('end').hidden = true; $('pause-screen').hidden = true; $('hud').hidden = true; $('mobile-controls').hidden = true; $('pause').disabled = true;
  lane = 1; py = vy = slide = 0; shield = magnet = sneakers = doubler = 0; rig.player.position.set(0, 0, PZ); rig.player.rotation.set(0, 0, 0);
  speed = CONFIG.startSpeed; distance = 0; preview();
}
function preview() {
  // a parked-but-rolling ramp train beside the runner and a long train on the right
  const t = MR.getConsist(1, 3, true, false, false); t.position.set(LANES[0], 0, -6); trains.push({ lane: 0, z: -6, v: 0, len: MR.consistLength(3, true), onc: false, ramp: true, mesh: t, a: 0, b: 0, coins: [], horn: true, home: true });
  const u = MR.getConsist(4, 2, false, true, true); u.position.set(LANES[2], 0, -90); trains.push({ lane: 2, z: -90, v: 7, len: MR.consistLength(2, false), onc: true, ramp: false, mesh: u, a: 0, b: 0, coins: [], horn: true, home: true });
  for (let i = 0; i < 10; i++) spawnPickup('coin', 1, -4 - i * 2.4, 1.1);
  spawnBg(0); spawnBg(1);
}
let toastTimer = 0;
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); toastTimer = 1.6; }

// ---------- input
function action(a) {
  if (state !== 'running') return;
  if (a === 'left' || a === 'right') {
    const next = THREE.MathUtils.clamp(lane + (a === 'left' ? -1 : 1), 0, 2);
    if (next === lane) return;
    if (laneBlockedAt(next)) { shake = .18; MR.audio.sfx('bump'); rig.body.rotation.z = (a === 'left' ? .4 : -.4); return; }
    prevLane = lane; lane = next; MR.audio.sfx('lane');
  } else if (a === 'jump' && grounded) {
    slide = 0; vy = sneakers > 0 ? CONFIG.jumpSpeed * 1.3 : CONFIG.jumpSpeed; grounded = false; MR.audio.sfx('jump');
  } else if (a === 'slide') {
    slide = CONFIG.slideDuration; if (!grounded) vy = -26; MR.audio.sfx('slide');
  }
}
window.addEventListener('keydown', e => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return; const k = e.code;
  if (k === 'KeyP' || k === 'Escape') { setPause(); return; }
  if ((k === 'Space' || k === 'Enter') && (state === 'home' || state === 'over')) { start(); return; }
  if (k === 'ArrowLeft' || k === 'KeyA') action('left');
  if (k === 'ArrowRight' || k === 'KeyD') action('right');
  if (k === 'ArrowUp' || k === 'KeyW' || k === 'Space') action('jump');
  if (k === 'ArrowDown' || k === 'KeyS') action('slide');
});
let touch = null;
const cv = $('game');
cv.addEventListener('pointerdown', e => { touch = { x: e.clientX, y: e.clientY, used: false }; });
cv.addEventListener('pointermove', e => {
  if (!touch || touch.used) return; const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 26) return; touch.used = true;
  action(Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'slide' : 'jump');
});
cv.addEventListener('pointerup', () => { touch = null; }); cv.addEventListener('pointercancel', () => { touch = null; });
document.querySelectorAll('[data-action]').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); action(b.dataset.action); }));
document.querySelectorAll('[data-outfit]').forEach(b => b.addEventListener('click', () => { setOutfit(b.dataset.outfit); MR.audio.sfx('ui'); }));
$('start').onclick = start; $('restart').onclick = start; $('pause').onclick = setPause; $('resume').onclick = setPause; $('quit').onclick = () => { state = 'paused'; finish(); }; $('menu').onclick = menu;
$('sound').onclick = () => { MR.audio.setMuted(!MR.audio.muted); $('sound').classList.toggle('on', !MR.audio.muted); $('sound').setAttribute('aria-pressed', String(!MR.audio.muted)); if (state === 'running') MR.audio.music(true); MR.audio.sfx('ui'); };
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'running') setPause(); });
cv.addEventListener('webglcontextlost', e => { e.preventDefault(); if (state === 'running') setPause(); });

// ---------- update
const tmpV = new THREE.Vector3();
function updateTrains(step, dt) {
  for (let i = trains.length - 1; i >= 0; i--) {
    const t = trains[i], move = step + t.v * dt;
    t.z += move; t.mesh.position.z = t.z;
    if (!t.horn && t.onc && t.z > -120) { t.horn = true; if (state === 'running') MR.audio.sfx('horn'); }
    if (t.home && t.z - t.len > 30) { t.z = -180; }
    if (!t.home && t.z - t.len > 40) releaseTrain(i);
  }
  for (let i = bgTrains.length - 1; i >= 0; i--) {
    const b = bgTrains[i]; b.z += step + b.v * dt; b.mesh.position.z = b.z;
    if (!b.horn && b.z > -60 && b.z < 30 && b.toward) { b.horn = true; if (state === 'running' && Math.random() < .5) MR.audio.sfx('whoosh'); }
    if (b.z - b.len > 60) { MR.releaseConsist(b.mesh); bgTrains.splice(i, 1); }
  }
  for (let s = 0; s < 2; s++) {
    bgTimer[s] -= dt;
    if (bgTimer[s] <= 0) { const clear = !bgTrains.some(b => b.side === s && b.z - b.len < -300); if (clear) spawnBg(s); bgTimer[s] = 1.5 + Math.random() * 3.5; }
  }
}
function updatePickups(step, dt) {
  const px = rig.player.position.x, pyc = py + (slide > 0 ? .6 : 1.2);
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    if (p.dead) { scene.remove(p.mesh); pickups.splice(i, 1); continue; }
    if (p.parent) p.z = p.parent.z + p.off; else p.z += step;
    p.mesh.position.z = p.z;
    p.mesh.rotation.y += dt * (p.type === 'coin' ? 3.2 : 1.6);
    if (!p.magnet) p.mesh.position.y = p.y + Math.sin(time * 3 + p.z * .2) * .08;
    if (state !== 'running') { if (p.z > 24) { scene.remove(p.mesh); pickups.splice(i, 1); } continue; }
    if (p.type === 'coin' && magnet > 0 && p.z > PZ - 24 && p.z < PZ + 2) { p.magnet = true; }
    if (p.magnet) { p.mesh.position.x = D(p.mesh.position.x, px, 10, dt); p.mesh.position.y = D(p.mesh.position.y, pyc, 10, dt); p.z = D(p.z, PZ, 10, dt); p.mesh.position.z = p.z; if (p.parent) p.off = p.z - p.parent.z; }
    const dx = p.mesh.position.x - px, dz = p.z - PZ, dy = p.mesh.position.y - pyc;
    const r = p.type === 'coin' ? (p.magnet ? 1.3 : 1.05) : 1.3;
    if (dx * dx + dz * dz + dy * dy < r * r * 1.4) {
      if (p.type === 'coin') {
        coins += doubler > 0 ? 2 : 1; streak++; streakT = .6; MR.audio.sfx('coin', streak);
        MR.burst(p.mesh.position, { color: '#ffd84a', count: 5, speed: 2.5, size: .45, life: .35, up: 1.5 });
      } else {
        MR.audio.sfx('power'); MR.burst(p.mesh.position, { color: '#ffffff', count: 20, speed: 6, size: .8 });
        if (p.type === 'magnet') { magnet = 12; toast('COIN MAGNET!'); }
        else if (p.type === 'shield') { shield = 18; toast('SHIELD UP!'); }
        else if (p.type === 'sneakers') { sneakers = 12; toast('SUPER SNEAKERS!'); }
        else { doubler = 15; toast('DOUBLE COINS!'); }
      }
      scene.remove(p.mesh); pickups.splice(i, 1); if (p.parent) p.parent.coins.splice(p.parent.coins.indexOf(p), 1); continue;
    }
    if (p.z > 22) { scene.remove(p.mesh); pickups.splice(i, 1); if (p.parent) { const k = p.parent.coins.indexOf(p); if (k >= 0) p.parent.coins.splice(k, 1); } }
  }
}
function updateProps(step) {
  const px = rig.player.position.x;
  for (let i = props.length - 1; i >= 0; i--) {
    const p = props[i]; p.z += step; p.mesh.position.z = p.z;
    if (state === 'running' && !p.passed && Math.abs(p.z - PZ) < .55 && Math.abs(p.mesh.position.x - px) < 1.25) {
      const hit = p.type === 'barrier' ? py < 1.3 : p.type === 'gate' ? !(slide > 0 && py < .4) && py < 3.2 : py < 2.3;
      if (hit) { p.passed = true; crash(false); }
      else if (!p.passed) { p.passed = true; }
    }
    if (p.z > 24) { scene.remove(p.mesh); props.splice(i, 1); }
  }
}
function update(dt) {
  time += dt;
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('toast').classList.remove('show'); }
  if (streakT > 0) { streakT -= dt; if (streakT <= 0) streak = 0; }
  let step = 0;
  if (state === 'running') {
    speed = Math.min(CONFIG.maxSpeed, CONFIG.startSpeed + distance * .0055);
    step = speed * dt; distance += step; score += step * mult() * .5;
    nextRowAt -= step; if (nextRowAt <= 0) { generateRow(); nextRowAt += CONFIG.rowGap; }
    MR.scrollWorld(step);
    // lateral
    const px = rig.player.position.x;
    rig.player.position.x = D(px, LANES[lane], 15, dt);
    // vertical / surfaces
    const surf = surfaceAt(rig.player.position.x);
    if (surf.h > py + .7 && surf.tr) {
      // ran into the front of a train / its side mid lane-change
      const near = surf.tr.z - PZ < 1.6;
      if (near || Math.abs(rig.player.position.x - LANES[surf.tr.lane]) > .4) {
        if (!near && invuln <= 0 && shield <= 0) { lane = prevLane; shake = .2; MR.audio.sfx('bump'); }
        else crash(true);
      } else crash(true);
    }
    ground = surf.h;
    vy -= CONFIG.gravity * (slide > 0 && !grounded ? 1.8 : 1) * dt; py += vy * dt;
    if (py <= ground) { if (!grounded && vy < -6) { MR.audio.sfx('land'); MR.burst(new THREE.Vector3(rig.player.position.x, ground + .2, PZ), { color: '#ffffff', count: 6, speed: 2, size: .6, life: .3, up: .6, additive: false, gravity: 0 }); } py = ground; vy = 0; grounded = true; }
    else if (py > ground + .05) grounded = false;
    slide = Math.max(0, slide - dt); shield = Math.max(0, shield - dt); magnet = Math.max(0, magnet - dt); sneakers = Math.max(0, sneakers - dt); doubler = Math.max(0, doubler - dt); invuln = Math.max(0, invuln - dt);
    rig.player.position.y = py;
    updateTrains(step, dt); updateProps(step); updatePickups(step, dt);
  } else if (state === 'dying') {
    dieT -= dt; const s2 = dt * 2; step = 0;
    vy -= CONFIG.gravity * dt; py = Math.max(ground, py + vy * dt * .6);
    rig.player.position.y = py; rig.player.position.z = D(rig.player.position.z, PZ + 1.2, 6, dt);
    updateTrains(0, dt * .15); updatePickups(0, dt);
    if (dieT <= 0) finish();
  } else if (state === 'home' || state === 'over') {
    step = dt * 3.5; MR.scrollWorld(step);
    updateTrains(step, dt); updateProps(step); updatePickups(step, dt);
  }
  MR.updateParticles(dt, step);
  MR.updateWheels(dt);
  for (const c of MR.clouds) { c.position.x += c.userData.v * dt; if (c.position.x > 300) c.position.x = -300; }
  // runner animation
  if (rig) {
    phase += dt * (state === 'running' ? speed * .62 : state === 'home' || state === 'over' ? 9.5 : 0);
    const mode = state === 'dying' ? 'dead' : state === 'running' ? (slide > 0 && grounded ? 'slide' : !grounded ? 'air' : 'run') : state === 'paused' ? 'run' : 'run';
    const lean = state === 'running' ? (LANES[lane] - rig.player.position.x) * -.09 : 0;
    MR.poseRunner(rig, { mode, phase, vy, lean, look: 0 }, dt);
    rig.player.rotation.y = state === 'dying' ? D(rig.player.rotation.y, .6, 5, dt) : 0;
    rig.shieldBubble.visible = shield > 0; rig.shieldBubble.rotation.y = time; rig.shieldBubble.scale.setScalar(1 + Math.sin(time * 6) * .03);
    for (const s of rig.sneakGlow) s.visible = sneakers > 0;
    rig.player.visible = invuln <= 0 || Math.sin(time * 40) > -.2;
    rig.contact.position.set(rig.player.position.x, ground + .06 + (ground > 0 ? .02 : .2), rig.player.position.z);
    const hgt = py - ground; rig.contact.material.opacity = Math.max(0, .9 - hgt * .25); rig.contact.scale.setScalar(1 + hgt * .12);
    // running dust trail
    if (state === 'running' && grounded && slide <= 0 && Math.random() < dt * 12) MR.burst(new THREE.Vector3(rig.player.position.x, ground + .15, PZ + .5), { color: ground > 0 ? '#e9eef7' : '#e8dccb', count: 1, speed: .8, size: .55, life: .4, up: .4, additive: false, gravity: 0 });
    if (state === 'running' && slide > 0 && grounded && Math.random() < dt * 30) MR.burst(new THREE.Vector3(rig.player.position.x, ground + .2, PZ + .6), { color: '#ffd23f', count: 1, speed: 2, size: .35, life: .3, up: 1 });
    if (sneakers > 0 && Math.random() < dt * 20) MR.burst(new THREE.Vector3(rig.player.position.x, py + .2, PZ + .3), { color: '#8dff5a', count: 1, speed: .5, size: .5, life: .4, up: .3, gravity: 0 });
  }
  // camera
  const portrait = camera.aspect < .75;
  let cx, cy, cz, lx, ly, lz, fov;
  if (state === 'home' || state === 'over' || state === 'loading') {
    cx = portrait ? 1.4 : 3.6; cy = portrait ? 4.6 : 3.6; cz = PZ + (portrait ? 9.5 : 7.4); lx = portrait ? .2 : -2.4; ly = 2.6; lz = PZ - 14; fov = portrait ? 70 : 52;
  } else {
    camGround = D(camGround, ground, 4, Math.min(dt, .05));
    const px = rig.player.position.x;
    cx = px * (portrait ? .55 : .75); cy = (portrait ? 7.2 : 6.0) + camGround * .85 + Math.max(0, py - ground) * .25; cz = PZ + (portrait ? 11 : 8.8);
    lx = px * (portrait ? .55 : .7); ly = 1.4 + camGround * .9; lz = PZ - 18; fov = (portrait ? 72 : 62) + (speed - CONFIG.startSpeed) * .35;
  }
  camera.position.x = D(camera.position.x, cx, 6, dt); camera.position.y = D(camera.position.y, cy, 5, dt); camera.position.z = D(camera.position.z, cz, 4, dt);
  camLook.x = D(camLook.x, lx, 6, dt); camLook.y = D(camLook.y, ly, 5, dt); camLook.z = D(camLook.z, lz, 4, dt);
  if (Math.abs(camera.fov - fov) > .01) { camera.fov = D(camera.fov, fov, 3, dt); camera.updateProjectionMatrix(); }
  if (shake > 0) { shake = Math.max(0, shake - dt); camera.position.x += (Math.random() - .5) * shake; camera.position.y += (Math.random() - .5) * shake; }
  camera.lookAt(camLook);
  sun.position.set(camera.position.x + 16, 42, PZ - 22); sun.target.position.set(camera.position.x, 0, PZ - 14);
}
const camLook = new THREE.Vector3(-2.4, 2.6, PZ - 14);
const pwEls = {};
function powerHUD() {
  const list = [['magnet', magnet, 12], ['shield', shield, 18], ['sneakers', sneakers, 12], ['double', doubler, 15]];
  for (const [id, v, max] of list) {
    const el = pwEls[id] || (pwEls[id] = $('pw-' + id)), on = v > 0;
    if (el.hidden === on) el.hidden = !on;
    if (on) { const p = Math.round(v / max * 100) + '%'; if (el.dataset.p !== p) { el.dataset.p = p; el.style.setProperty('--p', p); } }
  }
}

let last = performance.now();
let perfAvg = 16.7, perfT = 0, pr = MR.MAX_PR, smoothDt = 1 / 60;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = Math.min((now - last) / 1000, .1); last = now;
  // smooth out timer jitter so motion doesn't stutter
  smoothDt += (raw - smoothDt) * .2; const dt = Math.min(Math.abs(raw - smoothDt) < .012 ? smoothDt : raw, .05);
  if (state !== 'paused') { const n = dt > .034 ? 2 : 1; for (let i = 0; i < n; i++) update(dt / n); }
  if (state === 'running') { syncHUD(); powerHUD(); }
  renderer.render(scene, camera);
  // adaptive resolution: drop pixel ratio when frames are slow, raise it again when there's headroom
  perfAvg += (raw * 1000 - perfAvg) * .05; perfT += raw;
  if (perfT > 1.5) {
    perfT = 0;
    let np = pr;
    if (perfAvg > 21 && pr > .75) np = Math.max(.75, pr - .25);
    else if (perfAvg < 15 && pr < MR.MAX_PR) np = Math.min(MR.MAX_PR, pr + .125);
    if (np !== pr) { pr = np; renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight); }
  }
}

// ---------- boot (wait for the display font so canvas textures use it)
async function boot() {
  try { await Promise.race([document.fonts.load('40px "Lilita One"'), new Promise(r => setTimeout(r, 2500))]); } catch (e) { }
  const steps = [() => MR.buildWorld(), () => MR.buildTrainTemplates(), () => MR.buildPropTemplates()];
  for (const s of steps) { s(); await new Promise(r => setTimeout(r, 0)); }
  ROOF = MR.TRAIN.ROOF_TOP;
  setOutfit(outfit);
  $('home-best').textContent = best.toLocaleString();
  state = 'home'; document.body.className = 'home'; preview();
  camera.position.set(3.6, 3.6, PZ + 7.4); camera.lookAt(camLook);
  renderer.compile(scene, camera);
  renderer.render(scene, camera);
  MR.releaseWarm();
  $('loading').classList.add('gone'); setTimeout(() => $('loading').hidden = true, 600);
  requestAnimationFrame(frame);
}
boot();
window.MetroRush = Object.freeze({
  getState: () => ({ state, lane, x: rig && rig.player.position.x, y: py, ground, slide, distance, score, coins, speed, shield, magnet, sneakers, trains: trains.length, bg: bgTrains.length, props: props.length, pickups: pickups.length, drawCalls: renderer.info.render.calls }),
  start, action, get pixelRatio() { return pr; },
  advance(sec) { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) update(1 / 60); syncHUD(); renderer.render(scene, camera); return this.getState(); }
});
})();
