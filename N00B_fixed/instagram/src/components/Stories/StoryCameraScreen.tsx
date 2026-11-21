import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Zap, ZapOff, SwitchCamera, Timer, Image as ImageIcon } from 'lucide-react';
import './storyCamera.css';

// The first screen of "Story", drawn like Instagram's: the camera fills a rounded card, close at the top left and the flash in the middle, a tool column on the left (Aa for a words-only story, a
// timer), the big round shutter, the gallery square at the bottom left, the mode words POST / STORY / INSTANT in the middle and the camera switch at the right. A taken (or chosen) picture or video goes on to the
// story editor (CreateStoryModal) as a file.
type Mode = 'post' | 'story' | 'instant';
export interface StoryCameraProps {
  onClose: () => void;
  /** a photo was taken, or a picture / video was picked from the phone */
  onFile: (file: File) => void;
  /** POST or INSTANT was tapped */
  onSwitchMode: (mode: 'post' | 'instant') => void;
}

const GRADIENTS: Array<[string, string]> = [['#8b5cf6', '#ec4899'], ['#0ea5e9', '#22c55e'], ['#f97316', '#ef4444'], ['#111827', '#6366f1'], ['#f59e0b', '#db2777']];

/** a plain coloured picture (the background of a words-only story) */
function gradientFile(): Promise<File | null> {
  return new Promise((resolve) => {
    try {
      const c = document.createElement('canvas');
      c.width = 1080; c.height = 1920;
      const ctx = c.getContext('2d');
      if (!ctx) { resolve(null); return; }
      const [a, b] = GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)];
      const g = ctx.createLinearGradient(0, 0, 1080, 1920);
      g.addColorStop(0, a); g.addColorStop(1, b);
      ctx.fillStyle = g; ctx.fillRect(0, 0, 1080, 1920);
      c.toBlob((blob) => resolve(blob ? new File([blob], 'words-story.jpg', { type: 'image/jpeg' }) : null), 'image/jpeg', 0.9);
    } catch { resolve(null); }
  });
}

export const StoryCameraScreen: React.FC<StoryCameraProps> = ({ onClose, onFile, onSwitchMode }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pickRef = useRef<HTMLInputElement | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('environment');
  const [camError, setCamError] = useState('');
  const [torchOk, setTorchOk] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [timerOn, setTimerOn] = useState(false);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const mode: Mode = 'story';

  const stop = useCallback(() => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; }, []);
  const start = useCallback(async (f: 'user' | 'environment') => {
    stop(); setCamError(''); setTorchOn(false); setTorchOk(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: f, width: { ideal: 1080 }, height: { ideal: 1920 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play().catch(() => undefined); }
      const track = stream.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() || {}) as { torch?: boolean };
      setTorchOk(!!caps.torch);
    } catch {
      setCamError('The camera is not available. You can still choose a picture or video from your phone with the square at the bottom left.');
    }
  }, [stop]);
  useEffect(() => { void start(facing); return stop; }, [facing, start, stop]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try { await track.applyConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] }); setTorchOn((v) => !v); } catch { /* this camera has no flash */ }
  };

  const snap = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth || busy) return;
    setBusy(true);
    try {
      const c = document.createElement('canvas');
      c.width = v.videoWidth; c.height = v.videoHeight;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      if (facing === 'user') { ctx.translate(c.width, 0); ctx.scale(-1, 1); }   // a selfie is kept the way it was seen
      ctx.drawImage(v, 0, 0, c.width, c.height);
      const blob: Blob | null = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
      if (blob) { stop(); onFile(new File([blob], `story-${Date.now()}.jpg`, { type: 'image/jpeg' })); }
    } finally { setBusy(false); }
  };
  const shutter = () => {
    if (!timerOn) { void snap(); return; }
    let n = 3; setCount(n);
    const id = window.setInterval(() => { n -= 1; if (n <= 0) { window.clearInterval(id); setCount(0); void snap(); } else setCount(n); }, 1000);
  };

  return (
    <div className="sc-root" role="dialog" aria-modal="true" aria-label="Story camera" data-noob-keep="1" data-testid="story-camera">
      <div className="sc-card">
        <video ref={videoRef} className={`sc-video ${facing === 'user' ? 'is-mirror' : ''}`} playsInline muted autoPlay />
        {camError && <p className="sc-err" role="alert">{camError}</p>}

        <button type="button" className="sc-ico sc-close" onClick={onClose} aria-label="Close" data-testid="story-camera-close"><X /></button>
        {torchOk && <button type="button" className="sc-ico sc-flash" onClick={() => void toggleTorch()} aria-pressed={torchOn} aria-label="Flash">{torchOn ? <Zap /> : <ZapOff />}</button>}

        <div className="sc-tools">
          <button type="button" className="sc-tool" onClick={async () => { const f = await gradientFile(); if (f) { stop(); onFile(f); } }} aria-label="Words only story" data-testid="story-camera-aa"><span className="sc-aa">Aa</span></button>
          <button type="button" className={`sc-tool ${timerOn ? 'is-on' : ''}`} onClick={() => setTimerOn((v) => !v)} aria-pressed={timerOn} aria-label="3 second timer"><Timer /></button>
        </div>

        {count > 0 && <div className="sc-count" aria-live="assertive">{count}</div>}

        <button type="button" className="sc-shutter" onClick={shutter} disabled={busy || !!camError} aria-label="Take a photo" data-testid="story-camera-shutter"><span /></button>
      </div>

      <div className="sc-bottom">
        <button type="button" className="sc-gallery" onClick={() => pickRef.current?.click()} aria-label="Choose from your phone" data-testid="story-camera-gallery"><ImageIcon /></button>
        <input ref={pickRef} type="file" accept="image/*,video/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { stop(); onFile(f); } }} />
        <div className="sc-modes" role="tablist" aria-label="What to make">
          <button type="button" role="tab" aria-selected={false} onClick={() => { stop(); onSwitchMode('post'); }}>POST</button>
          <button type="button" role="tab" aria-selected={mode === 'story'} className="is-on">STORY</button>
          <button type="button" role="tab" aria-selected={false} onClick={() => { stop(); onSwitchMode('instant'); }}>INSTANT</button>
        </div>
        <button type="button" className="sc-flip" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))} aria-label="Switch camera" data-testid="story-camera-flip"><SwitchCamera /></button>
      </div>
    </div>
  );
};
