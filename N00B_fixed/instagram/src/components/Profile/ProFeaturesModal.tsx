import React, { useEffect, useRef, useState } from 'react';
import { ProReceipt, type ProReceiptData } from './ProReceipt';
import { X, Sparkles, Check, Crown, Loader2, RefreshCw, HeartHandshake, Search, Timer, Wallet, Ticket } from 'lucide-react';
import { User } from '../../types';
import { redeemCouponCode, upgradeProTier, toggleProAutoRenew, requestProPayment, fetchMySentPaymentRequests, cancelPaymentRequest, fetchCurrentUser } from '../../services/api';
import type { SentPaymentRequest } from '../../services/api';
import { setVisibleInterval } from '../../utils/visibleInterval';

interface ProFeaturesModalProps {
  currentUser: User;
  onClose: () => void;
  onUserUpdated?: (user: User) => void;
  // everyone, to pick a friend to ask for payment
  allUsers?: User[];
  // opened from an email / link ("Pay with NOOB Points"): jump straight to this plan (and billing) ready to pay
  focusTier?: string;
  focusBilling?: 'monthly' | 'yearly';
}

interface ProTier {
  id: string;
  name: string;
  monthlyPrice: number;
  perks: string[];
  highlight?: boolean;
}

const TIERS: ProTier[] = [
  {
    id: 'starter',
    name: 'Starter',
    monthlyPrice: 5_000_000_000,
    perks: ['Pro badge on profile', 'Ad-free browsing', 'Priority in search results'],
  },
  {
    id: 'plus',
    name: 'Plus',
    monthlyPrice: 7_500_000_000,
    perks: ['Everything in Starter', 'Exclusive profile themes', 'Early access to new mini-games'],
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyPrice: 10_000_000_000,
    perks: ['Everything in Plus', 'Higher upload limits for posts & reels', 'Custom accent color'],
    highlight: true,
  },
  {
    id: 'elite',
    name: 'Elite',
    monthlyPrice: 12_500_000_000,
    perks: ['Everything in Pro', 'Priority customer support', 'Exclusive Elite-only badge'],
  },
  {
    id: 'ultimate',
    name: 'Ultimate',
    monthlyPrice: 15_000_000_000,
    perks: ['Everything in Elite', 'Animated profile frame', 'Early access to every future feature'],
  },
];

const YEARLY_DISCOUNT = 0.17;

// The colour of each plan's card (cheapest to dearest): silver, blue, violet, gold, black.
const TIER_LOOK: Record<string, { bg: string; ink: string; chip: string; glow: string; sub: string }> = {
  starter: { bg: 'linear-gradient(140deg,#f4f6f9 0%,#c4cbd5 38%,#8d96a3 100%)', ink: '#1b2027', chip: 'linear-gradient(135deg,#ffffff,#a3abb6)', glow: 'rgba(120,132,150,0.55)', sub: 'rgba(27,32,39,0.62)' },
  plus: { bg: 'linear-gradient(140deg,#5aa0ff 0%,#2f64f0 45%,#14308f 100%)', ink: '#ffffff', chip: 'linear-gradient(135deg,#e7f0ff,#7ea8f7)', glow: 'rgba(37,99,235,0.55)', sub: 'rgba(255,255,255,0.72)' },
  pro: { bg: 'linear-gradient(140deg,#b18cff 0%,#7c3aed 46%,#3b1285 100%)', ink: '#ffffff', chip: 'linear-gradient(135deg,#f1eaff,#a98af5)', glow: 'rgba(124,58,237,0.55)', sub: 'rgba(255,255,255,0.74)' },
  elite: { bg: 'linear-gradient(140deg,#fff0b8 0%,#e3b84e 42%,#9a6f17 100%)', ink: '#2b1f05', chip: 'linear-gradient(135deg,#fff8d6,#c9a13f)', glow: 'rgba(201,161,63,0.6)', sub: 'rgba(43,31,5,0.66)' },
  ultimate: { bg: 'linear-gradient(140deg,#3a3a40 0%,#111114 48%,#000000 100%)', ink: '#f7dc8f', chip: 'linear-gradient(135deg,#f7dc8f,#8a6d1f)', glow: 'rgba(30,30,36,0.7)', sub: 'rgba(247,220,143,0.68)' },
};

export const ProFeaturesModal: React.FC<ProFeaturesModalProps> = ({ currentUser, onClose, onUserUpdated, allUsers = [], focusTier, focusBilling }) => {
  const railRef = useRef<HTMLDivElement>(null);
  const [cardIdx, setCardIdx] = useState(() => { const i = TIERS.findIndex((t) => t.id === (focusTier || currentUser.proTier || 'pro')); return i < 0 ? 2 : i; });
  const onRailScroll = () => {
    const rail = railRef.current;
    if (!rail || rail.children.length === 0) return;
    const mid = rail.scrollLeft + rail.clientWidth / 2;
    let best = 0, bestD = Infinity;
    Array.from(rail.children).forEach((c, i) => { const el = c as HTMLElement; const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid); if (d < bestD) { bestD = d; best = i; } });
    if (best !== cardIdx) setCardIdx(best);
  };
  const railTo = (i: number) => {
    const el = railRef.current?.children[i] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };
  useEffect(() => { const t = window.setTimeout(() => railTo(cardIdx), 60); return () => window.clearTimeout(t); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const [billing, setBilling] = useState<'monthly' | 'yearly'>(focusBilling === 'yearly' ? 'yearly' : 'monthly');
  const [autoRenew, setAutoRenew] = useState(true);
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; percent: number } | null>(null);
  const [couponMsg, setCouponMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const [subscribingTier, setSubscribingTier] = useState<string | null>(null);
  const [purchaseMsg, setPurchaseMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [currentAutoRenew, setCurrentAutoRenew] = useState(currentUser.proAutoRenew !== false);
  const [savingAutoRenew, setSavingAutoRenew] = useState(false);
  // "Subscribe" opens this sheet: pay from the Wallet, use a coupon, or ask a friend to pay. A "Pay with NOOB Points" link opens it at once.
  const [payTier, setPayTier] = useState<ProTier | null>(() => (focusTier && !currentUser.proTier ? TIERS.find((t) => t.id === focusTier) ?? null : null));

  // ---- ask a friend to pay (the whole price, or only the points I am missing)
  const [askTier, setAskTier] = useState<ProTier | null>(null);
  const [askMode, setAskMode] = useState<'full' | 'topup'>('full');
  const [friendQuery, setFriendQuery] = useState('');
  const [friend, setFriend] = useState<User | null>(null);
  const [askBusy, setAskBusy] = useState(false);
  const [askError, setAskError] = useState('');
  const [askSent, setAskSent] = useState('');
  const [sent, setSent] = useState<SentPaymentRequest[]>([]);
  const [proNotice, setProNotice] = useState('');
  const myPoints = currentUser.noobPoints || 0;
  const fullPrice = (tier: ProTier) => (billing === 'monthly' ? tier.monthlyPrice : Math.round(tier.monthlyPrice * 12 * (1 - YEARLY_DISCOUNT)));
  const candidates = allUsers
    .filter((u) => u.id !== currentUser.id && !u.isAi)
    .filter((u) => (friendQuery.trim() ? u.username.toLowerCase().includes(friendQuery.trim().toLowerCase()) : true))
    .slice(0, 30);

  // Waiting requests: shown with a Cancel button, and checked every few seconds so the plan appears the moment the friend pays.
  useEffect(() => {
    let alive = true;
    let previous: string[] = [];
    const load = async () => {
      const list = await fetchMySentPaymentRequests();
      if (!alive) return;
      const proList = list.filter((r) => r.purchaseType === 'pro' || r.purchaseType === 'pro_topup');
      const gone = previous.filter((id) => !proList.some((r) => r.id === id));
      previous = proList.map((r) => r.id);
      setSent(proList);
      if (gone.length > 0) {
        const fresh = await fetchCurrentUser();
        if (alive && fresh) {
          onUserUpdated?.(fresh);
          if (fresh.proTier) setProNotice('Your NOOB Pro is active — your friend paid. 🎉');
        }
      }
    };
    void load();
    const stop = setVisibleInterval(() => { void load(); }, 12000);
    return () => { alive = false; stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Opened from the "Pay with NOOB Points" link in an email: scroll to that plan.
  useEffect(() => {
    if (!focusTier) return;
    const t = setTimeout(() => document.getElementById(`pro-plan-${focusTier}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    return () => clearTimeout(t);
  }, [focusTier]);

  // The Reload switch belongs to the open tab: on the tab of the plan you already have it is that plan's auto-renew, otherwise it is the choice for the plan being bought.
  const isCurrentPlanTab = !!currentUser.proTier && (currentUser.proBilling === 'yearly' ? 'yearly' : 'monthly') === billing;
  const reloadOn = isCurrentPlanTab ? currentAutoRenew : autoRenew;

  const openAsk = (tier: ProTier) => {
    setPayTier(null);
    setAskTier(tier);
    setAskMode(myPoints < fullPrice(tier) && myPoints > 0 ? 'topup' : 'full');
    setFriend(null);
    setFriendQuery('');
    setAskError('');
    setAskSent('');
  };

  const handleAsk = async () => {
    if (!askTier || !friend || askBusy) return;
    setAskBusy(true);
    setAskError('');
    const res = await requestProPayment(friend.id, askTier.id, billing, askMode, reloadOn);
    setAskBusy(false);
    if (res.success) {
      setAskSent(`Request sent to @${friend.username}. It stays open for 24 hours, and your NOOB Pro ${askTier.name} starts the moment they pay.`);
      setSent(await fetchMySentPaymentRequests().then((l) => l.filter((r) => r.purchaseType === 'pro' || r.purchaseType === 'pro_topup')));
    } else {
      setAskError(res.error || 'Could not send that request.');
    }
  };

  const handleCancelRequest = async (id: string) => {
    const res = await cancelPaymentRequest(id);
    if (res.success) setSent((prev) => prev.filter((r) => r.id !== id));
  };

  const priceFor = (tier: ProTier) => {
    const base = billing === 'monthly' ? tier.monthlyPrice : Math.round(tier.monthlyPrice * 12 * (1 - YEARLY_DISCOUNT));
    const suffix = billing === 'monthly' ? '/month' : '/year';
    const discounted = appliedCoupon ? Math.max(0, Math.round(base * (1 - appliedCoupon.percent / 100))) : base;
    return { base, display: discounted, suffix };
  };

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) return;
    setCheckingCoupon(true);
    setCouponMsg(null);
    const res = await redeemCouponCode(couponInput.trim());
    setCheckingCoupon(false);
    if (res.success && res.coupon) {
      setAppliedCoupon({ code: res.coupon.code, percent: res.coupon.discountPercent });
      setCouponMsg({ type: 'success', text: `${res.coupon.discountPercent}% off applied to every plan!` });
    } else {
      setCouponMsg({ type: 'error', text: res.error || 'Invalid coupon code.' });
    }
  };

  const [receipt, setReceipt] = useState<ProReceiptData | null>(null);
  const handleSubscribe = async (tier: ProTier) => {
    const quote = priceFor(tier);
    const coupon = appliedCoupon;
    setSubscribingTier(tier.id);
    setPurchaseMsg(null);
    const res = await upgradeProTier({
      tierId: tier.id,
      billing,
      couponCode: appliedCoupon?.code,
      autoRenew: reloadOn
    });
    setSubscribingTier(null);
    if (res.success && res.user) {
      onUserUpdated?.(res.user);
      setCurrentAutoRenew(res.user.proAutoRenew !== false);
      setPurchaseMsg({ type: 'success', text: `You're now on the ${tier.name} plan!` });
      setReceipt({ planName: tier.name, billing, base: quote.base, total: quote.display, couponCode: coupon?.code, couponPercent: coupon?.percent, autoRenew: reloadOn, at: new Date() });
      setPayTier(null);
    } else {
      setPurchaseMsg({ type: 'error', text: res.error || 'Could not complete the upgrade.' });
    }
  };

  const handleToggleCurrentAutoRenew = async () => {
    const next = !currentAutoRenew;
    setSavingAutoRenew(true);
    setCurrentAutoRenew(next);
    const res = await toggleProAutoRenew(next);
    setSavingAutoRenew(false);
    if (!res.success) {
      setCurrentAutoRenew(!next);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#f1f0ec] flex items-stretch justify-center p-0" onClick={onClose}>
      {receipt && <ProReceipt receipt={receipt} onDone={() => setReceipt(null)} />}
      <div
        className="pro-light w-full h-full max-w-none bg-[#f1f0ec] p-5 sm:px-[max(1.25rem,calc((100vw-30rem)/2))] space-y-4 overflow-y-auto pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-400" /> Unlock Pro Features
          </h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Monthly / Yearly toggle */}
        <div className="flex items-center justify-center gap-1 bg-zinc-900 border border-zinc-800 rounded-2xl p-1">
          <button
            onClick={() => setBilling('monthly')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              billing === 'monthly' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBilling('yearly')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
              billing === 'yearly' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Yearly
            <span className="text-[10px] font-black text-noob bg-noob/15 px-1.5 py-0.5 rounded-full">
              Save 17%
            </span>
          </button>
        </div>

        {/* Reload Monthly / Reload Yearly: ONE switch for the tab that is open. On the tab of the plan you already have it manages that
            plan's auto-renew; on any other tab it decides whether the plan you are about to buy renews by itself. */}
        {(() => {
          const word = billing === 'yearly' ? 'Yearly' : 'Monthly';
          const per = billing === 'yearly' ? 'year' : 'month';
          const on = reloadOn;
          return (
            <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-xl ${on ? 'bg-noob/15 text-noob' : 'bg-zinc-800 text-zinc-500'}`}>
                  <RefreshCw className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Reload {word}</h4>
                  <p className="text-[10px] text-zinc-400">
                    {on
                      ? `Your Wallet is billed automatically each ${per} to keep Pro active.`
                      : isCurrentPlanTab
                        ? `Pro ends on ${currentUser.proRenewsAt ? new Date(currentUser.proRenewsAt).toLocaleDateString() : 'your renewal date'} unless you turn this back on.`
                        : `Pro ends after one ${per} unless you subscribe again.`}
                  </p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={isCurrentPlanTab && savingAutoRenew}
                  onChange={(e) => (isCurrentPlanTab ? handleToggleCurrentAutoRenew() : setAutoRenew(e.target.checked))}
                  className="sr-only peer"
                />
                <div className="w-10 h-5.5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4.5 after:w-4.5 after:transition-all peer-checked:bg-noob" />
              </label>
            </div>
          );
        })()}

        {purchaseMsg && !payTier && (
          <div
            className={`p-2.5 rounded-xl text-xs font-semibold text-center ${
              purchaseMsg.type === 'success'
                ? 'bg-noob/10 text-noob border border-noob/30'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
            }`}
          >
            {purchaseMsg.text}
          </div>
        )}

        {proNotice && <div className="p-2.5 rounded-xl text-xs font-semibold text-center bg-noob/10 text-noob border border-noob/30">{proNotice}</div>}

        {focusTier && TIERS.some((t) => t.id === focusTier) && !currentUser.proTier && (
          <div className="p-3 rounded-2xl bg-noob/10 border border-noob/40 text-[11px] text-zinc-200">
            You came here to pay for <span className="font-bold text-white">NOOB Pro {TIERS.find((t) => t.id === focusTier)?.name}</span>. Your Wallet has{' '}
            <span className="font-bold text-white">{myPoints.toLocaleString()}</span> noobs. Press <span className="font-bold">Subscribe</span> on that plan below, or ask a friend to help pay.
          </div>
        )}

        {sent.length > 0 && (
          <div className="space-y-2">
            {sent.map((r) => (
              <div key={r.id} className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3">
                <HeartHandshake className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-white">
                    Waiting for <span className="font-bold">@{r.payer.username}</span> to pay{' '}
                    <span className="font-bold">{Number(r.amount).toLocaleString()}</span> noobs for NOOB Pro {r.planName} ({r.planBilling === 'yearly' ? 'yearly' : 'monthly'})
                    {r.purchaseType === 'pro_topup' ? `, with your own ${Number(r.requesterPays || 0).toLocaleString()} added` : ''}.
                  </p>
                  <p className="text-[10px] text-amber-300 flex items-center gap-1 mt-0.5"><Timer className="w-3 h-3" /> open until {new Date(r.expiresAt).toLocaleString()}</p>
                </div>
                <button onClick={() => handleCancelRequest(r.id)} className="text-[11px] font-bold text-zinc-300 hover:text-white px-2.5 py-1.5 rounded-lg bg-zinc-800 cursor-pointer shrink-0">Cancel</button>
              </div>
            ))}
          </div>
        )}

        {/* Tiers: a row of NOOB cards, one colour per plan; swipe sideways for more, "Choose" opens the payment sheet */}
        <div data-testid="pro-cards">
          <div
            ref={railRef}
            onScroll={onRailScroll}
            className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-3 -mx-5 px-[11%] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {TIERS.map((tier, i) => {
              const look = TIER_LOOK[tier.id];
              const price = priceFor(tier);
              const isCurrentTier = currentUser.proTier === tier.id;
              return (
                <div
                  key={tier.id}
                  id={`pro-plan-${tier.id}`}
                  data-testid={`pro-card-${tier.id}`}
                  onClick={() => railTo(i)}
                  className={`snap-center shrink-0 w-[78%] aspect-[1.4] rounded-[26px] p-[18px] relative overflow-hidden flex flex-col justify-between transition-all duration-300 cursor-pointer ${i === cardIdx ? 'scale-100 opacity-100' : 'scale-[0.92] opacity-70'} ${focusTier === tier.id ? 'ring-2 ring-noob' : ''}`}
                  style={{ background: look.bg, color: look.ink, boxShadow: `0 22px 38px -16px ${look.glow}, 0 8px 14px -8px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.55), inset 0 0 0 1px rgba(255,255,255,0.14)` }}
                >
                  {/* the glossy finish: a bright spot top left, a soft diagonal sheen, a darker foot */}
                  <span aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(120% 70% at 12% -10%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), linear-gradient(112deg, rgba(255,255,255,0) 30%, rgba(255,255,255,0.22) 44%, rgba(255,255,255,0) 58%), linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.22) 100%)' }} />
                  <div className="relative flex items-start justify-between">
                    <span className="text-[22px] font-black tracking-[0.2em] leading-none">NOOB</span>
                    {isCurrentTier
                      ? <span className="text-[9px] font-black tracking-wider px-2 py-1 rounded-full bg-black/70 text-white">YOUR PLAN</span>
                      : <span className="w-9 h-7 rounded-md shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]" style={{ background: look.chip }} aria-hidden="true" />}
                  </div>
                  <div className="relative">
                    <p className="text-[10px] font-bold tracking-[0.24em]" style={{ color: look.sub }}>NOOB PRO</p>
                    <p className="text-[28px] font-black leading-[1.05] tracking-tight">{tier.name}{tier.highlight ? ' ★' : ''}</p>
                  </div>
                  <div className="relative">
                    {appliedCoupon && <span className="text-[10px] line-through block" style={{ color: look.sub }}>{price.base.toLocaleString()}</span>}
                    <p className="text-[21px] font-black leading-none tabular-nums whitespace-nowrap">{price.display.toLocaleString()}</p>
                    <p className="mt-1 text-[10px] font-semibold tracking-wide" style={{ color: look.sub }}>noobs{price.suffix}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-center gap-1.5 mb-2" aria-hidden="true">
            {TIERS.map((t, i) => <span key={t.id} className={`h-1.5 rounded-full transition-all ${i === cardIdx ? 'w-5 bg-white' : 'w-1.5 bg-zinc-600'}`} />)}
          </div>
          {(() => {
            const tier = TIERS[cardIdx] ?? TIERS[0];
            const isCurrentTier = currentUser.proTier === tier.id;
            return (
              <div className="space-y-3" data-testid="pro-card-detail">
                <div className="rounded-[22px] border border-black/5 shadow-[0_12px_30px_-18px_rgba(0,0,0,0.35)] p-4" style={{ background: '#ffffff' }}>
                  <p className="text-[11px] font-extrabold tracking-[0.18em] text-zinc-400 mb-3">WHAT YOU GET WITH {tier.name.toUpperCase()}</p>
                  <ul className="space-y-2.5">
                    {tier.perks.map((perk, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-[13px] leading-snug text-zinc-200">
                        <span className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: TIER_LOOK[tier.id].bg, color: TIER_LOOK[tier.id].ink }}><Check className="w-3 h-3" strokeWidth={3} /></span>
                        <span className="min-w-0">{perk}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <button
                  onClick={() => { setPurchaseMsg(null); setPayTier(tier); }}
                  disabled={isCurrentTier}
                  data-testid="pro-choose"
                  className="w-full py-4 rounded-full bg-white text-black text-sm font-extrabold cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99] transition-transform flex items-center justify-center gap-1.5 shadow-[0_14px_28px_-12px_rgba(0,0,0,0.55)]"
                >
                  {isCurrentTier ? 'Current Plan' : `Choose ${tier.name}`}
                </button>
              </div>
            );
          })()}
        </div>

        {/* Payment methods: opened by "Subscribe" */}
        {payTier && (() => {
          const price = priceFor(payTier);
          const enough = myPoints >= price.display;
          const busy = subscribingTier === payTier.id;
          const word = billing === 'yearly' ? 'Yearly' : 'Monthly';
          return (
            <div className="fixed inset-0 z-[110] bg-black/80 flex items-end sm:items-center justify-center p-3" onClick={() => { if (!busy) setPayTier(null); }}>
              <div className="pro-light w-full max-w-md bg-[#f1f0ec] border border-black/5 rounded-3xl p-5 space-y-3 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-white">Confirm order</h3>
                  <button onClick={() => setPayTier(null)} disabled={busy} className="text-zinc-400 hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
                </div>

                <div className="rounded-[18px] p-3.5 h-24 flex flex-col justify-between relative overflow-hidden shadow-lg" style={{ background: TIER_LOOK[payTier.id].bg, color: TIER_LOOK[payTier.id].ink }} data-testid="pay-card">
                  <span className="text-lg font-black tracking-[0.18em] leading-none">NOOB</span>
                  <span className="text-[11px] font-extrabold tracking-wider opacity-80">NOOB PRO · {payTier.name.toUpperCase()}</span>
                </div>
                <div className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white">NOOB Pro {payTier.name} · {word.toLowerCase()}</p>
                    <p className="text-[10px] text-zinc-400">Reload {word}: {reloadOn ? 'on' : 'off'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {appliedCoupon && <span className="text-[10px] text-zinc-500 line-through block">{price.base.toLocaleString()}</span>}
                    <span className="text-sm font-black text-white">{price.display.toLocaleString()}</span>
                    <span className="text-[10px] text-zinc-400 ml-1">noobs{price.suffix}</span>
                  </div>
                </div>

                {purchaseMsg && purchaseMsg.type === 'error' && (
                  <p className="p-2.5 rounded-xl text-xs font-semibold text-center bg-rose-500/10 text-rose-400 border border-rose-500/30">{purchaseMsg.text}</p>
                )}

                {/* 1. Wallet */}
                <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-2">
                  <div className="flex items-center gap-2"><Wallet className="w-4 h-4 text-noob" /><span className="text-xs font-bold text-white">Pay from my Wallet</span></div>
                  <p className="text-[11px] text-zinc-400">
                    Your Wallet has <span className="text-white font-bold">{myPoints.toLocaleString()}</span> noobs.
                    {enough ? '' : ` You need ${(price.display - myPoints).toLocaleString()} more — use a coupon or ask a friend below.`}
                  </p>
                  <button
                    onClick={() => handleSubscribe(payTier)}
                    disabled={!enough || busy}
                    className="w-full py-2.5 rounded-xl bg-white text-black text-xs font-extrabold hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                  >
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : `Pay ${price.display.toLocaleString()} noobs`}
                  </button>
                </div>

                {/* 2. Coupon */}
                <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-2">
                  <div className="flex items-center gap-2"><Ticket className="w-4 h-4 text-violet-300" /><span className="text-xs font-bold text-white">Use a coupon code</span></div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Have a coupon code?"
                      value={couponInput}
                      onChange={(e) => { setCouponInput(e.target.value); setCouponMsg(null); }}
                      disabled={!!appliedCoupon}
                      className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-noob font-mono disabled:opacity-60"
                    />
                    {appliedCoupon ? (
                      <button
                        onClick={() => { setAppliedCoupon(null); setCouponInput(''); setCouponMsg(null); }}
                        className="px-3 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-bold cursor-pointer hover:bg-zinc-700"
                      >
                        Remove
                      </button>
                    ) : (
                      <button
                        onClick={handleApplyCoupon}
                        disabled={!couponInput.trim() || checkingCoupon}
                        className="px-3 py-2 rounded-xl bg-zinc-800 text-white text-xs font-bold cursor-pointer hover:bg-zinc-700 disabled:opacity-50"
                      >
                        {checkingCoupon ? '...' : 'Apply'}
                      </button>
                    )}
                  </div>
                  {couponMsg && <p className={`text-[10px] ${couponMsg.type === 'success' ? 'text-noob' : 'text-rose-400'}`}>{couponMsg.text}</p>}
                </div>

                {/* 3. Ask a friend */}
                <button
                  onClick={() => openAsk(payTier)}
                  className="w-full p-3.5 rounded-2xl text-left bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 cursor-pointer flex items-center gap-2.5"
                >
                  <HeartHandshake className="w-4 h-4 text-amber-300 shrink-0" />
                  <span className="text-xs font-bold text-amber-300">Ask a friend to pay<span className="block text-[10px] font-normal text-zinc-400">They pay all of it, or only the noobs you are missing.</span></span>
                </button>
              </div>
            </div>
          );
        })()}

        {/* Ask a friend to pay: the sheet */}
        {askTier && (
          <div className="fixed inset-0 z-[110] bg-black/80 flex items-end sm:items-center justify-center p-3" onClick={() => setAskTier(null)}>
            <div className="pro-light w-full max-w-md bg-[#f1f0ec] border border-black/5 rounded-3xl p-5 space-y-3 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2"><HeartHandshake className="w-4 h-4 text-amber-400" /> Ask a friend to pay</h3>
                <button onClick={() => setAskTier(null)} className="text-zinc-400 hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
              </div>
              {askSent ? (
                <div className="space-y-3">
                  <p className="text-xs text-noob bg-noob/10 border border-noob/30 rounded-xl p-3">{askSent}</p>
                  <button onClick={() => setAskTier(null)} className="w-full py-2.5 rounded-xl bg-white text-black text-xs font-bold cursor-pointer">Done</button>
                </div>
              ) : (
                <>
                  <p className="text-[11px] text-zinc-400">
                    NOOB Pro <span className="text-white font-bold">{askTier.name}</span> · {billing === 'monthly' ? 'monthly' : 'yearly'} ·{' '}
                    <span className="text-white font-bold">{fullPrice(askTier).toLocaleString()}</span> noobs. Coupons do not apply to a friend's payment.
                  </p>
                  <div className="space-y-2">
                    <label className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer ${askMode === 'full' ? 'border-amber-400/60 bg-amber-500/10' : 'border-zinc-800 bg-zinc-900/60'}`}>
                      <input type="radio" checked={askMode === 'full'} onChange={() => setAskMode('full')} className="mt-0.5" />
                      <span className="text-[11px] text-zinc-200"><b className="text-white">My friend pays the whole price</b><br />{fullPrice(askTier).toLocaleString()} noobs from their wallet.</span>
                    </label>
                    {myPoints > 0 && myPoints < fullPrice(askTier) ? (
                      <label className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer ${askMode === 'topup' ? 'border-amber-400/60 bg-amber-500/10' : 'border-zinc-800 bg-zinc-900/60'}`}>
                        <input type="radio" checked={askMode === 'topup'} onChange={() => setAskMode('topup')} className="mt-0.5" />
                        <span className="text-[11px] text-zinc-200">
                          <b className="text-white">My friend pays only what I am missing</b><br />
                          They pay {(fullPrice(askTier) - myPoints).toLocaleString()} noobs, and my {myPoints.toLocaleString()} noobs are taken at the same time.
                        </span>
                      </label>
                    ) : myPoints >= fullPrice(askTier) ? (
                      <p className="text-[10px] text-zinc-500">You already have enough noobs for this plan — you can subscribe yourself.</p>
                    ) : null}
                  </div>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      value={friendQuery}
                      onChange={(e) => { setFriendQuery(e.target.value); setFriend(null); }}
                      placeholder="Search a friend by username"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div className="max-h-44 overflow-y-auto space-y-1">
                    {candidates.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => setFriend(u)}
                        className={`w-full flex items-center gap-2.5 p-2 rounded-xl text-left cursor-pointer ${friend?.id === u.id ? 'bg-amber-500/15 border border-amber-400/50' : 'hover:bg-zinc-900 border border-transparent'}`}
                      >
                        <img src={u.avatar || '/noob-logo.svg.jpeg'} alt="" loading="lazy" className="w-8 h-8 rounded-full object-cover bg-zinc-800" />
                        <span className="text-xs font-semibold text-white truncate">@{u.username}</span>
                        {friend?.id === u.id && <Check className="w-3.5 h-3.5 text-amber-300 ml-auto" />}
                      </button>
                    ))}
                    {candidates.length === 0 && <p className="text-[11px] text-zinc-500 text-center py-3">No one found.</p>}
                  </div>
                  {askError && <p className="text-[11px] text-rose-400">{askError}</p>}
                  <button
                    onClick={handleAsk}
                    disabled={!friend || askBusy || (askMode === 'topup' && !(myPoints > 0 && myPoints < fullPrice(askTier)))}
                    className="w-full py-2.5 rounded-xl bg-amber-500 text-black text-xs font-extrabold disabled:opacity-40 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {askBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    {friend ? `Send request to @${friend.username}` : 'Choose a friend'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        <p className="text-[10px] text-zinc-500 text-center pt-1">
          Subscriptions are billed in NOOB Points from your Wallet balance.
        </p>
      </div>
    </div>
  );
};
