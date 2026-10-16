import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { ANDROID_APK_URL } from '../../utils/appVersion';
import { isNativeApp } from '../../utils/siteUrl';
import { isInstalled } from '../../utils/pwaInstall';
import { PROMPT_MAX_TIMES, shouldOfferAndroidApp, type PromptMemory } from '../../utils/androidAppPrompt';

// The card itself. When it is offered is decided in utils/androidAppPrompt.ts.
const KEY = 'noob.androidAppPrompt';

const load = (): PromptMemory | null => {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) || 'null');
    return r && typeof r.at === 'number' && typeof r.times === 'number' ? { at: r.at, times: r.times, done: !!r.done } : null;
  } catch { return null; }
};
const save = (m: PromptMemory) => { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* it may come up again: harmless */ } };

export const AndroidAppPrompt: React.FC = () => {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState<'offer' | 'hint'>('offer');

  useEffect(() => {
    const ok = shouldOfferAndroidApp({ userAgent: navigator.userAgent, native: isNativeApp(), installed: isInstalled(), memory: load(), now: Date.now() });
    if (!ok) return;
    const t = window.setTimeout(() => setShow(true), 25000);
    return () => window.clearTimeout(t);
  }, []);

  if (!show) return null;
  const notNow = () => { const m = load(); save({ at: Date.now(), times: (m?.times ?? 0) + 1 }); setShow(false); };
  const get = () => {
    save({ at: Date.now(), times: PROMPT_MAX_TIMES, done: true });
    window.open(ANDROID_APK_URL, '_blank', 'noopener');
    setStep('hint');
  };

  return (
    <div className="fixed inset-x-0 bottom-24 z-[90] flex justify-center px-3 pointer-events-none" data-testid="android-app-prompt">
      <div className="pointer-events-auto w-full max-w-sm rounded-3xl border border-white/30 bg-zinc-950/98 shadow-2xl shadow-black p-4 relative">
        <button type="button" onClick={step === 'offer' ? notNow : () => setShow(false)} aria-label="Close" className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
        <div className="flex items-start gap-3 pr-6">
          <span className="w-10 h-10 shrink-0 rounded-2xl border border-white/25 bg-zinc-900 flex items-center justify-center text-white"><Download className="w-5 h-5" /></span>
          {step === 'offer' ? (
            <span className="min-w-0">
              <span className="block text-sm font-black text-white leading-tight">Get the NOOB app for Android</span>
              <span className="block text-[12px] text-zinc-400 leading-snug mt-1">Blocks screenshots of your chats and keeps itself up to date. Same account, same chats.</span>
            </span>
          ) : (
            <span className="min-w-0">
              <span className="block text-sm font-black text-white leading-tight">Open the file to install</span>
              <span className="block text-[12px] text-zinc-400 leading-snug mt-1">When it has downloaded, open it. If Android asks, allow your browser to install apps, then tap Install.</span>
            </span>
          )}
        </div>
        {step === 'offer' && (
          <div className="flex gap-2 mt-3.5">
            <button type="button" onClick={get} className="flex-1 py-2 rounded-full bg-white text-black text-xs font-extrabold active:scale-95 transition-transform touch-manipulation cursor-pointer">Get the app</button>
            <button type="button" onClick={notNow} className="px-5 py-2 rounded-full border border-white/30 text-white text-xs font-extrabold active:scale-95 transition-transform touch-manipulation cursor-pointer hover:border-white/70">Not now</button>
          </div>
        )}
      </div>
    </div>
  );
};
