import React, { useEffect, useRef, useState } from 'react';
import { MoveRecord } from './types';
import { Copy, Check, FileText } from 'lucide-react';

interface MoveHistoryProps {
  moves: MoveRecord[];
  getPgn?: () => string;
  className?: string;
}

export const MoveHistory: React.FC<MoveHistoryProps> = ({
  moves,
  getPgn,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [moves.length]);

  const handleCopyPgn = async () => {
    if (!getPgn) return;
    const pgnText = getPgn();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(pgnText);
      } else {
        // Fallback textarea copy
        const textarea = document.createElement('textarea');
        textarea.value = pgnText;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy PGN:', err);
    }
  };

  const movePairs: { num: number; white?: MoveRecord; black?: MoveRecord }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push({
      num: Math.floor(i / 2) + 1,
      white: moves[i],
      black: moves[i + 1],
    });
  }

  return (
    <div className={`flex flex-col h-full bg-slate-950/70 border border-slate-800/80 rounded-2xl overflow-hidden ${className}`}>
      {/* Header with Export PGN action */}
      <div className="px-3 py-2 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs font-semibold text-slate-300">
        <div className="flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-cyan-400" />
          <span>Move History</span>
          <span className="font-mono text-[11px] text-slate-500">({moves.length})</span>
        </div>

        {getPgn && (
          <button
            onClick={handleCopyPgn}
            disabled={moves.length === 0}
            title="Export moves in standard PGN format to clipboard"
            className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700/80 text-[10px] font-mono transition-all cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400 font-bold">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>Export PGN</span>
              </>
            )}
          </button>
        )}
      </div>

      <div ref={containerRef} className="flex-1 overflow-y-auto p-2 text-xs font-mono space-y-1">
        {movePairs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-600 italic text-[11px] py-4">
            Moves will appear here
          </div>
        ) : (
          movePairs.map(pair => (
            <div key={pair.num} className="grid grid-cols-12 py-0.5 px-1 hover:bg-slate-900/40 rounded transition-colors">
              <span className="col-span-2 text-slate-500 font-semibold">{pair.num}.</span>
              <span className="col-span-5 text-slate-200 font-bold">{pair.white?.san}</span>
              <span className="col-span-5 text-slate-400">{pair.black?.san || ''}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
