import React, { useMemo, useState } from 'react';
import { Flag, Loader2, UserPlus, Users } from 'lucide-react';
import { ChessEngine } from './ChessEngine';
import { ChessBoard } from './ChessBoard';
import { BOARD_PALETTES } from './themes';

export interface ChessOnlineBoard {
  fen: string;
  lastMove?: { from: string; to: string } | null;
}

interface ChessOnlineMatchProps {
  myUserId: string;
  myColor: 'w' | 'b';
  opponentUsername?: string;
  board: ChessOnlineBoard | null | undefined;
  turn: string | null | undefined;
  isSubmitting: boolean;
  onMove: (from: string, to: string, promotion?: string) => void;
  onResign: () => void;
}

// The one real, server-validated head-to-head chess match (see supabase/functions/chess-move) —
// GamePlayModal owns the actual online state machine (polling, submit, finalize) exactly the same
// way it already does for Tic Tac Toe; this component is deliberately just the board + a resign
// button, nothing more, matching how the inline Tic Tac Toe online board works today. No clock is
// shown here on purpose: there is no server-enforced time control for an online chess match yet, so
// a client-side clock would just be decorative and possibly misleading about what actually ends the
// game. ChessGame.tsx (the vs-bot/pass-and-play version) is a completely separate component and is
// untouched by anything here.
export const ChessOnlineMatch: React.FC<ChessOnlineMatchProps> = ({
  myUserId,
  myColor,
  opponentUsername,
  board,
  turn,
  isSubmitting,
  onMove,
  onResign
}) => {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [promotionPending, setPromotionPending] = useState<{ from: string; to: string } | null>(null);

  const engine = useMemo(() => new ChessEngine(board?.fen), [board?.fen]);
  const myTurn = turn === myUserId;
  const orientation = myColor;

  const grid = engine.getBoardGrid(orientation);
  const legalMoves = selectedSquare ? engine.getLegalMoves(selectedSquare) : [];
  const kingInCheckSquare = engine.isCheck() ? engine.getKingSquare(engine.getCurrentPlayer()) : null;

  const tryMove = (from: string, to: string) => {
    const sourceCell = grid.flat().find((c) => c.square === from);
    if (sourceCell?.piece?.type === 'p') {
      const targetRank = to[1];
      if ((sourceCell.piece.color === 'w' && targetRank === '8') || (sourceCell.piece.color === 'b' && targetRank === '1')) {
        setPromotionPending({ from, to });
        return;
      }
    }
    setSelectedSquare(null);
    onMove(from, to);
  };

  const handleSquareClick = (square: string) => {
    if (!myTurn || isSubmitting) return;
    if (selectedSquare) {
      if (selectedSquare === square) {
        setSelectedSquare(null);
        return;
      }
      if (legalMoves.some((m) => m.to === square)) {
        tryMove(selectedSquare, square);
        return;
      }
    }
    const cell = grid.flat().find((c) => c.square === square);
    if (cell?.piece && cell.piece.color === engine.getCurrentPlayer()) setSelectedSquare(square);
  };

  const handleMovePiece = (from: string, to: string, promotion?: string) => {
    if (!myTurn || isSubmitting) return;
    if (promotion) {
      setSelectedSquare(null);
      setPromotionPending(null);
      onMove(from, to, promotion);
    } else {
      tryMove(from, to);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-3 w-full max-w-sm mx-auto">
      <div className="flex items-center justify-between w-full mb-4 px-3 py-2 bg-zinc-900 rounded-xl border border-zinc-800">
        <div className={`flex items-center gap-1.5 text-xs font-bold ${myTurn ? 'text-noob' : 'text-zinc-500'}`}>
          <UserPlus className="w-3.5 h-3.5" />
          <span>You ({myColor === 'w' ? 'White' : 'Black'})</span>
        </div>
        <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">VS</span>
        <div className={`flex items-center gap-1.5 text-xs font-bold ${!myTurn ? 'text-pink-400' : 'text-zinc-500'}`}>
          <Users className="w-3.5 h-3.5" />
          <span>
            @{opponentUsername || 'Opponent'} ({myColor === 'w' ? 'Black' : 'White'})
          </span>
        </div>
      </div>

      <ChessBoard
        grid={grid}
        orientation={orientation}
        turn={engine.getCurrentPlayer()}
        selectedSquare={selectedSquare}
        legalMoves={legalMoves}
        lastMove={board?.lastMove || null}
        kingInCheckSquare={kingInCheckSquare}
        palette={BOARD_PALETTES.noob_neon}
        pieceStyle="classic"
        isInteractive={myTurn && !isSubmitting}
        onSquareClick={handleSquareClick}
        onMovePiece={handleMovePiece}
      />

      {/* Pawn promotion choice — ChessBoard's own modal only opens for drag-and-drop promotions; a
          tap-to-move promotion is caught here instead, right before tryMove would otherwise fire. */}
      {promotionPending && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 p-4 rounded-2xl shadow-2xl max-w-xs w-full text-center">
            <h4 className="text-sm font-bold text-white mb-1">Promote Pawn</h4>
            <p className="text-xs text-slate-400 mb-3">Choose promotion piece:</p>
            <div className="grid grid-cols-4 gap-2">
              {(['q', 'r', 'b', 'n'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    const { from, to } = promotionPending;
                    setPromotionPending(null);
                    setSelectedSquare(null);
                    onMove(from, to, type);
                  }}
                  className="py-2.5 rounded-xl bg-slate-800 hover:bg-cyan-500/20 hover:border-cyan-500 border border-slate-700 transition-all cursor-pointer text-xs font-bold text-slate-200 capitalize"
                >
                  {type === 'q' ? 'Queen' : type === 'r' ? 'Rook' : type === 'b' ? 'Bishop' : 'Knight'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <p className="text-xs text-zinc-400">
          {isSubmitting ? (
            <span className="flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Submitting move…
            </span>
          ) : myTurn ? (
            '👉 Your turn'
          ) : (
            `⏳ Waiting for @${opponentUsername || 'opponent'}...`
          )}
        </p>
      </div>

      <button
        onClick={onResign}
        disabled={isSubmitting}
        className="mt-3 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer disabled:opacity-50"
      >
        <Flag className="w-3.5 h-3.5" />
        <span>Resign</span>
      </button>
    </div>
  );
};
