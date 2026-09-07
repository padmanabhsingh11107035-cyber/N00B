import React, { useState, useEffect, useRef } from 'react';
import { Zap, Play } from 'lucide-react';

interface ReactionTapGameProps {
  onGameOver: (result: 'win' | 'tie' | 'loss', finalScore: number) => void;
}

type ReactionState = 'idle' | 'waiting' | 'ready' | 'too_early' | 'success';

export const ReactionTapGame: React.FC<ReactionTapGameProps> = ({ onGameOver }) => {
  const [state, setState] = useState<ReactionState>('idle');
  const [reactionTime, setReactionTime] = useState<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startChallenge = () => {
    setState('waiting');
    setReactionTime(null);

    const randomDelay = Math.floor(Math.random() * 2500) + 1500; // 1.5 - 4.0s
    timerRef.current = setTimeout(() => {
      startTimeRef.current = Date.now();
      setState('ready');
    }, randomDelay);
  };

  const handleTap = () => {
    if (state === 'idle') {
      startChallenge();
    } else if (state === 'waiting') {
      if (timerRef.current) clearTimeout(timerRef.current);
      setState('too_early');
    } else if (state === 'ready') {
      const elapsed = Date.now() - startTimeRef.current;
      setReactionTime(elapsed);
      setState('success');

      // <350ms = win, 350-500ms = tie, >500ms = loss
      const result = elapsed <= 380 ? 'win' : elapsed <= 550 ? 'tie' : 'loss';
      setTimeout(() => {
        onGameOver(result, 1000 - elapsed);
      }, 1200);
    } else if (state === 'too_early') {
      startChallenge();
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center p-3 w-full max-w-sm mx-auto">
      <div
        onClick={handleTap}
        className={`w-full h-64 rounded-3xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all select-none shadow-2xl border-2 ${
          state === 'idle'
            ? 'bg-zinc-900 border-zinc-700 hover:border-[#00FF66]'
            : state === 'waiting'
            ? 'bg-red-950/80 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.2)]'
            : state === 'ready'
            ? 'bg-[#00FF66] border-white text-black shadow-[0_0_30px_#00FF66]'
            : state === 'too_early'
            ? 'bg-amber-950 border-amber-500'
            : 'bg-emerald-950 border-emerald-400'
        }`}
      >
        {state === 'idle' && (
          <>
            <Zap className="w-12 h-12 text-[#00FF66] mb-2" />
            <h3 className="text-xl font-black text-white">Tap to Start</h3>
            <p className="text-xs text-zinc-400 mt-1">When the screen turns GREEN, tap as fast as you can!</p>
          </>
        )}

        {state === 'waiting' && (
          <>
            <div className="w-6 h-6 rounded-full bg-red-500 animate-ping mb-3" />
            <h3 className="text-2xl font-black text-red-400">Wait for Green...</h3>
            <p className="text-xs text-red-300 mt-1">Do NOT tap yet!</p>
          </>
        )}

        {state === 'ready' && (
          <>
            <h3 className="text-4xl font-black text-black animate-pulse">TAP NOW!</h3>
          </>
        )}

        {state === 'too_early' && (
          <>
            <h3 className="text-2xl font-black text-amber-400">Too Early! ⚠️</h3>
            <p className="text-xs text-amber-300 mt-1">Tap here to try again</p>
          </>
        )}

        {state === 'success' && (
          <>
            <h3 className="text-3xl font-black text-[#00FF66]">{reactionTime} ms</h3>
            <p className="text-xs text-emerald-300 mt-1">
              {reactionTime! <= 380 ? '⚡ Lightning Fast Reflexes! (Win)' : 'Good effort!'}
            </p>
          </>
        )}
      </div>
    </div>
  );
};
