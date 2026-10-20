import { supabase } from './supabase';
import { VISITOR_KEY, collectVisitInfo, newVisitorId } from '../utils/visitorInfo';

// Tells the server, quietly, that this device opened NOOB (the admin panel's Visitors page). Works without an account; once the person logs in it is told again so the
// visit is linked to them. It never blocks anything and never shows an error: a missed count is not worth disturbing a person for.
const MIN_GAP_MS = 10 * 60 * 1000;
let lastSent = 0;
let started = false;

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
    await supabase.rpc('record_visit', { p_visitor: id, p_info: collectVisitInfo() });
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
