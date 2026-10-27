// Small fixes of 2026-10-27: category chips wrap, install button rules, no vanish mode, push wording, "Never finished" is accurate.
// Usage: node --liftoff-only scripts/supabase/test-batch-a-20261027.mjs
import fs from 'node:fs';
import { createTestDb } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8');

section('1. Category chips, install button, vanish mode');
const feed = read('src/components/Feed/FeedView.tsx');
check(/flex flex-wrap items-center justify-center gap-2">\s*\{categories\.map/.test(feed), 'the topic chips wrap instead of running off the side, so every one shows on any screen');
const auth = read('src/components/Auth/AuthView.tsx');
check(/const hideInstall = !installElsewhere && \(appInstalled \|\| isAppleMobile\(\)\)/.test(auth) && /\{hideInstall \? null :/.test(auth), 'the install button is hidden once the app is installed and on iPhone / iPad');
const pd = read('src/utils/platformDetect.ts');
check(/iphone\|ipad\|ipod/.test(pd) && /MacIntel/.test(pd) && /export function isAppleMobile/.test(pd), 'an iPad that calls itself a Mac is found by its touch screen');
const chat = read('src/components/Chat/ChatView.tsx');
check(!/Option: Vanish Mode Toggle/.test(chat) && !/onClick=\{handleToggleVanishMode\}/.test(chat) && !/handleToggleVanishMode\(\);/.test(chat), 'the Vanish Mode option is gone from the chat menu');
check(/updateChatSettings\(activeChat\.id, \{ vanishMode: false \}\)/.test(chat), 'a chat that still had it on gets it switched off');

section('2. Push wording');
const sw = read('public/sw.js');
const run = (data) => { const d = { ...data }; if (/^@\S+$/.test(String(d.title || '')) && d.body && !String(d.body).startsWith('@')) { d.body = `${d.title} ${d.body}`; d.title = 'NOOB'; } return d; };
check(/data\.title = 'NOOB'/.test(sw), 'the service worker has the rule');
let r = run({ title: '@rahul', body: 'liked your post.' });
check(r.title === 'NOOB' && r.body === '@rahul liked your post.', '"@rahul" + "liked your post." becomes "NOOB" + "@rahul liked your post."');
r = run({ title: '@rahul', body: '@rahul: hello' });
check(r.title === '@rahul' && r.body === '@rahul: hello', 'a chat message (it already names the sender) is left alone');
r = run({ title: '🛡️ Admin access removed', body: 'The NOOB administrator removed your admin access.' });
check(r.title.startsWith('🛡️'), 'a notification with its own title is left alone');

section('3. "Never finished" is accurate');
const db = await createTestDb();
const add = async (email, withProfile, username) => {
  const id = crypto.randomUUID();
  await db.query(`insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values ($1, $2, '{"provider":"google"}', '{"full_name":"Test"}')`, [id, email]);
  if (withProfile) {
    await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, username]);
    await db.query(`insert into public.profile_private (user_id, email) values ($1, $2)`, [id, email]);
  }
  return id;
};
await add('real@example.com', true, 'realperson');
await add('Real@Example.com', false);           // a second, empty Google login for the same email (what the admin saw)
await add('stranger@example.com', false);       // really never finished
const admin = crypto.randomUUID();
await db.query(`insert into auth.users (id, email) values ($1, 'admin@users.nooob.xyz')`, [admin]);
await db.query(`insert into public.profiles (id, username, display_name, is_admin) values ($1, 'noob', 'NOOB', true)`, [admin]);
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${admin}', false)`);
let res;
try { res = (await db.query(`select public.admin_user_logs(100, 0, null, 'unfinished') r`)).rows[0].r; } catch (e) { res = { error: String(e.message) }; }
await db.exec(`reset role`);
const emails = (res.events || []).map((e) => e.email);
check(!res.error && emails.length === 1 && emails[0] === 'stranger@example.com', 'only the person who really never finished is listed (the one with an account, whatever the capitals, is not)', JSON.stringify(res).slice(0, 200));
check(res.summary?.unfinished === 1, 'and the count says one');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
