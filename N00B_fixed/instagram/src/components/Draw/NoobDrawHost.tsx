import React from 'react';
import { BurgerLoading } from '../Common/BurgerLoading';
import type { User } from '../../types';
import { closeNoobDraw, useNoobDrawOpen } from './drawStore';

// The page is a big one (reel, artwork, confetti): fetched only when someone opens it.
const NoobDrawPage = React.lazy(() => import('./NoobDrawPage'));

export const preloadNoobDraw = (): void => { void import('./NoobDrawPage'); };

export const NoobDrawHost: React.FC<{ currentUser: User | null; onUserUpdated: (user: User) => void }> = ({ currentUser, onUserUpdated }) => {
  const open = useNoobDrawOpen();
  if (!open || !currentUser) return null;
  return (
    <React.Suspense fallback={<BurgerLoading z={210} />}>
      <NoobDrawPage currentUser={currentUser} onUserUpdated={onUserUpdated} onClose={closeNoobDraw} />
    </React.Suspense>
  );
};
