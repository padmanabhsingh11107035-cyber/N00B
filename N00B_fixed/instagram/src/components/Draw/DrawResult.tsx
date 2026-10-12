import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Loader2, PartyPopper } from 'lucide-react';
import { DrawWonPrize, RARITY, winBuzz } from '../../utils/noobDraw';
import { PrizeVisual } from './PrizeVisual';
import { buzz, winSound } from './drawFx';

interface DrawResultProps {
  prize: DrawWonPrize;
  packName: string;
  onClose: () => void;
  /** a live profile picture can be worn straight away */
  onWear?: () => void;
  wearing?: boolean;
}

const BURST: Record<string, number> = { common: 60, uncommon: 90, rare: 130, epic: 190, legendary: 270, mythic: 380 };

// The reveal: a glow in the prize's rarity colour, turning light rays, the prize popping in, and a burst of confetti that grows with the rarity.
export const DrawResult: React.FC<DrawResultProps> = ({ prize, packName, onClose, onWear, wearing }) => {
  const r = RARITY[prize.rarity];
  useEffect(() => {
    const colors = [r.color, '#ffffff', '#ffd166'];
    const timers: number[] = [];
    confetti({ particleCount: BURST[prize.rarity] || 80, spread: 85, startVelocity: 48, origin: { y: 0.6 }, colors, zIndex: 1000, disableForReducedMotion: true });
    if (r.rank >= 3) {
      timers.push(window.setTimeout(() => confetti({ particleCount: 70, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors, zIndex: 1000, disableForReducedMotion: true }), 280));
      timers.push(window.setTimeout(() => confetti({ particleCount: 70, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors, zIndex: 1000, disableForReducedMotion: true }), 420));
    }
    if (r.rank >= 4) timers.push(window.setTimeout(() => confetti({ particleCount: 160, spread: 120, startVelocity: 38, origin: { y: 0.45 }, colors, zIndex: 1000, disableForReducedMotion: true }), 800));
    winSound(prize.rarity);
    buzz(winBuzz(prize.rarity));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [prize.id, prize.rarity, r.color, r.rank]);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-5 draw-rise overflow-y-auto" style={{ background: `radial-gradient(60% 50% at 50% 38%, ${r.color}38, transparent 72%), #05050a` }}>
      <div className="relative w-full max-w-sm text-center">
        {/* the light rays behind the prize */}
        <div className="absolute left-1/2 top-[7.5rem] -translate-x-1/2 -translate-y-1/2 w-[26rem] h-[26rem] pointer-events-none draw-rays opacity-60"
          style={{ background: `repeating-conic-gradient(from 0deg, ${r.color}55 0deg 7deg, transparent 7deg 24deg)`, WebkitMaskImage: 'radial-gradient(circle, #000 8%, transparent 62%)', maskImage: 'radial-gradient(circle, #000 8%, transparent 62%)' }} />
        <div className="relative">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border" style={{ color: r.color, borderColor: `${r.color}77`, background: `${r.color}1f` }}>
            <PartyPopper className="w-3 h-3" /> {r.label} prize
          </div>
          <div className="draw-pop flex justify-center mt-6"><PrizeVisual prize={prize} size={132} /></div>
          <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.3em] text-zinc-400">You won</p>
          <h2 className="draw-sans mt-1 text-[26px] leading-tight text-white" style={{ textShadow: `0 0 28px ${r.color}88` }}>{prize.label}</h2>
          {prize.subtitle && <p className="text-xs font-semibold mt-1" style={{ color: r.color }}>{prize.subtitle}</p>}
          <p className="text-[13px] text-zinc-300 leading-relaxed mt-4 px-2">{prize.message}</p>
          <p className="text-[10px] text-zinc-500 mt-1">{packName}</p>
          <div className="mt-7 space-y-2.5">
            {onWear && prize.applied === 'ok' && (
              <button onClick={onWear} disabled={wearing} className="w-full py-3.5 rounded-2xl font-extrabold text-sm text-white border border-white/20 bg-white/10 hover:bg-white/15 disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2">
                {wearing ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Wear it now
              </button>
            )}
            <button onClick={onClose} className="w-full py-3.5 rounded-2xl font-black text-sm text-black cursor-pointer active:scale-[0.98] transition-transform" style={{ background: `linear-gradient(90deg, ${r.color}, #fff)`, boxShadow: `0 12px 34px -10px ${r.color}` }}>
              Awesome
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
