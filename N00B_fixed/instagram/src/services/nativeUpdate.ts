import { useCallback, useEffect, useRef, useState } from 'react';
import { registerPlugin } from '@capacitor/core';
import { ANDROID_APK_URL } from '../utils/appVersion.ts';
import { isNativeApp } from '../utils/siteUrl.ts';

// "Update the app" for the Android app. Everything the app shows comes live from the website, so ordinary changes arrive by themselves. Only when something NATIVE changes (the
// parts of the app that are not the website: the screenshot block, the installer itself, permissions) a new app file is needed. This finds out whether one is ready, and with
// one tap downloads it and hands it to Android's installer (Android asks the person to confirm: no app can install itself silently).
// The newest app file is published as a release on GitHub by .github/workflows/android-build.yml, with its build number in the release notes ("Native build: 123").

interface AppUpdaterPlugin {
  getInfo(): Promise<{ versionCode: number; versionName: string; canInstall: boolean }>;
  getLatest(): Promise<{ build: number }>;
  downloadAndInstall(options: { url: string }): Promise<{ started?: boolean; needsPermission?: boolean }>;
  addListener(event: 'progress', cb: (p: { percent: number }) => void): Promise<{ remove: () => Promise<void> }>;
}
const AppUpdater = registerPlugin<AppUpdaterPlugin>('AppUpdater');

export const RELEASE_API = 'https://api.github.com/repos/padmanabhsingh11107035-cyber/N00B/releases/tags/android-latest';

/** The build number written in the release notes ("Native build: 123"). */
export function parseNativeBuild(notes: string | null | undefined): number | null {
  const m = /Native build:\s*(\d+)/i.exec(String(notes || ''));
  return m ? Number(m[1]) : null;
}

export type NativeUpdateState = 'unknown' | 'newest' | 'newer';
export function nativeUpdateState(installed: number | null | undefined, latest: number | null | undefined): NativeUpdateState {
  if (!installed || !latest) return 'unknown';
  return latest > installed ? 'newer' : 'newest';
}

async function fetchLatestNativeBuild(): Promise<number | null> {
  try {
    const res = await fetch(RELEASE_API, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return parseNativeBuild(data?.body);
  } catch {
    return null;
  }
}

export interface NativeUpdateInfo {
  /** The app's own plugin is there (an app from before this update does not have it: it can only be updated by downloading the file). */
  supported: boolean;
  installed: number | null;
  latest: number | null;
  state: NativeUpdateState;
}

export async function checkNativeUpdate(): Promise<NativeUpdateInfo> {
  let installed: number | null = null;
  let supported = true;
  try { installed = (await AppUpdater.getInfo()).versionCode || null; } catch { supported = false; }
  // the app asks for the newest build itself; the release page (which has a request limit per address) is only the second way
  let latest: number | null = null;
  try { latest = (await AppUpdater.getLatest()).build || null; } catch { /* an older app, or no connection */ }
  if (!latest) latest = await fetchLatestNativeBuild();
  return { supported, installed, latest, state: nativeUpdateState(installed, latest) };
}

/** Downloads the newest app file and opens Android's installer. Resolves 'needs-permission' when Android first has to be told that NOOB may install apps. */
export async function installNativeUpdate(onProgress: (percent: number) => void): Promise<'started' | 'needs-permission'> {
  let handle: { remove: () => Promise<void> } | null = null;
  try {
    handle = await AppUpdater.addListener('progress', (p) => onProgress(p.percent));
    const res = await AppUpdater.downloadAndInstall({ url: ANDROID_APK_URL });
    return res.needsPermission ? 'needs-permission' : 'started';
  } finally {
    try { await handle?.remove(); } catch { /* nothing to undo */ }
  }
}

export interface NativeUpdate {
  native: boolean;
  checking: boolean;
  info: NativeUpdateInfo | null;
  busy: boolean;
  percent: number;
  message: string;
  install: () => Promise<void>;
  recheck: () => Promise<void>;
}

/** What the app knows about its own update: for the banner and for the Update page. */
export function useNativeUpdate(): NativeUpdate {
  const native = isNativeApp();
  const [info, setInfo] = useState<NativeUpdateInfo | null>(null);
  const [checking, setChecking] = useState(native);
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState(-1);
  const [message, setMessage] = useState('');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const recheck = useCallback(async () => {
    if (!native) return;
    setChecking(true);
    const next = await checkNativeUpdate();
    if (alive.current) { setInfo(next); setChecking(false); }
  }, [native]);

  useEffect(() => {
    if (!native) return;
    void recheck();
    const onVisible = () => { if (document.visibilityState === 'visible') void recheck(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [native, recheck]);

  const install = useCallback(async () => {
    if (busy) return;
    // an app from before the installer existed: hand the file to the phone's browser
    if (!info?.supported) { window.location.href = ANDROID_APK_URL; return; }
    setBusy(true); setPercent(-1); setMessage('Starting the download…');
    try {
      const result = await installNativeUpdate((p) => { if (alive.current) { setPercent(p); setMessage(p >= 0 ? `Downloading ${p}%…` : 'Downloading…'); } });
      if (!alive.current) return;
      setMessage(result === 'needs-permission'
        ? 'Allow NOOB to install apps on the screen that just opened, then come back and tap Update again.'
        : 'Almost done: confirm the install on the screen that just opened.');
    } catch (e) {
      if (alive.current) setMessage(e instanceof Error && e.message ? e.message : 'The update could not be installed. Try again.');
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [busy, info]);

  return { native, checking, info, busy, percent, message, install, recheck };
}
