import React from 'react';
import { NoobSpinner, NoobStackLoader } from './NoobStackLoader';

// What shows while a page or window is on its way. It is there for exactly as long as the wait (the layer is simply removed the moment the page is ready; the loading page itself
// shows nothing for the first 400 ms, so a quick fetch is never seen). One place, so every loading moment in the app looks the same.

/** A page or window that is being fetched: the loading page on a full-screen layer. */
export const LoadingPage: React.FC<{ label?: string; z?: number }> = ({ label = 'Loading…', z = 50 }) => (
  <NoobStackLoader mode="quick" subtitle={label} z={z} />
);

/** One of the pages of the bottom bar being fetched: a small ring inside the page's own area, so the bar stays where it is and the tap is seen to have worked. */
export const TabLoading: React.FC<{ label?: string }> = ({ label = 'Loading…' }) => (
  <div className="w-full min-h-[70vh] flex items-center justify-center">
    <NoobSpinner size={34} label={label} showLabel />
  </div>
);

/** A small waiting spot inside a window (a game, a list). */
export const LoadingSmall: React.FC<{ label?: string }> = ({ label = 'Loading…' }) => (
  <div className="h-[190px] flex items-center justify-center overflow-hidden">
    <NoobSpinner size={30} label={label} showLabel />
  </div>
);
