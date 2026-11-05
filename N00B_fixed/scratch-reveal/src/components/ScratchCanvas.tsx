import React, { useRef, useEffect, useState, useCallback } from 'react';
import confetti from 'canvas-confetti';
import {
  ScratchTool,
  FoilType,
  FOIL_CONFIGS,
  calculateClearedPercentage,
  interpolatePoints,
  distanceBetween,
  scratchAudio,
} from '../utils/scratchEngine';
import { Sparkles, Trophy } from 'lucide-react';

interface ScratchCanvasProps {
  imageSrc: string;
  tool: ScratchTool;
  brushMultiplier: number; // 0.6 for small, 1 for medium, 1.8 for large
  foilType: FoilType;
  soundEnabled: boolean;
  isPeeking: boolean;
  onPercentageChange: (pct: number) => void;
  resealTrigger: number;
  magicRevealTrigger: number;
  onPostRevealed?: () => void;
}

export const ScratchCanvas: React.FC<ScratchCanvasProps> = ({
  imageSrc,
  tool,
  brushMultiplier,
  foilType,
  soundEnabled,
  isPeeking,
  onPercentageChange,
  resealTrigger,
  magicRevealTrigger,
  onPostRevealed,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const isAutoRevealingRef = useRef(false);
  const strokeCountRef = useRef(0);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const lastSampleTimeRef = useRef(0);
  const [clearedPct, setClearedPct] = useState(0);
  const [hasCelebrated, setHasCelebrated] = useState(false);
  const [doodleImgLoaded, setDoodleImgLoaded] = useState(false);
  const doodleImgRef = useRef<HTMLImageElement | null>(null);
  const [scratchParticles, setScratchParticles] = useState<Array<{ id: number; x: number; y: number; color: string }>>([]);

  // Preload doodle texture from attached asset
  useEffect(() => {
    const img = new Image();
    img.src = '/assets/foil/image_ed31b758.png';
    img.onload = () => {
      doodleImgRef.current = img;
      setDoodleImgLoaded(true);
    };
    img.onerror = () => {
      // Fallback
      setDoodleImgLoaded(true);
    };
  }, []);

  const triggerRevealCelebration = useCallback(() => {
    confetti({
      particleCount: 85,
      spread: 75,
      origin: { y: 0.6 },
      colors: ['#ffffff', '#facc15', '#38bdf8', '#f43f5e', '#a855f7'],
    });
    if (soundEnabled) {
      scratchAudio.playChime(659.25);
      setTimeout(() => scratchAudio.playChime(880), 120);
    }
  }, [soundEnabled]);

  // Smooth expanding radial wipe when scratched a little
  const triggerAutoFullScratch = useCallback(() => {
    if (isAutoRevealingRef.current || hasCelebrated) return;
    isAutoRevealingRef.current = true;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const startTime = performance.now();
    const duration = 280;
    const maxRadius = Math.hypot(canvas.width, canvas.height);

    const animateWipe = (now: number) => {
      const elapsed = Math.max(0, now - startTime);
      const progress = Math.min(1, elapsed / duration);
      const radius = Math.max(0.1, maxRadius * progress);

      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(canvas.width / 2, canvas.height / 2, radius, 0, Math.PI * 2);
      ctx.fill();

      if (progress < 1) {
        requestAnimationFrame(animateWipe);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setClearedPct(100);
        onPercentageChange(100);
        setHasCelebrated(true);
        triggerRevealCelebration();
        if (onPostRevealed) onPostRevealed();
        isAutoRevealingRef.current = false;
      }
    };
    requestAnimationFrame(animateWipe);
  }, [hasCelebrated, onPercentageChange, onPostRevealed, triggerRevealCelebration]);

  // Initialize or re-seal the scratch canvas
  const drawFoilCover = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    if (width === 0 || height === 0) return;

    // Reset composite operation to default
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, width, height);

    if (foilType === 'doodle') {
      // Chalkboard base
      ctx.fillStyle = '#0f0f13';
      ctx.fillRect(0, 0, width, height);

      if (doodleImgRef.current && doodleImgRef.current.complete && doodleImgRef.current.naturalWidth > 0) {
        try {
          const pattern = ctx.createPattern(doodleImgRef.current, 'repeat');
          if (pattern) {
            ctx.fillStyle = pattern;
            ctx.fillRect(0, 0, width, height);
          }
        } catch {
          // fallback
        }
      }

      // Add dark semi-transparent tint for high-contrast chalkboard feel
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(0, 0, width, height);

      // Draw hand-drawn chalk dashed frame border
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.setLineDash([12, 8]);
      ctx.strokeRect(14, 14, width - 28, height - 28);
      ctx.setLineDash([]);

      // Draw chalk centerpiece badge
      ctx.save();
      const badgeW = Math.min(240, width - 40);
      const badgeH = 84;
      const badgeX = (width - badgeW) / 2;
      const badgeY = (height - badgeH) / 2;

      ctx.fillStyle = '#000000';
      ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);

      // Badge inner decorative corners
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px "Permanent Marker", cursive, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('NOOB SOCIALS', width / 2, badgeY + 34);

      ctx.font = '13px "Architects Daughter", cursive, sans-serif';
      ctx.fillText('★ SCRATCH TO REVEAL ★', width / 2, badgeY + 62);
      ctx.restore();
    } else if (foilType === 'silver') {
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, '#6b7280');
      grad.addColorStop(0.3, '#d1d5db');
      grad.addColorStop(0.5, '#9ca3af');
      grad.addColorStop(0.7, '#f3f4f6');
      grad.addColorStop(1, '#4b5563');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Metallic brushed lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      for (let i = 0; i < height; i += 6) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(width, i);
        ctx.stroke();
      }

      // Center silver stamp
      ctx.fillStyle = '#111827';
      ctx.fillRect(width / 2 - 110, height / 2 - 38, 220, 76);
      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 2;
      ctx.strokeRect(width / 2 - 110, height / 2 - 38, 220, 76);
      ctx.fillStyle = '#f3f4f6';
      ctx.font = 'bold 16px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SILVER CHROME FOIL', width / 2, height / 2 - 4);
      ctx.font = '12px "Architects Daughter", cursive, sans-serif';
      ctx.fillText('🪙 Scratch with coin or key', width / 2, height / 2 + 20);
    } else if (foilType === 'gold') {
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, '#ca8a04');
      grad.addColorStop(0.3, '#fef08a');
      grad.addColorStop(0.5, '#eab308');
      grad.addColorStop(0.8, '#fde047');
      grad.addColorStop(1, '#a16207');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Gold dust speckles
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      for (let i = 0; i < 150; i++) {
        const sx = Math.random() * width;
        const sy = Math.random() * height;
        ctx.beginPath();
        ctx.arc(sx, sy, Math.random() * 2 + 1, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = '#422006';
      ctx.fillRect(width / 2 - 120, height / 2 - 40, 240, 80);
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 3;
      ctx.strokeRect(width / 2 - 120, height / 2 - 40, 240, 80);
      ctx.fillStyle = '#fef08a';
      ctx.font = 'bold 18px "Permanent Marker", cursive, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('★ 24K GOLD VIP ★', width / 2, height / 2 - 4);
      ctx.font = '12px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('EXCLUSIVE SCRATCH DROP', width / 2, height / 2 + 20);
    } else if (foilType === 'holographic') {
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, '#ec4899');
      grad.addColorStop(0.25, '#8b5cf6');
      grad.addColorStop(0.5, '#06b6d4');
      grad.addColorStop(0.75, '#10b981');
      grad.addColorStop(1, '#f59e0b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Prismatic diagonal sheen
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.beginPath();
      ctx.moveTo(0, height);
      ctx.lineTo(width * 0.4, 0);
      ctx.lineTo(width * 0.6, 0);
      ctx.lineTo(0, height * 0.7);
      ctx.fill();

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(width / 2 - 110, height / 2 - 38, 220, 76);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.strokeRect(width / 2 - 110, height / 2 - 38, 220, 76);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 17px "Permanent Marker", cursive, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CYBER HOLOGRAM', width / 2, height / 2 - 4);
      ctx.font = '12px "Architects Daughter", cursive, sans-serif';
      ctx.fillStyle = '#f472b6';
      ctx.fillText('✨ Holographic Mystery Drop', width / 2, height / 2 + 20);
    }

    setClearedPct(0);
    setHasCelebrated(false);
    isAutoRevealingRef.current = false;
    strokeCountRef.current = 0;
    onPercentageChange(0);
  }, [foilType, onPercentageChange]);

  // Adjust canvas resolution to element dimensions
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      canvas.width = Math.round(rect.width);
      canvas.height = Math.round(rect.height);
      drawFoilCover();
    }
  }, [drawFoilCover]);

  useEffect(() => {
    resizeCanvas();
    const timer = setTimeout(resizeCanvas, 50);
    window.addEventListener('resize', resizeCanvas);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [resizeCanvas, doodleImgLoaded]);

  // Handle re-seal trigger
  useEffect(() => {
    if (resealTrigger > 0) {
      isAutoRevealingRef.current = false;
      strokeCountRef.current = 0;
      drawFoilCover();
      if (soundEnabled) {
        scratchAudio.playChime(440);
      }
    }
  }, [resealTrigger, drawFoilCover, soundEnabled]);

  // Handle magic auto-reveal trigger
  useEffect(() => {
    if (magicRevealTrigger > 0) {
      triggerAutoFullScratch();
    }
  }, [magicRevealTrigger, triggerAutoFullScratch]);

  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const scratchAtPoint = (ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) => {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    if (tool.shape === 'sharp') {
      ctx.ellipse(x, y, radius * 0.7, radius * 1.5, Math.PI / 4, 0, Math.PI * 2);
    } else if (tool.shape === 'brush') {
      ctx.roundRect(x - radius, y - radius * 0.7, radius * 2, radius * 1.4, 8);
    } else {
      ctx.arc(x, y, radius, 0, Math.PI * 2);
    }
    ctx.fill();
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (hasCelebrated || isAutoRevealingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);

    isDrawingRef.current = true;
    strokeCountRef.current += 1;
    const pt = getCanvasCoords(e);
    lastPointRef.current = pt;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const effectiveRadius = tool.radius * brushMultiplier;
    scratchAtPoint(ctx, pt.x, pt.y, effectiveRadius);

    if (soundEnabled) {
      scratchAudio.startScratchSound(tool.soundPitch);
    }

    spawnParticles(pt.x, pt.y);
  };

  const spawnParticles = (x: number, y: number) => {
    const color =
      foilType === 'gold' ? '#facc15' : foilType === 'holographic' ? '#38bdf8' : '#ffffff';
    const newParticles = Array.from({ length: 3 }).map(() => ({
      id: Math.random(),
      x: x + (Math.random() * 24 - 12),
      y: y + (Math.random() * 24 - 12),
      color,
    }));
    setScratchParticles((prev) => [...prev.slice(-12), ...newParticles]);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !lastPointRef.current || hasCelebrated || isAutoRevealingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const currentPt = getCanvasCoords(e);
    const dist = distanceBetween(lastPointRef.current, currentPt);

    const effectiveRadius = tool.radius * brushMultiplier;
    const points = interpolatePoints(lastPointRef.current, currentPt, Math.max(3, effectiveRadius * 0.35));

    for (const pt of points) {
      scratchAtPoint(ctx, pt.x, pt.y, effectiveRadius);
    }

    if (soundEnabled) {
      scratchAudio.updateScratchVelocity(dist);
    }

    lastPointRef.current = currentPt;

    if (Math.random() > 0.4) {
      spawnParticles(currentPt.x, currentPt.y);
    }

    // Measure scratch: once user scratches a little (cleared >= 3% or after 2 gesture strokes), auto fully scratch!
    const now = performance.now();
    if (now - lastSampleTimeRef.current > 60) {
      lastSampleTimeRef.current = now;
      try {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pct = calculateClearedPercentage(imgData, 12, 30);
        setClearedPct(pct);
        onPercentageChange(pct);

        // "if i scratch a little it should auto fully scratched"
        if (pct >= 3 || strokeCountRef.current >= 2) {
          triggerAutoFullScratch();
        }
      } catch {
        // ignore
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDrawingRef.current = false;
    lastPointRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    if (soundEnabled) {
      scratchAudio.stopScratchSound();
    }
    // "if i scratch a little it should auto fully scratched"
    if (strokeCountRef.current >= 1 && !hasCelebrated && !isAutoRevealingRef.current) {
      triggerAutoFullScratch();
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-[4/5] rounded-2xl overflow-hidden bg-black border-2 border-white/90 shadow-[4px_4px_0px_0px_#ffffff] select-none"
      data-testid="scratch-card-container"
    >
      {/* Revealed Photo Underneath */}
      <img
        src={imageSrc}
        alt="Mystery Post Revealed"
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        crossOrigin="anonymous"
      />

      {/* Chalkboard photo overlay gradient at bottom */}
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />

      {/* Interactive Scratch Canvas */}
      <canvas
        ref={canvasRef}
        data-testid="scratch-canvas"
        className={`scratch-canvas absolute inset-0 w-full h-full cursor-crosshair z-10 transition-opacity duration-300 ${
          isPeeking ? 'opacity-20' : 'opacity-100'
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      {/* Scratch Flying Chalk Dust Particles */}
      <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
        {scratchParticles.map((p) => (
          <span
            key={p.id}
            className="absolute w-1.5 h-1.5 rounded-full animate-ping pointer-events-none"
            style={{
              left: p.x,
              top: p.y,
              backgroundColor: p.color,
            }}
          />
        ))}
      </div>

      {/* Reveal Milestone Banner */}
      {clearedPct >= 72 && (
        <div className="absolute top-4 inset-x-4 z-30 flex items-center justify-between px-3.5 py-2 bg-black/90 border-2 border-white rounded-xl shadow-[3px_3px_0px_0px_#ffffff] backdrop-blur-md animate-bounce">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-400" />
            <span className="font-marker text-xs uppercase tracking-wide text-white">
              Photo Unlocked! ({clearedPct}%)
            </span>
          </div>
          <div className="flex items-center gap-1 text-[11px] font-doodle text-yellow-300">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Community Verified</span>
          </div>
        </div>
      )}

      {/* Peeking Indicator Banner */}
      {isPeeking && (
        <div className="absolute top-4 inset-x-4 z-30 text-center py-2 bg-yellow-400 text-black font-marker text-xs rounded-lg border-2 border-black animate-pulse">
          👀 X-RAY PEEK ACTIVE (1.5s)
        </div>
      )}
    </div>
  );
};
