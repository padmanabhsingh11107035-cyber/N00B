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
    <div className="dr-result edge-own" role="dialog" aria-label="Your prize" style={{ ['--rc' as any]: r.color, ['--rs' as any]: r.soft }}>
      <div className="dr-result-glow" aria-hidden="true" />
      <div className="dr-result-scroll">
        <div className="dr-result-body">
          <div className="dr-badge dr-rise">
            <PartyPopper className="w-3 h-3" /> {r.label} prize
          </div>
          <div className="dr-prize-stage">
            {/* the light rays behind the prize */}
            <div className="draw-rays dr-rays" aria-hidden="true" />
            <div className="dr-ring" aria-hidden="true" />
            <div className="draw-pop dr-prize"><PrizeVisual prize={prize} size={132} /></div>
          </div>
          <p className="dr-won dr-rise" style={{ animationDelay: '420ms' }}>You won</p>
          <h2 className="dr-won-t dr-rise" style={{ animationDelay: '500ms' }}>{prize.label}</h2>
          {prize.subtitle && <p className="dr-won-s dr-rise" style={{ animationDelay: '560ms' }}>{prize.subtitle}</p>}
          <p className="dr-won-m dr-rise" style={{ animationDelay: '620ms' }}>{prize.message}</p>
          {(prize.kind === 'pro' || prize.kind === 'verified') && prize.applied === 'ok' && (
            <p data-draw-mail-hint className="dr-won-h">We also email you the details. Not in your inbox? Check Spam and tap “Not spam”.</p>
          )}
          <p className="dr-won-p">{packName}</p>
          <div className="dr-result-btns dr-rise" style={{ animationDelay: '700ms' }}>
            {onWear && prize.applied === 'ok' && (
              <button type="button" onClick={onWear} disabled={wearing} className="dr-btn-ghost dr-btn-wide">
                {wearing ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Wear it now
              </button>
            )}
            <button type="button" onClick={onClose} className="dr-btn-solid dr-btn-wide dr-btn-prize">
              Awesome
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
