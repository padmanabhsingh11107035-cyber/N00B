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
    <div role="status" aria-live="polite" className={`fx-toast ${toast.kind === 'ok' ? 'is-ok' : 'is-err'}`}>
      {toast.text}
    </div>
  ) : null;
  return { say, toast: node };
}

export const Card: React.FC<{ children?: React.ReactNode; className?: string; ariaLabel?: string }> = ({ children, className = '', ariaLabel }) => (
  <div aria-label={ariaLabel} className={`fx-card fx-in ${className}`}>{children}</div>
);

export const SkeletonCards: React.FC<{ count?: number; label?: string }> = ({ count = 3, label = 'Loading' }) => (
  <div className="fx-stack-sm" role="status" aria-label={label}>
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className="fx-skel animate-pulse">
        <i style={{ height: 12, width: '40%' }} />
        <i style={{ height: 56, marginTop: 16 }} />
        <i style={{ height: 56, marginTop: 8 }} />
      </div>
    ))}
  </div>
);

export const ErrorState: React.FC<{ text: string; onRetry?: () => void }> = ({ text, onRetry }) => (
  <div className="fx-state" role="alert">
    <div className="fx-state-ic is-bad"><AlertCircle className="w-8 h-8" aria-hidden="true" /></div>
    <p className="fx-state-hint" style={{ fontSize: 14 }}>{text}</p>
    {onRetry && <button type="button" onClick={onRetry} className="fx-btn is-auto" style={{ marginTop: 18 }}>Try again</button>}
  </div>
);

export const EmptyState: React.FC<{ icon: React.ReactNode; title: string; hint?: string; action?: React.ReactNode }> = ({ icon, title, hint, action }) => (
  <div className="fx-state">
    <div className="fx-state-ic">{icon}</div>
    <p className="fx-state-title">{title}</p>
    {hint && <p className="fx-state-hint">{hint}</p>}
    {action && <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center' }}>{action}</div>}
  </div>
);

/** A button that shows it is working. */
export const BusyLabel: React.FC<{ busy: boolean; children?: React.ReactNode }> = ({ busy, children }) => (
  <span className="inline-flex items-center justify-center gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}{children}</span>
);

/** A page that needs an account: asks nicely. */
export const LoginPrompt: React.FC<{ what: string; onLogin?: () => void }> = ({ what, onLogin }) => (
  <div className="fx-state">
    <p className="fx-state-title" style={{ marginTop: 0 }}>Log in to {what}.</p>
    {onLogin && <button type="button" onClick={onLogin} className="fx-btn is-auto" style={{ marginTop: 18 }}>Log in</button>}
  </div>
);
