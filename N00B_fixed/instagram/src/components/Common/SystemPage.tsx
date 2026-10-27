import React, { useEffect, useState } from 'react';
import { LoginDoodles } from '../Auth/LoginDoodles';
import { LoginBigDoodles } from '../Auth/LoginBigDoodles';
import { NoobWordmark } from './NoobWordmark';

// The two pages that stand alone when NOOB cannot show the page asked for, in the look of the sign-in page (doodle wallpaper, the logo, one card):
//  * "not-found": the address is not a page of NOOB (a broken or old link). Nothing else is shown: no app, no browser error page.
//  * "down": NOOB cannot reach its servers (they are down, the network dropped, a new version is still being put up). It tries again by itself and says so; only this page is shown.
//  * "maintenance": the host has switched NOOB's database off (the plan's monthly allowance is used up, services/serviceHealth.ts). Shown over the app, which stays exactly as it
//    was: nobody is signed out, and it goes away by itself the moment the service answers again.
export type SystemPageKind = 'not-found' | 'down' | 'maintenance';

interface SystemPageProps {
  kind: SystemPageKind;
  /** "down": ask the app to try again (a button, and by itself every `retryEverySeconds`); without it the page is reloaded */
  onRetry?: () => void;
  retryEverySeconds?: number;
  /** "not-found" shown over a page (a sign-in button that could not start): a button that simply closes it, in place of "Go back" */
  onClose?: () => void;
}

const COPY: Record<SystemPageKind, { stamp: string; note: string; title: string; body: string }> = {
  'not-found': {
    stamp: '404',
    note: 'LOST?',
    title: 'This page does not exist',
    body: 'The link may be broken, or the page may have moved. Nothing is wrong with your account.'
  },
  down: {
    stamp: 'BRB',
    note: 'SHORT BREAK',
    title: 'NOOB is taking a short break',
    body: 'We cannot reach NOOB right now. This is usually over in a minute or two. Your account and everything you posted are safe.'
  },
  maintenance: {
    stamp: 'FIX',
    note: 'UPGRADING',
    title: 'NOOB is under maintenance',
    body: 'We are tuning NOOB up and it will be back very soon. You are still signed in, and your account and everything you posted are safe. NOOB opens again by itself.'
  }
};

export const SystemPage: React.FC<SystemPageProps> = ({ kind, onRetry, retryEverySeconds = 20, onClose }) => {
  const c = COPY[kind];
  const [left, setLeft] = useState(retryEverySeconds);
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && navigator.onLine === false);
  const canGoBack = typeof window !== 'undefined' && window.history.length > 1;

  const retry = () => { if (onRetry) onRetry(); else window.location.reload(); setLeft(retryEverySeconds); };

  useEffect(() => {
    if (kind === 'not-found') return;
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const t = window.setInterval(() => setLeft((n) => (n <= 1 ? 0 : n - 1)), 1000);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); window.clearInterval(t); };
  }, [kind]);
  useEffect(() => { if (kind !== 'not-found' && left === 0) retry(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [left, kind]);

  return (
    <div className="doodle-wallpaper-login fixed inset-0 z-[9999] overflow-y-auto text-white" role="alert" data-testid={`system-page-${kind}`}>
      <div className="relative min-h-full flex items-center justify-center p-6 overflow-hidden">
        <LoginDoodles />
        <LoginBigDoodles />
        <div className="relative z-10 w-full max-w-sm text-center flex flex-col items-center gap-5">
          <NoobWordmark className="w-44 sm:w-52" />

          <div className="relative w-full rounded-[28px] bg-zinc-950/95 border border-white/15 ring-1 ring-white/5 shadow-2xl shadow-black px-5 pt-9 pb-6 space-y-4">
            <span aria-hidden="true" className="pointer-events-none absolute inset-[5px] rounded-[23px] border border-dashed border-white/20" />
            <span aria-hidden="true" className="font-script absolute -top-5 -left-2 text-2xl text-zinc-50 -rotate-6 pointer-events-none select-none">{kind === 'down' ? 'brb!' : kind === 'maintenance' ? 'soon!' : 'oops!'}</span>
            <span aria-hidden="true" className="absolute -top-3 -right-2 rounded-md bg-zinc-50 px-1.5 py-0.5 text-[9px] font-black tracking-wider text-zinc-950 rotate-[9deg] shadow-md pointer-events-none select-none">{c.note}</span>
            <p className="relative text-6xl font-black tracking-tight text-zinc-50" aria-hidden="true">{c.stamp}</p>
            <h1 className="relative text-white text-xl font-black tracking-tight" data-testid="system-title">{c.title}</h1>
            <p className="relative text-zinc-300 text-sm leading-relaxed">{kind !== 'not-found' && offline ? 'Your phone or computer is not connected to the internet. Check Wi-Fi or mobile data; NOOB will open again by itself.' : c.body}</p>

            {kind === 'not-found' ? (
              <div className="relative flex flex-col gap-2.5">
                <a
                  href="/"
                  style={{ background: 'linear-gradient(100deg, var(--color-noob) 0%, var(--color-noob-strong) 100%)', color: 'var(--on-accent)' }}
                  className="relative block overflow-hidden py-3 rounded-full font-extrabold text-[15px] cursor-pointer no-underline"
                  data-testid="system-home"
                >
                  <span className="relative">Go to NOOB</span>
                </a>
                {onClose ? (
                  <button onClick={onClose} className="py-2.5 rounded-full text-sm font-bold text-zinc-300 border border-white/20 cursor-pointer hover:text-white" data-testid="system-close">Back to sign in</button>
                ) : canGoBack && (
                  <button onClick={() => window.history.back()} className="py-2.5 rounded-full text-sm font-bold text-zinc-300 border border-white/20 cursor-pointer hover:text-white" data-testid="system-back">Go back</button>
                )}
              </div>
            ) : (
              <div className="relative flex flex-col gap-2">
                <button
                  onClick={retry}
                  style={{ background: 'linear-gradient(100deg, var(--color-noob) 0%, var(--color-noob-strong) 100%)', color: 'var(--on-accent)' }}
                  className="relative overflow-hidden py-3 rounded-full font-extrabold text-[15px] cursor-pointer"
                  data-testid="system-retry"
                >
                  <span className="relative">Try again</span>
                </button>
                <p className="text-[11px] text-zinc-500" aria-live="polite" data-testid="system-countdown">Trying again by itself in {left}s</p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs font-bold tracking-wide">
            <span className="text-noob">Connect</span>
            <span className="text-zinc-600">•</span>
            <span className="text-cyan-400">Share</span>
            <span className="text-zinc-600">•</span>
            <span className="text-violet-400">Grow</span>
          </div>
        </div>
      </div>
    </div>
  );
};
