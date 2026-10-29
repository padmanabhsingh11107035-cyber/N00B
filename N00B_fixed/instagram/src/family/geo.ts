// NOOB Family Map: the small pieces of arithmetic and text that need no screen (distance, "2 min ago", join codes, when a phone should send its place, the shape of a pin).
// Pure functions only, so they are tested on their own (scripts/supabase/test-family.mjs).

export interface LatLng { lat: number; lng: number }
/** one reading of the phone's place: accuracy in metres, heading in degrees, speed in metres per second, `at` in milliseconds */
export interface Fix extends LatLng { accuracy: number | null; heading: number | null; speed: number | null; at: number }

const EARTH = 6371008.8; // mean radius of the earth in metres
const rad = (d: number) => (d * Math.PI) / 180;

/** straight-line distance over the ground in metres (haversine) */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(m: number): string {
  if (!Number.isFinite(m) || m < 0) return '';
  if (m < 30) return 'Here';
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  if (m < 10000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m / 1000).toLocaleString('en-US')} km`;
}

/** live = news in the last 90 seconds, recent = in the last 15 minutes, old = older (the server drops a place after 24 hours), none = no place at all */
export type Freshness = 'live' | 'recent' | 'old' | 'none';
export function freshness(updatedAt: string | null | undefined, nowMs: number): Freshness {
  if (!updatedAt) return 'none';
  const t = Date.parse(updatedAt);
  if (!Number.isFinite(t)) return 'none';
  const age = Math.max(0, nowMs - t);
  return age <= 90_000 ? 'live' : age <= 900_000 ? 'recent' : 'old';
}

export function agoText(updatedAt: string | null | undefined, nowMs: number): string {
  const t = updatedAt ? Date.parse(updatedAt) : NaN;
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((nowMs - t) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return 'yesterday';
}

/** "Moving 24 km/h" only when the phone really moves (a walk is about 5 km/h; standing still gives noise below that) */
export function speedText(speed: number | null | undefined): string {
  if (speed == null || !Number.isFinite(speed) || speed < 1.5) return '';
  return `Moving ${Math.round(speed * 3.6)} km/h`;
}

// ---- the join code: 8 letters and digits without the look-alikes I, O, 0, 1 (the same alphabet as the database)
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const normaliseCode = (input: string): string => Array.from(String(input || '').toUpperCase()).filter((c) => CODE_ALPHABET.includes(c)).join('').slice(0, 8);
export const isCode = (code: string): boolean => /^[A-HJ-NP-Z2-9]{8}$/.test(code);
/** ABCD2345 -> ABCD-2345 (also while it is being typed) */
export const formatCode = (code: string): string => { const c = normaliseCode(code); return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c; };
/** the invitation link: the code sits after the # so it is never sent to any server or kept in a log */
export const inviteLink = (origin: string, code: string): string => `${origin.replace(/\/$/, '')}/family#join=${normaliseCode(code)}`;
export const inviteText = (roomName: string, code: string, origin: string): string =>
  `Join "${roomName}" on NOOB Family Map and see each other live on the map.\nCode: ${formatCode(code)}\n${inviteLink(origin, code)}`;
/** "#join=ABCD-2345" -> "ABCD2345" ('' when there is no valid code) */
export function codeFromHash(hash: string): string {
  const m = /[#&]join=([^&]*)/.exec(String(hash || ''));
  const c = m ? normaliseCode(decodeURIComponent(m[1])) : '';
  return isCode(c) ? c : '';
}

// ---- names and colours
export const firstName = (full: string): string => String(full || '').trim().split(/\s+/)[0] || '';
export const initialOf = (name: string): string => (Array.from(firstName(name))[0] || '?').toUpperCase();
/** a steady colour for a person who has no photo (the same person always gets the same one) */
export function pinHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

// ---- when should the phone send its place? The first time; when it moved at least 8 m and 4 s passed; or as a heartbeat every 20 s so a person who stands still stays "live".
export function shouldPush(prev: { lat: number; lng: number; at: number } | null, next: Fix, nowMs: number): boolean {
  if (!prev) return true;
  const since = nowMs - prev.at;
  if (since >= 20_000) return true;
  return since >= 4_000 && distanceM(prev, next) >= 8;
}

// ---- map helpers
export function boundsOf(points: LatLng[]): [[number, number], [number, number]] | null {
  if (!points.length) return null;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const p of points) { w = Math.min(w, p.lng); e = Math.max(e, p.lng); s = Math.min(s, p.lat); n = Math.max(n, p.lat); }
  return [[w, s], [e, n]];
}
/** a point on the way from a to b (t from 0 to 1), going the short way round across the date line */
export function lerpLngLat(a: LatLng, b: LatLng, t: number): LatLng {
  let dLng = b.lng - a.lng;
  if (dLng > 180) dLng -= 360; else if (dLng < -180) dLng += 360;
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + dLng * t };
}
export const easeOut = (t: number): number => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
