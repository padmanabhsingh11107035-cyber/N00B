// A throwaway, in-memory REAL Postgres (PGlite) with just enough of Supabase's
// scaffolding stubbed in (auth schema, auth.uid(), the anon/authenticated/
// service_role roles) to run our migrations and exercise row-level security.
// Used only by tests — nothing here talks to a real Supabase project.
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

export const MIGRATIONS_DIR = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', 'supabase', 'migrations');

// autoExpose = true mimics a Supabase project created with "Automatically expose
// new tables" ticked (every new table is granted to the API roles by default);
// false mimics it unticked. The migration must behave identically in both.
export async function createTestDb({ autoExpose = true } = {}) {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create schema extensions;
    create extension pgcrypto with schema extensions;
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      email text,
      encrypted_password text,
      raw_user_meta_data jsonb default '{}'::jsonb,
      created_at timestamptz default now()
    );
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `);
  if (autoExpose) await db.exec('alter default privileges in schema public grant all on tables to anon, authenticated, service_role;');
  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
  return db;
}

// Run `fn` as a signed-in user (RLS applies); always resets afterwards.
export async function asUser(db, userId, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`);
  try { return await fn(); }
  finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
export async function asAnon(db, fn) {
  await db.exec(`set role anon; select set_config('request.jwt.claim.sub', '', false);`);
  try { return await fn(); }
  finally { await db.exec(`reset role;`); }
}

// Adapter with the same interface as supabase-adapter.mjs, backed by the
// local Postgres — lets the real import code run end-to-end in tests.
export function makePgAdapter(db) {
  const colTypes = {};
  async function types(table) {
    if (!colTypes[table]) {
      const r = await db.query(`select column_name, udt_name from information_schema.columns where table_schema='public' and table_name=$1`, [table]);
      colTypes[table] = Object.fromEntries(r.rows.map((x) => [x.column_name, x.udt_name]));
    }
    return colTypes[table];
  }
  const pgArray = (a) => '{' + a.map((v) => '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"').join(',') + '}';
  return {
    async createAuthUser(u) {
      // Mimic the real Auth rule that refuses passwords under 6 characters.
      const tooShort = u.password.length < 6;
      const password = tooShort ? 'random-temporary-password' : u.password;
      const r = await db.query(
        'insert into auth.users (id, email, encrypted_password, raw_user_meta_data) values ($1,$2,$3,$4::jsonb) on conflict (id) do nothing returning id',
        [u.id, u.email, `test-hash:${password.length}`, JSON.stringify(u.user_metadata)]
      );
      if (!r.rows.length) return 'exists';
      return tooShort ? 'created_temp_password' : 'created';
    },
    async authUserCount() { return (await db.query('select count(*)::int n from auth.users')).rows[0].n; },
    async count(table) { return (await db.query(`select count(*)::int n from public.${table}`)).rows[0].n; },
    async insertMissing(table, rows, conflict, { overwrite }) {
      const t = await types(table);
      const cols = Object.keys(rows[0]);
      for (const row of rows) {
        const params = cols.map((c) => {
          const v = row[c];
          if (v === null || v === undefined) return null;
          if (t[c] === 'jsonb' || t[c] === 'json') return JSON.stringify(v);
          if (t[c] && t[c].startsWith('_')) return pgArray(v);
          return v;
        });
        const casts = cols.map((c, i) => `$${i + 1}${t[c] === 'jsonb' ? '::jsonb' : t[c] && t[c].startsWith('_') ? `::${t[c].slice(1)}[]` : ''}`);
        const action = overwrite
          ? `do update set ${cols.filter((c) => !conflict.split(',').includes(c)).map((c) => `${c}=excluded.${c}`).join(', ')}`
          : 'do nothing';
        await db.query(`insert into public.${table} (${cols.join(',')}) values (${casts.join(',')}) on conflict (${conflict}) ${action}`, params);
      }
    },
    async fetchAll(table) { return (await db.query(`select * from public.${table}`)).rows; },
    async getAuthUser(id) {
      const r = (await db.query('select id, email, raw_user_meta_data from auth.users where id = $1', [id])).rows[0];
      return r ? { id: r.id, email: r.email, user_metadata: r.raw_user_meta_data } : null;
    },
    async profileCounters() {
      return (await db.query('select id, username, followers_count, following_count, posts_count from public.profiles')).rows;
    }
  };
}
