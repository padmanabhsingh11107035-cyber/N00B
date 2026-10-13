import React, { useCallback, useEffect, useState } from 'react';
import { Download, Loader2, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { platformOverview, sumSeries, toCsv, trend, type PlatformOverview } from '../../services/adminAnalyticsApi';
import { BarChart, Donut, LineChart, PALETTE, Stat, dayLabel, dayTick } from '../charts/Charts';

// Admin panel -> Analytics: how the whole app is doing, day by day. Only counts: never message text, captions or anything about one person.
const card = 'p-4 bg-zinc-900/60 rounded-2xl border border-zinc-800';
const RANGES = [7, 30, 90];
const nf = (n: number | undefined): string => (n === undefined || n === null ? '0' : Number(n).toLocaleString('en-IN'));

const Trend: React.FC<{ points: Array<{ d: string; n: number }> }> = ({ points }) => {
  const t = trend(points);
  if (t === null || t === 0) return <span className="text-[10px] text-zinc-500">{t === 0 ? 'no change' : 'new'}</span>;
  const up = t > 0;
  return <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${up ? 'text-emerald-300' : 'text-rose-300'}`}>{up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}{up ? '+' : ''}{t}%</span>;
};

const Series: React.FC<{ title: string; points: Array<{ d: string; n: number }>; color: string; bar?: boolean }> = ({ title, points, color, bar }) => (
  <div className={card}>
    <div className="flex items-center justify-between gap-2 mb-1"><p className="text-xs font-black text-white">{title}</p><Trend points={points} /></div>
    <p className="text-[11px] text-zinc-400 mb-2">{nf(sumSeries(points))} in this period</p>
    <div className="text-zinc-200">
      {bar
        ? <BarChart bars={points.map((p, i) => ({ label: dayTick(p.d, i), value: p.n }))} label={title} color={color} gap={points.length > 30 ? 1 : 2} height={140} showValues={false} />
        : <LineChart points={points.map((p) => ({ x: dayLabel(p.d), y: p.n }))} label={title} color={color} height={140} />}
    </div>
  </div>
);

export const AdminAnalyticsPanel: React.FC = () => {
  const [days, setDays] = useState(30);
  const [o, setO] = useState<PlatformOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (d: number) => {
    setBusy(true);
    const r = await platformOverview(d);
    setBusy(false);
    if (r.ok) { setO(r.data); setError(null); } else setError(r.error);
  }, []);
  useEffect(() => { void load(days); }, [days, load]);

  const download = () => {
    if (!o) return;
    const blob = new Blob([toCsv(o)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `noob-analytics-${o.days}d.csv`; document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1.5" role="group" aria-label="Period">
          {RANGES.map((r) => <button key={r} onClick={() => setDays(r)} className={`px-3 py-1.5 rounded-full text-[11px] font-bold border cursor-pointer ${days === r ? 'bg-amber-400 text-black border-amber-400' : 'border-zinc-700 text-zinc-300 hover:text-white'}`}>{r} days</button>)}
        </div>
        <div className="ml-auto flex gap-1.5">
          <button onClick={() => void load(days)} disabled={busy} className="p-2 rounded-xl border border-zinc-700 text-zinc-300 hover:text-white cursor-pointer disabled:opacity-50" aria-label="Refresh">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}</button>
          <button onClick={download} disabled={!o} className="p-2 rounded-xl border border-zinc-700 text-zinc-300 hover:text-white cursor-pointer disabled:opacity-50" aria-label="Download as a spreadsheet file" title="Download as CSV"><Download className="w-4 h-4" /></button>
        </div>
      </div>
      {error && <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3" role="alert">{error}</p>}
      {!o && !error && <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-amber-300 mx-auto" /></div>}
      {o && (
        <>
          <div className={card}>
            <div className="grid grid-cols-3 gap-y-4 gap-x-2 text-white">
              <Stat value={nf(o.totals.users)} label="people" hint={`+${nf(o.totals.newUsers)} in ${o.days} days`} />
              <Stat value={nf(o.totals.activeNow)} label="online now" hint="last 15 minutes" tone="#6ee7b7" />
              <Stat value={nf(o.totals.active7)} label="active, 7 days" />
              <Stat value={nf(o.totals.postsPeriod)} label="posts" hint={`of ${nf(o.totals.posts)} in all`} />
              <Stat value={nf(o.totals.reelsPeriod)} label="reels" hint={`of ${nf(o.totals.reels)} in all`} />
              <Stat value={nf(o.totals.storiesLive)} label="stories live" />
              <Stat value={nf(o.totals.messagesPeriod)} label="messages" />
              <Stat value={nf(o.totals.commentsPeriod)} label="comments" />
              <Stat value={nf(o.totals.gamePlaysPeriod)} label="game plays" />
              <Stat value={nf(o.totals.ordersPeriod)} label="orders" hint={`₹${nf(o.totals.revenuePeriod)}`} />
              <Stat value={nf(o.totals.reportsPeriod)} label="reports" hint={`${nf(o.totals.reports)} in all`} tone={o.totals.reportsPeriod ? '#fcd34d' : undefined} />
              <Stat value={nf(o.totals.suspended)} label="suspended" hint={`${nf(o.totals.verified)} verified`} />
            </div>
          </div>

          <Series title="People active each day" points={o.series.active} color={PALETTE[4]} />
          <Series title="New people" points={o.series.users} color={PALETTE[0]} bar />
          <Series title="Sign-ins" points={o.series.signIns} color={PALETTE[7]} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Series title="Posts" points={o.series.posts} color={PALETTE[1]} bar />
            <Series title="Reels" points={o.series.reels} color={PALETTE[5]} bar />
            <Series title="Stories" points={o.series.stories} color={PALETTE[3]} bar />
            <Series title="Messages" points={o.series.messages} color={PALETTE[2]} />
            <Series title="Comments" points={o.series.comments} color={PALETTE[8]} />
            <Series title="Game plays" points={o.series.games} color={PALETTE[9]} bar />
            <Series title="Shop orders" points={o.series.orders} color={PALETTE[0]} bar />
            <Series title="Reports" points={o.series.reports} color={PALETTE[5]} bar />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className={card}><p className="text-xs font-black text-white mb-2">Kinds of accounts</p><div className="text-zinc-200"><Donut slices={o.breakdowns.accountTypes.map((x, i) => ({ label: x.label, value: x.n, color: PALETTE[i % PALETTE.length] }))} label="Accounts" unit=" people" /></div></div>
            <div className={card}><p className="text-xs font-black text-white mb-2">Orders by state</p><div className="text-zinc-200"><Donut slices={o.breakdowns.ordersByStatus.map((x, i) => ({ label: x.label, value: x.n, color: PALETTE[(i + 3) % PALETTE.length] }))} label="Orders" unit=" orders" /></div></div>
            <div className={card}><p className="text-xs font-black text-white mb-2">What people post about</p><div className="text-zinc-200"><BarChart bars={o.breakdowns.postsByCategory.map((x, i) => ({ label: x.label, value: x.n, color: PALETTE[i % PALETTE.length] }))} label="Posts by category" height={150} /></div></div>
            <div className={card}><p className="text-xs font-black text-white mb-2">Most played games</p><div className="text-zinc-200"><BarChart bars={o.breakdowns.topGames.map((x, i) => ({ label: x.label, value: x.n, color: PALETTE[(i + 2) % PALETTE.length] }))} label="Game plays" height={150} /></div></div>
            <div className={card}><p className="text-xs font-black text-white mb-2">What messages are made of</p><div className="text-zinc-200"><Donut slices={o.breakdowns.messageTypes.map((x, i) => ({ label: x.label, value: x.n, color: PALETTE[(i + 1) % PALETTE.length] }))} label="Messages" unit=" messages" /></div></div>
            <div className={card}><p className="text-xs font-black text-white mb-2">Reports by state</p><div className="text-zinc-200"><Donut slices={o.breakdowns.reportsByStatus.map((x, i) => ({ label: x.label, value: x.n, color: PALETTE[(i + 5) % PALETTE.length] }))} label="Reports" unit=" reports" /></div></div>
          </div>
          <p className="text-[10px] text-zinc-500">Counts only: no message text, captions or anything about one person. Days are counted in UTC. Updated {new Date(o.generatedAt).toLocaleString('en-IN')}.</p>
        </>
      )}
    </div>
  );
};
export default AdminAnalyticsPanel;
