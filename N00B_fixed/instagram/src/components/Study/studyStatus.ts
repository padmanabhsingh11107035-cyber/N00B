import { useEffect, useState } from 'react';
import { studyApi } from '../../services/studyApi';

// Is NOOB STUDY open, coming soon, or off? The administrator decides (admin panel -> NOOB STUDY); anybody may ask, even before logging in. Asked at most once a minute.
export interface PublicStudyStatus { mode: 'off' | 'coming_soon' | 'on'; message: string; admissionsOpen: boolean; features: Record<string, boolean> }

let cache: { at: number; value: PublicStudyStatus } | null = null;
let inflight: Promise<PublicStudyStatus | null> | null = null;
const listeners = new Set<(s: PublicStudyStatus) => void>();

export function fetchStudyStatus(force = false): Promise<PublicStudyStatus | null> {
  if (!force && cache && Date.now() - cache.at < 60_000) return Promise.resolve(cache.value);
  if (inflight) return inflight;
  inflight = studyApi.publicStatus().then((r) => {
    inflight = null;
    if (!r.ok) return cache?.value ?? null;
    cache = { at: Date.now(), value: r.data };
    listeners.forEach((l) => l(r.data));
    return r.data;
  }).catch(() => { inflight = null; return cache?.value ?? null; });
  return inflight;
}

export function useStudyStatus(): PublicStudyStatus | null {
  const [s, setS] = useState<PublicStudyStatus | null>(cache?.value ?? null);
  useEffect(() => {
    let alive = true;
    const l = (v: PublicStudyStatus) => { if (alive) setS(v); };
    listeners.add(l);
    void fetchStudyStatus().then((v) => { if (alive && v) setS(v); });
    return () => { alive = false; listeners.delete(l); };
  }, []);
  return s;
}
