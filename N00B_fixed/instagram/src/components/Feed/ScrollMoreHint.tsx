import React, { useCallback, useEffect, useRef, useState } from 'react';

// "There is more below" for a list that scrolls (the three-line menu): `more` is true while the list is cut off at the bottom, and goes false once its end is in view
// (or when everything fits). It is re-measured when the list scrolls, when the window changes size, and when buttons are added or removed (e.g. a page that is switched on).
export function useScrollMore(active: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    if (!active) { setMore(false); return; }
    const el = ref.current;
    if (!el) return;
    let soonTimer = 0;
    const measure = () => setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 24);
    const soon = () => { window.clearTimeout(soonTimer); soonTimer = window.setTimeout(measure, 30); };
    soon();
    const late = window.setTimeout(measure, 350); // after the panel has slid in
    el.addEventListener('scroll', soon, { passive: true });
    window.addEventListener('resize', soon);
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(soon) : null;
    mo?.observe(el, { childList: true, subtree: true });
    return () => {
      window.clearTimeout(soonTimer);
      window.clearTimeout(late);
      el.removeEventListener('scroll', soon);
      window.removeEventListener('resize', soon);
      mo?.disconnect();
    };
  }, [active]);

  const scrollDown = useCallback(() => {
    const el = ref.current;
    if (el) el.scrollBy({ top: Math.max(160, Math.round(el.clientHeight * 0.7)), behavior: 'smooth' });
  }, []);

  return { ref, more, scrollDown };
}

// A little doodle (a smiley and an arrow that bobs downwards) in a pill, on a soft fade at the bottom edge of the list. Pressing it scrolls the list down.
export const ScrollMoreHint: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <div className="scroll-more-hint pointer-events-none absolute inset-x-0 bottom-0 pt-12 pb-2 flex justify-center bg-gradient-to-t from-zinc-950 via-zinc-950/85 to-transparent">
    <button
      type="button"
      onClick={onClick}
      aria-label="Scroll down for more features"
      className="pointer-events-auto flex items-center gap-1.5 pl-2 pr-3 py-1.5 rounded-full bg-noob text-black text-[11px] font-black shadow-lg cursor-pointer active:scale-95 transition-transform"
    >
      <svg viewBox="0 0 20 20" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="10" cy="10" r="8" />
        <path d="M7 8.2v.6M13 8.2v.6" />
        <path d="M6.6 12c1 1.6 2.1 2.2 3.4 2.2s2.4-.6 3.4-2.2" />
      </svg>
      <span>Scroll for more</span>
      <svg viewBox="0 0 16 16" className="scroll-more-arrow w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 2.2c-.7 2.2.6 4.2 0 7" />
        <path d="M4 7.6 8 12l4-4.4" />
      </svg>
    </button>
  </div>
);
