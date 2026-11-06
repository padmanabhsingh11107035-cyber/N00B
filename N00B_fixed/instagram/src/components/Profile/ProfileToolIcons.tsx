import React from 'react';

/** The icon of NOOB Lenses (the profile page's button): a face with a heart-shaped lens glint and a twinkle. */
export const LensesIcon: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false">
    <rect x="5" y="5" width="22" height="22" rx="6" fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="9 5" strokeLinecap="round" />
    <circle cx="16" cy="16.5" r="6.2" fill="#fff" />
    <circle cx="13.7" cy="15.6" r="1" fill="#3a2410" />
    <circle cx="18.3" cy="15.6" r="1" fill="#3a2410" />
    <path d="M13.6 18.6q2.4 2 4.8 0" fill="none" stroke="#3a2410" strokeWidth="1" strokeLinecap="round" />
    <path d="M9.6 10.8l1.5-3.3 1.5 3.3z M19.4 10.8l1.5-3.3 1.5 3.3z" fill="#fff" />
    <path className="animate-pulse" d="M26.5 2.2l1.15 2.75 2.75 1.15-2.75 1.15-1.15 2.75-1.15-2.75-2.75-1.15 2.75-1.15z" fill="#ffe27a" />
  </svg>
);

/** The icon of Scratch Reveal (the profile page's button): a foil card with a scratched-away stripe showing a heart underneath. */
export const ScratchIcon: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="scrIcoA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f4f4f6" /><stop offset=".5" stopColor="#b9bcc6" /><stop offset="1" stopColor="#e8e9ee" /></linearGradient>
    </defs>
    <rect x="4" y="6" width="24" height="20" rx="3.5" fill="url(#scrIcoA)" />
    <path d="M7 21.5L16 9.5l7.5 0-9 12z" fill="#1a1a1f" opacity=".92" />
    <path d="M17.2 19.2c-2.4-1.6-3.6-2.7-3.6-4.1 0-1 .8-1.8 1.8-1.8.8 0 1.4.4 1.8 1 .4-.6 1-1 1.8-1 1 0 1.8.8 1.8 1.8 0 1.4-1.2 2.5-3.6 4.1z" fill="#ff6fa5" transform="translate(-1.4 .2)" />
    <path d="M6.6 11.2l2.2 1.4M8 8.6l1.6 2M25 24l-2-1.6" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" opacity=".8" />
    <path className="animate-pulse" d="M26.5 2.2l1.15 2.75 2.75 1.15-2.75 1.15-1.15 2.75-1.15-2.75-2.75-1.15 2.75-1.15z" fill="#ffe27a" />
  </svg>
);

/** The icon of Choose avatar (the profile page's button): a round character head with a little crown of sparkles. */
export const AvatarsIcon: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false">
    <circle cx="16" cy="13.2" r="6.2" fill="#fff" />
    <circle cx="13.7" cy="12.6" r="1" fill="#1e1b4b" />
    <circle cx="18.3" cy="12.6" r="1" fill="#1e1b4b" />
    <path d="M13.8 15.4q2.2 1.8 4.4 0" fill="none" stroke="#1e1b4b" strokeWidth="1" strokeLinecap="round" />
    <path d="M6.5 28c0-5.2 4.2-8.4 9.5-8.4s9.5 3.2 9.5 8.4" fill="#fff" opacity=".92" />
    <path className="animate-pulse" d="M25.6 3.4l1 2.4 2.4 1-2.4 1-1 2.4-1-2.4-2.4-1 2.4-1z" fill="#ffe27a" />
  </svg>
);
