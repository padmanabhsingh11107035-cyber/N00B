// Growth preparation measure 7 (lower the default row limits). Result of checking every call site: nothing needed lowering, and this test keeps it that way.
//   * feed_posts: default 200, hard ceiling 500 (the app calls it with no argument = 200; other callers pass explicit small limits)
//   * active_stories: 300 rows, built in (no argument at all)
//   * my_notifications: 150 rows, built in (no argument at all)
// The LAST definition of each function across all migrations (in file order) is the one that counts, so a later migration that quietly raised a limit is caught here.
// Usage: node scripts/supabase/test-growth-limits.mjs
import fs from 'node:fs';
import path from 'node:path';
import { MIGRATIONS_DIR } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
const lastDef = (name) => {
  let found = null;
  const re = new RegExp(String.raw`create or replace function public\.${name}\(([\s\S]*?)
\$\$;`, 'g');
  for (const f of files) { const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8').split('\r').join(''); for (const m of sql.matchAll(re)) found = { file: f, body: m[0] }; }
  return found;
};

console.log('\nfeed_posts');
const feed = lastDef('feed_posts');
check(!!feed && /p_limit integer default 200/.test(feed.body), `default 200 (${feed?.file})`);
check(!!feed && /limit least\(greatest\(p_limit, 1\), 500\)/.test(feed.body), 'never more than 500, whatever is asked');

console.log('\nactive_stories');
const st = lastDef('active_stories');
check(!!st && /limit 300\b/.test(st.body) && !/p_limit/.test(st.body), `built-in cap of 300 (${st?.file})`);

console.log('\nmy_notifications');
const nt = lastDef('my_notifications');
check(!!nt && /limit 150\b/.test(nt.body), `built-in cap of 150 (${nt?.file})`);

console.log('\nthe app');
const api = fs.readFileSync('src/services/supabaseApi.ts', 'utf8');
check(/rpc<any\[\]>\('feed_posts'\)/.test(api), 'the app calls feed_posts without an argument (so it gets the default of 200)');
check(/rpc<any\[\]>\('active_stories'\)/.test(api) && /rpc<\{ notifications: any\[\] \}>\('my_notifications'\)/.test(api), 'active_stories and my_notifications are called without arguments');
const other = [...api.matchAll(/rpc[^(]*\('feed_posts', \{([^}]*)\}/g)].map((m) => m[1]);
check(other.every((a) => /p_limit/.test(a)), 'every other feed_posts call passes an explicit limit', JSON.stringify(other));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
