import { tabSessions } from '../services/supabase';

// NOOB AI is the multilingual voice assistant (github.com/padmanabhsingh11107035-cyber/noobai). Its brain runs on the
// owner's PC (Python: speech, AI, voice, memory, robot pairing) and is reached at this address through a Cloudflare Tunnel.
export const NOOB_AI_URL = ((import.meta.env.VITE_NOOB_AI_URL as string | undefined) || 'https://ai.nooob.xyz').replace(/\/+$/, '');

// NOOB AI's sign-in address for this tab's account ("Continue with NOOB", without typing). The login token goes after '#',
// which browsers never send to a server or put in a Referer; NOOB AI checks it with NOOB once and forgets it.
export function noobAiSignInUrl(): string {
  let token = '';
  try {
    const saved = JSON.parse(tabSessions.read() || 'null');
    if (saved?.access_token && (!saved.expires_at || saved.expires_at * 1000 > Date.now())) token = saved.access_token;
  } catch {
    // no saved login: NOOB AI shows its own sign-in page
  }
  return `${NOOB_AI_URL}/noob-signin${token ? `#token=${encodeURIComponent(token)}` : ''}`;
}

// Opens NOOB AI in its own browser tab (straight from the tap, so browsers don't block it).
export function openNoobAi(): void {
  const url = noobAiSignInUrl();
  const win = window.open(url, '_blank');
  if (win) win.opener = null;
  else window.location.href = url;
}

// Is NOOB AI switched on right now? (Its PC must be on.)
export async function noobAiIsOnline(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(`${NOOB_AI_URL}/health`, { cache: 'no-store', signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
