import React, { useCallback, useEffect, useState } from 'react';
import { Bug, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { adminFetchClientErrors, adminClearClientErrors } from '../../services/api';
import type { AdminClientError } from '../../services/supabaseApi';

// The admin's Errors page: crashes and errors that the app reported by itself, and the "Report a problem" notes people wrote, grouped by error (the same error is one line with a counter).
// Only the administrator can read them: the database function refuses everybody else, this tab being hidden is not what protects them.
const quietBtn = 'px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-default inline-flex items-center gap-1.5';
const card = 'p-3 bg-zinc-900/60 rounded-2xl border border-zinc-800 space-y-2';
const KIND: Record<string, string> = { error: 'Error', rejection: 'Promise', boundary: 'Screen crash', user_report: 'User report' };

export const AdminErrorsPanel: React.FC = () => {
  const [rows, setRows] = useState<AdminClientError[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState(7);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await adminFetchClientErrors(days);
    if (res.success) { setRows(res.errors || []); setNote(null); } else setNote({ text: res.error || 'Could not read the error reports.', ok: false });
    setLoading(false);
  }, [days]);
  useEffect(() => { void load(); }, [load]);

  const clear = async () => {
    setBusy(true);
    const res = await adminClearClientErrors();
    setBusy(false); setConfirming(false);
    if (res.success) { setRows([]); setNote({ text: `Cleared ${res.removed ?? 0} report${res.removed === 1 ? '' : 's'}.`, ok: true }); } else setNote({ text: res.error || 'Could not clear.', ok: false });
  };

  const when = (iso: string) => { try { return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); } catch { return iso; } };

  return (
    <div className="space-y-3" data-testid="admin-errors-panel">
      <div className="flex flex-wrap items-center gap-2">
        <Bug className="w-5 h-5 text-amber-300" aria-hidden="true" />
        <h3 className="text-sm font-black text-white flex-1 min-w-0">Errors and problem reports</h3>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Time range" className="bg-zinc-800 text-white text-xs font-bold rounded-xl px-2 py-2">
          <option value={1}>Last day</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option>
        </select>
        <button type="button" className={quietBtn} onClick={() => void load()} disabled={loading} aria-label="Refresh"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
        {!confirming ? (
          <button type="button" className={quietBtn} onClick={() => setConfirming(true)} disabled={busy || rows.length === 0} data-testid="errors-clear"><Trash2 className="w-3.5 h-3.5" /> Clear</button>
        ) : (
          <span className="inline-flex items-center gap-2 text-xs text-zinc-200">
            Delete all reports?
            <button type="button" className="px-3 py-2 bg-red-700 hover:bg-red-600 text-white text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50" onClick={clear} disabled={busy} data-testid="errors-clear-confirm">{busy ? 'Clearing...' : 'Yes, delete'}</button>
            <button type="button" className={quietBtn} onClick={() => setConfirming(false)} disabled={busy}>No</button>
          </span>
        )}
      </div>
      {note && <p role="status" className={`text-xs font-semibold ${note.ok ? 'text-emerald-300' : 'text-red-300'}`}>{note.text}</p>}
      {loading ? (
        <p className="text-sm text-zinc-300 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</p>
      ) : rows.length === 0 && !note ? (
        <p className="text-sm text-zinc-300" data-testid="errors-empty">Nothing reported in this time. Good news.</p>
      ) : (
        rows.map((r) => {
          const isOpen = open === r.fingerprint;
          return (
            <div key={r.fingerprint} className={card} data-testid="error-row">
              <button type="button" onClick={() => setOpen(isOpen ? null : r.fingerprint)} aria-expanded={isOpen} className="w-full text-left cursor-pointer">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded-full bg-amber-400 text-black text-[11px] font-black" data-testid="error-count">{r.totalCount}x</span>
                  <span className="text-[11px] font-bold text-amber-300">{KIND[r.kind] || r.kind}</span>
                  <span className="text-[11px] text-zinc-300">last {when(r.lastSeen)}</span>
                </div>
                <p className="mt-1 text-[13px] font-semibold text-white break-words">{r.kind === 'user_report' && r.note ? r.note : r.message}</p>
                <p className="mt-0.5 text-[11px] text-zinc-400 break-words">{r.page || '/'} · version {r.appVersion || '?'} · {r.platform || '?'} · {r.users} {r.users === 1 ? 'person' : 'people'}</p>
              </button>
              {isOpen && (
                <div className="space-y-2">
                  {r.note && r.kind !== 'user_report' && <p className="text-xs text-zinc-200 break-words">Note: {r.note}</p>}
                  <p className="text-[11px] text-zinc-400">First seen {when(r.firstSeen)}</p>
                  {r.stack ? <pre className="text-[11px] leading-snug text-zinc-200 bg-black/40 rounded-xl p-2 overflow-x-auto whitespace-pre-wrap break-words">{r.stack}</pre> : <p className="text-[11px] text-zinc-400">No stack.</p>}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};
