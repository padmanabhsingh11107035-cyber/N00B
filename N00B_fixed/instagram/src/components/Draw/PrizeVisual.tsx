import React from 'react';
import { Crown, BadgeCheck, Coins, Sticker } from 'lucide-react';
import { DrawPrize, RARITY, firstStickerUrl, livePictureUrl, pointsShort } from '../../utils/noobDraw';

type Looks = Pick<DrawPrize, 'kind' | 'rarity' | 'amount' | 'ref' | 'label'>;

// The picture of one prize: the real live picture / sticker where there is one, otherwise a rich emblem for points, Pro and the tick.
export const PrizeVisual: React.FC<{ prize: Looks; size?: number }> = ({ prize, size = 56 }) => {
  const color = RARITY[prize.rarity].color;
  const box: React.CSSProperties = { width: size, height: size };
  if (prize.kind === 'live_avatar' && prize.ref) {
    return (
      <div style={{ ...box, borderColor: color }} className="rounded-full overflow-hidden border-2 bg-black">
        <img src={livePictureUrl(prize.ref)} alt="" draggable={false} className="w-full h-full object-cover" />
      </div>
    );
  }
  if (prize.kind === 'stickers') {
    const src = firstStickerUrl(prize.ref);
    return (
      <div style={box} className="relative flex items-center justify-center">
        {src ? <img src={src} alt="" draggable={false} className="w-full h-full object-contain" /> : <Sticker className="w-1/2 h-1/2" style={{ color }} />}
      </div>
    );
  }
  if (prize.kind === 'verified') {
    return (
      <div style={{ ...box, background: '#2b7fff' }} className="rounded-full flex items-center justify-center">
        <BadgeCheck className="text-white" style={{ width: size * 0.62, height: size * 0.62 }} strokeWidth={2.2} />
      </div>
    );
  }
  if (prize.kind === 'pro') {
    return (
      <div style={{ ...box, background: '#6a4bd8', borderRadius: size * 0.28 }} className="flex items-center justify-center">
        <Crown style={{ width: size * 0.54, height: size * 0.54, color: '#ffe08a' }} strokeWidth={2.2} />
      </div>
    );
  }
  // points
  const short = pointsShort(prize.amount);
  return (
    <div style={{ ...box, background: '#F2B63B', boxShadow: `inset 0 0 0 ${Math.max(2, size * 0.05)}px #d99a1c` }} className="rounded-full flex flex-col items-center justify-center text-amber-950">
      {short ? <span className="font-black leading-none tracking-tight" style={{ fontSize: size * (short.length > 3 ? 0.27 : 0.33) }}>{short}</span> : <Coins style={{ width: size * 0.5, height: size * 0.5 }} />}
      <span className="font-bold uppercase leading-none opacity-70" style={{ fontSize: Math.max(6, size * 0.12), marginTop: size * 0.04 }}>pts</span>
    </div>
  );
};

export const CARD_W = 104;
export const CARD_GAP = 8;
export const CARD_H = 136;

// One card of the reel: a flat tile, the rarity shown by one thin bar along the bottom.
export const PrizeCard: React.FC<{ prize: DrawPrize }> = React.memo(({ prize }) => {
  const r = RARITY[prize.rarity];
  return (
    <div className="dr-card" style={{ width: CARD_W, height: CARD_H, ['--rc' as any]: r.color }}>
      <div className="dr-card-pic"><PrizeVisual prize={prize} size={52} /></div>
      <div className="dr-card-txt">
        <p className="dr-card-t">{prize.label}</p>
        <p className="dr-card-r">{r.label}</p>
      </div>
      <div className="dr-card-bar" />
    </div>
  );
});
