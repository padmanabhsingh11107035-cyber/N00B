// Remembers which page of the home menu (Daily NOOB, NOOB Rooms, Shop, ...) a person had open, plus a little of their progress on it,
// so closing the app or refreshing brings them back to the same page instead of the home feed. Also remembers which Live Lounge
// meeting they are in, so a refresh reconnects them to it (until they tap Leave).
//
// Everything is kept on the person's own device (localStorage), for the account that was signed in, and only for 12 hours.
// Logging out clears it. A page that gets closed normally clears itself, so the next time it opens fresh.

export type ResumePage = 'daily' | 'rooms' | 'song' | 'lounge' | 'store' | 'food' | 'ai' | 'support' | 'suggestions' | 'games';

const PAGES: ResumePage[] = ['daily', 'rooms', 'song', 'lounge', 'store', 'food', 'ai', 'support', 'suggestions', 'games'];
const PAGE_KEY = 'noob.resume.v1';
const MEETING_KEY = 'noob.lounge.meeting.v1';
export const RESUME_MAX_AGE_MS = 12 * 60 * 60 * 1000;

interface Saved { userId: string; page: ResumePage; at: number; fields: Record<string, unknown> }

const storage = (): Storage | null => {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
};

function readSaved(): Saved | null {
  try {
    const raw = storage()?.getItem(PAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || typeof s.userId !== 'string' || !PAGES.includes(s.page) || typeof s.at !== 'number' || !s.fields || typeof s.fields !== 'object') return null;
    return s as Saved;
  } catch {
    return null;
  }
}

function writeSaved(s: Saved | null): void {
  try {
    const st = storage();
    if (!st) return;
    if (s) st.setItem(PAGE_KEY, JSON.stringify(s)); else st.removeItem(PAGE_KEY);
  } catch { /* storage full or blocked: the page simply will not be remembered */ }
}

const fresh = (s: Saved | null, userId: string, now: number): s is Saved => !!s && s.userId === userId && now - s.at < RESUME_MAX_AGE_MS;

// The page this account had open (null = none / too old / another account's).
export function getResumePage(userId: string, now = Date.now()): ResumePage | null {
  const s = readSaved();
  return fresh(s, userId, now) ? s.page : null;
}

// Called whenever the open page changes: the page name, or null once it is closed (which forgets its progress too).
export function setResumePage(userId: string, page: ResumePage | null, now = Date.now()): void {
  if (!page) { writeSaved(null); return; }
  const s = readSaved();
  if (fresh(s, userId, now) && s.page === page) writeSaved({ ...s, at: now });
  else writeSaved({ userId, page, at: now, fields: {} });
}

// A saved bit of progress for the open page (undefined when there is none, or the page / account / age does not match).
export function readResumeField<T>(userId: string, page: ResumePage, field: string, now = Date.now()): T | undefined {
  const s = readSaved();
  if (!fresh(s, userId, now) || s.page !== page) return undefined;
  return s.fields[field] as T | undefined;
}

// Only ever updates the bucket of the page that is currently open — a page opened from somewhere else never leaves anything behind.
export function writeResumeField(userId: string, page: ResumePage, field: string, value: unknown, now = Date.now()): void {
  const s = readSaved();
  if (!fresh(s, userId, now) || s.page !== page) return;
  writeSaved({ ...s, at: now, fields: { ...s.fields, [field]: value } });
}

// Forget the open page, but only if it is still this one (a page being closed must not wipe the next page that already opened).
export function clearResumePageIf(userId: string, page: ResumePage, now = Date.now()): void {
  const s = readSaved();
  if (s && s.userId === userId && s.page === page) writeSaved(null);
  void now;
}

// --- Games: a game in progress (board, score, whose turn...) is kept as one "snapshot" per game, inside the Games page's bucket.
// A snapshot is only ever read back by the same account within 12 hours, and a game clears its own when it ends.

export function loadGameSnapshot<T>(userId: string | undefined, gameId: string, now = Date.now()): T | null {
  if (!userId) return null;
  const v = readResumeField<T>(userId, 'games', `snap:${gameId}`, now);
  return v === undefined || v === null ? null : v;
}

export function saveGameSnapshot(userId: string | undefined, gameId: string, value: unknown, now = Date.now()): void {
  if (userId) writeResumeField(userId, 'games', `snap:${gameId}`, value, now);
}

export function clearGameSnapshot(userId: string | undefined, gameId: string, now = Date.now()): void {
  if (userId) writeResumeField(userId, 'games', `snap:${gameId}`, null, now);
}

// --- Live Lounge meeting

export function saveMeeting(userId: string, roomId: string, now = Date.now()): void {
  try { storage()?.setItem(MEETING_KEY, JSON.stringify({ userId, roomId, at: now })); } catch { /* not remembered */ }
}

export function readMeeting(userId: string, now = Date.now()): { roomId: string } | null {
  try {
    const raw = storage()?.getItem(MEETING_KEY);
    if (!raw) return null;
    const m = JSON.parse(raw);
    if (!m || m.userId !== userId || typeof m.roomId !== 'string' || typeof m.at !== 'number' || now - m.at >= RESUME_MAX_AGE_MS) return null;
    return { roomId: m.roomId };
  } catch {
    return null;
  }
}

export function clearMeeting(): void {
  try { storage()?.removeItem(MEETING_KEY); } catch { /* nothing to do */ }
}

// Logging out forgets everything.
export function clearResume(): void {
  writeSaved(null);
  clearMeeting();
}

// --- Once per app load

// What to reopen right after the app loads. Asked once per load: the home screen asks it when it first appears, so coming back to
// the home tab later does not pull the person into a page again. (A second ask within a couple of seconds gets the same answer,
// because React can start the same screen twice in a row.)
let firstAsk: { userId: string; page: ResumePage | null; at: number } | null = null;
export function takeRestorePage(userId: string, now = Date.now()): ResumePage | null {
  if (firstAsk && firstAsk.userId === userId) return now - firstAsk.at < 2000 ? firstAsk.page : null;
  const page = readMeeting(userId, now) ? 'lounge' : getResumePage(userId, now);
  firstAsk = { userId, page, at: now };
  return page;
}
export function forgetFirstAskForTests(): void { firstAsk = null; }
