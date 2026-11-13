// Tests migration 20261113000001: unread counts are capped at 100 (shown "99+"), small counts unchanged, and the cap makes a huge shared chat cheap.
// Usage: node scripts/supabase/test-chat-counts-capped.mjs [bigMessageCount]
import { createTestDb, asUser } from './pg-test-env.mjs';
let failed = 0;
const check = (c, l, d = '') => { if (c) console.log(`  ok   ${l}`); else { failed++; console.log(`  FAIL ${l} ${d}`); } };
const BIG = Number(process.argv[2] || 20000);
const db = await createTestDb();
const mk = async (name) => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query(`select 1 from public.profiles where id=$1`, [id])).rows.length) await db.query(`insert into public.profiles (id, username, display_name) values ($1,$2,$2)`, [id, name]);
  return id;
};
const me = await mk('me'), amy = await mk('amy');
const chat = async (members) => {
  const id = (await db.query(`insert into public.chats (is_group, is_ai) values (false,false) returning id`)).rows[0].id;
  for (const m of members) await db.query(`insert into public.chat_members (chat_id, user_id) values ($1,$2)`, [id, m]);
  return id;
};
const say = (c, s, n) => db.query(`insert into public.messages (chat_id, sender_id, text) select $1,$2,'hi '||g from generate_series(1,$3) g`, [c, s, n]);
const unread = async (cid) => asUser(db, me, async () => {
  const l = (await db.query(`select public.my_chats() as r`)).rows[0].r; const s = (await db.query(`select public.my_unread_chat_summary() as r`)).rows[0].r;
  return { n: l.find((c) => c.id === cid)?.unreadCount, s };
});
const c1 = await chat([me, amy]); await say(c1, amy, 7);
let r = await unread(c1); check(r.n === 7, 'under the cap: 7 stays 7', JSON.stringify(r));
const c2 = await chat([me, amy]); await say(c2, amy, 99);
r = await unread(c2); check(r.n === 99, '99 stays 99', JSON.stringify(r));
const c3 = await chat([me, amy]); await say(c3, amy, 250);
r = await unread(c3); check(r.n === 100, '250 is capped at 100', JSON.stringify(r));
check(r.s.unreadChats === 3 && r.s.unreadMessages === 7 + 99 + 100, 'summary agrees', JSON.stringify(r.s));
// timing with a big global chat
const g = (await db.query(`insert into public.chats (is_group, is_ai, is_global_default) values (true,false,true) returning id`)).rows[0].id;
await say(g, amy, BIG);
const t = Date.now(); await asUser(db, me, async () => db.query(`select public.my_chats()`)); const t1 = Date.now() - t;
const t2s = Date.now(); await asUser(db, me, async () => db.query(`select public.my_unread_chat_summary()`)); const t2 = Date.now() - t2s;
console.log(`  timing with ${BIG} messages in the global chat: my_chats ${t1} ms, my_unread_chat_summary ${t2} ms`);
if (failed) process.exit(1); console.log('all ok'); process.exit(0);
