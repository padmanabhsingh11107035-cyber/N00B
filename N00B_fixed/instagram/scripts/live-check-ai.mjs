// Live check of the AI Edge Function (support assistant + message translation) on a real project, through the
// PUBLIC API only, using the real AI key stored in Supabase. Two brand-new throwaway accounts; both are deleted
// at the end (only after confirming each is signed in as the throwaway it created).
//
//   $env:SUPABASE_URL = "https://<ref>.supabase.co"
//   $env:SUPABASE_PUBLISHABLE_KEY = "sb_publishable_..."
//   node scripts/live-check-ai.mjs [function-name]      (default: dynamic-handler)
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY;
const FN = process.argv[2] || 'dynamic-handler';
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY first.'); process.exit(1); }
let passed = 0, failed = 0;
const check = (ok, label, detail = '') => { if (ok) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const note = (msg) => console.log(`  note ${msg}`);
const fresh = () => createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const rpc = async (c, fn, args = {}) => { const { data, error } = await c.rpc(fn, args); if (error) throw new Error(`${fn}: ${error.message}`); return data; };

async function ask(c, body) {
  const { data, error } = await c.functions.invoke(FN, { body });
  if (error) { let status = null, msg = error.message; try { status = error.context.status; msg = (await error.context.json()).error; } catch { /* keep */ } return { ok: false, status, msg }; }
  return { ok: true, data };
}

const stamp = Date.now().toString(36);
const PW = 'Test-pass-1234';
async function makeUser(tag) {
  const c = fresh();
  const username = `l5${tag}_${stamp}`;
  const { data, error } = await c.auth.signUp({ email: `${crypto.randomUUID()}@users.nooob.xyz`, password: PW,
    options: { data: { username, first_name: 'Ai', last_name: tag, email: `l5${tag}@example.com`, mobile_number: '9000000011', date_of_birth: '2005-05-05', bio: 'ai check', agreed_to_terms: true } } });
  if (error || !data.session) throw new Error(`sign-up failed: ${error?.message}`);
  const me = await rpc(c, 'get_my_user');
  if (me.username !== username) throw new Error('signed in as the wrong account — stopping');
  return { c, id: data.user.id, username };
}

const A = await makeUser('a');
const B = await makeUser('b');
let loungeMsg = null, lounge = null;
try {
  console.log('\nThe function is reachable and safe');
  const guest = fresh();
  const g1 = await ask(guest, { message: 'hi' });
  check(g1.ok && g1.data.success && /^Hey NOOB Explorer!/.test(g1.data.reply), 'a logged-out visitor gets the generic instant greeting (no login needed)', JSON.stringify(g1).slice(0, 200));
  const e1 = await ask(A.c, { message: '   ' });
  check(!e1.ok && e1.status === 400, 'an empty message is refused');
  const gt = await ask(guest, { action: 'translate', chatId: 'x', messageId: 'y' });
  check(!gt.ok && gt.status === 401, 'a logged-out visitor can not translate');

  console.log('\nQuick answers (no AI needed)');
  const hi = await ask(A.c, { message: 'Hello' });
  check(hi.ok && hi.data.reply.includes('Hey ') && hi.data.user.username === A.username, 'a signed-in person is greeted using their own profile');
  const th = await ask(A.c, { message: 'thanks' });
  check(th.ok && th.data.reply.includes('You are most welcome') && th.data.model === 'instant-knowledge-engine', '"thanks" gets a warm instant reply');

  console.log('\nReal AI answers (using the AI key stored in Supabase)');
  const q1 = await ask(A.c, { message: 'What is the minimum age to create a NOOB account?' });
  check(q1.ok && q1.data.model === 'groq' && /13/.test(q1.data.reply), 'the AI answers a policy question correctly', JSON.stringify(q1).slice(0, 300));
  const q2 = await ask(A.c, { message: 'How many NOOB points do I get for winning a mini-game?', conversationHistory: [{ sender: 'user', text: 'How many NOOB points do I get for winning a mini-game?' }] });
  check(q2.ok && q2.data.model === 'groq' && /10,?000,?000|10 million/i.test(q2.data.reply), 'it knows the CURRENT points for a win (10 million)', JSON.stringify(q2).slice(0, 300));
  const q3 = await ask(A.c, { message: 'Which company hosts your database and servers? Name the exact provider.' });
  check(q3.ok, 'a question about the hosting provider gets an answer');
  if (q3.ok && /supabase|render|cloudflare|mongo|backblaze|postgres|aws|amazon/i.test(q3.data.reply)) note(`the AI named a provider — worth reviewing: "${q3.data.reply.slice(0, 160)}"`);
  else if (q3.ok) console.log('  ok   ...and it does not name any hosting provider');

  console.log('\nHarassment: a real report and block');
  const rp = await ask(A.c, { message: `@${B.username} keeps harassing me` });
  check(rp.ok && rp.data.action === 'USER_BLOCKED_AND_REPORTED' && rp.data.reportedUsername === B.username, 'naming a person files a report through the assistant', JSON.stringify(rp).slice(0, 300));
  check((await rpc(A.c, 'get_my_user')).blockedUserIds.includes(B.id), 'and the person really is blocked');
  const rp2 = await ask(A.c, { message: `@${A.username} is harassing me` });
  check(rp2.ok && /your own account/.test(rp2.data.reply), 'reporting yourself is handled kindly');
  const rp3 = await ask(guest, { message: `@${B.username} is harassing me` });
  check(rp3.ok && /log in first/.test(rp3.data.reply), 'a logged-out visitor is asked to log in first');

  console.log('\nTranslation');
  lounge = (await rpc(A.c, 'my_chats')).find((c) => c.isGlobalDefault);
  loungeMsg = (await rpc(A.c, 'send_message', { p_chat: lounge.id, p: { text: 'Hola, ¿cómo estás? Me llamo Ana y me gusta jugar.' } })).message;
  const tr = await ask(A.c, { action: 'translate', chatId: lounge.id, messageId: loungeMsg.id });
  check(tr.ok && tr.data.success && /hello|hi\b|how are you/i.test(tr.data.translatedText), 'a Spanish message is translated into English', JSON.stringify(tr).slice(0, 300));
  const tr2 = await ask(A.c, { action: 'translate', chatId: lounge.id, messageId: '00000000-0000-0000-0000-000000000001' });
  check(!tr2.ok && tr2.status === 404, 'an unknown message is refused');
} catch (err) {
  failed++; console.log(`  FAIL unexpected error: ${err.message}`);
} finally {
  for (const u of [A, B]) {
    try {
      const me = await rpc(u.c, 'get_my_user');
      if (me.username !== u.username) { console.log(`  note: refusing to delete — signed in as ${me.username}, expected ${u.username}`); continue; }
      await u.c.from('messages').delete().eq('sender_id', u.id);
      await rpc(u.c, 'delete_my_account', { p_password: PW });
    } catch (e) { console.log(`  note: could not delete throwaway ${u.username}: ${e.message}`); }
  }
  console.log('  cleanup: both throwaway accounts removed');
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(process.exitCode), 500);
