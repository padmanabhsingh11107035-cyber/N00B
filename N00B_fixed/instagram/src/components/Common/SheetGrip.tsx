import React from 'react';
import type { SheetDrag } from '../../utils/sheetDrag';

// The handle of a bottom sheet: the grey bar and the title row under it. Drag it down and the sheet follows the finger and closes (see utils/sheetDrag.ts).
// There is no cross to tap on a phone: the sheet is closed by dragging it down (or tapping the page above it). A bigger screen shows the sheet as a window in
// the middle, where the bar is hidden and a cross is shown instead (CLOSE_X_CLASS).
export const SheetGrip: React.FC<{ drag: SheetDrag; children?: React.ReactNode; className?: string; barClassName?: string; alwaysBar?: boolean }> = ({ drag, children, className = '', barClassName = 'bg-zinc-600', alwaysBar = false }) => (
  <div {...drag.gripProps} className={`shrink-0 select-none cursor-grab active:cursor-grabbing ${className}`} data-testid="sheet-grip">
    <div className={`${alwaysBar ? '' : 'sm:hidden '}flex justify-center pt-2.5 pb-1.5`} aria-hidden="true"><span className={`w-10 h-1 rounded-full ${barClassName}`} /></div>
    {children}
  </div>
);

/** The cross of a sheet is only there on a bigger screen; on a phone the sheet is dragged down to close. */
export const CLOSE_X_CLASS = 'hidden sm:inline-flex';
