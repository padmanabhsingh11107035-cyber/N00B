import React, { useEffect, useRef, useState } from 'react';
import { X, Gift, PartyPopper } from 'lucide-react';
import { User } from '../../types';
import { revealScratchCard } from '../../services/api';
import confetti from 'canvas-confetti';

interface ScratchCardModalProps {
  scratchCardId: string;
  onClose: () => void;
  onUserUpdated?: (user: User) => void;
}

const CANVAS_SIZE = { width: 320, height: 200 };
const SCRATCH_RADIUS = 22;
const REVEAL_THRESHOLD = 0.55;

export const ScratchCardModal: React.FC<ScratchCardModalProps> = ({ scratchCardId, onClose, onUserUpdated }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isPointerDown = useRef(false);
  const [gift, setGift] = useState<{ type: string; value: number | string; label: string } | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  // The gift is already decided server-side the moment the card was
  // created — this call just fetches/applies it. The scratching itself is
  // pure client-side fun; it doesn't change what's underneath.
  useEffect(() => {
    revealScratchCard(scratchCardId)
      .then((res) => {
        if (res.success && res.gift) {
          setGift(res.gift);
          if (res.user) onUserUpdated?.(res.user);
        } else {
          setErrorMessage(res.error || 'Could not load this gift.');
        }
      })
      .catch(() => setErrorMessage('Could not load this gift.'))
      .finally(() => setIsLoading(false));
  }, [scratchCardId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || isLoading || !gift) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gradient = ctx.createLinearGradient(0, 0, CANVAS_SIZE.width, CANVAS_SIZE.height);
    gradient.addColorStop(0, '#9ca3af');
    gradient.addColorStop(0.5, '#e5e7eb');
    gradient.addColorStop(1, '#9ca3af');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_SIZE.width, CANVAS_SIZE.height);

    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🎁 Scratch Here 🎁', CANVAS_SIZE.width / 2, CANVAS_SIZE.height / 2);
  }, [isLoading, gift]);

  const getCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_SIZE.width,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_SIZE.height
    };
  };

  const scratchAt = (x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, SCRATCH_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  };

  const checkScratchedEnough = () => {
    const canvas = canvasRef.current;
    if (!canvas || isRevealed) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Overlapping erased circles anti-alias at their edges, so most cleared
    // pixels end up near-zero alpha rather than exactly 0 — requiring an
    // exact match meant the threshold could almost never be hit even after
    // the card was visually fully scratched off.
    const pixels = ctx.getImageData(0, 0, CANVAS_SIZE.width, CANVAS_SIZE.height).data;
    let cleared = 0;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] < 64) cleared++;
    }
    const ratio = cleared / (pixels.length / 4);
    if (ratio > REVEAL_THRESHOLD) {
      setIsRevealed(true);
      confetti({ particleCount: 80, spread: 80, origin: { y: 0.5 } });
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isPointerDown.current = true;
    const { x, y } = getCoords(e);
    scratchAt(x, y);
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPointerDown.current) return;
    const { x, y } = getCoords(e);
    scratchAt(x, y);
  };
  const handlePointerUp = () => {
    isPointerDown.current = false;
    checkScratchedEnough();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-zinc-950 border border-pink-500/30 rounded-3xl p-5 shadow-2xl space-y-4 text-center">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white flex items-center gap-1.5">
            <Gift className="w-4 h-4 text-pink-400" /> Birthday Gift
          </h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white p-1 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="py-16 text-zinc-500 text-xs">Loading your gift...</div>
        ) : errorMessage ? (
          <div className="py-10 text-rose-400 text-xs">{errorMessage}</div>
        ) : (
          <>
            <p className="text-[11px] text-zinc-400">
              {isRevealed ? 'You revealed your gift!' : 'Scratch the card below to reveal your surprise!'}
            </p>

            <div
              className="relative mx-auto rounded-2xl overflow-hidden border border-zinc-700 shadow-inner"
              style={{ width: CANVAS_SIZE.width, height: CANVAS_SIZE.height }}
            >
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-pink-500/20 via-amber-400/10 to-zinc-900">
                <PartyPopper className="w-8 h-8 text-amber-400 mb-2" />
                <span className="text-lg font-black text-white px-3 text-center">{gift?.label}</span>
              </div>
              {!isRevealed && (
                <canvas
                  ref={canvasRef}
                  width={CANVAS_SIZE.width}
                  height={CANVAS_SIZE.height}
                  className="absolute inset-0 w-full h-full cursor-pointer touch-none"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                />
              )}
            </div>

            {isRevealed && (
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-[#00FF66] text-black font-bold text-sm hover:bg-emerald-400 transition-colors cursor-pointer"
              >
                Awesome, Thanks!
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
