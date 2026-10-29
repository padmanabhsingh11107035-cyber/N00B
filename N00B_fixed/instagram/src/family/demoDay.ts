import type { LatLng } from './geo.ts';
import { pathLength, type Mode, type Seg } from './timeline.ts';

// NOOB Family Map demo: a made-up day report for every person, so the report can be seen without an account. Every plan fills the part of today that has already passed (it starts at 00:00 and ends
// "now"), whatever the time of day is, and ends where the person's live pin is. Nothing here is real or sent anywhere.
export interface Plan {
  /** where the person lives and ends the day, in metres from the demo's centre */
  home: [number, number];
  /** the places they go, in order, and how long they stay there (a weight, not minutes) */
  stops: { at: [number, number]; w: number }[];
  /** how they travel */
  mode: Mode;
  /** the day ends at home ("stay") or on the way (a trip that is still going on) */
  end: 'stay' | 'trip';
  /** minutes since the phone last said anything (a person who has gone quiet) */
  quiet?: number;
}

/** the stays and trips of a plan between `start` and `now` (all in the past); `at` turns metres into a place */
export function buildDemoDay(plan: Plan, at: (dx: number, dy: number) => LatLng, start: number, now: number): Seg[] {
  const stopT = Math.min(now, now - (plan.quiet ?? 0) * 60000);
  const total = stopT - start;
  if (total < 3 * 60000) return [];
  const spots: { p: LatLng; w: number }[] = [{ p: at(...plan.home), w: 4 }, ...plan.stops.map((s) => ({ p: at(...s.at), w: s.w }))];
  if (plan.end === 'stay') spots.push({ p: at(...plan.home), w: 3 });
  const legW = 0.5, W = spots.reduce((x, s) => x + s.w, 0) + legW * (spots.length - (plan.end === 'stay' ? 1 : 0));
  const out: Seg[] = [];
  let t = start;
  spots.forEach((s, i) => {
    const last = i === spots.length - 1;
    const b = last && plan.end === 'stay' ? stopT : t + (total * s.w) / W;
    out.push({ k: 's', a: t, b, lat: s.p.lat, lng: s.p.lng, r: 22 + (i % 3) * 8, ...(last && plan.end === 'stay' ? { open: true as const } : {}) });
    t = b;
    const next = spots[i + 1];
    if (next || plan.end === 'trip') {
      const to = next ? next.p : at(plan.home[0] + 600, plan.home[1] - 400);
      const b2 = last ? stopT : t + (total * legW) / W;
      const mid = { lat: (s.p.lat + to.lat) / 2 + (to.lng - s.p.lng) * 0.18, lng: (s.p.lng + to.lng) / 2 - (to.lat - s.p.lat) * 0.18 };
      const pts = [s.p, { lat: s.p.lat + (mid.lat - s.p.lat) * 0.5, lng: s.p.lng + (mid.lng - s.p.lng) * 0.5 }, mid, { lat: mid.lat + (to.lat - mid.lat) * 0.5, lng: mid.lng + (to.lng - mid.lng) * 0.5 }, to];
      const d = Math.round(pathLength(pts));
      out.push({ k: 't', a: t, b: b2, d, m: plan.mode, path: pts.map((q) => [Math.round(q.lat * 1e5) / 1e5, Math.round(q.lng * 1e5) / 1e5] as [number, number]), ...(last ? { open: true as const } : {}) });
      t = b2;
    }
  });
  return out;
}

// who goes where (metres from the demo's centre, the same places the live pins walk around)
export const DEMO_PLANS: Record<string, Plan> = {
  'demo-me': { home: [0, 0], stops: [{ at: [-420, 260], w: 3 }, { at: [180, -520], w: 2 }], mode: 'w', end: 'stay' },
  'demo-priya': { home: [900, 650], stops: [{ at: [3400, 2100], w: 9 }, { at: [3650, 2300], w: 1.2 }, { at: [3400, 2100], w: 5 }, { at: [1800, 900], w: 1.4 }], mode: 'd', end: 'stay' },
  'demo-aarav': { home: [-700, 380], stops: [{ at: [-1650, 1250], w: 8 }, { at: [-1150, 140], w: 2.4 }], mode: 'c', end: 'trip' },
  'demo-rohan': { home: [260, -1250], stops: [{ at: [-2100, -2600], w: 6 }, { at: [2600, -3000], w: 3 }], mode: 'd', end: 'trip' },
  'demo-dadi': { home: [2300, 1500], stops: [{ at: [2480, 1620], w: 2 }], mode: 'w', end: 'stay', quiet: 25 }
};
