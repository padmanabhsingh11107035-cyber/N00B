import React, { useState, useEffect, useRef } from 'react';
import { RotateCcw, Trophy, Play, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';

interface CyberSnakeGameProps {
  onGameOver: (result: 'win' | 'tie' | 'loss', finalScore: number) => void;
  targetScore?: number;
}

const GRID_SIZE = 16;
const INITIAL_SNAKE = [
  { x: 8, y: 8 },
  { x: 8, y: 9 },
  { x: 8, y: 10 }
];

export const CyberSnakeGame: React.FC<CyberSnakeGameProps> = ({
  onGameOver,
  targetScore = 8
}) => {
  const [snake, setSnake] = useState<{ x: number; y: number }[]>(INITIAL_SNAKE);
  const [food, setFood] = useState<{ x: number; y: number }>({ x: 5, y: 5 });
  const [direction, setDirection] = useState<'UP' | 'DOWN' | 'LEFT' | 'RIGHT'>('UP');
  const [score, setScore] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);

  const directionRef = useRef(direction);
  directionRef.current = direction;

  const generateFood = (currentSnake: { x: number; y: number }[]) => {
    let newFood: { x: number; y: number };
    let collision = true;
    while (collision) {
      newFood = {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE)
      };
      collision = currentSnake.some((segment) => segment.x === newFood.x && segment.y === newFood.y);
    }
    return newFood!;
  };

  const startGame = () => {
    setSnake(INITIAL_SNAKE);
    setDirection('UP');
    setScore(0);
    setIsGameOver(false);
    setFood(generateFood(INITIAL_SNAKE));
    setIsPlaying(true);
  };

  useEffect(() => {
    if (!isPlaying || isGameOver) return;

    const gameInterval = setInterval(() => {
      setSnake((prevSnake) => {
        const head = { ...prevSnake[0] };
        const currentDir = directionRef.current;

        if (currentDir === 'UP') head.y -= 1;
        if (currentDir === 'DOWN') head.y += 1;
        if (currentDir === 'LEFT') head.x -= 1;
        if (currentDir === 'RIGHT') head.x += 1;

        // Wall collision
        if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
          setIsGameOver(true);
          setIsPlaying(false);
          const result = score >= targetScore ? 'win' : score >= Math.floor(targetScore / 2) ? 'tie' : 'loss';
          onGameOver(result, score);
          return prevSnake;
        }

        // Self collision
        if (prevSnake.some((segment) => segment.x === head.x && segment.y === head.y)) {
          setIsGameOver(true);
          setIsPlaying(false);
          const result = score >= targetScore ? 'win' : score >= Math.floor(targetScore / 2) ? 'tie' : 'loss';
          onGameOver(result, score);
          return prevSnake;
        }

        const newSnake = [head, ...prevSnake];

        // Food collision
        if (head.x === food.x && head.y === food.y) {
          const newScore = score + 1;
          setScore(newScore);
          setFood(generateFood(newSnake));

          if (newScore >= targetScore) {
            setIsGameOver(true);
            setIsPlaying(false);
            onGameOver('win', newScore);
          }
        } else {
          newSnake.pop();
        }

        return newSnake;
      });
    }, 130);

    return () => clearInterval(gameInterval);
  }, [isPlaying, isGameOver, food, score, targetScore]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPlaying) return;
      const key = e.key;

      if ((key === 'ArrowUp' || key === 'w' || key === 'W') && directionRef.current !== 'DOWN') {
        setDirection('UP');
      } else if ((key === 'ArrowDown' || key === 's' || key === 'S') && directionRef.current !== 'UP') {
        setDirection('DOWN');
      } else if ((key === 'ArrowLeft' || key === 'a' || key === 'A') && directionRef.current !== 'RIGHT') {
        setDirection('LEFT');
      } else if ((key === 'ArrowRight' || key === 'd' || key === 'D') && directionRef.current !== 'LEFT') {
        setDirection('RIGHT');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying]);

  return (
    <div className="flex flex-col items-center justify-center p-2 w-full max-w-sm mx-auto">
      {/* Score Header */}
      <div className="flex items-center justify-between w-full mb-3 px-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400 font-semibold">Orbs:</span>
          <span className="text-sm font-black text-[#00FF66]">{score} / {targetScore}</span>
        </div>
        <div className="text-[11px] text-zinc-400 bg-zinc-900 px-2.5 py-1 rounded-full border border-zinc-800">
          Target to Win: <strong className="text-white">{targetScore}</strong>
        </div>
      </div>

      {/* Snake Canvas Grid */}
      <div className="relative w-64 h-64 sm:w-72 sm:h-72 bg-zinc-950 border-2 border-[#00FF66]/40 rounded-2xl overflow-hidden shadow-[0_0_20px_rgba(0,255,102,0.15)] grid grid-cols-16 grid-rows-16">
        {/* Render Grid Cells */}
        {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, idx) => {
          const x = idx % GRID_SIZE;
          const y = Math.floor(idx / GRID_SIZE);
          const isHead = snake[0]?.x === x && snake[0]?.y === y;
          const isBody = snake.slice(1).some((s) => s.x === x && s.y === y);
          const isFood = food.x === x && food.y === y;

          return (
            <div
              key={idx}
              className={`w-full h-full ${
                isHead
                  ? 'bg-[#00FF66] rounded-sm shadow-[0_0_8px_#00FF66]'
                  : isBody
                  ? 'bg-emerald-500/80 rounded-xs'
                  : isFood
                  ? 'bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_#ef4444]'
                  : 'border-[0.5px] border-zinc-900/40'
              }`}
            />
          );
        })}

        {/* Start Overlay */}
        {!isPlaying && !isGameOver && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-xs flex flex-col items-center justify-center p-4 text-center z-10">
            <span className="text-lg font-black text-white mb-1">🐍 Cyber Snake</span>
            <p className="text-xs text-zinc-400 mb-4">Collect {targetScore} glowing power orbs to win!</p>
            <button
              onClick={startGame}
              className="px-5 py-2.5 bg-[#00FF66] hover:bg-emerald-400 text-black font-black text-xs rounded-xl shadow-[0_0_15px_rgba(0,255,102,0.4)] flex items-center gap-1.5 cursor-pointer transition-transform hover:scale-105"
            >
              <Play className="w-4 h-4 fill-black" /> Start Game
            </button>
          </div>
        )}
      </div>

      {/* Mobile Touch D-Pad */}
      <div className="mt-4 flex flex-col items-center gap-1.5 sm:hidden">
        <button
          onClick={() => directionRef.current !== 'DOWN' && setDirection('UP')}
          className="p-3 bg-zinc-900 active:bg-[#00FF66] active:text-black rounded-xl border border-zinc-800 text-white font-bold"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-4">
          <button
            onClick={() => directionRef.current !== 'RIGHT' && setDirection('LEFT')}
            className="p-3 bg-zinc-900 active:bg-[#00FF66] active:text-black rounded-xl border border-zinc-800 text-white font-bold"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => directionRef.current !== 'UP' && setDirection('DOWN')}
            className="p-3 bg-zinc-900 active:bg-[#00FF66] active:text-black rounded-xl border border-zinc-800 text-white font-bold"
          >
            <ArrowDown className="w-5 h-5" />
          </button>
          <button
            onClick={() => directionRef.current !== 'LEFT' && setDirection('RIGHT')}
            className="p-3 bg-zinc-900 active:bg-[#00FF66] active:text-black rounded-xl border border-zinc-800 text-white font-bold"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <p className="text-[11px] text-zinc-500 mt-3 text-center hidden sm:block">
        Use <kbd className="px-1.5 py-0.5 bg-zinc-900 rounded border border-zinc-800 text-zinc-300">Arrow Keys</kbd> or <kbd className="px-1.5 py-0.5 bg-zinc-900 rounded border border-zinc-800 text-zinc-300">WASD</kbd> to steer
      </p>
    </div>
  );
};
