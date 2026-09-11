import React, { useState } from 'react';
import { X, Sparkles, Check, Crown, Loader2 } from 'lucide-react';
import { User } from '../../types';
import { redeemCouponCode, upgradeProTier } from '../../services/api';

interface ProFeaturesModalProps {
  currentUser: User;
  onClose: () => void;
  onUserUpdated?: (user: User) => void;
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
    monthlyPrice: 50000,
    perks: ['Pro badge on profile', 'Free access to the entire Premium sticker & GIF shop', 'Priority in search results'],
  },
  {
    id: 'plus',
    name: 'Plus',
    monthlyPrice: 75000,
    perks: ['Everything in Starter', 'Exclusive profile themes', 'Early access to new mini-games'],
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyPrice: 100000,
    perks: ['Everything in Plus', 'Higher upload limits for posts & reels', 'Custom accent color'],
    highlight: true,
  },
  {
    id: 'elite',
    name: 'Elite',
    monthlyPrice: 125000,
    perks: ['Everything in Pro', 'Priority customer support', 'Exclusive Elite-only badge'],
  },
  {
    id: 'ultimate',
    name: 'Ultimate',
    monthlyPrice: 150000,
    perks: ['Everything in Elite', 'Animated profile frame', 'Early access to every future feature'],
  },
];

const YEARLY_DISCOUNT = 0.17;

export const ProFeaturesModal: React.FC<ProFeaturesModalProps> = ({ currentUser, onClose, onUserUpdated }) => {
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; percent: number } | null>(null);
  const [couponMsg, setCouponMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const [subscribingTier, setSubscribingTier] = useState<string | null>(null);
  const [purchaseMsg, setPurchaseMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
    const res = await upgradeProTier({ tierId: tier.id, billing, couponCode: appliedCoupon?.code });
    setSubscribingTier(null);
    if (res.success && res.user) {
      onUserUpdated?.(res.user);
      setPurchaseMsg({ type: 'success', text: `You're now on the ${tier.name} plan!` });
    } else {
      setPurchaseMsg({ type: 'error', text: res.error || 'Could not complete the upgrade.' });
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
            <span className="text-[10px] font-black text-[#00FF66] bg-[#00FF66]/15 px-1.5 py-0.5 rounded-full">
              Save 17%
            </span>
          </button>
        </div>

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
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#00FF66] font-mono disabled:opacity-60"
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
            <p className={`text-[10px] ${couponMsg.type === 'success' ? 'text-[#00FF66]' : 'text-rose-400'}`}>
              {couponMsg.text}
            </p>
          )}
        </div>

        {purchaseMsg && (
          <div
            className={`p-2.5 rounded-xl text-xs font-semibold text-center ${
              purchaseMsg.type === 'success'
                ? 'bg-[#00FF66]/10 text-[#00FF66] border border-[#00FF66]/30'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
            }`}
          >
            {purchaseMsg.text}
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
                className={`rounded-2xl p-3.5 border ${
                  tier.highlight
                    ? 'bg-violet-500/10 border-violet-500/40'
                    : 'bg-zinc-900/60 border-zinc-800'
                }`}
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
                      <Check className="w-3 h-3 text-[#00FF66] mt-0.5 shrink-0" />
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
              </div>
            );
          })}
        </div>

        <p className="text-[10px] text-zinc-500 text-center pt-1">
          Subscriptions are billed in NOOB Points from your Wallet balance.
        </p>
      </div>
    </div>
  );
};
