// Daily check of NOOB's Supabase free-plan usage (database 500 MB, storage 1 GB). When one is at 80% or more, it opens (or comments on) a GitHub issue
// "Supabase free limit warning"; GitHub e-mails the owner for free. Egress (5 GB/month) can NOT be read this way: look at the dashboard Usage page.
// Needs the SQL function public.usage_probe() (supabase/migrations/20261112000003_usage_probe.sql).
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY            (secrets, never printed)
//   GITHUB_TOKEN, GITHUB_REPOSITORY                    (set by GitHub Actions)
//   node scripts/usage-alert.mjs --dry                 prints the numbers, opens nothing
import { evaluateUsage, describe, mb } from './supabase/usage-core.mjs';

const dry = process.argv.includes('--dry');
const TITLE = 'Supabase free limit warning';
const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set (add them as repository secrets).'); process.exit(1); }
if (key) console.log(`::add-mask::${key}`);

const res = await fetch(`${url}/rest/v1/rpc/usage_probe`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: '{}' });
if (!res.ok) {
  console.error(`usage_probe failed: HTTP ${res.status}${res.status === 404 ? ' (has migration 20261112000003_usage_probe.sql been run?)' : ''}`);
  process.exit(1);
}
const probe = await res.json();
const result = evaluateUsage(probe);
console.log(describe(result));
console.log('Biggest tables:');
for (const t of probe.top_tables || []) console.log(`  ${String(t.table).padEnd(28)} ${String(t.rows).padStart(9)} rows  ${mb(t.bytes)}`);
console.log(`Files in storage: ${probe.storage_files}`);

if (!result.warn) { console.log('\nBelow 80% of the free limits: no alert.'); process.exit(0); }
if (dry) { console.log('\n--dry: a warning would be sent now, nothing was opened.'); process.exit(0); }

const token = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPOSITORY;
if (!token || !repo) { console.error('GITHUB_TOKEN / GITHUB_REPOSITORY missing: cannot open the issue.'); process.exit(1); }
const gh = (p, init = {}) => fetch(`https://api.github.com/repos/${repo}${p}`, { ...init, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' } });

const body = `Supabase free plan usage on ${new Date().toISOString().slice(0, 10)}:\n\n${result.items.map((i) => `- ${i.label}: **${i.pct.toFixed(1)}%** (${mb(i.used)} of ${mb(i.limit)})${i.warn ? ' - over the 80% warning line' : ''}`).join('\n')}\n\nFree up space (old media, big tables) or upgrade before 100%, otherwise the project is restricted like last time. Egress (5 GB/month) is not checked here: see Dashboard > Usage.`;

const list = await gh(`/issues?state=open&per_page=100`);
if (!list.ok) { console.error(`could not list issues: HTTP ${list.status}`); process.exit(1); }
const existing = (await list.json()).find((i) => !i.pull_request && i.title === TITLE);
const r = existing
  ? await gh(`/issues/${existing.number}/comments`, { method: 'POST', body: JSON.stringify({ body }) })
  : await gh('/issues', { method: 'POST', body: JSON.stringify({ title: TITLE, body }) });
if (!r.ok) { console.error(`could not write the issue: HTTP ${r.status}`); process.exit(1); }
console.log(existing ? `Commented on issue #${existing.number}.` : 'Opened a new issue.');
