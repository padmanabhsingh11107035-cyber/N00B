import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Scale } from 'lucide-react';
import { adminGrievances, adminGrievanceUpdate } from '../../services/api';
import type { AdminGrievance } from '../../services/api';

// Admin panel → "Grievances": the Grievance Officer's inbox. Complaints come from noobsocials.com/grievance.html (no login needed). Each gets a ticket number; the officer must
// acknowledge within 24 hours and resolve within 15 days (what the Terms and the Privacy Policy promise), and the tab says which ones are late.

type Filter = 'open' | 'acknowledged' | 'done' | 'all';
const TOPIC: Record<string, string> = { content: 'A post, reel, story or comment', account: 'My account', data: 'Data or privacy', purchase: 'Purchase or refund', safety: 'Safety', other: 'Something else' };

export const AdminGrievancesPanel: React.FC<{ onOpenCountChange?: (n: number) => void }> = ({ onOpenCountChange }) => {
  const [items, setItems] = useState<AdminGrievance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('open');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await adminGrievances();
    setLoading(false);
    if (res.success !== true) { setError((res as { error: string }).error || 'Could not load the complaints.'); return; }
    setError('');
    setItems(res.items);
    onOpenCountChange?.(res.items.filter((g) => g.status === 'open' || g.status === 'acknowledged').length);
  }, [onOpenCountChange]);
  useEffect(() => { void load(); }, [load]);

  const act = async (g: AdminGrievance, status: 'acknowledged' | 'resolved' | 'rejected') => {
    setBusy(g.id);
    const res = await adminGrievanceUpdate(g.id, status, drafts[g.id]);
    setBusy(null);
    if (!res.success) { setError(res.error || 'Could not save.'); return; }
    await load();
  };

  const shown = items.filter((g) => (filter === 'all' ? true : filter === 'done' ? g.status === 'resolved' || g.status === 'rejected' : g.status === filter));
  const late = items.filter((g) => g.ackLate || g.resolveLate).length;
  const tab = (f: Filter, label: string) => (
    <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer ${filter === f ? 'bg-white text-black' : 'bg-white/10 text-zinc-300'}`}>{label}</button>
  );

  return (
    <div className="space-y-4" data-testid="admin-grievances">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-black text-white flex items-center gap-2"><Scale className="w-4 h-4" /> Grievances{late > 0 && <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px]">{late} late</span>}</h3>
        <button onClick={load} className="p-2 rounded-full bg-white/10 cursor-pointer" aria-label="Refresh">{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}</button>
      </div>
      <div className="flex gap-2 flex-wrap">{tab('open', 'New')}{tab('acknowledged', 'Acknowledged')}{tab('done', 'Closed')}{tab('all', 'All')}</div>
      {error && <p className="text-xs text-rose-300" role="alert">{error}</p>}
      {!loading && shown.length === 0 && <p className="text-sm text-zinc-400 py-6 text-center">No complaints here.</p>}
      {shown.map((g) => (
        <div key={g.id} className={`rounded-2xl border p-4 space-y-2 ${g.ackLate || g.resolveLate ? 'border-rose-500/50 bg-rose-500/5' : 'border-white/10 bg-white/[0.03]'}`}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <b className="text-sm text-white">{g.ticket}</b>
            <span className="text-[11px] text-zinc-400">{TOPIC[g.topic] || g.topic} · {new Date(g.createdAt).toLocaleString()}</span>
          </div>
          <p className="text-[12px] text-zinc-300">From <b>{g.name || 'no name'}</b>{g.username ? ` (@${g.username})` : ''}, contact: <a className="underline" href={g.contact.includes('@') ? `mailto:${g.contact}` : `tel:${g.contact}`}>{g.contact}</a></p>
          <p className="text-sm text-white whitespace-pre-wrap break-words">{g.message}</p>
          <p className="text-[11px] text-zinc-400">
            {g.status === 'open' ? (g.ackLate ? 'Not acknowledged: more than 24 hours.' : 'To be acknowledged within 24 hours of filing.') : `Acknowledged ${g.ackAt ? new Date(g.ackAt).toLocaleString() : ''}.`}{' '}
            {g.resolvedAt ? `Closed ${new Date(g.resolvedAt).toLocaleString()}.` : g.resolveLate ? 'Not resolved: more than 15 days.' : 'To be resolved within 15 days.'}
          </p>
          {g.resolution && <p className="text-[12px] text-emerald-300">Answer: {g.resolution}</p>}
          {g.status !== 'resolved' && g.status !== 'rejected' && (
            <div className="space-y-2">
              <textarea value={drafts[g.id] || ''} onChange={(e) => setDrafts((d) => ({ ...d, [g.id]: e.target.value }))} maxLength={2000} placeholder="Answer shown to the person when they look their ticket up" className="w-full min-h-[70px] rounded-xl bg-zinc-900 border border-white/15 p-2 text-sm text-white" />
              <div className="flex gap-2 flex-wrap">
                {g.status === 'open' && <button disabled={busy === g.id} onClick={() => act(g, 'acknowledged')} className="px-3 py-1.5 rounded-full bg-sky-500/20 text-sky-200 text-xs font-bold cursor-pointer">Acknowledge</button>}
                <button disabled={busy === g.id} onClick={() => act(g, 'resolved')} className="px-3 py-1.5 rounded-full bg-emerald-500/20 text-emerald-200 text-xs font-bold cursor-pointer">Mark resolved</button>
                <button disabled={busy === g.id} onClick={() => act(g, 'rejected')} className="px-3 py-1.5 rounded-full bg-zinc-500/20 text-zinc-300 text-xs font-bold cursor-pointer">Reject</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
