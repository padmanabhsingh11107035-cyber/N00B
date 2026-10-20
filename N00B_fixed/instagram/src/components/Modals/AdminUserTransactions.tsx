import React, { useEffect, useState } from 'react';
import { Loader2, Coins, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { fetchUserTransactions, type UserTransactions } from '../../services/adminLedgerApi';
import { formatExactDateTime } from '../../utils/formatTime';

// Inside one user's details in the admin panel: every NOOB Points transaction of that user, newest first, with what they have in all.
const nf = (n: number | null | undefined) => (n === null || n === undefined ? '0' : Number(n).toLocaleString('en-IN'));

export const AdminUserTransactions: React.FC<{ userId: string }> = ({ userId }) => {
  const [data, setData] = useState<UserTransactions | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setData(null); setError(null);
    void fetchUserTransactions(userId).then((r) => { if (!alive) return; if (r.ok) setData(r.data); else setError(r.error); });
    return () => { alive = false; };
  }, [userId]);

  return (
    <div className="space-y-2" data-testid="admin-user-transactions">
      <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5"><Coins className="w-3.5 h-3.5" /> Transactions</span>
      <div className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-2.5">
        {error && <p className="text-[11px] text-rose-300" role="alert">{error}</p>}
        {!data && !error && <div className="py-3 text-center"><Loader2 className="w-4 h-4 animate-spin text-amber-300 mx-auto" /></div>}
        {data && (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div><p className="text-xs font-black text-white break-all">{nf(data.balance)}</p><p className="text-[10px] text-zinc-500">balance</p></div>
              <div><p className="text-xs font-black text-emerald-300 break-all">{nf(data.credited)}</p><p className="text-[10px] text-zinc-500">credited</p></div>
              <div><p className="text-xs font-black text-rose-300 break-all">{nf(data.debited)}</p><p className="text-[10px] text-zinc-500">debited</p></div>
            </div>
            {data.rows.length === 0 ? <p className="text-[11px] text-zinc-500 text-center py-2">No transactions yet.</p> : (
              <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                {data.rows.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 py-1.5 border-b border-zinc-800/70 last:border-0" data-testid="user-transaction-row">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${r.amount > 0 ? 'bg-emerald-500/15 text-emerald-300' : r.amount < 0 ? 'bg-rose-500/15 text-rose-300' : 'bg-zinc-800 text-zinc-400'}`}>{r.amount >= 0 ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}</span>
                    <div className="min-w-0 flex-1"><p className="text-[11px] text-zinc-200 break-words">{r.reason || 'Transaction'}</p><p className="text-[10px] text-zinc-500">{formatExactDateTime(r.at)}</p></div>
                    <div className="text-right shrink-0"><p className={`text-[11px] font-black ${r.amount > 0 ? 'text-emerald-300' : r.amount < 0 ? 'text-rose-300' : 'text-zinc-400'}`}>{r.amount > 0 ? '+' : ''}{nf(r.amount)}</p>{r.balanceAfter !== null && <p className="text-[9px] text-zinc-500">{nf(r.balanceAfter)}</p>}</div>
                  </div>
                ))}
                {data.count > data.rows.length && <p className="text-[10px] text-zinc-500 text-center pt-1">Showing the latest {data.rows.length} of {nf(data.count)}.</p>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
