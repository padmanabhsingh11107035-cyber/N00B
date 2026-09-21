import React, { useEffect, useRef, useState } from 'react';
import { StoreProductMedia } from '../../types';
import { ROTATE_MS, firstDelay, nextIndex, shouldRotate } from './carousel';

interface ProductMediaCarouselProps {
  media: StoreProductMedia[];
  className?: string;
  // small dots showing which picture is on (not clickable: the whole card is a button)
  dots?: boolean;
}

// A product's pictures (and videos) turning by themselves, one after the other, forever: after the last one it starts again from the
// first, like the game posters. They fade into each other. They stop turning while the card is out of view or the tab is in the
// background, and for people who asked their device for less movement. A product with one picture just shows it.
export const ProductMediaCarousel: React.FC<ProductMediaCarouselProps> = ({ media, className = '', dots = true }) => {
  const [active, setActive] = useState(0);
  const [offscreen, setOffscreen] = useState(false);
  const [tabHidden, setTabHidden] = useState(typeof document !== 'undefined' && document.visibilityState === 'hidden');
  const [reducedMotion] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const box = useRef<HTMLDivElement>(null);
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
  const spread = useRef(Math.random());
  const first = useRef(true);
  const count = media.length;

  // out of view / tab in the background
  useEffect(() => {
    const el = box.current;
    let io: IntersectionObserver | undefined;
    if (el && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(([entry]) => setOffscreen(!entry.isIntersecting), { threshold: 0.15 });
      io.observe(el);
    }
    const onVisibility = () => setTabHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // the turning: one timer for the next picture, started again every time the picture changes
  useEffect(() => {
    if (!shouldRotate({ count, tabHidden, offscreen, reducedMotion, holding: false })) return;
    const wait = first.current ? firstDelay(ROTATE_MS, spread.current) : ROTATE_MS;
    const timer = window.setTimeout(() => {
      first.current = false;
      setActive((i) => nextIndex(i, count));
    }, wait);
    return () => window.clearTimeout(timer);
  }, [active, count, tabHidden, offscreen, reducedMotion]);

  // a product that lost pictures (edited) never points past the end
  useEffect(() => {
    if (active >= count) setActive(0);
  }, [active, count]);

  // only the video that is showing plays
  useEffect(() => {
    videos.current.forEach((v, i) => {
      if (!v) return;
      if (i === active && !offscreen && !tabHidden) void v.play().catch(() => {});
      else v.pause();
    });
  }, [active, offscreen, tabHidden]);

  if (count === 0) return <div ref={box} className={`w-full h-full ${className}`} />;

  return (
    <div ref={box} className={`relative w-full h-full ${className}`}>
      {media.map((m, i) => {
        const on = i === active;
        const style = `absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ease-in-out ${on ? 'opacity-100' : 'opacity-0'}`;
        return m.type === 'video' ? (
          <video
            key={`${m.url}-${i}`}
            ref={(el) => { videos.current[i] = el; }}
            src={m.url}
            className={style}
            muted
            loop
            playsInline
            preload="metadata"
            aria-hidden={!on}
          />
        ) : (
          <img key={`${m.url}-${i}`} src={m.url} alt="" className={style} loading={i === 0 ? 'eager' : 'lazy'} decoding="async" aria-hidden={!on} draggable={false} />
        );
      })}
      {dots && count > 1 && (
        <div className="absolute bottom-1.5 inset-x-0 flex items-center justify-center gap-1 pointer-events-none" aria-hidden="true">
          {media.map((_, i) => (
            <span key={i} className={`rounded-full transition-all duration-300 ${i === active ? 'w-3 h-1.5 bg-[#00FF66]' : 'w-1.5 h-1.5 bg-white/60'}`} />
          ))}
        </div>
      )}
    </div>
  );
};
