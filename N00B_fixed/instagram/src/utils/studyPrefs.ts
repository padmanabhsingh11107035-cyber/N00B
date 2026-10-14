// NOOB STUDY: how it looks, sounds and speaks, chosen by the student. Kept on THIS device (voices differ from phone to phone, so a voice chosen on one phone means
// nothing on another). Nothing here is sent to NOOB. Reads never fail: a damaged or missing value becomes the default.
import { useSyncExternalStore } from 'react';

export type ThemeChoice = 'dark' | 'light' | 'system';
export type ChatTheme = 'calm' | 'ocean' | 'forest' | 'sunset' | 'midnight' | 'paper';
export type AlarmSound = 'bell' | 'chime' | 'beep' | 'soft' | 'digital';
export interface VoicePref { name: string | null; rate: number; pitch: number }
export interface StudyPrefs {
  theme: ThemeChoice;
  chat: ChatTheme;
  aiVoice: VoicePref;            // the AI tutor's voice (when it reads an answer aloud, and in the voice tutor)
  studyVoice: VoicePref;         // the voice that reads notes, flashcards and documents aloud
  alarm: { sound: AlarmSound; volume: number; speak: boolean; voice: VoicePref };
}

export const CHAT_THEMES: Array<{ id: ChatTheme; label: string; accent: string; wall: string }> = [
  { id: 'calm', label: 'Calm', accent: '#e38b69', wall: 'transparent' },
  { id: 'ocean', label: 'Ocean', accent: '#4aa3df', wall: 'linear-gradient(180deg, rgba(74,163,223,.14), rgba(74,163,223,.02))' },
  { id: 'forest', label: 'Forest', accent: '#5fbf8f', wall: 'linear-gradient(180deg, rgba(95,191,143,.14), rgba(95,191,143,.02))' },
  { id: 'sunset', label: 'Sunset', accent: '#e8674f', wall: 'linear-gradient(180deg, rgba(242,196,109,.16), rgba(232,103,79,.05))' },
  { id: 'midnight', label: 'Midnight', accent: '#8b7cf6', wall: 'linear-gradient(180deg, rgba(139,124,246,.18), rgba(15,17,40,.35))' },
  { id: 'paper', label: 'Paper', accent: '#b08a4c', wall: 'linear-gradient(180deg, rgba(176,138,76,.12), rgba(176,138,76,.03))' }
];
export const ALARM_SOUNDS: Array<{ id: AlarmSound; label: string }> = [
  { id: 'bell', label: 'Bell' }, { id: 'chime', label: 'Chime' }, { id: 'beep', label: 'Beep' }, { id: 'soft', label: 'Soft' }, { id: 'digital', label: 'Digital' }
];

const KEY = 'noob.study.prefs.v1';
const voice = (rate = 0.95): VoicePref => ({ name: null, rate, pitch: 1 });
export const DEFAULT_PREFS: StudyPrefs = { theme: 'dark', chat: 'calm', aiVoice: voice(), studyVoice: voice(0.9), alarm: { sound: 'bell', volume: 0.7, speak: true, voice: voice(1) } };

const num = (v: unknown, lo: number, hi: number, d: number): number => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const cleanVoice = (v: any, d: VoicePref): VoicePref => ({ name: typeof v?.name === 'string' && v.name.length < 200 ? v.name : null, rate: num(v?.rate, 0.5, 1.6, d.rate), pitch: num(v?.pitch, 0.6, 1.6, d.pitch) });

// whatever was saved is checked and tidied: an unknown choice is the default, numbers are held in range
export function cleanPrefs(raw: unknown): StudyPrefs {
  const r: any = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULT_PREFS;
  return {
    theme: ['dark', 'light', 'system'].includes(r.theme) ? r.theme : d.theme,
    chat: CHAT_THEMES.some((c) => c.id === r.chat) ? r.chat : d.chat,
    aiVoice: cleanVoice(r.aiVoice, d.aiVoice),
    studyVoice: cleanVoice(r.studyVoice, d.studyVoice),
    alarm: {
      sound: ALARM_SOUNDS.some((a) => a.id === r.alarm?.sound) ? r.alarm.sound : d.alarm.sound,
      volume: num(r.alarm?.volume, 0, 1, d.alarm.volume),
      speak: typeof r.alarm?.speak === 'boolean' ? r.alarm.speak : d.alarm.speak,
      voice: cleanVoice(r.alarm?.voice, d.alarm.voice)
    }
  };
}

let current: StudyPrefs | null = null;
const listeners = new Set<() => void>();
export function loadPrefs(): StudyPrefs {
  if (current) return current;
  let raw: unknown = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* private mode or damaged: the defaults are used */ }
  current = cleanPrefs(raw);
  return current;
}
export function savePrefs(patch: Partial<StudyPrefs> | ((p: StudyPrefs) => Partial<StudyPrefs>)): StudyPrefs {
  const base = loadPrefs();
  const next = cleanPrefs({ ...base, ...(typeof patch === 'function' ? patch(base) : patch) });
  current = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* it lasts until the app is closed */ }
  listeners.forEach((l) => l());
  return next;
}
export const resetPrefs = (): StudyPrefs => savePrefs({ ...DEFAULT_PREFS });
export function usePrefs(): StudyPrefs {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, loadPrefs, () => DEFAULT_PREFS);
}

// "system" follows the phone
export function effectiveTheme(p: Pick<StudyPrefs, 'theme'>, systemDark?: boolean): 'dark' | 'light' {
  if (p.theme === 'dark' || p.theme === 'light') return p.theme;
  const dark = systemDark ?? (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)').matches : true);
  return dark ? 'dark' : 'light';
}
