// Sends one file to storage the way a person needs it to behave on a phone: it reports how far it has got, it tries again when the connection drops (and says so), it gives up
// on an attempt that has stopped moving, and it can be cancelled. (The library's own upload is a single request that reports nothing and cannot be retried halfway, which
// is why a long upload on a weak connection ended in "load error" with no hint of what was happening.)
//
// The request is the same one the library makes: POST to the object's address with a form holding the file; only the sending is different (XMLHttpRequest gives progress).
export class UploadHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'UploadHttpError';
    this.status = status;
  }
}

export interface UploadAttempt {
  url: string;
  /** Called before every attempt, so a login that was renewed in between is used. */
  headers: () => Promise<Record<string, string>> | Record<string, string>;
  /** Builds the form again for every attempt (a form can be sent only once). */
  makeBody: () => FormData;
  onProgress?: (fraction: number) => void;
  /** (attempt that is about to start, number of attempts, why the last one failed) */
  onRetry?: (attempt: number, of: number, reason: string) => void;
  signal?: AbortSignal;
  /** Attempts in all (default 4). */
  attempts?: number;
  /** An attempt that has not moved for this long is stopped and tried again (default 45 s). */
  stallMs?: number;
  /** Waits between attempts, in ms (default 1 s, 3 s, 7 s) - only the tests change this. */
  waits?: number[];
}

/** What is worth trying again: the connection dropped, the server was busy or briefly broken. A refusal is not. */
export function isRetryable(status: number): boolean {
  return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
}

/** A sentence for a person, from what storage answered. */
export function explainUploadFailure(status: number, body: string): string {
  let message = '';
  try {
    const j = JSON.parse(body);
    message = String(j.message || j.error || '');
  } catch {
    message = body.slice(0, 200);
  }
  if (status === 413 || /exceeded the maximum allowed size|payload too large|too large/i.test(message)) return 'This file is bigger than the 50 MB each upload may be.';
  if (status === 401 || status === 403 || /jwt|row-level security|not authorized|unauthorized/i.test(message)) return /expired|jwt/i.test(message) ? 'Your login ran out while uploading. Please open the app again and retry.' : 'You are not allowed to upload this. Please log in again.';
  if (status === 415 || /mime type|not supported/i.test(message)) return 'This kind of file cannot be uploaded.';
  if (status === 0) return 'The connection dropped. Please check your internet and try again.';
  if (status >= 500) return 'The server is busy. Please try again in a moment.';
  return message || `Upload failed (${status}). Please try again.`;
}

function sendOnce(url: string, headers: Record<string, string>, body: FormData, onProgress: ((f: number) => void) | undefined, signal: AbortSignal | undefined, stallMs: number): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let stall: ReturnType<typeof setTimeout> | undefined;
    let stalled = false;
    const arm = () => {
      if (stall) clearTimeout(stall);
      stall = setTimeout(() => { stalled = true; xhr.abort(); }, stallMs);
    };
    const finish = () => { if (stall) clearTimeout(stall); signal?.removeEventListener('abort', onAbort); };
    const onAbort = () => { finish(); xhr.abort(); reject(new DOMException('Cancelled', 'AbortError')); };
    if (signal) { if (signal.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return; } signal.addEventListener('abort', onAbort, { once: true }); }
    xhr.open('POST', url, true);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => { arm(); if (e.lengthComputable && e.total > 0) onProgress?.(Math.min(1, e.loaded / e.total)); };
    xhr.upload.onload = () => arm(); // the file is sent; waiting for the server's answer
    xhr.onload = () => { finish(); resolve({ status: xhr.status, text: xhr.responseText || '' }); };
    xhr.onerror = () => { finish(); resolve({ status: 0, text: '' }); };
    xhr.ontimeout = () => { finish(); resolve({ status: 0, text: '' }); };
    xhr.onabort = () => { finish(); if (stalled) resolve({ status: 0, text: 'stalled' }); };
    arm();
    xhr.send(body);
  });
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Cancelled', 'AbortError')); }, { once: true });
});

/** Uploads and returns storage's answer (parsed). Throws UploadHttpError (with a sentence a person can read) when it gave up. */
export async function uploadWithRetry(a: UploadAttempt): Promise<unknown> {
  const attempts = Math.max(1, a.attempts ?? 4);
  const waits = a.waits ?? [1000, 3000, 7000];
  const stallMs = a.stallMs ?? 45_000;
  let last = { status: 0, text: '' };
  for (let n = 1; n <= attempts; n++) {
    const headers = await a.headers();
    last = await sendOnce(a.url, headers, a.makeBody(), a.onProgress, a.signal, stallMs);
    if (last.status >= 200 && last.status < 300) {
      a.onProgress?.(1);
      try { return JSON.parse(last.text); } catch { return {}; }
    }
    if (!isRetryable(last.status) || n === attempts) break;
    a.onRetry?.(n + 1, attempts, last.status === 0 ? 'the connection dropped' : `the server answered ${last.status}`);
    a.onProgress?.(0);
    await sleep(waits[Math.min(n - 1, waits.length - 1)] ?? 1000, a.signal);
  }
  throw new UploadHttpError(last.status, explainUploadFailure(last.status, last.text));
}
