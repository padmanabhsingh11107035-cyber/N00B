import React, { useEffect, useState } from 'react';
import { X, Lock, ExternalLink, RefreshCw, Link2 } from 'lucide-react';
import { closeInApp, hostOf, isFrameBlocked, useInAppPage } from '../../utils/inAppBrowser';
import { copyText } from '../../utils/clipboard';
import { showNotice } from '../../utils/likeSync';

// The in-app browser: a full-screen page with NOOB written in the top bar (the way Instagram shows "Instagram" above a website you opened from
// it), the real address under it, and the website below. Sites that refuse to be shown inside another site get an explanation and a button
// that opens them in the phone's own browser. Mounted once, in App.tsx.
export const InAppBrowserHost: React.FC = () => {
  const url = useInAppPage();
  const [reloadKey, setReloadKey] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setShowHelp(false);
    setReloadKey(0);
  }, [url]);

  // the Back button / Escape closes it
  useEffect(() => {
    if (!url) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeInApp(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [url]);

  if (!url) return null;
  const host = hostOf(url);
  const blocked = isFrameBlocked(url);
  const openOutside = () => { const w = window.open(url, '_blank', 'noopener,noreferrer'); if (!w) window.location.href = url; };

  return (
    <div className="fixed inset-0 z-[250] bg-zinc-950 text-zinc-50 flex flex-col force-dark" role="dialog" aria-label="NOOB browser">
      {/* the bar: close, NOOB + the real address, reload and "open in browser" */}
      <div className="flex items-center gap-1 px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] border-b border-zinc-800 bg-zinc-900/95 backdrop-blur shrink-0">
        <button onClick={closeInApp} className="p-2.5 rounded-full hover:bg-zinc-800 cursor-pointer" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0 text-center leading-tight">
          <p className="text-sm font-black tracking-tight">NOOB</p>
          <p className="text-[11px] text-zinc-400 flex items-center justify-center gap-1 truncate">
            {url.startsWith('https:') && <Lock className="w-3 h-3 shrink-0" />}
            <span className="truncate">{host}</span>
          </p>
        </div>
        <button onClick={() => { setLoaded(false); setReloadKey((n) => n + 1); }} className="p-2.5 rounded-full hover:bg-zinc-800 cursor-pointer" aria-label="Reload" disabled={blocked}>
          <RefreshCw className={`w-4.5 h-4.5 ${blocked ? 'opacity-30' : ''}`} />
        </button>
        <button onClick={openOutside} className="p-2.5 rounded-full hover:bg-zinc-800 cursor-pointer" aria-label="Open in browser" title="Open in browser">
          <ExternalLink className="w-4.5 h-4.5" />
        </button>
      </div>

      <div className="relative flex-1 bg-white">
        {blocked ? (
          <div className="absolute inset-0 bg-zinc-950 flex flex-col items-center justify-center gap-5 px-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-noob/15 border border-noob/30 flex items-center justify-center"><ExternalLink className="w-6 h-6 text-noob" /></div>
            <div>
              <h2 className="text-lg font-black tracking-tight">{host}</h2>
              <p className="text-sm text-zinc-400 mt-2 max-w-xs leading-relaxed">This website does not allow itself to be shown inside another app, so it opens in your browser.</p>
            </div>
            <button onClick={openOutside} className="px-7 py-3 rounded-2xl bg-gradient-to-r from-noob to-noob-strong text-black font-bold text-sm active:scale-95 transition-transform cursor-pointer">Open in browser</button>
            <button onClick={async () => showNotice((await copyText(url)) ? 'Link copied' : 'Could not copy')} className="text-xs font-semibold text-zinc-400 hover:text-zinc-200 flex items-center gap-1.5 cursor-pointer"><Link2 className="w-3.5 h-3.5" /> Copy link</button>
          </div>
        ) : (
          <>
            {!loaded && (
              <div className="absolute inset-x-0 top-0 h-0.5 bg-zinc-800 overflow-hidden z-10" aria-hidden="true">
                <div className="absolute inset-y-0 w-1/3 bg-noob noob-shimmer" />
              </div>
            )}
            <iframe
              key={`${url}|${reloadKey}`}
              src={url}
              title={host}
              // no camera / microphone / location for the page, and it can never take over NOOB itself (no top-navigation)
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
              allow=""
              onLoad={() => { setLoaded(true); window.setTimeout(() => setShowHelp(true), 1500); }}
              className="absolute inset-0 w-full h-full border-0 bg-white"
            />
            {/* a page that refuses to be shown looks empty from here, so there is always a way out */}
            {showHelp && (
              <button onClick={openOutside} className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-zinc-900/95 border border-zinc-700 text-xs font-bold text-zinc-50 shadow-xl cursor-pointer flex items-center gap-1.5">
                Page not showing? Open in browser <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
