import { tabSessions } from '../services/supabase';

// NOOB AI is the multilingual voice assistant (github.com/padmanabhsingh11107035-cyber/noobai). It runs on the
// owner's PC and is reached at this address through a Cloudflare Tunnel.
export const NOOB_AI_URL = ((import.meta.env.VITE_NOOB_AI_URL as string | undefined) || 'https://ai.nooob.xyz').replace(/\/+$/, '');

// Opens NOOB AI in a new tab and signs this account in there automatically ("Continue with NOOB", without typing).
// The login token goes after '#', which browsers never send to a server or put in a Referer; NOOB AI checks it with
// NOOB once and forgets it. Opened straight from the tap (nothing awaited first) so browsers don't block the new tab.
export function openNoobAi(): void {
  let token = '';
  try {
    const saved = JSON.parse(tabSessions.read() || 'null');
    if (saved?.access_token && (!saved.expires_at || saved.expires_at * 1000 > Date.now())) token = saved.access_token;
  } catch {
    // no saved login: NOOB AI shows its own sign-in page
  }
  const url = `${NOOB_AI_URL}/noob-signin${token ? `#token=${encodeURIComponent(token)}` : ''}`;
  const win = window.open(url, '_blank');
  if (win) win.opener = null;
  else window.location.href = url;
}
