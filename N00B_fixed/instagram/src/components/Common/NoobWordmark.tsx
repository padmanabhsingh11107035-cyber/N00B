import React from 'react';

// The NOOB logo written straight onto the page, the way the rest of the black-and-white doodle look is: no box and no tile around it (the old one was a rounded square holding a
// picture that was itself a rounded black square). The letters are the real logo with its black background taken away (public/brand/noob-wordmark.png); they turn black in Light
// mode (see .noob-wordmark in index.css). Around them: a hand-drawn squiggle underline, sparkles, a heart and a bolt, in the same loose line as the wallpaper doodles.
export const NoobWordmark: React.FC<{ className?: string }> = ({ className = 'w-56 sm:w-64' }) => (
  <div className={`noob-wordmark-wrap relative ${className}`}>
    <img src="/brand/noob-wordmark.png" alt="NOOB" width={640} height={207} draggable={false} className="noob-wordmark block w-full h-auto select-none" />
    <svg viewBox="0 0 220 16" className="absolute left-[7%] -bottom-4 w-[86%] text-zinc-50 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9q9-9 18 0t18 0 18 0 18 0 18 0 18 0 18 0 18 0 18 0 18 0" />
    </svg>
    <svg viewBox="0 0 24 24" className="absolute -top-3 -right-4 w-5 h-5 text-zinc-50 rotate-12 pointer-events-none" fill="currentColor" aria-hidden="true"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" /></svg>
    <svg viewBox="0 0 24 24" className="absolute -bottom-6 -left-5 w-4 h-4 text-zinc-50/80 -rotate-12 pointer-events-none" fill="currentColor" aria-hidden="true"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" /></svg>
    <svg viewBox="0 0 24 24" className="absolute -top-5 left-[6%] w-4 h-4 text-zinc-50/85 -rotate-12 pointer-events-none" fill="currentColor" aria-hidden="true"><path d="M12 21s-7-4.35-9.5-8.5C.5 8.5 3 5 6.5 5c2 0 3.5 1.2 4.5 2.8C12 6.2 13.5 5 15.5 5 19 5 21.5 8.5 20 12.5 17.5 16.65 12 21 12 21z" /></svg>
    <svg viewBox="0 0 24 24" className="absolute -bottom-5 -right-4 w-4 h-4 text-zinc-50/85 rotate-[14deg] pointer-events-none" fill="currentColor" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" /></svg>
    <span className="absolute -top-2 -left-5 w-3 h-0.5 rounded-full bg-zinc-50 -rotate-45 pointer-events-none" aria-hidden="true" />
    <span className="absolute top-3 -left-6 w-2.5 h-0.5 rounded-full bg-zinc-50 rotate-12 pointer-events-none" aria-hidden="true" />
    <span className="absolute -top-1 -right-7 w-3 h-0.5 rounded-full bg-zinc-50 rotate-45 pointer-events-none" aria-hidden="true" />
  </div>
);
