import React, { useEffect, useRef, useState } from 'react';

// A <video> used as a thumbnail (its first frame stands in for a picture). Every one of those starts downloading the beginning of
// its file as soon as it exists on the page, so a grid of 30 videos used to fetch 30 files before anyone looked at most of them.
// This only creates the <video> once its spot is close to the screen, which is what keeps that traffic (and the phone's data) down.
type LazyVideoProps = React.VideoHTMLAttributes<HTMLVideoElement> & { rootMargin?: string };

export const LazyVideo: React.FC<LazyVideoProps> = ({ rootMargin = '300px', className, ...props }) => {
  const holder = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (near) return;
    const el = holder.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); }
    }, { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [near, rootMargin]);

  if (!near) return <div ref={holder} className={className} aria-hidden="true" />;
  return <video className={className} preload="metadata" {...props} />;
};
