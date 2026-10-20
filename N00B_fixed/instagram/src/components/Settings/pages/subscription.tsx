import React, { useEffect, useState } from 'react';
import { Crown, CalendarClock, Coins, Receipt, Gift, RefreshCw, Trophy, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { PageShell, Section } from '../kit';
import type { PageProps } from '../types';
import { fetchSubscriptionHistory, type SubscriptionHistory } from '../../../services/api';
import { formatExactDateTime } from '../../../utils/formatTime';
import { describeHistoryRow, planLabel, statusOf } from '../../../utils/subscriptionView';

// "Subscription history": the plan you are on, when it was bought and when it ends, what renewing costs and whether your wallet has enough, and every NOOB Pro plan you ever had.
const nf = (n: number | null | undefined) => (n === null || n === undefined ? '0' : Number(n).toLocaleString('en-IN'));
const KIND_ICON = { purchase: Receipt, renewal: RefreshCw, friend: Gift, prize: Trophy } as const;

export const SubscriptionHistoryPage: React.FC<PageProps> = ({ ctx, back }) => {
  const [data, setData] = useState<SubscriptionHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchSubscriptionHistory().then((r) => { if (!alive) return; if (r.ok) setData(r.data); else setError(r.error); });
    return () => { alive = false; };
  }, []);

  const c = data?.current;
  const st = c ? statusOf(c) : null;
  return (
    <PageShell title="Subscription history" subtitle="Your NOOB Pro plans" onBack={back}>
      {error && <p className="mx-4 my-3 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3" role="alert">{error}</p>}
      {!data && !error && <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-zinc-400 mx-auto" /></div>}
      {data && c && st && (
        <>
          <div className="mx-4 mt-3 p-4 rounded-3xl bg-zinc-900/70 border border-zinc-800 space-y-3" data-testid="current-plan">
            <div className="flex items-start gap-3">
              <span className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${st.tone === 'good' ? 'bg-emerald-500/15 text-emerald-300' : st.tone === 'warn' ? 'bg-amber-500/15 text-amber-300' : 'bg-zinc-800 text-zinc-400'}`}><Crown className="w-5 h-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-black text-white" data-testid="plan-name">{c.tier ? `NOOB Pro ${planLabel(c.tier)}` : 'No plan right now'}</p>
                <p className={`text-xs font-bold mt-0.5 ${st.tone === 'good' ? 'text-emerald-300' : st.tone === 'warn' ? 'text-amber-300' : 'text-zinc-400'}`} data-testid="plan-status">{st.text}</p>
              </div>
            </div>
            {c.tier && (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs">
                <div><dt className="text-zinc-500">Billing</dt><dd className="text-white font-semibold capitalize">{c.billing || 'monthly'} {c.autoRenew ? '· renews by itself' : '· does not renew'}</dd></div>
                <div><dt className="text-zinc-500">Bought on</dt><dd className="text-white font-semibold">{c.purchasedAt ? formatExactDateTime(c.purchasedAt) : 'Not recorded'}</dd></div>
                <div><dt className="text-zinc-500">{c.active ? 'Ends on' : 'Ended on'}</dt><dd className="text-white font-semibold">{c.endsAt ? formatExactDateTime(c.endsAt) : '—'}</dd></div>
                <div><dt className="text-zinc-500">Days left</dt><dd className="text-white font-semibold">{c.active && c.daysLeft !== null ? c.daysLeft : '—'}</dd></div>
                <div><dt className="text-zinc-500">To renew it you need</dt><dd className="text-white font-semibold flex items-center gap-1"><Coins className="w-3 h-3 text-amber-400" />{nf(c.renewalPrice)} points</dd></div>
                <div><dt className="text-zinc-500">Your wallet has</dt><dd className="text-white font-semibold flex items-center gap-1"><Coins className="w-3 h-3 text-amber-400" />{nf(c.balance)} points</dd></div>
              </dl>
            )}
            {c.tier && c.shortfall !== null && (
              c.shortfall > 0
                ? <p className="text-[11px] text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl p-2.5 flex items-start gap-2" data-testid="shortfall"><AlertTriangle className="w-4 h-4 shrink-0 mt-px" />{c.autoRenew ? 'It is set to renew by itself, but' : 'To renew it'} you still need <b>{nf(c.shortfall)} more points</b> in your wallet.</p>
                : <p className="text-[11px] text-emerald-200 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-2.5 flex items-start gap-2" data-testid="enough"><CheckCircle2 className="w-4 h-4 shrink-0 mt-px" />Your wallet has enough to renew it.</p>
            )}
            <button onClick={() => { ctx.actions.close(); ctx.actions.openPro(); }} className="w-full py-2.5 rounded-xl bg-white text-black text-xs font-black cursor-pointer" data-testid="open-pro">{c.tier ? 'Change or renew my plan' : 'See the NOOB Pro plans'}</button>
          </div>

          <Section title="All your plans" note="Every NOOB Pro plan you bought, renewed, had paid by a friend, or won. Newest first.">
            {data.history.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-zinc-500" data-testid="no-history">You have not had a NOOB Pro plan yet.</p>
            ) : data.history.map((h, i) => {
              const d = describeHistoryRow(h);
              const Icon = KIND_ICON[h.kind] || Receipt;
              return (
                <div key={`${h.at}-${i}`} className="px-4 py-3 flex items-start gap-3 border-b border-zinc-800/70 last:border-0" data-testid="history-row">
                  <span className="w-9 h-9 rounded-xl bg-zinc-800 text-zinc-300 flex items-center justify-center shrink-0"><Icon className="w-4 h-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-white">{d.title}</p>
                    <p className="text-[11px] text-zinc-400 mt-0.5">{d.detail}</p>
                    <p className="text-[10px] text-zinc-500 mt-0.5 flex items-center gap-1"><CalendarClock className="w-3 h-3" />{formatExactDateTime(h.at)}{h.endsAt ? ` · until ${formatExactDateTime(h.endsAt)}` : ''}</p>
                  </div>
                  {d.amount && <span className="text-xs font-black text-rose-300 shrink-0">{d.amount}</span>}
                </div>
              );
            })}
          </Section>

          <Section title="What each plan costs" note="Yearly is about 17% cheaper than twelve months of monthly.">
            {data.plans.map((p) => (
              <div key={p.tier} className="px-4 py-2.5 flex items-center justify-between border-b border-zinc-800/70 last:border-0 text-xs">
                <span className="font-bold text-white">NOOB Pro {planLabel(p.tier)}{c.tier === p.tier ? ' · yours' : ''}</span>
                <span className="text-zinc-300 text-right">{nf(p.monthly)} / month<br /><span className="text-zinc-500">{nf(p.yearly)} / year</span></span>
              </div>
            ))}
          </Section>
        </>
      )}
    </PageShell>
  );
};
