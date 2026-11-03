import React from 'react';
import { PageLock } from '../Common/AppLockGate';
import type { User } from '../../types';
import { liveApi } from '../../family/liveApi';
import { siteOrigin } from '../../utils/siteUrl';
import { closeFamily, useFamilyOpen } from './familyStore';

// The Family Map (live places of a family or friends on a map). Its code is only fetched when it is opened. Inside the app the person is always logged in, so it uses the real database.
const FamilyMap = React.lazy(() => import('./FamilyMap'));

const Opening: React.FC = () => (
  <div className="force-dark fixed inset-0 z-[10000] bg-[#070b1a] text-white flex items-center justify-center text-sm font-bold" role="status">Opening Family Map…</div>
);

export const FamilyHost: React.FC<{ lockUser?: User | null }> = ({ lockUser }) => {
  const open = useFamilyOpen();
  if (!open) return null;
  return (
    <React.Suspense fallback={<Opening />}>
      <FamilyMap api={liveApi} onClose={closeFamily} origin={siteOrigin() || window.location.origin} />
      {lockUser && <PageLock user={lockUser} page="family" onLeave={closeFamily} />}
    </React.Suspense>
  );
};
