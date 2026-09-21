// Decides what the app does when it checks that you are still logged in (every 30 seconds, and whenever you come
// back to the tab).
//
// The rule that matters: only the DATABASE saying "this account is suspended" may be reported as a suspension.
// Anything else that ends a login (the saved login was removed after a failed renewal, another tab signed out, ...)
// is a plain "you were signed out", said in those words. And a check that could not be completed (bad connection,
// a hiccup on the server) never ends a session at all.
//
// Every tab uses its OWN account (see services/tabSessions.ts), so logging in as another account in another tab does not touch this
// tab. "switched" is only a safety net now: if this tab ever finds a login for a DIFFERENT account than the one it shows, it must
// not keep acting as that other account, so it ends straight away.

export type SessionStatus = 'valid' | 'suspended' | 'signed-out' | 'switched' | 'unknown';
export type EndReason = 'suspended' | 'signed-out' | 'switched';

export interface SessionFacts {
  sessionCheckFailed: boolean; // asking for the saved login returned an error
  hasSession: boolean; // a saved login exists in this browser
  profileCheckFailed: boolean; // looking up the account's row returned an error
  profileFound: boolean; // ...and the row came back
  isSuspended: boolean; // the row says suspended
  sessionUserId?: string | null; // whose login is saved in this browser right now
  expectedUserId?: string | null; // whose account this tab is showing
}

export function classifySession(f: SessionFacts): SessionStatus {
  if (f.sessionCheckFailed) return 'unknown';
  if (!f.hasSession) return 'signed-out';
  if (f.expectedUserId && f.sessionUserId && f.sessionUserId !== f.expectedUserId) return 'switched';
  if (f.profileCheckFailed || !f.profileFound) return 'unknown'; // can't tell: a hiccup must never end a session
  return f.isSuspended ? 'suspended' : 'valid';
}

// The same bad answer must come back this many checks in a row before anything happens...
export const SESSION_CONFIRMATIONS = 2;
// ...except "switched": whose login is saved is a plain fact, and every moment more is a moment acting as the wrong person.
const confirmationsFor = (status: EndReason): number => (status === 'switched' ? 1 : SESSION_CONFIRMATIONS);

export interface WatchState {
  status: EndReason | null;
  count: number;
}

export const initialWatch: WatchState = { status: null, count: 0 };

// One step of the watch: given what it has seen so far and the newest answer, what is the new state, and must the session end now?
export function stepWatch(prev: WatchState, status: SessionStatus): { state: WatchState; end: EndReason | null } {
  if (status === 'unknown') return { state: prev, end: null }; // no answer: change nothing
  if (status === 'valid') return { state: initialWatch, end: null };
  const count = prev.status === status ? prev.count + 1 : 1; // a different bad answer starts the count again
  return { state: { status, count }, end: count >= confirmationsFor(status) ? status : null };
}

export const SESSION_ENDED_MESSAGE: Record<EndReason, string> = {
  suspended: 'Your account has been suspended by the NOOB administrator. You will not be able to log back in until it is restored.',
  'signed-out': 'You were signed out because your login session ended. Your account is fine — please log in again.',
  switched: 'This tab was signed out because you logged in as a different account in another tab or window of this browser. Log in again to continue.'
};
