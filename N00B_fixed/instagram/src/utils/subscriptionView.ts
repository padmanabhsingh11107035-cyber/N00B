// The words of the Subscription history page, in one place so each sentence can be tested on its own.
export interface CurrentPlan { tier: string | null; billing: string | null; autoRenew: boolean; endsAt: string | null; active: boolean; daysLeft: number | null }
export interface HistoryRow { at: string; kind: 'purchase' | 'renewal' | 'friend' | 'prize' | string; tier: string | null; planName: string | null; billing: string | null; paid: number | null; listPrice: number | null; coupon: string | null; paidBy: string | null }

const nf = (n: number | null | undefined) => Number(n ?? 0).toLocaleString('en-IN');
export const planLabel = (tier: string | null | undefined) => (tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : '');

export function statusOf(c: CurrentPlan): { text: string; tone: 'good' | 'warn' | 'none' } {
  if (!c.tier) return { text: 'You are on the free plan.', tone: 'none' };
  if (!c.active) return { text: 'This plan has ended.', tone: 'warn' };
  if (c.daysLeft !== null && c.daysLeft <= 3) return { text: `Active · ends in ${c.daysLeft} day${c.daysLeft === 1 ? '' : 's'}`, tone: 'warn' };
  return { text: c.daysLeft !== null ? `Active · ${c.daysLeft} days left` : 'Active', tone: 'good' };
}

export function describeHistoryRow(h: HistoryRow): { title: string; detail: string; amount: string } {
  const plan = h.planName && /^NOOB Pro/i.test(h.planName) ? h.planName : `NOOB Pro ${h.planName || planLabel(h.tier) || ''}`.trim();
  const billing = h.billing === 'yearly' ? 'yearly' : h.billing === 'monthly' ? 'monthly' : '';
  const coupon = h.coupon ? ` · coupon ${h.coupon}` : '';
  switch (h.kind) {
    case 'renewal':
      return { title: `${plan} renewed`, detail: `Taken from your wallet${billing ? `, ${billing}` : ''}`, amount: h.paid ? `−${nf(h.paid)}` : '' };
    case 'friend':
      return { title: `${plan}, paid by @${h.paidBy || 'a friend'}`, detail: `Plan value ${nf(h.listPrice)} points${billing ? `, ${billing}` : ''}${h.paid ? ` · you paid ${nf(h.paid)}` : ' · a gift'}`, amount: h.paid ? `−${nf(h.paid)}` : '' };
    case 'prize':
      return { title: `${plan} won`, detail: 'A prize from NOOB Draw', amount: '' };
    default:
      return { title: `${plan} bought`, detail: `Paid from your wallet${billing ? `, ${billing}` : ''}${coupon}`, amount: h.paid ? `−${nf(h.paid)}` : '' };
  }
}
