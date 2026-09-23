import React from 'react';
import { RefreshCw } from 'lucide-react';

// Shown the moment a newer build is detected (see useUpdateAvailable). Reloading is the only way
// to actually pick up new code — there's nothing else this banner can do — so the button just
// does that directly rather than only dismissing.
export const UpdateAvailableBanner: React.FC = () => (
  <div className="fixed top-0 inset-x-0 z-[100] flex justify-center px-3 pt-3 pointer-events-none">
    <button
      onClick={() => window.location.reload()}
      className="pointer-events-auto flex items-center gap-2 bg-[#00FF66] text-black text-xs font-bold px-4 py-2.5 rounded-full shadow-2xl shadow-black/50 hover:scale-105 transition-transform cursor-pointer"
    >
      <RefreshCw className="w-3.5 h-3.5" />
      A new version of NOOB is ready — tap to refresh
    </button>
  </div>
);
