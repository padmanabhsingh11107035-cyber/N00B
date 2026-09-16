import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play } from 'lucide-react';

interface FusionBlocksGameProps {
  onGameOver: (result: 'win' | 'tie' | 'loss', finalScore: number) => void;
  targetTile?: number;
}

type Board = number[][];
const SIZE = 4;

function emptyBoard(): Board {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

function cloneBoard(b: Board): Board {
  return b.map((row) => [...row]);
}

function addRandomTile(board: Board): Board {
  const empties: [number, number][] = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (board[r][c] === 0) empties.push([r, c]);
  if (empties.length === 0) return board;
  const [r, c] = empties[Math.floor(Math.random() * empties.length)];
  const next = cloneBoard(board);
  next[r][c] = Math.random() < 0.9 ? 2 : 4;
  return next;
}

function slideRowLeft(row: number[]): { row: number[]; gained: number; moved: boolean } {
  const nonZero = row.filter((v) => v !== 0);
  const merged: number[] = [];
  let gained = 0;
  for (let i = 0; i < nonZero.length; i++) {
    if (nonZero[i] === nonZero[i + 1]) {
      const value = nonZero[i] * 2;
      merged.push(value);
      gained += value;
      i++;
    } else {
      merged.push(nonZero[i]);
    }
  }
  while (merged.length < SIZE) merged.push(0);
  const moved = merged.some((v, i) => v !== row[i]);
  return { row: merged, gained, moved };
}

function rotateBoard(board: Board): Board {
  const next = emptyBoard();
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) next[c][SIZE - 1 - r] = board[r][c];
  return next;
}

function move(board: Board, direction: 'left' | 'right' | 'up' | 'down'): { board: Board; gained: number; moved: boolean } {
  let rotations = 0;
  if (direction === 'up') rotations = 3;
  else if (direction === 'right') rotations = 2;
  else if (direction === 'down') rotations = 1;

  let working = board;
  for (let i = 0; i < rotations; i++) working = rotateBoard(working);

  let gained = 0;
  let moved = false;
  const resultRows = working.map((row) => {
    const { row: newRow, gained: g, moved: m } = slideRowLeft(row);
    gained += g;
    if (m) moved = true;
    return newRow;
  });

  let finalBoard = resultRows;
  for (let i = 0; i < (4 - rotations) % 4; i++) finalBoard = rotateBoard(finalBoard);

  return { board: finalBoard, gained, moved };
}

function canMove(board: Board): boolean {
  for (const dir of ['left', 'right', 'up', 'down'] as const) {
    if (move(board, dir).moved) return true;
  }
  return false;
}

function highestTile(board: Board): number {
  return Math.max(0, ...board.flat());
}

const TILE_COLORS: Record<number, string> = {
  2: 'bg-zinc-800 text-zinc-100',
  4: 'bg-zinc-700 text-zinc-100',
  8: 'bg-amber-700 text-white',
  16: 'bg-amber-600 text-white',
  32: 'bg-orange-600 text-white',
  64: 'bg-orange-500 text-white',
  128: 'bg-emerald-600 text-white shadow-[0_0_12px_rgba(0,255,102,0.5)]',
  256: 'bg-emerald-500 text-white shadow-[0_0_16px_rgba(0,255,102,0.6)]',
  512: 'bg-cyan-500 text-white shadow-[0_0_18px_rgba(34,211,238,0.6)]',
  1024: 'bg-fuchsia-500 text-white shadow-[0_0_20px_rgba(217,70,239,0.6)]',
  2048: 'bg-yellow-400 text-black shadow-[0_0_24px_rgba(250,204,21,0.8)]'
};

export const FusionBlocksGame: React.FC<FusionBlocksGameProps> = ({
  onGameOver,
  targetTile = 128
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [board, setBoard] = useState<Board>(emptyBoard());
  const [score, setScore] = useState(0);
  const finishedRef = useRef(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const finish = useCallback((finalBoard: Board, finalScore: number) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setIsPlaying(false);
    const best = highestTile(finalBoard);
    const result: 'win' | 'tie' | 'loss' = best >= targetTile ? 'win' : best >= targetTile / 4 ? 'tie' : 'loss';
    onGameOver(result, finalScore);
  }, [onGameOver, targetTile]);

  const startGame = () => {
    finishedRef.current = false;
    setScore(0);
    let b = addRandomTile(addRandomTile(emptyBoard()));
    setBoard(b);
    setIsPlaying(true);
  };

  const applyMove = useCallback((direction: 'left' | 'right' | 'up' | 'down') => {
    if (!isPlaying || finishedRef.current) return;
    setBoard((prev) => {
      const { board: moved, gained, moved: didMove } = move(prev, direction);
      if (!didMove) return prev;
      const withNewTile = addRandomTile(moved);
      const newScore = score + gained;
      setScore(newScore);

      if (highestTile(withNewTile) >= targetTile) {
        setTimeout(() => finish(withNewTile, newScore), 250);
      } else if (!canMove(withNewTile)) {
        setTimeout(() => finish(withNewTile, newScore), 250);
      }
      return withNewTile;
    });
  }, [isPlaying, score, targetTile, finish]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isPlaying) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); applyMove('left'); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); applyMove('right'); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); applyMove('up'); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); applyMove('down'); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isPlaying, applyMove]);

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) applyMove(dx > 0 ? 'right' : 'left');
    else applyMove(dy > 0 ? 'down' : 'up');
  };

  return (
    <div className="flex flex-col items-center justify-center p-3 w-full max-w-sm mx-auto select-none">
      <div className="flex items-center justify-between w-full mb-3 px-3 py-1.5 bg-zinc-900 rounded-xl border border-zinc-800 text-xs">
        <span className="font-bold text-zinc-300">Score: <strong className="text-[#00FF66]">{score}</strong></span>
        <span className="text-[11px] text-zinc-500 font-bold">Reach {targetTile} to Win</span>
      </div>

      <div
        className="relative w-full aspect-square bg-zinc-950 border-2 border-zinc-800 rounded-3xl overflow-hidden shadow-2xl p-2.5"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="grid grid-cols-4 grid-rows-4 gap-2 w-full h-full">
          {board.flatMap((row, r) =>
            row.map((value, c) => (
              <div
                key={`${r}-${c}`}
                className={`rounded-xl flex items-center justify-center font-black text-lg transition-all duration-150 ${
                  value === 0 ? 'bg-zinc-900/60' : TILE_COLORS[value] || 'bg-purple-500 text-white'
                }`}
              >
                {value !== 0 && value}
              </div>
            ))
          )}
        </div>

        {!isPlaying && (
          <div className="absolute inset-0 bg-black/85 backdrop-blur-xs flex flex-col items-center justify-center p-4 text-center">
            <h3 className="text-lg font-black text-white mb-1">🧩 Fusion Blocks</h3>
            <p className="text-xs text-zinc-400 mb-4 max-w-[220px]">
              Swipe or use arrow keys to slide tiles. Matching numbers fuse together — reach {targetTile} to win!
            </p>
            <button
              onClick={startGame}
              className="px-5 py-2.5 bg-[#00FF66] text-black font-black text-xs rounded-xl shadow-[0_0_15px_rgba(0,255,102,0.4)] flex items-center gap-1.5 cursor-pointer hover:scale-105 transition-all"
            >
              <Play className="w-4 h-4 fill-black" /> Start Fusing
            </button>
          </div>
        )}
      </div>

      <p className="text-[11px] text-zinc-500 mt-2 text-center">
        Swipe on mobile, or use the <kbd className="px-1 py-0.5 bg-zinc-900 rounded text-zinc-300 border border-zinc-800">Arrow Keys</kbd> on desktop
      </p>
    </div>
  );
};
