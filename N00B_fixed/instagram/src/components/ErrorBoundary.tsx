import React from 'react';

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
        <div className="fixed inset-0 z-[9999] bg-zinc-950 flex items-center justify-center p-6">
          <div className="max-w-sm w-full text-center space-y-4">
            <div className="text-4xl">😬</div>
            <h1 className="text-white text-lg font-bold">Something went wrong</h1>
            <p className="text-zinc-400 text-sm">
              This screen ran into an unexpected error. Your account and data are safe — just reload to continue.
            </p>
            {this.props.showErrorDetails && this.state.errorMessage && (
              <p className="text-red-400 text-[11px] font-mono break-words bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 text-left">
                {this.state.errorMessage}
              </p>
            )}
            <button
              onClick={this.handleReload}
              className="w-full py-3 bg-[#00FF66] text-black font-bold rounded-xl hover:scale-[1.02] transition-transform cursor-pointer"
            >
              Reload NOOB
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
