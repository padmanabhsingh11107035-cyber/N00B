import React, { useEffect } from 'react';
import { MAIN_SITE } from '../../utils/siteUrl';

const StudioApp = React.lazy(() => import('./StudioApp'));

// editor.noobsocials.com: the whole page is NOOB Studio. Nothing here needs an account or talks to a server: pictures and videos are edited on this device and saved with Download.
export const StudioStandalone: React.FC = () => {
  useEffect(() => { document.title = 'NOOB Studio - free photo and video editor'; }, []);
  return (
    <React.Suspense fallback={<div className="fixed inset-0 bg-zinc-950 text-white flex items-center justify-center text-sm font-bold" role="status">Opening NOOB Studio…</div>}>
      <StudioApp onClose={() => { window.location.href = MAIN_SITE; }} />
    </React.Suspense>
  );
};

export default StudioStandalone;
