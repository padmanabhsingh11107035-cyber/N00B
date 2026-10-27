import React, { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

// A round "back to the top" button for laptops and big screens: it appears after the page has been scrolled down a little (Home, Explore, Reels lists...), so a long page never needs
// a long scroll back. Phones have the bottom bar and pull-to-refresh, so it is not shown there.
export const BackToTop: React.FC = () => {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = () => setShow(window.scrollY > 500);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  if (!show) return null;
  return (
    <button
      type="button"
      aria-label="Back to the top"
      data-testid="back-to-top"
      onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}
      className="hidden lg:flex fixed bottom-8 right-28 z-40 w-12 h-12 rounded-full bg-white text-black items-center justify-center shadow-lg shadow-black/50 cursor-pointer hover:scale-105 active:scale-95 transition-transform"
    >
      <ArrowUp className="w-5 h-5" />
    </button>
  );
};
