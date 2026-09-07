import React, { useState, useEffect, useRef } from 'react';
import { Play, Zap } from 'lucide-react';

interface CyberDroneGameProps {
  onGameOver: (result: 'win' | 'tie' | 'loss', finalScore: number) => void;
  targetScore?: number;
}

export const CyberDroneGame: React.FC<CyberDroneGameProps> = ({
  onGameOver,
  targetScore = 5
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameLoopRef = useRef<any>({});

  const startGame = () => {
    setIsPlaying(true);
    setScore(0);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let droneY = canvas.height / 2;
    let velocity = 0;
    const gravity = 0.22;
    const jump = -4.2;

    const barriers: { x: number; topH: number; bottomH: number; passed: boolean }[] = [];
    const barrierWidth = 24;
    const gap = 80;
    let frame = 0;
    let currentScore = 0;

    gameLoopRef.current = { active: true };

    const handleJump = () => {
      velocity = jump;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === 'ArrowUp' || e.key === 'w') {
        handleJump();
      }
    };

    canvas.addEventListener('click', handleJump);
    window.addEventListener('keydown', handleKeyDown);

    const loop = () => {
      if (!gameLoopRef.current.active) return;
      frame++;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Physics
      velocity += gravity;
      droneY += velocity;

      // Spawn barriers
      if (frame % 85 === 0) {
        const topH = Math.floor(Math.random() * (canvas.height - gap - 40)) + 20;
        barriers.push({
          x: canvas.width,
          topH,
          bottomH: canvas.height - topH - gap,
          passed: false
        });
      }

      // Draw Drone (Neon Circle / Ship)
      ctx.beginPath();
      ctx.arc(45, droneY, 9, 0, Math.PI * 2);
      ctx.fillStyle = '#00FF66';
      ctx.shadowColor = '#00FF66';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.closePath();

      // Check boundary death
      if (droneY < 0 || droneY > canvas.height) {
        endGame(currentScore);
        return;
      }

      // Update & draw barriers
      for (let i = barriers.length - 1; i >= 0; i--) {
        const b = barriers[i];
        b.x -= 1.8;

        // Top laser
        ctx.fillStyle = '#ef4444';
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 8;
        ctx.fillRect(b.x, 0, barrierWidth, b.topH);

        // Bottom laser
        ctx.fillRect(b.x, canvas.height - b.bottomH, barrierWidth, b.bottomH);
        ctx.shadowBlur = 0;

        // Collision detection
        if (
          45 + 9 > b.x &&
          45 - 9 < b.x + barrierWidth &&
          (droneY - 9 < b.topH || droneY + 9 > canvas.height - b.bottomH)
        ) {
          endGame(currentScore);
          return;
        }

        // Passed score
        if (!b.passed && b.x + barrierWidth < 45) {
          b.passed = true;
          currentScore++;
          setScore(currentScore);

          if (currentScore >= targetScore) {
            gameLoopRef.current.active = false;
            setIsPlaying(false);
            onGameOver('win', currentScore * 20);
            return;
          }
        }

        if (b.x < -barrierWidth) {
          barriers.splice(i, 1);
        }
      }

      gameLoopRef.current.animId = requestAnimationFrame(loop);
    };

    const endGame = (finalScore: number) => {
      gameLoopRef.current.active = false;
      setIsPlaying(false);
      const result = finalScore >= targetScore ? 'win' : finalScore >= 2 ? 'tie' : 'loss';
      onGameOver(result, finalScore * 20);
    };

    gameLoopRef.current.animId = requestAnimationFrame(loop);
  };

  useEffect(() => {
    return () => {
      if (gameLoopRef.current) {
        gameLoopRef.current.active = false;
        if (gameLoopRef.current.animId) cancelAnimationFrame(gameLoopRef.current.animId);
      }
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center p-3 w-full max-w-sm mx-auto">
      <div className="flex items-center justify-between w-full mb-3 px-3 py-1.5 bg-zinc-900 rounded-xl border border-zinc-800 text-xs">
        <span className="font-bold text-zinc-300">Gates Cleared: <strong className="text-[#00FF66]">{score} / {targetScore}</strong></span>
        <span className="text-[11px] text-zinc-500 font-bold">Target: {targetScore} to Win</span>
      </div>

      <div className="relative bg-zinc-950 border-2 border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
        <canvas ref={canvasRef} width={280} height={240} className="block cursor-pointer" />

        {!isPlaying && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-xs flex flex-col items-center justify-center p-4 text-center">
            <h3 className="text-lg font-black text-white mb-1">🛸 Cyber Drone Dash</h3>
            <p className="text-xs text-zinc-400 mb-4">Tap to flap / thrust and pass through {targetScore} laser gates!</p>
            <button
              onClick={startGame}
              className="px-5 py-2.5 bg-[#00FF66] text-black font-black text-xs rounded-xl shadow-[0_0_15px_rgba(0,255,102,0.4)] flex items-center gap-1.5 cursor-pointer hover:scale-105 transition-all"
            >
              <Play className="w-4 h-4 fill-black" /> Launch Drone
            </button>
          </div>
        )}
      </div>

      <p className="text-[11px] text-zinc-500 mt-2 text-center">
        Tap the screen or press <kbd className="px-1 py-0.5 bg-zinc-900 rounded text-zinc-300 border border-zinc-800">Space</kbd> to fly upward
      </p>
    </div>
  );
};
