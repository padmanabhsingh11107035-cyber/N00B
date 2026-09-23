// Detects when a newer build of NOOB has been deployed while this page/app instance is still
// running an older one — the exact situation that made every fix in a long support session look
// like it "didn't work": a home-screen PWA on iOS resumes its suspended page instead of reloading
// it when reopened, so nothing the person does in the UI ever picks up new code on its own.
// __BUILD_ID__ is baked into the bundle at build time (see vite.config.ts); version.json is a
// tiny static file rewritten on every build with that same id, so re-fetching it (bypassing any
// cache) and comparing tells this running instance whether it's stale.
import { useEffect, useState } from 'react';

declare const __BUILD_ID__: string;

async function fetchLatestBuildId(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
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
    const check = async () => {
      const latest = await fetchLatestBuildId();
      if (alive && latest && latest !== __BUILD_ID__) setUpdateAvailable(true);
    };

    check();
    // visibilitychange/focus specifically catch a suspended PWA being reopened — that resume
    // event is exactly the moment a stale instance most needs to find out it's stale.
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    const interval = setInterval(check, 5 * 60 * 1000);

    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      clearInterval(interval);
    };
  }, []);

  return updateAvailable;
}
