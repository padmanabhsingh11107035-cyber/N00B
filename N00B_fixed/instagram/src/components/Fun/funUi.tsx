import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';

// Small pieces shared by the four "Fun" pages (This or That, Ask Me Anything, Mood Status, Public Polls): a notice that fades by itself, loading placeholders,
// empty and error states, and a few helpers. They use the app's own cards and colours (see index.css), nothing of their own.

export const newKey = (): string => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);
export const codePoints = (s: string): number => Array.from(s).length;

/** The server's own sentence for things like "You already voted", but never a raw network error. */
export const friendly = (e: unknown, fallback: string): string =>
  e instanceof Error && e.message && !/^(TypeError|NetworkError|Failed to fetch|Load failed)/i.test(e.message) ? e.message : fallback;

export const timeAgo = (iso: string): string => {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

export const percent = (part: number, total: number): number => (total > 0 ? Math.round((part / total) * 100) : 0);

/** One notice at the bottom of the screen: success or error, gone by itself. */
export function useToast() {
  const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const say = useCallback((text: string, kind: 'ok' | 'err' = 'ok') => {
    setToast({ text, kind });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 3400);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const node = toast ? (
    <div role="status" aria-live="polite" className={`fixed left-1/2 -translate-x-1/2 bottom-8 z-[120] max-w-[92vw] px-4 py-2.5 rounded-full text-xs font-bold shadow-2xl border ${toast.kind === 'ok' ? 'bg-noob text-black border-zinc-50' : 'bg-red-950 text-red-100 border-red-500/60'}`}>
      {toast.text}
    </div>
  ) : null;
  return { say, toast: node };
}

export const Card: React.FC<{ children?: React.ReactNode; className?: string; ariaLabel?: string }> = ({ children, className = '', ariaLabel }) => (
  <div aria-label={ariaLabel} className={`no-doodle rounded-3xl bg-zinc-900 border border-zinc-800 p-4 sm:p-5 ${className}`}>{children}</div>
);

export const SkeletonCards: React.FC<{ count?: number; label?: string }> = ({ count = 3, label = 'Loading' }) => (
  <div className="space-y-3" role="status" aria-label={label}>
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className="no-doodle rounded-3xl bg-zinc-900 border border-zinc-800 p-4 animate-pulse">
        <div className="h-3 w-2/5 rounded bg-zinc-800" />
        <div className="mt-4 h-14 w-full rounded-2xl bg-zinc-800" />
        <div className="mt-2 h-14 w-full rounded-2xl bg-zinc-800" />
      </div>
    ))}
  </div>
);

export const ErrorState: React.FC<{ text: string; onRetry?: () => void }> = ({ text, onRetry }) => (
  <div className="rounded-3xl bg-zinc-900 border border-zinc-800 p-6 text-center" role="alert">
    <AlertCircle className="w-8 h-8 mx-auto text-red-400" aria-hidden="true" />
    <p className="mt-3 text-sm text-zinc-300">{text}</p>
    {onRetry && <button type="button" onClick={onRetry} className="mt-4 px-5 py-2.5 rounded-full bg-noob text-black text-sm font-bold cursor-pointer">Try again</button>}
  </div>
);

export const EmptyState: React.FC<{ icon: React.ReactNode; title: string; hint?: string; action?: React.ReactNode }> = ({ icon, title, hint, action }) => (
  <div className="rounded-3xl bg-zinc-900 border border-zinc-800 p-8 text-center">
    <div className="w-16 h-16 rounded-full border border-zinc-700 mx-auto flex items-center justify-center text-zinc-300">{icon}</div>
    <p className="mt-4 text-base font-bold">{title}</p>
    {hint && <p className="mt-1.5 text-xs text-zinc-400 leading-relaxed">{hint}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

/** A button that shows it is working. */
export const BusyLabel: React.FC<{ busy: boolean; children?: React.ReactNode }> = ({ busy, children }) => (
  <span className="inline-flex items-center justify-center gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}{children}</span>
);

/** A page that needs an account: asks nicely. */
export const LoginPrompt: React.FC<{ what: string; onLogin?: () => void }> = ({ what, onLogin }) => (
  <div className="rounded-3xl bg-zinc-900 border border-zinc-800 p-6 text-center">
    <p className="text-sm text-zinc-300">Log in to {what}.</p>
    {onLogin && <button type="button" onClick={onLogin} className="mt-4 px-6 py-3 rounded-full bg-noob text-black text-sm font-extrabold cursor-pointer">Log in</button>}
  </div>
);
