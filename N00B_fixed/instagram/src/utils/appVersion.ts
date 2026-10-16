// Detects when a newer build of NOOB has been deployed while this page/app instance is still
// running an older one — the exact situation that made every fix in a long support session look
// like it "didn't work": a home-screen PWA on iOS resumes its suspended page instead of reloading
// it when reopened, so nothing the person does in the UI ever picks up new code on its own.
// __BUILD_ID__ is baked into the bundle at build time (see vite.config.ts); version.json is a
// tiny static file rewritten on every build with that same id, so re-fetching it (bypassing any
// cache) and comparing tells this running instance whether it's stale.
import { useEffect, useState } from 'react';
import { hardReload } from './reloadApp.ts';
import { isNativeApp, siteOrigin } from './siteUrl.ts';

declare const __BUILD_ID__: string;

// A new version is applied by itself, once, when the app is opened again after being away (a home-screen PWA resumed from the background is the usual way someone ends
// up on an old version for days), as long as that cannot cost them anything: nothing is being typed, nothing is playing (a call, a live, a reel), and this exact new
// version has not been tried already in this tab (so a delay on the server can never make the page reload over and over). In every other case the banner stays and
// the person taps it when it suits them.
export interface UpdateContext {
  visible: boolean;
  /** How long the app was in the background before coming back (0 when it was not). */
  awayMs: number;
  editingText: boolean;
  mediaPlaying: boolean;
  alreadyTriedThisVersion: boolean;
}
export const AUTO_UPDATE_AFTER_AWAY_MS = 10_000;
export function shouldAutoApplyUpdate(c: UpdateContext): boolean {
  return c.visible && c.awayMs >= AUTO_UPDATE_AFTER_AWAY_MS && !c.editingText && !c.mediaPlaying && !c.alreadyTriedThisVersion;
}

const TRIED_KEY = 'noob.updateReloadedFor';
const triedVersion = (): string => { try { return sessionStorage.getItem(TRIED_KEY) || ''; } catch { return ''; } };
const markTried = (id: string): void => { try { sessionStorage.setItem(TRIED_KEY, id); } catch { /* private mode: the banner is still there */ } };
const isEditing = (): boolean => {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};
const isMediaPlaying = (): boolean =>
  Array.from(document.querySelectorAll('video, audio')).some((m) => { const el = m as HTMLMediaElement; return !el.paused && !el.ended && el.readyState > 2; });

/** The version this copy of NOOB is. */
export const currentBuildId = (): string => (typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : '');

/** Where the newest Android app file is kept (published by .github/workflows/android-build.yml). */
export const ANDROID_APK_URL = 'https://github.com/padmanabhsingh11107035-cyber/N00B/releases/download/android-latest/NOOB.apk';

/** Is this copy older than the newest one? (Build numbers are the time of the build.) null when it could not be found out. */
export function updateState(current: string, latest: string | null | undefined): 'unknown' | 'newest' | 'newer' {
  if (!current || !latest) return 'unknown';
  const a = Number(current), b = Number(latest);
  if (Number.isFinite(a) && Number.isFinite(b)) return b > a ? 'newer' : 'newest';
  return latest === current ? 'newest' : 'newer';
}

/** Asks the website which version is the newest. The Android app (which carries its own copy of NOOB) asks the website by its full address. */
export async function fetchLatestBuildId(): Promise<string | null> {
  try {
    const base = isNativeApp() ? siteOrigin() : '';
    const res = await fetch(`${base}/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.buildId === 'string' ? data.buildId : null;
  } catch {
    return null;
  }
}

export function useUpdateAvailable(): boolean {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let alive = true;
    let hiddenAt = document.visibilityState === 'hidden' ? Date.now() : 0;
    const check = async (awayMs = 0) => {
      const latest = await fetchLatestBuildId();
      if (!alive || !latest || latest === __BUILD_ID__) return;
      setUpdateAvailable(true);
      if (shouldAutoApplyUpdate({
        visible: document.visibilityState === 'visible',
        awayMs,
        editingText: isEditing(),
        mediaPlaying: isMediaPlaying(),
        alreadyTriedThisVersion: triedVersion() === latest
      })) {
        markTried(latest);
        hardReload();
      }
    };

    check();
    // visibilitychange/focus specifically catch a suspended PWA being reopened — that resume
    // event is exactly the moment a stale instance most needs to find out it's stale.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') { hiddenAt = Date.now(); return; }
      const away = hiddenAt ? Date.now() - hiddenAt : 0;
      hiddenAt = 0;
      void check(away);
    };
    const onFocus = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    const interval = setInterval(() => { void check(); }, 5 * 60 * 1000);

    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, []);

  return updateAvailable;
}
