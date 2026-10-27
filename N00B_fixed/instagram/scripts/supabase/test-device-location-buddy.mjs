// Tests of 2026-10-27 (batch C): the device and location information (system, battery, city) with its Terms text, the animated support character, the round app icon, and the tutor's
// new instructions. Usage: node --liftoff-only scripts/supabase/test-device-location-buddy.mjs
import fs from 'node:fs';
import { createTestDb } from './pg-test-env.mjs';
import { osFromAgent, batteryPercent, dueNow } from '../../src/utils/deviceInfo.ts';
import worker from '../../worker/index.js';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8');

section('1. Reading the system and the battery');
check(osFromAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36') === 'Android 14', 'Android with its version');
check(osFromAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148') === 'iOS 17.5', 'iPhone with its version');
check(osFromAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 'MacIntel', 5) === 'iOS', 'an iPad that calls itself a Mac');
check(osFromAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126', 'Win32', 0) === 'Windows' && osFromAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0) === 'macOS' && osFromAgent('Mozilla/5.0 (X11; Linux x86_64)') === 'Linux' && osFromAgent('Mozilla/5.0 (X11; CrOS x86_64)') === 'ChromeOS' && osFromAgent('') === 'Unknown', 'Windows, macOS, Linux, ChromeOS and "unknown"');
check(batteryPercent(0.5) === 50 && batteryPercent(1) === 100 && batteryPercent(0) === 0 && batteryPercent(0.876) === 88 && batteryPercent(2) === null && batteryPercent('x') === null && batteryPercent(undefined) === null, 'the battery is a whole number from 0 to 100, or nothing');
const mem = new Map(); const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
check(dueNow(store, 'k', 1000, 5000) === true && dueNow(store, 'k', 1000, 5500) === false && dueNow(store, 'k', 1000, 6100) === true, 'it is only sent now and then (not on every heartbeat)');

section('2. The database');
const db = await createTestDb();
const user = async (name, extra) => {
  const id = crypto.randomUUID();
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${name}@users.nooob.xyz`]);
  await db.query(`insert into public.profiles (id, username, display_name ${extra ? ', ' + extra.split('=')[0] : ''}) values ($1, $2, $2 ${extra ? ', ' + extra.split('=')[1] : ''})`, [id, name]);
  return id;
};
const as = async (uid, role, sql, params = []) => {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${uid || ''}', false)`);
  try { return { ok: true, rows: (await db.query(sql, params)).rows }; } catch (e) { return { ok: false, error: String(e.message) }; }
  finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false)`); }
};
const A = await user('alice'), B = await user('bob'), ADMIN = await user('noob', 'is_admin=true');
let r = await as(A, 'authenticated', `select public.save_my_device_info('Android 14', 63, true)`);
check(r.ok, 'a person can tell the database about their own device', r.error);
let j = (await db.query(`select public.admin_user_json(p) j from public.profiles p where p.id = $1`, [A])).rows[0].j;
check(j?.deviceOs === 'Android 14' && j.deviceBattery === 63 && j.deviceCharging === true && j.deviceInfoAt, 'the administrator sees the system, the battery and whether it is charging', JSON.stringify(j).slice(0, 120));
await as(A, 'authenticated', `select public.save_my_device_info('iOS 17.5', null, null)`);
j = (await db.query(`select public.admin_user_json(p) j from public.profiles p where p.id = $1`, [A])).rows[0].j;
check(j.deviceOs === 'iOS 17.5' && j.deviceBattery === null, 'an iPhone shares no battery level: it is simply empty');
await as(A, 'authenticated', `select public.save_my_device_info('Windows', 250, false)`);
j = (await db.query(`select public.admin_user_json(p) j from public.profiles p where p.id = $1`, [A])).rows[0].j;
check(j.deviceBattery === null, 'a battery level that is not between 0 and 100 is dropped');
await as(A, 'authenticated', `select public.save_my_location('  Surat <b> ', 'Surat', 'Gujarat', 'IN')`);
j = (await db.query(`select public.admin_user_json(p) j from public.profiles p where p.id = $1`, [A])).rows[0].j;
check(j.signupCity === 'Surat b' && j.approxCity === 'Surat' && j.approxRegion === 'Gujarat' && j.approxCountry === 'IN' && j.locationAt, 'the typed city (cleaned) and the approximate place are kept');
await as(A, 'authenticated', `select public.save_my_location(null, 'Mumbai', 'Maharashtra', 'IN')`);
j = (await db.query(`select public.admin_user_json(p) j from public.profiles p where p.id = $1`, [A])).rows[0].j;
check(j.signupCity === 'Surat b' && j.approxCity === 'Mumbai', 'a later visit changes the place but never erases the city that was typed');
check(!(await as(null, 'anon', `select public.save_my_device_info('x', 1, false)`)).ok && !(await as(null, 'anon', `select public.save_my_location('x', 'x', 'x', 'x')`)).ok, 'a visitor who is not logged in can not write anything');
r = await as(B, 'authenticated', `select deviceOs from (select device_os as deviceOs from public.profile_private where user_id = $1) t`, [A]);
check(!r.ok || r.rows.length === 0, "nobody can read somebody else's device or place from the table");
check((await as(B, 'authenticated', `select public.admin_user_json(p) from public.profiles p where p.id = $1`, [A])).ok === false, 'and the function that builds the administrator view can not be called from a browser at all (the admin screens reach it through their own checked functions)');

section('3. The Worker answers /__geo about the caller');
const geo = await worker.fetch({ url: 'https://noobsocials.com/__geo', method: 'GET', cf: { city: 'Surat', region: 'Gujarat', country: 'IN' }, headers: new Headers() }, {}, { waitUntil() {} });
const gj = await geo.json();
check(geo.status === 200 && gj.city === 'Surat' && gj.region === 'Gujarat' && gj.country === 'IN' && geo.headers.get('cache-control') === 'no-store', 'city, region and country of the connection, never kept by a cache');
const none = await (await worker.fetch({ url: 'https://noobsocials.com/__geo', method: 'GET', headers: new Headers() }, {}, { waitUntil() {} })).json();
check(none.city === '' && none.country === '', 'where it is not known the answer is empty (never an error)');

check(/run_worker_first[^\]]*"\/__geo"/.test(read('wrangler.jsonc')), 'the website hands that address to the Worker (otherwise the app page would answer it)');

section('4. The Terms and the Privacy Policy say it');
for (const f of ['src/components/Legal/PrivacyPolicy.tsx', 'src/components/Legal/TermsAndConditions.tsx', 'public/privacy.html', 'public/terms.html']) {
  const t = read(f);
  check(/operating system/.test(t) && /battery level/.test(t) && /approximate location/.test(t) && /do not sell/.test(t) && /not used for any other activity/.test(t) && /encrypted/.test(t) && /optional/.test(t), `${f}: the system, the battery, the approximate location, "we do not sell", "not used for any other activity", "encrypted", the city is optional`);
}

section('5. The sign-up city, the character and the app icon');
const auth = read('src/components/Auth/AuthView.tsx'), api = read('src/services/supabaseApi.ts'), app = read('src/App.tsx'), css = read('src/index.css');
check(/data-testid="signup-city"/.test(auth) && /\(optional\)/.test(auth) && /city: city\.trim\(\) \|\| undefined/.test(auth) && !/required[^>]*signup-city|signup-city[^>]*required/.test(auth), 'the sign-up form asks for a city and it is optional');
check(/saveMyLocation\(payload\.city, true\)/.test(api) && /sendDeviceInfo\(\)/.test(api) && /startLastSeenHeartbeat[\s\S]{0,400}saveMyLocation\(\)/.test(api), 'the city is saved right after sign-up, and the device and place on the usual heartbeat');
check(/src="\/noob-support-character\.png"/.test(app) && /setShowCustomerSupportModal\(true\)/.test(app) && />NOOB<\/span>/.test(app) && /bg-black text-white/.test(app) && /data-testid="support-buddy"/.test(app), 'the corner button is the character, it opens the help page, and it carries a black "NOOB" badge');
check(/\.noob-buddy \{ animation: noob-buddy-float/.test(css) && /prefers-reduced-motion: reduce\) \{ \.noob-buddy \{ animation: none/.test(css), 'it moves (floats, tilts, says hello now and then) and stands still for people who asked for less motion');
const mk = (await import('node:module')).createRequire(import.meta.url);
const manifest = JSON.parse(read('public/manifest.json'));
check(manifest.icons.every((i) => /noob-app-/.test(i.src) && fs.existsSync('public' + i.src)) && manifest.icons.some((i) => i.purpose === 'maskable' && i.sizes === '192x192') && manifest.icons.some((i) => i.purpose === 'any' && i.sizes === '512x512'), 'the installed app uses the round NOOB logo (any and maskable), all files exist');
const png = fs.readFileSync('public/noob-support-character.png');
check(png.readUInt32BE(16) === 256 && png[25] === 6, 'the character is a 256 px picture with a see-through background (RGBA)');

section('6. The tutor');
const fn = read('supabase/functions/study-ai/index.ts');
check(/ACCURACY: before you send an answer, check it once/.test(fn) && /SPEAKING: answers may be read aloud/.test(fn) && /no emojis/.test(fn) && /Indian English/.test(fn), 'it is told to check facts and sums, to write for speaking, to use no emojis and to use Indian English');
check(/mode === 'teach' \? 0\.4 : 0\.35/.test(fn), 'it answers with less guesswork (lower temperature)');
check(/I could not look at your picture just now/.test(fn) && /picture: true/.test(fn), 'a picture that could not be read gets its own plain message');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
