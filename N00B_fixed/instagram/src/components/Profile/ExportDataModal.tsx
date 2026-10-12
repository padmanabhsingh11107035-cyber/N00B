import React from 'react';
import { X, Download, Copy, ShieldCheck } from 'lucide-react';
import { copyText } from '../../utils/clipboard';
import { showNotice } from '../../utils/likeSync';

interface ExportDataModalProps {
  text: string;
  onClose: () => void;
}

// Settings & account controls > Export Data: the person's own details as plain readable text, to look at, copy, or save as a .txt file.
export const ExportDataModal: React.FC<ExportDataModalProps> = ({ text, onClose }) => {
  const download = () => {
    try {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'noob-my-data.txt';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      showNotice('Could not save the file');
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/80 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-3xl p-5 space-y-3 max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between shrink-0">
          <h3 className="text-sm font-bold text-white">Your NOOB data</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white cursor-pointer" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-[11px] text-zinc-400 flex items-center gap-1.5 shrink-0">
          <ShieldCheck className="w-3.5 h-3.5 text-noob shrink-0" /> Your password and login are never part of this.
        </p>
        <pre data-allow-copy className="flex-1 min-h-0 overflow-y-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-zinc-200 bg-zinc-900/60 border border-zinc-800 rounded-2xl p-3.5">{text}</pre>
        <div className="grid grid-cols-2 gap-2 shrink-0">
          <button onClick={async () => showNotice((await copyText(text)) ? 'Copied' : 'Could not copy')} className="py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer">
            <Copy className="w-3.5 h-3.5" /> Copy
          </button>
          <button onClick={download} className="py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer">
            <Download className="w-3.5 h-3.5" /> Save as .txt
          </button>
        </div>
      </div>
    </div>
  );
};
