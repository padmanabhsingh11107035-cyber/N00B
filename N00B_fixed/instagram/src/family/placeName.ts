// The name and full address of the place under a pin ("Bandra West, Mumbai" short; building, road, area, town, district, state, postcode, country in full), looked up from the open map
// service (OpenStreetMap Nominatim) the first time a spot is seen. Only the spot rounded to about 11 m is sent, nothing else (no name, no room); answers are kept on this phone, and a spot
// within 25 m of one already known uses that answer, so a person walking about does not cause a lookup at every step.
const KEY = 'noob_placenames_v2';
export interface PlaceInfo { short: string; full: string; lines: string[] }
const mem = new Map<string, PlaceInfo>();
const waiting = new Map<string, Promise<PlaceInfo | null>>();
let chain: Promise<unknown> = Promise.resolve();
let loaded = false;

/** the spot, rounded to 4 decimals (about 11 m) */
export const spotKey = (lat: number, lng: number): string => `${lat.toFixed(4)},${lng.toFixed(4)}`;

function load(): void {
  if (loaded) return; loaded = true;
  try { const o = JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, PlaceInfo>; for (const k of Object.keys(o)) if (o[k] && typeof o[k].short === 'string') mem.set(k, o[k]); } catch { /* none kept */ }
}
function save(): void {
  try { const e = Array.from(mem.entries()).slice(-200); localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(e))); } catch { /* storage blocked */ }
}

const clean = (v: unknown): string => String(v ?? '').replace(/[<>]/g, '').trim();
const uniq = (parts: string[]): string[] => parts.filter((x, i, arr) => x && arr.indexOf(x) === i);

/** the short name from an OpenStreetMap address: the small area (or road) and the town */
export function shortName(a: Record<string, string> | undefined): string {
  if (!a) return '';
  const small = a.amenity || a.building || a.road || a.neighbourhood || a.suburb || a.quarter || a.hamlet || a.village || '';
  const area = a.suburb || a.neighbourhood || a.quarter || '';
  const town = a.city || a.town || a.village || a.municipality || a.county || a.state_district || a.state || '';
  const first = small && small !== town ? small : area;
  return uniq([first, town]).join(', ');
}

/** every detail of an OpenStreetMap address, one line each: the place or building, the house number and road, the area, the town, the district, the state and postcode, the country */
export function fullLines(a: Record<string, string> | undefined): string[] {
  if (!a) return [];
  const poi = clean(a.amenity || a.shop || a.tourism || a.leisure || a.office || a.railway || a.aeroway || (a.building && a.building !== 'yes' ? a.building : ''));
  const road = [clean(a.house_number), clean(a.road || a.pedestrian || a.footway || a.path)].filter(Boolean).join(' ');
  const area = uniq([clean(a.neighbourhood), clean(a.suburb || a.quarter || a.hamlet), clean(a.city_district)]).join(', ');
  const town = clean(a.city || a.town || a.village || a.municipality);
  const district = uniq([clean(a.county), clean(a.state_district)]).filter((x) => x !== town).join(', ');
  const state = [clean(a.state), clean(a.postcode)].filter(Boolean).join(' - ');
  return uniq([poi, road, area, town, district, state, clean(a.country)]);
}

/** the answer for a spot already known: the same spot, or one within 25 m */
export function cachedInfo(lat: number, lng: number): PlaceInfo | null {
  load();
  const hit = mem.get(spotKey(lat, lng)); if (hit) return hit;
  for (const [k, v] of mem) {
    const [a, b] = k.split(',').map(Number);
    const dy = (a - lat) * 111_320, dx = (b - lng) * 111_320 * Math.cos((lat * Math.PI) / 180);
    if (Math.hypot(dx, dy) <= 25) return v;
  }
  return null;
}
export const cachedPlace = (lat: number, lng: number): string => cachedInfo(lat, lng)?.short || '';

/** the name and full address of a spot (null when it cannot be found); one lookup per second at most, one per spot */
export function placeInfo(lat: number, lng: number): Promise<PlaceInfo | null> {
  const known = cachedInfo(lat, lng); if (known) return Promise.resolve(known);
  const k = spotKey(lat, lng);
  const w = waiting.get(k); if (w) return w;
  const [rl, rg] = k.split(',');
  const p = (chain = chain.then(async (): Promise<PlaceInfo | null> => {
    try {
      const lang = (typeof navigator !== 'undefined' && navigator.language) || 'en';
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=${rl}&lon=${rg}&accept-language=${encodeURIComponent(lang)}`, { headers: { Accept: 'application/json' } });
      if (!r.ok) return null;
      const j = (await r.json()) as { address?: Record<string, string>; display_name?: string };
      const lines = fullLines(j.address);
      const short = shortName(j.address) || clean(j.display_name).split(',').slice(0, 2).join(',').trim();
      if (!short && !lines.length) return null;
      const info: PlaceInfo = { short, full: lines.length ? lines.join(', ') : clean(j.display_name), lines };
      mem.set(k, info); save();
      return info;
    } catch { return null; }
    finally { await new Promise((res) => setTimeout(res, 1100)); }
  }).finally(() => { waiting.delete(k); })) as Promise<PlaceInfo | null>;
  waiting.set(k, p);
  return p;
}
/** the short name only (kept for older callers) */
export const placeName = (lat: number, lng: number): Promise<string> => placeInfo(lat, lng).then((i) => i?.short || '');
