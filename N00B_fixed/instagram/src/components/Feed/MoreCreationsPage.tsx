import React, { useEffect } from 'react';
import { ChevronLeft, ExternalLink, Layers } from 'lucide-react';
import { MORE_CREATIONS, type Creation } from '../../data/moreCreations';
import { safeExternalUrl } from '../../utils/safeUrl';

// "More of our creations": a page of its own, opened from the three-line menu (Home). One round-cornered button for each thing we have made (its name, and its logo when it has one);
// tapping one opens that website in a new tab. Under them a note says that these websites are not functional: people can only visit and explore. The list is in data/moreCreations.ts.
export const CREATIONS_NOTE = 'Note: these websites are not functional. You can only visit and explore them.';

interface Props {
  onClose: () => void;
  items?: Creation[];
}

export const MoreCreationsPage: React.FC<Props> = ({ onClose, items = MORE_CREATIONS }) => {
  const shown = items.filter((c) => safeExternalUrl(c.url));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[205] bg-black text-white force-dark flex flex-col" role="dialog" aria-label="More of our creations" data-testid="more-creations">
      <div className="shrink-0 flex items-center gap-3 px-4 pb-2.5 pt-[max(0.75rem,env(safe-area-inset-top))] border-b border-white/10 bg-black/30 backdrop-blur-xl">
        <button type="button" onClick={onClose} className="w-9 h-9 rounded-full bg-white/10 border border-white/10 flex items-center justify-center cursor-pointer" aria-label="Close" data-testid="creations-close"><ChevronLeft className="w-5 h-5" /></button>
        <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-fuchsia-300 to-sky-300 flex items-center justify-center"><Layers className="w-4 h-4 text-black" /></span>
        <h1 className="text-[14px] font-black tracking-tight">More of our creations</h1>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="w-full max-w-[480px] mx-auto px-4 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
          {shown.length === 0 ? (
            <p className="py-10 text-center text-sm text-zinc-400 font-medium">More coming soon</p>
          ) : (
            <div className="space-y-3">
              {shown.map((c, n) => (
                <a key={`${c.url}-${n}`} href={safeExternalUrl(c.url) ?? undefined} target="_blank" rel="noopener noreferrer" data-testid="creation-link" aria-label={`${c.name} (opens in a new tab)`}
                  className="w-full flex items-center gap-3 rounded-2xl border border-white/15 bg-zinc-900/80 hover:bg-zinc-800/80 active:scale-[0.99] transition-all px-4 py-4 cursor-pointer">
                  {c.logo && <img src={`/creations/${c.logo}`} alt="" loading="lazy" draggable={false} className="w-10 h-10 object-contain rounded-xl select-none shrink-0" />}
                  <span className="flex-1 min-w-0 text-[15px] font-bold text-white break-words">{c.name}</span>
                  <ExternalLink className="w-4 h-4 text-zinc-400 shrink-0" aria-hidden="true" />
                </a>
              ))}
            </div>
          )}
          {shown.length > 0 && <p data-testid="creations-note" className="mt-5 text-center text-xs text-zinc-400 font-medium leading-snug">{CREATIONS_NOTE}</p>}
        </div>
      </div>
    </div>
  );
};
