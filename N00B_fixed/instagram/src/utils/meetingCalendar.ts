// Helpers for planned Live Lounge meetings: times in a chosen time zone, the invitation text, and "add to calendar" (an .ics file plus
// Google and Outlook links). Pure functions, no screens, so they can be tested on their own.

import { siteOrigin } from './siteUrl.ts';
export interface MeetingLike {
  id: string;
  title: string;
  description?: string;
  hostDisplayName?: string;
  hostUsername?: string;
  scheduledFor: string;
  durationMinutes: number;
  timezone: string;
  recurrence: 'none' | 'daily' | 'weekly' | 'monthly';
  recurrenceInterval?: number;
  recurrenceEndDate?: string | null;
  recurrenceCount?: number | null;
  meetingCode: string;
  passcode?: string | null;
  includePasscodeInInvite?: boolean;
  reminderMinutes?: number;
}

// "482915637" -> "482 915 637" (and a 10-digit personal ID -> "482 915 6370")
export const formatMeetingId = (code: string): string => {
  const digits = String(code || '');
  if (/^\d{9}$/.test(digits)) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  if (/^\d{10}$/.test(digits)) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  return digits;
};

export const defaultTimeZone = (): string => {
  try {
    const z = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return z === 'Asia/Calcutta' ? 'Asia/Kolkata' : z;   // the same zone; the current name reads better
  } catch { return 'UTC'; }
};

const FALLBACK_ZONES = ['UTC', 'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Australia/Sydney'];
export const timeZoneList = (): string[] => {
  let zones: string[] = [];
  try { zones = (Intl as any).supportedValuesOf?.('timeZone') || []; } catch { zones = []; }
  if (!zones.length) zones = FALLBACK_ZONES;
  const mine = defaultTimeZone();
  const head = Array.from(new Set([mine, 'Asia/Kolkata', 'UTC']));
  return [...head, ...zones.filter((z) => !head.includes(z))];
};

// how far ahead of UTC a zone is at a given moment, in milliseconds
function zoneOffsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

// "2026-10-12" + "16:30" as written on a clock in `tz`  ->  the real moment, as an ISO string
export function zonedToIso(date: string, time: string, tz: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let utc = wall - zoneOffsetMs(wall, tz);
  utc = wall - zoneOffsetMs(utc, tz);       // once more: the first guess can sit on the wrong side of a clock change
  return new Date(utc).toISOString();
}

// a real moment -> the date and time a clock in `tz` shows for it
export function isoToZoned(iso: string, tz: string): { date: string; time: string } {
  const ms = Date.parse(iso);
  const off = zoneOffsetMs(ms, tz);
  const d = new Date(ms + off);
  const p = (n: number) => String(n).padStart(2, '0');
  return { date: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`, time: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` };
}

export function formatInZone(iso: string, tz: string, withZone = true): string {
  const when = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
  return withZone ? `${when} (${tz})` : when;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h} hr` : '', m ? `${m} min` : ''].filter(Boolean).join(' ') || '0 min';
}

export function recurrenceText(m: Pick<MeetingLike, 'recurrence' | 'recurrenceInterval' | 'recurrenceEndDate' | 'recurrenceCount'>): string {
  if (m.recurrence === 'none') return 'Does not repeat';
  const n = m.recurrenceInterval || 1;
  const unit = m.recurrence === 'daily' ? 'day' : m.recurrence === 'weekly' ? 'week' : 'month';
  const every = n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`;
  const end = m.recurrenceCount ? `, ${m.recurrenceCount} times` : m.recurrenceEndDate ? `, until ${m.recurrenceEndDate}` : '';
  return every + end;
}

const origin = (o?: string) => (o || siteOrigin()).replace(/\/+$/, '');

export function joinUrl(m: Pick<MeetingLike, 'meetingCode' | 'passcode'>, o?: string): string {
  return `${origin(o)}/?liveLounge=${encodeURIComponent(m.meetingCode)}${m.passcode ? `&pwd=${encodeURIComponent(m.passcode)}` : ''}`;
}

// The text people receive: who invites, what, when, and how to get in.
export function invitationText(m: MeetingLike, o?: string): string {
  const host = m.hostDisplayName || m.hostUsername || 'Someone';
  const showPass = !!m.passcode && m.includePasscodeInInvite !== false;
  const lines = [
    `${host} is inviting you to a NOOB Live Lounge meeting.`,
    '',
    `Topic: ${m.title}`,
    `Time: ${formatInZone(m.scheduledFor, m.timezone)}`,
    `Duration: ${formatDuration(m.durationMinutes)}`
  ];
  if (m.recurrence !== 'none') lines.push(`Repeats: ${recurrenceText(m)}`);
  if (m.description) lines.push('', m.description);
  lines.push('', `Join: ${joinUrl({ meetingCode: m.meetingCode, passcode: showPass ? m.passcode : null }, o)}`, `Meeting ID: ${formatMeetingId(m.meetingCode)}`);
  if (showPass) lines.push(`Passcode: ${m.passcode}`);
  return lines.join('\n');
}

const icsDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsEscape = (s: string) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function foldLine(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) { out.push(rest.slice(0, 74)); rest = ' ' + rest.slice(74); }
  out.push(rest);
  return out.join('\r\n');
}

export function rruleFor(m: Pick<MeetingLike, 'recurrence' | 'recurrenceInterval' | 'recurrenceEndDate' | 'recurrenceCount' | 'timezone'>): string | null {
  if (m.recurrence === 'none') return null;
  const freq = m.recurrence === 'daily' ? 'DAILY' : m.recurrence === 'weekly' ? 'WEEKLY' : 'MONTHLY';
  let rule = `FREQ=${freq};INTERVAL=${m.recurrenceInterval || 1}`;
  if (m.recurrenceCount) rule += `;COUNT=${m.recurrenceCount}`;
  else if (m.recurrenceEndDate) rule += `;UNTIL=${icsDate(zonedToIso(m.recurrenceEndDate, '23:59', m.timezone))}`;
  return rule;
}

export function buildIcs(m: MeetingLike, o?: string): string {
  const start = icsDate(m.scheduledFor);
  const end = icsDate(new Date(Date.parse(m.scheduledFor) + m.durationMinutes * 60000).toISOString());
  const rule = rruleFor(m);
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NOOB//Live Lounge//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${m.id}@nooob.xyz`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${icsEscape(m.title)}`,
    `DESCRIPTION:${icsEscape(invitationText(m, o))}`,
    `LOCATION:${icsEscape(joinUrl({ meetingCode: m.meetingCode, passcode: null }, o))}`,
    `URL:${joinUrl({ meetingCode: m.meetingCode, passcode: null }, o)}`
  ];
  if (rule) lines.push(`RRULE:${rule}`);
  if (m.reminderMinutes && m.reminderMinutes > 0) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(m.title)}`, `TRIGGER:-PT${m.reminderMinutes}M`, 'END:VALARM');
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

export function googleCalendarUrl(m: MeetingLike, o?: string): string {
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: m.title,
    dates: `${icsDate(m.scheduledFor)}/${icsDate(new Date(Date.parse(m.scheduledFor) + m.durationMinutes * 60000).toISOString())}`,
    details: invitationText(m, o),
    location: joinUrl({ meetingCode: m.meetingCode, passcode: null }, o)
  });
  const rule = rruleFor(m);
  if (rule) q.set('recur', `RRULE:${rule}`);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

export function outlookCalendarUrl(m: MeetingLike, o?: string): string {
  const q = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: m.title,
    startdt: new Date(m.scheduledFor).toISOString(),
    enddt: new Date(Date.parse(m.scheduledFor) + m.durationMinutes * 60000).toISOString(),
    body: invitationText(m, o),
    location: joinUrl({ meetingCode: m.meetingCode, passcode: null }, o)
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${q.toString()}`;
}

// A passcode that is easy to read out loud (no 0/O, 1/l/I).
export function randomPasscode(length = 6): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}
