import React, { useEffect, useState } from 'react';
import { X, Sparkles, Check, Crown, Loader2, RefreshCw, HeartHandshake, Search, Timer } from 'lucide-react';
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

export const ProFeaturesModal: React.FC<ProFeaturesModalProps> = ({ currentUser, onClose, onUserUpdated, allUsers = [], focusTier, focusBilling }) => {
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

  const openAsk = (tier: ProTier) => {
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
    const res = await requestProPayment(friend.id, askTier.id, billing, askMode, autoRenew);
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

  const handleSubscribe = async (tier: ProTier) => {
    setSubscribingTier(tier.id);
    setPurchaseMsg(null);
    const res = await upgradeProTier({
      tierId: tier.id,
      billing,
      couponCode: appliedCoupon?.code,
      autoRenew
    });
    setSubscribingTier(null);
    if (res.success && res.user) {
      onUserUpdated?.(res.user);
      setCurrentAutoRenew(res.user.proAutoRenew !== false);
      setPurchaseMsg({ type: 'success', text: `You're now on the ${tier.name} plan!` });
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
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-3" onClick={onClose}>
      <div
        className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-3xl p-5 space-y-4 max-h-[85vh] overflow-y-auto"
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

        {/* Manage an existing subscription's auto-renew — only shown once
            already subscribed, since there's nothing to "reload" yet. */}
        {currentUser.proTier && (
          <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-xl ${currentAutoRenew ? 'bg-noob/15 text-noob' : 'bg-zinc-800 text-zinc-500'}`}>
                <RefreshCw className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">{currentUser.proBilling === 'yearly' ? 'Reload Yearly' : 'Reload Monthly'}</h4>
                <p className="text-[10px] text-zinc-400">
                  {currentAutoRenew
                    ? `Your Wallet is billed automatically each ${currentUser.proBilling === 'yearly' ? 'year' : 'month'} to keep Pro active.`
                    : `Pro ends on ${currentUser.proRenewsAt ? new Date(currentUser.proRenewsAt).toLocaleDateString() : 'your renewal date'} unless you turn this back on.`}
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={currentAutoRenew}
                disabled={savingAutoRenew}
                onChange={handleToggleCurrentAutoRenew}
                className="sr-only peer"
              />
              <div className="w-10 h-5.5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4.5 after:w-4.5 after:transition-all peer-checked:bg-noob" />
            </label>
          </div>
        )}

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

        {/* Reload Monthly / Reload Yearly — whether this new subscription auto-renews each
            month (or year) by deducting NOOB Points from the Wallet, or ends after one period. */}
        <label className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800 cursor-pointer">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 text-noob" />
            <span className="text-xs font-semibold text-white">{billing === 'yearly' ? 'Reload Yearly' : 'Reload Monthly'}</span>
          </div>
          <div className="relative inline-flex items-center">
            <input
              type="checkbox"
              checked={autoRenew}
              onChange={(e) => setAutoRenew(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-10 h-5.5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4.5 after:w-4.5 after:transition-all peer-checked:bg-noob" />
          </div>
        </label>

        {/* Discount coupon — applies to whichever tier you subscribe to */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Have a coupon code?"
              value={couponInput}
              onChange={(e) => {
                setCouponInput(e.target.value);
                setCouponMsg(null);
              }}
              disabled={!!appliedCoupon}
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-noob font-mono disabled:opacity-60"
            />
            {appliedCoupon ? (
              <button
                onClick={() => {
                  setAppliedCoupon(null);
                  setCouponInput('');
                  setCouponMsg(null);
                }}
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
          {couponMsg && (
            <p className={`text-[10px] ${couponMsg.type === 'success' ? 'text-noob' : 'text-rose-400'}`}>
              {couponMsg.text}
            </p>
          )}
        </div>

        {purchaseMsg && (
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

        {/* Tiers */}
        <div className="space-y-2.5">
          {TIERS.map((tier) => {
            const price = priceFor(tier);
            const isCurrentTier = currentUser.proTier === tier.id;
            return (
              <div
                key={tier.id}
                id={`pro-plan-${tier.id}`}
                className={`rounded-2xl p-3.5 border ${
                  tier.highlight
                    ? 'bg-violet-500/10 border-violet-500/40'
                    : 'bg-zinc-900/60 border-zinc-800'
                } ${focusTier === tier.id ? 'ring-2 ring-noob' : ''}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    {tier.highlight && <Crown className="w-3.5 h-3.5 text-amber-400" />}
                    <span className="text-sm font-bold text-white">{tier.name}</span>
                    {tier.highlight && (
                      <span className="text-[9px] font-black text-violet-300 bg-violet-500/20 px-1.5 py-0.5 rounded-full">
                        POPULAR
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    {appliedCoupon && (
                      <span className="text-[10px] text-zinc-500 line-through block">
                        {price.base.toLocaleString()}
                      </span>
                    )}
                    <span className="text-sm font-black text-white">
                      {price.display.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-zinc-400 ml-1">noobs{price.suffix}</span>
                  </div>
                </div>
                <ul className="space-y-1 mb-3">
                  {tier.perks.map((perk, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-zinc-300">
                      <Check className="w-3 h-3 text-noob mt-0.5 shrink-0" />
                      {perk}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleSubscribe(tier)}
                  disabled={subscribingTier === tier.id || isCurrentTier}
                  className={`w-full py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 ${
                    tier.highlight
                      ? 'bg-violet-500 text-white hover:bg-violet-400'
                      : 'bg-white text-black hover:bg-zinc-200'
                  }`}
                >
                  {subscribingTier === tier.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : isCurrentTier ? (
                    'Current Plan'
                  ) : (
                    `Subscribe to ${tier.name}`
                  )}
                </button>
                {!isCurrentTier && (
                  <button
                    onClick={() => openAsk(tier)}
                    className="w-full mt-2 py-2 rounded-xl text-[11px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <HeartHandshake className="w-3.5 h-3.5" /> Ask a friend to pay
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Ask a friend to pay: the sheet */}
        {askTier && (
          <div className="fixed inset-0 z-[110] bg-black/80 flex items-end sm:items-center justify-center p-3" onClick={() => setAskTier(null)}>
            <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-3xl p-5 space-y-3 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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
