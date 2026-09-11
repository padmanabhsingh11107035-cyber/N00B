import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

// Without this, any uncaught render error anywhere in the app unmounts the
// entire React tree, which is what shows up to users as "the screen just
// goes blank/black" — a fresh data shape from the server that some deep
// component wasn't ready for shouldn't be able to take down the whole app.
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  declare readonly props: Readonly<ErrorBoundaryProps>;
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
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
      return (
        <div className="fixed inset-0 z-[9999] bg-zinc-950 flex items-center justify-center p-6">
          <div className="max-w-sm w-full text-center space-y-4">
            <div className="text-4xl">😬</div>
            <h1 className="text-white text-lg font-bold">Something went wrong</h1>
            <p className="text-zinc-400 text-sm">
              This screen ran into an unexpected error. Your account and data are safe — just reload to continue.
            </p>
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
