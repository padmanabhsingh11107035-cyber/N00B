// Tests migration 20261011000001: the unread-chats badge reads two numbers instead of the whole chat list, and they must agree with the
// full list (my_chats) it replaces, on a REAL Postgres (PGlite) with every migration applied.
//
// Usage: node scripts/supabase/test-chat-unread-summary.mjs
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
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
const call = (uid, sql, params = []) => asUser(db, uid, async () => (await db.query(sql, params)).rows);
const one = async (uid, fn) => (await call(uid, `select public.${fn}() as r`))[0].r;

const me = await mkUser('me');
const a = await mkUser('amy');
const b = await mkUser('ben');
const bot = await mkUser('noob_ai', { is_ai: true });
const mkChat = async (members, extra = {}) => {
  const id = (await db.query(`insert into public.chats (is_group, is_ai) values ($1, $2) returning id`, [members.length > 2, !!extra.isAi])).rows[0].id;
  for (const m of members) await db.query(`insert into public.chat_members (chat_id, user_id, last_read_at) values ($1, $2, $3)`, [id, m, extra.readAt ?? null]);
  return id;
};
const say = (chat, sender, n = 1) => db.query(`insert into public.messages (chat_id, sender_id, text) select $1, $2, 'hi ' || g from generate_series(1, $3) g`, [chat, sender, n]);

// the full-list way of counting (what the badge used to do)
const viaList = async (uid) => {
  const chats = await one(uid, 'my_chats');
  const real = chats.filter((c) => !c.isAi && !(c.participants || []).some((p) => p.isAi));
  return { unreadChats: real.filter((c) => c.unreadCount > 0).length, unreadMessages: real.reduce((s, c) => s + c.unreadCount, 0) };
};

section('1. The numbers match the full chat list');
const empty = await one(me, 'my_unread_chat_summary');
check(empty.unreadChats === 0 && empty.unreadMessages === 0, 'nothing unread to begin with');
const c1 = await mkChat([me, a]);
const c2 = await mkChat([me, b]);
await say(c1, a, 3);
await say(c2, b, 2);
await say(c1, me, 5);                       // my own messages never count
let s = await one(me, 'my_unread_chat_summary');
check(s.unreadChats === 2 && s.unreadMessages === 5, 'two chats, five unread messages (mine are not counted)', JSON.stringify(s));
check(JSON.stringify(s) === JSON.stringify(await viaList(me)), 'identical to what the full list gives');

section('2. Reading clears it');
await db.query(`update public.chat_members set last_read_at = now() + interval '1 second' where chat_id = $1 and user_id = $2`, [c1, me]);
s = await one(me, 'my_unread_chat_summary');
check(s.unreadChats === 1 && s.unreadMessages === 2, 'one chat is read, the other still counts', JSON.stringify(s));
check(JSON.stringify(s) === JSON.stringify(await viaList(me)), 'still identical to the full list');

section('3. AI chats and other people\'s chats');
const ai = await mkChat([me, bot], { isAi: true });
await say(ai, bot, 4);
const withBotOnly = await mkChat([me, bot]);       // not flagged as an AI chat, but an AI account is in it
await say(withBotOnly, bot, 2);
s = await one(me, 'my_unread_chat_summary');
check(s.unreadChats === 1 && s.unreadMessages === 2, 'AI chats are left out, like the app always did', JSON.stringify(s));
check(JSON.stringify(s) === JSON.stringify(await viaList(me)), 'identical to the full list here too');
await say(c2, me, 1);
check((await one(b, 'my_unread_chat_summary')).unreadMessages === 1, 'ben has one unread (my message)');
const amy = await one(a, 'my_unread_chat_summary');
check(amy.unreadChats === 1 && amy.unreadMessages === 5, 'amy sees my five messages (her own three do not count)', JSON.stringify(amy));

section('4. Safety');
let denied = false;
try { await asAnon(db, async () => db.query(`select public.my_unread_chat_summary()`)); } catch (e) { denied = /permission denied/.test(e.message); }
check(denied, 'someone not signed in cannot call it');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
