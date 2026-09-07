import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Zap, Flame, Clock, Trophy, Target } from 'lucide-react';
import { MiniGameMeta } from '../types';

interface GenericArcadeGameProps {
  game: MiniGameMeta;
  onGameOver: (result: 'win' | 'tie' | 'loss', finalScore: number) => void;
  targetScore?: number;
}

interface OrbTarget {
  id: number;
  x: number;
  y: number;
  size: number;
  points: number;
  color: string;
  emoji: string;
}

export const GenericArcadeGame: React.FC<GenericArcadeGameProps> = ({
  game,
  onGameOver,
  targetScore = 15
}) => {
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const [orbs, setOrbs] = useState<OrbTarget[]>([]);
  const nextOrbIdRef = useRef(1);

  const getGameEmojis = () => {
    switch (game.category) {
      case 'arcade':
        return ['👾', '🚀', '💥', '⚡', '⭐'];
      case 'puzzle':
        return ['🧩', '🔮', '💎', '🔑', '✨'];
      case 'reflex':
        return ['⚡', '🎯', '🔥', '💫', '💥'];
      case 'brain':
        return ['🧠', '💡', '🧪', '🔭', '📚'];
      case 'social':
      default:
        return ['🎉', '👑', '🎲', '🎈', '❤️'];
    }
  };

  const spawnOrb = () => {
    const emojis = getGameEmojis();
    const chosenEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    const colors = ['#00FF66', '#06b6d4', '#f59e0b', '#ec4899', '#8b5cf6'];
    const color = colors[Math.floor(Math.random() * colors.length)];

    const newOrb: OrbTarget = {
      id: nextOrbIdRef.current++,
      x: Math.floor(Math.random() * 70) + 10, // 10% to 80%
      y: Math.floor(Math.random() * 65) + 15, // 15% to 80%
      size: Math.floor(Math.random() * 12) + 42,
      points: 1,
      color,
      emoji: chosenEmoji
    };

    setOrbs((prev) => [...prev.slice(-4), newOrb]);
  };

  // Initial spawner
  useEffect(() => {
    spawnOrb();
    spawnOrb();
    const interval = setInterval(() => {
      spawnOrb();
    }, 900);
    return () => clearInterval(interval);
  }, [game]);

  // Countdown timer
  useEffect(() => {
    if (timeLeft <= 0) {
      const result = score >= targetScore ? 'win' : score >= Math.floor(targetScore / 2) ? 'tie' : 'loss';
      onGameOver(result, score * 10);
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((t) => t - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, score, targetScore]);

  const handleTapOrb = (orbId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setOrbs((prev) => prev.filter((o) => o.id !== orbId));

    const newCombo = combo + 1;
    const addedScore = 1;
    const newScore = score + addedScore;

    setCombo(newCombo);
    setScore(newScore);

    if (newScore >= targetScore) {
      onGameOver('win', newScore * 10);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-2 w-full max-w-sm mx-auto">
      {/* Top HUD */}
      <div className="flex items-center justify-between w-full mb-3 px-3 py-2 bg-zinc-900 rounded-2xl border border-zinc-800 text-xs">
        <div className="flex items-center gap-1.5 font-bold text-[#00FF66]">
          <Target className="w-4 h-4" />
          <span>Score: {score} / {targetScore}</span>
        </div>
        {combo > 2 && (
          <div className="flex items-center gap-1 font-black text-amber-400 animate-pulse bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/30">
            <Flame className="w-3.5 h-3.5" />
            <span>{combo}x Combo!</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 font-bold text-cyan-400">
          <Clock className="w-4 h-4" />
          <span>{timeLeft}s</span>
        </div>
      </div>

      {/* Interactive Arcade Playfield */}
      <div className="relative w-full h-72 bg-zinc-950 border-2 border-zinc-800 rounded-3xl overflow-hidden shadow-2xl select-none">
        {/* Background Grid Accent */}
        <div className="absolute inset-0 bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:16px_16px] opacity-40 pointer-events-none" />

        {/* Dynamic Target Orbs */}
        {orbs.map((orb) => (
          <button
            key={orb.id}
            onClick={(e) => handleTapOrb(orb.id, e)}
            style={{
              left: `${orb.x}%`,
              top: `${orb.y}%`,
              width: `${orb.size}px`,
              height: `${orb.size}px`,
              boxShadow: `0 0 16px ${orb.color}40`,
              borderColor: orb.color
            }}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-zinc-900/90 border-2 flex items-center justify-center text-xl cursor-pointer hover:scale-115 active:scale-95 transition-transform duration-100 animate-in zoom-in-75 duration-200"
          >
            <span>{orb.emoji}</span>
          </button>
        ))}

        <div className="absolute bottom-2 left-0 right-0 text-center pointer-events-none">
          <span className="text-[10px] text-zinc-500 font-bold bg-zinc-900/80 px-2.5 py-1 rounded-full border border-zinc-800/80">
            Tap the {game.title} targets rapidly before time runs out!
          </span>
        </div>
      </div>
    </div>
  );
};
