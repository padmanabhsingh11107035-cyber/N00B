import React from 'react';
import { BookOpen, Check, Shield, Trophy, X, Zap } from 'lucide-react';
import { soundEffects } from '../audio/soundEffects';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RulesModal: React.FC<RulesModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-lg max-h-[90vh] bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-950 border border-indigo-500/40 rounded-3xl p-5 md:p-6 shadow-2xl overflow-y-auto text-left">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-400" />
            <h2 className="text-xl font-black text-white">LUDO GAME RULES</h2>
          </div>
          <button
            onClick={() => {
              soundEffects.playButtonClick();
              onClose();
            }}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 my-4 text-xs md:text-sm text-slate-300">
          <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800">
            <h3 className="font-black text-white flex items-center gap-1.5 mb-1 text-sm">
              <Zap className="w-4 h-4 text-amber-400" />
              1. Leaving the Yard (Rolling a 6)
            </h3>
            <p className="text-slate-400">
              A token begins inside your corner Yard. Rolling a <strong>6</strong> allows you to release one token onto your starting square. Rolling a 6 also awards an immediate <strong>Extra Roll</strong>!
            </p>
          </div>

          <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800">
            <h3 className="font-black text-white flex items-center gap-1.5 mb-1 text-sm">
              <Shield className="w-4 h-4 text-emerald-400" />
              2. Safe Squares (Star Cells)
            </h3>
            <p className="text-slate-400">
              Cells marked with a star (★) plus every player’s starting square are <strong>Safe Zones</strong>. Tokens resting on safe squares cannot be captured by opponents.
            </p>
          </div>

          <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800">
            <h3 className="font-black text-white flex items-center gap-1.5 mb-1 text-sm">
              ⚔️ 3. Capturing Opponents
            </h3>
            <p className="text-slate-400">
              Landing your token on the exact non-safe cell occupied by an opponent <strong>captures</strong> their token, sending it back to their yard, and awards you a <strong>Bonus Extra Roll</strong>!
            </p>
          </div>

          <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800">
            <h3 className="font-black text-white flex items-center gap-1.5 mb-1 text-sm">
              <Trophy className="w-4 h-4 text-amber-400" />
              4. Reaching Home & Winning
            </h3>
            <p className="text-slate-400">
              After completing the outer track, tokens enter your colored home corridor (1–5) and reach the center with an <strong>exact dice roll</strong>. In Classic mode, getting all 4 tokens home wins! In Quick mode, first to 2 tokens home wins!
            </p>
          </div>

          <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800">
            <h3 className="font-black text-white flex items-center gap-1.5 mb-1 text-sm">
              🤝 5. Team Up 2 vs 2 Rules
            </h3>
            <p className="text-slate-400">
              Teammates (Team 1 or Team 2) can share cells safely and cannot capture each other. The team whose combined tokens reach home first wins the match!
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            soundEffects.playButtonClick();
            onClose();
          }}
          className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs shadow-lg transition-all cursor-pointer"
        >
          GOT IT, LET'S PLAY!
        </button>
      </div>
    </div>
  );
};
