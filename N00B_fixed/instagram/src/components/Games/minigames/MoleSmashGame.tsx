import React, { useState, useEffect, useRef } from 'react';
import { Hammer, Clock, Zap } from 'lucide-react';

interface MoleSmashGameProps {
  onGameOver: (result: 'win' | 'tie' | 'loss', finalScore: number) => void;
  targetScore?: number;
}

const HOLE_COUNT = 9;
const ROUND_SECONDS = 25;

export const MoleSmashGame: React.FC<MoleSmashGameProps> = ({
  onGameOver,
  targetScore = 14
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [activeHole, setActiveHole] = useState<number | null>(null);
  const [isBomb, setIsBomb] = useState(false);
  const [smashedHole, setSmashedHole] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const scoreRef = useRef(0);
  const popTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAllTimers = () => {
    if (popTimeoutRef.current) clearTimeout(popTimeoutRef.current);
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
  };

  const scheduleNextPop = (difficulty: number) => {
    const delay = Math.max(280, 750 - difficulty * 12) + Math.random() * 300;
    popTimeoutRef.current = setTimeout(() => {
      const hole = Math.floor(Math.random() * HOLE_COUNT);
      const bomb = Math.random() < 0.18;
      setActiveHole(hole);
      setIsBomb(bomb);
      const visibleFor = Math.max(500, 950 - difficulty * 15);
      hideTimeoutRef.current = setTimeout(() => {
        setActiveHole((h) => (h === hole ? null : h));
        scheduleNextPop(difficulty + 1);
      }, visibleFor);
    }, delay);
  };

  const startGame = () => {
    setIsPlaying(true);
    setScore(0);
    scoreRef.current = 0;
    setTimeLeft(ROUND_SECONDS);
    setActiveHole(null);
    scheduleNextPop(0);
  };

  useEffect(() => {
    if (!isPlaying) return;
    if (timeLeft <= 0) {
      clearAllTimers();
      setIsPlaying(false);
      setActiveHole(null);
      const finalScore = scoreRef.current;
      const result: 'win' | 'tie' | 'loss' = finalScore >= targetScore ? 'win' : finalScore >= Math.floor(targetScore / 2) ? 'tie' : 'loss';
      onGameOver(result, finalScore * 10);
      return;
    }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [isPlaying, timeLeft, targetScore, onGameOver]);

  useEffect(() => () => clearAllTimers(), []);

  const handleWhack = (index: number) => {
    if (!isPlaying || activeHole !== index) return;
    if (isBomb) {
      scoreRef.current = Math.max(0, scoreRef.current - 2);
    } else {
      scoreRef.current += 1;
    }
    setScore(scoreRef.current);
    setSmashedHole(index);
    setActiveHole(null);
    setTimeout(() => setSmashedHole((h) => (h === index ? null : h)), 180);
  };

  return (
    <div className="flex flex-col items-center justify-center p-3 w-full max-w-sm mx-auto">
      <div className="flex items-center justify-between w-full mb-3 px-3 py-1.5 bg-zinc-900 rounded-xl border border-zinc-800 text-xs">
        <span className="font-bold text-zinc-300 flex items-center gap-1">
          <Zap className="w-3.5 h-3.5 text-amber-400" /> Score: <strong className="text-[#00FF66]">{score}</strong>
        </span>
        <span className="font-bold text-cyan-400 flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" /> {timeLeft}s
        </span>
      </div>

      <div className="relative w-full aspect-square bg-gradient-to-b from-emerald-950 via-zinc-950 to-zinc-950 border-2 border-zinc-800 rounded-3xl overflow-hidden shadow-2xl p-4">
        <div className="grid grid-cols-3 gap-3 w-full h-full">
          {Array.from({ length: HOLE_COUNT }).map((_, i) => {
            const isUp = activeHole === i;
            const bombHere = isUp && isBomb;
            return (
              <button
                key={i}
                onClick={() => handleWhack(i)}
                className="relative rounded-full bg-black/60 border-2 border-emerald-900/60 overflow-hidden cursor-pointer"
              >
                <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#3b2412] to-transparent" />
                <div
                  className={`absolute left-1/2 bottom-0 -translate-x-1/2 text-4xl transition-transform duration-150 ${
                    isUp ? 'translate-y-0' : 'translate-y-full'
                  } ${smashedHole === i ? 'scale-75 opacity-40' : ''}`}
                >
                  {bombHere ? '💣' : '🐹'}
                </div>
              </button>
            );
          })}
        </div>

        {!isPlaying && (
          <div className="absolute inset-0 bg-black/85 backdrop-blur-xs flex flex-col items-center justify-center p-4 text-center">
            <h3 className="text-lg font-black text-white mb-1">🔨 Neon Mole Smash</h3>
            <p className="text-xs text-zinc-400 mb-4 max-w-[220px]">
              Whack {targetScore}+ moles before time runs out. Avoid the 💣 bombs — they cost you points!
            </p>
            <button
              onClick={startGame}
              className="px-5 py-2.5 bg-[#00FF66] text-black font-black text-xs rounded-xl shadow-[0_0_15px_rgba(0,255,102,0.4)] flex items-center gap-1.5 cursor-pointer hover:scale-105 transition-all"
            >
              <Hammer className="w-4 h-4" /> Start Smashing
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
