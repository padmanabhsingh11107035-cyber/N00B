import React, { useState } from 'react';
import { Megaphone } from 'lucide-react';
import type { User } from '../../types';
import { AdApplyModal } from './AdApplyModal';

// In "Subscription history": a business account sees "Apply for ads" (free). Any other account sees nothing here.
export const AdsEntryCard: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const [open, setOpen] = useState(false);
  if (!(currentUser.accountType === 'business' || currentUser.isBusiness)) return null;
  return (
    <>
      <div className="mx-4 mt-3 p-4 rounded-3xl bg-zinc-900/70 border border-white/25 space-y-3" data-testid="ads-entry">
        <div className="flex items-start gap-3">
          <span className="w-11 h-11 rounded-2xl bg-white text-black flex items-center justify-center shrink-0"><Megaphone className="w-5 h-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-black text-white">Advertise on NOOB</p>
            <p className="text-xs text-zinc-300 leading-snug mt-0.5">Show your picture or video at the top of Reels, Feed and Home. It is free. The NOOB team reads every request.</p>
          </div>
        </div>
        <button onClick={() => setOpen(true)} className="w-full py-2.5 rounded-xl bg-white text-black text-xs font-black cursor-pointer" data-testid="ads-apply">Apply for ads</button>
      </div>
      {open && <AdApplyModal currentUser={currentUser} onClose={() => setOpen(false)} />}
    </>
  );
};
