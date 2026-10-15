// Builds ONE paste-able script out of the four "Fun" migrations (This or That, Ask Me Anything, Mood Status, Public Polls) for the Supabase SQL editor: the explanatory comments and the
// helper functions that appear in more than one file are left out (the files in supabase/migrations keep everything), then checks the result on a fresh real Postgres (PGlite) that
// already has every earlier migration: it must run, run a second time, and give the same four features the tests expect.
// Usage: node scripts/supabase/make-fun-sql.mjs [output.sql]
import fs from 'node:fs';
import path from 'node:path';
import { createTestDb, MIGRATIONS_DIR } from './pg-test-env.mjs';

const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^2026101600000[1-4]_/.test(f)).sort();
if (files.length !== 4) throw new Error(`expected 4 Fun migrations, found ${files.length}`);

const stripHelpers = (sql) => sql
  .replace(/create or replace function public\.fun_clean_text\(t text\)[\s\S]*?revoke execute on function public\.fun_clean_text\(text\) from public, anon, authenticated;\n/, '')
  .replace(/create or replace function public\.fun_can_manage\(\)[\s\S]*?grant execute on function public\.fun_can_manage\(\) to authenticated;\n/, '');
const stripComments = (sql) => sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n').replace(/\n{3,}/g, '\n\n').trim();

let combined = '';
files.forEach((f, i) => {
  let sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8').split('\r').join('');
  if (i > 0) sql = stripHelpers(sql);
  combined += `-- ===== ${f} =====\n` + stripComments(sql) + '\n\n';
});
combined = combined.trim() + '\n';

// check it
const db = await createTestDb({ upTo: '20261015000002_anonymous_messages.sql' });
await db.exec(combined);
await db.exec(combined);   // a second time
const count = async (q) => (await db.query(q)).rows[0].n;
const tables = await count(`select count(*)::int as n from pg_tables where schemaname = 'public' and (tablename like 'tot\\_%' or tablename like 'ask\\_%' or tablename like 'poll%' or tablename = 'user_moods')`);
const fns = await count(`select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and (p.proname like 'tot\\_%' or p.proname like 'ask\\_%' or p.proname like 'poll\\_%' or p.proname like 'mood\\_%' or p.proname like 'fun\\_%')`);
const rls = await count(`select count(*)::int as n from pg_tables where schemaname = 'public' and rowsecurity and (tablename like 'tot\\_%' or tablename like 'ask\\_%' or tablename like 'poll%' or tablename = 'user_moods')`);
const seeded = await count(`select count(*)::int as n from public.tot_questions`);
console.log(`combined script: ${combined.split('\n').length} lines; tables ${tables}, row security on ${rls}, functions ${fns}, starter questions ${seeded}`);
const ok = tables === 11 && rls === 11 && seeded === 24 && fns >= 40;
console.log(ok ? 'OK: runs, runs again, same result' : 'PROBLEM');
const out = process.argv[2];
if (out) { fs.writeFileSync(out, combined); console.log('written to', out); }
process.exit(ok ? 0 : 1);
