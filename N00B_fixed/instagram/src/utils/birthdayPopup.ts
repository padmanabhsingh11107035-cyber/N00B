// The birthday pop-up: on the person's birthday, when NOOB opens, a box says "Happy Birthday", wishes them well, offers the scratch card the database made for them (migration 20260919000006,
// run_birthday_check, hourly) and plays a birthday tune. This file decides WHEN the box opens (pure, so it is tested on its own: scripts/supabase/test-birthday-popup.mjs).
// It opens once per birthday on a device: the card (or, with no card, the year) is remembered.
export interface BirthdayNote { id?: string; type: string; createdAt?: string; scratchCardId?: string; data?: { scratchCardId?: string } | null }
export interface BirthdayPick { key: string; cardId?: string }

const sameDay = (a: Date, b: Date): boolean => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** is today the person's birthday? `dob` is "YYYY-MM-DD" (the year may be anything). 29 February is celebrated on 28 February in years that have no 29th. */
export function isBirthdayToday(dob: string | undefined | null, now: Date): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dob || ''));
  if (!m) return false;
  const month = Number(m[2]) - 1, day = Number(m[3]);
  if (month < 0 || month > 11 || day < 1 || day > 31) return false;
  if (month === 1 && day === 29) {
    const leap = new Date(now.getFullYear(), 1, 29).getMonth() === 1;
    return now.getMonth() === 1 && now.getDate() === (leap ? 29 : 28);
  }
  return now.getMonth() === month && now.getDate() === day;
}

/** the age they turn today (null when the year is not a real one) */
export function ageToday(dob: string | undefined | null, now: Date): number | null {
  const m = /^(\d{4})-/.exec(String(dob || ''));
  if (!m) return null;
  const age = now.getFullYear() - Number(m[1]);
  return age >= 1 && age <= 120 ? age : null;
}

/** what to show now, or null: the birthday card of today (made by the database) wins; with no card, the person's own birthday date; once per card / year on a device */
export function pickBirthdayPopup(o: { dob?: string | null; notifications: BirthdayNote[]; now: Date; shownKey: string | null }): BirthdayPick | null {
  for (const n of o.notifications) {
    if (n.type !== 'birthday_wish') continue;
    const card = n.scratchCardId || n.data?.scratchCardId;
    const at = n.createdAt ? new Date(n.createdAt) : null;
    if (!card || !at || Number.isNaN(at.getTime()) || !sameDay(at, o.now)) continue;
    const key = `card-${card}`;
    return o.shownKey === key || o.shownKey === `year-${o.now.getFullYear()}` ? null : { key, cardId: card };
  }
  if (isBirthdayToday(o.dob, o.now)) {
    const key = `year-${o.now.getFullYear()}`;
    if (o.shownKey === key || (o.shownKey || '').startsWith('card-')) return null;
    return { key };
  }
  return null;
}

/** the wish: a few warm lines, a different one each year, with the age when it is known */
export const WISHES = [
  'May your day be full of laughter, your people close and your dreams a little closer. We are so glad you are part of NOOB.',
  'Another year, another chapter, and you are just getting started. Eat the cake, make a wish and enjoy every single minute.',
  'Wishing you a year of good news, great friends and moments worth posting. Today is all yours.',
  'The whole NOOB family is cheering for you today. May this year bring you everything you hoped for and more.'
];
export function wishFor(year: number, age: number | null): string {
  const base = WISHES[Math.abs(year) % WISHES.length];
  return age ? `Happy ${age}${age % 10 === 1 && age !== 11 ? 'st' : age % 10 === 2 && age !== 12 ? 'nd' : age % 10 === 3 && age !== 13 ? 'rd' : 'th'} birthday! ${base}` : base;
}

const SLOT = (userId: string): string => `noob_bday_popup_v1_${userId}`;
export const readShown = (userId: string): string | null => { try { return localStorage.getItem(SLOT(userId)); } catch { return null; } };
export const writeShown = (userId: string, key: string): void => { try { localStorage.setItem(SLOT(userId), key); } catch { /* it may show again on this device */ } };
