// The offline gazetteer and resolver behind the admin page "User data" (src/data/geoPlaces.ts, src/utils/userLocations.ts, src/data/worldMapPath.ts).
// Usage: node --liftoff-only scripts/supabase/test-geo-places.mjs
import fs from 'node:fs';
import { resolvePlace, countryCode, jitter, JITTER_DEGREES, project, buildDots, clusterDots, agoShort, dateOnly, placeLabel, tables, hash01 } from '../../src/utils/userLocations.ts';
import { WORLD_LAND_PATH, WORLD_BORDERS_PATH, WORLD_MAP_WIDTH, WORLD_MAP_HEIGHT } from '../../src/data/worldMapPath.ts';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const near = (a, b, d = 0.05) => Math.abs(a - b) <= d;
const km = (a, b) => { const R = 6371, rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad; const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };

section('1. The tables');
const t = tables();
check(t.size.countries >= 235, 'every country has a centre', String(t.size.countries));
check(t.size.cities >= 400, 'about 400 and more cities', String(t.size.cities));
let inRange = true; for (const [, v] of [...t.country, ...t.city, ...t.region]) if (!(v.lat >= -90 && v.lat <= 90 && v.lng >= -180 && v.lng <= 180)) inRange = false;
check(inRange, 'every coordinate is a real latitude and longitude');
const indian = [...t.city.keys()].filter((k) => k.endsWith('|IN')).length;
check(indian >= 150, 'about 150 and more Indian cities', String(indian));
check(['IN', 'US', 'GB', 'DE', 'FR', 'BR', 'JP', 'CN', 'AU', 'ZA', 'NG', 'RU', 'AE', 'PK', 'BD'].every((c) => t.country.has(c)), 'the big countries are there');
// sanity: every city lies near its own country's centre (a swapped sign or a typo would put one on the wrong side of the world)
const far = [];
const bigCountries = new Set(['US', 'CA', 'RU', 'CN', 'AU', 'BR', 'IN', 'AR', 'KZ', 'ID', 'MX']);
for (const [k, v] of [...t.city, ...t.region]) {
  const cc = k.split('|')[1]; const c = t.country.get(cc);
  if (!c) { far.push(`${k}:nocountry`); continue; }
  const lim = cc === 'US' ? 6500 : bigCountries.has(cc) ? 5500 : 1800;
  if (km(c, v) > lim) far.push(`${k} ${Math.round(km(c, v))}km`);
}
check(far.length === 0, 'no city or region is far from its own country', far.join('; '));

section('2. Known places');
const bl = resolvePlace({ city: 'Bengaluru', region: 'Karnataka', country: 'IN' });
check(bl && bl.level === 'city' && near(bl.lat, 12.97) && near(bl.lng, 77.59), 'Bengaluru in India', JSON.stringify(bl));
check(resolvePlace({ city: 'Bangalore', country: 'in' })?.level === 'city', 'old spelling and lower-case country');
check(resolvePlace({ city: 'Mumbai', country: 'IN' })?.lat === 19.08, 'Mumbai');
check(resolvePlace({ city: 'München', country: 'DE' })?.level === 'city', 'accents are ignored');
check(resolvePlace({ city: 'New York', country: 'US' })?.level === 'city' && resolvePlace({ city: 'Washington D.C.', country: 'US' })?.level === 'city', 'spaces and dots do not matter');
check(resolvePlace({ city: 'Hyderabad', country: 'PK' })?.lng === 68.37 && resolvePlace({ city: 'Hyderabad', country: 'IN' })?.lng === 78.49, 'the same city name in two countries');
check(resolvePlace({ city: 'San Jose', country: 'CR' })?.lat === 9.93, 'San Jose in Costa Rica is not San Jose in California');
const d = resolvePlace({ city: 'Delhi', country: 'IN' }); check(d && d.level === 'city' && near(d.lat, 28.61), 'Delhi');
check(resolvePlace({ city: 'Mohali', country: 'IN' })?.level === 'city', 'a smaller Indian city');

section('3. Falling back');
const kar = resolvePlace({ city: 'Some Village', region: 'Karnataka', country: 'IN' });
check(kar && kar.level === 'region' && near(kar.lat, 15.32), 'unknown city: the region', JSON.stringify(kar));
const ind = resolvePlace({ city: 'Nowhereville', region: 'Nowhere State', country: 'IN' });
check(ind && ind.level === 'country' && near(ind.lat, 20.59) && near(ind.lng, 78.96), 'unknown city and region: the centre of the country', JSON.stringify(ind));
check(resolvePlace({ country: 'DE' })?.level === 'country', 'only a country');
check(['region', 'city'].includes(resolvePlace({ region: 'Berlin', country: 'DE' })?.level), 'a region that is also a city');
check(resolvePlace({ city: 'Pune', country: 'India' })?.level === 'city', 'the country can be written as its name');
check(countryCode('UK') === 'GB' && countryCode('United States') === 'US' && countryCode('XX') === null && countryCode('T1') === null && countryCode('') === null, 'country codes and names; unknown codes are not countries');

section('4. Unknown stays unknown');
check(resolvePlace(null) === null && resolvePlace({}) === null, 'nothing known: nothing placed');
check(resolvePlace({ city: 'Mumbai', country: 'XX' }) === null, 'an unknown country code is not guessed from the city');
check(resolvePlace({ city: 'Atlantis', country: 'ZZ' }) === null, 'an invented place is not placed');
check(resolvePlace({ city: 'Hyderabad' }) === null, 'a city with no country that exists in two countries is not guessed');
check(resolvePlace({ city: 'Pune' })?.level === 'city', 'a city with no country that is only in one place is fine');

section('5. The scatter');
const sample = resolvePlace({ city: 'Mumbai', country: 'IN' });
let maxCity = 0, same = true;
for (let i = 0; i < 500; i++) { const j = jitter(sample, `user-${i}`); maxCity = Math.max(maxCity, km(sample, j)); const j2 = jitter(sample, `user-${i}`); if (j.lat !== j2.lat || j.lng !== j2.lng) same = false; }
check(same, 'the same user always lands on the same spot');
check(maxCity <= JITTER_DEGREES.city * 111 * 1.05, `a city dot stays within ${Math.round(JITTER_DEGREES.city * 111)} km`, `${maxCity.toFixed(1)} km`);
const distinct = new Set(Array.from({ length: 50 }, (_, i) => JSON.stringify(jitter(sample, `u${i}`)))).size;
check(distinct > 45, 'different users do not sit on top of each other', String(distinct));
const reg = resolvePlace({ region: 'Karnataka', country: 'IN' }), cty = resolvePlace({ country: 'IN' });
let maxReg = 0, maxCountry = 0;
for (let i = 0; i < 300; i++) { maxReg = Math.max(maxReg, km(reg, jitter(reg, `r${i}`))); maxCountry = Math.max(maxCountry, km(cty, jitter(cty, `c${i}`))); }
check(maxReg <= JITTER_DEGREES.region * 111 * 1.05 && maxCountry <= JITTER_DEGREES.country * 111 * 1.2 && maxCountry > maxReg && maxReg > maxCity, 'the less sure the place, the wider the scatter', `${maxCity.toFixed(0)} < ${maxReg.toFixed(0)} < ${maxCountry.toFixed(0)} km`);
const north = jitter({ lat: 84, lng: 0, level: 'country' }, 'x'); check(north.lat <= 85 && north.lat >= -85, 'a scatter never leaves the map at the poles');
const wrap = jitter({ lat: 0, lng: 179.9, level: 'country' }, 'w'); check(wrap.lng >= -180 && wrap.lng <= 180, 'and wraps round the date line');
check(hash01('a') !== hash01('b') && hash01('a') >= 0 && hash01('a') < 1, 'the hash is spread out');

section('6. On the map');
const p0 = project({ lat: 84, lng: -180 }), p1 = project({ lat: -58, lng: 180 }), eq = project({ lat: 0, lng: 0 });
check(p0.x === 0 && p0.y === 0 && near(p1.x, WORLD_MAP_WIDTH, 0.01) && near(p1.y, WORLD_MAP_HEIGHT, 0.5), 'the corners of the map', JSON.stringify([p0, p1]));
check(near(eq.x, 500, 0.01) && near(eq.y, (84 * 1000) / 360, 0.01), 'the middle of the world');
check(WORLD_LAND_PATH.length > 20000 && WORLD_LAND_PATH.length + WORLD_BORDERS_PATH.length < 120000, 'the map outline is real and under 120 KB', `${WORLD_LAND_PATH.length + WORLD_BORDERS_PATH.length} bytes`);
check(/^M/.test(WORLD_LAND_PATH) && /^[MLZ0-9eE.,\-]+$/.test(WORLD_LAND_PATH), 'the outline is only path commands and numbers');
const nums = WORLD_LAND_PATH.match(/-?\d+(?:\.\d+)?/g).map(Number);
check(Math.max(...nums) <= WORLD_MAP_WIDTH + 1, 'nothing is drawn outside the map');

section('7. Dots, clusters and words');
const rows = [
  { id: 'a', username: 'ann', displayName: 'Ann', createdAt: '2026-01-02T00:00:00Z', signup: { city: 'Pune', region: null, country: 'IN' }, last: { city: 'Mumbai', region: 'Maharashtra', country: 'IN', at: '2026-11-13T09:00:00Z' } },
  { id: 'b', username: 'bob', displayName: 'Bob', createdAt: '2026-02-02T00:00:00Z', signup: null, last: null },
  { id: 'c', username: 'cat', displayName: 'Cat', createdAt: '2026-03-02T00:00:00Z', signup: { city: 'Atlantis', region: null, country: 'ZZ' }, last: { city: 'London', region: 'England', country: 'GB', at: '2026-11-12T09:00:00Z' } },
];
const { dots, unplaced } = buildDots(rows);
check(dots.length === 3 && dots.filter((x) => x.kind === 'signup').length === 1 && dots.filter((x) => x.kind === 'last').length === 2, 'one dot per known place');
check(unplaced.users === 1 && unplaced.signup === 1, 'users with no known place are counted, not drawn', JSON.stringify(unplaced));
const cl = clusterDots(dots, { k: 1, tx: 0, ty: 0 }, 22);
check(cl.length >= 1 && cl.reduce((n, c) => n + c.dots.length, 0) === dots.length, 'clusters hold every dot once');
const two = clusterDots([dots[0], dots[1]], { k: 1, tx: 0, ty: 0 }, 5000);
check(two.length === 1 && two[0].dots.length === 2, 'a big square joins all dots');
const apart = clusterDots([{ ...dots[0], x: 0, y: 0 }, { ...dots[1], x: 500, y: 100 }], { k: 1, tx: 0, ty: 0 }, 22);
check(apart.length === 2, 'far dots stay apart');
check(placeLabel({ city: 'Pune', country: 'IN' }) === 'Pune, IN' && placeLabel({ region: 'Karnataka', country: 'IN' }) === 'Karnataka, IN' && placeLabel(null) === 'unknown' && placeLabel({ country: 'India' }) === 'IN', 'place text');
const now = Date.parse('2026-11-13T12:00:00Z');
check(agoShort('2026-11-13T11:59:50Z', now) === 'now' && agoShort('2026-11-13T11:57:00Z', now) === '3m' && agoShort('2026-11-13T07:00:00Z', now) === '5h' && agoShort('2026-11-11T12:00:00Z', now) === '2d' && agoShort('2026-07-01T12:00:00Z', now) === '4mo' && agoShort('2024-01-01T00:00:00Z', now) === '2y' && agoShort(null, now) === '?', 'short times');
check(dateOnly('2026-03-01T10:00:00Z') === '2026-03-01' && dateOnly(null) === '?', 'dates');

section('8. The files');
const files = ['../../src/utils/userLocations.ts', '../../src/data/geoPlaces.ts'].map((f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');
check(!/fetch\(|XMLHttpRequest|nominatim|geocod|googleapis|mapbox/i.test(files.replace(/no outside geocoding service/gi, '')), 'no outside geocoding service anywhere');
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
