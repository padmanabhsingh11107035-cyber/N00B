// Tests migration 20261017000003: a logged-out visitor (who holds only the public key) can not run the functions that belong to the logged-in app or to the database's own jobs,
// and a logged-in person still can. The functions that are meant for visitors (public pages from a shared link, sign-up helpers) still work for a visitor.
// On a REAL Postgres (PGlite) with every migration applied. (The same question is asked of the live database by scripts/live-check-exposure.mjs.)
//
// Usage: node scripts/supabase/test-visitor-functions.mjs
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);

const db = await createTestDb();
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const id = (await q(`select gen_random_uuid() as id`))[0].id;
await q(`insert into auth.users (id, email, encrypted_password) values ($1, 'visitor-test@users.nooob.xyz', 'x')`, [id]);
if (!(await q(`select 1 from public.profiles where id = $1`, [id])).length) await q(`insert into public.profiles (id, username, display_name) values ($1, 'vt', 'vt')`, [id]);

const asVisitor = (sql) => asAnon(db, async () => (await db.query(sql)).rows);
const asMember = (sql) => asUser(db, id, async () => (await db.query(sql)).rows);
const denied = async (fn) => { try { await fn(); return false; } catch (e) { return /permission denied/i.test(e.message); } };

section('1. Not for a visitor');
const closed = [
  'select public.generate_suggested_user_notifications()',
  'select public.settings_defaults()',
  'select public.settings_enums()',
  'select public.get_daily_challenge()',
  `select public.fetch_daily_challenge_entries(current_date)`,
  'select public.fetch_daily_champions(5)',
  'select public.fetch_song_guess_leaderboard(5)',
  'select public.get_song_guess_round()',
  'select public.list_noob_rooms()'
];
for (const sql of closed) check(await denied(() => asVisitor(sql)), `a visitor is refused: ${sql.replace('select public.', '')}`);

section('2. Still for a logged-in person');
for (const sql of ['select public.get_daily_challenge()', 'select public.fetch_daily_champions(5)', 'select public.fetch_song_guess_leaderboard(5)', 'select public.list_noob_rooms()', 'select public.get_song_guess_round()', 'select public.fetch_daily_challenge_entries(current_date)']) {
  let ok = true;
  try { await asMember(sql); } catch (e) { ok = !/permission denied/i.test(e.message); }
  check(ok, `a member is not refused: ${sql.replace('select public.', '')}`);
}
check(await denied(() => asMember('select public.generate_suggested_user_notifications()')), 'nobody but the database job can run the suggested-people job (not even a member)');
check(await denied(() => asMember('select public.settings_defaults()')), 'the settings helpers are for the database only (the settings functions call them)');
const mine = (await asMember('select public.my_settings() as r'))[0].r;
check(mine.settings && mine.settings['msg.who'] === 'connected', 'but the settings page still works for a member (the database calls the helpers itself)');

section('3. Meant for visitors');
for (const sql of ['select public.public_platform_settings()', 'select public.fun_today()', `select public.tot_today()`, `select public.poll_list('open', 5, null, null)`, `select public.anon_messages_feed(5, null, null)`]) {
  let ok = true;
  try { await asVisitor(sql); } catch (e) { ok = !/permission denied/i.test(e.message); }
  check(ok, `a visitor may still use: ${sql.replace('select public.', '').slice(0, 40)}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
