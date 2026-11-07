import React, { useEffect, useState } from 'react';
import { isNativeApp } from '../../utils/siteUrl';

// "Update NOOB to continue": some changes live inside the Android app itself (not on the website), and an older app can not use them. public/app-version.json says the
// oldest app build that may still be used ({ "android": { "minBuild": 3 } }); an app older than that is stopped with this box, which opens Google Play. Raise minBuild there
// (and publish the new app on Google Play first) whenever an update must be forced. It is checked when the app starts and every time it comes back to the front.
// A check that fails (offline, file missing) never blocks anybody.
const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.noob.social';

export const AppUpdateGate: React.FC = () => {
  const [needed, setNeeded] = useState(false);
  useEffect(() => {
    if (!isNativeApp()) return;
    let alive = true;
    const check = async () => {
      try {
        const { App } = await import('@capacitor/app');
        const info = await App.getInfo();
        const res = await fetch(`/app-version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const cfg = await res.json();
        const min = Number(cfg?.android?.minBuild);
        const mine = Number(info.build);
        if (alive && Number.isFinite(min) && Number.isFinite(mine)) setNeeded(mine < min);
      } catch { /* offline or no file: nobody is blocked */ }
    };
    void check();
    let handle: { remove: () => void } | undefined;
    void import('@capacitor/app').then(({ App }) => App.addListener('appStateChange', (s) => { if (s.isActive) void check(); })).then((h) => { handle = h; }).catch(() => undefined);
    return () => { alive = false; handle?.remove(); };
  }, []);
  if (!needed) return null;
  const open = async () => {
    try { const { Browser } = await import('@capacitor/browser'); await Browser.open({ url: PLAY_URL }); }
    catch { window.location.href = PLAY_URL; }
  };
  return (
    <div className="fixed inset-0 z-[2147483000] bg-black text-white flex flex-col items-center justify-center p-8 text-center" role="alertdialog" aria-modal="true" aria-label="Update NOOB" data-testid="app-update-gate">
      <img src="/noob-app-512.png" alt="" width={96} height={96} className="rounded-3xl mb-6" />
      <h1 className="text-2xl font-extrabold">Update NOOB to continue</h1>
      <p className="mt-2 max-w-xs text-sm text-zinc-400">A new version of the NOOB app is on Google Play. This old version can not be used any more.</p>
      <button type="button" onClick={() => void open()} className="mt-7 w-full max-w-xs h-12 rounded-full bg-white text-black font-extrabold cursor-pointer active:scale-95 transition-transform">Update on Google Play</button>
    </div>
  );
};
