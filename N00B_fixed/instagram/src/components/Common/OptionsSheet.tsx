import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSheetDrag } from '../../utils/sheetDrag';
import { SheetGrip } from './SheetGrip';

// The three-dot sheet of a post or reel (styles: .pm-* in Feed/home.css). It closes by tapping the dark part above it, by dragging it down (the grey bar and the top of the sheet are the handle),
// with the Escape key, and by the callers' own buttons. Everything that happens in it stays in it: touches do not reach the post or reel underneath.
export const OptionsSheet: React.FC<{ onClose: () => void; label: string; testId?: string; children: React.ReactNode }> = ({ onClose, label, testId, children }) => {
  const drag = useSheetDrag(onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return createPortal(
    <div className="pm-layer" role="dialog" aria-modal="true" aria-label={label} onClick={stop} onPointerDown={stop} onTouchStart={stop} onDoubleClick={stop} data-noob-keep="1">
      <div ref={drag.backdropRef} className="pm-back" onPointerUp={onClose} aria-hidden="true" />
      <div ref={drag.sheetRef} className="pm-sheet" data-testid={testId}>
        <SheetGrip drag={drag} alwaysBar barClassName="bg-transparent">
          <div className="pm-bar" aria-hidden="true"><span /></div>
        </SheetGrip>
        {children}
      </div>
    </div>,
    document.body
  );
};
