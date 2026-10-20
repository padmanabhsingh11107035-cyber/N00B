import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Search, UserPlus, UserMinus, AlertTriangle, Download } from 'lucide-react';
import { fetchUserLogs, type UserLogEvent, type UserLogs, type UserLogKind } from '../../services/adminLedgerApi';
import { formatExactDateTime } from '../../utils/formatTime';
import { describeEvent, logsToCsv } from '../../utils/adminLedgerView';

// Admin panel -> User logs: who joined and when, who deleted their account and when, and whether they did it themselves or the admin / team did.
const card = 'p-3 bg-zinc-900/60 rounded-2xl border border-zinc-800';
const FILTERS: { id: 'all' | UserLogKind; label: string }[] = [
  { id: 'all', label: 'Everything' }, { id: 'joined', label: 'Joined' }, { id: 'deleted', label: 'Deleted accounts' }, { id: 'unfinished', label: 'Never finished' }
];
const PAGE = 100;

const Row: React.FC<{ e: UserLogEvent }> = ({ e }) => {
  const d = describeEvent(e);
  const Icon = e.kind === 'joined' ? UserPlus : e.kind === 'deleted' ? UserMinus : AlertTriangle;
  return (
    <div className={`${card} flex items-start gap-3`} data-testid={`user-log-${e.kind}`}>
      {e.avatar
        ? <img src={e.avatar} alt="" className="w-9 h-9 rounded-full object-cover border border-zinc-700 shrink-0" referrerPolicy="no-referrer" />
        : <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${d.tone}`}><Icon className="w-4 h-4" /></span>}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-black text-white truncate">{d.name}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${d.badge}`}>{d.label}</span>
        </div>
        <p className="text-[11px] text-zinc-300 mt-0.5">{d.sentence}</p>
        <p className="text-[10px] text-zinc-500 mt-0.5 break-all">
          {formatExactDateTime(e.at)}
          {e.kind === 'deleted' && e.joinedAt ? ` · had joined ${formatExactDateTime(e.joinedAt)}` : ''}
          {e.email ? ` · ${e.email}` : ''}
        </p>
      </div>
    </div>
  );
};

export const AdminUserLogsPanel: React.FC = () => {
  const [kind, setKind] = useState<'all' | UserLogKind>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [data, setData] = useState<UserLogs | null>(null);
  const [events, setEvents] = useState<UserLogEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (offset: number) => {
    setBusy(true);
    const r = await fetchUserLogs({ limit: PAGE, offset, search: query, kind });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setError(null);
    setData(r.data);
    setEvents((prev) => (offset === 0 ? r.data.events : [...prev, ...r.data.events]));
  }, [kind, query]);
  useEffect(() => { void load(0); }, [load]);
  useEffect(() => { const t = window.setTimeout(() => setQuery(search.trim()), 350); return () => window.clearTimeout(t); }, [search]);

  const s = data?.summary;
  const tile = (label: string, value: number | undefined, tone = 'text-white') => (
    <div className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-center"><p className={`text-lg font-black ${tone}`}>{(value ?? 0).toLocaleString('en-IN')}</p><p className="text-[10px] text-zinc-400 mt-0.5">{label}</p></div>
  );
  const download = () => {
    const blob = new Blob([logsToCsv(events)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'noob-user-logs.csv'; document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  return (
    <div className="space-y-3" data-testid="admin-user-logs">
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {tile('Joined in all', s?.joined, 'text-emerald-300')}
        {tile('Joined, last 7 days', s?.joinedLast7Days, 'text-emerald-300')}
        {tile('Deleted accounts', s?.deleted, 'text-rose-300')}
        {tile('Deleted by themselves', s?.deletedBySelf, 'text-amber-300')}
        {tile('Deleted by admin / team', s ? s.deletedByAdmin + s.deletedBySystem : 0, 'text-sky-300')}
        {tile('Never finished', s?.unfinished, 'text-zinc-300')}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a name, username or email" className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400" />
        </div>
        <button onClick={() => void load(0)} disabled={busy} className="p-2 rounded-xl border border-zinc-700 text-zinc-300 hover:text-white cursor-pointer disabled:opacity-50" aria-label="Refresh">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}</button>
        <button onClick={download} disabled={!events.length} className="p-2 rounded-xl border border-zinc-700 text-zinc-300 hover:text-white cursor-pointer disabled:opacity-50" aria-label="Download as a spreadsheet file" title="Download what is shown as CSV"><Download className="w-4 h-4" /></button>
      </div>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {FILTERS.map((f) => <button key={f.id} onClick={() => setKind(f.id)} className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border cursor-pointer ${kind === f.id ? 'bg-amber-400 text-black border-amber-400' : 'border-zinc-700 text-zinc-300 hover:text-white'}`}>{f.label}</button>)}
      </div>
      {error && <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3" role="alert">{error}</p>}
      {!data && !error && <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-amber-300 mx-auto" /></div>}
      {data && events.length === 0 && <p className="py-8 text-center text-xs text-zinc-500">Nothing here yet.</p>}
      <div className="space-y-2">{events.map((e, i) => <Row key={`${e.kind}-${e.userId || i}-${e.at}`} e={e} />)}</div>
      {data && events.length < data.total && (
        <button onClick={() => void load(events.length)} disabled={busy} className="w-full py-2.5 rounded-xl border border-zinc-700 text-xs font-bold text-zinc-300 hover:text-white cursor-pointer disabled:opacity-50">
          {busy ? 'Loading…' : `Show more (${(data.total - events.length).toLocaleString('en-IN')} left)`}
        </button>
      )}
    </div>
  );
};
