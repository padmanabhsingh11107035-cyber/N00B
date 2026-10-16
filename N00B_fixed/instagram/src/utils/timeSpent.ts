import { useSyncExternalStore } from 'react';
import { getDevicePrefs, type DevicePrefs } from './devicePrefs.ts';

// "Time management": how long NOOB has been open and in front of the person each day (counted only while the page is visible), kept on this device for the last 30
// days, and the two gentle reminders built on it: the daily limit and sleep mode. Nothing here is sent anywhere.

const KEY = 'noob.timeSpent.v1';
const REMIND_KEY = 'noob.timeReminder.v1';
const TICK_SECONDS = 5;
const KEEP_DAYS = 30;

type Days = Record<string, number>;

/** "2026-10-17" in the person's own time zone. */
export const dayKey = (d: Date = new Date()): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function load(): Days {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    const out: Days = {};
    if (raw && typeof raw === 'object') for (const [k, v] of Object.entries(raw)) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && typeof v === 'number' && v >= 0 && v < 86400 * 2) out[k] = Math.round(v);
    return out;
  } catch { return {}; }
}

let days: Days = load();
let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version++; listeners.forEach((l) => l()); };

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(days)); } catch { /* private window: counted until the page closes */ }
}

/** Adds seconds to today (exported for the tests). */
export function addSeconds(seconds: number, when: Date = new Date()): void {
  const k = dayKey(when);
  days = { ...days, [k]: Math.min(86399, (days[k] || 0) + seconds) };
  const cutoff = dayKey(new Date(when.getTime() - KEEP_DAYS * 86400000));
  for (const old of Object.keys(days)) if (old < cutoff) delete days[old];
  save();
  emit();
}

export const secondsOn = (key: string): number => days[key] || 0;
export const secondsToday = (): number => secondsOn(dayKey());

/** The last `n` days, oldest first, today last. */
export function lastDays(n: number, now: Date = new Date()): Array<{ day: string; label: string; seconds: number }> {
  const out: Array<{ day: string; label: string; seconds: number }> = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    out.push({ day: dayKey(d), label: d.toLocaleDateString(undefined, { weekday: 'short' }), seconds: secondsOn(dayKey(d)) });
  }
  return out;
}

export function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 1) return seconds > 0 ? 'less than a minute' : '0 min';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

let timer: number | null = null;
/** Starts counting (once). Returns a function that stops it. */
// "In a row": time since the last break. Leaving NOOB for more than five minutes counts as a break, so does pressing OK on the reminder.
const AWAY_MS = 5 * 60 * 1000;
let sinceBreak = 0;
let lastTickAt = 0;
/** One tick of use: adds to today and to the time in a row. */
export function tickUse(seconds: number, nowMs: number = Date.now()): void {
  if (lastTickAt && nowMs - lastTickAt > AWAY_MS) sinceBreak = 0;
  lastTickAt = nowMs;
  sinceBreak += seconds;
  addSeconds(seconds, new Date(nowMs));
}
export const continuousSeconds = (): number => sinceBreak;

export function startTimeTracking(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  if (timer === null) {
    timer = window.setInterval(() => { if (document.visibilityState === 'visible') tickUse(TICK_SECONDS); }, TICK_SECONDS * 1000);
  }
  return () => { if (timer !== null) { window.clearInterval(timer); timer = null; } };
}

export function useTimeSpentVersion(): number {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => version, () => 0);
}

// ---- the reminders

interface RemindState { limitDay?: string; sleepNight?: string; snoozeUntil?: number }
function loadRemind(): RemindState {
  try { const r = JSON.parse(localStorage.getItem(REMIND_KEY) || '{}'); return r && typeof r === 'object' ? r : {}; } catch { return {}; }
}
function saveRemind(r: RemindState) { try { localStorage.setItem(REMIND_KEY, JSON.stringify(r)); } catch { /* not important */ } }

const toMinutes = (t: string): number => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

/** Is `now` inside the sleep window? A window may cross midnight (23:00 to 07:00). Returns the night's key (the date the night started) or null. */
export function sleepNightKey(sleep: DevicePrefs['sleepMode'], now: Date = new Date()): string | null {
  if (!sleep.on) return null;
  const from = toMinutes(sleep.from), to = toMinutes(sleep.to), cur = now.getHours() * 60 + now.getMinutes();
  if (from === to) return null;
  const inside = from < to ? cur >= from && cur < to : cur >= from || cur < to;
  if (!inside) return null;
  const start = from > to && cur < to ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1) : now;
  return dayKey(start);
}

export type Reminder = { kind: 'limit'; minutes: number } | { kind: 'sleep' } | { kind: 'break'; minutes: number } | null;

/** Which reminder (if any) is due right now. Pure: the page asks again whenever the time spent changes. */
export function dueReminder(prefs: DevicePrefs = getDevicePrefs(), now: Date = new Date(), state: RemindState = loadRemind(), spent: number = secondsToday(), inARow: number = sinceBreak): Reminder {
  if (state.snoozeUntil && state.snoozeUntil > now.getTime()) return null;
  const night = sleepNightKey(prefs.sleepMode, now);
  if (night && state.sleepNight !== night) return { kind: 'sleep' };
  if (prefs.dailyLimitMin > 0 && spent >= prefs.dailyLimitMin * 60 && state.limitDay !== dayKey(now)) return { kind: 'limit', minutes: prefs.dailyLimitMin };
  if (prefs.breakEveryMin > 0 && inARow >= prefs.breakEveryMin * 60) return { kind: 'break', minutes: prefs.breakEveryMin };
  return null;
}

/** "OK": not again today (limit) / tonight (sleep). */
export function dismissReminder(r: NonNullable<Reminder>, now: Date = new Date()): void {
  const s = loadRemind();
  if (r.kind === 'break') sinceBreak = 0;
  else if (r.kind === 'limit') s.limitDay = dayKey(now);
  else s.sleepNight = sleepNightKey(getDevicePrefs().sleepMode, now) || dayKey(now);
  saveRemind(s);
  emit();
}

/** "Remind me in 15 minutes". */
export function snoozeReminder(minutes = 15, now: Date = new Date()): void {
  const s = loadRemind();
  s.snoozeUntil = now.getTime() + minutes * 60000;
  saveRemind(s);
  emit();
}

/** For the tests: forget everything counted. */
export function resetTimeSpentForTests(): void { days = {}; sinceBreak = 0; lastTickAt = 0; version++; }
