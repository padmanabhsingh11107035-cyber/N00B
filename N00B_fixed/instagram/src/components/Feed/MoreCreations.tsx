import React from 'react';
import { MORE_CREATIONS, type Creation } from '../../data/moreCreations';
import { safeExternalUrl } from '../../utils/safeUrl';

// "More of our creations", at the very bottom of Home: one round-cornered button per thing we have made (its name, and its logo when it has one), three to a line. Tapping one opens that
// website in a new tab. Under them a note says that these websites are not functional: people can only visit and explore. The list is in data/moreCreations.ts. While the list is empty,
// three lines of empty places show, so the section is there and the first links only need adding.
const PER_LINE = 3;
const MIN_LINES = 3;
export const CREATIONS_NOTE = 'Note: these websites are not functional. You can only visit and explore them.';

export const MoreCreations: React.FC<{ items?: Creation[]; className?: string }> = ({ items = MORE_CREATIONS, className = '' }) => {
  const shown = items.filter((c) => safeExternalUrl(c.url));
  return (
    <section aria-label="More of our creations" data-testid="more-creations" className={`w-full max-w-[480px] px-3 ${className}`}>
      <h2 className="text-sm font-bold text-white text-center">More of our creations</h2>
      {shown.length === 0 ? (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2.5">
            {Array.from({ length: MIN_LINES * PER_LINE }, (_, n) => (
              <div key={n} aria-hidden="true" data-testid="creation-empty" className="aspect-square rounded-2xl border border-dashed border-white/10 bg-zinc-900/30" />
            ))}
          </div>
          <p className="mt-3 text-center text-[11px] text-zinc-500 font-medium">More coming soon</p>
        </>
      ) : (
        <>
          {/* the buttons are as wide as a third of the line; a last line with fewer is centred */}
          <div className="mt-3 flex flex-wrap justify-center gap-2.5">
            {shown.map((c, n) => (
              <a key={`${c.url}-${n}`} href={safeExternalUrl(c.url) ?? undefined} target="_blank" rel="noopener noreferrer" data-testid="creation-link" aria-label={`${c.name} (opens in a new tab)`}
                className="w-[calc((100%-1.25rem)/3)] aspect-square rounded-2xl border border-white/10 bg-zinc-900/80 hover:bg-zinc-800/80 active:scale-95 transition-all flex flex-col items-center justify-center gap-1.5 p-2 cursor-pointer">
                {c.logo && <img src={`/creations/${c.logo}`} alt="" loading="lazy" draggable={false} className="w-12 h-12 object-contain rounded-xl select-none" />}
                <span className={`font-semibold text-zinc-100 leading-tight text-center break-words w-full ${c.logo ? 'text-[11px] line-clamp-2' : 'text-sm line-clamp-3'}`}>{c.name}</span>
              </a>
            ))}
          </div>
          <p data-testid="creations-note" className="mt-3 text-center text-[11px] text-zinc-500 font-medium leading-snug">{CREATIONS_NOTE}</p>
        </>
      )}
    </section>
  );
};
