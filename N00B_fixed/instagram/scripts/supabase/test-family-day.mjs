// NOOB Family Map, the DAY REPORT on the phone: days and time zones, telling stays from trips on made-up GPS tracks (jitter, spikes, red lights, silence, midnight), the wire format, how the
// people in the room see the day, and the recorder (what is kept on the phone, what is sent, what is forgotten at 00:00).
// Usage: node --liftoff-only scripts/supabase/test-family-day.mjs
import { distanceM } from '../../src/family/geo.ts';
import * as T from '../../src/family/timeline.ts';
import { createRecorder } from '../../src/family/dayRecorder.ts';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const near = (x, y, tol) => Math.abs(x - y) <= tol;

const TZ = 'Asia/Kolkata';
const H = 3600e3, MIN = 60e3;
const D0 = Date.UTC(2026, 9, 28, 18, 30, 0); // 2026-10-29 00:00 in India
const at = (h, m = 0, s = 0) => D0 + h * H + m * MIN + s * 1000;
let seed = 987654321;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const HOME = { lat: 19.076, lng: 72.8777 };
const off = (p, dx, dy) => ({ lat: p.lat + dy / 111320, lng: p.lng + dx / (111320 * Math.cos((p.lat * Math.PI) / 180)) });
const jit = (p, m) => off(p, (rnd() - 0.5) * 2 * m, (rnd() - 0.5) * 2 * m);
const OFFICE = off(HOME, 5000, 3000), CAFE = off(OFFICE, 300, 250);
function still(eng, p, t0, t1, step = 20e3, jm = 6, acc = 12) { for (let t = t0; t <= t1; t += step) eng.add({ ...jit(p, jm), at: t, accuracy: acc, speed: 0 }); }
function move(eng, from, to, t0, mps, step = 4e3, jm = 3) {
  const dur = (distanceM(from, to) / mps) * 1000;
  let t = t0;
  for (; t <= t0 + dur; t += step) { const f = (t - t0) / dur; eng.add({ ...jit({ lat: from.lat + (to.lat - from.lat) * f, lng: from.lng + (to.lng - from.lng) * f }, jm), at: t, accuracy: 10, speed: mps }); }
  return t0 + dur;
}
const mkEngine = (extra = {}) => T.createEngine({ tz: TZ, ...extra });
const kinds = (segs) => segs.map((s) => s.k).join('');

section('1. Days and time zones');
check(T.dayKey(Date.UTC(2026, 9, 28, 18, 29, 59), TZ) === '2026-10-28' && T.dayKey(Date.UTC(2026, 9, 28, 18, 30, 0), TZ) === '2026-10-29', 'the day changes at exactly 00:00 on the clocks of the time zone (18:30 in the evening, UTC, for India)');
check(T.startOfDay(at(5), TZ) === D0 && T.endOfDay(D0 + 1, TZ) === D0 + 24 * H && T.startOfDay(D0 + 24 * H - 1, TZ) === D0, 'a day begins at its 00:00 and ends at the next 00:00');
const NY = 'America/New_York';
check(T.startOfDay(Date.UTC(2026, 10, 1, 12), NY) === Date.UTC(2026, 10, 1, 4) && T.endOfDay(Date.UTC(2026, 10, 1, 12), NY) === Date.UTC(2026, 10, 2, 5), 'the day the clocks go back is 25 hours long (New York, 1 November 2026)');
check(T.startOfDay(Date.UTC(2026, 2, 8, 16), NY) === Date.UTC(2026, 2, 8, 5) && T.endOfDay(Date.UTC(2026, 2, 8, 16), NY) === Date.UTC(2026, 2, 9, 4), 'the day the clocks go forward is 23 hours long (8 March 2026)');
check(T.dayStartFromKey('2026-10-29', TZ) === D0 && T.dayStartFromKey('2026-10-29', 'Pacific/Kiritimati') === Date.UTC(2026, 9, 28, 10) && T.dayStartFromKey('2026-10-29', 'Pacific/Pago_Pago') === Date.UTC(2026, 9, 29, 11), 'a day named by its date starts at the right moment in zones from UTC-11 to UTC+14');
check(T.dayStartFromKey('2026-10-29', 'Nope/Zone') === null && T.dayStartFromKey('29-10-2026', TZ) === null && !T.validZone('Nope/Zone') && T.validZone('UTC') && T.validZone(T.localZone()), 'a time zone or a date that does not exist is refused');
check(T.dayKey(Date.UTC(2026, 9, 29, 12), 'Pacific/Kiritimati') !== T.dayKey(Date.UTC(2026, 9, 29, 12), 'Pacific/Pago_Pago'), 'two places on earth can be on different days at the same moment');

section('2. Geometry helpers');
const line = Array.from({ length: 100 }, (_, i) => ({ lat: 19 + i * 1e-4, lng: 72 }));
check(T.simplify(line, 12).length === 2 && T.simplify([line[0], line[1]], 12).length === 2, 'a straight line is two points');
const corner = [{ lat: 19, lng: 72 }, ...Array.from({ length: 20 }, (_, i) => ({ lat: 19 + i * 1e-4, lng: 72 })), ...Array.from({ length: 20 }, (_, i) => ({ lat: 19.002, lng: 72 + i * 1e-4 }))];
check(T.simplify(corner, 12).length === 4 || T.simplify(corner, 12).length === 3, 'a corner is kept');
const walk = [{ lat: 19, lng: 72 }];
for (let i = 1; i < 5000; i++) walk.push({ lat: walk[i - 1].lat + (rnd() - 0.5) * 3e-4, lng: walk[i - 1].lng + (rnd() - 0.5) * 3e-4 });
const sp = T.simplifyPath(walk);
check(sp.length <= 300 && sp.length >= 20 && sp.every(([la, ln]) => Math.abs(la * 1e5 - Math.round(la * 1e5)) < 1e-6), 'a long route is cut down to at most 300 points of about one metre precision');
check(T.modeOf(1300, 1000e3, 1.6) === 'w' && T.modeOf(5000, 1000e3, 8) === 'c' && T.modeOf(12000, 1000e3, 16) === 'd' && T.modeOf(4000, 1000e3, 14) === 'd' && T.modeOf(100, 100e3, 0.5) === 'w', 'on foot, by bike, by car (a slow car in a jam is still a car because of its top speed)');

section('3. Stays and trips from GPS tracks');
{
  const e = mkEngine();
  still(e, HOME, at(7), at(10));
  const s = e.snapshot();
  check(s.length === 1 && s[0].k === 's' && s[0].open === true && near(s[0].a, at(7), 25e3) && near(s[0].b, at(10), 25e3) && s[0].r < 40 && distanceM(s[0], HOME) < 8, 'three hours in one spot with GPS jitter = one stay (the place, its start and end)');
}
{
  const e = mkEngine();
  still(e, HOME, at(0), at(8, 30));
  let t = move(e, HOME, OFFICE, at(8, 30, 20), 10);
  still(e, OFFICE, t + 10e3, at(13));
  t = move(e, OFFICE, CAFE, at(13, 0, 20), 1.4);
  still(e, CAFE, t + 10e3, at(13, 50));
  t = move(e, CAFE, OFFICE, at(13, 50, 20), 1.4);
  still(e, OFFICE, t + 10e3, at(18));
  t = move(e, OFFICE, HOME, at(18, 0, 20), 10);
  still(e, HOME, t + 10e3, at(23, 40));
  const s = e.snapshot();
  check(kinds(s) === 'ststststs', 'a working day: home, drive, office, walk, cafe, walk, office, drive, home', kinds(s));
  if (kinds(s) === 'ststststs') {
    const [h1, d1, o1, w1, c1, w2, o2, d2, h2] = s;
    check(near(h1.a, at(0), 25e3) && near(h1.b, at(8, 30), 40e3) && near(o1.a, d1.b, 1) && near(d1.a, h1.b, 1) && o1.a > at(8, 36) && o1.a < at(8, 42), 'the times fit together: a trip starts when the stay ends and ends when the next stay begins');
    check(near(d1.d, distanceM(HOME, OFFICE), 250) && d1.m === 'd' && w1.m === 'w' && w2.m === 'w' && d2.m === 'd' && near(w1.d, distanceM(OFFICE, CAFE), 40), 'trip lengths are right to a few per cent, and the way of travelling is read from the speed');
    check(near(c1.a, at(13, 4, 50), 40e3) && near(c1.b, at(13, 50), 70e3) && distanceM(c1, CAFE) < 15 && distanceM(o2, OFFICE) < 15 && h2.open === true && o1.open === undefined, 'the cafe, 400 m from the office, is its own stay; only the last stay is still open');
    const view = T.assembleDay(s, { day: '2026-10-29', tz: TZ, now: at(23, 41), updatedAt: at(23, 41) });
    check(view.items.filter((i) => i.kind === 'stay').map((i) => i.place).join() === '1,2,3,2,1' && view.stats.places === 3 && view.stats.visits === 5 && near(view.stats.distanceM, d1.d + w1.d + w2.d + d2.d, 1), 'the same place visited again keeps its number (home 1, office 2, cafe 3) and the day adds up');
    check(view.items.at(-1).ongoing === true && view.items.at(-1).b === at(23, 41) && view.items.every((i) => i.kind !== 'gap'), 'the last stay goes on until now, and nothing in between is a gap');
  }
}
{
  const e = mkEngine();
  still(e, HOME, at(8), at(8, 30));
  let t = move(e, HOME, off(HOME, 2500, 1500), at(8, 30, 20), 10);
  still(e, off(HOME, 2500, 1500), t + 4e3, t + 120e3, 20e3, 3); // a red light
  t = move(e, off(HOME, 2500, 1500), OFFICE, t + 124e3, 10);
  still(e, OFFICE, t + 10e3, t + 30 * MIN);
  check(kinds(e.snapshot()) === 'stss'.slice(0, 1) + 'ts' + 's'.slice(0, 0) || kinds(e.snapshot()) === 'sts', 'two minutes at a red light inside a drive is not a stay', kinds(e.snapshot()));
}
{
  const e = mkEngine();
  still(e, HOME, at(8), at(8, 30));
  let t = move(e, HOME, off(HOME, 2500, 1500), at(8, 30, 20), 10);
  still(e, off(HOME, 2500, 1500), t + 4e3, t + 240e3, 20e3, 3); // 4 minutes: still not a stay
  t = move(e, off(HOME, 2500, 1500), OFFICE, t + 244e3, 10);
  still(e, OFFICE, t + 10e3, t + 30 * MIN);
  check(kinds(e.snapshot()) === 'sts', 'four minutes in a shop is not a stay yet', kinds(e.snapshot()));
  const e2 = mkEngine();
  still(e2, HOME, at(8), at(8, 30));
  t = move(e2, HOME, off(HOME, 2500, 1500), at(8, 30, 20), 10);
  still(e2, off(HOME, 2500, 1500), t + 4e3, t + 420e3, 20e3, 3); // 7 minutes
  t = move(e2, off(HOME, 2500, 1500), OFFICE, t + 424e3, 10);
  still(e2, OFFICE, t + 10e3, t + 30 * MIN);
  check(kinds(e2.snapshot()) === 'ststs', 'seven minutes on the way is a stay (a shop, a school gate): drive, stay, drive', kinds(e2.snapshot()));
}
{
  const e = mkEngine();
  still(e, HOME, at(2), at(3));
  e.add({ ...off(HOME, 8000, 0), at: at(3, 0, 10), accuracy: 20, speed: 0 }); // one wild fix
  still(e, HOME, at(3, 0, 20), at(5));
  const s = e.snapshot();
  check(s.length === 1 && s[0].k === 's' && near(s[0].b, at(5), 25e3) && s[0].r < 40, 'one GPS spike 8 km away is ignored');
  const e2 = mkEngine();
  still(e2, HOME, at(2), at(3));
  still(e2, off(HOME, 8000, 0), at(3, 0, 10), at(3, 8), 20e3, 4); // the jump is believed when the next fixes agree: a real move
  check(e2.snapshot().some((x) => x.k === 't' || distanceM(x, off(HOME, 8000, 0)) < 30), 'but a jump that the next fixes confirm is believed');
}
{
  const e = mkEngine();
  still(e, HOME, at(4), at(4, 5));
  for (let i = 0; i < 3; i++) e.add({ ...off(HOME, 120, 0), at: at(4, 5, 20 + i * 20), accuracy: 10, speed: 0 });
  still(e, HOME, at(4, 6), at(4, 30));
  const s = e.snapshot();
  check(s.length === 1 && s[0].k === 's' && near(s[0].a, at(4), 25e3), 'a minute of drifting 120 m away and coming back is jitter, not a trip');
  const e2 = mkEngine();
  still(e2, HOME, at(4), at(4, 30), 20e3, 6, 400);
  check(e2.snapshot().length === 0, 'fixes worse than 150 m are not used at all');
  const e3 = mkEngine();
  still(e3, HOME, at(4), at(4, 10), 20e3, 90, 100);
  check(kinds(e3.snapshot()) === 's', 'a vague fix (100 m) may wander 90 m without ending the stay');
}
{
  const e = mkEngine();
  still(e, HOME, at(8), at(10));
  still(e, HOME, at(12), at(13));
  const s = e.snapshot();
  check(kinds(s) === 'ss' && near(s[0].b, at(10), 25e3) && near(s[1].a, at(12), 1) && s[1].a - s[0].b > 90 * MIN, 'a page that was closed for two hours: two stays and the time between is NOT claimed');
  const e2 = mkEngine({ presence: () => true });
  still(e2, HOME, at(8), at(10));
  still(e2, HOME, at(12), at(13));
  check(kinds(e2.snapshot()) === 's' && near(e2.snapshot()[0].b, at(13), 25e3), 'but while a service keeps the location running (the Android app) silence at the same place means still there');
  const e3 = mkEngine({ presence: () => true });
  still(e3, HOME, at(8), at(10));
  still(e3, OFFICE, at(12), at(13));
  check(kinds(e3.snapshot()) === 'ss' && distanceM(e3.snapshot()[1], OFFICE) < 20, 'silence and then a place far away is a gap, not an invented trip');
  const e4 = mkEngine({ presence: () => true });
  e4.add({ ...HOME, at: at(8), accuracy: 10, speed: 0 });
  for (let t = at(8, 1); t <= at(10); t += MIN) e4.tick(t);
  const s4 = e4.snapshot();
  check(s4.length === 1 && s4[0].open && near(s4[0].b, at(10), 1), 'with the service running the open stay keeps growing by itself, also with no fixes');
}
{
  const e = mkEngine({ presence: () => true });
  still(e, HOME, at(9), at(9, 10));
  const t1 = move(e, HOME, OFFICE, at(9, 10, 20), 10);
  still(e, OFFICE, t1 + 4e3, t1 + 40e3, 20e3, 3); // arrived, then the phone says nothing (not moving)
  e.tick(t1 + 40e3 + 6 * MIN);
  const s = e.snapshot();
  check(kinds(s) === 'sts' && s[2].open === true, 'a trip that ended and then went silent becomes a stay by itself (the service keeps running)');
  const e2 = mkEngine();
  still(e2, HOME, at(9), at(9, 10));
  const t2 = move(e2, HOME, off(HOME, 600, 0), at(9, 10, 20), 1.4);
  check(kinds(e2.snapshot()) === 'st' && e2.snapshot()[1].open === true && e2.snapshot()[1].m === 'w', 'a trip in progress is shown while it goes on, as it is so far');
  void t2;
}

section('4. Midnight');
{
  const e = mkEngine();
  still(e, HOME, at(22), at(23, 59, 40));
  check(e.day() === '2026-10-29' && kinds(e.snapshot()) === 's', 'a stay on the evening of the day');
  e.tick(at(24, 0, 5));
  const s = e.snapshot();
  check(e.day() === '2026-10-30' && e.closedCount() === 0 && s.length === 1 && s[0].a === at(24) && s[0].open === true, 'at 00:00 the day changes: nothing of the old day is left, the stay that goes on starts the new day at 00:00');
  e.add({ ...jit(HOME, 5), at: at(24, 0, 20), accuracy: 12, speed: 0 });
  still(e, HOME, at(24, 0, 40), at(24, 30));
  const s2 = e.snapshot();
  check(s2.length === 1 && s2[0].k === 's' && s2[0].a === T.startOfDay(at(24, 5), TZ) && s2[0].a === at(24) && near(s2[0].b, at(24, 30), 25e3), 'the stay goes on after midnight and keeps starting at exactly 00:00');
  const e2 = mkEngine();
  still(e2, HOME, at(22), at(22, 30));
  still(e2, HOME, at(31, 30), at(32));
  const s3 = e2.snapshot();
  check(e2.day() === '2026-10-30' && s3.length === 1 && s3[0].a === at(31, 30), 'a phone that said nothing all night does not claim the night: the new day starts at its first news');
  const e3 = mkEngine({ presence: () => true });
  still(e3, HOME, at(22), at(22, 30));
  e3.tick(at(24, 0, 1));
  const s4 = e3.snapshot();
  check(e3.day() === '2026-10-30' && s4.length === 1 && s4[0].a === at(24) && s4[0].open === true, 'with the service running the night at home is there from 00:00');
  const e4 = mkEngine();
  still(e4, HOME, at(23, 40), at(23, 54, 50));
  const t4 = move(e4, HOME, OFFICE, at(23, 55), 10);
  still(e4, OFFICE, t4 + 4e3, t4 + 12 * MIN);
  const s5 = e4.snapshot();
  check(e4.day() === '2026-10-30' && kinds(s5) === 'ts' && s5[0].a === at(24) && s5[1].a > at(24, 4) && near(s5[0].d, distanceM(HOME, OFFICE) * ((t4 - at(24)) / (t4 - at(23, 55))), 400), 'a trip that goes on across midnight: the new day has only the part after 00:00 (its length too)', JSON.stringify(s5.map((x) => [x.k, x.a - at(24), x.d])));
}

section('5. Sending: the wire format');
{
  const stay = { k: 's', a: at(8), b: at(9), lat: 19.07601, lng: 72.87771, r: 22 };
  const trip = { k: 't', a: at(9), b: at(9, 20), d: 5800, m: 'd', path: [[19.076, 72.8777], [19.08, 72.88], [19.1, 72.9]], open: true };
  const start = at(0), end = at(24);
  const rs = T.fromWire(JSON.parse(JSON.stringify(T.toWire(stay))), start, end), rt = T.fromWire(JSON.parse(JSON.stringify(T.toWire(trip))), start, end);
  check(rs && rs.k === 's' && rs.a === stay.a && rs.b === stay.b && rs.lat === stay.lat && rs.r === 22 && !rs.open && rt && rt.k === 't' && rt.open === true && rt.d === 5800 && rt.path.length === 3 && rt.m === 'd', 'a stay and a trip survive being sent and read back');
  const w = T.toWire(stay);
  const bad = [null, 5, {}, { ...w, v: 2 }, { ...w, k: 'x' }, { ...w, a: 'x' }, { ...w, b: w.a }, { ...w, la: 91 }, { ...w, ln: NaN }, { ...w, r: -1 }, { ...w, r: 9999 },
    { ...T.toWire(trip), m: 'z' }, { ...T.toWire(trip), p: [[1, 1]] }, { ...T.toWire(trip), p: [[1, 1], [2, 'x']] }, { ...T.toWire(trip), p: Array.from({ length: 401 }, () => [1, 1]) }, { ...T.toWire(trip), d: -5 }];
  check(bad.every((x) => T.fromWire(x, start, end) === null), 'anything odd that comes out of a lock is dropped (wrong version, kind, numbers, shapes, sizes)');
  const clamped = T.fromWire({ ...w, a: Math.round((start - 3 * H) / 1000), b: Math.round((start + H) / 1000) }, start, end);
  check(clamped && clamped.a === start && clamped.b === start + H && T.fromWire({ ...w, a: Math.round((end + H) / 1000), b: Math.round((end + 2 * H) / 1000) }, start, end) === null, 'times are held inside the day: the part before 00:00 is cut off, a stay wholly outside the day is dropped');
  check(T.clipSince(stay, at(8, 30)).a === at(8, 30) && T.clipSince(stay, at(9, 1)) === null && T.clipSince(trip, at(8, 59)) === trip && T.clipSince(trip, at(9, 5)) === null && T.clipSince(stay, at(7)) === stay, 'a room gets only what happened since it got the report: a stay is cut, a trip that began earlier is left out');
  check(T.seqOf(stay, start) === 480 && T.seqOf({ ...stay, a: start }, start) === 0 && T.seqOf(trip, start) === 540, 'a stay or trip is numbered by the minute it began');
  const e = mkEngine();
  const curvy = (i) => ({ lat: HOME.lat + i * 4e-5, lng: HOME.lng + Math.sin(i / 40) * 4e-4 + i * 2e-5 });
  let ts = at(9);
  still(e, HOME, at(8), at(9));
  for (let i = 0; i < 1800; i++) { e.add({ ...curvy(i), at: ts += 4000, accuracy: 8, speed: 12 }); }
  const big = e.snapshot().find((x) => x.k === 't');
  const json = JSON.stringify(T.toWire(big));
  check(big && big.path.length <= 300 && big.path.length > 10 && json.length < 12000 && big.d > 7000, 'a two-hour drive is a route of at most 300 points, a few thousand characters', `${big && big.path.length} ${json.length}`);
}

section('6. The day as the people in the room see it');
{
  const day = '2026-10-29', now = at(15);
  const S = (a, b, la, ln, extra = {}) => ({ k: 's', a, b, lat: la, lng: ln, r: 20, ...extra });
  const Tr = (a, b, d, extra = {}) => ({ k: 't', a, b, d, m: 'd', path: [[19.07, 72.87], [19.08, 72.88]], ...extra });
  const v = T.assembleDay([S(at(9), at(12), 19.2, 72.9), S(at(0), at(8), 19.076, 72.8777), Tr(at(8), at(9), 5000)], { day, tz: TZ, now, updatedAt: now });
  check(v.items.map((i) => i.kind).join() === 'stay,trip,stay,gap' && v.items[0].a === at(0) && v.from === at(0) && v.items[3].ongoing === true && v.items[3].a === at(12) && v.items[3].b === now, 'sorted by time; no news since 12:00 shows as a gap that is still going on (no gap before the first thing: the report simply began then)');
  const g = T.assembleDay([S(at(8), at(9), 19.2, 72.9), S(at(10), at(11), 19.2, 72.9)], { day, tz: TZ, now: at(11, 5), updatedAt: at(11, 4) });
  check(g.items.map((i) => i.kind).join() === 'stay,gap,stay' && g.items[1].a === at(9) && g.items[1].b === at(10) && g.items[0].place === 1 && g.items[2].place === 1 && g.stats.places === 1 && g.stats.visits === 2, 'a gap of more than 3 minutes between two things is shown, the same place keeps its number');
  const small = T.assembleDay([S(at(8), at(9), 19.2, 72.9), S(at(9, 2), at(10), 19.3, 72.9)], { day, tz: TZ, now: at(10, 1), updatedAt: at(10) });
  check(small.items.every((i) => i.kind !== 'gap'), 'two minutes of nothing between two things is not worth a gap');
  const ov = T.assembleDay([S(at(8), at(10), 19.2, 72.9), S(at(9), at(9, 30), 19.3, 72.9), S(at(9, 40), at(11), 19.4, 72.9)], { day, tz: TZ, now: at(11, 1), updatedAt: at(11) });
  check(ov.items.length === 2 && ov.items[1].a === at(10) && ov.items[1].b === at(11), 'overlaps (a restart, a wrong clock): the earlier one wins, a later one is cut or dropped');
  const open = T.assembleDay([S(at(13), at(14), 19.2, 72.9, { open: true })], { day, tz: TZ, now, updatedAt: at(14, 59) });
  const stale = T.assembleDay([S(at(13), at(14), 19.2, 72.9, { open: true })], { day, tz: TZ, now, updatedAt: at(14, 30) });
  check(open.items[0].ongoing && open.items[0].b === now && !stale.items[0].ongoing && stale.items[0].b === at(14) && stale.items[1].kind === 'gap' && stale.items[1].a === at(14), 'a stay in progress runs until now only while the phone keeps reporting (10 minutes); after that it ends where the news ended and a gap follows');
  const none = T.assembleDay([], { day, tz: TZ, now, updatedAt: null });
  check(none.items.length === 0 && none.from === null && none.stats.places === 0 && none.start === D0 && none.end === D0 + 24 * H, 'a day with nothing in it');
  const out = T.assembleDay([S(at(-5), at(-4), 19.2, 72.9), S(at(25), at(26), 19.2, 72.9)], { day, tz: TZ, now, updatedAt: now });
  check(out.items.length === 0, 'what lies outside the day is not shown (nothing of yesterday or tomorrow)');
  check(T.fmtDuration(30e3) === 'under a minute' && T.fmtDuration(45 * MIN) === '45 min' && T.fmtDuration(2 * H) === '2 h' && T.fmtDuration(2 * H + 10 * MIN) === '2 h 10 min' && T.fmtClock(at(8, 45), TZ, 'en-GB') === '8:45' && /29/.test(T.fmtDayTitle(at(8), TZ, 'en-GB')), 'durations and clock times are read in the time zone of the person');
}

section('7. The recorder: what the phone keeps, sends and forgets');
function mk(over = {}, saved = null, now0 = at(10)) {
  const st = { now: now0, rooms: ['r1'], pushes: [], ok: true, saved };
  const store = { read: () => st.saved, write: (v) => { st.saved = v; }, erase: () => { st.saved = null; } };
  const deps = { now: () => st.now, zone: () => TZ, store, presence: () => false, rooms: async () => st.rooms, push: async (room, day, tz, items) => { st.pushes.push({ room, day, tz, items }); return st.ok; }, ...over };
  return { st, deps, rec: createRecorder(deps) };
}
const feed = (m, p, t0, t1, step = 20e3) => { for (let t = t0; t <= t1; t += step) { m.st.now = t; m.rec.add({ ...jit(p, 5), at: t, accuracy: 10, speed: 0 }); } };
{
  const m = mk({ rooms: async () => [] });
  feed(m, HOME, at(10), at(10, 20));
  await m.rec.refresh(); await m.rec.tick();
  check(m.rec.snapshot().length === 0 && m.st.saved === null && m.st.pushes.length === 0, 'with nobody getting the report nothing is recorded, kept or sent');
}
{
  const m = mk();
  feed(m, HOME, at(9, 59), at(9, 59, 50)); // before the rooms are known: dropped
  await m.rec.refresh();
  check(m.rec.rooms().join() === 'r1', 'the rooms that get the report are asked for');
  feed(m, HOME, at(10), at(10, 30));
  await m.rec.tick();
  const p1 = m.st.pushes;
  check(p1.length === 1 && p1[0].room === 'r1' && p1[0].day === '2026-10-29' && p1[0].tz === TZ && p1[0].items.length === 1 && p1[0].items[0].seg.k === 's' && p1[0].items[0].seg.open === true && p1[0].items[0].seq === 600, 'the stay is sent to the room with its day, time zone and minute number');
  check(m.st.saved && JSON.parse(m.st.saved).day === '2026-10-29' && !/password|email/i.test(m.st.saved), 'and kept on the phone for the day');
  feed(m, HOME, at(10, 30, 20), at(10, 30, 50)); m.st.now = at(10, 30, 50); await m.rec.tick();
  check(m.st.pushes.length === 1, 'once a minute at most while nothing ends');
  feed(m, HOME, at(10, 31), at(10, 40)); await m.rec.tick();
  check(m.st.pushes.length === 2 && m.st.pushes[1].items.length === 1 && m.st.pushes[1].items[0].seg.b > p1[0].items[0].seg.b, 'a minute later the longer stay is sent again (the same number, so it replaces the old one)');
  await m.rec.tick();
  check(m.st.pushes.length === 2, 'nothing new = nothing sent');
}
{
  const m = mk();
  await m.rec.refresh();
  feed(m, HOME, at(10), at(10, 20));
  await m.rec.tick();
  const t = move({ add: (f) => m.rec.add(f) }, HOME, OFFICE, at(10, 20, 20), 10);
  m.st.now = t; await m.rec.tick();
  feed(m, OFFICE, t + 4e3, t + 20 * MIN); await m.rec.tick();
  const seqs = m.st.pushes.flatMap((p) => p.items.map((i) => i.seg && i.seg.k + i.seq));
  check(seqs.some((x) => x && x[0] === 't') && seqs.filter((x) => x && x[0] === 's').length >= 2, 'a finished trip and the next stay are sent as they happen', seqs.join());
}
{
  const m = mk();
  await m.rec.refresh();
  m.st.now = at(10, 20); await m.rec.refresh(); // nothing changes
  feed(m, HOME, at(10), at(10, 30)); await m.rec.tick();
  m.st.rooms = ['r1', 'r2']; m.st.now = at(10, 40); await m.rec.refresh();
  feed(m, HOME, at(10, 31), at(10, 41)); m.st.now = at(10, 42); await m.rec.tick();
  const r2 = m.st.pushes.filter((p) => p.room === 'r2');
  check(r2.length === 1 && r2[0].items.length === 1 && r2[0].items[0].seg.a === at(10, 40), 'a room that gets the report at 10:40 gets nothing from before 10:40 (the stay is cut to start then)');
  const r1 = m.st.pushes.filter((p) => p.room === 'r1');
  check(r1.at(-1).items[0].seg.a < at(10, 5), 'while the first room has it all');
  m.st.rooms = ['r2']; m.st.now = at(11); await m.rec.refresh(); m.rec.save();
  check(JSON.parse(m.st.saved).since.r1 === undefined && JSON.parse(m.st.saved).since.r2 === at(10, 40), 'a room that no longer gets the report is forgotten, the other keeps its start');
  m.st.rooms = []; m.st.now = at(11, 5); await m.rec.refresh();
  check(m.st.saved === null && m.rec.snapshot().length === 0 && m.rec.rooms().length === 0, 'when nobody gets the report any more, everything of it is erased from the phone at once');
}
{
  const m = mk({ rooms: async () => null });
  await m.rec.refresh();
  check(m.rec.rooms().length === 0, 'if the rooms could not be asked, nothing is assumed');
  const m2 = mk();
  await m2.rec.refresh();
  m2.deps.rooms = async () => null;
  feed(m2, HOME, at(10), at(10, 10)); m2.st.now = at(11);
  await m2.rec.refresh();
  check(m2.rec.rooms().join() === 'r1', 'and a failed question later changes nothing');
}
{
  const m = mk();
  await m.rec.refresh();
  feed(m, HOME, at(10), at(10, 30));
  m.st.ok = false; await m.rec.tick();
  const tries = m.st.pushes.length;
  m.st.now = at(10, 32); m.st.ok = true; feed(m, HOME, at(10, 31), at(10, 32)); await m.rec.tick();
  check(tries === 1 && m.st.pushes.length === 2 && m.st.pushes[1].items.length === 1, 'a part that did not arrive is sent again at the next chance');
}
{
  const m = mk();
  await m.rec.refresh();
  feed(m, HOME, at(10), at(10, 30)); await m.rec.tick();
  const saved = JSON.parse(m.st.saved);
  saved.sent.r1['999'] = 'old';
  m.st.saved = JSON.stringify(saved);
  const m2 = mk({}, m.st.saved, at(10, 31));
  await m2.rec.refresh();
  feed(m2, HOME, at(10, 31), at(10, 33)); await m2.rec.tick();
  const del = m2.st.pushes.flatMap((p) => p.items).filter((i) => i.seg === null);
  check(del.length === 1 && del[0].seq === 999 && m2.rec.snapshot().length === 1, 'a stay or trip that was sent and then disappeared (merged away) is removed from the room, and a restart picks the day up where it was');
}
{
  const m = mk();
  await m.rec.refresh();
  feed(m, HOME, at(23, 40), at(23, 59, 50)); m.st.now = at(23, 59, 50); await m.rec.tick();
  const kept = m.st.saved;
  check(kept && m.rec.snapshot().length === 1, 'at 23:59 the day is on the phone');
  const m2 = mk({}, kept, at(24, 10));
  check(m2.rec.snapshot().length === 0 && m2.st.saved === null, 'opened after midnight, the phone has already forgotten yesterday');
  const m3 = mk({ zone: () => 'America/New_York' }, kept, at(23, 59, 55));
  check(m3.rec.snapshot().length === 0 && m3.st.saved === null, 'a report made in another time zone is not carried into this one');
}
{
  const m = mk();
  await m.rec.refresh();
  feed(m, HOME, at(23, 40), at(24, 5)); // crosses midnight while running
  m.st.now = at(24, 5); await m.rec.tick();
  const days = new Set(m.st.pushes.map((p) => p.day));
  const last = m.st.pushes.at(-1);
  check(days.has('2026-10-30') && last.day === '2026-10-30' && last.items.every((i) => i.seg && i.seg.a >= at(24)) && last.items[0].seq === 0, 'across midnight the new day is sent from its 00:00 (number 0), nothing of the old day again');
  check(JSON.parse(m.st.saved).day === '2026-10-30' && JSON.parse(m.st.saved).engine.segs.length === 0, 'and the phone keeps only the new day');
}
{
  const m = mk({ presence: () => true });
  await m.rec.refresh();
  feed(m, HOME, at(10), at(10, 30)); await m.rec.tick();
  const m2 = mk({ presence: () => true }, m.st.saved, at(11, 30));
  await m2.rec.refresh();
  feed(m2, HOME, at(11, 31), at(11, 50));
  check(kinds(m2.rec.snapshot()) === 'ss', 'after the app was not running for an hour even a service does not vouch for the time it was off: a gap');
  const m4 = mk(); await m4.rec.refresh();
  feed(m4, HOME, at(10), at(10, 30)); await m4.rec.tick();
  m4.deps.zone = () => 'Asia/Tokyo'; feed(m4, HOME, at(10, 31), at(10, 32));
  check(m4.rec.snapshot().length === 0 && m4.st.saved === null, 'a change of time zone starts a new report');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
