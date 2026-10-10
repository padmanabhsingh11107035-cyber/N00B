import React, { useEffect, useRef, useState } from 'react';
import { X, Check, ZoomIn, ZoomOut, Loader2 } from 'lucide-react';

// "Move and Scale" — drag to reposition, use the slider to zoom, exactly like Instagram/Twitter's own
// profile-picture cropper. Works identically for a photo or a short video (the video keeps playing while
// you adjust it, since it will play under this same round area everywhere it's shown). On confirm it bakes
// the crop for real: a photo becomes one square JPEG; a video becomes a real square clip (muted, up to 6
// seconds, via canvas + MediaRecorder) plus a poster frame grabbed from it.
const VIEWPORT = 280; // on-screen size, CSS px
const OUTPUT = 640; // baked resolution, px
const MAX_VIDEO_SECONDS = 6;

export interface AvatarAdjustResult {
  blob: Blob; // the square JPEG (photo) or square video (live)
  posterBlob?: Blob; // only for a video: one still frame to use wherever only a picture can show
}

interface AvatarAdjustEditorProps {
  file: File;
  mediaType: 'image' | 'video';
  onCancel: () => void;
  onDone: (result: AvatarAdjustResult) => void;
}

export const AvatarAdjustEditor: React.FC<AvatarAdjustEditorProps> = ({ file, mediaType, onCancel, onDone }) => {
  const [objectUrl] = useState(() => URL.createObjectURL(file));
  const mediaRef = useRef<HTMLImageElement & HTMLVideoElement>(null as any);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const [baking, setBaking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => URL.revokeObjectURL(objectUrl), [objectUrl]);

  const coverScale = natural ? VIEWPORT / Math.min(natural.w, natural.h) : 1;
  const displayScale = coverScale * zoom;
  const drawWidth = natural ? natural.w * displayScale : 0;
  const drawHeight = natural ? natural.h * displayScale : 0;
  const maxPanX = Math.max(0, (drawWidth - VIEWPORT) / 2);
  const maxPanY = Math.max(0, (drawHeight - VIEWPORT) / 2);
  const clampedPan = { x: Math.max(-maxPanX, Math.min(maxPanX, pan.x)), y: Math.max(-maxPanY, Math.min(maxPanY, pan.y)) };
  const drawX = (VIEWPORT - drawWidth) / 2 + clampedPan.x;
  const drawY = (VIEWPORT - drawHeight) / 2 + clampedPan.y;

  const handlePointerDown = (e: React.PointerEvent) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: clampedPan.x, panY: clampedPan.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy });
  };
  const handlePointerUp = () => { dragRef.current = null; };

  // Draws the exact same crop that's on screen into `ctx`, at OUTPUT resolution.
  const drawFrame = (ctx: CanvasRenderingContext2D, source: HTMLImageElement | HTMLVideoElement) => {
    const ratio = OUTPUT / VIEWPORT;
    ctx.clearRect(0, 0, OUTPUT, OUTPUT);
    ctx.drawImage(source, drawX * ratio, drawY * ratio, drawWidth * ratio, drawHeight * ratio);
  };

  const handleConfirm = async () => {
    setError('');
    setBaking(true);
    try {
      if (mediaType === 'image') {
        const img = mediaRef.current as unknown as HTMLImageElement;
        const canvas = document.createElement('canvas');
        canvas.width = OUTPUT;
        canvas.height = OUTPUT;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not process this image.');
        drawFrame(ctx, img);
        const blob: Blob = await new Promise((resolve, reject) =>
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process this image.'))), 'image/jpeg', 0.92)
        );
        onDone({ blob });
        return;
      }

      // Video: bake a fresh square clip from a hidden copy, playing it for real so the recording
      // captures real motion, then grab one poster frame from the visible preview.
      const previewVideo = mediaRef.current as unknown as HTMLVideoElement;
      const posterCanvas = document.createElement('canvas');
      posterCanvas.width = OUTPUT;
      posterCanvas.height = OUTPUT;
      const posterCtx = posterCanvas.getContext('2d');
      if (posterCtx) drawFrame(posterCtx, previewVideo);
      const posterBlob: Blob | undefined = posterCtx
        ? await new Promise((resolve) => posterCanvas.toBlob((b) => resolve(b || undefined), 'image/jpeg', 0.9))
        : undefined;

      const bakeVideo = document.createElement('video');
      bakeVideo.src = objectUrl;
      bakeVideo.muted = true;
      bakeVideo.playsInline = true;
      await new Promise<void>((resolve, reject) => {
        bakeVideo.onloadedmetadata = () => resolve();
        bakeVideo.onerror = () => reject(new Error('Could not read this video.'));
      });

      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT;
      canvas.height = OUTPUT;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not process this video.');
      const stream = (canvas as HTMLCanvasElement).captureStream(30);
      const mimeType = ['video/webm;codecs=vp9', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      const cap = Math.min(bakeVideo.duration || MAX_VIDEO_SECONDS, MAX_VIDEO_SECONDS);

      const done: Blob = await new Promise((resolve, reject) => {
        let raf = 0;
        const tick = () => {
          drawFrame(ctx, bakeVideo);
          if (!bakeVideo.ended && bakeVideo.currentTime < cap) {
            raf = requestAnimationFrame(tick);
          } else {
            bakeVideo.pause();
            recorder.stop();
          }
        };
        recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType.split(';')[0] || 'video/webm' }));
        recorder.onerror = () => { cancelAnimationFrame(raf); reject(new Error('Could not process this video.')); };
        recorder.start();
        bakeVideo.play().then(() => { raf = requestAnimationFrame(tick); }).catch(() => reject(new Error('Could not play this video to process it.')));
      });

      onDone({ blob: done, posterBlob });
    } catch (err: any) {
      setError(err?.message || 'Could not process this. Please try a different file.');
      setBaking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/95 flex flex-col items-center justify-center gap-5 p-4">
      <p className="text-white text-sm font-bold">Move and Scale</p>

      <div
        className="relative rounded-full overflow-hidden bg-zinc-900 cursor-grab active:cursor-grabbing touch-none select-none"
        style={{ width: VIEWPORT, height: VIEWPORT }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {mediaType === 'image' ? (
          <img
            ref={mediaRef as any}
            src={objectUrl}
            alt=""
            draggable={false}
            onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            style={{ position: 'absolute', left: drawX, top: drawY, width: drawWidth, height: drawHeight, maxWidth: 'none' }}
          />
        ) : (
          <video
            ref={mediaRef as any}
            src={objectUrl}
            autoPlay
            loop
            muted
            playsInline
            onLoadedMetadata={(e) => setNatural({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })}
            style={{ position: 'absolute', left: drawX, top: drawY, width: drawWidth, height: drawHeight, maxWidth: 'none' }}
          />
        )}
        {/* a faint ring so it's clear where the round crop actually falls */}
        <div className="absolute inset-0 rounded-full ring-1 ring-white/25 pointer-events-none" />
      </div>

      <div className="w-full max-w-xs flex items-center gap-3">
        <ZoomOut className="w-4 h-4 text-zinc-400 shrink-0" />
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(parseFloat(e.target.value))}
          className="w-full accent-noob cursor-pointer"
        />
        <ZoomIn className="w-4 h-4 text-zinc-400 shrink-0" />
      </div>

      {error && <p className="text-[11px] text-rose-400 max-w-xs text-center">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={onCancel}
          disabled={baking}
          className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl text-xs font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
        >
          <X className="w-3.5 h-3.5" /> Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={baking || !natural}
          className="px-5 py-2.5 bg-noob hover:opacity-90 text-black rounded-2xl text-xs font-bold cursor-pointer disabled:opacity-60 flex items-center gap-1.5"
        >
          {baking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {baking ? 'Processing...' : 'Done'}
        </button>
      </div>
    </div>
  );
};
