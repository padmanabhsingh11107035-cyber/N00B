import React from 'react';
import { MiniGameMeta } from './types';

// Small, static "peek inside the game" mockups — grouped by the same
// game-id sets GamePlayModal.tsx uses to pick a real engine, so the
// preview actually matches what that game looks like when played.
// These are illustrative mockups (divs/CSS), not live gameplay.

const cardBase = 'w-full h-40 border-b-2 border-black/80 flex flex-col items-center justify-center gap-2 relative overflow-hidden';

function SnakeInside() {
  return (
    <div className={`${cardBase} bg-gradient-to-br from-emerald-800 to-zinc-950`}>
      <div className="grid grid-cols-7 gap-1 p-2 bg-black/40 rounded-xl border border-emerald-500/30">
        {Array.from({ length: 28 }).map((_, i) => {
          const snakeCells = [10, 11, 12, 13];
          const foodCell = 22;
          const isSnake = snakeCells.includes(i);
          const isHead = i === 13;
          const isFood = i === foodCell;
          return (
            <div
              key={i}
              className={`w-3.5 h-3.5 rounded-sm ${
                isFood ? 'bg-rose-500' : isSnake ? (isHead ? 'bg-[#00FF66]' : 'bg-emerald-600') : 'bg-white/5'
              }`}
            />
          );
        })}
      </div>
      <span className="text-[9px] font-black text-emerald-300 uppercase tracking-wider">Inside the Game</span>
    </div>
  );
}

function TicTacToeInside() {
  const cells = ['X', '', 'O', '', 'X', '', 'O', '', 'X'];
  return (
    <div className={`${cardBase} bg-gradient-to-br from-zinc-800 to-zinc-950`}>
      <div className="grid grid-cols-3 gap-1.5 p-2 bg-black/40 rounded-xl border border-zinc-700">
        {cells.map((c, i) => (
          <div
            key={i}
            className={`w-8 h-8 rounded-md flex items-center justify-center text-sm font-black bg-zinc-900 border border-zinc-700 ${
              c === 'X' ? 'text-[#00FF66]' : c === 'O' ? 'text-pink-400' : ''
            }`}
          >
            {c}
          </div>
        ))}
      </div>
      <span className="text-[9px] font-black text-zinc-300 uppercase tracking-wider">Inside the Game</span>
    </div>
  );
}

function ChessInside() {
  const row1 = ['♜', '♞', '♝', '♛'];
  const row2 = ['♟', '♟', '', '♟'];
  return (
    <div className={`${cardBase} bg-gradient-to-br from-zinc-700 to-zinc-950`}>
      <div className="grid grid-cols-4 gap-0 rounded-lg overflow-hidden border-2 border-zinc-700 shadow-lg">
        {[...row1, ...row2, ...Array(8).fill('')].slice(0, 16).map((p, i) => {
          const isDark = (Math.floor(i / 4) + i) % 2 === 0;
          return (
            <div key={i} className={`w-8 h-8 flex items-center justify-center text-lg ${isDark ? 'bg-zinc-600' : 'bg-zinc-300'}`}>
              <span className={i < 4 ? 'text-black' : 'text-zinc-900'}>{p}</span>
            </div>
          );
        })}
      </div>
      <span className="text-[9px] font-black text-zinc-300 uppercase tracking-wider">Inside the Game</span>
    </div>
  );
}

function RpsInside() {
  return (
    <div className={`${cardBase} bg-gradient-to-br from-purple-800 to-zinc-950`}>
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-[#00FF66]/40 flex items-center justify-center text-3xl">✊</div>
        <span className="text-xs font-black text-zinc-400">VS</span>
        <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-pink-500/40 flex items-center justify-center text-3xl">✌️</div>
      </div>
      <span className="text-[9px] font-black text-purple-300 uppercase tracking-wider">Inside the Game</span>
    </div>
  );
}

function MathInside() {
  return (
    <div className={`${cardBase} bg-gradient-to-br from-blue-800 to-zinc-950`}>
      <span className="text-xl font-black text-white">7 × 8 = ?</span>
      <div className="flex items-center gap-1.5">
        {[54, 56, 63, 48].map((n) => (
          <div key={n} className="w-9 h-8 rounded-lg bg-zinc-900 border border-blue-500/40 flex items-center justify-center text-[11px] font-bold text-blue-300">
            {n}
          </div>
        ))}
      </div>
      <span className="text-[9px] font-black text-blue-300 uppercase tracking-wider">Inside the Game</span>
    </div>
  );
}

function MemoryInside() {
  const cards = ['🦊', '', '🎯', '🦊', '', ''];
  return (
    <div className={`${cardBase} bg-gradient-to-br from-teal-800 to-zinc-950`}>
      <div className="grid grid-cols-3 gap-2">
        {cards.map((c, i) => (
          <div key={i} className={`w-11 h-11 rounded-lg flex items-center justify-center text-lg ${c ? 'bg-teal-500/20 border border-teal-400' : 'bg-zinc-800 border border-zinc-700'}`}>
            {c}
          </div>
        ))}
      </div>
      <span className="text-[9px] font-black text-teal-300 uppercase tracking-wider">Inside the Game</span>
    </div>
  );
}

function ReactionInside() {
  return (
    <div className={`${cardBase} bg-gradient-to-br from-rose-800 to-zinc-950`}>
      <div className="w-20 h-20 rounded-full bg-rose-500 border-4 border-rose-300 flex items-center justify-center text-white font-black text-lg animate-pulse shadow-[0_0_25px_rgba(244,63,94,0.6)]">
        TAP!
      </div>
      <span className="text-[9px] font-black text-rose-300 uppercase tracking-wider">Inside the Game</span>
    </div>
  );
}

function BrickBreakerInside() {
  return (
    <div className={`${cardBase} bg-gradient-to-br from-amber-800 to-zinc-950`}>
      <div className="grid grid-cols-6 gap-1">
        {['bg-rose-500', 'bg-amber-400', 'bg-emerald-400', 'bg-sky-400', 'bg-purple-400', 'bg-pink-400'].map((c, i) => (
          <div key={i} className={`w-6 h-2.5 rounded-sm ${c}`} />
        ))}
      </div>
      <div className="w-3 h-3 rounded-full bg-white shadow-[0_0_8px_white]" />
      <div className="w-10 h-2 rounded-full bg-zinc-200" />
      <span className="text-[9px] font-black text-amber-300 uppercase tracking-wider mt-1">Inside the Game</span>
    </div>
  );
}

function DroneInside() {
  return (
    <div className={`${cardBase} bg-gradient-to-br from-sky-800 to-zinc-950`}>
      <div className="relative w-full h-16 flex items-center justify-center">
        <div className="absolute left-4 top-0 w-2 h-8 bg-rose-500/70 rounded" />
        <div className="absolute right-6 bottom-0 w-2 h-10 bg-rose-500/70 rounded" />
        <span className="text-2xl relative z-10">🚀</span>
      </div>
      <span className="text-[9px] font-black text-sky-300 uppercase tracking-wider">Inside the Game</span>
    </div>
  );
}

function ColorInside() {
  return (
    <div className={`${cardBase} bg-gradient-to-br from-fuchsia-800 to-zinc-950`}>
      <div className="grid grid-cols-5 gap-1.5">
        {['bg-rose-500', 'bg-amber-400', 'bg-emerald-400', 'bg-sky-400', 'bg-fuchsia-400', 'bg-rose-500', 'bg-sky-400', 'bg-amber-400', 'bg-fuchsia-400', 'bg-emerald-400'].map((c, i) => (
          <div key={i} className={`w-5 h-5 rounded-full ${c}`} />
        ))}
      </div>
      <span className="text-[9px] font-black text-fuchsia-300 uppercase tracking-wider">Inside the Game</span>
    </div>
  );
}

function WordInside() {
  const letters = [
    { l: 'N', c: 'bg-[#00FF66] text-black' },
    { l: 'O', c: 'bg-amber-400 text-black' },
    { l: 'O', c: 'bg-zinc-700 text-white' },
    { l: 'B', c: 'bg-[#00FF66] text-black' },
    { l: 'S', c: 'bg-zinc-700 text-white' }
  ];
  return (
    <div className={`${cardBase} bg-gradient-to-br from-indigo-800 to-zinc-950`}>
      <div className="flex items-center gap-1.5">
        {letters.map((item, i) => (
          <div key={i} className={`w-8 h-8 rounded-md flex items-center justify-center text-sm font-black ${item.c}`}>
            {item.l}
          </div>
        ))}
      </div>
      <span className="text-[9px] font-black text-indigo-300 uppercase tracking-wider">Inside the Game</span>
    </div>
  );
}

function DrawingInside() {
  return (
    <div className={`${cardBase} bg-gradient-to-br from-cyan-800 to-zinc-950`}>
      <div className="w-28 h-16 bg-white rounded-lg flex items-center justify-center">
        <svg viewBox="0 0 100 50" className="w-24 h-12">
          <path d="M10 40 Q 30 5, 50 30 T 90 15" stroke="#0891b2" strokeWidth="4" fill="none" strokeLinecap="round" />
        </svg>
      </div>
      <div className="flex items-center gap-1">
        {['bg-rose-500', 'bg-amber-400', 'bg-emerald-400', 'bg-sky-400'].map((c, i) => (
          <div key={i} className={`w-3 h-3 rounded-full ${c}`} />
        ))}
      </div>
      <span className="text-[9px] font-black text-cyan-300 uppercase tracking-wider">Inside the Game</span>
    </div>
  );
}

function LudoInside() {
  const colors = ['#00FF66', '#ec4899', '#38bdf8', '#f59e0b'];
  return (
    <div className={`${cardBase} bg-gradient-to-br from-orange-800 to-zinc-950`}>
      <div className="relative w-24 h-24 rounded-full border-2 border-zinc-700 bg-black/30">
        {colors.map((c, i) => {
          const angle = (i / 4) * 2 * Math.PI - Math.PI / 2;
          const x = 48 + 40 * Math.cos(angle);
          const y = 48 + 40 * Math.sin(angle);
          return <span key={i} className="absolute w-3 h-3 rounded-full" style={{ left: x, top: y, backgroundColor: c }} />;
        })}
        <span className="absolute inset-0 flex items-center justify-center text-[8px] font-black text-white">HOME</span>
      </div>
      <span className="text-[9px] font-black text-orange-300 uppercase tracking-wider">Inside the Game</span>
    </div>
  );
}

function SnakesLaddersInside() {
  return (
    <div className={`${cardBase} bg-gradient-to-br from-green-800 to-zinc-950`}>
      <div className="grid grid-cols-6 gap-1 p-2 bg-black/40 rounded-xl border border-green-500/30">
        {Array.from({ length: 18 }).map((_, i) => (
          <div
            key={i}
            className={`w-3.5 h-3.5 rounded-sm flex items-center justify-center text-[6px] ${
              i === 4 ? 'bg-rose-600' : i === 9 ? 'bg-emerald-500' : 'bg-zinc-700'
            }`}
          >
            {i === 4 ? '🐍' : i === 9 ? '🪜' : ''}
          </div>
        ))}
      </div>
      <span className="text-[9px] font-black text-green-300 uppercase tracking-wider">Inside the Game</span>
    </div>
  );
}

function MonopolyInside() {
  return (
    <div className={`${cardBase} bg-gradient-to-br from-blue-900 to-zinc-950`}>
      <div className="flex items-center gap-1.5">
        <div className="w-12 h-9 rounded-md bg-red-800/60 border border-red-500/40 flex flex-col items-center justify-center">
          <span className="text-[6px] text-white font-bold">Boardwalk</span>
          <span className="text-[7px] text-amber-300 font-black">$400</span>
        </div>
        <div className="w-12 h-9 rounded-md bg-blue-800/60 border border-blue-500/40 flex flex-col items-center justify-center">
          <span className="text-[6px] text-white font-bold">Park Place</span>
          <span className="text-[7px] text-amber-300 font-black">$320</span>
        </div>
      </div>
      <span className="text-[9px] font-black text-blue-300 uppercase tracking-wider">Inside the Game</span>
    </div>
  );
}

function GenericInside({ game }: { game: MiniGameMeta }) {
  return (
    <div className={`${cardBase} ${game.bannerBg}`}>
      <div className="w-full px-6 flex items-center justify-between">
        <div className="flex flex-col items-start">
          <span className="text-[9px] text-zinc-300 uppercase font-bold">Score</span>
          <span className="text-lg font-black text-white">1,240</span>
        </div>
        <div className="w-16 h-16 rounded-2xl bg-black/40 border border-white/20 flex items-center justify-center text-2xl">
          🎮
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[9px] text-zinc-300 uppercase font-bold">Time</span>
          <span className="text-lg font-black text-white">0:12</span>
        </div>
      </div>
      <div className="w-4/5 h-1.5 rounded-full bg-black/40 overflow-hidden">
        <div className="w-2/3 h-full bg-[#00FF66]" />
      </div>
      <span className="text-[9px] font-black text-white/80 uppercase tracking-wider">Inside the Game</span>
    </div>
  );
}

export function renderInsideGamePreview(game: MiniGameMeta): React.ReactNode {
  const id = game.id;
  if (id === 'cyber_snake' || id === 'snake' || id === 'pac_grid') return <SnakeInside />;
  if (id === 'tictactoe') return <TicTacToeInside />;
  if (id === 'chess_blitz') return <ChessInside />;
  if (id === 'rps' || id === 'rps_extreme') return <RpsInside />;
  if (id === 'speed_math' || id === 'mental_calc' || id === 'trivia_quest') return <MathInside />;
  if (id === 'memory_match' || id === 'emoji_match' || id === 'cyber_memory') return <MemoryInside />;
  if (id === 'reaction_tap' || id === 'laser_dodge' || id === 'ninja_tap' || id === 'speed_reflex') return <ReactionInside />;
  if (id === 'brick_breaker' || id === 'pinball_pulse' || id === 'neon_pong') return <BrickBreakerInside />;
  if (id === 'cyber_drone' || id === 'pixel_runner' || id === 'galaxy_shooter' || id === 'astro_jump') return <DroneInside />;
  if (id === 'color_rush' || id === 'bubble_blitz' || id === 'laser_matrix') return <ColorInside />;
  if (id === 'word_guess' || id === 'wordle' || id === 'code_breaker') return <WordInside />;
  if (id === 'scribble_art' || id === 'doodle_rush') return <DrawingInside />;
  if (id === 'ludo_classic') return <LudoInside />;
  if (id === 'snakes_ladders') return <SnakesLaddersInside />;
  if (id === 'monopoly_noob') return <MonopolyInside />;
  return <GenericInside game={game} />;
}
