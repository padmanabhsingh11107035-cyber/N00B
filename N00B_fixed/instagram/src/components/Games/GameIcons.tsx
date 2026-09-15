import React from 'react';

interface GameIconProps {
  id: string;
  className?: string;
}

export const GameBannerArtwork: React.FC<GameIconProps> = ({ id, className = 'w-full h-36' }) => {
  // Uniform 2D Cartoon Style Container Wrapper with Comic Book Halftone & Bold Outlines
  const renderCartoonFrame = (bgGradient: string, children: React.ReactNode, stickerText?: string) => (
    <div
      className={`${className} ${bgGradient} relative flex items-center justify-center overflow-hidden border-b-2 border-black/80 shadow-inner select-none`}
    >
      {/* 2D Cartoon Comic Halftone Dot Matrix Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#ffffff22_1.5px,transparent_1.5px)] [background-size:10px_10px] pointer-events-none opacity-80" />
      
      {/* 2D Comic Speed Action Rays */}
      <div className="absolute inset-0 opacity-15 bg-[repeating-conic-gradient(#ffffff_0_15deg,transparent_15deg_30deg)] pointer-events-none" />

      {/* 2D Cartoon Badge / Sticker Stamp */}
      <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-yellow-400 border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)] text-[9px] font-black text-black tracking-wider uppercase z-20 transform -rotate-3">
        {stickerText || '⚡ 2D TOON'}
      </div>

      {/* Cartoon Graphic Content with high-contrast outlines and cel-shaded feel */}
      <div className="relative z-10 filter drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]">
        {children}
      </div>
    </div>
  );

  switch (id) {
    // 1. Cyber Snake
    case 'cyber_snake':
      return renderCartoonFrame(
        'bg-gradient-to-br from-emerald-600 via-green-700 to-teal-900',
        <div className="flex items-center gap-1.5 p-2 bg-zinc-950 border-2 border-black rounded-2xl shadow-[4px_4px_0px_#000]">
          <div className="w-8 h-8 rounded-xl bg-[#00FF66] border-2 border-black flex items-center justify-center relative shadow-[2px_2px_0px_#000]">
            {/* Eyes */}
            <div className="w-2 h-2 bg-black rounded-full absolute top-1.5 left-1 border border-white flex items-center justify-center">
              <div className="w-0.5 h-0.5 bg-white rounded-full" />
            </div>
            <div className="w-2 h-2 bg-black rounded-full absolute top-1.5 right-1 border border-white flex items-center justify-center">
              <div className="w-0.5 h-0.5 bg-white rounded-full" />
            </div>
            <div className="w-2 h-1 bg-red-500 rounded-b-full absolute -bottom-1" />
          </div>
          <div className="w-6 h-6 rounded-lg bg-emerald-400 border-2 border-black" />
          <div className="w-5 h-5 rounded-lg bg-emerald-500 border-2 border-black" />
          <div className="w-4 h-4 rounded-full bg-rose-500 border-2 border-black ml-2 animate-bounce" />
        </div>,
        '🐍 SNAKE'
      );

    // 2. Cyber Drone Dash
    case 'cyber_drone':
      return renderCartoonFrame(
        'bg-gradient-to-br from-sky-600 via-blue-700 to-indigo-900',
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-400 border-2 border-black flex items-center justify-center text-2xl shadow-[3px_3px_0px_#000] transform -rotate-12 animate-pulse">
            🛸
          </div>
          <div className="flex flex-col gap-3">
            <div className="w-8 h-6 bg-rose-500 border-2 border-black rounded-b-lg shadow-[2px_2px_0px_#000]" />
            <div className="w-8 h-6 bg-rose-500 border-2 border-black rounded-t-lg shadow-[2px_2px_0px_#000]" />
          </div>
        </div>,
        '🚀 DRONE'
      );

    // 3. Neon Brick Smasher
    case 'brick_breaker':
      return renderCartoonFrame(
        'bg-gradient-to-br from-purple-600 via-fuchsia-700 to-indigo-950',
        <div className="flex flex-col items-center gap-2 p-2 bg-black/50 rounded-2xl border-2 border-black">
          <div className="grid grid-cols-4 gap-1.5">
            <div className="w-6 h-3 bg-pink-400 border border-black rounded-xs shadow-[1px_1px_0px_#000]" />
            <div className="w-6 h-3 bg-amber-400 border border-black rounded-xs shadow-[1px_1px_0px_#000]" />
            <div className="w-6 h-3 bg-cyan-400 border border-black rounded-xs shadow-[1px_1px_0px_#000]" />
            <div className="w-6 h-3 bg-lime-400 border border-black rounded-xs shadow-[1px_1px_0px_#000]" />
          </div>
          <div className="w-4 h-4 rounded-full bg-white border-2 border-black shadow-[2px_2px_0px_#000]" />
          <div className="w-16 h-3 bg-cyan-400 border-2 border-black rounded-full shadow-[2px_2px_0px_#000]" />
        </div>,
        '🧱 SMASH'
      );

    // 4. Pixel Runner
    case 'pixel_runner':
      return renderCartoonFrame(
        'bg-gradient-to-br from-amber-600 via-orange-700 to-stone-900',
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-300 border-2 border-black flex items-center justify-center text-3xl shadow-[3px_3px_0px_#000] transform -rotate-6">
            🏃
          </div>
          <div className="w-6 h-10 bg-red-600 border-2 border-black rounded-t-lg shadow-[2px_2px_0px_#000]" />
        </div>,
        '⚡ DASH'
      );

    // 5. Galaxy Star Shooter
    case 'galaxy_shooter':
      return renderCartoonFrame(
        'bg-gradient-to-br from-indigo-700 via-purple-900 to-slate-950',
        <div className="flex flex-col items-center gap-2">
          <div className="flex gap-4">
            <div className="w-7 h-7 rounded-lg bg-rose-500 border-2 border-black flex items-center justify-center text-sm shadow-[2px_2px_0px_#000] transform rotate-45">
              👾
            </div>
            <div className="w-7 h-7 rounded-lg bg-rose-500 border-2 border-black flex items-center justify-center text-sm shadow-[2px_2px_0px_#000] transform rotate-45">
              👾
            </div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-cyan-400 border-2 border-black flex items-center justify-center text-2xl shadow-[3px_3px_0px_#000]">
            🚀
          </div>
        </div>,
        '✨ GALAXY'
      );

    // 6. Pinball Pulse
    case 'pinball_pulse':
      return renderCartoonFrame(
        'bg-gradient-to-br from-pink-600 via-purple-800 to-zinc-950',
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-amber-400 border-2 border-black flex items-center justify-center text-lg font-black shadow-[2px_2px_0px_#000]">
            ⭐
          </div>
          <div className="w-6 h-6 rounded-full bg-slate-100 border-2 border-black shadow-[2px_2px_0px_#000]" />
          <div className="w-9 h-9 rounded-full bg-cyan-400 border-2 border-black flex items-center justify-center text-lg font-black shadow-[2px_2px_0px_#000]">
            ⭐
          </div>
        </div>,
        '🎱 PINBALL'
      );

    // 7. Bubble Pop Blitz
    case 'bubble_blitz':
      return renderCartoonFrame(
        'bg-gradient-to-br from-sky-500 via-cyan-700 to-blue-950',
        <div className="grid grid-cols-3 gap-2">
          <div className="w-7 h-7 rounded-full bg-pink-400 border-2 border-black shadow-[2px_2px_0px_#000]" />
          <div className="w-7 h-7 rounded-full bg-yellow-400 border-2 border-black shadow-[2px_2px_0px_#000]" />
          <div className="w-7 h-7 rounded-full bg-emerald-400 border-2 border-black shadow-[2px_2px_0px_#000]" />
          <div className="w-7 h-7 rounded-full bg-cyan-400 border-2 border-black shadow-[2px_2px_0px_#000]" />
          <div className="w-7 h-7 rounded-full bg-purple-400 border-2 border-black shadow-[2px_2px_0px_#000]" />
          <div className="w-7 h-7 rounded-full bg-rose-500 border-2 border-black shadow-[2px_2px_0px_#000]" />
        </div>,
        '🫧 BUBBLES'
      );

    // 8. Pac Maze Dash
    case 'pac_grid':
      return renderCartoonFrame(
        'bg-gradient-to-br from-yellow-600 via-amber-700 to-stone-950',
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-yellow-400 border-2 border-black flex items-center justify-center text-3xl shadow-[3px_3px_0px_#000]">
            😮
          </div>
          <div className="w-3 h-3 rounded-full bg-white border-2 border-black" />
          <div className="w-3 h-3 rounded-full bg-white border-2 border-black" />
          <div className="w-9 h-9 rounded-2xl bg-red-500 border-2 border-black flex items-center justify-center text-xl shadow-[2px_2px_0px_#000]">
            👻
          </div>
        </div>,
        '🍒 PAC-MAZE'
      );

    // 9. Astro Jump Orbit
    case 'astro_jump':
      return renderCartoonFrame(
        'bg-gradient-to-br from-teal-600 via-emerald-800 to-slate-950',
        <div className="flex flex-col items-center gap-2">
          <div className="w-11 h-11 rounded-2xl bg-amber-400 border-2 border-black flex items-center justify-center text-2xl shadow-[3px_3px_0px_#000] transform -rotate-12">
            🧑‍🚀
          </div>
          <div className="w-16 h-3 bg-emerald-400 border-2 border-black rounded-full shadow-[2px_2px_0px_#000]" />
        </div>,
        '🪐 JUMP'
      );

    // 10. Laser Matrix Dodge
    case 'laser_dodge':
      return renderCartoonFrame(
        'bg-gradient-to-br from-rose-600 via-red-800 to-zinc-950',
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-white border-2 border-black flex items-center justify-center text-2xl shadow-[3px_3px_0px_#000]">
            ⚡
          </div>
          <div className="flex flex-col gap-2">
            <div className="w-12 h-2 bg-rose-400 border-2 border-black rounded-full" />
            <div className="w-12 h-2 bg-rose-400 border-2 border-black rounded-full" />
          </div>
        </div>,
        '💥 LASER'
      );

    // 11. Tic Tac Toe Pro
    case 'tictactoe':
      return renderCartoonFrame(
        'bg-gradient-to-br from-indigo-600 via-blue-800 to-slate-950',
        <div className="w-24 h-24 grid grid-cols-3 grid-rows-3 gap-1 p-1 bg-black/60 rounded-2xl border-2 border-black shadow-[4px_4px_0px_#000]">
          <div className="flex items-center justify-center text-rose-400 font-black text-xl drop-shadow-[2px_2px_0px_#000]">✕</div>
          <div className="flex items-center justify-center text-cyan-300 font-black text-xl drop-shadow-[2px_2px_0px_#000]">◯</div>
          <div className="flex items-center justify-center text-rose-400 font-black text-xl drop-shadow-[2px_2px_0px_#000]">✕</div>
          <div className="flex items-center justify-center text-cyan-300 font-black text-xl drop-shadow-[2px_2px_0px_#000]">◯</div>
          <div className="flex items-center justify-center text-rose-400 font-black text-xl drop-shadow-[2px_2px_0px_#000]">✕</div>
          <div className="flex items-center justify-center text-cyan-300 font-black text-xl drop-shadow-[2px_2px_0px_#000]">◯</div>
          <div className="flex items-center justify-center text-cyan-300 font-black text-xl drop-shadow-[2px_2px_0px_#000]">◯</div>
          <div className="flex items-center justify-center text-rose-400 font-black text-xl drop-shadow-[2px_2px_0px_#000]">✕</div>
          <div className="flex items-center justify-center text-rose-400 font-black text-xl drop-shadow-[2px_2px_0px_#000]">✕</div>
        </div>,
        '❌ TIC-TAC'
      );

    // 12. 2048 Neon Pulse
    case 'game_2048':
      return renderCartoonFrame(
        'bg-gradient-to-br from-pink-600 via-rose-800 to-fuchsia-950',
        <div className="grid grid-cols-2 gap-1.5 p-2 bg-black/60 rounded-2xl border-2 border-black shadow-[3px_3px_0px_#000]">
          <div className="w-9 h-9 rounded-xl bg-pink-400 border-2 border-black flex items-center justify-center font-black text-xs text-black">512</div>
          <div className="w-9 h-9 rounded-xl bg-cyan-400 border-2 border-black flex items-center justify-center font-black text-xs text-black">1024</div>
          <div className="w-9 h-9 rounded-xl bg-lime-400 border-2 border-black flex items-center justify-center font-black text-xs text-black">512</div>
          <div className="w-9 h-9 rounded-xl bg-amber-400 border-2 border-black flex items-center justify-center font-black text-xs text-black shadow-[2px_2px_0px_#000]">2048</div>
        </div>,
        '🔢 2048'
      );

    // 13. Memory Card Match
    case 'memory_match':
      return renderCartoonFrame(
        'bg-gradient-to-br from-amber-600 via-orange-800 to-stone-950',
        <div className="flex items-center gap-2">
          <div className="w-10 h-14 rounded-xl bg-amber-300 border-2 border-black flex items-center justify-center text-2xl shadow-[3px_3px_0px_#000] transform -rotate-6">
            🦊
          </div>
          <div className="w-10 h-14 rounded-xl bg-amber-300 border-2 border-black flex items-center justify-center text-2xl shadow-[3px_3px_0px_#000] transform translate-y-1">
            🦊
          </div>
          <div className="w-10 h-14 rounded-xl bg-zinc-800 border-2 border-black flex items-center justify-center text-xl font-black text-yellow-400 shadow-[3px_3px_0px_#000] transform rotate-6">
            ?
          </div>
        </div>,
        '🃏 MATCH'
      );

    // 14. Color Flood Fill
    case 'color_flood':
      return renderCartoonFrame(
        'bg-gradient-to-br from-cyan-600 via-teal-800 to-slate-950',
        <div className="w-20 h-20 rounded-2xl bg-white border-2 border-black grid grid-cols-2 grid-rows-2 p-1 gap-1 shadow-[4px_4px_0px_#000]">
          <div className="bg-rose-500 rounded-lg border border-black" />
          <div className="bg-amber-400 rounded-lg border border-black" />
          <div className="bg-cyan-400 rounded-lg border border-black" />
          <div className="bg-emerald-400 rounded-lg border border-black" />
        </div>,
        '🎨 FLOOD'
      );

    // 15. Tower Block Stacker
    case 'block_stacker':
      return renderCartoonFrame(
        'bg-gradient-to-br from-slate-600 via-zinc-800 to-black',
        <div className="flex flex-col items-center gap-1">
          <div className="w-12 h-3.5 bg-rose-500 border-2 border-black rounded-md shadow-[2px_2px_0px_#000] transform translate-x-2" />
          <div className="w-14 h-3.5 bg-amber-400 border-2 border-black rounded-md shadow-[2px_2px_0px_#000]" />
          <div className="w-16 h-3.5 bg-cyan-400 border-2 border-black rounded-md shadow-[2px_2px_0px_#000]" />
          <div className="w-18 h-3.5 bg-emerald-400 border-2 border-black rounded-md shadow-[2px_2px_0px_#000]" />
        </div>,
        '🏢 TOWER'
      );

    // 16. Connect 4 Neon
    case 'connect_four':
      return renderCartoonFrame(
        'bg-gradient-to-br from-blue-600 via-indigo-800 to-slate-950',
        <div className="p-2 bg-blue-500 border-2 border-black rounded-2xl grid grid-cols-4 gap-1.5 shadow-[4px_4px_0px_#000]">
          <div className="w-5 h-5 rounded-full bg-yellow-300 border-2 border-black" />
          <div className="w-5 h-5 rounded-full bg-red-500 border-2 border-black" />
          <div className="w-5 h-5 rounded-full bg-yellow-300 border-2 border-black" />
          <div className="w-5 h-5 rounded-full bg-red-500 border-2 border-black" />
          <div className="w-5 h-5 rounded-full bg-red-500 border-2 border-black" />
          <div className="w-5 h-5 rounded-full bg-yellow-300 border-2 border-black" />
          <div className="w-5 h-5 rounded-full bg-red-500 border-2 border-black" />
          <div className="w-5 h-5 rounded-full bg-yellow-300 border-2 border-black" />
        </div>,
        '🔵 4-IN-ROW'
      );

    // 17. Sliding 15 Puzzle
    case 'sliding_15':
      return renderCartoonFrame(
        'bg-gradient-to-br from-amber-700 via-yellow-900 to-stone-950',
        <div className="grid grid-cols-3 gap-1.5 p-2 bg-black/60 rounded-2xl border-2 border-black shadow-[3px_3px_0px_#000]">
          <div className="w-7 h-7 rounded-lg bg-amber-400 border-2 border-black flex items-center justify-center font-black text-xs text-black">1</div>
          <div className="w-7 h-7 rounded-lg bg-amber-400 border-2 border-black flex items-center justify-center font-black text-xs text-black">2</div>
          <div className="w-7 h-7 rounded-lg bg-amber-400 border-2 border-black flex items-center justify-center font-black text-xs text-black">3</div>
          <div className="w-7 h-7 rounded-lg bg-amber-400 border-2 border-black flex items-center justify-center font-black text-xs text-black">4</div>
          <div className="w-7 h-7 rounded-lg bg-amber-400 border-2 border-black flex items-center justify-center font-black text-xs text-black">5</div>
          <div className="w-7 h-7 rounded-lg bg-zinc-800 border-2 border-black" />
        </div>,
        '🧩 SLIDER'
      );

    // 18. Sudoku Speed Mini
    case 'sudoku_speed':
      return renderCartoonFrame(
        'bg-gradient-to-br from-indigo-700 via-purple-900 to-slate-950',
        <div className="w-20 h-20 bg-white border-2 border-black rounded-2xl grid grid-cols-2 grid-rows-2 p-1 gap-1 text-black font-black text-sm shadow-[4px_4px_0px_#000]">
          <div className="flex items-center justify-center border border-black bg-yellow-200 rounded">1</div>
          <div className="flex items-center justify-center border border-black bg-cyan-200 rounded">4</div>
          <div className="flex items-center justify-center border border-black bg-rose-200 rounded">3</div>
          <div className="flex items-center justify-center border border-black bg-emerald-200 rounded">2</div>
        </div>,
        '🔲 SUDOKU'
      );

    // 19. Word Scramble Duel
    case 'word_scramble':
      return renderCartoonFrame(
        'bg-gradient-to-br from-pink-600 via-rose-800 to-fuchsia-950',
        <div className="flex items-center gap-1.5">
          <div className="w-8 h-10 rounded-xl bg-amber-300 border-2 border-black flex items-center justify-center font-black text-base text-black shadow-[2px_2px_0px_#000]">N</div>
          <div className="w-8 h-10 rounded-xl bg-cyan-300 border-2 border-black flex items-center justify-center font-black text-base text-black shadow-[2px_2px_0px_#000]">O</div>
          <div className="w-8 h-10 rounded-xl bg-lime-300 border-2 border-black flex items-center justify-center font-black text-base text-black shadow-[2px_2px_0px_#000]">O</div>
          <div className="w-8 h-10 rounded-xl bg-pink-300 border-2 border-black flex items-center justify-center font-black text-base text-black shadow-[2px_2px_0px_#000]">B</div>
        </div>,
        '🔤 WORDS'
      );

    // 20. Cyber Pipe Master
    case 'pipe_connect':
      return renderCartoonFrame(
        'bg-gradient-to-br from-emerald-600 via-teal-800 to-zinc-950',
        <div className="flex items-center gap-2">
          <div className="w-12 h-12 rounded-2xl bg-amber-400 border-2 border-black flex items-center justify-center text-2xl shadow-[3px_3px_0px_#000]">
            🚰
          </div>
          <div className="w-8 h-4 bg-cyan-400 border-2 border-black rounded-full animate-pulse" />
        </div>,
        '🔧 PIPES'
      );

    // 21. Rock Paper Scissors
    case 'rps':
    case 'rps_extreme':
      return renderCartoonFrame(
        'bg-gradient-to-br from-sky-600 via-blue-800 to-slate-950',
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-amber-300 border-2 border-black flex items-center justify-center text-xl shadow-[2px_2px_0px_#000] transform -rotate-12">
            ✊
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-400 border-2 border-black flex items-center justify-center text-2xl shadow-[2px_2px_0px_#000] transform scale-110">
            ✋
          </div>
          <div className="w-9 h-9 rounded-xl bg-pink-400 border-2 border-black flex items-center justify-center text-xl shadow-[2px_2px_0px_#000] transform rotate-12">
            ✌️
          </div>
        </div>,
        '✊ HANDS'
      );

    // 22. Reaction Timer Blitz
    case 'reaction_tap':
      return renderCartoonFrame(
        'bg-gradient-to-br from-lime-600 via-emerald-800 to-slate-950',
        <div className="w-16 h-16 rounded-full bg-[#00FF66] border-4 border-black flex items-center justify-center font-black text-sm text-black shadow-[4px_4px_0px_#000] animate-bounce">
          TAP!
        </div>,
        '⚡ REFLEX'
      );

    // 23. Whack-A-Mole Cyber
    case 'whack_a_mole':
      return renderCartoonFrame(
        'bg-gradient-to-br from-amber-700 via-orange-900 to-stone-950',
        <div className="flex items-center gap-2">
          <div className="w-12 h-12 rounded-2xl bg-amber-400 border-2 border-black flex items-center justify-center text-3xl shadow-[3px_3px_0px_#000]">
            🦔
          </div>
          <div className="w-10 h-10 rounded-2xl bg-rose-500 border-2 border-black flex items-center justify-center text-2xl shadow-[3px_3px_0px_#000] transform rotate-45">
            🔨
          </div>
        </div>,
        '🔨 WHACK'
      );

    // 24. Target Bullseye Sniper
    case 'target_sniper':
      return renderCartoonFrame(
        'bg-gradient-to-br from-red-600 via-rose-800 to-zinc-950',
        <div className="w-20 h-20 rounded-full border-4 border-black bg-white flex items-center justify-center shadow-[4px_4px_0px_#000]">
          <div className="w-14 h-14 rounded-full border-4 border-black bg-rose-500 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-black bg-yellow-400 flex items-center justify-center font-black text-xs text-black">
              100
            </div>
          </div>
        </div>,
        '🎯 BULLSEYE'
      );

    // 25. Speed Math Sprint
    case 'speed_math':
      return renderCartoonFrame(
        'bg-gradient-to-br from-cyan-600 via-blue-800 to-slate-950',
        <div className="px-3 py-2 bg-yellow-300 border-2 border-black rounded-2xl font-black text-base text-black shadow-[3px_3px_0px_#000]">
          12 × 7 = <span className="text-rose-600">84</span>
        </div>,
        '🧠 MATH'
      );

    // 26. Scribble & Guess
    case 'scribble':
      return renderCartoonFrame(
        'bg-gradient-to-br from-purple-600 via-fuchsia-800 to-indigo-950',
        <div className="flex items-center gap-2 transform -rotate-12">
          <div className="w-12 h-12 rounded-2xl bg-white border-2 border-black flex items-center justify-center text-3xl shadow-[3px_3px_0px_#000]">
            🎨
          </div>
          <div className="w-8 h-16 bg-amber-400 border-2 border-black rounded-t-sm shadow-[2px_2px_0px_#000] flex flex-col items-center">
            <div className="w-full h-3 bg-pink-500 border-b border-black" />
          </div>
        </div>,
        '✏️ DRAW'
      );

    // 27. Trivia Master
    case 'trivia_master':
      return renderCartoonFrame(
        'bg-gradient-to-br from-indigo-700 via-blue-900 to-slate-950',
        <div className="flex flex-col items-center gap-1">
          <div className="w-12 h-12 rounded-2xl bg-amber-400 border-2 border-black flex items-center justify-center text-2xl shadow-[3px_3px_0px_#000]">
            💡
          </div>
          <span className="text-[10px] font-black text-white bg-black px-2 py-0.5 rounded border border-white">
            Q&A DUEL
          </span>
        </div>,
        '🎓 TRIVIA'
      );

    // 28. Dice Roll Royale
    case 'dice_royale':
      return renderCartoonFrame(
        'bg-gradient-to-br from-orange-600 via-amber-800 to-stone-950',
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white border-2 border-black flex items-center justify-center font-black text-2xl text-black shadow-[3px_3px_0px_#000] transform -rotate-12">
            ⚅
          </div>
          <div className="w-12 h-12 rounded-2xl bg-yellow-400 border-2 border-black flex items-center justify-center font-black text-2xl text-black shadow-[3px_3px_0px_#000] transform rotate-12">
            ⚄
          </div>
        </div>,
        '🎲 DICE'
      );

    // 29. Spin Fortune Wheel
    case 'spin_wheel':
      return renderCartoonFrame(
        'bg-gradient-to-br from-fuchsia-600 via-purple-800 to-slate-950',
        <div className="w-18 h-18 rounded-full border-4 border-black bg-gradient-to-tr from-amber-400 via-rose-400 to-cyan-400 flex items-center justify-center shadow-[4px_4px_0px_#000]">
          <div className="w-8 h-8 rounded-full bg-white border-2 border-black flex items-center justify-center font-black text-xs text-black">
            ★
          </div>
        </div>,
        '🎡 WHEEL'
      );

    // 30. Coin Flip Pro
    case 'coin_flip_pro':
      return renderCartoonFrame(
        'bg-gradient-to-br from-amber-500 via-yellow-700 to-stone-950',
        <div className="w-16 h-16 rounded-full bg-yellow-400 border-4 border-black flex items-center justify-center font-black text-sm text-black shadow-[4px_4px_0px_#000] transform -rotate-6">
          NOOB
        </div>,
        '🪙 FLIP'
      );

    // Default Uniform 2D Cartoon-Style Graphic for All Other Mini-Games (31-50)
    default: {
      const cartoonIcons: Record<string, { icon: string; name: string; bg: string }> = {
        color_tap: { icon: '🌈', name: 'COLOR TAP', bg: 'bg-gradient-to-br from-pink-600 via-purple-800 to-slate-950' },
        tap_duel: { icon: '👆', name: 'TAP BATTLE', bg: 'bg-gradient-to-br from-rose-600 via-orange-800 to-stone-950' },
        fruit_slash: { icon: '🍉', name: 'SLASH', bg: 'bg-gradient-to-br from-emerald-600 via-green-800 to-slate-950' },
        knife_hit: { icon: '🗡️', name: 'KNIFE HIT', bg: 'bg-gradient-to-br from-amber-600 via-yellow-800 to-zinc-950' },
        ninja_jump: { icon: '🥷', name: 'NINJA', bg: 'bg-gradient-to-br from-slate-700 via-zinc-900 to-black' },
        cyber_racer: { icon: '🏎️', name: 'RACER', bg: 'bg-gradient-to-br from-red-600 via-rose-800 to-slate-950' },
        dunk_hoops: { icon: '🏀', name: 'DUNK', bg: 'bg-gradient-to-br from-orange-600 via-amber-800 to-stone-950' },
        penalty_kick: { icon: '⚽', name: 'STRIKE', bg: 'bg-gradient-to-br from-teal-600 via-emerald-800 to-slate-950' },
        card_high_low: { icon: '🂡', name: 'CARDS', bg: 'bg-gradient-to-br from-blue-600 via-indigo-800 to-slate-950' },
        liars_dice: { icon: '🎲', name: 'BLUFF', bg: 'bg-gradient-to-br from-amber-700 via-orange-900 to-stone-950' },
        emoji_pictionary: { icon: '😎', name: 'EMOJI', bg: 'bg-gradient-to-br from-yellow-500 via-amber-700 to-stone-950' },
        truth_or_dare: { icon: '🎭', name: 'PARTY', bg: 'bg-gradient-to-br from-purple-600 via-fuchsia-800 to-slate-950' },
        would_you_rather: { icon: '🤔', name: 'CHOICE', bg: 'bg-gradient-to-br from-cyan-600 via-sky-800 to-slate-950' },
        bingo_blitz: { icon: '🎫', name: 'BINGO', bg: 'bg-gradient-to-br from-emerald-600 via-teal-800 to-zinc-950' },
        heads_or_tails: { icon: '🪙', name: 'COIN', bg: 'bg-gradient-to-br from-amber-600 via-yellow-800 to-stone-950' },
        chess_blitz: { icon: '♟️', name: 'CHESS', bg: 'bg-gradient-to-br from-stone-600 via-zinc-800 to-black' },
        checkers_neon: { icon: '🔴', name: 'CHECKERS', bg: 'bg-gradient-to-br from-red-600 via-rose-800 to-slate-950' },
        maze_escape: { icon: '🏃', name: 'MAZE', bg: 'bg-gradient-to-br from-indigo-600 via-blue-800 to-slate-950' },
        simon_says: { icon: '🎵', name: 'SIMON', bg: 'bg-gradient-to-br from-cyan-600 via-teal-800 to-slate-950' },
        color_match: { icon: '🎯', name: 'MATCH', bg: 'bg-gradient-to-br from-fuchsia-600 via-pink-800 to-slate-950' }
      };

      const match = cartoonIcons[id] || { icon: '🎮', name: '2D ARCADE', bg: 'bg-gradient-to-br from-indigo-700 via-purple-900 to-slate-950' };

      return renderCartoonFrame(
        match.bg,
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-amber-300 border-2 border-black flex items-center justify-center text-3xl shadow-[4px_4px_0px_#000] transform -rotate-6">
            {match.icon}
          </div>
          <div className="flex flex-col gap-1">
            <div className="px-2 py-0.5 rounded-md bg-white border-2 border-black text-[10px] font-black text-black shadow-[2px_2px_0px_#000]">
              POP-ART 2D
            </div>
            <div className="flex gap-1 text-yellow-300 text-xs">
              <span>★</span>
              <span>★</span>
              <span>★</span>
            </div>
          </div>
        </div>,
        match.name
      );
    }
  }
};
