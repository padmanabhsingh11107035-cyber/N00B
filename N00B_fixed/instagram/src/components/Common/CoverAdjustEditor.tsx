import React, { useEffect, useRef, useState } from 'react';
import { X, Check, ZoomIn, ZoomOut, Loader2 } from 'lucide-react';

// "Move and Scale" for a profile cover: the same way the profile picture is adjusted, but the frame is wide (about 2.4 : 1, like the cover itself).
// Drag to move, the slider to zoom; Done bakes exactly what is inside the frame into one JPEG.
const RATIO = 2.4;
const OUT_W = 1440;

export const CoverAdjustEditor: React.FC<{ file: File; onCancel: () => void; onDone: (blob: Blob) => void }> = ({ file, onCancel, onDone }) => {
  const [url] = useState(() => URL.createObjectURL(file));
  const imgRef = useRef<HTMLImageElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [baking, setBaking] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const W = Math.min(360, (typeof window !== 'undefined' ? window.innerWidth : 360) - 32);
  const H = Math.round(W / RATIO);
  const base = natural ? Math.max(W / natural.w, H / natural.h) : 1;
  const scale = base * zoom;
  const dw = natural ? natural.w * scale : 0;
  const dh = natural ? natural.h * scale : 0;
  const maxX = Math.max(0, (dw - W) / 2);
  const maxY = Math.max(0, (dh - H) / 2);
  const cp = { x: Math.max(-maxX, Math.min(maxX, pan.x)), y: Math.max(-maxY, Math.min(maxY, pan.y)) };
  const dx = (W - dw) / 2 + cp.x;
  const dy = (H - dh) / 2 + cp.y;

  const confirm = async () => {
    if (!natural || !imgRef.current) return;
    setBaking(true); setError('');
    try {
      const k = OUT_W / W;
      const canvas = document.createElement('canvas');
      canvas.width = OUT_W; canvas.height = Math.round(H * k);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not process this image.');
      ctx.drawImage(imgRef.current, dx * k, dy * k, dw * k, dh * k);
      const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not process this image.'))), 'image/jpeg', 0.86));
      onDone(blob);
    } catch (e) {
      setError((e as Error)?.message || 'Could not process this image.');
      setBaking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 media-dark flex flex-col items-center justify-center gap-5 p-4" data-noob-sheet="1" data-testid="cover-adjust">
      <p className="text-white text-sm font-bold">Move and Scale your cover</p>
      <div
        className="relative overflow-hidden rounded-2xl bg-zinc-900 cursor-grab active:cursor-grabbing touch-none select-none"
        style={{ width: W, height: H }}
        onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, px: cp.x, py: cp.y }; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { if (drag.current) setPan({ x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y }); }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
      >
        <img
          ref={imgRef}
          src={url}
          alt=""
          draggable={false}
          onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          style={{ position: 'absolute', left: dx, top: dy, width: dw, height: dh, maxWidth: 'none' }}
        />
        <div className="absolute inset-0 rounded-2xl ring-1 ring-white/30 pointer-events-none" />
      </div>
      <p className="text-[11px] text-zinc-400 -mt-2">Drag the picture to place it, use the slider to zoom.</p>

      <div className="w-full max-w-xs flex items-center gap-3">
        <ZoomOut className="w-4 h-4 text-zinc-400 shrink-0" />
        <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} className="w-full accent-noob cursor-pointer" aria-label="Zoom" />
        <ZoomIn className="w-4 h-4 text-zinc-400 shrink-0" />
      </div>

      {error && <p className="text-[11px] text-rose-400 max-w-xs text-center">{error}</p>}

      <div className="flex items-center gap-3">
        <button onClick={onCancel} disabled={baking} className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl text-xs font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1.5">
          <X className="w-3.5 h-3.5" /> Cancel
        </button>
        <button onClick={confirm} disabled={baking || !natural} className="px-5 py-2.5 bg-noob hover:opacity-90 text-black rounded-2xl text-xs font-bold cursor-pointer disabled:opacity-60 flex items-center gap-1.5">
          {baking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {baking ? 'Processing...' : 'Done'}
        </button>
      </div>
    </div>
  );
};
