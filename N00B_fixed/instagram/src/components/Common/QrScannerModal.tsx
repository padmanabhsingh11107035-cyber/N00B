import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { X, SwitchCamera } from 'lucide-react';

interface QrScannerModalProps {
  onClose: () => void;
  onScanned: (decodedText: string) => void;
}

// A plain camera-only QR reader (no gallery picker) — decodes every frame locally with jsQR, nothing is
// ever uploaded anywhere. Used to scan another NOOB account's profile QR code (see ProfileQrModal.tsx) to
// send them NOOB Points, UPI-style.
export const QrScannerModal: React.FC<QrScannerModalProps> = ({ onClose, onScanned }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const doneRef = useRef(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [error, setError] = useState('');

  useEffect(() => {
    doneRef.current = false;
    let cancelled = false;

    const tick = () => {
      const video = videoRef.current;
      if (!video || doneRef.current) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx && canvas.width > 0 && canvas.height > 0) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code?.data) {
            doneRef.current = true;
            onScanned(code.data);
            return;
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    (async () => {
      setError('');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        if (!cancelled) setError('Camera access was blocked. Please allow it in your browser settings to scan a QR code.');
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  return (
    <div className="fixed inset-0 z-[90] bg-black flex flex-col">
      <div className="flex items-center justify-between p-4 shrink-0">
        <button onClick={onClose} className="p-2 rounded-full bg-black/50 text-white cursor-pointer" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
        <span className="text-white text-sm font-bold">Scan NOOB QR Code</span>
        <button
          onClick={() => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))}
          className="p-2 rounded-full bg-black/50 text-white cursor-pointer"
          title="Flip camera"
        >
          <SwitchCamera className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 relative overflow-hidden flex items-center justify-center">
        {error ? (
          <p className="text-rose-400 text-xs text-center px-8">{error}</p>
        ) : (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-64 h-64 max-w-[70vw] max-h-[70vw] border-2 border-noob/80 rounded-3xl" />
            </div>
          </>
        )}
      </div>

      <p className="text-center text-xs text-zinc-400 p-4">Point your camera at a NOOB profile QR code</p>
    </div>
  );
};
