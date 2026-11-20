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
