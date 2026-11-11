import React from 'react';

// The mark of each NOOB Draw pack: a flat graphite tile with a single gold line emblem. Pure SVG (styled by draw.css), so it stays sharp at
// any size and needs no image files. The pack colours are gone on purpose: gold is the page's only accent, colour belongs to prizes.
export interface PackLook { name: string; stops: [string, string, string]; accent: string; glow: string }

const GOLD = '#F2B63B';
const LOOKS: Record<string, PackLook> = {
  rookie:  { name: 'Rookie',  stops: ['#2a2a2e', '#1b1b1e', '#141416'], accent: GOLD, glow: 'transparent' },
  neon:    { name: 'Neon',    stops: ['#2a2a2e', '#1b1b1e', '#141416'], accent: GOLD, glow: 'transparent' },
  royal:   { name: 'Royal',   stops: ['#2a2a2e', '#1b1b1e', '#141416'], accent: GOLD, glow: 'transparent' },
  inferno: { name: 'Inferno', stops: ['#2a2a2e', '#1b1b1e', '#141416'], accent: GOLD, glow: 'transparent' },
  galaxy:  { name: 'Galaxy',  stops: ['#2a2a2e', '#1b1b1e', '#141416'], accent: GOLD, glow: 'transparent' }
};
const FALLBACK: PackLook = { name: 'Spin', stops: ['#2a2a2e', '#1b1b1e', '#141416'], accent: GOLD, glow: 'transparent' };
export const packLook = (id: string): PackLook => LOOKS[id] || FALLBACK;

const Emblem: React.FC<{ id: string }> = ({ id }) => {
  switch (id) {
    case 'rookie':
      return (
        <g className="dr-pa-ln">
          <circle r="30" />
          <path d="M-11 11 V-11 L11 11 V-11" />
        </g>
      );
    case 'neon':
      return <path className="dr-pa-ln" d="M8 -34 L-16 4 H-2 L-8 34 L18 -8 H3 Z" />;
    case 'royal':
      return (
        <g className="dr-pa-ln">
          <path d="M-34 22 L-38 -16 L-16 4 L0 -28 L16 4 L38 -16 L34 22 Z" />
          <path d="M-34 34 H34" />
        </g>
      );
    case 'inferno':
      return <path className="dr-pa-ln" d="M0 -40 C6 -18 34 -10 34 16 C34 34 18 42 0 42 C-18 42 -34 34 -34 16 C-34 2 -22 -6 -20 -22 C-12 -14 -8 -6 -8 2 C-2 -8 2 -22 0 -40 Z" />;
    case 'galaxy':
      return <path className="dr-pa-ln" d="M0 -36 L10 -11 L36 -9 L16 8 L22 34 L0 20 L-22 34 L-16 8 L-36 -9 L-10 -11 Z" />;
    default:
      return <circle className="dr-pa-ln" r="28" />;
  }
};

export const PackArt: React.FC<{ id: string; className?: string; label?: string }> = ({ id, className, label }) => {
  const look = packLook(id);
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label={`${label || look.name} spin`}>
      <rect x="0.5" y="0.5" width="63" height="63" rx="14" className="dr-pa-bg" />
      <g transform="translate(32 32) scale(0.5)"><Emblem id={id} /></g>
    </svg>
  );
};
