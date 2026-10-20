import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Search, Smartphone, Globe2, Monitor, MapPin, Download, UserRound, Bot } from 'lucide-react';
import { fetchSiteVisits, type SiteVisit, type SiteVisits } from '../../services/adminLedgerApi';
import { formatExactDateTime, formatRelativeTime } from '../../utils/formatTime';
import { PLATFORM_LABEL, placeOf, visitsToCsv } from '../../utils/adminLedgerView';

// Admin panel -> Visitors: everyone who opened the app or the website, even with no account. Guests are shown by their device and place; people who logged in are shown by name.
const card = 'p-3 bg-zinc-900/60 rounded-2xl border border-zinc-800';
const WHO: { id: 'people' | 'guests' | 'members' | 'bots' | 'all'; label: string }[] = [
  { id: 'people', label: 'Everyone' }, { id: 'guests', label: 'Guests (no account)' }, { id: 'members', label: 'Logged in' }, { id: 'bots', label: 'Bots' }, { id: 'all', label: 'All incl. bots' }
];
const PAGE = 100;

const Visitor: React.FC<{ v: SiteVisit }> = ({ v }) => {
  const [open, setOpen] = useState(false);
  const DeviceIcon = v.platform === 'app' || v.device === 'Phone' ? Smartphone : v.device === 'Tablet' || v.device === 'Computer' ? Monitor : Globe2;
  const name = v.username ? (v.displayName ? `${v.displayName} @${v.username}` : `@${v.username}`) : v.isBot ? 'Bot' : 'Guest (no account)';
  return (
    <div className={card} data-testid="visitor-row">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-start gap-3 text-left cursor-pointer">
        {v.avatar ? <img src={v.avatar} alt="" className="w-9 h-9 rounded-full object-cover border border-zinc-700 shrink-0" referrerPolicy="no-referrer" />
          : <span className="w-9 h-9 rounded-full bg-zinc-800 text-zinc-400 flex items-center justify-center shrink-0">{v.isBot ? <Bot className="w-4 h-4" /> : <UserRound className="w-4 h-4" />}</span>}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-black text-white truncate">{name}</span>
            {v.platform && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-zinc-700 text-zinc-300 inline-flex items-center gap-1"><DeviceIcon className="w-2.5 h-2.5" />{PLATFORM_LABEL[v.platform]}</span>}
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30">{v.visits} visit{v.visits === 1 ? '' : 's'}</span>
          </div>
          <p className="text-[11px] text-zinc-300 mt-0.5">{[v.device, v.browser, v.os].filter(Boolean).join(' · ') || 'Unknown device'}</p>
          <p className="text-[10px] text-zinc-500 mt-0.5 flex items-center gap-1 flex-wrap"><MapPin className="w-2.5 h-2.5" />{placeOf(v)} · last seen {formatRelativeTime(v.lastSeen)}{v.landingPath ? ` · first page ${v.landingPath}` : ''}</p>
        </div>
      </button>
      {open && (
        <dl className="mt-2.5 pt-2.5 border-t border-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px]" data-testid="visitor-details">
          {([
            ['First seen', formatExactDateTime(v.firstSeen)], ['Last seen', formatExactDateTime(v.lastSeen)], ['Email', v.email], ['IP address', v.ip], ['Place', placeOf(v)],
            ['Language', v.language], ['Time zone', v.timezone], ['Screen', v.screen], ['Came from', v.referrer], ['First page', v.landingPath], ['Last page', v.lastPath], ['Device id', v.visitorId]
          ] as [string, string | null][]).filter(([, val]) => val).map(([k, val]) => (
            <div key={k} className="flex gap-2"><dt className="text-zinc-500 shrink-0 w-20">{k}</dt><dd className="text-zinc-200 break-all">{val}</dd></div>
          ))}
        </dl>
      )}
    </div>
  );
};

export const AdminVisitorsPanel: React.FC = () => {
  const [who, setWho] = useState<(typeof WHO)[number]['id']>('people');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [data, setData] = useState<SiteVisits | null>(null);
  const [rows, setRows] = useState<SiteVisit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (offset: number) => {
    setBusy(true);
    const r = await fetchSiteVisits({ limit: PAGE, offset, search: query, who });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setError(null);
    setData(r.data);
    setRows((prev) => (offset === 0 ? r.data.rows : [...prev, ...r.data.rows]));
  }, [query, who]);
  useEffect(() => { void load(0); }, [load]);
  useEffect(() => { const t = window.setTimeout(() => setQuery(search.trim()), 350); return () => window.clearTimeout(t); }, [search]);

  const s = data?.summary;
  const tile = (label: string, value: number | undefined, tone = 'text-white') => <div className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-center"><p className={`text-lg font-black ${tone}`}>{(value ?? 0).toLocaleString('en-IN')}</p><p className="text-[10px] text-zinc-400 mt-0.5">{label}</p></div>;
  const download = () => {
    const blob = new Blob([visitsToCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'noob-visitors.csv'; document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  return (
    <div className="space-y-3" data-testid="admin-visitors">
      <p className="text-[11px] text-zinc-400 leading-relaxed">Every device that opened NOOB, with or without an account. A guest has no name: you see their device, place and what they looked at. Tap a row for everything known about it.</p>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {tile('Devices', s?.devices, 'text-white')}
        {tile('Opened it today', s?.today, 'text-emerald-300')}
        {tile('Logged in', s?.members, 'text-sky-300')}
        {tile('Guests', s?.guests, 'text-amber-300')}
        {tile('Visits in all', s?.visits, 'text-white')}
        {tile('Bots hidden', s?.bots, 'text-zinc-400')}
      </div>
      {s && s.countries.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-zinc-400">Top places:{s.countries.map((c) => <span key={c.country} className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-200 font-bold">{c.country} · {c.devices}</span>)}</div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a name, place, device, browser or address" className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400" />
        </div>
        <button onClick={() => void load(0)} disabled={busy} className="p-2 rounded-xl border border-zinc-700 text-zinc-300 hover:text-white cursor-pointer disabled:opacity-50" aria-label="Refresh">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}</button>
        <button onClick={download} disabled={!rows.length} className="p-2 rounded-xl border border-zinc-700 text-zinc-300 hover:text-white cursor-pointer disabled:opacity-50" aria-label="Download as a spreadsheet file" title="Download what is shown as CSV"><Download className="w-4 h-4" /></button>
      </div>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {WHO.map((f) => <button key={f.id} onClick={() => setWho(f.id)} className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border cursor-pointer ${who === f.id ? 'bg-amber-400 text-black border-amber-400' : 'border-zinc-700 text-zinc-300 hover:text-white'}`}>{f.label}</button>)}
      </div>
      {error && <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3" role="alert">{error}</p>}
      {!data && !error && <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-amber-300 mx-auto" /></div>}
      {data && rows.length === 0 && <p className="py-8 text-center text-xs text-zinc-500">Nobody here yet. Visits are counted from the moment this update is live.</p>}
      <div className="space-y-2">{rows.map((v) => <Visitor key={v.visitorId} v={v} />)}</div>
      {data && rows.length < data.total && (
        <button onClick={() => void load(rows.length)} disabled={busy} className="w-full py-2.5 rounded-xl border border-zinc-700 text-xs font-bold text-zinc-300 hover:text-white cursor-pointer disabled:opacity-50">{busy ? 'Loading…' : `Show more (${(data.total - rows.length).toLocaleString('en-IN')} left)`}</button>
      )}
    </div>
  );
};
