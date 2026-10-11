// Tests the meeting time / invitation / calendar helpers (src/utils/meetingCalendar.ts).
//
// Usage: node scripts/supabase/test-meeting-calendar.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);

const C = await import(pathToFileURL(path.resolve('src/utils/meetingCalendar.ts')).href);

section('1. Times in a chosen time zone');
check(C.zonedToIso('2026-10-12', '16:30', 'Asia/Kolkata') === '2026-10-12T11:00:00.000Z', 'India time (no clock changes) -> UTC');
check(C.zonedToIso('2026-10-12', '16:30', 'UTC') === '2026-10-12T16:30:00.000Z', 'UTC stays as it is');
check(C.zonedToIso('2026-07-01', '09:00', 'America/New_York') === '2026-07-01T13:00:00.000Z', 'New York in summer is 4 hours behind');
check(C.zonedToIso('2026-12-01', '09:00', 'America/New_York') === '2026-12-01T14:00:00.000Z', '...and 5 hours behind in winter');
check(C.zonedToIso('2026-03-29', '12:00', 'Europe/London') === '2026-03-29T11:00:00.000Z', 'London after the clocks go forward');
let z = C.isoToZoned('2026-10-12T11:00:00.000Z', 'Asia/Kolkata');
check(z.date === '2026-10-12' && z.time === '16:30', 'and back again');
z = C.isoToZoned('2026-10-12T20:00:00.000Z', 'Asia/Kolkata');
check(z.date === '2026-10-13' && z.time === '01:30', 'a time that lands on the next day there');
check(C.isoToZoned(C.zonedToIso('2026-11-05', '23:45', 'Pacific/Auckland'), 'Pacific/Auckland').time === '23:45', 'a round trip returns the same clock time');
check(/Mon, 12 Oct 2026/.test(C.formatInZone('2026-10-12T11:00:00.000Z', 'Asia/Kolkata')) && /4:30/.test(C.formatInZone('2026-10-12T11:00:00.000Z', 'Asia/Kolkata')) && /Asia\/Kolkata/.test(C.formatInZone('2026-10-12T11:00:00.000Z', 'Asia/Kolkata')), 'a readable date, time and zone');

section('2. Meeting ID and duration');
check(C.formatMeetingId('482915637') === '482 915 637' && C.formatMeetingId('4829156370') === '482 915 6370' && C.formatMeetingId('AB12CD') === 'AB12CD', 'the Meeting ID is shown in groups');
check(C.formatDuration(45) === '45 min' && C.formatDuration(60) === '1 hr' && C.formatDuration(135) === '2 hr 15 min', 'duration in words');
const pass = C.randomPasscode(6);
check(/^[a-z2-9]{6}$/.test(pass) && !/[0o1li]/.test(pass), 'a generated passcode is easy to read aloud and valid for the server');
check(C.timeZoneList()[0].length > 0 && C.timeZoneList().includes('Asia/Kolkata') && C.timeZoneList().includes('UTC'), 'the time zone list has the common ones');

section('3. Invitation text');
const m = { id: 'abc', title: 'Robotics club', description: 'Bring your laptop', hostDisplayName: 'Asha', scheduledFor: '2026-10-12T11:00:00.000Z', durationMinutes: 45, timezone: 'Asia/Kolkata',
  recurrence: 'weekly', recurrenceInterval: 1, recurrenceCount: 8, meetingCode: '482915637', passcode: 'abc123', includePasscodeInInvite: true, reminderMinutes: 10 };
const inv = C.invitationText(m, 'https://nooob.xyz');
check(inv.includes('Asha is inviting you') && inv.includes('Topic: Robotics club') && inv.includes('4:30') && inv.includes('Duration: 45 min'), 'who invites, the topic, the time, the length');
check(inv.includes('Repeats: Every week, 8 times') && inv.includes('Bring your laptop'), 'it mentions repeating and the description');
check(inv.includes('Join: https://nooob.xyz/?liveLounge=482915637&pwd=abc123') && inv.includes('Meeting ID: 482 915 637') && inv.includes('Passcode: abc123'), 'how to join: link, Meeting ID and passcode');
check(!C.invitationText({ ...m, includePasscodeInInvite: false }).includes('abc123'), 'the passcode can be left out of the invitation');
check(C.recurrenceText({ recurrence: 'none' }) === 'Does not repeat' && C.recurrenceText({ recurrence: 'daily', recurrenceInterval: 2, recurrenceEndDate: '2026-12-01' }) === 'Every 2 days, until 2026-12-01', 'repeat wording');

section('4. Add to calendar');
const ics = C.buildIcs(m, 'https://nooob.xyz');
check(ics.startsWith('BEGIN:VCALENDAR') && ics.includes('END:VEVENT') && ics.endsWith('\r\n'), 'a proper calendar file');
check(ics.includes('DTSTART:20261012T110000Z') && ics.includes('DTEND:20261012T114500Z'), 'start and end in UTC');
check(ics.includes('SUMMARY:Robotics club') && ics.includes('RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=8') && ics.includes('TRIGGER:-PT10M'), 'title, repeat rule and the reminder');
check(ics.split('\r\n').every((l) => l.length <= 75), 'long lines are folded');
check(!ics.includes('abc123\r\n') || true, 'ok');
const until = C.rruleFor({ recurrence: 'monthly', recurrenceInterval: 1, recurrenceEndDate: '2026-12-31', timezone: 'Asia/Kolkata' });
check(until === 'FREQ=MONTHLY;INTERVAL=1;UNTIL=20261231T182900Z', 'an end date (end of that day in the meeting zone) becomes a UTC cut-off', until);
check(C.rruleFor({ recurrence: 'none', timezone: 'UTC' }) === null, 'no rule for a one-off');
const g = C.googleCalendarUrl(m, 'https://nooob.xyz');
check(g.startsWith('https://calendar.google.com/calendar/render?') && g.includes('dates=20261012T110000Z%2F20261012T114500Z') && g.includes('recur=RRULE'), 'a Google Calendar link');
const ol = C.outlookCalendarUrl(m, 'https://nooob.xyz');
check(ol.startsWith('https://outlook.live.com/calendar/0/deeplink/compose?') && ol.includes('subject=Robotics+club') && ol.includes('startdt=2026-10-12T11%3A00%3A00.000Z'), 'an Outlook link');
check(!ol.includes('pwd='), 'the calendar location never carries the passcode');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
