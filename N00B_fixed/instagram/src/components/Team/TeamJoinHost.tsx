import React from 'react';
import type { User } from '../../types';
import { closeTeamJoin, useTeamJoinOpen } from './teamJoinStore';

// The form is fetched only when someone opens the link.
const TeamJoinPage = React.lazy(() => import('./TeamJoinPage'));

export const TeamJoinHost: React.FC<{ currentUser: User | null }> = ({ currentUser }) => {
  const open = useTeamJoinOpen();
  if (!open || !currentUser) return null;
  return (
    <React.Suspense fallback={<div className="fixed inset-0 z-[212] bg-[#09090d] flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-amber-300 animate-spin" /></div>}>
      <TeamJoinPage currentUser={currentUser} onClose={closeTeamJoin} />
    </React.Suspense>
  );
};
