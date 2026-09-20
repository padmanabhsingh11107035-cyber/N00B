// Decides what the app does when it checks (every 30 seconds) that you are still logged in.
//
// The rule that matters: only the DATABASE saying "this account is suspended" may be reported as a suspension.
// Anything else that ends a login (the saved login was removed after a failed refresh, another tab signed out, ...)
// is a plain "you were signed out", said in those words. And a check that could not be completed (bad connection,
// a hiccup on the server) never ends a session at all.

export type SessionStatus = 'valid' | 'suspended' | 'signed-out' | 'unknown';

export interface SessionFacts {
  sessionCheckFailed: boolean; // asking for the saved login returned an error
  hasSession: boolean; // a saved login exists in this browser
  profileCheckFailed: boolean; // looking up the account's row returned an error
  profileFound: boolean; // ...and the row came back
  isSuspended: boolean; // the row says suspended
}

export function classifySession(f: SessionFacts): SessionStatus {
  if (f.sessionCheckFailed) return 'unknown';
  if (!f.hasSession) return 'signed-out';
  if (f.profileCheckFailed || !f.profileFound) return 'unknown'; // can't tell: a hiccup must never end a session
  return f.isSuspended ? 'suspended' : 'valid';
}

// The same bad answer must come back this many checks in a row before anything happens.
export const SESSION_CONFIRMATIONS = 2;

export interface WatchState {
  status: 'suspended' | 'signed-out' | null;
  count: number;
}

export const initialWatch: WatchState = { status: null, count: 0 };

// One step of the watch: given what it has seen so far and the newest answer, what is the new state, and must the session end now?
export function stepWatch(prev: WatchState, status: SessionStatus): { state: WatchState; end: 'suspended' | 'signed-out' | null } {
  if (status === 'unknown') return { state: prev, end: null }; // no answer: change nothing
  if (status === 'valid') return { state: initialWatch, end: null };
  const count = prev.status === status ? prev.count + 1 : 1; // a different bad answer starts the count again
  return { state: { status, count }, end: count >= SESSION_CONFIRMATIONS ? status : null };
}

export const SESSION_ENDED_MESSAGE: Record<'suspended' | 'signed-out', string> = {
  suspended: 'Your account has been suspended by the NOOB administrator. You will not be able to log back in until it is restored.',
  'signed-out': 'You were signed out because your login session ended. Your account is fine — please log in again.'
};
