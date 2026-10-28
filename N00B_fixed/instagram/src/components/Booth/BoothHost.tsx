import React from 'react';
import { closeBooth, useBoothOpen } from './boothStore';

export type BoothTarget = 'post' | 'story' | 'reel';

// The Buddy Booth (a photo with a buddy standing next to you, optional moving stickers, a premium frame). Its code is only fetched when it is opened. A finished picture or video goes
// into the normal Post / Story / Reel creator: nothing is published from here.
const BuddyBooth = React.lazy(() => import('./BuddyBooth'));

const Opening: React.FC = () => (
  <div className="force-dark fixed inset-0 z-[10000] bg-[#0b0614] text-white flex items-center justify-center text-sm font-bold" role="status">Opening Buddy Booth…</div>
);

export const BoothHost: React.FC<{ onUse: (file: File, target: BoothTarget) => void }> = ({ onUse }) => {
  const open = useBoothOpen();
  if (!open) return null;
  return (
    <React.Suspense fallback={<Opening />}>
      <BuddyBooth onClose={closeBooth} onUse={onUse} />
    </React.Suspense>
  );
};
