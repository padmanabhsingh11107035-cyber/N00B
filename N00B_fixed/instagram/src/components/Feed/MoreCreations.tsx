import React from 'react';
import { MORE_CREATIONS, type Creation } from '../../data/moreCreations';
import { safeExternalUrl } from '../../utils/safeUrl';

// "More of our creations", on the Home page above the posts (the feed never ends, so a block under it could not be found). It is three lines: the heading, one row of round-cornered
// buttons (the name of each thing we have made, and its logo when it has one; a row that is too wide for the phone goes on to a second line) and a note that these websites are not
// functional, people can only visit and explore. Tapping a button opens that website in a new tab. The list is in data/moreCreations.ts; with no link in it, nothing is drawn.
export const CREATIONS_NOTE = 'Note: these websites are not functional. You can only visit and explore them.';

export const MoreCreations: React.FC<{ items?: Creation[]; className?: string }> = ({ items = MORE_CREATIONS, className = '' }) => {
  const shown = items.filter((c) => safeExternalUrl(c.url));
  if (shown.length === 0) return null;
  return (
    <section aria-label="More of our creations" data-testid="more-creations" className={`w-full max-w-[480px] px-3 ${className}`}>
      <h2 className="text-xs font-bold text-white text-center">More of our creations</h2>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {shown.map((c, n) => (
          <a key={`${c.url}-${n}`} href={safeExternalUrl(c.url) ?? undefined} target="_blank" rel="noopener noreferrer" data-testid="creation-link" aria-label={`${c.name} (opens in a new tab)`}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-zinc-900/80 hover:bg-zinc-800/80 active:scale-95 transition-all px-3 py-1.5 text-[11px] font-semibold text-white whitespace-nowrap cursor-pointer">
            {c.logo && <img src={`/creations/${c.logo}`} alt="" loading="lazy" draggable={false} className="w-4 h-4 object-contain rounded select-none" />}
            {c.name}
          </a>
        ))}
      </div>
      <p data-testid="creations-note" className="mt-2 text-center text-[10px] text-zinc-500 font-medium leading-snug">{CREATIONS_NOTE}</p>
    </section>
  );
};
