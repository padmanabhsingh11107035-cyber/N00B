// Tests migration 20261012000003: the NOOB administrator verifies (or un-verifies) an account; the person is told by notification and by e-mail,
// and it is written to the activity log, on a REAL Postgres (PGlite) with every migration applied.
//
// Usage: node scripts/supabase/test-admin-verification.mjs
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const expectFail = async (fn, pattern, label) => {
  try { await fn(); check(false, label, '(expected an error, but it succeeded)'); }
  catch (e) { check(pattern.test(e.message), label, `(got: ${e.message})`); }
};
const section = (t) => console.log(`\n${t}`);

const db = await createTestDb();
const mkUser = async (name, patch = {}) => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  const has = (await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length;
  if (!has) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, name]);
  for (const [col, val] of Object.entries(patch)) await db.query(`update public.profiles set ${col} = $2 where id = $1`, [id, val]);
  return id;
};
const rpc = (uid, fn, ...args) => asUser(db, uid, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);

const admin = await mkUser('noob', { is_admin: true });
const ann = await mkUser('ann');
const bob = await mkUser('bob');
const flags = async (id) => (await db.query(`select is_verified, verification_tier from public.profiles where id = $1`, [id])).rows[0];

section('1. Only the main administrator');
await expectFail(() => rpc(ann, 'admin_set_verification', bob, true), /Only the main NOOB administrator/, 'an ordinary member cannot verify anyone');
await expectFail(() => rpc(ann, 'admin_set_verification', ann, true), /Only the main NOOB administrator/, 'not even themselves');
let denied = false;
try { await asAnon(db, async () => db.query(`select public.admin_set_verification($1, true)`, [ann])); } catch (e) { denied = /permission denied/.test(e.message); }
check(denied, 'someone not signed in cannot call it');
check((await flags(ann)).is_verified === false, 'nothing changed');

section('2. Verifying an account');
const res = await rpc(admin, 'admin_set_verification', ann, true);
check(res.success === true && res.verified === true && /@ann is verified/.test(res.message), 'the admin verifies ann');
let f = await flags(ann);
check(f.is_verified === true && f.verification_tier === 'premium', 'the account carries the badge');
const note = (await db.query(`select message, title, type from public.notifications where target_user_id = $1 order by created_at desc limit 1`, [ann])).rows[0];
check(note?.type === 'admin_direct' && /verified/i.test(note.message) && /verified/i.test(note.title), 'ann got a notification', JSON.stringify(note));
const mail = (await db.query(`select kind, payload, status from public.email_outbox where user_id = $1`, [ann])).rows;
check(mail.length === 1 && mail[0].kind === 'verified_by_admin' && mail[0].payload.username === 'ann', 'and an e-mail was queued', JSON.stringify(mail));
check(mail[0].payload.by?.username === 'noob', 'the e-mail carries which admin account granted it');
check((await db.query(`select 1 from public.admin_audit_log where action = 'verification_granted' and target_id = $1`, [ann])).rows.length === 1, 'the activity log has it');
const asSeen = await rpc(bob, 'user_by_id', ann);
check(asSeen.isVerified === true, 'everyone sees the badge at once');
await expectFail(() => rpc(admin, 'admin_set_verification', ann, true), /already verified/, 'verifying twice is refused (no second e-mail)');
check((await db.query(`select count(*)::int n from public.email_outbox where user_id = $1`, [ann])).rows[0].n === 1, 'still one e-mail');

section('3. Taking it away');
await expectFail(() => rpc(admin, 'admin_set_verification', bob, false), /is not verified/, 'removing a badge that is not there is refused');
const rem = await rpc(admin, 'admin_set_verification', ann, false);
f = await flags(ann);
check(rem.verified === false && f.is_verified === false && f.verification_tier === null, 'the badge is removed');
const note2 = (await db.query(`select message from public.notifications where target_user_id = $1 order by created_at desc limit 1`, [ann])).rows[0];
check(/removed/i.test(note2.message), 'ann is told');
check((await db.query(`select 1 from public.admin_audit_log where action = 'verification_removed' and target_id = $1`, [ann])).rows.length === 1, 'the activity log has that too');
await expectFail(() => rpc(admin, 'admin_set_verification', '00000000-0000-4000-8000-000000000001', true), /not found/, 'an account that does not exist is refused');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
