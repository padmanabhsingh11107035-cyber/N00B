import React, { useEffect, useRef, useState } from 'react';
import { ScanFace, X, Loader2 } from 'lucide-react';
import { enrollFace, verifyOwnerFace, type Progress } from '../../face/faceId';

// The camera window of NOOB's own face check (src/face/faceId.ts). mode "enroll" saves the owner's face; "verify" checks that the person is the saved owner.
// The picture stays on this phone: it is looked at by a small model in the browser and never sent anywhere.
export const FaceCheckSheet: React.FC<{ userId: string; mode: 'enroll' | 'verify'; title?: string; onDone: (ok: boolean) => void }> = ({ userId, mode, title, onDone }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [progress, setProgress] = useState<Progress>({ phase: 'loading', text: 'Starting the camera…' });
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const signal = { stop: false };
    let stream: MediaStream | null = null;
    (async () => {
      setError('');
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } }, audio: false });
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream; v.muted = true; v.playsInline = true;
        await v.play().catch(() => undefined);
      } catch {
        setError('NOOB could not use the camera. Allow the camera for this site in your browser settings, then try again.');
        return;
      }
      const v = videoRef.current;
      if (!v || signal.stop) return;
      if (mode === 'enroll') {
        const res = await enrollFace(userId, v, setProgress, signal);
        if (signal.stop) return;
        if (res.ok === true) window.setTimeout(() => onDone(true), 600); else setError((res as { error: string }).error);
      } else {
        const ok = await verifyOwnerFace(userId, v, setProgress, signal);
        if (signal.stop) return;
        if (ok) window.setTimeout(() => onDone(true), 400); else setError('Not recognised. Try again in good light, facing the camera.');
      }
    })();
    return () => { signal.stop = true; stream?.getTracks().forEach((t) => t.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  return (
    <div className="fixed inset-0 z-[450] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center gap-4 px-6 text-white text-center" role="dialog" aria-modal="true" aria-label={title || 'Face check'} data-testid="face-check-sheet">
      <button onClick={() => onDone(false)} aria-label="Close" className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center cursor-pointer"><X className="w-5 h-5" /></button>
      <h2 className="text-lg font-black">{title || (mode === 'enroll' ? 'Remember my face' : 'Face check')}</h2>
      <div className={`relative w-64 h-64 rounded-full overflow-hidden border-4 ${progress.phase === 'done' ? 'border-emerald-400' : error ? 'border-rose-400' : 'border-white/60'}`}>
        <video ref={videoRef} className="w-full h-full object-cover [transform:scaleX(-1)]" playsInline muted />
        {!error && progress.phase === 'loading' && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>}
      </div>
      {mode === 'enroll' && !error && <div className="flex gap-1.5" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <span key={i} className={`w-2.5 h-2.5 rounded-full ${i < (progress.got ?? 0) ? 'bg-emerald-400' : 'bg-white/25'}`} />)}</div>}
      <p className="text-sm text-white/80 max-w-[18rem] min-h-[2.5rem]" role="status">{error || progress.text}</p>
      {error ? (
        <button onClick={() => setAttempt((n) => n + 1)} className="h-11 px-6 rounded-full bg-white text-black font-extrabold text-sm flex items-center gap-2 cursor-pointer"><ScanFace className="w-4 h-4" /> Try again</button>
      ) : (
        <p className="text-[11px] text-white/45 max-w-[17rem]">The picture is looked at on this phone only. It is never sent or saved.</p>
      )}
    </div>
  );
};
