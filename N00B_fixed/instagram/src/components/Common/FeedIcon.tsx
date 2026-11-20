import React from 'react';

// The Feed page's icon (long videos and live streams): two stacked cards with a video card in front, a play triangle in it. Drawn with the same line weight as the other bottom-bar icons.
export const FeedIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 3.6h10M5 7h14" />
    <rect x="3" y="10" width="18" height="11" rx="3.2" />
    <path d="M10.4 13.2v4.6a.6.6 0 0 0 .9.5l3.9-2.3a.6.6 0 0 0 0-1l-3.9-2.3a.6.6 0 0 0-.9.5Z" fill="currentColor" stroke="none" />
  </svg>
);
