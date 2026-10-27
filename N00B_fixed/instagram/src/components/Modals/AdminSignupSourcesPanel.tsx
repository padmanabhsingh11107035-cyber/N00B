import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Megaphone, RefreshCw } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { emojiOf, labelOf, percent } from '../../utils/signupSource';

// Admin panel -> Where from: the answers to "Where did you hear about NOOB?" that new people give right after they sign up (migration 20261027000005, admin_signup_sources):
// how many named each place, as bars, and the words people typed under "Somewhere else". Nobody is named: only the totals are shown.
export interface SourceTotals { total: number; sources: { source: string; count: number }[]; others: string[] }

export const AdminSignupSourcesPanel: React.FC = () => {
  const [data, setData] = useState<SourceTotals | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    const { data: res, error: err } = await supabase.rpc('admin_signup_sources');
    if (err) { setError(/function|does not exist|schema cache/i.test(err.message) ? 'This is not switched on yet: run the 20261027000005 SQL first.' : err.message); setData(null); }
    else { setError(''); setData(res as SourceTotals); }
    setBusy(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const top = data?.sources?.[0]?.count || 1;

  return (
    <div className="space-y-3" data-testid="signup-sources-panel">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-black text-white flex items-center gap-2"><Megaphone className="w-4 h-4 text-amber-300" />Where people heard about NOOB</h3>
          <p className="text-[11px] text-zinc-400">Asked once, right after a new account is made. {data ? `${data.total.toLocaleString()} answers so far.` : ''}</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={busy} aria-label="Refresh" className="w-9 h-9 rounded-full bg-zinc-900 border border-zinc-700 hover:border-zinc-500 flex items-center justify-center cursor-pointer disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </div>
      {error && <p className="px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-semibold">{error}</p>}
      {data && data.total === 0 && !error && <p className="py-10 text-center text-sm text-zinc-500">No answers yet. They start coming in as new people sign up.</p>}
      {data && data.sources.length > 0 && (
        <div className="p-3 bg-zinc-900/60 rounded-2xl border border-zinc-800 space-y-2.5">
          {data.sources.map((s) => (
            <div key={s.source} data-testid="signup-source-row">
              <div className="flex items-center justify-between text-xs font-bold text-white mb-1"><span>{emojiOf(s.source)} {labelOf(s.source)}</span><span className="text-zinc-400">{s.count.toLocaleString()} · {percent(s.count, data.total)}%</span></div>
              <div className="h-2.5 rounded-full bg-zinc-800 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300" style={{ width: `${Math.max(3, Math.round((s.count / top) * 100))}%` }} /></div>
            </div>
          ))}
        </div>
      )}
      {data && data.others.length > 0 && (
        <div className="p-3 bg-zinc-900/60 rounded-2xl border border-zinc-800">
          <p className="text-xs font-black text-white mb-2">What people typed under "Somewhere else"</p>
          <ul className="space-y-1.5 max-h-72 overflow-y-auto">
            {data.others.map((t, i) => <li key={i} className="text-[12px] text-zinc-300 px-3 py-1.5 rounded-xl bg-black/30 break-words">{t}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
};
