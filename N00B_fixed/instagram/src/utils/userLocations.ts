// The admin page "User's data": turns the approximate places the database gives (city / region / country, as text) into points on the world map, with no outside service.
// Order: city, then region, then the country's centre. A place that is in none of the lists is "unplaced" (never guessed). Pure functions, so every rule can be tested alone.
import { CITY_DATA, COUNTRY_DATA, REGION_DATA } from '../data/geoPlaces.ts';
import { WORLD_MAP_HEIGHT, WORLD_MAP_WIDTH } from '../data/worldMapPath.ts';

export interface PlaceText { city?: string | null; region?: string | null; country?: string | null }
export type PlaceLevel = 'city' | 'region' | 'country';
export interface LatLng { lat: number; lng: number }
export interface Resolved extends LatLng { level: PlaceLevel }

/** lower case, no accents, letters and digits only: "St. Louis" and "st louis" and "Saint Louis" (listed as an alternative) all meet in the table */
export function normName(s: string | null | undefined): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
}

const LINE = /^(.+?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)$/;
interface Tables { country: Map<string, LatLng>; countryByName: Map<string, string>; city: Map<string, LatLng>; region: Map<string, LatLng>; size: { countries: number; cities: number; regions: number } }

function parseNamed(text: string, into: Map<string, LatLng>): number {
  let cc = '';
  let n = 0;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('@')) { cc = line.slice(1).trim().toUpperCase(); continue; }
    const m = LINE.exec(line);
    if (!m || !cc) continue;
    const at = { lat: Number(m[2]), lng: Number(m[3]) };
    for (const alt of m[1].split('/')) {
      const k = normName(alt);
      if (k && !into.has(`${k}|${cc}`)) into.set(`${k}|${cc}`, at);
    }
    n++;
  }
  return n;
}

let cache: Tables | null = null;
export function tables(): Tables {
  if (cache) return cache;
  const country = new Map<string, LatLng>();
  const countryByName = new Map<string, string>();
  for (const raw of COUNTRY_DATA.split('\n')) {
    const m = /^([A-Z]{2})\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(.+)$/.exec(raw.trim());
    if (!m) continue;
    country.set(m[1], { lat: Number(m[2]), lng: Number(m[3]) });
    countryByName.set(normName(m[4]), m[1]);
  }
  const city = new Map<string, LatLng>();
  const region = new Map<string, LatLng>();
  const cities = parseNamed(CITY_DATA, city);
  const regions = parseNamed(REGION_DATA, region);
  cache = { country, countryByName, city, region, size: { countries: country.size, cities, regions } };
  return cache;
}

/** Names people and networks use for a country, as the two letters: "IN", "in", "India", "United States". Anything else is not a country (the network's "XX" and "T1" are not). */
export function countryCode(country: string | null | undefined): string | null {
  const t = tables();
  const raw = String(country ?? '').trim();
  if (!raw) return null;
  const up = raw.toUpperCase();
  if (up.length === 2 && t.country.has(up)) return up;
  if (up === 'UK') return 'GB';
  return t.countryByName.get(normName(raw)) ?? null;
}

export function resolvePlace(p: PlaceText | null | undefined): Resolved | null {
  if (!p) return null;
  const t = tables();
  const cc = countryCode(p.country);
  const city = normName(p.city), region = normName(p.region);
  if (cc) {
    if (city) { const h = t.city.get(`${city}|${cc}`) ?? t.region.get(`${city}|${cc}`); if (h) return { ...h, level: 'city' }; }
    if (region) { const h = t.region.get(`${region}|${cc}`) ?? t.city.get(`${region}|${cc}`); if (h) return { ...h, level: 'region' }; }
    const c = t.country.get(cc);
    return c ? { ...c, level: 'country' } : null;
  }
  if (String(p.country ?? "").trim()) return null;   // a country was given but is not one we know (the network says XX or T1 when it cannot tell): never guess from the city name
  // no country given: a city name that exists in exactly one country is still safe to use; an ambiguous one (San Jose, Hyderabad) is not guessed
  if (city) {
    const found = new Set<string>();
    for (const k of t.city.keys()) if (k.startsWith(`${city}|`)) found.add(k);
    if (found.size === 1) { const h = t.city.get([...found][0])!; return { ...h, level: 'city' }; }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------- scatter
/** a number in [0, 1) that is always the same for the same text */
export function hash01(text: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** how far (in degrees) a dot may move away from the exact point: a few km for a city, tens of km for a region, a couple of hundred km when only the country is known */
export const JITTER_DEGREES: Record<PlaceLevel, number> = { city: 0.05, region: 0.5, country: 1.6 };

export function jitter(at: Resolved, seed: string): LatLng {
  const max = JITTER_DEGREES[at.level];
  const angle = hash01(seed, 1) * Math.PI * 2;
  const r = Math.sqrt(hash01(seed, 2)) * max;
  const lat = Math.max(-85, Math.min(85, at.lat + Math.sin(angle) * r));
  const lng = at.lng + (Math.cos(angle) * r) / Math.max(0.2, Math.cos((at.lat * Math.PI) / 180));
  return { lat, lng: ((lng + 540) % 360) - 180 };
}

/** map units: see scripts/gen-world-map.mjs (equirectangular, 1000 units = 360 degrees, 84 N at the top) */
export function project(p: LatLng): { x: number; y: number } {
  return { x: ((p.lng + 180) * WORLD_MAP_WIDTH) / 360, y: ((84 - p.lat) * WORLD_MAP_WIDTH) / 360 };
}
export const MAP_W = WORLD_MAP_WIDTH;
export const MAP_H = WORLD_MAP_HEIGHT;

// ---------------------------------------------------------------------------------------------- the rows
export interface UserPlace { city: string | null; region: string | null; country: string | null; at?: string | null; source?: string | null }
export interface UserLocationRow { id: string; username: string | null; displayName: string | null; createdAt: string | null; signup: UserPlace | null; last: UserPlace | null }

export const placeLabel = (p: PlaceText | null | undefined): string => {
  if (!p) return 'unknown';
  const cc = countryCode(p.country) ?? (String(p.country ?? '').trim().toUpperCase() || '');
  const out = [p.city, p.region && !p.city ? p.region : null, cc].map((x) => String(x ?? '').trim()).filter(Boolean);
  return out.length ? out.join(', ') : 'unknown';
};

export type DotKind = 'signup' | 'last';
export interface Dot { key: string; kind: DotKind; row: UserLocationRow; level: PlaceLevel; x: number; y: number; label: string }

export function buildDots(rows: UserLocationRow[]): { dots: Dot[]; unplaced: { signup: number; last: number; users: number } } {
  const dots: Dot[] = [];
  let us = 0, ul = 0, uu = 0;
  for (const row of rows) {
    const s = resolvePlace(row.signup), l = resolvePlace(row.last);
    if (row.signup && !s) us++;
    if (row.last && !l) ul++;
    if (!s && !l) uu++;
    if (s) { const q = project(jitter(s, `${row.id}|s`)); dots.push({ key: `${row.id}|s`, kind: 'signup', row, level: s.level, x: q.x, y: q.y, label: placeLabel(row.signup) }); }
    if (l) { const q = project(jitter(l, `${row.id}|l`)); dots.push({ key: `${row.id}|l`, kind: 'last', row, level: l.level, x: q.x, y: q.y, label: placeLabel(row.last) }); }
  }
  return { dots, unplaced: { signup: us, last: ul, users: uu } };
}

// ---------------------------------------------------------------------------------------------- clusters
export interface Cluster { key: string; x: number; y: number; dots: Dot[] }
/** Dots that land in the same square of `cell` screen pixels become one cluster at their average place. `view` converts map units to screen pixels. */
export function clusterDots(dots: Dot[], view: { k: number; tx: number; ty: number }, cell: number): Cluster[] {
  const grid = new Map<string, Cluster>();
  for (const d of dots) {
    const sx = d.x * view.k + view.tx, sy = d.y * view.k + view.ty;
    const gx = Math.floor(sx / cell), gy = Math.floor(sy / cell);
    const key = `${gx}:${gy}`;
    const c = grid.get(key);
    if (c) { c.dots.push(d); c.x += sx; c.y += sy; } else grid.set(key, { key, x: sx, y: sy, dots: [d] });
  }
  const out: Cluster[] = [];
  for (const c of grid.values()) { c.x /= c.dots.length; c.y /= c.dots.length; out.push(c); }
  return out;
}

// ---------------------------------------------------------------------------------------------- words
/** "just now", "3m", "5h", "2d", "4mo", "1y": always short, never a date */
export function agoShort(iso: string | null | undefined, now = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return '?';
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 45) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 60) return `${d}d`;
  if (d < 730) return `${Math.floor(d / 30)}mo`;
  return `${Math.floor(d / 365)}y`;
}
export const dateOnly = (iso: string | null | undefined): string => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : '?');
