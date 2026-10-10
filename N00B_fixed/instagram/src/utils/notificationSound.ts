// The sound NOOB plays when something new arrives while the app is open (a notification, or a chat message), so a person who is not
// looking at the screen still knows there is an update. The sounds are made on the spot with the browser's audio (no sound files to
// download), a short two-note chime for a notification and one soft "pop" for a message.
//
// Phones only let a web page make sound after the person has touched the screen once, so armNotificationSound() waits for the first tap
// anywhere and unlocks audio then. While the app is closed or in the background, the phone's own notification sound plays instead (the
// service worker shows the notification).
//
// Each person can turn it off (the speaker button in Notifications); the choice is kept on their device.

const KEY = 'noob.sound.alerts';
const MIN_GAP_MS = 1200; // a burst of updates makes one sound, not a machine gun

export type SoundKind = 'notification' | 'message';

let ctx: any = null;
let lastPlayedAt = 0;
let armed = false;

const g: any = globalThis;
const storage = (): Storage | null => {
  try { return g.localStorage ?? null; } catch { return null; }
};

export function isNotificationSoundOn(): boolean {
  try { return storage()?.getItem(KEY) !== 'off'; } catch { return true; }
}

export function setNotificationSoundOn(on: boolean): void {
  try { storage()?.setItem(KEY, on ? 'on' : 'off'); } catch { /* not remembered */ }
  if (on) playNotificationSound('notification', true); // let the person hear what they just switched on
}

function context(): any {
  if (ctx) return ctx;
  const Ctor = g.AudioContext || g.webkitAudioContext;
  if (!Ctor) return null;
  try { ctx = new Ctor(); } catch { ctx = null; }
  return ctx;
}

// A single soft note: quick fade-in, smooth fade-out, with a quiet higher overtone so it sounds like a little bell rather than a beep.
function note(c: any, freq: number, start: number, length: number, volume: number, glideTo?: number): void {
  const out = c.createGain();
  out.gain.setValueAtTime(0.0001, start);
  out.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  out.gain.exponentialRampToValueAtTime(0.0001, start + length);
  out.connect(c.destination);
  const tones: Array<[string, number, number]> = [['sine', 1, 1], ['triangle', 2, 0.22]];
  for (const [type, mult, level] of tones) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq * mult, start);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo * mult, start + length * 0.6);
    gain.gain.value = level;
    osc.connect(gain);
    gain.connect(out);
    osc.start(start);
    osc.stop(start + length + 0.05);
  }
}

// force = play even if the person turned the sound off or it just played (used when they switch it on, to let them hear it).
export function playNotificationSound(kind: SoundKind = 'notification', force = false): void {
  if (!force && !isNotificationSoundOn()) return;
  const now = Date.now();
  if (!force && now - lastPlayedAt < MIN_GAP_MS) return;
  const c = context();
  if (!c) return;
  lastPlayedAt = now;
  try {
    if (c.state === 'suspended') void c.resume?.();
    const t = c.currentTime + 0.02;
    if (kind === 'message') {
      note(c, 660, t, 0.16, 0.16, 880);
    } else {
      note(c, 880, t, 0.22, 0.2);
      note(c, 1318.5, t + 0.12, 0.42, 0.2);
    }
  } catch { /* a sound that fails to play must never break the app */ }
  try { g.navigator?.vibrate?.(kind === 'message' ? 30 : [60, 40, 60]); } catch { /* not supported */ }
}

// Call once when the app starts: the first tap / key press anywhere unlocks audio for the rest of the visit.
export function armNotificationSound(): void {
  if (armed || typeof g.addEventListener !== 'function') return;
  armed = true;
  const unlock = () => {
    const c = context();
    try { if (c && c.state === 'suspended') void c.resume?.(); } catch { /* ignore */ }
    for (const ev of ['pointerdown', 'touchstart', 'keydown']) g.removeEventListener(ev, unlock);
  };
  for (const ev of ['pointerdown', 'touchstart', 'keydown']) g.addEventListener(ev, unlock, { passive: true });
}

export function resetNotificationSoundForTests(): void {
  ctx = null;
  lastPlayedAt = 0;
  armed = false;
}
