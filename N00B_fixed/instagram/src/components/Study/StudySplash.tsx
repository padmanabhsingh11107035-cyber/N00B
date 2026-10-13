import React, { useEffect } from 'react';

// Opening NOOB STUDY: a full black screen with the NOOB STUDY logo for 3 seconds. The study space is already loading underneath, so when this goes, the
// admission form (or the app, for a student who is already a member) is ready.
export const SPLASH_MS = 3000;

export const StudySplash: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  useEffect(() => {
    const t = window.setTimeout(onDone, SPLASH_MS);
    return () => window.clearTimeout(t);
  }, [onDone]);
  return (
    <div className="st-splash" role="status" aria-label="NOOB STUDY is opening">
      <img src="/noob-study-logo.svg" alt="NOOB STUDY" width={260} height={260} draggable={false} />
    </div>
  );
};
