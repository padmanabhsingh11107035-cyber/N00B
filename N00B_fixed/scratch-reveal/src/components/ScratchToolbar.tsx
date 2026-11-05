import React from 'react';
import {
  Coins,
  Key,
  Disc,
  Eraser,
  Wand2,
  Eye,
  RefreshCw,
  Sparkles,
  Volume2,
  VolumeX,
  Upload,
  Shuffle,
  Code2,
  Palette,
  CircleDot,
  Layers,
  Circle,
  Square,
  ShieldAlert,
} from 'lucide-react';
import {
  ScratchTool,
  SCRATCH_TOOLS,
  FoilType,
  FOIL_CONFIGS,
} from '../utils/scratchEngine';
import { BrushSize } from '../types/scratch';

interface ScratchToolbarProps {
  currentTool: ScratchTool;
  onSelectTool: (tool: ScratchTool) => void;
  brushSize: BrushSize;
  onSelectBrushSize: (size: BrushSize) => void;
  foilType: FoilType;
  onSelectFoilType: (foil: FoilType) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onMagicReveal: () => void;
  onReseal: () => void;
  onPeek: () => void;
  onOpenUpload: () => void;
  onNextPost: () => void;
  onOpenCodeModal: () => void;
  clearedPct: number;
}

export const ScratchToolbar: React.FC<ScratchToolbarProps> = ({
  currentTool,
  onSelectTool,
  brushSize,
  onSelectBrushSize,
  foilType,
  onSelectFoilType,
  soundEnabled,
  onToggleSound,
  onMagicReveal,
  onReseal,
  onPeek,
  onOpenUpload,
  onNextPost,
  onOpenCodeModal,
  clearedPct,
}) => {
  return (
    <div className="w-full flex flex-col gap-3 py-3 select-none">
      {/* SECTION 1: SCRATCH TOOLS (Diverse Shapes: Hexagon, Teardrop, Pick, Squircle, Diamond) */}
      <div className="bg-[#101014] p-3 rounded-2xl border-2 border-white shadow-[3px_3px_0px_0px_#ffffff]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-white text-xs font-marker tracking-wider uppercase">
              ⚡ Scratch Tools
            </span>
            <span className="text-[10px] font-doodle text-zinc-400">
              (Choose your edge)
            </span>
          </div>
          <span className="text-[11px] font-mono text-zinc-300">
            Active: <strong className="text-white font-marker">{currentTool.name}</strong>
          </span>
        </div>

        <div className="grid grid-cols-5 gap-2">
          {/* Button 1: Hexagon Shape - Coin */}
          <button
            type="button"
            aria-label="Select Lucky Coin tool"
            title="Lucky Coin - Classic rounded scratching edge"
            onClick={() => onSelectTool(SCRATCH_TOOLS.coin)}
            className={`group relative flex flex-col items-center justify-center py-2 px-1 transition-all ${
              currentTool.id === 'coin'
                ? 'bg-white text-black translate-y-[-2px] shadow-[2px_2px_0px_0px_#ca8a04]'
                : 'bg-zinc-900 text-white hover:bg-zinc-800'
            } border-2 border-white rounded-xl`}
          >
            <div className="w-9 h-9 flex items-center justify-center shape-hexagon bg-amber-500/20 group-hover:bg-amber-500/40 border border-amber-400/80 mb-1">
              <Coins className={`w-5 h-5 ${currentTool.id === 'coin' ? 'text-black' : 'text-amber-300'}`} />
            </div>
            <span className="text-[10px] font-marker leading-tight">Coin</span>
            <span className="text-[8px] font-doodle opacity-70">Wide edge</span>
          </button>

          {/* Button 2: Teardrop Shape - Car Key */}
          <button
            type="button"
            aria-label="Select Car Key tool"
            title="Brass Car Key - Ultra precise peeling point"
            onClick={() => onSelectTool(SCRATCH_TOOLS.key)}
            className={`group relative flex flex-col items-center justify-center py-2 px-1 transition-all ${
              currentTool.id === 'key'
                ? 'bg-white text-black translate-y-[-2px] shadow-[2px_2px_0px_0px_#38bdf8]'
                : 'bg-zinc-900 text-white hover:bg-zinc-800'
            } border-2 border-white rounded-xl`}
          >
            <div className="w-9 h-9 flex items-center justify-center shape-teardrop bg-sky-500/20 group-hover:bg-sky-500/40 border border-sky-400/80 mb-1">
              <Key className={`w-4 h-4 ${currentTool.id === 'key' ? 'text-black' : 'text-sky-300'}`} />
            </div>
            <span className="text-[10px] font-marker leading-tight">Key</span>
            <span className="text-[8px] font-doodle opacity-70">Sharp point</span>
          </button>

          {/* Button 3: Guitar Pick Shape */}
          <button
            type="button"
            aria-label="Select Guitar Pick tool"
            title="Guitar Pick - Smooth glide"
            onClick={() => onSelectTool(SCRATCH_TOOLS.guitar_pick)}
            className={`group relative flex flex-col items-center justify-center py-2 px-1 transition-all ${
              currentTool.id === 'guitar_pick'
                ? 'bg-white text-black translate-y-[-2px] shadow-[2px_2px_0px_0px_#ec4899]'
                : 'bg-zinc-900 text-white hover:bg-zinc-800'
            } border-2 border-white rounded-xl`}
          >
            <div className="w-9 h-9 flex items-center justify-center shape-pick bg-pink-500/20 group-hover:bg-pink-500/40 border border-pink-400/80 mb-1">
              <Disc className={`w-4 h-4 ${currentTool.id === 'guitar_pick' ? 'text-black' : 'text-pink-300'}`} />
            </div>
            <span className="text-[10px] font-marker leading-tight">Pick</span>
            <span className="text-[8px] font-doodle opacity-70">Celluloid</span>
          </button>

          {/* Button 4: Wavy Eraser Squircle Shape */}
          <button
            type="button"
            aria-label="Select Chalk Eraser tool"
            title="Chalk Eraser - Broad swab wipe"
            onClick={() => onSelectTool(SCRATCH_TOOLS.eraser)}
            className={`group relative flex flex-col items-center justify-center py-2 px-1 transition-all ${
              currentTool.id === 'eraser'
                ? 'bg-white text-black translate-y-[-2px] shadow-[2px_2px_0px_0px_#10b981]'
                : 'bg-zinc-900 text-white hover:bg-zinc-800'
            } border-2 border-white rounded-xl`}
          >
            <div className="w-9 h-9 flex items-center justify-center shape-pebble-1 bg-emerald-500/20 group-hover:bg-emerald-500/40 border border-emerald-400/80 mb-1">
              <Eraser className={`w-4 h-4 ${currentTool.id === 'eraser' ? 'text-black' : 'text-emerald-300'}`} />
            </div>
            <span className="text-[10px] font-marker leading-tight">Sponge</span>
            <span className="text-[8px] font-doodle opacity-70">Broad felt</span>
          </button>

          {/* Button 5: Diamond Starburst - Magic Wand */}
          <button
            type="button"
            aria-label="Select Magic Wand tool"
            title="Magic Wand - Glowing starlight scratch"
            onClick={() => onSelectTool(SCRATCH_TOOLS.magic_wand)}
            className={`group relative flex flex-col items-center justify-center py-2 px-1 transition-all ${
              currentTool.id === 'magic_wand'
                ? 'bg-white text-black translate-y-[-2px] shadow-[2px_2px_0px_0px_#a855f7]'
                : 'bg-zinc-900 text-white hover:bg-zinc-800'
            } border-2 border-white rounded-xl`}
          >
            <div className="w-9 h-9 flex items-center justify-center shape-diamond bg-purple-500/20 group-hover:bg-purple-500/40 border border-purple-400/80 mb-1">
              <Wand2 className={`w-4 h-4 ${currentTool.id === 'magic_wand' ? 'text-black' : 'text-purple-300'}`} />
            </div>
            <span className="text-[10px] font-marker leading-tight">Wand</span>
            <span className="text-[8px] font-doodle opacity-70">Starlight</span>
          </button>
        </div>
      </div>

      {/* SECTION 2: SPECIAL ACTION BUTTONS (Magic Auto-Reveal, Reseal, X-Ray Peek, Audio) */}
      <div className="grid grid-cols-4 gap-2">
        {/* Button 6: Diamond Sparkle Auto-Reveal */}
        <button
          type="button"
          aria-label="Magic Reveal All"
          title="Instant 100% Reveal with celebration confetti"
          onClick={onMagicReveal}
          className="flex flex-col items-center justify-center p-2.5 bg-gradient-to-br from-yellow-500 to-amber-600 text-black font-marker rounded-xl border-2 border-white shadow-[2px_2px_0px_0px_#ffffff] hover:scale-105 active:scale-95 transition-transform"
        >
          <div className="w-7 h-7 flex items-center justify-center shape-diamond bg-black/20 border border-black/40 mb-1">
            <Sparkles className="w-4 h-4 text-black" />
          </div>
          <span className="text-[10px] leading-tight font-bold">Reveal All</span>
        </button>

        {/* Button 7: Shield Shape Reseal Cover */}
        <button
          type="button"
          aria-label="Reseal Scratch Card"
          title="Apply fresh scratch foil layer"
          onClick={onReseal}
          className="flex flex-col items-center justify-center p-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl border-2 border-white shadow-[2px_2px_0px_0px_#ffffff] hover:scale-105 active:scale-95 transition-transform"
        >
          <div className="w-7 h-7 flex items-center justify-center shape-octagon bg-white/10 border border-white/30 mb-1">
            <RefreshCw className="w-3.5 h-3.5 text-zinc-200" />
          </div>
          <span className="text-[10px] font-marker leading-tight">Reseal</span>
        </button>

        {/* Button 8: Almond Eye X-Ray Peek */}
        <button
          type="button"
          aria-label="X-Ray Peek Behind Foil"
          title="Hold/click to peek through foil for 1.5 seconds"
          onClick={onPeek}
          className="flex flex-col items-center justify-center p-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl border-2 border-white shadow-[2px_2px_0px_0px_#ffffff] hover:scale-105 active:scale-95 transition-transform"
        >
          <div className="w-7 h-7 flex items-center justify-center rounded-full bg-cyan-500/20 border border-cyan-400 mb-1">
            <Eye className="w-4 h-4 text-cyan-300" />
          </div>
          <span className="text-[10px] font-marker leading-tight">X-Ray Peek</span>
        </button>

        {/* Button 9: Soundwave Bell Audio Toggle */}
        <button
          type="button"
          aria-label={soundEnabled ? 'Mute Scratch Sound FX' : 'Enable Scratch Sound FX'}
          title={soundEnabled ? 'Friction audio ON' : 'Friction audio MUTED'}
          onClick={onToggleSound}
          className={`flex flex-col items-center justify-center p-2.5 ${
            soundEnabled ? 'bg-zinc-900 text-white' : 'bg-red-950/40 text-red-300 border-red-400'
          } rounded-xl border-2 border-white shadow-[2px_2px_0px_0px_#ffffff] hover:scale-105 active:scale-95 transition-transform`}
        >
          <div className="w-7 h-7 flex items-center justify-center shape-pebble-2 bg-white/10 border border-white/30 mb-1">
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-emerald-300" />
            ) : (
              <VolumeX className="w-4 h-4 text-red-400" />
            )}
          </div>
          <span className="text-[10px] font-marker leading-tight">
            {soundEnabled ? 'Sound: ON' : 'Muted'}
          </span>
        </button>
      </div>

      {/* SECTION 3: FOIL STYLES & BRUSH SIZES */}
      <div className="grid grid-cols-2 gap-2">
        {/* Foil Themes Row (Buttons 10, 11, 12, 13) */}
        <div className="bg-[#101014] p-2.5 rounded-2xl border-2 border-white shadow-[2px_2px_0px_0px_#ffffff]">
          <div className="flex items-center gap-1 mb-2">
            <Palette className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-[11px] font-marker uppercase text-zinc-300">
              Foil Textures
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {/* Button 10: Inverted Chalk Doodle Foil Swatch */}
            <button
              type="button"
              aria-label="Select Doodle Signature Foil"
              title="Official Noob Socials Chalkboard Doodle Theme"
              onClick={() => onSelectFoilType('doodle')}
              className={`p-1.5 rounded-lg border-2 flex flex-col items-center ${
                foilType === 'doodle'
                  ? 'border-white bg-zinc-800 ring-2 ring-white/60'
                  : 'border-zinc-700 bg-black opacity-60 hover:opacity-100'
              }`}
            >
              <div
                className="w-6 h-6 rounded-md border border-white/50 bg-cover"
                style={{ backgroundImage: `url('/assets/foil/image_ed31b758.png')` }}
              />
              <span className="text-[8px] font-doodle mt-0.5 text-zinc-200">Doodle</span>
            </button>

            {/* Button 11: Chrome Silver Foil Swatch */}
            <button
              type="button"
              aria-label="Select Chrome Silver Foil"
              title="Brushed Silver Metallic Foil"
              onClick={() => onSelectFoilType('silver')}
              className={`p-1.5 rounded-lg border-2 flex flex-col items-center ${
                foilType === 'silver'
                  ? 'border-white bg-zinc-800 ring-2 ring-white/60'
                  : 'border-zinc-700 bg-black opacity-60 hover:opacity-100'
              }`}
            >
              <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-gray-400 via-gray-200 to-gray-500 border border-white" />
              <span className="text-[8px] font-doodle mt-0.5 text-zinc-200">Silver</span>
            </button>

            {/* Button 12: 24K Gold Dust Foil Swatch */}
            <button
              type="button"
              aria-label="Select 24K Gold Foil"
              title="24K VIP Golden Dust Foil"
              onClick={() => onSelectFoilType('gold')}
              className={`p-1.5 rounded-lg border-2 flex flex-col items-center ${
                foilType === 'gold'
                  ? 'border-white bg-zinc-800 ring-2 ring-white/60'
                  : 'border-zinc-700 bg-black opacity-60 hover:opacity-100'
              }`}
            >
              <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-amber-600 via-yellow-300 to-amber-500 border border-amber-200" />
              <span className="text-[8px] font-doodle mt-0.5 text-zinc-200">Gold</span>
            </button>

            {/* Button 13: Cyber Holographic Foil Swatch */}
            <button
              type="button"
              aria-label="Select Cyber Hologram Foil"
              title="Prismatic Neon Iridescent Foil"
              onClick={() => onSelectFoilType('holographic')}
              className={`p-1.5 rounded-lg border-2 flex flex-col items-center ${
                foilType === 'holographic'
                  ? 'border-white bg-zinc-800 ring-2 ring-white/60'
                  : 'border-zinc-700 bg-black opacity-60 hover:opacity-100'
              }`}
            >
              <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-pink-500 via-sky-400 to-emerald-400 border border-pink-200" />
              <span className="text-[8px] font-doodle mt-0.5 text-zinc-200">Holo</span>
            </button>
          </div>
        </div>

        {/* Brush Sizes (Buttons 14, 15, 16) */}
        <div className="bg-[#101014] p-2.5 rounded-2xl border-2 border-white shadow-[2px_2px_0px_0px_#ffffff]">
          <div className="flex items-center gap-1 mb-2">
            <Layers className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-[11px] font-marker uppercase text-zinc-300">
              Scratch Width
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {/* Button 14: Fine Nib Dot Button */}
            <button
              type="button"
              aria-label="Select Small Fine Scratch Brush"
              title="Fine 12px stroke"
              onClick={() => onSelectBrushSize('small')}
              className={`p-2 rounded-lg border-2 flex flex-col items-center justify-center ${
                brushSize === 'small'
                  ? 'border-white bg-white text-black'
                  : 'border-zinc-700 bg-black text-white hover:border-zinc-500'
              }`}
            >
              <div className="w-2 h-2 rounded-full bg-current mb-1" />
              <span className="text-[9px] font-marker">Fine</span>
            </button>

            {/* Button 15: Medium Nib Ring Button */}
            <button
              type="button"
              aria-label="Select Medium Scratch Brush"
              title="Standard 26px stroke"
              onClick={() => onSelectBrushSize('medium')}
              className={`p-2 rounded-lg border-2 flex flex-col items-center justify-center ${
                brushSize === 'medium'
                  ? 'border-white bg-white text-black'
                  : 'border-zinc-700 bg-black text-white hover:border-zinc-500'
              }`}
            >
              <div className="w-3.5 h-3.5 rounded-full border-2 border-current mb-1" />
              <span className="text-[9px] font-marker">Mid</span>
            </button>

            {/* Button 16: Chunky Slab Square Button */}
            <button
              type="button"
              aria-label="Select Large Heavy Scratch Brush"
              title="Broad 52px swipe stroke"
              onClick={() => onSelectBrushSize('large')}
              className={`p-2 rounded-lg border-2 flex flex-col items-center justify-center ${
                brushSize === 'large'
                  ? 'border-white bg-white text-black'
                  : 'border-zinc-700 bg-black text-white hover:border-zinc-500'
              }`}
            >
              <div className="w-5 h-5 rounded-md bg-current mb-1" />
              <span className="text-[9px] font-marker">Heavy</span>
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 4: POST NAVIGATION & UPLOAD BUTTONS */}
      <div className="grid grid-cols-3 gap-2">
        {/* Button 17: Chamfered Octagon Photo Upload Button */}
        <button
          type="button"
          aria-label="Upload your own photo to create scratch card"
          title="Upload or paste image URL to scratch"
          onClick={onOpenUpload}
          className="flex items-center justify-center gap-2 py-2.5 px-3 bg-white text-black font-marker text-xs rounded-xl border-2 border-white shadow-[2px_2px_0px_0px_#ffffff] hover:bg-zinc-200 active:scale-95 transition-all"
        >
          <div className="w-5 h-5 flex items-center justify-center shape-octagon bg-black text-white">
            <Upload className="w-3 h-3" />
          </div>
          <span>Upload</span>
        </button>

        {/* Button 18: Sketched Circular Next Post Button */}
        <button
          type="button"
          aria-label="Shuffle to Next Mystery Scratch Post"
          title="Load next mystery photo card from Noob Socials feed"
          onClick={onNextPost}
          className="flex items-center justify-center gap-2 py-2.5 px-3 bg-zinc-900 hover:bg-zinc-800 text-white font-marker text-xs rounded-xl border-2 border-white shadow-[2px_2px_0px_0px_#ffffff] active:scale-95 transition-all"
        >
          <div className="w-5 h-5 flex items-center justify-center rounded-full bg-white/10 border border-white">
            <Shuffle className="w-3 h-3 text-white" />
          </div>
          <span>Next Card</span>
        </button>

        {/* Button 19: Tech Bracket Developer Code Handover Button */}
        <button
          type="button"
          aria-label="Open Code Handover Specs & Export"
          title="View drop-in component code & handover documentation for Noob Socials team"
          onClick={onOpenCodeModal}
          className="flex items-center justify-center gap-2 py-2.5 px-3 bg-purple-950/60 hover:bg-purple-900/80 text-purple-200 font-marker text-xs rounded-xl border-2 border-purple-400 shadow-[2px_2px_0px_0px_#a855f7] active:scale-95 transition-all"
        >
          <div className="w-5 h-5 flex items-center justify-center shape-diamond bg-purple-500/30 border border-purple-400">
            <Code2 className="w-3 h-3 text-purple-200" />
          </div>
          <span>Handover</span>
        </button>
      </div>
    </div>
  );
};
