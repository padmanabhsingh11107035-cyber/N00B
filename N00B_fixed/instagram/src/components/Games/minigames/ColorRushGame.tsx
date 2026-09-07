import React, { useState, useEffect } from 'react';
import { Sparkles, Clock, Check, X } from 'lucide-react';

interface ColorRushGameProps {
  onGameOver: (result: 'win' | 'tie' | 'loss', finalScore: number) => void;
  targetScore?: number;
}

const COLOR_NAMES = ['RED', 'BLUE', 'GREEN', 'YELLOW', 'PURPLE'];
const COLOR_CLASSES: Record<string, string> = {
  RED: 'text-red-500',
  BLUE: 'text-blue-500',
  GREEN: 'text-emerald-400',
  YELLOW: 'text-amber-400',
  PURPLE: 'text-purple-400'
};

export const ColorRushGame: React.FC<ColorRushGameProps> = ({
  onGameOver,
  targetScore = 8
}) => {
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const [word, setWord] = useState('');
  const [colorKey, setColorKey] = useState('');
  const [doesMatch, setDoesMatch] = useState(false);

  const generateRound = () => {
    const isMatch = Math.random() > 0.5;
    const wordChoice = COLOR_NAMES[Math.floor(Math.random() * COLOR_NAMES.length)];
    let colorChoice = wordChoice;

    if (!isMatch) {
      const otherColors = COLOR_NAMES.filter((c) => c !== wordChoice);
      colorChoice = otherColors[Math.floor(Math.random() * otherColors.length)];
    }

    setWord(wordChoice);
    setColorKey(colorChoice);
    setDoesMatch(isMatch);
  };

  useEffect(() => {
    generateRound();
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

  const handleChoice = (playerThinksMatch: boolean) => {
    if (playerThinksMatch === doesMatch) {
      const newScore = score + 1;
      setScore(newScore);
      if (newScore >= targetScore) {
        onGameOver('win', newScore);
        return;
      }
    } else {
      setScore((s) => Math.max(0, s - 1));
    }
    generateRound();
  };

  return (
    <div className="flex flex-col items-center justify-center p-3 w-full max-w-sm mx-auto">
      <div className="flex items-center justify-between w-full mb-4 px-3 py-2 bg-zinc-900 rounded-xl border border-zinc-800 text-xs">
        <span className="font-bold text-zinc-300">Matches: <strong className="text-[#00FF66]">{score} / {targetScore}</strong></span>
        <span className="font-bold text-zinc-300">Time: <strong className="text-cyan-400">{timeLeft}s</strong></span>
      </div>

      <div className="w-full bg-zinc-950 border border-zinc-800 rounded-3xl p-8 text-center shadow-xl mb-6">
        <span className="text-xs text-zinc-500 font-semibold block mb-2">Does the word match the text color?</span>
        <h2 className={`text-4xl font-black tracking-widest ${COLOR_CLASSES[colorKey] || 'text-white'}`}>
          {word}
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-4 w-full">
        <button
          onClick={() => handleChoice(true)}
          className="py-4 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 shadow-md"
        >
          <Check className="w-5 h-5" /> YES (MATCH)
        </button>
        <button
          onClick={() => handleChoice(false)}
          className="py-4 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 shadow-md"
        >
          <X className="w-5 h-5" /> NO (DIFF)
        </button>
      </div>
    </div>
  );
};
