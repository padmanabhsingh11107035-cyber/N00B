import { useSyncExternalStore } from 'react';

// Settings that belong to THIS phone or computer, not to the account (like Instagram's own "device" settings): how big the text is, less motion, higher contrast, the
// data saver, the quality of what is uploaded, whether videos start by themselves, whether links open inside NOOB, the daily time reminder and sleep mode.
// They are kept on the device (localStorage) and applied straight away, also before anyone logs in. Anything that must follow the account lives on the server instead
// (see settings/settingsStore.ts).

export type TextSize = 'small' | 'default' | 'large' | 'xlarge';
export type AutoplayMode = 'always' | 'wifi' | 'never';
export type UploadQuality = 'standard' | 'high';

export interface DevicePrefs {
  reduceMotion: boolean;
  textSize: TextSize;
  highContrast: boolean;
  boldText: boolean;
  dataSaver: boolean;
  uploadQuality: UploadQuality;
  autoplay: AutoplayMode;
  openLinksInApp: boolean;
  suggestedAccounts: boolean;
  dailyLimitMin: number;                 // 0 = no reminder
  breakEveryMin: number;                 // "take a break" reminder after this many minutes in a row, 0 = off
  sleepMode: { on: boolean; from: string; to: string };   // "HH:MM"
}

export const DEFAULT_DEVICE_PREFS: DevicePrefs = {
  reduceMotion: false,
  textSize: 'default',
  highContrast: false,
  boldText: false,
  dataSaver: false,
  uploadQuality: 'standard',
  autoplay: 'always',
  openLinksInApp: true,
  suggestedAccounts: true,
  dailyLimitMin: 0,
  breakEveryMin: 0,
  sleepMode: { on: false, from: '23:00', to: '07:00' }
};

const KEY = 'noob.devicePrefs.v1';
const TEXT_SIZES: TextSize[] = ['small', 'default', 'large', 'xlarge'];
const AUTOPLAY: AutoplayMode[] = ['always', 'wifi', 'never'];
const LIMITS = [0, 15, 30, 45, 60, 90, 120, 180, 240];
const BREAKS = [0, 10, 20, 30, 45, 60];
const timeOk = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/** Cleans whatever was stored (older versions, hand-edited, damaged) into a complete, valid set of preferences. */
export function cleanDevicePrefs(raw: unknown): DevicePrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof DevicePrefs, unknown>>;
  const d = DEFAULT_DEVICE_PREFS;
  const sm = (r.sleepMode && typeof r.sleepMode === 'object' ? r.sleepMode : {}) as Partial<DevicePrefs['sleepMode']>;
  const lim = Number(r.dailyLimitMin);
  const brk = Number(r.breakEveryMin);
  return {
    reduceMotion: typeof r.reduceMotion === 'boolean' ? r.reduceMotion : d.reduceMotion,
    textSize: TEXT_SIZES.includes(r.textSize as TextSize) ? (r.textSize as TextSize) : d.textSize,
    highContrast: typeof r.highContrast === 'boolean' ? r.highContrast : d.highContrast,
    boldText: typeof r.boldText === 'boolean' ? r.boldText : d.boldText,
    dataSaver: typeof r.dataSaver === 'boolean' ? r.dataSaver : d.dataSaver,
    uploadQuality: r.uploadQuality === 'high' ? 'high' : 'standard',
    autoplay: AUTOPLAY.includes(r.autoplay as AutoplayMode) ? (r.autoplay as AutoplayMode) : d.autoplay,
    openLinksInApp: typeof r.openLinksInApp === 'boolean' ? r.openLinksInApp : d.openLinksInApp,
    suggestedAccounts: typeof r.suggestedAccounts === 'boolean' ? r.suggestedAccounts : d.suggestedAccounts,
    dailyLimitMin: LIMITS.includes(lim) ? lim : 0,
    breakEveryMin: BREAKS.includes(brk) ? brk : 0,
    sleepMode: { on: sm.on === true, from: timeOk(sm.from) ? sm.from : d.sleepMode.from, to: timeOk(sm.to) ? sm.to : d.sleepMode.to }
  };
}

export const DAILY_LIMIT_CHOICES = LIMITS;
export const BREAK_CHOICES = BREAKS;

let current: DevicePrefs = DEFAULT_DEVICE_PREFS;
const listeners = new Set<() => void>();

function read(): DevicePrefs {
  try { return cleanDevicePrefs(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch { return DEFAULT_DEVICE_PREFS; }
}

/** Puts the choices to work on the page itself (the root element carries them as attributes; see index.css). */
export function applyDevicePrefs(p: DevicePrefs = current): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const set = (name: string, on: boolean, value = 'on') => { if (on) root.setAttribute(name, value); else root.removeAttribute(name); };
  set('data-reduce-motion', p.reduceMotion);
  set('data-text-size', p.textSize !== 'default', p.textSize);
  set('data-contrast', p.highContrast, 'high');
  set('data-bold', p.boldText);
}

export function getDevicePrefs(): DevicePrefs { return current; }

export function setDevicePrefs(patch: Partial<DevicePrefs>): DevicePrefs {
  current = cleanDevicePrefs({ ...current, ...patch });
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* private window: it still applies until the page is closed */ }
  applyDevicePrefs(current);
  listeners.forEach((l) => l());
  return current;
}

export function useDevicePrefs(): DevicePrefs {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => current, () => DEFAULT_DEVICE_PREFS);
}

/** Should a video start playing by itself right now? "Wi-Fi only" and the data saver look at the connection. */
export function shouldAutoplayVideo(p: DevicePrefs = current): boolean {
  if (p.autoplay === 'never') return false;
  if (p.dataSaver) return false;
  if (p.autoplay === 'wifi') {
    const c = (typeof navigator !== 'undefined' ? (navigator as unknown as { connection?: { type?: string; saveData?: boolean; effectiveType?: string } }).connection : undefined);
    if (c?.saveData) return false;
    if (c?.type) return c.type === 'wifi' || c.type === 'ethernet';
    if (c?.effectiveType) return c.effectiveType === '4g';   // the browser does not say "Wi-Fi": a fast connection counts
  }
  return true;
}

/** How a picture is shrunk before it is uploaded. */
export function uploadImageSettings(kind: 'avatar' | 'other', p: DevicePrefs = current): { maxSide: number; quality: number } {
  const high = p.uploadQuality === 'high' && !p.dataSaver;
  if (kind === 'avatar') return high ? { maxSide: 1024, quality: 0.9 } : { maxSide: 640, quality: 0.82 };
  if (p.dataSaver) return { maxSide: 1080, quality: 0.7 };
  return high ? { maxSide: 2160, quality: 0.92 } : { maxSide: 1440, quality: 0.8 };
}

// start-up: read what was saved and apply it before anything is drawn
current = read();
applyDevicePrefs(current);
