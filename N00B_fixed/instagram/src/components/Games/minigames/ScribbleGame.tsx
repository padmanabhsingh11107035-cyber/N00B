import React, { useState, useRef, useEffect } from 'react';
import { RotateCcw, Check, Sparkles, Pencil, Eraser, Trash2 } from 'lucide-react';
import confetti from 'canvas-confetti';

interface ScribbleGameProps {
  onGameOver: (score: number, pointsEarned: number) => void;
  currentUserUsername: string;
}

const PROMPT_WORDS = [
  { word: 'Cat', hint: 'Pet with whiskers', hints: ['cat', 'kitten', 'kitty'] },
  { word: 'Pizza', hint: 'Cheesy Italian slice', hints: ['pizza', 'pie', 'slice'] },
  { word: 'Rocket', hint: 'Flies into outer space', hints: ['rocket', 'spaceship', 'shuttle'] },
  { word: 'Sun', hint: 'Shines bright in daytime', hints: ['sun', 'sunshine', 'sunny'] },
  { word: 'Sword', hint: 'Medieval knight weapon', hints: ['sword', 'blade', 'katana'] },
  { word: 'Guitar', hint: 'Six-string music instrument', hints: ['guitar', 'music', 'acoustic'] },
  { word: 'Robot', hint: 'Mechanical cyber machine', hints: ['robot', 'bot', 'android', 'cyborg'] },
  { word: 'Diamond', hint: 'Precious sparkling gemstone', hints: ['diamond', 'gem', 'jewel', 'crystal'] }
];

const COLORS = ['#ffffff', '#ff4e6a', '#38bdf8', '#00FF66', '#fbbf24', '#a855f7', '#f97316'];

export const ScribbleGame: React.FC<ScribbleGameProps> = ({ onGameOver }) => {
  const [wordIndex, setWordIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(45);
  const [guessInput, setGuessInput] = useState('');
  const [color, setColor] = useState('#ffffff');
  const [brushSize, setBrushSize] = useState(4);
  const [isEraser, setIsEraser] = useState(false);
  const [solvedCount, setSolvedCount] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [gameActive, setGameActive] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const currentPrompt = PROMPT_WORDS[wordIndex % PROMPT_WORDS.length];

  useEffect(() => {
    if (!gameActive) return;
    if (timeLeft <= 0) {
      finishGame();
      return;
    }
    const timer = setInterval(() => {
      setTimeLeft((t) => t - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft, gameActive]);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#0f0f13';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  useEffect(() => {
    clearCanvas();
  }, [wordIndex]);

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY
      };
    } else {
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    isDrawing.current = true;
    const pos = getCoordinates(e);
    lastPos.current = pos;
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentPos = getCoordinates(e);

    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(currentPos.x, currentPos.y);
    ctx.strokeStyle = isEraser ? '#0f0f13' : color;
    ctx.lineWidth = isEraser ? brushSize * 3 : brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    lastPos.current = currentPos;
  };

  const stopDrawing = () => {
    isDrawing.current = false;
  };

  const handleGuessSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = guessInput.trim().toLowerCase();
    if (!clean) return;

    if (currentPrompt.hints.includes(clean)) {
      confetti({ particleCount: 30, spread: 60, origin: { y: 0.6 } });
      setFeedback(`🎉 Correct! It's ${currentPrompt.word}! (+100 Pts)`);
      setSolvedCount((c) => c + 1);
      setGuessInput('');
      setTimeout(() => {
        setFeedback(null);
        setWordIndex((w) => w + 1);
      }, 1200);
    } else {
      setFeedback('❌ Not quite! Try guessing again or look at hint.');
      setTimeout(() => setFeedback(null), 1500);
    }
  };

  const finishGame = () => {
    setGameActive(false);
    const finalScore = solvedCount * 100 + timeLeft * 5;
    const pointsEarned = 60 + solvedCount * 20;
    confetti({ particleCount: 60, spread: 70, origin: { y: 0.5 } });
    onGameOver(finalScore, pointsEarned);
  };

  return (
    <div className="w-full max-w-lg mx-auto bg-zinc-950 p-4 sm:p-6 rounded-3xl border border-white/10 text-white space-y-4 select-none">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-bold text-purple-400 uppercase tracking-widest block">Scribble & Guess</span>
          <span className="text-sm font-black text-white">Prompt: Draw & Guess</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 bg-purple-500/20 text-purple-300 font-mono font-bold rounded-xl border border-purple-500/30 text-xs">
            ⏱ {timeLeft}s
          </div>
          <div className="px-3 py-1 bg-emerald-500/20 text-emerald-300 font-bold rounded-xl border border-emerald-500/30 text-xs flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> {solvedCount} Solved
          </div>
        </div>
      </div>

      {/* Target Word Prompt Box */}
      <div className="p-3 bg-purple-950/40 rounded-2xl border border-purple-500/30 flex items-center justify-between">
        <div>
          <span className="text-[10px] text-zinc-400 block font-semibold">TARGET WORD TO DRAW:</span>
          <span className="text-base font-extrabold text-white tracking-wider">{currentPrompt.word}</span>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-purple-300 font-medium">💡 Hint: {currentPrompt.hint}</span>
        </div>
      </div>

      {/* Drawing Canvas */}
      <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-[#0f0f13] shadow-2xl touch-none">
        <canvas
          ref={canvasRef}
          width={460}
          height={260}
          className="w-full h-[220px] sm:h-[260px] cursor-crosshair block"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        {feedback && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
            <span className="text-sm font-extrabold text-white text-center animate-bounce">{feedback}</span>
          </div>
        )}
      </div>

      {/* Drawing Tools */}
      <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
        {/* Colors */}
        <div className="flex items-center gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setColor(c);
                setIsEraser(false);
              }}
              style={{ backgroundColor: c }}
              className={`w-6 h-6 rounded-full transition-transform cursor-pointer ${
                color === c && !isEraser ? 'scale-125 ring-2 ring-white shadow-lg' : 'opacity-80 hover:opacity-100'
              }`}
            />
          ))}
        </div>

        {/* Brush Size / Eraser / Clear */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsEraser(false)}
            className={`p-2 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer ${
              !isEraser ? 'bg-purple-600 text-white' : 'bg-zinc-900 text-zinc-400'
            }`}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setIsEraser(true)}
            className={`p-2 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer ${
              isEraser ? 'bg-pink-600 text-white' : 'bg-zinc-900 text-zinc-400'
            }`}
          >
            <Eraser className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={clearCanvas}
            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
            title="Clear Board"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Guesser Input Field */}
      <form onSubmit={handleGuessSubmit} className="flex gap-2">
        <input
          type="text"
          value={guessInput}
          onChange={(e) => setGuessInput(e.target.value)}
          placeholder="Type your guess here..."
          className="flex-1 bg-zinc-900 text-xs text-white px-4 py-3 rounded-2xl border border-white/10 outline-none focus:border-purple-500"
        />
        <button
          type="submit"
          className="px-5 py-3 bg-gradient-to-r from-purple-600 to-pink-600 font-bold text-xs text-white rounded-2xl shadow-lg hover:scale-102 transition-transform cursor-pointer flex items-center gap-1"
        >
          <Check className="w-4 h-4" /> Guess
        </button>
      </form>
    </div>
  );
};
