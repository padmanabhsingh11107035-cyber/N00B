import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Search, ShieldCheck, ShieldAlert, Download, ArrowDownLeft, ArrowUpRight, Play, Check } from 'lucide-react';
import { fetchLedger, fetchAccountingOverview, runAccountingAudit, fixAccountingIssue, type Ledger, type LedgerRow, type AccountingOverview } from '../../services/adminLedgerApi';
import { formatExactDateTime } from '../../utils/formatTime';
import { describeIssue, ledgerToCsv } from '../../utils/adminLedgerView';
import { formatPaymentId } from '../../utils/formatPoints';

// Admin panel -> Accounts: every NOOB Points transaction of every user, and the weekly audit of the books (run by itself every Sunday; it can also be run here at any time).
const card = 'p-3 bg-zinc-900/60 rounded-2xl border border-zinc-800';
const nf = (n: number | null | undefined) => (n === null || n === undefined ? '0' : Number(n).toLocaleString('en-IN'));
const PAGE = 100;

export const AdminAccountsPanel: React.FC = () => {
  const [overview, setOverview] = useState<AccountingOverview | null>(null);
  const [auditBusy, setAuditBusy] = useState(false);
  const [fixing, setFixing] = useState<string | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);

  const [direction, setDirection] = useState<'all' | 'in' | 'out'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadOverview = useCallback(async (auditId?: string) => {
    const r = await fetchAccountingOverview(auditId);
    if (r.ok) { setOverview(r.data); setAuditError(null); } else setAuditError(r.error);
  }, []);
  useEffect(() => { void loadOverview(); }, [loadOverview]);

  const loadLedger = useCallback(async (offset: number) => {
    setBusy(true);
    const r = await fetchLedger({ limit: PAGE, offset, search: query, direction, from: from ? new Date(from).toISOString() : undefined, to: to ? new Date(new Date(to).getTime() + 86400000).toISOString() : undefined });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setError(null);
    setLedger(r.data);
    setRows((prev) => (offset === 0 ? r.data.rows : [...prev, ...r.data.rows]));
  }, [query, direction, from, to]);
  useEffect(() => { void loadLedger(0); }, [loadLedger]);
  useEffect(() => { const t = window.setTimeout(() => setQuery(search.trim()), 350); return () => window.clearTimeout(t); }, [search]);

  const runAudit = async () => {
    setAuditBusy(true);
    const r = await runAccountingAudit();
    setAuditBusy(false);
    if (r.ok) { setOverview(r.data); setAuditError(null); } else setAuditError(r.error);
  };
  const settle = async (id: string) => {
    const note = window.prompt('Add a short note for the record (optional):', '') ?? null;
    if (note === null) return;
    setFixing(id);
    const r = await fixAccountingIssue(id, note);
    setFixing(null);
    if (!r.ok) { setAuditError(r.error); return; }
    await loadOverview(overview?.audit?.id);
    await runAudit();
  };
  const download = () => {
    const blob = new Blob([ledgerToCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'noob-accounts.csv'; document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const a = overview?.audit;
  const errors = overview?.issues.filter((i) => i.severity === 'error' && !i.resolvedAt) || [];
  const notes = overview?.issues.filter((i) => i.severity === 'info' && !i.resolvedAt) || [];
  const t = ledger?.totals;
  const tile = (label: string, value: string, tone = 'text-white') => <div className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-center"><p className={`text-base font-black ${tone} break-all`}>{value}</p><p className="text-[10px] text-zinc-400 mt-0.5">{label}</p></div>;

  return (
    <div className="space-y-4" data-testid="admin-accounts">
      {/* the audit */}
      <div className={`${card} space-y-3`} data-testid="accounts-audit">
        <div className="flex items-start gap-3">
          <span className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${!a ? 'bg-zinc-800 text-zinc-400' : a.status === 'clean' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
            {a && a.status === 'issues' ? <ShieldAlert className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-white">{!a ? 'No audit yet' : a.status === 'clean' ? 'The books are in order' : `${a.errors} mistake${a.errors === 1 ? '' : 's'} found`}</p>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              {a ? `${a.kind === 'weekly' ? 'Weekly audit' : 'Audit'} of ${formatExactDateTime(a.runAt)}: ${nf(a.usersChecked)} accounts and ${nf(a.transactionsChecked)} transactions checked.` : 'It runs by itself every Sunday. Run one now to see the state of the books.'}
            </p>
          </div>
          <button onClick={() => void runAudit()} disabled={auditBusy} className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-400 text-black text-[11px] font-black cursor-pointer disabled:opacity-60" data-testid="run-audit">
            {auditBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Audit now
          </button>
        </div>
        <p className="text-[10px] text-zinc-500 leading-relaxed">Checked: every balance against its ledger, every ledger line against the one before it, both halves of every payment between two people, and that nobody is below zero.</p>
        {auditError && <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl p-2.5" role="alert">{auditError}</p>}
        {errors.map((i) => {
          const d = describeIssue(i);
          return (
            <div key={i.id} className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5" data-testid="audit-issue">
              <div className="min-w-0 flex-1"><p className="text-[11px] font-black text-rose-200">{d.title}</p><p className="text-[11px] text-zinc-300 mt-0.5 break-words">{d.text}</p></div>
              {d.fixable && <button onClick={() => void settle(i.id)} disabled={fixing === i.id} className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white text-black text-[10px] font-black cursor-pointer disabled:opacity-60">{fixing === i.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Settle</button>}
            </div>
          );
        })}
        {notes.length > 0 && (
          <details className="text-[11px] text-zinc-400">
            <summary className="cursor-pointer font-bold text-zinc-300">{notes.length} note{notes.length === 1 ? '' : 's'} (not mistakes)</summary>
            <div className="mt-2 space-y-1.5">
              {notes.map((i) => { const d = describeIssue(i); return (
                <div key={i.id} className="p-2 rounded-lg bg-zinc-800/60 flex items-start gap-2"><p className="flex-1 min-w-0 break-words">{d.text}</p>{d.fixable && <button onClick={() => void settle(i.id)} disabled={fixing === i.id} className="shrink-0 px-2 py-1 rounded-md bg-zinc-700 text-white text-[10px] font-bold cursor-pointer">Write it down</button>}</div>
              ); })}
            </div>
          </details>
        )}
        {overview && overview.audits.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
            <span className="text-[10px] text-zinc-500 shrink-0">Earlier:</span>
            {overview.audits.map((x) => (
              <button key={x.id} onClick={() => void loadOverview(x.id)} className={`shrink-0 px-2 py-1 rounded-full text-[10px] font-bold border cursor-pointer ${a?.id === x.id ? 'border-amber-400 text-amber-300' : 'border-zinc-700 text-zinc-400 hover:text-white'}`} title={formatExactDateTime(x.runAt)}>
                {x.status === 'clean' ? '✓' : '⚠'} {new Date(x.runAt).toLocaleDateString([], { day: 'numeric', month: 'short' })}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* totals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {tile('NOOB Points in circulation', nf(t?.circulation ?? overview?.circulation), 'text-amber-300')}
        {tile('Transactions (this view)', nf(t?.count), 'text-white')}
        {tile('Points credited (this view)', nf(t?.credited), 'text-emerald-300')}
        {tile('Points debited (this view)', nf(t?.debited), 'text-rose-300')}
      </div>

      {/* filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a user or a reason" className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400" />
        </div>
        <button onClick={() => { void loadLedger(0); void loadOverview(a?.id); }} disabled={busy} className="p-2 rounded-xl border border-zinc-700 text-zinc-300 hover:text-white cursor-pointer disabled:opacity-50" aria-label="Refresh">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}</button>
        <button onClick={download} disabled={!rows.length} className="p-2 rounded-xl border border-zinc-700 text-zinc-300 hover:text-white cursor-pointer disabled:opacity-50" aria-label="Download as a spreadsheet file" title="Download what is shown as CSV"><Download className="w-4 h-4" /></button>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {([['all', 'All'], ['in', 'Points in'], ['out', 'Points out']] as const).map(([id, label]) => <button key={id} onClick={() => setDirection(id)} className={`px-3 py-1.5 rounded-full text-[11px] font-bold border cursor-pointer ${direction === id ? 'bg-amber-400 text-black border-amber-400' : 'border-zinc-700 text-zinc-300 hover:text-white'}`}>{label}</button>)}
        <label className="ml-auto flex items-center gap-1 text-[10px] text-zinc-400">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-[11px] text-white" /></label>
        <label className="flex items-center gap-1 text-[10px] text-zinc-400">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-[11px] text-white" /></label>
      </div>

      {error && <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3" role="alert">{error}</p>}
      {!ledger && !error && <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-amber-300 mx-auto" /></div>}
      {ledger && rows.length === 0 && <p className="py-8 text-center text-xs text-zinc-500">No transactions match.</p>}
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.id} className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center gap-2.5" data-testid="ledger-row">
            <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${r.amount > 0 ? 'bg-emerald-500/15 text-emerald-300' : r.amount < 0 ? 'bg-rose-500/15 text-rose-300' : 'bg-zinc-800 text-zinc-400'}`}>{r.amount >= 0 ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-white font-semibold break-words">{r.reason || 'Transaction'}</p>
              <p className="text-[10px] text-zinc-500 break-all">{r.username ? `@${r.username}` : 'Deleted account'} · {formatExactDateTime(r.at)}{r.transferId ? ` · ${formatPaymentId(r.transferId)}` : ''}</p>
            </div>
            <div className="text-right shrink-0">
              <p className={`text-xs font-black ${r.amount > 0 ? 'text-emerald-300' : r.amount < 0 ? 'text-rose-300' : 'text-zinc-400'}`}>{r.amount > 0 ? '+' : ''}{nf(r.amount)}</p>
              {r.balanceAfter !== null && <p className="text-[10px] text-zinc-500">balance {nf(r.balanceAfter)}</p>}
            </div>
          </div>
        ))}
      </div>
      {ledger && rows.length < ledger.totals.count && (
        <button onClick={() => void loadLedger(rows.length)} disabled={busy} className="w-full py-2.5 rounded-xl border border-zinc-700 text-xs font-bold text-zinc-300 hover:text-white cursor-pointer disabled:opacity-50">
          {busy ? 'Loading…' : `Show more (${nf(ledger.totals.count - rows.length)} left)`}
        </button>
      )}
    </div>
  );
};
