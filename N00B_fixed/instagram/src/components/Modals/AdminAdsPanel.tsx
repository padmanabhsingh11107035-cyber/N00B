import React, { useCallback, useEffect, useState } from 'react';
import { Check, ExternalLink, Loader2, Mail, Phone, RefreshCw, Square, X } from 'lucide-react';
import { adminFetchAdApplications, adminReviewAd, type AdminAdFilter } from '../../services/api';
import { AD_DURATIONS, AD_PAGES, AD_SLIDE_MS, durationText, mediaText, pagesText, statusText, type AdPage, type AdminAdRow } from '../../utils/ads';
import { safeExternalUrl } from '../../utils/safeUrl';

// Admin panel → "Ads": the requests business accounts sent, with how to reach each advertiser. For each one the admin switches the pages it may appear on (Reels, Feed, Home: one
// switch each, any mix) and the number of days, then approves it; or says no with a note. A running ad can have its pages changed or be stopped. See supabase/migrations/20261022000006_ads.sql.
const FILTERS: ReadonlyArray<{ id: AdminAdFilter; label: string }> = [
  { id: 'pending', label: 'Waiting' }, { id: 'live', label: 'Live' }, { id: 'ended', label: 'Ended' }, { id: 'rejected', label: 'Not approved' }, { id: 'all', label: 'All' }
];
const when = (iso: string | null) => { try { return iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''; } catch { return ''; } };

const PageSwitch: React.FC<{ label: string; on: boolean; onChange: () => void; disabled?: boolean; testId: string }> = ({ label, on, onChange, disabled, testId }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={`Show on ${label}`} onClick={onChange} disabled={disabled} data-testid={testId}
    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 cursor-pointer disabled:opacity-50">
    <span className="text-xs font-bold text-white">{label}</span>
    <span className={`relative w-9 h-5 rounded-full shrink-0 transition-colors ${on ? 'bg-amber-400' : 'bg-zinc-700'}`}>
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </span>
  </button>
);

interface Draft { pages: AdPage[]; days: number; note: string }

export const AdminAdsPanel: React.FC<{ onPendingChange?: (count: number) => void }> = ({ onPendingChange }) => {
  const [filter, setFilter] = useState<AdminAdFilter>('pending');
  const [rows, setRows] = useState<AdminAdRow[] | null>(null);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const load = useCallback(async (f: AdminAdFilter) => {
    const res = await adminFetchAdApplications(f);
    if (res.ok === false) { setError(res.error); setRows([]); return; }
    setError(''); setRows(res.rows); setPending(res.pendingCount); onPendingChange?.(res.pendingCount);
  }, [onPendingChange]);
  useEffect(() => { setRows(null); void load(filter); }, [filter, load]);

  const draftOf = (r: AdminAdRow): Draft => drafts[r.id] || { pages: r.status === 'approved' && r.approvedPages.length ? r.approvedPages : r.requestedPages, days: r.durationDays, note: '' };
  const patch = (r: AdminAdRow, p: Partial<Draft>) => setDrafts((d) => ({ ...d, [r.id]: { ...draftOf(r), ...p } }));
  const toggle = (r: AdminAdRow, page: AdPage) => {
    const cur = draftOf(r).pages;
    patch(r, { pages: AD_PAGES.map((p) => p.id).filter((id) => (id === page ? !cur.includes(id) : cur.includes(id))) as AdPage[] });
  };

  const act = async (r: AdminAdRow, action: 'approve' | 'reject' | 'stop' | 'pages') => {
    const d = draftOf(r);
    setBusy(r.id); setError('');
    const res = await adminReviewAd(r.id, action, { pages: d.pages, days: d.days, note: d.note });
    setBusy(null);
    if (!res.success) { setError(res.error || 'Could not save that.'); return; }
    setDrafts((x) => { const n = { ...x }; delete n[r.id]; return n; });
    void load(filter);
  };

  return (
    <div className="space-y-4" data-testid="admin-ads">
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} data-testid={`ads-filter-${f.id}`}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border cursor-pointer ${filter === f.id ? 'bg-amber-400 text-black border-amber-400' : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:text-white'}`}>
            {f.label}{f.id === 'pending' && pending > 0 ? ` (${pending})` : ''}
          </button>
        ))}
        <button onClick={() => void load(filter)} className="ml-auto p-2 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-300 cursor-pointer" aria-label="Refresh"><RefreshCw className="w-3.5 h-3.5" /></button>
      </div>
      {error && <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3" role="alert">{error}</p>}
      {rows === null && <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-zinc-400 mx-auto" /></div>}
      {rows && rows.length === 0 && !error && <p className="py-10 text-center text-xs text-zinc-500" data-testid="ads-empty">Nothing here.</p>}
      {rows && rows.map((r) => {
        const d = draftOf(r);
        const live = r.status === 'approved' && !!r.endsAt && Date.parse(r.endsAt) > Date.now();
        const href = safeExternalUrl(r.link);
        return (
          <div key={r.id} className="rounded-3xl bg-zinc-900/70 border border-zinc-700 overflow-hidden" data-testid="ad-row" data-ad-status={r.status}>
            <div className="relative bg-black">
              {r.mediaType === 'video'
                ? <video src={r.mediaUrl} controls muted playsInline preload="metadata" className="w-full max-h-64 object-contain" />
                : r.mediaUrls.length > 1
                  ? (
                    <div className="grid grid-cols-5 gap-1 p-1" data-testid="ad-photos-admin">
                      {r.mediaUrls.map((u, n) => (
                        <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="relative block aspect-square overflow-hidden rounded-lg bg-zinc-900">
                          <img src={u} alt={`Photo ${n + 1}`} loading="lazy" className="w-full h-full object-cover" />
                          <span className="absolute top-0.5 left-0.5 min-w-4 h-4 px-1 rounded-full bg-white text-black text-[9px] font-black flex items-center justify-center">{n + 1}</span>
                        </a>
                      ))}
                    </div>
                  )
                  : <img src={r.mediaUrl} alt={r.title || 'Ad'} loading="lazy" className="w-full max-h-64 object-contain" />}
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-white truncate">{r.title || (r.mediaType === 'video' ? 'Video ad' : 'Picture ad')}</p>
                  <p className="text-[11px] text-zinc-400">@{r.username} · {r.displayName}{r.businessCategory ? ` · ${r.businessCategory}` : ''}</p>
                </div>
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-black ${live ? 'bg-emerald-500/20 text-emerald-300' : r.status === 'pending' ? 'bg-amber-500/20 text-amber-300' : r.status === 'rejected' ? 'bg-rose-500/20 text-rose-300' : 'bg-zinc-700 text-zinc-300'}`}>
                  {live ? 'LIVE' : r.status === 'pending' ? 'WAITING' : r.status === 'rejected' ? 'NOT APPROVED' : 'ENDED'}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                {r.businessEmail && <a href={`mailto:${r.businessEmail}`} className="inline-flex items-center gap-1 text-sky-300 hover:underline"><Mail className="w-3 h-3" />{r.businessEmail}</a>}
                {r.businessPhone && <a href={`tel:${r.businessPhone}`} className="inline-flex items-center gap-1 text-sky-300 hover:underline"><Phone className="w-3 h-3" />{r.businessPhone}</a>}
                {href && <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-zinc-300 hover:underline break-all"><ExternalLink className="w-3 h-3 shrink-0" />{r.link}</a>}
              </div>
              <p className="text-[11px] text-zinc-400" data-testid="ad-asked">Asked for: <span className="text-white font-bold">{mediaText(r)}{r.mediaUrls.length > 1 && r.mediaType === 'image' ? ` (1 second each, ${(r.mediaUrls.length * AD_SLIDE_MS) / 1000} s round)` : ''}</span> · <span className="text-white font-bold">{pagesText(r.requestedPages)}</span> · <span className="text-white font-bold">{durationText(r.durationDays)}</span> · sent {when(r.createdAt)}</p>
              {r.status !== 'pending' && <p className="text-[11px] text-zinc-400">{statusText(r)}{r.endsAt ? ` (until ${when(r.endsAt)})` : ''}{r.adminNote ? ` · Note: ${r.adminNote}` : ''}</p>}

              <div>
                <p className="text-[11px] font-black text-zinc-300 mb-1.5">{live ? 'Showing on' : 'Show it on'}</p>
                <div className="flex flex-wrap gap-2">
                  {AD_PAGES.map((p) => <PageSwitch key={p.id} label={p.label} on={d.pages.includes(p.id)} onChange={() => toggle(r, p.id)} disabled={busy === r.id} testId={`ad-switch-${p.id}`} />)}
                </div>
              </div>

              {live ? (
                <div className="flex gap-2">
                  <button onClick={() => void act(r, 'pages')} disabled={busy === r.id} className="flex-1 py-2.5 rounded-xl bg-white text-black text-xs font-black cursor-pointer disabled:opacity-50" data-testid="ad-save-pages">Save pages</button>
                  <button onClick={() => void act(r, 'stop')} disabled={busy === r.id} className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-black cursor-pointer disabled:opacity-50" data-testid="ad-stop">Stop now</button>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-[11px] font-black text-zinc-300">Days to run</label>
                    <select value={d.days} onChange={(e) => patch(r, { days: Number(e.target.value) })} className="rounded-xl bg-zinc-900 border border-zinc-700 px-2.5 py-2 text-xs text-white" data-testid="ad-days">
                      {[...new Set([...AD_DURATIONS.map((x) => x.days), 2, 5, 10, 21, 45, 60, 90])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n} day{n === 1 ? '' : 's'}</option>)}
                    </select>
                    <input value={d.note} onChange={(e) => patch(r, { note: e.target.value.slice(0, 300) })} placeholder="Note (shown to the advertiser)" className="flex-1 min-w-[140px] rounded-xl bg-zinc-900 border border-zinc-700 px-3 py-2 text-xs text-white placeholder:text-zinc-500" data-testid="ad-note" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => void act(r, 'approve')} disabled={busy === r.id || d.pages.length === 0} className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-black text-xs font-black cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5" data-testid="ad-approve">
                      {busy === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve
                    </button>
                    {r.status !== 'rejected' && (
                      <button onClick={() => void act(r, 'reject')} disabled={busy === r.id} className="flex-1 py-2.5 rounded-xl bg-zinc-800 border border-zinc-600 text-white text-xs font-black cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5" data-testid="ad-reject">
                        <X className="w-3.5 h-3.5" /> Reject
                      </button>
                    )}
                  </div>
                  {d.pages.length === 0 && <p className="text-[10px] text-amber-300 flex items-center gap-1"><Square className="w-3 h-3" /> Switch on at least one page to approve.</p>}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
