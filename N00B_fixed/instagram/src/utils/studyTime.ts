// NOOB STUDY: dates and times in the STUDENT's own time zone (which may differ from the phone's), and the small words built from them
// ("Today, 5:30 pm", "in 3 days", "Good evening"). Pure functions, tested in scripts/supabase/test-noob-study-ui.mjs.

export const browserTimeZone = (): string => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'; } catch { return 'Asia/Kolkata'; }
};

export const isValidTimeZone = (tz: string): boolean => {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
};

export function timeZoneList(): string[] {
  try {
    const list = (Intl as any).supportedValuesOf?.('timeZone') as string[] | undefined;
    // some devices still list India as Asia/Calcutta: the modern name is always offered too
    if (list && list.length) return list.includes('Asia/Kolkata') ? list : ['Asia/Kolkata', ...list];
  } catch { /* an older browser: the short list below */ }
  return ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Dhaka', 'Asia/Kathmandu', 'Asia/Colombo', 'Asia/Singapore', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Australia/Sydney', 'UTC'];
}

interface Parts { year: number; month: number; day: number; hour: number; minute: number; second: number }
function partsIn(date: Date, tz: string): Parts {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(date)) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return { year: o.year, month: o.month, day: o.day, hour: o.hour === 24 ? 0 : o.hour, minute: o.minute, second: o.second };
}
const pad = (n: number, w = 2) => String(n).padStart(w, '0');

// "2026-10-14" in the student's time zone
export function ymdIn(date: Date | string, tz: string): string {
  const p = partsIn(typeof date === 'string' ? new Date(date) : date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}
export const hourIn = (date: Date, tz: string): number => partsIn(date, tz).hour;

const dayNumber = (ymd: string): number => { const [y, m, d] = ymd.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86400000); };
// calendar days from `from` to `to` in the student's time zone (0 = the same day, 1 = the next day, negative = earlier)
export const dayDiff = (to: Date | string, from: Date | string, tz: string): number => dayNumber(ymdIn(to, tz)) - dayNumber(ymdIn(from, tz));
export function addDaysYmd(ymd: string, days: number): string {
  const t = new Date((dayNumber(ymd) + days) * 86400000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
export const weekdayOf = (ymd: string): number => new Date(dayNumber(ymd) * 86400000).getUTCDay();   // 0 = Sunday

// the wall-clock time `local` ("2026-10-14T17:30") in time zone `tz`, as the real moment it is
function offsetMs(at: Date, tz: string): number {
  const p = partsIn(at, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at.getTime() / 1000) * 1000;
}
export function zonedToUtc(local: string, tz: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(local);
  if (!m) return new Date(NaN);
  const asUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0));
  let guess = asUtc - offsetMs(new Date(asUtc), tz);
  guess = asUtc - offsetMs(new Date(guess), tz);   // once more: the offset can differ either side of a daylight-saving change
  return new Date(guess);
}
// the reverse: what a date-time input should show for a stored moment
export function utcToLocalInput(date: Date | string, tz: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const p = partsIn(d, tz);
  return ymdIn(d, tz) + 'T' + pad(p.hour) + ':' + pad(p.minute);   // (joined with +, not a template: the translation scanner reads templates as screen text)
}
export const startOfDay = (ymd: string, tz: string): Date => zonedToUtc(`${ymd}T00:00`, tz);

export function greetingFor(hour: number): string {
  if (hour < 5) return 'Still up?';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 22) return 'Good evening';
  return 'Winding down?';
}

export function longDate(date: Date, tz: string): string {
  try { return new Intl.DateTimeFormat('en-IN', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(date); } catch { return ymdIn(date, tz); }
}
const timeText = (date: Date, tz: string): string => {
  try { return new Intl.DateTimeFormat('en-IN', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true }).format(date).replace(/\s?([ap])m/i, (_, x) => ` ${x.toLowerCase()}m`); } catch { return ''; }
};
export const clockText = timeText;
const shortDay = (date: Date, tz: string): string => {
  try { return new Intl.DateTimeFormat('en-IN', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(date); } catch { return ymdIn(date, tz); }
};

// "Today, 5:30 pm" / "Tomorrow" / "Yesterday" / "Fri, 17 Oct"
export function dueLabel(iso: string | null | undefined, tz: string, now: Date = new Date()): string {
  if (!iso) return 'No deadline';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = dayDiff(d, now, tz);
  const t = timeText(d, tz);
  const atMidnight = t === '12:00 am';
  const when = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : shortDay(d, tz);
  return atMidnight ? when : `${when}, ${t}`;
}

export interface Countdown { days: number; label: string; past: boolean; soon: boolean }
export function countdown(iso: string, tz: string, now: Date = new Date()): Countdown {
  const d = new Date(iso);
  const days = dayDiff(d, now, tz);
  if (days === 0) return { days, label: d.getTime() >= now.getTime() ? 'Today' : 'Earlier today', past: d.getTime() < now.getTime(), soon: d.getTime() >= now.getTime() };
  if (days === 1) return { days, label: 'Tomorrow', past: false, soon: true };
  if (days > 1) return { days, label: `In ${days} days`, past: false, soon: days <= 7 };
  return { days, label: days === -1 ? 'Yesterday' : `${-days} days ago`, past: true, soon: false };
}

export function minutesLabel(n: number): string {
  const m = Math.max(0, Math.round(n || 0));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
export const clock = (totalSeconds: number): string => {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
};

// seven days ending on `ymd` (oldest first)
export function lastDays(ymd: string, n = 7): string[] { return Array.from({ length: n }, (_, i) => addDaysYmd(ymd, i - (n - 1))); }
export const shortWeekday = (ymd: string): string => ['S', 'M', 'T', 'W', 'T', 'F', 'S'][weekdayOf(ymd)];
