// "Continue with Google / Apple / Facebook ..." inside the Android app. The app runs from files on the phone, so the sign-in cannot return to a web address:
// it opens the provider in the phone's own secure browser tab (Google refuses to sign anyone in inside an embedded window) and comes back through the app's own
// link (com.noob.social://auth). The pure parts come first so they can be tested without a phone.
import { isNativeApp } from '../utils/siteUrl.ts';

export const NATIVE_AUTH_SCHEME = 'com.noob.social';
export const NATIVE_AUTH_REDIRECT = `${NATIVE_AUTH_SCHEME}://auth`;

export type AuthReturn =
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'code'; code: string }
  | { kind: 'error'; message: string }
  | { kind: 'none' };

/** Reads what the sign-in left in the link the app was opened with. Anything that is not NOOB's own link gives 'none' (so a stray link can never sign anyone in). */
export function parseAuthReturn(raw: string): AuthReturn {
  try {
    if (!raw.toLowerCase().startsWith(`${NATIVE_AUTH_SCHEME}://`)) return { kind: 'none' };
    const u = new URL(raw);
    const q = u.searchParams;
    const h = new URLSearchParams(u.hash.replace(/^#/, ''));
    const err = q.get('error_description') || h.get('error_description') || q.get('error') || h.get('error');
    if (err) return { kind: 'error', message: err };
    const access = h.get('access_token') || q.get('access_token');
    const refresh = h.get('refresh_token') || q.get('refresh_token');
    if (access && refresh) return { kind: 'tokens', accessToken: access, refreshToken: refresh };
    const code = q.get('code');
    if (code) return { kind: 'code', code };
  } catch { /* not a link */ }
  return { kind: 'none' };
}

/** Where a sign-in should come back to: the app's own link inside the Android app, the web address on the website. */
export function oauthRedirectTo(): string {
  return isNativeApp() ? NATIVE_AUTH_REDIRECT : window.location.origin;
}

/** Opens the provider's page in the phone's secure browser tab (the app only; the website goes there by itself). */
export async function openNativeAuthPage(url: string): Promise<void> {
  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url });
}

let listening = false;
/** Once, when the app starts: when the app is opened by NOOB's own sign-in link, finish the sign-in. Never touches the website. */
export function listenForNativeAuthReturn(): void {
  if (listening || !isNativeApp()) return;
  listening = true;
  void (async () => {
    try {
      const { App } = await import('@capacitor/app');
      const { Browser } = await import('@capacitor/browser');
      const { supabase } = await import('./supabase');
      await App.addListener('appUrlOpen', async ({ url }) => {
        const back = parseAuthReturn(url);
        if (back.kind === 'none') return;
        try { await Browser.close(); } catch { /* already closed */ }
        try {
          if (back.kind === 'tokens') await supabase.auth.setSession({ access_token: back.accessToken, refresh_token: back.refreshToken });
          else if (back.kind === 'code') await supabase.auth.exchangeCodeForSession(back.code);
        } catch { /* the sign-in screen is still there to try again */ }
      });
    } catch { /* not inside the app */ }
  })();
}
