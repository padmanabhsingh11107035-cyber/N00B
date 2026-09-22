// Live check of the "dynamic-handler" edge function's AI support assistant, through the PUBLIC
// API only (publishable key) — exactly what the app does. Creates ONE throwaway account, asks it
// a few real questions (real Groq API calls — kept short and few on purpose, this costs quota),
// and deletes the account at the end. Never touches a real account or places any real Shop NOOB
// order (a live-check must never pollute the real shop's order queue).
//
//   $env:SUPABASE_URL = "https://<ref>.supabase.co"
//   $env:SUPABASE_PUBLISHABLE_KEY = "sb_publishable_..."
//   node scripts/live-check-support-ai.mjs
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY first.'); process.exit(1); }

let passed = 0, failed = 0;
const check = (ok, label, detail = '') => { if (ok) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const c = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const stamp = Date.now().toString(36);
const PW = 'Test-pass-1234';
const { data, error } = await c.auth.signUp({
  email: `${crypto.randomUUID()}@users.nooob.xyz`, password: PW,
  options: { data: { username: `ltai_${stamp}`, first_name: 'Live', last_name: 'Check', email: `ltai@example.com`, mobile_number: '9000000004', date_of_birth: '2005-05-05', bio: 'automated check', agreed_to_terms: true } }
});
if (error || !data.session) throw new Error(`sign-up failed: ${error?.message || 'no session (is "Confirm email" still on?)'}`);

const ask = async (message, channel) => {
  const { data, error } = await c.functions.invoke('dynamic-handler', { body: { action: 'support', message, conversationHistory: [], lang: 'en', channel } });
  if (error) throw error;
  return data;
};

try {
  section('AI support assistant — personal details & orders');
  const email = await ask("what's my email and my mobile number on file?", 'call');
  check(email.success === true, 'answers with a real reply', JSON.stringify(email).slice(0, 200));
  check(/ltai@example\.com/i.test(email.reply) || /9000000004/.test(email.reply), 'uses the real account details, not a refusal', email.reply);
  check(!/don'?t have access|cannot access|no access/i.test(email.reply), 'never claims it lacks access to the person\'s own info', email.reply);

  const pro = await ask('am I subscribed to noob pro?', 'call');
  check(/not subscribed|don'?t have|no.*pro|free/i.test(pro.reply), 'correctly reports no active Pro subscription for a fresh account', pro.reply);

  const orders = await ask('what are my latest shop noob orders?', 'call');
  check(/no.*orders|haven'?t (placed|ordered)|don'?t have any/i.test(orders.reply), 'correctly reports no orders for a fresh account', orders.reply);

  section('Voice-call formatting (no markdown/emoji should ever reach a spoken reply)');
  const hasMarkdown = (s) => /[*#_`•]|👋|💖|🌟|💪|🛡️/.test(s);
  check(!hasMarkdown(email.reply) && !hasMarkdown(pro.reply) && !hasMarkdown(orders.reply), 'no markdown/emoji symbols in call-channel replies', [email.reply, pro.reply, orders.reply].join(' | '));

  const greeting = await ask('hi', 'call');
  check(!hasMarkdown(greeting.reply), 'the canned greeting is also plain for a call (no wave emoji)', greeting.reply);

  section('Text channel is unaffected (still allowed to use its normal formatting)');
  const textGreeting = await ask('hi', 'text');
  check(/👋/.test(textGreeting.reply), 'the text-chat greeting keeps its emoji (channel defaults preserved)', textGreeting.reply);
} finally {
  try { await c.rpc('delete_my_account', { p_password: PW }); } catch (e) { console.log(`  note: could not delete throwaway account: ${e.message}`); }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(process.exitCode), 500);
