import React from 'react';

/** The icon of the Buddy Booth (the profile page's button): a tilted photo card with a little buddy in it and a twinkle. */
export const BoothIcon: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="bbicoA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#c4a1ff" /><stop offset="1" stopColor="#ff7bc2" /></linearGradient>
    </defs>
    <g transform="rotate(-8 16 17)">
      <rect x="5" y="5" width="22" height="24" rx="3" fill="#fff" />
      <rect x="7.4" y="7.4" width="17.2" height="15" rx="1.6" fill="url(#bbicoA)" />
      <circle cx="12.4" cy="11.4" r="1.9" fill="#fff" />
      <circle cx="19.6" cy="11.4" r="1.9" fill="#fff" />
      <circle cx="16" cy="16.4" r="5" fill="#fff" />
      <circle cx="14.1" cy="16" r=".95" fill="#34204a" />
      <circle cx="17.9" cy="16" r=".95" fill="#34204a" />
      <path d="M14.7 18.2q1.3 1.1 2.6 0" fill="none" stroke="#34204a" strokeWidth=".9" strokeLinecap="round" />
      <circle cx="12.9" cy="17.9" r=".9" fill="#ff8fc0" opacity=".8" />
      <circle cx="19.1" cy="17.9" r=".9" fill="#ff8fc0" opacity=".8" />
      <rect x="16.6" y="24.9" width="7.4" height="2" rx="1" fill="#34204a" opacity=".78" />
    </g>
    <path className="animate-pulse" d="M26.5 2.2l1.15 2.75 2.75 1.15-2.75 1.15-1.15 2.75-1.15-2.75-2.75-1.15 2.75-1.15z" fill="#ffe27a" />
  </svg>
);
