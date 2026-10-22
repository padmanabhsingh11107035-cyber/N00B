import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { fetchActiveAds } from '../../services/api';
import { nextAdIndex, type ActiveAd, type AdPage } from '../../utils/ads';
import { safeExternalUrl } from '../../utils/safeUrl';

// An ad at the top of Home, Feed or Reels (NOOB Ads: a business account applies, the admin approves it and chooses the pages). It always says "Sponsored", shows the picture or
// plays the video (muted, looping) and, when the advertiser gave a web link, opens it in a new tab. When no ad is running on the page it draws nothing at all, so the page looks
// exactly as before. When several are running they take turns.
const TURN_MS = 9000;

export const AdBanner: React.FC<{ page: AdPage; compact?: boolean; className?: string }> = ({ page, compact = false, className = '' }) => {
  const [ads, setAds] = useState<ActiveAd[]>([]);
  const [index, setIndex] = useState(0);
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    void fetchActiveAds(page).then((list) => { if (alive) { setAds(list); setIndex(0); } });
    return () => { alive = false; };
  }, [page]);
  useEffect(() => {
    if (ads.length < 2) return;
    const t = window.setInterval(() => setIndex((i) => nextAdIndex(i, ads.length)), TURN_MS);
    return () => window.clearInterval(t);
  }, [ads.length]);

  const ad = ads[index % Math.max(1, ads.length)];
  // on Reels the pager under the strip listens to touches itself: the strip keeps its own, so pressing it never turns the page
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    const names = ['touchstart', 'touchmove', 'touchend', 'pointerdown', 'pointermove', 'pointerup', 'wheel'];
    names.forEach((n) => el.addEventListener(n, stop, { passive: true }));
    return () => names.forEach((n) => el.removeEventListener(n, stop));
  }, [ad?.id, compact]);
  if (!ad) return null;
  const href = safeExternalUrl(ad.link);
  const open = () => { if (href) window.open(href, '_blank', 'noopener,noreferrer'); };
  // a touch on the banner is never the start of a swipe on the page under it (the Reels pager)
  const keep = (e: React.SyntheticEvent) => e.stopPropagation();

  const media = ad.mediaType === 'video'
    ? <video key={ad.id} src={ad.mediaUrl} autoPlay muted loop playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover" />
    : <img key={ad.id} src={ad.mediaUrl} alt={ad.title || 'Ad'} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />;
  const who = ad.advertiser.displayName || ad.advertiser.username;

  if (compact) {
    return (
      <div
        ref={strip}
        className={`media-dark flex items-center gap-2.5 rounded-2xl border border-white/30 bg-black/70 backdrop-blur-md p-1.5 pr-3 ${href ? 'cursor-pointer' : ''} ${className}`}
        onClick={(e) => { keep(e); open(); }} onPointerDown={keep} onTouchStart={keep} onTouchMove={keep} onTouchEnd={keep} role={href ? 'link' : undefined} data-testid="ad-banner" data-ad-page={page} data-ad-id={ad.id}
      >
        <span className="relative w-24 h-14 shrink-0 rounded-xl overflow-hidden bg-zinc-900">{media}</span>
        <span className="min-w-0 flex-1">
          <span className="inline-block px-1.5 py-px rounded-full bg-white text-black text-[8px] font-black tracking-wider uppercase">Sponsored</span>
          <span className="block text-xs font-black text-white truncate leading-snug">{ad.title || who}</span>
          <span className="block text-[10px] text-zinc-300 truncate">{who}</span>
        </span>
        {href && <ExternalLink className="w-4 h-4 text-white/80 shrink-0" aria-hidden="true" />}
      </div>
    );
  }
  return (
    <div className={`media-dark relative rounded-3xl overflow-hidden border-2 border-white/40 bg-zinc-950 ${className}`} data-testid="ad-banner" data-ad-page={page} data-ad-id={ad.id}>
      <div className={`relative w-full aspect-[16/9] max-h-56 ${href ? 'cursor-pointer' : ''}`} onClick={open} role={href ? 'link' : undefined}>
        {media}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/85 to-transparent pointer-events-none" />
        <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full bg-white text-black text-[9px] font-black tracking-wider uppercase shadow">Sponsored</span>
        {ads.length > 1 && (
          <span className="absolute top-3 right-3 flex gap-1" aria-hidden="true">
            {ads.map((a, i) => <span key={a.id} className={`w-1.5 h-1.5 rounded-full ${i === index % ads.length ? 'bg-white' : 'bg-white/40'}`} />)}
          </span>
        )}
        <div className="absolute inset-x-3 bottom-2.5 flex items-end justify-between gap-2 pointer-events-none">
          <span className="min-w-0">
            {ad.title && <span className="block text-sm font-black text-white leading-snug line-clamp-2">{ad.title}</span>}
            <span className="block text-[11px] text-zinc-200 truncate">{who}</span>
          </span>
          {href && <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white text-black text-[10px] font-black">Open <ExternalLink className="w-3 h-3" aria-hidden="true" /></span>}
        </div>
      </div>
    </div>
  );
};
