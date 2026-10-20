import React, { useEffect, useState } from 'react';
import { Loader2, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { subscribeRenditionJob, cancelRenditionJob, dismissRenditionJob, jobFraction, type RenditionJob } from '../../utils/videoRenditions';

// A small strip at the bottom of the screen while the phone makes the lower-quality copies of a video that was just posted ("data saver" versions for people on slow data).
// It does not block anything; it can be cancelled; it goes away by itself a few seconds after it finishes.
export const RenditionStrip: React.FC = () => {
  const [job, setJob] = useState<RenditionJob | null>(null);
  useEffect(() => subscribeRenditionJob(setJob), []);
  useEffect(() => {
    if (!job || job.status === 'running') return;
    const t = window.setTimeout(dismissRenditionJob, 5000);
    return () => window.clearTimeout(t);
  }, [job]);
  if (!job) return null;
  const pct = Math.round(jobFraction(job) * 100);
  return (
    <div className="fixed inset-x-0 bottom-24 z-[85] flex justify-center px-3 pointer-events-none" data-testid="rendition-strip">
      <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-white/20 bg-zinc-950/98 shadow-2xl px-3.5 py-2.5 flex items-center gap-3">
        {job.status === 'running' ? <Loader2 className="w-4 h-4 animate-spin text-noob shrink-0" /> : job.status === 'done' ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold text-white leading-tight">
            {job.status === 'running' ? `Making data-saver versions of your video… ${Math.min(job.index + 1, job.heights.length)} of ${job.heights.length}` : job.status === 'done' ? 'Quality options are ready for your video' : job.status === 'cancelled' ? 'Stopped. Your video is posted; it just has no lower-quality versions.' : 'Could not make lower-quality versions. Your video is posted.'}
          </p>
          {job.status === 'running' && <div className="mt-1.5 h-1 rounded-full bg-zinc-800 overflow-hidden"><div className="h-full bg-noob transition-all duration-300" style={{ width: `${pct}%` }} /></div>}
        </div>
        {job.status === 'running'
          ? <button onClick={cancelRenditionJob} className="text-[11px] font-bold text-zinc-300 hover:text-white underline cursor-pointer shrink-0" data-testid="rendition-cancel">Cancel</button>
          : <button onClick={dismissRenditionJob} className="p-1 text-zinc-400 hover:text-white cursor-pointer shrink-0" aria-label="Dismiss"><X className="w-3.5 h-3.5" /></button>}
      </div>
    </div>
  );
};
