import React from 'react';
import { LoginDoodles } from './Auth/LoginDoodles';
import { LoginBigDoodles } from './Auth/LoginBigDoodles';
import { NoobWordmark } from './Common/NoobWordmark';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  // When set, a caught error renders this instead of the full-screen
  // takeover — used to scope a crash to one feature (e.g. chat) so the rest
  // of the app (nav, other tabs) stays usable instead of the whole screen
  // going down over a bug in a single view.
  fallback?: React.ReactNode;
  // Shows the real caught error's message under the generic text — opt-in (default off, so the
  // top-level app-wide boundary's wording is unchanged) for newer/less-proven screens, so if one of
  // them does crash the next report comes with the actual error instead of this needing another
  // round of guessing from a report of just "it crashed".
  showErrorDetails?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage?: string;
}

// Without this, any uncaught render error anywhere in the app unmounts the
// entire React tree, which is what shows up to users as "the screen just
// goes blank/black" — a fresh data shape from the server that some deep
// component wasn't ready for shouldn't be able to take down the whole app.
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  declare readonly props: Readonly<ErrorBoundaryProps>;
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { hasError: true, errorMessage: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('Uncaught render error:', error, info.componentStack);
  }

  handleReload = () => {
    // A full reload is about to remount everything anyway, so there's no
    // need to reset `hasError` via setState first.
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="doodle-wallpaper-login fixed inset-0 z-[9999] overflow-y-auto text-white" role="alert">
          <div className="relative min-h-full flex items-center justify-center p-6 overflow-hidden">
            {/* the same small doodles (and, on wide screens, the big pictures) as the sign-in page, behind everything */}
            <LoginDoodles />
            <LoginBigDoodles />
            <div className="relative z-10 w-full max-w-sm text-center flex flex-col items-center gap-5">
              <NoobWordmark className="w-44 sm:w-52" />

              <div className="relative w-full rounded-[28px] bg-zinc-950/95 border border-white/15 ring-1 ring-white/5 shadow-2xl shadow-black px-5 pt-9 pb-6 space-y-4">
                <span aria-hidden="true" className="pointer-events-none absolute inset-[5px] rounded-[23px] border border-dashed border-white/20" />
                {/* a hand-written note stuck on the corner, like the "get the app!" one on the sign-in page */}
                <span aria-hidden="true" className="font-script absolute -top-5 -left-2 text-2xl text-zinc-50 -rotate-6 pointer-events-none select-none">oops!</span>
                <span aria-hidden="true" className="absolute -top-3 -right-2 rounded-md bg-zinc-50 px-1.5 py-0.5 text-[9px] font-black tracking-wider text-zinc-950 rotate-[9deg] shadow-md pointer-events-none select-none">NO WORRIES</span>
                <svg viewBox="0 0 64 64" className="relative w-16 h-16 mx-auto text-zinc-50" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="32" cy="32" r="26" />
                  <path d="M19 24l8 8M27 24l-8 8M37 24l8 8M45 24l-8 8" />
                  <path d="M19 47q4.5-7 9 0t9 0 9 0" />
                  <path d="M54 6l1.6 4.4L60 12l-4.4 1.6L54 18l-1.6-4.4L48 12l4.4-1.6z" fill="currentColor" strokeWidth="1.5" />
                </svg>
                <h1 className="relative text-white text-xl font-black tracking-tight">Something went wrong</h1>
                <p className="relative text-zinc-300 text-sm leading-relaxed">
                  This screen ran into an unexpected error. Your account and data are safe — just reload to continue.
                </p>
                {this.props.showErrorDetails && this.state.errorMessage && (
                  <p className="relative text-red-400 text-[11px] font-mono break-words bg-red-500/10 border border-dashed border-red-500/30 rounded-xl p-2.5 text-left">
                    {this.state.errorMessage}
                  </p>
                )}
                <button
                  onClick={this.handleReload}
                  style={{ background: 'linear-gradient(100deg, var(--color-noob) 0%, var(--color-noob-strong) 100%)', color: 'var(--on-accent)' }}
                  className="relative w-full overflow-hidden py-3 rounded-full font-extrabold text-[15px] cursor-pointer shadow-[0_3px_0_rgba(var(--doodle-rgb),.28),0_9px_18px_-8px_rgba(var(--doodle-rgb),.35)] hover:scale-[1.02] active:translate-y-[2px] transition-transform"
                >
                  <span aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'repeating-linear-gradient(135deg, rgba(128,128,128,.14) 0 5px, transparent 5px 13px)' }} />
                  <span aria-hidden="true" className="pointer-events-none absolute inset-[3px] rounded-full border border-dashed" style={{ borderColor: 'color-mix(in srgb, var(--on-accent) 45%, transparent)' }} />
                  <span className="relative">Reload NOOB</span>
                </button>
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
    }

    return this.props.children;
  }
}
