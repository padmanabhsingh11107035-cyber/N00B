// A small black-box recorder for login events (kept in this browser only, newest last, at most 25 entries).
// When someone is signed out, the app uses it to say WHY in plain words instead of guessing, and it gives us the
// evidence to find the cause if something unexpected keeps happening.
//
// Pure functions apart from the storage they are handed, so they can be tested without a browser.

export type DiagKind =
  | 'renewal-failed' // the login server refused to renew the saved login (status + code say why)
  | 'renewal-delayed' // a renewal got a temporary problem (rate limit, error page): the login was kept and retried
  | 'explicit-logout' // someone pressed "Log out" (in this tab or another tab of this browser)
  | 'signed-out' // the library reported the saved login gone
  | 'signed-in'
  | 'token-refreshed';

export interface DiagEntry {
  t: number; // when (ms since 1970)
  kind: DiagKind;
  status?: number;
  code?: string;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = 'noob_auth_diag';
const MAX = 25;

const browserStorage = (): StorageLike | null => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null; // storage blocked (private mode...)
  }
};

export function readDiag(storage: StorageLike | null = browserStorage()): DiagEntry[] {
  if (!storage) return [];
  try {
    const list = JSON.parse(storage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((e) => e && typeof e.t === 'number' && typeof e.kind === 'string') : [];
  } catch {
    return [];
  }
}

export function recordDiag(entry: Omit<DiagEntry, 't'>, storage: StorageLike | null = browserStorage(), now: number = Date.now()): void {
  if (!storage) return;
  try {
    let list = readDiag(storage);
    // the hourly "token refreshed" line would push the useful lines out: keep only the latest one of these
    if (entry.kind === 'token-refreshed' || entry.kind === 'signed-in') list = list.filter((e) => e.kind !== entry.kind);
    list.push({ t: now, ...entry });
    storage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {
    // never let the recorder break the app
  }
}

// Plain-words reasons, worked out from what the recorder saw in the last few minutes.
export const REASON = {
  otherTabLoggedOut: 'you logged out in another tab or window of this browser',
  endedOnServer: 'your login was ended on the server, which happens when the same account is logged out on another device',
  usedTwice: 'your login was renewed twice at the same moment (for example in two tabs, or on a shaky connection)',
  unknownToServer: 'the server no longer recognises the login saved in this browser',
  refused: 'the server refused to renew your login',
  clearedOrOtherTab: 'another tab or window of this browser signed you out, or the browser cleared its saved data',
  unknown: 'the exact reason could not be worked out'
};

const WINDOW_MS = 15 * 60 * 1000;

export function explainSessionEnd(entries: DiagEntry[], now: number = Date.now()): string {
  const recent = entries.filter((e) => now - e.t <= WINDOW_MS && e.t <= now + 60_000);
  const last = (pred: (e: DiagEntry) => boolean) => [...recent].reverse().find(pred);

  const failed = last((e) => e.kind === 'renewal-failed');
  if (failed) {
    const code = (failed.code || '').toLowerCase();
    if (code === 'session_not_found' || code === 'session_expired') return REASON.endedOnServer;
    if (code === 'refresh_token_already_used') return REASON.usedTwice;
    if (code === 'refresh_token_not_found') return REASON.unknownToServer;
    return `${REASON.refused} (${failed.status ?? '?'}${failed.code ? ' ' + failed.code : ''})`;
  }
  if (last((e) => e.kind === 'explicit-logout')) return REASON.otherTabLoggedOut;
  if (last((e) => e.kind === 'signed-out')) return REASON.clearedOrOtherTab;
  return REASON.unknown;
}
