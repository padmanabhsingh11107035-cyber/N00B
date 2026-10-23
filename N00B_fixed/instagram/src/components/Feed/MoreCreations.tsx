import React from 'react';
import { MORE_CREATIONS, type Creation } from '../../data/moreCreations';
import { safeExternalUrl } from '../../utils/safeUrl';

// "More of our creations", at the very bottom of Home: one round-cornered button per thing we have made (its logo and name), three to a line, three lines. Tapping one opens that
// website in a new tab. The list is in data/moreCreations.ts. While the list is empty, the three lines show empty places, so the section is there and the first links only need adding.
const PER_LINE = 3;
const MIN_LINES = 3;

export const MoreCreations: React.FC<{ items?: Creation[]; className?: string }> = ({ items = MORE_CREATIONS, className = '' }) => {
  const shown = items.filter((c) => safeExternalUrl(c.url));
  const places = Math.max(MIN_LINES * PER_LINE, Math.ceil(shown.length / PER_LINE) * PER_LINE);
  return (
    <section aria-label="More of our creations" data-testid="more-creations" className={`w-full max-w-[480px] px-3 ${className}`}>
      <h2 className="text-sm font-bold text-white text-center">More of our creations</h2>
      <div className="mt-3 grid grid-cols-3 gap-2.5">
        {Array.from({ length: places }, (_, n) => {
          const c = shown[n];
          if (!c) {
            return (
              <div key={`empty-${n}`} aria-hidden="true" data-testid="creation-empty"
                className="aspect-square rounded-2xl border border-dashed border-white/10 bg-zinc-900/30" />
            );
          }
          return (
            <a key={`${c.url}-${n}`} href={safeExternalUrl(c.url) ?? undefined} target="_blank" rel="noopener noreferrer" data-testid="creation-link" aria-label={`${c.name} (opens in a new tab)`}
              className="aspect-square rounded-2xl border border-white/10 bg-zinc-900/80 hover:bg-zinc-800/80 active:scale-95 transition-all flex flex-col items-center justify-center gap-1.5 p-2 cursor-pointer">
              <img src={`/creations/${c.logo}`} alt="" loading="lazy" draggable={false} className="w-12 h-12 object-contain rounded-xl select-none" />
              <span className="text-[11px] font-semibold text-zinc-200 leading-tight text-center line-clamp-2 break-words w-full">{c.name}</span>
            </a>
          );
        })}
      </div>
      {shown.length === 0 && <p className="mt-3 text-center text-[11px] text-zinc-500 font-medium">More coming soon</p>}
    </section>
  );
};
