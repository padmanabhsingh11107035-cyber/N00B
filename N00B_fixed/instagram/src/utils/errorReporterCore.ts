// The pure part of the automatic error reports (no imports, so a test can load it on its own): what is ignored as noise, how an error is recognised as "the same one",
// how text is cut, and which kind of device this is. The part that talks to the server is errorReporter.ts.

export interface RawError { message: string; stack?: string; source?: string }

const LIMITS = { message: 500, stack: 4000, note: 1000, other: 300 } as const;
export const MAX_REPORTS_PER_LOAD = 10;

export function cut(s: unknown, n: number): string {
  const t = typeof s === 'string' ? s : s == null ? '' : String(s);
  return t.length > n ? t.slice(0, n) : t;
}
export const cutMessage = (s: unknown) => cut(s, LIMITS.message);
export const cutStack = (s: unknown) => cut(s, LIMITS.stack);
export const cutNote = (s: unknown) => cut(s, LIMITS.note);
export const cutOther = (s: unknown) => cut(s, LIMITS.other);

/** Only the path: the query string (tokens, codes) and the # part never leave the phone. */
export function pathOnly(href: string | undefined | null): string {
  if (!href) return '';
  const s = String(href).replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '');
  return (s.split(/[?#]/)[0] || '/').slice(0, 300);
}

/** Removes the query / hash of addresses inside a text, and anything that looks like an e-mail address or a login token, before it is sent. */
export function scrubText(s: string): string {
  return s
    .replace(/([a-z][a-z0-9+.-]*:\/\/[^\s)'"]*?)[?#][^\s)'"]*/gi, '$1')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*/g, '[token]');
}

/** Errors that say nothing about NOOB and would only fill the list. `origin` is this page's own origin. */
export function isNoise(e: RawError, online = true, origin = ''): boolean {
  const m = (e.message || '').trim();
  const st = e.stack || '';
  if (!m) return true;
  if (/ResizeObserver loop/i.test(m)) return true;
  if (/\bAbortError\b|The (user|operation) (aborted|was aborted)|signal is aborted/i.test(m)) return true;
  if (/^Script error\.?$/i.test(m)) return true;
  if (!online && /^(Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?|Network request failed)/i.test(m)) return true;
  if (/(chrome|moz|safari|safari-web)-extension:\/\//i.test(m + ' ' + st)) return true;
  // a script from another website and no stack: not ours
  if (e.source && /^https?:\/\//i.test(e.source) && !st && origin && !e.source.startsWith(origin)) return true;
  return false;
}

/** A short stable key of one error (kind + message + first line of the stack), used to send the same error only once per page load. */
export function clientFingerprint(kind: string, message: string, stack?: string): string {
  const first = (stack || '').split('\n').find((l) => l.trim()) || '';
  const s = `${kind}|${cutMessage(message)}|${first.trim().slice(0, 200)}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export type ReportPlatform = 'web' | 'ios-pwa' | 'android-app';
export function detectPlatform(env: { native?: boolean; ua?: string; standalone?: boolean; platform?: string; touchPoints?: number }): ReportPlatform {
  if (env.native) return 'android-app';
  const ua = env.ua || '';
  const ios = /iphone|ipad|ipod/i.test(ua) || (env.platform === 'MacIntel' && (env.touchPoints || 0) > 1);
  return ios && env.standalone ? 'ios-pwa' : 'web';
}

/** Remembers what was sent on this page load: the same error once, and at most `max` in all. */
export function createGate(max = MAX_REPORTS_PER_LOAD) {
  const seen = new Set<string>();
  return (fp: string): boolean => {
    if (seen.has(fp) || seen.size >= max) return false;
    seen.add(fp);
    return true;
  };
}
