// Which kind of NOOB is this person using, and does the admin panel's "has the app" tick belong next to their name?
//   'app' = the real Android app (the one downloaded as the NOOB .apk / installed as a native app)
//   'pwa' = NOOB installed from the website onto the home screen (it is still the website, so it gets no tick)
//   'web' = an ordinary browser tab
export type AppPlatform = 'app' | 'pwa' | 'web';

export function detectPlatform(native: boolean, installedFromWebsite: boolean): AppPlatform {
  if (native) return 'app';
  return installedFromWebsite ? 'pwa' : 'web';
}

/** The app is gone when it has not been opened for this long: the person has uninstalled it, or stopped using it. */
export const APP_SEEN_WITHIN_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * The blue tick: the person is on the real Android app right now, or the last time they were seen it was on the app and that was within the last 14 days.
 * Someone who opens NOOB in a browser afterwards (the usual sign of having deleted the app) is last seen on 'web' / 'pwa', so the tick goes at once.
 */
export function hasNativeApp(args: { liveOnApp?: boolean; lastSeenPlatform?: string | null; lastSeenAt?: string | null; now?: number }): boolean {
  if (args.liveOnApp) return true;
  if (args.lastSeenPlatform !== 'app' || !args.lastSeenAt) return false;
  const seen = Date.parse(args.lastSeenAt);
  if (!Number.isFinite(seen)) return false;
  return (args.now ?? Date.now()) - seen <= APP_SEEN_WITHIN_MS;
}
