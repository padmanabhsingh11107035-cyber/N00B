// What the app tells the server about each device that opens it (the Visitors page of the admin panel): a random id kept on the device, and a few plain facts about it.
// Nothing here reads anything private: no contacts, no location (the country and city come from the connection itself, on the server), no content.
import { detectPlatform, type AppPlatform } from './appPlatform.ts';

export const VISITOR_KEY = 'noob_vid';

export interface UserAgentFacts { browser: string; os: string; device: string }

/** Browser, system and kind of device, read from the browser's own description of itself. */
export function parseUserAgent(ua: string): UserAgentFacts {
  const u = ua || '';
  let browser = 'Other';
  if (/edg(e|a|ios)?\//i.test(u)) browser = 'Edge';
  else if (/opr\/|opera/i.test(u)) browser = 'Opera';
  else if (/samsungbrowser/i.test(u)) browser = 'Samsung Internet';
  else if (/(fxios|firefox)\//i.test(u)) browser = 'Firefox';
  else if (/(crios|chrome)\//i.test(u)) browser = 'Chrome';
  else if (/safari\//i.test(u) && /version\//i.test(u)) browser = 'Safari';
  else if (/safari/i.test(u)) browser = 'Safari';
  if (/\bwv\b|; wv\)/i.test(u) || /NOOB\//i.test(u)) browser = 'NOOB app';

  let os = 'Other';
  const v = (re: RegExp) => (u.match(re) || [])[1]?.replace(/_/g, '.');
  if (/android/i.test(u)) os = `Android${v(/android ([\d.]+)/i) ? ' ' + v(/android ([\d.]+)/i)!.split('.')[0] : ''}`;
  else if (/(iphone|ipad|ipod)/i.test(u)) os = `iOS${v(/os ([\d_]+) like mac/i) ? ' ' + v(/os ([\d_]+) like mac/i)!.split('.')[0] : ''}`;
  else if (/windows nt/i.test(u)) os = 'Windows';
  else if (/mac os x/i.test(u)) os = 'macOS';
  else if (/cros/i.test(u)) os = 'ChromeOS';
  else if (/linux/i.test(u)) os = 'Linux';

  let device = 'Computer';
  if (/ipad|tablet|(android(?!.*mobile))/i.test(u)) device = 'Tablet';
  else if (/mobi|iphone|ipod|android/i.test(u)) device = 'Phone';
  return { browser, os, device };
}

/** A fresh random id (32 letters and digits), or null where the browser has no random numbers. */
export function newVisitorId(rand: () => string = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : '')): string | null {
  const id = rand().replace(/[^A-Za-z0-9-]/g, '');
  return id.length >= 8 ? id.slice(0, 64) : null;
}

export interface VisitInfo {
  browser: string; os: string; device: string; platform: AppPlatform; language: string; timezone: string; screen: string; referrer: string; path: string; userAgent: string;
}

/** Only the other site's name, never what was on its address (a link can carry private bits). */
export function referrerHost(referrer: string, ownHost: string): string {
  try {
    if (!referrer) return '';
    const h = new URL(referrer).hostname;
    return h && h !== ownHost ? h : '';
  } catch { return ''; }
}

export function collectVisitInfo(): VisitInfo {
  const nav = typeof navigator !== 'undefined' ? navigator : ({ userAgent: '', language: '' } as Navigator);
  const facts = parseUserAgent(nav.userAgent || '');
  let timezone = '';
  try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* the browser will not say */ }
  const native = typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.() === true;
  const installed = typeof window !== 'undefined' && (!!(nav as any).standalone || (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches));
  return {
    ...facts,
    platform: detectPlatform(native, installed),
    language: (nav.language || '').slice(0, 20),
    timezone: timezone.slice(0, 60),
    screen: typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : '',
    referrer: typeof document !== 'undefined' ? referrerHost(document.referrer, typeof location !== 'undefined' ? location.hostname : '') : '',
    path: typeof location !== 'undefined' ? location.pathname.slice(0, 200) : '',
    userAgent: (nav.userAgent || '').slice(0, 400)
  };
}
