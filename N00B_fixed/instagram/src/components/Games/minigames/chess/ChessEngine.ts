import { Chess, Square, PieceSymbol, Color } from 'chess.js';
import { MoveRecord, PieceColor, PieceInfo, PieceType } from './types';

export class ChessEngine {
  private game: Chess;

  constructor(fen?: string) {
    this.game = new Chess(fen);
  }

  public getFen(): string {
    return this.game.fen();
  }

  public load(fen: string): boolean {
    try {
      this.game.load(fen);
      return true;
    } catch {
      return false;
    }
  }

  public reset(): void {
    this.game.reset();
  }

  public getCurrentPlayer(): PieceColor {
    return this.game.turn() as PieceColor;
  }

  public isCheck(): boolean {
    return this.game.inCheck();
  }

  public isCheckmate(): boolean {
    return this.game.isCheckmate();
  }

  public isStalemate(): boolean {
    return this.game.isStalemate();
  }

  public isDraw(): boolean {
    return this.game.isDraw();
  }

  public isThreefoldRepetition(): boolean {
    return this.game.isThreefoldRepetition();
  }

  public isInsufficientMaterial(): boolean {
    return this.game.isInsufficientMaterial();
  }

  public isGameOver(): boolean {
    return this.game.isGameOver();
  }

  public getGameOverDescription(): string | null {
    if (this.game.isCheckmate()) {
      const winner = this.game.turn() === 'w' ? 'Black' : 'White';
      return `Checkmate — ${winner} Wins!`;
    }
    if (this.game.isStalemate()) {
      return 'Draw by Stalemate';
    }
    if (this.game.isThreefoldRepetition()) {
      return 'Draw by Threefold Repetition';
    }
    if (this.game.isInsufficientMaterial()) {
      return 'Draw by Insufficient Material';
    }
    if (this.game.isDraw()) {
      return 'Draw by 50-Move Rule';
    }
    return null;
  }

  public getLegalMoves(square?: string): { from: string; to: string; promotion?: string }[] {
    const moves = this.game.moves({
      square: square as Square | undefined,
      verbose: true,
    });
    return moves.map(m => ({
      from: m.from,
      to: m.to,
      promotion: m.promotion,
    }));
  }

  public isLegalMove(from: string, to: string, promotion?: string): boolean {
    const legalMoves = this.getLegalMoves(from);
    return legalMoves.some(m => m.to === to && (!promotion || m.promotion === promotion));
  }

  public makeMove(from: string, to: string, promotion?: string): MoveRecord | null {
    try {
      const move = this.game.move({
        from: from as Square,
        to: to as Square,
        promotion: (promotion as PieceSymbol) || 'q',
      });

      if (!move) return null;

      return {
        san: move.san,
        from: move.from,
        to: move.to,
        color: move.color as PieceColor,
        piece: move.piece as PieceType,
        captured: move.captured as PieceType | undefined,
        promotion: move.promotion as PieceType | undefined,
        fenAfter: this.game.fen(),
        timestamp: Date.now(),
      };
    } catch {
      return null;
    }
  }

  public getKingSquare(color: PieceColor): string | null {
    const board = this.game.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p && p.type === 'k' && p.color === (color as Color)) {
          const file = String.fromCharCode('a'.charCodeAt(0) + c);
          const rank = 8 - r;
          return `${file}${rank}`;
        }
      }
    }
    return null;
  }

  public getBoardGrid(orientation: PieceColor = 'w'): {
    square: string;
    file: string;
    rank: number;
    piece: PieceInfo | null;
    isLight: boolean;
  }[][] {
    const board = this.game.board();
    const rankIndices = orientation === 'w' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
    const fileIndices = orientation === 'w' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];

    const result: {
      square: string;
      file: string;
      rank: number;
      piece: PieceInfo | null;
      isLight: boolean;
    }[][] = [];

    for (const r of rankIndices) {
      const row = [];
      const rank = 8 - r;
      for (const c of fileIndices) {
        const file = String.fromCharCode('a'.charCodeAt(0) + c);
        const square = `${file}${rank}`;
        const p = board[r][c];
        const piece: PieceInfo | null = p
          ? { type: p.type as PieceType, color: p.color as PieceColor }
          : null;
        const isLight = (r + c) % 2 === 0;

        row.push({
          square,
          file,
          rank,
          piece,
          isLight,
        });
      }
      result.push(row);
    }

    return result;
  }

  public getCapturedPieces(): {
    capturedByWhite: PieceType[];
    capturedByBlack: PieceType[];
    materialAdvantage: number;
  } {
    const fullSet: Record<PieceType, number> = {
      p: 8,
      n: 2,
      b: 2,
      r: 2,
      q: 1,
      k: 1,
    };

    const currentWhite: Record<PieceType, number> = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
    const currentBlack: Record<PieceType, number> = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };

    const board = this.game.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece) {
          if (piece.color === 'w') {
            currentWhite[piece.type as PieceType]++;
          } else {
            currentBlack[piece.type as PieceType]++;
          }
        }
      }
    }

    const capturedByWhite: PieceType[] = [];
    const capturedByBlack: PieceType[] = [];

    const values: Record<PieceType, number> = {
      p: 1,
      n: 3,
      b: 3,
      r: 5,
      q: 9,
      k: 0,
    };

    let whiteScore = 0;
    let blackScore = 0;

    for (const type of ['q', 'r', 'b', 'n', 'p'] as PieceType[]) {
      const lostByBlack = Math.max(0, fullSet[type] - currentBlack[type]);
      for (let i = 0; i < lostByBlack; i++) {
        capturedByWhite.push(type);
      }

      const lostByWhite = Math.max(0, fullSet[type] - currentWhite[type]);
      for (let i = 0; i < lostByWhite; i++) {
        capturedByBlack.push(type);
      }

      whiteScore += currentWhite[type] * values[type];
      blackScore += currentBlack[type] * values[type];
    }

    return {
      capturedByWhite,
      capturedByBlack,
      materialAdvantage: whiteScore - blackScore,
    };
  }

  public getPgn(options?: {
    white?: string;
    black?: string;
    result?: string;
    event?: string;
    date?: string;
  }): string {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
    try {
      this.game.header(
        'Event', options?.event || 'NOOB Chess Match',
        'Site', 'NOOB Games',
        'Date', options?.date || today,
        'White', options?.white || 'White',
        'Black', options?.black || 'Black',
        'Result', options?.result || '*'
      );
      return this.game.pgn();
    } catch {
      // Fallback manual PGN formatter if headers fail
      const history = this.game.history();
      let pgnStr = `[Event "${options?.event || 'NOOB Chess Match'}"]\n`;
      pgnStr += `[Site "NOOB Games"]\n`;
      pgnStr += `[Date "${options?.date || today}"]\n`;
      pgnStr += `[White "${options?.white || 'White'}"]\n`;
      pgnStr += `[Black "${options?.black || 'Black'}"]\n`;
      pgnStr += `[Result "${options?.result || '*'}"]\n\n`;

      let moveText = '';
      for (let i = 0; i < history.length; i += 2) {
        const moveNum = Math.floor(i / 2) + 1;
        moveText += `${moveNum}. ${history[i]} `;
        if (history[i + 1]) {
          moveText += `${history[i + 1]} `;
        }
      }
      moveText += options?.result || '*';
      return pgnStr + moveText.trim();
    }
  }
}

