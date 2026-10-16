import React from 'react';
import { BurgerLoading } from '../Common/BurgerLoading';
import type { User } from '../../types';
import { closeTeamJoin, useTeamJoinOpen } from './teamJoinStore';

// The form is fetched only when someone opens the link.
const TeamJoinPage = React.lazy(() => import('./TeamJoinPage'));

export const TeamJoinHost: React.FC<{ currentUser: User | null }> = ({ currentUser }) => {
  const open = useTeamJoinOpen();
  if (!open || !currentUser) return null;
  return (
    <React.Suspense fallback={<BurgerLoading z={212} />}>
      <TeamJoinPage currentUser={currentUser} onClose={closeTeamJoin} />
    </React.Suspense>
  );
};
