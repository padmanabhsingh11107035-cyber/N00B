// NOOB Family Map: the logic (src/family/*), the locking of places, the database (migrations 20261031000001 and 20261031000002) on a REAL Postgres (PGlite) with every migration applied,
// and how the page is wired in.
// Usage: node --liftoff-only scripts/supabase/test-family.mjs
import fs from 'node:fs';
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';
import * as G from '../../src/family/geo.ts';
import * as A from '../../src/family/api.ts';
import * as S from '../../src/family/mapStyle.ts';
import * as K from '../../src/family/consent.ts';
import * as C from '../../src/e2ee/crypto.ts';
import { memoryKeyStore } from '../../src/e2ee/keyring.ts';
import { createDemoApi } from '../../src/family/demoApi.ts';
import { createPlaceCrypto, readPlace } from '../../src/family/sealed.ts';
import { createTracker } from '../../src/family/tracker.ts';
import * as T from '../../src/family/timeline.ts';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

section('1. Distance, freshness, codes (src/family/geo.ts)');
const mumbai = { lat: 19.076, lng: 72.8777 }, delhi = { lat: 28.6139, lng: 77.209 };
const km = G.distanceM(mumbai, delhi) / 1000;
check(km > 1140 && km < 1160 && G.distanceM(mumbai, mumbai) === 0, 'distance Mumbai to Delhi is about 1148 km');
check(G.formatDistance(5) === 'Here' && G.formatDistance(240) === '240 m' && G.formatDistance(1460) === '1.5 km' && G.formatDistance(23400) === '23 km' && G.formatDistance(NaN) === '', 'distances read as words');
const now = Date.parse('2026-10-31T10:00:00Z');
const at = (s) => new Date(now - s * 1000).toISOString();
check(G.freshness(at(30), now) === 'live' && G.freshness(at(90), now) === 'live' && G.freshness(at(91), now) === 'recent' && G.freshness(at(900), now) === 'recent' && G.freshness(at(901), now) === 'old' && G.freshness(null, now) === 'none' && G.freshness('nonsense', now) === 'none', 'live until 90 s, recent until 15 min, then old; no place = none');
check(G.agoText(at(10), now) === 'just now' && G.agoText(at(120), now) === '2 min ago' && G.agoText(at(7300), now) === '2 h ago' && G.agoText(at(90000), now) === 'yesterday' && G.agoText(null, now) === '', '"2 min ago" texts');
check(G.speedText(0.3) === '' && G.speedText(1.4) === '' && G.speedText(10) === 'Moving 36 km/h' && G.speedText(null) === '', 'a person is "moving" only above walking pace noise');
check(G.CODE_ALPHABET.length === 32 && !/[IO01]/.test(G.CODE_ALPHABET), 'the code alphabet has 32 symbols and no look-alikes (I, O, 0, 1)');
check(G.normaliseCode('k7qm-2xpd ') === 'K7QM2XPD' && G.normaliseCode('k7qm2xpdzzz') === 'K7QM2XPD' && G.normaliseCode('I0O1') === '' && G.formatCode('K7QM2XPD') === 'K7QM-2XPD' && G.formatCode('k7q') === 'K7Q', 'a typed code is cleaned (capitals, no dash, no look-alikes, 8 symbols) and shown as XXXX-XXXX');
check(G.isCode('K7QM2XPD') && !G.isCode('K7QM2XP') && !G.isCode('K7QM2XPI'), 'a code is exactly 8 symbols of the alphabet');
check(G.inviteLink('https://noobsocials.com/', 'k7qm-2xpd') === 'https://noobsocials.com/family#join=K7QM2XPD' && G.codeFromHash('#join=K7QM-2XPD') === 'K7QM2XPD' && G.codeFromHash('#join=nope') === '' && G.codeFromHash('') === '', 'the invitation link keeps the code after the # (never sent to a server) and reads it back');
check(G.inviteText('The Sharmas', 'K7QM2XPD', 'https://noobsocials.com').includes('K7QM-2XPD') && G.inviteText('x', 'K7QM2XPD', 'https://a.b').includes('https://a.b/family#join=K7QM2XPD'), 'the invitation text has the code and the link');
check(G.firstName('  Asha  Rao ') === 'Asha' && G.initialOf('asha rao') === 'A' && G.initialOf('') === '?' && G.pinHue('abc') === G.pinHue('abc') && G.pinHue('abc') < 360, 'first name, initial and a steady colour');

section('2. When a phone sends its place, the map helpers');
const f = (lat, lng, extra = {}) => ({ lat, lng, accuracy: 10, heading: null, speed: null, at: 0, ...extra });
const prev = { lat: 19.076, lng: 72.8777, at: 1000 };
check(G.shouldPush(null, f(1, 1), 5) === true, 'the first place is sent at once');
check(G.shouldPush(prev, f(19.07605, 72.8777), 6000) === false, 'moved 5 m: not sent');
check(G.shouldPush(prev, f(19.0762, 72.8777), 2000) === false, 'moved 22 m but only 1 s later: not sent yet');
check(G.shouldPush(prev, f(19.0762, 72.8777), 6000) === true, 'moved 22 m and 5 s later: sent');
check(G.shouldPush(prev, f(19.076, 72.8777), 21001) === true && G.shouldPush(prev, f(19.076, 72.8777), 20999) === false, 'standing still: a heartbeat every 20 s keeps the person "live"');
check(JSON.stringify(G.boundsOf([{ lat: 1, lng: 5 }, { lat: 3, lng: 2 }])) === '[[2,1],[5,3]]' && G.boundsOf([]) === null, 'the box around everybody');
const across = G.lerpLngLat({ lat: 0, lng: 179 }, { lat: 0, lng: -179 }, 0.5);
check(Math.abs(Math.abs(across.lng) - 180) < 1e-9 && G.lerpLngLat({ lat: 0, lng: 10 }, { lat: 10, lng: 20 }, 0.5).lat === 5, 'a pin glides the short way round across the date line');
check(G.easeOut(0) === 0 && G.easeOut(1) === 1 && G.easeOut(0.5) > 0.5, 'gliding starts fast and settles');

section('3. How the database answers are read (src/family/api.ts)');
const keep = (v) => v;
const m1 = A.parseMember({ id: 'u1', name: 'Asha', username: 'asha', avatar: 'https://x.test/a.jpg', role: 'owner', sharing: true, me: true, lat: 19.1, lng: 72.9, speed: 3, updatedAt: '2026-10-31T10:00:00Z' }, keep);
check(m1.name === 'Asha' && m1.lat === 19.1 && m1.me && m1.role === 'owner' && m1.avatar === 'https://x.test/a.jpg' && m1.accuracy === null, 'a member is read with its place');
check(A.parseMember({ id: 'u2', username: 'bob', avatar: 'javascript:alert(1)' }, keep).avatar === '' && A.parseMember({ id: 'u2', avatar: 'data:text/html;base64,AAA' }, keep).avatar === '' && A.parseMember({ id: 'u2', avatar: 'data:image/svg+xml;utf8,x' }, keep).avatar !== '' && A.parseMember({ id: 'u2', avatar: '/m/a.jpg' }, keep).avatar === '/m/a.jpg', 'a picture address from another person is used only when it is http(s), relative or an image (never javascript: or html)');
check(A.parseMember({ id: 'u3', username: 'zed', lat: 'x', lng: null }, keep).name === 'zed' && A.parseMember({ id: 'u3', lat: 'x' }, keep).lat === null, 'a missing name falls back to the username; a place that is not a number is no place');
check(A.parseOutcome({ ok: false, error: 'not_found' }).error === 'not_found' && A.parseOutcome({ ok: false, error: 'room_locked' }).error === 'room_locked' && A.parseOutcome({ ok: false, error: 'something odd' }).error === 'failed' && A.parseOutcome(null).ok === false && A.parseOutcome({ ok: true }).ok === true, 'unknown errors become "failed"');
check(Object.keys(A.ERROR_TEXT).every((k) => A.ERROR_TEXT[k].length > 10) && A.ERROR_TEXT.too_many_tries.includes('10 minutes') && A.ERROR_TEXT.room_locked.includes('locked'), 'every error has a sentence for a person');
const st = A.parseStateOutcome({ ok: true, now: '2026-10-31T10:00:00Z', room: { id: 'r', code: 'K7QM2XPD', name: 'R', emoji: '🏠', role: 'member', memberCount: 2, locked: true }, members: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }, keep);
check(st.ok && st.members.length === 2 && st.now === Date.parse('2026-10-31T10:00:00Z') && st.room.role === 'member' && st.room.locked === true && A.parseRoom({ id: 'x' }).locked === false && A.parseStateOutcome({ ok: false, error: 'not_member' }, keep).error === 'not_member', 'a room state is read');

section('4. The look of the map (src/family/mapStyle.ts)');
const base = { version: 8, sources: {}, layers: [
  { id: 'background', type: 'background', paint: { 'background-color': '#f8f4f0' } },
  { id: 'natural_earth', type: 'raster', source: 'ne', paint: { 'raster-opacity': 0.6 } },
  { id: 'water', type: 'fill', paint: { 'fill-color': 'rgb(158,189,255)', 'fill-outline-color': '#fff' } },
  { id: 'park', type: 'fill', paint: { 'fill-color': '#0f0' } },
  { id: 'road_motorway', type: 'line', paint: { 'line-color': '#f00', 'line-width': 3 } },
  { id: 'road_minor_casing', type: 'line', paint: { 'line-color': '#fff' } },
  { id: 'poi_r20', type: 'symbol', layout: { 'icon-image': 'x' }, paint: {} },
  { id: 'label_country_1', type: 'symbol', layout: { 'text-field': 'x' }, paint: { 'text-color': '#000' } },
  { id: 'building-3d', type: 'fill-extrusion', paint: { 'fill-extrusion-color': '#ccc' } }
] };
const frozen = JSON.stringify(base);
const night = S.nightStyle(base);
const byId = Object.fromEntries(night.layers.map((l) => [l.id, l]));
check(JSON.stringify(base) === frozen, 'the original style is not changed');
check(Array.isArray(byId.background.paint['background-color']) && byId.background.paint['background-color'].includes(S.NIGHT.land) && Array.isArray(byId.water.paint['fill-color']) && byId.water.paint['fill-color'].includes(S.NIGHT.water) && byId.park.paint['fill-color'] === S.NIGHT.green && !('fill-outline-color' in byId.water.paint), 'land and water are recoloured (lighter land from far away)');
check(byId.road_motorway.paint['line-color'] === S.NIGHT.roadMajor && byId.road_motorway.paint['line-width'] === 3 && byId.road_minor_casing.paint['line-color'] === S.NIGHT.casing, 'roads are recoloured and keep their widths; casings are dark');
check(byId.poi_r20.layout.visibility === 'none' && byId.label_country_1.paint['text-color'] === S.NIGHT.labelBright && byId.label_country_1.paint['text-halo-color'] === S.NIGHT.halo && byId['building-3d'].paint['fill-extrusion-color'] === S.NIGHT.building3d, 'shop icons are hidden, country names are bright, buildings are tinted');
check(byId.natural_earth.paint['raster-brightness-max'] < 0.6, 'the shaded relief of the globe is kept dark');
const fb = S.fallbackStyle(true);
check(fb.version === 8 && fb.layers.some((l) => l.type === 'raster') && /openstreetmap/.test(JSON.stringify(fb.sources)) && S.fallbackStyle(false).layers[1].paint['raster-brightness-max'] === undefined, 'a plain OpenStreetMap map is the fallback (darkened only for night)');
check(S.STYLE_URL === 'https://tiles.openfreemap.org/styles/liberty' && S.SKY_NIGHT['atmosphere-blend'][0] === 'interpolate', 'the style comes from OpenFreeMap; the globe has an atmosphere');

section('5. The demo, the remembered switches and the tracker');
const demo = createDemoApi();
const rooms0 = await demo.myRooms();
check(demo.mode === 'demo' && rooms0.length === 1 && G.isCode(rooms0[0].code) && rooms0[0].locked === false, 'the demo starts with one sample room with a valid code');
demo.setAnchor({ lat: 12.97, lng: 77.59 });
const ds = await demo.roomState(rooms0[0].id);
check(ds.ok && ds.members.length === 6 && ds.members.filter((m) => !m.sharing).length === 1 && ds.members.some((m) => m.lat !== null && Date.now() - Date.parse(m.updatedAt) > 20 * 60000) && ds.members.every((m) => !m.sharing || Math.abs(m.lat - 12.97) < 0.05), 'six people around the visitor: one paused sharing, one not heard of for 25 min, the rest live');
check((await demo.createRoom('   ', '🏠', true)).error === 'bad_name' && (await demo.joinRoom('abc', true)).error === 'bad_code' && (await demo.joinRoom('AAAA-AAAA', true)).error === 'not_found' && (await demo.joinRoom('BBBB-BBBB', true)).error === 'room_locked', 'the demo shows the error screens too');
const made = await demo.createRoom('Friends', '🎒', true);
check(made.ok && G.isCode(made.room.code) && (await demo.myRooms()).length === 2 && (await demo.joinRoom(made.room.code, true)).ok && (await demo.leaveRoom(made.room.id)).ok && (await demo.myRooms()).length === 1, 'create, join by the code and leave work in the demo');
check((await demo.rotateCode(rooms0[0].id)).code !== rooms0[0].code && G.isCode((await demo.rotateCode(rooms0[0].id)).code), 'a new code is a valid code');
check((await demo.setLocked(rooms0[0].id, true)).ok && (await demo.myRooms())[0].locked === true && (await demo.setSharingAll(false)).ok && (await demo.getPrefs()).shareDefault === false && (await demo.myRooms())[0].sharing === false, 'the demo has the room lock and the one "share my location" switch');

// the remembered switches (a stand-in for the browser's storage)
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } };
check(K.locationAllowed() === false && K.anyAutoShare() === false && K.backgroundWanted() === true, 'a new device asks, shares nothing by itself and (in the Android app) would keep sharing in the background once allowed');
K.setLocationAllowed(true); K.setAutoShare('u1', true); K.setAutoShare('u2', true);
check(K.locationAllowed() === true && K.autoShareOn('u1') && K.autoShareOn('u2') && !K.autoShareOn('u3') && !K.autoShareOn('') && K.anyAutoShare(), 'once allowed it is remembered, per person');
K.setAutoShare('u1', false); K.setAutoShare('u2', false); K.setLocationAllowed(false); K.setBackgroundWanted(false);
check(!K.anyAutoShare() && !store.has('noob_family_auto_v1') && !K.locationAllowed() && !K.backgroundWanted() && (K.setBackgroundWanted(true), K.backgroundWanted()), 'switching it off forgets it again (and leaves no empty note behind)');
store.set('noob_family_auto_v1', '[1,2]'); store.set('noob_family_loc_v1', 'nonsense');
check(!K.anyAutoShare() && !K.locationAllowed(), 'a damaged note is read as "off", never as a crash');
check(![...store.values()].join(' ').match(/-?\d+\.\d{4,}/), 'only yes/no notes are kept on the phone, never a place');

const log = [];
let stopped = 0, beats = [], deliver = null;
const fakeNow = { t: 100000 };
const tr = createTracker({
  watch: async (onFix) => { deliver = onFix; return () => { stopped++; }; },
  now: () => fakeNow.t,
  every: (fn, ms) => { beats.push({ fn, ms }); return () => { beats = beats.filter((b) => b.fn !== fn); }; }
});
const fakeApi = { pushLocation: async (x) => { log.push(x); } };
await Promise.all([tr.start(fakeApi), tr.start(fakeApi)]);
check(tr.state().running && beats.length === 1 && beats[0].ms === 5000, 'the tracker starts once however many screens ask');
deliver(f(19.076, 72.8777, { at: fakeNow.t }));
check(log.length === 1 && tr.state().fix.lat === 19.076, 'the first place is sent at once and shown');
fakeNow.t += 1000; deliver(f(19.0763, 72.8777, { at: fakeNow.t }));
check(log.length === 1, 'moving 33 m after 1 s: not sent yet');
fakeNow.t += 4000; deliver(f(19.0763, 72.8777, { at: fakeNow.t }));
check(log.length === 2, 'after 5 s it is sent');
fakeNow.t += 21000; beats[0].fn();
check(log.length === 3 && log[2].lat === 19.0763, 'standing still: the heartbeat sends the last place again so the person stays "live"');
const seenStates = []; const off = tr.subscribe((s) => seenStates.push(s.running));
tr.stop();
check(!tr.state().running && stopped === 1 && beats.length === 0 && seenStates.join() === 'true,false', 'stopping stops following and the heartbeat, and tells the screens');
let late = null; const slow = createTracker({ watch: () => new Promise((res) => { late = res; }), now: () => 1, every: () => () => undefined });
const pending = slow.start(fakeApi); slow.stop(); let lateStopped = 0; late(() => { lateStopped++; }); await pending;
check(lateStopped === 1 && !slow.state().running, 'stopped while it was still starting: the late-arriving follower is stopped too');
off();

section('6. A place is locked on the phone (src/family/sealed.ts, src/e2ee)');
const wire = (o) => JSON.stringify({ v: 1, lat: 19.1, lng: 72.9, acc: 12, hdg: 90, spd: 3, at: 1000, ...o });
check(readPlace(wire({}), 5000)?.lat === 19.1 && readPlace(wire({}), 5000)?.speed === 3 && readPlace(wire({ acc: 'x' }), 5000)?.accuracy === null, 'a locked place is read back');
check(readPlace(wire({ lat: 91 }), 5000) === null && readPlace(wire({ lng: -181 }), 5000) === null && readPlace(wire({ lat: null }), 5000) === null && readPlace(wire({ v: 2 }), 5000) === null && readPlace('nope', 5000) === null && readPlace('null', 5000) === null, 'an impossible or foreign place is refused');
check(readPlace(wire({ at: 9e15 }), 5000).at === 5000 + 120000, 'a time far in the future (a wrong clock, or a trick) is held at two minutes ahead');

section('7. The database');
const sql1 = read('supabase/migrations/20261031000001_family_map.sql'), sql2 = read('supabase/migrations/20261031000002_family_sealed.sql'), sql3 = read('supabase/migrations/20261031000003_family_day_report.sql'), sql = sql1 + '\n' + sql2 + '\n' + sql3;
check(['family_rooms', 'family_members', 'family_sealed', 'family_join_misses', 'family_prefs', 'family_timeline', 'family_housekeeping'].every((t) => new RegExp(`alter table public\\.${t} enable row level security`).test(sql)) && /revoke all on public\.family_prefs, public\.family_sealed from public, anon, authenticated/.test(sql2) && !/create policy/.test(sql) && !/grant (select|insert|update|delete|all) on public\.family/.test(sql), 'row-level security on, nothing granted on the tables, no policy: only the functions can reach them');
check((sql.match(/security definer set search_path = public/g) || []).length >= 20 && !/delete from public\.(profiles|posts|messages)|alter table public\.(profiles|posts)/i.test(sql) && /drop table if exists public\.family_locations/.test(sql2) && /drop function if exists public\.family_push_location/.test(sql2), 'every function checks who is asking; the plain places and the function that wrote them are removed; nothing else that exists is touched');
const db = await createTestDb();
// an account the way the importer makes one: the sign-up rules (email check, photo) are for people signing up, the importer's accounts carry a legacy_id and get their profile by hand
const mkUser = async (name, display) => {
  const id = (await db.query('select gen_random_uuid() as id')).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password, raw_user_meta_data) values ($1, $2, 'x', $3::jsonb)`, [id, `${name}@users.nooob.xyz`, JSON.stringify({ legacy_id: `u_${name}` })]);
  await db.query(`insert into public.profiles (id, username, display_name, avatar) values ($1, $2, $3, 'avatars/test.jpg')`, [id, name, display]);
  return id;
};
const rpc = (uid, fn, args = []) => asUser(db, uid, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);
// the same with named arguments, the way the app's database client calls them
const callAs = async (uid, fn, args = {}) => {
  const names = Object.keys(args);
  const vals = names.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]));
  return asUser(db, uid, async () => (await db.query(`select public.${fn}(${names.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, vals)).rows[0].r);
};
const raw = async (q, a = []) => (await db.query(q, a)).rows;
const asha = await mkUser('fam_asha', 'Asha Rao'), ravi = await mkUser('fam_ravi', 'Ravi Kumar Rao'), tina = await mkUser('fam_tina', ''), eve = await mkUser('fam_eve', 'Eve Outsider');
// each phone: its own key store and the real place-locking code, talking to the real database functions
const stores = {}, phone = {};
const phoneOf = (uid) => (phone[uid] ??= createPlaceCrypto({ rpc: (fn, args) => callAs(uid, fn, args), userId: async () => uid, storeFor: () => (stores[uid] ??= memoryKeyStore()), seen: { get: () => null, set: () => undefined }, deviceLabel: () => 'test phone' }));
const fix = (lat, lng, extra = {}) => ({ lat, lng, accuracy: 12.5, heading: 90, speed: 3.2, at: Date.now(), ...extra });
const pushAs = async (uid, roomId, fx) => { const env = await phoneOf(uid).seal(roomId, fx); return { env, res: await callAs(uid, 'family_push_sealed', { p_items: [{ room: roomId, env }] }) }; };
const calm = async () => raw(`update public.family_sealed set updated_at = updated_at - interval '5 seconds'`);
const ivOf = async (uid) => (await raw(`select envelope->>'iv' as iv from public.family_sealed where user_id = $1`, [uid]))[0]?.iv;
const rowsOf = async (uid) => (await raw('select count(*)::int n from public.family_sealed where user_id = $1', [uid]))[0].n;

let denied = '';
try { await asUser(db, asha, () => db.query('select * from public.family_sealed')); } catch (e) { denied = String(e.message || e); }
check(/permission denied/i.test(denied), 'a person cannot read the tables directly', denied);
denied = '';
try { await asAnon(db, () => db.query('select public.family_my_rooms()')); } catch (e) { denied = String(e.message || e); }
check(/permission denied/i.test(denied), 'a visitor without an account cannot call the functions', denied);
check((await raw(`select to_regclass('public.family_locations') as t`))[0].t === null && (await raw(`select count(*)::int n from pg_proc where proname = 'family_push_location'`))[0].n === 0, 'no plain place can be stored any more: the old table and function are gone');

const c1 = await rpc(asha, 'family_create_room', ['  The Raos  ', '🏠', true]);
check(c1.ok && c1.room.name === 'The Raos' && c1.room.role === 'owner' && /^[A-HJ-NP-Z2-9]{8}$/.test(c1.room.code) && c1.room.memberCount === 1 && c1.room.sharing === true && c1.room.locked === false, 'a room is made: trimmed name, a code of 8 safe symbols, the maker is the owner');
check((await rpc(asha, 'family_create_room', ['', null, true])).error === 'bad_name' && (await rpc(asha, 'family_create_room', ['x'.repeat(41), null, true])).error === 'bad_name', 'a room needs a name of 1 to 40 letters');
const codes = new Set();
for (let i = 0; i < 40; i++) codes.add((await raw('select public.family_new_code() as c'))[0].c);
check(codes.size === 40 && [...codes].every((c) => /^[A-HJ-NP-Z2-9]{8}$/.test(c)), 'new codes are different every time and always well formed');

const room = c1.room;
check((await rpc(ravi, 'family_join_room', [`${room.code.slice(0, 4).toLowerCase()}-${room.code.slice(4).toLowerCase()}`, true])).ok, 'a code typed in small letters with a dash works');
const again = await rpc(ravi, 'family_join_room', [room.code, true]);
check(again.ok && again.already === true && (await rpc(ravi, 'family_my_rooms')).length === 1, 'joining twice changes nothing');
check((await rpc(tina, 'family_join_room', ['abc', true])).error === 'bad_code' && (await raw('select count(*)::int n from public.family_join_misses where user_id = $1', [tina]))[0].n === 0, 'a code with the wrong shape is refused and does not count as a guess');
check((await rpc(tina, 'family_join_room', [room.code === 'AAAAAAAA' ? 'BBBBBBBB' : 'AAAAAAAA', true])).error === 'not_found', 'a code that no room has is "not found"');
let last;
for (let i = 0; i < 7; i++) last = await rpc(tina, 'family_join_room', ['ZZZZZZZ' + 'ABCDEFGH'[i], true]); // together with the code above that makes 8 wrong codes
const lockedOut = await rpc(tina, 'family_join_room', [room.code, true]);
check(last.error === 'not_found' && lockedOut.error === 'too_many_tries' && (await rpc(tina, 'family_my_rooms')).length === 0, 'after 8 wrong codes in 10 minutes even the right code is refused (a code cannot be found by trying)');
await raw(`update public.family_join_misses set at = now() - interval '11 minutes' where user_id = $1`, [tina]);
check((await rpc(tina, 'family_join_room', [room.code, false])).ok && (await rpc(tina, 'family_my_rooms'))[0].sharing === false, 'after the pause the code works again; joining without sharing is kept');

let state = await rpc(asha, 'family_room_state', [room.id]);
const byName = (s, n) => s.members.find((m) => m.username === n);
check(state.ok && state.members.length === 3 && byName(state, 'fam_asha').name === 'Asha' && byName(state, 'fam_ravi').name === 'Ravi' && byName(state, 'fam_tina').name === 'fam_tina' && byName(state, 'fam_asha').me === true && byName(state, 'fam_ravi').me === false, 'everybody in the room is listed: first name only, the username when there is no name');
check((await rpc(eve, 'family_room_state', [room.id])).error === 'not_member' && (await callAs(eve, 'family_room_keys', { p_room: room.id })).error === 'not_member', 'a person who is not in the room sees nothing of it, not even the keys it is locked for');

// ---- the locked places, with the real locking code on both sides
const first = await pushAs(ravi, room.id, fix(19.076, 72.8777));
check(first.res.ok && first.res.saved === 1 && Object.keys(first.env.keys).length === 1, 'Ravi\'s phone makes its key, locks his place (so far only for himself: nobody else has a key) and sends it');
state = await rpc(asha, 'family_room_state', [room.id]);
check(byName(state, 'fam_ravi').sealed && Object.keys(byName(state, 'fam_ravi').sealed.keys).length === 0 && byName(state, 'fam_ravi').updatedAt, 'Asha gets the envelope reduced to the locks of her own devices: none yet, so it can not be opened');
const noKey = await phoneOf(asha).open(room.id, ravi, byName(state, 'fam_ravi').sealed);
check(!noKey.ok && noKey.code === 'no-key', 'and her phone, which made its own key just now, says "no key" rather than showing a doubtful place');
phoneOf(ravi).forget();
await calm();
const second = await pushAs(ravi, room.id, fix(19.076, 72.8777, { speed: 3.2 }));
check(Object.keys(second.env.keys).length === 2, 'the next place is locked for both devices (the key lists are refreshed)');
state = await rpc(asha, 'family_room_state', [room.id]);
const sealed = byName(state, 'fam_ravi').sealed;
const opened = await phoneOf(asha).open(room.id, ravi, sealed);
check(Object.keys(sealed.keys).length === 1 && opened.ok && opened.place.lat === 19.076 && opened.place.lng === 72.8777 && opened.place.speed === 3.2 && opened.place.accuracy === 12.5, 'Asha\'s phone opens it: place, speed and accuracy, from the one lock that is hers');
const stored = (await raw('select envelope::text t from public.family_sealed')).map((r) => r.t).join(' ');
check(!/19\.07|72\.87|12\.5/.test(stored) && stored.length > 200, 'the database holds only locked data: no coordinate can be found in it');
check((await phoneOf(eve).open(room.id, ravi, second.env)).code === 'no-key', 'a person outside the room can not open an envelope even if they get hold of it');
check((await phoneOf(asha).open('00000000-0000-4000-8000-000000000001', ravi, sealed)).ok === false, 'a place copied into another room does not open there');
check((await phoneOf(asha).open(room.id, tina, sealed)).ok === false, 'a place that claims to be from somebody else does not open as theirs');
const forged = JSON.parse(JSON.stringify(sealed)); forged.ct = forged.ct.slice(0, -4) + (forged.ct.endsWith('AAAA') ? 'BBBB' : 'AAAA');
check((await phoneOf(asha).open(room.id, ravi, forged)).ok === false, 'a changed envelope does not open');
const ashaKey = (await stores[asha].load()).keys[0];
const imposter = await C.seal(wire({}), { chatId: room.id, sender: ashaKey, recipients: [{ kid: ashaKey.kid, publicJwk: ashaKey.publicJwk }] });
const stolen = { ...imposter, skid: (await stores[ravi].load()).keys[0].kid };
check((await callAs(asha, 'family_push_sealed', { p_items: [{ room: room.id, env: stolen }] })).saved === 0 && (await callAs(asha, 'family_push_sealed', { p_items: [{ room: room.id, env: { v: 1 } }] })).saved === 0 && (await callAs(asha, 'family_push_sealed', { p_items: '"x"' })).ok === false, 'an envelope made with somebody else\'s key id, a broken one, or a wrong shape is not accepted');
check((await callAs(eve, 'family_push_sealed', { p_items: [{ room: room.id, env: imposter }] })).saved === 0 && (await callAs(tina, 'family_push_sealed', { p_items: [{ room: room.id, env: imposter }] })).saved === 0, 'a stranger, or a member who shares with nobody, can not store a place in the room');
const before = await ivOf(ravi);
await pushAs(ravi, room.id, fix(20, 73));
check((await ivOf(ravi)) === before, 'a second place within 2 seconds leaves the first one in place');
await calm();
const third = await pushAs(ravi, room.id, fix(20, 73));
check((await ivOf(ravi)) === third.env.iv && (await rowsOf(ravi)) === 1, 'a later place replaces the old one (one row per person and room, no history)');

await raw(`update public.family_sealed set updated_at = now() - interval '25 hours' where user_id = $1`, [ravi]);
state = await rpc(asha, 'family_room_state', [room.id]);
check(byName(state, 'fam_ravi').sealed === null && byName(state, 'fam_ravi').updatedAt === null, 'a place older than 24 hours is no longer handed out');
await raw(`update public.family_sealed set updated_at = now() where user_id = $1`, [ravi]);
check((await rpc(ravi, 'family_set_sharing', [room.id, false])).ok && byName(await rpc(asha, 'family_room_state', [room.id]), 'fam_ravi').sealed === null && (await rowsOf(ravi)) === 0, 'pausing sharing hides the person at once and removes their stored (locked) place');
check((await callAs(ravi, 'family_push_sealed', { p_items: [{ room: room.id, env: third.env }] })).saved === 0, 'while paused, nothing is stored');
check((await rpc(ravi, 'family_set_sharing', [room.id, true])).ok && (await rpc(eve, 'family_set_sharing', [room.id, true])).error === 'not_member', 'sharing can be resumed; a stranger cannot change anything');

check((await callAs(ravi, 'family_my_prefs')).shareDefault === true && (await callAs(ravi, 'family_set_sharing_all', { p_on: false })).ok && (await callAs(ravi, 'family_my_prefs')).shareDefault === false && (await rpc(ravi, 'family_my_rooms'))[0].sharing === false, 'the one "share my location" switch pauses every room of the person and is remembered');
check((await callAs(ravi, 'family_set_sharing_all', { p_on: true })).ok && (await callAs(ravi, 'family_my_prefs')).shareDefault === true && (await rpc(ravi, 'family_my_rooms'))[0].sharing === true, 'and turns them all on again');

// ---- the room lock, owners, leaving
check((await callAs(ravi, 'family_set_locked', { p_room: room.id, p_locked: true })).error === 'not_owner', 'only the owner can lock the room');
check((await callAs(asha, 'family_set_locked', { p_room: room.id, p_locked: true })).ok && (await rpc(eve, 'family_join_room', [room.code, true])).error === 'room_locked' && (await rpc(ravi, 'family_join_room', [room.code, true])).already === true, 'a locked room accepts nobody new, but a member who knocks again is still in');
check((await callAs(asha, 'family_set_locked', { p_room: room.id, p_locked: false })).ok, 'the owner unlocks it again');
check((await rpc(ravi, 'family_remove_member', [room.id, tina])).error === 'not_owner' && (await rpc(asha, 'family_remove_member', [room.id, asha])).error === 'not_member', 'only the owner can remove people, and not themselves');
check((await rpc(ravi, 'family_rotate_code', [room.id])).error === 'not_owner', 'only the owner can make a new code');
const rot = await rpc(asha, 'family_rotate_code', [room.id]);
check(rot.ok && rot.code !== room.code && (await rpc(eve, 'family_join_room', [room.code, true])).error === 'not_found' && (await rpc(eve, 'family_join_room', [rot.code, true])).ok, 'a new code stops the old one at once');
check((await rpc(asha, 'family_remove_member', [room.id, eve])).ok && (await rpc(eve, 'family_my_rooms')).length === 0 && (await rpc(eve, 'family_room_state', [room.id])).error === 'not_member', 'the owner removes a person: the room is gone for them');

check((await rpc(ravi, 'family_delete_room', [room.id])).error === 'not_owner', 'only the owner can delete the room');
const leave1 = await rpc(asha, 'family_leave_room', [room.id]);
const after = await rpc(ravi, 'family_my_rooms');
check(leave1.ok && after.length === 1 && after[0].role === 'owner' && after[0].ownerId === ravi, 'when the owner leaves, the longest-standing member becomes the owner');
check((await rpc(asha, 'family_leave_room', [room.id])).error === 'not_member', 'leaving twice does nothing');
await calm();
await pushAs(ravi, room.id, fix(22, 75));
await rpc(tina, 'family_leave_room', [room.id]);
await rpc(ravi, 'family_leave_room', [room.id]);
check((await raw('select count(*)::int n from public.family_rooms where id = $1', [room.id]))[0].n === 0 && (await raw('select count(*)::int n from public.family_sealed where room_id = $1', [room.id]))[0].n === 0, 'the last person out closes the room and the locked places go with it');

const c2 = await rpc(asha, 'family_create_room', ['Second', '🎒', true]);
await rpc(ravi, 'family_join_room', [c2.room.code, true]);
await pushAs(ravi, c2.room.id, fix(30, 40));
check((await rpc(asha, 'family_delete_room', [c2.room.id])).ok && (await raw('select count(*)::int n from public.family_members where room_id = $1', [c2.room.id]))[0].n === 0 && (await rowsOf(ravi)) === 0, 'deleting a room removes its people and their locked places');

const c3 = await rpc(asha, 'family_create_room', ['Third', null, true]), c4 = await rpc(asha, 'family_create_room', ['Fourth', null, true]);
await rpc(ravi, 'family_join_room', [c3.room.code, true]); await rpc(ravi, 'family_join_room', [c4.room.code, true]);
await calm();
const two = await phoneOf(ravi).seal(c3.room.id, fix(30, 40)), two4 = await phoneOf(ravi).seal(c4.room.id, fix(30, 40));
const both = await callAs(ravi, 'family_push_sealed', { p_items: [{ room: c3.room.id, env: two }, { room: c4.room.id, env: two4 }] });
check(both.ok && both.saved === 2 && (await rowsOf(ravi)) === 2, 'one send can carry the place for several rooms (each locked for its own room)');
await rpc(ravi, 'family_set_sharing', [c3.room.id, false]);
check((await rowsOf(ravi)) === 1 && byName(await rpc(asha, 'family_room_state', [c3.room.id]), 'fam_ravi').sealed === null && byName(await rpc(asha, 'family_room_state', [c4.room.id]), 'fam_ravi').sealed !== null, 'paused in one room, shared in another: only the room that is paused is blind');
check((await callAs(ravi, 'family_push_sealed', { p_items: Array.from({ length: 11 }, () => ({ room: c4.room.id, env: two4 })) })).ok === false, 'at most 10 rooms in one send');

// limits
const crowd = [];
for (let i = 0; i < 19; i++) crowd.push(await mkUser('fam_c' + i, 'C' + i));
const big = (await rpc(asha, 'family_create_room', ['Big', null, true])).room;
for (const u of crowd) await rpc(u, 'family_join_room', [big.code, true]);
check((await rpc(asha, 'family_room_state', [big.id])).members.length === 20 && (await rpc(eve, 'family_join_room', [big.code, true])).error === 'room_full', 'a room holds 20 people');
const busy = await mkUser('fam_busy', 'Busy');
let lim = null;
for (let i = 0; i < 11; i++) { const r = await rpc(busy, 'family_create_room', ['Room ' + i, null, true]); if (!r.ok) lim = r.error; }
check(lim === 'too_many_rooms' && (await rpc(busy, 'family_my_rooms')).length === 10, 'a person can be in 10 rooms');
const bigKeys = await callAs(asha, 'family_room_keys', { p_room: big.id });
check(bigKeys.ok && bigKeys.members.length === 20, 'the keys of a room are listed for its members');


section('7b. The day report (database)');
const TZI = 'Asia/Kolkata';
const dayOf = async (tz, add = 0) => (await raw(`select (public.family_today($1) + $2::int)::text as d`, [tz, add]))[0].d;
const dayIST = await dayOf(TZI), dayStart = T.dayStartFromKey(dayIST, TZI), dayEnd = T.endOfDay(dayStart + 1, TZI);
const stayWire = (min, len = 20) => T.toWire({ k: 's', a: dayStart + min * 60000, b: dayStart + (min + len) * 60000, lat: 19.0761, lng: 72.8778, r: 24 });
const tripWire = (min) => T.toWire({ k: 't', a: dayStart + min * 60000, b: dayStart + (min + 15) * 60000, d: 4200, m: 'd', path: [[19.076, 72.8777], [19.09, 72.89], [19.1, 72.9]] });
const rd = (await rpc(asha, 'family_create_room', ['Day room', null, true])).room;
await rpc(ravi, 'family_join_room', [rd.code, true]); await rpc(tina, 'family_join_room', [rd.code, true]);
const send = async (uid, items) => callAs(uid, 'family_push_timeline', { p_items: items });
const lock = async (uid, wire) => phoneOf(uid).sealJson(rd.id, 'day', wire);
const item = async (uid, seq, wire, extra = {}) => ({ room: rd.id, day: dayIST, tz: TZI, seq, env: await lock(uid, wire), ...extra });
const count = async (uid) => (await raw('select count(*)::int n from public.family_timeline where user_id = $1', [uid]))[0].n;
const calmTimeline = async () => raw(`update public.family_timeline set updated_at = updated_at - interval '5 seconds'`);

check(!/create policy/.test(sql3) && /alter table public\.family_timeline enable row level security/.test(sql3) && /revoke all on public\.family_timeline, public\.family_housekeeping from public, anon, authenticated/.test(sql3), 'the report table has row-level security on and nothing granted: only the functions reach it');
let stateD = await rpc(asha, 'family_room_state', [rd.id]);
check(stateD.members.every((m) => m.report === false) && (await rpc(ravi, 'family_my_rooms')).every((r) => r.report === false), 'nobody has the day report on until they switch it on');
check((await send(ravi, [await item(ravi, 1, stayWire(10))])).saved === 0, 'a report from somebody who has not switched it on is not stored');
check((await callAs(ravi, 'family_my_prefs')).reportDefault === false && (await callAs(ravi, 'family_set_report_all', { p_on: true })).ok && (await callAs(asha, 'family_set_report_all', { p_on: true })).ok && (await callAs(ravi, 'family_my_prefs')).reportDefault === true, 'the switch is one for all rooms and is remembered');
stateD = await rpc(asha, 'family_room_state', [rd.id]);
check(byName(stateD, 'fam_ravi').report === true && byName(stateD, 'fam_asha').report === true && byName(stateD, 'fam_tina').report === false && (await rpc(ravi, 'family_my_rooms'))[0].report === true, 'the room shows who shares a report (and nothing else about it)');
const r2 = (await rpc(asha, 'family_create_room', ['Second report room', null, true])).room;
const r3 = (await rpc(eve, 'family_create_room', ['Eve room', null, true])).room;
await rpc(asha, 'family_join_room', [r3.code, false]);
check((await rpc(asha, 'family_my_rooms')).find((r) => r.id === r2.id).report === true && (await rpc(asha, 'family_my_rooms')).find((r) => r.id === r3.id).report === false, 'a room made later starts with the report on for a person who switched it on and shares; a room joined without sharing starts with it off');

// ---- sending, reading, who may see
const it1 = await item(ravi, 600, stayWire(10)), it2 = await item(ravi, 630, tripWire(30));
const sent1 = await send(ravi, [it1, it2]);
check(sent1.ok && sent1.saved === 2 && (await count(ravi)) === 2, 'Ravi sends a stay and a trip, locked on his phone: both are taken');
const stored2 = (await raw('select envelope::text t from public.family_timeline')).map((r) => r.t).join(' ');
check(!/19\.076|72\.877|4200/.test(stored2) && stored2.length > 400, 'the database holds only locked data: no coordinate, no distance can be found in it');
const got = await callAs(asha, 'family_timeline_get', { p_room: rd.id, p_user: ravi });
check(got.ok && got.on === true && got.rows.length === 2 && got.seqs.join() === '600,630' && got.rows[0].tz === TZI && got.rows[0].day === dayIST, 'a member of the room reads the report of today (its day, its time zone, the numbers of its parts)');
const openedDay = await phoneOf(asha).openJson(rd.id, 'day', ravi, got.rows[0].env);
const asStay = openedDay.ok ? T.fromWire(openedDay.value, dayStart, dayEnd) : null;
check(openedDay.ok && asStay && asStay.k === 's' && asStay.a === dayStart + 10 * 60000 && asStay.lat === 19.0761 && Object.keys(got.rows[0].env.keys).length === 1, "Asha's phone opens it: the stay is as it was sent, and the envelope carries only her own lock");
const asTrip = T.fromWire((await phoneOf(asha).openJson(rd.id, 'day', ravi, got.rows[1].env)).value, dayStart, dayEnd);
check(asTrip && asTrip.k === 't' && asTrip.d === 4200 && asTrip.path.length === 3, 'and the trip with its route');
const tinaGot = await callAs(tina, 'family_timeline_get', { p_room: rd.id, p_user: ravi });
check(tinaGot.ok && tinaGot.rows.length === 2 && Object.keys(tinaGot.rows[0].env.keys).length === 0 && (await phoneOf(tina).openJson(rd.id, 'day', ravi, tinaGot.rows[0].env)).ok === false, 'a member who has no key for it gets the locked data and can not open it');
check((await callAs(eve, 'family_timeline_get', { p_room: rd.id, p_user: ravi })).error === 'not_member' && (await callAs(asha, 'family_timeline_get', { p_room: rd.id, p_user: eve })).error === 'not_member', 'a stranger can not read it, and nobody can read the report of somebody who is not in the room');
const none = await callAs(asha, 'family_timeline_get', { p_room: rd.id, p_user: tina });
check(none.ok && none.on === false && none.rows.length === 0, 'a person who has not switched it on shows nothing');
const placeEnv = await phoneOf(ravi).seal(rd.id, fix(19.1, 72.9));
check((await phoneOf(asha).openJson(rd.id, 'day', ravi, placeEnv)).ok === false && (await phoneOf(asha).open(rd.id, ravi, got.rows[0].env)).ok === false, 'a live place can not be passed off as a report, nor a report as a place (what is locked is bound to what it is for)');
check((await phoneOf(asha).openJson(r2.id, 'day', ravi, got.rows[0].env)).ok === false, 'and a report of one room does not open as the report of another');

// ---- only today of the person's own time zone
const bad = async (over) => (await send(ravi, [{ ...(await item(ravi, 700, stayWire(40))), ...over }])).saved;
check((await bad({ day: await dayOf(TZI, -1) })) === 0 && (await bad({ day: await dayOf(TZI, 1) })) === 0, 'a report of yesterday or of tomorrow (a wrong clock) is not stored');
check((await bad({ tz: 'Nope/Zone' })) === 0 && (await bad({ tz: 'x'.repeat(70) })) === 0 && (await bad({ tz: '; drop table x' })) === 0 && (await bad({ day: '2026-13-45' })) === 0 && (await bad({ day: 'today' })) === 0 && (await bad({ seq: 1601 })) === 0 && (await bad({ seq: '-1' })) === 0 && (await bad({ room: 'nope' })) === 0, 'odd input (a time zone or day that does not exist, a number out of range, an injection) is skipped, never an error');
check((await bad({ env: undefined })) === 0 && (await bad({ env: { v: 1 } })) === 0 && (await bad({ env: it1.env, room: r3.id })) === 0, 'no envelope, a broken one, or a room the person is not in: skipped');
check((await send(asha, [{ ...(await item(ravi, 701, stayWire(40))) }])).saved === 0 && (await send(ravi, [await item(asha, 701, stayWire(40))])).saved === 0, 'an envelope made with somebody else\'s key is not accepted as mine');
check((await send(ravi, '"x"')).ok === false && (await send(ravi, Array.from({ length: 41 }, () => it1))).ok === false && (await send(ravi, [])).saved === 0, 'a wrong shape or more than 40 parts in one go is refused');
const KIR = 'Pacific/Kiritimati', PAG = 'Pacific/Pago_Pago';
const dK = await dayOf(KIR), dP = await dayOf(PAG);
check(dK !== dP, 'at any moment these two places are on different days (the test needs it)');
check((await send(ravi, [{ ...(await item(ravi, 5, stayWire(10))), tz: KIR, day: dK }])).saved === 1 && (await send(ravi, [{ ...(await item(ravi, 6, stayWire(10))), tz: KIR, day: dP }])).saved === 0, 'every person has their own day: it is today in Kiritimati only with the date of Kiritimati');
let afterTz = await callAs(asha, 'family_timeline_get', { p_room: rd.id, p_user: ravi });
check(afterTz.seqs.join() === '5' && await count(ravi) === 1, 'a new time zone replaces the old report at once (nothing of two days is mixed)');
await calmTimeline();
check((await send(ravi, [it1, it2])).saved === 2 && (await count(ravi)) === 2, 'and back again');

// ---- 00:00: nothing of an old day is handed out or kept
await raw(`update public.family_housekeeping set purged_at = now()`); // the clean-up is not due yet
await raw(`update public.family_timeline set day = day - 1 where user_id = $1`, [ravi]); // the clocks of his time zone have just passed 00:00
const midnight = await callAs(asha, 'family_timeline_get', { p_room: rd.id, p_user: ravi });
check(midnight.ok && midnight.rows.length === 0 && midnight.seqs.length === 0 && (await count(ravi)) === 2, 'the moment the day is over nothing of it is handed out, even before the clean-up has run');
await raw(`update public.family_housekeeping set purged_at = 'epoch'`);
await callAs(asha, 'family_timeline_get', { p_room: rd.id, p_user: ravi });
check((await count(ravi)) === 0, 'and the next call deletes it for good');
check((await send(ravi, [it1])).saved === 1 && (await send(ravi, [{ ...it1, seq: 601 }])).saved === 1, 'a new day starts empty and accepts the new day');
await raw(`insert into public.family_timeline (room_id, user_id, day, tz, seq, envelope) values ($1, $2, public.family_today($3) - 1, $3, 9, '{}'::jsonb)`, [rd.id, ravi, TZI]);
check((await count(ravi)) >= 2, 'an old row can exist before the clean-up');
await raw(`update public.family_housekeeping set purged_at = 'epoch'`);
await calmTimeline();
await send(ravi, [it1]);
check((await raw(`select count(*)::int n from public.family_timeline where user_id = $1 and day < public.family_today(tz)`, [ravi]))[0].n === 0, 'sending also clears what is left of an older day');
await raw(`update public.family_timeline set updated_at = now() - interval '3 days' where user_id = $1`, [ravi]);
check((await raw('select public.family_purge_timeline() as n'))[0].n >= 1 && (await count(ravi)) === 0, 'anything not touched for 48 hours goes, whatever its day');
check(/cron\.schedule\('noob-family-purge', '\* \* \* \* \*'/.test(sql3) && /\(now\(\) at time zone t\.tz\)::date/.test(sql3) && /family_purge_if_due\(\)/.test(sql3), 'the clean-up also runs every minute where the database has pg_cron, and uses the clock of every row\'s own time zone');

// ---- limits and the guard against a flood
await send(ravi, [it1]); await send(ravi, [it2]);
check((await send(ravi, [it1])).saved === 0, 'the same part sent again within 2 seconds is ignored');
await calmTimeline();
await raw(`delete from public.family_timeline where user_id = $1`, [ravi]);
await raw(`insert into public.family_timeline (room_id, user_id, day, tz, seq, envelope, updated_at) select $1, $2, $3::date, $4, g, '{}'::jsonb, now() - interval '1 minute' from generate_series(1, 700) g`, [rd.id, ravi, dayIST, TZI]);
check((await send(ravi, [await item(ravi, 800, stayWire(60))])).saved === 0 && (await send(ravi, [await item(ravi, 5, stayWire(60))])).saved === 1, 'a person can have at most 700 parts in a room: a new one is refused, an existing one can still be updated');
await raw(`delete from public.family_timeline where user_id = $1`, [ravi]);

// ---- switching off, pausing, leaving: gone at once
await send(ravi, [it1]);
check((await count(ravi)) === 1 && (await rpc(ravi, 'family_set_sharing', [rd.id, false])).ok && (await count(ravi)) === 0, 'pausing the location removes the report from that room at once');
await rpc(ravi, 'family_set_sharing', [rd.id, true]); await calmTimeline();
check(byName(await rpc(asha, 'family_room_state', [rd.id]), 'fam_ravi').report === true && (await send(ravi, [it1])).saved === 1, 'resuming brings the report back (from then on)');
check((await callAs(ravi, 'family_set_report_all', { p_on: false })).ok && (await count(ravi)) === 0 && (await callAs(ravi, 'family_my_prefs')).reportDefault === false && byName(await rpc(asha, 'family_room_state', [rd.id]), 'fam_ravi').report === false, 'switching the report off deletes every report of the person at once');
check((await send(ravi, [it1])).saved === 0, 'and nothing more is taken');
await callAs(ravi, 'family_set_report_all', { p_on: true }); await calmTimeline();
await send(ravi, [it1]);
await rpc(ravi, 'family_leave_room', [rd.id]);
check((await count(ravi)) === 0, 'leaving the room deletes the person\'s report in it');
await rpc(ravi, 'family_join_room', [rd.code, true]);
await send(asha, [await item(asha, 3, stayWire(5))]);
check((await count(asha)) >= 1 && (await rpc(asha, 'family_delete_room', [rd.id])).ok && (await raw('select count(*)::int n from public.family_timeline where room_id = $1', [rd.id]))[0].n === 0, 'deleting the room deletes every report in it');
await raw('delete from auth.users where id = $1', [tina]);
check((await raw('select count(*)::int n from public.family_timeline where user_id = $1', [tina]))[0].n === 0, 'deleting an account removes its reports');
await raw(`update public.platform_settings set disabled_features = array['family'] where id = true`);
check((await callAs(asha, 'family_set_report_all', { p_on: true })).error === 'switched_off' && (await send(asha, [])).error === 'switched_off', 'when Family Map is switched off by the administrator no report is taken');
await raw(`update public.platform_settings set disabled_features = '{}' where id = true`);

// the administrators' Pages switch
await raw(`update public.platform_settings set disabled_features = array['family'] where id = true`);
const off2 = await rpc(eve, 'family_create_room', ['Nope', null, true]);
const offJoin = await rpc(eve, 'family_join_room', [big.code, true]);
const offPush = await callAs(asha, 'family_push_sealed', { p_items: [] });
check(off2.error === 'switched_off' && offJoin.error === 'switched_off' && offPush.error === 'switched_off' && (await rpc(crowd[0], 'family_my_rooms')).length === 1, 'when Family Map is switched off no new room, member or place is accepted, and nothing is deleted');
await raw(`update public.platform_settings set disabled_features = '{}' where id = true`);
check((await rpc(eve, 'family_create_room', ['Back', null, true])).ok, 'switched on again, it works again');

// deleting an account removes everything of the person
await raw('delete from auth.users where id = $1', [crowd[1]]);
check((await raw('select count(*)::int n from public.family_members where user_id = $1', [crowd[1]]))[0].n === 0, 'deleting an account removes its rooms membership and place');

section('8. How the page is wired in');
const vite = read('vite.config.ts'), headers = read('public/_headers'), page = read('family.html'), feats = read('src/utils/features.ts'), app = read('src/App.tsx'), feed = read('src/components/Feed/FeedView.tsx');
const main = read('src/components/Family/main.tsx'), live = read('src/family/liveApi.ts'), canvas = read('src/components/Family/MapCanvas.tsx'), css = read('src/components/Family/family.css');
const sealedSrc = read('src/family/sealed.ts'), pkg = read('package.json'), tracker = read('src/components/Family/FamilyTracker.tsx'), bgSrc = read('src/family/background.ts');
check(/family: path\.resolve\(__dirname, 'family\.html'\)/.test(vite) && (vite.match(/\/\^\\\/family\(/g) || []).length === 2, 'the build makes family.html and /family opens it while developing and in the preview');
check(/<title>NOOB Family Map/.test(page) && /canonical" href="https:\/\/noobsocials\.com\/family"/.test(page) && /src="\/src\/components\/Family\/main\.tsx"/.test(page) && /name="viewport"[^>]*viewport-fit=cover/.test(page), 'family.html: title, canonical address, entry script, phone viewport');
const familyCsp = (headers.match(/\n\/family\n[\s\S]*?\n\/family\.html\n/) || [''])[0];
check(/script-src 'self' blob:;/.test(familyCsp) && /connect-src 'self' https:\/\/tiles\.openfreemap\.org https:\/\/tile\.openstreetmap\.org https:\/\/abffssydapumuhwgzeck\.supabase\.co/.test(familyCsp) && /worker-src 'self' blob:/.test(familyCsp) && !/unsafe-eval/.test(familyCsp) && /frame-ancestors 'none'/.test(familyCsp) && /\n\/family\.html\n/.test(headers), '/family has its own strict policy: map servers and the database only, no eval, no frames');
check((headers.match(/connect-src 'self' https:\/\/tiles\.openfreemap\.org https:\/\/tile\.openstreetmap\.org https:\/\/api\.pwnedpasswords\.com/g) || []).length === 1, 'the whole app (which shows the same map inside itself) may reach the two map servers');
check(/Permissions-Policy: [^\n]*geolocation=\(self\)/.test(headers), 'the location permission is allowed for the site itself');
check(/key: 'family'/.test(feats) && /FamilyHost/.test(app) && /featuresOff\.has\('family'\)\) closeFamily\(\)/.test(app) && /featOn\('family'\)/.test(feed) && /openFamily\(\)/.test(feed) && /data-testid="menu-family"/.test(feed), 'an admin switch (Pages > Family Map), the host in the app and the Home menu entry');
const chat = read('src/components/Chat/ChatView.tsx');
check(/data-testid="messages-family-map"/.test(chat) && /useFeatureOn\('family'\)/.test(chat) && /onClick=\{openFamily\}/.test(chat) && /familyOn && \(/.test(chat) && chat.indexOf('messages-new-chat') < chat.indexOf('messages-family-map') && chat.indexOf('messages-family-map') < chat.indexOf('messages-people'), 'the Messages page has a Family Map round button next to search and find-a-person (hidden when the administrator switches Family Map off)');
check(/<FamilyTracker \/>/.test(app) && /anyAutoShare\(\)\) return/.test(tracker) && /startTracker\(liveApi, false\)/.test(tracker) && /permissionState\(\)\) !== 'granted'/.test(tracker), 'the app keeps sharing by itself for people who turned it on, loads nothing for the others and never asks for a permission on its own');
check(/import\('\.\.\/\.\.\/family\/liveApi\.ts'\)/.test(main) && !/^import .*liveApi/m.test(main) && /has\('demo'\)/.test(main) && /codeFromHash/.test(main), 'the page loads the login and database code only when it is not the demo');
check(/import\('maplibre-gl'\)/.test(canvas) && !/^import [^t].* from 'maplibre-gl'/m.test(canvas) && /import\('maplibre-gl\/dist\/maplibre-gl\.css'\)/.test(canvas), 'the map code is fetched only when a map is shown');
check(/import\('maplibre-gl\/dist\/maplibre-gl-worker\.mjs\?url'\)/.test(canvas) && /setWorkerUrl\(worker\.default\)/.test(canvas) && /setWorkerUrl\(worker\.default\)[\s\S]*new gl\.Map\(/.test(canvas), 'the map is told where its worker file is before the first map is made (the library would look next to its renamed build file and find nothing)');
check(!/p_lat|family_push_location/.test(live) && /family_push_sealed/.test(live) && /places\.seal\(/.test(live) && /places\.open\(/.test(live) && /createPlaceCrypto/.test(live) && /family_room_keys/.test(sealedSrc) && /C\.seal\(/.test(sealedSrc) && /C\.open\(/.test(sealedSrc), 'the page never sends a plain place: it is locked before it leaves the phone and opened only on the phone');
check(/server - p\.at > 10 \* 60_000/.test(live), 'a place that says it is older than the server\'s clock is shown as older (the server can not make an old place look fresh)');
const sources = ['src/components/Family/FamilyMap.tsx', 'src/components/Family/Gate.tsx', 'src/components/Family/RoomView.tsx', 'src/components/Family/Sheets.tsx', 'src/components/Family/parts.tsx', 'src/components/Family/MapCanvas.tsx', 'src/components/Family/FamilyTracker.tsx', 'src/family/markers.ts', 'src/family/liveApi.ts', 'src/family/locate.ts', 'src/family/sealed.ts', 'src/family/tracker.ts', 'src/family/trackerLive.ts', 'src/family/background.ts', 'src/family/consent.ts'].map((p) => [p, read(p)]);
check(sources.every(([, t]) => !/dangerouslySetInnerHTML|\.innerHTML\s*=|insertAdjacentHTML|eval\(|new Function/.test(t)), 'no HTML is built from text: names and pictures of other people only go in as text or as a picture address');
check(sources.every(([, t]) => !/(localStorage|sessionStorage)\.setItem\([^)]*\b(lat|lng|latitude|longitude|fix)\b/.test(t)) && /noob_family_last_v1/.test(read('src/components/Family/FamilyMap.tsx')) && /noob_family_prefs_v1/.test(read('src/components/Family/RoomView.tsx')), 'the phone saves only the last room, the map style and yes/no switches, never a place');
check(/@capacitor-community\/background-geolocation/.test(pkg) && /registerPlugin<BgPlugin>\('BackgroundGeolocation'\)/.test(bgSrc) && /backgroundSupported\(\)/.test(bgSrc) && /getPlatform\(\) === 'android'/.test(bgSrc) && /requestPermissions: askPermission/.test(bgSrc), 'the Android app has the background service (its plugin is installed, asked by name, only on Android, and it asks for the permission only when the person is looking at Family Map)');
// every database function the page calls exists with the same argument names
const sigs = Object.fromEntries([...sql.matchAll(/create or replace function public\.(family_\w+)\(([^)]*)\)/g)].map((m) => [m[1], m[2].split(',').map((x) => x.trim().split(/\s+/)[0]).filter(Boolean)]));
const calls = [...live.matchAll(/call\('(family_\w+)'(?:, \{([^}]*)\})?/g), ...sealedSrc.matchAll(/rpc\('(family_\w+)', \{([^}]*)\}/g)].map((m) => [m[1], (m[2] || '').split(',').map((x) => x.trim().split(':')[0]).filter(Boolean)]);
const names = new Set(calls.map(([fn]) => fn));
check(names.size === 17 && calls.every(([fn, keys]) => sigs[fn] && keys.every((k) => sigs[fn].includes(k))), 'the page calls 17 database functions, each with argument names that exist in the SQL', JSON.stringify(calls.filter(([fn, keys]) => !sigs[fn] || !keys.every((k) => sigs[fn].includes(k)))) + ' ' + [...names].join());
const cssBare = css.replace(/\/\*[\s\S]*?\*\//g, '');
const sels = [...cssBare.matchAll(/(^|\n|\})\s*([^@{}\n][^{}]*)\{/g)].flatMap((m) => m[2].split(/,(?![^(]*\))/)).map((x) => x.trim()).filter(Boolean);
const loose = sels.filter((x) => !/^(:where\(\.fm-root[ )]|\.fm-|\.maplibregl-|\d+%|from|to)/.test(x));
check(sels.length > 100 && loose.length === 0, 'every style rule starts with fm- (or is a map control inside .fm-root): nothing can touch the rest of the app', loose.slice(0, 5).join(' | '));
check(/prefers-reduced-motion: reduce/.test(css) && !/https?:\/\//.test(css), 'quiet for people who asked for less motion; no outside address in the style sheet');
check(fs.existsSync('docs/FAMILY-MAP.md') && /test-family\.mjs/.test(pkg), 'documented, and part of the test chain');

section('9. The legal pages say it');
const legal = { privacy: read('src/components/Legal/PrivacyPolicy.tsx'), terms: read('src/components/Legal/TermsAndConditions.tsx'), e2ee: read('src/components/Legal/EndToEndEncryption.tsx'), privacyPage: read('public/privacy.html'), termsPage: read('public/terms.html'), deletePage: read('public/data-deletion.html') };
check([legal.privacy, legal.privacyPage].every((t) => /Family Map/.test(t) && /precise location/i.test(t) && /end-to-end encrypted/i.test(t) && /OpenFreeMap/.test(t) && /24 hours/.test(t) && /background/i.test(t) && /day report/i.test(t) && /midnight/i.test(t) && /at once/i.test(t)), 'the Privacy Policy (in the app and on the website) lists the precise location, who sees it, that it is locked, how long it is kept, the Android background service, the map companies and the day report (what it holds, that it is deleted at midnight and when it is switched off)');
check([legal.terms, legal.termsPage].every((t) => /Family Map/.test(t) && /consent/i.test(t) && /emergenc/i.test(t) && /(parent|guardian)/i.test(t) && /day report/i.test(t)), 'the Terms (in the app and on the website) ask for everybody\'s consent, say it is not an emergency service, put the guardian in charge of a child and say the day report is only for people who switch it on themselves');
check(/Family Map/.test(legal.e2ee) && /Family Map/.test(legal.deletePage) && /day report/i.test(legal.e2ee) && /day report/i.test(legal.deletePage), 'the encryption page and the data-deletion page mention Family Map and the day report');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
