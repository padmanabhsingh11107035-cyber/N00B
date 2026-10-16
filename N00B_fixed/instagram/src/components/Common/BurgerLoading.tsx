import React from 'react';
import { NoobStackLoader } from './NoobStackLoader';

// What shows while a page or window is on its way: NOOB's burger. It is there for exactly as long as the wait - no minimum time, no maximum time (the layer is simply
// removed the moment the page is ready). One place, so every loading moment in the app looks the same.

/** A page or window that is being fetched: the burger on a full-screen layer. */
export const BurgerLoading: React.FC<{ label?: string; z?: number }> = ({ label = 'Loading…', z = 50 }) => (
  <div className="fixed inset-0 bg-page doodle-wallpaper flex items-center justify-center text-white" style={{ zIndex: z }} role="status" aria-label={label}>
    <NoobStackLoader mode="quick" subtitle={label} />
  </div>
);

/** One of the pages of the bottom bar being fetched: the burger inside the page's own area, so the bar stays where it is and the tap is seen to have worked. */
export const TabBurgerLoading: React.FC<{ label?: string }> = ({ label = 'Loading…' }) => (
  <div className="w-full min-h-[70vh] flex items-center justify-center text-white" role="status" aria-label={label}>
    <NoobStackLoader mode="quick" subtitle={label} />
  </div>
);

/** A small waiting spot inside a window (a game, a list). */
export const BurgerSmall: React.FC<{ label?: string }> = ({ label = 'Loading…' }) => (
  <div className="h-[190px] flex items-center justify-center overflow-hidden text-white" role="status" aria-label={label}>
    <div className="origin-center scale-[.62]"><NoobStackLoader mode="quick" subtitle={label} /></div>
  </div>
);
