import React, { useCallback, useEffect, useRef, useState } from 'react';

// Cloudflare Turnstile: a free, privacy-friendly "are you a person" check, used ONLY where an account is created (the step that asks for the
// emailed sign-up code). It is switched on by the build variable VITE_TURNSTILE_SITE_KEY; with no key this renders nothing and the sign-up is
// exactly what it was. The server (recover-account) has its own switch (the secret TURNSTILE_SECRET_KEY) - see docs/TURNSTILE.md.

const SITE_KEY = ((import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || '').trim();
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export const turnstileEnabled = SITE_KEY.length > 0;

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
};
const api = (): TurnstileApi | undefined => (window as unknown as { turnstile?: TurnstileApi }).turnstile;

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (api()) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => (api() ? resolve() : reject(new Error('turnstile missing')));
    s.onerror = () => reject(new Error('turnstile blocked'));
    document.head.appendChild(s);
  }).catch((e) => { scriptPromise = null; throw e; });   // forget a failed load so "Try again" really tries again
  return scriptPromise;
}

/** The state a sign-up screen keeps for the check. `use` = the token to send (empty when off, still solving, or the widget failed). */
export function useTurnstile() {
  const [token, setToken] = useState('');
  const [failed, setFailed] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  /** A token works once: call this after every request that sent one, so a fresh one is made for the next. */
  const consume = useCallback(() => { setToken(''); setResetKey((k) => k + 1); }, []);
  /** Why the request should wait, or null when it may go. (Widget failed to load: it may go without a token; the server then decides.) */
  const blocker = turnstileEnabled && !token && !failed ? 'Please wait a moment for the security check to finish, then try again.' : null;
  return { token, setToken, failed, setFailed, resetKey, consume, blocker, boxProps: { onToken: setToken, onFailed: setFailed, resetKey } };
}

interface Props {
  onToken: (token: string) => void;
  onFailed?: (failed: boolean) => void;
  /** Change this number to throw the old token away and ask for a new one. */
  resetKey?: number;
  theme?: 'light' | 'dark' | 'auto';
}

export default function TurnstileBox({ onToken, onFailed, resetKey = 0, theme = 'auto' }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const onTokenRef = useRef(onToken);
  const onFailedRef = useRef(onFailed);
  onTokenRef.current = onToken;
  onFailedRef.current = onFailed;

  useEffect(() => {
    if (!turnstileEnabled) return;
    let gone = false;
    setLoadError(false);
    loadScript().then(() => {
      if (gone || !host.current || !api()) return;
      widgetId.current = api()!.render(host.current, {
        sitekey: SITE_KEY,
        theme,
        callback: (t: string) => { onFailedRef.current?.(false); onTokenRef.current(t); },
        'expired-callback': () => onTokenRef.current(''),
        'timeout-callback': () => onTokenRef.current(''),
        'error-callback': () => { onTokenRef.current(''); setLoadError(true); onFailedRef.current?.(true); }
      });
    }).catch(() => {
      if (gone) return;
      onTokenRef.current('');
      setLoadError(true);
      onFailedRef.current?.(true);
    });
    return () => {
      gone = true;
      try { if (widgetId.current && api()) api()!.remove(widgetId.current); } catch { /* the widget is already gone */ }
      widgetId.current = null;
    };
  }, [attempt, theme]);

  // a new number from the parent = the last token was used: ask for another
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    try { if (widgetId.current && api()) api()!.reset(widgetId.current); } catch { /* it will be made again on the next try */ }
  }, [resetKey]);

  if (!turnstileEnabled) return null;
  return (
    <div role="group" aria-label="Security check" className="flex flex-col items-center gap-2 my-2">
      <div ref={host} data-testid="turnstile-box" className="min-h-[65px] flex items-center justify-center" />
      {loadError && (
        <div role="alert" className="text-center text-xs text-amber-300">
          <p>The security check could not load. Check your connection and try again.</p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="mt-1 font-bold underline cursor-pointer">Try again</button>
        </div>
      )}
    </div>
  );
}
