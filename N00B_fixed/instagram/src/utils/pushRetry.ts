// Small, dependency-free helpers for turning notifications on without making the person wait: a time limit for every step that talks to the network, the waits between
// new tries, and the "finish this when the phone is online again" flag that survives closing the app.
export const PENDING_KEY = 'noob_push_pending';

/** Waits between new tries after a failed attempt (ms). After the last one only "back online" / "app opened again" start another. */
export const RETRY_DELAYS_MS = [5_000, 15_000, 45_000, 120_000];

export function nextDelay(attempt: number): number | null {
  return attempt >= 0 && attempt < RETRY_DELAYS_MS.length ? RETRY_DELAYS_MS[attempt] : null;
}

export class StepTimeout extends Error {
  constructor(what: string, ms: number) {
    super(`${what} took longer than ${Math.round(ms / 1000)} seconds`);
    this.name = 'TimeoutError';
  }
}

/** The promise's answer, or a TimeoutError if it has not come within `ms` (the work itself is not cancelled; its answer is simply no longer waited for). */
export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new StepTimeout(what, ms)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

/** Is it worth trying again later? A refusal by the person or the browser is not; a lost connection, a slow server or a time-out is. */
export function isRetryableFailure(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name;
  return name !== 'NotAllowedError' && name !== 'NotSupportedError' && name !== 'SecurityError';
}

export function readPending(store: Pick<Storage, 'getItem'> | null = safeStore()): boolean {
  try { return !!store && store.getItem(PENDING_KEY) === '1'; } catch { return false; }
}

export function writePending(on: boolean, store: Pick<Storage, 'setItem' | 'removeItem'> | null = safeStore()): void {
  try {
    if (!store) return;
    if (on) store.setItem(PENDING_KEY, '1'); else store.removeItem(PENDING_KEY);
  } catch {
    /* private browsing: the retry then only lasts until the app is closed */
  }
}

function safeStore(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
