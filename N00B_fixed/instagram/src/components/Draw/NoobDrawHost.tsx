import React from 'react';
import type { User } from '../../types';
import { closeNoobDraw, useNoobDrawOpen } from './drawStore';

// The page is a big one (reel, artwork, confetti): fetched only when someone opens it.
const NoobDrawPage = React.lazy(() => import('./NoobDrawPage'));

export const preloadNoobDraw = (): void => { void import('./NoobDrawPage'); };

export const NoobDrawHost: React.FC<{ currentUser: User | null; onUserUpdated: (user: User) => void }> = ({ currentUser, onUserUpdated }) => {
  const open = useNoobDrawOpen();
  if (!open || !currentUser) return null;
  return (
    <React.Suspense fallback={<div className="fixed inset-0 z-[210] bg-[#08080c] flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-[#c9c6ff] animate-spin" /></div>}>
      <NoobDrawPage currentUser={currentUser} onUserUpdated={onUserUpdated} onClose={closeNoobDraw} />
    </React.Suspense>
  );
};
