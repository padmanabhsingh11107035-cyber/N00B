import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { ChevronLeft, SwitchCamera } from 'lucide-react';
import type { User } from '../../types';
import { fetchUsers } from '../../services/api';
import { parseProfileQr } from '../../utils/profileQr';

interface QrScannerPageProps {
  allUsers: User[];
  currentUser: User;
  onClose: () => void;
  // Called with the person whose profile QR code was scanned (the profile then opens).
  onOpenProfile: (user: User) => void;
}

// Profile > ⋮ > Profile finder using QR: just a camera that reads another person's NOOB profile QR code and opens that profile. Nothing else is on
// this page. Every frame is decoded on the phone (jsQR), nothing is uploaded.
export const QrScannerPage: React.FC<QrScannerPageProps> = ({ allUsers, currentUser, onClose, onOpenProfile }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const busyRef = useRef(false);          // a code was read and is being looked up: do not read another one meanwhile
  const lastBadRef = useRef({ text: '', at: 0 });
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const showNotice = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice((cur) => (cur === text ? '' : cur)), 2200);
  };

  const handleCode = async (decoded: string) => {
    const username = parseProfileQr(decoded);
    if (!username) {
      // the same wrong code stays in front of the camera: say it once, not on every frame
      const now = Date.now();
      if (lastBadRef.current.text !== decoded || now - lastBadRef.current.at > 3000) {
        lastBadRef.current = { text: decoded, at: now };
        showNotice('That is not a NOOB profile QR code');
      }
      return;
    }
    busyRef.current = true;
    let target = allUsers.find((u) => u.username.toLowerCase() === username);
    if (!target) {
      const found = await fetchUsers(username).catch(() => [] as User[]);
      target = found.find((u) => u.username.toLowerCase() === username);
    }
    if (!target) {
      busyRef.current = false;
      lastBadRef.current = { text: decoded, at: Date.now() };
      showNotice('That profile was not found');
      return;
    }
    if (target.id === currentUser.id) {
      busyRef.current = false;
      lastBadRef.current = { text: decoded, at: Date.now() };
      showNotice('That is your own profile code');
      return;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onOpenProfile(target);
  };

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      const video = videoRef.current;
      if (!video || cancelled) return;
      if (!busyRef.current && video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
        if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
        const canvas = canvasRef.current;
        // a smaller copy of the frame is plenty for a QR code and keeps phones cool
        const scale = Math.min(1, 640 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(image.data, image.width, image.height);
          if (code?.data) void handleCode(code.data);
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
        if (!cancelled) setError('Camera access was blocked. Allow the camera for NOOB in your browser or phone settings to scan.');
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
    <div className="fixed inset-0 z-[100] bg-zinc-950 text-zinc-50 flex flex-col overflow-hidden force-dark">
      <style>{`@keyframes noob-scan-line { 0% { top: 6%; opacity: 0; } 12% { opacity: 1; } 88% { opacity: 1; } 100% { top: 94%; opacity: 0; } } @media (prefers-reduced-motion: reduce) { .noob-scan-line { animation: none !important; } }`}</style>

      <div className="relative flex-1">
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center px-10 text-center">
            <p className="text-sm text-zinc-300 leading-relaxed">{error}</p>
          </div>
        ) : (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
            {/* a dark veil with a clear window in the middle, and the clay-orange frame around the window */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-[68vw] h-[68vw] max-w-[320px] max-h-[320px] rounded-[28px] shadow-[0_0_0_100vmax_rgba(35,35,33,0.72)]">
                <span className="absolute -top-0.5 -left-0.5 w-9 h-9 border-t-[3px] border-l-[3px] border-noob rounded-tl-[28px]" />
                <span className="absolute -top-0.5 -right-0.5 w-9 h-9 border-t-[3px] border-r-[3px] border-noob rounded-tr-[28px]" />
                <span className="absolute -bottom-0.5 -left-0.5 w-9 h-9 border-b-[3px] border-l-[3px] border-noob rounded-bl-[28px]" />
                <span className="absolute -bottom-0.5 -right-0.5 w-9 h-9 border-b-[3px] border-r-[3px] border-noob rounded-br-[28px]" />
                <span className="noob-scan-line absolute left-3 right-3 h-0.5 rounded-full bg-gradient-to-r from-transparent via-noob to-transparent shadow-[0_0_14px_2px_rgba(217,119,87,0.7)]" style={{ animation: 'noob-scan-line 2.2s ease-in-out infinite' }} />
              </div>
            </div>
          </>
        )}

        {/* the only controls: back, and flip the camera */}
        <div className="absolute top-0 inset-x-0 flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <button onClick={onClose} className="p-2.5 rounded-full bg-zinc-900/80 backdrop-blur border border-zinc-800 text-zinc-50 cursor-pointer" aria-label="Back">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="flex-1 text-center text-sm font-black text-zinc-50 px-2 truncate">Profile finder using QR</h1>
          {!error ? (
            <button
              onClick={() => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))}
              className="p-2.5 rounded-full bg-zinc-900/80 backdrop-blur border border-zinc-800 text-zinc-50 cursor-pointer"
              aria-label="Flip camera"
            >
              <SwitchCamera className="w-5 h-5" />
            </button>
          ) : <span className="w-10" aria-hidden="true" />}
        </div>

        <div className="absolute bottom-0 inset-x-0 pb-[max(2rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-3 px-6 text-center">
          {notice && <p role="status" className="px-4 py-2 rounded-full bg-zinc-900/90 border border-zinc-700 text-xs font-bold text-zinc-50">{notice}</p>}
          {!error && <p className="text-xs font-semibold text-zinc-300">Point the camera at a NOOB profile QR code to find that profile</p>}
        </div>
      </div>
    </div>
  );
};
