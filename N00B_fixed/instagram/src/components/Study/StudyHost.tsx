import React from 'react';
import type { User } from '../../types';
import { isCoachingHost, useStudyNav } from './studyStore';
import { StudySplash } from './StudySplash';

// NOOB STUDY is big: it is fetched only when someone opens it from the Home menu.
const StudyApp = React.lazy(() => import('./StudyApp'));
export const preloadNoobStudy = (): void => { void import('./StudyApp'); };

// Opening NOOB STUDY shows the logo on a full black screen for 3 seconds (the app loads underneath), and then the admission form or the app.
// On the coaching address the page itself already showed that logo while it loaded, so it is not shown twice.
export const StudyHost: React.FC<{ currentUser: User | null }> = ({ currentUser }) => {
  const nav = useStudyNav();
  const [splash, setSplash] = React.useState(false);
  const was = React.useRef(false);
  React.useEffect(() => {
    if (nav.open && !was.current && !isCoachingHost()) setSplash(true);
    was.current = nav.open;
  }, [nav.open]);
  if (!nav.open || !currentUser) return null;
  return (
    <>
      <React.Suspense fallback={<div className="st-root" style={{ display: 'grid', placeItems: 'center' }}><div className="st-tutor-orb st-float" style={{ width: 56, height: 56 }} /></div>}>
        <StudyApp user={currentUser} />
      </React.Suspense>
      {splash && <StudySplash onDone={() => setSplash(false)} />}
    </>
  );
};
