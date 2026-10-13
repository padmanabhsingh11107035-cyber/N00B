import { canSpeak, speak, stopSpeaking } from './studyVoice';
import type { AlarmSound, StudyPrefs } from './studyPrefs';

// NOOB STUDY's alarm: a short tune made on the phone itself (no sound file is downloaded), then, if the student likes, a spoken message in their chosen voice.
// It only rings while NOOB is open: a web page cannot wake a phone that is asleep, and this never pretends to.
export interface Note { f: number; at: number; len: number; type?: OscillatorType; gain?: number }
export const TUNES: Record<AlarmSound, Note[]> = {
  bell: [0, 0.9, 1.8].map((at) => ({ f: 880, at, len: 0.85, type: 'sine' as const, gain: 0.9 })).concat([0, 0.9, 1.8].map((at) => ({ f: 1760, at, len: 0.5, type: 'sine' as const, gain: 0.25 }))),
  chime: [{ f: 523.25, at: 0, len: 0.6 }, { f: 659.25, at: 0.28, len: 0.6 }, { f: 783.99, at: 0.56, len: 0.9 }, { f: 1046.5, at: 0.9, len: 1.1 }].map((n) => ({ ...n, type: 'triangle' as const, gain: 0.8 })),
  beep: [0, 0.3, 0.6, 0.9].map((at) => ({ f: 1000, at, len: 0.16, type: 'square' as const, gain: 0.35 })),
  soft: [{ f: 440, at: 0, len: 1.1 }, { f: 554.37, at: 0.5, len: 1.1 }, { f: 659.25, at: 1, len: 1.4 }].map((n) => ({ ...n, type: 'sine' as const, gain: 0.7 })),
  digital: [0, 0.35, 0.7, 1.05].flatMap((at) => [{ f: 1318.5, at, len: 0.13, type: 'square' as const, gain: 0.3 }, { f: 987.77, at: at + 0.15, len: 0.13, type: 'square' as const, gain: 0.3 }])
};
export const tuneLength = (id: AlarmSound): number => Math.max(...TUNES[id].map((n) => n.at + n.len));

let ctx: AudioContext | null = null;
const audio = (): AudioContext | null => {
  try {
    const C = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!C) return null;
    if (!ctx) ctx = new C();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
};

// plays the tune; returns how long it lasts (seconds). Never throws: a phone with no audio simply stays quiet.
export function playTune(id: AlarmSound, volume: number): number {
  const c = audio();
  if (!c) return 0;
  const vol = Math.min(1, Math.max(0, volume));
  const t0 = c.currentTime + 0.03;
  for (const n of TUNES[id]) {
    try {
      const osc = c.createOscillator(); const g = c.createGain();
      osc.type = n.type || 'sine'; osc.frequency.value = n.f;
      const peak = Math.max(0.0001, (n.gain ?? 0.6) * vol * 0.6);
      g.gain.setValueAtTime(0.0001, t0 + n.at);
      g.gain.exponentialRampToValueAtTime(peak, t0 + n.at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.len);
      osc.connect(g); g.connect(c.destination);
      osc.start(t0 + n.at); osc.stop(t0 + n.at + n.len + 0.05);
    } catch { /* one note failing never stops the rest */ }
  }
  return tuneLength(id);
}

// the alarm: the tune, then (if chosen) the message in the alarm voice
export function ringAlarm(prefs: Pick<StudyPrefs, 'alarm'>, message: string, lang = 'en-IN'): void {
  const secs = playTune(prefs.alarm.sound, prefs.alarm.volume);
  if (prefs.alarm.speak && message && canSpeak()) window.setTimeout(() => speak(message, lang, { preferredVoice: prefs.alarm.voice.name, rate: prefs.alarm.voice.rate, pitch: prefs.alarm.voice.pitch }), Math.round((secs || 0) * 1000) + 200);
}
export const stopAlarm = (): void => stopSpeaking();
