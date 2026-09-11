import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { MusicPlayerProvider } from './context/MusicPlayerContext.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

// The app's `/api/...` calls are written as relative paths, which only
// resolve correctly when the frontend is served from the same origin as
// the backend (true on the web deploy). The native (Capacitor) Android
// build ships the frontend as local files with no backend of its own, so
// there we rewrite every relative /api request to the real deployed
// backend. VITE_API_BASE is only set for that native build (see
// capacitor.config.json / the Android CI workflow) — the web build never
// sets it, so this is a no-op there.
const nativeApiBase = import.meta.env.VITE_API_BASE as string | undefined;
if (nativeApiBase) {
  const backendOrigin = nativeApiBase.replace(/\/api\/?$/, '');
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string' && input.startsWith('/api')) {
      return originalFetch(backendOrigin + input, init);
    }
    if (input instanceof Request && input.url.startsWith('/api')) {
      return originalFetch(new Request(backendOrigin + input.url, input), init);
    }
    return originalFetch(input, init);
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <MusicPlayerProvider>
        <App />
      </MusicPlayerProvider>
    </ErrorBoundary>
  </StrictMode>,
);
