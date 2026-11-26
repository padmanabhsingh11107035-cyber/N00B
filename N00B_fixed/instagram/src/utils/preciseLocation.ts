// A much better position than the internet address gives. A phone on mobile data often shows up as a city hundreds of km away (the carrier's gateway), so the admin
// panel said "Vadodara" for someone in Ajmer. When the person allows location (the phone's own permission), the device position is used instead, rounded to about 1 km, and
// turned into the nearest listed city with NOOB's own table (nothing is sent to any outside service). Without permission nothing changes: the old approximate place is used.

export interface PreciseFix { lat: number; lng: number; city: string; country: string }

const FIX_KEY = 'noob_gps_fix_v1';
const ASKED_KEY = 'noob_gps_asked_v1';
const FIX_TTL_MS = 30 * 60 * 1000;
const store = (): Storage | null => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };

async function permissionState(): Promise<'granted' | 'prompt' | 'denied'> {
  try {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return 'denied';
    const q = (navigator as any).permissions?.query;
    if (!q) return 'prompt';
    const s = await (navigator as any).permissions.query({ name: 'geolocation' });
    return s.state === 'granted' ? 'granted' : s.state === 'denied' ? 'denied' : 'prompt';
  } catch { return 'prompt'; }
}

/** The device's position and nearest city, or null (no permission, no signal, nothing listed nearby). `ask` lets the phone's own permission question appear, once per device. */
export async function preciseFix(ask = false): Promise<PreciseFix | null> {
  try {
    const st = store();
    try {
      const kept = JSON.parse(st?.getItem(FIX_KEY) || 'null');
      if (kept && Date.now() - kept.at < FIX_TTL_MS && typeof kept.fix?.lat === 'number') return kept.fix as PreciseFix;
    } catch { /* nothing kept */ }
    const state = await permissionState();
    if (state === 'denied') return null;
    if (state === 'prompt') {
      if (!ask) return null;
      if (st?.getItem(ASKED_KEY)) return null;   // asked before: the person decided
      try { st?.setItem(ASKED_KEY, String(Date.now())); } catch { /* storage blocked */ }
    }
    const pos = await new Promise<GeolocationPosition | null>((resolve) => {
      try { navigator.geolocation.getCurrentPosition((p) => resolve(p), () => resolve(null), { enableHighAccuracy: false, timeout: 12000, maximumAge: 10 * 60 * 1000 }); } catch { resolve(null); }
    });
    if (!pos) return null;
    const lat = Math.round(pos.coords.latitude * 100) / 100, lng = Math.round(pos.coords.longitude * 100) / 100;   // about 1 km
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
    const { nearestCity } = await import('./userLocations');
    const c = nearestCity(lat, lng, 60);
    const fix: PreciseFix = { lat, lng, city: c?.city || '', country: c?.country || '' };
    try { st?.setItem(FIX_KEY, JSON.stringify({ at: Date.now(), fix })); } catch { /* storage blocked */ }
    return fix;
  } catch { return null; }
}
