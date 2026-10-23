import React from 'react';

// One entry of the three-line menu, dressed like the banners at the top of it (NOOB Draw, Studio, Our Team): a coloured, softly glowing card with a
// bright icon tile, a bold title and a line under it. Each entry has its own colours (the tone). It stays dark in Light mode too (force-dark), as those banners do.
type Tone = 'daily' | 'rooms' | 'song' | 'lounge' | 'shop' | 'food' | 'ai' | 'support' | 'idea' | 'videos' | 'join' | 'spark' | 'mask' | 'pick' | 'ask' | 'mood' | 'polls' | 'creations';

const TONES: Record<Tone, { border: string; gradient: string; base: string; tile: string; glow: string }> = {
  daily: { border: 'border-orange-400/45', gradient: 'linear-gradient(120deg, rgba(251,146,60,0.28), rgba(244,63,94,0.18) 60%, rgba(251,191,36,0.14))', base: '#1c1209', tile: 'from-orange-300 to-rose-400', glow: 'rgba(251,146,60,0.5)' },
  rooms: { border: 'border-rose-400/45', gradient: 'linear-gradient(120deg, rgba(244,63,94,0.28), rgba(217,70,239,0.18) 60%, rgba(251,146,60,0.14))', base: '#1d0d14', tile: 'from-rose-300 to-fuchsia-300', glow: 'rgba(244,63,94,0.5)' },
  song: { border: 'border-cyan-400/45', gradient: 'linear-gradient(120deg, rgba(34,211,238,0.26), rgba(99,102,241,0.2) 60%, rgba(232,121,249,0.14))', base: '#0b1620', tile: 'from-cyan-300 to-indigo-300', glow: 'rgba(34,211,238,0.5)' },
  lounge: { border: 'border-violet-400/45', gradient: 'linear-gradient(120deg, rgba(139,92,246,0.3), rgba(56,189,248,0.18) 60%, rgba(244,114,182,0.14))', base: '#150f26', tile: 'from-violet-300 to-sky-300', glow: 'rgba(139,92,246,0.5)' },
  shop: { border: 'border-amber-400/45', gradient: 'linear-gradient(120deg, rgba(251,191,36,0.26), rgba(249,115,22,0.2) 60%, rgba(244,63,94,0.12))', base: '#1c1406', tile: 'from-amber-300 to-orange-400', glow: 'rgba(251,191,36,0.5)' },
  food: { border: 'border-lime-400/45', gradient: 'linear-gradient(120deg, rgba(163,230,53,0.22), rgba(250,204,21,0.2) 60%, rgba(251,146,60,0.14))', base: '#141a08', tile: 'from-lime-300 to-yellow-300', glow: 'rgba(163,230,53,0.45)' },
  ai: { border: 'border-white/35', gradient: 'linear-gradient(120deg, rgba(255,255,255,0.16), rgba(148,163,184,0.12) 60%, rgba(129,140,248,0.14))', base: '#101014', tile: 'from-zinc-200 to-zinc-400', glow: 'rgba(255,255,255,0.35)' },
  support: { border: 'border-sky-400/45', gradient: 'linear-gradient(120deg, rgba(56,189,248,0.26), rgba(45,212,191,0.18) 60%, rgba(129,140,248,0.14))', base: '#0a1a20', tile: 'from-sky-300 to-teal-300', glow: 'rgba(56,189,248,0.5)' },
  videos: { border: 'border-red-400/45', gradient: 'linear-gradient(120deg, rgba(239,68,68,0.28), rgba(244,63,94,0.18) 60%, rgba(251,146,60,0.12))', base: '#1d0c0c', tile: 'from-red-300 to-rose-400', glow: 'rgba(239,68,68,0.5)' },
  join: { border: 'border-violet-300/45', gradient: 'linear-gradient(120deg, rgba(167,139,250,0.28), rgba(244,114,182,0.18) 60%, rgba(56,189,248,0.12))', base: '#17112a', tile: 'from-violet-300 to-pink-300', glow: 'rgba(167,139,250,0.5)' },
  spark: { border: 'border-orange-400/45', gradient: 'linear-gradient(120deg, rgba(249,115,22,0.3), rgba(239,68,68,0.2) 60%, rgba(251,191,36,0.14))', base: '#1d0f08', tile: 'from-orange-300 to-red-400', glow: 'rgba(249,115,22,0.5)' },
  mask: { border: 'border-slate-300/40', gradient: 'linear-gradient(120deg, rgba(148,163,184,0.22), rgba(99,102,241,0.18) 60%, rgba(232,121,249,0.12))', base: '#11121a', tile: 'from-slate-200 to-indigo-300', glow: 'rgba(148,163,184,0.45)' },
  pick: { border: 'border-pink-400/45', gradient: 'linear-gradient(120deg, rgba(244,114,182,0.28), rgba(139,92,246,0.2) 60%, rgba(251,191,36,0.12))', base: '#1d0f1f', tile: 'from-pink-300 to-violet-300', glow: 'rgba(244,114,182,0.5)' },
  ask: { border: 'border-sky-400/45', gradient: 'linear-gradient(120deg, rgba(56,189,248,0.26), rgba(99,102,241,0.2) 60%, rgba(232,121,249,0.12))', base: '#0b1424', tile: 'from-sky-300 to-indigo-300', glow: 'rgba(56,189,248,0.5)' },
  mood: { border: 'border-yellow-400/45', gradient: 'linear-gradient(120deg, rgba(250,204,21,0.26), rgba(251,146,60,0.2) 60%, rgba(244,114,182,0.12))', base: '#1a1408', tile: 'from-yellow-200 to-orange-300', glow: 'rgba(250,204,21,0.5)' },
  polls: { border: 'border-emerald-400/45', gradient: 'linear-gradient(120deg, rgba(52,211,153,0.26), rgba(45,212,191,0.18) 60%, rgba(163,230,53,0.12))', base: '#0a1a14', tile: 'from-emerald-300 to-teal-300', glow: 'rgba(52,211,153,0.5)' },
  creations: { border: 'border-fuchsia-400/45', gradient: 'linear-gradient(120deg, rgba(217,70,239,0.26), rgba(56,189,248,0.2) 60%, rgba(129,140,248,0.14))', base: '#190f24', tile: 'from-fuchsia-300 to-sky-300', glow: 'rgba(217,70,239,0.5)' },
  idea: { border: 'border-yellow-300/45', gradient: 'linear-gradient(120deg, rgba(250,204,21,0.26), rgba(251,191,36,0.16) 60%, rgba(244,114,182,0.14))', base: '#1a1606', tile: 'from-yellow-200 to-amber-300', glow: 'rgba(250,204,21,0.5)' }
};

interface MenuBannerProps {
  tone: Tone;
  icon: React.ReactNode;
  /** the icon is a picture that is already a tile of its own (NOOB AI): it is shown as it is, without the bright tile */
  bareIcon?: boolean;
  title: React.ReactNode;
  blurb?: string;
  /** a small white tag on the right (Coming Soon) */
  badge?: string;
  /** no onClick = not pressable (the Food Stall before it opens) */
  onClick?: () => void;
  onPointerDown?: () => void;
  ariaLabel?: string;
  /** the id the menu remembers when this button is pressed, to come back to it (data-menu-entry, utils/menuReturn.ts) */
  entryId?: string;
  testId?: string;
}

export const MenuBanner: React.FC<MenuBannerProps> = ({ tone, icon, bareIcon, title, blurb, badge, onClick, onPointerDown, ariaLabel, entryId, testId }) => {
  const t = TONES[tone];
  const style = { background: t.gradient, ['--menu-banner-base' as string]: t.base } as React.CSSProperties;
  const className = `menu-banner force-dark w-full p-3 mb-1.5 rounded-2xl flex items-center gap-3 text-left border ${t.border} transition-transform ${onClick ? 'cursor-pointer active:scale-[0.99]' : ''}`;
  const inner = (
    <>
      {bareIcon ? icon : (
        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${t.tile} flex items-center justify-center shrink-0 text-black`} style={{ boxShadow: `0 0 18px ${t.glow}` }}>
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <span className="text-xs font-black text-white flex flex-wrap items-center gap-x-1.5 gap-y-1 leading-snug">{title}{badge && <span className="px-1.5 py-0.5 rounded-full bg-white text-black text-[8px] font-black tracking-wider">{badge}</span>}</span>
        {blurb && <span className="text-[10px] text-zinc-300 block leading-snug mt-0.5">{blurb}</span>}
      </div>
    </>
  );
  return onClick
    ? <button type="button" onClick={onClick} onPointerDown={onPointerDown} aria-label={ariaLabel} data-menu-entry={entryId} data-testid={testId} className={className} style={style}>{inner}</button>
    : <div data-menu-entry={entryId} data-testid={testId} className={className} style={style}>{inner}</div>;
};
