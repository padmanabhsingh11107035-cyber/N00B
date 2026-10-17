import React, { useEffect } from 'react';
import { X, LayoutGrid, Clapperboard, CirclePlus, MonitorPlay, Radio, Type, ChevronRight } from 'lucide-react';

export type CreateKind = 'post' | 'reel' | 'story' | 'video' | 'live' | 'thought';

interface CreateChooserProps {
  onClose: () => void;
  onPick: (kind: CreateKind) => void;
}

// What to make — the first screen of "+" (like Instagram's Create sheet): a sheet that slides up on a phone and sits in the middle on a bigger screen.
// Each row opens its own creator; nothing is chosen for the person.
const ROWS: { kind: CreateKind; title: string; blurb: string; Icon: React.ElementType; tint: string }[] = [
  { kind: 'post', title: 'Post', blurb: 'Photos with a caption, music, tags and filters', Icon: LayoutGrid, tint: 'text-white' },
  { kind: 'reel', title: 'Reel', blurb: 'A short video with music and a cover', Icon: Clapperboard, tint: 'text-white' },
  { kind: 'story', title: 'Story', blurb: 'Gone after 24 hours', Icon: CirclePlus, tint: 'text-white' },
  { kind: 'video', title: 'Video', blurb: 'A long video for the Videos page', Icon: MonitorPlay, tint: 'text-white' },
  { kind: 'live', title: 'Live', blurb: 'Go live and talk to people right now', Icon: Radio, tint: 'text-red-500' },
  { kind: 'thought', title: 'Thought', blurb: 'Words only, on a coloured card', Icon: Type, tint: 'text-white' }
];

export const CreateChooser: React.FC<CreateChooserProps> = ({ onClose, onPick }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      id="create-chooser"
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center overscroll-contain"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Create"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-3xl shadow-2xl animate-in slide-in-from-bottom-6 duration-200 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <div className="sm:hidden flex justify-center pt-2.5"><span className="w-10 h-1 rounded-full bg-zinc-700" aria-hidden="true" /></div>
        <div className="relative flex items-center justify-center px-5 pt-3 pb-3 border-b border-zinc-800/80">
          <h2 className="text-base font-bold text-white">Create</h2>
          <button onClick={onClose} className="absolute right-3 top-2.5 p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-900 cursor-pointer" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <ul className="py-1.5">
          {ROWS.map(({ kind, title, blurb, Icon, tint }) => (
            <li key={kind}>
              <button
                type="button"
                data-testid={`create-${kind}`}
                onClick={() => onPick(kind)}
                className="w-full flex items-center gap-4 px-5 py-3 text-left hover:bg-zinc-900 active:bg-zinc-900 transition-colors cursor-pointer"
              >
                <span className="w-11 h-11 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                  <Icon className={`w-[22px] h-[22px] ${tint}`} strokeWidth={1.8} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-semibold text-white leading-tight">{title}</span>
                  <span className="block text-xs text-zinc-400 mt-0.5 truncate">{blurb}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
