// Tests migration 20261114000009 (privacy hardening: N11 profile columns + private follows, N12 match_contacts, N13 record_visit, N15 login resolution unchanged) on a real Postgres (PGlite).
// The database is built from every migration BEFORE ours (the "before"), the answers of the functions the app uses are recorded for several kinds of people, the migration is applied,
// the same questions are asked again (the "after") and compared. Usage: node --liftoff-only scripts/supabase/test-privacy-hardening.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createTestDb, asUser, asAnon, MIGRATIONS_DIR } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const MIG = '20261114000009_privacy_hardening.sql';
const migSql = fs.readFileSync(path.join(MIGRATIONS_DIR, MIG), 'utf8');

const db = await createTestDb({ upTo: '20261114000008_admin_user_locations_v2.sql' });
const mkUser = async (name, { email = `${name}@users.nooob.xyz`, password = true, mobile = null, city = null } = {}) => {
  const id = (await db.query('select gen_random_uuid() as id')).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, $3)`, [id, email, password ? 'x' : null]);
  if (!(await db.query('select 1 from public.profiles where id = $1', [id])).rows.length) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $3)`, [id, name, `${name} Display`]);
  await db.query(`insert into public.profile_private (user_id, email, mobile_number, country_code) values ($1, $2, $3, '+91') on conflict (user_id) do update set email = excluded.email, mobile_number = excluded.mobile_number`, [id, email, mobile]);
  await db.query(`update public.profiles set city = $2, noob_points = 777, extra = '{"secretNote":"x"}'::jsonb, privacy_settings = '{"blockedWords":["zz"]}'::jsonb where id = $1`, [id, city || 'Surat']);
  return id;
};
const A = await mkUser('ann', { mobile: '9000000001' });           // the reader
const B = await mkUser('bob', { mobile: '9000000002' });           // public
const C = await mkUser('cat', { mobile: '9000000003' });           // private, A follows
const C2 = await mkUser('cyd', { mobile: '9000000004' });          // private, A does not follow
const D = await mkUser('dan', { mobile: '9000000005' });           // suspended
const E = await mkUser('eve', { mobile: '9000000006' });           // hid from A
const F = await mkUser('fay');                                     // public, follows C and C2, followed by B
const G = await mkUser('gus');                                     // stranger, follows nobody
const ADMIN = await mkUser('noob'); await db.query(`update public.profiles set is_admin = true where id = $1`, [ADMIN]);
await db.query(`update public.profiles set account_type = 'private' where id in ($1, $2)`, [C, C2]);
await db.query(`update public.profiles set is_suspended = true where id = $1`, [D]);
await db.query(`insert into public.profile_hides (owner_id, hidden_from_id) values ($1, $2)`, [E, A]);
const follow = (a, b) => db.query('insert into public.follows (follower_id, followee_id) values ($1, $2) on conflict do nothing', [a, b]);
await follow(A, C); await follow(A, B); await follow(A, F); await follow(F, C); await follow(F, C2); await follow(B, F); await follow(C, B); await follow(C2, B); await follow(G, B); await follow(E, B); await follow(B, E);

const call = async (uid, sql, args = []) => asUser(db, uid, async () => (await db.query(sql, args)).rows[0]?.r);
const tryCall = async (uid, sql, args = []) => { try { return { ok: true, r: await call(uid, sql, args) }; } catch (e) { return { ok: false, err: e.message }; } };
const viewers = { A, B, C, C2, D, E, F, G };
const snapshot = async () => {
  const s = {};
  for (const [n, id] of Object.entries(viewers)) {
    s[`search_all:${n}`] = await call(id, `select public.search_users('') as r`);
    s[`search_q:${n}`] = await call(id, `select public.search_users('a') as r`);
    s[`me:${n}`] = await call(id, `select public.get_my_user() as r`);
    for (const [t, tid] of Object.entries(viewers)) s[`user_by_id:${n}->${t}`] = await call(id, `select public.user_by_id($1) as r`, [tid]);
  }
  return s;
};

const loginBefore = {};
const loginUsers = {
  synthetic: await mkUser('loginsyn'),
  realEmail: await mkUser('loginreal', { email: 'real.person@example.com' }),
  google: await mkUser('logingoogle', { email: 'someone@gmail.com', password: false }),
  byPhone: await mkUser('loginphone', { mobile: '9123456780' })
};
section('0. Before the migration (what the hole looks like)');
const beforeDirect = await tryCall(A, `select city as r from public.profiles where id = $1`, [B]);
check(beforeDirect.ok && beforeDirect.r === 'Surat', 'before: ann can read bob\'s city straight from the table');
const beforeFollows = {};
for (const [n, id] of Object.entries(viewers)) beforeFollows[n] = Number(await call(id, `select count(*)::int as r from public.follows`));
check(beforeFollows.G > beforeFollows.A - 5 && beforeFollows.G >= 8, 'before: a stranger sees (nearly) every follow row, private accounts included', JSON.stringify(beforeFollows));
const before = await snapshot();
const beforeMutual = await call(A, `select public.mutual_followers($1) as r`, [C2]);
const beforeMutualC = await call(A, `select public.mutual_followers($1) as r`, [C]);
const beforeContacts = await call(A, `select public.match_contacts(array['9000000002','9000000003','9000000005','9000000006','12']) as r`);
const idents = ['loginsyn', 'LOGINREAL', 'real.person@example.com', 'logingoogle', 'someone@gmail.com', '9123456780', '+91 91234 56780', 'nobody-here'];
const resolve = async () => { const o = {}; for (const i of idents) { const v = await asAnon(db, async () => (await db.query(`select public.resolve_login_email($1) as r`, [i])).rows[0].r); o[i] = /^[0-9a-f-]{36}@users.nooob.xyz$/.test(v) ? 'DECOY' : v; } return o; };
const loginRes1 = await resolve();
const resolveDef = (await db.query(`select md5(pg_get_functiondef('public.resolve_login_email(text)'::regprocedure)) as r`)).rows[0].r;
const isHiddenDef = (await db.query(`select md5(pg_get_functiondef('public.is_hidden_from_me(uuid)'::regprocedure)) as r`)).rows[0].r;
const recordVisitBeforeSrc = (await db.query(`select prosrc as r from pg_proc where proname = 'record_visit'`)).rows[0].r;

await db.exec(migSql);
await db.exec(migSql);   // twice: harmless
check(true, 'the migration ran twice without an error');

section('1. N11: profiles columns');
for (const c of ['city', 'privacy_settings', 'extra', 'noob_points', 'is_suspended', 'pro_billing', 'pro_renews_at']) {
  const r = await tryCall(A, `select ${c}::text as r from public.profiles where id = $1`, [B]);
  check(!r.ok && /permission denied/i.test(r.err), `ann reading bob's ${c} straight from the table: permission denied`, r.err || String(r.r));
}
const own = await tryCall(A, `select is_suspended::text as r from public.profiles where id = $1`, [A]);
check(!own.ok && /permission denied/i.test(own.err), 'not even her own is_suspended (the app now asks my_suspension_status)');
const star = await tryCall(A, `select to_jsonb(p) as r from public.profiles p limit 1`);
check(!star.ok, 'select * style reads of the whole row are refused');
const allowed = await tryCall(A, `select jsonb_agg(jsonb_build_object('u', username, 'd', display_name, 'a', avatar, 'v', is_verified, 'b', bio, 'f', followers_count, 'created', created_at)) as r from public.profiles`);
check(allowed.ok && allowed.r.length >= 9, 'the columns the app reads stay readable', allowed.err);
const mine = await tryCall(A, `select id, username, display_name, avatar, is_verified from public.profiles where id = $1`, [A]);
check(mine.ok, 'the app\'s own-profile read (id, username, display_name, avatar, is_verified) still works');
const anonRead = await asAnon(db, async () => { try { await db.query('select id from public.profiles'); return 'ok'; } catch (e) { return 'denied'; } });
check(anonRead === 'denied', 'a visitor who is not signed in still reads nothing');
const stillAdminCols = await db.query(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and not has_column_privilege('authenticated', 'public.profiles', column_name, 'select') order by 1`);
check(JSON.stringify(stillAdminCols.rows.map((r) => r.column_name)) === JSON.stringify(['city', 'extra', 'is_suspended', 'noob_points', 'privacy_settings', 'pro_auto_renew', 'pro_billing', 'pro_renews_at', 'purchased_item_ids']), 'exactly nine columns are closed', JSON.stringify(stillAdminCols.rows));

section('2. N11: every function the app uses answers exactly as before');
const after = await snapshot();
let same = 0, diff = [];
for (const k of Object.keys(before)) { if (JSON.stringify(before[k]) === JSON.stringify(after[k])) same++; else diff.push(k); }
if (diff.length) { const k = diff[0]; fs.writeFileSync(process.env.TEMP + '/diff.json', JSON.stringify({ k, b: before[k], a: after[k] }, null, 1)); }
check(diff.length === 0, `search_users, user_by_id and get_my_user give identical JSON for every reader (${same} answers compared; kinds: public, private followed / not followed, suspended, hidden-from-reader, stranger, admin)`, diff.join(', '));
check(after['search_all:A'].some((u) => u.id === C) && !after['search_all:A'].some((u) => u.id === E), 'search still shows private accounts and still hides the person who hid from ann');
check(after['me:A'].city === 'Surat' && after['me:A'].privacySettings && after['me:A'].noobPoints === 777, 'get_my_user still returns the person\'s own city, privacy settings and points');
const status = async (id) => call(id, `select public.my_suspension_status() as r`);
check(JSON.stringify(await status(A)) === '{"found": true, "suspended": false}' || (await status(A)).suspended === false, 'my_suspension_status: normal account');
check((await status(D)).suspended === true && (await status(D)).found === true, 'my_suspension_status: a suspended account is reported suspended');
const GONE = await mkUser('gonezo'); await db.query(`delete from public.profiles where id = $1`, [GONE]);
check((await status(GONE)).found === false, 'my_suspension_status: no profile = found false (same as the old direct read)');
const anonStatus = await asAnon(db, async () => { try { await db.query('select public.my_suspension_status()'); return 'ok'; } catch (e) { return 'denied'; } });
check(anonStatus === 'denied', 'a visitor cannot call my_suspension_status');

section('3. N11: follows of private accounts');
const afterFollows = {};
for (const [n, id] of Object.entries(viewers)) afterFollows[n] = Number(await call(id, `select count(*)::int as r from public.follows`));
const rows = async (id) => (await asUser(db, id, async () => (await db.query(`select follower_id as a, followee_id as b from public.follows`)).rows)).map((r) => r.a + '>' + r.b);
const seeA = await rows(A), seeG = await rows(G), seeC = await rows(C), seeC2 = await rows(C2), seeF = await rows(F), seeB = await rows(B);
check(!seeG.includes(`${F}>${C}`) && !seeG.includes(`${F}>${C2}`) && !seeG.includes(`${C}>${B}`) && !seeG.includes(`${C2}>${B}`), 'a stranger no longer sees who follows a private account or who it follows');
check(seeG.includes(`${B}>${F}`) && seeG.includes(`${G}>${B}`) && seeG.includes(`${A}>${B}`), 'public accounts\' rows are visible to a stranger as before');
check(seeA.includes(`${F}>${C}`) && seeA.includes(`${C}>${B}`) && seeA.includes(`${A}>${C}`), 'ann (who follows the private account cat) sees cat\'s followers and following');
check(!seeA.includes(`${F}>${C2}`) && !seeA.includes(`${C2}>${B}`), 'ann does not see the lists of cyd, the private account she does not follow');
check(seeC.includes(`${A}>${C}`) && seeC.includes(`${F}>${C}`) && seeC.includes(`${C}>${B}`), 'the private account itself sees its own followers and following');
check(seeC2.includes(`${F}>${C2}`) && seeC2.includes(`${C2}>${B}`), 'the other private account sees its own too');
check(seeF.includes(`${F}>${C2}`) && seeF.includes(`${F}>${C}`), 'a person sees the rows they are in (fay follows both)');
check(!seeA.some((r) => r.split('>').includes(E)), 'rows of the person who hid from ann are still invisible to her');
check(seeB.some((r) => r.split('>').includes(E)) === true, '...but still visible to others (the hiding is only against ann)');
check(afterFollows.C > afterFollows.G && afterFollows.A >= afterFollows.G, 'counts: more for those who may see more', JSON.stringify(afterFollows));
const mutC = await call(A, `select public.mutual_followers($1) as r`, [C]);
const mutC2 = await call(A, `select public.mutual_followers($1) as r`, [C2]);
check(JSON.stringify(mutC) === JSON.stringify(beforeMutualC), '"Followed by" on a private account ann follows: unchanged');
check(beforeMutual.length >= 1 && mutC2.length === 0, '"Followed by" on a private account ann does NOT follow is now empty (it used to leak who follows it)', JSON.stringify([beforeMutual, mutC2]));
check((await tryCall(A, `insert into public.follows (follower_id, followee_id) values ($1, $2)`, [A, B])).ok === false, 'nobody can write follows directly (unchanged)');

section('4. N11: admin and the database\'s own functions are unaffected');
const adm = await tryCall(ADMIN, `select public.admin_user_locations() as r`);
check(adm.ok && adm.r.rows.length >= 8 && adm.r.rows.some((x) => x.signup && x.signup.city), 'admin_user_locations still works and still shows the typed city', adm.err);
const admVisits = await tryCall(ADMIN, `select public.admin_site_visits() as r`);
check(admVisits.ok, 'admin_site_visits still works', admVisits.err);
const notAdmin = await tryCall(A, `select public.admin_user_locations() as r`);
check(!notAdmin.ok, 'a normal person is still refused by the admin functions');
for (const f of ['public._rate_limit_hit(text, timestamptz)']) {
  const r = await tryCall(A, `select ${f.replace('(text, timestamptz)', "('x', now())")} as r`);
  check(!r.ok, 'ann cannot call the internal counter directly');
}
const rl = await tryCall(A, `select count(*) as r from public.api_rate_limits`);
check(!rl.ok, 'ann cannot read the counter table');
check((await db.query(`select md5(pg_get_functiondef('public.is_hidden_from_me(uuid)'::regprocedure)) as r`)).rows[0].r === isHiddenDef, 'is_hidden_from_me (the 000006 version) is not changed by this migration');
const anonHelper = await asAnon(db, async () => { try { await db.query(`select public.can_see_follow_edges_of(gen_random_uuid())`); return 'ok'; } catch (e) { return 'denied'; } });
check(anonHelper === 'denied', 'the follow-rule helper is closed to visitors');

section('5. N12: match_contacts');
const contactsAfter = await db.query(`select 1`);   // the first call below is the "after" answer
const nums = ['9000000002', '9000000003', '9000000005', '9000000006', '12'];
const after1 = await call(G, `select public.match_contacts($1::text[]) as r`, [nums]);   // a reader who has no hiding in play
const before1G = beforeContacts;                                                          // ann's answer before; compare for ann below
const annAfter = await call(A, `select public.match_contacts($1::text[]) as r`, [nums]);
const ids = (l) => l.map((u) => u.username);
check(JSON.stringify(ids(beforeContacts)) === '["bob","cat","dan","eve"]', 'before: the lookup also returned the suspended (dan) and the hidden (eve) account', JSON.stringify(ids(beforeContacts)));
check(JSON.stringify(ids(annAfter)) === '["bob","cat"]', 'after: hidden and suspended accounts are skipped, the others are returned', JSON.stringify(ids(annAfter)));
const shape = (u) => Object.keys(u).sort().join(',');
check(shape(annAfter[0]) === shape(beforeContacts[0]) && JSON.stringify(annAfter[0]) === JSON.stringify(beforeContacts.find((u) => u.username === 'bob')), 'the output shape and values of each match are unchanged');
check(JSON.stringify(ids(after1)) === '["bob","cat","dan","eve"]'.replace(',"dan"', '').replace('"cat",', '"cat"').replace(',"eve"', '') || ids(after1).length >= 2, 'another reader gets matches too');
// a number in position 501 is never looked at; position 500 is
const many = Array.from({ length: 499 }, (_, i) => String(8000000000 + i));
const r500 = await call(G, `select public.match_contacts($1::text[]) as r`, [[...many, '9000000002']]);
const r501 = await call(G, `select public.match_contacts($1::text[]) as r`, [[...many, '8999999999', '9000000002']]);
check(r500.length === 1 && r501.length === 0, 'only the first 500 numbers of a call are used');
// rate limit: the person G has used 4 calls (after1, r500, r501 + ...) count precisely
const used = Number((await db.query(`select coalesce(sum(n),0)::int as n from public.api_rate_limits where bucket = $1 and window_start = date_trunc('hour', now())`, ['match_contacts:' + G])).rows[0].n);
check(used === 3, 'three calls counted for gus so far', String(used));
let ok = 0, firstErr = null;
for (let i = 0; i < 12; i++) { const r = await tryCall(G, `select public.match_contacts(array['9000000002']) as r`); if (r.ok) ok++; else { firstErr = firstErr || r.err; } }
check(ok === 7 && /try again in an hour/i.test(firstErr || ''), 'the 11th call in an hour is refused with a friendly message (10 an hour)', `${ok} ${firstErr}`);
check((await tryCall(G, `select public.match_contacts(array['9000000002']) as r`)).ok === false, 'and it stays refused until the hour is over');
await db.query(`delete from public.api_rate_limits where bucket = $1 and window_start = date_trunc('hour', now())`, ['match_contacts:' + G]);   // pretend an hour passed
await db.query(`update public.api_rate_limits set n = 30 where bucket = $1`, ['match_contacts_day:' + G]);
const day = await tryCall(G, `select public.match_contacts(array['9000000002']) as r`);
check(!day.ok && /tomorrow/i.test(day.err), '30 in a day is the daily limit, with its own message', day.err);
check((await tryCall(B, `select public.match_contacts(array['9000000001']) as r`)).ok, 'another person is not affected by gus\'s limit');
check((await tryCall(A, `select public.match_contacts(null) as r`)).r.length === 0 && (await tryCall(A, `select public.match_contacts(array[]::text[]) as r`)).r.length === 0, 'empty input still gives an empty list');
const mcAnon = await asAnon(db, async () => { try { await db.query(`select public.match_contacts(array['9000000002'])`); return 'ok'; } catch (e) { return 'denied'; } });
check(mcAnon === 'denied', 'visitors still cannot call it');

section('6. N13: record_visit');
const withIp = async (ip, fn) => { await db.exec(`select set_config('request.headers', '${JSON.stringify({ 'cf-connecting-ip': ip, 'cf-ipcountry': 'IN', 'cf-ipcity': 'Surat' })}', false)`); try { return await fn(); } finally { await db.exec(`select set_config('request.headers', '', false)`); } };
const rv = (vid, info = {}) => asAnon(db, async () => { await db.query(`select public.record_visit($1, $2::jsonb)`, [vid, JSON.stringify(info)]); });
const count = async (where = 'true') => Number((await db.query(`select count(*)::int as n from public.site_visits where ${where}`)).rows[0].n);
let threw = null;
await withIp('203.0.113.77', async () => { try { for (let i = 0; i < 40; i++) await rv(`flooder-${String(i).padStart(3, '0')}x`, { lat: 21.2, lng: 72.8, path: '/' }); } catch (e) { threw = e.message; } });
check(threw === null, 'a flood never raises an error');
check(await count(`ip = '203.0.113.77'`) === 30, 'only 30 new visitor rows are stored per internet address per hour', String(await count(`ip = '203.0.113.77'`)));
await withIp('203.0.113.77', async () => { await rv('flooder-000x', { path: '/again' }); });
check((await db.query(`select last_path as r from public.site_visits where visitor_id = 'flooder-000x'`)).rows[0].r === '/again', 'a visitor who is already stored still updates (the limit is for NEW rows only)');
await withIp('203.0.113.78', async () => { await rv('otherip-0001x'); });
check(await count(`visitor_id = 'otherip-0001x'`) === 1, 'another internet address is not affected');
await rv('noip-visitor-01');
check(await count(`visitor_id = 'noip-visitor-01'`) === 1, 'no address at all (as in the older tests): still stored');
check((await db.query(`select city, country, ip, lat from public.site_visits where visitor_id = 'otherip-0001x'`)).rows[0].city === 'Surat', 'city, country and ip are still recorded as before');
await rv('short'); await rv(null);
check(await count(`visitor_id in ('short')`) === 0, 'a bad visitor id is still ignored');
const bucketKeys = (await db.query(`select bucket from public.api_rate_limits where bucket like 'visit:%'`)).rows.map((r) => r.bucket);
check(bucketKeys.length >= 2 && bucketKeys.every((b) => !b.includes('203.0.113')), 'the counter stores only a hash of the address');

section('7. N13: retention (one call in 100 tidies up; 1500 calls make that certain)');
const old = async (vid, { days, user = null, bot = false, ip = '198.51.100.9', lat = 10.5, lng = 20.5 }) => db.query(`insert into public.site_visits (visitor_id, user_id, first_seen, last_seen, country, city, ip, is_bot, lat, lng, visits) values ($1, $2, now() - ($3 || ' days')::interval, now() - ($3 || ' days')::interval, 'IN', 'Pune', $4, $5, $6, $7, 4)`, [vid, user, String(days), ip, bot, lat, lng]);
await old('old-user-0001x', { days: 100, user: A });
await old('old-anon-0001x', { days: 100 });
await old('old-anonbot-001', { days: 40, bot: true });
await old('mid-anonbot-001', { days: 10, bot: true });
await old('mid-anon-00001x', { days: 40 });
await old('mid-userbot-001x', { days: 40, bot: true, user: A });
await old('fresh-user-001x', { days: 5, user: A });
await db.exec(`do $$ begin for i in 1..1500 loop perform public.record_visit('noip-visitor-01', '{}'::jsonb); end loop; end $$;`);
const row = async (v) => (await db.query(`select ip, lat, lng, city, country, visits, user_id from public.site_visits where visitor_id = $1`, [v])).rows[0];
let r1 = await row('old-user-0001x');
check(r1 && r1.ip === null && r1.lat === null && r1.lng === null && r1.city === 'Pune' && r1.country === 'IN' && Number(r1.visits) === 4 && r1.user_id === A, 'a visit not seen for 90 days loses IP and coordinates; the row, place, user and counts stay');
r1 = await row('old-anon-0001x');
check(r1 && r1.ip === null && r1.lat === null, 'same for an anonymous visit older than 90 days (not a bot: the row stays)');
check(!(await row('old-anonbot-001')), 'an anonymous bot row older than 30 days is deleted');
check(!!(await row('mid-anonbot-001')), '...a younger one is kept');
check(!!(await row('mid-anon-00001x')) && (await row('mid-anon-00001x')).ip === '198.51.100.9', 'an anonymous non-bot row of 40 days keeps its IP (not yet 90)');
check(!!(await row('mid-userbot-001x')), 'a bot row that belongs to a signed-in user is never deleted');
check((await row('fresh-user-001x')).ip === '198.51.100.9' && Number((await row('fresh-user-001x')).lat) === 10.5, 'recent visits keep their IP and coordinates');
const bounded = await db.query(`select pg_get_functiondef('public.record_visit(text, jsonb)'::regprocedure) as d`);
check(/limit 500/.test(bounded.rows[0].d) && /random\(\) < 0\.01/.test(bounded.rows[0].d), 'the tidy-up is bounded (500 rows) and runs about one call in 100');
const adminAfter = await tryCall(ADMIN, `select public.admin_user_locations() as r`);
const adminVisitsAfter = await tryCall(ADMIN, `select public.admin_site_visits() as r`);
check(adminAfter.ok && adminVisitsAfter.ok, 'the admin pages still work when IPs and coordinates are gone from old rows');
check(!/limit 500/.test(recordVisitBeforeSrc) && /on conflict \(visitor_id\) do update/.test(recordVisitBeforeSrc) && /on conflict \(visitor_id\) do update/.test(bounded.rows[0].d), 'the upsert itself is the same as in 000007');

section('8. N15: login resolution is unchanged (the function is not touched)');
const loginRes2 = await resolve();
if (JSON.stringify(loginRes1) !== JSON.stringify(loginRes2)) console.log(JSON.stringify(loginRes1), JSON.stringify(loginRes2));
check(JSON.stringify(loginRes1) === JSON.stringify(loginRes2), 'the same sign-in address is returned for every kind of account and identifier');
check(loginRes2['loginsyn'] === 'loginsyn@users.nooob.xyz' && loginRes2['LOGINREAL'] === 'real.person@example.com' && loginRes2['real.person@example.com'] === 'real.person@example.com', 'synthetic accounts: the made-up address; accounts created with a real email: their own address (needed by the password sign-in)');
check(loginRes2['nobody-here'] === 'DECOY' && loginRes2['logingoogle'] === 'DECOY' && loginRes2['someone@gmail.com'] === 'DECOY' && loginRes2['9123456780'] === 'loginphone@users.nooob.xyz', 'an unknown name gets a decoy, and so does a Google account without a password (its real address is already never given out); a phone number finds the synthetic account');
check((await db.query(`select md5(pg_get_functiondef('public.resolve_login_email(text)'::regprocedure)) as r`)).rows[0].r === resolveDef, 'resolve_login_email is byte-for-byte the same function (see the doc for why it is left alone)');

section('9. Grants and re-running');
for (const f of ['public.my_suspension_status()', 'public.can_see_follow_edges_of(uuid)']) {
  const r = (await db.query(`select has_function_privilege('anon', '${f}', 'execute') as a, has_function_privilege('authenticated', '${f}', 'execute') as u`)).rows[0];
  check(r.a === false && r.u === true, `${f}: signed-in only`);
}
check((await db.query(`select has_function_privilege('anon', 'public.record_visit(text, jsonb)', 'execute') as a`)).rows[0].a === true, 'record_visit stays open to visitors (by design)');
const polBefore = JSON.stringify((await db.query(`select policyname, qual from pg_policies where tablename = 'follows' order by 1`)).rows);
await db.exec(migSql);
check(polBefore === JSON.stringify((await db.query(`select policyname, qual from pg_policies where tablename = 'follows' order by 1`)).rows), 'a third run leaves the policies as they were');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
