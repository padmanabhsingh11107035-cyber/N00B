import { DrawRarity, tickFreq, winTones } from '../../utils/noobDraw';

// The sound and the vibration of NOOB Draw: a rushing sound while the reel spins with a click for every card that passes the marker, a thump
// when it stops, and a different winning melody for every rarity. All made on the spot with the browser's audio (no sound files to download).
// One switch (the speaker button on the page) turns sound and vibration on or off, and the choice is remembered on the phone.

const PREF_KEY = 'noob-draw-fx';
let on = (() => { try { return localStorage.getItem(PREF_KEY) !== 'off'; } catch { return true; } })();
export const fxEnabled = (): boolean => on;
export function setFxEnabled(value: boolean): void {
  on = value;
  try { localStorage.setItem(PREF_KEY, value ? 'on' : 'off'); } catch { /* the choice just is not remembered */ }
  if (!value) stopSpinSound();
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let bed: { src: AudioBufferSourceNode; gain: GainNode; sweep: OscillatorNode } | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    try { ctx = new Ctor() as AudioContext; } catch { return null; }
    master = ctx.createGain();
    master.gain.value = 0.9;
    const limiter = ctx.createDynamicsCompressor();      // so a loud moment never crackles
    master.connect(limiter);
    limiter.connect(ctx.destination);
  }
  return ctx;
}

// Must be called inside the tap that starts a spin: phones only allow sound that was "unlocked" by a touch.
export function unlockAudio(): void {
  const c = audio();
  if (!c) return;
  try {
    if (c.state === 'suspended') void c.resume();
    const s = c.createBufferSource();                   // an inaudible blip: on iPhone this is what makes later sounds play
    s.buffer = c.createBuffer(1, 1, 22050);
    s.connect(c.destination);
    s.start(0);
  } catch { /* no sound on this device */ }
}

function noiseBuffer(c: AudioContext): AudioBuffer {
  if (!noise) {
    noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noise;
}

// the rushing sound for the whole spin: a sweep up as the reel gets going, then fading away as it slows down
export function startSpinSound(ms: number): void {
  if (!on) return;
  const c = audio();
  if (!c || !master) return;
  stopSpinSound();
  try {
    const now = c.currentTime;
    const d = ms / 1000;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    src.loop = true;
    const band = c.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 0.9;
    band.frequency.setValueAtTime(500, now);
    band.frequency.exponentialRampToValueAtTime(2600, now + 0.35);
    band.frequency.exponentialRampToValueAtTime(260, now + d);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + d);
    src.connect(band);
    band.connect(gain);
    gain.connect(master);
    const sweep = c.createOscillator();                 // the "spin up" whine under the rush
    sweep.type = 'sawtooth';
    sweep.frequency.setValueAtTime(160, now);
    sweep.frequency.exponentialRampToValueAtTime(620, now + 0.55);
    sweep.frequency.exponentialRampToValueAtTime(110, now + d);
    const sg = c.createGain();
    sg.gain.setValueAtTime(0.0001, now);
    sg.gain.exponentialRampToValueAtTime(0.035, now + 0.3);
    sg.gain.exponentialRampToValueAtTime(0.0001, now + d);
    sweep.connect(sg);
    sg.connect(master);
    src.start(now); src.stop(now + d + 0.05);
    sweep.start(now); sweep.stop(now + d + 0.05);
    bed = { src, gain, sweep };
  } catch { /* no sound on this device */ }
}

export function stopSpinSound(): void {
  if (!bed || !ctx) { bed = null; return; }
  try {
    const t = ctx.currentTime;
    bed.gain.gain.cancelScheduledValues(t);
    bed.gain.gain.setTargetAtTime(0.0001, t, 0.03);
    bed.src.stop(t + 0.15);
    bed.sweep.stop(t + 0.15);
  } catch { /* already stopped */ }
  bed = null;
}

// the click of one card passing the marker (progress 0..1 through the spin)
export function tickSound(progress: number): void {
  if (!on) return;
  const c = audio();
  if (!c || !master) return;
  try {
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(tickFreq(progress), t);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.1, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.032);
    o.connect(g);
    g.connect(master);
    o.start(t); o.stop(t + 0.05);
  } catch { /* no sound on this device */ }
}

// the reel has stopped: one heavy "thunk"
export function thumpSound(): void {
  if (!on) return;
  const c = audio();
  if (!c || !master) return;
  try {
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(170, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.16);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g);
    g.connect(master);
    o.start(t); o.stop(t + 0.25);
  } catch { /* no sound on this device */ }
}

// the winning melody (different for each rarity, see winTones)
export function winSound(rarity: DrawRarity): void {
  if (!on) return;
  const c = audio();
  if (!c || !master) return;
  try {
    const t0 = c.currentTime + 0.02;
    for (const tone of winTones(rarity)) {
      const start = t0 + tone.at;
      const o = c.createOscillator();
      o.type = tone.type;
      o.frequency.setValueAtTime(tone.f, start);
      if (tone.slideTo) o.frequency.exponentialRampToValueAtTime(tone.slideTo, start + tone.dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(tone.gain, start + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, start + tone.dur);
      o.connect(g);
      g.connect(master);
      o.start(start); o.stop(start + tone.dur + 0.05);
    }
  } catch { /* no sound on this device */ }
}

// ---- vibration
// Android phones vibrate through the browser. iPhones do not let a website vibrate at all; the only way a page can make the iPhone's
// little tap is to flip a hidden switch control (Safari 17.4 and newer), which is tried here. It is not guaranteed to work.
const onIphone = typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
let tapper: HTMLLabelElement | null = null;
function iphoneTap(): void {
  try {
    if (!tapper) {
      tapper = document.createElement('label');
      tapper.setAttribute('aria-hidden', 'true');
      tapper.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.setAttribute('switch', '');
      tapper.appendChild(box);
      document.body.appendChild(tapper);
    }
    tapper.click();
  } catch { /* no tap on this device */ }
}

export function buzz(pattern: number | number[]): void {
  if (!on) return;
  try {
    if (typeof navigator.vibrate === 'function') { navigator.vibrate(pattern); return; }
  } catch { /* not allowed */ }
  if (!onIphone) return;
  const seq = Array.isArray(pattern) ? pattern : [pattern];
  let at = 0;
  seq.forEach((ms, i) => {
    if (i % 2 === 0) window.setTimeout(iphoneTap, at);      // every "buzz" of the pattern is one tap
    at += ms;
  });
}
