// The soft sounds of a chat that is open (a message comes in / goes out), made with the browser's own sound engine, so there is no file to download.
// A sound can only start after the person has touched the page; until then (or if the browser refuses) it stays silent, never an error.
import { playNotificationSound } from './notificationSound';

let ctx: AudioContext | null = null;

export function playChatTone(kind: 'in' | 'out'): void {
  if (kind === 'in') { playNotificationSound('message', true); return; }   // a message that comes in rings NOOB's bell (utils/notificationSound.ts)
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx = ctx || new Ctor();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    if (ctx.state !== 'running') return;
    const start = ctx.currentTime;
    const notes = [660];
    notes.forEach((hz, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = hz;
      const t0 = start + i * 0.09;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.06, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(t0);
      osc.stop(t0 + 0.18);
    });
  } catch {
    /* no sound here */
  }
}
