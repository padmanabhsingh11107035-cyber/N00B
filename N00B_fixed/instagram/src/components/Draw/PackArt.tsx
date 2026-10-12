import React from 'react';

// The artwork of the five NOOB Draw spins: a glossy foil pack with its own colours and emblem. Pure SVG, so it stays sharp at any size
// and needs no image files.
export interface PackLook { name: string; stops: [string, string, string]; accent: string; glow: string }

const LOOKS: Record<string, PackLook> = {
  rookie:  { name: 'Rookie',  stops: ['#5eead4', '#059669', '#052e2b'], accent: '#34d399', glow: 'rgba(52,211,153,0.55)' },
  neon:    { name: 'Neon',    stops: ['#67e8f9', '#4f46e5', '#1e1b4b'], accent: '#22d3ee', glow: 'rgba(34,211,238,0.55)' },
  royal:   { name: 'Royal',   stops: ['#d8b4fe', '#7c3aed', '#2e1065'], accent: '#a78bfa', glow: 'rgba(167,139,250,0.6)' },
  inferno: { name: 'Inferno', stops: ['#fdba74', '#ea580c', '#7f1d1d'], accent: '#fb923c', glow: 'rgba(251,146,60,0.6)' },
  galaxy:  { name: 'Galaxy',  stops: ['#fde68a', '#ec4899', '#3b0764'], accent: '#f0abfc', glow: 'rgba(240,171,252,0.6)' }
};
const FALLBACK: PackLook = { name: 'Spin', stops: ['#c7d2fe', '#6366f1', '#1e1b4b'], accent: '#9e9cff', glow: 'rgba(158,156,255,0.55)' };
export const packLook = (id: string): PackLook => LOOKS[id] || FALLBACK;

const Emblem: React.FC<{ id: string; uid: string }> = ({ id, uid }) => {
  switch (id) {
    case 'rookie':
      return (
        <g>
          <circle cx="-26" cy="14" r="17" fill={`url(#${uid}-gold)`} stroke="#92400e" strokeWidth="2" opacity="0.85" />
          <circle cx="27" cy="18" r="14" fill={`url(#${uid}-gold)`} stroke="#92400e" strokeWidth="2" opacity="0.8" />
          <circle cx="0" cy="0" r="33" fill={`url(#${uid}-gold)`} stroke="#92400e" strokeWidth="3" />
          <circle cx="0" cy="0" r="25" fill="none" stroke="#b45309" strokeWidth="2" strokeDasharray="4 3" />
          <path d="M-11 11 V-11 L11 11 V-11" fill="none" stroke="#78350f" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    case 'neon':
      return (
        <g>
          <circle r="38" fill="none" stroke="#22d3ee" strokeOpacity="0.45" strokeWidth="2" strokeDasharray="3 6" />
          <circle r="28" fill="#0b1230" fillOpacity="0.55" stroke="#67e8f9" strokeOpacity="0.7" strokeWidth="2" />
          <path d="M6 -34 L-16 4 H-2 L-8 34 L18 -8 H3 Z" fill="#0b1230" stroke="#a5f3fc" strokeWidth="4.5" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 6px #22d3ee)' }} />
        </g>
      );
    case 'royal':
      return (
        <g style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.35))' }}>
          <path d="M-36 24 L-42 -18 L-18 4 L0 -30 L18 4 L42 -18 L36 24 Z" fill={`url(#${uid}-gold)`} stroke="#92400e" strokeWidth="3" strokeLinejoin="round" />
          <rect x="-36" y="24" width="72" height="11" rx="4" fill="#f59e0b" stroke="#92400e" strokeWidth="3" />
          <circle cx="0" cy="10" r="6" fill="#f43f5e" /><circle cx="-22" cy="16" r="4" fill="#22d3ee" /><circle cx="22" cy="16" r="4" fill="#22d3ee" />
        </g>
      );
    case 'inferno':
      return (
        <g style={{ filter: 'drop-shadow(0 0 8px rgba(255,120,30,0.7))' }}>
          <path d="M0 -40 C6 -18 34 -10 34 16 C34 34 18 42 0 42 C-18 42 -34 34 -34 16 C-34 2 -22 -6 -20 -22 C-12 -14 -8 -6 -8 2 C-2 -8 2 -22 0 -40 Z" fill={`url(#${uid}-fire)`} stroke="#7f1d1d" strokeWidth="3" strokeLinejoin="round" />
          <path d="M0 6 C6 16 16 20 16 30 C16 38 8 42 0 42 C-8 42 -16 38 -16 30 C-16 20 -6 16 0 6 Z" fill="#fff3b0" opacity="0.95" />
        </g>
      );
    case 'galaxy':
      return (
        <g>
          <ellipse rx="46" ry="14" fill="none" stroke="#fff" strokeOpacity="0.6" strokeWidth="2.5" transform="rotate(-24)" />
          <path d="M0 -34 L10 -10 L36 -8 L16 8 L22 34 L0 20 L-22 34 L-16 8 L-36 -8 L-10 -10 Z" fill={`url(#${uid}-gold)`} stroke="#92400e" strokeWidth="3" strokeLinejoin="round" />
          <ellipse rx="46" ry="14" fill="none" stroke="#fff" strokeOpacity="0.9" strokeWidth="2.5" transform="rotate(-24)" strokeDasharray="42 200" strokeDashoffset="-60" />
          <circle cx="40" cy="-22" r="4" fill="#fff" /><circle cx="-42" cy="26" r="3" fill="#fff" opacity="0.8" />
        </g>
      );
    default:
      return <circle r="28" fill="#fff" opacity="0.85" />;
  }
};

export const PackArt: React.FC<{ id: string; className?: string; label?: string }> = ({ id, className, label }) => {
  const look = packLook(id);
  const uid = `pk-${id}`;
  const title = (label || look.name).toUpperCase();
  return (
    <svg viewBox="0 0 160 212" className={className} role="img" aria-label={`${look.name} spin`}>
      <defs>
        <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor={look.stops[0]} /><stop offset="0.5" stopColor={look.stops[1]} /><stop offset="1" stopColor={look.stops[2]} />
        </linearGradient>
        <radialGradient id={`${uid}-glow`} cx="50%" cy="44%" r="55%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.5" /><stop offset="0.45" stopColor={look.accent} stopOpacity="0.28" /><stop offset="1" stopColor={look.accent} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}-gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff3a8" /><stop offset="0.55" stopColor="#ffc21f" /><stop offset="1" stopColor="#d97706" />
        </linearGradient>
        <linearGradient id={`${uid}-fire`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ef4444" /><stop offset="0.6" stopColor="#fb923c" /><stop offset="1" stopColor="#fde047" />
        </linearGradient>
        <pattern id={`${uid}-crimp`} width="5" height="14" patternUnits="userSpaceOnUse"><rect width="2" height="14" fill="#fff" opacity="0.22" /></pattern>
        <clipPath id={`${uid}-clip`}><rect x="10" y="8" width="140" height="196" rx="16" /></clipPath>
      </defs>
      <ellipse cx="80" cy="208" rx="52" ry="4.5" fill={look.accent} opacity="0.35" />
      <g clipPath={`url(#${uid}-clip)`}>
        <rect x="10" y="8" width="140" height="196" fill={`url(#${uid}-body)`} />
        <rect x="10" y="8" width="140" height="196" fill={`url(#${uid}-glow)`} />
        <rect x="10" y="8" width="140" height="14" fill={`url(#${uid}-crimp)`} />
        <rect x="10" y="190" width="140" height="14" fill={`url(#${uid}-crimp)`} />
        <path d="M-10 64 L170 -6 L170 16 L-10 86 Z" fill="#fff" opacity="0.09" />
        <path d="M-10 196 L170 126 L170 148 L-10 218 Z" fill="#fff" opacity="0.07" />
        <g transform="translate(80 96)"><Emblem id={id} uid={uid} /></g>
        <rect x="24" y="150" width="112" height="30" rx="9" fill="#000" opacity="0.4" />
        <text x="80" y="171" textAnchor="middle" fontSize={title.length > 8 ? 13 : 15} fontWeight={900} letterSpacing="2.2" fill="#fff" fontStyle="italic">{title}</text>
        <g fill="#fff">
          <path className="draw-twinkle" d="M30 40 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2z" />
          <path className="draw-twinkle" style={{ animationDelay: '0.8s' }} d="M126 54 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" />
          <path className="draw-twinkle" style={{ animationDelay: '1.5s' }} d="M120 128 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5z" />
        </g>
      </g>
      <rect x="10" y="8" width="140" height="196" rx="16" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" />
      <rect x="15" y="13" width="130" height="186" rx="12" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
    </svg>
  );
};
