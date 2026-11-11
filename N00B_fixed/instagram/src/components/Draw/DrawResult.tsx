import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Loader2 } from 'lucide-react';
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

const BURST: Record<string, number> = { common: 0, uncommon: 0, rare: 40, epic: 60, legendary: 90, mythic: 120 };

// The reveal: a solid backdrop, the prize large on a plain plate, its rarity named, two clear buttons. Only the rarer prizes get one short, small confetti burst.
export const DrawResult: React.FC<DrawResultProps> = ({ prize, packName, onClose, onWear, wearing }) => {
  const r = RARITY[prize.rarity];
  useEffect(() => {
    const colors = [r.color, '#F2B63B', '#ffffff'];
    const n = BURST[prize.rarity] || 0;
    if (n) confetti({ particleCount: n, spread: 70, startVelocity: 34, gravity: 1.1, ticks: 120, scalar: 0.8, origin: { y: 0.5 }, colors, zIndex: 1000, disableForReducedMotion: true });
    winSound(prize.rarity);
    buzz(winBuzz(prize.rarity));
  }, [prize.id, prize.rarity, r.color]);

  return (
    <div className="dr-result edge-own" role="dialog" aria-label="Your prize" style={{ ['--rc' as any]: r.color }}>
      <div className="dr-result-scroll">
        <div className="dr-result-body">
          <div className="dr-result-top">
            <p className="dr-badge dr-rise"><span className="dr-badge-dot" aria-hidden="true" />{r.label} prize</p>
            <div className="dr-prize-plate dr-pop"><PrizeVisual prize={prize} size={128} /></div>
            <p className="dr-won dr-rise" style={{ animationDelay: '260ms' }}>You won</p>
            <h2 className="dr-won-t dr-rise" style={{ animationDelay: '300ms' }}>{prize.label}</h2>
            {prize.subtitle && <p className="dr-won-s dr-rise" style={{ animationDelay: '340ms' }}>{prize.subtitle}</p>}
            <p className="dr-won-m dr-rise" style={{ animationDelay: '380ms' }}>{prize.message}</p>
            {(prize.kind === 'pro' || prize.kind === 'verified') && prize.applied === 'ok' && (
              <p data-draw-mail-hint className="dr-won-h">We also email you the details. Not in your inbox? Check Spam and tap “Not spam”.</p>
            )}
            <p className="dr-won-p">{packName}</p>
          </div>
          <div className="dr-result-btns dr-rise" style={{ animationDelay: '420ms' }}>
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
