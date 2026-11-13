// NOOB admin panel -> User's data: the admin_user_locations() function (where each user signed up and was last seen, approximate place only).
// On a REAL Postgres (PGlite) with every migration applied. Usage: node --liftoff-only scripts/supabase/test-admin-user-locations.mjs
import fs from 'node:fs';
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const db = await createTestDb();
const mkUser = async (name, city = null, dial = null) => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, extensions.crypt('secret pass', extensions.gen_salt('bf')))`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $3)`, [id, name, `${name} Display`]);
  await db.query(`insert into public.profile_private (user_id, email, mobile_number, date_of_birth, country_code) values ($1, $2, '9876543210', '2000-01-01', $3) on conflict (user_id) do update set email = excluded.email, mobile_number = excluded.mobile_number, country_code = excluded.country_code`, [id, `${name}@secret-mail.com`, dial]);
  if (city) await db.query(`update public.profiles set city = $2 where id = $1`, [id, city]);
  return id;
};
const call = async (uid, sql, args = []) => asUser(db, uid, async () => (await db.query(sql, args)).rows[0]?.r);
const fails = async (uid, sql, args = []) => { try { await call(uid, sql, args); return null; } catch (e) { return e.message; } };
const visit = (uid, vid, first, last, country, region, city, ip = '203.0.113.9', bot = false, lat = null, lng = null) =>
  db.query(`insert into public.site_visits (visitor_id, user_id, first_seen, last_seen, country, region, city, ip, is_bot, lat, lng, platform, device) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pwa', 'Phone')`, [vid, uid, first, last, country, region, city, ip, bot, lat, lng]);

const noob = await mkUser('noob'); await db.query(`update public.profiles set is_admin = true where id = $1`, [noob]);
const ann = await mkUser('ann', 'Pune', '+91 (IN)');            // typed city
const bob = await mkUser('bob', null, '+44 (GB)');              // no city: visits decide
const cat = await mkUser('cat', null, '+91 (IN)');              // nothing but the phone code
const dan = await mkUser('dan', null, null);                    // nothing at all
await visit(bob, 'bobdevice-0001', '2026-01-01T10:00:00Z', '2026-01-02T10:00:00Z', 'GB', 'England', 'London', '203.0.113.20', false, 51.507, -0.128);
await visit(bob, 'bobdevice-0002', '2026-03-01T10:00:00Z', '2026-11-01T10:00:00Z', 'DE', 'Berlin', 'Berlin', '203.0.113.30', false, 52.52, 13.405);
await visit(bob, 'bobdevice-bot01', '2026-04-01T10:00:00Z', '2026-12-01T10:00:00Z', 'US', 'Virginia', 'Ashburn', '198.51.100.1', true);
await visit(ann, 'anndevice-0001', '2026-02-01T10:00:00Z', '2026-10-20T10:00:00Z', 'IN', 'Maharashtra', 'Mumbai', '203.0.113.40');
await visit(null, 'guestdevice-001', '2026-02-01T10:00:00Z', '2026-10-20T10:00:00Z', 'FR', 'Paris', 'Paris');

console.log('\nUser\'s data');
let r = await call(noob, `select public.admin_user_locations() as r`);
const by = (u) => r.rows.find((x) => x.username === u);
check(r.rows.length === 5 && r.total === 5, 'the admin gets one row per user');
check(by('ann').signup.city === 'Pune' && by('ann').signup.country === 'IN' && by('ann').signup.source === 'profile', 'a typed city wins for signup, with the country of the phone code', JSON.stringify(by('ann').signup));
check(by('ann').last.city === 'Mumbai' && by('ann').last.at, 'last place is the newest visit', JSON.stringify(by('ann').last));
check(by('bob').signup.city === 'London' && by('bob').signup.source === 'visit', 'with no city: the OLDEST visit is the signup place', JSON.stringify(by('bob').signup));
check(by('bob').last.city === 'Berlin' && by('bob').last.country === 'DE', 'last place ignores bots and takes the newest real visit', JSON.stringify(by('bob').last));
check(by('cat').signup.country === 'IN' && by('cat').signup.city === null && by('cat').signup.source === 'dialcode' && by('cat').last === null, 'only a phone code: country only, no last place');
check(by('dan').signup === null && by('dan').last === null, 'nothing known: both places are null (never guessed)');
check(by('ann').id && by('ann').displayName === 'ann Display' && by('ann').createdAt, 'id, display name and creation date are present');
check(by('bob').signup.lat === 51.507 && by('bob').signup.lng === -0.128 && by('bob').signup.ip === '203.0.113.20', 'signup carries the coordinates and IP of that same (oldest) visit', JSON.stringify(by('bob').signup));
check(by('bob').last.lat === 52.52 && by('bob').last.lng === 13.405 && by('bob').last.ip === '203.0.113.30' && by('bob').last.platform === 'pwa' && by('bob').last.device === 'Phone', 'last carries the coordinates, IP, platform and device of the newest visit', JSON.stringify(by('bob').last));
check(by('ann').signup.lat === null && by('ann').last.lat === null && by('ann').last.ip === '203.0.113.40', 'no coordinates stored: null (the page falls back to the place name)');
const text = JSON.stringify(r);
check(!/198\.51\.100|9876543210|secret-mail|@users\.nooob|email|mobile/i.test(text), 'the bot visit, phone number and email are nowhere in the answer');
check(r.rows[0].username === 'bob' && r.rows[1].username === 'ann', 'newest active first', r.rows.map((x) => x.username).join());
r = await call(noob, `select public.admin_user_locations(2) as r`);
check(r.rows.length === 2, 'the limit works');
r = await call(noob, `select public.admin_user_locations(0) as r`);
check(r.rows.length === 1, 'a limit below 1 is raised to 1');
r = await call(noob, `select public.admin_user_locations(999999) as r`);
check(r.rows.length === 5, 'a huge limit is clamped (5000)');
check(/permission|Administrator/i.test(await fails(ann, `select public.admin_user_locations() as r`) || ''), 'a normal user is refused');
const anonErr = await asAnon(db, async () => { try { await db.query(`select public.admin_user_locations()`); return ''; } catch (e) { return e.message; } });
check(/permission denied/i.test(anonErr || ''), 'someone who is not signed in is refused');
const sql = fs.readFileSync(new URL('../../supabase/migrations/20261114000008_admin_user_locations_v2.sql', import.meta.url), 'utf8');
const sql7 = fs.readFileSync(new URL('../../supabase/migrations/20261114000007_visit_coordinates.sql', import.meta.url), 'utf8');
let twice = true; try { await db.exec(sql7); await db.exec(sql7); await db.exec(sql); await db.exec(sql); } catch (e) { twice = false; console.log(e.message); }
check(twice, 'the migration can be run again');
console.log('\nrecord_visit keeps the coordinates');
const rv = async (vid, info) => asAnon(db, async () => { await db.query(`select public.record_visit($1, $2::jsonb)`, [vid, JSON.stringify(info)]); });
const get = async (vid) => (await db.query(`select lat, lng from public.site_visits where visitor_id = $1`, [vid])).rows[0];
await rv('coorddevice-001', { lat: 21.196, lng: 72.83 });
let g = await get('coorddevice-001');
check(Number(g.lat) === 21.196 && Number(g.lng) === 72.83, 'valid coordinates are stored');
await rv('coorddevice-001', { path: '/x' });
g = await get('coorddevice-001');
check(Number(g.lat) === 21.196, 'a later visit without coordinates keeps the old ones');
await rv('coorddevice-002', { lat: 123, lng: 10 });
await rv('coorddevice-003', { lat: '21.1', lng: 'abc' });
await rv('coorddevice-004', { lat: 10, lng: 200 });
check((await get('coorddevice-002')).lat === null && (await get('coorddevice-003')).lat === null && (await get('coorddevice-004')).lat === null, 'out-of-range or non-number coordinates are ignored (the visit is still counted)');
const direct = await asUser(db, ann, async () => { try { return JSON.stringify((await db.query(`select * from public.site_visits`)).rows); } catch (e) { return 'denied'; } });
check(direct === 'denied' || direct === '[]', 'a normal user cannot read site_visits (the IP column) directly', direct.slice(0, 80));
console.log('\nThe page and its wiring');
const rd = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const modal = rd('../../src/components/Modals/AdminControlModal.tsx'), page = rd('../../src/components/Modals/AdminUserDataPage.tsx'), css = rd('../../src/components/Modals/adminUserData.css');
const rain = rd('../../src/components/Modals/UserDataRain.tsx'), mapSrc = rd('../../src/components/Modals/UserDataMap.tsx');
check(/admin-tab-userdata[\s\S]{0,400}User's data/.test(modal) && /\{main && \(\s*<button\s+onClick=\{\(\) => setShowUserData\(true\)\}/.test(modal), "the admin panel has a tab named exactly User's data, for the main administrator only");
check(/\{showUserData && main && \(/.test(modal), 'the page can only be opened by the main administrator');
check(/<header className="ud-head">\s*<button className="ud-btn" onClick=\{back\}/.test(page) && /ArrowLeft/.test(page) && /> Back<\/button>/.test(page), 'a Back button is the first thing at the top left');
check(/min-height: 44px; min-width: 44px/.test(css), 'the Back button is a 44 px touch target');
check(/popstate/.test(page) && /pushState/.test(page), 'the phone Back gesture closes the page');
check(/data-noob-keep="1"/.test(page) && /edge-own/.test(page) && /var\(--sat, 0px\)/.test(css), 'full screen, from above the clock, left as it is by the page frames');
check(!/localStorage|sessionStorage|indexedDB/.test(page + mapSrc), 'nothing is cached in the browser');
check(/prefers-reduced-motion/.test(css) && /visibilitychange/.test(rain) && /requestAnimationFrame/.test(rain) && /t - last < 40/.test(rain), 'animations stop when hidden, respect reduced motion, and run at 25 frames a second at most');
check(/ACCESS DENIED/.test(page) && /NO DATA/.test(page) && /CONNECTION ERROR/.test(page), 'denied, empty and error states are written');
const feeds = rd('../../src/components/Modals/UserDataFeeds.tsx');
check(/decorative feeds/.test(page) && /approximate/.test(page) && !/GPS[- ]exact|exact (GPS|location)/i.test(page + mapSrc + feeds), 'the footer says decorative feeds and approximate; nothing in the page claims GPS or an exact location');
check(/LOC SRC ip-geo/.test(mapSrc) && /LOC SRC place-name/.test(mapSrc), 'each card says where its location comes from (ip-geo or place-name)');
check(!/@\{r\.username|ud-users|ud-list|ud-log|ud-row|ud-cl|ud-cl-n|clusterDots/.test(page + mapSrc), 'no user list, no log lines with names, no cluster badges, no numbers on the map');
check(/data-testid="ud-tip"/.test(mapSrc) && /<dt>ip<\/dt>/.test(mapSrc) && /HIT_PX = 15/.test(mapSrc), 'the card shows the IP (admin page only) and the hit radius is at least 14 px');
check(/t < 41|t - last < 41/.test(feeds) && /visibilitychange/.test(feeds) && /reducedMotion\(\)/.test(feeds) && /offsetParent === null/.test(feeds), 'the running-code windows run at 24 frames a second at most, stop when hidden, show a still picture with reduced motion and skip closed windows');
check(/pointer-events: none/.test(css) && /\.ud-tab-bar \{[^}]*pointer-events: auto/.test(css), 'the windows let touches through except on their title bars');
check(/ud-fx/.test(page) && /FX \{fx \? 'on' : 'off'\}/.test(page), 'there is an FX switch');
const worker = rd('../../worker/index.js'), tracker = rd('../../src/services/visitTracker.ts');
check(/latitude: coord\(cf\.latitude, 90\), longitude: coord\(cf\.longitude, 180\)/.test(worker) && /validCoords\(j\?\.latitude, j\?\.longitude\)/.test(tracker) && /lat: c\.lat, lng: c\.lng/.test(tracker), 'the Worker tells the caller its approximate coordinates and the visit tracker sends them with the visit');
check(!/geolocation|getCurrentPosition|watchPosition/.test(tracker + rd('../../src/utils/visitorInfo.ts')), 'no location API and no permission prompt is used for this');
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
