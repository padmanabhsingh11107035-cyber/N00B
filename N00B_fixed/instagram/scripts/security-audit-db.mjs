// A security audit of NOOB's database, as its migrations build it: runs every migration on a throwaway, in-memory Postgres (the same one the tests use) and then asks the
// database itself. It fails (exit 1) when it finds:
//   1. a table of `public` with NO row-level security (anyone with the public key could read / write it),
//   2. a policy that lets everybody write (using true / with check true),
//   3. a SECURITY DEFINER function (it runs with the owner's rights) without a fixed search_path (a known way to hijack it),
//   4. a SECURITY DEFINER function a visitor who is NOT logged in can call and that never looks at who is calling, neither itself nor through a helper (auth.uid() ...),
//   5. an admin_* function that a visitor who is not logged in can call,
//   6. a function that a migration meant to lock (revoke ... from anon / authenticated) but that is still callable (the grant comes through PUBLIC, so the revoke did nothing),
//   7. a table the anonymous role may write to while it has no row-level security.
// Functions that were read by hand and are open on purpose are listed in OPEN_TO_VISITORS with the reason; anything new has to be read and added there on purpose.
// Usage: node scripts/security-audit-db.mjs      (also run by .github/workflows/security.yml on every push and every week)
import fs from 'node:fs';
import path from 'node:path';
import { createTestDb, MIGRATIONS_DIR } from './supabase/pg-test-env.mjs';

// Reviewed by hand: callable by a visitor who is not logged in, on purpose (function -> why it is safe).
const OPEN_TO_VISITORS = {
  resolve_login_email: 'the login screen: gives out only a made-up address (@users.nooob.xyz) or one of an account that has a password, otherwise a look-alike decoy',
  username_taken: 'sign-up: says whether a User ID is free (User IDs are public anyway)',
  check_signup: 'sign-up: checks the form before the account exists',
  login_approval_needed: 'login: says whether a User ID asks for an approval by email (the login has to know)',
  get_ui_translations: 'the app\'s own translated words, public',
  public_platform_settings: 'the public switches (maintenance, sign-up open ...), public',
  study_public_status: 'whether NOOB STUDY is on, public',
  noob_ai_feedback_for_user: 'called by the NOOB AI server with a shared secret that is checked inside',
  noob_ai_profile_for_user: 'called by the NOOB AI server with a shared secret that is checked inside',
  submit_noob_ai_feedback: 'called by the NOOB AI server with a shared secret that is checked inside',
  noob_room_participants_list: 'the room lists are public to read by design (their tables have a public read policy)',
  noob_room_chat_recent: 'the room lists are public to read by design (their tables have a public read policy)',
  anon_messages_feed: 'Anonymous Messages is a public feed with no author shown',
  ask_profile_public: 'the public Ask Me Anything page of a person',
  public_profile: 'a shared link to a profile: private and suspended accounts are not shown',
  public_post: 'a shared link: private and suspended accounts are not shown (public_account_ok)',
  public_reel: 'a shared link: private and suspended accounts are not shown (public_account_ok)',
  public_video: 'a shared link: private and suspended accounts are not shown (public_account_ok)',
  record_public_view: 'counts a view of a shared link: one per visitor, robots are not counted'
};

const db = await createTestDb({ autoExpose: true });
const q = async (sql, params) => (await db.query(sql, params)).rows;
const problems = [];
const notes = [];
const flag = (kind, what, detail) => problems.push(`${kind}: ${what}${detail ? ' — ' + detail : ''}`);

// 1. tables without row-level security
const noRls = await q(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity order by 1`);
for (const r of noRls) flag('TABLE WITHOUT ROW-LEVEL SECURITY', r.relname);

// 2. policies that let everybody write
const policies = await q(`select tablename, policyname, cmd, roles::text as roles, qual, with_check from pg_policies where schemaname = 'public'`);
for (const p of policies) {
  const open = (p.qual || '').trim() === 'true' || (p.with_check || '').trim() === 'true';
  if (open && p.cmd !== 'SELECT') flag('POLICY OPEN TO EVERYONE FOR WRITES', `${p.tablename}.${p.policyname}`, `${p.cmd} for ${p.roles}`);
  else if (open && /anon|public/.test(p.roles || '')) notes.push(`public read policy: ${p.tablename}.${p.policyname}`);
}

// functions
const fns = await q(`select p.oid, p.proname, p.proconfig, p.prosrc, p.prosecdef, p.prorettype::regtype::text as ret, pg_get_function_identity_arguments(p.oid) as args,
    has_function_privilege('anon', p.oid, 'execute') as anon_can
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1`);

// 3. SECURITY DEFINER without a fixed search_path
for (const f of fns.filter((x) => x.prosecdef)) if (!/search_path=/.test((f.proconfig || []).join(','))) flag('SECURITY DEFINER WITHOUT A FIXED search_path', `${f.proname}(${f.args})`);

// 4. callable by a visitor, never looks at who calls: directly (auth.uid() ...) or through a helper that does (is_admin(), ...)
const direct = /auth\.uid\(\)|auth\.jwt\(\)|auth\.role\(\)|request\.jwt/i;
const looksAtCaller = new Set(fns.filter((f) => direct.test(f.prosrc || '')).map((f) => f.proname));
for (let grew = true; grew;) {
  grew = false;
  for (const f of fns) {
    if (looksAtCaller.has(f.proname)) continue;
    for (const g of looksAtCaller) if (new RegExp('(^|[^a-z0-9_])' + g + ' *[(]').test(f.prosrc || '')) { looksAtCaller.add(f.proname); grew = true; break; }
  }
}
const openNames = new Set();
for (const f of fns.filter((x) => x.prosecdef && x.anon_can)) {
  if (looksAtCaller.has(f.proname)) continue;
  if (OPEN_TO_VISITORS[f.proname]) { openNames.add(f.proname); continue; }
  flag('CALLABLE WITHOUT LOGIN AND NEVER LOOKS AT WHO CALLS', `${f.proname}(${f.args})`, 'read it, then either close it to visitors or list it in OPEN_TO_VISITORS with the reason');
}
for (const name of Object.keys(OPEN_TO_VISITORS)) if (!fns.some((f) => f.proname === name)) notes.push(`OPEN_TO_VISITORS lists ${name}, which no longer exists: remove it`);

// 5. admin_* open to visitors
for (const f of fns.filter((x) => /^admin_/.test(x.proname) && x.anon_can)) flag('ADMIN FUNCTION CALLABLE WITHOUT LOGIN', `${f.proname}(${f.args})`);

// 6. a lock-down that did nothing
{
  const norm = (a, b) => `${a.replace(/"/g, '').replace(/^public\./, '')}(${b.replace(/\s+/g, ' ').trim()})`;
  const revoked = new Map();
  const granted = new Map();
  for (const file of fs.readdirSync(MIGRATIONS_DIR).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8').replace(/--[^\n]*/g, '');
    let m;
    const rv = /revoke\s+(?:execute|all)(?:\s+privileges)?\s+on\s+function\s+([\w."]+)\s*\(([^)]*)\)\s+from\s+([^;]+);/gi;
    while ((m = rv.exec(sql))) { const k = norm(m[1], m[2]); if (!revoked.has(k)) revoked.set(k, { roles: new Set(), file }); m[3].split(',').forEach((r) => revoked.get(k).roles.add(r.trim().toLowerCase())); }
    const gr = /grant\s+(?:execute|all)(?:\s+privileges)?\s+on\s+function\s+([\w."]+)\s*\(([^)]*)\)\s+to\s+([^;]+);/gi;
    while ((m = gr.exec(sql))) { const k = norm(m[1], m[2]); if (!granted.has(k)) granted.set(k, new Set()); m[3].split(',').forEach((r) => granted.get(k).add(r.trim().toLowerCase())); }
  }
  for (const [sig, { roles, file }] of revoked) {
    const oid = (await q(`select to_regprocedure($1)::oid as o`, ['public.' + sig]))[0].o;
    const fn = oid && fns.find((f) => String(f.oid) === String(oid));
    if (!fn || fn.ret === 'trigger') continue;   // gone, or a trigger function (cannot be called by hand)
    const check = new Set();
    if (roles.has('authenticated')) check.add('authenticated');
    if (roles.has('anon') || roles.has('public')) check.add('anon');
    const given = granted.get(sig) || new Set();
    for (const role of check) {
      if (given.has(role)) continue;   // given back on purpose
      const can = (await q(`select has_function_privilege($1, $2::oid, 'execute') as c`, [role, oid]))[0].c;
      if (can) flag('LOCKED IN A MIGRATION BUT STILL CALLABLE', `${sig} by ${role}`, `revoked in ${file}; the right comes through PUBLIC, so also revoke from public`);
    }
  }
}

// 7. anonymous writes
const anonWrites = await q(`select table_name from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon' and privilege_type in ('INSERT','UPDATE','DELETE') group by 1`);
const noRlsSet = new Set(noRls.map((r) => r.relname));
for (const r of anonWrites) if (noRlsSet.has(r.table_name)) flag('ANONYMOUS VISITOR MAY WRITE (no row-level security)', r.table_name);

const tableCount = (await q(`select count(*)::int n from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','p')`))[0].n;
console.log(`Checked ${tableCount} tables, ${policies.length} policies and ${fns.filter((f) => f.prosecdef).length} SECURITY DEFINER functions (${openNames.size} open to visitors on purpose, each with a reason in this file).`);
for (const n of notes) console.log('  note   ' + n);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log('  FAIL   ' + p);
  process.exit(1);
}
console.log('  ok     every table has row-level security, no policy is open for writes, every privileged function has a fixed search_path and looks at the caller or is open on purpose, no admin function is open to visitors, every lock-down took effect');
process.exit(0);
