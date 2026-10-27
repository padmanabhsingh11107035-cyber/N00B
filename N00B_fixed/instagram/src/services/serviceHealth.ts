// What the app does when NOOB's database service is switched off by its host.
//
// When the free plan's monthly allowance (for example "Cached Egress") is used up, Supabase answers EVERY request of the project, whoever asks, with
//   HTTP 402 {"message":"Service for this project is restricted due to the following violations: exceed_cached_egress_quota. ..."}
// That is not a problem of any one person, so three things must hold:
//   1. nobody is signed out. The login library deletes the saved login when renewing it fails with an answer it does not consider temporary, and a 402 with a JSON
//      body is exactly such an answer: the first renewal during a restriction signed the person out. Here every restricted answer is handed on as a plain 503
//      ("service unavailable"), which the library treats as temporary: the login stays, and renewal is tried again later.
//   2. the person sees NOOB's own "under maintenance" page (SystemPage, kind "maintenance") over whatever they were doing, never Supabase's text or a red error.
//   3. it ends by itself: a quiet check every few seconds (probeService) and the page goes away the moment the service answers again, with nothing lost.

export const RESTRICTED_PATTERN = /service for this project is restricted|exceed_[a-z_]*quota|project is restricted|upgrade their plan or remove spend caps/i;

// Does this answer say "the project is switched off"? (a 402, or a 403/429/5xx from the gateway, carrying the host's own message)
export function looksRestricted(status: number, bodyText: string): boolean {
  if (status !== 402 && status !== 403 && status !== 429 && status < 500) return false;
  return RESTRICTED_PATTERN.test(bodyText || '');
}

type FetchLike = (input: any, init?: any) => Promise<Response>;

// Wraps the login library's fetch. A restricted answer becomes a 503 saying the same thing in NOOB's words; a good answer tells the app the service is back.
export function makeServiceAwareFetch(base: FetchLike, onDown?: () => void, onUp?: () => void): FetchLike {
  return async (input, init) => {
    const res = await base(input, init);
    if (res.ok) {
      try { onUp?.(); } catch { /* a broken listener must never break a request */ }
      return res;
    }
    if (res.status !== 402 && res.status !== 403 && res.status !== 429 && res.status < 500) return res;
    let text = '';
    try { text = await res.clone().text(); } catch { /* unreadable body: not a restriction notice */ }
    if (!looksRestricted(res.status, text)) return res;
    try { onDown?.(); } catch { /* same */ }
    return new Response(JSON.stringify({ message: 'NOOB is under maintenance for a short while. Please try again in a moment.', code: 'service_restricted' }), {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'content-type': 'application/json' }
    });
  };
}

// ---- one shared "is the service down" flag (the page that covers the app listens to it) ----
type Listener = () => void;
const listeners = new Set<Listener>();
let down = false;

export const isServiceDown = (): boolean => down;
export const subscribeServiceDown = (l: Listener): (() => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const emit = () => { listeners.forEach((l) => { try { l(); } catch { /* ignore */ } }); };
export function reportServiceDown(): void { if (!down) { down = true; emit(); } }
export function reportServiceUp(): void { if (down) { down = false; emit(); } }

export type ProbeResult = 'up' | 'restricted' | 'unreachable';

// A tiny, public question to the login server (nothing to sign in for): is the service answering? Uses the plain fetch, never the wrapped one, so it can not loop.
export async function probeService(opts: { url?: string; key?: string; fetchImpl?: FetchLike; timeoutMs?: number } = {}): Promise<ProbeResult> {
  const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env) || {};
  const url = opts.url ?? env.VITE_SUPABASE_URL;
  const key = opts.key ?? env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return 'unreachable';
  const doFetch: FetchLike = opts.fetchImpl ?? ((i, init) => fetch(i, init));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (ctl) timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 8000);
    const res = await doFetch(`${url}/auth/v1/health`, { headers: { apikey: key }, cache: 'no-store', signal: ctl?.signal });
    if (res.ok) return 'up';
    let text = '';
    try { text = await res.text(); } catch { /* ignore */ }
    return looksRestricted(res.status, text) ? 'restricted' : 'unreachable';
  } catch {
    return 'unreachable';
  } finally {
    if (timer) clearTimeout(timer);
  }
}
