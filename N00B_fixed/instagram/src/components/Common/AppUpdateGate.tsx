import React, { useEffect, useState } from 'react';
import { isNativeApp } from '../../utils/siteUrl';

// "Update NOOB": some changes live inside the Android app itself (not on the website). public/app-version.json says two things:
//   { "android": { "minBuild": 3, "latestBuild": 5 } }
//   * minBuild: the oldest app build that may still be used. An app older than that is STOPPED with a full-screen box that opens Google Play. Raise it (after the new app is on Google
//     Play) whenever an update must be forced.
//   * latestBuild: the newest build that is on Google Play. An app older than that (but not older than minBuild) gets a small box with an Update button (opens Google Play) and a
//     Later button; after Later it is asked again the next day.
// It is checked when the app starts and every time it comes back to the front. A check that fails (offline, file missing) never blocks or bothers anybody.
const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.noob.social';
const LATER_KEY = 'noob_update_later';
const DAY = 24 * 3600 * 1000;

const openPlay = async () => {
  try { const { Browser } = await import('@capacitor/browser'); await Browser.open({ url: PLAY_URL }); }
  catch { window.location.href = PLAY_URL; }
};

export const AppUpdateGate: React.FC = () => {
  const [needed, setNeeded] = useState(false);
  const [offer, setOffer] = useState<number | null>(null);
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
        const latest = Number(cfg?.android?.latestBuild);
        const mine = Number(info.build);
        if (!alive || !Number.isFinite(mine)) return;
        if (Number.isFinite(min)) setNeeded(mine < min);
        if (Number.isFinite(latest) && mine < latest) {
          let later = 0;
          try { const v = JSON.parse(localStorage.getItem(LATER_KEY) || 'null'); if (v && v.build === latest) later = Number(v.at) || 0; } catch { /* asked now */ }
          setOffer(Date.now() - later > DAY ? latest : null);
        } else setOffer(null);
      } catch { /* offline or no file: nobody is blocked */ }
    };
    void check();
    let handle: { remove: () => void } | undefined;
    void import('@capacitor/app').then(({ App }) => App.addListener('appStateChange', (s) => { if (s.isActive) void check(); })).then((h) => { handle = h; }).catch(() => undefined);
    return () => { alive = false; handle?.remove(); };
  }, []);

  if (needed) {
    return (
      <div className="fixed inset-0 z-[2147483000] bg-black text-white flex flex-col items-center justify-center p-8 text-center" role="alertdialog" aria-modal="true" aria-label="Update NOOB" data-testid="app-update-gate">
        <img src="/noob-app-512.png" alt="" width={96} height={96} className="rounded-3xl mb-6" />
        <h1 className="text-2xl font-extrabold">Update NOOB to continue</h1>
        <p className="mt-2 max-w-xs text-sm text-zinc-400">A new version of the NOOB app is on Google Play. This old version can not be used any more.</p>
        <button type="button" onClick={() => void openPlay()} className="mt-7 w-full max-w-xs h-12 rounded-full bg-white text-black font-extrabold cursor-pointer active:scale-95 transition-transform">Update</button>
      </div>
    );
  }
  if (offer === null) return null;
  const later = () => {
    try { localStorage.setItem(LATER_KEY, JSON.stringify({ build: offer, at: Date.now() })); } catch { /* it is just asked again */ }
    setOffer(null);
  };
  return (
    <div className="fixed inset-0 z-[2147483000] bg-black/70 flex items-end sm:items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-label="A new NOOB is ready" data-testid="app-update-offer">
      <div className="w-full max-w-sm rounded-3xl bg-zinc-950 border border-white/10 p-6 text-center text-white shadow-2xl" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
        <img src="/noob-app-512.png" alt="" width={72} height={72} className="rounded-2xl mx-auto mb-4" />
        <h2 className="text-xl font-extrabold">A new NOOB is ready</h2>
        <p className="mt-1.5 text-sm text-zinc-400">Update from Google Play to get the newest features and fixes.</p>
        <button type="button" onClick={() => { later(); void openPlay(); }} className="mt-5 w-full h-12 rounded-full bg-white text-black font-extrabold cursor-pointer active:scale-95 transition-transform" data-testid="app-update-now">Update</button>
        <button type="button" onClick={later} className="mt-2 w-full h-11 rounded-full text-sm font-bold text-zinc-400 cursor-pointer" data-testid="app-update-later">Later</button>
      </div>
    </div>
  );
};
