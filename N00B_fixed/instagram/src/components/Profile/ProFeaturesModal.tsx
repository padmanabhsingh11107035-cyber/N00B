import React, { useState } from 'react';
import { X, Sparkles, Check, Crown } from 'lucide-react';
import { User } from '../../types';

interface ProFeaturesModalProps {
  currentUser: User;
  onClose: () => void;
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
    perks: ['Pro badge on profile', 'Ad-free browsing', 'Priority in search results'],
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

export const ProFeaturesModal: React.FC<ProFeaturesModalProps> = ({ currentUser, onClose }) => {
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');

  const priceFor = (tier: ProTier) => {
    if (billing === 'monthly') {
      return { display: tier.monthlyPrice, suffix: '/month' };
    }
    const yearlyTotal = Math.round(tier.monthlyPrice * 12 * (1 - YEARLY_DISCOUNT));
    return { display: yearlyTotal, suffix: '/year' };
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

        {/* Tiers */}
        <div className="space-y-2.5">
          {TIERS.map((tier) => {
            const price = priceFor(tier);
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
                  className={`w-full py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    tier.highlight
                      ? 'bg-violet-500 text-white hover:bg-violet-400'
                      : 'bg-white text-black hover:bg-zinc-200'
                  }`}
                >
                  Subscribe to {tier.name}
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
