import React, { useEffect } from 'react';
import { closeLenses, useLensOpen } from './lensStore';

export type LensTarget = 'post' | 'story';

// NOOB Lenses (the camera with face filters) is a page of its own, /lenses (lenses.html), so the app is not loaded a second time and the face finder (WebAssembly) can run under its
// own security rules. In the app it is shown in a frame over everything, with "?embed=1" (a close button, and "Story" / "Post" buttons that hand the finished picture back here).
// The picture is only ever put into the normal Post / Story creator: nothing is published from here.
// The face finder's files (about 15 MB, from this website's own server, not the database) are fetched ahead in the background once, a few seconds after the app is up, only on a fast
// connection (wifi / 4G) with data saving off. The browser keeps them (7 days), so Lenses starts at once the first time it is opened. Nothing else is touched.
let warmed = false;
const warmLenses = (): void => {
  if (warmed) return;
  const c = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string; type?: string } }).connection;
  if (!c || c.saveData || (c.effectiveType && c.effectiveType !== '4g')) return;   // unknown or slow connection: no ahead-of-time download
  warmed = true;
  for (const u of ['/lenses/face_landmarker.task', '/lenses/mediapipe/vision_wasm_internal.wasm', '/lenses/mediapipe/vision_wasm_internal.js']) {
    void fetch(u, { priority: 'low' } as RequestInit).then((r) => r.arrayBuffer()).catch(() => undefined);
  }
};

export const LensHost: React.FC<{ onUse: (file: File, target: LensTarget) => void }> = ({ onUse }) => {
  const open = useLensOpen();
  useEffect(() => { const id = window.setTimeout(warmLenses, 8000); return () => window.clearTimeout(id); }, []);
  useEffect(() => {
    if (!open) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { noobLens?: boolean; type?: string; file?: unknown; target?: unknown } | null;
      if (!d || d.noobLens !== true) return;
      if (d.type === 'close') closeLenses();
      else if (d.type === 'use' && d.file instanceof File && (d.target === 'post' || d.target === 'story')) { closeLenses(); onUse(d.file, d.target); }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [open, onUse]);
  if (!open) return null;
  return (
    <div className="force-dark fixed inset-0 z-[10000] bg-black" role="dialog" aria-modal="true" aria-label="NOOB Lenses">
      <iframe title="NOOB Lenses" src="/lenses?embed=1" allow="camera" className="w-full h-full border-0 bg-black" />
    </div>
  );
};
