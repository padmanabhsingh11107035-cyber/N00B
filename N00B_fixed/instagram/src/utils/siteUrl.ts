// NOOB's own web addresses, in ONE place. The website answers on more than one address while it moves to its new name (the Google Play app, the privacy and
// terms pages, shared links and emails all name the main one), so nothing should spell "nooob.xyz" by hand any more:
//   * SITE_DOMAINS   every address that is NOOB itself (a link to any of them is "our own site"),
//   * MAIN_SITE      the one that is shown and shared (the new .com); can be set when the app is BUILT (VITE_SITE_URL), only to one of our own addresses,
//   * siteOrigin()   on the website: the address the person is on (if it is ours); in the Android app, which runs from files on the phone: MAIN_SITE.
// No browser-only code runs when this file is loaded, so it can be tested on its own.

export const SITE_DOMAINS = ['noobsocials.com', 'nooob.xyz'] as const;

const fromEnv = (): string => {
  try { return String((import.meta as any).env?.VITE_SITE_URL || '').trim(); } catch { return ''; }
};
const clean = (u: string): string => u.replace(/\/+$/, '');
// the main address; only ever one of our own domains (a wrong value is ignored, never used)
export const MAIN_SITE: string = (() => {
  const v = clean(fromEnv());
  try { const host = new URL(v).hostname.replace(/^www\./, ''); if (SITE_DOMAINS.some((d) => host === d)) return 'https://' + host; } catch { /* not set, or not an address */ }
  return 'https://noobsocials.com';
})();

/** Is this host NOOB itself (the site, www, or a subdomain such as ai. or coaching.)? */
export function isOwnHost(host: string | null | undefined): boolean {
  const h = String(host || '').toLowerCase().replace(/^www\./, '');
  return !!h && SITE_DOMAINS.some((d) => h === d || h.endsWith('.' + d));
}

/** Is the app running inside the Android / iPhone shell (files on the phone, not a website)? */
export function isNativeApp(): boolean {
  try { return typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.() === true; } catch { return false; }
}

/** The address to put in a link that is shown or shared (https://host, no slash at the end). */
export function siteOrigin(): string {
  if (typeof window === 'undefined' || isNativeApp()) return MAIN_SITE;
  try {
    const { hostname, origin } = window.location;
    return isOwnHost(hostname) && !/^(ai|coaching)\./i.test(hostname) ? clean(origin) : MAIN_SITE;
  } catch {
    return MAIN_SITE;
  }
}

/** Where the pictures and videos are served from: the website's own /media/ route. On the website that is the same address; in the Android app it must be absolute. */
export function mediaOrigin(): string {
  return typeof window !== 'undefined' && isNativeApp() ? MAIN_SITE : '';
}
