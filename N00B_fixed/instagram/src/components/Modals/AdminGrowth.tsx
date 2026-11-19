import React from 'react';
import { MILESTONES, LONG_GOAL, growthStats, nextMilestone, type Growth } from '../../utils/growth';

// The admin's growth card: the REAL number of accounts, how many joined today / this week / this month, the next milestone with a bar, and the long-term goal.
// Nothing here is made up: the total is the number of accounts in the list the admin console loaded.

export { growthStats, nextMilestone };
export type { Growth };

const nf = (n: number) => n.toLocaleString('en-IN');

export const GrowthCard: React.FC<{ growth: Growth }> = ({ growth }) => {
  const next = nextMilestone(growth.total);
  const prev = [...MILESTONES].reverse().find((m) => m <= growth.total) ?? 0;
  const pct = Math.max(0, Math.min(100, ((growth.total - prev) / (next - prev)) * 100));
  const goalPct = Math.min(100, (growth.total / LONG_GOAL) * 100);
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4" data-testid="admin-growth">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">Real users</div>
          <div className="text-3xl font-black text-white leading-none mt-1" data-testid="admin-growth-total">{nf(growth.total)}</div>
        </div>
        <div className="text-right text-[11px] text-zinc-400 leading-snug">
          <div><b className="text-emerald-400 text-sm">+{nf(growth.today)}</b> today</div>
          <div><b className="text-emerald-400 text-sm">+{nf(growth.week)}</b> this week</div>
          <div><b className="text-emerald-400 text-sm">+{nf(growth.month)}</b> this month</div>
        </div>
      </div>
      <div className="mt-3">
        <div className="flex justify-between text-[11px] text-zinc-400 mb-1"><span>Next milestone: {nf(next)}</span><span>{nf(next - growth.total)} to go</span></div>
        <div className="h-2 rounded-full bg-zinc-800 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-400" style={{ width: `${pct}%` }} /></div>
      </div>
      <div className="mt-2.5 text-[11px] text-zinc-500">Goal {nf(LONG_GOAL)}: {goalPct < 1 ? goalPct.toFixed(2) : goalPct.toFixed(1)}% reached</div>
    </div>
  );
};
