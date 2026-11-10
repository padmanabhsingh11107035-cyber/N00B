import { useFeatureOn } from '../../utils/featureFlags';
import React, { useEffect } from 'react';
import { X, LayoutGrid, Clapperboard, CirclePlus, MonitorPlay, Radio, Type, ChevronRight, Wand2, ScanFace } from 'lucide-react';

import { useSheetDrag } from '../../utils/sheetDrag';
import { SheetGrip, CLOSE_X_CLASS } from '../Common/SheetGrip';
import '../Common/nzPage.css';

export type CreateKind = 'post' | 'reel' | 'story' | 'video' | 'live' | 'thought' | 'studio' | 'lenses';

interface CreateChooserProps {
  onClose: () => void;
  onPick: (kind: CreateKind) => void;
  // Set while this person is live right now: the sheet then says so, with a way back to the live and a button that turns it off.
  live?: { onReturn: () => void; onEnd: () => void; ending: boolean };
}

// What to make — the first screen of "+" (like Instagram's Create sheet): a sheet that slides up on a phone and sits in the middle on a bigger screen.
// Each row opens its own creator; nothing is chosen for the person.
const ROWS: { kind: CreateKind; title: string; blurb: string; Icon: React.ElementType; tint: string }[] = [
  { kind: 'post', title: 'Post', blurb: 'Photos with a caption, music, tags and filters', Icon: LayoutGrid, tint: 'text-white' },
  { kind: 'reel', title: 'Reel', blurb: 'A short video with music and a cover', Icon: Clapperboard, tint: 'text-white' },
  { kind: 'story', title: 'Story', blurb: 'Gone after 24 hours', Icon: CirclePlus, tint: 'text-white' },
  { kind: 'video', title: 'Video', blurb: 'A long video for the Videos page', Icon: MonitorPlay, tint: 'text-white' },
  { kind: 'live', title: 'Live', blurb: 'Go live and talk to people right now', Icon: Radio, tint: 'text-red-500' },
  { kind: 'thought', title: 'Thought', blurb: 'Words only, on a coloured card', Icon: Type, tint: 'text-white' },
  { kind: 'lenses', title: 'Lenses', blurb: 'Face filters: take a picture, save it or share it anywhere', Icon: ScanFace, tint: 'text-amber-300' },
  { kind: 'studio', title: 'Edit in Studio', blurb: 'Edit photos and videos first, then share them', Icon: Wand2, tint: 'text-fuchsia-300' }
];

export const CreateChooser: React.FC<CreateChooserProps> = ({ onClose, onPick, live }) => {
  const liveOn = useFeatureOn('live');
  const drag = useSheetDrag(onClose);   // drag the grey bar or the title down to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      id="create-chooser"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center overscroll-contain"
      role="dialog"
      aria-modal="true"
      aria-label="Create"
    >
      <div ref={drag.backdropRef} className="absolute inset-0 bg-black/75" onClick={onClose} aria-hidden="true" />
      <div
        ref={drag.sheetRef}
        className="cs-sheet animate-in slide-in-from-bottom-6 duration-200"
      >
        {/* Handle: the grey bar and the title (drag down to close; there is no cross on a phone) */}
        <SheetGrip drag={drag} barClassName="bg-zinc-600">
        <div className="cs-title">
          <h2>Create</h2>
          <button onClick={onClose} className={`${CLOSE_X_CLASS} cs-x`} aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        </SheetGrip>

        {live && (
          <div className="mx-4 mb-2 rounded-2xl border border-red-500/50 bg-red-500/10 p-3" data-testid="create-live-now">
            <div className="flex items-center gap-2.5">
              <span className="relative flex w-3 h-3 shrink-0"><span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-70" /><span className="relative w-3 h-3 rounded-full bg-red-500" /></span>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-bold text-white leading-tight">You are live</p>
                <p className="text-xs text-zinc-400 mt-0.5">People can watch you right now.</p>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button type="button" onClick={live.onReturn} className="flex-1 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold cursor-pointer transition-colors">
                Return to live
              </button>
              <button type="button" data-testid="create-live-off" onClick={live.onEnd} disabled={live.ending} className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-sm font-semibold cursor-pointer transition-colors">
                {live.ending ? 'Turning off…' : 'Turn off live'}
              </button>
            </div>
          </div>
        )}

        <ul className="cs-list">
          {ROWS.filter((r) => r.kind !== 'live' || (liveOn && !live)).map(({ kind, title, blurb, Icon, tint }) => (
            <li key={kind}>
              <button
                type="button"
                data-testid={`create-${kind}`}
                onClick={() => onPick(kind)}
                className="cs-row"
              >
                <span className="cs-ico" data-live={kind === 'live' ? '1' : undefined}>
                  <Icon className="w-[22px] h-[22px]" strokeWidth={1.8} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="cs-t">{title}</span>
                  <span className="cs-b">{blurb}</span>
                </span>
                <ChevronRight className="w-4 h-4 cs-go" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
