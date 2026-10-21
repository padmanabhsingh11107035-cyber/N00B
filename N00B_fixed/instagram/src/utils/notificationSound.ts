// The sound NOOB plays when something new arrives while the app is open (a notification, or a chat message), so a person who is not
// looking at the screen still knows there is an update. The sounds are made on the spot with the browser's audio (no sound files to
// download): a bell, struck twice for a notification and once, a little softer, for a chat message.
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

// One strike of a bell. A real bell is not one pure note: it rings with several tones that are NOT whole multiples of each other (that is what makes it sound
// like metal and not like a beep), the sound starts sharp and the higher tones die away first. [multiple of the pitch, loudness, share of the ring it lasts]
const BELL_TONES: Array<[number, number, number]> = [[1, 1, 1], [2, 0.5, 0.7], [2.76, 0.32, 0.45], [5.4, 0.12, 0.25]];
function bell(c: any, freq: number, start: number, length: number, volume: number): void {
  const out = c.createGain();
  out.gain.setValueAtTime(0.0001, start);
  out.gain.exponentialRampToValueAtTime(volume, start + 0.005);
  out.gain.exponentialRampToValueAtTime(0.0001, start + length);
  out.connect(c.destination);
  for (const [mult, level, share] of BELL_TONES) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * mult, start);
    gain.gain.setValueAtTime(level, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length * share);
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
      bell(c, 1174.7, t, 1.1, 0.14);
    } else {
      bell(c, 1174.7, t, 1.5, 0.17);
      bell(c, 1174.7, t + 0.3, 1.5, 0.12);
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
