import React, { useState } from 'react';
import { Trophy, RotateCcw, ArrowLeft, Share2, Users, FileText, Check } from 'lucide-react';
import { PieceColor, GameStatus } from './types';

interface GameResultProps {
  status: GameStatus;
  winner: PieceColor | 'draw' | null;
  reason: string;
  movesCount: number;
  whitePlayerName: string;
  blackPlayerName: string;
  onPlayAgain: () => void;
  onNewGame: () => void;
  onBack?: () => void;
  onShareResult?: (result: { winner: string; reason: string; movesCount: number }) => void;
  onChallengeFriend?: () => void;
  getPgn?: () => string;
}

export const GameResult: React.FC<GameResultProps> = ({
  status,
  winner,
  reason,
  movesCount,
  whitePlayerName,
  blackPlayerName,
  onPlayAgain,
  onNewGame,
  onBack,
  onShareResult,
  onChallengeFriend,
  getPgn,
}) => {
  const [copiedShare, setCopiedShare] = useState(false);
  const [copiedPgn, setCopiedPgn] = useState(false);

  const winnerName =
    winner === 'w' ? whitePlayerName : winner === 'b' ? blackPlayerName : 'Draw';
  const isDraw = winner === 'draw';

  const handleShare = () => {
    if (onShareResult) {
      onShareResult({
        winner: winnerName,
        reason,
        movesCount,
      });
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(
        `NOOB Chess Result: ${isDraw ? 'Draw' : `${winnerName} Won!`} (${reason} in ${movesCount} moves)`
      );
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2000);
    }
  };

  const handleCopyPgn = async () => {
    if (!getPgn) return;
    const pgnText = getPgn();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(pgnText);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = pgnText;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedPgn(true);
      setTimeout(() => setCopiedPgn(false), 2000);
    } catch (err) {
      console.error('Failed to copy PGN:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl max-w-sm w-full text-center shadow-2xl relative">
        <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 flex items-center justify-center text-2xl shadow-lg">
          <Trophy className="w-7 h-7 text-cyan-400" />
        </div>

        <h2 className="text-xl font-black text-white tracking-tight uppercase mb-1">
          {isDraw ? 'Game Drawn' : `🏆 ${winnerName} Wins!`}
        </h2>
        <p className="text-xs font-mono font-bold text-cyan-400 mb-2 uppercase tracking-wide">
          {reason}
        </p>

        <div className="text-xs text-slate-400 font-mono mb-5 bg-slate-950/60 py-2 rounded-xl border border-slate-800 flex items-center justify-around">
          <span>{movesCount} moves</span>
          <span>·</span>
          <span>Standard FIDE</span>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-2">
          <button
            onClick={onPlayAgain}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Play Again</span>
          </button>

          <button
            onClick={onNewGame}
            className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors cursor-pointer"
          >
            New Game Setup
          </button>

          {/* Export PGN Button */}
          {getPgn && (
            <button
              onClick={handleCopyPgn}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-mono font-semibold text-slate-300 hover:text-cyan-400 transition-colors cursor-pointer"
            >
              {copiedPgn ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-bold">PGN Copied to Clipboard!</span>
                </>
              ) : (
                <>
                  <FileText className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Copy Game PGN to Clipboard</span>
                </>
              )}
            </button>
          )}

          <div className="flex gap-2 mt-1">
            <button
              onClick={handleShare}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>{copiedShare ? 'Copied!' : 'Share'}</span>
            </button>

            {onChallengeFriend && (
              <button
                onClick={onChallengeFriend}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Challenge</span>
              </button>
            )}

            {onBack && (
              <button
                onClick={onBack}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
