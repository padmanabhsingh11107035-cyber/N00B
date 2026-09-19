// Checks a Supabase project against a MongoDB backup, READ-ONLY (nothing is written):
//
//   1. every row and field of the import is present and exactly right
//   2. (optional) real login + privacy checks through the public API, exactly
//      the way the website will use it — needs the PUBLISHABLE key, which is
//      meant to be public
//
// Usage (PowerShell, same window as the import; values are read from the
// environment and never printed):
//
//   node scripts/verify-supabase.mjs
//
// For step 2 also set:  $env:SUPABASE_PUBLISHABLE_KEY = "<publishable key>"
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadBackup, buildImportPlan } from './supabase/transform.mjs';
import { verifyDeep } from './supabase/verify.mjs';

const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secret) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set. Set them in your terminal first.');
  process.exit(1);
}
const backupsRoot = 'backups';
const dir = process.argv.slice(2).find((a) => !a.startsWith('--'))
  || path.join(backupsRoot, fs.readdirSync(backupsRoot).filter((d) => fs.existsSync(path.join(backupsRoot, d, 'users.json'))).sort().pop());
const plan = buildImportPlan(loadBackup(dir), { withChats: process.argv.includes('--with-chats') });

const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
const adapter = {
  async fetchAll(table) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin.from(table).select('*').range(from, from + 999);
      if (error) throw new Error(`reading ${table}: ${error.message}`);
      out.push(...data);
      if (data.length < 1000) return out;
    }
  },
  async getAuthUser(id) {
    const { data, error } = await admin.auth.admin.getUserById(id);
    return error ? null : data.user;
  }
};

console.log(`Comparing the backup (${dir}) with ${new URL(url).host} ...`);
const result = await verifyDeep(plan, adapter);
console.log(`Checked ${result.rowsChecked} rows / ${result.fieldsChecked} fields and ${result.loginAccountsChecked} login accounts.`);
result.notes.forEach((n) => console.log(`  note: ${n}`));
if (result.ok) console.log('EXACT MATCH: every row and every field in Supabase equals the backup.');
else { console.log('\nDIFFERENCES FOUND:'); result.problems.slice(0, 40).forEach((p) => console.log(`  - ${p}`)); }

// ---- optional: real logins + privacy through the public API
const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
let liveOk = true;
if (publishable) {
  console.log('\nLive checks through the public API (what the website will do):');
  const flagged = new Set((await adapter.fetchAll('profiles')).filter((p) => p.extra?.needs_password_reset).map((p) => p.id));
  const fresh = () => createClient(url, publishable, { auth: { autoRefreshToken: false, persistSession: false } });
  const check = (ok, label, detail = '') => { if (!ok) liveOk = false; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ` ${detail}`}`); };

  const anon = fresh();
  const anonRead = await anon.from('profiles').select('id').limit(1);
  check(!!anonRead.error || (anonRead.data || []).length === 0, 'a logged-out visitor can NOT read profiles');
  const login = await anon.rpc('resolve_login_email', { identifier: plan.tables.profiles[1].username });
  check(login.data === plan.authUsers.find((a) => a.id === plan.tables.profiles[1].id).email, 'typing a username finds the right login account');

  let signedIn = 0;
  const failed = [];
  let sample = null;
  for (const a of plan.authUsers) {
    if (flagged.has(a.id)) continue;
    const client = fresh();
    const { error } = await client.auth.signInWithPassword({ email: a.email, password: a.password });
    if (error) failed.push(a.user_metadata.username);
    else { signedIn++; if (!sample) sample = { client, a }; else await client.auth.signOut(); }
  }
  check(failed.length === 0, `${signedIn} accounts can log in with their OLD password`, `— could not log in: ${failed.join(', ')}`);
  if (flagged.size) console.log(`  note: ${flagged.size} account(s) flagged for a password reset were skipped`);
  if (sample) {
    const me = await sample.client.from('profiles').select('id');
    check(!me.error && me.data.length === plan.tables.profiles.length, `a logged-in user sees all ${plan.tables.profiles.length} profile cards`);
    const priv = await sample.client.from('profile_private').select('user_id');
    check(!priv.error && priv.data.length === 1 && priv.data[0].user_id === sample.a.id, 'a logged-in user sees ONLY their own private details');
    const legacy = await sample.client.from('legacy_import').select('key').limit(1);
    check(!!legacy.error || (legacy.data || []).length === 0, 'a logged-in user can NOT read the raw legacy table');
    const posts = await sample.client.from('posts').select('id');
    check(!posts.error && posts.data.length > 0, 'a logged-in user can read posts');
    await sample.client.auth.signOut();
  }
}

process.exit(result.ok && liveOk ? 0 : 3);
