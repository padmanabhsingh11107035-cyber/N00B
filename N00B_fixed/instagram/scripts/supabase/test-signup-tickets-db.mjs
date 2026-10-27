// Tests migrations 20261027000001 / 20261027000002: nobody can make a login through the service's public sign-up address without the emailed-code check.
//   * a new email / phone / anonymous login is refused unless the emailed-code flow wrote its ticket first
//   * the ticket is for one login only, and for that exact private address only
//   * Google (and the other providers) are not affected, nor is anything the older tests do
//   * the old escape hatches ("legacy_id" in the sign-up data, no username at all) no longer work from a direct call
//   * the email-in-use question for the login screen
//
// Usage: node --liftoff-only scripts/supabase/test-signup-tickets-db.mjs
import fs from 'node:fs';
import { createTestDb } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);

const db = await createTestDb();
const insertUser = async (email, provider, meta = {}) => {
  const id = crypto.randomUUID();
  try {
    await db.query(`insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values ($1, $2, $3::jsonb, $4::jsonb)`, [id, email, JSON.stringify(provider ? { provider } : {}), JSON.stringify(meta)]);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
};
const REFUSED = /verify your email before creating your account/;
const ticket = (addr) => db.query(`insert into public.signup_tickets (auth_email) values ($1)`, [addr]);

section('1. Direct sign-ups are refused');
let r = await insertUser(`${crypto.randomUUID()}@users.nooob.xyz`, 'email', { username: 'sneaky' });
check(!r.ok && REFUSED.test(r.error), 'a plain email sign-up with no ticket is refused');
r = await insertUser(`${crypto.randomUUID()}@users.nooob.xyz`, 'email', { legacy_id: 'x' });
check(!r.ok && REFUSED.test(r.error), '...also with "legacy_id" in the data (it used to skip the profile check)');
r = await insertUser(`${crypto.randomUUID()}@users.nooob.xyz`, 'email', {});
check(!r.ok && REFUSED.test(r.error), '...also with no username at all (the other escape hatch)');
r = await insertUser('someone@gmail.com', 'email', {});
check(!r.ok, 'a "send me a link" login for a new address (shouldCreateUser) is refused as well');
r = await insertUser(null, 'phone', {});
check(!r.ok && REFUSED.test(r.error), 'a phone sign-up is refused');
r = await insertUser(null, 'anonymous', {});
check(!r.ok && REFUSED.test(r.error), 'an anonymous sign-in is refused');
check(Number((await db.query(`select count(*) c from auth.users`)).rows[0].c) === 0, 'and none of them left a row behind');

section('2. The ticket');
const addr = `${crypto.randomUUID()}@users.nooob.xyz`;
await ticket(addr);
r = await insertUser(addr, 'email', { legacy_id: 'ticketed' });   // no username: the profile step (needs a verified code + photo) is not what is tested here
check(r.ok, 'a login whose private address has a ticket is made');
check(Number((await db.query(`select count(*) c from public.signup_tickets where auth_email = $1`, [addr])).rows[0].c) === 0, 'the ticket is used up by it');
r = await insertUser(addr, 'email', { legacy_id: 'again' });
check(!r.ok, 'a second login with the same address is refused (one ticket, one login)');
await ticket(`${crypto.randomUUID()}@users.nooob.xyz`);
r = await insertUser(`${crypto.randomUUID()}@users.nooob.xyz`, 'email', {});
check(!r.ok, "a ticket for one address does not open the door for another");
const upper = `${crypto.randomUUID()}@users.nooob.xyz`;
await ticket(upper);
r = await insertUser(upper.toUpperCase(), 'email', { legacy_id: 'cased' });
check(r.ok, 'the address is compared in lower case (the login service lower-cases it)');
await db.query(`insert into public.signup_tickets (auth_email, created_at) values ($1, now() - interval '30 minutes')`, ['old@users.nooob.xyz']);
r = await insertUser('old@users.nooob.xyz', 'email', {});
check(!r.ok, 'a ticket older than ten minutes is worth nothing');

section('3. What is not affected');
r = await insertUser('person@gmail.com', 'google', { full_name: 'Person' });
check(r.ok, 'Continue with Google still creates its login (the profile is made later by complete_oauth_profile, which needs the code)');
for (const prov of ['facebook', 'discord', 'github', 'azure', 'twitter', 'spotify']) {
  r = await insertUser(`${prov}@example.com`, prov, {});
  check(r.ok, `Continue with ${prov} still works`);
}
r = await insertUser(`${crypto.randomUUID()}@users.nooob.xyz`, null, { legacy_id: 'abc' });
check(r.ok, 'a row made with no provider at all (what the older tests and the old import do) is not touched');

section('4. Who can read or write the tickets');
const asRole = async (role, sql) => {
  await db.exec(`set role ${role}`);
  try { await db.query(sql); return true; } catch { return false; } finally { await db.exec('reset role'); }
};
check(!(await asRole('anon', `select * from public.signup_tickets`)) && !(await asRole('authenticated', `select * from public.signup_tickets`)), 'nobody logged in or out can even read the tickets');
check(!(await asRole('anon', `insert into public.signup_tickets (auth_email) values ('x@users.nooob.xyz')`)) && !(await asRole('authenticated', `insert into public.signup_tickets (auth_email) values ('x@users.nooob.xyz')`)), 'and nobody but the server can write one');
check(await asRole('service_role', `insert into public.signup_tickets (auth_email) values ('svc@users.nooob.xyz')`), 'the server (service key) can');
check(!(await asRole('anon', `select public.noob_block_direct_signup()`)) && !(await asRole('authenticated', `select public.noob_block_direct_signup()`)), 'the rule itself can not be called from a browser');

section('5. "Is there an account with this email?"');
const uid = crypto.randomUUID();
await db.query(`insert into auth.users (id, email) values ($1, $2)`, [uid, `${crypto.randomUUID()}@users.nooob.xyz`]);
await db.query(`insert into public.profiles (id, username, display_name) values ($1, 'emailowner', 'Email Owner')`, [uid]);
await db.query(`insert into public.profile_private (user_id, email) values ($1, 'Owner@Example.com')`, [uid]);
const q = async (e) => (await db.query(`select public.email_in_use($1) t`, [e])).rows[0].t;
check((await q('owner@example.com')) === true && (await q('  OWNER@example.COM ')) === true, 'a registered email is found (any capitals, spaces around it)');
check((await q('nobody@example.com')) === false && (await q('')) === false && (await q(null)) === false, 'an unknown, empty or missing one is not');
check(await asRole('anon', `select public.email_in_use('a@b.c')`), 'it can be asked from the login screen (nobody logged in)');

section('6. The files');
const m1 = fs.readFileSync('supabase/migrations/20261027000001_signup_tickets.sql', 'utf8');
const m2 = fs.readFileSync('supabase/migrations/20261027000002_signup_tickets_turn_on.sql', 'utf8');
check(!/create trigger/i.test(m1.replace(/--.*$/gm, '')) && /create trigger noob_block_direct_signup\s+before insert on auth\.users/i.test(m2), 'the first file only prepares (no trigger); the second one turns the rule on');
check(/drop trigger if exists noob_block_direct_signup/.test(m2), 'and the second one says how to turn it off again');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
