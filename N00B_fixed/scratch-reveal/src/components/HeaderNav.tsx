import React from 'react';
import { Sparkles, HelpCircle, Code2, Globe } from 'lucide-react';

interface HeaderNavProps {
  clearedPercentage: number;
  onOpenHelp: () => void;
  onOpenCode: () => void;
}

export const HeaderNav: React.FC<HeaderNavProps> = ({
  clearedPercentage,
  onOpenHelp,
  onOpenCode,
}) => {
  return (
    <header className="w-full flex items-center justify-between py-3 px-4 bg-[#0a0a0d] border-b-2 border-white/80 sticky top-0 z-40 backdrop-blur-md select-none">
      {/* Brand & Domain */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-white text-black flex items-center justify-center font-marker text-base border-2 border-white shadow-[2px_2px_0px_0px_#ffffff]">
          NB
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="font-marker text-sm tracking-wide text-white">
              NOOB SOCIALS
            </h1>
            <span className="px-1.5 py-0.2 rounded bg-yellow-400 text-black text-[9px] font-marker">
              SCRATCH
            </span>
          </div>
          <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-400">
            <Globe className="w-3 h-3 text-cyan-400" />
            <span>noobsocials.com</span>
          </div>
        </div>
      </div>

      {/* Center Reveal Meter */}
      <div className="flex items-center gap-2">
        <div className="hidden sm:flex flex-col items-end">
          <span className="text-[10px] font-marker uppercase text-zinc-400">
            Uncovered
          </span>
          <span className="text-xs font-mono font-bold text-white">
            {clearedPercentage}%
          </span>
        </div>
        <div className="relative w-16 sm:w-24 h-3 bg-zinc-900 rounded-full border border-white/60 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-400 via-emerald-400 to-cyan-400 transition-all duration-200"
            style={{ width: `${clearedPercentage}%` }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="View Handover Specs"
          title="Developer Handover & Specs"
          onClick={onOpenCode}
          className="p-2 rounded-xl bg-purple-950/40 hover:bg-purple-900/60 text-purple-300 border border-purple-400 shadow-[2px_2px_0px_0px_#a855f7] active:scale-95 transition-all flex items-center gap-1"
        >
          <Code2 className="w-3.5 h-3.5" />
          <span className="text-[10px] font-marker hidden md:inline">Handover</span>
        </button>

        <button
          type="button"
          aria-label="How to Scratch Info"
          title="Scratch Instructions"
          onClick={onOpenHelp}
          className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/60 shadow-[2px_2px_0px_0px_#ffffff] active:scale-95 transition-all"
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
