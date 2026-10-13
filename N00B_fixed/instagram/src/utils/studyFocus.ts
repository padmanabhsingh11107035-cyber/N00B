// NOOB STUDY: the focus timer's arithmetic. It counts real elapsed time (not "ticks"), so a sleeping phone or a busy browser never makes it drift,
// pausing really pauses, and a session the student walked away from is recorded as it was, not as finished.

export interface Run {
  id: string;
  kind: 'focus' | 'break';
  plannedSec: number;
  startedAt: number;          // ms
  pausedMs: number;           // time already spent paused
  pausedAt: number | null;    // ms, while paused
  subjectId: string | null;
  lastSeen: number;           // ms: the last moment the app was known to be open
}

export const elapsedSec = (r: Run, now: number): number => Math.max(0, Math.floor(((r.pausedAt ?? now) - r.startedAt - r.pausedMs) / 1000));
export const focusedSec = (r: Run, now: number): number => Math.min(r.plannedSec, elapsedSec(r, now));
export const remainingSec = (r: Run, now: number): number => Math.max(0, r.plannedSec - elapsedSec(r, now));
export const isFinished = (r: Run, now: number): boolean => elapsedSec(r, now) >= r.plannedSec;
export const progress = (r: Run, now: number): number => (r.plannedSec <= 0 ? 1 : Math.min(1, elapsedSec(r, now) / r.plannedSec));

export const pauseRun = (r: Run, now: number): Run => (r.pausedAt === null ? { ...r, pausedAt: now, lastSeen: now } : r);
export const resumeRun = (r: Run, now: number): Run => (r.pausedAt === null ? r : { ...r, pausedMs: r.pausedMs + (now - r.pausedAt), pausedAt: null, lastSeen: now });
export const touchRun = (r: Run, now: number): Run => ({ ...r, lastSeen: now });

// When the app opens again with a saved session: keep going if it was only just left, otherwise close it honestly at the last moment it was seen.
export type Revival = { action: 'resume'; run: Run } | { action: 'interrupt'; focusSeconds: number };
export function reviveRun(stored: Run, now: number, maxGapMs = 3 * 60 * 1000): Revival {
  const gap = now - stored.lastSeen;
  if (stored.pausedAt !== null) return { action: 'resume', run: stored };            // paused: nothing runs while paused
  if (gap <= maxGapMs) return { action: 'resume', run: stored };
  return { action: 'interrupt', focusSeconds: focusedSec(stored, stored.lastSeen) };
}

export function parseRun(raw: string | null): Run | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw);
    if (r && typeof r.id === 'string' && (r.kind === 'focus' || r.kind === 'break') && Number.isFinite(r.plannedSec) && Number.isFinite(r.startedAt)
      && Number.isFinite(r.pausedMs) && Number.isFinite(r.lastSeen) && (r.pausedAt === null || Number.isFinite(r.pausedAt))) {
      return { id: r.id, kind: r.kind, plannedSec: r.plannedSec, startedAt: r.startedAt, pausedMs: r.pausedMs, pausedAt: r.pausedAt, subjectId: typeof r.subjectId === 'string' ? r.subjectId : null, lastSeen: r.lastSeen };
    }
  } catch { /* not a saved session */ }
  return null;
}

export const FOCUS_CHOICES = [15, 25, 30, 45, 60];
export const BREAK_CHOICES = [5, 10, 15];
export const clampMinutes = (n: number, max = 180): number => Math.max(1, Math.min(max, Math.round(Number.isFinite(n) ? n : 25)));
