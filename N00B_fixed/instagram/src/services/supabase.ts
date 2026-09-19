import { createClient } from '@supabase/supabase-js';

// Public values — safe to ship to every browser (the publishable key only ever grants what the
// database's row-level-security rules allow a logged-in or logged-out visitor to do).
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!url || !key) {
  // Fail loudly in development instead of sending every call to nowhere.
  console.error('Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.');
}

export const supabase = createClient(url || 'http://localhost:54321', key || 'missing-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Logins are by username/email + password only, so there is never a token in the address bar.
    detectSessionInUrl: false
  }
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
