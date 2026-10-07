import React from 'react';
import { X, Volume2, VolumeX, Check, Sparkles, Music } from 'lucide-react';
import { BoardPaletteId, PieceStyleId } from './types';
import { BOARD_PALETTES, PIECE_STYLES } from './themes';
import { audioManager } from './AudioManager';
import { ChessPiece } from './ChessPiece';

interface ChessThemeModalProps {
  currentPaletteId: BoardPaletteId;
  currentPieceStyle: PieceStyleId;
  soundEnabled: boolean;
  onSelectPalette: (id: BoardPaletteId) => void;
  onSelectPieceStyle: (id: PieceStyleId) => void;
  onToggleSound: () => void;
  onClose: () => void;
}

export const ChessThemeModal: React.FC<ChessThemeModalProps> = ({
  currentPaletteId,
  currentPieceStyle,
  soundEnabled,
  onSelectPalette,
  onSelectPieceStyle,
  onToggleSound,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full shadow-2xl p-5 sm:p-6 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            <h3 className="text-base font-extrabold text-white">Board Themes & Audio</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto py-4 space-y-6 pr-1">
          {/* Board Color Palettes */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Board Color Palette
              </label>
              <span className="text-[11px] font-mono text-cyan-400">
                {BOARD_PALETTES[currentPaletteId]?.name}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {Object.values(BOARD_PALETTES).map(palette => {
                const isSelected = currentPaletteId === palette.id;
                return (
                  <button
                    key={palette.id}
                    onClick={() => onSelectPalette(palette.id)}
                    className={`flex items-center gap-2.5 p-2.5 rounded-2xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-slate-800 border-cyan-500 ring-1 ring-cyan-500/50 shadow-md'
                        : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    {/* Mini Board Swatch Preview */}
                    <div className="w-8 h-8 rounded-lg border border-slate-700 overflow-hidden grid grid-cols-2 grid-rows-2 shrink-0">
                      <div style={{ backgroundColor: palette.lightSquare }} />
                      <div style={{ backgroundColor: palette.darkSquare }} />
                      <div style={{ backgroundColor: palette.darkSquare }} />
                      <div style={{ backgroundColor: palette.lightSquare }} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-white truncate">{palette.name}</div>
                    </div>

                    {isSelected && <Check className="w-4 h-4 text-cyan-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Piece Styles */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Piece Design Style
              </label>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {PIECE_STYLES.map(style => {
                const isSelected = currentPieceStyle === style.id;
                return (
                  <button
                    key={style.id}
                    onClick={() => onSelectPieceStyle(style.id)}
                    className={`flex items-center justify-between p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-slate-800 border-cyan-500 ring-1 ring-cyan-500/50 shadow-md'
                        : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Piece Style Preview Avatars */}
                      <div className="flex items-center -space-x-1.5 w-12 h-6">
                        <div className="w-6 h-6">
                          <ChessPiece type="n" color="w" pieceStyle={style.id} />
                        </div>
                        <div className="w-6 h-6">
                          <ChessPiece type="k" color="b" pieceStyle={style.id} />
                        </div>
                      </div>
                      <span className="text-xs font-bold text-white">{style.name}</span>
                    </div>

                    {isSelected && <Check className="w-4 h-4 text-cyan-400" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Audio Manager Section */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-white block">Chess Sound Effects</span>
                <span className="text-[11px] text-slate-400 block">
                  Move clack, capture snap, check alert, victory fanfare
                </span>
              </div>
              <button
                onClick={onToggleSound}
                className={`w-12 h-6 rounded-full transition-colors relative p-0.5 cursor-pointer ${
                  soundEnabled ? 'bg-cyan-500' : 'bg-slate-800'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    soundEnabled ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Sound Test audition buttons */}
            <div className="pt-2 border-t border-slate-800/80">
              <span className="text-[10px] font-mono text-slate-400 block mb-2 uppercase">
                Audition Sound FX:
              </span>
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  onClick={() => audioManager.playMove()}
                  className="py-1 px-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  Move
                </button>
                <button
                  onClick={() => audioManager.playCapture()}
                  className="py-1 px-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  Capture
                </button>
                <button
                  onClick={() => audioManager.playCheck()}
                  className="py-1 px-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  Check
                </button>
                <button
                  onClick={() => audioManager.playCheckmate()}
                  className="py-1 px-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                >
                  Checkmate
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer"
          >
            Apply & Save
          </button>
        </div>
      </div>
    </div>
  );
};
