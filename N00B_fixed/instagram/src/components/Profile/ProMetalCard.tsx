import React from 'react';
import { TIER_LOOK, TIER_NAMES } from './proCardLook';

// A Pro plan's card: a metal card the size of a bank card. Laid out in rows (NOOB and the chip on top, then the plan, then the price or the owner), so no two texts ever share a line and overlap.
export interface ProMetalCardProps {
  tier: string;
  /** the plan's name, if it is not the usual one */
  name?: string;
  /** a line under the plan's name: the price, or when it renews */
  detail?: React.ReactNode;
  /** whose card it is (shown in capitals, like the name on a bank card) */
  owner?: string;
  /** small tag at the top right, e.g. YOUR PLAN */
  badge?: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  id?: string;
  testId?: string;
}

const GRAIN = 'repeating-linear-gradient(90deg, rgba(255,255,255,0.07) 0px, rgba(255,255,255,0.07) 1px, rgba(0,0,0,0.05) 1px, rgba(0,0,0,0.05) 2px)';
const GLOSS = 'radial-gradient(120% 75% at 10% -12%, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 55%), linear-gradient(112deg, rgba(255,255,255,0) 34%, rgba(255,255,255,0.62) 44%, rgba(255,255,255,0.1) 49%, rgba(255,255,255,0) 56%), linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.3) 100%)';

export const ProMetalCard: React.FC<ProMetalCardProps> = ({ tier, name, detail, owner, badge, className = '', style, onClick, id, testId }) => {
  const look = TIER_LOOK[tier] ?? TIER_LOOK.pro;
  return (
    <div
      id={id}
      data-testid={testId}
      onClick={onClick}
      className={`relative overflow-clip rounded-[18px] aspect-[1.586] p-[18px] flex flex-col justify-between gap-2 ${className}`}
      style={{
        background: look.bg, color: look.ink, textShadow: look.shade,
        boxShadow: `0 24px 40px -18px ${look.glow}, 0 8px 14px -8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.8), inset 0 -2px 4px rgba(0,0,0,0.25), inset 0 0 0 1px rgba(255,255,255,0.2)`,
        ...style
      }}
    >
      <span aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ background: GRAIN, mixBlendMode: 'overlay' }} />
      <span aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ background: GLOSS }} />
      <div className="relative flex items-start justify-between gap-2">
        <span className="shrink-0 text-[15px] font-black tracking-[0.3em] leading-none">NOOB</span>
        {badge && <span className="shrink-0 whitespace-nowrap text-[8px] font-extrabold tracking-[0.12em] px-2 py-1 rounded-full bg-black/70 text-white" style={{ textShadow: 'none' }}>{badge}</span>}
      </div>
      <div className="relative flex items-center gap-2.5" aria-hidden="true">
        <span className="w-10 h-7 rounded-[6px] shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_1px_2px_rgba(0,0,0,0.35)]" style={{ background: `repeating-linear-gradient(90deg, rgba(0,0,0,0.2) 0 1px, transparent 1px 7px), ${look.chip}` }} />
        <svg viewBox="0 0 24 24" className="w-5 h-5 opacity-60" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 7.5a6.5 6.5 0 0 1 0 9" /><path d="M12 5a10.5 10.5 0 0 1 0 14" /><path d="M16 2.5a14 14 0 0 1 0 19" /></svg>
      </div>
      <div className="relative min-w-0">
        <p className="text-[8.5px] font-bold tracking-[0.3em]" style={{ color: look.sub }}>NOOB PRO</p>
        <p className="mt-0.5 text-[19px] font-bold uppercase tracking-[0.16em] leading-tight truncate">{name ?? TIER_NAMES[tier] ?? tier}</p>
        {owner && <p className="mt-1 text-[11.5px] font-semibold uppercase tracking-[0.12em] truncate" style={{ color: look.sub }}>{owner}</p>}
        {detail && <div className="mt-1 text-[11px] font-semibold tabular-nums break-words" style={{ color: look.sub }}>{detail}</div>}
      </div>
    </div>
  );
};
