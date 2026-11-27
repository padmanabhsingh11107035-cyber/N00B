// The birthday tune, played by the phone itself (the Web Audio API): a soft music-box sound, the old traditional melody of "Happy Birthday to You" (it has no owner), looping gently with a
// short rest. No sound file is downloaded. Browsers only allow sound after a touch, so if the page has not been touched yet the tune waits and starts at the first touch.
export interface Note { midi: number; beats: number }
// G G A G C B | G G A G D C | G G G' E C B A | F' F' E C D C   (3/4 time, 1 beat = a quarter note; rests are midi 0)
export const HAPPY_BIRTHDAY: Note[] = [
  { midi: 67, beats: 0.75 }, { midi: 67, beats: 0.25 }, { midi: 69, beats: 1 }, { midi: 67, beats: 1 }, { midi: 72, beats: 1 }, { midi: 71, beats: 2 },
  { midi: 67, beats: 0.75 }, { midi: 67, beats: 0.25 }, { midi: 69, beats: 1 }, { midi: 67, beats: 1 }, { midi: 74, beats: 1 }, { midi: 72, beats: 2 },
  { midi: 67, beats: 0.75 }, { midi: 67, beats: 0.25 }, { midi: 79, beats: 1 }, { midi: 76, beats: 1 }, { midi: 72, beats: 1 }, { midi: 71, beats: 1 }, { midi: 69, beats: 1 },
  { midi: 77, beats: 0.75 }, { midi: 77, beats: 0.25 }, { midi: 76, beats: 1 }, { midi: 72, beats: 1 }, { midi: 74, beats: 1 }, { midi: 72, beats: 2 }
];
export const midiToHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
export const tuneBeats = (notes: Note[] = HAPPY_BIRTHDAY): number => notes.reduce((n, x) => n + x.beats, 0);

const BEAT_SECONDS = 0.5;       // a calm 120 beats a minute
const LOOP_REST_SECONDS = 2.5;
const VOLUME = 0.16;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let timer = 0;
let playing = false;
let muted = false;
let gestureHook: (() => void) | null = null;

function ensureContext(): AudioContext | null {
  try {
    if (ctx) return ctx;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : VOLUME;
    master.connect(ctx.destination);
    return ctx;
  } catch { return null; }
}

/** one soft bell-like note: a sine with a quiet octave above it, a quick attack and a long fade */
function ring(c: AudioContext, out: AudioNode, hz: number, at: number, seconds: number): void {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(1, at + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(0.35, seconds * 1.6));
  g.connect(out);
  for (const [mult, level] of [[1, 1], [2, 0.28], [3, 0.08]] as const) {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = hz * mult;
    const v = c.createGain();
    v.gain.value = level;
    o.connect(v); v.connect(g);
    o.start(at);
    o.stop(at + Math.max(0.4, seconds * 1.7) + 0.05);
  }
}

function playOnce(c: AudioContext): number {
  const out = master!;
  let t = c.currentTime + 0.12;
  for (const n of HAPPY_BIRTHDAY) {
    const len = n.beats * BEAT_SECONDS;
    if (n.midi > 0) ring(c, out, midiToHz(n.midi), t, len);
    t += len;
  }
  return t - c.currentTime;   // seconds until the end of this round
}

function loop(): void {
  if (!playing || !ctx) return;
  const seconds = playOnce(ctx);
  timer = window.setTimeout(loop, (seconds + LOOP_REST_SECONDS) * 1000);
}

function begin(): void {
  const c = ensureContext();
  if (!c || !playing) return;
  const go = (): void => { if (playing && !timer) loop(); };
  if (c.state === 'running') { go(); return; }
  void c.resume().then(go, () => undefined);
  // nothing was allowed yet (no touch so far): the first touch starts it
  if ((c.state as string) !== 'running' && !gestureHook) {
    gestureHook = () => {
      const hook = gestureHook; gestureHook = null;
      if (hook) { window.removeEventListener('pointerdown', hook, true); window.removeEventListener('keydown', hook, true); }
      if (!playing || !ctx) return;
      void ctx.resume().then(go, () => undefined);
    };
    window.addEventListener('pointerdown', gestureHook, true);
    window.addEventListener('keydown', gestureHook, true);
  }
}

export function startBirthdaySong(): void {
  if (playing) return;
  playing = true;
  begin();
}

export function stopBirthdaySong(): void {
  playing = false;
  window.clearTimeout(timer); timer = 0;
  if (gestureHook) { window.removeEventListener('pointerdown', gestureHook, true); window.removeEventListener('keydown', gestureHook, true); gestureHook = null; }
  try { if (master && ctx) { master.gain.setTargetAtTime(0, ctx.currentTime, 0.05); } } catch { /* already quiet */ }
  const c = ctx; ctx = null; master = null;   // the tune that is still ringing fades out; the next start makes a new context
  if (c) window.setTimeout(() => { void c.close().catch(() => undefined); }, 600);
}

export function setBirthdayMuted(on: boolean): void {
  muted = on;
  try { if (master && ctx) master.gain.setTargetAtTime(on ? 0 : VOLUME, ctx.currentTime, 0.05); } catch { /* nothing playing */ }
}
export const birthdayMuted = (): boolean => muted;
