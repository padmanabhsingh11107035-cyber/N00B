// The background music of the Games page: a cheerful, original arcade loop (bass, bouncy arpeggio, a little melody and a light beat)
// that is played by the browser itself, note by note. There is no song file to download, nothing is streamed, and nothing here is
// taken from anyone else's recording.
//
// It starts when the Games page opens, keeps going while a game is being played, and stops the moment the person leaves the Games
// page. The speaker button on the Games page turns it off (and back on); that choice is kept on their device. It pauses while the
// app is in the background, and phones that only allow sound after a first tap are handled (it starts on the first tap).

const KEY = 'noob.sound.gameMusic';
const BPM = 124;
const STEP_SECONDS = 60 / BPM / 2;   // one eighth note
const MASTER_VOLUME = 0.16;          // soft: games have their own sound effects
const LOOKAHEAD_S = 0.28;
const TICK_MS = 60;

// ---- the song: eight bars, eight eighth-notes each (C – Am – F – G – C – Em – F – G, an everyday happy progression)
const REST = -1;
export const BARS: Array<{ root: number; chord: [number, number, number]; melody: number[] }> = [
  { root: 48, chord: [60, 64, 67], melody: [79, REST, 76, 79, 81, REST, 79, 76] },
  { root: 45, chord: [57, 60, 64], melody: [76, REST, 72, 76, 79, REST, 76, 72] },
  { root: 41, chord: [60, 65, 69], melody: [77, REST, 74, 77, 79, 77, 74, REST] },
  { root: 43, chord: [59, 62, 67], melody: [79, 79, 76, REST, 74, 76, 79, REST] },
  { root: 48, chord: [60, 64, 67], melody: [84, REST, 81, 79, 81, REST, 84, 79] },
  { root: 40, chord: [59, 64, 67], melody: [83, REST, 79, 76, 79, 83, REST, 79] },
  { root: 41, chord: [60, 65, 69], melody: [81, REST, 77, 81, 84, 81, 77, REST] },
  { root: 43, chord: [59, 62, 67], melody: [83, 81, 79, REST, 76, 74, 72, REST] }
];
export const STEPS_PER_BAR = 8;
export const TOTAL_STEPS = BARS.length * STEPS_PER_BAR;
const ARP_PATTERN = [0, 1, 2, 1, 0, 2, 1, 2];

export const midiToHz = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

// What plays on one step of the loop (pure, so it can be tested).
export function stepEvents(step: number): { bass?: number; arp: number; melody?: number; kick: boolean; snare: boolean; hat: 'open' | 'closed' } {
  const i = ((step % TOTAL_STEPS) + TOTAL_STEPS) % TOTAL_STEPS;
  const bar = BARS[Math.floor(i / STEPS_PER_BAR)];
  const s = i % STEPS_PER_BAR;
  const mel = bar.melody[s];
  return {
    bass: s % 2 === 0 ? bar.root + (s === 4 ? 12 : 0) : undefined,
    arp: bar.chord[ARP_PATTERN[s]] + 12,
    melody: mel === REST ? undefined : mel,
    kick: s === 0 || s === 4,
    snare: s === 2 || s === 6,
    hat: s % 2 === 1 ? 'open' : 'closed'
  };
}

// ---- sound engine
const g: any = globalThis;
const storage = (): Storage | null => { try { return g.localStorage ?? null; } catch { return null; } };

let ctx: any = null;
let master: any = null;
let noise: any = null;
let timer: any = null;
let nextTime = 0;
let step = 0;
let wanted = false;       // the Games page is open
let unlockArmed = false;
let visHandler: (() => void) | null = null;

export function isGameMusicOn(): boolean {
  try { return storage()?.getItem(KEY) !== 'off'; } catch { return true; }
}

export function isGameMusicPlaying(): boolean {
  return !!timer;
}

function tone(type: string, hz: number, at: number, length: number, volume: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(hz, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain);
  gain.connect(master);
  osc.start(at);
  osc.stop(at + length + 0.03);
}

function kick(at: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, at);
  osc.frequency.exponentialRampToValueAtTime(45, at + 0.12);
  gain.gain.setValueAtTime(0.9, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
  osc.connect(gain);
  gain.connect(master);
  osc.start(at);
  osc.stop(at + 0.2);
}

function noiseHit(at: number, length: number, volume: number, highpassHz: number): void {
  if (!noise) return;
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  src.buffer = noise;
  filter.type = 'highpass';
  filter.frequency.value = highpassHz;
  gain.gain.setValueAtTime(volume, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  src.start(at);
  src.stop(at + length + 0.02);
}

function playStep(index: number, at: number): void {
  const e = stepEvents(index);
  if (e.bass !== undefined) tone('triangle', midiToHz(e.bass), at, STEP_SECONDS * 1.7, 0.5);
  tone('square', midiToHz(e.arp), at, STEP_SECONDS * 0.9, 0.05);
  if (e.melody !== undefined) tone('square', midiToHz(e.melody), at, STEP_SECONDS * 1.5, 0.085);
  if (e.kick) kick(at);
  if (e.snare) noiseHit(at, 0.12, 0.28, 1500);
  noiseHit(at, e.hat === 'open' ? 0.07 : 0.03, e.hat === 'open' ? 0.12 : 0.06, 7000);
}

function tick(): void {
  if (!ctx || ctx.state === 'suspended') return;
  try {
    while (nextTime < ctx.currentTime + LOOKAHEAD_S) {
      playStep(step, nextTime);
      nextTime += STEP_SECONDS;
      step = (step + 1) % TOTAL_STEPS;
    }
  } catch { /* the music failing must never break a game */ }
}

function makeContext(): boolean {
  if (ctx) return true;
  const Ctor = g.AudioContext || g.webkitAudioContext;
  if (!Ctor) return false;
  try {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.0001;
    const soften = ctx.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = 6500;
    master.connect(soften);
    soften.connect(ctx.destination);
    const length = Math.floor(ctx.sampleRate * 0.3);
    noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return true;
  } catch {
    ctx = null;
    return false;
  }
}

function begin(): void {
  if (timer || !makeContext()) return;
  try { if (ctx.state === 'suspended') void ctx.resume?.(); } catch { /* ignore */ }
  step = 0;
  nextTime = ctx.currentTime + 0.1;
  master.gain.cancelScheduledValues?.(ctx.currentTime);
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(MASTER_VOLUME, ctx.currentTime + 1.2);
  timer = setInterval(tick, TICK_MS);
  tick();
  if (typeof g.addEventListener === 'function' && !visHandler && g.document) {
    visHandler = () => {
      if (!ctx) return;
      try {
        if (g.document.visibilityState === 'hidden') void ctx.suspend?.();
        else if (wanted && isGameMusicOn()) void ctx.resume?.();
      } catch { /* ignore */ }
    };
    g.document.addEventListener('visibilitychange', visHandler);
  }
}

// Phones start with sound locked until the first tap; wait for it, then make sure the music is running.
function armUnlock(): void {
  if (unlockArmed || typeof g.addEventListener !== 'function') return;
  unlockArmed = true;
  const unlock = () => {
    for (const ev of ['pointerdown', 'touchstart', 'keydown']) g.removeEventListener(ev, unlock);
    unlockArmed = false;
    if (!wanted || !isGameMusicOn()) return;
    try { if (ctx && ctx.state === 'suspended') void ctx.resume?.(); } catch { /* ignore */ }
    begin();
  };
  for (const ev of ['pointerdown', 'touchstart', 'keydown']) g.addEventListener(ev, unlock, { passive: true });
}

// The Games page opened.
export function startGameMusic(): void {
  wanted = true;
  if (!isGameMusicOn()) return;
  begin();
  if (!ctx || ctx.state === 'suspended') armUnlock();
}

// The Games page closed (or the person turned the music off).
export function stopGameMusic(): void {
  wanted = false;
  haltPlayback();
}

function haltPlayback(): void {
  if (timer) { clearInterval(timer); timer = null; }
  if (ctx && master) {
    try {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues?.(t);
      master.gain.setValueAtTime(Math.max(master.gain.value || MASTER_VOLUME, 0.0001), t);
      master.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      const old = ctx;
      setTimeout(() => { try { void old.close?.(); } catch { /* ignore */ } }, 400);
    } catch { /* ignore */ }
  }
  ctx = null;
  master = null;
  noise = null;
  if (visHandler && g.document) { g.document.removeEventListener('visibilitychange', visHandler); visHandler = null; }
}

export function setGameMusicOn(on: boolean): void {
  try { storage()?.setItem(KEY, on ? 'on' : 'off'); } catch { /* not remembered */ }
  if (on) { if (wanted) startGameMusic(); } else haltPlayback();
}

export function resetGameMusicForTests(): void {
  haltPlayback();
  wanted = false;
  unlockArmed = false;
  step = 0;
  nextTime = 0;
}
