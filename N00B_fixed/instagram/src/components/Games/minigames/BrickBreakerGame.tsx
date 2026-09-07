import React, { useState, useEffect, useRef } from 'react';
import { Play, RotateCcw } from 'lucide-react';

interface BrickBreakerGameProps {
  onGameOver: (result: 'win' | 'tie' | 'loss', finalScore: number) => void;
}

export const BrickBreakerGame: React.FC<BrickBreakerGameProps> = ({ onGameOver }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const gameStateRef = useRef<any>({});

  const TOTAL_BRICKS = 18;

  const startGame = () => {
    setIsPlaying(true);
    setScore(0);
    setLives(3);

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const brickRowCount = 3;
    const brickColumnCount = 6;
    const brickWidth = 36;
    const brickHeight = 12;
    const brickPadding = 6;
    const brickOffsetTop = 20;
    const brickOffsetLeft = 14;

    const bricks: any[][] = [];
    for (let c = 0; c < brickColumnCount; c++) {
      bricks[c] = [];
      for (let r = 0; r < brickRowCount; r++) {
        bricks[c][r] = { x: 0, y: 0, status: 1 };
      }
    }

    let x = canvas.width / 2;
    let y = canvas.height - 30;
    let dx = 2.2;
    let dy = -2.2;
    const ballRadius = 5;

    const paddleHeight = 8;
    const paddleWidth = 60;
    let paddleX = (canvas.width - paddleWidth) / 2;

    let rightPressed = false;
    let leftPressed = false;
    let currentScore = 0;
    let currentLives = 3;

    gameStateRef.current = {
      animationId: 0,
      active: true
    };

    const keyDownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Right' || e.key === 'ArrowRight' || e.key === 'd') rightPressed = true;
      else if (e.key === 'Left' || e.key === 'ArrowLeft' || e.key === 'a') leftPressed = true;
    };

    const keyUpHandler = (e: KeyboardEvent) => {
      if (e.key === 'Right' || e.key === 'ArrowRight' || e.key === 'd') rightPressed = false;
      else if (e.key === 'Left' || e.key === 'ArrowLeft' || e.key === 'a') leftPressed = false;
    };

    const mouseMoveHandler = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      if (relativeX > 0 && relativeX < canvas.width) {
        paddleX = Math.max(0, Math.min(canvas.width - paddleWidth, relativeX - paddleWidth / 2));
      }
    };

    const touchMoveHandler = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const rect = canvas.getBoundingClientRect();
        const relativeX = e.touches[0].clientX - rect.left;
        if (relativeX > 0 && relativeX < canvas.width) {
          paddleX = Math.max(0, Math.min(canvas.width - paddleWidth, relativeX - paddleWidth / 2));
        }
      }
    };

    window.addEventListener('keydown', keyDownHandler);
    window.addEventListener('keyup', keyUpHandler);
    canvas.addEventListener('mousemove', mouseMoveHandler);
    canvas.addEventListener('touchmove', touchMoveHandler, { passive: true });

    function collisionDetection() {
      for (let c = 0; c < brickColumnCount; c++) {
        for (let r = 0; r < brickRowCount; r++) {
          const b = bricks[c][r];
          if (b.status === 1) {
            if (x > b.x && x < b.x + brickWidth && y > b.y && y < b.y + brickHeight) {
              dy = -dy;
              b.status = 0;
              currentScore++;
              setScore(currentScore);

              if (currentScore === TOTAL_BRICKS) {
                cancelAnimationFrame(gameStateRef.current.animationId);
                setIsPlaying(false);
                onGameOver('win', 100);
                return;
              }
            }
          }
        }
      }
    }

    function draw() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw Bricks
      for (let c = 0; c < brickColumnCount; c++) {
        for (let r = 0; r < brickRowCount; r++) {
          if (bricks[c][r].status === 1) {
            const brickX = c * (brickWidth + brickPadding) + brickOffsetLeft;
            const brickY = r * (brickHeight + brickPadding) + brickOffsetTop;
            bricks[c][r].x = brickX;
            bricks[c][r].y = brickY;
            ctx.beginPath();
            ctx.rect(brickX, brickY, brickWidth, brickHeight);
            ctx.fillStyle = r === 0 ? '#00FF66' : r === 1 ? '#06b6d4' : '#ec4899';
            ctx.fill();
            ctx.closePath();
          }
        }
      }

      // Draw Ball
      ctx.beginPath();
      ctx.arc(x, y, ballRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.closePath();

      // Draw Paddle
      ctx.beginPath();
      ctx.rect(paddleX, canvas.height - paddleHeight - 8, paddleWidth, paddleHeight);
      ctx.fillStyle = '#00FF66';
      ctx.fill();
      ctx.closePath();

      collisionDetection();

      if (x + dx > canvas.width - ballRadius || x + dx < ballRadius) {
        dx = -dx;
      }
      if (y + dy < ballRadius) {
        dy = -dy;
      } else if (y + dy > canvas.height - paddleHeight - 8 - ballRadius) {
        if (x > paddleX && x < paddleX + paddleWidth) {
          dy = -Math.abs(dy);
          // Angle ball depending on where it hit paddle
          const hitSpot = (x - (paddleX + paddleWidth / 2)) / (paddleWidth / 2);
          dx = hitSpot * 3;
        } else if (y + dy > canvas.height - ballRadius) {
          currentLives--;
          setLives(currentLives);
          if (currentLives <= 0) {
            cancelAnimationFrame(gameStateRef.current.animationId);
            setIsPlaying(false);
            const result = currentScore >= 8 ? 'win' : currentScore >= 4 ? 'tie' : 'loss';
            onGameOver(result, currentScore * 5);
            return;
          } else {
            x = canvas.width / 2;
            y = canvas.height - 30;
            dx = 2.2;
            dy = -2.2;
            paddleX = (canvas.width - paddleWidth) / 2;
          }
        }
      }

      if (rightPressed && paddleX < canvas.width - paddleWidth) {
        paddleX += 4;
      } else if (leftPressed && paddleX > 0) {
        paddleX -= 4;
      }

      x += dx;
      y += dy;

      gameStateRef.current.animationId = requestAnimationFrame(draw);
    }

    draw();
  };

  useEffect(() => {
    return () => {
      if (gameStateRef.current?.animationId) {
        cancelAnimationFrame(gameStateRef.current.animationId);
      }
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center p-3 w-full max-w-sm mx-auto">
      <div className="flex items-center justify-between w-full mb-3 px-3 py-1.5 bg-zinc-900 rounded-xl border border-zinc-800 text-xs">
        <span className="font-bold text-zinc-300">Bricks: <strong className="text-[#00FF66]">{score}/{TOTAL_BRICKS}</strong></span>
        <span className="font-bold text-zinc-300">Lives: <strong className="text-red-400">{'❤️'.repeat(lives)}</strong></span>
      </div>

      <div className="relative bg-zinc-950 border-2 border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
        <canvas ref={canvasRef} width={280} height={240} className="block cursor-none" />

        {!isPlaying && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-xs flex flex-col items-center justify-center p-4 text-center">
            <h3 className="text-lg font-black text-white mb-1">🧱 Neon Brick Smasher</h3>
            <p className="text-xs text-zinc-400 mb-4">Smash all bricks with the energetic laser ball!</p>
            <button
              onClick={startGame}
              className="px-5 py-2.5 bg-[#00FF66] text-black font-black text-xs rounded-xl shadow-[0_0_15px_rgba(0,255,102,0.4)] flex items-center gap-1.5 cursor-pointer hover:scale-105 transition-all"
            >
              <Play className="w-4 h-4 fill-black" /> Play Now
            </button>
          </div>
        )}
      </div>

      <p className="text-[11px] text-zinc-500 mt-2 text-center">
        Slide mouse/finger or use <kbd className="px-1 py-0.5 bg-zinc-900 rounded text-zinc-300 border border-zinc-800">Arrow Keys</kbd>
      </p>
    </div>
  );
};
