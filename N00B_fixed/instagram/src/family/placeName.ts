// The name of the place under a pin ("Bandra West, Mumbai"), looked up from the open map service (OpenStreetMap Nominatim) the first time a spot is seen.
// Only the place rounded to about 110 m is sent, nothing else (no name, no room); answers are kept on this phone so a spot is asked for once.
const KEY = 'noob_placenames_v1';
const mem = new Map<string, string>();
const waiting = new Map<string, Promise<string>>();
let chain: Promise<unknown> = Promise.resolve();
let loaded = false;

export const spotKey = (lat: number, lng: number): string => `${lat.toFixed(3)},${lng.toFixed(3)}`;

function load(): void {
  if (loaded) return; loaded = true;
  try { const o = JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, string>; for (const k of Object.keys(o)) mem.set(k, o[k]); } catch { /* none kept */ }
}
function save(): void {
  try { const e = Array.from(mem.entries()).slice(-150); localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(e))); } catch { /* storage blocked */ }
}

/** the short name from an OpenStreetMap address: the small area (or road) and the town */
export function shortName(a: Record<string, string> | undefined): string {
  if (!a) return '';
  const small = a.amenity || a.building || a.road || a.neighbourhood || a.suburb || a.quarter || a.hamlet || a.village || '';
  const area = a.suburb || a.neighbourhood || a.quarter || '';
  const town = a.city || a.town || a.village || a.municipality || a.county || a.state_district || a.state || '';
  const first = small && small !== town ? small : area;
  return [first, town].filter((x, i, arr) => x && arr.indexOf(x) === i).join(', ');
}

export function cachedPlace(lat: number, lng: number): string { load(); return mem.get(spotKey(lat, lng)) || ''; }

/** the place name of a spot ('' when it cannot be found); one lookup per second at most, one per spot */
export function placeName(lat: number, lng: number): Promise<string> {
  load();
  const k = spotKey(lat, lng);
  const hit = mem.get(k); if (hit) return Promise.resolve(hit);
  const w = waiting.get(k); if (w) return w;
  const [rl, rg] = k.split(',');
  const p = (chain = chain.then(async () => {
    try {
      const lang = (typeof navigator !== 'undefined' && navigator.language) || 'en';
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&addressdetails=1&lat=${rl}&lon=${rg}&accept-language=${encodeURIComponent(lang)}`, { headers: { Accept: 'application/json' } });
      if (!r.ok) return '';
      const j = (await r.json()) as { address?: Record<string, string>; display_name?: string };
      const name = shortName(j.address) || String(j.display_name || '').split(',').slice(0, 2).join(',').trim();
      if (name) { mem.set(k, name); save(); }
      return name;
    } catch { return ''; }
    finally { await new Promise((res) => setTimeout(res, 1100)); }
  }).finally(() => { waiting.delete(k); })) as Promise<string>;
  waiting.set(k, p);
  return p;
}
