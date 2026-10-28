import { createClient } from '@supabase/supabase-js';
import { makePatientFetch } from './authFetch';
import { recordDiag } from './authDiag';
import { makeServiceAwareFetch, reportServiceDown, reportServiceUp } from './serviceHealth';
import { createTabSessions, type KV } from './tabSessions';
import { mediaOrigin } from '../utils/siteUrl';
import { cachedFromDirect } from '../utils/mediaGuard';

// Public values — safe to ship to every browser (the publishable key only ever grants what the
// database's row-level-security rules allow a logged-in or logged-out visitor to do).
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!url || !key) {
  // Fail loudly in development instead of sending every call to nowhere.
  console.error('Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.');
}

// Several accounts at the same time, one per tab (see tabSessions.ts): every account's login is saved on its own, and each tab
// remembers which account it uses, so logging in as another account in one tab never signs another tab out.
const browserKV = (store: () => Storage): KV => {
  const backup = new Map<string, string>(); // used only when the browser refuses to store anything (some private windows)
  return {
    getItem: (k) => { try { return store().getItem(k); } catch { return backup.get(k) ?? null; } },
    setItem: (k, v) => { try { store().setItem(k, v); } catch { backup.set(k, v); } },
    removeItem: (k) => { try { store().removeItem(k); } catch { backup.delete(k); } }
  };
};
const localKV = browserKV(() => localStorage);
const tabKV = browserKV(() => sessionStorage);
// The installed app (home-screen app, desktop app window, native shell) keeps its own logins, apart from the browser's — see tabSessions.ts.
const isInstalledApp = (() => {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true ||
      (window as any).Capacitor?.isNativePlatform?.() === true
    );
  } catch {
    return false;
  }
})();
export const tabSessions = createTabSessions(localKV, tabKV, () => {
  try { return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) as string).filter(Boolean); } catch { return []; }
}, { app: isInstalledApp });
tabSessions.migrateLegacy(); // the one login this browser kept before becomes the first saved account
tabSessions.claimFromBrowser(); // installed app, first start only: takes over the logins the shared storage held
// A key that is new for every page load: the login library announces sign-ins and renewals to the other tabs using the SAME key, and
// tabs on different accounts must not hear each other's (each tab renews its own login and reads its own account's saved login).
const TAB_STORAGE_KEY = `sb-noob-tab-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
const tabStorage = {
  getItem: (k: string) => (k === TAB_STORAGE_KEY ? tabSessions.read() : tabKV.getItem(k)),
  setItem: (k: string, v: string) => { if (k === TAB_STORAGE_KEY) tabSessions.write(v); else tabKV.setItem(k, v); },
  removeItem: (k: string) => { if (k === TAB_STORAGE_KEY) tabSessions.remove(); else tabKV.removeItem(k); }
};

// A throw-away login client: it keeps nothing in storage and never renews anything, so it can sign in to another of the person's accounts ("Switch account")
// without touching the account this tab is using. The caller saves the login it gets (tabSessions.write) and the real client renews it from then on.
export function createIsolatedClient() {
  return createClient(url || 'http://localhost:54321', key || 'missing-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `sb-noob-link-${Math.random().toString(36).slice(2)}` }
  });
}

export const supabase = createClient(url || 'http://localhost:54321', key || 'missing-key', {
  // A rate-limited (or error-page) login renewal must not sign anyone out (see authFetch.ts); what happened is written to the
  // login recorder (authDiag.ts) so a sign-out can say why.
  global: {
    // innermost: when the host has switched the project off (HTTP 402 "Service for this project is restricted ..."), the answer is relabelled 503 so a login is never
    // deleted because of it, and the app is told to show its own "under maintenance" page (services/serviceHealth.ts)
    fetch: makePatientFetch(
      makeServiceAwareFetch((input, init) => fetch(input, init), reportServiceDown, reportServiceUp),
      (p) => recordDiag({ kind: p.temporary ? 'renewal-delayed' : 'renewal-failed', status: p.status, code: p.code })
    )
  },
  auth: {
    storageKey: TAB_STORAGE_KEY,
    storage: tabStorage,
    persistSession: true,
    autoRefreshToken: true,
    // "Sign in with Google" comes back as a token sitting in the URL (Supabase's own OAuth redirect,
    // not something this app builds) — this is what picks it up and turns it into a real session, then
    // cleans the token back out of the address bar. Every other login (username/email + password, the
    // emailed-code exchanges) never puts anything here and is unaffected either way.
    detectSessionInUrl: true
  }
});

// Write the login events to the recorder (never awaits anything: the library calls this from inside its own locks).
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') recordDiag({ kind: 'signed-out' });
  else if (event === 'SIGNED_IN') recordDiag({ kind: 'signed-in' });
  else if (event === 'TOKEN_REFRESHED') recordDiag({ kind: 'token-refreshed' });
});

export const MEDIA_BUCKET = 'media';

// Everything the database stores for a photo/video is either a bare storage key ("posts/123-abc.jpg"),
// a full https URL (outside links such as default avatars), a bundled "/path", or a "data:"/"blob:" preview.
// Only bare keys need turning into a real address.
//
// Resolved through the website's own Worker, at /m/<key> (worker/index.js), not straight to Supabase Storage.
// Supabase's Free plan allows 5 GB a month of "Cached Egress" and NOOB used 11.6 GB with 0.3 GB of files: the route that served /media/<key> before (a Worker that only lives in
// the Cloudflare dashboard) kept whole pictures but missed most pieces of videos and songs (a browser loads those in pieces), so each play went back to Supabase.
// /m/ keeps the WHOLE file in the data centre's cache and answers every piece from it. The old /media/ address still works (an app that is open on the old version uses it).
const DIRECT_PREFIX = url ? `${url}/storage/v1/object/public/${MEDIA_BUCKET}/` : '';
/** Supabase's own storage address of a file -> the cached /m/ address (anything else untouched): used by utils/mediaGuard.ts as a last safety net */
export function rewriteDirectMedia(value: string): string {
  return cachedFromDirect(value, DIRECT_PREFIX, mediaOrigin());
}

export function resolveMedia(value?: string | null): string {
  if (!value) return '';
  // inside the Android app the website's own /m/ route needs the full address (see utils/siteUrl.ts); on the website mediaOrigin() is empty
  if (value.startsWith('/m/')) return mediaOrigin() + value;
  // an older saved address of the same file (/media/<key>, or Supabase's own address) goes through the same cached route
  if (value.startsWith('/media/')) return `${mediaOrigin()}/m/${value.slice('/media/'.length)}`;
  if (DIRECT_PREFIX && value.startsWith(DIRECT_PREFIX)) return `${mediaOrigin()}/m/${value.slice(DIRECT_PREFIX.length).split('?')[0]}`;
  if (/^(https?:|data:|blob:|\/)/i.test(value)) return value;
  return `${mediaOrigin()}/m/${value.split('/').map(encodeURIComponent).join('/')}`;
}

// The reverse: what to SAVE when a screen hands back a display address. Storing the short key (not the
// long address) keeps data portable and lets the storage location change later. Accepts either the
// current /media/... form or the older direct-Supabase-URL form (still what's stored for anything
// resolved before this change, or anything not yet re-saved).
export function toStoredMedia(value?: string | null): string {
  if (!value) return '';
  const directPrefix = `${url}/storage/v1/object/public/${MEDIA_BUCKET}/`;
  if (value.startsWith(directPrefix)) {
    try { return decodeURIComponent(value.slice(directPrefix.length).split('?')[0]); } catch { return value.slice(directPrefix.length); }
  }
  // the display address of the file (/m/<key>, the older /media/<key>, with or without NOOB's own address in front of it)
  const own = /^(?:https?:\/\/(?:www\.)?(?:noobsocials\.com|nooob\.xyz))?\/(?:m|media)\//i.exec(value);
  if (own) {
    const rest = value.slice(own[0].length);
    try { return decodeURIComponent(rest.split('?')[0]); } catch { return rest; }
  }
  return value;
}
