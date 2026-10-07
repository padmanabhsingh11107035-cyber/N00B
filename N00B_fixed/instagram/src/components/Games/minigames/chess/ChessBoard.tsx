import React, { useState } from 'react';
import { PieceColor, PieceType, PieceInfo, BoardPalette, PieceStyleId } from './types';
import { ChessPiece } from './ChessPiece';
import { BOARD_PALETTES } from './themes';

interface ChessBoardProps {
  grid: {
    square: string;
    file: string;
    rank: number;
    piece: PieceInfo | null;
    isLight: boolean;
  }[][];
  orientation: PieceColor;
  turn: PieceColor;
  selectedSquare: string | null;
  legalMoves: { from: string; to: string; promotion?: string }[];
  lastMove: { from: string; to: string } | null;
  kingInCheckSquare: string | null;
  palette?: BoardPalette;
  pieceStyle?: PieceStyleId;
  isInteractive?: boolean;
  onSquareClick: (square: string) => void;
  onMovePiece: (from: string, to: string, promotion?: string) => void;
}

export const ChessBoard: React.FC<ChessBoardProps> = ({
  grid,
  orientation,
  turn,
  selectedSquare,
  legalMoves,
  lastMove,
  kingInCheckSquare,
  palette = BOARD_PALETTES.midnight,
  pieceStyle = 'classic',
  isInteractive = true,
  onSquareClick,
  onMovePiece,
}) => {
  const [draggedSquare, setDraggedSquare] = useState<string | null>(null);
  const [promotionPending, setPromotionPending] = useState<{ from: string; to: string } | null>(null);

  const legalTargets = new Set(legalMoves.map(m => m.to));

  const handleDragStart = (e: React.DragEvent, square: string) => {
    if (!isInteractive) return;
    setDraggedSquare(square);
    e.dataTransfer.setData('text/plain', square);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetSquare: string) => {
    e.preventDefault();
    if (!isInteractive || !draggedSquare) return;

    checkMoveWithPromotion(draggedSquare, targetSquare);
    setDraggedSquare(null);
  };

  const checkMoveWithPromotion = (from: string, to: string) => {
    // Check if moving piece is a pawn reaching the last rank
    const sourceCell = grid.flat().find(c => c.square === from);
    if (sourceCell?.piece?.type === 'p') {
      const targetRank = to[1];
      if ((sourceCell.piece.color === 'w' && targetRank === '8') ||
          (sourceCell.piece.color === 'b' && targetRank === '1')) {
        setPromotionPending({ from, to });
        return;
      }
    }

    onMovePiece(from, to);
  };

  const handleSquarePress = (square: string) => {
    if (!isInteractive) return;

    if (selectedSquare) {
      if (selectedSquare === square) {
        onSquareClick(square);
        return;
      }

      if (legalTargets.has(square)) {
        checkMoveWithPromotion(selectedSquare, square);
        return;
      }
    }

    onSquareClick(square);
  };

  const handleChoosePromotion = (type: PieceType) => {
    if (promotionPending) {
      onMovePiece(promotionPending.from, promotionPending.to, type);
      setPromotionPending(null);
    }
  };

  return (
    <div className="relative select-none touch-manipulation w-full max-w-[420px] sm:max-w-[480px] md:max-w-[520px] aspect-square rounded-2xl overflow-hidden shadow-2xl border-2 border-slate-800 bg-slate-950">
      {/* 8x8 Chess Grid */}
      <div className="grid grid-rows-8 grid-cols-8 w-full h-full">
        {grid.map((row, rIdx) =>
          row.map((cell, cIdx) => {
            const isSelected = selectedSquare === cell.square;
            const isLegalTarget = legalTargets.has(cell.square);
            const isLastMoveSquare =
              lastMove && (lastMove.from === cell.square || lastMove.to === cell.square);
            const isKingInCheck = kingInCheckSquare === cell.square;

            // Square color from selected palette
            const squareColor = cell.isLight ? palette.lightSquare : palette.darkSquare;

            return (
              <div
                key={cell.square}
                onClick={() => handleSquarePress(cell.square)}
                onDragOver={handleDragOver}
                onDrop={e => handleDrop(e, cell.square)}
                style={{ backgroundColor: squareColor }}
                className="relative flex items-center justify-center aspect-square cursor-pointer transition-colors"
              >
                {/* Last Move Indicator */}
                {isLastMoveSquare && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ backgroundColor: palette.highlightLastMove }}
                  />
                )}

                {/* Selected Square Highlight */}
                {isSelected && (
                  <div
                    className="absolute inset-0 ring-2 ring-inset ring-cyan-400 pointer-events-none"
                    style={{ backgroundColor: palette.highlightSelected }}
                  />
                )}

                {/* King Check Red Glow */}
                {isKingInCheck && (
                  <div
                    className="absolute inset-0 ring-4 ring-rose-500 animate-pulse pointer-events-none"
                    style={{ backgroundColor: palette.highlightCheck }}
                  />
                )}

                {/* Legal Move Indicator */}
                {isLegalTarget && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                    {cell.piece ? (
                      <div className="w-[82%] h-[82%] rounded-full border-4 border-cyan-400/80 animate-pulse" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full bg-cyan-400/80 shadow-sm shadow-cyan-400/50" />
                    )}
                  </div>
                )}

                {/* Piece */}
                {cell.piece && (
                  <div
                    draggable={isInteractive && cell.piece.color === turn}
                    onDragStart={e => handleDragStart(e, cell.square)}
                    className={`relative z-20 w-[84%] h-[84%] flex items-center justify-center ${
                      isInteractive && cell.piece.color === turn
                        ? 'cursor-grab active:cursor-grabbing hover:scale-105 active:scale-95 transition-transform'
                        : 'cursor-pointer'
                    }`}
                  >
                    <ChessPiece
                      type={cell.piece.type}
                      color={cell.piece.color}
                      pieceStyle={pieceStyle}
                    />
                  </div>
                )}

                {/* Coordinates (File & Rank) */}
                {cIdx === 0 && (
                  <span
                    className="absolute top-0.5 left-1 text-[9px] font-bold font-mono pointer-events-none leading-none opacity-70"
                    style={{
                      color: cell.isLight ? palette.labelColorLight : palette.labelColorDark,
                    }}
                  >
                    {cell.rank}
                  </span>
                )}
                {rIdx === 7 && (
                  <span
                    className="absolute bottom-0.5 right-1 text-[9px] font-bold font-mono pointer-events-none leading-none opacity-70"
                    style={{
                      color: cell.isLight ? palette.labelColorLight : palette.labelColorDark,
                    }}
                  >
                    {cell.file}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pawn Promotion Modal Dialog */}
      {promotionPending && (
        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 p-4 rounded-2xl shadow-2xl max-w-xs w-full text-center">
            <h4 className="text-sm font-bold text-white mb-1">Promote Pawn</h4>
            <p className="text-xs text-slate-400 mb-3">Choose promotion piece:</p>
            <div className="grid grid-cols-4 gap-2">
              {(['q', 'r', 'b', 'n'] as PieceType[]).map(type => (
                <button
                  key={type}
                  onClick={() => handleChoosePromotion(type)}
                  className="flex flex-col items-center justify-center p-2 rounded-xl bg-slate-800 hover:bg-cyan-500/20 hover:border-cyan-500 border border-slate-700 transition-all cursor-pointer group"
                >
                  <div className="w-9 h-9 group-hover:scale-110 transition-transform">
                    <ChessPiece
                      type={type}
                      color={turn}
                      pieceStyle={pieceStyle}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-slate-300 mt-1 capitalize">
                    {type === 'q' ? 'Queen' : type === 'r' ? 'Rook' : type === 'b' ? 'Bishop' : 'Knight'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
