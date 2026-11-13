import { supabase } from './supabase';
import { VISITOR_KEY, collectVisitInfo, newVisitorId, validCoords } from '../utils/visitorInfo';
import { mediaOrigin } from '../utils/siteUrl';

// Tells the server, quietly, that this device opened NOOB (the admin panel's Visitors page). Works without an account; once the person logs in it is told again so the
// visit is linked to them. It never blocks anything and never shows an error: a missed count is not worth disturbing a person for.
const MIN_GAP_MS = 10 * 60 * 1000;
let lastSent = 0;
let started = false;
let coords: { lat: number; lng: number } | null | undefined;   // asked once per page load

/** The approximate position of this connection, from NOOB's own web address (no permission prompt, no location API; usually the city, never a GPS reading). */
async function approxCoords(): Promise<{ lat: number; lng: number } | null> {
  if (coords !== undefined) return coords;
  coords = null;
  try {
    const res = await Promise.race([fetch(`${mediaOrigin()}/__geo`, { cache: 'no-store' }), new Promise<null>((r) => setTimeout(() => r(null), 3000))]);
    if (res && res.ok) { const j = await res.json(); coords = validCoords(j?.latitude, j?.longitude); }
  } catch { /* no position: the visit is still counted */ }
  return coords;
}

function visitorId(): string | null {
  try {
    const have = localStorage.getItem(VISITOR_KEY);
    if (have && have.length >= 8) return have;
    const id = newVisitorId();
    if (id) localStorage.setItem(VISITOR_KEY, id);
    return id;
  } catch {
    return newVisitorId();   // storage is not available (some private windows): the id lasts until the page is closed
  }
}

/** Send the visit now (or only if the last one was a while ago, with `force` false). */
export async function noteVisit(force = true): Promise<void> {
  try {
    const now = Date.now();
    if (!force && now - lastSent < MIN_GAP_MS) return;
    const id = visitorId();
    if (!id) return;
    lastSent = now;
    const c = await approxCoords();
    await supabase.rpc('record_visit', { p_visitor: id, p_info: c ? { ...collectVisitInfo(), lat: c.lat, lng: c.lng } : collectVisitInfo() });
  } catch {
    /* never in the way */
  }
}

/** Once per page load: counts the open, and again whenever the page comes back to the front after a while. */
export function startVisitTracking(): void {
  if (started || typeof document === 'undefined') return;
  started = true;
  void noteVisit(true);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void noteVisit(false); });
}
