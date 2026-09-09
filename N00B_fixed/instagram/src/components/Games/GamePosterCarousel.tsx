import React, { useEffect, useRef, useState } from 'react';
import { Trophy, Sparkles, Target, Crown, Radio, Gamepad2, Flame, Users, Gauge, Layers } from 'lucide-react';
import { MiniGameMeta } from './types';
import { GameBannerArtwork } from './GameIcons';
import { renderInsideGamePreview } from './GameInsidePreviews';

const CATEGORY_META: Record<string, { emoji: string; label: string; gradient: string }> = {
  arcade: { emoji: '🕹️', label: 'Arcade', gradient: 'from-orange-700 to-zinc-950' },
  puzzle: { emoji: '🧩', label: 'Puzzle & Match', gradient: 'from-violet-700 to-zinc-950' },
  reflex: { emoji: '⚡', label: 'Reflex & Action', gradient: 'from-yellow-600 to-zinc-950' },
  brain: { emoji: '🧠', label: 'Brain & Strategy', gradient: 'from-blue-700 to-zinc-950' },
  social: { emoji: '🎉', label: 'Social & Party', gradient: 'from-pink-700 to-zinc-950' }
};

const DIFFICULTY_LEVEL: Record<string, number> = { Easy: 1, Medium: 2, Hard: 3 };

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
    </div>,

    // Slide 4: a peek at the actual game board/UI, matching the real engine
    <div key="inside" className="relative">
      {renderInsideGamePreview(game)}
    </div>,

    // Slide 5: the game's art again, framed as "live action" for variety
    <div key="live" className="relative">
      <GameBannerArtwork id={game.id} className="w-full h-40" />
      <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-600 border border-rose-300 text-[9px] font-black text-white z-30 animate-pulse">
        <Radio className="w-2.5 h-2.5" /> LIVE
      </div>
    </div>,

    // Slide 6: leaderboard / podium teaser
    <div key="leaderboard" className="w-full h-40 bg-gradient-to-br from-yellow-800 via-zinc-900 to-zinc-950 border-b-2 border-black/80 flex flex-col items-center justify-center gap-2">
      <div className="flex items-end gap-2">
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-lg">🥈</span>
          <div className="w-8 h-6 bg-zinc-400/80 rounded-t" />
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-xl">🥇</span>
          <div className="w-9 h-10 bg-amber-400/90 rounded-t" />
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-lg">🥉</span>
          <div className="w-8 h-4 bg-orange-700/80 rounded-t" />
        </div>
      </div>
      <span className="text-[10px] font-black text-amber-300 uppercase tracking-wider">Climb the Leaderboard</span>
    </div>,

    // Slide 7: difficulty gauge
    <div key="difficulty" className="w-full h-40 bg-gradient-to-br from-rose-900 via-zinc-900 to-zinc-950 border-b-2 border-black/80 flex flex-col items-center justify-center gap-2.5">
      <Gauge className="w-7 h-7 text-rose-400" />
      <div className="flex items-center gap-1.5">
        {[1, 2, 3].map((level) => (
          <div
            key={level}
            className={`w-6 h-2.5 rounded-full ${
              level <= (DIFFICULTY_LEVEL[game.difficulty] || 1) ? 'bg-rose-500' : 'bg-zinc-800'
            }`}
          />
        ))}
      </div>
      <span className="text-sm font-black text-white">{game.difficulty} Difficulty</span>
      <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">Think you can win?</span>
    </div>,

    // Slide 8: Pass and Play spotlight
    <div key="passplay" className="w-full h-40 bg-gradient-to-br from-cyan-800 via-zinc-900 to-zinc-950 border-b-2 border-black/80 flex flex-col items-center justify-center gap-2">
      <div className="flex items-center gap-2">
        <Users className="w-7 h-7 text-cyan-300" />
        <Gamepad2 className="w-7 h-7 text-cyan-300" />
      </div>
      <span className="text-xs font-black text-white uppercase tracking-wider">2 Players, 1 Device</span>
      <span className="text-[10px] text-cyan-200 font-semibold">Pass and Play available for this game!</span>
    </div>,

    // Slide 9: community / hype stat card
    <div key="community" className="w-full h-40 bg-gradient-to-br from-zinc-800 to-black border-b-2 border-black/80 flex flex-col items-center justify-center gap-2">
      <Flame className="w-7 h-7 text-orange-400" />
      <span className="text-xl font-black text-white">🔥 Trending Now</span>
      <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">Join the NOOB community playing this today</span>
    </div>,

    // Slide 10: category spotlight
    <div
      key="category"
      className={`w-full h-40 bg-gradient-to-br ${CATEGORY_META[game.category]?.gradient || 'from-zinc-700 to-zinc-950'} border-b-2 border-black/80 flex flex-col items-center justify-center gap-2`}
    >
      <div className="w-14 h-14 rounded-2xl bg-black/40 border border-white/20 flex items-center justify-center text-3xl">
        {CATEGORY_META[game.category]?.emoji || <Layers className="w-6 h-6 text-white" />}
      </div>
      <span className="text-sm font-black text-white uppercase tracking-wider">
        {CATEGORY_META[game.category]?.label || game.category}
      </span>
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
      <div className="absolute bottom-2 inset-x-0 flex items-center justify-center gap-1 z-30 px-2 flex-wrap">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => setActiveSlide(i)}
            className={`rounded-full transition-all cursor-pointer shrink-0 ${
              i === activeSlide ? 'w-3.5 h-1.5 bg-[#00FF66]' : 'w-1.5 h-1.5 bg-white/50 hover:bg-white/80'
            }`}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
};
