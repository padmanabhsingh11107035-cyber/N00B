import React from 'react';
import type { Target } from './StudioApp';
import { closeStudio, useStudioState } from './studioStore';

// The editor is a big piece of code (drawing, filters, export): it is fetched only when someone opens it.
const StudioApp = React.lazy(() => import('./StudioApp'));

export const preloadStudio = (): void => { void import('./StudioApp'); };

const Opening: React.FC = () => (
  <div className="force-dark fixed inset-0 z-[10000] bg-zinc-950 text-white flex items-center justify-center text-sm font-bold" role="status">Opening NOOB Studio…</div>
);

export const StudioHost: React.FC<{ onUse: (file: File, target: Target) => void }> = ({ onUse }) => {
  const { open, files } = useStudioState();
  if (!open) return null;
  return (
    <React.Suspense fallback={<Opening />}>
      <StudioApp
        initialFiles={files}
        onClose={() => { closeStudio(); try { if (/^\/studio\/?$/i.test(window.location.pathname)) window.history.replaceState(null, '', '/'); } catch { /* the address bar stays as it was */ } }}
        onUse={onUse}
      />
    </React.Suspense>
  );
};
