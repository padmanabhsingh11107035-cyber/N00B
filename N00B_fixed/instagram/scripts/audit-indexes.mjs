// Finds foreign keys whose column has no index starting with it. Without one, deleting or changing a row of the parent table (a profile, a post, a chat) makes the database read the whole child
// table, and every "show me the rows of this person / post / chat" question reads it too: fine with 100 people, slow with 5,000. Run: node scripts/audit-indexes.mjs [--sql]
import { createTestDb } from './supabase/pg-test-env.mjs';

const db = await createTestDb();
const fks = (await db.query(`
  select c.conrelid::regclass::text as tbl, c.conname, a.attname as col, c.conkey[1] as attnum, c.conrelid as relid
  from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  where c.contype = 'f' and c.connamespace = 'public'::regnamespace and array_length(c.conkey, 1) = 1
  order by 1, 3`)).rows;
const missing = [];
for (const f of fks) {
  const idx = (await db.query(`select 1 from pg_index i where i.indrelid = $1 and i.indisvalid and i.indkey[0] = $2 limit 1`, [f.relid, f.attnum])).rows;
  if (!idx.length) missing.push({ table: f.tbl.replace(/^public\./, ''), column: f.col });
}
console.log(`${fks.length} foreign keys, ${missing.length} without an index`);
if (process.argv.includes('--sql')) {
  for (const m of missing) console.log(`create index if not exists ${`${m.table}_${m.column}_fk_idx`.slice(0, 63)} on public.${m.table} (${m.column});`);
} else for (const m of missing) console.log(`  ${m.table}.${m.column}`);
process.exit(0);
