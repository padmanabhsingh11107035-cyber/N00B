// Tests the notification sound (src/utils/notificationSound.ts) with a stand-in for the browser's audio.
//
// Usage: node scripts/supabase/test-notification-sound.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);

// ---- stand-ins
const data = new Map();
globalThis.localStorage = { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => { data.set(k, String(v)); } };
let contexts = 0, oscillators = [], resumed = 0, vibrations = [];
class FakeAudioContext {
  constructor() { contexts++; this.state = 'suspended'; this.currentTime = 0; this.destination = {}; }
  resume() { resumed++; this.state = 'running'; return Promise.resolve(); }
  createGain() { return { gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
  createOscillator() {
    const o = { type: '', frequency: { values: [], setValueAtTime(v) { this.values.push(v); }, exponentialRampToValueAtTime(v) { this.values.push(v); } }, connect() {}, start() {}, stop() {} };
    oscillators.push(o);
    return o;
  }
}
globalThis.AudioContext = FakeAudioContext;
Object.defineProperty(globalThis, 'navigator', { value: { vibrate: (p) => { vibrations.push(p); return true; } }, configurable: true });
const listeners = new Map();
globalThis.addEventListener = (ev, fn) => { listeners.set(ev, fn); };
globalThis.removeEventListener = (ev) => { listeners.delete(ev); };

const S = await import(pathToFileURL(path.resolve('src/utils/notificationSound.ts')).href);
const reset = () => { S.resetNotificationSoundForTests(); contexts = 0; oscillators = []; resumed = 0; vibrations = []; listeners.clear(); data.clear(); };
const realNow = Date.now;
let clock = 1_000_000;
Date.now = () => clock;

section('1. The sound plays');
reset();
check(S.isNotificationSoundOn() === true, 'it is on by default');
S.playNotificationSound('notification');
check(contexts === 1 && oscillators.length === 4, 'a notification makes a two-note chime (each note has an overtone)');
check(oscillators.some((o) => o.frequency.values[0] === 880) && oscillators.some((o) => o.frequency.values[0] === 1318.5), 'the two notes are A5 and E6');
check(resumed === 1, 'audio that the phone had paused is woken up');
check(vibrations.length === 1, 'the phone buzzes with it');
clock += 5000; oscillators = [];
S.playNotificationSound('message');
check(oscillators.length === 2 && contexts === 1, 'a chat message makes one soft pop, on the same audio (not a new one each time)');

section('2. Not too much');
reset();
S.playNotificationSound('notification');
const first = oscillators.length;
clock += 400;
S.playNotificationSound('notification');
check(oscillators.length === first, 'a second update within a second makes no second sound');
clock += 1500;
S.playNotificationSound('notification');
check(oscillators.length === first * 2, 'later ones do');

section('3. The person can turn it off');
reset();
S.setNotificationSoundOn(false);
check(S.isNotificationSoundOn() === false && oscillators.length === 0, 'turning it off keeps quiet');
clock += 5000;
S.playNotificationSound('notification');
check(oscillators.length === 0, 'and no sound is made while it is off');
clock += 5000;
S.setNotificationSoundOn(true);
check(S.isNotificationSoundOn() === true && oscillators.length === 4, 'turning it back on plays the chime so they hear what they chose');
data.set('noob.sound.alerts', 'off');
check(S.isNotificationSoundOn() === false, 'the choice is read back from the device');

section('4. Phones: the first tap unlocks audio');
reset();
S.armNotificationSound();
S.armNotificationSound();
check(listeners.size === 3 && contexts === 0, 'it waits for a tap, key press or touch, and makes no audio yet');
listeners.get('pointerdown')();
check(contexts === 1 && resumed === 1 && listeners.size === 0, 'the first tap unlocks audio and the waiting stops');

section('5. It never breaks the app');
reset();
globalThis.AudioContext = undefined;
let ok = true;
try { S.playNotificationSound('notification'); S.armNotificationSound(); } catch { ok = false; }
check(ok, 'a browser with no audio support just stays quiet');
globalThis.AudioContext = class { constructor() { throw new Error('blocked'); } };
reset();
try { S.playNotificationSound('notification'); } catch { ok = false; }
check(ok, 'a browser that refuses to start audio just stays quiet');
globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
try { S.isNotificationSoundOn(); S.setNotificationSoundOn(false); } catch { ok = false; }
check(ok, 'blocked storage (private window) is fine');

Date.now = realNow;
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
