// Tests the Games page background music (src/utils/gameMusic.ts) with a stand-in for the browser's audio.
//
// Usage: node scripts/supabase/test-game-music.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);

// ---- stand-ins
const data = new Map();
globalThis.localStorage = { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => { data.set(k, String(v)); } };
let contexts = [], timers = new Map(), nextTimer = 1;
globalThis.setInterval = (fn, ms) => { const id = nextTimer++; timers.set(id, { fn, ms }); return id; };
globalThis.clearInterval = (id) => { timers.delete(id); };
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms) => realSetTimeout(fn, 0);
class FakeAudioContext {
  constructor() { this.state = globalThis.__startSuspended ? 'suspended' : 'running'; this.currentTime = 0; this.sampleRate = 8000; this.destination = {}; this.oscillators = 0; this.noiseHits = 0; this.closed = false; contexts.push(this); }
  // like a phone: stays locked until the person has touched the screen
  resume() { if (!(globalThis.__startSuspended && !globalThis.__gesture)) this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  close() { this.closed = true; return Promise.resolve(); }
  createGain() { return { gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} }, connect() {} }; }
  createBiquadFilter() { return { type: '', frequency: { value: 0 }, connect() {} }; }
  createOscillator() { const c = this; c.oscillators++; return { type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }; }
  createBufferSource() { const c = this; c.noiseHits++; return { buffer: null, connect() {}, start() {}, stop() {} }; }
  createBuffer(_ch, length) { return { getChannelData: () => new Float32Array(length) }; }
}
globalThis.AudioContext = FakeAudioContext;
const listeners = new Map();
globalThis.addEventListener = (ev, fn) => { listeners.set(ev, fn); };
globalThis.removeEventListener = (ev) => { listeners.delete(ev); };
const docListeners = new Map();
globalThis.document = { visibilityState: 'visible', addEventListener: (ev, fn) => docListeners.set(ev, fn), removeEventListener: (ev) => docListeners.delete(ev) };

const M = await import(pathToFileURL(path.resolve('src/utils/gameMusic.ts')).href);
const reset = () => { M.resetGameMusicForTests(); contexts = []; timers.clear(); listeners.clear(); docListeners.clear(); data.clear(); globalThis.__startSuspended = false; globalThis.__gesture = false; globalThis.document.visibilityState = 'visible'; };
const runClock = (ctx, seconds) => { const t = [...timers.values()][0]; for (let s = 0; s < seconds; s += 0.06) { ctx.currentTime += 0.06; t?.fn(); } };

section('1. The song');
check(M.TOTAL_STEPS === 64 && M.BARS.length === 8, 'eight bars of eight beats');
let allPlayable = true, notes = 0, kicks = 0, snares = 0;
for (let i = 0; i < M.TOTAL_STEPS; i++) {
  const e = M.stepEvents(i);
  for (const n of [e.bass, e.arp, e.melody]) if (n !== undefined) { const hz = M.midiToHz(n); if (!(hz > 30 && hz < 3000)) allPlayable = false; }
  if (e.melody !== undefined) notes++;
  if (e.kick) kicks++;
  if (e.snare) snares++;
}
check(allPlayable, 'every note is a pleasant, audible pitch');
check(notes > 40 && kicks === 16 && snares === 16, 'a melody, a kick on beats 1 and 3, a snare on 2 and 4');
check(JSON.stringify(M.stepEvents(5)) === JSON.stringify(M.stepEvents(5 + M.TOTAL_STEPS)), 'it loops seamlessly');
check(Math.abs(M.midiToHz(69) - 440) < 1e-9 && Math.abs(M.midiToHz(81) - 880) < 1e-9, 'A4 is 440 Hz');

section('2. It plays on the Games page');
reset();
check(M.isGameMusicOn() === true && !M.isGameMusicPlaying(), 'on by default, silent until the page opens');
M.startGameMusic();
check(M.isGameMusicPlaying() && contexts.length === 1, 'opening the page starts it');
runClock(contexts[0], 8);
check(contexts[0].oscillators > 60 && contexts[0].noiseHits > 25, 'notes and a beat are played over time');
M.startGameMusic();
check(contexts.length === 1, 'opening a game inside the page does not start a second copy');

section('3. It stops when the page closes');
M.stopGameMusic();
check(!M.isGameMusicPlaying() && timers.size === 0, 'leaving the Games page stops it');
await new Promise((r) => realSetTimeout(r, 20));
check(contexts[0].closed === true, 'and the audio is released');

section('4. The person can turn it off');
reset();
M.startGameMusic();
M.setGameMusicOn(false);
check(!M.isGameMusicPlaying() && M.isGameMusicOn() === false, 'the speaker button silences it');
M.stopGameMusic(); M.startGameMusic();
check(!M.isGameMusicPlaying() && contexts.length === 1, 'and it stays silent next time the page opens');
M.setGameMusicOn(true);
check(M.isGameMusicPlaying(), 'turning it back on while on the page starts it again');
data.set('noob.sound.gameMusic', 'off');
check(M.isGameMusicOn() === false, 'the choice is read back from the device');

section('5. Phones and background');
reset();
globalThis.__startSuspended = true;
M.startGameMusic();
check(listeners.size === 3, 'when sound is locked it waits for the first tap');
globalThis.__gesture = true;
listeners.get('pointerdown')?.();
check(contexts[0].state === 'running' && listeners.size === 0, 'the first tap unlocks it');
globalThis.document.visibilityState = 'hidden'; docListeners.get('visibilitychange')?.();
check(contexts[0].state === 'suspended', 'it pauses while the app is in the background');
globalThis.document.visibilityState = 'visible'; docListeners.get('visibilitychange')?.();
check(contexts[0].state === 'running', 'and carries on when the app comes back');

section('6. It never breaks a game');
reset();
globalThis.AudioContext = undefined;
let ok = true;
try { M.startGameMusic(); M.stopGameMusic(); M.setGameMusicOn(true); } catch { ok = false; }
check(ok, 'a browser with no audio support just stays quiet');
globalThis.AudioContext = class { constructor() { throw new Error('blocked'); } };
reset();
try { M.startGameMusic(); } catch { ok = false; }
check(ok, 'a browser that refuses to start audio just stays quiet');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
