import React from 'react';

// The log-in page's guide: a boy in a hat. While the e-mail is typed his eyes follow the text; the moment the password is touched
// he pulls the hat down over his eyes (and a hand holds it), so he cannot see what is typed.
interface HatBoyProps {
  /** the password field is focused or being typed in */
  covering: boolean;
  /** 0..1: how far the e-mail text has gone, moves the eyes left to right */
  look: number;
}

export const HatBoy: React.FC<HatBoyProps> = ({ covering, look }) => {
  const dx = (Math.max(0, Math.min(1, look)) - 0.5) * 7;
  const hat = covering ? 'translateY(30px) rotate(-2deg)' : 'translateY(0) rotate(0deg)';
  return (
    <svg viewBox="0 0 320 250" role="img" aria-label={covering ? 'The boy pulls his hat over his eyes' : 'A boy in a hat watching you type'} data-testid="hat-boy" data-covering={covering ? '1' : '0'} className="w-full h-full block">
      <defs>
        <linearGradient id="hb-band" x1="0" x2="1"><stop offset="0" stopColor="#b9772f" /><stop offset="1" stopColor="#e0a35a" /></linearGradient>
        <linearGradient id="hb-hat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2b2b2b" /><stop offset="1" stopColor="#0f0f0f" /></linearGradient>
        <linearGradient id="hb-skin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f7cf9e" /><stop offset="1" stopColor="#efb985" /></linearGradient>
      </defs>
      {/* shirt, waistcoat, collar */}
      <path d="M62 250 C72 200 110 182 160 182 C210 182 248 200 258 250 Z" fill="#f4f4f1" />
      <path d="M118 250 L132 186 L160 232 L188 186 L202 250 Z" fill="#1b1b1b" />
      <path d="M132 186 L160 232 L148 190 Z" fill="#e6e6e1" />
      <path d="M188 186 L160 232 L172 190 Z" fill="#e6e6e1" />
      {/* neck + head */}
      <rect x="146" y="158" width="28" height="32" rx="10" fill="#e8ae78" />
      <ellipse cx="160" cy="120" rx="52" ry="58" fill="url(#hb-skin)" />
      <ellipse cx="108" cy="124" rx="7" ry="12" fill="#efb985" />
      <ellipse cx="212" cy="124" rx="7" ry="12" fill="#efb985" />
      {/* hair at the sides */}
      <path d="M110 108 C108 84 128 70 160 70 C192 70 212 84 210 108 C204 96 190 90 160 90 C130 90 116 96 110 108 Z" fill="#241a14" />
      {/* eyes */}
      <g>
        <ellipse cx="139" cy="118" rx="9" ry="10.5" fill="#fff" />
        <ellipse cx="181" cy="118" rx="9" ry="10.5" fill="#fff" />
        <circle cx={139 + dx} cy="119" r="4.6" fill="#1a1a1a" style={{ transition: 'cx .18s ease-out' }} />
        <circle cx={181 + dx} cy="119" r="4.6" fill="#1a1a1a" style={{ transition: 'cx .18s ease-out' }} />
        <circle cx={140.5 + dx} cy="117" r="1.4" fill="#fff" style={{ transition: 'cx .18s ease-out' }} />
        <circle cx={182.5 + dx} cy="117" r="1.4" fill="#fff" style={{ transition: 'cx .18s ease-out' }} />
      </g>
      <ellipse cx="128" cy="140" rx="8" ry="5" fill="#f0956f" opacity=".55" />
      <ellipse cx="192" cy="140" rx="8" ry="5" fill="#f0956f" opacity=".55" />
      {/* nose + mouth */}
      <path d="M160 126 C156 136 156 142 162 143" stroke="#d99b68" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M146 158 C154 166 168 166 176 158" stroke="#a6603c" strokeWidth="3.2" fill="none" strokeLinecap="round" style={{ transition: 'opacity .2s', opacity: covering ? 0.55 : 1 }} />
      {/* the hat (slides down over the eyes) */}
      <g style={{ transform: hat, transformOrigin: '160px 90px', transition: 'transform .42s cubic-bezier(.3,1.3,.5,1)' }}>
        <path d="M112 86 C112 40 132 22 160 22 C188 22 208 40 208 86 Z" fill="url(#hb-hat)" />
        <path d="M112 74 L208 74 L208 90 L112 90 Z" fill="url(#hb-band)" />
        <ellipse cx="160" cy="92" rx="104" ry="17" fill="#0c0c0c" />
        <ellipse cx="160" cy="88" rx="104" ry="15" fill="#171717" />
        <path d="M112 74 C140 80 180 80 208 74" stroke="#00000055" strokeWidth="2" fill="none" />
      </g>
      {/* the hand that holds the brim down */}
      <g style={{ transform: covering ? 'translate(0,0)' : 'translate(34px,70px)', opacity: covering ? 1 : 0, transition: 'transform .4s ease-out, opacity .25s' }}>
        <path d="M205 168 C196 150 196 130 206 122 C214 118 222 124 222 134 C226 144 224 160 222 176 Z" fill="#efb985" />
        <path d="M200 132 C204 124 214 122 220 128" stroke="#d99b68" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M212 176 L270 250 L226 250 L196 188 Z" fill="#f4f4f1" />
      </g>
    </svg>
  );
};
