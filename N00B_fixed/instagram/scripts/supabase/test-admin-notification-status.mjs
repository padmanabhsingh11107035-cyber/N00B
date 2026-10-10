// Tests that the admin account list tells whether each person has notifications switched on (migration 20261010000009).
//
// Usage: node scripts/supabase/test-admin-notification-status.mjs
import { createTestDb, asUser } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };

const db = await createTestDb();
const mk = async (name) => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, name]);
  return id;
};
const [on, off, iphone, fox, win, odd] = [await mk('pushon'), await mk('pushoff'), await mk('iphoneuser'), await mk('foxuser'), await mk('winuser'), await mk('odduser')];
const sub = (endpoint) => JSON.stringify({ endpoint, keys: { p256dh: 'k', auth: 'a' } });
for (const [id, ep] of [[on, 'https://fcm.googleapis.com/fcm/send/abc'], [iphone, 'https://web.push.apple.com/xyz'], [fox, 'https://updates.push.services.mozilla.com/wpush/v2/q'], [win, 'https://wns2-par02p.notify.windows.com/w/?token=1'], [odd, 'https://push.example.org/1']]) {
  await db.query(`insert into public.push_subscriptions (user_id, subscription) values ($1, $2::jsonb)`, [id, sub(ep)]);
}
const view = async (id) => (await db.query(`select public.admin_user_view(p) as v from public.profiles p where p.id = $1`, [id])).rows[0].v;

console.log('1. What the admin sees');
const a = await view(on), b = await view(off);
check(a.pushEnabled === true && !!a.pushUpdatedAt, 'a person who allowed notifications shows as ON, with the date');
check(b.pushEnabled === false && b.pushUpdatedAt === undefined && b.pushKind === undefined, 'a person who did not shows as OFF');
check(a.pushKind === 'chrome' && (await view(iphone)).pushKind === 'apple' && (await view(fox)).pushKind === 'firefox' && (await view(win)).pushKind === 'edge' && (await view(odd)).pushKind === 'other', 'the kind of device is worked out (Chrome / Android, Apple, Firefox, Edge, other)');
check(!JSON.stringify(a).includes('fcm.googleapis') && !JSON.stringify(a).includes('p256dh'), 'the notification address and keys are never shown');
check(a.username === 'pushon' && 'isStaff' in a, 'everything the list showed before is still there');

console.log('2. The list, as the NOOB administrator sees it');
const admin = await mk('noob');
await db.query(`update public.profiles set is_admin = true where id = $1`, [admin]);
const rows = await asUser(db, admin, async () => (await db.query(`select public.admin_users_list() as r`)).rows[0].r.users);
const byName = Object.fromEntries(rows.map((u) => [u.username, u]));
check(byName.pushon?.pushEnabled === true && byName.pushoff?.pushEnabled === false && byName.iphoneuser?.pushKind === 'apple', 'the account list carries it for every account');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
