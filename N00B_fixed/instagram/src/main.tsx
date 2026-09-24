import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { MusicPlayerProvider } from './context/MusicPlayerContext.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';
import { initLanguage } from './i18n/engine.ts';
import { registerServiceWorkerForInstallability } from './utils/pwaInstall.ts';

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

// Scammers trick people into pasting attacker-supplied code into their own
// console ("self-XSS") to hijack their own logged-in session — the code
// itself can't be blocked from running there, but a blunt warning at the
// point people would paste it is the standard, real deterrent every major
// site with a login (Facebook, Google, etc.) uses.
console.log(
  '%cStop!',
  'color: #ff3b30; font-size: 48px; font-weight: bold; -webkit-text-stroke: 1px black;'
);
console.log(
  '%cThis is a browser feature intended for developers. If someone told you to copy-paste something here to unlock a feature or "help" your account, it is a scam that will hand them access to your NOOB account. Do not paste anything you don\'t fully understand.',
  'font-size: 16px;'
);

// The language this device was last using is applied before the first screen is shown (see i18n/engine.ts).
void initLanguage();

// Ask the browser not to evict this site's storage under pressure — where saved logins for "several accounts at once" and offline
// caches live. Some mobile browsers (notably iOS Safari) can otherwise silently clear a site's storage after a period of no use,
// which would make a saved account quietly vanish from "Switch account" even though nothing was done wrong. Best-effort only: not
// every browser supports this, and it can't override a person's own "clear data on exit" setting — so it never throws either way.
if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
  navigator.storage.persist().catch(() => {});
}

// Registered unconditionally (not only once someone opts into push, as before) because
// Chrome's "can this be installed?" check wants an active service worker present — this is
// what makes the Install and Permissions page's one-tap install button actually appear.
registerServiceWorkerForInstallability();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <MusicPlayerProvider>
        <App />
      </MusicPlayerProvider>
    </ErrorBoundary>
  </StrictMode>,
);
