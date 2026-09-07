import React, { useState, useEffect } from 'react';
import { Zap, Clock } from 'lucide-react';

interface SpeedMathGameProps {
  onGameOver: (result: 'win' | 'tie' | 'loss', finalScore: number) => void;
  targetScore?: number;
}

interface MathQuestion {
  text: string;
  answer: number;
  options: number[];
}

export const SpeedMathGame: React.FC<SpeedMathGameProps> = ({
  onGameOver,
  targetScore = 6
}) => {
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(20);
  const [currentQ, setCurrentQ] = useState<MathQuestion | null>(null);
  const [streak, setStreak] = useState(0);

  const generateQuestion = (): MathQuestion => {
    const ops = ['+', '-', '×'];
    const op = ops[Math.floor(Math.random() * ops.length)];
    let a = Math.floor(Math.random() * 15) + 2;
    let b = Math.floor(Math.random() * 15) + 2;
    let ans = 0;

    if (op === '+') {
      ans = a + b;
    } else if (op === '-') {
      if (a < b) [a, b] = [b, a];
      ans = a - b;
    } else {
      a = Math.floor(Math.random() * 9) + 2;
      b = Math.floor(Math.random() * 9) + 2;
      ans = a * b;
    }

    const distractors = new Set<number>();
    distractors.add(ans);
    while (distractors.size < 4) {
      const offset = (Math.floor(Math.random() * 7) + 1) * (Math.random() > 0.5 ? 1 : -1);
      const wrong = Math.max(1, ans + offset);
      distractors.add(wrong);
    }

    const options = Array.from(distractors).sort(() => Math.random() - 0.5);
    return {
      text: `${a} ${op} ${b} = ?`,
      answer: ans,
      options
    };
  };

  useEffect(() => {
    setCurrentQ(generateQuestion());
  }, []);

  useEffect(() => {
    if (timeLeft <= 0) {
      const result = score >= targetScore ? 'win' : score >= Math.floor(targetScore / 2) ? 'tie' : 'loss';
      onGameOver(result, score);
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((t) => t - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, score, targetScore]);

  const handleAnswer = (chosen: number) => {
    if (!currentQ) return;

    if (chosen === currentQ.answer) {
      const newScore = score + 1;
      const newStreak = streak + 1;
      setScore(newScore);
      setStreak(newStreak);

      if (newScore >= targetScore) {
        onGameOver('win', newScore);
        return;
      }
      setCurrentQ(generateQuestion());
    } else {
      setStreak(0);
      setCurrentQ(generateQuestion());
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-3 w-full max-w-sm mx-auto">
      {/* Top HUD */}
      <div className="flex items-center justify-between w-full mb-4 px-4 py-2.5 bg-zinc-900 rounded-2xl border border-zinc-800">
        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
          <Zap className="w-4 h-4 fill-amber-400" />
          <span>Score: {score}/{targetScore}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-400">
          <Clock className="w-4 h-4" />
          <span>{timeLeft}s</span>
        </div>
      </div>

      {/* Math Question Card */}
      <div className="w-full bg-zinc-950 border border-zinc-800 rounded-3xl p-6 text-center shadow-xl mb-5">
        <span className="text-xs text-zinc-500 font-semibold block mb-1">Calculate Fast</span>
        <h2 className="text-3xl font-black text-white tracking-wider">
          {currentQ?.text || '...'}
        </h2>
      </div>

      {/* Answer Buttons Grid */}
      <div className="grid grid-cols-2 gap-3 w-full">
        {currentQ?.options.map((opt, i) => (
          <button
            key={i}
            onClick={() => handleAnswer(opt)}
            className="py-3.5 px-4 bg-zinc-900 hover:bg-[#00FF66] hover:text-black border border-zinc-700/60 rounded-2xl font-black text-lg text-white transition-all cursor-pointer active:scale-95 shadow-md"
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
};
