import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface SubwayRunnerGameProps {
  onSurvivalEnd: (survivalSeconds: number) => void;
  onExit: () => void;
}

type ObstacleType = 'train' | 'barrier' | 'tunnel' | 'cow';
type PlayerState = 'running' | 'jumping' | 'sliding';

interface Obstacle {
  id: number;
  lane: -1 | 0 | 1;
  type: ObstacleType;
  progress: number; // 0 = just spawned (far away), 1 = at the player
  passed: boolean;
}

interface Coin {
  id: number;
  lane: -1 | 0 | 1;
  progress: number;
  collected: boolean;
}

const LANES: (-1 | 0 | 1)[] = [-1, 0, 1];
const JUMP_DURATION_MS = 550;
const SLIDE_DURATION_MS = 550;
const COLLISION_PROGRESS = 0.93;

// Canvas is drawn in a fixed logical resolution and scaled to fill the
// real screen each frame, so the game plays identically on any device.
const LOGICAL_W = 400;
const LOGICAL_H = 720;
const HORIZON_Y = LOGICAL_H * 0.24;
const GROUND_Y = LOGICAL_H * 0.86;
const MAX_LANE_SPREAD = LOGICAL_W * 0.42;

export const SubwayRunnerGame: React.FC<SubwayRunnerGameProps> = ({ onSurvivalEnd, onExit }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);

  const [isRunning, setIsRunning] = useState(true);
  const [displayScore, setDisplayScore] = useState(0);
  const [displayCoins, setDisplayCoins] = useState(0);

  // Mutable game state lives in refs so the render loop never depends on
  // React state (avoids re-render-driven stutter in a 60fps loop).
  const laneIndexRef = useRef(1); // 0=left, 1=center, 2=right
  const playerXRef = useRef(0); // current animated lane offset, -1..1
  const playerStateRef = useRef<PlayerState>('running');
  const playerStateUntilRef = useRef(0);
  const obstaclesRef = useRef<Obstacle[]>([]);
  const coinsRef = useRef<Coin[]>([]);
  const nextIdRef = useRef(1);
  const elapsedSecRef = useRef(0);
  const speedRef = useRef(0.32); // progress units per second
  const spawnCooldownRef = useRef(0);
  const coinsCollectedRef = useRef(0);
  const isRunningRef = useRef(true);
  const groundScrollRef = useRef(0);
  const hasEndedRef = useRef(false);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  const laneOffset = (lane: -1 | 0 | 1) => lane; // -1, 0, 1 map directly to normalized lane position

  const changeLane = (dir: -1 | 1) => {
    if (!isRunningRef.current) return;
    laneIndexRef.current = Math.max(0, Math.min(2, laneIndexRef.current + dir));
  };

  const jump = () => {
    if (!isRunningRef.current || playerStateRef.current !== 'running') return;
    playerStateRef.current = 'jumping';
    playerStateUntilRef.current = performance.now() + JUMP_DURATION_MS;
  };

  const slide = () => {
    if (!isRunningRef.current || playerStateRef.current !== 'running') return;
    playerStateRef.current = 'sliding';
    playerStateUntilRef.current = performance.now() + SLIDE_DURATION_MS;
  };

  // --- Input: touch swipes + keyboard (desktop/testing) ---
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      const THRESHOLD = 30;
      if (absX < THRESHOLD && absY < THRESHOLD) return;
      if (absX > absY) {
        changeLane(dx > 0 ? 1 : -1);
      } else if (dy < 0) {
        jump();
      } else {
        slide();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') changeLane(-1);
      else if (e.key === 'ArrowRight' || e.key === 'd') changeLane(1);
      else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === ' ') jump();
      else if (e.key === 'ArrowDown' || e.key === 's') slide();
    };

    const el = containerRef.current;
    el?.addEventListener('touchstart', onTouchStart, { passive: true });
    el?.addEventListener('touchmove', onTouchMove, { passive: false });
    el?.addEventListener('touchend', onTouchEnd);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      el?.removeEventListener('touchstart', onTouchStart);
      el?.removeEventListener('touchmove', onTouchMove);
      el?.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  // --- Main game loop ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const container = containerRef.current;
      if (!container) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = LOGICAL_W * dpr;
      canvas.height = LOGICAL_H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const spawnWave = () => {
      // Always leave at least one lane clear so every wave is survivable.
      const blockedCount = Math.random() < 0.35 ? 2 : 1;
      const shuffled = [...LANES].sort(() => Math.random() - 0.5);
      const blockedLanes = shuffled.slice(0, blockedCount);
      const types: ObstacleType[] = ['train', 'barrier', 'tunnel', 'cow'];
      for (const lane of blockedLanes) {
        obstaclesRef.current.push({
          id: nextIdRef.current++,
          lane,
          type: types[Math.floor(Math.random() * types.length)],
          progress: 0,
          passed: false
        });
      }
      // Coins in a clear lane, purely cosmetic bonus display.
      const clearLanes = LANES.filter((l) => !blockedLanes.includes(l));
      if (clearLanes.length > 0 && Math.random() < 0.8) {
        const lane = clearLanes[Math.floor(Math.random() * clearLanes.length)];
        coinsRef.current.push({ id: nextIdRef.current++, lane, progress: -0.15, collected: false });
      }
    };

    const drawScene = (progressGlobal: number) => {
      ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);

      // Sky
      const sky = ctx.createLinearGradient(0, 0, 0, HORIZON_Y);
      sky.addColorStop(0, '#ff9a56');
      sky.addColorStop(1, '#ffd08a');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, LOGICAL_W, HORIZON_Y);

      // Distant city silhouette
      ctx.fillStyle = 'rgba(120,70,40,0.35)';
      for (let i = 0; i < 8; i++) {
        const bw = 22 + (i % 3) * 10;
        const bh = 30 + ((i * 37) % 50);
        ctx.fillRect((i * LOGICAL_W) / 8, HORIZON_Y - bh, bw, bh);
      }

      // Ground
      const ground = ctx.createLinearGradient(0, HORIZON_Y, 0, LOGICAL_H);
      ground.addColorStop(0, '#7a5230');
      ground.addColorStop(1, '#3f2a18');
      ctx.fillStyle = ground;
      ctx.fillRect(0, HORIZON_Y, LOGICAL_W, LOGICAL_H - HORIZON_Y);

      // Railway sleepers scrolling toward viewer for a sense of speed
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 3;
      const sleeperCount = 14;
      for (let i = 0; i < sleeperCount; i++) {
        const t = (i / sleeperCount + groundScrollRef.current) % 1;
        const y = HORIZON_Y + t * (GROUND_Y + 40 - HORIZON_Y);
        const spread = MAX_LANE_SPREAD * 1.5 * (0.08 + t * 0.92);
        ctx.beginPath();
        ctx.moveTo(LOGICAL_W / 2 - spread, y);
        ctx.lineTo(LOGICAL_W / 2 + spread, y);
        ctx.stroke();
      }

      // Lane rails
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 2;
      for (const lane of [-0.5, 0.5]) {
        ctx.beginPath();
        ctx.moveTo(LOGICAL_W / 2 + lane * MAX_LANE_SPREAD * 0.08, HORIZON_Y);
        ctx.lineTo(LOGICAL_W / 2 + lane * MAX_LANE_SPREAD * 1.5, GROUND_Y + 60);
        ctx.stroke();
      }

      const project = (lane: number, progress: number) => {
        const eased = Math.pow(progress, 1.15);
        const y = HORIZON_Y + eased * (GROUND_Y - HORIZON_Y);
        const spread = MAX_LANE_SPREAD * (0.08 + eased * 0.92);
        const x = LOGICAL_W / 2 + lane * spread;
        const scale = 0.18 + eased * 0.95;
        return { x, y, scale };
      };

      // Coins
      for (const coin of coinsRef.current) {
        if (coin.collected || coin.progress < 0) continue;
        const { x, y, scale } = project(laneOffset(coin.lane), coin.progress);
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.fillStyle = '#ffd700';
        ctx.strokeStyle = '#b8860b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#8b6914';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('₹', 0, 1);
        ctx.restore();
      }

      // Obstacles, farthest first so nearer ones draw on top
      const sorted = [...obstaclesRef.current].sort((a, b) => a.progress - b.progress);
      for (const ob of sorted) {
        const { x, y, scale } = project(laneOffset(ob.lane), ob.progress);
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);

        if (ob.type === 'train') {
          ctx.fillStyle = '#1e5fa8';
          ctx.fillRect(-55, -140, 110, 140);
          ctx.fillStyle = '#e8f4ff';
          ctx.fillRect(-45, -125, 30, 35);
          ctx.fillRect(15, -125, 30, 35);
          ctx.fillStyle = '#ffcc00';
          ctx.fillRect(-55, -20, 110, 10);
          ctx.fillStyle = '#0a2f5c';
          ctx.font = 'bold 14px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('NOOB RLY', 0, -60);
        } else if (ob.type === 'barrier') {
          ctx.fillStyle = '#e8b923';
          ctx.fillRect(-50, -55, 100, 16);
          ctx.fillStyle = '#a6790f';
          ctx.fillRect(-45, -40, 10, 40);
          ctx.fillRect(35, -40, 10, 40);
          ctx.fillStyle = '#c0392b';
          for (let i = -45; i < 45; i += 20) {
            ctx.fillRect(i, -55, 10, 16);
          }
        } else if (ob.type === 'tunnel') {
          ctx.fillStyle = '#5a5a5a';
          ctx.fillRect(-60, -150, 120, 40);
          ctx.fillStyle = '#2f2f2f';
          ctx.fillRect(-60, -150, 120, 12);
          ctx.fillStyle = '#e8b923';
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('LOW BRIDGE', 0, -128);
        } else {
          // cow
          ctx.fillStyle = '#f5f0e6';
          ctx.beginPath();
          ctx.ellipse(0, -35, 40, 26, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#3a3a3a';
          ctx.beginPath();
          ctx.ellipse(-18, -40, 10, 8, 0, 0, Math.PI * 2);
          ctx.ellipse(15, -30, 12, 9, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#f5f0e6';
          ctx.beginPath();
          ctx.arc(32, -45, 14, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#8a6d3b';
          ctx.beginPath();
          ctx.moveTo(28, -55);
          ctx.lineTo(24, -66);
          ctx.lineTo(32, -58);
          ctx.fill();
          ctx.moveTo(38, -55);
          ctx.lineTo(42, -66);
          ctx.lineTo(34, -58);
          ctx.fill();
        }
        ctx.restore();
      }

      // Player (drawn last, fixed near the bottom)
      const state = playerStateRef.current;
      const px = LOGICAL_W / 2 + playerXRef.current * MAX_LANE_SPREAD * 1.5;
      const py = GROUND_Y + 55;
      let jumpLift = 0;
      if (state === 'jumping') {
        const t = 1 - Math.max(0, playerStateUntilRef.current - performance.now()) / JUMP_DURATION_MS;
        jumpLift = Math.sin(Math.min(1, t) * Math.PI) * 70;
      }
      const crouch = state === 'sliding' ? 0.55 : 1;

      ctx.save();
      ctx.translate(px, py - jumpLift);
      ctx.scale(1, crouch);
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(0, 8 / crouch, 32, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      // Body — simple Indian-tricolor jersey runner
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(-16, -55, 32, 30); // legs
      ctx.fillStyle = '#ff9933';
      ctx.fillRect(-20, -95, 40, 22);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-20, -80, 40, 8);
      ctx.fillStyle = '#138808';
      ctx.fillRect(-20, -73, 40, 8);
      // Head
      ctx.fillStyle = '#c98a5e';
      ctx.beginPath();
      ctx.arc(0, -108, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2b2b2b';
      ctx.beginPath();
      ctx.arc(0, -116, 14, Math.PI, 0);
      ctx.fill();
      ctx.restore();
    };

    const tick = (ts: number) => {
      if (!lastTsRef.current) lastTsRef.current = ts;
      const dt = Math.min(0.05, (ts - lastTsRef.current) / 1000);
      lastTsRef.current = ts;

      if (isRunningRef.current) {
        elapsedSecRef.current += dt;
        speedRef.current = 0.32 + Math.min(0.55, elapsedSecRef.current * 0.012);
        groundScrollRef.current += dt * (speedRef.current * 1.6);

        // Expire timed player states
        if (playerStateRef.current !== 'running' && performance.now() > playerStateUntilRef.current) {
          playerStateRef.current = 'running';
        }

        // Smoothly animate toward the target lane
        const targetX = laneOffset(LANES[laneIndexRef.current]);
        playerXRef.current += (targetX - playerXRef.current) * Math.min(1, dt * 10);

        // Spawn
        spawnCooldownRef.current -= dt;
        if (spawnCooldownRef.current <= 0) {
          spawnWave();
          spawnCooldownRef.current = Math.max(0.55, 1.15 - elapsedSecRef.current * 0.01);
        }

        // Advance obstacles + collision
        for (const ob of obstaclesRef.current) {
          ob.progress += dt * speedRef.current;
          if (!ob.passed && ob.progress >= COLLISION_PROGRESS && ob.progress < 1.05) {
            const sameLane = ob.lane === LANES[laneIndexRef.current];
            if (sameLane) {
              const dodged =
                (ob.type === 'barrier' || ob.type === 'cow') && playerStateRef.current === 'jumping'
                  ? true
                  : ob.type === 'tunnel' && playerStateRef.current === 'sliding'
                  ? true
                  : false;
              if (!dodged) {
                setIsRunning(false);
                if (!hasEndedRef.current) {
                  hasEndedRef.current = true;
                  onSurvivalEnd(Math.floor(elapsedSecRef.current));
                }
                return;
              }
            }
            ob.passed = true;
          }
        }
        obstaclesRef.current = obstaclesRef.current.filter((o) => o.progress < 1.15);

        // Advance coins + collection
        for (const coin of coinsRef.current) {
          if (coin.collected) continue;
          coin.progress += dt * speedRef.current;
          if (coin.progress >= COLLISION_PROGRESS && coin.progress < 1.05 && coin.lane === LANES[laneIndexRef.current]) {
            coin.collected = true;
            coinsCollectedRef.current += 1;
          }
        }
        coinsRef.current = coinsRef.current.filter((c) => c.progress < 1.15);

        setDisplayScore(Math.floor(elapsedSecRef.current) * 10);
        setDisplayCoins(coinsCollectedRef.current);
      }

      drawScene(elapsedSecRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[70] bg-black flex items-center justify-center select-none touch-none overscroll-none"
    >
      <div className="relative w-full h-full max-w-[500px] mx-auto">
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%' }}
          className="block"
        />

        {/* HUD */}
        <div className="absolute top-0 inset-x-0 p-4 flex items-start justify-between pointer-events-none">
          <div className="bg-black/50 backdrop-blur-md rounded-2xl px-3.5 py-2 border border-white/10">
            <div className="text-[10px] text-amber-300 font-bold uppercase tracking-wider">Score</div>
            <div className="text-lg font-black text-white leading-tight">{displayScore.toLocaleString()}</div>
          </div>
          <div className="bg-black/50 backdrop-blur-md rounded-2xl px-3.5 py-2 border border-white/10 flex items-center gap-1.5">
            <span className="text-amber-400">₹</span>
            <span className="text-sm font-black text-white">{displayCoins}</span>
          </div>
        </div>

        <div className="absolute top-4 right-4 pointer-events-auto" style={{ marginTop: '3.2rem' }}>
          <button
            onClick={onExit}
            className="p-2 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* On-screen controls for desktop testing / accessibility */}
        <div className="absolute bottom-6 inset-x-0 flex items-center justify-center gap-3 pointer-events-auto">
          <button onClick={() => changeLane(-1)} className="w-12 h-12 rounded-full bg-black/40 border border-white/20 text-white text-xl cursor-pointer active:scale-90 transition-transform">←</button>
          <button onClick={() => jump()} className="w-12 h-12 rounded-full bg-black/40 border border-white/20 text-white text-xl cursor-pointer active:scale-90 transition-transform">↑</button>
          <button onClick={() => slide()} className="w-12 h-12 rounded-full bg-black/40 border border-white/20 text-white text-xl cursor-pointer active:scale-90 transition-transform">↓</button>
          <button onClick={() => changeLane(1)} className="w-12 h-12 rounded-full bg-black/40 border border-white/20 text-white text-xl cursor-pointer active:scale-90 transition-transform">→</button>
        </div>
      </div>
    </div>
  );
};
