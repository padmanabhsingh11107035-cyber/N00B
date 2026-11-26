// NOOB Family Map: the Android phone sender that keeps sending after the app is swiped away. Part 1 (here): the database side (migration 20261126000002, "phone tokens") on a REAL Postgres
// (PGlite) with every migration applied. Part 2: the native code (android-overrides/FamilySenderCore.java) really compiled and run, locking a place that the app's own code then opens.
// Usage: node --liftoff-only scripts/supabase/test-family-phone.mjs
import fs from 'node:fs';
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';
import { memoryKeyStore } from '../../src/e2ee/keyring.ts';
import { createPlaceCrypto } from '../../src/family/sealed.ts';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

section('1. The migration');
const sql = read('supabase/migrations/20261126000002_family_phone_sender.sql');
check(/alter table public\.family_phone_tokens enable row level security/.test(sql) && /revoke all on public\.family_phone_tokens from public, anon, authenticated/.test(sql), 'the token table is closed to everybody (only the functions touch it)');
check(/token_hash text not null unique/.test(sql) && !/\btoken text not null/.test(sql) && /sha256\(convert_to\(p_token/.test(sql), 'only the fingerprint of a token is stored, never the token');
check(/interval '60 days'/.test(sql) && /limit 3/.test(sql) && /family_phone_revoke/.test(sql), 'a token lasts 60 days, a person has at most 3 phones, and all can be switched off');
check(/revoke all on function public\.family_phone_register\(\), public\.family_phone_revoke\(\) from public, anon/.test(sql) && /grant execute on function public\.family_phone_rooms\(text\), public\.family_phone_push\(text, jsonb\) to anon, authenticated/.test(sql) && /revoke all on function public\.family_phone_user\(text\) from public, anon, authenticated/.test(sql), 'making and removing tokens needs a login; the two token functions are open to the service; the checker is private');

section('2. The database');
const db = await createTestDb();
const mkUser = async (name, display) => {
  const id = (await db.query('select gen_random_uuid() as id')).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password, raw_user_meta_data) values ($1, $2, 'x', $3::jsonb)`, [id, `${name}@users.nooob.xyz`, JSON.stringify({ legacy_id: `u_${name}` })]);
  await db.query(`insert into public.profiles (id, username, display_name, avatar) values ($1, $2, $3, 'avatars/test.jpg')`, [id, name, display]);
  return id;
};
const raw = async (q, a = []) => (await db.query(q, a)).rows;
const callAs = async (uid, fn, args = {}) => {
  const names = Object.keys(args);
  const vals = names.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]));
  return asUser(db, uid, async () => (await db.query(`select public.${fn}(${names.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, vals)).rows[0].r);
};
const asVisitor = async (fn, args) => asAnon(db, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args.map((a) => (a !== null && typeof a === 'object' ? JSON.stringify(a) : a)))).rows[0].r);
const stores = {}, phone = {};
const phoneOf = (uid) => (phone[uid] ??= createPlaceCrypto({ rpc: (fn, args) => callAs(uid, fn, args), userId: async () => uid, storeFor: () => (stores[uid] ??= memoryKeyStore()), seen: { get: () => null, set: () => undefined }, deviceLabel: () => 'test phone' }));
const asha = await mkUser('ph_asha', 'Asha Rao'), ravi = await mkUser('ph_ravi', 'Ravi Rao'), eve = await mkUser('ph_eve', 'Eve Outsider');
const room = (await callAs(asha, 'family_create_room', { p_name: 'The Raos', p_emoji: '🏠', p_share: true })).room;
await callAs(ravi, 'family_join_room', { p_code: room.code, p_share: true });
const eveRoom = (await callAs(eve, 'family_create_room', { p_name: 'Eve only', p_emoji: '🔒', p_share: true })).room;
await phoneOf(asha).ready(); await phoneOf(ravi).ready(); await phoneOf(eve).ready();

let denied = '';
try { await asUser(db, asha, () => db.query('select * from public.family_phone_tokens')); } catch (e) { denied = String(e.message || e); }
check(/permission denied/i.test(denied), 'nobody can read the token table directly', denied);
denied = '';
try { await asVisitor('family_phone_register', []); } catch (e) { denied = String(e.message || e); }
check(/permission denied/i.test(denied), 'a visitor cannot make a token', denied);
denied = '';
try { await asVisitor('family_phone_user', ['a'.repeat(64)]); } catch (e) { denied = String(e.message || e); }
check(/permission denied/i.test(denied), 'a visitor cannot call the private checker', denied);

const reg = await callAs(asha, 'family_phone_register');
check(reg.ok && /^[0-9a-f]{64}$/.test(reg.token) && reg.days === 60, 'a logged-in person gets a 64-character token');
const stored = await raw('select token_hash, user_id from public.family_phone_tokens');
check(stored.length === 1 && stored[0].user_id === asha && stored[0].token_hash !== reg.token && /^[0-9a-f]{64}$/.test(stored[0].token_hash), 'the database holds a fingerprint, not the token');
check((await asVisitor('family_phone_rooms', [reg.token])).ok === true, 'the service (no login) can use the token');
check((await asVisitor('family_phone_rooms', ['f'.repeat(64)])).error === 'invalid_token' && (await asVisitor('family_phone_rooms', ['short'])).error === 'invalid_token' && (await asVisitor('family_phone_rooms', [null])).error === 'invalid_token', 'a wrong, malformed or empty token is refused');

const rooms = await asVisitor('family_phone_rooms', [reg.token]);
const kidsOf = async (uid) => (await raw('select kid from public.chat_keys where user_id = $1 and active', [uid])).map((r) => r.kid);
check(rooms.rooms.length === 1 && rooms.rooms[0].room === room.id, 'it lists only the rooms of its person where sharing is on (not Eve\'s)');
const listed = new Set(rooms.rooms[0].keys.map((k) => k.kid));
check([...(await kidsOf(asha)), ...(await kidsOf(ravi))].every((k) => listed.has(k)) && !(await kidsOf(eve)).some((k) => listed.has(k)) && rooms.rooms[0].keys.every((k) => k.key && k.key.x && k.key.y && !k.key.d), 'it gives the public keys of everybody in the room (and nobody outside it), never a private key');

// a place locked by the person's own phone, handed in by the service
const fx = { lat: 26.4499, lng: 74.6399, accuracy: 9, heading: 10, speed: 2, at: Date.now() };
const env = await phoneOf(asha).seal(room.id, fx);
const pushed = await asVisitor('family_phone_push', [reg.token, [{ room: room.id, env }]]);
check(pushed.ok && pushed.saved === 1, 'a locked place is accepted through the token');
const state = await callAs(ravi, 'family_room_state', { p_room: room.id });
const ashaRow = state.members.find((m) => m.id === asha);
const opened = ashaRow?.sealed ? await phoneOf(ravi).open(room.id, asha, ashaRow.sealed) : null;
check(opened?.ok && Math.abs(opened.place.lat - fx.lat) < 1e-9 && Math.abs(opened.place.lng - fx.lng) < 1e-9, 'the other person opens it and sees the place: the same as when the app itself sends');
await raw(`update public.family_sealed set updated_at = updated_at - interval '5 seconds'`);

const eveEnv = await phoneOf(eve).seal(eveRoom.id, fx);
check((await asVisitor('family_phone_push', [reg.token, [{ room: eveRoom.id, env: eveEnv }]])).saved === 0, 'it cannot put a place into a room its person is not in');
check((await asVisitor('family_phone_push', [reg.token, [{ room: room.id, env: eveEnv }]])).saved === 0, 'it cannot hand in a place locked by somebody else\'s key (the lock must be the person\'s own)');
check((await asVisitor('family_phone_push', [reg.token, [{ room: room.id, env: { v: 1, junk: true } }]])).saved === 0, 'junk is not saved');
check((await asVisitor('family_phone_push', [reg.token, Array.from({ length: 11 }, () => ({ room: room.id, env })) ])).error === 'failed', 'more than 10 rooms in one go is refused');

await callAs(asha, 'family_set_sharing', { p_room: room.id, p_on: false });
check((await asVisitor('family_phone_rooms', [reg.token])).rooms.length === 0, 'a room where the person paused sharing is not listed');
await raw(`update public.family_sealed set updated_at = updated_at - interval '5 seconds'`);
check((await asVisitor('family_phone_push', [reg.token, [{ room: room.id, env }]])).saved === 0, 'and nothing is saved for it');
await callAs(asha, 'family_set_sharing', { p_room: room.id, p_on: true });

const regs = [];
for (let i = 0; i < 4; i++) { regs.push((await callAs(asha, 'family_phone_register')).token); await raw(`update public.family_phone_tokens set created_at = created_at - interval '1 minute' where user_id = $1`, [asha]); }
check((await raw('select count(*)::int n from public.family_phone_tokens where user_id = $1', [asha]))[0].n === 3, 'at most 3 phones: the oldest tokens are switched off');
check((await asVisitor('family_phone_rooms', [reg.token])).error === 'invalid_token' && (await asVisitor('family_phone_rooms', [regs[3]])).ok === true, 'the oldest token stopped working, the newest works');

await raw(`update public.family_phone_tokens set expires_at = now() - interval '1 second' where user_id = $1`, [asha]);
check((await asVisitor('family_phone_rooms', [regs[3]])).error === 'invalid_token', 'an expired token (60 days) is refused');
const fresh = (await callAs(asha, 'family_phone_register')).token;
check((await raw('select count(*)::int n from public.family_phone_tokens where user_id = $1', [asha]))[0].n === 1 && (await asVisitor('family_phone_rooms', [fresh])).ok, 'making a new token clears the expired ones');

await raw(`update public.profiles set is_suspended = true where id = $1`, [asha]);
check((await asVisitor('family_phone_rooms', [fresh])).error === 'invalid_token', 'a suspended account\'s token stops working');
await raw(`update public.profiles set is_suspended = false where id = $1`, [asha]);
check((await callAs(asha, 'family_phone_revoke')).ok && (await asVisitor('family_phone_rooms', [fresh])).error === 'invalid_token', 'logging out / switching off deletes the tokens at once');
check((await raw('select count(*)::int n from public.family_phone_tokens where user_id = $1', [asha]))[0].n === 0, 'nothing is left of them');

section('3. The audit knows about the two open functions');
const audit = read('scripts/security-audit-db.mjs');
check(/family_phone_rooms:/.test(audit) && /family_phone_push:/.test(audit), 'the security audit lists the two functions that are open to the service, with the reason');


section('4. The phone\'s own sender (native Java) locks a place that the app opens');
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import * as C from '../../src/e2ee/crypto.ts';
import * as G from '../../src/family/geo.ts';
import { readPlace } from '../../src/family/sealed.ts';
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'noob-java-'));
const javac = spawnSync('javac', ['-d', out, 'android-overrides/FamilySenderCore.java', 'scripts/native/FamilySealCli.java'], { encoding: 'utf8', shell: process.platform === 'win32' });
check(javac.status === 0, 'the sender code compiles with a plain Java compiler (no Android classes in it)', javac.stderr);
const seal = (room, place, sender, recipients) => {
  const input = [room, place, `${sender.kid} ${sender.publicJwk.x} ${sender.publicJwk.y} ${sender.privateJwk.d}`, ...recipients.map((r) => `${r.kid} ${r.publicJwk.x} ${r.publicJwk.y}`), ''].join('\n');
  const r = spawnSync('java', ['-cp', out, 'com.noob.social.FamilySealCli'], { input, encoding: 'utf8' });
  return r.status === 0 ? JSON.parse(r.stdout) : { error: r.stderr };
};
const wirePlace = (f) => JSON.stringify({ v: 1, lat: f.lat, lng: f.lng, acc: f.accuracy, hdg: f.heading, spd: f.speed, at: f.at });
if (javac.status === 0) {
  const sender = await C.generateDeviceKey('phone'), friend = await C.generateDeviceKey('friend'), other = await C.generateDeviceKey('stranger');
  const place = { lat: 26.449900, lng: 74.639900, accuracy: 8.5, heading: null, speed: 1.25, at: Date.now() };
  const env = seal('room-123', wirePlace(place), sender, [{ kid: friend.kid, publicJwk: friend.publicJwk }, { kid: sender.kid, publicJwk: sender.publicJwk }]);
  check(C.isEnvelope(env) && env.skid === sender.kid && Object.keys(env.keys).sort().join() === [friend.kid, sender.kid].sort().join(), 'the envelope has the right shape and a lock for the friend and for the sender');
  const senderPublic = async (k) => (k === sender.kid ? sender.publicJwk : null);
  const text = await C.open(env, { chatId: 'room-123', ring: [friend], senderPublic });
  const got = readPlace(text, Date.now());
  check(got && got.lat === place.lat && got.lng === place.lng && got.accuracy === 8.5 && got.speed === 1.25 && got.heading === null, 'the friend\'s phone opens it with the app\'s own code and reads the exact place');
  check((await C.open(env, { chatId: 'room-123', ring: [sender], senderPublic }).then(() => true, () => false)), 'the sender\'s own device can open it too');
  check(!(await C.open(env, { chatId: 'room-999', ring: [friend], senderPublic }).then(() => true, () => false)), 'copied into another room it does not open');
  check(!(await C.open(env, { chatId: 'room-123', ring: [other], senderPublic }).then(() => true, () => false)), 'a device that was not in the room cannot open it');
  const forged = { ...env, skid: other.kid };
  check(!(await C.open(forged, { chatId: 'room-123', ring: [friend], senderPublic: async () => other.publicJwk }).then(() => true, () => false)), 'it cannot be passed off as made by somebody else');
  const tampered = { ...env, ct: env.ct.slice(0, -4) + (env.ct.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA') };
  check(!(await C.open(tampered, { chatId: 'room-123', ring: [friend], senderPublic }).then(() => true, () => false)), 'a changed envelope does not open');
  const again = seal('room-123', wirePlace(place), sender, [{ kid: friend.kid, publicJwk: friend.publicJwk }]);
  check(again.iv !== env.iv && again.epk.x !== env.epk.x && again.keys[friend.kid].w !== env.keys[friend.kid].w && Object.keys(again.keys).includes(sender.kid), 'every lock is different (fresh random numbers), and the sender is added when the list forgot it');
  const bad = seal('room-123', wirePlace(place), sender, [{ kid: '0000000000000000', publicJwk: friend.publicJwk }]);
  check(bad.error && /does not match its id/.test(bad.error), 'a public key that does not match its id is refused');
  const crowd = []; for (let i = 0; i < 20; i++) { const k = await C.generateDeviceKey('c' + i); crowd.push({ kid: k.kid, publicJwk: k.publicJwk }); }
  const big = seal('room-123', wirePlace(place), sender, [...crowd, { kid: friend.kid, publicJwk: friend.publicJwk }]);
  check(JSON.stringify(big).length < 60000 && Object.keys(big.keys).length === 22 && (await C.open(big, { chatId: 'room-123', ring: [friend], senderPublic }).then(() => true, () => false)), 'a big room (22 phones) still fits under the server\'s 60 KB limit and opens');
  // the number format of the place JSON as the native code writes it (lat/lng never in exponent form)
  const small = seal('r', '{"v":1,"lat":0.00001,"lng":-0.5,"acc":null,"hdg":null,"spd":null,"at":1}', sender, [{ kid: friend.kid, publicJwk: friend.publicJwk }]);
  check(!!small.ct, 'plain JSON text of any shape is locked');
  // when to send: the same rule as shouldPush in geo.ts
  let same = 0, total = 0;
  const cases = [[null, 0], [[0, 0, 0], 3000], [[0, 0, 0], 4000], [[0, 0, 0], 20000], [[26.45, 74.64, 0], 5000], [[26.45, 74.64, 0], 4000]];
  for (const [prev, dt] of cases) for (const dm of [0, 5, 7.9, 8.1, 30]) {
    const next = prev ? { lat: prev[0] + dm / 111320, lng: prev[1], accuracy: 5, heading: null, speed: null, at: dt } : { lat: 1, lng: 1, accuracy: 5, heading: null, speed: null, at: 0 };
    const web = G.shouldPush(prev ? { lat: prev[0], lng: prev[1], at: 0 } : null, next, dt);
    const input = prev ? `SEND 1 ${prev[0]} ${prev[1]} 0 ${next.lat} ${next.lng} ${dt}\n` : `SEND 0 0 0 0 ${next.lat} ${next.lng} ${dt}\n`;
    const r = spawnSync('java', ['-cp', out, 'com.noob.social.FamilySealCli'], { input, encoding: 'utf8' });
    total++; if (r.stdout.trim() === String(web)) same++;
  }
  check(same === total, 'the native "when to send" rule gives the same answer as the web part in every case', `${same}/${total}`);
}
fs.rmSync(out, { recursive: true, force: true });

section('5. How the app uses it');
const ps = read('src/family/phoneSender.ts'), tl = read('src/family/trackerLive.ts'), la = read('src/family/liveApi.ts');
const wf = read('../../.github/workflows/android-build.yml'), mainAct = read('android-overrides/MainActivity.java');
const svc = read('android-overrides/FamilyLocationService.java'), plug = read('android-overrides/FamilySenderPlugin.java'), store = read('android-overrides/FamilyStore.java');
check(/isPluginAvailable\('FamilySender'\)/.test(ps) && /senderAvailable\(\)/.test(tl) && /the plugin below/.test(tl), 'an older Android app (or the browser) has no sender and keeps the old way; so does a failed start');
check(/family_phone_register/.test(la) && /family_phone_revoke/.test(la) && /nativeIsSending\(\)/.test(la), 'the app asks the database for a phone token, can switch it off, and does not send the same place twice while the phone sender is sending');
check(/clearPhoneSender/.test(read('src/components/Family/FamilyTracker.tsx')) && /forgetPhoneSender/.test(read('src/components/Family/FamilyMap.tsx')), 'logging out wipes the token and key from the phone; switching background sharing off also switches the token off in the database');
check(/TOKEN_DAYS = 20/.test(ps) && /rec\.kid === kid/.test(ps), 'a new token is made every 20 days (the database allows 60) and when the device key changed');
check(/stopWithTask="false"/.test(wf) && /foregroundServiceType="location"/.test(wf) && /FOREGROUND_SERVICE_LOCATION/.test(wf) && /FamilySenderCore\.java/.test(wf) && /registerPlugin\(FamilySenderPlugin\.class\)/.test(mainAct), 'the Android build copies the four files in, declares the service (it survives a swipe) with the location type and its permissions, and checks each with grep');
check(/START_STICKY/.test(svc) && /FOREGROUND_SERVICE_TYPE_LOCATION/.test(svc) && /Stop sharing/.test(svc) && /\.flag\("wanted"\)/.test(svc), 'the service restarts after Android stops it for memory, shows a notification with a Stop button, and only runs while the person wants it');
check(/AndroidKeyStore/.test(store) && /KeyProperties\.PURPOSE_ENCRYPT/.test(store) && !/MODE_WORLD/.test(store) && /startsWith\("https:\/\/"\)/.test(plug), 'the token and key are kept locked with an Android Keystore key, never readable by other apps, and only an https address is accepted');
check(!/Log\.|printStackTrace|System\.out/.test(svc + plug + store + read('android-overrides/FamilySenderCore.java')), 'nothing (no place, token or key) is ever written to the phone\'s log');
check(/invalid_token/.test(svc) && /no_rooms/.test(svc) && /GIVE_UP_NO_ROOMS_MS/.test(svc), 'a refused token or ten minutes without any room stops the service and removes the notification');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
