// Moving the hidden login addresses off nooob.xyz (migration 20261118000006) on a REAL Postgres (PGlite): logins keep working, real emails are never touched, it can be undone, it can run twice.
// Usage: node --liftoff-only scripts/supabase/test-fake-login-domain-db.mjs
let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const { createTestDb, asUser, asAnon } = await import('./pg-test-env.mjs');
const db = await createTestDb();
const PW = 'secret pass';
// the test database has no identities table (Supabase has one): make a small one so that part is tested too
await db.query(`create table if not exists auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid not null, provider text not null, provider_id text not null, identity_data jsonb not null default '{}')`);
const mk = async (name, email) => {
  const id = (await db.query('select gen_random_uuid() as id')).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, extensions.crypt($3, extensions.gen_salt('bf')))`, [id, email, PW]);
  await db.query('insert into public.profiles (id, username, display_name) values ($1, $2, $2) on conflict (id) do nothing', [id, name]);
  await db.query(`insert into auth.identities (user_id, provider, provider_id, identity_data) values ($1::uuid, 'email', $2::text, jsonb_build_object('sub', $3::text, 'email', $2::text))`, [id, email, id]);
  return id;
};
const oldA = crypto.randomUUID() + '@users.nooob.xyz', oldB = crypto.randomUUID() + '@users.nooob.xyz';
const ann = await mk('ann', oldA), bob = await mk('bob', oldB), gina = await mk('gina', 'gina.real@example.com');
const resolve = async (who) => (await db.query('select public.resolve_login_email($1) as r', [who])).rows[0].r;

section('Before the move');
check(await resolve('ann') === oldA, 'the login helper gives the old hidden address');

section('The move');
const moved = (await db.query('select public.migrate_fake_login_emails() as n')).rows[0].n;
check(moved === 2, 'exactly the two made-up addresses were moved', `(moved ${moved})`);
const newA = oldA.replace('@users.nooob.xyz', '@users.noobsocials.com');
check((await db.query('select email from auth.users where id = $1', [ann])).rows[0].email === newA, 'the login address is now on our own domain');
check((await db.query('select email from auth.users where id = $1', [gina])).rows[0].email === 'gina.real@example.com', 'a real email address is never touched');
check(await resolve('ann') === newA && await resolve('bob') === oldB.replace('@users.nooob.xyz', '@users.noobsocials.com'), 'the login helper follows: it now gives the new address');
const idn = (await db.query(`select provider_id, identity_data->>'email' as e from auth.identities where user_id = $1`, [ann])).rows[0];
check(idn.e === newA && idn.provider_id === newA, 'the identity rows match the new address');
const enc = (await db.query('select encrypted_password from auth.users where id = $1', [ann])).rows[0].encrypted_password;
check((await db.query(`select extensions.crypt($1, $2) = $2 as ok`, [PW, enc])).rows[0].ok === true, 'the password is unchanged, so the same password still logs in');
check((await db.query('select count(*)::int as n from public.profiles where id = any($1)', [[ann, bob, gina]])).rows[0].n === 3, 'no profile or other data was touched');

section('Safety net');
const bk = (await db.query('select old_email, new_email from public.login_email_backup where user_id = $1', [ann])).rows[0];
check(bk.old_email === oldA && bk.new_email === newA, 'the old address is saved in the backup table');
check((await db.query('select public.migrate_fake_login_emails() as n')).rows[0].n === 0, 'running it again changes nothing');
// undo, exactly as written in the migration
await db.query(`update auth.users u set email = b.old_email from public.login_email_backup b where b.user_id = u.id`);
await db.query(`update auth.identities i set identity_data = jsonb_set(i.identity_data, '{email}', to_jsonb(b.old_email)), provider_id = case when i.provider_id = b.new_email then b.old_email else i.provider_id end from public.login_email_backup b where i.user_id = b.user_id and i.provider = 'email'`);
check(await resolve('ann') === oldA, 'the written undo steps bring the old address back');
await db.query('select public.migrate_fake_login_emails()');
check(await resolve('ann') === newA, 'and the move can be done again');

section('Both domains are "made-up addresses"');
const f = async (e) => (await db.query('select public.is_fake_login_email($1) as r', [e])).rows[0].r;
check(await f('x@users.nooob.xyz') && await f('X@Users.NoobSocials.com') && !(await f('real@gmail.com')) && !(await f(null)), 'the helper knows both made-up domains and nothing else');
const noAccess = await asAnon(db, async () => { try { await db.query('select public.migrate_fake_login_emails()'); return 'ran'; } catch (e) { return e.message; } });
check(/permission denied/i.test(noAccess), 'nobody but the server itself can run the move');
const noTable = await asUser(db, ann, async () => { try { await db.query('select * from public.login_email_backup'); return 'read'; } catch (e) { return e.message; } });
check(/permission denied/i.test(noTable), 'nobody can read the backup table');
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
