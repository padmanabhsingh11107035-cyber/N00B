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
      <div style={{ ...box, boxShadow: `0 0 ${size / 3}px ${color}66`, borderColor: color }} className="rounded-full overflow-hidden border-2 bg-black">
        <img src={livePictureUrl(prize.ref)} alt="" draggable={false} className="w-full h-full object-cover" />
      </div>
    );
  }
  if (prize.kind === 'stickers') {
    const src = firstStickerUrl(prize.ref);
    return (
      <div style={box} className="relative flex items-center justify-center">
        {src ? <img src={src} alt="" draggable={false} className="w-full h-full object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.45)]" /> : <Sticker className="w-1/2 h-1/2" style={{ color }} />}
      </div>
    );
  }
  if (prize.kind === 'verified') {
    return (
      <div style={{ ...box, boxShadow: `0 0 ${size / 2}px rgba(255,255,255,0.55)` }} className="rounded-full bg-gradient-to-br from-sky-300 to-blue-600 flex items-center justify-center border-2 border-white/70">
        <BadgeCheck className="text-white" style={{ width: size * 0.62, height: size * 0.62 }} strokeWidth={2.4} />
      </div>
    );
  }
  if (prize.kind === 'pro') {
    return (
      <div style={{ ...box, boxShadow: `0 0 ${size / 2.4}px rgba(167,139,250,0.55)` }} className="rounded-2xl rotate-3 bg-gradient-to-br from-violet-300 via-violet-500 to-fuchsia-700 flex items-center justify-center border-2 border-white/60">
        <Crown className="text-amber-200 drop-shadow" style={{ width: size * 0.56, height: size * 0.56 }} strokeWidth={2.4} />
      </div>
    );
  }
  // points
  const short = pointsShort(prize.amount);
  return (
    <div style={{ ...box, boxShadow: `0 0 ${size / 2.4}px rgba(251,191,36,0.5)` }} className="rounded-full bg-gradient-to-br from-yellow-200 via-amber-400 to-amber-600 flex flex-col items-center justify-center border-2 border-amber-100/80 text-amber-950">
      {short ? <span className="font-black leading-none tracking-tight" style={{ fontSize: size * (short.length > 3 ? 0.27 : 0.33) }}>{short}</span> : <Coins style={{ width: size * 0.5, height: size * 0.5 }} />}
      <span className="font-bold uppercase leading-none opacity-70" style={{ fontSize: Math.max(6, size * 0.12), marginTop: size * 0.04 }}>pts</span>
    </div>
  );
};

export const CARD_W = 104;
export const CARD_GAP = 8;

// One card of the reel.
export const PrizeCard: React.FC<{ prize: DrawPrize }> = React.memo(({ prize }) => {
  const r = RARITY[prize.rarity];
  return (
    <div
      className="shrink-0 rounded-2xl relative overflow-hidden border"
      style={{ width: CARD_W, height: 138, borderColor: `${r.color}66`, background: `linear-gradient(180deg, ${r.soft} 0%, rgba(14,14,22,0.96) 72%)` }}
    >
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: r.color, boxShadow: `0 0 12px ${r.color}` }} />
      <div className="absolute inset-0 opacity-70" style={{ background: `radial-gradient(70% 45% at 50% 38%, ${r.color}33, transparent 75%)` }} />
      <div className="relative h-[84px] flex items-center justify-center pt-2"><PrizeVisual prize={prize} size={54} /></div>
      <div className="relative px-1.5 text-center">
        <p className="text-[10px] font-extrabold leading-tight text-white line-clamp-2 min-h-[24px]">{prize.label}</p>
        <p className="text-[8px] font-black uppercase tracking-[0.14em] mt-0.5" style={{ color: r.color }}>{r.label}</p>
      </div>
    </div>
  );
});
