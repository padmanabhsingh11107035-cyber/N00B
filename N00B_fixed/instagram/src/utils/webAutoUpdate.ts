// A phone keeps the app it has already loaded (an iPhone home-screen app especially) and does not fetch a new version when it is opened again.
// So the newest page is asked for by itself, with the network forced, each time the app comes back to the front (and every 10 minutes while it is open). If the newest page
// uses another main file than the one that is running, the app reloads once, right then, as long as nobody is typing. Nothing happens when the versions are the same.
import { hardReload } from './reloadApp';

const MAIN_RE = /\/assets\/main-[A-Za-z0-9_-]+\.js/;
let checking = false;
let lastCheck = 0;

function runningMain(): string | null {
  const s = Array.from(document.scripts).map((x) => x.getAttribute('src') || '').find((src) => MAIN_RE.test(src));
  const m = s ? s.match(MAIN_RE) : null;
  return m ? m[0] : null;
}

async function check(): Promise<void> {
  if (checking || document.hidden) return;
  const now = Date.now();
  if (now - lastCheck < 20_000) return;
  lastCheck = now;
  checking = true;
  try {
    const mine = runningMain();
    if (!mine) return;
    const res = await fetch(`/?_v=${now}`, { cache: 'no-store', credentials: 'omit' });
    if (!res.ok) return;
    const html = await res.text();
    const m = html.match(MAIN_RE);
    if (!m || m[0] === mine) return;
    const a = document.activeElement as HTMLElement | null;
    const typing = !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
    if (typing) return;   // asked again at the next check
    hardReload();
  } catch { /* offline or blocked: the next check tries again */ } finally { checking = false; }
}

export function initWebAutoUpdate(): void {
  if (typeof window === 'undefined' || (import.meta as { env?: { DEV?: boolean } }).env?.DEV) return;
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void check(); });
  window.addEventListener('pageshow', () => { void check(); });
  window.setInterval(() => { void check(); }, 10 * 60_000);
  window.setTimeout(() => { void check(); }, 4000);
}
