import React, { useEffect } from 'react';
import { Clock } from 'lucide-react';
import { CLOSED_HINT, CLOSED_MESSAGE, CLOSED_TITLE } from './shopOpen';

// Shown when someone presses Checkout (or Place Order) while the shop owner has switched orders off.
export const OrdersPausedModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="orders-paused-title"
      className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm bg-zinc-950 border border-amber-500/30 rounded-3xl p-6 text-center space-y-4 shadow-2xl">
        <div className="w-14 h-14 mx-auto rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
          <Clock className="w-7 h-7 text-amber-300" />
        </div>
        <h2 id="orders-paused-title" className="text-base font-black text-white">
          {CLOSED_TITLE}
        </h2>
        <p className="text-sm font-semibold text-zinc-100">{CLOSED_MESSAGE}</p>
        <p className="text-xs text-zinc-400 leading-relaxed">{CLOSED_HINT}</p>
        <button
          autoFocus
          onClick={onClose}
          className="w-full py-3 bg-gradient-to-r from-[#00FF66] to-cyan-400 text-black text-xs font-bold rounded-2xl cursor-pointer hover:opacity-90 transition-opacity"
        >
          OK
        </button>
      </div>
    </div>
  );
};
