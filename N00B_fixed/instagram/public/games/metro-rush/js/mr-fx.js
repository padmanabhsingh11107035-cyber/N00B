/* METRO RUSH — particles + procedural audio (SFX, horn, light music loop). */
'use strict';
(() => {
if (!window.MR || MR.failed) return;
const { scene, glowTex } = MR;

// ---------- particles (pooled additive / normal sprites)
const parts = [];
const pool = [];
const pools = { true: [], false: [] };
function getSprite(additive) {
  let s = pools[additive].pop();
  if (!s) { s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending })); s.userData.add = additive; }
  scene.add(s); return s;
}
MR.burst = function (pos, { color = '#ffd23f', count = 10, speed = 4, size = .5, life = .6, up = 2, additive = true, gravity = 6, spread = 1 } = {}) {
  count = Math.min(count, 140 - parts.length);
  for (let i = 0; i < count; i++) {
    const s = getSprite(additive); s.material.color.set(color); s.material.opacity = 1;
    s.position.set(pos.x + (Math.random() - .5) * .3 * spread, pos.y + (Math.random() - .5) * .3, pos.z + (Math.random() - .5) * .3 * spread);
    const a = Math.random() * Math.PI * 2, v = speed * (.4 + Math.random() * .6);
    parts.push({ s, vx: Math.cos(a) * v * spread, vy: up + Math.random() * up, vz: Math.sin(a) * v * spread, life, max: life, size: size * (.6 + Math.random() * .6), g: gravity });
  }
};
MR.updateParticles = function (dt, step) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life -= dt;
    if (p.life <= 0) { scene.remove(p.s); pools[p.s.userData.add].push(p.s); parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
    p.vy -= p.g * dt; p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt + step * .6;
    const k = p.life / p.max; p.s.material.opacity = k; const sc = p.size * (1.4 - k * .4); p.s.scale.set(sc, sc, 1);
  }
};

// ---------- audio
let ctx = null, master = null, musicGain = null, muted = true, musicOn = false, nextBeat = 0, beat = 0;
function init() {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = .9; master.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = .0; musicGain.connect(master);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch (e) { }
}
function tone(freq, dur = .12, wave = 'sine', gain = .05, end = 0, when = 0, dest) {
  if (muted || !ctx) return;
  const t = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = wave; o.frequency.setValueAtTime(freq, t); if (end) o.frequency.exponentialRampToValueAtTime(end, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g); g.connect(dest || master); o.start(t); o.stop(t + dur + .02);
}
let noiseBuf = null;
function noise(dur = .3, gain = .05, freq = 1200, q = .8, when = 0, dest, sweep) {
  if (muted || !ctx) return;
  if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const t = ctx.currentTime + when, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t); if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur); f.Q.value = q;
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + dur * .25); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(dest || master); s.start(t); s.stop(t + dur + .05);
}
const SFX = {
  coin(n) { const f = [988, 1175, 1319, 1568, 1760][n % 5]; tone(f, .09, 'square', .018); tone(f * 2, .12, 'sine', .02, 0, .03); },
  jump() { tone(300, .2, 'sine', .05, 720); noise(.12, .015, 2500); },
  land() { noise(.12, .03, 400, .6); },
  slide() { noise(.32, .035, 1800, .6, 0, null, 500); },
  lane() { noise(.09, .02, 3000, 1.5); },
  power() { [523, 659, 784, 1047].forEach((f, i) => tone(f, .16, 'triangle', .05, 0, i * .06)); },
  bump() { tone(140, .18, 'square', .05, 70); noise(.2, .05, 300); },
  crash() { tone(110, .6, 'sawtooth', .07, 35); noise(.6, .12, 500, .5, 0, null, 120); },
  shield() { tone(400, .3, 'triangle', .06, 1400); },
  horn() { tone(311, .55, 'sawtooth', .035); tone(370, .55, 'sawtooth', .03); },
  whoosh() { noise(.9, .05, 300, .7, 0, null, 1800); },
  start() { [392, 523, 659, 784].forEach((f, i) => tone(f, .14, 'square', .03, 0, i * .07)); },
  ui() { tone(880, .06, 'triangle', .03); }
};
// light procedural groove (kick / hat / bass / pluck)
const BASS = [41, 41, 48, 46, 41, 41, 44, 48], CH = [[65, 69, 72], [65, 69, 72], [70, 74, 77], [68, 72, 75]];
const mtf = n => 440 * Math.pow(2, (n - 69) / 12);
function music() {
  if (!ctx || muted || !musicOn) return;
  const spb = 60 / 118 / 4;
  while (nextBeat < ctx.currentTime + .15) {
    const w = nextBeat - ctx.currentTime, s = beat % 16, bar = Math.floor(beat / 16) % 8;
    if (s % 4 === 0) tone(120, .16, 'sine', .14, 40, w, musicGain);
    if (s % 2 === 1) noise(.05, .025, 8000, 1, w, musicGain);
    if (s === 4 || s === 12) noise(.16, .05, 1600, .7, w, musicGain);
    if (s % 4 === 2 || s === 0) tone(mtf(BASS[bar]), .18, 'triangle', .08, 0, w, musicGain);
    if (s === 6 || s === 14 || s === 10) { const c = CH[Math.floor(bar / 2) % 4]; tone(mtf(c[(s / 4 | 0) % 3] + 12), .14, 'square', .012, 0, w, musicGain); }
    nextBeat += spb; beat++;
  }
}
setInterval(music, 50);
MR.audio = {
  init, sfx: (k, a) => SFX[k] && SFX[k](a),
  get muted() { return muted; },
  setMuted(v) { init(); muted = v; if (musicGain && ctx) musicGain.gain.setTargetAtTime(v || !musicOn ? 0 : .55, ctx.currentTime, .2); if (ctx) nextBeat = ctx.currentTime + .05; },
  music(on) { musicOn = on; if (musicGain && ctx) { musicGain.gain.setTargetAtTime(on && !muted ? .55 : 0, ctx.currentTime, .3); if (on) nextBeat = Math.max(nextBeat, ctx.currentTime + .05); } }
};
})();
