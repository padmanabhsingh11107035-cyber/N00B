import React from 'react';
import { X, Sparkles, Coins, Eye, RefreshCw, Upload, Volume2 } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-[#0d0d12] border-2 border-white rounded-3xl shadow-[5px_5px_0px_0px_#ffffff] p-5 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-3 border-b-2 border-white/40">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-yellow-400 text-black flex items-center justify-center border border-white font-marker text-xs">
              ?
            </div>
            <div>
              <h3 className="font-marker text-sm text-white">How Scratch Reveal Works</h3>
              <p className="font-doodle text-xs text-zinc-400">Tactile photo mystery cards</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close help"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-zinc-900 text-zinc-300 hover:text-white border border-white/40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="py-4 space-y-3 font-sans text-xs text-zinc-200">
          <div className="flex items-start gap-3 p-2.5 rounded-xl bg-black border border-white/20">
            <Coins className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="font-marker text-white block">1. Drag to Scratch</strong>
              Swipe across the card with your finger or mouse. Choose between Lucky Coin, Car Key, Guitar Pick, or Sponge.
            </div>
          </div>

          <div className="flex items-start gap-3 p-2.5 rounded-xl bg-black border border-white/20">
            <Sparkles className="w-5 h-5 text-yellow-300 shrink-0 mt-0.5" />
            <div>
              <strong className="font-marker text-white block">2. Unlock Milestone at 72%</strong>
              Scratching past 72% unlocks the full photo with celebratory confetti and verified post status!
            </div>
          </div>

          <div className="flex items-start gap-3 p-2.5 rounded-xl bg-black border border-white/20">
            <Eye className="w-5 h-5 text-cyan-300 shrink-0 mt-0.5" />
            <div>
              <strong className="font-marker text-white block">3. X-Ray Sneak Peek</strong>
              Need a spoiler? Hit X-Ray Peek to temporarily make the foil translucent for 1.5 seconds.
            </div>
          </div>

          <div className="flex items-start gap-3 p-2.5 rounded-xl bg-black border border-white/20">
            <Upload className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <strong className="font-marker text-white block">4. Upload & Foil Any Photo</strong>
              Click the Upload button to seal any picture with signature Noob Socials doodle foil!
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 bg-white text-black font-marker text-xs rounded-xl border-2 border-white shadow-[3px_3px_0px_0px_#ffffff] active:scale-95"
        >
          Got It, Let's Scratch!
        </button>
      </div>
    </div>
  );
};
