// Row-by-row proof that what is in the database is what the backup said.
// Counts alone can hide a wrong value; this compares every planned row's every
// column against what the database actually holds, and every login account's
// address and old-id link. Only table/column names are reported — never values.
import { TABLE_ORDER } from './run-import.mjs';

const KEYS = Object.fromEntries(TABLE_ORDER.map(([table, key]) => [table, key.split(',')]));

function canon(v) {
  if (v === undefined || v === null) return 'null';
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (typeof v === 'bigint') return String(v);
  if (typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

// Timestamps come back in a different spelling than they were sent; dates as
// "YYYY-MM-DD". Compare what they MEAN, not how they're written.
function normalize(column, v) {
  if (v === null || v === undefined) return null;
  if (/_at$/.test(column) || column === 'created_at') {
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? String(v) : t;
  }
  if (column === 'date_of_birth') return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
  if (typeof v === 'bigint') return Number(v);
  return v;
}

// A number that comes back as text (e.g. a Postgres numeric) is still the same number.
function sameValue(column, planned, actual) {
  const a = normalize(column, planned);
  const b = normalize(column, actual);
  if (canon(a) === canon(b)) return true;
  if (typeof a === 'number' && typeof b === 'string' && b.trim() !== '') return Number(b) === a;
  return false;
}

export async function verifyDeep(plan, adapter) {
  const problems = [];
  const notes = [];
  let rowsChecked = 0;
  let fieldsChecked = 0;

  for (const [table] of TABLE_ORDER) {
    const planned = plan.tables[table] || [];
    if (!planned.length) continue;
    const key = KEYS[table];
    const rows = await adapter.fetchAll(table);
    const byKey = new Map(rows.map((r) => [key.map((k) => r[k]).join('|'), r]));
    for (const p of planned) {
      const id = key.map((k) => p[k]).join('/');
      const db = byKey.get(key.map((k) => p[k]).join('|'));
      if (!db) { problems.push(`${table}: row ${id} is MISSING`); continue; }
      rowsChecked++;
      for (const column of Object.keys(p)) {
        let actual = db[column];
        let expected = p[column];
        // added by the import itself for accounts whose old password was refused —
        // ignored on both sides (the plan may or may not have been marked already)
        if (table === 'profiles' && column === 'extra') {
          const strip = (o) => { if (!o || typeof o !== 'object') return o; const { needs_password_reset, ...rest } = o; return rest; };
          actual = strip(actual);
          expected = strip(expected);
        }
        fieldsChecked++;
        if (!sameValue(column, expected, actual)) problems.push(`${table} ${id}: column "${column}" differs`);
      }
    }
    if (rows.length > planned.length) notes.push(`${table}: ${rows.length - planned.length} more row(s) than the import (normal once the app is in use)`);
  }

  for (const a of plan.authUsers) {
    const u = await adapter.getAuthUser(a.id);
    if (!u) { problems.push(`login account ${a.user_metadata.username}: MISSING`); continue; }
    if (u.email !== a.email) problems.push(`login account ${a.user_metadata.username}: address differs`);
    if (u.user_metadata?.legacy_id !== a.user_metadata.legacy_id) problems.push(`login account ${a.user_metadata.username}: old-id link differs`);
  }
  return { ok: problems.length === 0, problems, notes, rowsChecked, fieldsChecked, loginAccountsChecked: plan.authUsers.length };
}
