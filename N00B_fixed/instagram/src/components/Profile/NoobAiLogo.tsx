import React, { useId } from 'react';

interface NoobAiLogoProps {
  className?: string;
  // Sleeping: closed eyes, grey colours and a "z z" (NOOB AI's computer is switched off).
  sleeping?: boolean;
}

// The NOOB AI logo: a friendly glowing AI core inside a hexagon, circled by three orbits (voice, knowledge,
// memory) with a glowing node where each orbit meets the hexagon. Same design as the assistant's own logo.svg.
export const NoobAiLogo: React.FC<NoobAiLogoProps> = ({ className = 'w-10 h-10', sleeping = false }) => {
  const id = useId().replace(/:/g, '');
  const bg = `nbbg${id}`, core = `nbcore${id}`, ring = `nbring${id}`, halo = `nbhalo${id}`, glow = `nbglow${id}`;
  return (
    <svg viewBox="0 0 128 128" className={className} aria-hidden="true" style={sleeping ? { filter: 'grayscale(0.9)' } : undefined}>
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#111a3d" />
          <stop offset=".55" stopColor="#22175e" />
          <stop offset="1" stopColor="#3a1478" />
        </linearGradient>
        <radialGradient id={core} cx="38%" cy="30%" r="75%">
          <stop offset="0" stopColor="#ecfeff" />
          <stop offset=".22" stopColor="#67e8f9" />
          <stop offset=".55" stopColor="#7c5cff" />
          <stop offset="1" stopColor="#3b1f9e" />
        </radialGradient>
        <linearGradient id={ring} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset=".5" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#f472b6" />
        </linearGradient>
        <radialGradient id={halo} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#7c5cff" stopOpacity=".55" />
          <stop offset="1" stopColor="#7c5cff" stopOpacity="0" />
        </radialGradient>
        <filter id={glow} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="128" height="128" rx="30" fill={`url(#${bg})`} />
      <circle cx="64" cy="64" r="46" fill={`url(#${halo})`} />
      <polygon points="64,14 107.3,39 107.3,89 64,114 20.7,89 20.7,39" fill="none" stroke={`url(#${ring})`} strokeWidth="1.6" strokeOpacity=".45" />
      <polygon points="64,24 98.6,44 98.6,84 64,104 29.4,84 29.4,44" fill="none" stroke="#a78bfa" strokeWidth="1" strokeOpacity=".25" strokeDasharray="3 4" />
      <g fill="none" stroke={`url(#${ring})`} strokeWidth="2.4" strokeLinecap="round" filter={`url(#${glow})`}>
        <ellipse cx="64" cy="64" rx="48" ry="16" transform="rotate(-30 64 64)" />
        <ellipse cx="64" cy="64" rx="48" ry="16" transform="rotate(30 64 64)" />
        <ellipse cx="64" cy="64" rx="48" ry="16" transform="rotate(90 64 64)" />
      </g>
      <g filter={`url(#${glow})`}>
        <circle cx="105.6" cy="40" r="4.6" fill="#22d3ee" />
        <circle cx="22.4" cy="88" r="4.6" fill="#a78bfa" />
        <circle cx="64" cy="16" r="4.6" fill="#f472b6" />
        <circle cx="105.6" cy="88" r="2.6" fill="#e0e7ff" />
        <circle cx="22.4" cy="40" r="2.6" fill="#e0e7ff" />
        <circle cx="64" cy="112" r="2.6" fill="#e0e7ff" />
      </g>
      <circle cx="64" cy="64" r="23" fill={`url(#${core})`} filter={`url(#${glow})`} />
      <circle cx="64" cy="64" r="23" fill="none" stroke="#ffffff" strokeOpacity=".35" strokeWidth="1.2" />
      {sleeping ? (
        <>
          <path d="M54 60 Q57.2 63 60.4 60 M67.6 60 Q70.8 63 74 60" fill="none" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M58 71 H70" fill="none" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" />
          <text x="86" y="40" fill="#e0e7ff" fontSize="13" fontWeight="800" fontFamily="system-ui, sans-serif">z</text>
          <text x="95" y="28" fill="#e0e7ff" fontSize="10" fontWeight="800" fontFamily="system-ui, sans-serif" opacity=".8">z</text>
        </>
      ) : (
        <>
          <rect x="54.5" y="55" width="5.4" height="9" rx="2.7" fill="#ffffff" />
          <rect x="68.1" y="55" width="5.4" height="9" rx="2.7" fill="#ffffff" />
          <path d="M55.5 70.5 Q64 77.5 72.5 70.5" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
          <path d="M96 20 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" fill="#ffffff" opacity=".9" />
        </>
      )}
    </svg>
  );
};
