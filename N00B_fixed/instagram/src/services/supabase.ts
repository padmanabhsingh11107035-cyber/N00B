import { createClient } from '@supabase/supabase-js';
import { makePatientFetch } from './authFetch';
import { recordDiag } from './authDiag';
import { createTabSessions, type KV } from './tabSessions';

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
export const tabSessions = createTabSessions(localKV, tabKV, () => {
  try { return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) as string).filter(Boolean); } catch { return []; }
});
tabSessions.migrateLegacy(); // the one login this browser kept before becomes the first saved account
// A key that is new for every page load: the login library announces sign-ins and renewals to the other tabs using the SAME key, and
// tabs on different accounts must not hear each other's (each tab renews its own login and reads its own account's saved login).
const TAB_STORAGE_KEY = `sb-noob-tab-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
const tabStorage = {
  getItem: (k: string) => (k === TAB_STORAGE_KEY ? tabSessions.read() : tabKV.getItem(k)),
  setItem: (k: string, v: string) => { if (k === TAB_STORAGE_KEY) tabSessions.write(v); else tabKV.setItem(k, v); },
  removeItem: (k: string) => { if (k === TAB_STORAGE_KEY) tabSessions.remove(); else tabKV.removeItem(k); }
};

export const supabase = createClient(url || 'http://localhost:54321', key || 'missing-key', {
  // A rate-limited (or error-page) login renewal must not sign anyone out (see authFetch.ts); what happened is written to the
  // login recorder (authDiag.ts) so a sign-out can say why.
  global: {
    fetch: makePatientFetch(
      (input, init) => fetch(input, init),
      (p) => recordDiag({ kind: p.temporary ? 'renewal-delayed' : 'renewal-failed', status: p.status, code: p.code })
    )
  },
  auth: {
    storageKey: TAB_STORAGE_KEY,
    storage: tabStorage,
    persistSession: true,
    autoRefreshToken: true,
    // Logins are by username/email + password only, so there is never a token in the address bar.
    detectSessionInUrl: false
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
export function resolveMedia(value?: string | null): string {
  if (!value) return '';
  if (/^(https?:|data:|blob:|\/)/i.test(value)) return value;
  return `${url}/storage/v1/object/public/${MEDIA_BUCKET}/${value.split('/').map(encodeURIComponent).join('/')}`;
}

// The reverse: what to SAVE when a screen hands back a display address. Storing the short key (not the
// long address) keeps data portable and lets the storage location change later.
export function toStoredMedia(value?: string | null): string {
  if (!value) return '';
  const prefix = `${url}/storage/v1/object/public/${MEDIA_BUCKET}/`;
  if (value.startsWith(prefix)) {
    try { return decodeURIComponent(value.slice(prefix.length).split('?')[0]); } catch { return value.slice(prefix.length); }
  }
  return value;
}
