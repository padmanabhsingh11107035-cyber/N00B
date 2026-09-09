import React, { useEffect, useRef, useState } from 'react';
import { Trophy, Sparkles, Target, Crown } from 'lucide-react';
import { MiniGameMeta } from './types';
import { GameBannerArtwork } from './GameIcons';

interface GamePosterCarouselProps {
  game: MiniGameMeta;
}

const AUTO_ADVANCE_MS = 2000;

export const GamePosterCarousel: React.FC<GamePosterCarouselProps> = ({ game }) => {
  const [activeSlide, setActiveSlide] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const isHighStakes = game.pointsReward >= 1000000;

  const slides = [
    // Slide 1: the game's existing unique cartoon banner art
    <GameBannerArtwork key="art" id={game.id} className="w-full h-40" />,

    // Slide 2: how to play
    <div key="howto" className="w-full h-40 bg-gradient-to-br from-zinc-800 to-zinc-950 border-b-2 border-black/80 flex flex-col items-center justify-center text-center px-5 gap-2">
      <Target className="w-6 h-6 text-[#00FF66]" />
      <span className="text-[10px] font-black text-[#00FF66] uppercase tracking-wider">How To Play</span>
      <p className="text-xs text-zinc-200 leading-relaxed line-clamp-3">{game.description}</p>
      <div className="flex items-center gap-1.5 mt-1">
        {game.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="px-2 py-0.5 rounded-full text-[9px] bg-zinc-900 text-zinc-300 border border-zinc-700">
            {tag}
          </span>
        ))}
      </div>
    </div>,

    // Slide 3: rewards
    <div
      key="rewards"
      className={`w-full h-40 border-b-2 border-black/80 flex flex-col items-center justify-center text-center px-5 gap-1.5 ${
        isHighStakes
          ? 'bg-gradient-to-br from-amber-700 via-amber-900 to-zinc-950'
          : 'bg-gradient-to-br from-emerald-700 via-emerald-900 to-zinc-950'
      }`}
    >
      {isHighStakes ? <Crown className="w-7 h-7 text-amber-300" /> : <Trophy className="w-7 h-7 text-amber-300" />}
      <span className="text-lg font-black text-white">+{game.pointsReward.toLocaleString()} NOOBs</span>
      <span className="text-[10px] text-zinc-200 uppercase tracking-wider font-bold">
        {isHighStakes ? 'On Win — Lose vs Bot and your balance resets to 0' : 'On Win'}
      </span>
      <div className="flex items-center gap-1.5 mt-1 text-[9px] font-bold text-zinc-300">
        <Sparkles className="w-3 h-3" />
        <span>{game.difficulty} difficulty • {game.players}</span>
      </div>
    </div>
  ];

  useEffect(() => {
    const timer = setTimeout(() => {
      setActiveSlide((prev) => (prev + 1) % slides.length);
    }, AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [activeSlide, slides.length]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const deltaX = touchStartX.current - e.changedTouches[0].clientX;
    touchStartX.current = null;
    const SWIPE_THRESHOLD = 40;
    if (deltaX > SWIPE_THRESHOLD) {
      setActiveSlide((prev) => (prev + 1) % slides.length);
    } else if (deltaX < -SWIPE_THRESHOLD) {
      setActiveSlide((prev) => (prev - 1 + slides.length) % slides.length);
    }
  };

  return (
    <div className="rounded-2xl overflow-hidden border border-zinc-800 shadow-inner relative">
      <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} className="select-none">
        {slides[activeSlide]}
      </div>

      {/* Dot indicators */}
      <div className="absolute bottom-2 right-2 flex items-center gap-1.5 z-30">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => setActiveSlide(i)}
            className={`rounded-full transition-all cursor-pointer ${
              i === activeSlide ? 'w-4 h-1.5 bg-[#00FF66]' : 'w-1.5 h-1.5 bg-white/50 hover:bg-white/80'
            }`}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
};
