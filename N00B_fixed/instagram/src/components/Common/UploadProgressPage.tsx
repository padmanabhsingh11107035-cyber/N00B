import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Film, Check, Loader2, WifiOff } from 'lucide-react';
import type { UploadProgress } from '../../utils/uploadProgress';
import { overallFraction, secondsLeft, leftText, headline } from '../../utils/uploadBar';

interface UploadProgressPageProps {
  progress: UploadProgress;
  onCancel?: () => void;
}

// A full page for a long upload: one bar that fills from left to right over both steps (making the video smaller, then sending it), what is happening, about how long is
// left, and a Cancel. Covers the screen, so there is nothing else to tap by accident while the video goes up.
export const UploadProgressPage: React.FC<UploadProgressPageProps> = ({ progress, onCancel }) => {
  const [sawCompress, setSawCompress] = useState(progress.stage === 'compressing');
  const [now, setNow] = useState(() => Date.now());
  const high = useRef(0);
  const stageStart = useRef<{ key: string; at: number }>({ key: progress.stage, at: Date.now() });

  useEffect(() => { if (progress.stage === 'compressing') setSawCompress(true); }, [progress.stage]);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  // the time left is worked out per step (making smaller and sending go at different speeds)
  const stageKey = progress.stage === 'retrying' ? 'uploading' : progress.stage;
  if (stageStart.current.key !== stageKey) stageStart.current = { key: stageKey, at: Date.now() };

  const shown = Math.max(high.current, overallFraction(progress, sawCompress || progress.stage === 'compressing'));
  high.current = shown;
  const pct = Math.min(100, Math.round(shown * 100));
  const head = headline(progress, sawCompress || progress.stage === 'compressing');
  const left = progress.stage === 'retrying' ? '' : leftText(secondsLeft(progress.fraction, (now - stageStart.current.at) / 1000));
  const retry = head.tone === 'retry';

  return createPortal(
    <div className="fixed inset-0 z-[140] bg-black text-white flex flex-col items-center justify-center px-6 pb-10" data-testid="upload-progress-page" role="dialog" aria-modal="true" aria-label="Upload in progress">
      <div className="w-full max-w-sm flex flex-col items-center text-center gap-6">
        <div className={`w-16 h-16 rounded-3xl flex items-center justify-center border ${retry ? 'bg-amber-500/10 border-amber-500/30' : 'bg-noob/10 border-noob/30'}`}>
          {retry ? <WifiOff className="w-8 h-8 text-amber-400" /> : <Film className="w-8 h-8 text-noob" />}
        </div>

        <div className="space-y-1.5">
          <h2 className="text-lg font-black tracking-tight" data-testid="upload-title">{head.title}</h2>
          <p className={`text-xs leading-relaxed ${retry ? 'text-amber-300' : 'text-zinc-400'}`}>{head.sub}</p>
        </div>

        <div className="w-full space-y-2.5">
          <div
            className="w-full h-3.5 rounded-full bg-zinc-800 overflow-hidden"
            role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
            data-testid="upload-bar"
          >
            <div
              className={`h-full rounded-full transition-[width] duration-300 ease-out ${retry ? 'bg-amber-400' : 'bg-gradient-to-r from-noob to-noob-strong'}`}
              style={{ width: `${pct}%` }}
              data-testid="upload-bar-fill"
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="font-black text-white text-base tabular-nums" data-testid="upload-percent">{pct}%</span>
            <span className="text-zinc-500">{left}</span>
          </div>
        </div>

        {head.steps === 2 && (
          <div className="w-full flex items-center justify-center gap-2 text-[11px] font-semibold" data-testid="upload-steps">
            <span className={`flex items-center gap-1.5 ${head.step === 1 ? 'text-white' : 'text-noob'}`}>
              {head.step === 1 ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Making it smaller
            </span>
            <span className="text-zinc-700">&rarr;</span>
            <span className={`flex items-center gap-1.5 ${head.step === 2 ? 'text-white' : 'text-zinc-600'}`}>
              {head.step === 2 && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Uploading
            </span>
          </div>
        )}

        {onCancel && (
          <button type="button" onClick={onCancel} data-testid="upload-cancel" className="mt-2 px-5 py-2 rounded-xl border border-zinc-700 text-xs font-bold text-zinc-300 hover:text-white hover:border-zinc-500 cursor-pointer transition-colors">
            Cancel upload
          </button>
        )}
      </div>
    </div>,
    document.body
  );
};
