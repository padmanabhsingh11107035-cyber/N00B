// NOOB Family Map: the logic (src/family/*), the database (migration 20261031000001) on a REAL Postgres (PGlite) with every migration applied, and how the page is wired in.
// Usage: node --liftoff-only scripts/supabase/test-family.mjs
import fs from 'node:fs';
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';
import * as G from '../../src/family/geo.ts';
import * as A from '../../src/family/api.ts';
import * as S from '../../src/family/mapStyle.ts';
import { createDemoApi } from '../../src/family/demoApi.ts';

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
check(A.parseOutcome({ ok: false, error: 'not_found' }).error === 'not_found' && A.parseOutcome({ ok: false, error: 'something odd' }).error === 'failed' && A.parseOutcome(null).ok === false && A.parseOutcome({ ok: true }).ok === true, 'unknown errors become "failed"');
check(Object.keys(A.ERROR_TEXT).every((k) => A.ERROR_TEXT[k].length > 10) && A.ERROR_TEXT.too_many_tries.includes('10 minutes'), 'every error has a sentence for a person');
const st = A.parseStateOutcome({ ok: true, now: '2026-10-31T10:00:00Z', room: { id: 'r', code: 'K7QM2XPD', name: 'R', emoji: '🏠', role: 'member', memberCount: 2 }, members: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }, keep);
check(st.ok && st.members.length === 2 && st.now === Date.parse('2026-10-31T10:00:00Z') && st.room.role === 'member' && A.parseStateOutcome({ ok: false, error: 'not_member' }, keep).error === 'not_member', 'a room state is read');

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

section('5. The demo (src/family/demoApi.ts): made-up people, no database');
const demo = createDemoApi();
const rooms0 = await demo.myRooms();
check(demo.mode === 'demo' && rooms0.length === 1 && G.isCode(rooms0[0].code), 'the demo starts with one sample room with a valid code');
demo.setAnchor({ lat: 12.97, lng: 77.59 });
const ds = await demo.roomState(rooms0[0].id);
check(ds.ok && ds.members.length === 6 && ds.members.filter((m) => !m.sharing).length === 1 && ds.members.some((m) => m.lat !== null && Date.now() - Date.parse(m.updatedAt) > 20 * 60000) && ds.members.every((m) => !m.sharing || Math.abs(m.lat - 12.97) < 0.05), 'six people around the visitor: one paused sharing, one not heard of for 25 min, the rest live');
check((await demo.createRoom('   ', '🏠', true)).error === 'bad_name' && (await demo.joinRoom('abc', true)).error === 'bad_code' && (await demo.joinRoom('AAAA-AAAA', true)).error === 'not_found', 'the demo shows the error screens too');
const made = await demo.createRoom('Friends', '🎒', true);
check(made.ok && G.isCode(made.room.code) && (await demo.myRooms()).length === 2 && (await demo.joinRoom(made.room.code, true)).ok && (await demo.leaveRoom(made.room.id)).ok && (await demo.myRooms()).length === 1, 'create, join by the code and leave work in the demo');
check((await demo.rotateCode(rooms0[0].id)).code !== rooms0[0].code && G.isCode((await demo.rotateCode(rooms0[0].id)).code), 'a new code is a valid code');

section('6. The database');
const sql = read('supabase/migrations/20261031000001_family_map.sql');
check(['family_rooms', 'family_members', 'family_locations', 'family_join_misses'].every((t) => new RegExp(`alter table public\\.${t} enable row level security`).test(sql)) && /revoke all on public\.family_rooms, public\.family_members, public\.family_locations, public\.family_join_misses from public, anon, authenticated/.test(sql) && !/create policy/.test(sql) && !/grant (select|insert|update|delete|all) on public\.family/.test(sql), 'row-level security on, nothing granted on the four tables, no policy: only the functions can reach them');
check((sql.match(/security definer set search_path = public/g) || []).length >= 12 && !/drop table|delete from public\.(profiles|posts|messages)|alter table public\.(profiles|posts)/i.test(sql), 'every function checks who is asking; nothing that exists is changed or removed');
const db = await createTestDb();
// an account the way the importer makes one: the sign-up rules (email check, photo) are for people signing up, the importer's accounts carry a legacy_id and get their profile by hand
const mkUser = async (name, display) => {
  const id = (await db.query('select gen_random_uuid() as id')).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password, raw_user_meta_data) values ($1, $2, 'x', $3::jsonb)`, [id, `${name}@users.nooob.xyz`, JSON.stringify({ legacy_id: `u_${name}` })]);
  await db.query(`insert into public.profiles (id, username, display_name, avatar) values ($1, $2, $3, 'avatars/test.jpg')`, [id, name, display]);
  return id;
};
const rpc = (uid, fn, args = []) => asUser(db, uid, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);
const raw = async (q, a = []) => (await db.query(q, a)).rows;
const asha = await mkUser('fam_asha', 'Asha Rao'), ravi = await mkUser('fam_ravi', 'Ravi Kumar Rao'), tina = await mkUser('fam_tina', ''), eve = await mkUser('fam_eve', 'Eve Outsider');

let denied = '';
try { await asUser(db, asha, () => db.query('select * from public.family_locations')); } catch (e) { denied = String(e.message || e); }
check(/permission denied/i.test(denied), 'a person cannot read the tables directly', denied);
denied = '';
try { await asAnon(db, () => db.query('select public.family_my_rooms()')); } catch (e) { denied = String(e.message || e); }
check(/permission denied/i.test(denied), 'a visitor without an account cannot call the functions', denied);

const c1 = await rpc(asha, 'family_create_room', ['  The Raos  ', '🏠', true]);
check(c1.ok && c1.room.name === 'The Raos' && c1.room.role === 'owner' && /^[A-HJ-NP-Z2-9]{8}$/.test(c1.room.code) && c1.room.memberCount === 1 && c1.room.sharing === true, 'a room is made: trimmed name, a code of 8 safe symbols, the maker is the owner');
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
for (let i = 0; i < 7; i++) last = await rpc(tina, 'family_join_room', ['ZZZZZZZ' + 'ABCDEFGH'[i], true]); // together with the "AAAAAAAA" above that makes 8 wrong codes
const locked = await rpc(tina, 'family_join_room', [room.code, true]);
check(last.error === 'not_found' && locked.error === 'too_many_tries' && (await rpc(tina, 'family_my_rooms')).length === 0, 'after 8 wrong codes in 10 minutes even the right code is refused (a code cannot be found by trying)');
await raw(`update public.family_join_misses set at = now() - interval '11 minutes' where user_id = $1`, [tina]);
check((await rpc(tina, 'family_join_room', [room.code, false])).ok && (await rpc(tina, 'family_my_rooms'))[0].sharing === false, 'after the pause the code works again; joining without sharing is kept');

let state = await rpc(asha, 'family_room_state', [room.id]);
const byName = (s, n) => s.members.find((m) => m.username === n);
check(state.ok && state.members.length === 3 && byName(state, 'fam_asha').name === 'Asha' && byName(state, 'fam_ravi').name === 'Ravi' && byName(state, 'fam_tina').name === 'fam_tina' && byName(state, 'fam_asha').me === true && byName(state, 'fam_ravi').me === false, 'everybody in the room is listed: first name only, the username when there is no name');
check((await rpc(eve, 'family_room_state', [room.id])).error === 'not_member', 'a person who is not in the room sees nothing of it');

await rpc(ravi, 'family_push_location', [19.076, 72.8777, 12.5, 90, 3.2]);
state = await rpc(asha, 'family_room_state', [room.id]);
check(byName(state, 'fam_ravi').lat === 19.076 && byName(state, 'fam_ravi').lng === 72.8777 && byName(state, 'fam_ravi').speed > 3 && byName(state, 'fam_ravi').updatedAt, 'a place sent by one person is seen by the other');
check(byName(state, 'fam_tina').lat === null && byName(state, 'fam_tina').sharing === false, 'a person who does not share has no place on the map');
await rpc(ravi, 'family_push_location', [20, 73, null, null, null]);
check((await raw('select lat::float8 as lat from public.family_locations where user_id = $1', [ravi]))[0].lat === 19.076, 'a second place within 2 seconds is ignored');
await raw(`update public.family_locations set updated_at = now() - interval '5 seconds' where user_id = $1`, [ravi]);
await rpc(ravi, 'family_push_location', [20, 73, null, null, null]);
check((await raw('select lat::float8 as lat, accuracy from public.family_locations where user_id = $1', [ravi]))[0].lat === 20, 'a later place replaces the old one (only the last place is kept, one row per person)');
for (const bad of [[91, 0], [0, 181], [null, 5], [NaN, 5]]) await rpc(tina, 'family_push_location', bad);
check((await raw('select count(*)::int n from public.family_locations where user_id = $1', [tina]))[0].n === 0, 'a person who shares with nobody stores no place, and impossible places are ignored');
await raw(`update public.family_locations set updated_at = now() - interval '5 seconds' where user_id = $1`, [ravi]);
await rpc(ravi, 'family_push_location', [21, 74, -5, 999, -1]);
const odd = (await raw('select accuracy, heading, speed from public.family_locations where user_id = $1', [ravi]))[0];
check(odd.accuracy === null && odd.heading === null && odd.speed === null, 'a negative accuracy or speed and a heading above 360 are dropped, the place is kept');

await raw(`update public.family_locations set updated_at = now() - interval '25 hours' where user_id = $1`, [ravi]);
state = await rpc(asha, 'family_room_state', [room.id]);
check(byName(state, 'fam_ravi').lat === null && byName(state, 'fam_ravi').updatedAt === null, 'a place older than 24 hours is no longer shown');
await raw(`update public.family_locations set updated_at = now() where user_id = $1`, [ravi]);
check((await rpc(ravi, 'family_set_sharing', [room.id, false])).ok && byName(await rpc(asha, 'family_room_state', [room.id]), 'fam_ravi').lat === null && (await raw('select count(*)::int n from public.family_locations where user_id = $1', [ravi]))[0].n === 0, 'pausing sharing hides the person at once and removes their stored place');
check((await rpc(ravi, 'family_set_sharing', [room.id, true])).ok && (await rpc(eve, 'family_set_sharing', [room.id, true])).error === 'not_member', 'sharing can be resumed; a stranger cannot change anything');

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
await rpc(tina, 'family_leave_room', [room.id]);
await rpc(ravi, 'family_leave_room', [room.id]);
check((await raw('select count(*)::int n from public.family_rooms where id = $1', [room.id]))[0].n === 0 && (await raw('select count(*)::int n from public.family_locations where user_id = $1', [ravi]))[0].n === 0, 'the last person out closes the room and their place is deleted');

const c2 = await rpc(asha, 'family_create_room', ['Second', '🎒', true]);
await rpc(ravi, 'family_join_room', [c2.room.code, true]);
await rpc(ravi, 'family_push_location', [30, 40, null, null, null]);
check((await rpc(asha, 'family_delete_room', [c2.room.id])).ok && (await raw('select count(*)::int n from public.family_members where room_id = $1', [c2.room.id]))[0].n === 0 && (await raw('select count(*)::int n from public.family_locations where user_id = $1', [ravi]))[0].n === 0, 'deleting a room removes its people and the places of those who share with nobody else');

const c3 = await rpc(asha, 'family_create_room', ['Third', null, true]), c4 = await rpc(asha, 'family_create_room', ['Fourth', null, true]);
await rpc(ravi, 'family_join_room', [c3.room.code, true]); await rpc(ravi, 'family_join_room', [c4.room.code, true]);
await rpc(ravi, 'family_push_location', [30, 40, null, null, null]);
await rpc(ravi, 'family_set_sharing', [c3.room.id, false]);
check((await raw('select count(*)::int n from public.family_locations where user_id = $1', [ravi]))[0].n === 1 && byName(await rpc(asha, 'family_room_state', [c3.room.id]), 'fam_ravi').lat === null && byName(await rpc(asha, 'family_room_state', [c4.room.id]), 'fam_ravi').lat === 30, 'paused in one room, shared in another: only the room that is paused is blind');

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

// the administrators' Pages switch
await raw(`update public.platform_settings set disabled_features = array['family'] where id = true`);
const off = await rpc(eve, 'family_create_room', ['Nope', null, true]);
const offJoin = await rpc(eve, 'family_join_room', [big.code, true]);
await rpc(crowd[0], 'family_push_location', [11, 12, null, null, null]);
const offPlaces = (await raw('select count(*)::int n from public.family_locations where user_id = $1', [crowd[0]]))[0].n;
check(off.error === 'switched_off' && offJoin.error === 'switched_off' && offPlaces === 0 && (await rpc(crowd[0], 'family_my_rooms')).length === 1, 'when Family Map is switched off no new room, member or place is accepted, and nothing is deleted');
await raw(`update public.platform_settings set disabled_features = '{}' where id = true`);
check((await rpc(eve, 'family_create_room', ['Back', null, true])).ok, 'switched on again, it works again');

// deleting an account removes everything of the person
await raw('delete from auth.users where id = $1', [crowd[1]]);
check((await raw('select count(*)::int n from public.family_members where user_id = $1', [crowd[1]]))[0].n === 0, 'deleting an account removes its rooms membership and place');

section('7. How the page is wired in');
const vite = read('vite.config.ts'), headers = read('public/_headers'), page = read('family.html'), feats = read('src/utils/features.ts'), app = read('src/App.tsx'), feed = read('src/components/Feed/FeedView.tsx');
const main = read('src/components/Family/main.tsx'), live = read('src/family/liveApi.ts'), canvas = read('src/components/Family/MapCanvas.tsx'), css = read('src/components/Family/family.css');
check(/family: path\.resolve\(__dirname, 'family\.html'\)/.test(vite) && (vite.match(/\/\^\\\/family\(/g) || []).length === 2, 'the build makes family.html and /family opens it while developing and in the preview');
check(/<title>NOOB Family Map/.test(page) && /canonical" href="https:\/\/noobsocials\.com\/family"/.test(page) && /src="\/src\/components\/Family\/main\.tsx"/.test(page) && /name="viewport"[^>]*viewport-fit=cover/.test(page), 'family.html: title, canonical address, entry script, phone viewport');
const familyCsp = (headers.match(/\n\/family\n[\s\S]*?\n\/family\.html\n/) || [''])[0];
check(/script-src 'self' blob:;/.test(familyCsp) && /connect-src 'self' https:\/\/tiles\.openfreemap\.org https:\/\/tile\.openstreetmap\.org https:\/\/abffssydapumuhwgzeck\.supabase\.co/.test(familyCsp) && /worker-src 'self' blob:/.test(familyCsp) && !/unsafe-eval/.test(familyCsp) && /frame-ancestors 'none'/.test(familyCsp) && /\n\/family\.html\n/.test(headers), '/family has its own strict policy: map servers and the database only, no eval, no frames');
check((headers.match(/connect-src 'self' https:\/\/tiles\.openfreemap\.org https:\/\/tile\.openstreetmap\.org https:\/\/api\.pwnedpasswords\.com/g) || []).length === 1, 'the whole app (which shows the same map inside itself) may reach the two map servers');
check(/Permissions-Policy: [^\n]*geolocation=\(self\)/.test(headers), 'the location permission is allowed for the site itself');
check(/key: 'family'/.test(feats) && /FamilyHost/.test(app) && /featuresOff\.has\('family'\)\) closeFamily\(\)/.test(app) && /featOn\('family'\)/.test(feed) && /openFamily\(\)/.test(feed) && /data-testid="menu-family"/.test(feed), 'an admin switch (Pages > Family Map), the host in the app and the Home menu entry');
check(/import\('\.\.\/\.\.\/family\/liveApi\.ts'\)/.test(main) && !/^import .*liveApi/m.test(main) && /has\('demo'\)/.test(main) && /codeFromHash/.test(main), 'the page loads the login and database code only when it is not the demo');
check(/import\('maplibre-gl'\)/.test(canvas) && !/^import [^t].* from 'maplibre-gl'/m.test(canvas) && /import\('maplibre-gl\/dist\/maplibre-gl\.css'\)/.test(canvas), 'the map code is fetched only when a map is shown');
const sources = ['src/components/Family/FamilyMap.tsx', 'src/components/Family/Gate.tsx', 'src/components/Family/RoomView.tsx', 'src/components/Family/Sheets.tsx', 'src/components/Family/parts.tsx', 'src/components/Family/MapCanvas.tsx', 'src/family/markers.ts', 'src/family/liveApi.ts', 'src/family/locate.ts'].map((p) => [p, read(p)]);
check(sources.every(([, t]) => !/dangerouslySetInnerHTML|\.innerHTML\s*=|insertAdjacentHTML|eval\(|new Function/.test(t)), 'no HTML is built from text: names and pictures of other people only go in as text or as a picture address');
check(sources.every(([, t]) => !/(localStorage|sessionStorage)\.setItem\([^)]*\b(lat|lng|latitude|longitude|fix)\b/.test(t)) && /noob_family_last_v1/.test(read('src/components/Family/FamilyMap.tsx')) && /noob_family_prefs_v1/.test(read('src/components/Family/RoomView.tsx')), 'the phone saves only the last room and the map style, never a place');
// every database function the page calls exists with the same argument names
const sigs = Object.fromEntries([...sql.matchAll(/create or replace function public\.(family_\w+)\(([^)]*)\)/g)].map((m) => [m[1], m[2].split(',').map((x) => x.trim().split(/\s+/)[0]).filter(Boolean)]));
const calls = [...live.matchAll(/call\('(family_\w+)'(?:, \{([^}]*)\})?/g)].map((m) => [m[1], (m[2] || '').split(',').map((x) => x.trim().split(':')[0]).filter(Boolean)]);
check(calls.length === 10 && calls.every(([fn, keys]) => sigs[fn] && keys.every((k) => sigs[fn].includes(k))), 'the page calls 10 database functions, each with argument names that exist in the SQL', JSON.stringify(calls.filter(([fn, keys]) => !sigs[fn] || !keys.every((k) => sigs[fn].includes(k)))));
const cssBare = css.replace(/\/\*[\s\S]*?\*\//g, '');
const sels = [...cssBare.matchAll(/(^|\n|\})\s*([^@{}\n][^{}]*)\{/g)].flatMap((m) => m[2].split(/,(?![^(]*\))/)).map((x) => x.trim()).filter(Boolean);
const loose = sels.filter((x) => !/^(:where\(\.fm-root[ )]|\.fm-|\.maplibregl-|\d+%|from|to)/.test(x));
check(sels.length > 100 && loose.length === 0, 'every style rule starts with fm- (or is a map control inside .fm-root): nothing can touch the rest of the app', loose.slice(0, 5).join(' | '));
check(/prefers-reduced-motion: reduce/.test(css) && !/https?:\/\//.test(css), 'quiet for people who asked for less motion; no outside address in the style sheet');
check(fs.existsSync('docs/FAMILY-MAP.md') && /test-family\.mjs/.test(fs.readFileSync('package.json', 'utf8')), 'documented, and part of the test chain');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
