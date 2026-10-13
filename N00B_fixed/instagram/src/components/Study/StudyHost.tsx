import React from 'react';
import type { User } from '../../types';
import { useStudyNav } from './studyStore';

// NOOB STUDY is big: it is fetched only when someone opens it from the Home menu.
const StudyApp = React.lazy(() => import('./StudyApp'));
export const preloadNoobStudy = (): void => { void import('./StudyApp'); };

export const StudyHost: React.FC<{ currentUser: User | null }> = ({ currentUser }) => {
  const nav = useStudyNav();
  if (!nav.open || !currentUser) return null;
  return (
    <React.Suspense fallback={<div className="st-root" style={{ display: 'grid', placeItems: 'center' }}><div className="st-tutor-orb st-float" style={{ width: 56, height: 56 }} /></div>}>
      <StudyApp user={currentUser} />
    </React.Suspense>
  );
};
