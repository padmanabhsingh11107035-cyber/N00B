import {StrictMode, Suspense, lazy} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { MusicPlayerProvider } from './context/MusicPlayerContext.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { MovedNotice, movedNoticeBlocksApp } from './components/Common/MovedNotice.tsx';
import { InstallInvite } from './components/Common/InstallInvite.tsx';
import './index.css';
import { initTheme } from './utils/theme.ts';
import { cleanReloadMark } from './utils/reloadApp.ts';
import { installOverlayScrollLock } from './utils/overlayScrollLock.ts';
import { installKeyboardFill } from './utils/keyboardFill.ts';
import './utils/devicePrefs.ts';   // reads this device's saved choices (text size, less motion, ...) and applies them before anything is drawn
import { initLanguage } from './i18n/engine.ts';
import { startTextFit } from './utils/textFit.ts';
import { registerServiceWorkerForInstallability } from './utils/pwaInstall.ts';
import { installHistoryGate } from './utils/historyGate.ts';
import { cleanPath, isKnownPath } from './utils/routes.ts';
import { parseFunPath } from './utils/funRoutes.ts';
import { isNativeApp } from './utils/siteUrl.ts';
import { isCoachingHost } from './components/Study/studyStore.ts';
import { SystemPage } from './components/Common/SystemPage.tsx';
import { ServiceGate } from './components/Common/ServiceGate.tsx';
import { isEditorHost } from './components/Studio/studioStore.ts';

// NOOB Studio as a page of its own (editor.noobsocials.com): fetched only on that address
const StudioStandalone = lazy(() => import('./components/Studio/StudioStandalone.tsx'));
// The page the two buttons of the "Is this you?" login email open (/login-approval): fetched only there, the app itself is not started
const LoginApprovalPage = lazy(() => import('./components/Auth/LoginApprovalPage.tsx'));

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
installHistoryGate();   // lets the address bar wait while the browser is still walking back through history (utils/historyGate.ts)
installOverlayScrollLock();   // pages that cover the screen are pages of their own: the page behind them does not scroll (utils/overlayScrollLock.ts)
installKeyboardFill();         // the phone's see-through keyboard shows the colour of the screen above it, never the page behind (utils/keyboardFill.ts)
cleanReloadMark();   // a page that was reloaded to get the newest version carries a small "?_r=" mark: take it off the address (utils/reloadApp.ts)
initTheme();
void initLanguage();
startTextFit();   // a bar that runs out of room (top bar, bottom bar ...) takes back some of the bigger text until it fits

// Android's browser/WebView renders the "liquid glass" bottom nav and three-dot menus (see
// .liquid-glass in index.css) almost fully see-through instead of blurred-translucent — that
// look depends on backdrop-filter, which is unreliable there (still missing on plenty of real
// Android WebViews) even though the CSS itself is accepted without error. iOS Safari renders it
// correctly, so only Android gets a solid fallback background (index.css, body.is-android).
if (typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)) {
  document.body.classList.add('is-android');
}

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

// The opening splash (index.html): a black screen that the opening animation (public/opening/opening.js) takes over: it plays for 4 seconds, opens the app like an iris and removes
// the splash itself, so there is nothing to do here. Where it does not run (reduced motion, a missing script) the plain black screen fades away as soon as the app has started; the
// coaching and editor addresses keep their logo on it for 3 and 1 seconds. The app is already underneath the splash by then.
const SPLASH_SECONDS = Number((window as unknown as { __splashSeconds?: number }).__splashSeconds) || 0.4;   // 3 seconds with the logo on the coaching address, 1 on the editor address (see index.html); on NOOB the plain black screen goes as soon as the app has started
const splash = document.getElementById('noob-splash');
if (splash && !(window as unknown as { __noobOpening?: unknown }).__noobOpening) {
  const wait = Math.max(0, SPLASH_SECONDS * 1000 - (typeof performance !== 'undefined' ? performance.now() : 0));
  window.setTimeout(() => {
    splash.style.opacity = '0';
    window.setTimeout(() => splash.remove(), 400);
  }, wait);
}

// The old address (nooob.xyz) only shows the "NOOB has a new home" card: the app itself runs on the new address only, so every update goes there and nothing
// on the old one can change or be used by mistake. (NOOB's own support can still open the app there with ?old=1 — see MovedNotice.tsx.)
const oldAddress = movedNoticeBlocksApp();

// An address that is not a page of NOOB shows only the "page not found" page: the app is not even started (no sign-in screen, no loading, no browser error page).
const editorPage = !oldAddress && !isNativeApp() && isEditorHost();
const approvalPage = !oldAddress && !editorPage && !isNativeApp() && cleanPath(window.location.pathname) === '/login-approval';
const pageNotFound = !oldAddress && !editorPage && !approvalPage && !isNativeApp() && !isCoachingHost() && !isKnownPath(window.location.pathname, [(p) => !!parseFunPath(p)]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {oldAddress ? (
        <MovedNotice />
      ) : editorPage ? (
        <Suspense fallback={null}><StudioStandalone /></Suspense>
      ) : approvalPage ? (
        <Suspense fallback={null}><LoginApprovalPage /></Suspense>
      ) : pageNotFound ? (
        <SystemPage kind="not-found" />
      ) : (
        <MusicPlayerProvider>
          <App />
          <InstallInvite />
          <ServiceGate />
        </MusicPlayerProvider>
      )}
    </ErrorBoundary>
  </StrictMode>,
);

// Tells public/boot-guard.js that the app started (if it does not, that file shows the "NOOB is taking a short break" page by itself).
(window as unknown as { __noobBooted?: boolean }).__noobBooted = true;
