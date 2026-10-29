import { distanceM, type LatLng } from './geo.ts';

// NOOB Family Map, the DAY REPORT: where a person went today (places they stayed at, and the trips between them), worked out ON THE PHONE from its own places, locked (end-to-end encrypted)
// before it leaves the phone, and shown to the people in the room. A day is the calendar day in the PERSON'S time zone: it starts at 00:00 and at 24:00 the whole report is deleted and a new
// one begins (the phone forgets it, the database refuses and removes anything of an older day). No browser and no network in this file, so it is tested on its own.
//
// How a stay and a trip are told apart (the way Google's Timeline does it):
//   * a STAY: the person stayed within about 75 m of one spot for at least 5 minutes (a bad GPS fix may stretch that a little, a short wander away that comes back is ignored);
//   * a TRIP: everything between two stays (a red light or a 2 minute stop inside a trip does not make a stay); it keeps a thin route line, its length and how it was travelled
//     (on foot / by bike / by car or bus, from its speed);
//   * a GAP: no news from the phone for a while (the app was closed, no signal): shown as "no location", never guessed.

export type Mode = 'w' | 'c' | 'd';
export interface Stay { k: 's'; a: number; b: number; lat: number; lng: number; r: number; open?: true }
export interface Trip { k: 't'; a: number; b: number; d: number; m: Mode; path: [number, number][]; open?: true }
export type Seg = Stay | Trip;

export const P = {
  STAY_R: 75, STAY_MIN_MS: 5 * 60000, EXIT_MS: 100000, FAR_M: 250, MAX_ACC: 150, SPIKE_MPS: 70, SPIKE_M: 300,
  GAP_MS: 5 * 60000, RESTART_GAP_MS: 10 * 60000, MIN_TRIP_M: 100, MIN_TRIP_MS: 60000, MERGE_M: 150,
  ARRIVE_R: 45, DEPART_R: 40, KEEP_M: 10, KEEP_MS: 45000, SIMPLIFY_M: 12, MAX_PATH: 300, PLACE_M: 120, SHOW_GAP_MS: 3 * 60000, FRESH_MS: 10 * 60000
};

// ------------------------------------------------------------------------------------------------ days and time zones
const formats = new Map<string, Intl.DateTimeFormat>();
interface Wall { y: number; mo: number; d: number; h: number; mi: number; s: number }
function wall(ms: number, tz: string): Wall {
  let f = formats.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    formats.set(tz, f);
  }
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(new Date(ms))) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return { y: o.year, mo: o.month, d: o.day, h: o.hour % 24, mi: o.minute, s: o.second };
}
const pad = (n: number): string => (n < 10 ? '0' : '') + n;
export const validZone = (tz: string): boolean => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return typeof tz === 'string' && tz.length > 0 && tz.length <= 64; } catch { return false; } };
export const localZone = (): string => { try { const z = Intl.DateTimeFormat().resolvedOptions().timeZone; return z && validZone(z) ? z : 'UTC'; } catch { return 'UTC'; } };
/** "2026-10-29": the calendar day `ms` falls on in the time zone `tz` */
export function dayKey(ms: number, tz: string): string { const w = wall(ms, tz); return `${w.y}-${pad(w.mo)}-${pad(w.d)}`; }
function offsetMs(ms: number, tz: string): number { const w = wall(ms, tz); return Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000; }
/** the moment the day of `ms` began: 00:00 on the clocks of `tz` (right on days when the clocks change, too) */
export function startOfDay(ms: number, tz: string): number {
  const key = dayKey(ms, tz), w = wall(ms, tz);
  const midnight = Date.UTC(w.y, w.mo - 1, w.d);
  let guess = midnight - offsetMs(ms, tz);
  guess = midnight - offsetMs(guess, tz);
  // a zone whose clocks skip midnight starts that day at 01:00: walk forward to the first moment that is on the day
  for (let n = 0; dayKey(guess, tz) !== key && n < 12; n++) guess += 15 * 60000;
  return guess;
}
/** the moment the next day begins (this day ends) */
export const endOfDay = (ms: number, tz: string): number => startOfDay(startOfDay(ms, tz) + 36 * 3600000, tz);
export function dayStartFromKey(day: string, tz: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m || !validZone(tz)) return null;
  const noon = Date.UTC(+m[1], +m[2] - 1, +m[3], 12);
  return startOfDay(noon - offsetMs(noon, tz), tz);
}

// ------------------------------------------------------------------------------------------------ geometry
const r5 = (n: number): number => Math.round(n * 1e5) / 1e5;
export function pathLength(pts: LatLng[]): number { let s = 0; for (let i = 1; i < pts.length; i++) s += distanceM(pts[i - 1], pts[i]); return s; }
/** Douglas-Peucker: the fewest points that keep the line within `eps` metres of the original */
export function simplify(pts: LatLng[], eps: number): LatLng[] {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const k = Math.cos((pts[0].lat * Math.PI) / 180) * 111320;
  const xy = pts.map((p) => ({ x: (p.lng - pts[0].lng) * k, y: (p.lat - pts[0].lat) * 111320 }));
  const keep = new Uint8Array(n);
  keep[0] = 1; keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [i, j] = stack.pop() as [number, number];
    const ax = xy[i].x, ay = xy[i].y, dx = xy[j].x - ax, dy = xy[j].y - ay, len2 = dx * dx + dy * dy;
    let best = -1, bestD = eps;
    for (let m = i + 1; m < j; m++) {
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((xy[m].x - ax) * dx + (xy[m].y - ay) * dy) / len2));
      const d = Math.hypot(xy[m].x - (ax + t * dx), xy[m].y - (ay + t * dy));
      if (d > bestD) { bestD = d; best = m; }
    }
    if (best > 0) { keep[best] = 1; stack.push([i, best], [best, j]); }
  }
  return pts.filter((_, i) => keep[i] === 1);
}
/** a route line for sending: simplified until it has at most `max` points, coordinates to about 1 m */
export function simplifyPath(points: LatLng[], max = P.MAX_PATH): [number, number][] {
  let eps = P.SIMPLIFY_M, out = simplify(points, eps);
  while (out.length > max && eps < 20000) { eps *= 1.6; out = simplify(points, eps); }
  return out.map((p) => [r5(p.lat), r5(p.lng)] as [number, number]);
}
/** on foot / by bike / by car or bus, from the average and the top speed (metres per second) */
export function modeOf(distM: number, durMs: number, maxMps: number): Mode {
  const avg = distM / Math.max(1, durMs / 1000);
  if (avg < 2.4 && maxMps < 5) return 'w';
  if (avg < 5.5 && maxMps < 9) return 'c';
  return 'd';
}

// ------------------------------------------------------------------------------------------------ the engine on the phone
interface Pt { lat: number; lng: number; t: number; acc: number | null; spd: number | null }
interface Cluster { lat: number; lng: number; n: number; a: number; last: number; pts: Pt[] }
interface OpenStay { kind: 'stay'; a: number; last: number; n: number; lat: number; lng: number; rs: number; tail: Pt[]; conf: boolean; out: Pt[] }
interface OpenTrip { kind: 'trip'; a: number; path: Pt[]; max: number; keep: number; cand: Cluster | null }
type Open = OpenStay | OpenTrip;
export interface EngineState { v: 1; day: string; tz: string; segs: Seg[]; open: Open | null; last: Pt | null; savedAt: number }
export interface Sample { lat: number; lng: number; at: number; accuracy?: number | null; speed?: number | null }
export interface EngineOptions {
  tz: string;
  /** true while a service keeps the phone's location running even when the app is closed (the Android app): then no news from a person who has not moved means "still there" */
  presence?: () => boolean;
  restore?: EngineState | null;
  /** the time of the restore, to tell how long the app was not running */
  now?: number;
}
export interface Engine {
  add(f: Sample): void;
  tick(nowMs: number): void;
  /** the finished stays and trips of the day, then the one in progress (marked open) when it is already worth showing */
  snapshot(): Seg[];
  closedCount(): number;
  day(): string;
  tz(): string;
  state(nowMs: number): EngineState;
}

export function createEngine(opts: EngineOptions): Engine {
  const tz = opts.tz;
  const presence = opts.presence ?? (() => false);
  let day = '';
  let segs: Seg[] = [];
  let open: Open | null = null;
  let last: Pt | null = null;
  let held: Pt | null = null;
  let resumeGap = false;
  const rs = opts.restore;
  if (rs && rs.v === 1 && rs.tz === tz && typeof rs.day === 'string' && Array.isArray(rs.segs)) {
    day = rs.day; segs = rs.segs; open = rs.open ?? null; last = rs.last ?? null;
    resumeGap = (opts.now ?? rs.savedAt) - rs.savedAt > P.RESTART_GAP_MS;
  }
  const presenceOk = (): boolean => presence() && !resumeGap;
  const inside = (c: LatLng, p: Pt): boolean => distanceM(c, p) <= P.STAY_R + 0.6 * Math.min(p.acc ?? 0, 100);
  const isPlace = (s: OpenStay): boolean => s.conf || s.last - s.a >= P.STAY_MIN_MS;
  const radiusOf = (s: OpenStay): number => s.tail.reduce((m, q) => Math.max(m, distanceM(s, q)), s.rs);
  const newStay = (p: Pt): OpenStay => ({ kind: 'stay', a: p.t, last: p.t, n: 1, lat: p.lat, lng: p.lng, rs: 0, tail: [p], conf: false, out: [] });
  const stayOf = (s: OpenStay): Stay => ({ k: 's', a: s.a, b: Math.max(s.last, s.a + 1000), lat: r5(s.lat), lng: r5(s.lng), r: Math.round(radiusOf(s)) });
  const meanOf = (pts: Pt[]): LatLng => ({ lat: pts.reduce((x, q) => x + q.lat, 0) / pts.length, lng: pts.reduce((x, q) => x + q.lng, 0) / pts.length });

  // a new day starts at 00:00: what happened before is gone from here; a stay that goes on across midnight goes on in the new day from 00:00
  const ensureDay = (t: number): void => {
    const k = dayKey(t, tz);
    if (k === day) return;
    const o = open, was = day;
    day = k; segs = []; held = null; open = null;
    if (!was || !o || !last) return;
    const start = startOfDay(t, tz), fresh = t - last.t <= P.GAP_MS;
    if (o.kind === 'stay' && (fresh || presenceOk())) {
      open = { kind: 'stay', a: start, last: start, n: o.n, lat: o.lat, lng: o.lng, rs: radiusOf(o), tail: [], conf: o.conf || isPlace(o), out: [] };
    } else if (o.kind === 'trip' && fresh) {
      const q = o.path[o.path.length - 1];
      open = { kind: 'trip', a: start, path: [{ ...q, t: Math.max(q.t, start) }], max: 0, keep: o.keep, cand: null };
    }
  };

  const finishTrip = (tr: OpenTrip, endT: number, arrival: Pt | null): Trip | null => {
    const pts = tr.path.filter((q) => q.t <= endT);
    if (arrival && (!pts.length || pts[pts.length - 1].t < arrival.t)) pts.push(arrival);
    if (pts.length < 2) return null;
    const dist = pathLength(pts), a = tr.a, b = Math.max(endT, pts[pts.length - 1].t);
    if (b - a < P.MIN_TRIP_MS || dist < P.MIN_TRIP_M) return null;
    return { k: 't', a, b, d: Math.round(dist), m: modeOf(dist, b - a, tr.max), path: simplifyPath(pts) };
  };

  // the person has been in one spot long enough: the trip ends where it began and a stay starts. The stay began when the person was last further than 45 m from where they ended up
  // (a slow walker's cluster begins on the way: without this the trip would be cut short and the stay would start too early).
  const arrive = (tr: OpenTrip, c: Cluster): void => {
    let use = c.pts, mid = meanOf(use);
    for (let pass = 0; pass < 2 && use.length > 1; pass++) {
      mid = meanOf(use);
      let i = use.length - 1;
      while (i > 0 && distanceM(mid, use[i - 1]) <= P.ARRIVE_R + 0.3 * Math.min(use[i - 1].acc ?? 0, 100)) i--;
      if (i === 0) break;
      use = use.slice(i);
    }
    mid = meanOf(use);
    const a = use[0].t;
    const stay: OpenStay = { kind: 'stay', a, last: Math.max(c.last, use[use.length - 1].t), n: use.length, lat: mid.lat, lng: mid.lng, rs: use.slice(0, -20).reduce((m, q) => Math.max(m, distanceM(mid, q)), 0), tail: use.slice(-20), conf: true, out: [] };
    const trip = finishTrip(tr, a, { lat: mid.lat, lng: mid.lng, t: a, acc: null, spd: null });
    const prevSeg = segs[segs.length - 1];
    if (trip) segs.push(trip);
    else if (prevSeg && prevSeg.k === 's' && distanceM(prevSeg, stay) <= P.MERGE_M) {
      // a tiny movement between two stays that are the same place: one stay
      segs.pop();
      stay.rs = Math.max(prevSeg.r, radiusOf(stay), distanceM(prevSeg, stay));
      stay.a = prevSeg.a; stay.lat = prevSeg.lat; stay.lng = prevSeg.lng;
    } else if (!prevSeg) stay.a = Math.min(stay.a, tr.a);
    open = stay;
  };

  const tripStep = (tr: OpenTrip, p: Pt, prev: Pt | null): void => {
    const kept = tr.path[tr.path.length - 1];
    if (prev) {
      const dt = (p.t - prev.t) / 1000;
      const v = p.spd ?? (dt > 0 ? distanceM(prev, p) / dt : 0);
      if (v > tr.max && v < P.SPIKE_MPS) tr.max = v;
    }
    if (distanceM(kept, p) >= tr.keep || p.t - kept.t >= P.KEEP_MS) {
      tr.path.push(p);
      if (tr.path.length > 900) { tr.path = tr.path.filter((_, i, all) => i % 2 === 0 || i === all.length - 1); tr.keep *= 2; }
    }
    const c = tr.cand;
    if (c && inside(c, p)) {
      c.n++; c.lat += (p.lat - c.lat) / c.n; c.lng += (p.lng - c.lng) / c.n; c.last = p.t; c.pts.push(p);
      if (c.pts.length > 150) c.pts = c.pts.filter((_, i, all) => i % 2 === 0 || i === all.length - 1);
    } else tr.cand = { lat: p.lat, lng: p.lng, n: 1, a: p.t, last: p.t, pts: [p] };
    const cand = tr.cand as Cluster;
    if (cand.last - cand.a >= P.STAY_MIN_MS) arrive(tr, cand);
  };

  const dispatch = (p: Pt, prev: Pt | null): void => {
    const o = open;
    if (!o) open = newStay(p);
    else if (o.kind === 'stay') stayStep(o, p);
    else tripStep(o, p, prev);
  };

  // the person has left: the stay ended when they were last within 40 m of its middle (the points on the way out, up to 75 m, belong to the trip)
  const leaveStay = (s: OpenStay): void => {
    const place = isPlace(s);
    let startT = s.a, onTheWay: Pt[] = [];
    if (place) {
      let k = s.tail.length - 1;
      while (k >= 0 && distanceM(s, s.tail[k]) > P.DEPART_R + 0.3 * Math.min(s.tail[k].acc ?? 0, 100)) k--;
      if (k >= 0) { onTheWay = s.tail.slice(k + 1); s.last = s.tail[k].t; s.tail = s.tail.slice(0, k + 1); }
      startT = s.last;
      segs.push(stayOf(s));
    }
    const from: Pt = { lat: s.lat, lng: s.lng, t: startT, acc: null, spd: null };
    open = { kind: 'trip', a: startT, path: [from], max: 0, keep: P.KEEP_M, cand: null };
    let prev: Pt = from;
    for (const q of [...onTheWay, ...s.out]) { dispatch(q, prev); prev = q; }
  };

  const stayStep = (s: OpenStay, p: Pt): void => {
    if (inside(s, p)) {
      s.out = []; // a short wander away that came back was only jitter
      s.n++; s.lat += (p.lat - s.lat) / s.n; s.lng += (p.lng - s.lng) / s.n;
      s.tail.push(p);
      if (s.tail.length > 20) { const gone = s.tail.shift() as Pt; s.rs = Math.max(s.rs, distanceM(s, gone)); }
      s.last = p.t;
      if (!s.conf && s.last - s.a >= P.STAY_MIN_MS) s.conf = true;
      return;
    }
    s.out.push(p);
    if (p.t - s.out[0].t >= P.EXIT_MS || distanceM(s, p) >= P.FAR_M) leaveStay(s);
  };

  // no news for a while: the open stay / trip ends at the last thing known, the new news starts fresh (the time between is a gap)
  const breakAt = (): void => {
    const o = open;
    open = null;
    if (!o || !last) return;
    if (o.kind === 'stay') { if (isPlace(o)) segs.push(stayOf(o)); } else { const t = finishTrip(o, last.t, null); if (t) segs.push(t); }
  };

  const step = (p: Pt): void => {
    if (last && p.t - last.t > P.GAP_MS) {
      let vouched = false;
      const o = open;
      if (o && presenceOk()) {
        if (o.kind === 'stay' && inside(o, p)) vouched = true;
        else if (o.kind === 'trip' && o.cand && inside(o.cand, p)) { o.cand.last = Math.max(o.cand.last, last.t); arrive(o, o.cand); vouched = true; }
      }
      if (!vouched) breakAt();
    }
    resumeGap = false;
    dispatch(p, last);
    last = p;
  };

  const jumpy = (a: Pt, b: Pt): boolean => { const dt = (b.t - a.t) / 1000, d = distanceM(a, b); return dt > 0 && dt < 120 && d > P.SPIKE_M && d / dt > P.SPIKE_MPS; };

  return {
    add(f) {
      if (!Number.isFinite(f.lat) || !Number.isFinite(f.lng) || !Number.isFinite(f.at) || Math.abs(f.lat) > 90 || Math.abs(f.lng) > 180) return;
      const t = Math.round(f.at);
      if (last && t <= last.t) return; // old or repeated
      ensureDay(t);
      const acc = f.accuracy != null && Number.isFinite(f.accuracy) ? f.accuracy : null;
      if (acc != null && acc > P.MAX_ACC) return; // too vague to say anything from
      const p: Pt = { lat: f.lat, lng: f.lng, t, acc, spd: f.speed != null && Number.isFinite(f.speed) && f.speed >= 0 ? f.speed : null };
      // one fix that jumps somewhere impossible is a GPS spike: believed only if the next fix agrees with it
      if (held) {
        const h = held;
        held = null;
        if (distanceM(h, p) <= 150) { step(h); step(p); return; }
      }
      if (last && jumpy(last, p)) { held = p; return; }
      step(p);
    },
    tick(nowMs) {
      if (!day) return;
      ensureDay(nowMs);
      const o = open;
      if (!o || !presenceOk()) return;
      if (o.kind === 'stay') { if (nowMs > o.last) { o.last = nowMs; if (!o.conf && o.last - o.a >= P.STAY_MIN_MS) o.conf = true; } }
      else if (o.cand && o.cand.n >= 3 && nowMs - o.cand.a >= P.STAY_MIN_MS) { o.cand.last = nowMs; arrive(o, o.cand); }
    },
    snapshot() {
      const out: Seg[] = segs.slice(), o = open;
      if (o && o.kind === 'stay' && isPlace(o)) out.push({ ...stayOf(o), open: true });
      else if (o && o.kind === 'trip' && last && o.path.length >= 2) {
        const dist = pathLength(o.path), b = last.t;
        if (b - o.a >= P.MIN_TRIP_MS && dist >= P.MIN_TRIP_M) out.push({ k: 't', a: o.a, b, d: Math.round(dist), m: modeOf(dist, b - o.a, o.max), path: simplifyPath(o.path), open: true });
      }
      return out;
    },
    closedCount: () => segs.length,
    day: () => day,
    tz: () => tz,
    state: (nowMs) => ({ v: 1, day, tz, segs, open, last, savedAt: nowMs })
  };
}

// ------------------------------------------------------------------------------------------------ sending (locked before it leaves the phone) and reading back
/** the number of the stay / trip inside the day: the minute it began (a stay can not begin in the same minute as the next one: they are at least a minute long) */
export const seqOf = (s: Seg, dayStart: number): number => Math.max(0, Math.floor((s.a - dayStart) / 60000));

export function toWire(s: Seg): Record<string, unknown> {
  const a = Math.round(s.a / 1000), b = Math.round(s.b / 1000);
  return s.k === 's'
    ? { v: 1, k: 's', a, b, la: s.lat, ln: s.lng, r: s.r, ...(s.open ? { o: 1 } : {}) }
    : { v: 1, k: 't', a, b, d: s.d, m: s.m, p: s.path, ...(s.open ? { o: 1 } : {}) };
}
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const okPoint = (la: unknown, ln: unknown): boolean => num(la) && num(ln) && Math.abs(la) <= 90 && Math.abs(ln) <= 180;
/** what came out of a lock is checked again before it is believed: any odd shape is dropped, times are held inside the day */
export function fromWire(j: any, start: number, end: number): Seg | null {
  if (!j || typeof j !== 'object' || j.v !== 1 || !num(j.a) || !num(j.b)) return null;
  const a = Math.max(start, j.a * 1000), b = Math.min(end, j.b * 1000);
  if (!(b > a)) return null;
  const open = j.o === 1 ? ({ open: true } as const) : {};
  if (j.k === 's') {
    if (!okPoint(j.la, j.ln) || !num(j.r) || j.r < 0 || j.r > 5000) return null;
    return { k: 's', a, b, lat: j.la, lng: j.ln, r: Math.round(j.r), ...open };
  }
  if (j.k === 't') {
    if (!num(j.d) || j.d < 0 || j.d > 3e6 || !(j.m === 'w' || j.m === 'c' || j.m === 'd') || !Array.isArray(j.p) || j.p.length < 2 || j.p.length > 400) return null;
    const path: [number, number][] = [];
    for (const q of j.p) { if (!Array.isArray(q) || !okPoint(q[0], q[1])) return null; path.push([q[0], q[1]]); }
    return { k: 't', a, b, d: Math.round(j.d), m: j.m, path, ...open };
  }
  return null;
}
/** only what happened since `since` (the moment this room got the report): a stay is cut to start then, a trip that began earlier is left out */
export function clipSince(s: Seg, since: number): Seg | null {
  if (s.b <= since) return null;
  if (s.a >= since) return s;
  return s.k === 's' ? { ...s, a: since } : null;
}

// ------------------------------------------------------------------------------------------------ the day as the people in the room see it
export interface DayItem {
  id: string; kind: 'stay' | 'trip' | 'gap'; a: number; b: number; ongoing: boolean;
  lat?: number; lng?: number; r?: number; place?: number;
  d?: number; m?: Mode; path?: LatLng[];
}
export interface DayStats { distanceM: number; movingMs: number; places: number; visits: number }
export interface DayView { day: string; tz: string; start: number; end: number; now: number; items: DayItem[]; stats: DayStats; from: number | null }

export function assembleDay(segs: Seg[], o: { day: string; tz: string; now: number; updatedAt: number | null }): DayView {
  const start = dayStartFromKey(o.day, o.tz) ?? startOfDay(o.now, o.tz), end = endOfDay(start + 1, o.tz);
  const sorted = segs.filter((s) => s.b > start && s.a < end).sort((x, y) => x.a - y.a);
  const clean: Seg[] = [];
  for (const s0 of sorted) {
    let s = s0;
    const p = clean[clean.length - 1];
    if (p && s.a < p.b) { if (s.b <= p.b) continue; s = { ...s, a: p.b }; } // overlaps (a restart, a wrong clock): the earlier one wins
    clean.push(s);
  }
  const fresh = o.updatedAt != null && o.now - o.updatedAt <= P.FRESH_MS;
  const items: DayItem[] = [], places: LatLng[] = [];
  const placeOf = (s: Stay): number => {
    for (let i = 0; i < places.length; i++) if (distanceM(places[i], s) <= P.PLACE_M) return i + 1;
    places.push({ lat: s.lat, lng: s.lng });
    return places.length;
  };
  let dist = 0, moving = 0, visits = 0;
  clean.forEach((s, i) => {
    const isLast = i === clean.length - 1, ongoing = !!s.open && isLast && fresh;
    const b = ongoing ? Math.min(end, Math.max(s.b, o.now)) : s.b, id = `${s.k}${seqOf(s, start)}`;
    if (s.k === 's') { visits++; items.push({ id, kind: 'stay', a: s.a, b, ongoing, lat: s.lat, lng: s.lng, r: s.r, place: placeOf(s) }); }
    else { dist += s.d; moving += b - s.a; items.push({ id, kind: 'trip', a: s.a, b, ongoing, d: s.d, m: s.m, path: s.path.map(([lat, lng]) => ({ lat, lng })) }); }
  });
  // the time nobody can vouch for
  const withGaps: DayItem[] = [];
  items.forEach((it, i) => {
    withGaps.push(it);
    const next = items[i + 1];
    if (next && next.a - it.b > P.SHOW_GAP_MS) withGaps.push({ id: `g${Math.floor((it.b - start) / 60000)}`, kind: 'gap', a: it.b, b: next.a, ongoing: false });
  });
  const lastIt = items[items.length - 1];
  if (lastIt && !lastIt.ongoing && o.now - lastIt.b > P.FRESH_MS && lastIt.b < end) withGaps.push({ id: `g${Math.floor((lastIt.b - start) / 60000)}`, kind: 'gap', a: lastIt.b, b: Math.min(o.now, end), ongoing: true });
  return { day: o.day, tz: o.tz, start, end, now: o.now, items: withGaps, stats: { distanceM: dist, movingMs: moving, places: places.length, visits }, from: clean[0]?.a ?? null };
}

// ------------------------------------------------------------------------------------------------ words
export function fmtDuration(ms: number): string {
  if (ms < 60000) return 'under a minute';
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
export function fmtClock(ms: number, tz: string, locale?: string): string {
  try { return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(ms); } catch { return ''; }
}
export function fmtDayTitle(ms: number, tz: string, locale?: string): string {
  try { return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }).format(ms); } catch { return ''; }
}
export const MODE_TEXT: Record<Mode, string> = { w: 'Walking', c: 'Cycling', d: 'Driving' };
