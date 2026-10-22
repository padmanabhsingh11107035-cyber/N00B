import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

// The NOOB logo of the side menu on a computer: a small tile that, when pressed, shows the logo big in the middle of the page with a cross at the top right (Escape, the cross or a click
// outside the logo close it).
export const LogoLightbox: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className} aria-label="Show the NOOB logo bigger" data-testid="logo-open">
        <img src="/noob-logo-circle.png" alt="NOOB" className="w-full h-full object-cover" />
      </button>
      {open && (
        <div className="fixed inset-0 z-[300] bg-black/85 backdrop-blur-sm flex items-center justify-center p-6 animate-[noob-fade_.2s_ease-out]" role="dialog" aria-modal="true" aria-label="NOOB logo" onClick={() => setOpen(false)} data-testid="logo-lightbox">
          <button type="button" onClick={() => setOpen(false)} className="absolute top-4 right-4 w-11 h-11 rounded-full bg-zinc-900/90 border border-white/30 hover:border-white flex items-center justify-center text-white cursor-pointer" aria-label="Close" data-testid="logo-close">
            <X className="w-5 h-5" />
          </button>
          <img src="/noob-logo-circle.png" alt="NOOB" onClick={(e) => e.stopPropagation()} className="w-[min(78vw,70vh,380px)] aspect-square rounded-[24%] object-cover border border-white/25 shadow-[0_0_60px_rgba(255,255,255,0.18)]" />
        </div>
      )}
    </>
  );
};
