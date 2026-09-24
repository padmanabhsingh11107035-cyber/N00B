// NOOB — captures the browser's own "install this app" prompt (Chrome / Edge / Samsung
// Internet / Android — see pushSupport.ts for why iOS Safari has no equivalent API at all;
// Apple only lets a person trigger it themselves from Safari's own Share menu).
//
// The browser can fire `beforeinstallprompt` at any time after the page loads — possibly
// before any React component exists to listen for it — and it can only be captured once:
// miss it and there is no way to ask the browser to fire it again until the next full
// navigation. So this module attaches its listener at import time (imported once, for that
// side effect, from main.tsx) rather than from inside a component's useEffect.

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((cb) => cb());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installed = true;
    notify();
  });
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return !!nav.standalone || (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches);
}

export const canInstallNow = (): boolean => !!deferredPrompt;
export const isInstalled = (): boolean => installed || isStandalone();

export function onInstallStateChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// The one real shot at the native "Add to Home Screen" dialog — each captured prompt can
// only be used once, so it's discarded here whether the person accepts or dismisses it.
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable';
  const evt = deferredPrompt;
  deferredPrompt = null;
  notify();
  await evt.prompt();
  const choice = await evt.userChoice;
  if (choice.outcome === 'accepted') installed = true;
  return choice.outcome;
}

// Chrome's install eligibility check wants an active service worker, not only a valid
// manifest — registering it unconditionally and early (rather than only once someone
// opts into push, as before) is what lets `beforeinstallprompt` actually fire reliably.
// Safe to call more than once: the browser no-ops a register() for an already-current worker.
export function registerServiceWorkerForInstallability(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
